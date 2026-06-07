// MODULE_CONTRACT
//   PURPOSE: M-045 live-viewer bridge. Connects the live-viewer HTTP
//            server (live_server.rs) to the Tauri webview frontend by
//            emitting typed events over the Tauri event system. The
//            frontend LiveViewer.vue component listens for these events
//            to render the live document in real time.
//   SCOPE:   Event emission only: doc_open, doc_patch, doc_close. No
//            HTTP handling, no session state, no Muya logic. Pure glue
//            between Rust backend and Vue frontend.
//   DEPENDS: tauri (AppHandle, Emitter), serde/serde_json.
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B5b;
//            ROADMAP.md Decision D1 (HTTP POST IPC).
//   STATUS:  Phase-B5b initial — bridge emit helpers.
//
// CHANGE_SUMMARY:
//   - 2026-06-08 B5b: initial live_bridge module creation.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

// START_BLOCK_TYPES

/// Payload emitted to the frontend via the `mt::live::update` event.
/// The `update_type` field discriminates the event kind; `payload`
/// carries the kind-specific data as a free-form JSON value.
#[derive(Debug, Serialize, Clone)]
pub struct LiveUpdate {
    /// Event kind: "doc_open", "doc_patch", or "doc_close".
    pub update_type: String,
    /// Kind-specific payload. Shapes:
    ///   doc_open:  { title, content, session_id }
    ///   doc_patch: { full_content, section, revision }
    ///   doc_close: { session_id, final_revision }
    pub payload: serde_json::Value,
}

// END_BLOCK_TYPES

// START_BLOCK_EMIT

/// Emit a live-update event to the frontend.
///
/// The event name `mt::live::update` follows the project convention
/// established in bootstrap-ipc.js (all Tauri events use `mt::` prefix).
/// Returns Ok(()) on success or a stringified error.
pub fn emit_live_update(app: &AppHandle, update: LiveUpdate) -> Result<(), String> {
    safe_eprintln!(
        "[ExtHost][live_bridge][BLOCK_EMIT update_type={}]",
        update.update_type,
    );

    app.emit("mt::live::update", &update)
        .map_err(|e| {
            safe_eprintln!(
                "[ExtHost][live_bridge][BLOCK_EMIT_FAILED update_type={} reason={e}]",
                update.update_type,
            );
            e.to_string()
        })
}

// END_BLOCK_EMIT

// START_BLOCK_HELPERS

/// Convenience: emit a doc_open event.
pub fn emit_doc_open(
    app: &AppHandle,
    session_id: &str,
    title: &str,
    content: &str,
) -> Result<(), String> {
    emit_live_update(app, LiveUpdate {
        update_type: "doc_open".to_string(),
        payload: serde_json::json!({
            "session_id": session_id,
            "title": title,
            "content": content,
        }),
    })
}

/// Convenience: emit a doc_patch event with the full rebuilt document.
pub fn emit_doc_patch(
    app: &AppHandle,
    full_content: &str,
    section: &str,
    revision: u64,
) -> Result<(), String> {
    emit_live_update(app, LiveUpdate {
        update_type: "doc_patch".to_string(),
        payload: serde_json::json!({
            "full_content": full_content,
            "section": section,
            "revision": revision,
        }),
    })
}

/// Convenience: emit a doc_close event.
pub fn emit_doc_close(
    app: &AppHandle,
    session_id: &str,
    final_revision: u64,
) -> Result<(), String> {
    emit_live_update(app, LiveUpdate {
        update_type: "doc_close".to_string(),
        payload: serde_json::json!({
            "session_id": session_id,
            "final_revision": final_revision,
        }),
    })
}

// END_BLOCK_HELPERS
