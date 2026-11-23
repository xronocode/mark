// FILE: src-tauri/src/m045_ext/registry.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 extension registry. Thread-safe in-memory store of
//            registered extensions with enable/disable/query operations.
//   SCOPE:   State management only. No I/O, no HTTP. Enable/disable
//            persists to m005_prefs via a helper (deferred to B2b wiring).
//   DEPENDS: manifest::ExtensionManifest, std::sync::Mutex, tokio::sync::Mutex.
//   CHANGE_SUMMARY: 2026-11-23 C-EXT-GALLERY-STATE T-002: register preserves the enabled flag the stored entry holds unless the incoming manifest grew its incoming request past the stored manifest's over the live_server::incoming_capability_names vocabulary — growth resets the flag into the #298 ext_enable_reapproval_required re-approval path (BLOCK_REGISTER_GROWTH_RESET); a fresh id keeps enabled: false; the authorization_epoch fetch_add stays unconditional on every registration; get_manifest/peek_manifest/enable/disable/list/get_enabled/set_health/authorization_epoch unchanged. 2026-11-21 C-SEC-EXT-GRANT-BOUND: peek_manifest answers the stored manifest regardless of enabled state for the pairing-time grant capture and the enable coverage gate; get_manifest/enable/disable/register/authorization_epoch unchanged. 2026-11-11 C-SEC-STREAM-AUTH: serialize stream mutations and stamp enabled identities across credential I/O.
//   LINKS:   .grace/graph/features.xml M-045;
//            .grace/graph/features.xml M-045 (PhaseRef Phase-B2b.)
//   STATUS:  Phase-B2b initial.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Coverage: GRACE 4 synchronized surface for M-045.
// END_MODULE_MAP

use crate::m045_ext::manifest::ExtensionManifest;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

// START_BLOCK_EXTENSION_STATE
/// Internal state for a registered extension.
pub struct ExtensionState {
    pub manifest: ExtensionManifest,
    pub enabled: bool,
    pub healthy: bool,
    authorization_epoch: u64,
}
// END_BLOCK_EXTENSION_STATE

// START_BLOCK_EXTENSION_INFO
/// Serializable summary returned to the frontend via Tauri commands.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub install_url: Option<String>,
    pub enabled: bool,
    pub healthy: bool,
    pub capabilities: Vec<String>,
}

impl From<&ExtensionState> for ExtensionInfo {
    fn from(state: &ExtensionState) -> Self {
        Self {
            id: state.manifest.id.clone(),
            name: state.manifest.name.clone(),
            version: state.manifest.version.clone(),
            description: state.manifest.description.clone(),
            install_url: state.manifest.install_url.clone(),
            enabled: state.enabled,
            healthy: state.healthy,
            capabilities: state
                .manifest
                .capabilities
                .iter()
                .map(|c| c.name.clone())
                .collect(),
        }
    }
}
// END_BLOCK_EXTENSION_INFO

// START_BLOCK_REGISTRY
/// Thread-safe extension registry. Managed as Tauri state via
/// `.manage(ExtRegistry::new())`.
pub struct ExtRegistry {
    extensions: Mutex<HashMap<String, ExtensionState>>,
    next_authorization_epoch: std::sync::atomic::AtomicU64,
    /// Lock order: stream_gate, then live session. Native credential I/O holds neither.
    pub(super) stream_gate: tokio::sync::Mutex<()>,
}

impl ExtRegistry {
    pub fn new() -> Self {
        Self {
            extensions: Mutex::new(HashMap::new()),
            next_authorization_epoch: std::sync::atomic::AtomicU64::new(1),
            stream_gate: tokio::sync::Mutex::new(()),
        }
    }

    /// Register a discovered extension. C-EXT-GALLERY-STATE: re-discovery
    /// overwrites the previous entry with the same id but preserves the
    /// enabled flag that entry already holds unless the incoming manifest
    /// grew its incoming request past the stored manifest's — growth
    /// resets the flag into the #298 ext_enable_reapproval_required
    /// re-approval path (BLOCK_REGISTER_GROWTH_RESET). A fresh id keeps
    /// the disabled default, and every registration keeps bumping the
    /// authorization epoch so in-flight credentials stay fenced.
    pub fn register(
        &self,
        manifest: ExtensionManifest,
        healthy: bool,
    ) -> Result<(), String> {
        let id = manifest.id.clone();
        let mut map = self.extensions.lock().map_err(|e| {
            safe_eprintln!("[ExtHost][registry][BLOCK_LOCK_POISONED reason={e}]");
            "registry lock poisoned".to_string()
        })?;
        // The preservation decision compares only the incoming capability
        // vocabulary (the same set the #298 enable coverage gate
        // consults), computed under the existing extensions lock with no
        // new lock. Shrinking or equal incoming sets preserve the flag;
        // non-incoming capability changes never affect the decision.
        let preserved_enabled = match map.get(&id) {
            Some(stored) => {
                let incoming = super::live_server::incoming_capability_names();
                let grew = manifest.capabilities.iter().map(|c| c.name.as_str()).any(|name| {
                    incoming.contains(&name)
                        && !stored.manifest.capabilities.iter().any(|c| c.name == name)
                });
                if grew {
                    safe_eprintln!(
                        "[ExtHost][registry][BLOCK_REGISTER_GROWTH_RESET id={id}]"
                    );
                    false
                } else {
                    stored.enabled
                }
            }
            None => false,
        };
        let state = ExtensionState {
            manifest,
            enabled: preserved_enabled,
            healthy,
            authorization_epoch: self.next_authorization_epoch.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        };
        safe_eprintln!("[ExtHost][registry][BLOCK_REGISTER id={id} healthy={healthy}]");
        map.insert(id, state);
        Ok(())
    }

    /// Enable an extension by id.
    pub fn enable(&self, id: &str) -> Result<(), String> {
        let mut map = self.extensions.lock().map_err(|e| {
            safe_eprintln!("[ExtHost][registry][BLOCK_LOCK_POISONED reason={e}]");
            "registry lock poisoned".to_string()
        })?;
        match map.get_mut(id) {
            Some(state) => {
                state.enabled = true;
                state.authorization_epoch = self.next_authorization_epoch.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                safe_eprintln!("[ExtHost][registry][BLOCK_ENABLE id={id}]");
                Ok(())
            }
            None => {
                safe_eprintln!("[ExtHost][registry][BLOCK_ENABLE_NOT_FOUND id={id}]");
                Err(format!("extension '{id}' not found"))
            }
        }
    }

    /// Disable an extension by id.
    pub fn disable(&self, id: &str) -> Result<(), String> {
        let mut map = self.extensions.lock().map_err(|e| {
            safe_eprintln!("[ExtHost][registry][BLOCK_LOCK_POISONED reason={e}]");
            "registry lock poisoned".to_string()
        })?;
        match map.get_mut(id) {
            Some(state) => {
                state.enabled = false;
                state.authorization_epoch = self.next_authorization_epoch.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                safe_eprintln!("[ExtHost][registry][BLOCK_DISABLE id={id}]");
                Ok(())
            }
            None => {
                safe_eprintln!("[ExtHost][registry][BLOCK_DISABLE_NOT_FOUND id={id}]");
                Err(format!("extension '{id}' not found"))
            }
        }
    }

    #[allow(dead_code)]
    pub fn set_health(&self, id: &str, healthy: bool) -> Result<(), String> {
        let mut map = self.extensions.lock().map_err(|e| {
            safe_eprintln!("[ExtHost][registry][BLOCK_LOCK_POISONED reason={e}]");
            "registry lock poisoned".to_string()
        })?;
        match map.get_mut(id) {
            Some(state) => {
                state.healthy = healthy;
                Ok(())
            }
            None => Err(format!("extension '{id}' not found")),
        }
    }

    /// List all registered extensions as serializable info structs.
    pub fn list(&self) -> Vec<ExtensionInfo> {
        match self.extensions.lock() {
            Ok(map) => map.values().map(ExtensionInfo::from).collect(),
            Err(e) => {
                safe_eprintln!("[ExtHost][registry][BLOCK_LIST_LOCK_POISONED reason={e}]");
                Vec::new()
            }
        }
    }

    #[allow(dead_code)]
    pub fn get_enabled(&self, capability: &str) -> Vec<ExtensionManifest> {
        match self.extensions.lock() {
            Ok(map) => map
                .values()
                .filter(|s| {
                    s.enabled && s.capabilities_contain(capability)
                })
                .map(|s| s.manifest.clone())
                .collect(),
            Err(e) => {
                safe_eprintln!(
                    "[ExtHost][registry][BLOCK_GET_ENABLED_LOCK_POISONED reason={e}]"
                );
                Vec::new()
            }
        }
    }

    /// Snapshot the enabled identity generation, invalidated on registration,
    /// enable or disable so credentials checked in flight cannot cross revocation.
    pub(super) fn authorization_epoch(&self, id: &str) -> Result<u64, String> {
        let map = self.extensions.lock().map_err(|_| "registry lock poisoned".to_string())?;
        map.get(id).filter(|state| state.enabled).map(|state| state.authorization_epoch)
            .ok_or_else(|| "extension is not enabled".to_string())
    }

    /// C-EXT-GALLERY-STATE: test-only observation of the stored epoch
    /// without the enabled filter — the no-op toggle pins need the raw
    /// stored value to prove that a duplicate enable/disable bumped no
    /// epoch. Test plumbing on the peek_manifest precedent; the
    /// production authorization_epoch above keeps answering only for
    /// enabled ids.
    #[cfg(test)]
    pub(super) fn stored_authorization_epoch(&self, id: &str) -> Option<u64> {
        let map = self.extensions.lock().ok()?;
        map.get(id).map(|state| state.authorization_epoch)
    }

    /// Get the manifest for a specific extension by id (must be enabled).
    pub fn get_manifest(&self, id: &str) -> Result<ExtensionManifest, String> {
        let map = self.extensions.lock().map_err(|e| {
            safe_eprintln!("[ExtHost][registry][BLOCK_LOCK_POISONED reason={e}]");
            "registry lock poisoned".to_string()
        })?;
        match map.get(id) {
            Some(state) if state.enabled => Ok(state.manifest.clone()),
            Some(_) => Err(format!("extension '{id}' is disabled")),
            None => Err(format!("extension '{id}' not found")),
        }
    }

    /// Read the stored manifest regardless of enabled state. Its single
    /// purpose is C-SEC-EXT-GRANT-BOUND's pairing-time grant capture (and
    /// the enable coverage gate) for a disabled-but-registered extension —
    /// get_manifest keeps refusing disabled ids, and an unregistered id
    /// answers None so pairing stores the honest empty grant.
    pub fn peek_manifest(&self, id: &str) -> Option<ExtensionManifest> {
        let map = self.extensions.lock().ok()?;
        map.get(id).map(|state| state.manifest.clone())
    }
}
// END_BLOCK_REGISTRY

// START_BLOCK_EXTENSION_STATE_HELPERS
impl ExtensionState {
    fn capabilities_contain(&self, capability: &str) -> bool {
        self.manifest
            .capabilities
            .iter()
            .any(|c| c.name == capability)
    }
}
// END_BLOCK_EXTENSION_STATE_HELPERS
