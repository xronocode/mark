// MODULE_CONTRACT
//   PURPOSE: M-045 extension invocation. HTTP POST client for calling
//            extension capabilities over localhost. IPC is HTTP POST,
//            not WebSocket (Decision D1).
//   SCOPE:   Build request, send with timeout + 1 retry on 503,
//            return JSON response. No streaming (v1 scope).
//   DEPENDS: reqwest (HTTP client), manifest::ExtensionManifest.
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B2b;
//            ROADMAP.md Decision D1 (IPC is HTTP POST).
//   STATUS:  Phase-B2b initial.

use crate::m045_ext::manifest::ExtensionManifest;
use serde::{Deserialize, Serialize};
use std::time::Duration;

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
/// Invoke an extension capability via HTTP POST. Retries once on 503
/// (Service Unavailable). Timeout is taken from manifest.invoke.timeout_secs.
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

    let url = format!(
        "{}{}",
        manifest.discovery.base_url.trim_end_matches('/'),
        manifest.invoke.invoke_path
    );

    let timeout = Duration::from_secs(manifest.invoke.timeout_secs);
    let client = reqwest::Client::builder()
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

    // First attempt + one retry on 503.
    for attempt in 0..2u8 {
        let mut req = client.post(&url).json(&body);
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
                safe_eprintln!(
                    "[ExtHost][invoke][BLOCK_503_RETRY id={} cap={capability}]",
                    manifest.id
                );
                // Brief pause before retry.
                tokio::time::sleep(Duration::from_millis(500)).await;
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
                    // Retry once on connection error.
                    tokio::time::sleep(Duration::from_millis(500)).await;
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
