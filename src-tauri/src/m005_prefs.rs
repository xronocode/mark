// MODULE_CONTRACT
//   PURPOSE: M-005 mt-prefs lite. Real persistent key/value store +
//            workspace-set command that flips SecurityCtx sandbox. The
//            full 4-store legacy migration (preferences.json +
//            dataCenter.json + keybindings.json + recently-used-
//            documents.json + keychain rename) is deferred to
//            F-PREFS-MIGRATE-V1 — it needs v1 fixtures + per-file
//            field-mapping work that is its own substantial project.
//   SCOPE:   single JSON store at mt_paths::cache_root()/preferences.json.
//            Atomic write (temp+rename) so disk-full mid-write doesn't
//            corrupt the existing file. Corrupt file → empty defaults +
//            stable MT_PREFS_CORRUPT marker.
//   DEPENDS: serde_json (Map<String, Value>), m013b::SecurityCtx
//            (sandbox setter), mt_paths (cache_root resolution).
//   LINKS:   docs/development-plan.xml Phase-B3 step-1;
//            docs/verification-plan.xml V-M-005;
//            src-tauri/src/prefs.rs (Phase-B-pre2 gate; coexists until
//            F-PREFS-MIGRATE-V1 replaces it with migrate_from_legacy()).
//   STATUS:  Phase-B3 step-1 lite shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-1: lite store + workspace-set + corrupt-fallback.

use crate::m013b::SecurityCtx;
use crate::mt_paths;
use serde_json::{Map, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

const PREFS_FILENAME: &str = "preferences.json";
/// Special pref key that mirrors SecurityCtx.sandbox(). Renderer reads
/// this to know which folder is currently open.
pub const KEY_WORKSPACE_ROOT: &str = "workspaceRoot";

/// Phase-B3a step-7: alpha-channel migration markers. mark@alpha sets
/// app_version="alpha" so stable v2 (when it ships) can detect alpha
/// users + rerun missing migration sub-steps via mt_migration.
/// schema_version. Stable v2 ships with schema_version > the alpha's,
/// so any pref store created during alpha gets re-checked on first
/// stable launch.
pub const KEY_MIGRATION_NS: &str = "mt_migration";
/// Current migration schema version. Bumped when a new migration step
/// ships so older alpha installs re-run the missing pieces.
pub const MIGRATION_SCHEMA_VERSION_ALPHA: u32 = 1;
/// App-version channel marker: "alpha" / "stable" / "rc-N".
/// Renderer / updater inspect this to decide UX (show "alpha banner"
/// in title bar, refuse downgrade in F-UPDATER-WIRE-PLUGIN, etc.).
/// allow(dead_code) — current alpha-ship code uses the literal "alpha"
/// inline; this const is the contract surface for B4 stable/RC channels.
#[allow(dead_code)]
pub const KEY_APP_VERSION_CHANNEL: &str = "app_version";

/// Loose-typed prefs store. Schema validation is the renderer's job
/// — backend persists arbitrary JSON value-typed keys. Atomic writes
/// guarantee no half-written file even on disk-full.
pub struct PrefsStore {
    path: PathBuf,
    data: Map<String, Value>,
}

impl PrefsStore {
    /// Resolve the prefs path from mt_paths. Returns None if cache_root
    /// is unavailable (very rare — env::HOME unset).
    fn default_path() -> Option<PathBuf> {
        mt_paths::cache_root().map(|root| root.join(PREFS_FILENAME))
    }

    /// Load from disk. Missing file → empty store (first launch).
    /// Corrupt JSON → empty store + BLOCK_PREFS_CORRUPT marker (matches
    /// V-M-005 scenario-3: "Corrupt prefs file falls back to defaults
    /// and logs a loud marker").
    pub fn load_from(path: PathBuf) -> Self {
        let data = match fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<Value>(&content) {
                Ok(Value::Object(map)) => map,
                Ok(other) => {
                    eprintln!(
                        "[Prefs][load][BLOCK_PREFS_CORRUPT reason=non-object kind={}]",
                        match other {
                            Value::Null => "null",
                            Value::Bool(_) => "bool",
                            Value::Number(_) => "number",
                            Value::String(_) => "string",
                            Value::Array(_) => "array",
                            Value::Object(_) => unreachable!(),
                        }
                    );
                    Map::new()
                }
                Err(e) => {
                    eprintln!("[Prefs][load][BLOCK_PREFS_CORRUPT reason=parse_failed err={e}]");
                    Map::new()
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                eprintln!("[Prefs][load][BLOCK_FIRST_LAUNCH]");
                Map::new()
            }
            Err(e) => {
                eprintln!("[Prefs][load][BLOCK_PREFS_CORRUPT reason=io err={e}]");
                Map::new()
            }
        };
        Self { path, data }
    }

    /// Atomic write: write to .tmp sibling, fsync, rename over the
    /// canonical name. ENOSPC mid-write → original file untouched,
    /// .tmp orphaned (cleaned up on next save attempt by overwrite).
    pub fn save(&self) -> Result<(), std::io::Error> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        let serialized = serde_json::to_vec_pretty(&Value::Object(self.data.clone()))
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&serialized)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, &self.path)?;
        eprintln!(
            "[Prefs][save][BLOCK_PERSISTED bytes={} keys={}]",
            serialized.len(),
            self.data.len()
        );
        Ok(())
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.data.get(key)
    }

    pub fn set(&mut self, key: String, value: Value) {
        self.data.insert(key, value);
    }

    pub fn all(&self) -> &Map<String, Value> {
        &self.data
    }
}

/// Tauri managed-state wrapper around PrefsStore + Mutex for interior
/// mutability across commands.
pub struct PrefsState {
    inner: Mutex<PrefsStore>,
}

impl PrefsState {
    pub fn boot() -> Self {
        let path = PrefsStore::default_path().unwrap_or_else(|| PathBuf::from("preferences.json"));
        let store = PrefsStore::load_from(path);
        let state = Self {
            inner: Mutex::new(store),
        };
        // Phase-B3a step-7: stamp the alpha channel marker on first
        // launch (or refresh it if an older alpha bumped the schema).
        // Stable v2 detects alpha installs via mt_migration.app_version
        // and reruns missing sub-steps based on schema_version.
        state.ensure_migration_marker();
        state
    }

    /// Initialize or upgrade the mt_migration namespace. Idempotent —
    /// running twice on the same store is a no-op when the schema
    /// version already matches.
    fn ensure_migration_marker(&self) {
        let existing = self.get(KEY_MIGRATION_NS);
        let needs_init = match &existing {
            Some(serde_json::Value::Object(map)) => {
                let v = map
                    .get("schema_version")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                v < MIGRATION_SCHEMA_VERSION_ALPHA as u64
            }
            _ => true,
        };
        if needs_init {
            let mut map = match existing {
                Some(serde_json::Value::Object(m)) => m,
                _ => serde_json::Map::new(),
            };
            map.insert(
                "app_version".to_string(),
                serde_json::Value::String("alpha".to_string()),
            );
            map.insert(
                "schema_version".to_string(),
                serde_json::Value::Number(MIGRATION_SCHEMA_VERSION_ALPHA.into()),
            );
            map.insert(
                "marker_written_at".to_string(),
                serde_json::Value::Number(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0)
                        .into(),
                ),
            );
            let _ = self.set(KEY_MIGRATION_NS.to_string(), serde_json::Value::Object(map));
            eprintln!(
                "[Prefs][migrate][BLOCK_MARKER_STAMPED app_version=alpha schema_version={MIGRATION_SCHEMA_VERSION_ALPHA}]"
            );
        }
    }

    /// For tests — load from an explicit path.
    #[cfg(test)]
    pub fn from_path(path: PathBuf) -> Self {
        Self {
            inner: Mutex::new(PrefsStore::load_from(path)),
        }
    }

    pub fn get(&self, key: &str) -> Option<Value> {
        self.inner
            .lock()
            .expect("PrefsState mutex poisoned")
            .get(key)
            .cloned()
    }

    pub fn set(&self, key: String, value: Value) -> Result<(), std::io::Error> {
        let mut guard = self.inner.lock().expect("PrefsState mutex poisoned");
        guard.set(key, value);
        guard.save()
    }

    pub fn all(&self) -> Map<String, Value> {
        self.inner
            .lock()
            .expect("PrefsState mutex poisoned")
            .all()
            .clone()
    }
}

// ─── Tauri commands ─────────────────────────────────────────────────

/// Read a single pref by key.
#[tauri::command]
pub async fn mt_prefs_get(key: String, prefs: State<'_, PrefsState>) -> Result<Value, String> {
    Ok(prefs.get(&key).unwrap_or(Value::Null))
}

/// Write a single pref. Persists synchronously to disk (atomic via
/// .tmp + rename).
#[tauri::command]
pub async fn mt_prefs_set(
    key: String,
    value: Value,
    prefs: State<'_, PrefsState>,
) -> Result<(), String> {
    prefs.set(key, value).map_err(|e| e.to_string())
}

/// Snapshot all prefs as an object. Useful for renderer bootstrap.
#[tauri::command]
pub async fn mt_prefs_get_all(prefs: State<'_, PrefsState>) -> Result<Value, String> {
    Ok(Value::Object(prefs.all()))
}

/// Open a workspace folder. Validates the path, updates SecurityCtx
/// sandbox, persists to prefs[KEY_WORKSPACE_ROOT]. The renderer's
/// "Open Folder" menu calls this.
#[tauri::command]
pub async fn mt_workspace_set(
    path: String,
    sec: State<'_, SecurityCtx>,
    prefs: State<'_, PrefsState>,
) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("workspace path does not exist: {path}"));
    }
    if !p.is_dir() {
        return Err(format!("workspace path is not a directory: {path}"));
    }
    let canonical = fs::canonicalize(&p).map_err(|e| e.to_string())?;
    eprintln!(
        "[Prefs][workspace][BLOCK_WORKSPACE_SET path={}]",
        canonical.display()
    );
    sec.set_sandbox(canonical.clone());
    prefs
        .set(
            KEY_WORKSPACE_ROOT.to_string(),
            Value::String(canonical.display().to_string()),
        )
        .map_err(|e| e.to_string())
}

/// Restore the workspace from prefs at boot. Called from main.rs after
/// PrefsState construction. If KEY_WORKSPACE_ROOT exists and the folder
/// still exists, sets SecurityCtx; otherwise no-op.
pub fn restore_workspace(prefs: &PrefsState, sec: &SecurityCtx) {
    if let Some(Value::String(p)) = prefs.get(KEY_WORKSPACE_ROOT) {
        let path = Path::new(&p);
        if path.is_dir() {
            sec.set_sandbox(path.to_path_buf());
            eprintln!("[Prefs][workspace][BLOCK_WORKSPACE_RESTORED path={p}]");
        } else {
            eprintln!("[Prefs][workspace][BLOCK_WORKSPACE_VANISHED path={p}]");
        }
    } else {
        eprintln!("[Prefs][workspace][BLOCK_WORKSPACE_UNSET]");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    #[test]
    fn first_launch_returns_empty_store() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let state = PrefsState::from_path(path);
        assert!(state.all().is_empty());
        assert!(state.get("anything").is_none());
    }

    #[test]
    fn set_get_roundtrip() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let state = PrefsState::from_path(path);
        state
            .set("theme".to_string(), Value::String("dark".to_string()))
            .unwrap();
        state.set("fontSize".to_string(), json!(14)).unwrap();
        state
            .set(
                "spellchecker".to_string(),
                json!({ "enabled": true, "lang": "en_US" }),
            )
            .unwrap();
        assert_eq!(
            state.get("theme"),
            Some(Value::String("dark".to_string()))
        );
        assert_eq!(state.get("fontSize"), Some(json!(14)));
        assert_eq!(
            state.get("spellchecker"),
            Some(json!({ "enabled": true, "lang": "en_US" }))
        );
    }

    #[test]
    fn persistence_across_reloads() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let state1 = PrefsState::from_path(path.clone());
        state1
            .set("k".to_string(), Value::String("v".to_string()))
            .unwrap();
        // New PrefsState reads the same file.
        let state2 = PrefsState::from_path(path);
        assert_eq!(state2.get("k"), Some(Value::String("v".to_string())));
    }

    #[test]
    fn corrupt_json_falls_back_to_empty() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        std::fs::write(&path, "{ this is not valid JSON").unwrap();
        let state = PrefsState::from_path(path.clone());
        // Corrupt → empty defaults; subsequent set works (overwrites
        // the bad file with a valid one).
        assert!(state.all().is_empty());
        state
            .set("recovery".to_string(), Value::Bool(true))
            .unwrap();
        // File now contains valid JSON.
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("recovery"));
    }

    #[test]
    fn non_object_root_is_corrupt() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        std::fs::write(&path, "[1, 2, 3]").unwrap();
        let state = PrefsState::from_path(path);
        assert!(state.all().is_empty());
    }

    #[test]
    fn save_is_atomic() {
        // Write a value, verify the .tmp sibling is gone after save.
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let tmp = dir.path().join("preferences.json.tmp");
        let state = PrefsState::from_path(path.clone());
        state
            .set("k".to_string(), Value::String("v".to_string()))
            .unwrap();
        assert!(path.exists(), "final file must exist");
        assert!(!tmp.exists(), ".tmp must be renamed away");
    }

    #[test]
    fn restore_workspace_sets_sandbox_when_path_valid() {
        let dir = TempDir::new().unwrap();
        let prefs_path = dir.path().join("preferences.json");
        let workspace = dir.path().to_path_buf();
        let prefs = PrefsState::from_path(prefs_path);
        prefs
            .set(
                KEY_WORKSPACE_ROOT.to_string(),
                Value::String(workspace.display().to_string()),
            )
            .unwrap();
        let sec = SecurityCtx::default();
        restore_workspace(&prefs, &sec);
        assert_eq!(sec.sandbox(), workspace);
    }

    #[test]
    fn restore_workspace_skips_when_path_vanished() {
        let dir = TempDir::new().unwrap();
        let prefs_path = dir.path().join("preferences.json");
        let prefs = PrefsState::from_path(prefs_path);
        prefs
            .set(
                KEY_WORKSPACE_ROOT.to_string(),
                Value::String("/nonexistent-1234567890".to_string()),
            )
            .unwrap();
        let sec = SecurityCtx::default();
        let original = sec.sandbox();
        restore_workspace(&prefs, &sec);
        // Sandbox unchanged when target doesn't exist.
        assert_eq!(sec.sandbox(), original);
    }

    #[test]
    fn migration_marker_stamped_on_fresh_boot() {
        // PrefsState::boot() default_path is system cache — for tests
        // we replicate the boot logic over a tempdir path.
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let state = PrefsState::from_path(path);
        state.ensure_migration_marker();
        let v = state.get(KEY_MIGRATION_NS).unwrap();
        assert_eq!(v["app_version"], json!("alpha"));
        assert_eq!(v["schema_version"], json!(MIGRATION_SCHEMA_VERSION_ALPHA));
        assert!(v["marker_written_at"].is_number());
    }

    #[test]
    fn migration_marker_idempotent_on_same_schema() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let state = PrefsState::from_path(path);
        state.ensure_migration_marker();
        let first = state.get(KEY_MIGRATION_NS).unwrap();
        let first_ts = first["marker_written_at"].as_u64().unwrap();
        // Sleep briefly so a second stamp would have a different ts.
        std::thread::sleep(std::time::Duration::from_millis(1100));
        state.ensure_migration_marker();
        let second = state.get(KEY_MIGRATION_NS).unwrap();
        let second_ts = second["marker_written_at"].as_u64().unwrap();
        assert_eq!(first_ts, second_ts, "idempotent: ts should NOT change");
    }

    #[test]
    fn migration_marker_upgrades_on_bumped_schema() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let state = PrefsState::from_path(path);
        // Plant an old-schema marker.
        let mut map = serde_json::Map::new();
        map.insert("app_version".to_string(), json!("alpha"));
        map.insert("schema_version".to_string(), json!(0u32));
        map.insert("marker_written_at".to_string(), json!(1u64));
        state.set(KEY_MIGRATION_NS.to_string(), Value::Object(map)).unwrap();
        // Boot logic re-runs.
        state.ensure_migration_marker();
        let v = state.get(KEY_MIGRATION_NS).unwrap();
        assert_eq!(v["schema_version"], json!(MIGRATION_SCHEMA_VERSION_ALPHA));
        assert_ne!(v["marker_written_at"], json!(1u64));
    }

    #[test]
    fn restore_workspace_unset_is_noop() {
        let dir = TempDir::new().unwrap();
        let prefs_path = dir.path().join("preferences.json");
        let prefs = PrefsState::from_path(prefs_path);
        let sec = SecurityCtx::default();
        let original = sec.sandbox();
        restore_workspace(&prefs, &sec);
        assert_eq!(sec.sandbox(), original);
    }
}
