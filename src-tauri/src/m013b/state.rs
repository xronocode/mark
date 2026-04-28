// MODULE_CONTRACT
//   PURPOSE: SecurityCtx — Tauri-managed state holding the active
//            workspace sandbox path. Each fs/search/watch command
//            reads this on entry and passes it to M-010 check_path.
//            Until M-005 (B3 step-1) wires "Open Folder" → set sandbox,
//            the default is "/" which permits any absolute path
//            (M-010 still catches NUL/overlong/symlink-escape — those
//            are absolute-safety, not sandbox-relative).
//   SCOPE:   state container only. No IO, no command dispatch.
//   DEPENDS: stdlib + std::sync::Mutex for interior mutability behind
//            Tauri's State<'_, T> requirement.
//   LINKS:   docs/development-plan.xml Phase-B2 step-2;
//            docs/knowledge-graph.xml M-013b state holder;
//            M-010 mt-security check_path consumer;
//            M-005 mt-prefs (B3 step-1) sets the sandbox via menu/prefs.
//   STATUS:  Phase-B2 step-2 stub-shipped with permissive default.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-2: initial container.

use std::path::PathBuf;
use std::sync::Mutex;

/// Active workspace sandbox. Wrapped in Mutex because Tauri's State<'_, T>
/// requires Send+Sync; PathBuf alone is Send+Sync but mutating it from
/// multiple commands requires interior mutability.
pub struct SecurityCtx {
    sandbox: Mutex<PathBuf>,
}

impl Default for SecurityCtx {
    /// Permissive default: "/" lets every absolute path pass M-010's
    /// sandbox-prefix check. NUL/overlong/symlink-escape still
    /// enforced — those are absolute-safety guards, not workspace-
    /// relative. M-005 (B3 step-1) tightens this when "Open Folder"
    /// resolves a real workspace root.
    fn default() -> Self {
        Self {
            sandbox: Mutex::new(PathBuf::from("/")),
        }
    }
}

impl SecurityCtx {
    /// Read the current sandbox. Returns a clone (PathBuf is cheap; we
    /// avoid lifetime issues across the State boundary).
    pub fn sandbox(&self) -> PathBuf {
        self.sandbox.lock().expect("SecurityCtx mutex poisoned").clone()
    }

    /// Update the sandbox. Called by M-005 when "Open Folder" resolves
    /// a new workspace root (Phase-B3 step-1). #[allow(dead_code)]
    /// because production wiring lands in B3 — tests use it today.
    #[allow(dead_code)]
    pub fn set_sandbox(&self, new_root: PathBuf) {
        let mut guard = self.sandbox.lock().expect("SecurityCtx mutex poisoned");
        eprintln!(
            "[m013b][state][BLOCK_SANDBOX_UPDATED old={} new={}]",
            guard.display(),
            new_root.display()
        );
        *guard = new_root;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_sandbox_is_root() {
        let ctx = SecurityCtx::default();
        assert_eq!(ctx.sandbox(), PathBuf::from("/"));
    }

    #[test]
    fn set_sandbox_updates() {
        let ctx = SecurityCtx::default();
        ctx.set_sandbox(PathBuf::from("/Users/me/work"));
        assert_eq!(ctx.sandbox(), PathBuf::from("/Users/me/work"));
    }

    #[test]
    fn sandbox_clone_independent_of_internal_mutex() {
        let ctx = SecurityCtx::default();
        let snap1 = ctx.sandbox();
        ctx.set_sandbox(PathBuf::from("/tmp"));
        let snap2 = ctx.sandbox();
        assert_eq!(snap1, PathBuf::from("/")); // first snapshot unchanged
        assert_eq!(snap2, PathBuf::from("/tmp"));
    }
}
