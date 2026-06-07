// MODULE_CONTRACT
//   PURPOSE: M-045 extension manifest parsing and validation.
//            Deserialises extension.json files into ExtensionManifest,
//            enforces schema = "mark.extension/v1", non-empty id,
//            at least one capability.
//   SCOPE:   Parse + validate only. No filesystem I/O — callers
//            (discovery) supply the raw JSON string.
//   DEPENDS: serde, serde_json.
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B2b.
//   STATUS:  Phase-B2b initial.

use serde::{Deserialize, Serialize};

// START_BLOCK_SCHEMA_VERSION
/// The only schema version accepted in v1.
pub const SCHEMA_V1: &str = "mark.extension/v1";
// END_BLOCK_SCHEMA_VERSION

// START_BLOCK_MANIFEST_TYPES
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionManifest {
    /// Must be "mark.extension/v1".
    pub schema: String,
    /// Unique extension identifier, e.g. "com.example.my-ext".
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// SemVer version string.
    pub version: String,
    /// Minimum Mark version required (optional).
    pub min_mark_version: Option<String>,
    /// Protocol versions this extension supports.
    #[serde(default)]
    pub protocol_versions: Vec<u32>,
    /// Capabilities the extension provides.
    pub capabilities: Vec<Capability>,
    /// How Mark discovers the extension's endpoint.
    pub discovery: DiscoveryConfig,
    /// How Mark invokes extension capabilities.
    pub invoke: InvokeConfig,
    /// Optional UI integration config.
    pub ui: Option<UiConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capability {
    /// Capability name, e.g. "text.insert", "text.transform", "stream.document".
    pub name: String,
    /// Capability protocol version.
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryConfig {
    /// Base URL for health probing, e.g. "http://127.0.0.1:9100".
    pub base_url: String,
    /// Health endpoint path (default "/health").
    #[serde(default = "default_health_path")]
    pub health_path: String,
}

fn default_health_path() -> String {
    "/health".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvokeConfig {
    /// Invoke endpoint path (default "/invoke").
    #[serde(default = "default_invoke_path")]
    pub invoke_path: String,
    /// Timeout in seconds (default 30).
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
}

fn default_invoke_path() -> String {
    "/invoke".to_string()
}

fn default_timeout_secs() -> u64 {
    30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    /// Label shown in Mark's extension panel.
    pub panel_label: Option<String>,
    /// Icon path relative to the extension root.
    pub icon: Option<String>,
}
// END_BLOCK_MANIFEST_TYPES

// START_BLOCK_VALIDATION
#[derive(Debug)]
pub struct ManifestError {
    pub message: String,
}

impl std::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ManifestError: {}", self.message)
    }
}

/// Parse and validate an extension.json string.
pub fn parse_manifest(json: &str) -> Result<ExtensionManifest, ManifestError> {
    let manifest: ExtensionManifest = serde_json::from_str(json).map_err(|e| ManifestError {
        message: format!("JSON parse error: {e}"),
    })?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

/// Validate an already-parsed manifest.
pub fn validate_manifest(m: &ExtensionManifest) -> Result<(), ManifestError> {
    if m.schema != SCHEMA_V1 {
        return Err(ManifestError {
            message: format!(
                "unsupported schema '{}', expected '{}'",
                m.schema, SCHEMA_V1
            ),
        });
    }
    if m.id.is_empty() {
        return Err(ManifestError {
            message: "extension id must not be empty".to_string(),
        });
    }
    if m.name.is_empty() {
        return Err(ManifestError {
            message: "extension name must not be empty".to_string(),
        });
    }
    if m.capabilities.is_empty() {
        return Err(ManifestError {
            message: "extension must declare at least one capability".to_string(),
        });
    }
    if m.discovery.base_url.is_empty() {
        return Err(ManifestError {
            message: "discovery.base_url must not be empty".to_string(),
        });
    }

    // Security: base_url must point to loopback (127.0.0.1 or localhost).
    // A malicious extension.json with an external base_url would cause
    // Mark to send the Bearer auth token to an attacker-controlled server
    // during invoke_extension.
    {
        let base = &m.discovery.base_url;
        // Strip scheme (http:// or https://) to isolate the host:port portion.
        let after_scheme = base
            .strip_prefix("http://")
            .or_else(|| base.strip_prefix("https://"))
            .ok_or_else(|| ManifestError {
                message: format!(
                    "discovery.base_url must start with http:// or https://, got '{}'",
                    base
                ),
            })?;
        // Extract host (before any port or path).
        let host = after_scheme
            .split(':')
            .next()
            .unwrap_or("")
            .split('/')
            .next()
            .unwrap_or("");
        match host {
            "127.0.0.1" | "localhost" | "::1" | "[::1]" => {}
            _ => {
                return Err(ManifestError {
                    message: format!(
                        "discovery.base_url host must be 127.0.0.1 or localhost, got '{}'",
                        host
                    ),
                });
            }
        }
    }

    Ok(())
}
// END_BLOCK_VALIDATION
