// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 step-5 — migrate v1.2.3
//            recently-used-documents.json (flat JSON array of absolute
//            paths) into the M-005 prefs store at KEY_RECENT_DOCS.
//            Linux/Windows only in v1.2.3 — macOS uses OS-level recent
//            documents APIs and never writes this file.
//   SCOPE:   single namespace migration. Dedupe + cap at MAX_RECENT_DOCS
//            (10) matching m017_recent semantics. Drops null entries
//            and non-string array elements with skipped counter.
//   DEPENDS: m005_prefs::PrefsStore, m017_recent::{KEY_RECENT_DOCS,
//            MAX_RECENT_DOCS}, serde_json.
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1 step-5;
//            mark-electron/src/main/menu/index.js (source format).
//   STATUS:  shipped 2026-04-29 with F-PREFS-MIGRATE-V1 step-5.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 step-5: initial array-dedupe-cap migrator.

use crate::m005_prefs::PrefsStore;
use crate::m017_recent::{KEY_RECENT_DOCS, MAX_RECENT_DOCS};
use serde_json::{Map, Value};
use std::path::Path;

pub const RECENT_DOCS_MIGRATION_DONE_KEY: &str = "recent_docs_v1";
pub const RECENT_DOCS_MIGRATION_DONE_VALUE: &str = "done";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecentDocsMigrationOutcome {
    Migrated {
        keys_migrated: u32,
        keys_skipped: u32,
        keys_capped: u32,
    },
    AlreadyDone,
    NoSourceFile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecentDocsMigrationError {
    SourceReadFailed(String),
    SourceCorrupt(String),
}

pub fn migrate_recent_docs(
    source_path: Option<&Path>,
    target: &mut PrefsStore,
) -> Result<RecentDocsMigrationOutcome, RecentDocsMigrationError> {
    if is_already_done(target) {
        eprintln!("[m005-migrate][recent_docs][BLOCK_ALREADY_DONE]");
        return Ok(RecentDocsMigrationOutcome::AlreadyDone);
    }

    let path = match source_path {
        Some(p) => p,
        None => {
            eprintln!("[m005-migrate][recent_docs][BLOCK_NO_SOURCE_FILE]");
            return Ok(RecentDocsMigrationOutcome::NoSourceFile);
        }
    };

    let content = std::fs::read_to_string(path).map_err(|e| {
        eprintln!(
            "[m005-migrate][recent_docs][BLOCK_SOURCE_READ_FAILED path={} err={e}]",
            path.display()
        );
        RecentDocsMigrationError::SourceReadFailed(e.to_string())
    })?;

    let parsed: Value = serde_json::from_str(&content).map_err(|e| {
        eprintln!(
            "[m005-migrate][recent_docs][BLOCK_SOURCE_PARSE_FAILED path={} err={e}]",
            path.display()
        );
        RecentDocsMigrationError::SourceCorrupt(e.to_string())
    })?;

    let arr = match parsed {
        Value::Array(a) => a,
        other => {
            let kind = json_kind(&other);
            eprintln!("[m005-migrate][recent_docs][BLOCK_SOURCE_NOT_ARRAY kind={kind}]");
            return Err(RecentDocsMigrationError::SourceCorrupt(format!(
                "recently-used-documents.json root is not a JSON array (kind={kind})"
            )));
        }
    };

    let mut migrated = 0u32;
    let mut skipped = 0u32;
    let mut capped = 0u32;
    let mut deduped: Vec<String> = Vec::new();

    for elem in arr {
        let s = match elem {
            Value::String(s) => s,
            other => {
                let kind = json_kind(&other);
                eprintln!(
                    "[m005-migrate][recent_docs][BLOCK_ELEM_SKIPPED reason=non-string kind={kind}]"
                );
                skipped += 1;
                continue;
            }
        };
        if s.is_empty() {
            eprintln!("[m005-migrate][recent_docs][BLOCK_ELEM_SKIPPED reason=empty-string]");
            skipped += 1;
            continue;
        }
        if deduped.iter().any(|existing| existing == &s) {
            eprintln!("[m005-migrate][recent_docs][BLOCK_ELEM_DEDUPED path={s}]");
            skipped += 1;
            continue;
        }
        deduped.push(s);
    }

    if deduped.len() > MAX_RECENT_DOCS {
        capped = (deduped.len() - MAX_RECENT_DOCS) as u32;
        deduped.truncate(MAX_RECENT_DOCS);
        eprintln!(
            "[m005-migrate][recent_docs][BLOCK_CAPPED dropped={capped} kept={MAX_RECENT_DOCS}]"
        );
    }

    if !deduped.is_empty() {
        // Merge with any pre-existing list — preserve order: legacy
        // entries first (most recent), then existing pre-seeded ones,
        // dedupe, cap.
        let mut merged: Vec<String> = deduped.clone();
        if let Some(Value::Array(existing)) = target.get(KEY_RECENT_DOCS) {
            for v in existing {
                if let Value::String(s) = v {
                    if !merged.iter().any(|m| m == s) {
                        merged.push(s.clone());
                    }
                }
            }
        }
        if merged.len() > MAX_RECENT_DOCS {
            merged.truncate(MAX_RECENT_DOCS);
        }

        migrated = deduped.len() as u32;
        let value: Value = Value::Array(merged.into_iter().map(Value::String).collect());
        target.set(KEY_RECENT_DOCS.to_string(), value);
    }

    eprintln!(
        "[m005-migrate][recent_docs][BLOCK_MIGRATED migrated={migrated} skipped={skipped} capped={capped}]"
    );
    Ok(RecentDocsMigrationOutcome::Migrated {
        keys_migrated: migrated,
        keys_skipped: skipped,
        keys_capped: capped,
    })
}

pub fn is_already_done(target: &PrefsStore) -> bool {
    match target.get(crate::m005_prefs::KEY_MIGRATION_NS) {
        Some(Value::Object(map)) => map
            .get(RECENT_DOCS_MIGRATION_DONE_KEY)
            .and_then(|v| v.as_str())
            .map(|s| s == RECENT_DOCS_MIGRATION_DONE_VALUE)
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
        RECENT_DOCS_MIGRATION_DONE_KEY.to_string(),
        Value::String(RECENT_DOCS_MIGRATION_DONE_VALUE.to_string()),
    );
    target.set(
        crate::m005_prefs::KEY_MIGRATION_NS.to_string(),
        Value::Object(ns),
    );
    eprintln!("[m005-migrate][recent_docs][BLOCK_MARK_DONE]");
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
    fn migrates_short_list() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(
            &tmp,
            "rd.json",
            r#"["/Users/foo/a.md","/Users/foo/b.md","/Users/foo/c.md"]"#,
        );
        let outcome = migrate_recent_docs(Some(&src), &mut store).unwrap();
        match outcome {
            RecentDocsMigrationOutcome::Migrated { keys_migrated, keys_skipped, keys_capped } => {
                assert_eq!(keys_migrated, 3);
                assert_eq!(keys_skipped, 0);
                assert_eq!(keys_capped, 0);
            }
            other => panic!("unexpected {other:?}"),
        }
        let arr = store.get(KEY_RECENT_DOCS).unwrap().as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0], Value::String("/Users/foo/a.md".into()));
    }

    #[test]
    fn dedupes_repeat_entries() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(
            &tmp,
            "rd.json",
            r#"["/a.md","/b.md","/a.md","/c.md","/b.md"]"#,
        );
        let outcome = migrate_recent_docs(Some(&src), &mut store).unwrap();
        match outcome {
            RecentDocsMigrationOutcome::Migrated { keys_migrated, keys_skipped, .. } => {
                assert_eq!(keys_migrated, 3, "3 unique paths");
                assert_eq!(keys_skipped, 2, "2 duplicates skipped");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn caps_at_max_recent_docs() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        // 15 unique paths — must truncate to MAX_RECENT_DOCS (10).
        let paths: Vec<String> = (0..15).map(|i| format!("\"/p{i}.md\"")).collect();
        let body = format!("[{}]", paths.join(","));
        let src = write_legacy(&tmp, "rd.json", &body);
        let outcome = migrate_recent_docs(Some(&src), &mut store).unwrap();
        match outcome {
            RecentDocsMigrationOutcome::Migrated { keys_migrated, keys_capped, .. } => {
                assert_eq!(keys_migrated, MAX_RECENT_DOCS as u32);
                assert_eq!(keys_capped, 5);
            }
            other => panic!("unexpected {other:?}"),
        }
        let arr = store.get(KEY_RECENT_DOCS).unwrap().as_array().unwrap();
        assert_eq!(arr.len(), MAX_RECENT_DOCS);
    }

    #[test]
    fn non_string_elements_skipped() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "rd.json", r#"["/a.md",42,null,"/b.md"]"#);
        let outcome = migrate_recent_docs(Some(&src), &mut store).unwrap();
        match outcome {
            RecentDocsMigrationOutcome::Migrated { keys_migrated, keys_skipped, .. } => {
                assert_eq!(keys_migrated, 2);
                assert_eq!(keys_skipped, 2, "number + null");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn empty_string_elements_skipped() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "rd.json", r#"["","/a.md",""]"#);
        let outcome = migrate_recent_docs(Some(&src), &mut store).unwrap();
        match outcome {
            RecentDocsMigrationOutcome::Migrated { keys_migrated, keys_skipped, .. } => {
                assert_eq!(keys_migrated, 1);
                assert_eq!(keys_skipped, 2);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn merges_with_pre_existing_list_legacy_first() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        store.set(
            KEY_RECENT_DOCS.to_string(),
            Value::Array(vec![
                Value::String("/existing1.md".into()),
                Value::String("/existing2.md".into()),
            ]),
        );
        let src = write_legacy(&tmp, "rd.json", r#"["/legacy1.md","/legacy2.md"]"#);
        migrate_recent_docs(Some(&src), &mut store).unwrap();
        let arr = store.get(KEY_RECENT_DOCS).unwrap().as_array().unwrap();
        // Legacy first, then existing, deduped.
        assert_eq!(arr[0], Value::String("/legacy1.md".into()));
        assert_eq!(arr[1], Value::String("/legacy2.md".into()));
        assert_eq!(arr[2], Value::String("/existing1.md".into()));
        assert_eq!(arr[3], Value::String("/existing2.md".into()));
        assert_eq!(arr.len(), 4);
    }

    #[test]
    fn merge_collision_keeps_legacy_position() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        store.set(
            KEY_RECENT_DOCS.to_string(),
            Value::Array(vec![
                Value::String("/shared.md".into()),
                Value::String("/existing.md".into()),
            ]),
        );
        let src = write_legacy(&tmp, "rd.json", r#"["/legacy.md","/shared.md"]"#);
        migrate_recent_docs(Some(&src), &mut store).unwrap();
        let arr = store.get(KEY_RECENT_DOCS).unwrap().as_array().unwrap();
        assert_eq!(arr[0], Value::String("/legacy.md".into()));
        assert_eq!(arr[1], Value::String("/shared.md".into()));
        assert_eq!(arr[2], Value::String("/existing.md".into()));
        assert_eq!(arr.len(), 3);
    }

    #[test]
    fn no_source_file_is_not_an_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let outcome = migrate_recent_docs(None, &mut store).unwrap();
        assert_eq!(outcome, RecentDocsMigrationOutcome::NoSourceFile);
    }

    #[test]
    fn idempotent_when_marker_present() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        mark_done(&mut store);
        let src = write_legacy(&tmp, "rd.json", r#"["/a.md"]"#);
        let outcome = migrate_recent_docs(Some(&src), &mut store).unwrap();
        assert_eq!(outcome, RecentDocsMigrationOutcome::AlreadyDone);
        assert!(store.get(KEY_RECENT_DOCS).is_none());
    }

    #[test]
    fn corrupt_root_is_object_returns_error() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "rd.json", r#"{"oops":true}"#);
        let err = migrate_recent_docs(Some(&src), &mut store).unwrap_err();
        assert!(matches!(err, RecentDocsMigrationError::SourceCorrupt(_)));
    }

    #[test]
    fn empty_array_zero_keys() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let src = write_legacy(&tmp, "rd.json", "[]");
        let outcome = migrate_recent_docs(Some(&src), &mut store).unwrap();
        assert_eq!(
            outcome,
            RecentDocsMigrationOutcome::Migrated {
                keys_migrated: 0,
                keys_skipped: 0,
                keys_capped: 0
            }
        );
        assert!(store.get(KEY_RECENT_DOCS).is_none());
    }
}
