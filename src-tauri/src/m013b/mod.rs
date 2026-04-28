// MODULE_CONTRACT
//   PURPOSE: M-013b runtime IPC façade — Phase-B1 step-6 skeleton.
//            Owns Rust-side `#[tauri::command]` signatures for fs +
//            search + watch channels. Every command logs a stable
//            BLOCK_*_NOT_IMPLEMENTED marker and returns
//            Err(IpcError::not_implemented). NEVER panics
//            (V-M-013b hard requirement).
//   SCOPE:   B1-stub-level command surface. Real impls (M-002 fs,
//            M-003 watch, M-004 search) ship in Phase-B2 and SHADOW
//            this module's signatures rather than coexist.
//   DEPENDS: serde, tauri::command, error::IpcError.
//   LINKS:   docs/development-plan.xml Phase-B1 step-6;
//            verification-plan.xml V-M-013b;
//            test/fixtures/ipc-channels/{electron.v1,tauri.v2}.json.
//   STATUS:  Phase-B1 stub. 9 commands total: 5 fs + 2 search + 2 watch.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-6: initial skeleton.

pub mod error;
pub mod fs;
pub mod search;
pub mod watch;

pub use error::{IpcError, MT_NOT_IMPLEMENTED};

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test: re-exports resolve to the same types as the submodule.
    #[test]
    fn re_exports_align_with_submodule() {
        let direct = error::IpcError::not_implemented("a", "b");
        let reexp: IpcError = error::IpcError::not_implemented("a", "b");
        assert_eq!(direct, reexp);
        assert_eq!(MT_NOT_IMPLEMENTED, error::MT_NOT_IMPLEMENTED);
    }
}
