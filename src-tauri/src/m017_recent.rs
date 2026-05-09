// MODULE_CONTRACT
//   PURPOSE: M-017 mt-recent-docs. List of recently-opened files +
//            folders, persisted to prefs[KEY_RECENT_DOCS]. Renderer
//            "Open Recent" menu reads + writes via this module.
//   SCOPE:   add/list/clear; bounded list size; dedupe-by-path
//            (most-recent-first ordering). NO per-platform OS
//            integration (macOS NSDocumentController / Windows
//            JumpList) — those are F-RECENT-OS-INTEGRATION.
//   DEPENDS: m005_prefs (PrefsState).
//   LINKS:   docs/development-plan.xml Phase-B3 step-8;
//            v1.2.3 src/main/menu/actions/recently-used-documents.js
//            for the upstream behavior (10-item cap, dedupe).
//   STATUS:  Phase-B3 step-8 shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-8: initial impl.

use crate::m005_prefs::PrefsState;
use serde_json::Value;
use tauri::State;

/// Prefs key holding the recent-docs array.
pub const KEY_RECENT_DOCS: &str = "recentDocuments";

/// Cap matching v1.2.3's 10-item limit. Configurable in F-RECENT-CAP-PREF.
pub const MAX_RECENT_DOCS: usize = 10;

fn load(prefs: &PrefsState) -> Vec<String> {
    match prefs.get(KEY_RECENT_DOCS) {
        Some(Value::Array(arr)) => arr
            .into_iter()
            .filter_map(|v| match v {
                Value::String(s) => Some(s),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn store(prefs: &PrefsState, list: &[String]) -> Result<(), String> {
    let value = Value::Array(list.iter().cloned().map(Value::String).collect());
    prefs
        .set(KEY_RECENT_DOCS.to_string(), value)
        .map_err(|e| e.to_string())
}

/// Pure-logic add — see m013b/fs.rs for the inner/outer split rationale.
pub(crate) fn recent_add_inner(prefs: &PrefsState, path: &str) -> Result<(), String> {
    let mut current = load(prefs);
    current.retain(|p| p != path);
    current.insert(0, path.to_string());
    if current.len() > MAX_RECENT_DOCS {
        current.truncate(MAX_RECENT_DOCS);
    }
    eprintln!("[Recent][add][BLOCK_RECENT_UPDATED count={}]", current.len());
    store(prefs, &current)
}

/// Add a path to the recent list. Dedupes by exact-string match;
/// most-recent moves to head; cap enforced.
#[tauri::command]
pub async fn mt_recent_add(path: String, prefs: State<'_, PrefsState>) -> Result<(), String> {
    recent_add_inner(prefs.inner(), &path)
}

/// Snapshot the recent list (most-recent first, ≤ MAX_RECENT_DOCS).
#[tauri::command]
pub async fn mt_recent_list(prefs: State<'_, PrefsState>) -> Result<Vec<String>, String> {
    Ok(load(prefs.inner()))
}

/// Clear the entire list. v1.2.3 menu has "Clear Recent" item.
#[tauri::command]
pub async fn mt_recent_clear(prefs: State<'_, PrefsState>) -> Result<(), String> {
    eprintln!("[Recent][clear][BLOCK_RECENT_CLEARED]");
    store(prefs.inner(), &[])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn fresh_prefs() -> (TempDir, PrefsState) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let prefs = PrefsState::from_path(path);
        (dir, prefs)
    }

    fn add_sync(prefs: &PrefsState, path: &str) {
        recent_add_inner(prefs, path).unwrap();
    }

    #[test]
    fn empty_on_first_load() {
        let (_dir, prefs) = fresh_prefs();
        assert!(load(&prefs).is_empty());
    }

    #[test]
    fn add_inserts_at_head() {
        let (_dir, prefs) = fresh_prefs();
        add_sync(&prefs, "/a.md");
        add_sync(&prefs, "/b.md");
        let list = load(&prefs);
        assert_eq!(list, vec!["/b.md".to_string(), "/a.md".to_string()]);
    }

    #[test]
    fn add_dedupes_existing_path() {
        let (_dir, prefs) = fresh_prefs();
        add_sync(&prefs, "/a.md");
        add_sync(&prefs, "/b.md");
        add_sync(&prefs, "/a.md");
        let list = load(&prefs);
        assert_eq!(list, vec!["/a.md".to_string(), "/b.md".to_string()]);
    }

    #[test]
    fn cap_enforced_at_max() {
        let (_dir, prefs) = fresh_prefs();
        for i in 0..(MAX_RECENT_DOCS + 5) {
            add_sync(&prefs, &format!("/file-{i:03}.md"));
        }
        let list = load(&prefs);
        assert_eq!(list.len(), MAX_RECENT_DOCS);
        // Most recent first.
        assert_eq!(
            list[0],
            format!("/file-{:03}.md", MAX_RECENT_DOCS + 4)
        );
    }

    #[test]
    fn clear_drops_everything() {
        let (_dir, prefs) = fresh_prefs();
        add_sync(&prefs, "/a.md");
        store(&prefs, &[]).unwrap();
        assert!(load(&prefs).is_empty());
    }

    #[test]
    fn malformed_prefs_falls_back_to_empty() {
        let (_dir, prefs) = fresh_prefs();
        // Inject a non-array value at the recent key.
        prefs
            .set(KEY_RECENT_DOCS.to_string(), Value::String("not an array".to_string()))
            .unwrap();
        assert!(load(&prefs).is_empty());
    }

    #[test]
    fn array_with_non_string_items_filters_them_out() {
        let (_dir, prefs) = fresh_prefs();
        prefs
            .set(
                KEY_RECENT_DOCS.to_string(),
                Value::Array(vec![
                    Value::String("/keep.md".to_string()),
                    Value::Number(42.into()),
                    Value::Null,
                    Value::String("/also-keep.md".to_string()),
                ]),
            )
            .unwrap();
        let list = load(&prefs);
        assert_eq!(
            list,
            vec!["/keep.md".to_string(), "/also-keep.md".to_string()]
        );
    }

    #[test]
    fn persistence_across_reloads() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let prefs1 = PrefsState::from_path(path.clone());
        add_sync(&prefs1, "/a.md");
        add_sync(&prefs1, "/b.md");
        let prefs2 = PrefsState::from_path(path);
        let list = load(&prefs2);
        assert_eq!(list, vec!["/b.md".to_string(), "/a.md".to_string()]);
    }

    // Suppress unused-warning for PathBuf import (kept for symmetry
    // with other modules that take Path args; not strictly needed here
    // since we deal in String).
    #[allow(dead_code)]
    fn _suppress(_: PathBuf) {}

    #[test]
    fn recent_add_inner_dedupes_and_promotes_to_head() {
        let (_dir, prefs) = fresh_prefs();
        recent_add_inner(&prefs, "/x.md").unwrap();
        recent_add_inner(&prefs, "/y.md").unwrap();
        recent_add_inner(&prefs, "/x.md").unwrap();
        let list = load(&prefs);
        assert_eq!(list, vec!["/x.md".to_string(), "/y.md".to_string()]);
    }

    #[test]
    fn recent_add_inner_enforces_cap() {
        let (_dir, prefs) = fresh_prefs();
        for i in 0..(MAX_RECENT_DOCS + 3) {
            recent_add_inner(&prefs, &format!("/n-{i:03}.md")).unwrap();
        }
        let list = load(&prefs);
        assert_eq!(list.len(), MAX_RECENT_DOCS);
    }

    #[test]
    fn store_persists_then_load_returns_same_order() {
        let (_dir, prefs) = fresh_prefs();
        store(&prefs, &["/c.md".to_string(), "/b.md".to_string(), "/a.md".to_string()]).unwrap();
        let list = load(&prefs);
        assert_eq!(list, vec!["/c.md".to_string(), "/b.md".to_string(), "/a.md".to_string()]);
    }
}
