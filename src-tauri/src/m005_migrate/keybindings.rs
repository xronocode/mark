// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 step-4 — migrate v1.2.3 keybindings.json
//            (flat object {"command.id": "Accelerator string"}) into the
//            M-005 prefs store at KEY_SHORTCUTS, parsed through M-006's
//            parse_accelerator() so the resulting bindings match the
//            shape m006_shortcuts::load_bindings expects.
//   SCOPE:   single namespace migration. v1.2.3 only customizes shortcuts
//            via this single file (default bindings are baked into
//            keybindings{Darwin,Linux,Windows}.js); migration only
//            preserves user OVERRIDES, defaults already ship.
//   DEPENDS: m005_prefs::PrefsStore, m006_shortcuts::{parse_accelerator,
//            Accelerator, ShortcutBinding, KEY_SHORTCUTS}, serde_json.
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1 step-4;
//            mark-electron/src/main/keyboard/shortcutHandler.js
//            (source-format example).
//   STATUS:  shipped 2026-04-29 with F-PREFS-MIGRATE-V1 step-4.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 step-4: initial accelerator-parser-driven migrator.

use crate::m005_prefs::PrefsStore;
use crate::m006_shortcuts::{parse_accelerator, ShortcutBinding, KEY_SHORTCUTS};
use serde_json::{Map, Value};
use std::path::Path;

pub const KEYBINDINGS_MIGRATION_DONE_KEY: &str = "keybindings_v1";
pub const KEYBINDINGS_MIGRATION_DONE_VALUE: &str = "done";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeybindingsMigrationOutcome {
    Migrated {
        keys_migrated: u32,
        keys_invalid: u32,
        keys_unset: u32,
    },
    AlreadyDone,
    NoSourceFile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeybindingsMigrationError {
    SourceReadFailed(String),
    SourceCorrupt(String),
}

pub fn migrate_keybindings(
    source_path: Option<&Path>,
    target: &mut PrefsStore,
) -> Result<KeybindingsMigrationOutcome, KeybindingsMigrationError> {
    if is_already_done(target) {
        eprintln!("[m005-migrate][keybindings][BLOCK_ALREADY_DONE]");
        return Ok(KeybindingsMigrationOutcome::AlreadyDone);
    }

    let path = match source_path {
        Some(p) => p,
        None => {
            eprintln!("[m005-migrate][keybindings][BLOCK_NO_SOURCE_FILE]");
            return Ok(KeybindingsMigrationOutcome::NoSourceFile);
        }
    };

    let content = std::fs::read_to_string(path).map_err(|e| {
        eprintln!(
            "[m005-migrate][keybindings][BLOCK_SOURCE_READ_FAILED path={} err={e}]",
            path.display()
        );
        KeybindingsMigrationError::SourceReadFailed(e.to_string())
    })?;

    let parsed: Value = serde_json::from_str(&content).map_err(|e| {
        eprintln!(
            "[m005-migrate][keybindings][BLOCK_SOURCE_PARSE_FAILED path={} err={e}]",
            path.display()
        );
        KeybindingsMigrationError::SourceCorrupt(e.to_string())
    })?;

    let map = match parsed {
        Value::Object(m) => m,
        other => {
            let kind = json_kind(&other);
            eprintln!("[m005-migrate][keybindings][BLOCK_SOURCE_NOT_OBJECT kind={kind}]");
            return Err(KeybindingsMigrationError::SourceCorrupt(format!(
                "keybindings.json root is not a JSON object (kind={kind})"
            )));
        }
    };

    let mut migrated = 0u32;
    let mut invalid = 0u32;
    let mut unset = 0u32;
    let mut bindings: Vec<ShortcutBinding> = Vec::new();

    for (command, accel_value) in map {
        let accel_str = match accel_value {
            Value::String(s) => s,
            other => {
                let kind = json_kind(&other);
                eprintln!(
                    "[m005-migrate][keybindings][BLOCK_KEY_INVALID command={command} reason=value-not-string kind={kind}]"
                );
                invalid += 1;
                continue;
            }
        };

        // v1.2.3 sentinel — empty string means "unset this default binding".
        // We don't write a binding for unsets but count them so callers can
        // surface "1 binding unset" in the migration summary dialog.
        if accel_str.is_empty() {
            eprintln!("[m005-migrate][keybindings][BLOCK_KEY_UNSET command={command}]");
            unset += 1;
            continue;
        }

        match parse_accelerator(&accel_str) {
            Ok(acc) => {
                bindings.push(ShortcutBinding {
                    command,
                    accelerator: acc,
                });
                migrated += 1;
            }
            Err(e) => {
                eprintln!(
                    "[m005-migrate][keybindings][BLOCK_KEY_INVALID command={command} reason=parse-failed err={e:?} input={accel_str}]"
                );
                invalid += 1;
            }
        }
    }

    if !bindings.is_empty() {
        // Merge with any pre-existing KEY_SHORTCUTS bindings (last-write-wins
        // semantics consistent with m006_shortcuts::mt_shortcut_register).
        let mut existing: Vec<ShortcutBinding> = match target.get(KEY_SHORTCUTS) {
            Some(v) => serde_json::from_value(v.clone()).unwrap_or_default(),
            None => Vec::new(),
        };
        for new_b in bindings {
            if let Some(idx) = existing.iter().position(|b| b.command == new_b.command) {
                existing[idx] = new_b;
            } else {
                existing.push(new_b);
            }
        }
        let serialized = serde_json::to_value(&existing).map_err(|e| {
            KeybindingsMigrationError::SourceCorrupt(format!("serialize bindings: {e}"))
        })?;
        target.set(KEY_SHORTCUTS.to_string(), serialized);
    }

    eprintln!(
        "[m005-migrate][keybindings][BLOCK_MIGRATED migrated={migrated} invalid={invalid} unset={unset}]"
    );
    Ok(KeybindingsMigrationOutcome::Migrated {
        keys_migrated: migrated,
        keys_invalid: invalid,
        keys_unset: unset,
    })
}

pub fn is_already_done(target: &PrefsStore) -> bool {
    match target.get(crate::m005_prefs::KEY_MIGRATION_NS) {
        Some(Value::Object(map)) => map
            .get(KEYBINDINGS_MIGRATION_DONE_KEY)
            .and_then(|v| v.as_str())
            .map(|s| s == KEYBINDINGS_MIGRATION_DONE_VALUE)
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
        KEYBINDINGS_MIGRATION_DONE_KEY.to_string(),
        Value::String(KEYBINDINGS_MIGRATION_DONE_VALUE.to_string()),
    );
    target.set(
        crate::m005_prefs::KEY_MIGRATION_NS.to_string(),
        Value::Object(ns),
    );
    eprintln!("[m005-migrate][keybindings][BLOCK_MARK_DONE]");
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
    fn migrates_standard_user_overrides() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(
            &tmp,
            "kb.json",
            r#"{
                "file.save": "CmdOrCtrl+S",
                "file.save-as": "CmdOrCtrl+Shift+S",
                "edit.undo": "CmdOrCtrl+Z"
            }"#,
        );
        let outcome = migrate_keybindings(Some(&src), &mut store).unwrap();
        match outcome {
            KeybindingsMigrationOutcome::Migrated { keys_migrated, keys_invalid, keys_unset } => {
                assert_eq!(keys_migrated, 3);
                assert_eq!(keys_invalid, 0);
                assert_eq!(keys_unset, 0);
            }
            other => panic!("unexpected {other:?}"),
        }
        // Verify wire format matches m006_shortcuts::load_bindings shape.
        let raw = store.get(KEY_SHORTCUTS).expect("KEY_SHORTCUTS must be set");
        let bindings: Vec<ShortcutBinding> = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(bindings.len(), 3);
        let cmds: Vec<&str> = bindings.iter().map(|b| b.command.as_str()).collect();
        assert!(cmds.contains(&"file.save"));
        assert!(cmds.contains(&"edit.undo"));
    }

    #[test]
    fn empty_string_value_counts_as_unset_not_invalid() {
        // v1.2.3 convention: empty string means "unset this default binding".
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "kb.json", r#"{"file.save":""}"#);
        let outcome = migrate_keybindings(Some(&src), &mut store).unwrap();
        match outcome {
            KeybindingsMigrationOutcome::Migrated { keys_migrated, keys_invalid, keys_unset } => {
                assert_eq!(keys_migrated, 0);
                assert_eq!(keys_invalid, 0);
                assert_eq!(keys_unset, 1);
            }
            other => panic!("unexpected {other:?}"),
        }
        // No bindings written when only unsets present.
        assert!(store.get(KEY_SHORTCUTS).is_none());
    }

    #[test]
    fn invalid_accelerator_string_counted_but_skipped() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(
            &tmp,
            "kb.json",
            r#"{"file.save":"CmdOrCtrl+S","busted":"not-a-real-accel-+-+-"}"#,
        );
        let outcome = migrate_keybindings(Some(&src), &mut store).unwrap();
        match outcome {
            KeybindingsMigrationOutcome::Migrated { keys_migrated, keys_invalid, .. } => {
                assert_eq!(keys_migrated, 1);
                assert_eq!(keys_invalid, 1);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn non_string_value_counted_as_invalid() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(
            &tmp,
            "kb.json",
            r#"{"file.save":123,"edit.undo":"CmdOrCtrl+Z"}"#,
        );
        let outcome = migrate_keybindings(Some(&src), &mut store).unwrap();
        match outcome {
            KeybindingsMigrationOutcome::Migrated { keys_migrated, keys_invalid, .. } => {
                assert_eq!(keys_migrated, 1);
                assert_eq!(keys_invalid, 1);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn no_source_file_is_not_an_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let outcome = migrate_keybindings(None, &mut store).unwrap();
        assert_eq!(outcome, KeybindingsMigrationOutcome::NoSourceFile);
    }

    #[test]
    fn idempotent_when_marker_present() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        mark_done(&mut store);

        let src = write_legacy(&tmp, "kb.json", r#"{"file.save":"CmdOrCtrl+S"}"#);
        let outcome = migrate_keybindings(Some(&src), &mut store).unwrap();
        assert_eq!(outcome, KeybindingsMigrationOutcome::AlreadyDone);
        assert!(store.get(KEY_SHORTCUTS).is_none());
    }

    #[test]
    fn merges_with_pre_existing_bindings_last_write_wins() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        // Pre-seed an existing binding (e.g. a previous partial run)
        let existing = vec![ShortcutBinding {
            command: "file.save".to_string(),
            accelerator: parse_accelerator("CmdOrCtrl+S").unwrap(),
        }];
        store.set(
            KEY_SHORTCUTS.to_string(),
            serde_json::to_value(&existing).unwrap(),
        );

        let src = write_legacy(
            &tmp,
            "kb.json",
            r#"{"file.save":"CmdOrCtrl+Shift+S","new.cmd":"F1"}"#,
        );
        migrate_keybindings(Some(&src), &mut store).unwrap();

        let raw = store.get(KEY_SHORTCUTS).unwrap();
        let bindings: Vec<ShortcutBinding> = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(bindings.len(), 2);
        let save = bindings.iter().find(|b| b.command == "file.save").unwrap();
        assert_eq!(save.accelerator, parse_accelerator("CmdOrCtrl+Shift+S").unwrap());
    }

    #[test]
    fn corrupt_root_returns_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "kb.json", "[]");
        let err = migrate_keybindings(Some(&src), &mut store).unwrap_err();
        assert!(matches!(err, KeybindingsMigrationError::SourceCorrupt(_)));
    }

    #[test]
    fn truncated_json_returns_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "kb.json", r#"{"file.save":"Cm"#);
        let err = migrate_keybindings(Some(&src), &mut store).unwrap_err();
        assert!(matches!(err, KeybindingsMigrationError::SourceCorrupt(_)));
    }

    #[test]
    fn missing_file_returns_io_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let err =
            migrate_keybindings(Some(&tmp.path().join("nope.json")), &mut store).unwrap_err();
        assert!(matches!(err, KeybindingsMigrationError::SourceReadFailed(_)));
    }

    #[test]
    fn empty_object_zero_keys() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "kb.json", "{}");
        let outcome = migrate_keybindings(Some(&src), &mut store).unwrap();
        assert_eq!(
            outcome,
            KeybindingsMigrationOutcome::Migrated {
                keys_migrated: 0,
                keys_invalid: 0,
                keys_unset: 0,
            }
        );
    }
}
