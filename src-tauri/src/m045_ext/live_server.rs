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
//   - 2026-11-23 C-EXT-DELIVERY-HONESTY T-002: the honest open — a
//     doc_open whose frontend emission fails refuses instead of answering
//     200 accepted:true over an undelivered stream: the exact pre-open
//     guard value is captured before decide_open (pre_open) and restored
//     verbatim on the refusal (None on a plain fresh open, Some(inactive)
//     after a close/heartbeat-timeout, the replaced session on a resync),
//     the consumed epoch is retired without reuse (never decremented), and
//     the handler answers DOC_OPEN_DELIVERY_REFUSED_STATUS (500 class,
//     the pairing-state-unavailable precedent) with the plain
//     {"error": "live document delivery failed"} body and the distinct
//     BLOCK_DOC_OPEN_DELIVERY_REFUSED log (session_id and reason only —
//     no document content). The refusal sits strictly after the
//     C-STREAM-BUDGET checks, charges no budget (the refused session and
//     its fresh StreamBudget are discarded whole) and runs in-memory under
//     the already-held stream_gate and session lock; the success path from
//     BLOCK_DOC_OPEN_OK through the 200 DocOpenResponse is byte-identical,
//     and doc_patch/doc_close/heartbeat-timeout keep their log-only
//     emit-failure behavior.
//   - 2026-11-23 C-EXT-TRUST-COHERENCE T-006: the rebind dialogs state the
//     grant truth and display the registered name — the stored grant read
//     is hoisted before the approval decision (an unreadable grant is the
//     distinct logged 500 BLOCK_PAIR_GRANT_UNREADABLE, pairing nothing);
//     classify_grant_change (pure; Growth{added}/Equal/Narrow{stopped}
//     over the stored grant vs the declared incoming set, a None stored
//     grant classifying as growth) selects the dialog text (growth keeps
//     the key-replacement statement and enumerates every added
//     capability's grant phrase in all() order; equality states no grant
//     change; narrowing names the accesses that stop being served); the
//     unconditional "a rebind changes no grant set" rebind text is gone;
//     pairing_display_name (pure) yields the registered manifest's name
//     for a registered id with a distinct mismatch flag logged as
//     BLOCK_PAIR_NAME_MISMATCH (log-only — the id anchors authorization,
//     the name is advisory) and the reported name for an unregistered id;
//     the capture rule (declared∩all() in all() order), the denial branch
//     and the old-key-death proof are unchanged.
//   - 2026-11-23 C-EXT-TRUST-COHERENCE T-003: a disable cancels the
//     context reads it owns — the pending /ext/context entry carries its
//     extension id (PendingContextEntry; the main.rs LiveServerState
//     literal keeps its HashMap::new() expression, the value type is
//     inferred), mt_ext_disable drains the disabled extension's entries
//     under its stream_gate block (drain_pending_context,
//     BLOCK_DISABLE_CONTEXT_DRAINED), and the woken handler re-checks
//     the epoch under stream_gate before answering or recording:
//     disabled ⇒ 401 with the fence voice BLOCK_EXT_CONTEXT_CANCELLED
//     and no EXT_DOCUMENT_BINDINGS mutation, a still-enabled channel
//     closure keeps the 500 voice, the timeout leg keeps its 504, and
//     the mt::ext::context_response listener stays byte-unchanged
//     (drained entries' late responses keep being dropped).
//   - 2026-11-23 C-EXT-TRUST-COHERENCE T-002: the incoming data routes
//     carry the disable fence the /stream/* routes already have —
//     authenticate_incoming snapshots the authorization_epoch beside the
//     resolved id (IncomingIdentity, the StreamIdentity contract; an id
//     that went disabled before the snapshot keeps the
//     BLOCK_AUTH_FAILED_INCOMING 401) and every data handler re-checks it
//     under stream_gate immediately after authentication — before any
//     dedup, binding fence, validation or emit — refusing 401 with the
//     plain "extension is not enabled" body and a distinct
//     BLOCK_INCOMING_FENCE_REFUSED (route= and id= fields). The gate is
//     held only across in-memory work (apply: the anchor re-check and each
//     synchronous emit leg behind a fresh per-operation re-check; insert:
//     re-check → refusal; context: re-check → pending registration,
//     released before the 5 s wait); no keyring I/O, no bounded renderer
//     wait — C-EXT-EDIT-PROOF's apply ack budget and dedup coalesce
//     included — and no session mutation joins it, and the lock order
//     (stream_gate, then session, then leaf std Mutexes) is preserved.
//     Emit→ack boundary: an operation emitted under the gate before a
//     disable lands answers applied:true even when the disable completes
//     before the HTTP ack is written — no un-emit exists — while a fenced
//     refusal never answers ok:true or applied:true; a disable crossing
//     the batch stops it at the next operation's re-check with the honest
//     applied prefix in the 409 not-applied shape (the reason names the
//     disable). Composed with C-EXT-EDIT-PROOF: on /ext/apply the fence
//     precedes the request_id dedup (a replay of a disabled extension is
//     refused by the fence, never answered from a recorded verdict), and
//     on /ext/text-insert the fence precedes the honest 501 refusal (a
//     disabled id keeps the plain fence voice, the deprecated-route
//     reason stays the authorized caller's answer).
//   - 2026-11-22 C-EXT-EDIT-PROOF T-006: both directions of Retry-After
//     are honest — the budget rate refusal's 429 (unchanged status, body
//     and zero-mutation semantics) now carries a retry-after header of
//     integer seconds derived from the bucket refill and bounded by
//     STREAM_BUDGET_REFILL_SECS (handle_doc_patch returns a Response so
//     the one header attaches; every other response is byte-identical).
//   - 2026-11-22 C-EXT-EDIT-PROOF T-004: /ext/apply answers by fact —
//     ExtApplyRequest gains the optional request_id idempotency key; the
//     dedup short-circuit consults-and-registers atomically (bounded
//     EXT_APPLY_VERDICTS store, EXT_APPLY_DEDUP_CAP 256, evict-oldest,
//     process-local) after authentication and before the fence: a replay
//     answers the recorded verdict with the additive duplicate:true marker
//     (BLOCK_EXT_APPLY_DUPLICATE) and re-emits nothing, a same-key
//     in-flight retry coalesces onto the pending verdict
//     (BLOCK_EXT_APPLY_COALESCED), a keyless batch mints "apply_{n}" for
//     ack correlation only. The op set is validated before any emission —
//     an unknown op_type refuses the whole batch 400
//     (BLOCK_EXT_APPLY_BATCH_UNKNOWN_OP) with zero events, replacing the
//     skip-with-continue leg; every emitted payload carries the batch
//     "request_id" and its "op_index". The renderer answers through the
//     new additive mt::ext::text_op_ack event {request_id, op_index,
//     applied, reason} (listener registered in start_live_server beside
//     mt::ext::context_response, resolution through resolve_text_op_ack);
//     emission collects verdicts sequentially under ONE per-batch deadline
//     EXT_APPLY_ACK_TIMEOUT_SECS = 5 and answers 200
//     {"applied": true, "operations_count": n} only on a fully ack'd
//     batch, 409 naming the failed index and the applied prefix
//     (BLOCK_EXT_APPLY_NOT_APPLIED), 504 on the timeout or a missing
//     renderer subscriber (BLOCK_EXT_APPLY_ACK_TIMEOUT); the 500
//     emit-failure branch stays. The binding fence, capability gate,
//     /stream/* dedup and budget semantics are untouched.
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
//   C-EXT-DELIVERY-HONESTY: DOC_OPEN_DELIVERY_REFUSED_STATUS and the
//   BLOCK_DOC_OPEN_DELIVERY_REFUSED refusal branch in handle_doc_open
//   (pre_open capture + exact restore, epoch retired without reuse).
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
/// NonGoal. Clone: C-EXT-DELIVERY-HONESTY captures the exact pre-open
/// session (budget included) beside the lock for the delivery refusal.
#[derive(Clone)]
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
/// Clone: C-EXT-DELIVERY-HONESTY — `let pre_open = session_guard.clone();`
/// captures the exact Option<LiveSession> before decide_open so a failed
/// doc_open delivery restores it verbatim.
#[derive(Clone)]
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

/// C-EXT-TRUST-COHERENCE: a pending /ext/context read carries the id of
/// the extension that owns it, so a disable can drain exactly its own
/// reads (drain_pending_context). The LiveServerState literal in
/// src-tauri/src/main.rs keeps its HashMap::new() expression — the value
/// type is inferred here.
pub struct PendingContextEntry {
    pub tx: tokio::sync::oneshot::Sender<ExtContextResponse>,
    pub extension_id: String,
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
    /// C-EXT-TRUST-COHERENCE: a leaf lock taken under stream_gate by the
    /// disable-side drain, never the inverse order.
    pub pending_context: std::sync::Mutex<HashMap<String, PendingContextEntry>>,
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

// --- C-EXT-EDIT-PROOF: the /ext/apply verdict and idempotency channel ---

/// C-EXT-EDIT-PROOF: the per-batch ack deadline for /ext/apply — ONE
/// deadline for the whole batch, not per operation (the same order as the
/// /ext/context round trip).
pub const EXT_APPLY_ACK_TIMEOUT_SECS: u64 = 5;

/// C-EXT-EDIT-PROOF: the bounded process-local dedup capacity — entries
/// beyond this cap evict the oldest insertion; the store is cleared on
/// restart.
pub const EXT_APPLY_DEDUP_CAP: usize = 256;

/// C-EXT-EDIT-PROOF: one renderer verdict for one emitted operation. The
/// reason is a stable content-free class ("targeting_gate_refused",
/// "apply_failed") — never raw error text or document content.
#[derive(Debug, Clone)]
struct TextOpAckVerdict {
    op_index: u64,
    applied: bool,
    reason: String,
}

/// C-EXT-EDIT-PROOF: pending text-op verdicts keyed by the batch request
/// id. The handler creates the (empty) entry when its emission phase starts
/// and removes it when the batch ends; resolve_text_op_ack appends arriving
/// verdicts and silently drops those naming no pending batch (a stale ack
/// carries no content). Process-global like EXT_DOCUMENT_BINDINGS —
/// deliberately NOT a LiveServerState field, so the struct literal in
/// src-tauri/src/main.rs stays untouched.
static EXT_APPLY_ACK_INBOX: std::sync::LazyLock<std::sync::Mutex<HashMap<String, Vec<TextOpAckVerdict>>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

/// A terminal apply verdict: the exact (status, body) the first attempt
/// answered. Replays answer it verbatim with an additive duplicate marker.
type ApplyVerdictSlot = Arc<std::sync::Mutex<Option<(StatusCode, serde_json::Value)>>>;

/// C-EXT-EDIT-PROOF: the bounded process-local dedup of apply verdicts,
/// keyed by extension id plus client request id. The slot is None while the
/// first attempt is pending and holds its terminal verdict afterwards; the
/// consult-or-register step runs atomically under this mutex BEFORE the
/// first emit, so the same-key race is closed by construction. Eviction is
/// oldest-inserted past EXT_APPLY_DEDUP_CAP; the store is cleared on
/// restart — a replay after a restart is not a dedup hit and is answered by
/// the already-recorded-binding fence (documented, not handled).
static EXT_APPLY_VERDICTS: std::sync::LazyLock<std::sync::Mutex<Vec<(String, ApplyVerdictSlot)>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(Vec::new()));

/// C-EXT-EDIT-PROOF: server-minted batch request ids for keyless batches —
/// ack correlation only, no dedup promise.
static APPLY_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(0);

/// C-EXT-EDIT-PROOF: the one resolution entry for the renderer's
/// mt::ext::text_op_ack verdicts. The production listener registered in
/// start_live_server (beside the mt::ext::context_response listener) hands
/// the raw payload here, and the test fixture bridges the same entry. A
/// malformed or unknown-target verdict names no pending batch and is
/// dropped.
pub(super) fn resolve_text_op_ack(payload: &str) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else { return };
    let (Some(request_id), Some(op_index), Some(applied)) = (
        value["request_id"].as_str().map(str::to_string),
        value["op_index"].as_u64(),
        value["applied"].as_bool(),
    ) else { return };
    let reason = value["reason"].as_str().unwrap_or_default().to_string();
    if let Ok(mut inbox) = EXT_APPLY_ACK_INBOX.lock() {
        if let Some(queue) = inbox.get_mut(&request_id) {
            queue.push(TextOpAckVerdict { op_index, applied, reason });
        }
    }
}

/// Take the awaited verdict for one op of a pending batch, if it has
/// arrived.
fn take_ack_verdict(request_id: &str, op_index: u64) -> Option<TextOpAckVerdict> {
    let mut inbox = EXT_APPLY_ACK_INBOX.lock().unwrap();
    let queue = inbox.get_mut(request_id)?;
    let position = queue.iter().position(|verdict| verdict.op_index == op_index)?;
    Some(queue.remove(position))
}

/// Remove the batch's ack inbox entry when the handler leaves the emission
/// phase by any path.
struct AckInboxGuard(String);
impl Drop for AckInboxGuard {
    fn drop(&mut self) {
        EXT_APPLY_ACK_INBOX.lock().unwrap().remove(&self.0);
    }
}

/// Record the terminal verdict of a keyed batch so later replays answer it.
fn record_apply_verdict(slot: &Option<ApplyVerdictSlot>, status: StatusCode, body: &serde_json::Value) {
    if let Some(slot) = slot {
        *slot.lock().unwrap() = Some((status, body.clone()));
    }
}

/// Mark an answered body as the duplicate replay of a recorded verdict.
fn with_duplicate_marker(mut body: serde_json::Value) -> serde_json::Value {
    if let Some(object) = body.as_object_mut() {
        object.insert("duplicate".to_string(), serde_json::Value::Bool(true));
    }
    body
}

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
    /// C-EXT-EDIT-PROOF: the optional client request id — when present it
    /// is the idempotency key (a replay answers the recorded first verdict
    /// with an additive duplicate marker and re-emits nothing; a same-key
    /// in-flight retry coalesces onto the pending verdict). Absent
    /// deserializes None: the server mints "apply_{n}" for ack correlation
    /// only and records no dedup promise, so legacy senders keep working.
    pub request_id: Option<String>,
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
pub(super) enum RouteCapability {
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
    pub(super) fn name(self) -> &'static str {
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
///
/// C-EXT-TRUST-COHERENCE: the resolved id comes back with the
/// authorization epoch snapshotted beside it (IncomingIdentity) so every
/// caller can fence the mutation boundary under stream_gate exactly like
/// the /stream/* handlers — a disable landing in flight after
/// authentication can no longer be emitted through.
#[derive(Debug, Clone)]
struct IncomingIdentity {
    extension_id: String,
    authorization_epoch: u64,
}

impl IncomingIdentity {
    fn is_enabled(&self, registry: &super::registry::ExtRegistry) -> bool {
        registry.authorization_epoch(&self.extension_id).ok() == Some(self.authorization_epoch)
    }
}

async fn authenticate_incoming<R: tauri::Runtime>(
    state: &LiveServerState<R>,
    headers: &HeaderMap,
    requested_id: Option<&str>,
    capability: Option<RouteCapability>,
) -> Result<IncomingIdentity, (StatusCode, String)> {
    let token = extract_bearer(headers)?;
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let candidates = match requested_id {
        Some(id) => registry.get_manifest(id).map(|m| vec![m]).unwrap_or_default(),
        None => capability.map(|cap| registry.get_enabled(cap.name())).unwrap_or_default(),
    };
    // C-EXT-TRUST-COHERENCE: the authorization epoch is snapshotted beside
    // every resolved candidate BEFORE the credential I/O — exactly the
    // StreamIdentity contract — so the caller can fence the mutation
    // boundary under stream_gate. A resolution whose id went disabled
    // before the snapshot keeps today's BLOCK_AUTH_FAILED_INCOMING 401
    // (no snapshot, no identity).
    let epochs: HashMap<String, Option<u64>> = candidates.iter()
        .map(|manifest| (manifest.id.clone(), registry.authorization_epoch(&manifest.id).ok()))
        .collect();
    let identity = tokio::task::spawn_blocking(move || {
        candidates.into_iter().find_map(|manifest| {
            let authorization_epoch = match epochs.get(&manifest.id) {
                Some(Some(epoch)) => *epoch,
                _ => return None,
            };
            let grant = super::auth::get_grant(&manifest.id).ok();
            (super::auth::validate_token(&manifest.id, &token)
                && capability.is_none_or(|cap| grant_authorizes(grant.flatten().as_deref(), cap)))
                .then(|| (manifest.id, authorization_epoch))
        })
    }).await.ok().flatten();
    let (id, authorization_epoch) = match identity {
        Some(pair) => pair,
        None => {
            safe_eprintln!("[ExtHost][live_server][BLOCK_AUTH_FAILED_INCOMING]");
            return Err((StatusCode::UNAUTHORIZED, "invalid token or disabled extension".to_string()));
        }
    };
    Ok(IncomingIdentity { extension_id: id, authorization_epoch })
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

/// C-EXT-TRUST-COHERENCE: the rebind grant-change class, decided from the
/// stored approved grant versus the declared incoming set (capability
/// names). A stored grant of None — the legacy shape — classifies as
/// growth over everything declared. Any addition is growth (the dialog
/// asks first); no additions but stored names beyond the declared set is
/// narrowing; otherwise equality.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum GrantChange {
    /// The incoming set names capabilities the stored grant does not
    /// cover — the added capabilities in RouteCapability::all() order.
    Growth { added: Vec<RouteCapability> },
    /// The declared incoming set matches the stored grant.
    Equal,
    /// The manifest stopped declaring capabilities the stored grant
    /// serves — the stopped capabilities in RouteCapability::all() order.
    Narrow { stopped: Vec<RouteCapability> },
}

/// Pure classifier for the rebind dialog decision.
pub(super) fn classify_grant_change(stored: Option<&[String]>, declared: &[String]) -> GrantChange {
    let stored_names: Vec<&str> = stored.unwrap_or(&[]).iter().map(String::as_str).collect();
    let added: Vec<RouteCapability> = RouteCapability::all()
        .into_iter()
        .filter(|cap| declared.iter().any(|name| name == cap.name()))
        .filter(|cap| !stored_names.contains(&cap.name()))
        .collect();
    if !added.is_empty() {
        return GrantChange::Growth { added };
    }
    let stopped: Vec<RouteCapability> = RouteCapability::all()
        .into_iter()
        .filter(|cap| stored_names.contains(&cap.name()))
        .filter(|cap| !declared.iter().any(|name| name == cap.name()))
        .collect();
    if stopped.is_empty() {
        GrantChange::Equal
    } else {
        GrantChange::Narrow { stopped }
    }
}

/// Pure description of what a pairing approval does to an extension that
/// already holds a live credential, rendered for the pairing dialog.
/// C-EXT-TRUST-COHERENCE: the text states the grant truth — growth keeps
/// the key-replacement statement and enumerates every added capability's
/// grant phrase; equality honestly states no grant change; narrowing
/// names the accesses that stop being served and never claims "no grant
/// change" (today's single unconditional "a rebind changes no grant set"
/// text served all three while the capture overwrote the grant).
#[cfg_attr(debug_assertions, allow(dead_code))]
pub(super) fn pairing_rebind_change_description(
    extension_name: &str,
    extension_id: &str,
    change: &GrantChange,
) -> String {
    let head = format!(
        "The extension \"{extension_name}\" ({extension_id}) is already paired with Mark.\n\n\
         Approving this request replaces its live key: the previous secret stops working \
         immediately, and only the new secret will be accepted afterwards.\n\n"
    );
    match change {
        GrantChange::Growth { added } => {
            let lines: String = added.iter()
                .map(|cap| format!("- {}\n", cap.grant_phrase()))
                .collect();
            format!(
                "{head}Its manifest now also requests access it was not granted before: \
                 approving will additionally allow it to:\n{lines}\
                 Allow this only if you intend to grant the new access and re-key the extension."
            )
        }
        GrantChange::Equal => format!(
            "{head}This rebind causes no grant change: the extension keeps exactly the access \
             its pairing already approved.\n\n\
             Allow this only if you hold the extension's current secret and intend to re-key it."
        ),
        GrantChange::Narrow { stopped } => {
            let lines: String = stopped.iter()
                .map(|cap| format!("- it will no longer be able to {}\n", cap.grant_phrase()))
                .collect();
            format!(
                "{head}Its manifest no longer declares access it was granted before. \
                 After this rebind:\n{lines}\
                 Allow this only if you hold the extension's current secret and intend to re-key it."
            )
        }
    }
}

/// C-EXT-TRUST-COHERENCE: the pairing dialogs display the registered
/// manifest's name for a registered id; a caller-reported name that
/// contradicts it never reaches the user and is a distinct flagged state
/// the caller logs (log-only — the id anchors authorization and the name
/// is advisory, so refusing would only let a lying caller disrupt a
/// legitimate pairing). An unregistered id keeps the reported name —
/// there is nothing to compare against.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub(super) fn pairing_display_name(reported: &str, registered: Option<&str>) -> (String, bool) {
    match registered {
        Some(name) => (name.to_string(), name != reported),
        None => (reported.to_string(), false),
    }
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
    let registered_manifest = state
        .app_handle
        .state::<super::registry::ExtRegistry>()
        .peek_manifest(&req.extension_id);
    let declared: Vec<String> = registered_manifest
        .as_ref()
        .map(|m| m.capabilities.iter().map(|c| c.name.clone()).collect())
        .unwrap_or_default();

    // C-EXT-TRUST-COHERENCE: the dialogs display the registered
    // manifest's name; a contradicting caller-reported name is a distinct
    // logged state (log-only — the id anchors authorization and the name
    // is advisory) and never reaches the user.
    let (display_name, name_mismatch) = pairing_display_name(
        &req.extension_name,
        registered_manifest.as_ref().map(|m| m.name.as_str()),
    );
    if name_mismatch {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_NAME_MISMATCH ext_id={}]",
            req.extension_id,
        );
    }

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

    // C-EXT-TRUST-COHERENCE: the stored grant read is hoisted before the
    // approval decision; an unreadable stored grant is a distinct logged
    // 500 refusal that pairs nothing, raised before any dialog.
    let stored_grant = match super::auth::get_grant(&req.extension_id) {
        Ok(grant) => grant,
        Err(e) => {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_PAIR_GRANT_UNREADABLE ext_id={} reason={e}]",
                req.extension_id,
            );
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "pairing grant state unavailable"})),
            );
        }
    };
    let grant_change = classify_grant_change(stored_grant.as_deref(), &declared);

    // Auto-approval exists ONLY inside the Rust test harness. No ordinary
    // build — debug or release — approves pairing without a user decision.
    #[cfg(test)]
    let approved = {
        let _ = &grant_change;
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_AUTO_APPROVE ext_id={} (test harness only)]",
            req.extension_id,
        );
        true
    };
    #[cfg(not(test))]
    let approved = {
        let description = if is_rebind {
            pairing_rebind_change_description(&display_name, &req.extension_id, &grant_change)
        } else {
            pairing_grant_description(&display_name, &req.extension_id, &declared)
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

    // C-EXT-TRUST-COHERENCE: a successful pairing is proof — the honest
    // replace just established the prior record dead (rebind) or fresh
    // trust (first pair) — so a standing revoke-pending marker clears
    // best-effort after the rebind proof, before the success answer.
    let marker_id = req.extension_id.clone();
    let cleared = tokio::task::spawn_blocking(move || super::auth::clear_revoke_pending(&marker_id))
        .await
        .map_err(|e| format!("credential worker failed: {e}"));
    match cleared {
        Ok(Ok(())) => safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_REVOKE_PENDING_CLEARED ext_id={}]",
            req.extension_id,
        ),
        Ok(Err(e)) | Err(e) => safe_eprintln!(
            "[ExtHost][live_server][BLOCK_PAIR_REVOKE_PENDING_CLEAR_FAILED ext_id={} reason={e}]",
            req.extension_id,
        ),
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

/// C-EXT-DELIVERY-HONESTY: the 500-class refusal status for an open whose
/// frontend emission failed — the file's pairing-state-unavailable /
/// channel-closed precedent voice.
const DOC_OPEN_DELIVERY_REFUSED_STATUS: StatusCode = StatusCode::INTERNAL_SERVER_ERROR;

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

    // C-EXT-DELIVERY-HONESTY: capture the exact pre-open guard value
    // BEFORE any classification or mutation, so a delivery failure can
    // restore it verbatim — None on a plain fresh open, Some(inactive)
    // on a fresh open after a close/heartbeat-timeout, the replaced
    // session on a same-session resync.
    let pre_open = session_guard.clone();

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
    // C-EXT-DELIVERY-HONESTY: a failed emission refuses the open instead
    // of answering accepted:true over an undelivered stream — the exact
    // pre-open guard value is restored verbatim (the rollback is
    // in-memory under the already-held stream_gate and session lock), the
    // consumed epoch is retired without reuse, and the refusal is logged
    // as the distinct BLOCK_DOC_OPEN_DELIVERY_REFUSED state (session_id
    // and reason only — no document content). This branch sits strictly
    // after the C-STREAM-BUDGET refusals and never prints
    // BLOCK_DOC_OPEN_OK; doc_patch/doc_close/heartbeat-timeout keep
    // their log-only emit-failure behavior.
    if let Err(e) = super::live_bridge::emit_doc_open(
        &state.app_handle,
        &req.session_id,
        session_epoch,
        &req.title,
        &document_md_for_emit,
    ) {
        // The existing raw emit-failure state stays, and the distinct
        // refusal state stands beside it (session_id and reason only —
        // no document content).
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_OPEN_EMIT_FAILED reason={e}]"
        );
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_DOC_OPEN_DELIVERY_REFUSED session_id={} reason={e}]",
            req.session_id,
        );
        *session_guard = pre_open;
        return (
            DOC_OPEN_DELIVERY_REFUSED_STATUS,
            Json(serde_json::json!({"error": "live document delivery failed"})),
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
) -> axum::response::Response {
    let identity = match validate_bearer(&headers, &state).await {
        Ok(identity) => identity,
        Err((status, error)) => return (status, Json(serde_json::json!({"error":error}))).into_response(),
    };
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let _stream_gate = registry.stream_gate.lock().await;
    let mut session_guard = state.session.lock().await;
    if !identity.is_enabled(&registry) {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"extension is not enabled"}))).into_response();
    }
    if !identity.owns(session_guard.as_ref()) {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error":"session changed during authentication"}))).into_response();
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
            )
                .into_response();
        }
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "no active session"})),
            )
                .into_response();
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
        )
            .into_response();
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
        )
            .into_response();
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
        )
            .into_response();
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
        )
            .into_response();
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
            // C-EXT-EDIT-PROOF: the honest waiting signal in Mark's own
            // refusal direction — integer seconds derived from the bucket
            // refill, bounded by STREAM_BUDGET_REFILL_SECS. Budgets,
            // statuses, bodies and zero-mutation semantics are unchanged.
            let retry_after = (((1.0 - session.budget.credit).max(0.0)
                * STREAM_BUDGET_REFILL_SECS as f64)
                .ceil() as u64)
                .clamp(1, STREAM_BUDGET_REFILL_SECS);
            let body = serde_json::json!({
                "error": format!(
                    "stream budget exceeded: patch rate exhausted (STREAM_BUDGET_RATE_PER_MINUTE {}, STREAM_BUDGET_RATE_BURST {}, refill {}s)",
                    STREAM_BUDGET_RATE_PER_MINUTE,
                    STREAM_BUDGET_RATE_BURST,
                    STREAM_BUDGET_REFILL_SECS,
                )
            });
            let mut response = (StatusCode::TOO_MANY_REQUESTS, Json(body)).into_response();
            response.headers_mut().insert(
                axum::http::HeaderName::from_static("retry-after"),
                axum::http::HeaderValue::from_str(&retry_after.to_string()).unwrap(),
            );
            return response;
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
        )
            .into_response();
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
        .into_response()
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
    let identity = match authenticate_incoming(&state, &headers, None, Some(RouteCapability::TextInsert)).await {
        Ok(identity) => identity,
        Err((status, message)) => return (status, Json(serde_json::json!({"error": message}))),
    };
    // C-EXT-TRUST-COHERENCE: the disable fence, taken immediately after
    // authentication and before any emit — the same post-authentication
    // re-check the /stream/* handlers run under stream_gate. The gate is
    // held only across the in-memory emit leg.
    let registry = state.app_handle.state::<super::registry::ExtRegistry>();
    let _stream_gate = registry.stream_gate.lock().await;
    if !identity.is_enabled(&registry) {
        safe_eprintln!(
            "[ExtHost][live_server][BLOCK_INCOMING_FENCE_REFUSED route=/ext/text-insert id={}]",
            identity.extension_id,
        );
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "extension is not enabled"})),
        );
    }
    let extension_id = identity.extension_id;
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
    let identity = match authenticate_incoming(&state, &headers, Some(&req.extension_id), Some(RouteCapability::ContextRead)).await {
        Ok(identity) => identity,
        Err((status, message)) => return (status, Json(serde_json::json!({"error": message}))),
    };

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
        // C-EXT-TRUST-COHERENCE: the disable fence, taken immediately
        // after authentication and held only across the in-memory
        // pre-emit section (re-check + pending registration); the gate is
        // released before the 5 s renderer wait below.
        let registry = state.app_handle.state::<super::registry::ExtRegistry>();
        let _stream_gate = registry.stream_gate.lock().await;
        if !identity.is_enabled(&registry) {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_INCOMING_FENCE_REFUSED route=/ext/context id={}]",
                identity.extension_id,
            );
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "extension is not enabled"})),
            );
        }
        let mut pending = state.pending_context.lock().unwrap();
        pending.insert(request_id.clone(), PendingContextEntry {
            tx,
            extension_id: identity.extension_id.clone(),
        });
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
        // C-EXT-TRUST-COHERENCE: content and channel closure both pass the
        // pre-serve re-check under stream_gate first — a disable that
        // cancelled this read (drained entry, closed channel) or landed
        // while the response was in flight is fenced here: 401 with the
        // fence voice, nothing served and nothing recorded into
        // EXT_DOCUMENT_BINDINGS. A still-enabled channel closure keeps
        // the existing 500 voice; the context_response listener stays
        // unchanged and keeps dropping drained entries' late responses.
        Ok(wake) => {
            let registry = state.app_handle.state::<super::registry::ExtRegistry>();
            let _stream_gate = registry.stream_gate.lock().await;
            if !identity.is_enabled(&registry) {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_EXT_CONTEXT_CANCELLED id={}]",
                    identity.extension_id,
                );
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({"error": "extension is not enabled"})),
                );
            }
            match wake {
                Ok(context) => {
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
                Err(_) => {
                    safe_eprintln!(
                        "[ExtHost][live_server][BLOCK_EXT_CONTEXT_CHANNEL_CLOSED]"
                    );
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({"error": "context channel closed unexpectedly"})),
                    )
                }
            }
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

/// C-EXT-TRUST-COHERENCE: wake and discard the disabled extension's
/// pending /ext/context reads. Called from mt_ext_disable inside its
/// existing stream_gate block — the pending map stays a leaf std Mutex
/// with no inverse-order path, and the handlers' 5 s wait never happens
/// under the gate. Dropping each drained sender wakes its handler
/// immediately; the pre-serve re-check then refuses the cancelled read.
/// Returns the drained count for BLOCK_DISABLE_CONTEXT_DRAINED.
pub(super) fn drain_pending_context<R: tauri::Runtime>(
    state: &LiveServerState<R>,
    extension_id: &str,
) -> usize {
    let mut pending = state.pending_context.lock().unwrap();
    let owned: Vec<String> = pending.iter()
        .filter(|(_, entry)| entry.extension_id == extension_id)
        .map(|(request_id, _)| request_id.clone())
        .collect();
    let drained = owned.len();
    for request_id in owned {
        pending.remove(&request_id);
    }
    drained
}

/// POST /ext/apply — apply edit operations to the active editor.
/// E1a: used by TokMo EditAgent to apply LLM-generated edits.
/// C-SEC-EDIT-TARGETING: the request must echo the document binding
/// (document_id + document_generation) recorded by the /ext/context read;
/// the fence runs after the capability gate and before any event.
/// C-EXT-EDIT-PROOF: the handler answers by fact — the dedup short-circuit
/// consults the bounded process-local verdict store after authentication
/// and the disable fence (a replay answers the recorded verdict with an
/// additive duplicate marker, a same-key in-flight retry coalesces); the
/// op set is validated before any emission (an unknown op_type refuses the
/// whole batch 400 with zero events); every emitted payload carries the
/// batch request id and its op index; and the emission collects the
/// renderer's mt::ext::text_op_ack verdicts under one per-batch deadline —
/// 200 {"applied": true, "operations_count": n} only when every operation
/// ack'd applied, 409 naming the failed index and the applied prefix on a
/// nack (a disable crossing the batch stops it with the same shape), 504
/// on the bounded ack timeout. Muya's 1500ms debounce groups rapid
/// operations as a single undo step.
pub(super) async fn handle_ext_apply<R: tauri::Runtime>(
    State(state): State<Arc<LiveServerState<R>>>,
    headers: HeaderMap,
    Json(req): Json<ExtApplyRequest>,
) -> impl IntoResponse {
    let identity = match authenticate_incoming(&state, &headers, Some(&req.extension_id), Some(RouteCapability::TextEdit)).await {
        Ok(identity) => identity,
        Err((status, message)) => return (status, Json(serde_json::json!({"error": message}))),
    };
    // C-EXT-TRUST-COHERENCE: the disable fence anchor — taken immediately
    // after authentication, before the dedup short-circuit, the binding
    // fence, op validation or any emit — so a replay from a disabled
    // extension is refused by the fence, never served a recorded verdict.
    // Composed with C-EXT-EDIT-PROOF's ack-backed loop, one hold cannot
    // span the batch: stream_gate is taken again around every synchronous
    // emit leg with a fresh epoch re-check, and the ack waits run ungated
    // (no bounded renderer wait joins the gate). Emit→ack boundary: an
    // operation emitted under the gate before a disable lands answers
    // applied:true even when the disable completes before the HTTP ack is
    // written — no un-emit exists or is attempted — while a fenced refusal
    // (at the anchor or mid-batch, where the batch stops with the applied
    // prefix) never answers ok:true or applied:true.
    {
        let registry = state.app_handle.state::<super::registry::ExtRegistry>();
        let _stream_gate = registry.stream_gate.lock().await;
        if !identity.is_enabled(&registry) {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_INCOMING_FENCE_REFUSED route=/ext/apply id={}]",
                identity.extension_id,
            );
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "extension is not enabled"})),
            );
        }
    }

    // C-EXT-EDIT-PROOF: the dedup short-circuit — after authentication,
    // before the binding fence. Consult and registration are one atomic
    // step under the dedup mutex, so a same-key race can never double-emit:
    // the second caller always finds the first's slot. A keyless batch
    // mints "apply_{n}" for ack correlation only below and registers no
    // dedup promise.
    let dedup_deadline = Instant::now() + std::time::Duration::from_secs(EXT_APPLY_ACK_TIMEOUT_SECS);
    enum DedupAdmission {
        Replay(ApplyVerdictSlot),
        Fresh(ApplyVerdictSlot),
    }
    let dedup_slot: Option<ApplyVerdictSlot> = if let Some(key) = req.request_id.as_deref() {
        let composite = format!("{}\u{1}{}", req.extension_id, key);
        let admission = {
            let mut store = EXT_APPLY_VERDICTS.lock().unwrap();
            if let Some((_, slot)) = store.iter().find(|(id, _)| *id == composite) {
                DedupAdmission::Replay(slot.clone())
            } else {
                let slot: ApplyVerdictSlot = Arc::new(std::sync::Mutex::new(None));
                if store.len() >= EXT_APPLY_DEDUP_CAP {
                    store.remove(0);
                }
                store.push((composite, slot.clone()));
                DedupAdmission::Fresh(slot)
            }
        };
        match admission {
            DedupAdmission::Replay(slot) => {
                let mut coalesced = false;
                let resolved = loop {
                    let recorded = slot.lock().unwrap().clone();
                    match recorded {
                        Some((status, body)) => {
                            safe_eprintln!(
                                "[ExtHost][live_server][BLOCK_EXT_APPLY_DUPLICATE ext_id={} request_id={key}]",
                                req.extension_id,
                            );
                            break (status, Json(with_duplicate_marker(body)));
                        }
                        None => {
                            if !coalesced {
                                safe_eprintln!(
                                    "[ExtHost][live_server][BLOCK_EXT_APPLY_COALESCED ext_id={} request_id={key}]",
                                    req.extension_id,
                                );
                                coalesced = true;
                            }
                            if Instant::now() >= dedup_deadline {
                                safe_eprintln!(
                                    "[ExtHost][live_server][BLOCK_EXT_APPLY_ACK_TIMEOUT ext_id={} request_id={key} coalesced=true]",
                                    req.extension_id,
                                );
                                break (
                                    StatusCode::GATEWAY_TIMEOUT,
                                    Json(serde_json::json!({
                                        "error": format!(
                                            "apply ack timeout: the renderer did not acknowledge within {}s",
                                            EXT_APPLY_ACK_TIMEOUT_SECS,
                                        )
                                    })),
                                );
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                        }
                    }
                };
                return resolved;
            }
            DedupAdmission::Fresh(slot) => Some(slot),
        }
    } else {
        None
    };

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
        let body = serde_json::json!({"error": "missing document binding: document_id and document_generation are required"});
        record_apply_verdict(&dedup_slot, StatusCode::BAD_REQUEST, &body);
        return (StatusCode::BAD_REQUEST, Json(body));
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
                let body = serde_json::json!({"error": "document binding mismatch; re-read context"});
                record_apply_verdict(&dedup_slot, StatusCode::CONFLICT, &body);
                return (StatusCode::CONFLICT, Json(body));
            }
        }
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_EXT_APPLY ext_id={} ops={}]",
        req.extension_id,
        req.operations.len(),
    );

    // C-EXT-EDIT-PROOF: pre-emit validation — any op_type outside the three
    // known classes refuses the whole batch before any emission (the
    // /stream/patch unknown-op precedent), so operations_count never counts
    // unvalidated operations.
    for (i, op) in req.operations.iter().enumerate() {
        if !matches!(op.op_type.as_str(), "replace_selection" | "insert_at_cursor" | "undo") {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_EXT_APPLY_BATCH_UNKNOWN_OP op_type={} index={}]",
                op.op_type,
                i,
            );
            let body = serde_json::json!({
                "error": format!(
                    "unknown op_type \"{}\" at index {} (expected \"replace_selection\", \"insert_at_cursor\" or \"undo\")",
                    op.op_type,
                    i,
                )
            });
            record_apply_verdict(&dedup_slot, StatusCode::BAD_REQUEST, &body);
            return (StatusCode::BAD_REQUEST, Json(body));
        }
    }

    // C-EXT-EDIT-PROOF: the batch request id — the client-supplied key or
    // the server-minted "apply_{n}" (correlation only, no dedup promise).
    let batch_request_id = req.request_id.clone().unwrap_or_else(|| {
        format!("apply_{}", APPLY_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed))
    });
    EXT_APPLY_ACK_INBOX.lock().unwrap().insert(batch_request_id.clone(), Vec::new());
    let _inbox_guard = AckInboxGuard(batch_request_id.clone());

    // One deadline for the whole batch, not per operation.
    let deadline = Instant::now() + std::time::Duration::from_secs(EXT_APPLY_ACK_TIMEOUT_SECS);
    let mut applied_prefix: usize = 0;

    for (i, op) in req.operations.iter().enumerate() {
        let (op_type, payload) = match op.op_type.as_str() {
            "replace_selection" => (
                "transform",
                serde_json::json!({
                    "text": op.content.clone().unwrap_or_default(),
                    "document_id": req.document_id.clone(),
                    "document_generation": req.document_generation.clone(),
                    "request_id": batch_request_id,
                    "op_index": i,
                }),
            ),
            "insert_at_cursor" => (
                "insert",
                serde_json::json!({
                    "text": op.content.clone().unwrap_or_default(),
                    "position": null,
                    "document_id": req.document_id.clone(),
                    "document_generation": req.document_generation.clone(),
                    "request_id": batch_request_id,
                    "op_index": i,
                }),
            ),
            _ => (
                "undo",
                serde_json::json!({
                    "document_id": req.document_id.clone(),
                    "document_generation": req.document_generation.clone(),
                    "request_id": batch_request_id,
                    "op_index": i,
                }),
            ),
        };

        let event = super::text_ops::TextOpEvent {
            op_type: op_type.to_string(),
            payload,
            extension_id: req.extension_id.clone(),
        };

        // C-EXT-TRUST-COHERENCE: the synchronous emit leg runs under the
        // gate behind a fresh epoch re-check — a disable that landed during
        // an earlier operation's ungated ack wait stops the batch here with
        // the honest applied prefix, so no mt::text::op is emitted after
        // the disable's own completion.
        {
            let registry = state.app_handle.state::<super::registry::ExtRegistry>();
            let _stream_gate = registry.stream_gate.lock().await;
            if !identity.is_enabled(&registry) {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_INCOMING_FENCE_REFUSED route=/ext/apply id={} index={}]",
                    identity.extension_id,
                    i,
                );
                let body = serde_json::json!({
                    "error": format!(
                        "apply refused: operation {} not applied (extension disabled mid-batch); {} of {} earlier operations applied",
                        i,
                        applied_prefix,
                        i,
                    )
                });
                record_apply_verdict(&dedup_slot, StatusCode::CONFLICT, &body);
                return (StatusCode::CONFLICT, Json(body));
            }
            if let Err(e) = state.app_handle.emit("mt::text::op", &event) {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_EXT_APPLY_EMIT_FAILED op={op_type} index={i} reason={e}]"
                );
                let body = serde_json::json!({
                    "error": format!("emit failed for operation {i}: {e}"),
                });
                record_apply_verdict(&dedup_slot, StatusCode::INTERNAL_SERVER_ERROR, &body);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(body),
                );
            }
        }

        // C-EXT-EDIT-PROOF: await this operation's verdict under the shared
        // batch deadline; a missing renderer subscriber manifests as the
        // honest 504 (the /ext/context timeout precedent).
        let verdict = loop {
            if let Some(verdict) = take_ack_verdict(&batch_request_id, i as u64) {
                break verdict;
            }
            if Instant::now() >= deadline {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_EXT_APPLY_ACK_TIMEOUT ext_id={} request_id={} index={}]",
                    req.extension_id,
                    batch_request_id,
                    i,
                );
                let body = serde_json::json!({
                    "error": format!(
                        "apply ack timeout: the renderer did not acknowledge within {}s",
                        EXT_APPLY_ACK_TIMEOUT_SECS,
                    )
                });
                record_apply_verdict(&dedup_slot, StatusCode::GATEWAY_TIMEOUT, &body);
                return (StatusCode::GATEWAY_TIMEOUT, Json(body));
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        };

        if !verdict.applied {
            safe_eprintln!(
                "[ExtHost][live_server][BLOCK_EXT_APPLY_NOT_APPLIED ext_id={} request_id={} index={} reason={}]",
                req.extension_id,
                batch_request_id,
                i,
                verdict.reason,
            );
            let body = serde_json::json!({
                "error": format!(
                    "apply refused: operation {} not applied ({}); {} of {} earlier operations applied",
                    i,
                    verdict.reason,
                    applied_prefix,
                    i,
                )
            });
            record_apply_verdict(&dedup_slot, StatusCode::CONFLICT, &body);
            return (StatusCode::CONFLICT, Json(body));
        }
        applied_prefix += 1;
    }

    safe_eprintln!(
        "[ExtHost][live_server][BLOCK_EXT_APPLY_OK ext_id={} ops={}]",
        req.extension_id,
        req.operations.len(),
    );

    let answer = ExtApplyResponse { applied: true, operations_count: req.operations.len() };
    let body = serde_json::json!(answer);
    record_apply_verdict(&dedup_slot, StatusCode::OK, &body);
    (StatusCode::OK, Json(body))
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
    let ack_listener_handle = ctx_state.app_handle.clone();
    listener_handle.listen("mt::ext::context_response", move |event| {
        let payload_str = event.payload();
        match serde_json::from_str::<ContextCallbackPayload>(payload_str) {
            Ok(resp) => {
                let mut pending = ctx_state.pending_context.lock().unwrap();
                if let Some(tx) = pending.remove(&resp.request_id) {
                    // C-EXT-TRUST-COHERENCE: the pending value gained the
                    // extension id (PendingContextEntry); the listener's
                    // behavior is unchanged — it still drops entries
                    // missing at response time, drained ones included.
                    let _ = tx.tx.send(resp.context);
                }
            }
            Err(e) => {
                safe_eprintln!(
                    "[ExtHost][live_server][BLOCK_CONTEXT_RESPONSE_PARSE_FAILED reason={e}]"
                );
            }
        }
    });

    // C-EXT-EDIT-PROOF: listen for the renderer's text-op verdicts. The
    // ack travels renderer-to-backend like mt::ext::context_response (no
    // shim registration); resolve_text_op_ack buffers the verdict for the
    // awaiting /ext/apply handler.
    ack_listener_handle.listen("mt::ext::text_op_ack", move |event| {
        resolve_text_op_ack(event.payload());
    });

    Ok(port)
}

// END_BLOCK_SERVER_BOOT
