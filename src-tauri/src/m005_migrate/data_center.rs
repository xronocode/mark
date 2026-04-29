// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 step-3 — migrate v1.2.3 dataCenter.json
//            (image-uploader runtime configs: imageFolderPath,
//            screenshotFolderPath, webImages, cloudImages, currentUploader,
//            imageBed) into the M-005 prefs store as TOP-LEVEL keys so
//            variant-(a) renderer code (fileSystem.js / editor.vue /
//            uploader/index.vue) reads them via the same names without
//            rewrites.
//   SCOPE:   single namespace migration (caller picks priority via
//            runner step-7). Same shape as preferences.rs but distinct
//            idempotency marker (data_center_v1) and a finite known
//            keylist for collision detection against preferences.
//   DEPENDS: m005_prefs::PrefsStore, serde_json.
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1 step-3;
//            mark-electron/src/main/dataCenter/schema.json (source schema).
//   STATUS:  shipped 2026-04-29 with F-PREFS-MIGRATE-V1 step-3.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 step-3: initial top-level-merge migrator.

use crate::m005_prefs::PrefsStore;
use serde_json::{Map, Value};
use std::path::Path;

pub const DATA_CENTER_MIGRATION_DONE_KEY: &str = "data_center_v1";
pub const DATA_CENTER_MIGRATION_DONE_VALUE: &str = "done";

/// v1.2.3 dataCenter.json schema — the 6 keys the renderer expects.
/// Forward-compat: unknown keys are still migrated (dropped only if
/// present in BOTH preferences.json and dataCenter.json — collision).
const KNOWN_DATA_CENTER_KEYS: &[&str] = &[
    "imageFolderPath",
    "screenshotFolderPath",
    "webImages",
    "cloudImages",
    "currentUploader",
    "imageBed",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataCenterMigrationOutcome {
    Migrated {
        keys_migrated: u32,
        keys_collided: u32,
        keys_unknown: u32,
    },
    AlreadyDone,
    NoSourceFile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataCenterMigrationError {
    SourceReadFailed(String),
    SourceCorrupt(String),
}

pub fn migrate_data_center(
    source_path: Option<&Path>,
    target: &mut PrefsStore,
) -> Result<DataCenterMigrationOutcome, DataCenterMigrationError> {
    if is_already_done(target) {
        eprintln!("[m005-migrate][data_center][BLOCK_ALREADY_DONE]");
        return Ok(DataCenterMigrationOutcome::AlreadyDone);
    }

    let path = match source_path {
        Some(p) => p,
        None => {
            eprintln!("[m005-migrate][data_center][BLOCK_NO_SOURCE_FILE]");
            return Ok(DataCenterMigrationOutcome::NoSourceFile);
        }
    };

    let content = std::fs::read_to_string(path).map_err(|e| {
        eprintln!(
            "[m005-migrate][data_center][BLOCK_SOURCE_READ_FAILED path={} err={e}]",
            path.display()
        );
        DataCenterMigrationError::SourceReadFailed(e.to_string())
    })?;

    let parsed: Value = serde_json::from_str(&content).map_err(|e| {
        eprintln!(
            "[m005-migrate][data_center][BLOCK_SOURCE_PARSE_FAILED path={} err={e}]",
            path.display()
        );
        DataCenterMigrationError::SourceCorrupt(e.to_string())
    })?;

    let map = match parsed {
        Value::Object(m) => m,
        other => {
            let kind = json_kind(&other);
            eprintln!("[m005-migrate][data_center][BLOCK_SOURCE_NOT_OBJECT kind={kind}]");
            return Err(DataCenterMigrationError::SourceCorrupt(format!(
                "dataCenter.json root is not a JSON object (kind={kind})"
            )));
        }
    };

    let mut migrated = 0u32;
    let mut collided = 0u32;
    let mut unknown = 0u32;

    for (key, value) in map {
        // Reserved keys — never overwrite our migration tracker.
        if key == crate::m005_prefs::KEY_MIGRATION_NS {
            eprintln!("[m005-migrate][data_center][BLOCK_KEY_SKIPPED key={key} reason=mt_migration-reserved]");
            continue;
        }

        let is_known = KNOWN_DATA_CENTER_KEYS.contains(&key.as_str());
        if !is_known {
            eprintln!("[m005-migrate][data_center][BLOCK_KEY_UNKNOWN key={key}]");
            unknown += 1;
        }

        // Collision against preferences-step-2 output: skip dataCenter
        // value (preferences wins because it's the user-facing settings
        // surface; dataCenter is a runtime cache).
        if target.get(&key).is_some() {
            eprintln!("[m005-migrate][data_center][BLOCK_KEY_COLLISION key={key} kept=preferences]");
            collided += 1;
            continue;
        }

        target.set(key, value);
        migrated += 1;
    }

    eprintln!(
        "[m005-migrate][data_center][BLOCK_MIGRATED migrated={migrated} collided={collided} unknown={unknown}]"
    );
    Ok(DataCenterMigrationOutcome::Migrated {
        keys_migrated: migrated,
        keys_collided: collided,
        keys_unknown: unknown,
    })
}

pub fn is_already_done(target: &PrefsStore) -> bool {
    match target.get(crate::m005_prefs::KEY_MIGRATION_NS) {
        Some(Value::Object(map)) => map
            .get(DATA_CENTER_MIGRATION_DONE_KEY)
            .and_then(|v| v.as_str())
            .map(|s| s == DATA_CENTER_MIGRATION_DONE_VALUE)
            .unwrap_or(false),
        _ => false,
    }
}

pub fn mark_done(target: &mut PrefsStore) {
    let mut ns = match target.get(crate::m005_prefs::KEY_MIGRATION_NS) {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    };
    ns.insert(
        DATA_CENTER_MIGRATION_DONE_KEY.to_string(),
        Value::String(DATA_CENTER_MIGRATION_DONE_VALUE.to_string()),
    );
    target.set(
        crate::m005_prefs::KEY_MIGRATION_NS.to_string(),
        Value::Object(ns),
    );
    eprintln!("[m005-migrate][data_center][BLOCK_MARK_DONE]");
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
        PrefsStore::load_from(tmp.path().join("prefs.json"))
    }

    fn write_legacy(tmp: &TempDir, name: &str, content: &str) -> std::path::PathBuf {
        let p = tmp.path().join(name);
        fs::write(&p, content).unwrap();
        p
    }

    #[test]
    fn migrates_full_real_user_dataCenter() {
        // Mirrors the real user's dataCenter.json captured from
        // ~/Library/Application Support/marktext/dataCenter.json
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(
            &tmp,
            "dc.json",
            r#"{
                "imageFolderPath": "/Users/foo/imgs",
                "screenshotFolderPath": "/Users/foo/screens",
                "webImages": [],
                "cloudImages": [],
                "currentUploader": "none",
                "imageBed": {"github":{"owner":"","repo":"","branch":""}}
            }"#,
        );
        let outcome = migrate_data_center(Some(&src), &mut store).unwrap();
        match outcome {
            DataCenterMigrationOutcome::Migrated { keys_migrated, keys_collided, keys_unknown } => {
                assert_eq!(keys_migrated, 6);
                assert_eq!(keys_collided, 0);
                assert_eq!(keys_unknown, 0);
            }
            other => panic!("unexpected {other:?}"),
        }
        assert_eq!(
            store.get("currentUploader"),
            Some(&Value::String("none".into()))
        );
    }

    #[test]
    fn collision_with_preferences_keeps_preferences_value() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        // Pretend preferences-step-2 already ran and set imageFolderPath
        // (hypothetical — preferences schema doesn't actually have it,
        // but defending against future schema overlap).
        store.set(
            "imageFolderPath".to_string(),
            Value::String("from-prefs".into()),
        );

        let src = write_legacy(
            &tmp,
            "dc.json",
            r#"{"imageFolderPath":"from-data-center","currentUploader":"github"}"#,
        );
        let outcome = migrate_data_center(Some(&src), &mut store).unwrap();
        match outcome {
            DataCenterMigrationOutcome::Migrated { keys_migrated, keys_collided, .. } => {
                assert_eq!(keys_migrated, 1);
                assert_eq!(keys_collided, 1);
            }
            other => panic!("unexpected {other:?}"),
        }
        assert_eq!(
            store.get("imageFolderPath"),
            Some(&Value::String("from-prefs".into())),
            "preferences value must win"
        );
        assert_eq!(
            store.get("currentUploader"),
            Some(&Value::String("github".into()))
        );
    }

    #[test]
    fn unknown_key_still_migrates_with_counter() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(
            &tmp,
            "dc.json",
            r#"{"futureKey":"v","currentUploader":"none"}"#,
        );
        let outcome = migrate_data_center(Some(&src), &mut store).unwrap();
        match outcome {
            DataCenterMigrationOutcome::Migrated { keys_migrated, keys_unknown, .. } => {
                assert_eq!(keys_migrated, 2, "future key still migrated for forward-compat");
                assert_eq!(keys_unknown, 1, "future key counted as unknown");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn no_source_file_is_not_an_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let outcome = migrate_data_center(None, &mut store).unwrap();
        assert_eq!(outcome, DataCenterMigrationOutcome::NoSourceFile);
    }

    #[test]
    fn idempotent_when_marker_present() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        mark_done(&mut store);

        let src = write_legacy(&tmp, "dc.json", r#"{"currentUploader":"github"}"#);
        let outcome = migrate_data_center(Some(&src), &mut store).unwrap();
        assert_eq!(outcome, DataCenterMigrationOutcome::AlreadyDone);
        assert!(store.get("currentUploader").is_none());
    }

    #[test]
    fn corrupt_root_returns_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "dc.json", "[]");
        let err = migrate_data_center(Some(&src), &mut store).unwrap_err();
        assert!(matches!(err, DataCenterMigrationError::SourceCorrupt(_)));
    }

    #[test]
    fn truncated_json_returns_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "dc.json", r#"{"theme":"da"#);
        let err = migrate_data_center(Some(&src), &mut store).unwrap_err();
        assert!(matches!(err, DataCenterMigrationError::SourceCorrupt(_)));
    }

    #[test]
    fn missing_file_returns_io_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let err =
            migrate_data_center(Some(&tmp.path().join("nope.json")), &mut store).unwrap_err();
        assert!(matches!(err, DataCenterMigrationError::SourceReadFailed(_)));
    }

    #[test]
    fn mt_migration_namespace_in_legacy_is_not_overwritten() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
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
            "dc.json",
            r#"{"mt_migration":{"hostile":1},"currentUploader":"none"}"#,
        );
        migrate_data_center(Some(&src), &mut store).unwrap();
        let ns = store
            .get(crate::m005_prefs::KEY_MIGRATION_NS)
            .unwrap()
            .as_object()
            .unwrap();
        assert!(ns.get("hostile").is_none());
        assert!(ns.get("schema_version").is_some());
    }

    #[test]
    fn empty_object_zero_keys() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "dc.json", "{}");
        let outcome = migrate_data_center(Some(&src), &mut store).unwrap();
        assert_eq!(
            outcome,
            DataCenterMigrationOutcome::Migrated {
                keys_migrated: 0,
                keys_collided: 0,
                keys_unknown: 0,
            }
        );
    }

    #[test]
    fn mark_done_is_independent_from_preferences_marker() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        super::super::preferences::mark_done(&mut store);
        assert!(super::super::preferences::is_already_done(&store));
        assert!(!is_already_done(&store), "data_center marker is independent");
        mark_done(&mut store);
        assert!(is_already_done(&store));
        assert!(super::super::preferences::is_already_done(&store), "preferences marker survives");
    }
}
