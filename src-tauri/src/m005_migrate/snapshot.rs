// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 step-1 — typed reader of the legacy
//            snapshot directory tree produced by Phase-B-pre2 step-5
//            preflight (snapshot::snapshot_legacy). Pure I/O scaffold:
//            answers "which namespaces are present, which files exist
//            per namespace" without parsing JSON content. Per-file
//            parsing is owned by steps 2-5 (preferences / dataCenter /
//            keybindings / recent-docs migrators).
//   SCOPE:   stdlib I/O only. No serde JSON, no keyring, no network.
//            Latest-timestamp-wins selection across multiple ts-N dirs
//            (each time the user clicks Continue in the migration
//            dialog, B-pre2 step-5 produces a new snapshot).
//   DEPENDS: stdlib only.
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1 step-1;
//            src-tauri/src/snapshot.rs (snapshot_legacy producer);
//            docs/verification-plan.xml V-M-005.
//   STATUS:  shipped 2026-04-29 with F-PREFS-MIGRATE-V1 step-1.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 F-PREFS-MIGRATE-V1 step-1: initial typed reader.

use std::path::{Path, PathBuf};

/// Per-namespace presence map. None for missing files; the path itself
/// (always under the snapshot's namespace dir) for present files.
/// Steps 2-5 read these paths directly without re-stating layout rules.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct NamespaceSnapshot {
    /// Absolute path to the namespace dir, e.g. `<cache_root>/snapshot/ts-N/marktext`.
    pub root: PathBuf,
    /// preferences.json — main electron-store config. Step-2 migrator owns parsing.
    pub preferences: Option<PathBuf>,
    /// dataCenter.json — image-upload runtime configs + secrets. Step-3.
    pub data_center: Option<PathBuf>,
    /// window-state.json — window geometry. Currently consumed by mt_window_state
    /// at runtime; not part of the v1.2.3 prefs migration scope.
    pub window_state: Option<PathBuf>,
    /// Local Storage/leveldb/ — Chromium localStorage IndexedDB. Contains
    /// keybindings + recent-docs in v1.2.3. Step-4/5 migrators own parsing
    /// (leveldb LDB record extraction is non-trivial; if this dir is
    /// absent we fall back to defaults + skip-with-warn).
    pub local_storage: Option<PathBuf>,
}

impl NamespaceSnapshot {
    /// True iff at least one of the migration-relevant files is present.
    /// window_state alone does NOT count — it's not part of the migration
    /// scope (see field doc).
    pub fn has_migratable_data(&self) -> bool {
        self.preferences.is_some() || self.data_center.is_some() || self.local_storage.is_some()
    }
}

/// Top-level reader result. Up to two namespaces (matching B-pre2
/// snapshot_legacy output: marktext + mark co-existence). dest is
/// the absolute path of the chosen ts-N directory (latest-mtime wins).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacySnapshot {
    /// Path of the ts-<unix> directory consumed for this read.
    pub ts_dir: PathBuf,
    /// "marktext" namespace contents (Mark Text v1.x default).
    pub marktext: Option<NamespaceSnapshot>,
    /// "mark" namespace contents (some forks / future stable channel).
    pub mark: Option<NamespaceSnapshot>,
}

impl LegacySnapshot {
    pub fn any_migratable(&self) -> bool {
        self.marktext.as_ref().map(|n| n.has_migratable_data()).unwrap_or(false)
            || self.mark.as_ref().map(|n| n.has_migratable_data()).unwrap_or(false)
    }
}

/// Reasons the snapshot tree could not be loaded. Caller picks the
/// fallback policy (skip migration, abort with native dialog, etc.).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotLoadError {
    /// `<cache_root>/snapshot/` directory does not exist. Means user
    /// has never completed the B-pre2 migration dialog.
    SnapshotDirMissing,
    /// `<cache_root>/snapshot/` exists but contains no `ts-N` subdir.
    /// Either pre-pre2 install or someone deleted the contents.
    NoTimestampedDir,
    /// I/O error reading cache_root/snapshot/. Permission, disk, etc.
    IoError(String),
}

/// Load the most recent snapshot under `cache_root/snapshot/ts-<unix>/`.
/// Pure I/O — no JSON parsing. Steps 2-5 read the returned paths.
///
/// Returns Err(SnapshotDirMissing) when no snapshot has ever been taken;
/// caller emits BLOCK_SNAPSHOT_NOT_FOUND and skips migration. Returns
/// Err(NoTimestampedDir) when the snapshot/ dir exists but is empty —
/// emits BLOCK_SNAPSHOT_EMPTY (likely after manual deletion).
pub fn load_latest(cache_root: &Path) -> Result<LegacySnapshot, SnapshotLoadError> {
    let snapshot_root = cache_root.join("snapshot");
    if !snapshot_root.exists() {
        eprintln!("[m005-migrate][snapshot][BLOCK_SNAPSHOT_NOT_FOUND]");
        return Err(SnapshotLoadError::SnapshotDirMissing);
    }
    if !snapshot_root.is_dir() {
        eprintln!("[m005-migrate][snapshot][BLOCK_SNAPSHOT_PATH_NOT_DIR]");
        return Err(SnapshotLoadError::IoError("snapshot path is not a directory".to_string()));
    }

    // Pick the latest ts-N by mtime. Each B-pre2 dialog Continue produces
    // a new ts-N; we want the most recent because the user may have
    // edited prefs in v1 between Continues.
    let entries = std::fs::read_dir(&snapshot_root)
        .map_err(|e| SnapshotLoadError::IoError(format!("read_dir snapshot/: {e}")))?;

    let mut candidates: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if !name.starts_with("ts-") {
            continue;
        }
        let mtime = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        candidates.push((path, mtime));
    }

    let latest = candidates.into_iter().max_by_key(|(_, t)| *t);
    let ts_dir = match latest {
        Some((p, _)) => p,
        None => {
            eprintln!("[m005-migrate][snapshot][BLOCK_SNAPSHOT_EMPTY]");
            return Err(SnapshotLoadError::NoTimestampedDir);
        }
    };

    let marktext = scan_namespace(&ts_dir.join("marktext"));
    let mark = scan_namespace(&ts_dir.join("mark"));

    eprintln!(
        "[m005-migrate][snapshot][BLOCK_SNAPSHOT_VALIDATED ts_dir={} marktext={} mark={}]",
        ts_dir.display(),
        marktext.is_some(),
        mark.is_some()
    );

    Ok(LegacySnapshot { ts_dir, marktext, mark })
}

/// Scan one namespace dir. Returns None when the namespace dir itself
/// is absent (one of marktext/mark wasn't snapshotted). The presence
/// of the dir without any migratable files is still Some(empty),
/// because B-pre2 always creates the dir even when only window-state
/// or Local Storage was present.
fn scan_namespace(ns_root: &Path) -> Option<NamespaceSnapshot> {
    if !ns_root.is_dir() {
        return None;
    }
    let preferences = present_file(ns_root, "preferences.json");
    let data_center = present_file(ns_root, "dataCenter.json");
    let window_state = present_file(ns_root, "window-state.json");
    let local_storage = {
        let p = ns_root.join("Local Storage");
        if p.is_dir() { Some(p) } else { None }
    };
    Some(NamespaceSnapshot {
        root: ns_root.to_path_buf(),
        preferences,
        data_center,
        window_state,
        local_storage,
    })
}

fn present_file(ns_root: &Path, name: &str) -> Option<PathBuf> {
    let p = ns_root.join(name);
    if p.is_file() { Some(p) } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_file(path: &Path, contents: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn missing_snapshot_dir_returns_typed_error() {
        let cache = TempDir::new().unwrap();
        let err = load_latest(cache.path()).unwrap_err();
        assert_eq!(err, SnapshotLoadError::SnapshotDirMissing);
    }

    #[test]
    fn empty_snapshot_dir_returns_no_timestamped_dir() {
        let cache = TempDir::new().unwrap();
        fs::create_dir_all(cache.path().join("snapshot")).unwrap();
        let err = load_latest(cache.path()).unwrap_err();
        assert_eq!(err, SnapshotLoadError::NoTimestampedDir);
    }

    #[test]
    fn ignores_non_ts_prefixed_subdirs() {
        let cache = TempDir::new().unwrap();
        fs::create_dir_all(cache.path().join("snapshot/something-else")).unwrap();
        let err = load_latest(cache.path()).unwrap_err();
        assert_eq!(err, SnapshotLoadError::NoTimestampedDir);
    }

    #[test]
    fn loads_full_marktext_namespace() {
        let cache = TempDir::new().unwrap();
        let ts = cache.path().join("snapshot/ts-1000/marktext");
        write_file(&ts.join("preferences.json"), b"{\"theme\":\"dark\"}");
        write_file(&ts.join("dataCenter.json"), b"{}");
        write_file(&ts.join("window-state.json"), b"{}");
        fs::create_dir_all(ts.join("Local Storage/leveldb")).unwrap();

        let snap = load_latest(cache.path()).unwrap();
        let ns = snap.marktext.as_ref().expect("marktext namespace must be present");
        assert!(ns.preferences.is_some());
        assert!(ns.data_center.is_some());
        assert!(ns.window_state.is_some());
        assert!(ns.local_storage.is_some());
        assert!(ns.has_migratable_data());
        assert!(snap.mark.is_none());
        assert!(snap.any_migratable());
    }

    #[test]
    fn partial_namespace_only_preferences() {
        let cache = TempDir::new().unwrap();
        let ts = cache.path().join("snapshot/ts-1000/marktext");
        write_file(&ts.join("preferences.json"), b"{}");

        let snap = load_latest(cache.path()).unwrap();
        let ns = snap.marktext.unwrap();
        assert!(ns.preferences.is_some());
        assert!(ns.data_center.is_none());
        assert!(ns.local_storage.is_none());
        assert!(ns.has_migratable_data());
    }

    #[test]
    fn window_state_alone_is_not_migratable() {
        // window-state is consumed by runtime mt_window_state, NOT prefs migration.
        let cache = TempDir::new().unwrap();
        let ts = cache.path().join("snapshot/ts-1000/marktext");
        write_file(&ts.join("window-state.json"), b"{}");

        let snap = load_latest(cache.path()).unwrap();
        let ns = snap.marktext.as_ref().unwrap();
        assert!(ns.window_state.is_some());
        assert!(!ns.has_migratable_data(), "window-state alone must not flag migratable");
        assert!(!snap.any_migratable());
    }

    #[test]
    fn picks_latest_ts_when_multiple_present() {
        let cache = TempDir::new().unwrap();
        // Older snapshot
        let ts_old = cache.path().join("snapshot/ts-1000/marktext");
        write_file(&ts_old.join("preferences.json"), b"{\"v\":\"old\"}");
        // Force older mtime by sleeping briefly between writes
        std::thread::sleep(std::time::Duration::from_millis(10));
        // Newer snapshot
        let ts_new = cache.path().join("snapshot/ts-2000/marktext");
        write_file(&ts_new.join("preferences.json"), b"{\"v\":\"new\"}");

        let snap = load_latest(cache.path()).unwrap();
        assert!(snap.ts_dir.ends_with("ts-2000"));
        let ns = snap.marktext.unwrap();
        let content = fs::read_to_string(ns.preferences.unwrap()).unwrap();
        assert!(content.contains("new"), "must read from latest snapshot");
    }

    #[test]
    fn both_namespaces_co_exist() {
        let cache = TempDir::new().unwrap();
        let ts = cache.path().join("snapshot/ts-1000");
        write_file(&ts.join("marktext/preferences.json"), b"{}");
        write_file(&ts.join("mark/preferences.json"), b"{}");

        let snap = load_latest(cache.path()).unwrap();
        assert!(snap.marktext.is_some());
        assert!(snap.mark.is_some());
        assert!(snap.any_migratable());
    }

    #[test]
    fn missing_namespace_dir_returns_none_for_that_namespace() {
        let cache = TempDir::new().unwrap();
        let ts = cache.path().join("snapshot/ts-1000/marktext");
        write_file(&ts.join("preferences.json"), b"{}");
        // mark namespace not snapshotted

        let snap = load_latest(cache.path()).unwrap();
        assert!(snap.marktext.is_some());
        assert!(snap.mark.is_none());
    }

    #[test]
    fn snapshot_path_that_is_a_file_is_io_error() {
        let cache = TempDir::new().unwrap();
        // snapshot is a regular file, not a directory
        write_file(&cache.path().join("snapshot"), b"oops");
        let err = load_latest(cache.path()).unwrap_err();
        match err {
            SnapshotLoadError::IoError(_) => {}
            other => panic!("expected IoError, got {other:?}"),
        }
    }
}
