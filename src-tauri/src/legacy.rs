// MODULE_CONTRACT
//   PURPOSE: Detect pre-existing electron-store namespaces (marktext legacy + mark v1.x)
//            in macOS Application Support BEFORE tauri::Builder runs, so the migration
//            decision is available before any window or IPC layer initializes.
//   SCOPE: Read-only filesystem stat. No JSON parsing, no migration, no writes.
//   DEPENDS: stdlib only (std::path, std::env, std::fs::metadata via Path::is_*).
//   LINKS: M-005 mt-prefs (consumes detection output to choose migration path);
//          V-M-001 (this module's verification ref);
//          fixtures/v0-marktext-userdata/, fixtures/v1-userdata-mark-1.0.2/.
//   LOG MARKERS: [legacy][detect][BLOCK_LEGACY_FOUND],
//                [legacy][detect][BLOCK_LEGACY_NONE].

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct LegacyLayouts {
    pub marktext: Option<LegacyNamespace>,
    pub mark: Option<LegacyNamespace>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LegacyNamespace {
    pub root: PathBuf,
    pub has_preferences: bool,
    pub has_data_center: bool,
    pub has_window_state: bool,
    pub has_local_storage: bool,
}

impl LegacyLayouts {
    pub fn any_detected(&self) -> bool {
        self.marktext.is_some() || self.mark.is_some()
    }
}

/// macOS-only for now; Linux/Windows handled in a later phase.
pub fn macos_app_support_root() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join("Library").join("Application Support"))
}

pub fn detect_layouts_in(base: &Path) -> LegacyLayouts {
    LegacyLayouts {
        marktext: detect_namespace(&base.join("marktext")),
        mark: detect_namespace(&base.join("mark")),
    }
}

pub fn detect_layouts() -> LegacyLayouts {
    macos_app_support_root()
        .map(|root| detect_layouts_in(&root))
        .unwrap_or_default()
}

fn detect_namespace(dir: &Path) -> Option<LegacyNamespace> {
    if !dir.is_dir() {
        return None;
    }
    Some(LegacyNamespace {
        root: dir.to_path_buf(),
        has_preferences: dir.join("preferences.json").is_file(),
        has_data_center: dir.join("dataCenter.json").is_file(),
        has_window_state: dir.join("window-state.json").is_file(),
        has_local_storage: dir.join("Local Storage").is_dir(),
    })
}

/// Emit a stable log marker line describing what was detected.
/// Used both at boot (main.rs) and asserted by V-M-001 tests.
pub fn log_detection(layouts: &LegacyLayouts) {
    if layouts.any_detected() {
        eprintln!(
            "[legacy][detect][BLOCK_LEGACY_FOUND] marktext={:?} mark={:?}",
            layouts.marktext.as_ref().map(|n| n.root.display().to_string()),
            layouts.mark.as_ref().map(|n| n.root.display().to_string()),
        );
    } else {
        eprintln!("[legacy][detect][BLOCK_LEGACY_NONE]");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write(path: &Path, contents: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn detects_nothing_in_empty_root() {
        let tmp = TempDir::new().unwrap();
        let layouts = detect_layouts_in(tmp.path());
        assert!(!layouts.any_detected());
        assert_eq!(layouts.marktext, None);
        assert_eq!(layouts.mark, None);
    }

    #[test]
    fn detects_marktext_namespace_with_partial_files() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("marktext");
        write(&dir.join("preferences.json"), b"{\"theme\":\"dark\"}");
        // dataCenter.json missing — should still detect with has_data_center=false

        let layouts = detect_layouts_in(tmp.path());
        let ns = layouts.marktext.expect("marktext namespace must be detected");
        assert_eq!(ns.root, dir);
        assert!(ns.has_preferences);
        assert!(!ns.has_data_center);
        assert!(!ns.has_window_state);
        assert!(!ns.has_local_storage);
        assert!(layouts.mark.is_none());
    }

    #[test]
    fn detects_mark_namespace_full_set() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("mark");
        write(&dir.join("preferences.json"), b"{}");
        write(&dir.join("dataCenter.json"), b"{}");
        write(&dir.join("window-state.json"), b"{}");
        fs::create_dir_all(dir.join("Local Storage")).unwrap();

        let layouts = detect_layouts_in(tmp.path());
        let ns = layouts.mark.expect("mark namespace must be detected");
        assert!(ns.has_preferences);
        assert!(ns.has_data_center);
        assert!(ns.has_window_state);
        assert!(ns.has_local_storage);
    }

    #[test]
    fn detects_both_namespaces_simultaneously() {
        let tmp = TempDir::new().unwrap();
        write(&tmp.path().join("marktext/preferences.json"), b"{}");
        write(&tmp.path().join("mark/preferences.json"), b"{}");

        let layouts = detect_layouts_in(tmp.path());
        assert!(layouts.marktext.is_some());
        assert!(layouts.mark.is_some());
        assert!(layouts.any_detected());
    }

    #[test]
    fn ignores_namespace_when_only_a_file_not_directory() {
        let tmp = TempDir::new().unwrap();
        // marktext exists as a regular FILE, not a directory — should NOT be detected
        write(&tmp.path().join("marktext"), b"not a dir");
        let layouts = detect_layouts_in(tmp.path());
        assert!(layouts.marktext.is_none());
    }

    #[test]
    fn log_detection_runs_without_panic_for_both_branches() {
        let empty = LegacyLayouts::default();
        log_detection(&empty); // BLOCK_LEGACY_NONE branch
        let with = LegacyLayouts {
            marktext: Some(LegacyNamespace {
                root: PathBuf::from("/tmp/x"),
                has_preferences: true,
                has_data_center: false,
                has_window_state: false,
                has_local_storage: false,
            }),
            mark: None,
        };
        log_detection(&with); // BLOCK_LEGACY_FOUND branch
    }

    #[test]
    fn macos_app_support_root_resolves_when_home_set() {
        // Save and restore HOME to avoid cross-test contamination.
        let saved = std::env::var_os("HOME");
        std::env::set_var("HOME", "/tmp/__test_home_legacy");
        let root = macos_app_support_root().unwrap();
        assert_eq!(
            root,
            PathBuf::from("/tmp/__test_home_legacy/Library/Application Support")
        );
        // Restore.
        match saved {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
    }

    #[test]
    fn any_detected_true_when_only_marktext_present() {
        let l = LegacyLayouts {
            marktext: Some(LegacyNamespace {
                root: PathBuf::from("/x"),
                has_preferences: false,
                has_data_center: false,
                has_window_state: false,
                has_local_storage: false,
            }),
            mark: None,
        };
        assert!(l.any_detected());
    }

    #[test]
    fn any_detected_false_when_default() {
        assert!(!LegacyLayouts::default().any_detected());
    }
}
