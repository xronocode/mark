// MODULE_CONTRACT
//   PURPOSE: M-045 extension registry. Thread-safe in-memory store of
//            registered extensions with enable/disable/query operations.
//   SCOPE:   State management only. No I/O, no HTTP. Enable/disable
//            persists to m005_prefs via a helper (deferred to B2b wiring).
//   DEPENDS: manifest::ExtensionManifest, std::sync::Mutex.
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B2b.
//   STATUS:  Phase-B2b initial.

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
}

impl ExtRegistry {
    pub fn new() -> Self {
        Self {
            extensions: Mutex::new(HashMap::new()),
        }
    }

    /// Register a discovered extension. Overwrites any previous entry
    /// with the same id (re-discovery replaces stale state).
    pub fn register(
        &self,
        manifest: ExtensionManifest,
        healthy: bool,
    ) -> Result<(), String> {
        let id = manifest.id.clone();
        let state = ExtensionState {
            manifest,
            enabled: false,
            healthy,
        };
        let mut map = self.extensions.lock().map_err(|e| {
            safe_eprintln!("[ExtHost][registry][BLOCK_LOCK_POISONED reason={e}]");
            "registry lock poisoned".to_string()
        })?;
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
