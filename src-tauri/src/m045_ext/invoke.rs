// FILE: src-tauri/src/m045_ext/invoke.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 extension invocation. HTTP POST client for calling
//            extension capabilities over localhost. IPC is HTTP POST,
//            not WebSocket (Decision D1).
//   SCOPE:   Build request, send with timeout + 1 retry on 503,
//            return JSON response. Validate the final loopback URL before
//            attaching credentials; never use proxies or follow redirects.
//   DEPENDS: reqwest (HTTP client), manifest::ExtensionManifest.
//   LINKS:   .grace/changes/archive/C-SEC-AUDIT-FIXES;
//            .grace/graph/features.xml M-045;
//            .grace/graph/features.xml M-045 (PhaseRef Phase-B2b);
//            ROADMAP.md Decision D1 (IPC is HTTP POST).
//   STATUS:  Phase-B2b initial.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Coverage: GRACE 4 synchronized surface for M-045.
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   - 2026-11-26 integration-acks fix: honest timeout verdicts — a request
//     that times out inside the client's own budget answers the new
//     InvokeErrorKind::RequestTimeout (http_status stays None) with the
//     bounded message naming the timeout, the budget and the UNDETERMINED
//     outcome ("the extension may still apply the request") — the pristine
//     code folded the timeout into RequestFailed's anonymous "request
//     failed: {e}" whose Display carries no timeout hint, leaving the
//     caller unable to tell a clean refusal from a possibly-applied edit.
//     No retry on timeout (re-sending a possibly-applied edit is not this
//     layer's decision); the request path, retry policy on 503/429/connect,
//     idempotency key and success path are unchanged.
//   - 2026-11-23 C-EXT-DELIVERY-HONESTY T-004: bounded, sanitized invoke
//     errors — every InvokeError.message is clamped under the named
//     INVOKE_MESSAGE_MAX_CHARS = 400 by bound_message at every construction
//     site, appending truncation_marker's "[truncated: {original_bytes}
//     bytes withheld]" naming the ORIGINAL size; the extension-controlled
//     BadStatus body is control-neutralized by sanitize_foreign_body (every
//     C0/C1 control character and DEL to U+FFFD) before composition, so no
//     raw control character and no unbounded foreign material reaches any
//     message. InvokeError gains http_status: Option<u16> (Some on
//     BadStatus, None elsewhere; Display mechanically unchanged — the
//     journal line keeps the bounded, sanitized, marker-carrying text).
//     The request path, retry policy, idempotency key and success path are
//     unchanged.
//   - 2026-11-22 C-EXT-EDIT-PROOF T-006: honest retries — invoke_extension
//     generates one idempotency key per logical call (in-tree secret
//     generator) and attaches the idempotency-key header to every attempt;
//     the retry policy reads the retry-after header (integer seconds) on
//     503 and 429 and sleeps the honored value clamped to the bounded
//     ceiling INVOKE_RETRY_MAX_WAIT = 2s (a missing or unparsable header
//     falls back to the short default pause), with 429 joining the
//     existing single-retry budget so the total attempt count stays two;
//     the fixed unconditional sleeps are gone. The loopback-only binding,
//     no-proxy, no-redirect, redirect-not-followed contract, capability
//     check, URL validation and the InvokeRequest wire body are unchanged.
//   - 2026-11-26 guard audit integration f-009 / fe f-011: the honest
//     Retry-After — the header parses integer seconds AND the IMF-fixdate
//     HTTP-date form (retry_after_requested, fixture-pinned); an indicated
//     pause over INVOKE_RETRY_MAX_WAIT is never answered with an early
//     retry (the audited premature-retry defect): the 503/429 becomes the
//     final BadStatus verdict through the shared finalize_bad_status arm.
//     A missing or unparsable header keeps the short default pause; the
//     loopback-only binding, no-proxy/no-redirect contract, idempotency
//     key, capability check and success path are unchanged.
//   - 2026-11-09 C-SEC-AUDIT-FIXES T-005: parsed loopback recipients and no redirect/proxy escape.
// END_CHANGE_SUMMARY

use crate::m045_ext::manifest::ExtensionManifest;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// C-EXT-EDIT-PROOF: the bounded ceiling on any Retry-After-honored wait —
/// a hostile or broken header can never stall the invoke beyond this bound
/// (the same order as the previous fixed pause).
pub const INVOKE_RETRY_MAX_WAIT: Duration = Duration::from_millis(2000);

/// C-EXT-EDIT-PROOF: the short pause when no usable Retry-After arrives —
/// the same short pause the retry loop always used, still clamped below
/// INVOKE_RETRY_MAX_WAIT.
const INVOKE_DEFAULT_RETRY_WAIT_MS: u64 = 500;

// START_BLOCK_INVOKE_ERROR
/// C-EXT-DELIVERY-HONESTY: every InvokeError.message is clamped under this
/// named bound (a few hundred characters), the extension-controlled
/// BadStatus body additionally control-neutralized — no unbounded,
/// control-bearing foreign material reaches the journal or the renderer.
pub const INVOKE_MESSAGE_MAX_CHARS: usize = 400;

/// C-EXT-DELIVERY-HONESTY: the explicit marker naming the withheld
/// ORIGINAL size in bytes.
fn truncation_marker(original: &str) -> String {
    format!("[truncated: {} bytes withheld]", original.len())
}

/// C-EXT-DELIVERY-HONESTY: neutralize every control character in a
/// foreign-controlled body — C0, C1 and DEL (the whole Unicode Cc class)
/// become U+FFFD — before it enters any message, so log injection through
/// control characters is impossible. Sanitization only removes and bounds
/// material; no content-level redaction is attempted.
fn sanitize_foreign_body(body: &str) -> String {
    body.chars()
        .map(|c| if c.is_control() { '\u{FFFD}' } else { c })
        .collect()
}

/// C-EXT-DELIVERY-HONESTY: clamp EVERY InvokeError.message under
/// INVOKE_MESSAGE_MAX_CHARS, appending the truncation marker with the
/// withheld original byte size. Applies at every construction site, so
/// parse-failure and client-build messages stay bounded too.
fn bound_message(message: String) -> String {
    if message.chars().count() <= INVOKE_MESSAGE_MAX_CHARS {
        return message;
    }
    let marker = truncation_marker(&message);
    let keep = INVOKE_MESSAGE_MAX_CHARS.saturating_sub(marker.chars().count());
    let mut bounded: String = message.chars().take(keep).collect();
    bounded.push_str(&marker);
    bounded
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvokeError {
    pub kind: InvokeErrorKind,
    pub message: String,
    /// C-EXT-DELIVERY-HONESTY: the HTTP status for BadStatus, None for
    /// every non-HTTP class. Display is unchanged mechanically — the
    /// renderer mapping in mod.rs composes its BadStatus answer from the
    /// class and this status WITHOUT the message body.
    pub http_status: Option<u16>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum InvokeErrorKind {
    /// Extension does not declare the requested capability.
    CapabilityNotFound,
    /// HTTP request failed (network, timeout, etc.).
    RequestFailed,
    /// C-EXT-DELIVERY-HONESTY: the request timed out inside the client's
    /// own budget — the outcome is UNDETERMINED (the extension may still
    /// receive and apply the request), so this is its own verdict class
    /// naming the timeout, never an anonymous request failure.
    RequestTimeout,
    /// Extension returned a non-2xx status code.
    BadStatus,
    /// Response body could not be parsed as JSON.
    InvalidResponse,
}

impl std::fmt::Display for InvokeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}
// END_BLOCK_INVOKE_ERROR

// START_BLOCK_INVOKE_REQUEST
#[derive(Debug, Serialize)]
struct InvokeRequest<'a> {
    capability: &'a str,
    payload: &'a serde_json::Value,
}
// END_BLOCK_INVOKE_REQUEST

// START_BLOCK_INVOKE
/// Guard audit integration f-009 / fe f-011: read the Retry-After header
/// honestly — integer seconds OR the IMF-fixdate HTTP-date form — and
/// answer with the requested wait relative to `now` (saturated at zero for
/// a date already in the past). None = absent or unparsable, where the
/// caller falls back to the short default pause. The indicated wait is
/// NEVER clamped into an early retry: waits beyond INVOKE_RETRY_MAX_WAIT
/// end the retry budget instead (the extension explicitly asked for a
/// longer pause than the bounded budget can honor).
fn retry_after_wait(headers: &reqwest::header::HeaderMap) -> Option<Duration> {
    let value = headers.get("retry-after")?.to_str().ok()?;
    retry_after_requested(value, std::time::SystemTime::now())
}

/// Pure Retry-After value parser (fixture-pinned): integer seconds first,
/// then the IMF-fixdate HTTP-date; the obsolete RFC 850 / asctime forms
/// fall through to None (the short default pause).
pub(crate) fn retry_after_requested(value: &str, now: std::time::SystemTime) -> Option<Duration> {
    let trimmed = value.trim();
    if let Ok(secs) = trimmed.parse::<u64>() {
        return Some(Duration::from_secs(secs));
    }
    let epoch = http_date_epoch_secs(trimmed)?;
    let now_secs = now
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    let wait_secs = (epoch - now_secs).max(0);
    Some(Duration::from_secs(wait_secs as u64))
}

/// Parse the IMF-fixdate form ("Sun, 06 Nov 1994 08:49:37 GMT") into Unix
/// epoch seconds. Month names are matched case-sensitively per RFC 7231;
/// anything else returns None.
fn http_date_epoch_secs(value: &str) -> Option<i64> {
    const MONTHS: [(&str, u32); 12] = [
        ("Jan", 1), ("Feb", 2), ("Mar", 3), ("Apr", 4), ("May", 5), ("Jun", 6),
        ("Jul", 7), ("Aug", 8), ("Sep", 9), ("Oct", 10), ("Nov", 11), ("Dec", 12),
    ];
    let rest = value.split_once(',').map(|(_, r)| r.trim_start()).unwrap_or(value);
    let mut parts = rest.split_whitespace();
    let day: u32 = parts.next()?.parse().ok()?;
    let month_name = parts.next()?;
    let month = MONTHS.iter().find(|(name, _)| *name == month_name)?.1;
    let year: i64 = parts.next()?.parse().ok()?;
    let mut clock = parts.next()?.split(':');
    let hour: i64 = clock.next()?.parse().ok()?;
    let minute: i64 = clock.next()?.parse().ok()?;
    let second: i64 = clock.next()?.parse().ok()?;
    if !parts.next()?.eq_ignore_ascii_case("gmt") {
        return None;
    }
    Some(days_from_civil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second)
}

/// Howard Hinnant's days_from_civil — days since 1970-01-01 from a civil date.
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m_shift = if m > 2 { m - 3 } else { m + 9 } as i64;
    let doy = (153 * m_shift + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// The final BadStatus verdict for a non-2xx response — shared by the
/// ordinary arm and the f-009 over-ceiling no-retry branch.
async fn finalize_bad_status(
    resp: reqwest::Response,
    manifest: &ExtensionManifest,
    capability: &str,
) -> InvokeError {
    let status = resp.status();
    let body_text = resp.text().await.unwrap_or_default();
    safe_eprintln!(
        "[ExtHost][invoke][BLOCK_BAD_STATUS id={} cap={capability} status={status}]",
        manifest.id
    );
    // C-EXT-DELIVERY-HONESTY: the foreign body is
    // control-neutralized before composition and the whole
    // message clamped under INVOKE_MESSAGE_MAX_CHARS with the
    // original-size truncation marker; http_status lets the
    // renderer mapping answer without any body fragment.
    InvokeError {
        kind: InvokeErrorKind::BadStatus,
        http_status: Some(status.as_u16()),
        message: bound_message(format!(
            "HTTP {status}: {}",
            sanitize_foreign_body(&body_text)
        )),
    }
}

/// Invoke an extension capability via HTTP POST. Retries once on 503 and
/// once on 429 (the same single-retry budget — the total attempt count
/// stays two), honoring a bounded Retry-After wait. C-EXT-EDIT-PROOF: one
/// idempotency-key header value per logical call, reused across the
/// internal retries so a retried request is recognizable as the same
/// operation by the extension. Timeout is taken from
/// manifest.invoke.timeout_secs.
pub async fn invoke_extension(
    manifest: &ExtensionManifest,
    capability: &str,
    payload: serde_json::Value,
    auth_token: Option<&str>,
) -> Result<serde_json::Value, InvokeError> {
    // Verify the extension declares this capability.
    if !manifest
        .capabilities
        .iter()
        .any(|c| c.name == capability)
    {
        safe_eprintln!(
            "[ExtHost][invoke][BLOCK_CAPABILITY_NOT_FOUND id={} cap={capability}]",
            manifest.id
        );
        return Err(InvokeError {
            kind: InvokeErrorKind::CapabilityNotFound,
            http_status: None,
            message: bound_message(format!(
                "extension '{}' does not declare capability '{capability}'",
                manifest.id
            )),
        });
    }

    let url = super::manifest::extension_endpoint(&manifest.discovery.base_url, &manifest.invoke.invoke_path)
        .map_err(|e| {
            safe_eprintln!("[ExtHost][invoke][BLOCK_URL_REFUSED id={} reason={e}]", manifest.id);
            InvokeError { kind: InvokeErrorKind::RequestFailed, http_status: None, message: bound_message(e.to_string()) }
        })?;

    let timeout = Duration::from_secs(manifest.invoke.timeout_secs);
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout)
        .build()
        .map_err(|e| {
            safe_eprintln!(
                "[ExtHost][invoke][BLOCK_CLIENT_BUILD_FAILED id={} reason={e}]",
                manifest.id
            );
            InvokeError {
                kind: InvokeErrorKind::RequestFailed,
                http_status: None,
                message: bound_message(format!("failed to build HTTP client: {e}")),
            }
        })?;

    let body = InvokeRequest {
        capability,
        payload: &payload,
    };

    // C-EXT-EDIT-PROOF: one key per logical call — every attempt of this
    // loop carries the same value.
    let idempotency_key = super::auth::generate_secret();

    // First attempt + one retry on 503 or 429.
    for attempt in 0..2u8 {
        let mut req = client
            .post(url.clone())
            .header("idempotency-key", idempotency_key.as_str())
            .json(&body);
        if let Some(token) = auth_token {
            req = req.bearer_auth(token);
        }

        match req.send().await {
            Ok(resp) if resp.status().is_success() => {
                let json = resp.json::<serde_json::Value>().await.map_err(|e| {
                    safe_eprintln!(
                        "[ExtHost][invoke][BLOCK_RESPONSE_PARSE_FAILED id={} reason={e}]",
                        manifest.id
                    );
                    InvokeError {
                        kind: InvokeErrorKind::InvalidResponse,
                        http_status: None,
                        message: bound_message(format!("failed to parse response JSON: {e}")),
                    }
                })?;
                safe_eprintln!(
                    "[ExtHost][invoke][BLOCK_INVOKE_OK id={} cap={capability}]",
                    manifest.id
                );
                return Ok(json);
            }
            Ok(resp) if resp.status().as_u16() == 503 && attempt == 0 => {
                match retry_after_wait(resp.headers()) {
                    // Honored, bounded pause before retry.
                    Some(wait) if wait <= INVOKE_RETRY_MAX_WAIT => {
                        safe_eprintln!(
                            "[ExtHost][invoke][BLOCK_503_RETRY id={} cap={capability} wait_ms={}]",
                            manifest.id,
                            wait.as_millis()
                        );
                        tokio::time::sleep(wait).await;
                        continue;
                    }
                    // Guard audit f-009: the extension indicated a longer
                    // pause than the bounded budget can honor — retrying
                    // early would arrive before the extension is ready, so
                    // the 503 becomes the final verdict.
                    Some(_) => {
                        return Err(finalize_bad_status(resp, manifest, capability).await);
                    }
                    // Missing or unparsable header: the short default pause.
                    None => {
                        safe_eprintln!(
                            "[ExtHost][invoke][BLOCK_503_RETRY id={} cap={capability} wait_ms={INVOKE_DEFAULT_RETRY_WAIT_MS}]",
                            manifest.id
                        );
                        tokio::time::sleep(Duration::from_millis(INVOKE_DEFAULT_RETRY_WAIT_MS)).await;
                        continue;
                    }
                }
            }
            Ok(resp) if resp.status().as_u16() == 429 && attempt == 0 => {
                match retry_after_wait(resp.headers()) {
                    // Honored, bounded pause; 429 joins the existing
                    // single-retry budget (attempt count stays two).
                    Some(wait) if wait <= INVOKE_RETRY_MAX_WAIT => {
                        safe_eprintln!(
                            "[ExtHost][invoke][BLOCK_429_RETRY id={} cap={capability} wait_ms={}]",
                            manifest.id,
                            wait.as_millis()
                        );
                        tokio::time::sleep(wait).await;
                        continue;
                    }
                    // Guard audit f-009: an indicated pause over the ceiling
                    // is never answered with an early retry — the 429
                    // becomes the final verdict and the caller decides.
                    Some(_) => {
                        return Err(finalize_bad_status(resp, manifest, capability).await);
                    }
                    None => {
                        safe_eprintln!(
                            "[ExtHost][invoke][BLOCK_429_RETRY id={} cap={capability} wait_ms={INVOKE_DEFAULT_RETRY_WAIT_MS}]",
                            manifest.id
                        );
                        tokio::time::sleep(Duration::from_millis(INVOKE_DEFAULT_RETRY_WAIT_MS)).await;
                        continue;
                    }
                }
            }
            Ok(resp) => {
                return Err(finalize_bad_status(resp, manifest, capability).await);
            }
            Err(e) => {
                safe_eprintln!(
                    "[ExtHost][invoke][BLOCK_REQUEST_FAILED id={} cap={capability} attempt={attempt} reason={e}]",
                    manifest.id
                );
                if attempt == 0 && e.is_connect() {
                    // Retry once on connection error with the short
                    // bounded pause.
                    tokio::time::sleep(Duration::from_millis(INVOKE_DEFAULT_RETRY_WAIT_MS)).await;
                    continue;
                }
                // C-EXT-DELIVERY-HONESTY: a timeout is an UNDETERMINED
                // verdict, its own class — the request budget expired while
                // the extension may still receive and apply the request, so
                // the message must name the timeout, the bound and the
                // undetermined outcome instead of the anonymous request
                // failure (whose Display carries no timeout hint). No
                // retry: re-sending a possibly-applied edit is not ours to
                // decide here.
                if e.is_timeout() {
                    safe_eprintln!(
                        "[ExtHost][invoke][BLOCK_REQUEST_TIMEOUT id={} cap={capability} bound_secs={}]",
                        manifest.id,
                        timeout.as_secs()
                    );
                    return Err(InvokeError {
                        kind: InvokeErrorKind::RequestTimeout,
                        http_status: None,
                        message: bound_message(format!(
                            "request timed out after {}s: outcome undetermined (the extension may still apply the request)",
                            timeout.as_secs()
                        )),
                    });
                }
                return Err(InvokeError {
                    kind: InvokeErrorKind::RequestFailed,
                    http_status: None,
                    message: bound_message(format!("request failed: {e}")),
                });
            }
        }
    }

    // Unreachable in practice (loop always returns), but satisfies compiler.
    Err(InvokeError {
        kind: InvokeErrorKind::RequestFailed,
        http_status: None,
        message: bound_message("exhausted retry attempts".to_string()),
    })
}
// END_BLOCK_INVOKE
