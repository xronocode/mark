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
//   - 2026-08-14 live-doc v2: DocPatchRequest gained `op` (append|replace,
//     default replace; replace_section synonym). LiveSession.sections is now
//     an ordered Vec (was HashMap) set at /stream/open from an ordered
//     array of {name, content}; document rebuild is deterministic and adds
//     no synthetic headers. Unknown op/section -> 400. Core logic extracted
//     into pure fns apply_section_patch/rebuild_document_md for testing.
//   - 2026-06-09 E1a: add /ext/context and /ext/apply endpoints for
//     TokMo EditAgent. Context uses oneshot+event request-response pattern.
//     Apply reuses mt::text::op events. Bearer auth without active session.
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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, Listener};
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
    /// Ordered sections: (name, markdown content). Order is fixed at
    /// /stream/open and preserved for the whole session. Content is
    /// self-contained markdown (sections carry their own headers).
    pub sections: Vec<(String, String)>,
    pub active: bool,
    pub last_heartbeat: Instant,
}

/// Shared state for the live server. Thread-safe via tokio::sync::Mutex
/// (async-aware, no blocking across await points).
pub struct LiveServerState {
    pub session: Mutex<Option<LiveSession>>,
    pub app_handle: tauri::AppHandle,
    /// Pending /ext/context requests awaiting frontend response.
    /// Uses std::sync::Mutex (not tokio) because the lock is held
    /// only briefly for insert/remove — never across await points.
    pub pending_context: std::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<ExtContextResponse>>>,
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

/// Initial section payload for /stream/open. Sections are ordered;
/// content is self-contained markdown (with its own headers) and must
/// concatenate (in order, "\n\n"-separated) to initial_md.
#[derive(Debug, Deserialize)]
pub struct SectionInit {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct DocOpenRequest {
    pub session_id: String,
    pub extension_id: String,
    pub title: String,
    pub initial_md: Option<String>,
    pub sections: Option<Vec<SectionInit>>,
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
    /// Patch semantics: "append" | "replace". Missing -> "replace".
    /// "replace_section" is accepted as a legacy synonym of "replace".
    pub op: Option<String>,
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
    #[allow(dead_code)]
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

// --- E1a: /ext/context + /ext/apply types ---

static CONTEXT_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize)]
pub struct ExtContextRequest {
    pub extension_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtContextResponse {
    pub markdown: String,
    pub cursor: Option<CursorCoords>,
    pub selection: Option<SelectionInfo>,
    pub file_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CursorCoords {
    pub line: f64,
    pub ch: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SelectionInfo {
    pub text: String,
    pub start: Option<CursorCoords>,
    pub end: Option<CursorCoords>,
}

/// Payload emitted back by the frontend in response to a context request.
#[derive(Debug, Deserialize)]
struct ContextCallbackPayload {
    request_id: String,
    context: ExtContextResponse,
}

#[derive(Debug, Deserialize)]
pub struct ExtApplyRequest {
    pub extension_id: String,
    pub operations: Vec<EditOperation>,
    #[allow(dead_code)]
    pub undo_label: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct EditOperation {
    /// "replace_selection", "insert_at_cursor", or "undo"
    pub op_type: String,
    pub content: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExtApplyResponse {
    pub applied: bool,
    pub operations_count: usize,
}

// END_BLOCK_REQUEST_TYPES

// START_BLOCK_SECTION_PATCH_CORE

/// Errors from applying a section patch. Mapped to HTTP 400 by the
/// /stream/patch handler.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SectionPatchError {
    UnknownOp(String),
    UnknownSection(String),
}

impl std::fmt::Display for SectionPatchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SectionPatchError::UnknownOp(op) => {
                write!(f, "unknown patch op: {op} (expected \"append\" or \"replace\")")
            }
            SectionPatchError::UnknownSection(section) => {
                write!(f, "unknown section: {section} (sections are fixed at /stream/open)")
            }
        }
    }
}

/// Normalize the wire op into canonical form.
/// None (missing field), "replace", and the legacy synonym
/// "replace_section" all normalize to "replace".
fn normalize_patch_op(op: Option<&str>) -> Result<&'static str, SectionPatchError> {
    match op {
        None | Some("replace") | Some("replace_section") => Ok("replace"),
        Some("append") => Ok("append"),
        Some(other) => Err(SectionPatchError::UnknownOp(other.to_string())),
    }
}

/// Apply a single patch operation to the ordered section list.
/// Pure function (no HTTP, no session state) so tests can exercise the
/// exact semantics the /stream/patch handler uses.
///
/// - "append": concatenate content onto the existing section body.
/// - "replace": replace the section body wholesale.
///
/// Unknown op or a section not declared at /stream/open is an error.
pub fn apply_section_patch(
    sections: &mut [(String, String)],
    section: &str,
    op: Option<&str>,
    content: &str,
) -> Result<(), SectionPatchError> {
    let normalized = normalize_patch_op(op)?;
    let slot = sections
        .iter_mut()
        .find(|(name, _)| name == section)
        .ok_or_else(|| SectionPatchError::UnknownSection(section.to_string()))?;
    match normalized {
        "append" => slot.1.push_str(content),
        _ => slot.1 = content.to_string(),
    }
    Ok(())
}

/// Rebuild the full document from the ordered section list.
/// Deterministic: declared order, empty sections skipped, "\n\n"
/// separator. Never adds synthetic headers — section content is
/// self-contained markdown owned by the sender.
pub fn rebuild_document_md(sections: &[(String, String)]) -> String {
    sections
        .iter()
        .filter(|(_, value)| !value.is_empty())
        .map(|(_, value)| value.as_str())
        .collect::<Vec<&str>>()
        .join("\n\n")
}

/// Build the ordered section list from /stream/open payload.
/// Duplicate names keep their first position; the last content wins.
pub fn build_sections_from_init(inits: Vec<SectionInit>) -> Vec<(String, String)> {
    let mut sections: Vec<(String, String)> = Vec::with_capacity(inits.len());
    for init in inits {
        match sections.iter_mut().find(|(name, _)| *name == init.name) {
            Some(slot) => slot.1 = init.content,
            None => sections.push((init.name, init.content)),
        }
    }
    sections
}

/// Decision for an incoming /stream/open against the current session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenDecision {
    /// No active session — start fresh.
    FreshOpen,
    /// Active session with the SAME id — replace state wholesale
    /// (resync path; live-doc v2 recovery for a client stuck on
    /// needs_resync).
    ReplaceSameSession,
    /// Active session with a DIFFERENT id — reject with 409.
    Conflict,
}

/// Pure core: decide how /stream/open interacts with the active session.
pub fn decide_open(existing: Option<&LiveSession>, incoming_session_id: &str) -> OpenDecision {
    match existing {
        None => OpenDecision::FreshOpen,
        Some(s) if !s.active => OpenDecision::FreshOpen,
        Some(s) if s.session_id == incoming_session_id => OpenDecision::ReplaceSameSession,
        Some(_) => OpenDecision::Conflict,
    }
}

// END_BLOCK_SECTION_PATCH_CORE

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

/// Validate bearer token against a specific extension's stored secret.
/// Unlike validate_bearer(), this does NOT require an active LiveSession —
/// used by /ext/context and /ext/apply which work with the normal editor.
async fn validate_bearer_extension(
    headers: &HeaderMap,
    extension_id: &str,
) -> Result<(), (StatusCode, String)> {
    let token = extract_bearer(headers)?;
    if !super::auth::validate_token(extension_id, &token) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_AUTH_FAILED_EXT ext_id={extension_id}]"
        );
        return Err((StatusCode::UNAUTHORIZED, "invalid token".to_string()));
    }
    Ok(())
}

// END_BLOCK_AUTH_EXTRACT

// START_BLOCK_HANDLERS

/// POST /ext/pair — pairing initiation.
/// Generates a shared secret, stores it in keychain, returns it to the
/// caller. In production this would show a native dialog for user
/// approval; for now auto-approves (TODO: wire native dialog via
/// app_handle).
async fn handle_pair(
    State(_state): State<Arc<LiveServerState>>,
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

    // Authenticate BEFORE any session-state disclosure (401 must precede
    // 409 — otherwise an unauthenticated local caller gets a session
    // existence oracle plus the real existing_session_id). Identity comes
    // from the request's extension_id, validated against the
    // keychain-stored secret — not client-controlled session state.
    let extension_id = req.extension_id.clone();
    if !super::auth::validate_token(&extension_id, &bearer_token) {
        safe_eprintln!("[ExtHost][live_server][BLOCK_DOC_OPEN_AUTH_FAILED ext_id={extension_id}]");
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "invalid token for extension"})),
        );
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_DOC_OPEN session_id={} title={}]",
        req.session_id,
        req.title,
    );

    let mut session_guard = state.session.lock().await;

    match decide_open(session_guard.as_ref(), &req.session_id) {
        OpenDecision::Conflict => {
            let existing_id = session_guard
                .as_ref()
                .map(|s| s.session_id.clone())
                .unwrap_or_default();
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_DOC_OPEN_CONFLICT existing={existing_id}]",
            );
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "a different session is already active",
                    "existing_session_id": existing_id,
                })),
            );
        }
        OpenDecision::ReplaceSameSession => {
            // Resync path (live-doc v2): re-open with the same session_id
            // replaces session state wholesale. This is the recovery for
            // a client stuck on needs_resync (stale base_revision): the
            // client re-sends the full document (sections with content)
            // and streaming continues from a fresh revision.
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_DOC_OPEN_RESYNC session_id={}]",
                req.session_id,
            );
        }
        OpenDecision::FreshOpen => {}
    }

    let initial_md = req.initial_md.unwrap_or_default();
    let sections = build_sections_from_init(req.sections.unwrap_or_default());
    // When sections are declared, the document is exactly their
    // concatenation (live-doc v2); initial_md is advisory only. The
    // server tracks and emits document_md — the authoritative value —
    // so a client violating the initial_md==join(sections) invariant
    // cannot desync the frontend from server state.
    let document_md = if sections.is_empty() {
        initial_md
    } else {
        rebuild_document_md(&sections)
    };
    let document_md_for_emit = document_md.clone();

    let session = LiveSession {
        session_id: req.session_id.clone(),
        extension_id,
        last_seq: 0,
        revision: 1,
        document_md,
        sections,
        active: true,
        last_heartbeat: Instant::now(),
    };

    *session_guard = Some(session);
    drop(session_guard);

    // B5b: emit doc_open to frontend for live rendering. Emits the
    // authoritative document_md (== join of sections), not the raw
    // client-supplied initial_md.
    if let Err(e) = super::live_bridge::emit_doc_open(
        &state.app_handle,
        &req.session_id,
        &req.title,
        &document_md_for_emit,
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
    // Deliberately short-circuits BEFORE op/section validation and
    // before apply: the original delivery was already validated and
    // applied, and re-applying an append op would duplicate content.
    // A retransmit still proves the client is alive — refresh the
    // heartbeat so an actively-retrying client is not timed out
    // mid-recovery.
    if req.seq <= session.last_seq {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_PATCH_DUPLICATE seq={} last_seq={}]",
            req.seq,
            session.last_seq,
        );
        session.last_heartbeat = Instant::now();
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
    // the client is out of sync. The client is alive (it is patching) —
    // refresh the heartbeat before answering needs_resync so the
    // session survives the upcoming re-open round trip.
    if req.base_revision != session.revision {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_PATCH_RESYNC base={} current={}]",
            req.base_revision,
            session.revision,
        );
        session.last_heartbeat = Instant::now();
        return (
            StatusCode::OK,
            Json(serde_json::json!(DocPatchResponse {
                applied_revision: session.revision,
                duplicate: false,
                needs_resync: true,
            })),
        );
    }

    // Apply the patch: append or replace the section content (live-doc
    // v2 op semantics; missing op defaults to replace). Unknown op or a
    // section not declared at /stream/open is a client bug -> 400.
    // START_BLOCK_APPLY_PATCH
    if let Err(e) = apply_section_patch(
        &mut session.sections,
        &req.section,
        req.op.as_deref(),
        &req.content,
    ) {
        match &e {
            SectionPatchError::UnknownOp(op) => safe_eprintln!(
                "[ExtHost][live_server][BLOCK_DOC_PATCH_UNKNOWN_OP op={op} section={} seq={}]",
                req.section,
                req.seq,
            ),
            SectionPatchError::UnknownSection(section) => safe_eprintln!(
                "[ExtHost][live_server][BLOCK_DOC_PATCH_UNKNOWN_SECTION section={section} seq={}]",
                req.seq,
            ),
        }
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": e.to_string()})),
        );
    }
    session.document_md = rebuild_document_md(&session.sections);
    // END_BLOCK_APPLY_PATCH

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
        "[ExtHost][live_server][BLOCK_DOC_PATCH_OK session_id={} seq={} rev={} op={:?} section={}]",
        req.session_id,
        req.seq,
        revision,
        req.op.as_deref().unwrap_or("replace"),
        section,
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

/// POST /ext/context — return current editor state (markdown, cursor, selection).
/// E1a: used by TokMo EditAgent to fetch document context before LLM call.
/// Emits a Tauri event to the frontend, which gathers the Muya editor state
/// and emits a response event back. Uses a oneshot channel with 5s timeout.
async fn handle_ext_context(
    State(state): State<Arc<LiveServerState>>,
    headers: HeaderMap,
    Json(req): Json<ExtContextRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_bearer_extension(&headers, &req.extension_id).await {
        return (e.0, Json(serde_json::json!({"error": e.1})));
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_EXT_CONTEXT_REQUEST ext_id={}]",
        req.extension_id,
    );

    let request_id = format!(
        "ctx_{}",
        CONTEXT_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed)
    );

    let (tx, rx) = tokio::sync::oneshot::channel::<ExtContextResponse>();

    {
        let mut pending = state.pending_context.lock().unwrap();
        pending.insert(request_id.clone(), tx);
    }

    if let Err(e) = super::live_bridge::emit_context_request(
        &state.app_handle,
        &request_id,
    ) {
        // Clean up the pending request on emit failure.
        let mut pending = state.pending_context.lock().unwrap();
        pending.remove(&request_id);
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_EXT_CONTEXT_EMIT_FAILED reason={e}]"
        );
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("emit failed: {e}")})),
        );
    }

    match tokio::time::timeout(std::time::Duration::from_secs(5), rx).await {
        Ok(Ok(context)) => {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_EXT_CONTEXT_OK ext_id={} md_len={}]",
                req.extension_id,
                context.markdown.len(),
            );
            (StatusCode::OK, Json(serde_json::to_value(&context).unwrap()))
        }
        Ok(Err(_)) => {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_EXT_CONTEXT_CHANNEL_CLOSED]"
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "context channel closed unexpectedly"})),
            )
        }
        Err(_) => {
            let mut pending = state.pending_context.lock().unwrap();
            pending.remove(&request_id);
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_EXT_CONTEXT_TIMEOUT request_id={request_id}]"
            );
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(serde_json::json!({"error": "frontend did not respond within 5s"})),
            )
        }
    }
}

/// POST /ext/apply — apply edit operations to the active editor.
/// E1a: used by TokMo EditAgent to apply LLM-generated edits.
/// Emits mt::text::op events for each operation; Muya's 1500ms debounce
/// groups rapid operations as a single undo step.
async fn handle_ext_apply(
    State(state): State<Arc<LiveServerState>>,
    headers: HeaderMap,
    Json(req): Json<ExtApplyRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_bearer_extension(&headers, &req.extension_id).await {
        return (e.0, Json(serde_json::json!({"error": e.1})));
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_EXT_APPLY ext_id={} ops={}]",
        req.extension_id,
        req.operations.len(),
    );

    for (i, op) in req.operations.iter().enumerate() {
        let (op_type, payload) = match op.op_type.as_str() {
            "replace_selection" => (
                "transform",
                serde_json::json!({
                    "text": op.content.clone().unwrap_or_default(),
                }),
            ),
            "insert_at_cursor" => (
                "insert",
                serde_json::json!({
                    "text": op.content.clone().unwrap_or_default(),
                    "position": null,
                }),
            ),
            "undo" => (
                "undo",
                serde_json::json!({}),
            ),
            other => {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_EXT_APPLY_UNKNOWN_OP op_type={other} index={i}]"
                );
                continue;
            }
        };

        let event = super::text_ops::TextOpEvent {
            op_type: op_type.to_string(),
            payload,
            extension_id: req.extension_id.clone(),
        };

        if let Err(e) = state.app_handle.emit("mt::text::op", &event) {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_EXT_APPLY_EMIT_FAILED op={op_type} index={i} reason={e}]"
            );
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("emit failed for operation {i}: {e}"),
                })),
            );
        }
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_EXT_APPLY_OK ext_id={} ops={}]",
        req.extension_id,
        req.operations.len(),
    );

    (
        StatusCode::OK,
        Json(serde_json::json!(ExtApplyResponse {
            applied: true,
            operations_count: req.operations.len(),
        })),
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
        .route("/ext/context", post(handle_ext_context))
        .route("/ext/apply", post(handle_ext_apply))
        .route("/stream/open", post(handle_doc_open))
        .route("/stream/patch", post(handle_doc_patch))
        .route("/stream/close", post(handle_doc_close))
        .route("/stream/heartbeat", post(handle_heartbeat));

    #[cfg(debug_assertions)]
    let app = app.route("/debug/auth", axum::routing::get(handle_debug_auth));

    let ctx_state = Arc::clone(&state);
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

    // E1a: listen for context response events from the frontend.
    // When the frontend gathers the Muya editor state, it emits
    // `mt::ext::context_response` back — we resolve the pending
    // oneshot channel here.
    let listener_handle = ctx_state.app_handle.clone();
    listener_handle.listen("mt::ext::context_response", move |event| {
        let payload_str = event.payload();
        match serde_json::from_str::<ContextCallbackPayload>(payload_str) {
            Ok(resp) => {
                let mut pending = ctx_state.pending_context.lock().unwrap();
                if let Some(tx) = pending.remove(&resp.request_id) {
                    let _ = tx.send(resp.context);
                }
            }
            Err(e) => {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_CONTEXT_RESPONSE_PARSE_FAILED reason={e}]"
                );
            }
        }
    });

    Ok(port)
}

// END_BLOCK_SERVER_BOOT
