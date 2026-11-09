// FILE: src-tauri/src/m045_ext/manifest.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 extension manifest parsing and validation.
//            Deserialises extension.json files into ExtensionManifest,
//            enforces schema = "mark.extension/v1", non-empty id,
//            at least one capability.
//   SCOPE:   Parse + validate only. No filesystem I/O — callers
//            (discovery) supply the raw JSON string.
//   DEPENDS: serde, serde_json, already-locked url parser. Parsed recipients
//            must be loopback, contain no userinfo and retain the base origin.
//   LINKS:   .grace/changes/archive/C-SEC-AUDIT-FIXES;
//            .grace/graph/features.xml M-045;
//            .grace/graph/features.xml M-045 (PhaseRef Phase-B2b.)
//   STATUS:  Phase-B2b initial.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Coverage: GRACE 4 synchronized surface for M-045.
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   - 2026-11-09 C-SEC-AUDIT-FIXES T-005: parsed loopback recipients and no redirect/proxy escape.
// END_CHANGE_SUMMARY

use serde::{Deserialize, Serialize};
use url::{Host, Url};

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
    /// Human-readable description of the extension.
    #[serde(default)]
    pub description: Option<String>,
    /// URL where users can download/install this extension.
    #[serde(default)]
    pub install_url: Option<String>,
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

    validate_loopback_url(&m.discovery.base_url)?;

    Ok(())
}

/// Parse the actual recipient, rejecting userinfo and every non-loopback host.
/// Url normalizes empty userinfo away, so also reject its explicit authority
/// marker. Host and port decisions always use the parsed representation.
pub fn validate_loopback_url(raw: &str) -> Result<Url, ManifestError> {
    let invalid = |message: &str| ManifestError { message: message.to_string() };
    let parsed = Url::parse(raw).map_err(|_| invalid("invalid extension URL; expected http:// or https://"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(invalid("extension URL must start with http:// or https://"));
    }
    let authority = raw.split_once("://").map(|(_, rest)| {
        rest.split(['/', '\\', '?', '#']).next().unwrap_or("")
    }).ok_or_else(|| invalid("extension URL must contain an HTTP authority"))?;
    if !parsed.username().is_empty() || parsed.password().is_some() || authority.contains('@') {
        return Err(invalid("extension URL must not contain userinfo"));
    }
    match parsed.host() {
        Some(Host::Domain("localhost")) => {},
        Some(Host::Ipv4(ip)) if ip == std::net::Ipv4Addr::LOCALHOST => {},
        Some(Host::Ipv6(ip)) if ip == std::net::Ipv6Addr::LOCALHOST => {},
        _ => return Err(invalid("extension URL host must be 127.0.0.1 or localhost or [::1]")),
    }
    Ok(parsed)
}

/// Preserve the protocol's concatenation while proving it cannot change origin.
pub fn extension_endpoint(base_url: &str, path: &str) -> Result<Url, ManifestError> {
    let base = validate_loopback_url(base_url)?;
    let endpoint = validate_loopback_url(&format!("{}{}", base_url.trim_end_matches('/'), path))?;
    if endpoint.origin() != base.origin() {
        return Err(ManifestError { message: "extension endpoint must preserve its base origin".to_string() });
    }
    Ok(endpoint)
}

// END_BLOCK_VALIDATION
