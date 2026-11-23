// FILE: src-tauri/src/m017_recent.rs
// VERSION: 1.1.1
// START_MODULE_CONTRACT
//   PURPOSE: M-017 mt-recent-docs. List of recently-opened files +
//            folders, persisted to prefs[KEY_RECENT_DOCS]. Renderer
//            "Open Recent" menu and the C-46 welcome screen read +
//            write via this module.
//   SCOPE:   add/list/clear; remove-by-path + insert-at (welcome
//            screen "Remove from list" + 5s Undo restoring exact
//            order); bounded list size; dedupe-by-path
//            (most-recent-first ordering). NO per-platform OS
//            integration (macOS NSDocumentController / Windows
//            JumpList) — those are F-RECENT-OS-INTEGRATION.
//   DEPENDS: m005_prefs (PrefsState); m047_bookmarks (grant moments and
//            queued persistence-failure warnings; current access is retained).
//   LINKS:   docs/development-plan.xml Phase-B3 step-8;
//            v1.2.3 src/main/menu/actions/recently-used-documents.js
//            for the upstream behavior (10-item cap, dedupe);
//            .grace/changes/archive/C-46 (welcome screen remove/undo).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   KEY_RECENT_DOCS - prefs key holding the recent-docs array
//   MAX_RECENT_DOCS - list cap (10, matching v1.2.3)
//   recent_add_inner - pure-logic add (dedupe, promote to head, cap)
//   recent_remove_inner - pure-logic remove returning the old index
//   recent_insert_inner - pure-logic insert-at (Undo of remove)
//   mt_recent_add - command: add a path (also records a security bookmark)
//   mt_recent_list - command: snapshot the list, most-recent first
//   mt_recent_clear - command: clear the list
//   mt_recent_remove - command: remove a path, returns Some(old index)
//   mt_recent_insert - command: insert a path at an index
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-BOOKMARK-PERSISTENCE-DURABILITY: consume bookmark failures
//     through the queued notice channel while preserving recent-add behavior.
//   LAST_CHANGE: 2026-10-15 C-46 review: header normalized to the
//     canonical START/END contract + MODULE_MAP form (grace lint); the
//     insert-dedupe test mixed &str and String in one vec! and did not
//     compile (cargo test recent was red).
//   - 2026-10-15 C-46: mt_recent_remove (+ mt_recent_insert for the
//     Undo toast) — remove returns the old index so the renderer can
//     restore the exact previous order.
//   - 2026-04-29 B3-step-8: initial impl.
// END_CHANGE_SUMMARY

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

// ── C-RECENTS-SERIALIZE T-001: the #[cfg(test)] gap seam ───────────
// Test-only parked-interleaving seam for
// recent_concurrent_adds_from_two_threads_both_persist: its SINGLE call
// site sits between the loaded read and the persist inside the pre-fix
// recent_add_inner, so the pin can hold thread A deterministically
// (Ready) and release it only after thread B completed a full add —
// no sleeps, no busy-waits, no timing. Armed exclusively by that pin
// through the static channel pair below; inert while disarmed, and the
// armed-thread guard keeps the park pinned to the one spawned thread
// the pin designates so parallel in-process tests running their own
// adds are never intercepted. C-RECENTS-SERIALIZE T-002 retires the
// call site together with the un-encompassed body; this scaffolding
// stays behind inert because the pin then dispatches on Done.
#[cfg(test)]
static GAP_SEAM_EVENTS: std::sync::Mutex<Option<std::sync::mpsc::Sender<&'static str>>> =
    std::sync::Mutex::new(None);
#[cfg(test)]
static GAP_SEAM_RELEASE: std::sync::Mutex<Option<std::sync::mpsc::Receiver<()>>> =
    std::sync::Mutex::new(None);
#[cfg(test)]
static GAP_SEAM_ARMED_THREAD: std::sync::OnceLock<std::thread::ThreadId> =
    std::sync::OnceLock::new();

/// Fire Ready and block until the pin releases the park. Only the
/// armed thread ever parks; unarmed callers return immediately.
#[cfg(test)]
fn recent_test_gap_park() {
    let armed_for_me = GAP_SEAM_ARMED_THREAD
        .get()
        .map(|id| *id == std::thread::current().id())
        .unwrap_or(false);
    if !armed_for_me {
        return;
    }
    let release = {
        let mut slot = GAP_SEAM_RELEASE
            .lock()
            .expect("gap seam release slot poisoned");
        slot.take()
    };
    if let Some(tx) = GAP_SEAM_EVENTS
        .lock()
        .expect("gap seam events slot poisoned")
        .as_ref()
    {
        let _ = tx.send("ready");
    }
    if let Some(rx) = release {
        let _ = rx.recv();
    }
}

/// Pure-logic add — see m013b/fs.rs for the inner/outer split rationale.
pub(crate) fn recent_add_inner(prefs: &PrefsState, path: &str) -> Result<(), String> {
    let mut current = load(prefs);
    #[cfg(test)]
    recent_test_gap_park();
    current.retain(|p| p != path);
    current.insert(0, path.to_string());
    if current.len() > MAX_RECENT_DOCS {
        current.truncate(MAX_RECENT_DOCS);
    }
    safe_eprintln!("[Recent][add][BLOCK_RECENT_UPDATED count={}]", current.len());
    store(prefs, &current)
}

/// Add a path to the recent list. Dedupes by exact-string match;
/// most-recent moves to head; cap enforced.
#[tauri::command]
pub async fn mt_recent_add(path: String, prefs: State<'_, PrefsState>) -> Result<(), String> {
    // C-15 T-M3: every recents entry is a grant moment — persist a
    // security-scoped bookmark so sandboxed builds can reopen it later.
    if let Err(error) = crate::m047_bookmarks::remember(&path) {
        crate::m047_bookmarks::report_persistence_failure(&error);
    }
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
    safe_eprintln!("[Recent][clear][BLOCK_RECENT_CLEARED]");
    store(prefs.inner(), &[])
}

// START_BLOCK_RECENT_REMOVE
/// Pure-logic remove — drops the first exact-match path and returns its
/// old index (None when the path was not in the list). No store write
/// happens for a missing path so a stray remove cannot corrupt the list.
pub(crate) fn recent_remove_inner(prefs: &PrefsState, path: &str) -> Result<Option<usize>, String> {
    let mut current = load(prefs);
    let old_index = current.iter().position(|p| p == path);
    if let Some(index) = old_index {
        current.remove(index);
        safe_eprintln!(
            "[Recent][remove][BLOCK_RECENT_UPDATED removed_at={} count={}]",
            index,
            current.len()
        );
        store(prefs, &current)?;
    }
    Ok(old_index)
}
// END_BLOCK_RECENT_REMOVE

// START_BLOCK_RECENT_INSERT
/// Pure-logic insert-at — dedupe first, then splice at the clamped
/// index; cap enforced. Inverse of recent_remove_inner for Undo.
pub(crate) fn recent_insert_inner(prefs: &PrefsState, path: &str, index: usize) -> Result<(), String> {
    let mut current = load(prefs);
    current.retain(|p| p != path);
    let at = index.min(current.len());
    current.insert(at, path.to_string());
    if current.len() > MAX_RECENT_DOCS {
        current.truncate(MAX_RECENT_DOCS);
    }
    safe_eprintln!("[Recent][insert][BLOCK_RECENT_UPDATED at={} count={}]", at, current.len());
    store(prefs, &current)
}
// END_BLOCK_RECENT_INSERT

/// Remove a path from the recent list (C-46 welcome screen "Remove from
/// list"). Returns Some(old index) when the path was present — feed that
/// index back to mt_recent_insert to undo.
#[tauri::command]
pub async fn mt_recent_remove(path: String, prefs: State<'_, PrefsState>) -> Result<Option<usize>, String> {
    recent_remove_inner(prefs.inner(), &path)
}

/// Insert a path at a given position (Undo of mt_recent_remove:
/// restores the exact previous order). Dedupe + cap still enforced.
#[tauri::command]
pub async fn mt_recent_insert(path: String, index: usize, prefs: State<'_, PrefsState>) -> Result<(), String> {
    recent_insert_inner(prefs.inner(), &path, index)
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

    // ── C-46 remove / insert-at (welcome screen Remove + Undo) ──

    #[test]
    fn remove_missing_path_returns_none_and_keeps_list() {
        let (_dir, prefs) = fresh_prefs();
        add_sync(&prefs, "/a.md");
        let removed = recent_remove_inner(&prefs, "/not-there.md").unwrap();
        assert_eq!(removed, None);
        assert_eq!(load(&prefs), vec!["/a.md".to_string()]);
    }

    #[test]
    fn remove_returns_old_index_and_persists() {
        let (_dir, prefs) = fresh_prefs();
        for p in ["/a.md", "/b.md", "/c.md"] {
            add_sync(&prefs, p);
        }
        // list is now [c, b, a]; removing the tail item reports index 2.
        let removed = recent_remove_inner(&prefs, "/a.md").unwrap();
        assert_eq!(removed, Some(2));
        assert_eq!(load(&prefs), vec!["/c.md".to_string(), "/b.md".to_string()]);
    }

    #[test]
    fn remove_then_insert_restores_exact_order() {
        let (_dir, prefs) = fresh_prefs();
        for p in ["/a.md", "/b.md", "/c.md", "/d.md"] {
            add_sync(&prefs, p);
        }
        let original = load(&prefs);
        let removed = recent_remove_inner(&prefs, "/b.md").unwrap().unwrap();
        assert_eq!(load(&prefs), vec!["/d.md", "/c.md", "/a.md"]);
        recent_insert_inner(&prefs, "/b.md", removed).unwrap();
        assert_eq!(load(&prefs), original);
    }

    #[test]
    fn insert_clamps_oversized_index_to_end() {
        let (_dir, prefs) = fresh_prefs();
        add_sync(&prefs, "/a.md");
        recent_insert_inner(&prefs, "/b.md", 99).unwrap();
        assert_eq!(load(&prefs), vec!["/a.md".to_string(), "/b.md".to_string()]);
    }

    #[test]
    fn insert_dedupes_existing_path_before_splicing() {
        let (_dir, prefs) = fresh_prefs();
        for p in ["/a.md", "/b.md", "/c.md"] {
            add_sync(&prefs, p);
        }
        // Re-inserting an existing path must not duplicate it.
        recent_insert_inner(&prefs, "/c.md", 0).unwrap();
        let list = load(&prefs);
        assert_eq!(list, vec!["/c.md".to_string(), "/b.md".to_string(), "/a.md".to_string()]);
        assert_eq!(list.len(), 3);
    }

    #[test]
    fn insert_enforces_cap() {
        let (_dir, prefs) = fresh_prefs();
        for i in 0..MAX_RECENT_DOCS {
            add_sync(&prefs, &format!("/f-{i:02}.md"));
        }
        recent_insert_inner(&prefs, "/extra.md", 0).unwrap();
        let list = load(&prefs);
        assert_eq!(list.len(), MAX_RECENT_DOCS);
        assert_eq!(list[0], "/extra.md".to_string());
    }

    #[test]
    fn remove_persists_across_reloads() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let prefs1 = PrefsState::from_path(path.clone());
        add_sync(&prefs1, "/a.md");
        add_sync(&prefs1, "/b.md");
        let removed = recent_remove_inner(&prefs1, "/b.md").unwrap();
        assert_eq!(removed, Some(0));
        let prefs2 = PrefsState::from_path(path);
        assert_eq!(load(&prefs2), vec!["/a.md".to_string()]);
    }

    // ── C-RECENTS-SERIALIZE T-001: failing-first pins ──────────────

    #[test]
    fn recent_concurrent_adds_from_two_threads_both_persist() {
        // The deterministic RMW-race pin: thread A's add is held at the
        // gap seam parked between its loaded read and its persist
        // (Ready), thread B then completes a FULL add, and only then is
        // A released — the parked interleaving the un-encompassed
        // load→store window deterministically loses B's insert on
        // (A's stale-list store erases it). Dispatch on the FIRST seam
        // event: Ready is the pre-fix shape; Done means the seam call
        // site is retired (the post-fix shape — the same test body must
        // then be green by mutex serialization alone, recorded
        // honestly). No sleeps, no busy-waits, no timing; the pin never
        // blocks on Ready once the seam is unreachable.
        let dir = TempDir::new().unwrap();
        let prefs_path = dir.path().join("preferences.json");
        let prefs = std::sync::Arc::new(PrefsState::from_path(prefs_path.clone()));

        let (event_tx, event_rx) = std::sync::mpsc::channel::<&'static str>();
        let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
        *GAP_SEAM_EVENTS.lock().unwrap() = Some(event_tx.clone());
        *GAP_SEAM_RELEASE.lock().unwrap() = Some(release_rx);

        let thread_a = {
            let prefs = std::sync::Arc::clone(&prefs);
            let events = event_tx.clone();
            std::thread::spawn(move || {
                GAP_SEAM_ARMED_THREAD
                    .set(std::thread::current().id())
                    .expect("gap seam armed twice in one process");
                let result = recent_add_inner(&prefs, "/race-a.md");
                let _ = events.send("done");
                result
            })
        };

        match event_rx.recv().expect("gap seam event channel closed early") {
            "ready" => {
                // Pre-fix shape: A is parked between its read and its
                // persist. B runs a full add to completion, then A
                // resumes and stores its stale list.
                let thread_b = {
                    let prefs = std::sync::Arc::clone(&prefs);
                    std::thread::spawn(move || recent_add_inner(&prefs, "/race-b.md"))
                };
                thread_b
                    .join()
                    .expect("thread B panicked")
                    .expect("B's add failed");
                let _ = release_tx.send(());
                thread_a
                    .join()
                    .expect("thread A panicked")
                    .expect("A's add failed");
            }
            "done" => {
                // Post-fix shape: the encompassing update never reaches
                // the (retired) seam; A completed without parking and
                // B serializes behind it on the store mutex.
                let thread_b = {
                    let prefs = std::sync::Arc::clone(&prefs);
                    std::thread::spawn(move || recent_add_inner(&prefs, "/race-b.md"))
                };
                thread_b
                    .join()
                    .expect("thread B panicked")
                    .expect("B's add failed");
                thread_a
                    .join()
                    .expect("thread A panicked")
                    .expect("A's add failed");
            }
            other => panic!("unexpected gap-seam event: {other}"),
        }

        // A fresh store over the same file must hold BOTH paths;
        // survivor order is deliberately not asserted.
        let fresh = PrefsState::from_path(prefs_path);
        let list = load(&fresh);
        assert!(
            list.contains(&"/race-a.md".to_string())
                && list.contains(&"/race-b.md".to_string()),
            "both concurrent adds must persist, got {list:?}"
        );
    }
}
