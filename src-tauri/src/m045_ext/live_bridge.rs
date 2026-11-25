// FILE: src-tauri/src/m045_ext/live_bridge.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 live-viewer bridge. Connects the live-viewer HTTP
//            server (live_server.rs) to the Tauri webview frontend by
//            emitting typed events over the Tauri event system. The
//            frontend LiveViewer.vue component listens for these events
//            to render the live document in real time.
//   SCOPE:   Event emission only: doc_open, doc_patch, doc_close. No
//            HTTP handling, no session state, no Muya logic. Pure glue
//            between Rust backend and Vue frontend.
//   DEPENDS: tauri (AppHandle, Emitter), serde/serde_json.
//   LINKS:   .grace/changes/archive/C-SEC-AUDIT-FIXES;
//            .grace/graph/features.xml M-045;
//            .grace/graph/features.xml M-045 (PhaseRef Phase-B5b);
//            ROADMAP.md Decision D1 (HTTP POST IPC).
//   STATUS:  Phase-B5b initial — bridge emit helpers.
//
// CHANGE_SUMMARY:
//   - 2026-11-26 C-EXT-DELIVERY-HONESTY recovery evidence (guard audit,
//     integration f-005 follow-up): the cfg(test)-only emit-failure
//     injection seam grows a doc_patch twin — the DOC_PATCH_EMIT_INJECTION
//     flag plus the arm_doc_patch_emit_injection helper, scoped to the
//     arming fixture's own app handle exactly like the doc_open seam — so
//     the documented patch recovery (an emit failure stays log-only and
//     the NEXT patch emission carries the full rebuilt document) has a
//     test pin. Consulted by emit_doc_patch only; emit_doc_open,
//     emit_doc_close and emit_context_request stay byte-identical, and
//     the seam compiles out of release builds.
//   - 2026-11-23 C-EXT-DELIVERY-HONESTY T-001: cfg(test)-only emit-failure
//     injection seam for doc_open — the DOC_OPEN_EMIT_INJECTION flag plus
//     the arm_doc_open_emit_injection helper; when armed, emit_doc_open
//     returns Err before any app.emit call. The flag is managed as state on
//     the arming fixture's OWN app handle (a process never manages it in
//     production and a concurrent fixture never sees it), so only the
//     arming test's emissions fail. Consulted by emit_doc_open only:
//     emit_live_update, emit_doc_patch, emit_doc_close and
//     emit_context_request stay byte-identical, and the seam compiles out
//     of release builds (the main.rs LiveServerState literal is untouched).
//     Deviation from the plan's helper sketch: the helper takes the app
//     handle beside `armed` so the injection stays scoped to one fixture
//     under parallel test execution (a process-global flag made a
//     concurrent predecessor doc_open pin observe the injected failure).
//   - 2026-11-11 C-SEC-STREAM-AUTH: include session identity and incarnation on every document event.
//   - 2026-11-09 C-SEC-AUDIT-FIXES T-003: share event emission across production and mock runtimes.
//   - 2026-06-09 E1a: add emit_context_request helper for /ext/context.
//   - 2026-06-08 B5b: initial live_bridge module creation.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Coverage: GRACE 4 synchronized surface for M-045.
// END_MODULE_MAP

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
    ///   doc_open:  { title, content, session_id, session_epoch }
    ///   doc_patch: { full_content, section, revision, session_id, session_epoch }
    ///   doc_close: { session_id, session_epoch, final_revision }
    pub payload: serde_json::Value,
}

// END_BLOCK_TYPES

// START_BLOCK_EMIT

/// C-EXT-DELIVERY-HONESTY: test-only emit-failure injection flag. Managed
/// as state on the arming fixture's OWN app handle, so only that fixture's
/// doc_open emissions fail — a production app never manages this state and
/// a concurrently running test fixture never sees it. cfg(test): compiled
/// out of release builds, and the shared state (the main.rs
/// LiveServerState literal) is untouched. Only emit_doc_open consults this
/// flag — the other emit helpers keep the single emit point through
/// emit_live_update byte-identical.
#[cfg(test)]
#[derive(Default)]
pub struct DOC_OPEN_EMIT_INJECTION(pub std::sync::atomic::AtomicBool);

/// C-EXT-DELIVERY-HONESTY: arm or disarm the test-only doc_open emit-failure
/// injection on the given app handle. cfg(test) helper — invisible in
/// release builds.
#[cfg(test)]
pub fn arm_doc_open_emit_injection<R: tauri::Runtime>(app: &AppHandle<R>, armed: bool) {
    use tauri::Manager;
    if app.try_state::<DOC_OPEN_EMIT_INJECTION>().is_none() {
        app.manage(DOC_OPEN_EMIT_INJECTION::default());
    }
    if let Some(flag) = app.try_state::<DOC_OPEN_EMIT_INJECTION>() {
        flag.0.store(armed, std::sync::atomic::Ordering::Relaxed);
    }
}

/// C-EXT-DELIVERY-HONESTY recovery evidence (guard audit, integration
/// f-005 follow-up): test-only doc_patch emit-failure injection flag. Same
/// scoping rules as DOC_OPEN_EMIT_INJECTION: managed as state on the
/// arming fixture's OWN app handle (a production app never manages this
/// state and a concurrently running test fixture never sees it),
/// cfg(test) — compiled out of release builds, the shared state (the
/// main.rs LiveServerState literal) is untouched. Consulted by
/// emit_doc_patch only.
#[cfg(test)]
#[derive(Default)]
pub struct DOC_PATCH_EMIT_INJECTION(pub std::sync::atomic::AtomicBool);

/// C-EXT-DELIVERY-HONESTY recovery evidence: arm or disarm the test-only
/// doc_patch emit-failure injection on the given app handle. cfg(test)
/// helper — invisible in release builds.
#[cfg(test)]
pub fn arm_doc_patch_emit_injection<R: tauri::Runtime>(app: &AppHandle<R>, armed: bool) {
    use tauri::Manager;
    if app.try_state::<DOC_PATCH_EMIT_INJECTION>().is_none() {
        app.manage(DOC_PATCH_EMIT_INJECTION::default());
    }
    if let Some(flag) = app.try_state::<DOC_PATCH_EMIT_INJECTION>() {
        flag.0.store(armed, std::sync::atomic::Ordering::Relaxed);
    }
}

/// Emit a live-update event to the frontend.
///
/// The event name `mt::live::update` follows the project convention
/// established in bootstrap-ipc.js (all Tauri events use `mt::` prefix).
/// Returns Ok(()) on success or a stringified error.
pub fn emit_live_update<R: tauri::Runtime>(app: &AppHandle<R>, update: LiveUpdate) -> Result<(), String> {
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
pub fn emit_doc_open<R: tauri::Runtime>(
    app: &AppHandle<R>,
    session_id: &str,
    session_epoch: u64,
    title: &str,
    content: &str,
) -> Result<(), String> {
    // C-EXT-DELIVERY-HONESTY: test-only injection — fail BEFORE any
    // app.emit call when the seam is armed on THIS app handle (release
    // builds never see the check at all).
    #[cfg(test)]
    {
        use tauri::Manager;
        if let Some(flag) = app.try_state::<DOC_OPEN_EMIT_INJECTION>() {
            if flag.0.load(std::sync::atomic::Ordering::Relaxed) {
                return Err("injected doc_open emit failure (test)".to_string());
            }
        }
    }
    emit_live_update(app, LiveUpdate {
        update_type: "doc_open".to_string(),
        payload: serde_json::json!({
            "session_id": session_id,
            "session_epoch": session_epoch,
            "title": title,
            "content": content,
        }),
    })
}

/// Convenience: emit a doc_patch event with the full rebuilt document.
pub fn emit_doc_patch<R: tauri::Runtime>(
    app: &AppHandle<R>,
    session_id: &str,
    session_epoch: u64,
    full_content: &str,
    section: &str,
    revision: u64,
) -> Result<(), String> {
    // C-EXT-DELIVERY-HONESTY recovery evidence: test-only injection — fail
    // BEFORE any app.emit call when the seam is armed on THIS app handle
    // (release builds never see the check at all). Mirrors the doc_open
    // seam; the handler's documented log-and-recover behavior (the next
    // patch emission carries the full document) stays byte-identical.
    #[cfg(test)]
    {
        use tauri::Manager;
        if let Some(flag) = app.try_state::<DOC_PATCH_EMIT_INJECTION>() {
            if flag.0.load(std::sync::atomic::Ordering::Relaxed) {
                return Err("injected doc_patch emit failure (test)".to_string());
            }
        }
    }
    emit_live_update(app, LiveUpdate {
        update_type: "doc_patch".to_string(),
        payload: serde_json::json!({
            "session_id": session_id,
            "session_epoch": session_epoch,
            "full_content": full_content,
            "section": section,
            "revision": revision,
        }),
    })
}

/// Convenience: emit a doc_close event.
pub fn emit_doc_close<R: tauri::Runtime>(
    app: &AppHandle<R>,
    session_id: &str,
    session_epoch: u64,
    final_revision: u64,
) -> Result<(), String> {
    emit_live_update(app, LiveUpdate {
        update_type: "doc_close".to_string(),
        payload: serde_json::json!({
            "session_id": session_id,
            "session_epoch": session_epoch,
            "final_revision": final_revision,
        }),
    })
}

/// E1a: emit a context request event to the frontend.
/// The frontend gathers the Muya editor state and emits
/// `mt::ext::context_response` back with the result.
pub fn emit_context_request<R: tauri::Runtime>(
    app: &AppHandle<R>,
    request_id: &str,
) -> Result<(), String> {
    safe_eprintln!(
        "[ExtHost][live_bridge][BLOCK_EMIT_CONTEXT_REQUEST request_id={request_id}]"
    );

    app.emit("mt::ext::context_request", &serde_json::json!({
        "request_id": request_id,
    }))
    .map_err(|e| {
        safe_eprintln!(
            "[ExtHost][live_bridge][BLOCK_EMIT_CONTEXT_REQUEST_FAILED reason={e}]"
        );
        e.to_string()
    })
}

// END_BLOCK_HELPERS
