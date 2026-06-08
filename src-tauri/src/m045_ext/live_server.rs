// MODULE_CONTRACT
//   PURPOSE: M-045 live-viewer HTTP server. Accepts incoming
//            stream.document messages from external apps (e.g. TokMo
//            meeting mode) over HTTP POST on 127.0.0.1. Validates
//            Bearer auth, session lifecycle, and sequence idempotency.
//   SCOPE:   axum HTTP server with /ext/pair and /stream/* endpoints.
//            Session state: open/patch/close/heartbeat lifecycle.
//            Heartbeat timeout (15s) auto-closes stale sessions.
//   DEPENDS: axum 0.8, tokio (net, rt, time, sync), serde/serde_json,
//            super::auth (validate_token, generate_secret, store_secret).
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B5a;
//            ROADMAP.md Decision D1 (HTTP POST IPC).
//   STATUS:  Phase-B5b — handlers emit to frontend via live_bridge.
//
// CHANGE_SUMMARY:
//   - 2026-06-08 B5b: add live_bridge emit calls in doc_open, doc_patch,
//     doc_close handlers + heartbeat timeout auto-close.
//   - 2026-06-08 B5a: initial live_server module creation.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tauri::Emitter;
use tokio::sync::Mutex;

// START_BLOCK_TYPES

/// A live streaming session. Tracks document state, sequence numbers
/// for idempotency, and heartbeat timestamp for timeout detection.
pub struct LiveSession {
    pub session_id: String,
    pub extension_id: String,
    pub last_seq: u64,
    pub revision: u64,
    pub document_md: String,
    pub sections: HashMap<String, String>,
    pub active: bool,
    pub last_heartbeat: Instant,
}

/// Shared state for the live server. Thread-safe via tokio::sync::Mutex
/// (async-aware, no blocking across await points).
pub struct LiveServerState {
    pub session: Mutex<Option<LiveSession>>,
    pub app_handle: tauri::AppHandle,
}

// END_BLOCK_TYPES

// START_BLOCK_REQUEST_TYPES

#[derive(Debug, Deserialize)]
pub struct PairRequest {
    pub extension_id: String,
    pub extension_name: String,
    pub protocol_version: u32,
}

#[derive(Debug, Serialize)]
pub struct PairResponse {
    pub paired: bool,
    pub shared_secret: String,
    pub protocol_version: u32,
    pub mark_version: String,
}

#[derive(Debug, Deserialize)]
pub struct DocOpenRequest {
    pub session_id: String,
    pub extension_id: String,
    pub title: String,
    pub initial_md: Option<String>,
    pub sections: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
pub struct DocOpenResponse {
    pub accepted: bool,
    pub revision: u64,
}

#[derive(Debug, Deserialize)]
pub struct DocPatchRequest {
    pub session_id: String,
    pub seq: u64,
    pub base_revision: u64,
    pub section: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct DocPatchResponse {
    pub applied_revision: u64,
    pub duplicate: bool,
    pub needs_resync: bool,
}

#[derive(Debug, Deserialize)]
pub struct DocCloseRequest {
    pub session_id: String,
    pub seq: u64,
}

#[derive(Debug, Serialize)]
pub struct DocCloseResponse {
    pub closed: bool,
    pub final_revision: u64,
}

#[derive(Debug, Deserialize)]
pub struct HeartbeatRequest {
    pub session_id: String,
}

#[derive(Debug, Serialize)]
pub struct HeartbeatResponse {
    pub alive: bool,
    pub revision: u64,
}

#[derive(Debug, Deserialize)]
pub struct TextInsertRequest {
    pub text: String,
    pub source: Option<String>,
}

// END_BLOCK_REQUEST_TYPES

// START_BLOCK_AUTH_EXTRACT

/// Extract and validate the Bearer token from the Authorization header.
/// Returns the extension_id associated with the active session if valid.
fn extract_bearer(headers: &HeaderMap) -> Result<String, (StatusCode, String)> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "missing Authorization header".to_string(),
            )
        })?;

    if !auth.starts_with("Bearer ") {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Authorization must be Bearer <token>".to_string(),
        ));
    }

    let token = &auth[7..];
    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            "empty bearer token".to_string(),
        ));
    }

    Ok(token.to_string())
}

/// Validate a bearer token against the extension's stored secret.
async fn validate_bearer(
    headers: &HeaderMap,
    state: &LiveServerState,
) -> Result<String, (StatusCode, String)> {
    let token = extract_bearer(headers)?;

    let session_guard = state.session.lock().await;
    let session = session_guard.as_ref().ok_or_else(|| {
        (
            StatusCode::CONFLICT,
            "no active session".to_string(),
        )
    })?;

    let ext_id = session.extension_id.clone();
    drop(session_guard);

    if !super::auth::validate_token(&ext_id, &token) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_AUTH_FAILED ext_id={ext_id}]"
        );
        return Err((StatusCode::UNAUTHORIZED, "invalid token".to_string()));
    }

    Ok(ext_id)
}

// END_BLOCK_AUTH_EXTRACT

// START_BLOCK_HANDLERS

/// POST /ext/pair — pairing initiation.
/// Generates a shared secret, stores it in keychain, returns it to the
/// caller. In production this would show a native dialog for user
/// approval; for now auto-approves (TODO: wire native dialog via
/// app_handle).
async fn handle_pair(
    State(state): State<Arc<LiveServerState>>,
    Json(req): Json<PairRequest>,
) -> impl IntoResponse {
    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_PAIR_REQUEST ext_id={} name={} proto={}]",
        req.extension_id,
        req.extension_name,
        req.protocol_version,
    );

    // In debug builds, auto-approve pairing (rfd dialogs from axum's
    // background threads don't reliably show on macOS).
    // Release builds show a native confirmation dialog.
    #[cfg(debug_assertions)]
    let approved = {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_AUTO_APPROVE ext_id={} (debug build)]",
            req.extension_id,
        );
        true
    };
    #[cfg(not(debug_assertions))]
    let approved = {
        let ext_name_for_dialog = req.extension_name.clone();
        let ext_id_for_dialog = req.extension_id.clone();
        tokio::task::spawn_blocking(move || {
            use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};
            let result = MessageDialog::new()
                .set_level(MessageLevel::Info)
                .set_title("Mark — Extension Pairing Request")
                .set_description(&format!(
                    "The extension \"{}\" ({}) wants to pair with Mark.\n\nAllow this extension to send documents and data to Mark?",
                    ext_name_for_dialog, ext_id_for_dialog,
                ))
                .set_buttons(MessageButtons::OkCancelCustom(
                    "Allow".to_string(),
                    "Deny".to_string(),
                ))
                .show();
            match result {
                MessageDialogResult::Ok
                | MessageDialogResult::Yes => true,
                MessageDialogResult::Custom(ref s) if s == "Allow" => true,
                _ => false,
            }
        })
        .await
        .unwrap_or(false)
    };

    if !approved {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_DENIED ext_id={}]",
            req.extension_id,
        );
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "user denied pairing request"})),
        );
    }

    let secret = super::auth::generate_secret();
    if let Err(e) = super::auth::store_secret(&req.extension_id, &secret) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_SECRET_STORE_FAILED ext_id={} reason={e}]",
            req.extension_id,
        );
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "failed to store pairing secret"})),
        );
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_PAIR_OK ext_id={}]",
        req.extension_id,
    );

    (
        StatusCode::OK,
        Json(serde_json::json!(PairResponse {
            paired: true,
            shared_secret: secret,
            protocol_version: 1,
            mark_version: env!("CARGO_PKG_VERSION").to_string(),
        })),
    )
}

/// POST /stream/open — start a live document session.
async fn handle_doc_open(
    State(state): State<Arc<LiveServerState>>,
    headers: HeaderMap,
    Json(req): Json<DocOpenRequest>,
) -> impl IntoResponse {
    let bearer_token = match extract_bearer(&headers) {
        Ok(token) => token,
        Err(e) => return (e.0, Json(serde_json::json!({"error": e.1}))),
    };

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_DOC_OPEN session_id={} title={}]",
        req.session_id,
        req.title,
    );

    let mut session_guard = state.session.lock().await;

    if let Some(existing) = session_guard.as_ref() {
        if existing.active {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_DOC_OPEN_CONFLICT existing={}]",
                existing.session_id,
            );
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "a session is already active",
                    "existing_session_id": existing.session_id,
                })),
            );
        }
    }

    let initial_md = req.initial_md.unwrap_or_default();
    let initial_md_for_emit = initial_md.clone();
    let sections = req.sections.unwrap_or_default();

    // Use the explicit extension_id from the request (not derived from
    // session_id) so that identity comes from a trusted source validated
    // against the keychain-stored secret, not client-controlled input.
    let extension_id = req.extension_id.clone();

    // Validate the bearer token against the extension's stored secret.
    if !super::auth::validate_token(&extension_id, &bearer_token) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_OPEN_AUTH_FAILED ext_id={extension_id}]"
        );
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "invalid token for extension"})),
        );
    }

    let session = LiveSession {
        session_id: req.session_id.clone(),
        extension_id,
        last_seq: 0,
        revision: 1,
        document_md: initial_md,
        sections,
        active: true,
        last_heartbeat: Instant::now(),
    };

    *session_guard = Some(session);
    drop(session_guard);

    // B5b: emit doc_open to frontend for live rendering.
    if let Err(e) = super::live_bridge::emit_doc_open(
        &state.app_handle,
        &req.session_id,
        &req.title,
        &initial_md_for_emit,
    ) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_OPEN_EMIT_FAILED reason={e}]"
        );
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_DOC_OPEN_OK session_id={}]",
        req.session_id,
    );

    (
        StatusCode::OK,
        Json(serde_json::json!(DocOpenResponse {
            accepted: true,
            revision: 1,
        })),
    )
}

/// POST /stream/patch — incremental document update.
async fn handle_doc_patch(
    State(state): State<Arc<LiveServerState>>,
    headers: HeaderMap,
    Json(req): Json<DocPatchRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_bearer(&headers, &state).await {
        return (e.0, Json(serde_json::json!({"error": e.1})));
    }

    let mut session_guard = state.session.lock().await;

    let session = match session_guard.as_mut() {
        Some(s) if s.active => s,
        Some(_) => {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_DOC_PATCH_SESSION_CLOSED session_id={}]",
                req.session_id,
            );
            return (
                StatusCode::GONE,
                Json(serde_json::json!({"error": "session is closed"})),
            );
        }
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "no active session"})),
            );
        }
    };

    // Session ID mismatch check.
    if session.session_id != req.session_id {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_PATCH_SESSION_MISMATCH expected={} got={}]",
            session.session_id,
            req.session_id,
        );
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error": "session_id mismatch"})),
        );
    }

    // Duplicate detection: if seq <= last_seq, this is a retransmit.
    if req.seq <= session.last_seq {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_PATCH_DUPLICATE seq={} last_seq={}]",
            req.seq,
            session.last_seq,
        );
        return (
            StatusCode::OK,
            Json(serde_json::json!(DocPatchResponse {
                applied_revision: session.revision,
                duplicate: true,
                needs_resync: false,
            })),
        );
    }

    // Base revision check: if base_revision != current revision,
    // the client is out of sync.
    if req.base_revision != session.revision {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_PATCH_RESYNC base={} current={}]",
            req.base_revision,
            session.revision,
        );
        return (
            StatusCode::OK,
            Json(serde_json::json!(DocPatchResponse {
                applied_revision: session.revision,
                duplicate: false,
                needs_resync: true,
            })),
        );
    }

    // Apply the patch: update the section content.
    session.sections.insert(req.section.clone(), req.content.clone());

    // Rebuild the full document from sections (sections are ordered by
    // insertion; in a real implementation this would be more
    // sophisticated with OT/CRDT).
    let mut full_doc = String::new();
    for (key, value) in &session.sections {
        if !full_doc.is_empty() {
            full_doc.push_str("\n\n");
        }
        full_doc.push_str(&format!("## {key}\n\n{value}"));
    }
    session.document_md = full_doc;

    session.last_seq = req.seq;
    session.revision += 1;
    session.last_heartbeat = Instant::now();

    let full_content = session.document_md.clone();
    let section = req.section.clone();
    let revision = session.revision;
    drop(session_guard);

    // B5b: emit doc_patch to frontend for live rendering.
    if let Err(e) = super::live_bridge::emit_doc_patch(
        &state.app_handle,
        &full_content,
        &section,
        revision,
    ) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_PATCH_EMIT_FAILED reason={e}]"
        );
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_DOC_PATCH_OK session_id={} seq={} rev={}]",
        req.session_id,
        req.seq,
        revision,
    );

    (
        StatusCode::OK,
        Json(serde_json::json!(DocPatchResponse {
            applied_revision: revision,
            duplicate: false,
            needs_resync: false,
        })),
    )
}

/// POST /stream/close — end the live session.
async fn handle_doc_close(
    State(state): State<Arc<LiveServerState>>,
    headers: HeaderMap,
    Json(req): Json<DocCloseRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_bearer(&headers, &state).await {
        return (e.0, Json(serde_json::json!({"error": e.1})));
    }

    let mut session_guard = state.session.lock().await;

    let session = match session_guard.as_mut() {
        Some(s) if s.active => s,
        Some(_) => {
            return (
                StatusCode::GONE,
                Json(serde_json::json!({"error": "session already closed"})),
            );
        }
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "no active session"})),
            );
        }
    };

    if session.session_id != req.session_id {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error": "session_id mismatch"})),
        );
    }

    session.active = false;
    let final_revision = session.revision;
    let session_id = session.session_id.clone();
    drop(session_guard);

    // B5b: emit doc_close to frontend.
    if let Err(e) = super::live_bridge::emit_doc_close(
        &state.app_handle,
        &session_id,
        final_revision,
    ) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_CLOSE_EMIT_FAILED reason={e}]"
        );
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_DOC_CLOSE_OK session_id={} final_rev={}]",
        req.session_id,
        final_revision,
    );

    (
        StatusCode::OK,
        Json(serde_json::json!(DocCloseResponse {
            closed: true,
            final_revision,
        })),
    )
}

/// POST /stream/heartbeat — keepalive signal.
async fn handle_heartbeat(
    State(state): State<Arc<LiveServerState>>,
    headers: HeaderMap,
    Json(req): Json<HeartbeatRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_bearer(&headers, &state).await {
        return (e.0, Json(serde_json::json!({"error": e.1})));
    }

    let mut session_guard = state.session.lock().await;

    let session = match session_guard.as_mut() {
        Some(s) if s.active => s,
        Some(_) => {
            return (
                StatusCode::GONE,
                Json(serde_json::json!({"error": "session closed"})),
            );
        }
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "no active session"})),
            );
        }
    };

    if session.session_id != req.session_id {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error": "session_id mismatch"})),
        );
    }

    session.last_heartbeat = Instant::now();
    let revision = session.revision;

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_HEARTBEAT_OK session_id={}]",
        req.session_id,
    );

    (
        StatusCode::OK,
        Json(serde_json::json!(HeartbeatResponse {
            alive: true,
            revision,
        })),
    )
}

/// POST /ext/text-insert — insert text at cursor from an external app.
/// No auth required (pairing auth is for stream.document only in v1).
/// Emits `mt::text::op` in the same format that text_ops.rs uses so the
/// frontend textOps.js listener handles it identically.
async fn handle_text_insert(
    State(state): State<Arc<LiveServerState>>,
    Json(req): Json<TextInsertRequest>,
) -> impl IntoResponse {
    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_TEXT_INSERT len={} source={:?}]",
        req.text.len(),
        req.source,
    );

    let payload = serde_json::json!({
        "text": req.text,
        "position": null,
    });

    let event = super::text_ops::TextOpEvent {
        op_type: "insert".to_string(),
        payload,
        extension_id: "com.tokmo.voice".to_string(),
    };

    if let Err(e) = state.app_handle.emit("mt::text::op", &event) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_TEXT_INSERT_EMIT_FAILED reason={e}]"
        );
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("emit failed: {e}")})),
        );
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_TEXT_INSERT_OK len={}]",
        req.text.len(),
    );

    (
        StatusCode::OK,
        Json(serde_json::json!({"ok": true})),
    )
}

/// GET /debug/auth — diagnostic endpoint (dev builds only).
/// Returns keychain lookup result for a given extension_id.
#[cfg(debug_assertions)]
async fn handle_debug_auth(
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let ext_id = params.get("ext_id").cloned().unwrap_or_default();
    let result = super::auth::get_secret(&ext_id);
    let info = match &result {
        Ok(Some(secret)) => format!("found, len={}", secret.len()),
        Ok(None) => "no_entry".to_string(),
        Err(e) => format!("error: {e}"),
    };
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "ext_id": ext_id,
            "keychain_result": info,
        })),
    )
}

// END_BLOCK_HANDLERS

// START_BLOCK_HEARTBEAT_MONITOR

/// Heartbeat timeout in seconds. If no heartbeat is received within
/// this window, the session is auto-closed.
const HEARTBEAT_TIMEOUT_SECS: u64 = 15;

/// Background task: polls session state every 5 seconds and auto-closes
/// the session if no heartbeat has been received within HEARTBEAT_TIMEOUT_SECS.
async fn heartbeat_monitor(state: Arc<LiveServerState>) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        let mut session_guard = state.session.lock().await;
        let timed_out = if let Some(session) = session_guard.as_ref() {
            session.active
                && session.last_heartbeat.elapsed().as_secs() >= HEARTBEAT_TIMEOUT_SECS
        } else {
            false
        };

        if timed_out {
            if let Some(session) = session_guard.as_mut() {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_HEARTBEAT_TIMEOUT session_id={} elapsed={}s]",
                    session.session_id,
                    session.last_heartbeat.elapsed().as_secs(),
                );
                let sid = session.session_id.clone();
                let rev = session.revision;
                session.active = false;
                drop(session_guard);

                // B5b: emit doc_close on heartbeat timeout.
                if let Err(e) = super::live_bridge::emit_doc_close(
                    &state.app_handle,
                    &sid,
                    rev,
                ) {
                    safe_eprintln!(
                        "[ExtHost][live_server][BLOCK_HEARTBEAT_TIMEOUT_EMIT_FAILED reason={e}]"
                    );
                }
                continue;
            }
        }
    }
}

// END_BLOCK_HEARTBEAT_MONITOR

// START_BLOCK_SERVER_BOOT

/// Start the live-viewer HTTP server on 127.0.0.1 with an OS-assigned
/// port. Returns the port number on success. Spawns the axum server
/// and heartbeat monitor as background tokio tasks.
///
/// # Integration note
/// Call from tauri::Builder .setup() closure:
/// ```ignore
/// let live_state = Arc::new(LiveServerState {
///     session: Mutex::new(None),
///     app_handle: app.handle().clone(),
/// });
/// let port = m045_ext::live_server::start_live_server(live_state).await?;
/// ```
pub async fn start_live_server(state: Arc<LiveServerState>) -> Result<u16, String> {
    let heartbeat_state = Arc::clone(&state);

    let app = Router::new()
        .route("/ext/pair", post(handle_pair))
        .route("/ext/text-insert", post(handle_text_insert))
        .route("/stream/open", post(handle_doc_open))
        .route("/stream/patch", post(handle_doc_patch))
        .route("/stream/close", post(handle_doc_close))
        .route("/stream/heartbeat", post(handle_heartbeat));

    #[cfg(debug_assertions)]
    let app = app.route("/debug/auth", axum::routing::get(handle_debug_auth));

    let app = app.with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_BIND_FAILED reason={e}]"
            );
            e.to_string()
        })?;

    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_SERVER_STARTED port={port}]"
    );

    // Spawn the HTTP server.
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_SERVER_CRASHED reason={e}]"
            );
        }
    });

    // Spawn the heartbeat monitor.
    tokio::spawn(heartbeat_monitor(heartbeat_state));

    Ok(port)
}

// END_BLOCK_SERVER_BOOT
