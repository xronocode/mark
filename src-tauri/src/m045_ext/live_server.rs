// FILE: src-tauri/src/m045_ext/live_server.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 live-viewer HTTP server. Accepts incoming
//            stream.document messages from external apps (e.g. TokMo
//            meeting mode) over HTTP POST on 127.0.0.1. Validates
//            Bearer auth, session lifecycle, and sequence idempotency.
//   SCOPE:   axum HTTP server with /ext/pair, /stream/*, and capability-
//            scoped text-insert/context/apply data routes; the context/
//            apply round trip is document-bound (C-SEC-EDIT-TARGETING);
//            runtime-generic events.//   SCOPE:   axum HTTP server with /ext/pair (prior-secret rebind gate),
//            /stream/*, and capability-scoped text-insert/context/apply
//            data routes; runtime-generic events.
//            Session state: open/patch/close/heartbeat lifecycle.
//            Heartbeat timeout (15s) auto-closes stale sessions.
//   DEPENDS: axum 0.8, tokio (net, rt, time, sync), serde/serde_json,
//            super::auth (validate_token, generate_secret, store_secret).
//   LINKS:   .grace/graph/features.xml M-045;
//            .grace/graph/features.xml M-045 (PhaseRef Phase-B5a);
//            ROADMAP.md Decision D1 (HTTP POST IPC);
//            .grace/changes/archive/C-SEC-AUDIT-FIXES.
//   STATUS:  Phase-B5b — handlers emit to frontend via live_bridge.
//
// CHANGE_SUMMARY:
//   - 2026-11-22 C-EXT-EDIT-PROOF T-002: the dead unbound insertion route
//     refuses at the source — POST /ext/text-insert answers 501
//     NOT_IMPLEMENTED (BLOCK_TEXT_INSERT_REFUSED) with the stable body
//     {"error": "text-insert route deprecated: use POST /ext/context then
//     POST /ext/apply"} after the unchanged authenticate_incoming gate and
//     emits no mt::text::op; the route, its v1 {text, source} body and the
//     401-class gate refusals stay (the old ok:true was provably false —
//     the editor targeting gate drops every unbound event). /ext/apply
//     under the binding gate is the one live mutation path.
//   - 2026-11-21 C-STREAM-BUDGET T-001..T-003: per-session stream
//     budgets on LiveSession.budget (StreamBudget, rebuilt wholesale by
//     every (re)open incl. the ReplaceSameSession resync path, so a
//     client that hit a cap honestly resets by re-opening) —
//     STREAM_BUDGET_TOTAL_BYTES 67108864 counts the authoritative
//     document_md bytes at open plus the GROSS content bytes of every
//     accepted patch at the single apply site, STREAM_BUDGET_MAX_SECTIONS
//     4096 caps the post-dedup section list at open, and the token
//     bucket (STREAM_BUDGET_RATE_PER_MINUTE 30 / STREAM_BUDGET_RATE_BURST
//     60 / STREAM_BUDGET_REFILL_SECS 2, pure decide_rate_admission
//     beside decide_open) is charged one token per applied patch only
//     after the duplicate and needs_resync short-circuits, with
//     heartbeat/close staying budget-free; every exceed is refused
//     413/413/429 (BLOCK_STREAM_BUDGET_BYTES_EXCEEDED /
//     BLOCK_STREAM_BUDGET_SECTIONS_EXCEEDED /
//     BLOCK_STREAM_BUDGET_RATE_EXCEEDED) through the existing
//     {"error": ...} body naming the budget and the cap, with zero
//     state mutation — the session keeps its last valid revision and
//     stays active; per-opens quota abuse via fresh opens is an
//     accepted NonGoal.
//   - 2026-11-21 C-SEC-EXT-GRANT-BOUND T-001..T-003: pairing captures the dialog-presented incoming set (registry.peek_manifest — registered regardless of enabled state; an unregistered id captures the honest empty grant) and stores it beside the credential via super::auth::store_grant BEFORE the secret; every incoming data route and every /stream/* route at open and on state changes authorizes by that stored grant (grant_authorizes; legacy credentials without a grant fail closed), with /stream/* refusals 401 BLOCK_STREAM_GRANT_REFUSED before any session mutation or live event; key replacement is honest — store_grant failure refuses 500 BLOCK_PAIR_GRANT_STORE_FAILED before any credential I/O, a refused new-key store logs BLOCK_PAIR_NEW_KEY_UNVERIFIED on a rebind, and a rebind additionally proves the prior token dead through a strict credential-record read (BLOCK_PAIR_OLD_KEY_STILL_VALID, BLOCK_PAIR_CREDENTIAL_VERIFY_READ_FAILED) before BLOCK_PAIR_OK answers paired:true.
//   - 2026-11-20 C-SEC-EDIT-TARGETING: the /ext/context response names the
//     active document instance (document_id + document_generation) and the
//     server remembers it per extension_id in the process-global
//     EXT_DOCUMENT_BINDINGS store; /ext/apply must echo the binding — a
//     missing binding is a distinct logged 400
//     (BLOCK_EXT_APPLY_MISSING_BINDING), a stale, never-issued or null
//     binding a 409 (BLOCK_EXT_APPLY_BINDING_MISMATCH) — both refused
//     after the capability gate and before any mt::text::op is emitted;
//     the emitted op payloads carry the binding to the editor.//   - 2026-11-20 C-SEC-PAIR-REBIND: /ext/pair gains an additive prior_secret field; an id that already holds a stored credential pairs only on the prior secret matched constant-time, an unproven rebind is refused leaving the previous key valid, the dialog distinguishes key replacement from first pairing, and auto-approval is confined to the test harness.
//   - 2026-11-20 C-SEC-STREAM-SCOPE: /ext/context requires context.read and /ext/apply requires text.edit, checked against the paired manifest before any response or event; the release pairing dialog names exactly the granted incoming capabilities.
//   - 2026-11-11 C-SEC-STREAM-AUTH: validate enabled generation and session owner at serialized mutations; stamp ordered live events.
//   - 2026-11-09 C-SEC-AUDIT-FIXES T-003: authenticate text insertion by enabled capability and bearer identity; runtime-generic fixtures.
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
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Coverage: GRACE 4 synchronized surface for M-045.
// END_MODULE_MAP

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
use tauri::{Emitter, Listener, Manager};
use tokio::sync::Mutex;

// START_BLOCK_TYPES

/// C-STREAM-BUDGET: per-session budget caps (spec-pinned defaults,
/// written as plain literals so the values are greppable). 64 MiB
/// cumulative accepted payload bytes; 4096 live sections at open.
pub const STREAM_BUDGET_TOTAL_BYTES: u64 = 67108864;
pub const STREAM_BUDGET_MAX_SECTIONS: usize = 4096;

/// C-STREAM-BUDGET rate bucket: STREAM_BUDGET_RATE_PER_MINUTE sustained
/// patches (one token per STREAM_BUDGET_REFILL_SECS) with a
/// STREAM_BUDGET_RATE_BURST capacity. Decision core:
/// decide_rate_admission.
pub const STREAM_BUDGET_RATE_PER_MINUTE: u32 = 30;
pub const STREAM_BUDGET_RATE_BURST: u32 = 60;
pub const STREAM_BUDGET_REFILL_SECS: u64 = 2;

/// Per-session budget state (C-STREAM-BUDGET). Lives on LiveSession —
/// deliberately NOT on LiveServerState, so the LiveServerState literal
/// in src-tauri/src/main.rs stays untouched — and is rebuilt wholesale
/// by every (re)open, so a same-session resync re-open resets both
/// budgets (the documented recovery for a client that hit a cap
/// honestly). Per-opens quota abuse via fresh opens is an accepted
/// NonGoal.
pub struct StreamBudget {
    /// Cumulative accepted payload bytes: the authoritative document_md
    /// bytes accepted at open plus the GROSS content bytes of every
    /// accepted patch (gross, so replace-with-smaller traffic cannot
    /// cycle the budget).
    pub cumulative_bytes: u64,
    /// Rate bucket: available tokens (one debited per applied patch),
    /// initialized at burst and refilled one token per
    /// STREAM_BUDGET_REFILL_SECS capped at STREAM_BUDGET_RATE_BURST.
    pub credit: f64,
    /// The instant the refill clock was last advanced.
    pub last_refill: Instant,
}

impl StreamBudget {
    /// A fresh budget: zero cumulative bytes, bucket full at burst.
    pub fn at_burst(now: Instant) -> Self {
        Self {
            cumulative_bytes: 0,
            credit: STREAM_BUDGET_RATE_BURST as f64,
            last_refill: now,
        }
    }
}

/// A live streaming session. Tracks document state, sequence numbers
/// for idempotency, and heartbeat timestamp for timeout detection.
pub struct LiveSession {
    pub session_id: String,
    pub extension_id: String,
    pub session_epoch: u64,
    pub last_seq: u64,
    pub revision: u64,
    pub document_md: String,
    /// Ordered sections: (name, markdown content). Order is fixed at
    /// /stream/open and preserved for the whole session. Content is
    /// self-contained markdown (sections carry their own headers).
    pub sections: Vec<(String, String)>,
    /// C-STREAM-BUDGET: per-session resource budgets (cumulative bytes
    /// and patch rate). Fresh at every (re)open; heartbeat and close
    /// never touch it, and a refusal leaves it untouched.
    pub budget: StreamBudget,
    pub active: bool,
    pub last_heartbeat: Instant,
}

/// Shared state for the live server. Thread-safe via tokio::sync::Mutex
/// (async-aware, no blocking across await points).
pub struct LiveServerState<R: tauri::Runtime = tauri::Wry> {
    pub session: Mutex<Option<LiveSession>>,
    pub next_epoch: AtomicU64,
    pub app_handle: tauri::AppHandle<R>,
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
    /// The extension's current secret, presented to prove a rebind is
    /// intentional. Additive wire field: missing deserializes as None.
    pub prior_secret: Option<String>,
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

/// C-SEC-EDIT-TARGETING: the document instance a /ext/context read
/// observed — the rendered instance id plus that instance's generation.
/// Remembered per extension_id when a context response resolves; an
/// /ext/apply must echo the same pair. A None field never matches an
/// apply (fail-closed).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentBinding {
    pub document_id: Option<String>,
    pub document_generation: Option<String>,
}

/// C-SEC-EDIT-TARGETING: last recorded document binding per extension_id.
/// Process-global like CONTEXT_REQUEST_COUNTER (deliberately NOT a
/// LiveServerState field, so the struct literal in src-tauri/src/main.rs
/// stays untouched). A (None, None) entry — recorded when the renderer
/// reported no rendered identity — refuses every apply for that
/// extension until a later context read carries identity.
static EXT_DOCUMENT_BINDINGS: std::sync::LazyLock<std::sync::Mutex<HashMap<String, DocumentBinding>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

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
    /// C-SEC-EDIT-TARGETING: rendered document instance id (None when the
    /// renderer reported no rendered identity).
    pub document_id: Option<String>,
    /// C-SEC-EDIT-TARGETING: that instance's generation (the rendered
    /// tab's documentToken). Absent on an older renderer callback payload
    /// (serde deserializes the missing field as None), which can never
    /// match an apply.
    pub document_generation: Option<String>,
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
    /// C-SEC-EDIT-TARGETING: the document binding from the /ext/context
    /// read. Mandatory by policy — enforced in handle_ext_apply, not by
    /// serde, so a legacy client receives a distinct logged 400 instead
    /// of an extractor rejection.
    pub document_id: Option<String>,
    pub document_generation: Option<String>,
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
    /// Active session with the SAME owner and id — replace state wholesale
    /// (resync path; live-doc v2 recovery for a client stuck on
    /// needs_resync).
    ReplaceSameSession,
    /// Active session with a DIFFERENT id — reject with 409.
    Conflict,
    /// An enabled but different owner must learn no session identifier.
    ForeignOwner,
}

/// Pure core: session identity is scoped to the authenticated extension owner.
pub fn decide_open(existing: Option<&LiveSession>, incoming_session_id: &str, incoming_extension_id: &str) -> OpenDecision {
    match existing {
        None => OpenDecision::FreshOpen,
        Some(s) if !s.active => OpenDecision::FreshOpen,
        Some(s) if s.extension_id != incoming_extension_id => OpenDecision::ForeignOwner,
        Some(s) if s.session_id == incoming_session_id => OpenDecision::ReplaceSameSession,
        Some(_) => OpenDecision::Conflict,
    }
}

/// Decision for an incoming patch against the session rate bucket
/// (C-STREAM-BUDGET). Admit carries the post-decision bucket state the
/// caller writes back deterministically; Exhausted refuses with the
/// bucket untouched.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RateDecision {
    /// Admitted — the bucket was refilled (one token per
    /// STREAM_BUDGET_REFILL_SECS, capped at STREAM_BUDGET_RATE_BURST,
    /// i.e. STREAM_BUDGET_RATE_PER_MINUTE sustained) and debited by
    /// exactly one token.
    Admit {
        credit: f64,
        last_refill: Instant,
    },
    /// Fewer than 1.0 refilled tokens — refuse and change nothing.
    Exhausted,
}

/// Pure core of the patch-rate budget: refill one token per
/// STREAM_BUDGET_REFILL_SECS capped at STREAM_BUDGET_RATE_BURST
/// (STREAM_BUDGET_RATE_PER_MINUTE sustained) and admit iff the refilled
/// total is at least 1.0, returning both the decision and the
/// post-decision bucket state so the caller applies it
/// deterministically. Reads no clock itself and touches no session or
/// HTTP state — tests drive it with synthetic Instants and never sleep.
pub fn decide_rate_admission(current_credit: f64, last_refill: Instant, now: Instant) -> RateDecision {
    let elapsed_secs = now.saturating_duration_since(last_refill).as_secs_f64();
    let refilled = (current_credit + elapsed_secs / STREAM_BUDGET_REFILL_SECS as f64)
        .min(STREAM_BUDGET_RATE_BURST as f64);
    if refilled >= 1.0 {
        RateDecision::Admit {
            credit: refilled - 1.0,
            last_refill: now,
        }
    } else {
        RateDecision::Exhausted
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

/// An authenticated identity snapshot. Never contains the credential itself.
struct StreamIdentity {
    extension_id: String,
    authorization_epoch: u64,
    session_epoch: Option<u64>,
}

impl StreamIdentity {
    fn is_enabled(&self, registry: &super::registry::ExtRegistry) -> bool {
        registry.authorization_epoch(&self.extension_id).ok() == Some(self.authorization_epoch)
    }
    fn owns(&self, session: Option<&LiveSession>) -> bool {
        session.is_some_and(|s| s.extension_id == self.extension_id && Some(s.session_epoch) == self.session_epoch)
    }
}

/// Authenticate a /stream/* request: enabled identity, Bearer possession,
/// and — since C-SEC-EXT-GRANT-BOUND — the stored stream.document grant
/// captured at pairing. Because validate_bearer delegates here, /stream/open
/// and every patch/close/heartbeat state change enforce the grant at this
/// one point, before any session mutation or live event. Owner/epoch
/// fencing itself stays with the callers' stream_gate re-checks.
async fn authenticate_stream<R: tauri::Runtime>(
    headers: &HeaderMap, state: &LiveServerState<R>, extension_id: String, session_epoch: Option<u64>,
) -> Result<StreamIdentity, (StatusCode, String)> {
    let token = extract_bearer(headers)?;
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let authorization_epoch = registry.authorization_epoch(&extension_id)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "extension is not enabled".to_string()))?;
    let id = extension_id.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        if !super::auth::validate_token(&id, &token) { return Ok::<bool, std::convert::Infallible>(false); }
        match super::auth::get_grant(&id) {
            Ok(grant) => {
                if grant_authorizes(grant.as_deref(), RouteCapability::StreamDocument) {
                    Ok(true)
                } else {
                    let reason = if grant.is_none() { "no-stored-grant" } else { "missing-stream.document" };
                    safe_eprintln!("[ExtHost][live_server][BLOCK_STREAM_GRANT_REFUSED id={id} reason={reason}]");
                    Ok(false)
                }
            }
            Err(_) => {
                // A grant read failure fails closed like an absent one.
                safe_eprintln!("[ExtHost][live_server][BLOCK_STREAM_GRANT_REFUSED id={id} reason=grant-unreadable]");
                Ok(false)
            }
        }
    })
    .await
    .unwrap_or_else(|_| Ok(false));
    match outcome {
        Ok(true) => {}
        _ => return Err((StatusCode::UNAUTHORIZED, "invalid token or missing stream.document grant".to_string())),
    }
    Ok(StreamIdentity { extension_id, authorization_epoch, session_epoch })
}

/// Snapshot owner/incarnation before credential I/O; every caller must recheck
/// it and the enabled generation under stream_gate at the mutation boundary.
/// The stored stream.document grant is enforced inside authenticate_stream,
/// so every state change inherits it unchanged.
async fn validate_bearer<R: tauri::Runtime>(
    headers: &HeaderMap, state: &LiveServerState<R>,
) -> Result<StreamIdentity, (StatusCode, String)> {
    extract_bearer(headers)?;
    let (id, epoch) = {
        let guard = state.session.lock().await;
        let session = guard.as_ref().ok_or((StatusCode::CONFLICT, "no active session".to_string()))?;
        (session.extension_id.clone(), session.session_epoch)
    };
    authenticate_stream(headers, state, id, Some(epoch)).await
}

/// The incoming data-route permission classes. Every incoming route requires
/// exactly one capability name from the stored grant approved at pairing —
/// not the live manifest — checked inside authenticate_incoming before any
/// content is returned or any event is emitted; /stream/* routes require
/// StreamDocument from the same stored grant inside authenticate_stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RouteCapability {
    /// stream.document — extension sends streamed documents into Mark's live view.
    StreamDocument,
    /// context.read — read the active tab's markdown/cursor/selection (/ext/context).
    ContextRead,
    /// text.edit — insert/transform/undo the active tab's text (/ext/apply).
    TextEdit,
    /// text.insert — insert text at the active tab's cursor (/ext/text-insert).
    TextInsert,
}

#[cfg_attr(debug_assertions, allow(dead_code))] // grant_phrase is read by pairing_grant_description, which is allow(dead_code) in test builds where the dialog decision arm is compiled out
impl RouteCapability {
    fn name(self) -> &'static str {
        match self {
            RouteCapability::StreamDocument => "stream.document",
            RouteCapability::ContextRead => "context.read",
            RouteCapability::TextEdit => "text.edit",
            RouteCapability::TextInsert => "text.insert",
        }
    }
    fn grant_phrase(self) -> &'static str {
        match self {
            RouteCapability::StreamDocument => "send streamed documents to Mark for display",
            RouteCapability::ContextRead => "read the current text of the active tab",
            RouteCapability::TextEdit => "edit the current text of the active tab",
            RouteCapability::TextInsert => "insert text at the active tab cursor",
        }
    }
    /// Fixed stable order for the pairing dialog grant list and the
    /// canonical stored-grant order.
    fn all() -> [RouteCapability; 4] {
        [RouteCapability::StreamDocument, RouteCapability::ContextRead,
         RouteCapability::TextEdit, RouteCapability::TextInsert]
    }
}

/// Pure grant decision: the stored approved set authorizes a route only
/// when it names the route's capability. No stored grant — the recorded
/// fail-closed migration shape for credentials paired before
/// C-SEC-EXT-GRANT-BOUND — authorizes nothing.
fn grant_authorizes(grant: Option<&[String]>, capability: RouteCapability) -> bool {
    grant.is_some_and(|names| names.iter().any(|name| name == capability.name()))
}

/// The incoming capability names in RouteCapability::all() fixed order —
/// the exact vocabulary a stored grant and a manifest's incoming request
/// are expressed over. Shared with the enable coverage gate in mod.rs.
pub(super) fn incoming_capability_names() -> [&'static str; 4] {
    RouteCapability::all().map(RouteCapability::name)
}

/// Authenticate an incoming data request without holding the registry lock during
/// native credential access. Every incoming data route names the exact
/// RouteCapability class it grants; an identity-less request can select only
/// enabled extensions advertising that capability, and a client-declared
/// identity is accepted only when the token validates AND the credential's
/// stored approved grant — captured at pairing, not the live manifest —
/// names the same capability. Grant absence and grant read failure both
/// fail closed through the 401 path before any content or event.
async fn authenticate_incoming<R: tauri::Runtime>(
    state: &LiveServerState<R>,
    headers: &HeaderMap,
    requested_id: Option<&str>,
    capability: Option<RouteCapability>,
) -> Result<String, (StatusCode, String)> {
    let token = extract_bearer(headers)?;
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let candidates = match requested_id {
        Some(id) => registry.get_manifest(id).map(|m| vec![m]).unwrap_or_default(),
        None => capability.map(|cap| registry.get_enabled(cap.name())).unwrap_or_default(),
    };
    let identity = tokio::task::spawn_blocking(move || {
        candidates.into_iter().find(|manifest| {
            let grant = super::auth::get_grant(&manifest.id).ok();
            super::auth::validate_token(&manifest.id, &token)
                && capability.is_none_or(|cap| grant_authorizes(grant.flatten().as_deref(), cap))
        })
        .map(|manifest| manifest.id)
    }).await.ok().flatten();
    if let Some(id) = identity {
        return Ok(id);
    }
    safe_eprintln!("[ExtHost][live_server][BLOCK_AUTH_FAILED_INCOMING]");
    Err((StatusCode::UNAUTHORIZED, "invalid token or disabled extension".to_string()))
}

// END_BLOCK_AUTH_EXTRACT

// START_BLOCK_HANDLERS

/// Pure description of what a pairing approval grants, rendered for the
/// release pairing dialog. Lists one grant line per RouteCapability the
/// manifest actually declares, in RouteCapability::all() fixed order, and
/// falls back to a single honest line when nothing incoming-route-relevant
/// is declared (or no manifest is registered). It never claims tab read or
/// edit access that the manifest does not state.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub(super) fn pairing_grant_description(
    extension_name: &str,
    extension_id: &str,
    declared: &[String],
) -> String {
    let lines: Vec<String> = RouteCapability::all()
        .into_iter()
        .filter(|cap| declared.iter().any(|name| name == cap.name()))
        .map(|cap| format!("- {}", cap.grant_phrase()))
        .collect();
    let list = if lines.is_empty() {
        "- pair with Mark (its manifest declares no incoming data routes yet)\n".to_string()
    } else {
        lines.into_iter().map(|l| format!("{l}\n")).collect()
    };
    format!(
        "The extension \"{extension_name}\" ({extension_id}) wants to pair with Mark.\n\n\
         If you allow pairing, it will be able to:\n{list}\
         Anything not listed here is not granted to this extension."
    )
}

/// Pure description of what a pairing approval does to an extension that
/// already holds a live credential, rendered for the pairing dialog. It
/// names the extension and states the key replacement; it deliberately
/// lists no capability grants, because a rebind changes no grant set —
/// the same manifest stays in force.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub(super) fn pairing_rebind_description(extension_name: &str, extension_id: &str) -> String {
    format!(
        "The extension \"{extension_name}\" ({extension_id}) is already paired with Mark.\n\n\
         Approving this request replaces its live key: the previous secret stops working \
         immediately, and only the new secret will be accepted afterwards.\n\n\
         Allow this only if you hold the extension's current secret and intend to re-key it."
    )
}

/// POST /ext/pair — pairing initiation.
/// Generates a shared secret, stores it in keychain, returns it to the
/// caller. An id that already holds a stored credential (a rebind) is
/// approved only when the request presents the prior secret, matched
/// constant-time against the stored one; an unproven rebind is refused
/// with the previous key left fully valid. Auto-approval exists only
/// inside the Rust test harness; every ordinary build — debug or
/// release — asks for a user decision through the native dialog.
///
/// C-SEC-EXT-GRANT-BOUND: on approval, the incoming capability set the
/// dialog presented (the registered manifest's names regardless of
/// enabled state — an unregistered id captures the honest empty grant)
/// is stored beside the credential BEFORE the secret, so it is inert
/// until a credential exists. The pair answers paired:true only after
/// the new key verifies through the effective credential path and — on
/// a rebind — the prior token verifiably no longer validates; grant
/// store failure, new-key store failure, old-key survival and an
/// unreadable credential record are distinct logged 500 refusals that
/// never claim success.
pub(super) async fn handle_pair<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    Json(req): Json<PairRequest>,
) -> impl IntoResponse {
    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_PAIR_REQUEST ext_id={} name={} proto={}]",
        req.extension_id,
        req.extension_name,
        req.protocol_version,
    );

    // The declared read is hoisted out of the cfg arms: one peek_manifest
    // — answered regardless of enabled state, unlike get_manifest — feeds
    // both the release dialog description and the shared post-approval
    // grant capture below. An unregistered id yields an empty list, the
    // honest empty grant.
    let declared: Vec<String> = state
        .app_handle
        .state::<super::registry::ExtRegistry>()
        .peek_manifest(&req.extension_id)
        .map(|m| m.capabilities.iter().map(|c| c.name.clone()).collect())
        .unwrap_or_default();

    // Rebind gate: an id that already holds a stored credential is paired
    // only on constant-time proof of the prior secret. The gate runs
    // before — and independently of — any approval decision, so approval
    // can never confer the power to displace an unproven key. A refused
    // rebind stores nothing and leaves the previous token fully valid.
    let stored = match super::auth::get_secret(&req.extension_id) {
        Ok(stored) => stored,
        Err(e) => {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_PAIR_CREDENTIAL_LOOKUP_FAILED ext_id={} reason={e}]",
                req.extension_id,
            );
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "pairing state unavailable"})),
            );
        }
    };
    let is_rebind = stored.is_some();
    let proof_ok = match (&stored, req.prior_secret.as_deref()) {
        (Some(stored), Some(prior)) =>
            super::auth::constant_time_eq(stored.as_bytes(), prior.as_bytes()),
        _ => false,
    };
    if is_rebind && !proof_ok {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_REBIND_REFUSED ext_id={}]",
            req.extension_id,
        );
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error":
                "extension already paired; present the prior secret or disable the extension to reset trust"})),
        );
    }

    // Auto-approval exists ONLY inside the Rust test harness. No ordinary
    // build — debug or release — approves pairing without a user decision.
    #[cfg(test)]
    let approved = {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_AUTO_APPROVE ext_id={} (test harness only)]",
            req.extension_id,
        );
        true
    };
    #[cfg(not(test))]
    let approved = {
        let description = if is_rebind {
            pairing_rebind_description(&req.extension_name, &req.extension_id)
        } else {
            pairing_grant_description(&req.extension_name, &req.extension_id, &declared)
        };
        tokio::task::spawn_blocking(move || {
            use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};
            let result = MessageDialog::new()
                .set_level(MessageLevel::Info)
                .set_title("Mark — Extension Pairing Request")
                .set_description(&description)
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

    // The approved incoming set is exactly what the approval dialog
    // presented: the declared names intersected with RouteCapability::all()
    // in all() fixed order. It is stored BEFORE the secret is generated —
    // inert until a credential exists — so a refused later step leaves a
    // first pairing with no credential behind and a rebind with the prior
    // key fully valid.
    let approved_grant: Vec<String> = RouteCapability::all()
        .into_iter()
        .filter(|cap| declared.iter().any(|name| name == cap.name()))
        .map(|cap| cap.name().to_string())
        .collect();
    if let Err(e) = super::auth::store_grant(&req.extension_id, &approved_grant) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_GRANT_STORE_FAILED ext_id={} reason={e}]",
            req.extension_id,
        );
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "failed to store the approved capability grant"})),
        );
    }

    let secret = super::auth::generate_secret();
    if let Err(e) = super::auth::store_secret(&req.extension_id, &secret) {
        if is_rebind {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_PAIR_NEW_KEY_UNVERIFIED ext_id={}]",
                req.extension_id,
            );
        }
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_SECRET_STORE_FAILED ext_id={} reason={e}]",
            req.extension_id,
        );
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "failed to store pairing secret"})),
        );
    }

    // Honest replace (rebind only): prove the previous token no longer
    // validates before answering paired:true, through a strict read of
    // the credential record the previous key lived in — an unreadable
    // record cannot prove it dead. The single-record credential model
    // makes old-key death structural once the new key verified, so the
    // still-valid branch is defensive; both refusal branches restore the
    // prior credential, so a refused rebind re-keys nothing.
    if is_rebind {
        let id = req.extension_id.clone();
        let prior = req.prior_secret.clone().unwrap_or_default();
        let prior_for_proof = prior.clone();
        let proof = tokio::task::spawn_blocking(move || {
            super::auth::read_credential_record(&id).map(|stored| {
                !stored.is_some_and(|secret| {
                    super::auth::constant_time_eq(secret.as_bytes(), prior_for_proof.as_bytes())
                })
            })
        })
        .await
        .unwrap_or_else(|e| Err(format!("credential worker failed: {e}")));
        let refusal = match proof {
            Ok(true) => None,
            Ok(false) => {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_PAIR_OLD_KEY_STILL_VALID ext_id={}]",
                    req.extension_id,
                );
                Some("pairing replacement could not be verified")
            }
            Err(e) => {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_PAIR_CREDENTIAL_VERIFY_READ_FAILED ext_id={} reason={e}]",
                    req.extension_id,
                );
                Some("pairing replacement could not be verified")
            }
        };
        if let Some(error) = refusal {
            if super::auth::store_secret(&req.extension_id, &prior).is_err() {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_PAIR_REBIND_RESTORE_FAILED ext_id={}]",
                    req.extension_id,
                );
            }
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": error })),
            );
        }
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
pub(super) async fn handle_doc_open<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    headers: HeaderMap,
    Json(req): Json<DocOpenRequest>,
) -> impl IntoResponse {
    let identity = match authenticate_stream(&headers, &state, req.extension_id.clone(), None).await {
        Ok(identity) => identity,
        Err((status, error)) => return (status, Json(serde_json::json!({"error": error}))),
    };
    let extension_id = identity.extension_id.clone();
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let _stream_gate = registry.stream_gate.lock().await;
    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_DOC_OPEN session_id={} title={}]",
        req.session_id,
        req.title,
    );

    let mut session_guard = state.session.lock().await;
    if !identity.is_enabled(&registry) {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"extension is not enabled"})));
    }

    match decide_open(session_guard.as_ref(), &req.session_id, &extension_id) {
        OpenDecision::ForeignOwner => {
            return (StatusCode::CONFLICT, Json(serde_json::json!({"error":"a session is already active"})));
        }
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

    // C-STREAM-BUDGET: over-budget opens are refused before any session
    // or frontend state exists — no LiveSession is built, the previous
    // session (in the Conflict/ForeignOwner-checked window) and the
    // emitted event stream are untouched. Section cap first, on the
    // post-dedup list produced by build_sections_from_init (sections
    // are fixed at open): refusal is strictly "longer than the cap",
    // exactly STREAM_BUDGET_MAX_SECTIONS passes.
    if sections.len() > STREAM_BUDGET_MAX_SECTIONS {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_STREAM_BUDGET_SECTIONS_EXCEEDED sections={} cap={}]",
            sections.len(),
            STREAM_BUDGET_MAX_SECTIONS,
        );
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(serde_json::json!({
                "error": format!(
                    "stream budget exceeded: {} sections would pass STREAM_BUDGET_MAX_SECTIONS {}",
                    sections.len(),
                    STREAM_BUDGET_MAX_SECTIONS,
                )
            })),
        );
    }
    // Byte cap on the authoritative stored document — exactly today's
    // document_md value (rebuild of the sections when non-empty,
    // initial_md otherwise). Refusal is strictly "would push past the
    // cap": exactly STREAM_BUDGET_TOTAL_BYTES passes.
    if document_md.len() as u64 > STREAM_BUDGET_TOTAL_BYTES {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_STREAM_BUDGET_BYTES_EXCEEDED bytes={} cap={}]",
            document_md.len(),
            STREAM_BUDGET_TOTAL_BYTES,
        );
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(serde_json::json!({
                "error": format!(
                    "stream budget exceeded: document bytes {} would pass STREAM_BUDGET_TOTAL_BYTES {}",
                    document_md.len(),
                    STREAM_BUDGET_TOTAL_BYTES,
                )
            })),
        );
    }
    let document_md_for_emit = document_md.clone();

    let session_epoch = state.next_epoch.fetch_add(1, Ordering::Relaxed);
    // C-STREAM-BUDGET: the (re)open charges the authoritative
    // document_md bytes once — every fresh budget (the
    // ReplaceSameSession wholesale rebuild included) starts from the
    // stored document's size with the rate bucket at burst.
    let mut budget = StreamBudget::at_burst(Instant::now());
    budget.cumulative_bytes = document_md.len() as u64;
    let session = LiveSession {
        session_epoch,
        session_id: req.session_id.clone(),
        extension_id,
        last_seq: 0,
        revision: 1,
        document_md,
        sections,
        budget,
        active: true,
        last_heartbeat: Instant::now(),
    };

    *session_guard = Some(session);

    // B5b: emit doc_open to frontend for live rendering. Emits the
    // authoritative document_md (== join of sections), not the raw
    // client-supplied initial_md.
    if let Err(e) = super::live_bridge::emit_doc_open(
        &state.app_handle,
        &req.session_id,
        session_epoch,
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
pub(super) async fn handle_doc_patch<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    headers: HeaderMap,
    Json(req): Json<DocPatchRequest>,
) -> impl IntoResponse {
    let identity = match validate_bearer(&headers, &state).await {
        Ok(identity) => identity,
        Err((status, error)) => return (status, Json(serde_json::json!({"error":error}))),
    };
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let _stream_gate = registry.stream_gate.lock().await;
    let mut session_guard = state.session.lock().await;
    if !identity.is_enabled(&registry) {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"extension is not enabled"})));
    }
    if !identity.owns(session_guard.as_ref()) {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error":"session changed during authentication"})));
    }

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
    // C-STREAM-BUDGET: charged bytes are the GROSS content bytes
    // of every accepted patch — net-growth accounting would be
    // cycle-able by replace-with-smaller traffic. Checked immediately
    // before the apply so a refusal happens with zero mutation: the
    // last valid revision, last_seq, document_md, sections and
    // last_heartbeat stay untouched, no event is emitted and the
    // session stays active.
    let patch_bytes = req.content.len() as u64;
    if session.budget.cumulative_bytes + patch_bytes > STREAM_BUDGET_TOTAL_BYTES {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_STREAM_BUDGET_BYTES_EXCEEDED cumulative={} patch={} cap={} seq={}]",
            session.budget.cumulative_bytes,
            patch_bytes,
            STREAM_BUDGET_TOTAL_BYTES,
            req.seq,
        );
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(serde_json::json!({
                "error": format!(
                    "stream budget exceeded: cumulative bytes {} + patch {} would pass STREAM_BUDGET_TOTAL_BYTES {}",
                    session.budget.cumulative_bytes,
                    patch_bytes,
                    STREAM_BUDGET_TOTAL_BYTES,
                )
            })),
        );
    }
    // C-STREAM-BUDGET: rate bucket — decided here, after the duplicate
    // and needs_resync short-circuits (both stay free: a needs_resync
    // response applies nothing and is not charged), and debited only
    // when the patch is actually applied below, so a 400 unknown
    // op/section (nothing applied) is never charged. On Exhausted the
    // bucket is not debited and nothing else mutates — because last_seq
    // is unchanged, a later retransmit of the refused seq is still a
    // new-seq patch that can be admitted once tokens refill.
    let admitted_bucket = match decide_rate_admission(
        session.budget.credit,
        session.budget.last_refill,
        Instant::now(),
    ) {
        RateDecision::Admit { credit, last_refill } => (credit, last_refill),
        RateDecision::Exhausted => {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_STREAM_BUDGET_RATE_EXCEEDED credit={} burst={} refill_secs={} seq={}]",
                session.budget.credit,
                STREAM_BUDGET_RATE_BURST,
                STREAM_BUDGET_REFILL_SECS,
                req.seq,
            );
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({
                    "error": format!(
                        "stream budget exceeded: patch rate exhausted (STREAM_BUDGET_RATE_PER_MINUTE {}, STREAM_BUDGET_RATE_BURST {}, refill {}s)",
                        STREAM_BUDGET_RATE_PER_MINUTE,
                        STREAM_BUDGET_RATE_BURST,
                        STREAM_BUDGET_REFILL_SECS,
                    )
                })),
            );
        }
    };
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
    // C-STREAM-BUDGET: accepted — write back the debited/refilled
    // bucket and advance the cumulative total by the same gross bytes,
    // atomically with the apply, then the unchanged rebuild flow runs.
    session.budget.credit = admitted_bucket.0;
    session.budget.last_refill = admitted_bucket.1;
    session.budget.cumulative_bytes += patch_bytes;
    session.document_md = rebuild_document_md(&session.sections);
    // END_BLOCK_APPLY_PATCH

    session.last_seq = req.seq;
    session.revision += 1;
    session.last_heartbeat = Instant::now();

    let full_content = session.document_md.clone();
    let section = req.section.clone();
    let revision = session.revision;
    let session_epoch = session.session_epoch;

    // B5b: emit doc_patch to frontend for live rendering.
    if let Err(e) = super::live_bridge::emit_doc_patch(
        &state.app_handle,
        &req.session_id,
        session_epoch,
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
pub(super) async fn handle_doc_close<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    headers: HeaderMap,
    Json(req): Json<DocCloseRequest>,
) -> impl IntoResponse {
    let identity = match validate_bearer(&headers, &state).await {
        Ok(identity) => identity,
        Err((status, error)) => return (status, Json(serde_json::json!({"error":error}))),
    };
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let _stream_gate = registry.stream_gate.lock().await;
    let mut session_guard = state.session.lock().await;
    if !identity.is_enabled(&registry) {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"extension is not enabled"})));
    }
    if !identity.owns(session_guard.as_ref()) {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error":"session changed during authentication"})));
    }

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
    let session_epoch = session.session_epoch;

    // B5b: emit doc_close to frontend.
    if let Err(e) = super::live_bridge::emit_doc_close(
        &state.app_handle,
        &session_id,
        session_epoch,
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
pub(super) async fn handle_heartbeat<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    headers: HeaderMap,
    Json(req): Json<HeartbeatRequest>,
) -> impl IntoResponse {
    let identity = match validate_bearer(&headers, &state).await {
        Ok(identity) => identity,
        Err((status, error)) => return (status, Json(serde_json::json!({"error":error}))),
    };
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let _stream_gate = registry.stream_gate.lock().await;
    let mut session_guard = state.session.lock().await;
    if !identity.is_enabled(&registry) {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"extension is not enabled"})));
    }
    if !identity.owns(session_guard.as_ref()) {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error":"session changed during authentication"})));
    }

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

/// POST /ext/text-insert — permanent truthful refusal.
/// C-EXT-EDIT-PROOF: this route is deprecated and refuses at the source.
/// The unbound `mt::text::op` it used to emit could never reach a document
/// — since C-SEC-EDIT-TARGETING the editor targeting gate drops every
/// unbound event — so the honest answer for an authorized caller is 501
/// Not Implemented with a stable machine reason naming the live
/// alternative: the POST /ext/context read followed by the document-bound
/// POST /ext/apply. The authentication/capability gate still runs first
/// (the 401-class refusals are unchanged), the v1 {"text", "source"}
/// request body still deserializes (request shapes stay frozen per the
/// C-SEC-AUDIT-FIXES disposition), and the refusal emits nothing.
pub(super) async fn handle_text_insert<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    headers: HeaderMap,
    Json(req): Json<TextInsertRequest>,
) -> impl IntoResponse {
    let extension_id = match authenticate_incoming(&state, &headers, None, Some(RouteCapability::TextInsert)).await {
        Ok(id) => id,
        Err((status, message)) => return (status, Json(serde_json::json!({"error": message}))),
    };
    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_TEXT_INSERT_REFUSED ext_id={} len={} source={:?}]",
        extension_id,
        req.text.len(),
        req.source,
    );

    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({"error": "text-insert route deprecated: use POST /ext/context then POST /ext/apply"})),
    )
}

/// POST /ext/context — return current editor state (markdown, cursor, selection).
/// E1a: used by TokMo EditAgent to fetch document context before LLM call.
/// Emits a Tauri event to the frontend, which gathers the Muya editor state
/// and emits a response event back. Uses a oneshot channel with 5s timeout.
pub(super) async fn handle_ext_context<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    headers: HeaderMap,
    Json(req): Json<ExtContextRequest>,
) -> impl IntoResponse {
    if let Err(e) = authenticate_incoming(&state, &headers, Some(&req.extension_id), Some(RouteCapability::ContextRead)).await {
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
            // C-SEC-EDIT-TARGETING: remember the binding this context read
            // carried (a (None, None) pair too — it refuses every apply
            // for this extension until a context read carries rendered
            // identity). A timed-out or channel-closed request records
            // nothing.
            {
                let mut bindings = EXT_DOCUMENT_BINDINGS.lock().unwrap();
                bindings.insert(
                    req.extension_id.clone(),
                    DocumentBinding {
                        document_id: context.document_id.clone(),
                        document_generation: context.document_generation.clone(),
                    },
                );
            }
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
/// C-SEC-EDIT-TARGETING: the request must echo the document binding
/// (document_id + document_generation) recorded by the /ext/context read;
/// the fence runs after the capability gate and before any event.
/// Emits mt::text::op events for each operation; Muya's 1500ms debounce
/// groups rapid operations as a single undo step.
pub(super) async fn handle_ext_apply<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    headers: HeaderMap,
    Json(req): Json<ExtApplyRequest>,
) -> impl IntoResponse {
    if let Err(e) = authenticate_incoming(&state, &headers, Some(&req.extension_id), Some(RouteCapability::TextEdit)).await {
        return (e.0, Json(serde_json::json!({"error": e.1})));
    }

    // C-SEC-EDIT-TARGETING: binding fence. The capability gate above still
    // runs first. The apply must name the exact document instance and
    // generation an earlier /ext/context read recorded for this extension.
    // Missing binding -> distinct logged 400 (legacy clients fail
    // closed); no remembered binding, a remembered None field, or any
    // differing field -> 409. Both rejections happen before any
    // mt::text::op is emitted and never answer applied: true.
    if req.document_id.is_none() || req.document_generation.is_none() {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_EXT_APPLY_MISSING_BINDING ext_id={}]",
            req.extension_id,
        );
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "missing document binding: document_id and document_generation are required"})),
        );
    }

    {
        let bindings = EXT_DOCUMENT_BINDINGS.lock().unwrap();
        let claimed = DocumentBinding {
            document_id: req.document_id.clone(),
            document_generation: req.document_generation.clone(),
        };
        match bindings.get(&req.extension_id) {
            // Must be present, fully Some, and equal — a remembered None
            // field never equals the fully-Some claimed pair.
            Some(bound) if *bound == claimed => {}
            _ => {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_EXT_APPLY_BINDING_MISMATCH ext_id={}]",
                    req.extension_id,
                );
                return (
                    StatusCode::CONFLICT,
                    Json(serde_json::json!({"error": "document binding mismatch; re-read context"})),
                );
            }
        }
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
                    "document_id": req.document_id.clone(),
                    "document_generation": req.document_generation.clone(),
                }),
            ),
            "insert_at_cursor" => (
                "insert",
                serde_json::json!({
                    "text": op.content.clone().unwrap_or_default(),
                    "position": null,
                    "document_id": req.document_id.clone(),
                    "document_generation": req.document_generation.clone(),
                }),
            ),
            "undo" => (
                "undo",
                serde_json::json!({
                    "document_id": req.document_id.clone(),
                    "document_generation": req.document_generation.clone(),
                }),
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
async fn heartbeat_monitor<R: tauri::Runtime>(state: Arc<LiveServerState<R>>) {
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
                let epoch = session.session_epoch;
                session.active = false;

                // B5b: emit doc_close on heartbeat timeout.
                if let Err(e) = super::live_bridge::emit_doc_close(
                    &state.app_handle,
                    &sid,
                    epoch,
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
pub async fn start_live_server<R: tauri::Runtime>(state: Arc<LiveServerState<R>>) -> Result<u16, String> {
    let heartbeat_state = Arc::clone(&state);

    let app = Router::new()
        .route("/ext/pair", post(handle_pair::<R>))
        .route("/ext/text-insert", post(handle_text_insert::<R>))
        .route("/ext/context", post(handle_ext_context::<R>))
        .route("/ext/apply", post(handle_ext_apply::<R>))
        .route("/stream/open", post(handle_doc_open::<R>))
        .route("/stream/patch", post(handle_doc_patch::<R>))
        .route("/stream/close", post(handle_doc_close::<R>))
        .route("/stream/heartbeat", post(handle_heartbeat::<R>));

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
