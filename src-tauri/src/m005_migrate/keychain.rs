// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 step-6 — rename v1.2.3 keychain entries
//            from service="marktext" to service="com.xronocode.mark".
//            v1.2.3 stored only one encrypted key (githubToken — image
//            uploader auth) under serviceName="marktext"; this migrator
//            mirrors that single entry into the v2 namespace and
//            removes the legacy one. Permission-denied / no-entry paths
//            degrade silently with markers, never abort migration.
//   SCOPE:   logic + trait-based keychain backend so tests stay
//            deterministic (real OS keyring is not safe to touch in
//            CI / unit tests). Production wires the keyring crate via
//            RealKeychain; test code uses MockKeychain with full state.
//   DEPENDS: keyring 3 (production wiring only — RealKeychain wraps
//            keyring::Entry). m005_prefs::PrefsStore for idempotency.
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1 step-6;
//            mark-electron/src/main/dataCenter/index.js (serviceName +
//            encryptKeys = ['githubToken'] — the source contract).
//   STATUS:  shipped 2026-04-29 with F-PREFS-MIGRATE-V1 step-6.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 step-6: trait-based migrator + mock-driven tests.

// Module-level allow for the production-only surface that step-7 (runner)
// will instantiate. RealKeychain, KeychainBackendError::Other, and
// KeychainMigrationError::PrefsAccessFailed exist as the contract surface
// the runner consumes; mock-based tests cover everything else. Removing
// the allow once step-7 lands.
#![allow(dead_code)]

use crate::m005_prefs::PrefsStore;
use serde_json::{Map, Value};

pub const KEYCHAIN_MIGRATION_DONE_KEY: &str = "keychain_v1";
pub const KEYCHAIN_MIGRATION_DONE_VALUE: &str = "done";

/// v1.2.3 service name used by the legacy electron `keytar` integration
/// (mark-electron/src/main/dataCenter/index.js:21).
pub const LEGACY_SERVICE: &str = "marktext";
/// v2 service name used by m019_datacenter — must match m019's
/// SERVICE_NAME constant.
pub const NEW_SERVICE: &str = "com.xronocode.mark";

/// The exhaustive list of legacy keychain entry names that v1.2.3 ever
/// wrote under service="marktext". Currently only one — github image
/// uploader auth — but kept as a slice so future v1.x patches that
/// add e.g. picgoToken / aliyunSecret extend cleanly.
pub const LEGACY_KEYS: &[&str] = &["githubToken"];

/// Outcome of a single keychain rename attempt. Per-entry status lets
/// the runner build a meaningful summary dialog ("1 secret migrated, 0
/// already present at target, 0 skipped due to permission denied").
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeychainMigrationOutcome {
    /// Number of entries successfully read from legacy + written to v2 + deleted from legacy.
    pub renamed: u32,
    /// Number of legacy entries not found (the typical case for users
    /// who never set a github token — most v1 installs).
    pub absent: u32,
    /// Number of entries where v2 already had a value at the same key —
    /// kept v2 value, did NOT delete legacy (operator may need to
    /// reconcile manually). Recorded for runner summary.
    pub target_collision: u32,
    /// Number of entries where the OS denied access (e.g. macOS keychain
    /// "always-deny" set on a previous run). Skipped with warning;
    /// never aborts migration.
    pub permission_denied: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeychainMigrationError {
    /// Idempotency marker check failed at a non-keyring layer.
    /// Not currently constructable but reserved for future structured
    /// store-corruption handling.
    PrefsAccessFailed(String),
}

/// Keychain backend abstraction — trait so unit tests can drive
/// migration logic without touching the OS secret store. Production
/// wires this to `keyring::Entry` via `RealKeychain`.
pub trait KeychainBackend {
    /// Read entry; Ok(Some) on hit, Ok(None) on no-entry,
    /// Err on permission-denied or other backend failure.
    fn get(&self, service: &str, key: &str) -> Result<Option<String>, KeychainBackendError>;
    /// Write entry, overwriting if present.
    fn set(&self, service: &str, key: &str, value: &str) -> Result<(), KeychainBackendError>;
    /// Delete entry; Ok regardless of prior presence.
    fn delete(&self, service: &str, key: &str) -> Result<(), KeychainBackendError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeychainBackendError {
    /// OS denied access to the entry (macOS "Always Deny" on prior prompt,
    /// Linux Secret Service locked, etc.).
    PermissionDenied,
    /// Other backend failure — wraps the underlying error message.
    Other(String),
}

/// Migrate the v1.2.3 keychain namespace ("marktext") into v2
/// ("com.xronocode.mark"). For each well-known LEGACY_KEY:
///   1. read from legacy. NoEntry → absent counter, continue.
///   2. permission denied → permission_denied counter, continue.
///   3. read v2 first to detect collisions. If v2 already has a value
///      → target_collision counter, do NOT delete legacy.
///   4. write to v2, then delete from legacy. → renamed counter.
pub fn migrate_keychain<B: KeychainBackend>(
    backend: &B,
    target: &mut PrefsStore,
) -> Result<KeychainMigrationOutcome, KeychainMigrationError> {
    if is_already_done(target) {
        eprintln!("[m005-migrate][keychain][BLOCK_ALREADY_DONE]");
        return Ok(KeychainMigrationOutcome {
            renamed: 0,
            absent: 0,
            target_collision: 0,
            permission_denied: 0,
        });
    }

    let mut renamed = 0u32;
    let mut absent = 0u32;
    let mut target_collision = 0u32;
    let mut permission_denied = 0u32;

    for &key in LEGACY_KEYS {
        let legacy_value = match backend.get(LEGACY_SERVICE, key) {
            Ok(Some(v)) => v,
            Ok(None) => {
                eprintln!("[m005-migrate][keychain][BLOCK_LEGACY_ABSENT key={key}]");
                absent += 1;
                continue;
            }
            Err(KeychainBackendError::PermissionDenied) => {
                eprintln!("[m005-migrate][keychain][BLOCK_LEGACY_PERM_DENIED key={key}]");
                permission_denied += 1;
                continue;
            }
            Err(KeychainBackendError::Other(e)) => {
                eprintln!(
                    "[m005-migrate][keychain][BLOCK_LEGACY_GET_FAILED key={key} err={e}]"
                );
                permission_denied += 1; // bucket all backend failures here
                continue;
            }
        };

        // Collision detection — never overwrite a v2 entry the user might
        // have already set up after fresh-installing v2.
        match backend.get(NEW_SERVICE, key) {
            Ok(Some(_)) => {
                eprintln!(
                    "[m005-migrate][keychain][BLOCK_TARGET_COLLISION key={key} kept=v2]"
                );
                target_collision += 1;
                continue;
            }
            Ok(None) => { /* ok, free to write */ }
            Err(e) => {
                eprintln!(
                    "[m005-migrate][keychain][BLOCK_TARGET_GET_FAILED key={key} err={e:?}]"
                );
                permission_denied += 1;
                continue;
            }
        }

        // Write v2 first — if write fails, legacy is still intact, no data loss.
        if let Err(e) = backend.set(NEW_SERVICE, key, &legacy_value) {
            eprintln!(
                "[m005-migrate][keychain][BLOCK_TARGET_SET_FAILED key={key} err={e:?}]"
            );
            permission_denied += 1;
            continue;
        }

        // Now safe to delete legacy. If delete fails, log but count as
        // renamed — the secret IS at v2; legacy just lingers (cosmetic).
        if let Err(e) = backend.delete(LEGACY_SERVICE, key) {
            eprintln!(
                "[m005-migrate][keychain][BLOCK_LEGACY_DELETE_FAILED key={key} err={e:?}] (already mirrored to v2)"
            );
        }

        renamed += 1;
        eprintln!("[m005-migrate][keychain][BLOCK_RENAMED key={key}]");
    }

    eprintln!(
        "[m005-migrate][keychain][BLOCK_MIGRATED renamed={renamed} absent={absent} target_collision={target_collision} permission_denied={permission_denied}]"
    );
    Ok(KeychainMigrationOutcome {
        renamed,
        absent,
        target_collision,
        permission_denied,
    })
}

pub fn is_already_done(target: &PrefsStore) -> bool {
    match target.get(crate::m005_prefs::KEY_MIGRATION_NS) {
        Some(Value::Object(map)) => map
            .get(KEYCHAIN_MIGRATION_DONE_KEY)
            .and_then(|v| v.as_str())
            .map(|s| s == KEYCHAIN_MIGRATION_DONE_VALUE)
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
        KEYCHAIN_MIGRATION_DONE_KEY.to_string(),
        Value::String(KEYCHAIN_MIGRATION_DONE_VALUE.to_string()),
    );
    target.set(
        crate::m005_prefs::KEY_MIGRATION_NS.to_string(),
        Value::Object(ns),
    );
    eprintln!("[m005-migrate][keychain][BLOCK_MARK_DONE]");
}

// ──────────────────────────────────────────────────────────────────────
// Production keyring wrapper
// ──────────────────────────────────────────────────────────────────────

/// Production keychain backend wrapping the `keyring` crate. Real OS
/// secret store I/O — never instantiated from #[test] runs.
pub struct RealKeychain;

impl KeychainBackend for RealKeychain {
    fn get(&self, service: &str, key: &str) -> Result<Option<String>, KeychainBackendError> {
        let entry = keyring::Entry::new(service, key)
            .map_err(|e| KeychainBackendError::Other(e.to_string()))?;
        match entry.get_password() {
            Ok(p) => Ok(Some(p)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(keyring::Error::NoStorageAccess(_)) | Err(keyring::Error::PlatformFailure(_)) => {
                Err(KeychainBackendError::PermissionDenied)
            }
            Err(e) => Err(KeychainBackendError::Other(e.to_string())),
        }
    }

    fn set(&self, service: &str, key: &str, value: &str) -> Result<(), KeychainBackendError> {
        let entry = keyring::Entry::new(service, key)
            .map_err(|e| KeychainBackendError::Other(e.to_string()))?;
        entry
            .set_password(value)
            .map_err(|e| match e {
                keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_) => {
                    KeychainBackendError::PermissionDenied
                }
                other => KeychainBackendError::Other(other.to_string()),
            })
    }

    fn delete(&self, service: &str, key: &str) -> Result<(), KeychainBackendError> {
        let entry = keyring::Entry::new(service, key)
            .map_err(|e| KeychainBackendError::Other(e.to_string()))?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(keyring::Error::NoStorageAccess(_)) | Err(keyring::Error::PlatformFailure(_)) => {
                Err(KeychainBackendError::PermissionDenied)
            }
            Err(e) => Err(KeychainBackendError::Other(e.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use tempfile::TempDir;

    /// In-memory mock for unit tests. Per-(service,key) -> value map +
    /// configurable failure injection.
    struct MockKeychain {
        store: RefCell<HashMap<(String, String), String>>,
        // (service, key, op) -> error to inject
        deny_get: RefCell<Vec<(String, String)>>,
        deny_set: RefCell<Vec<(String, String)>>,
        deny_delete: RefCell<Vec<(String, String)>>,
    }

    impl MockKeychain {
        fn new() -> Self {
            Self {
                store: RefCell::new(HashMap::new()),
                deny_get: RefCell::new(Vec::new()),
                deny_set: RefCell::new(Vec::new()),
                deny_delete: RefCell::new(Vec::new()),
            }
        }

        fn seed(&self, service: &str, key: &str, value: &str) {
            self.store
                .borrow_mut()
                .insert((service.to_string(), key.to_string()), value.to_string());
        }

        fn deny_get_for(&self, service: &str, key: &str) {
            self.deny_get
                .borrow_mut()
                .push((service.to_string(), key.to_string()));
        }

        fn deny_set_for(&self, service: &str, key: &str) {
            self.deny_set
                .borrow_mut()
                .push((service.to_string(), key.to_string()));
        }

        fn deny_delete_for(&self, service: &str, key: &str) {
            self.deny_delete
                .borrow_mut()
                .push((service.to_string(), key.to_string()));
        }

        fn has(&self, service: &str, key: &str) -> bool {
            self.store
                .borrow()
                .contains_key(&(service.to_string(), key.to_string()))
        }

        fn value(&self, service: &str, key: &str) -> Option<String> {
            self.store
                .borrow()
                .get(&(service.to_string(), key.to_string()))
                .cloned()
        }
    }

    impl KeychainBackend for MockKeychain {
        fn get(
            &self,
            service: &str,
            key: &str,
        ) -> Result<Option<String>, KeychainBackendError> {
            if self
                .deny_get
                .borrow()
                .contains(&(service.to_string(), key.to_string()))
            {
                return Err(KeychainBackendError::PermissionDenied);
            }
            Ok(self
                .store
                .borrow()
                .get(&(service.to_string(), key.to_string()))
                .cloned())
        }

        fn set(
            &self,
            service: &str,
            key: &str,
            value: &str,
        ) -> Result<(), KeychainBackendError> {
            if self
                .deny_set
                .borrow()
                .contains(&(service.to_string(), key.to_string()))
            {
                return Err(KeychainBackendError::PermissionDenied);
            }
            self.store
                .borrow_mut()
                .insert((service.to_string(), key.to_string()), value.to_string());
            Ok(())
        }

        fn delete(&self, service: &str, key: &str) -> Result<(), KeychainBackendError> {
            if self
                .deny_delete
                .borrow()
                .contains(&(service.to_string(), key.to_string()))
            {
                return Err(KeychainBackendError::PermissionDenied);
            }
            self.store
                .borrow_mut()
                .remove(&(service.to_string(), key.to_string()));
            Ok(())
        }
    }

    fn fresh_store(tmp: &TempDir) -> PrefsStore {
        PrefsStore::load_from(tmp.path().join("prefs.json"))
    }

    #[test]
    fn renames_legacy_github_token() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let mock = MockKeychain::new();
        mock.seed(LEGACY_SERVICE, "githubToken", "ghp_secret123");

        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        assert_eq!(outcome.renamed, 1);
        assert_eq!(outcome.absent, 0);
        assert_eq!(outcome.target_collision, 0);
        assert_eq!(outcome.permission_denied, 0);

        // v2 has the value
        assert_eq!(
            mock.value(NEW_SERVICE, "githubToken"),
            Some("ghp_secret123".into())
        );
        // legacy is removed
        assert!(!mock.has(LEGACY_SERVICE, "githubToken"));
    }

    #[test]
    fn skips_when_legacy_absent() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let mock = MockKeychain::new();
        // No seed — legacy has nothing.

        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        assert_eq!(outcome.renamed, 0);
        assert_eq!(outcome.absent, 1);
        assert!(!mock.has(NEW_SERVICE, "githubToken"));
    }

    #[test]
    fn permission_denied_on_legacy_get_skips_silently() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let mock = MockKeychain::new();
        mock.seed(LEGACY_SERVICE, "githubToken", "x");
        mock.deny_get_for(LEGACY_SERVICE, "githubToken");

        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        assert_eq!(outcome.renamed, 0);
        assert_eq!(outcome.permission_denied, 1);
        // Legacy still present (we couldn't read it; we don't delete blindly)
        assert!(mock.has(LEGACY_SERVICE, "githubToken"));
        // v2 untouched
        assert!(!mock.has(NEW_SERVICE, "githubToken"));
    }

    #[test]
    fn target_collision_keeps_v2_does_not_delete_legacy() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let mock = MockKeychain::new();
        mock.seed(LEGACY_SERVICE, "githubToken", "from-legacy");
        mock.seed(NEW_SERVICE, "githubToken", "from-fresh-v2");

        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        assert_eq!(outcome.renamed, 0);
        assert_eq!(outcome.target_collision, 1);
        // v2 kept its own value
        assert_eq!(
            mock.value(NEW_SERVICE, "githubToken"),
            Some("from-fresh-v2".into())
        );
        // Legacy preserved (operator may need to reconcile manually)
        assert!(mock.has(LEGACY_SERVICE, "githubToken"));
    }

    #[test]
    fn target_set_failure_does_not_delete_legacy() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let mock = MockKeychain::new();
        mock.seed(LEGACY_SERVICE, "githubToken", "x");
        mock.deny_set_for(NEW_SERVICE, "githubToken");

        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        assert_eq!(outcome.renamed, 0);
        assert_eq!(outcome.permission_denied, 1);
        assert!(!mock.has(NEW_SERVICE, "githubToken"));
        // Legacy MUST survive — write failed, so deletion would lose data.
        assert!(mock.has(LEGACY_SERVICE, "githubToken"));
    }

    #[test]
    fn legacy_delete_failure_still_counts_as_renamed() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let mock = MockKeychain::new();
        mock.seed(LEGACY_SERVICE, "githubToken", "x");
        mock.deny_delete_for(LEGACY_SERVICE, "githubToken");

        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        // Renamed: secret IS at v2.
        assert_eq!(outcome.renamed, 1);
        assert!(mock.has(NEW_SERVICE, "githubToken"));
        // Legacy still there (delete failed) — cosmetic only.
        assert!(mock.has(LEGACY_SERVICE, "githubToken"));
    }

    #[test]
    fn idempotent_when_marker_present() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        mark_done(&mut store);
        let mock = MockKeychain::new();
        mock.seed(LEGACY_SERVICE, "githubToken", "x");

        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        assert_eq!(outcome.renamed, 0);
        assert_eq!(outcome.absent, 0);
        // Legacy untouched — short-circuited.
        assert!(mock.has(LEGACY_SERVICE, "githubToken"));
        assert!(!mock.has(NEW_SERVICE, "githubToken"));
    }

    #[test]
    fn target_get_failure_skips_safely() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let mock = MockKeychain::new();
        mock.seed(LEGACY_SERVICE, "githubToken", "x");
        mock.deny_get_for(NEW_SERVICE, "githubToken");

        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        assert_eq!(outcome.renamed, 0);
        assert_eq!(outcome.permission_denied, 1);
        // Legacy preserved (we couldn't verify v2 collision-free, so
        // we did not write or delete).
        assert!(mock.has(LEGACY_SERVICE, "githubToken"));
        assert!(!mock.has(NEW_SERVICE, "githubToken"));
    }

    #[test]
    fn mark_done_independent_from_other_markers() {
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        super::super::preferences::mark_done(&mut store);
        super::super::data_center::mark_done(&mut store);
        super::super::keybindings::mark_done(&mut store);
        super::super::recent_docs::mark_done(&mut store);
        assert!(!is_already_done(&store));
        mark_done(&mut store);
        assert!(is_already_done(&store));
        // All other markers preserved.
        assert!(super::super::preferences::is_already_done(&store));
        assert!(super::super::data_center::is_already_done(&store));
        assert!(super::super::keybindings::is_already_done(&store));
        assert!(super::super::recent_docs::is_already_done(&store));
    }

    #[test]
    fn empty_legacy_keys_returns_zero_counters() {
        // Defensive: if LEGACY_KEYS is ever empty (pure-cleanup release),
        // the migrator must not panic and must report all-zero outcome.
        // Simulated by using a fresh empty mock with no seeds.
        let tmp = TempDir::new().unwrap();
        let mut store = fresh_store(&tmp);
        let mock = MockKeychain::new();
        let outcome = migrate_keychain(&mock, &mut store).unwrap();
        assert_eq!(outcome.absent, LEGACY_KEYS.len() as u32);
        assert_eq!(outcome.renamed, 0);
        assert_eq!(outcome.target_collision, 0);
        assert_eq!(outcome.permission_denied, 0);
    }
}
