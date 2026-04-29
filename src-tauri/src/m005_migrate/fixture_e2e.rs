// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 step-9 — end-to-end fixture-driven
//            test that exercises the full 6-step migration pipeline
//            against the canonical legacy data tree at
//            test/fixtures/legacy-v1.2.3-full/marktext/. The fixture
//            mirrors the real shape of preferences.json + dataCenter.json
//            + keybindings.json + recently-used-documents.json so the
//            runner sees realistic key counts and types.
//   SCOPE:   pure #[cfg(test)] integration. No production code lives
//            here — this module is conditionally compiled out of
//            release binaries.
//   DEPENDS: m005_migrate::{snapshot, runner, preferences, data_center,
//            keybindings, recent_docs, keychain}; m005_prefs;
//            m006_shortcuts (for KEY_SHORTCUTS); m017_recent (for
//            KEY_RECENT_DOCS).
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1 step-9;
//            test/fixtures/legacy-v1.2.3-full/marktext/.
//   STATUS:  shipped 2026-04-29 with F-PREFS-MIGRATE-V1 step-9.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 step-9: initial fixture-driven e2e harness.

#![cfg(test)]

use crate::m005_migrate::{keychain, runner};
use crate::m005_prefs::{PrefsStore, KEY_MIGRATION_NS};
use crate::m006_shortcuts::KEY_SHORTCUTS;
use crate::m017_recent::KEY_RECENT_DOCS;
use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tempfile::TempDir;

/// In-memory keychain stub for fixture tests. Same shape as
/// runner::tests::StubKeychain but lives here so this file is
/// self-contained for the F-PREFS-MIGRATE-V1 step-9 deliverable.
struct StubKeychain {
    store: RefCell<HashMap<(String, String), String>>,
}
impl StubKeychain {
    fn new() -> Self {
        Self {
            store: RefCell::new(HashMap::new()),
        }
    }
    fn seed(&self, s: &str, k: &str, v: &str) {
        self.store
            .borrow_mut()
            .insert((s.to_string(), k.to_string()), v.to_string());
    }
    fn has(&self, s: &str, k: &str) -> bool {
        self.store
            .borrow()
            .contains_key(&(s.to_string(), k.to_string()))
    }
    fn value(&self, s: &str, k: &str) -> Option<String> {
        self.store
            .borrow()
            .get(&(s.to_string(), k.to_string()))
            .cloned()
    }
}
impl keychain::KeychainBackend for StubKeychain {
    fn get(
        &self,
        s: &str,
        k: &str,
    ) -> Result<Option<String>, keychain::KeychainBackendError> {
        Ok(self
            .store
            .borrow()
            .get(&(s.to_string(), k.to_string()))
            .cloned())
    }
    fn set(
        &self,
        s: &str,
        k: &str,
        v: &str,
    ) -> Result<(), keychain::KeychainBackendError> {
        self.store
            .borrow_mut()
            .insert((s.to_string(), k.to_string()), v.to_string());
        Ok(())
    }
    fn delete(&self, s: &str, k: &str) -> Result<(), keychain::KeychainBackendError> {
        self.store
            .borrow_mut()
            .remove(&(s.to_string(), k.to_string()));
        Ok(())
    }
}

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri parent")
        .join("test/fixtures/legacy-v1.2.3-full")
}

/// Seed a TempDir's cache_root with snapshot/ts-N/marktext/ pre-populated
/// from the canonical fixture. Mirrors what B-pre2 step-5 snapshot_legacy
/// produces at runtime.
fn seed_snapshot_from_fixture(cache_root: &Path) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let dest = cache_root.join(format!("snapshot/ts-{ts}/marktext"));
    fs::create_dir_all(&dest).unwrap();
    let src = fixture_root().join("marktext");
    for name in [
        "preferences.json",
        "dataCenter.json",
        "keybindings.json",
        "recently-used-documents.json",
    ] {
        let src_p = src.join(name);
        if src_p.is_file() {
            fs::copy(&src_p, dest.join(name)).unwrap();
        }
    }
    dest
}

#[test]
fn fixture_files_exist() {
    let root = fixture_root().join("marktext");
    assert!(
        root.is_dir(),
        "fixture dir missing: {} — check test/fixtures/legacy-v1.2.3-full/marktext/",
        root.display()
    );
    for f in [
        "preferences.json",
        "dataCenter.json",
        "keybindings.json",
        "recently-used-documents.json",
    ] {
        assert!(
            root.join(f).is_file(),
            "fixture file missing: {}/{f}",
            root.display()
        );
    }
}

#[test]
fn full_pipeline_against_canonical_fixture() {
    let cache = TempDir::new().unwrap();
    let mut store = PrefsStore::load_from(cache.path().join("preferences.json"));
    let kc = StubKeychain::new();
    kc.seed(keychain::LEGACY_SERVICE, "githubToken", "ghp_e2e_fixture");

    seed_snapshot_from_fixture(cache.path());

    let summary = runner::run(cache.path(), &kc, &mut store)
        .expect("runner must succeed on canonical fixture");
    assert!(
        summary.first_failure.is_none(),
        "no per-step failure expected: {:?}",
        summary.first_failure
    );

    // ── preferences.json: 69 user keys + __internal__ skipped ──
    use crate::m005_migrate::preferences::PreferencesMigrationOutcome;
    match summary.preferences {
        Some(PreferencesMigrationOutcome::Migrated { keys_migrated, keys_skipped }) => {
            // Fixture has 68 user keys + 1 __internal__ key.
            assert_eq!(keys_migrated, 68, "fixture preferences key count");
            assert_eq!(keys_skipped, 1, "exactly __internal__ skipped");
        }
        other => panic!("unexpected preferences outcome: {other:?}"),
    }
    assert_eq!(store.get("theme"), Some(&Value::String("ayu-mirage".into())));
    assert_eq!(store.get("fontSize"), Some(&Value::Number(16.into())));
    assert!(store.get("__internal__").is_none(), "internal key filtered");

    // ── dataCenter.json: 6 keys, no collisions ──
    use crate::m005_migrate::data_center::DataCenterMigrationOutcome;
    match summary.data_center {
        Some(DataCenterMigrationOutcome::Migrated {
            keys_migrated,
            keys_collided,
            keys_unknown,
        }) => {
            assert_eq!(keys_migrated, 6);
            assert_eq!(keys_collided, 0);
            assert_eq!(keys_unknown, 0);
        }
        other => panic!("unexpected data_center outcome: {other:?}"),
    }
    assert_eq!(
        store.get("currentUploader"),
        Some(&Value::String("github".into()))
    );

    // ── keybindings.json: 5 user overrides, no invalid, no unset ──
    use crate::m005_migrate::keybindings::KeybindingsMigrationOutcome;
    match summary.keybindings {
        Some(KeybindingsMigrationOutcome::Migrated {
            keys_migrated,
            keys_invalid,
            keys_unset,
        }) => {
            assert_eq!(keys_migrated, 5);
            assert_eq!(keys_invalid, 0);
            assert_eq!(keys_unset, 0);
        }
        other => panic!("unexpected keybindings outcome: {other:?}"),
    }
    let bindings_raw = store.get(KEY_SHORTCUTS).expect("shortcuts must be set");
    let bindings: Vec<crate::m006_shortcuts::ShortcutBinding> =
        serde_json::from_value(bindings_raw.clone()).unwrap();
    assert_eq!(bindings.len(), 5);
    let cmds: Vec<&str> = bindings.iter().map(|b| b.command.as_str()).collect();
    assert!(cmds.contains(&"file.save"));
    assert!(cmds.contains(&"view.toggle-sidebar"));

    // ── recently-used-documents.json: 4 unique paths, no dedupes ──
    use crate::m005_migrate::recent_docs::RecentDocsMigrationOutcome;
    match summary.recent_docs {
        Some(RecentDocsMigrationOutcome::Migrated {
            keys_migrated,
            keys_skipped,
            keys_capped,
        }) => {
            assert_eq!(keys_migrated, 4);
            assert_eq!(keys_skipped, 0);
            assert_eq!(keys_capped, 0);
        }
        other => panic!("unexpected recent_docs outcome: {other:?}"),
    }
    let recent = store.get(KEY_RECENT_DOCS).unwrap().as_array().unwrap();
    assert_eq!(recent.len(), 4);
    assert_eq!(
        recent[0],
        Value::String("/tmp/fixture/notes/alpha.md".into())
    );

    // ── keychain rename: legacy githubToken → v2 ──
    let kc_outcome = summary.keychain.expect("keychain step ran");
    assert_eq!(kc_outcome.renamed, 1);
    assert_eq!(kc_outcome.absent, 0);
    assert_eq!(kc_outcome.target_collision, 0);
    assert_eq!(kc_outcome.permission_denied, 0);
    assert_eq!(
        kc.value(keychain::NEW_SERVICE, "githubToken"),
        Some("ghp_e2e_fixture".into())
    );
    assert!(!kc.has(keychain::LEGACY_SERVICE, "githubToken"));

    // ── all 5 idempotency markers set under KEY_MIGRATION_NS ──
    let ns = store.get(KEY_MIGRATION_NS).unwrap().as_object().unwrap();
    for marker in [
        "preferences_v1",
        "data_center_v1",
        "keybindings_v1",
        "recent_docs_v1",
        "keychain_v1",
    ] {
        assert_eq!(
            ns.get(marker).and_then(|v| v.as_str()),
            Some("done"),
            "marker {marker} must be 'done'",
        );
    }
}

#[test]
fn idempotent_re_run_on_canonical_fixture() {
    let cache = TempDir::new().unwrap();
    let mut store = PrefsStore::load_from(cache.path().join("preferences.json"));
    let kc = StubKeychain::new();
    seed_snapshot_from_fixture(cache.path());

    // First run does the work.
    runner::run(cache.path(), &kc, &mut store).unwrap();
    let theme_after_run_1 = store.get("theme").cloned();

    // Drop a junk value into a key that the migrator would NOT
    // re-touch on the second run (because the marker short-circuits
    // it). If the migrator re-ran, our junk would be replaced by the
    // fixture's "ayu-mirage".
    store.set("theme".to_string(), Value::String("local-edit".into()));

    // Re-seed snapshot so load_latest finds something (the lock
    // released after run-1 already; nothing to clean up).
    seed_snapshot_from_fixture(cache.path());

    let summary = runner::run(cache.path(), &kc, &mut store).unwrap();
    assert!(summary.first_failure.is_none());

    // Every migrator should report AlreadyDone.
    use crate::m005_migrate::data_center::DataCenterMigrationOutcome;
    use crate::m005_migrate::keybindings::KeybindingsMigrationOutcome;
    use crate::m005_migrate::preferences::PreferencesMigrationOutcome;
    use crate::m005_migrate::recent_docs::RecentDocsMigrationOutcome;
    assert!(matches!(
        summary.preferences,
        Some(PreferencesMigrationOutcome::AlreadyDone)
    ));
    assert!(matches!(
        summary.data_center,
        Some(DataCenterMigrationOutcome::AlreadyDone)
    ));
    assert!(matches!(
        summary.keybindings,
        Some(KeybindingsMigrationOutcome::AlreadyDone)
    ));
    assert!(matches!(
        summary.recent_docs,
        Some(RecentDocsMigrationOutcome::AlreadyDone)
    ));
    // Keychain "AlreadyDone" returns zero-counters outcome (not a
    // separate variant — see keychain.rs is_already_done short-circuit).
    let kc_outcome = summary.keychain.unwrap();
    assert_eq!(kc_outcome.renamed, 0);
    assert_eq!(kc_outcome.absent, 0);

    // The local edit must survive — runner did NOT re-run preferences.
    assert_eq!(store.get("theme"), Some(&Value::String("local-edit".into())));
    // theme_after_run_1 confirms run-1 had set it correctly.
    assert_eq!(theme_after_run_1, Some(Value::String("ayu-mirage".into())));
}

#[test]
fn no_snapshot_against_fresh_cache_root_clean_exit() {
    // Sanity: empty cache_root (no snapshot subdir at all) → runner
    // returns clean summary with no work done. Exercises the
    // BLOCK_NO_SNAPSHOT_NOOP path with the real PrefsStore + RealKeychain
    // contract surface used in production boot.
    let cache = TempDir::new().unwrap();
    let mut store = PrefsStore::load_from(cache.path().join("preferences.json"));
    let kc = StubKeychain::new();
    let summary = runner::run(cache.path(), &kc, &mut store).unwrap();
    assert!(summary.first_failure.is_none());
    assert!(summary.snapshot_ts_dir.is_none());
    assert!(summary.preferences.is_none());
    // No markers written.
    assert!(store.get(KEY_MIGRATION_NS).is_none());
}
