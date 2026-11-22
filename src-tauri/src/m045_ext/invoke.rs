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
#[derive(Debug, Serialize, Deserialize)]
pub struct InvokeError {
    pub kind: InvokeErrorKind,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum InvokeErrorKind {
    /// Extension does not declare the requested capability.
    CapabilityNotFound,
    /// HTTP request failed (network, timeout, etc.).
    RequestFailed,
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
/// C-EXT-EDIT-PROOF: read the retry-after header (integer seconds) and
/// sleep the honored value clamped to INVOKE_RETRY_MAX_WAIT — a hostile or
/// broken header can never stall the invoke; a missing or unparsable
/// header falls back to the short default pause (itself bounded by the
/// ceiling).
fn retry_after_wait(headers: &reqwest::header::HeaderMap) -> Duration {
    let requested = headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or(Duration::from_millis(INVOKE_DEFAULT_RETRY_WAIT_MS));
    requested.min(INVOKE_RETRY_MAX_WAIT)
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
            message: format!(
                "extension '{}' does not declare capability '{capability}'",
                manifest.id
            ),
        });
    }

    let url = super::manifest::extension_endpoint(&manifest.discovery.base_url, &manifest.invoke.invoke_path)
        .map_err(|e| {
            safe_eprintln!("[ExtHost][invoke][BLOCK_URL_REFUSED id={} reason={e}]", manifest.id);
            InvokeError { kind: InvokeErrorKind::RequestFailed, message: e.to_string() }
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
                message: format!("failed to build HTTP client: {e}"),
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
                        message: format!("failed to parse response JSON: {e}"),
                    }
                })?;
                safe_eprintln!(
                    "[ExtHost][invoke][BLOCK_INVOKE_OK id={} cap={capability}]",
                    manifest.id
                );
                return Ok(json);
            }
            Ok(resp) if resp.status().as_u16() == 503 && attempt == 0 => {
                let wait = retry_after_wait(resp.headers());
                safe_eprintln!(
                    "[ExtHost][invoke][BLOCK_503_RETRY id={} cap={capability} wait_ms={}]",
                    manifest.id,
                    wait.as_millis()
                );
                // Honored, bounded pause before retry.
                tokio::time::sleep(wait).await;
                continue;
            }
            Ok(resp) if resp.status().as_u16() == 429 && attempt == 0 => {
                let wait = retry_after_wait(resp.headers());
                safe_eprintln!(
                    "[ExtHost][invoke][BLOCK_429_RETRY id={} cap={capability} wait_ms={}]",
                    manifest.id,
                    wait.as_millis()
                );
                // Honored, bounded pause; 429 joins the existing
                // single-retry budget (attempt count stays two).
                tokio::time::sleep(wait).await;
                continue;
            }
            Ok(resp) => {
                let status = resp.status();
                let body_text = resp.text().await.unwrap_or_default();
                safe_eprintln!(
                    "[ExtHost][invoke][BLOCK_BAD_STATUS id={} cap={capability} status={status}]",
                    manifest.id
                );
                return Err(InvokeError {
                    kind: InvokeErrorKind::BadStatus,
                    message: format!("HTTP {status}: {body_text}"),
                });
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
                return Err(InvokeError {
                    kind: InvokeErrorKind::RequestFailed,
                    message: format!("request failed: {e}"),
                });
            }
        }
    }

    // Unreachable in practice (loop always returns), but satisfies compiler.
    Err(InvokeError {
        kind: InvokeErrorKind::RequestFailed,
        message: "exhausted retry attempts".to_string(),
    })
}
// END_BLOCK_INVOKE
