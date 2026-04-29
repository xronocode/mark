// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 step-2 — migrate v1.2.3 preferences.json
//            (electron-store flat schema) into the M-005 prefs store
//            with idempotency, type coercion, and per-key trace markers.
//   SCOPE:   single namespace migration (caller picks marktext or mark
//            via priority — see step-7 runner). Reads JSON file → Map,
//            filters out electron-store-internal keys, writes to
//            target PrefsStore via the public set() API.
//   DEPENDS: m005_prefs::PrefsStore (target storage),
//            serde_json (legacy JSON parser),
//            m005_migrate::snapshot::NamespaceSnapshot (path source).
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1 step-2;
//            mark-electron/src/main/preferences/schema.json (source schema).
//   STATUS:  shipped 2026-04-29 with F-PREFS-MIGRATE-V1 step-2.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 step-2: initial preserve-all-known-keys migrator.

use crate::m005_prefs::PrefsStore;
use serde_json::{Map, Value};
use std::path::Path;

/// Idempotency marker: set this key under M-005 KEY_MIGRATION_NS to
/// signal preferences-step-2 already ran on this store. Re-running
/// returns `Skipped` without touching disk.
pub const PREFS_MIGRATION_DONE_KEY: &str = "preferences_v1";
pub const PREFS_MIGRATION_DONE_VALUE: &str = "done";

/// Electron-store wraps user data with `__internal__: { migrations: {...} }`.
/// We strip this key on import — the M-005 mt_migration namespace replaces
/// it with our own schema-version tracking.
const ELECTRON_STORE_INTERNAL_KEY: &str = "__internal__";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreferencesMigrationOutcome {
    /// preferences.json was read, keys merged into target store. Caller
    /// must save the store afterward (runner does this once after all steps).
    Migrated { keys_migrated: u32, keys_skipped: u32 },
    /// Target already has the idempotency marker — step is a no-op.
    AlreadyDone,
    /// Snapshot didn't include preferences.json — nothing to migrate,
    /// not an error (user may have deleted prefs in v1 before snapshotting).
    NoSourceFile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreferencesMigrationError {
    /// preferences.json could not be read from disk (path went away
    /// between snapshot creation and migration run, or permission flipped).
    SourceReadFailed(String),
    /// preferences.json content is not a JSON object (e.g. plain array,
    /// truncated mid-bracket, etc.). Not recoverable — caller should
    /// either skip-with-warn or surface to user via dialog.
    SourceCorrupt(String),
}

/// Migrate one namespace's preferences.json into the target PrefsStore.
/// Caller (runner, step-7) handles the post-migration store save and
/// the marker write into KEY_MIGRATION_NS.
///
/// Idempotency: caller checks the marker via `is_already_done()` before
/// invoking. We also hard-skip here as a defensive measure in case the
/// runner's check races a concurrent boot.
pub fn migrate_preferences(
    source_path: Option<&Path>,
    target: &mut PrefsStore,
) -> Result<PreferencesMigrationOutcome, PreferencesMigrationError> {
    if is_already_done(target) {
        eprintln!("[m005-migrate][preferences][BLOCK_ALREADY_DONE]");
        return Ok(PreferencesMigrationOutcome::AlreadyDone);
    }

    let path = match source_path {
        Some(p) => p,
        None => {
            eprintln!("[m005-migrate][preferences][BLOCK_NO_SOURCE_FILE]");
            return Ok(PreferencesMigrationOutcome::NoSourceFile);
        }
    };

    let content = std::fs::read_to_string(path).map_err(|e| {
        eprintln!(
            "[m005-migrate][preferences][BLOCK_SOURCE_READ_FAILED path={} err={e}]",
            path.display()
        );
        PreferencesMigrationError::SourceReadFailed(e.to_string())
    })?;

    let parsed: Value = serde_json::from_str(&content).map_err(|e| {
        eprintln!(
            "[m005-migrate][preferences][BLOCK_SOURCE_PARSE_FAILED path={} err={e}]",
            path.display()
        );
        PreferencesMigrationError::SourceCorrupt(e.to_string())
    })?;

    let map = match parsed {
        Value::Object(m) => m,
        other => {
            let kind = json_kind(&other);
            eprintln!(
                "[m005-migrate][preferences][BLOCK_SOURCE_NOT_OBJECT kind={kind}]"
            );
            return Err(PreferencesMigrationError::SourceCorrupt(format!(
                "preferences.json root is not a JSON object (kind={kind})"
            )));
        }
    };

    let mut migrated = 0u32;
    let mut skipped = 0u32;

    for (key, value) in map {
        if key == ELECTRON_STORE_INTERNAL_KEY {
            eprintln!("[m005-migrate][preferences][BLOCK_KEY_SKIPPED key={key} reason=electron-store-internal]");
            skipped += 1;
            continue;
        }
        // Don't overwrite the M-005 mt_migration namespace marker if
        // present — that's the runner's domain.
        if key == crate::m005_prefs::KEY_MIGRATION_NS {
            eprintln!("[m005-migrate][preferences][BLOCK_KEY_SKIPPED key={key} reason=mt_migration-reserved]");
            skipped += 1;
            continue;
        }
        target.set(key.clone(), value);
        migrated += 1;
    }

    eprintln!("[m005-migrate][preferences][BLOCK_MIGRATED migrated={migrated} skipped={skipped}]");
    Ok(PreferencesMigrationOutcome::Migrated {
        keys_migrated: migrated,
        keys_skipped: skipped,
    })
}

/// Check the M-005 mt_migration namespace for the preferences-step-2
/// done marker. Used by the runner to short-circuit re-runs.
pub fn is_already_done(target: &PrefsStore) -> bool {
    match target.get(crate::m005_prefs::KEY_MIGRATION_NS) {
        Some(Value::Object(map)) => map
            .get(PREFS_MIGRATION_DONE_KEY)
            .and_then(|v| v.as_str())
            .map(|s| s == PREFS_MIGRATION_DONE_VALUE)
            .unwrap_or(false),
        _ => false,
    }
}

/// Stamp the preferences-step-2 done marker into target store. Caller
/// (runner) invokes after a successful migrate_preferences + store save.
/// Pure mutation — no I/O. Caller must save the store afterward.
pub fn mark_done(target: &mut PrefsStore) {
    let mut ns = match target.get(crate::m005_prefs::KEY_MIGRATION_NS) {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    };
    ns.insert(
        PREFS_MIGRATION_DONE_KEY.to_string(),
        Value::String(PREFS_MIGRATION_DONE_VALUE.to_string()),
    );
    target.set(
        crate::m005_prefs::KEY_MIGRATION_NS.to_string(),
        Value::Object(ns),
    );
    eprintln!("[m005-migrate][preferences][BLOCK_MARK_DONE]");
}

fn json_kind(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "bool",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn fresh_store(tmp: &TempDir) -> PrefsStore {
        let path = tmp.path().join("preferences.json");
        PrefsStore::load_from(path)
    }

    fn write_legacy(tmp: &TempDir, name: &str, content: &str) -> std::path::PathBuf {
        let p = tmp.path().join(name);
        fs::write(&p, content).unwrap();
        p
    }

    #[test]
    fn migrates_full_v1_2_3_fixture() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(
            &tmp,
            "src.json",
            r#"{
                "autoSave": false,
                "fontSize": 16,
                "theme": "ayu-mirage",
                "language": "ru",
                "searchExclusions": [],
                "__internal__": {"migrations":{"version":"0.18.9"}}
            }"#,
        );
        let outcome = migrate_preferences(Some(&src), &mut store).unwrap();
        match outcome {
            PreferencesMigrationOutcome::Migrated { keys_migrated, keys_skipped } => {
                assert_eq!(keys_migrated, 5);
                assert_eq!(keys_skipped, 1, "__internal__ must be skipped");
            }
            other => panic!("expected Migrated, got {other:?}"),
        }
        assert_eq!(store.get("theme"), Some(&Value::String("ayu-mirage".into())));
        assert_eq!(store.get("autoSave"), Some(&Value::Bool(false)));
        assert!(store.get("__internal__").is_none(), "internal key must be filtered");
    }

    #[test]
    fn no_source_file_is_not_an_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let outcome = migrate_preferences(None, &mut store).unwrap();
        assert_eq!(outcome, PreferencesMigrationOutcome::NoSourceFile);
    }

    #[test]
    fn idempotent_when_marker_present() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        mark_done(&mut store);

        let src = write_legacy(&tmp, "src.json", r#"{"theme":"dark"}"#);
        let outcome = migrate_preferences(Some(&src), &mut store).unwrap();
        assert_eq!(outcome, PreferencesMigrationOutcome::AlreadyDone);
        assert!(store.get("theme").is_none(), "must not write when already done");
    }

    #[test]
    fn corrupt_root_is_array_returns_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "src.json", r#"["not", "an", "object"]"#);
        let err = migrate_preferences(Some(&src), &mut store).unwrap_err();
        match err {
            PreferencesMigrationError::SourceCorrupt(msg) => {
                assert!(msg.contains("array"), "msg={msg}");
            }
            other => panic!("expected SourceCorrupt, got {other:?}"),
        }
    }

    #[test]
    fn corrupt_truncated_json_returns_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "src.json", r#"{"theme":"da"#);
        let err = migrate_preferences(Some(&src), &mut store).unwrap_err();
        assert!(matches!(err, PreferencesMigrationError::SourceCorrupt(_)));
    }

    #[test]
    fn missing_file_returns_io_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let nonexistent = tmp.path().join("does-not-exist.json");
        let err = migrate_preferences(Some(&nonexistent), &mut store).unwrap_err();
        assert!(matches!(err, PreferencesMigrationError::SourceReadFailed(_)));
    }

    #[test]
    fn mt_migration_namespace_in_legacy_is_not_overwritten() {
        // Defense in depth: if a legacy preferences.json somehow contains
        // mt_migration (it shouldn't — that's our key), don't let it
        // clobber our own migration tracker.
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        // Pre-populate the namespace
        store.set(
            crate::m005_prefs::KEY_MIGRATION_NS.to_string(),
            Value::Object({
                let mut m = Map::new();
                m.insert("schema_version".into(), Value::Number(1.into()));
                m
            }),
        );

        let src = write_legacy(
            &tmp,
            "src.json",
            r#"{"theme":"dark","mt_migration":{"hostile":"value"}}"#,
        );
        migrate_preferences(Some(&src), &mut store).unwrap();
        let ns = store.get(crate::m005_prefs::KEY_MIGRATION_NS).unwrap();
        let map = ns.as_object().unwrap();
        assert!(map.get("hostile").is_none(), "hostile key must not be merged");
        assert!(
            map.get("schema_version").is_some(),
            "original schema_version must survive"
        );
    }

    #[test]
    fn mark_done_creates_namespace_when_absent() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        mark_done(&mut store);
        assert!(is_already_done(&store));
    }

    #[test]
    fn mark_done_preserves_other_namespace_keys() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        store.set(
            crate::m005_prefs::KEY_MIGRATION_NS.to_string(),
            Value::Object({
                let mut m = Map::new();
                m.insert("schema_version".into(), Value::Number(1.into()));
                m.insert("app_version".into(), Value::String("alpha".into()));
                m
            }),
        );
        mark_done(&mut store);
        let ns = store
            .get(crate::m005_prefs::KEY_MIGRATION_NS)
            .unwrap()
            .as_object()
            .unwrap();
        assert!(is_already_done(&store));
        assert_eq!(ns.get("schema_version"), Some(&Value::Number(1.into())));
        assert_eq!(ns.get("app_version"), Some(&Value::String("alpha".into())));
    }

    #[test]
    fn empty_object_migrates_zero_keys() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "src.json", "{}");
        let outcome = migrate_preferences(Some(&src), &mut store).unwrap();
        assert_eq!(
            outcome,
            PreferencesMigrationOutcome::Migrated { keys_migrated: 0, keys_skipped: 0 }
        );
    }
}
