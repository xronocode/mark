// MODULE_CONTRACT
//   PURPOSE: M-002 mt-fs-commands real impls. 5 #[tauri::command]
//            handlers performing read / write / stat / readdir / unlink
//            against the workspace sandbox declared by SecurityCtx.
//            Each command:
//              1. Reads the active sandbox from SecurityCtx state.
//              2. Validates the requested path through M-010 check_path
//                 (NUL/overlong/traversal/symlink-escape).
//              3. Performs the FS syscall, mapping errors to typed
//                 IpcError variants with stable codes.
//              4. Emits stable [FsCmd][${op}][BLOCK_*] markers for trace
//                 correlation.
//   SCOPE:   single-shot fs ops only. Watcher is M-003 (separate module);
//            search is M-004. NEVER panics — every fallible call is
//            Result-mapped to IpcError. NEVER reads outside sandbox.
//   DEPENDS: m010_security::check_path (path validation),
//            m013b::state::SecurityCtx (active sandbox),
//            m013b::error::IpcError (typed error envelope),
//            stdlib std::fs.
//   LINKS:   docs/development-plan.xml Phase-B2 step-2;
//            docs/verification-plan.xml V-M-002 (5 scenarios + 12
//            adversarial edge cases — this commit covers ~6 of them
//            backend-side).
//   STATUS:  Phase-B2 step-2 real-impl shipped. Atomic-write semantics
//            (temp+rename+fsync) deferred to a B2 step-2a follow-up
//            because rename atomicity needs more thought on cross-
//            filesystem boundaries.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-2: replace B1 stubs with real read/write/stat/
//     readdir/unlink wired through SecurityCtx + M-010 check_path.
//   - 2026-04-28 B1-step-6: initial stub returning Err(MT_NOT_IMPLEMENTED).

use crate::m010_security;
use crate::m013b::error::IpcError;
use crate::m013b::state::SecurityCtx;
use crate::m014_encoding;
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::State;

/// 10 MB read ceiling. V-M-002 scenario-2 says 10 MB reads should
/// succeed without OOM; we set the upper bound at the same level so
/// pathological inputs (multi-GB files attached to issues) don't
/// silently OOM the editor process. Configurable in B3 prefs.
pub const MAX_READ_BYTES: u64 = 10 * 1024 * 1024;

/// Inner pure-logic read: same body as `mt_fs_read` but takes a sandbox
/// directly instead of a Tauri `State`. Lets the unit tests exercise the
/// full code path without booting an app.
pub(crate) fn fs_read_inner(path: &str, sandbox: &Path) -> Result<String, IpcError> {
    let cmd = "mt::fs::read";
    let requested = Path::new(path);

    eprintln!("[FsCmd][read][BLOCK_VALIDATE_PATH path={}]", redact(path));
    let validated = m010_security::check_path(sandbox, requested)
        .map_err(|e| IpcError::from_security_path(cmd, e))?;

    // Refuse non-regular inodes (FIFO, socket, dir, device).
    let meta = fs::metadata(&validated).map_err(|e| IpcError::from_io(cmd, e))?;
    if !meta.is_file() {
        eprintln!("[FsCmd][read][BLOCK_NOT_REGULAR path={}]", redact(path));
        return Err(IpcError::not_regular_file(cmd, &validated));
    }
    if meta.len() > MAX_READ_BYTES {
        eprintln!("[FsCmd][read][BLOCK_OVERSIZE bytes={}]", meta.len());
        return Err(IpcError {
            code: "MT_FS_TOO_LARGE".to_string(),
            message: format!(
                "file is {} bytes, exceeds MAX_READ_BYTES ({})",
                meta.len(),
                MAX_READ_BYTES
            ),
            command: cmd.to_string(),
            planned_phase: String::new(),
        });
    }

    // Read bytes, then dispatch through M-014 encoding detect+decode.
    // Plain ASCII / UTF-8 takes the fast path (no chardet call); legacy
    // CP-1251 / Shift_JIS / etc. files decode via encoding_rs with a
    // chardet best-guess label. Bytes-replaced flag and detected label
    // logged for diagnostic; renderer caller gets the String only —
    // metadata travels via mt_fs_stat for now (extension F-FS-DETECT-
    // META-INLINE could attach label to the read result later).
    let bytes = fs::read(&validated).map_err(|e| IpcError::from_io(cmd, e))?;
    let decoded = m014_encoding::detect_and_decode(&bytes);
    eprintln!(
        "[FsCmd][read][BLOCK_READ_FROM_DISK path={} bytes={} chars={} label={} replaced={}]",
        redact(path),
        bytes.len(),
        decoded.text.len(),
        decoded.label,
        decoded.bytes_replaced
    );
    Ok(decoded.text)
}

/// Read a UTF-8 file from disk. v1 equivalent: fileUtils.readFile(path, 'utf8').
#[tauri::command]
pub async fn mt_fs_read(
    path: String,
    sec: State<'_, SecurityCtx>,
) -> Result<String, IpcError> {
    fs_read_inner(&path, &sec.sandbox())
}

/// Inner pure-logic write — see `fs_read_inner` for rationale.
pub(crate) fn fs_write_inner(path: &str, content: &str, sandbox: &Path) -> Result<(), IpcError> {
    let cmd = "mt::fs::write";
    let requested = Path::new(path);

    eprintln!("[FsCmd][write][BLOCK_VALIDATE_PATH path={}]", redact(path));
    let validated = m010_security::check_path(sandbox, requested)
        .map_err(|e| IpcError::from_security_path(cmd, e))?;

    if let Some(parent) = validated.parent() {
        fs::create_dir_all(parent).map_err(|e| IpcError::from_io(cmd, e))?;
    }
    let mut f = fs::File::create(&validated).map_err(|e| IpcError::from_io(cmd, e))?;
    f.write_all(content.as_bytes())
        .map_err(|e| IpcError::from_io(cmd, e))?;
    f.sync_all().map_err(|e| IpcError::from_io(cmd, e))?;
    eprintln!(
        "[FsCmd][write][BLOCK_WRITE_TO_DISK path={} bytes={} fsync=true]",
        redact(path),
        content.len()
    );
    Ok(())
}

/// Write a UTF-8 string to a file. Creates parent dirs if missing
/// (mirrors v1.2.3 fs-extra outputFile semantics). NOT atomic at the
/// rename level — atomic write is a B2-step-2a follow-up.
#[tauri::command]
pub async fn mt_fs_write(
    path: String,
    content: String,
    sec: State<'_, SecurityCtx>,
) -> Result<(), IpcError> {
    fs_write_inner(&path, &content, &sec.sandbox())
}

/// Plain JSON-cloneable file stats. Preserves the v1.2.3 contextBridge
/// structured-clone-safe shape (preload step-8z follow-up).
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FsStat {
    pub size: u64,
    pub mode: u32,
    pub mtime_ms: f64,
    pub is_file: bool,
    pub is_directory: bool,
    pub is_symbolic_link: bool,
}

/// Inner pure-logic stat — see `fs_read_inner` for rationale.
pub(crate) fn fs_stat_inner(path: &str, sandbox: &Path) -> Result<FsStat, IpcError> {
    let cmd = "mt::fs::stat";
    let requested = Path::new(path);

    let validated = m010_security::check_path(sandbox, requested)
        .map_err(|e| IpcError::from_security_path(cmd, e))?;

    let meta = fs::symlink_metadata(&validated).map_err(|e| IpcError::from_io(cmd, e))?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);
    let mode = {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            meta.permissions().mode()
        }
        #[cfg(not(unix))]
        {
            0
        }
    };
    Ok(FsStat {
        size: meta.len(),
        mode,
        mtime_ms,
        is_file: meta.is_file(),
        is_directory: meta.is_dir(),
        is_symbolic_link: meta.file_type().is_symlink(),
    })
}

/// Stat a path. Uses symlink_metadata so symlinks themselves are
/// reported (is_symbolic_link), not their targets.
#[tauri::command]
pub async fn mt_fs_stat(
    path: String,
    sec: State<'_, SecurityCtx>,
) -> Result<FsStat, IpcError> {
    fs_stat_inner(&path, &sec.sandbox())
}

/// Inner pure-logic readdir — see `fs_read_inner` for rationale.
pub(crate) fn fs_readdir_inner(path: &str, sandbox: &Path) -> Result<Vec<String>, IpcError> {
    let cmd = "mt::fs::readdir";
    let requested = Path::new(path);

    let validated = m010_security::check_path(sandbox, requested)
        .map_err(|e| IpcError::from_security_path(cmd, e))?;

    let mut names = Vec::new();
    for entry in fs::read_dir(&validated).map_err(|e| IpcError::from_io(cmd, e))? {
        let e = entry.map_err(|e| IpcError::from_io(cmd, e))?;
        if let Some(name) = e.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    names.sort();
    Ok(names)
}

/// List directory entry names (NOT full paths — matches v1's
/// fs.readdir(path) → string[]).
#[tauri::command]
pub async fn mt_fs_readdir(
    path: String,
    sec: State<'_, SecurityCtx>,
) -> Result<Vec<String>, IpcError> {
    fs_readdir_inner(&path, &sec.sandbox())
}

/// Inner pure-logic unlink — see `fs_read_inner` for rationale.
pub(crate) fn fs_unlink_inner(path: &str, sandbox: &Path) -> Result<(), IpcError> {
    let cmd = "mt::fs::unlink";
    let requested = Path::new(path);

    let validated = m010_security::check_path(sandbox, requested)
        .map_err(|e| IpcError::from_security_path(cmd, e))?;

    let meta = fs::symlink_metadata(&validated).map_err(|e| IpcError::from_io(cmd, e))?;
    if meta.is_dir() {
        return Err(IpcError::not_regular_file(cmd, &validated));
    }
    fs::remove_file(&validated).map_err(|e| IpcError::from_io(cmd, e))?;
    eprintln!(
        "[FsCmd][unlink][BLOCK_UNLINK_DONE path={}]",
        redact(path)
    );
    Ok(())
}

/// Delete a file. Refuses directories (use a separate command if/when
/// directory deletion is exposed in v2.x).
#[tauri::command]
pub async fn mt_fs_unlink(
    path: String,
    sec: State<'_, SecurityCtx>,
) -> Result<(), IpcError> {
    fs_unlink_inner(&path, &sec.sandbox())
}

/// Path redaction for trace logs. V-M-002 marker spec calls for
/// path_redacted — we surface basename only (no parent path leaks).
fn redact(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| format!("…/{n}"))
        .unwrap_or_else(|| "…".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::m013b::error::{MT_FS_NOT_FOUND, MT_FS_PATH_DENIED};
    use std::fs::write;
    use tempfile::TempDir;

    fn ctx_for(sandbox: &Path) -> SecurityCtx {
        let c = SecurityCtx::default();
        c.set_sandbox(sandbox.to_path_buf());
        c
    }

    #[test]
    fn read_write_utf8_roundtrip() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("note.md");
        fs_write_inner(target.to_str().unwrap(), "# Hello\n\nutf8 пример 🚀", dir.path()).unwrap();
        let read = fs_read_inner(target.to_str().unwrap(), dir.path()).unwrap();
        assert_eq!(read, "# Hello\n\nutf8 пример 🚀");
    }

    #[test]
    fn read_outside_sandbox_rejected_by_m010() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let target = outside.path().join("secret.txt");
        write(&target, "secret").unwrap();
        let err = fs_read_inner(target.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_PATH_DENIED, "got {err:?}");
    }

    #[test]
    fn read_nonexistent_returns_not_found() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("ghost.md");
        let err = fs_read_inner(missing.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_NOT_FOUND);
    }

    #[test]
    fn read_directory_returns_not_regular() {
        let dir = TempDir::new().unwrap();
        let err = fs_read_inner(dir.path().to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, "MT_FS_NOT_REGULAR");
    }

    #[test]
    fn read_oversized_rejected() {
        let dir = TempDir::new().unwrap();
        let big = dir.path().join("big.bin");
        // 11 MB file — over MAX_READ_BYTES
        let mut f = fs::File::create(&big).unwrap();
        let chunk = vec![0u8; 1024 * 1024];
        for _ in 0..11 {
            f.write_all(&chunk).unwrap();
        }
        drop(f);
        let err = fs_read_inner(big.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, "MT_FS_TOO_LARGE");
        assert!(err.message.contains("MAX_READ_BYTES"));
    }

    #[test]
    fn nul_byte_path_rejected_via_m010() {
        let _ctx = ctx_for(Path::new("/tmp"));
        let err = fs_read_inner("/tmp/x\0.md", Path::new("/tmp")).unwrap_err();
        assert_eq!(err.code, MT_FS_PATH_DENIED);
    }

    #[test]
    fn readdir_returns_sorted_names() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("c.md"), "").unwrap();
        write(dir.path().join("a.md"), "").unwrap();
        write(dir.path().join("b.md"), "").unwrap();
        let names = fs_readdir_inner(dir.path().to_str().unwrap(), dir.path()).unwrap();
        assert_eq!(names, vec!["a.md", "b.md", "c.md"]);
    }

    #[test]
    fn readdir_outside_sandbox_rejected() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let err = fs_readdir_inner(outside.path().to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_PATH_DENIED);
    }

    #[test]
    fn readdir_on_missing_dir_returns_not_found() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("ghost-dir");
        let err = fs_readdir_inner(missing.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_NOT_FOUND);
    }

    #[test]
    fn unlink_removes_file_inside_sandbox() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("trash.md");
        write(&target, "x").unwrap();
        fs_unlink_inner(target.to_str().unwrap(), dir.path()).unwrap();
        assert!(!target.exists());
    }

    #[test]
    fn unlink_directory_rejected_as_not_regular() {
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("subdir");
        fs::create_dir(&sub).unwrap();
        let err = fs_unlink_inner(sub.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, "MT_FS_NOT_REGULAR");
        assert!(sub.exists(), "directory must remain untouched");
    }

    #[test]
    fn unlink_outside_sandbox_rejected() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let target = outside.path().join("evict.txt");
        write(&target, "x").unwrap();
        let err = fs_unlink_inner(target.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_PATH_DENIED);
        assert!(target.exists(), "outside file must remain");
    }

    #[test]
    fn unlink_nonexistent_returns_not_found() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("nope.md");
        let err = fs_unlink_inner(missing.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_NOT_FOUND);
    }

    #[test]
    fn stat_reports_file_size_and_mtime() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("a.txt");
        write(&target, "hello world").unwrap();
        let s = fs_stat_inner(target.to_str().unwrap(), dir.path()).unwrap();
        assert_eq!(s.size, 11);
        assert!(s.is_file);
        assert!(!s.is_directory);
        assert!(!s.is_symbolic_link);
        assert!(s.mtime_ms > 0.0);
    }

    #[test]
    fn stat_reports_directory_flag() {
        let dir = TempDir::new().unwrap();
        let s = fs_stat_inner(dir.path().to_str().unwrap(), dir.path()).unwrap();
        assert!(!s.is_file);
        assert!(s.is_directory);
        assert!(!s.is_symbolic_link);
    }

    #[test]
    fn stat_outside_sandbox_rejected() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let target = outside.path().join("secret.bin");
        write(&target, "x").unwrap();
        let err = fs_stat_inner(target.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_PATH_DENIED);
    }

    #[test]
    fn stat_nonexistent_returns_not_found() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("ghost.bin");
        let err = fs_stat_inner(missing.to_str().unwrap(), dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_NOT_FOUND);
    }

    #[test]
    fn write_creates_parent_dirs_when_missing() {
        let dir = TempDir::new().unwrap();
        let nested = dir.path().join("a/b/c/note.md");
        fs_write_inner(nested.to_str().unwrap(), "deep", dir.path()).unwrap();
        assert!(nested.exists());
        assert_eq!(std::fs::read_to_string(&nested).unwrap(), "deep");
    }

    #[test]
    fn write_outside_sandbox_rejected() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let target = outside.path().join("intruder.md");
        let err = fs_write_inner(target.to_str().unwrap(), "x", dir.path()).unwrap_err();
        assert_eq!(err.code, MT_FS_PATH_DENIED);
        assert!(!target.exists());
    }

    #[test]
    fn write_overwrites_existing_file() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("note.md");
        fs_write_inner(target.to_str().unwrap(), "v1", dir.path()).unwrap();
        fs_write_inner(target.to_str().unwrap(), "v2 longer", dir.path()).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "v2 longer");
    }

    #[test]
    fn redact_returns_basename_only() {
        assert_eq!(redact("/Users/secret/folder/note.md"), "…/note.md");
        assert_eq!(redact("note.md"), "…/note.md");
        assert_eq!(redact("/"), "…");
    }
}
