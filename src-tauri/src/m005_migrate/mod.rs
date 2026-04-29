// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 — full 4-store legacy migration
//            orchestrator. Replaces the Phase-B-pre2 stub gate
//            (MT_PREFS_V1_RUNNING) once all sub-steps are wired.
//   SCOPE:   barrel only. Each step lives in its own submodule:
//            snapshot   (step-1) — typed reader of cache_root/snapshot/
//            preferences (step-2) — electron-store schema → M-005 KEYs
//            data_center (step-3) — image-upload + secrets + recents
//            keybindings (step-4) — keyspec → M-006 Modifiers/key
//            recent_docs (step-5) — recent files list → M-017
//            keychain    (step-6) — service rename marktext→com.xronocode.mark
//            runner      (step-7) — orchestrator + lockfile + rollback
//   DEPENDS: steps own their dependencies; barrel only re-exports.
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1.
//   STATUS:  step-1 shipped 2026-04-29. Steps 2-9 deferred.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 F-PREFS-MIGRATE-V1 step-1: snapshot reader scaffold.

pub mod snapshot;
pub mod preferences;
pub mod data_center;
pub mod keybindings;
pub mod recent_docs;
pub mod keychain;

// Re-exports for steps 2-9 consumers (caller may pull either through the
// barrel or via `use crate::m005_migrate::snapshot::*`). Until the
// runner (step-7) lands, no other module consumes these — allow until
// then.
#[allow(unused_imports)]
pub use snapshot::{load_latest, LegacySnapshot, NamespaceSnapshot, SnapshotLoadError};
#[allow(unused_imports)]
pub use preferences::{
    migrate_preferences, mark_done as mark_preferences_done,
    is_already_done as is_preferences_done, PreferencesMigrationOutcome,
    PreferencesMigrationError,
};
#[allow(unused_imports)]
pub use data_center::{
    migrate_data_center, mark_done as mark_data_center_done,
    is_already_done as is_data_center_done, DataCenterMigrationOutcome,
    DataCenterMigrationError,
};
#[allow(unused_imports)]
pub use keybindings::{
    migrate_keybindings, mark_done as mark_keybindings_done,
    is_already_done as is_keybindings_done, KeybindingsMigrationOutcome,
    KeybindingsMigrationError,
};
#[allow(unused_imports)]
pub use recent_docs::{
    migrate_recent_docs, mark_done as mark_recent_docs_done,
    is_already_done as is_recent_docs_done, RecentDocsMigrationOutcome,
    RecentDocsMigrationError,
};
#[allow(unused_imports)]
pub use keychain::{
    migrate_keychain, mark_done as mark_keychain_done,
    is_already_done as is_keychain_done, KeychainBackend, KeychainBackendError,
    KeychainMigrationOutcome, KeychainMigrationError, RealKeychain,
    LEGACY_SERVICE, NEW_SERVICE, LEGACY_KEYS,
};
