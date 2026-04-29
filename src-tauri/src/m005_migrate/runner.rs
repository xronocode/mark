// MODULE_CONTRACT
//   PURPOSE: F-PREFS-MIGRATE-V1 step-7 — orchestrate the 6 per-store
//            migrators (snapshot loader + 5 migrators) under a lockfile
//            so concurrent boot attempts can't corrupt the in-flight
//            migration. On per-step failure, stop-and-report with
//            partial idempotency markers preserved (each step is
//            re-runnable); no atomic rollback because keychain writes
//            (M-019 OS secret store) cannot be transactionally undone.
//   SCOPE:   pure orchestration — file I/O for the lockfile, delegates
//            actual data movement to existing migrators. Caller (step-8
//            boot order) supplies cache_root + the keychain backend.
//            Save of the resulting PrefsStore is the runner's
//            responsibility (single fsync after all in-process steps).
//   DEPENDS: m005_migrate::{snapshot, preferences, data_center,
//            keybindings, recent_docs, keychain}; m005_prefs::PrefsStore.
//   LINKS:   docs/development-plan.xml F-PREFS-MIGRATE-V1 step-7;
//            B-pre2 step-2 dialog flow that feeds the runner.
//   STATUS:  shipped 2026-04-29 with F-PREFS-MIGRATE-V1 step-7.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 step-7: lockfile + 6-step orchestrator + summary report.

#![allow(dead_code)]

use crate::m005_prefs::PrefsStore;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::{
    data_center, keybindings, keychain, preferences, recent_docs, snapshot,
};

const LOCKFILE_NAME: &str = ".migration.lock";
/// After 5 minutes a lockfile is considered stale (process likely
/// crashed mid-migration). New runner takes over.
const LOCK_STALE_AFTER: Duration = Duration::from_secs(5 * 60);
/// Sanity guard against memory-bomb source files (F-MIGRATE-SIZE-LIMIT).
/// 16 MiB is generous — real-world preferences.json is ~2 KB, dataCenter
/// ~300 B; even keybindings.json customisations rarely exceed 50 KB.
pub const MAX_SOURCE_BYTES: u64 = 16 * 1024 * 1024;

/// Aggregated per-step outcome the runner returns to the boot sequence
/// (step-8). Each field maps to one migrator step; the runner uses
/// these to render the post-migration native dialog summary
/// (step-9 deliverable: "Migrated 65 prefs, 6 dataCenter keys, 0
/// shortcut overrides, 12 recent files, 1 keychain entry.").
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunnerSummary {
    pub snapshot_ts_dir: Option<PathBuf>,
    pub preferences: Option<preferences::PreferencesMigrationOutcome>,
    pub data_center: Option<data_center::DataCenterMigrationOutcome>,
    pub keybindings: Option<keybindings::KeybindingsMigrationOutcome>,
    pub recent_docs: Option<recent_docs::RecentDocsMigrationOutcome>,
    pub keychain: Option<keychain::KeychainMigrationOutcome>,
    /// First step that failed, if any. Subsequent steps were skipped.
    pub first_failure: Option<RunnerFailure>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunnerFailure {
    /// Lockfile is held by a non-stale active runner; bail.
    LockHeldByActiveProcess { pid: u32, age_secs: u64 },
    /// Lockfile exists but couldn't be read or parsed.
    LockfileCorrupt(String),
    /// I/O failure writing the lockfile (disk full, permission, ...).
    LockfileWriteFailed(String),
    /// snapshot::load_latest returned an error other than the
    /// "no snapshot dir" case (which is treated as a no-op success).
    SnapshotLoadFailed(snapshot::SnapshotLoadError),
    /// Per-step error from one of steps 2-6.
    StepFailed { step: &'static str, reason: String },
    /// File-size guard tripped (F-MIGRATE-SIZE-LIMIT).
    SourceTooLarge {
        step: &'static str,
        path: PathBuf,
        bytes: u64,
        limit: u64,
    },
}

/// Run the full migration pipeline. Idempotent — running twice with no
/// new snapshot is a no-op. Caller must save the PrefsStore after a
/// successful return (runner mutates it in place).
///
/// Returns Ok(summary) when the run completed cleanly OR was skipped
/// (no snapshot dir, all steps already done, lockfile held by stale
/// process taken over). Returns Err(RunnerFailure) only for hard
/// runtime errors that prevent any progress.
pub fn run<B: keychain::KeychainBackend>(
    cache_root: &Path,
    keychain_backend: &B,
    target: &mut PrefsStore,
) -> Result<RunnerSummary, RunnerFailure> {
    // ── 1. Acquire lockfile ─────────────────────────────────────────
    let lock_path = cache_root.join(LOCKFILE_NAME);
    let lock = match acquire_lock(&lock_path) {
        Ok(g) => g,
        Err(e) => return Err(e),
    };

    // ── 2. Load snapshot (or short-circuit if absent) ──────────────
    let snap = match snapshot::load_latest(cache_root) {
        Ok(s) => s,
        Err(snapshot::SnapshotLoadError::SnapshotDirMissing)
        | Err(snapshot::SnapshotLoadError::NoTimestampedDir) => {
            eprintln!(
                "[m005-migrate][runner][BLOCK_NO_SNAPSHOT_NOOP] no migration source — runner exits cleanly"
            );
            drop(lock);
            return Ok(RunnerSummary {
                snapshot_ts_dir: None,
                preferences: None,
                data_center: None,
                keybindings: None,
                recent_docs: None,
                keychain: None,
                first_failure: None,
            });
        }
        Err(e) => {
            drop(lock);
            return Err(RunnerFailure::SnapshotLoadFailed(e));
        }
    };

    // ── 3. Pick namespace priority (marktext wins over mark) ───────
    let ns = match (&snap.marktext, &snap.mark) {
        (Some(m), _) => m,
        (None, Some(m)) => m,
        (None, None) => {
            eprintln!("[m005-migrate][runner][BLOCK_NO_NAMESPACE_NOOP] snapshot has no migratable data");
            drop(lock);
            return Ok(RunnerSummary {
                snapshot_ts_dir: Some(snap.ts_dir),
                preferences: None,
                data_center: None,
                keybindings: None,
                recent_docs: None,
                keychain: None,
                first_failure: None,
            });
        }
    };
    eprintln!(
        "[m005-migrate][runner][BLOCK_NAMESPACE_SELECTED ns={}]",
        ns.root.display()
    );

    let mut summary = RunnerSummary {
        snapshot_ts_dir: Some(snap.ts_dir.clone()),
        preferences: None,
        data_center: None,
        keybindings: None,
        recent_docs: None,
        keychain: None,
        first_failure: None,
    };

    // ── 4. Step 2: preferences.json ────────────────────────────────
    if let Err(e) = guard_size("preferences", ns.preferences.as_deref()) {
        summary.first_failure = Some(e);
        drop(lock);
        return Ok(summary);
    }
    match preferences::migrate_preferences(ns.preferences.as_deref(), target) {
        Ok(out) => {
            summary.preferences = Some(out);
            preferences::mark_done(target);
        }
        Err(e) => {
            summary.first_failure = Some(RunnerFailure::StepFailed {
                step: "preferences",
                reason: format!("{e:?}"),
            });
            drop(lock);
            return Ok(summary);
        }
    }

    // ── 5. Step 3: dataCenter.json ─────────────────────────────────
    if let Err(e) = guard_size("data_center", ns.data_center.as_deref()) {
        summary.first_failure = Some(e);
        drop(lock);
        return Ok(summary);
    }
    match data_center::migrate_data_center(ns.data_center.as_deref(), target) {
        Ok(out) => {
            summary.data_center = Some(out);
            data_center::mark_done(target);
        }
        Err(e) => {
            summary.first_failure = Some(RunnerFailure::StepFailed {
                step: "data_center",
                reason: format!("{e:?}"),
            });
            drop(lock);
            return Ok(summary);
        }
    }

    // ── 6. Step 4: keybindings.json ────────────────────────────────
    if let Err(e) = guard_size("keybindings", ns.keybindings.as_deref()) {
        summary.first_failure = Some(e);
        drop(lock);
        return Ok(summary);
    }
    match keybindings::migrate_keybindings(ns.keybindings.as_deref(), target) {
        Ok(out) => {
            summary.keybindings = Some(out);
            keybindings::mark_done(target);
        }
        Err(e) => {
            summary.first_failure = Some(RunnerFailure::StepFailed {
                step: "keybindings",
                reason: format!("{e:?}"),
            });
            drop(lock);
            return Ok(summary);
        }
    }

    // ── 7. Step 5: recently-used-documents.json ────────────────────
    if let Err(e) = guard_size("recent_docs", ns.recently_used_documents.as_deref()) {
        summary.first_failure = Some(e);
        drop(lock);
        return Ok(summary);
    }
    match recent_docs::migrate_recent_docs(ns.recently_used_documents.as_deref(), target) {
        Ok(out) => {
            summary.recent_docs = Some(out);
            recent_docs::mark_done(target);
        }
        Err(e) => {
            summary.first_failure = Some(RunnerFailure::StepFailed {
                step: "recent_docs",
                reason: format!("{e:?}"),
            });
            drop(lock);
            return Ok(summary);
        }
    }

    // ── 8. Step 6: keychain rename ─────────────────────────────────
    match keychain::migrate_keychain(keychain_backend, target) {
        Ok(out) => {
            summary.keychain = Some(out);
            keychain::mark_done(target);
        }
        Err(e) => {
            summary.first_failure = Some(RunnerFailure::StepFailed {
                step: "keychain",
                reason: format!("{e:?}"),
            });
            drop(lock);
            return Ok(summary);
        }
    }

    eprintln!(
        "[m005-migrate][runner][BLOCK_RUN_COMPLETE preferences=ok data_center=ok keybindings=ok recent_docs=ok keychain=ok]"
    );
    drop(lock);
    Ok(summary)
}

// ──────────────────────────────────────────────────────────────────────
// Lockfile
// ──────────────────────────────────────────────────────────────────────

/// RAII lockfile guard. Removes the lock on Drop unless `forget()` is
/// called. We never call forget — every code path through run() lets
/// the guard drop, which removes the lockfile.
pub struct LockGuard {
    path: PathBuf,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
        eprintln!(
            "[m005-migrate][runner][BLOCK_LOCK_RELEASED path={}]",
            self.path.display()
        );
    }
}

/// Acquire the lockfile or detect concurrent / stale state.
/// Format: PID\nUNIX_TIMESTAMP\n  (text, single line)
fn acquire_lock(path: &Path) -> Result<LockGuard, RunnerFailure> {
    if let Ok(content) = fs::read_to_string(path) {
        // Parse existing lockfile.
        let mut lines = content.lines();
        let pid_line = lines.next().unwrap_or("");
        let ts_line = lines.next().unwrap_or("");
        let pid: u32 = pid_line.parse().map_err(|e| {
            RunnerFailure::LockfileCorrupt(format!("PID parse: {e}; content={content:?}"))
        })?;
        let ts: u64 = ts_line.parse().map_err(|e| {
            RunnerFailure::LockfileCorrupt(format!("ts parse: {e}; content={content:?}"))
        })?;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let age_secs = now.saturating_sub(ts);

        if Duration::from_secs(age_secs) < LOCK_STALE_AFTER {
            eprintln!(
                "[m005-migrate][runner][BLOCK_LOCK_HELD pid={pid} age_secs={age_secs}]"
            );
            return Err(RunnerFailure::LockHeldByActiveProcess { pid, age_secs });
        }
        eprintln!(
            "[m005-migrate][runner][BLOCK_LOCK_TAKEOVER stale_pid={pid} age_secs={age_secs}]"
        );
        // Stale — overwrite below.
    }

    // Ensure parent dir exists (cache_root may be missing on a fresh install).
    if let Some(parent) = path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Err(RunnerFailure::LockfileWriteFailed(format!(
                "create_dir_all {}: {e}",
                parent.display()
            )));
        }
    }

    let pid = std::process::id();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let body = format!("{pid}\n{ts}\n");

    let mut f = fs::File::create(path).map_err(|e| {
        RunnerFailure::LockfileWriteFailed(format!("create {}: {e}", path.display()))
    })?;
    f.write_all(body.as_bytes()).map_err(|e| {
        RunnerFailure::LockfileWriteFailed(format!("write {}: {e}", path.display()))
    })?;
    f.sync_all().map_err(|e| {
        RunnerFailure::LockfileWriteFailed(format!("sync {}: {e}", path.display()))
    })?;
    drop(f);

    eprintln!(
        "[m005-migrate][runner][BLOCK_LOCK_ACQUIRED pid={pid} path={}]",
        path.display()
    );
    Ok(LockGuard {
        path: path.to_path_buf(),
    })
}

// ──────────────────────────────────────────────────────────────────────
// Source-size guard (F-MIGRATE-SIZE-LIMIT)
// ──────────────────────────────────────────────────────────────────────

fn guard_size(step: &'static str, path: Option<&Path>) -> Result<(), RunnerFailure> {
    let p = match path {
        Some(p) => p,
        None => return Ok(()),
    };
    match fs::metadata(p) {
        Ok(m) => {
            let bytes = m.len();
            if bytes > MAX_SOURCE_BYTES {
                eprintln!(
                    "[m005-migrate][runner][BLOCK_SOURCE_TOO_LARGE step={step} bytes={bytes} limit={MAX_SOURCE_BYTES}]"
                );
                return Err(RunnerFailure::SourceTooLarge {
                    step,
                    path: p.to_path_buf(),
                    bytes,
                    limit: MAX_SOURCE_BYTES,
                });
            }
            Ok(())
        }
        Err(_) => {
            // metadata failure is benign here — the migrator's read will
            // surface SourceReadFailed with the real error context.
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use tempfile::TempDir;

    /// Minimal in-memory keychain used by runner tests (mirrors the
    /// MockKeychain in keychain::tests but lives here so the cross-step
    /// orchestration tests don't depend on private test types).
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
        fn delete(
            &self,
            s: &str,
            k: &str,
        ) -> Result<(), keychain::KeychainBackendError> {
            self.store
                .borrow_mut()
                .remove(&(s.to_string(), k.to_string()));
            Ok(())
        }
    }

    fn fresh_store(tmp: &TempDir) -> PrefsStore {
        PrefsStore::load_from(tmp.path().join("prefs.json"))
    }

    fn write_in_snapshot(cache: &Path, name: &str, content: &str) -> PathBuf {
        let dir = cache.join("snapshot/ts-1000/marktext");
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        fs::write(&p, content).unwrap();
        p
    }

    #[test]
    fn no_snapshot_dir_returns_clean_summary() {
        let cache = TempDir::new().unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        let s = run(cache.path(), &kc, &mut store).unwrap();
        assert!(s.first_failure.is_none());
        assert!(s.preferences.is_none());
        assert!(s.snapshot_ts_dir.is_none());
    }

    #[test]
    fn full_pipeline_completes_for_full_namespace() {
        let cache = TempDir::new().unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        kc.seed(keychain::LEGACY_SERVICE, "githubToken", "ghp_xxx");

        write_in_snapshot(cache.path(), "preferences.json", r#"{"theme":"dark","fontSize":14}"#);
        write_in_snapshot(
            cache.path(),
            "dataCenter.json",
            r#"{"currentUploader":"github"}"#,
        );
        write_in_snapshot(
            cache.path(),
            "keybindings.json",
            r#"{"file.save":"CmdOrCtrl+S"}"#,
        );
        write_in_snapshot(
            cache.path(),
            "recently-used-documents.json",
            r#"["/a.md","/b.md"]"#,
        );

        let s = run(cache.path(), &kc, &mut store).unwrap();
        assert!(s.first_failure.is_none(), "got failure: {:?}", s.first_failure);
        assert!(s.preferences.is_some());
        assert!(s.data_center.is_some());
        assert!(s.keybindings.is_some());
        assert!(s.recent_docs.is_some());
        assert!(s.keychain.is_some());

        // Markers all set.
        assert!(preferences::is_already_done(&store));
        assert!(data_center::is_already_done(&store));
        assert!(keybindings::is_already_done(&store));
        assert!(recent_docs::is_already_done(&store));
        assert!(keychain::is_already_done(&store));

        // Lockfile released.
        assert!(!cache.path().join(LOCKFILE_NAME).exists());

        // Keychain rename happened.
        assert!(kc.has(keychain::NEW_SERVICE, "githubToken"));
        assert!(!kc.has(keychain::LEGACY_SERVICE, "githubToken"));
    }

    #[test]
    fn failed_step_stops_pipeline_preserves_prior_markers() {
        let cache = TempDir::new().unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();

        write_in_snapshot(cache.path(), "preferences.json", r#"{"theme":"dark"}"#);
        // dataCenter is corrupt — runner stops here.
        write_in_snapshot(cache.path(), "dataCenter.json", r#"["not","an","object"]"#);
        write_in_snapshot(
            cache.path(),
            "keybindings.json",
            r#"{"file.save":"CmdOrCtrl+S"}"#,
        );

        let s = run(cache.path(), &kc, &mut store).unwrap();
        assert!(matches!(
            s.first_failure,
            Some(RunnerFailure::StepFailed { step: "data_center", .. })
        ));
        // preferences ran first and succeeded.
        assert!(preferences::is_already_done(&store));
        // data_center failed — marker NOT set.
        assert!(!data_center::is_already_done(&store));
        // keybindings + recent_docs + keychain skipped.
        assert!(!keybindings::is_already_done(&store));
        assert!(!recent_docs::is_already_done(&store));
        assert!(!keychain::is_already_done(&store));
    }

    #[test]
    fn idempotent_re_run_after_full_success() {
        let cache = TempDir::new().unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();

        write_in_snapshot(cache.path(), "preferences.json", r#"{"theme":"dark"}"#);
        run(cache.path(), &kc, &mut store).unwrap();

        // Second run: every migrator should short-circuit on its marker.
        let s = run(cache.path(), &kc, &mut store).unwrap();
        assert!(s.first_failure.is_none());
        assert!(matches!(
            s.preferences,
            Some(preferences::PreferencesMigrationOutcome::AlreadyDone)
        ));
    }

    #[test]
    fn lockfile_held_by_active_process_blocks() {
        let cache = TempDir::new().unwrap();
        // Manually plant a fresh lockfile (PID=99999, ts=now).
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        fs::write(
            cache.path().join(LOCKFILE_NAME),
            format!("99999\n{now}\n"),
        )
        .unwrap();

        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        let err = run(cache.path(), &kc, &mut store).unwrap_err();
        match err {
            RunnerFailure::LockHeldByActiveProcess { pid, .. } => assert_eq!(pid, 99999),
            other => panic!("expected LockHeldByActiveProcess, got {other:?}"),
        }
    }

    #[test]
    fn stale_lockfile_taken_over() {
        let cache = TempDir::new().unwrap();
        // Plant a 6-min-old lockfile — past LOCK_STALE_AFTER.
        let stale_ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .saturating_sub(6 * 60);
        fs::write(
            cache.path().join(LOCKFILE_NAME),
            format!("99999\n{stale_ts}\n"),
        )
        .unwrap();

        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        let s = run(cache.path(), &kc, &mut store).unwrap();
        // No snapshot dir → clean exit.
        assert!(s.first_failure.is_none());
        // Lockfile released.
        assert!(!cache.path().join(LOCKFILE_NAME).exists());
    }

    #[test]
    fn corrupt_lockfile_returns_error_does_not_run() {
        let cache = TempDir::new().unwrap();
        fs::write(cache.path().join(LOCKFILE_NAME), b"not a valid lockfile").unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        let err = run(cache.path(), &kc, &mut store).unwrap_err();
        assert!(matches!(err, RunnerFailure::LockfileCorrupt(_)));
    }

    #[test]
    fn source_too_large_aborts_step() {
        let cache = TempDir::new().unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        // Plant a 17 MiB preferences.json
        let big_path = cache.path().join("snapshot/ts-1000/marktext");
        fs::create_dir_all(&big_path).unwrap();
        let body = "{\"k\":\"".to_string()
            + &"x".repeat((17 * 1024 * 1024) as usize)
            + "\"}";
        fs::write(big_path.join("preferences.json"), body).unwrap();

        let s = run(cache.path(), &kc, &mut store).unwrap();
        assert!(matches!(
            s.first_failure,
            Some(RunnerFailure::SourceTooLarge { step: "preferences", .. })
        ));
        // No marker set — preferences was the step that aborted.
        assert!(!preferences::is_already_done(&store));
    }

    #[test]
    fn lockfile_released_on_clean_completion() {
        let cache = TempDir::new().unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        write_in_snapshot(cache.path(), "preferences.json", "{}");
        run(cache.path(), &kc, &mut store).unwrap();
        assert!(!cache.path().join(LOCKFILE_NAME).exists());
    }

    #[test]
    fn lockfile_released_on_step_failure() {
        let cache = TempDir::new().unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        write_in_snapshot(cache.path(), "preferences.json", "[bad]");
        run(cache.path(), &kc, &mut store).unwrap();
        // Even after StepFailed, lock must be released.
        assert!(!cache.path().join(LOCKFILE_NAME).exists());
    }

    #[test]
    fn snapshot_with_no_namespace_clean_exit() {
        let cache = TempDir::new().unwrap();
        // Make snapshot/ts-1000 exist but with no marktext or mark subdir.
        fs::create_dir_all(cache.path().join("snapshot/ts-1000")).unwrap();
        let mut store = fresh_store(&cache);
        let kc = StubKeychain::new();
        let s = run(cache.path(), &kc, &mut store).unwrap();
        assert!(s.first_failure.is_none());
        assert!(s.snapshot_ts_dir.is_some());
        assert!(s.preferences.is_none());
    }
}
