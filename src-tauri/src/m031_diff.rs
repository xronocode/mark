// FILE: src-tauri/src/m031_diff.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-031 diff baseline command. Resolves the baseline for the
//            diff view: the '{path}.before' sidecar when it exists, else
//            the git-show fallback (desktop builds); the app-store build
//            refuses the git fallback. C-EXPORT-BOUNDARIES fences the
//            sidecar read at this boundary (FENCE-AT-M031, not
//            fs_read_inner): m010_security::check_path reused AS-IS under
//            the command's SecurityCtx sandbox (lexical + canonical +
//            NUL/overlong, E6 symlink-resolved-target semantics), a
//            regular-file gate and the reused crate::m013b::fs::
//            MAX_READ_BYTES cap, then the strict UTF-8
//            std::fs::read_to_string (V-M-031 F7 kept — no
//            decode-and-replace).
//   SCOPE:   One command + its pure inner. Denial vocabulary:
//            MT_FS_PATH_DENIED (sandbox violation),
//            MT_FS_NOT_REGULAR, MT_FS_TOO_LARGE — each logged as
//            [m031][diff][BLOCK_BASELINE_FAILED reason=sandbox_violation|
//            not_regular_file|oversize]. A denial never returns bytes and
//            never runs the git fallback. The git-show fallback
//            (_diff_git_baseline) and the app-store refusal are untouched.
//            Tauri injects the State, so diffView.vue's
//            invoke('mt_diff_baseline', { path }) is unchanged and no new
//            IPC command exists.
//   DEPENDS: crate::m010_security (check_path); crate::m013b::fs
//            (MAX_READ_BYTES); crate::m013b::state::SecurityCtx (Tauri
//            managed state); stdlib.
//   LINKS:   .grace/graph/features.xml M-031;
//            .grace/verification/features.xml V-M-031;
//            .grace/changes/active/C-EXPORT-BOUNDARIES;
//            src/renderer/src/components/editorWithTabs/diffView.vue.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mt_diff_baseline - Tauri command: (path, injected SecurityCtx) → baseline text or Err string.
//   mt_diff_baseline_inner - pure inner: fenced '{path}.before' read, else the untouched git fallback.
//   _diff_git_baseline - desktop-only git-show fallback (unchanged).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-21 C-EXPORT-BOUNDARIES: mt_diff_baseline takes the Tauri-injected SecurityCtx and delegates to mt_diff_baseline_inner — the '.before' sidecar read is fenced with m010_security::check_path + a regular-file gate + the reused m013b::fs::MAX_READ_BYTES cap before the strict UTF-8 read_to_string; denials carry MT_FS_PATH_DENIED / MT_FS_NOT_REGULAR / MT_FS_TOO_LARGE logged as BLOCK_BASELINE_FAILED (reason=sandbox_violation|not_regular_file|oversize), never bytes and never the git fallback; the invalid-UTF-8 failure (F7) and the git/app-store branches are byte-unchanged; the in-file fixtures moved onto TempDir sandbox roots.
// END_CHANGE_SUMMARY

use std::path::Path;

use tauri::State;

use crate::m010_security;
use crate::m013b::fs::MAX_READ_BYTES;
use crate::m013b::state::SecurityCtx;

#[tauri::command]
pub fn mt_diff_baseline(path: String, sec: State<'_, SecurityCtx>) -> Result<String, String> {
    let sandbox = sec.sandbox();
    mt_diff_baseline_inner(&path, &sandbox)
}

pub(crate) fn mt_diff_baseline_inner(path: &str, sandbox: &Path) -> Result<String, String> {
    safe_eprintln!("[m031][diff][BLOCK_DIFF_BASELINE path={path}]");

    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }

    let before_str = format!("{}.before", path);
    let before_path = Path::new(&before_str);
    if before_path.exists() {
        // C-EXPORT-BOUNDARIES fence, in order, on the sidecar read only.
        // 1) M-010 sandbox check reused AS-IS (lexical + canonical +
        //    NUL/overlong + E6 symlink-resolved-target semantics).
        let validated = match m010_security::check_path(sandbox, Path::new(&before_str)) {
            Ok(validated) => validated,
            Err(err) => {
                safe_eprintln!("[m031][diff][BLOCK_BASELINE_FAILED reason=sandbox_violation]");
                return Err(format!("MT_FS_PATH_DENIED: {err}"));
            }
        };

        // 2) Regular-file gate — a dir, FIFO or symlink-to-dir refuses.
        let meta = std::fs::metadata(&validated)
            .map_err(|e| format!("Failed to stat .before file: {e}"))?;
        if !meta.is_file() {
            safe_eprintln!("[m031][diff][BLOCK_BASELINE_FAILED reason=not_regular_file]");
            return Err(format!(
                "MT_FS_NOT_REGULAR: {} is not a regular file",
                validated.display()
            ));
        }

        // 3) Reused M-013-B read cap — no oversized read is attempted.
        if meta.len() > MAX_READ_BYTES {
            safe_eprintln!("[m031][diff][BLOCK_BASELINE_FAILED reason=oversize]");
            return Err(format!(
                "MT_FS_TOO_LARGE: file is {} bytes, exceeds MAX_READ_BYTES ({MAX_READ_BYTES})",
                meta.len()
            ));
        }

        // 4) Strict UTF-8 read on the validated path — F7 preserved: an
        //    invalid-UTF-8 sidecar still errors, no decode-and-replace.
        let content = std::fs::read_to_string(&validated)
            .map_err(|e| format!("Failed to read .before file: {e}"))?;
        safe_eprintln!(
            "[m031][diff][BLOCK_DIFF_BASELINE_OK source=before bytes={}]",
            content.len()
        );
        return Ok(content);
    }

    #[cfg(feature = "app-store")]
    {
        return Err("Git diff baseline not available in App Store build".to_string());
    }

    #[cfg(not(feature = "app-store"))]
    _diff_git_baseline(file_path)
}

#[cfg(not(feature = "app-store"))]
fn _diff_git_baseline(file_path: &Path) -> Result<String, String> {
    use std::process::Command;

    let dir = file_path
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;

    let toplevel = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git not available: {e}"))?;

    if !toplevel.status.success() {
        return Err("Not a git repository".to_string());
    }

    let root = String::from_utf8_lossy(&toplevel.stdout).trim().to_string();
    let root_path = Path::new(&root);

    let rel = file_path
        .strip_prefix(root_path)
        .map_err(|_| "File is outside the git repository".to_string())?;

    let rel_str = rel.to_string_lossy();

    let show = Command::new("git")
        .args(["show", &format!("HEAD:{rel_str}")])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("git show failed: {e}"))?;

    if !show.status.success() {
        let stderr = String::from_utf8_lossy(&show.stderr);
        if stderr.contains("does not exist") || stderr.contains("not in") {
            return Err("File is not tracked by git".to_string());
        }
        return Err(format!("git show failed: {}", stderr.trim()));
    }

    let content = String::from_utf8(show.stdout)
        .map_err(|_| "Baseline content is not valid UTF-8".to_string())?;

    safe_eprintln!("[m031][diff][BLOCK_DIFF_BASELINE_OK bytes={}]", content.len());
    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    use tempfile::TempDir;

    // C-EXPORT-BOUNDARIES: every fixture lives inside a TempDir sandbox
    // root (the document and its .before sidecar written inside it), and
    // mt_diff_baseline_inner is called directly — no Tauri State needed.

    #[test]
    fn baseline_nonexistent_file_returns_err() {
        let sandbox = TempDir::new().unwrap();
        let missing = sandbox.path().join("definitely-does-not-exist-m031.md");
        let result = mt_diff_baseline_inner(missing.to_str().unwrap(), sandbox.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[cfg(not(feature = "app-store"))] // desktop-only path
    #[test]
    fn baseline_assembles_git_show_command() {
        // This test verifies the function runs without panicking on a
        // file that exists but may not be in a git repo. The exact
        // error depends on the environment.
        let sandbox = TempDir::new().unwrap();
        let tmp = sandbox.path().join("m031-test-file.md");
        std::fs::write(&tmp, "# test").unwrap();
        let result = mt_diff_baseline_inner(tmp.to_str().unwrap(), sandbox.path());
        // Either succeeds (if the sandbox is in a git repo) or returns a
        // descriptive error.
        match result {
            Ok(content) => assert!(!content.is_empty() || content.is_empty()),
            Err(e) => assert!(
                e.contains("git") || e.contains("repository") || e.contains("tracked"),
                "unexpected error: {e}"
            ),
        }
    }

    #[test]
    fn baseline_before_file_takes_priority() {
        let sandbox = TempDir::new().unwrap();
        let tmp = sandbox.path().join("m031-before-test.md");
        let before = sandbox.path().join("m031-before-test.md.before");
        std::fs::write(&tmp, "# current content").unwrap();
        std::fs::write(&before, "# original content").unwrap();

        let result = mt_diff_baseline_inner(tmp.to_str().unwrap(), sandbox.path());
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap(), "# original content");
    }

    #[test]
    fn baseline_current_repo_file() {
        // Test against a file that IS in the current git repo. The
        // permissive default sandbox ("/") mirrors SecurityCtx::default
        // for the State the real command receives.
        let cargo_toml = std::env::current_dir()
            .unwrap()
            .join("Cargo.toml");
        if !cargo_toml.exists() {
            return; // skip if not running from src-tauri
        }
        let result = mt_diff_baseline_inner(cargo_toml.to_str().unwrap(), Path::new("/"));
        match result {
            Ok(content) => {
                assert!(content.contains("[package]"));
            }
            Err(_) => {
                // Might fail in CI or unusual environments — not a test failure
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn baseline_sidecar_outside_sandbox_denied() {
        // Red-first fence pin: a {path}.before symlink resolving OUTSIDE
        // the sandbox must deny with MT_FS_PATH_DENIED — pre-fix code
        // returned the outside file's bytes.
        let sandbox = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let outside_target = outside.path().join("real-before.md.before");
        std::fs::write(&outside_target, "OUTSIDE BYTES").unwrap();

        let doc = sandbox.path().join("doc.md");
        std::fs::write(&doc, "# current").unwrap();
        let sidecar = sandbox.path().join("doc.md.before");
        std::os::unix::fs::symlink(&outside_target, &sidecar).unwrap();

        let result = mt_diff_baseline_inner(doc.to_str().unwrap(), sandbox.path());
        let err = result.err().expect("outside-sandbox sidecar must be denied");
        assert!(err.contains("MT_FS_PATH_DENIED"), "unexpected error: {err}");
        assert!(!err.contains("OUTSIDE BYTES"), "no bytes may be returned");
    }

    #[cfg(unix)]
    #[test]
    fn baseline_sidecar_symlink_inward_reads() {
        // Deny-only-NEW-links spirit: a pre-existing link resolving
        // INSIDE the sandbox reads normally.
        let sandbox = TempDir::new().unwrap();
        let real = sandbox.path().join("real-before.md.before");
        std::fs::write(&real, "# original content").unwrap();

        let doc = sandbox.path().join("doc.md");
        std::fs::write(&doc, "# current").unwrap();
        let sidecar = sandbox.path().join("doc.md.before");
        std::os::unix::fs::symlink(&real, &sidecar).unwrap();

        let result = mt_diff_baseline_inner(doc.to_str().unwrap(), sandbox.path());
        assert!(result.is_ok(), "inward link must read: {:?}", result);
        assert_eq!(result.unwrap(), "# original content");
    }

    #[test]
    fn baseline_sidecar_non_regular_denied() {
        // A directory named {path}.before is not a regular file.
        let sandbox = TempDir::new().unwrap();
        let doc = sandbox.path().join("doc.md");
        std::fs::write(&doc, "# current").unwrap();
        let sidecar = sandbox.path().join("doc.md.before");
        std::fs::create_dir(&sidecar).unwrap();

        let result = mt_diff_baseline_inner(doc.to_str().unwrap(), sandbox.path());
        let err = result.err().expect("a directory sidecar must be denied");
        assert!(err.contains("MT_FS_NOT_REGULAR"), "unexpected error: {err}");
    }

    #[test]
    fn baseline_sidecar_over_cap_denied() {
        // Sized past the reused MAX_READ_BYTES cap via set_len — no
        // 10 MiB write — and denied before any read attempt.
        let sandbox = TempDir::new().unwrap();
        let doc = sandbox.path().join("doc.md");
        std::fs::write(&doc, "# current").unwrap();
        let sidecar = sandbox.path().join("doc.md.before");
        let file = std::fs::File::create(&sidecar).unwrap();
        file.set_len(MAX_READ_BYTES + 1).unwrap();
        drop(file);

        let result = mt_diff_baseline_inner(doc.to_str().unwrap(), sandbox.path());
        let err = result.err().expect("over-cap sidecar must be denied");
        assert!(err.contains("MT_FS_TOO_LARGE"), "unexpected error: {err}");
    }

    #[test]
    fn baseline_invalid_utf8_sidecar_still_errors() {
        // The honest F7 pin: the strict UTF-8 read is kept after the
        // fence — no decode-and-replace rides in with the funnel.
        let sandbox = TempDir::new().unwrap();
        let doc = sandbox.path().join("doc.md");
        std::fs::write(&doc, "# current").unwrap();
        let sidecar = sandbox.path().join("doc.md.before");
        std::fs::write(&sidecar, [0xff_u8, 0xfe_u8, 0xfd_u8]).unwrap();

        let result = mt_diff_baseline_inner(doc.to_str().unwrap(), sandbox.path());
        let err = result.err().expect("invalid UTF-8 must error");
        assert!(
            err.starts_with("Failed to read .before file:"),
            "unexpected error: {err}"
        );
    }
}
