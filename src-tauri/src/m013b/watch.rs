// MODULE_CONTRACT
//   PURPOSE: M-013b file-watcher command STUBS. Subscribe / unsubscribe
//            interface for the renderer; events are pushed via
//            tauri::AppHandle::emit on 'mt::watch::event' channel
//            (M-013a useIpcListener subscribes). Returns
//            Err(MT_NOT_IMPLEMENTED) until M-003 mt-fs-watcher ships
//            in Phase-B2 step-3.
//   SCOPE:   subscribe (returns subscription_id) + unsubscribe by id.
//   DEPENDS: error::IpcError; real impl uses notify crate.
//   LINKS:   M-013b runtime façade; M-003 mt-fs-watcher (B2 successor);
//            v1 equivalent: chokidar watcher in src/main/filesystem/.
//   STATUS:  Phase-B1 stub.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-6: initial stub. subscribe + unsubscribe.

use crate::m013b::error::IpcError;

/// Subscribe to filesystem changes under a path. Returns a stable
/// subscription_id; renderer uses it to unsubscribe. Events flow through
/// mt::watch::event with payload {subscription_id, kind, path}.
#[tauri::command]
pub async fn mt_watch_subscribe(path: String, recursive: Option<bool>) -> Result<String, IpcError> {
    eprintln!(
        "[m013b][watch][BLOCK_MT_WATCH_SUBSCRIBE_NOT_IMPLEMENTED path={path} recursive={}]",
        recursive.unwrap_or(true)
    );
    Err(IpcError::not_implemented("mt::watch::subscribe", "B2-step-3"))
}

/// Unsubscribe by subscription_id. Idempotent — calling on a non-existent
/// id is silently OK (mirrors v1's chokidar.close() semantics).
#[tauri::command]
pub async fn mt_watch_unsubscribe(subscription_id: String) -> Result<(), IpcError> {
    eprintln!(
        "[m013b][watch][BLOCK_MT_WATCH_UNSUBSCRIBE_NOT_IMPLEMENTED subId={subscription_id}]"
    );
    Err(IpcError::not_implemented(
        "mt::watch::unsubscribe",
        "B2-step-3",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::m013b::error::MT_NOT_IMPLEMENTED;

    #[tokio::test]
    async fn subscribe_returns_not_implemented() {
        let err = mt_watch_subscribe("/tmp/foo".into(), Some(true))
            .await
            .unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::watch::subscribe");
        assert_eq!(err.planned_phase, "B2-step-3");
    }

    #[tokio::test]
    async fn unsubscribe_returns_not_implemented() {
        let err = mt_watch_unsubscribe("sub-1".into()).await.unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::watch::unsubscribe");
    }
}
