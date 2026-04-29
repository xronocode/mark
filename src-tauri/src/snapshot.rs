// MODULE_CONTRACT
//   PURPOSE: On the migration-dialog Continue path, copy migration-relevant
//            files from each detected legacy namespace into a timestamped
//            directory under cache_root/snapshot/ so the future M-005
//            (Phase-B3) has a stable read-only source. The original data
//            in ~/Library/Application Support is NEVER touched here —
//            move/delete is M-005's responsibility, not the preflight's.
//   SCOPE: Copy preferences.json + dataCenter.json + window-state.json +
//          Local Storage/ subtree per namespace. Excludes Chromium
//          internals (Cache, GPUCache, blob_storage, Crashpad, ...) by
//          allow-listing only the migration-relevant paths.
//   DEPENDS: stdlib std::fs only; consumes LegacyLayouts from crate::legacy.
//   LINKS: M-022 mt-paths (cache_root); M-005 mt-prefs (future consumer);
//          Phase-B-pre1 step-3 fixture-capture pattern (this module is
//          the runtime equivalent at boot time); Phase-B-pre2 step-5.
//   LOG MARKERS: none emitted by this module — bootstrap (main.rs) emits
//                BLOCK_SNAPSHOT_LEGACY / BLOCK_SNAPSHOT_FAILED based on
//                the Result returned here. Same single-emit-point
//                discipline as cancel_log per trace-contract.

use crate::legacy::LegacyLayouts;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const RELEVANT_FILES: &[&str] = &[
    "preferences.json",
    "dataCenter.json",
    "window-state.json",
    "keybindings.json",
    "recently-used-documents.json",
];

const RELEVANT_DIRS: &[&str] = &["Local Storage"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotResult {
    /// Absolute path of the directory where legacy data was copied.
    pub dest: PathBuf,
    /// Total bytes copied across all namespaces and files.
    pub bytes: u64,
    /// Total file count copied across all namespaces.
    pub files: u32,
}

/// Build a fresh snapshot of every detected legacy namespace under
/// `cache_root/snapshot/ts-<unix>/<namespace>/`.
///
/// Returns Ok with the result even when `layouts.any_detected()` is
/// false — in that case `result.files == 0`. Caller can decide whether
/// the no-op snapshot is worth emitting BLOCK_SNAPSHOT_LEGACY for.
pub fn snapshot_legacy(layouts: &LegacyLayouts, cache_root: &Path) -> std::io::Result<SnapshotResult> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dest = cache_root.join("snapshot").join(format!("ts-{ts}"));
    std::fs::create_dir_all(&dest)?;

    let mut total_bytes = 0u64;
    let mut total_files = 0u32;

    if let Some(ns) = &layouts.marktext {
        let (b, f) = snapshot_namespace(&ns.root, &dest.join("marktext"))?;
        total_bytes += b;
        total_files += f;
    }
    if let Some(ns) = &layouts.mark {
        let (b, f) = snapshot_namespace(&ns.root, &dest.join("mark"))?;
        total_bytes += b;
        total_files += f;
    }

    Ok(SnapshotResult {
        dest,
        bytes: total_bytes,
        files: total_files,
    })
}

fn snapshot_namespace(src: &Path, dst: &Path) -> std::io::Result<(u64, u32)> {
    std::fs::create_dir_all(dst)?;
    let mut bytes = 0u64;
    let mut files = 0u32;

    for name in RELEVANT_FILES {
        let src_file = src.join(name);
        if src_file.is_file() {
            let dst_file = dst.join(name);
            std::fs::copy(&src_file, &dst_file)?;
            bytes += std::fs::metadata(&dst_file)?.len();
            files += 1;
        }
    }

    for name in RELEVANT_DIRS {
        let src_dir = src.join(name);
        if src_dir.is_dir() {
            copy_dir_recursive(&src_dir, &dst.join(name), &mut bytes, &mut files)?;
        }
    }

    Ok((bytes, files))
}

fn copy_dir_recursive(
    src: &Path,
    dst: &Path,
    bytes: &mut u64,
    files: &mut u32,
) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_p = entry.path();
        let dst_p = dst.join(entry.file_name());
        let ft = entry.file_type()?;
        if ft.is_dir() {
            copy_dir_recursive(&src_p, &dst_p, bytes, files)?;
        } else if ft.is_file() {
            std::fs::copy(&src_p, &dst_p)?;
            *bytes += entry.metadata()?.len();
            *files += 1;
        }
        // Skip symlinks and special files — migration data shouldn't have them.
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::legacy::{LegacyLayouts, LegacyNamespace};
    use std::fs;
    use tempfile::TempDir;

    fn write_file(path: &Path, contents: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    fn synth_namespace(base: &Path, name: &str) -> LegacyNamespace {
        let dir = base.join(name);
        write_file(&dir.join("preferences.json"), b"{\"theme\":\"dark\"}");
        write_file(&dir.join("dataCenter.json"), b"{}");
        write_file(&dir.join("window-state.json"), b"{\"width\":1024}");
        write_file(&dir.join("Local Storage/leveldb/CURRENT"), b"MANIFEST-000001\n");
        write_file(&dir.join("Local Storage/leveldb/000003.log"), &vec![0u8; 256]);
        // Chromium internals that MUST be excluded from the snapshot.
        write_file(&dir.join("Cache/Cache_Data/0_0_0_0"), &vec![0u8; 4096]);
        write_file(&dir.join("GPUCache/data_0"), &vec![0u8; 8192]);
        write_file(&dir.join("blob_storage/x"), &vec![0u8; 2048]);
        LegacyNamespace {
            root: dir,
            has_preferences: true,
            has_data_center: true,
            has_window_state: true,
            has_local_storage: true,
        }
    }

    #[test]
    fn no_op_when_no_namespaces_detected() {
        let tmp = TempDir::new().unwrap();
        let cache = tmp.path().join("cache");
        let layouts = LegacyLayouts::default();
        let r = snapshot_legacy(&layouts, &cache).unwrap();
        assert_eq!(r.files, 0);
        assert_eq!(r.bytes, 0);
        // The timestamped dest dir is created (so the marker can reference it).
        assert!(r.dest.is_dir());
    }

    #[test]
    fn snapshot_marktext_only_copies_relevant_files() {
        let tmp = TempDir::new().unwrap();
        let src_root = tmp.path().join("src");
        let cache = tmp.path().join("cache");
        let ns = synth_namespace(&src_root, "marktext");
        let layouts = LegacyLayouts {
            marktext: Some(ns),
            mark: None,
        };

        let r = snapshot_legacy(&layouts, &cache).unwrap();
        // 3 top-level JSONs + 2 files inside Local Storage/leveldb/
        assert_eq!(r.files, 5);
        assert!(r.bytes > 0);
        assert!(r.dest.join("marktext/preferences.json").is_file());
        assert!(r.dest.join("marktext/dataCenter.json").is_file());
        assert!(r.dest.join("marktext/window-state.json").is_file());
        assert!(r.dest.join("marktext/Local Storage/leveldb/CURRENT").is_file());
        assert!(r.dest.join("marktext/Local Storage/leveldb/000003.log").is_file());

        // Negative assertions: Chromium internals MUST NOT be in the snapshot.
        assert!(!r.dest.join("marktext/Cache").exists());
        assert!(!r.dest.join("marktext/GPUCache").exists());
        assert!(!r.dest.join("marktext/blob_storage").exists());
    }

    #[test]
    fn snapshot_both_namespaces_separately() {
        let tmp = TempDir::new().unwrap();
        let src_root = tmp.path().join("src");
        let cache = tmp.path().join("cache");
        let layouts = LegacyLayouts {
            marktext: Some(synth_namespace(&src_root, "marktext")),
            mark: Some(synth_namespace(&src_root, "mark")),
        };

        let r = snapshot_legacy(&layouts, &cache).unwrap();
        // 5 files per namespace × 2 namespaces.
        assert_eq!(r.files, 10);
        assert!(r.dest.join("marktext/preferences.json").is_file());
        assert!(r.dest.join("mark/preferences.json").is_file());
    }

    #[test]
    fn snapshot_preserves_file_content_byte_for_byte() {
        let tmp = TempDir::new().unwrap();
        let src_root = tmp.path().join("src");
        let cache = tmp.path().join("cache");
        let ns = synth_namespace(&src_root, "mark");
        let layouts = LegacyLayouts {
            marktext: None,
            mark: Some(ns),
        };

        let r = snapshot_legacy(&layouts, &cache).unwrap();
        let snap = fs::read(r.dest.join("mark/preferences.json")).unwrap();
        let orig = fs::read(src_root.join("mark/preferences.json")).unwrap();
        assert_eq!(snap, orig);
    }

    #[test]
    fn snapshot_does_not_touch_original_data() {
        let tmp = TempDir::new().unwrap();
        let src_root = tmp.path().join("src");
        let cache = tmp.path().join("cache");
        let ns = synth_namespace(&src_root, "mark");
        let original_path = ns.root.join("preferences.json");
        let original_before = fs::metadata(&original_path).unwrap().modified().unwrap();
        let original_bytes = fs::read(&original_path).unwrap();

        let layouts = LegacyLayouts {
            marktext: None,
            mark: Some(ns),
        };
        let _ = snapshot_legacy(&layouts, &cache).unwrap();

        let original_after = fs::metadata(&original_path).unwrap().modified().unwrap();
        let original_bytes_after = fs::read(&original_path).unwrap();
        assert_eq!(original_before, original_after, "mtime drifted on original");
        assert_eq!(original_bytes, original_bytes_after, "content drifted on original");
    }

    #[test]
    fn each_run_creates_fresh_timestamped_dest() {
        let tmp = TempDir::new().unwrap();
        let src_root = tmp.path().join("src");
        let cache = tmp.path().join("cache");
        let layouts = LegacyLayouts {
            marktext: Some(synth_namespace(&src_root, "marktext")),
            mark: None,
        };

        let r1 = snapshot_legacy(&layouts, &cache).unwrap();
        // Forced second-resolution clock skew so timestamp differs:
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let r2 = snapshot_legacy(&layouts, &cache).unwrap();
        assert_ne!(r1.dest, r2.dest);
        // Both snapshots survive — append-only, never overwrites.
        assert!(r1.dest.is_dir());
        assert!(r2.dest.is_dir());
    }
}
