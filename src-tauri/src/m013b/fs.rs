// MODULE_CONTRACT
//   PURPOSE: M-013b filesystem command STUBS. Public command-name surface
//            for the renderer; every command logs a stable BLOCK_* marker
//            and returns Err(IpcError::not_implemented). Real impls land
//            in Phase-B2 step-2 (M-002 mt-fs-commands).
//   SCOPE:   single-shot fs operations (read, write, stat, readdir, unlink).
//            Watcher events live in m013b::watch. No path sandboxing
//            here — that's M-010 in B2 step-1.
//   DEPENDS: error::IpcError, error::MT_NOT_IMPLEMENTED.
//   LINKS:   M-013b runtime façade; M-002 mt-fs-commands (B2 successor);
//            test/fixtures/ipc-channels/electron.v1.json window.fileUtils
//            entries for the channel-name parity check.
//   STATUS:  Phase-B1 stub. All commands return Err(MT_NOT_IMPLEMENTED).
//            Signatures are stable — renderer code can call them as if
//            they worked, get a typed error, and fall back / show an
//            error toast. Per V-M-013b: NEVER panic.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-6: initial stub. 5 fs commands.

use crate::m013b::error::IpcError;

/// Read a UTF-8 file to a String.
/// v1 equivalent: window.fileUtils.readFile(path, 'utf8').
#[tauri::command]
pub async fn mt_fs_read(path: String) -> Result<String, IpcError> {
    eprintln!("[m013b][fs][BLOCK_MT_FS_READ_NOT_IMPLEMENTED path={path}]");
    Err(IpcError::not_implemented("mt::fs::read", "B2-step-2"))
}

/// Write a String to a file (creates if missing, truncates if exists).
/// v1 equivalent: window.fileUtils.writeFile(path, data).
#[tauri::command]
pub async fn mt_fs_write(path: String, content: String) -> Result<(), IpcError> {
    eprintln!(
        "[m013b][fs][BLOCK_MT_FS_WRITE_NOT_IMPLEMENTED path={path} bytes={}]",
        content.len()
    );
    Err(IpcError::not_implemented("mt::fs::write", "B2-step-2"))
}

/// Plain JSON-cloneable file stats.
/// v1 equivalent: window.fileUtils.stat(path) (post-step-8z follow-up
/// commit 99cb11d2 returned plain {size, mtimeMs, isFile, isDirectory,
/// isSymbolicLink} because contextBridge structured-clone strips
/// fs.Stats methods. M-013b inherits that shape exactly.
#[derive(serde::Serialize, Debug)]
pub struct FsStat {
    pub size: u64,
    pub mode: u32,
    pub mtime_ms: f64,
    pub is_file: bool,
    pub is_directory: bool,
    pub is_symbolic_link: bool,
}

/// Stat a path. Returns the v1.2.3-compatible plain shape so renderer
/// callers don't need to differentiate between Tauri-era and Electron-era
/// stat returns.
#[tauri::command]
pub async fn mt_fs_stat(path: String) -> Result<FsStat, IpcError> {
    eprintln!("[m013b][fs][BLOCK_MT_FS_STAT_NOT_IMPLEMENTED path={path}]");
    Err(IpcError::not_implemented("mt::fs::stat", "B2-step-2"))
}

/// List directory entry names (NOT full paths — matches v1's
/// fs.readdir(path) → string[]).
#[tauri::command]
pub async fn mt_fs_readdir(path: String) -> Result<Vec<String>, IpcError> {
    eprintln!("[m013b][fs][BLOCK_MT_FS_READDIR_NOT_IMPLEMENTED path={path}]");
    Err(IpcError::not_implemented("mt::fs::readdir", "B2-step-2"))
}

/// Delete a file (or empty directory; matches fs.unlink semantics).
/// v1 equivalent: window.fileUtils.unlink(path) — added in v1.2.x
/// follow-up commit 99cb11d2; fixes the pre-step-8h tmpfile cleanup
/// regression where window.fileUtils.unlink was referenced but not
/// exposed.
#[tauri::command]
pub async fn mt_fs_unlink(path: String) -> Result<(), IpcError> {
    eprintln!("[m013b][fs][BLOCK_MT_FS_UNLINK_NOT_IMPLEMENTED path={path}]");
    Err(IpcError::not_implemented("mt::fs::unlink", "B2-step-2"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::m013b::error::MT_NOT_IMPLEMENTED;

    #[tokio::test]
    async fn mt_fs_read_returns_not_implemented() {
        let err = mt_fs_read("/tmp/foo".into()).await.unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::fs::read");
        assert_eq!(err.planned_phase, "B2-step-2");
    }

    #[tokio::test]
    async fn mt_fs_write_returns_not_implemented() {
        let err = mt_fs_write("/tmp/foo".into(), "x".into()).await.unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::fs::write");
    }

    #[tokio::test]
    async fn mt_fs_stat_returns_not_implemented() {
        let err = mt_fs_stat("/tmp/foo".into()).await.unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::fs::stat");
    }

    #[tokio::test]
    async fn mt_fs_readdir_returns_not_implemented() {
        let err = mt_fs_readdir("/tmp".into()).await.unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::fs::readdir");
    }

    #[tokio::test]
    async fn mt_fs_unlink_returns_not_implemented() {
        let err = mt_fs_unlink("/tmp/foo".into()).await.unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::fs::unlink");
    }
}
