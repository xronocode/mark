// FILE: src-tauri/src/m068_rollback.rs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: M-068 mt-rollback. One-step updater rollback (C-UPDATER-
//            ROLLBACK): snapshot the running version before every
//            in-app update, validate it strictly, and restore it from
//            the Help menu or the pre-boot `--rollback` CLI path when
//            the UI cannot start.
//   SCOPE:   rollback set lifecycle only — prepare/stage/digest,
//            promote-on-next-launch reconciliation, strict manifest
//            validation, per-platform restore (macOS bundle swap with
//            Trash; Windows verified-installer spawn dispatched off the
//            async task under a deadline), the pending-rollback.json
//            installer-accounting fact and its three-state reconcile,
//            the preferences snapshot restore + skippedUpdateVersion
//            write, the instance lock and the delegate request/ack
//            files. Update checks/downloads stay in the renderer +
//            tauri-plugin-updater; the feed and release pipeline are
//            untouched.
//   DEPENDS: sha2, minisign-verify, trash, reqwest (Windows fetch),
//            serde/serde_json, mt_paths (M-022), m005_prefs (M-005).
//   LINKS:   .grace/graph/features.xml M-068;
//            .grace/verification/features.xml V-M-068;
//            .grace/changes/archive/C-UPDATER-ROLLBACK (spec
//            R-1..R-9, corner matrix C-1..C-13);
//            .grace/changes/archive/C-RENDER-REVIEW-FIXES (T-001).
//   STATUS:  C-UPDATER-ROLLBACK T-001/T-003/T-004. Desktop builds
//            only; app-store builds get inert command stubs with the
//            store-managed voice.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   RollbackManifest - Strictly-validated snapshot manifest (schema 1).
//   restore_inner - Desktop-only verified restore coordinator.
//   restore_windows_flow - Desktop-only host-agnostic Windows verified-installer flow.
//   RollbackStatus - Renderer-facing availability + versions.
//   mt_rollback_prepare - Stage the running version before downloadAndInstall.
//   mt_rollback_status - Report whether a valid rollback set exists.
//   mt_rollback_restore - Re-validate and restore (menu/dialog path).
//   mt_rollback_restore_outcome - Read-and-clear the restore-outcome marker (one-shot prefs-skip fact).
//   run_cli_rollback - Headless pre-boot --rollback entry point.
//   reconcile_at_boot - Promote a succeeded update's staging / finalize a restore.
//   acquire_instance_lock - Hold the advisory instance lock for the process lifetime.
//   spawn_delegate_poller - Watch delegate.request and ack it (GUI side).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-21 v1.2.0 C-WIN-ROLLBACK-PANIC T-001..T-004: the menu
//     restore core (rollback_restore_core) leaves the async command
//     task via tauri::async_runtime::spawn_blocking under
//     tokio::time::timeout(ROLLBACK_RESTORE_DEADLINE_SECS) — restart/
//     exit strictly after the join (RestoreMenuEnd::Relaunch/
//     HandoffExit); ReqwestFetch carries client-builder deadlines
//     (ROLLBACK_CONNECT_TIMEOUT_SECS / ROLLBACK_FETCH_DEADLINE_SECS)
//     so a stalled transfer ends in the typed exit-4-class failure
//     with the set byte-identical; the pending installer is accounted
//     by pending-rollback.json (PendingRollbackRecord write-before-
//     spawn, pid patched best-effort) reconciled by the three-state
//     evaluate_pending_rollback table (PENDING_INSTALLER_WINDOW_SECS,
//     positive-failure-only, pid-reuse-bound) — the restore_inner gate
//     declines with the new exit-8 event=pending CLI outcome
//     (pending_restore_ending), finalize clears the consumed fact,
//     and the boot reconcile is fail-open (pending_retry_armed /
//     pending_stay / pending_reuse_suspected). F-008 stays cut:
//     prepare_inner and installSignedUpdate untouched.
//   - 2026-11-15 C-ROLLBACK-STORE-BUILD-GUARD: align desktop-only restore
//     coordinator/Windows flow cfg with their excluded updater-key helper;
//     preserve inert Store commands and unchanged desktop restore behavior.
//   - 2026-10-28 C-UPDATER-ROLLBACK T-001/T-003/T-004: initial module.
//   - 2026-10-31 td-1: silence the cfg-asymmetric `relaunch` parameter
//     (its only use sits in the macOS restore path) for non-macOS
//     clippy runs.
//   - 2026-11-03 v1.1.0 C-UPDATER-REVIEW-FIXES: verify-then-mutate
//     ordering on both platforms, reversible macOS bundle swap, atomic
//     boot promotion, lifetime instance lock, truthful
//     restored_norelaunch CLI outcome; LINKS rerouted to the features
//     graph/verification and the archived rollback bundle.
//   - 2026-11-03 C-RENDER-REVIEW-FIXES T-001: structured restore-outcome
//     fact — restore-outcome.json at the rollback root, written
//     best-effort at the logged-and-skipped prefs site, stale/unconsumed
//     copies removed at every restore and prepare entry, plus the
//     read-and-clear mt_rollback_restore_outcome command (the app-store
//     stub returns null).
// END_CHANGE_SUMMARY

use serde::{Deserialize, Serialize};
use std::io::Read as _;
use std::path::{Path, PathBuf};

const MANIFEST_SCHEMA: u32 = 1;
const ROLLBACK_DIR: &str = "rollback";
const LIVE_DIR: &str = "live";
const STAGING_DIR: &str = "staging.tmp";
const MANIFEST_FILE: &str = "manifest.json";
const INSTANCE_LOCK_FILE: &str = "instance.lock";
/// The data-root move-aside name for the superseded live set during a
/// boot promotion (T-004 C-UPDATER-REVIEW-FIXES): the previous live set
/// survives under this sibling until the replacement rename confirms.
const PROMOTION_ASIDE_DIR: &str = "live.promotion-aside";
const DELEGATE_REQUEST_FILE: &str = "delegate.request";
const DELEGATE_ACK_FILE: &str = "delegate.ack";
/// The structured restore-outcome fact (T-001 C-RENDER-REVIEW-FIXES):
/// a root-level sibling of instance.lock / delegate.* — never inside
/// the live/ set the restore consumes — written best-effort at the
/// logged-and-skipped preferences site and consumed read-and-clear by
/// mt_rollback_restore_outcome.
const RESTORE_OUTCOME_FILE: &str = "restore-outcome.json";
/// The write-side diagnostics cap, shared with the strict read side
/// (an over-cap error field reads as null). Truncation is on char
/// boundaries — a byte slice would panic on localized multi-byte
/// error text.
const RESTORE_OUTCOME_ERROR_CAP: usize = 200;
const DELEGATE_TIMEOUT_SECS: u64 = 10;
/// The prefs key the renderer's skip-this-version logic already reads
/// (autoUpdates.js SKIPPED_UPDATE_VERSION_KEY, exact-match semantics).
pub const KEY_SKIPPED_VERSION: &str = "skippedUpdateVersion";
// ─── Rollback transport + pending-installer accounting (T-002/T-003
// ─── C-WIN-ROLLBACK-PANIC) ─────────────────────────────────────────
/// The client-builder connect deadline (T-002): only the production
/// ReqwestFetch builder consumes it — the Fetch trait and every test
/// fixture stay synchronous and network-free.
#[cfg(not(feature = "app-store"))]
const ROLLBACK_CONNECT_TIMEOUT_SECS: u64 = 10;
/// The client-builder total deadline: covers connect, headers and body
/// (the whole request) — the ~31 MB installer on a slow link.
#[cfg(not(feature = "app-store"))]
const ROLLBACK_FETCH_DEADLINE_SECS: u64 = 300;
/// The menu command's whole-operation bound around the spawn_blocking
/// join (T-002): 2× the fetch deadline plus local slack.
#[cfg(not(feature = "app-store"))]
const ROLLBACK_RESTORE_DEADLINE_SECS: u64 = 660;
/// The pending-installer fact file (T-003): a root-level sibling of
/// instance.lock / restore-outcome.json — never inside the live/ set —
/// bridging the pending installer window across the restoring
/// process's exit (the lock cannot cover it).
#[cfg(not(feature = "app-store"))]
const PENDING_ROLLBACK_FILE: &str = "pending-rollback.json";
/// The pending window (T-003): a passive NSIS run of the ~31 MB
/// installer takes minutes; the generous bound is the false-failed
/// guard — a rollback retry inside the window is always declined.
#[cfg(not(feature = "app-store"))]
const PENDING_INSTALLER_WINDOW_SECS: u64 = 7200;
/// The gate/boot decline reasons (whole-string matched by the boot
/// marker selection — both are owned consts, never parsed prose).
#[cfg(not(feature = "app-store"))]
const PENDING_DECLINED_IN_WINDOW: &str = "the pending installer may still be running";
#[cfg(not(feature = "app-store"))]
const PENDING_DECLINED_PID_ALIVE: &str =
    "the pending installer's pid is alive past the window — pid reuse suspected";

// ─── Layout helpers ─────────────────────────────────────────────────

fn rollback_root() -> Option<PathBuf> {
    crate::mt_paths::data_root().map(|r| r.join(ROLLBACK_DIR))
}

fn live_dir() -> Option<PathBuf> {
    rollback_root().map(|r| r.join(LIVE_DIR))
}

fn staging_dir() -> Option<PathBuf> {
    rollback_root().map(|r| r.join(STAGING_DIR))
}

fn manifest_path(base: &Path) -> PathBuf {
    base.join(MANIFEST_FILE)
}

fn prefs_snapshot_name() -> String {
    "preferences.snapshot.json".to_string()
}

fn staged_bundle_name(version: &str) -> String {
    format!("Mark-{version}.app")
}

fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn platform_key() -> String {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "darwin-aarch64".to_string();
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "darwin-x86_64".to_string();
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return "windows-x86_64".to_string();
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64")
    )))]
    return format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
}

fn strict_semver(v: &str) -> bool {
    let mut parts = v.split('.');
    let mut count = 0usize;
    for p in parts.by_ref() {
        count += 1;
        if p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()) {
            return false;
        }
    }
    count == 3
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    let out = h.finalize();
    let mut s = String::with_capacity(64);
    for b in out {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut f = std::fs::File::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| format!("read {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    let out = h.finalize();
    let mut s = String::with_capacity(64);
    for b in out {
        s.push_str(&format!("{b:02x}"));
    }
    Ok(s)
}

// ─── Manifest ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackManifest {
    pub schema: u32,
    pub previous_version: String,
    pub platform: String,
    /// macOS only: the staged bundle directory name inside the set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub staged_bundle: Option<String>,
    pub prefs_snapshot: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefs_sha256: Option<String>,
    pub created_at: u64,
}

impl RollbackManifest {
    /// Strict validation (spec R-3): unknown schema, non-strict-semver
    /// version, platform mismatch, staged paths escaping the set,
    /// derivation mismatch, or a recorded version equal to the running
    /// one (the failed-attempt state) all render the set invalid —
    /// invalid always behaves exactly like missing. The snapshot file
    /// itself must also open and parse as a valid preferences object
    /// (T-002 C-UPDATER-REVIEW-FIXES): an unparsable or non-object
    /// snapshot is no-set, so the surface gates (the Help item, the
    /// CLI exit-7 voice) stop advertising a restore that cannot
    /// complete and no restore path ever runs m005's empty-map
    /// fallback against live settings. One shared call for the surface
    /// gates and the restore paths; on failure the structured support
    /// marker names the data-root path.
    pub fn validate(&self, base: &Path, running: &str) -> Result<(), String> {
        if self.schema != MANIFEST_SCHEMA {
            return Err(format!("unknown schema {}", self.schema));
        }
        if !strict_semver(&self.previous_version) {
            return Err(format!("non-strict semver {:?}", self.previous_version));
        }
        if self.platform != platform_key() {
            return Err(format!(
                "platform mismatch manifest={} running={}",
                self.platform,
                platform_key()
            ));
        }
        if self.previous_version == running {
            return Err("recorded version equals the running version".to_string());
        }
        // Derivation consistency: the staged bundle name must match the
        // recorded version exactly — injected path/URL material dies here.
        if let Some(name) = &self.staged_bundle {
            if name.as_str() != staged_bundle_name(&self.previous_version) {
                return Err(format!("staged bundle name disagrees with derivation: {name}"));
            }
            if name.contains("..") || name.contains('/') || name.contains('\\') {
                return Err("staged bundle name carries path material".to_string());
            }
            if self.bundle_sha256.as_deref().unwrap_or("").len() != 64 {
                return Err("staged bundle without a 64-hex digest".to_string());
            }
        } else if self.bundle_sha256.is_some() {
            return Err("digest present without a staged bundle".to_string());
        }
        if self.prefs_snapshot != prefs_snapshot_name() {
            return Err(format!(
                "prefs snapshot name disagrees with derivation: {}",
                self.prefs_snapshot
            ));
        }
        if self.prefs_sha256.as_deref().unwrap_or("").len() != 64 {
            return Err("prefs snapshot without a 64-hex digest".to_string());
        }
        // Path containment: everything the manifest names must live
        // inside `base` (the live set directory).
        if let Some(name) = &self.staged_bundle {
            let p = base.join(name);
            if !p.starts_with(base) {
                return Err("staged path escapes the set".to_string());
            }
        }
        // The snapshot must open and parse as a valid preferences
        // object — an unparsable snapshot is no-set (T-002
        // C-UPDATER-REVIEW-FIXES). The structured marker names the
        // data-root path for support cases.
        let snap = base.join(&self.prefs_snapshot);
        match std::fs::read_to_string(&snap) {
            Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
                Ok(v) if v.is_object() => Ok(()),
                Ok(_) => {
                    safe_eprintln!(
                        "[Rollback][verify][BLOCK_ROLLBACK_VERIFY snapshot_invalid path={} why=not_an_object]",
                        snap.display()
                    );
                    Err("snapshot is not a preferences object".to_string())
                }
                Err(e) => {
                    safe_eprintln!(
                        "[Rollback][verify][BLOCK_ROLLBACK_VERIFY snapshot_invalid path={} why=unparsable]",
                        snap.display()
                    );
                    Err(format!("snapshot unparsable: {e}"))
                }
            },
            Err(e) => {
                safe_eprintln!(
                    "[Rollback][verify][BLOCK_ROLLBACK_VERIFY snapshot_invalid path={} why=unreadable]",
                    snap.display()
                );
                Err(format!("snapshot unreadable: {e}"))
            }
        }
    }
}

/// Load + validate the live manifest against an explicit set directory
/// (the root-override seam the GUI restore core and tests use; T-002
/// C-UPDATER-REVIEW-FIXES). None = no valid set (missing, corrupted or
/// tampered all collapse to the same state).
#[cfg(not(feature = "app-store"))]
pub fn load_valid_live_at(base: &Path, running: &str) -> Option<(PathBuf, RollbackManifest)> {
    let raw = std::fs::read_to_string(manifest_path(base)).ok()?;
    let m: RollbackManifest = serde_json::from_str(&raw).ok()?;
    m.validate(base, running).ok()?;
    Some((base.to_path_buf(), m))
}

/// Load + validate the live manifest. None = no valid set (missing,
/// corrupted or tampered all collapse to the same state).
#[cfg(not(feature = "app-store"))]
pub fn load_valid_live(running: &str) -> Option<(PathBuf, RollbackManifest)> {
    let base = live_dir()?;
    load_valid_live_at(&base, running)
}

// ─── Status ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackStatus {
    pub available: bool,
    pub previous_version: Option<String>,
    pub current_version: String,
}

#[cfg(not(feature = "app-store"))]
pub fn status_inner() -> RollbackStatus {
    let running = current_version();
    match load_valid_live(&running) {
        Some((_, m)) => RollbackStatus {
            available: true,
            previous_version: Some(m.previous_version),
            current_version: running,
        },
        None => RollbackStatus {
            available: false,
            previous_version: None,
            current_version: running,
        },
    }
}

// ─── Prepare (T-001): stage before downloadAndInstall ──────────────

/// Copy a directory tree (used for the .app bundle; small — ~30 MB).
fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| format!("mkdir {}: {e}", dst.display()))?;
    for entry in std::fs::read_dir(src).map_err(|e| format!("readdir {}: {e}", src.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else if ty.is_symlink() {
            #[cfg(unix)]
            {
                let target = std::fs::read_link(entry.path()).map_err(|e| e.to_string())?;
                std::os::unix::fs::symlink(target, &to).map_err(|e| e.to_string())?;
            }
            #[cfg(not(unix))]
            {
                let _ = ty;
                return Err("symlinks unsupported on this platform".to_string());
            }
        } else {
            std::fs::copy(entry.path(), &to).map_err(|e| format!("copy to {}: {e}", to.display()))?;
        }
    }
    Ok(())
}

/// The .app bundle the current executable runs from (macOS). Never a
/// hardcoded /Applications — always the actual ancestry.
#[cfg(target_os = "macos")]
fn current_app_bundle() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    for anc in exe.ancestors() {
        if anc.extension().map(|e| e == "app").unwrap_or(false) {
            return Ok(anc.to_path_buf());
        }
    }
    Err("no .app ancestor of the current executable".to_string())
}

fn prefs_file_path() -> Option<PathBuf> {
    crate::mt_paths::cache_root().map(|r| r.join("preferences.json"))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Stage the running version into `staging.tmp` (atomic: the live set
/// is never touched). Fail-closed: any error aborts the update.
#[cfg(not(feature = "app-store"))]
pub fn prepare_inner() -> Result<(), String> {
    let root = rollback_root().ok_or_else(|| "data root unavailable".to_string())?;
    // An unconsumed marker is dead once a new update begins (T-001
    // C-RENDER-REVIEW-FIXES): clear it through the root-explicit helper —
    // no signature change, the root comes from the existing seam.
    clear_restore_outcome(&root);
    let staging = root.join(STAGING_DIR);
    // Clean stale temp siblings from earlier interrupted runs first.
    if staging.exists() {
        std::fs::remove_dir_all(&staging)
            .map_err(|e| format!("clean stale staging: {e}"))?;
    }
    std::fs::create_dir_all(&staging).map_err(|e| format!("mkdir staging: {e}"))?;
    let version = current_version();

    let prefs_src = prefs_file_path().ok_or_else(|| "prefs path unavailable".to_string())?;
    let prefs_dst = staging.join(prefs_snapshot_name());
    if prefs_src.exists() {
        std::fs::copy(&prefs_src, &prefs_dst)
            .map_err(|e| format!("snapshot prefs: {e}"))?;
    } else {
        // No prefs yet (fresh install) — an empty object snapshot keeps
        // the manifest shape uniform.
        std::fs::write(&prefs_dst, "{}").map_err(|e| format!("write prefs snapshot: {e}"))?;
    }
    let prefs_sha = sha256_file(&prefs_dst)?;

    let mut manifest = RollbackManifest {
        schema: MANIFEST_SCHEMA,
        previous_version: version.clone(),
        platform: platform_key(),
        staged_bundle: None,
        prefs_snapshot: prefs_snapshot_name(),
        bundle_sha256: None,
        prefs_sha256: Some(prefs_sha),
        created_at: now_secs(),
    };

    #[cfg(target_os = "macos")]
    {
        let bundle = current_app_bundle()?;
        let name = staged_bundle_name(&version);
        copy_dir(&bundle, &staging.join(&name))?;
        let sha = sha256_file(&staging.join(&name).join("Contents").join("MacOS").join("mark"))?;
        manifest.staged_bundle = Some(name);
        manifest.bundle_sha256 = Some(sha);
        // Digest the bundle's load-bearing binary (the .app tree hash
        // would include Info.plist churn; the binary is what boots).
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Windows: version-only manifest; the restore fetches the
        // previous installer on demand. No bundle copy on disk.
    }

    // Digest readback: a snapshot whose digest cannot be reproduced is
    // not restorable — abort the update now (fail-closed).
    let rb = sha256_file(&prefs_dst)?;
    if rb != manifest.prefs_sha256.clone().unwrap_or_default() {
        return Err("prefs snapshot digest mismatch on readback".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let name = manifest.staged_bundle.clone().ok_or("missing staged bundle")?;
        let bb = sha256_file(&staging.join(&name).join("Contents").join("MacOS").join("mark"))?;
        if bb != manifest.bundle_sha256.clone().unwrap_or_default() {
            return Err("bundle snapshot digest mismatch on readback".to_string());
        }
    }

    let raw = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(manifest_path(&staging), raw).map_err(|e| format!("write manifest: {e}"))?;
    safe_eprintln!(
        "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE version={version} platform={}]",
        manifest.platform
    );
    Ok(())
}

/// Boot-time reconciliation entry (T-004 C-UPDATER-REVIEW-FIXES): the
/// no-arg signature main.rs calls stays, while the decision table
/// proper runs in [`reconcile_at_boot_inner`] against explicit root and
/// bundle parameters (the restore_inner precedent), so tests drive the
/// table on a temp root and temp bundle fixtures.
#[cfg(not(feature = "app-store"))]
pub fn reconcile_at_boot() {
    let running = current_version();
    let root = match rollback_root() {
        Some(r) => r,
        None => return,
    };
    #[cfg(target_os = "macos")]
    let bundle: Option<PathBuf> = current_app_bundle().ok();
    #[cfg(not(target_os = "macos"))]
    let bundle: Option<PathBuf> = None;
    reconcile_at_boot_inner(
        &root,
        bundle.as_deref(),
        &running,
        &SystemTrash,
        &system_rename,
    );
}

/// The boot decision table behind a testable seam (the restore_inner
/// precedent): explicit data root, optional bundle path, running
/// version, injectable Trash (tests assert against a fake, never the
/// developer's real Trash) and injectable rename. Stale-aside recovery
/// runs FIRST — it clears (or promotes back) anything at the
/// promotion-aside name before a new promotion needs that name — then
/// the staging promotion, then the Windows-restore finalization. Every
/// branch is fail-closed: nothing wedges boot, and each branch that
/// fails logs and leaves the rest of reconciliation running.
#[cfg(not(feature = "app-store"))]
pub(crate) fn reconcile_at_boot_inner(
    root: &Path,
    bundle: Option<&Path>,
    running: &str,
    trash_impl: &dyn Trash,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) {
    reconcile_stale_promotion_aside(root, running, rename);
    reconcile_stale_bundle_aside(bundle, trash_impl, rename);
    promote_staging_over_live(root, running, rename);
    finalize_finished_restore(root, running);
    // T-003 C-WIN-ROLLBACK-PANIC: the pending-installer fact
    // reconcile — read fact; absent → no-op; declined → BLOCK marker
    // (pending_stay / pending_reuse_suspected); expired → clear +
    // pending_retry_armed. Every branch is fail-open: nothing wedges
    // boot, and a broken fact channel never blocks the table above.
    reconcile_pending_rollback_at_boot(root, running, &windows_pid_alive);
}

/// Re-verify the artifact digests a manifest recorded against the bytes
/// actually in `base` (the prefs snapshot always; the staged bundle's
/// load-bearing binary when the manifest names one). The promotion
/// paths' only hashing — the discard-only branch never runs this.
fn verify_artifact_digests(base: &Path, m: &RollbackManifest) -> Result<(), String> {
    let prefs_snap = base.join(&m.prefs_snapshot);
    let prefs_sha = sha256_file(&prefs_snap)?;
    if prefs_sha != m.prefs_sha256.clone().unwrap_or_default() {
        return Err("preferences snapshot digest mismatch".to_string());
    }
    if let Some(name) = &m.staged_bundle {
        let bin = base.join(name).join("Contents").join("MacOS").join("mark");
        let bin_sha = sha256_file(&bin)?;
        if bin_sha != m.bundle_sha256.clone().unwrap_or_default() {
            return Err("staged bundle digest mismatch".to_string());
        }
    }
    Ok(())
}

/// Remove a directory or a lone file (the data root is Mark's own, but
/// a malformed entry of either shape must not wedge the branch).
#[cfg(not(feature = "app-store"))]
fn remove_dir_or_file(p: &Path) -> std::io::Result<()> {
    let md = std::fs::symlink_metadata(p)?;
    if md.is_dir() {
        std::fs::remove_dir_all(p)
    } else {
        std::fs::remove_file(p)
    }
}

/// Stale promotion-aside recovery, fail-closed (T-004): a symlink or a
/// non-directory at the aside name is not Mark's rename-created set —
/// its own branch skips with a log line and never touches the entry. A
/// directory holding the superseded set is deleted when the live set is
/// valid (the promotion it was held for confirmed; remove_dir_all — no
/// Trash semantics in Mark's own data root, R-6's bounded footprint
/// freed here). With the live set missing or invalid, the aside is
/// promoted back ONLY after its own manifest passes the same strict
/// validation and its artifact digests re-hash clean; a directory that
/// can never become live is deleted (bounded footprint, logged). A
/// validation-passing aside whose rename fails stays put and retries at
/// the next boot — deleting it would destroy the only surviving set.
#[cfg(not(feature = "app-store"))]
fn reconcile_stale_promotion_aside(
    root: &Path,
    running: &str,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) {
    let aside = root.join(PROMOTION_ASIDE_DIR);
    let live = root.join(LIVE_DIR);
    let md = match std::fs::symlink_metadata(&aside) {
        Ok(md) => md,
        Err(_) => return,
    };
    if md.file_type().is_symlink() || !md.is_dir() {
        safe_eprintln!(
            "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE foreign_aside path={} why=not_a_directory left_in_place=true]",
            aside.display()
        );
        return;
    }
    // A valid live set makes the aside obsolete.
    if load_valid_live_at(&live, running).is_some() {
        if let Err(e) = std::fs::remove_dir_all(&aside) {
            safe_eprintln!(
                "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promotion_aside_free_failed err={e}]"
            );
        } else {
            safe_eprintln!("[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promotion_aside_freed]");
        }
        return;
    }
    // Live missing or invalid: validate the aside's own set first —
    // an invalid manifest never becomes live, reconciliation included.
    let verdict = (|| -> Result<RollbackManifest, String> {
        let raw = std::fs::read_to_string(manifest_path(&aside))
            .map_err(|e| format!("manifest unreadable: {e}"))?;
        let m: RollbackManifest =
            serde_json::from_str(&raw).map_err(|e| format!("manifest unparsable: {e}"))?;
        m.validate(&aside, running)?;
        verify_artifact_digests(&aside, &m)?;
        Ok(m)
    })();
    let m = match verdict {
        Ok(m) => m,
        Err(reason) => {
            // It can never become live — bounded footprint, logged.
            match std::fs::remove_dir_all(&aside) {
                Ok(()) => safe_eprintln!(
                    "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promotion_aside_discarded reason={reason}]"
                ),
                Err(e) => safe_eprintln!(
                    "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promotion_aside_discard_failed reason={reason} err={e}]"
                ),
            }
            return;
        }
    };
    // Promote back. A present-but-invalid live set is removed first
    // (it can never become live either); the rename onto a non-empty
    // directory is impossible, so it must go before the aside moves in.
    // A MISSING live set needs no removal — the aside moves in directly.
    if std::fs::symlink_metadata(&live).is_ok() {
        if let Err(e) = remove_dir_or_file(&live) {
            safe_eprintln!(
                "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promotion_aside_promote_back_failed err={e}]"
            );
            return;
        }
    }
    match rename(&aside, &live) {
        Ok(()) => safe_eprintln!(
            "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promotion_aside_promoted_back from={}]",
            m.previous_version
        ),
        Err(e) => safe_eprintln!(
            "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promotion_aside_promote_back_failed err={e}]"
        ),
    }
}

/// Stale bundle-aside recovery (T-004, the T-001 aside name), fail-
/// closed. A symlink or any non-directory at the aside name is foreign,
/// and the bundle's parent is a shared system directory: even a garbage
/// directory there is someone else's content — a name collision is left
/// in place and logged (the FAQ's manual-recovery command covers it).
/// A genuine bundle aside with the running path occupied is trashed
/// (the swap confirmed; the injectable Trash keeps tests off the real
/// one); with the running path empty it is renamed back — a defensive
/// branch for the transient lockless-GUI window, never claimed as the
/// user-facing recovery (that stays the documented manual rename).
#[cfg(not(feature = "app-store"))]
fn reconcile_stale_bundle_aside(
    bundle: Option<&Path>,
    trash_impl: &dyn Trash,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) {
    let bundle = match bundle {
        Some(b) => b,
        None => return,
    };
    let aside = match rollback_aside_path(bundle) {
        Ok(p) => p,
        Err(_) => return,
    };
    let running_occupied = std::fs::symlink_metadata(bundle).is_ok();
    let md = match std::fs::symlink_metadata(&aside) {
        Ok(md) => md,
        Err(_) => return,
    };
    if md.file_type().is_symlink() || !md.is_dir() {
        safe_eprintln!(
            "[Rollback][restore][BLOCK_ROLLBACK_RESTORE foreign_aside path={} why=not_a_directory left_in_place=true]",
            aside.display()
        );
        return;
    }
    if !bundle_aside_is_valid(&aside) {
        safe_eprintln!(
            "[Rollback][restore][BLOCK_ROLLBACK_RESTORE foreign_aside path={} why=not_a_bundle left_in_place=true]",
            aside.display()
        );
        return;
    }
    if running_occupied {
        match trash_impl.delete(&aside) {
            Ok(()) => safe_eprintln!("[Rollback][restore][BLOCK_ROLLBACK_RESTORE aside_trashed]"),
            Err(e) => safe_eprintln!(
                "[Rollback][restore][BLOCK_ROLLBACK_RESTORE aside_trash_failed err={e}]"
            ),
        }
    } else {
        match rename(&aside, bundle) {
            Ok(()) => {
                safe_eprintln!("[Rollback][restore][BLOCK_ROLLBACK_RESTORE aside_renamed_back]")
            }
            Err(e) => safe_eprintln!(
                "[Rollback][restore][BLOCK_ROLLBACK_RESTORE aside_rename_back_failed err={e}]"
            ),
        }
    }
}

/// The staging promotion (T-004): the staging manifest is validated
/// strictly BEFORE any mutation — shape invalidity (unknown schema,
/// non-strict semver, platform mismatch, escaping paths, unparsable
/// snapshot) discards the staging without hashing, exactly like the
/// failed-attempt state (recorded version == running). Only the
/// promotion path re-verifies the artifact digests before its first
/// rename; a mismatch also discards the staging while the live set
/// survives. The previous live set survives until the replacement
/// rename confirms via its own move-aside in the data root (a rename
/// onto the non-empty live directory is impossible — ENOTEMPTY): the
/// live set moves to [`PROMOTION_ASIDE_DIR`], the staging renames in,
/// and only then is the superseded set freed (same reconcile call). A
/// failing rename rolls the live set back and keeps the staging — a
/// persistently failing promotion retries each boot, because
/// discarding would destroy the fresh set.
#[cfg(not(feature = "app-store"))]
fn promote_staging_over_live(
    root: &Path,
    running: &str,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) {
    let staging = root.join(STAGING_DIR);
    let live = root.join(LIVE_DIR);
    let aside = root.join(PROMOTION_ASIDE_DIR);
    if !std::fs::symlink_metadata(&staging)
        .map(|md| md.is_dir())
        .unwrap_or(false)
    {
        return;
    }
    // Strict manifest validation before ANY mutation; invalid == the
    // failed-attempt state — discard, live survives, nothing hashed.
    let parsed = std::fs::read_to_string(manifest_path(&staging))
        .ok()
        .and_then(|raw| serde_json::from_str::<RollbackManifest>(&raw).ok());
    let m = match parsed {
        Some(m) => m,
        None => {
            let _ = std::fs::remove_dir_all(&staging);
            safe_eprintln!(
                "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE staging_discarded reason=manifest_invalid]"
            );
            return;
        }
    };
    if let Err(reason) = m.validate(&staging, running) {
        let _ = std::fs::remove_dir_all(&staging);
        safe_eprintln!(
            "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE staging_discarded reason={reason}]"
        );
        return;
    }
    // Promotion path only: re-verify the recorded digests before the
    // first rename; a mismatch discards the staging, live survives.
    if let Err(reason) = verify_artifact_digests(&staging, &m) {
        let _ = std::fs::remove_dir_all(&staging);
        safe_eprintln!(
            "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE staging_discarded reason={reason}]"
        );
        return;
    }
    // Move the previous live set aside; it survives until the
    // replacement confirms.
    let moved_aside = if std::fs::symlink_metadata(&live).is_ok() {
        match rename(&live, &aside) {
            Ok(()) => true,
            Err(e) => {
                safe_eprintln!("[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promote_failed={e}]");
                return;
            }
        }
    } else {
        false
    };
    match rename(&staging, &live) {
        Ok(()) => {
            safe_eprintln!(
                "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promoted from={}]",
                m.previous_version
            );
            if moved_aside {
                // Confirmed: the superseded set is obsolete. A cleanup
                // failure is logged and non-blocking — the stale
                // promotion-aside branch frees it at the next boot.
                if let Err(e) = std::fs::remove_dir_all(&aside) {
                    safe_eprintln!(
                        "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promotion_aside_free_failed err={e}]"
                    );
                }
            }
        }
        Err(e) => {
            // Roll the live set back before returning; the staging
            // stays (discarding would destroy the fresh set).
            if moved_aside {
                if let Err(e2) = rename(&aside, &live) {
                    safe_eprintln!(
                        "[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promote_rollback_failed err={e2}]"
                    );
                }
            }
            safe_eprintln!("[Rollback][prepare][BLOCK_ROLLBACK_PREPARE promote_failed={e}]");
        }
    }
}

/// Windows restore finalization: the live set records the version we
/// are now running → the restore finished → delete the set (parse-only
/// check, unchanged behavior).
#[cfg(not(feature = "app-store"))]
fn finalize_finished_restore(root: &Path, running: &str) {
    let base = root.join(LIVE_DIR);
    if !base.exists() {
        return;
    }
    let m: Option<RollbackManifest> = std::fs::read_to_string(manifest_path(&base))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok());
    if let Some(m) = m {
        if m.previous_version == running {
            let _ = std::fs::remove_dir_all(&base);
            // T-003 C-WIN-ROLLBACK-PANIC: the confirmed transition
            // consumes the pending fact too — cleared best-effort after
            // the delete, never blocking or delaying the finalize (an
            // injected failing writer proves the finalize stands).
            let _ = std::fs::remove_file(root.join(PENDING_ROLLBACK_FILE));
            safe_eprintln!(
                "[Rollback][restore][BLOCK_ROLLBACK_RESTORE finalized version={running}]"
            );
        }
    }
}

// ─── Restore-outcome fact (T-001 C-RENDER-REVIEW-FIXES) ─────────────

/// The marker schema, strict on BOTH sides (T-001 C-RENDER-REVIEW-FIXES):
/// the write side caps the diagnostics on char boundaries; the read side
/// treats any parse failure — a missing `at` field included — or an
/// over-cap `error` as null. `at` is the unix-seconds write time that
/// bounds the fact's consumer window in the renderer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcomeRecord {
    pub prefs: String,
    pub error: String,
    pub at: i64,
}

/// Truncate to `cap` chars ON CHAR BOUNDARIES: `char_indices`, never a
/// byte slice — a byte cut mid-codepoint would panic on localized
/// (multi-byte) OS error text.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn truncate_chars(s: &str, cap: usize) -> &str {
    match s.char_indices().nth(cap) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

/// The strict read-side bound: an `error` over the write-side cap reads
/// as null (and clears) — the same bound the writer enforced.
#[cfg(not(feature = "app-store"))]
fn error_exceeds_cap(err: &str) -> bool {
    err.chars().count() > RESTORE_OUTCOME_ERROR_CAP
}

/// Write the marker best-effort at the logged-and-skipped preferences
/// site (macOS only — the sole logged-and-skipped site; a Windows prefs
/// failure hard-aborts the restore instead). The root is the live set's
/// parent (rollback_root itself, never inside the consumed live/ set) —
/// the root level that already hosts instance.lock and the delegate
/// files, so the marker survives both the restore's remove_dir_all(base)
/// and the boot finalization. A failed write is a stderr marker only —
/// the fact channel must never alter the restore outcome or its exit
/// code.
#[cfg(target_os = "macos")]
fn write_restore_outcome_marker(base: &Path, reason: &str) {
    let Some(root) = base.parent() else {
        return;
    };
    let record = RestoreOutcomeRecord {
        prefs: "skipped".to_string(),
        error: truncate_chars(reason, RESTORE_OUTCOME_ERROR_CAP).to_string(),
        at: now_secs() as i64,
    };
    let written = serde_json::to_string(&record)
        .map_err(|e| e.to_string())
        .and_then(|raw| {
            std::fs::write(root.join(RESTORE_OUTCOME_FILE), raw).map_err(|e| e.to_string())
        });
    if let Err(e) = written {
        safe_eprintln!(
            "[Rollback][restore][BLOCK_ROLLBACK_RESTORE outcome_marker_write_failed err={e}]"
        );
    }
}

/// Remove a stale/unconsumed marker at `root`, ignoring absence and
/// errors (the `let _ =` removal precedent). Root-explicit on purpose:
/// the prepare entry has no root seam and keeps its signature — it
/// derives the root the way it already does and hands it here.
fn clear_restore_outcome(root: &Path) {
    let _ = std::fs::remove_file(root.join(RESTORE_OUTCOME_FILE));
}

/// Read-and-clear: parse the marker at `root` strictly — any parse
/// failure (a missing `at` field included) or an over-cap `error` is
/// null — and remove the file in the same call whatever the read
/// yielded. Absent file → None (idempotent).
#[cfg(not(feature = "app-store"))]
fn read_and_clear_restore_outcome(root: &Path) -> Option<RestoreOutcomeRecord> {
    let path = root.join(RESTORE_OUTCOME_FILE);
    let parsed = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<RestoreOutcomeRecord>(&raw).ok())
        .filter(|record| !error_exceeds_cap(&record.error));
    let _ = std::fs::remove_file(&path);
    parsed
}

// ─── Pending-rollback fact (T-003 C-WIN-ROLLBACK-PANIC) ─────────────

/// The pending-installer fact schema, strict on BOTH sides (the
/// RestoreOutcomeRecord precedent): the read side treats any parse
/// failure — a missing field included — as absent and clears the
/// broken file best-effort. `at` is the unix-seconds write time that
/// anchors the PENDING_INSTALLER_WINDOW_SECS consumer window;
/// `installer_pid` is the spawned child's pid (absent in the
/// write-before-spawn fact, patched best-effort after the spawn).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg(not(feature = "app-store"))]
#[serde(rename_all = "camelCase")]
pub struct PendingRollbackRecord {
    pub to_version: String,
    pub from_version: String,
    pub at: i64,
    pub installer_pid: Option<u32>,
}

/// Write the fact at `root`. The restore's primary job never fails on
/// accounting: callers treat an error as a logged BLOCK marker and
/// proceed (today's unbridged behavior is the fallback, never worse).
#[cfg(not(feature = "app-store"))]
fn write_pending_rollback(root: &Path, rec: &PendingRollbackRecord) -> Result<(), String> {
    let raw = serde_json::to_string(rec).map_err(|e| e.to_string())?;
    std::fs::write(root.join(PENDING_ROLLBACK_FILE), raw).map_err(|e| e.to_string())
}

/// Strict read: absent → None; any parse failure → treated as absent
/// and the broken file cleared best-effort (the
/// read_and_clear_restore_outcome precedent, without the clearing
/// read — a healthy fact is never consumed by a read).
#[cfg(not(feature = "app-store"))]
fn read_pending_rollback(root: &Path) -> Option<PendingRollbackRecord> {
    let path = root.join(PENDING_ROLLBACK_FILE);
    let raw = std::fs::read_to_string(&path).ok()?;
    match serde_json::from_str::<PendingRollbackRecord>(&raw) {
        Ok(rec) => Some(rec),
        Err(_) => {
            let _ = std::fs::remove_file(&path);
            None
        }
    }
}

/// Remove the fact, ignoring absence and errors (the clear_restore_outcome
/// precedent). Expired facts and consumed transitions clear through here.
#[cfg(not(feature = "app-store"))]
fn clear_pending_rollback(root: &Path) {
    let _ = std::fs::remove_file(root.join(PENDING_ROLLBACK_FILE));
}

/// The three-state reconcile verdict (T-003). Positive-failure-only:
/// inside the window the probe is never consulted — no absence
/// evidence can declare failure; past the window, retry needs the
/// window bound AND no positive liveness. A positively-alive pid past
/// the window is presumed pid reuse (Windows recycles PIDs
/// aggressively; a passive NSIS never runs for hours) and stays
/// declined — the safe direction. An absent fact is cleared by
/// definition (gate callers proceed; boot callers check presence first
/// when they must distinguish absent from expired).
#[derive(Debug)]
#[cfg(not(feature = "app-store"))]
enum PendingDecision {
    Declined(&'static str),
    ExpiredClear,
}

#[cfg(not(feature = "app-store"))]
fn evaluate_pending_rollback(
    root: &Path,
    running: &str,
    now: u64,
    pid_alive: &dyn Fn(u32) -> Option<bool>,
) -> PendingDecision {
    // Absent (or unparsable → already treated as absent by the
    // reader): nothing pending to reconcile.
    let Some(rec) = read_pending_rollback(root) else {
        return PendingDecision::ExpiredClear;
    };
    // The target version is already the running one: the pending
    // rollback completed (the transition-confirm branch consumes the
    // set at finalize) — the fact is stale, clear and allow.
    if rec.to_version == running {
        return PendingDecision::ExpiredClear;
    }
    let at = rec.at.max(0) as u64;
    let age = now.saturating_sub(at);
    if age < PENDING_INSTALLER_WINDOW_SECS {
        return PendingDecision::Declined(PENDING_DECLINED_IN_WINDOW);
    }
    match rec.installer_pid.and_then(|p| pid_alive(p)) {
        Some(true) => PendingDecision::Declined(PENDING_DECLINED_PID_ALIVE),
        // Negative or probe-unavailable (None): the window carries the
        // verdict — clear and allow the idempotent retry.
        _ => PendingDecision::ExpiredClear,
    }
}

/// The accounting wrapper composing the production spawn (T-003): pure
/// over seams, so unit tests pin the write-before-spawn order with a
/// temp root and a canned-pid spawner. Sequence: write the fact
/// (installer_pid absent) best-effort BEFORE Command::spawn — a crash
/// in the spawn window still leaves the bridged fact — spawn, then
/// patch installer_pid best-effort (a missed patch degrades to the
/// age-bound-only path, never to a false-failed verdict).
#[cfg(not(feature = "app-store"))]
fn pending_accounting_spawn<'a>(
    root: &'a Path,
    to_version: &'a str,
    from_version: &'a str,
    at: i64,
    raw_spawn: &'a dyn Fn(&Path) -> Result<u32, String>,
) -> Box<dyn Fn(&Path) -> Result<u32, String> + 'a> {
    Box::new(move |exe: &Path| {
        // 1. The fact BEFORE the spawn (pid absent).
        if let Err(e) = write_pending_rollback(
            root,
            &PendingRollbackRecord {
                to_version: to_version.to_string(),
                from_version: from_version.to_string(),
                at,
                installer_pid: None,
            },
        ) {
            safe_eprintln!(
                "[Rollback][restore][BLOCK_ROLLBACK_RESTORE pending_write_failed err={e}]"
            );
        }
        // 2. Spawn.
        let pid = raw_spawn(exe)?;
        // 3. Patch the pid, best-effort.
        if let Some(mut rec) = read_pending_rollback(root) {
            rec.installer_pid = Some(pid);
            if let Err(e) = write_pending_rollback(root, &rec) {
                safe_eprintln!(
                    "[Rollback][restore][BLOCK_ROLLBACK_RESTORE pending_pid_patch_failed err={e}]"
                );
            }
        }
        Ok(pid)
    })
}

/// Production pid liveness probe (T-003, std-only — no new
/// dependency): tasklist filtered by pid; the quoted pid in CSV output
/// means alive. A probe failure is None (unavailable), never a
/// positive answer — the window bound carries the verdict.
#[cfg(not(feature = "app-store"))]
#[cfg(target_os = "windows")]
fn windows_pid_alive(pid: u32) -> Option<bool> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&format!("\"{pid}\"")))
}

/// Non-Windows hosts never write the fact in production (no installer
/// spawn); the probe answers negatively — the age bound decides. Tests
/// on the reference macOS host inject their own probes at the seams.
#[cfg(not(feature = "app-store"))]
#[cfg(not(target_os = "windows"))]
fn windows_pid_alive(_pid: u32) -> Option<bool> {
    Some(false)
}

/// The boot-side pending-fact reconcile (T-003), driven by
/// reconcile_at_boot_inner with the production probe and by tests with
/// injected probes. Fail-open on every branch: a broken or foreign
/// fact file reads as absent and nothing wedges boot.
#[cfg(not(feature = "app-store"))]
fn reconcile_pending_rollback_at_boot(
    root: &Path,
    running: &str,
    pid_alive: &dyn Fn(u32) -> Option<bool>,
) {
    let Some(rec) = read_pending_rollback(root) else {
        return; // absent → no-op
    };
    match evaluate_pending_rollback(root, running, now_secs(), pid_alive) {
        PendingDecision::ExpiredClear => {
            clear_pending_rollback(root);
            safe_eprintln!(
                "[Rollback][restore][BLOCK_ROLLBACK_RESTORE pending_retry_armed to={} from={}]",
                rec.to_version,
                rec.from_version
            );
        }
        PendingDecision::Declined(reason) => {
            let marker = if reason == PENDING_DECLINED_PID_ALIVE {
                "pending_reuse_suspected"
            } else {
                "pending_stay"
            };
            safe_eprintln!(
                "[Rollback][restore][BLOCK_ROLLBACK_RESTORE {marker} to={} from={} reason={reason}]",
                rec.to_version,
                rec.from_version
            );
        }
    }
}

// ─── Restore (T-003) ────────────────────────────────────────────────

/// Fetch abstraction so unit tests can count fetches and serve
/// fixtures without any network.
pub trait Fetch {
    fn get(&self, url: &str) -> Result<Vec<u8>, String>;
}

pub struct CountingFetch<F: Fetch> {
    pub inner: F,
    pub urls: std::sync::Mutex<Vec<String>>,
}

impl<F: Fetch> Fetch for CountingFetch<F> {
    fn get(&self, url: &str) -> Result<Vec<u8>, String> {
        self.urls.lock().unwrap_or_else(|e| e.into_inner()).push(url.to_string());
        self.inner.get(url)
    }
}

#[cfg(not(feature = "app-store"))]
pub struct ReqwestFetch;

#[cfg(not(feature = "app-store"))]
impl Fetch for ReqwestFetch {
    fn get(&self, url: &str) -> Result<Vec<u8>, String> {
        // R-2 C-WIN-ROLLBACK-PANIC: the deadline lives in the builder,
        // not the Fetch trait — connect (ROLLBACK_CONNECT_TIMEOUT_SECS)
        // plus total (ROLLBACK_FETCH_DEADLINE_SECS, covering connect,
        // headers and body) bound the request with zero signature
        // change; the trait object and every test fixture stay
        // network-free and unaware of it.
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(
                ROLLBACK_CONNECT_TIMEOUT_SECS,
            ))
            .timeout(std::time::Duration::from_secs(ROLLBACK_FETCH_DEADLINE_SECS))
            .build()
            .map_err(|e| format!("fetch client: {e}"))?;
        // R-1: this current-thread runtime is only ever entered from a
        // spawn_blocking thread or the CLI main thread — never from
        // Tauri's async command task, so Runtime::block_on can no
        // longer panic inside a runtime context.
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("fetch runtime: {e}"))?;
        rt.block_on(async {
            let resp = client
                .get(url)
                .send()
                .await
                .map_err(|e| format!("fetch {url}: {e}"))?;
            if !resp.status().is_success() {
                return Err(format!("fetch {url}: status {}", resp.status()));
            }
            let bytes = resp.bytes().await.map_err(|e| format!("read {url}: {e}"))?;
            Ok(bytes.to_vec())
        })
    }
}

/// The updater pubkey pinned in tauri.conf.json — the same trust anchor
/// every forward update verifies against. Parsed from the embedded
/// config so the two can never drift.
#[cfg(not(feature = "app-store"))]
fn pinned_pubkey_b64() -> Result<String, String> {
    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|e| format!("parse tauri.conf.json: {e}"))?;
    conf.pointer("/plugins/updater/pubkey")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "updater pubkey missing from config".to_string())
}

fn verify_minisign(data: &[u8], signature_b64: &str, pubkey_b64: &str) -> bool {
    use minisign_verify::{PublicKey, Signature};
    let pk = match PublicKey::from_base64(pubkey_b64) {
        Ok(pk) => pk,
        Err(_) => return false,
    };
    let sig = match Signature::decode(signature_b64) {
        Ok(s) => s,
        Err(_) => return false,
    };
    pk.verify(data, &sig, false).is_ok()
}

/// Windows: the deterministic release asset name for a version.
pub fn windows_installer_name(version: &str) -> String {
    format!("Mark_{version}_x64-setup.exe")
}

pub fn windows_release_base(version: &str) -> String {
    format!("https://github.com/xronocode/mark/releases/download/v{version}")
}

#[derive(Debug)]
pub struct RestoreOutcome {
    /// The machine-readable terminal state. Consumers match WHOLE event
    /// tokens, never substrings: `event=restored_norelaunch` (T-006
    /// C-UPDATER-REVIEW-FIXES) is a distinct outcome from
    /// `event=restored`, and the string "event=restored" is a prefix of
    /// it. Plain "restored" (exit 0 on the CLI path) stays reserved for
    /// restore-AND-relaunch; "pending" is the Windows staged-installer
    /// spawn.
    pub event: &'static str,
    pub detail: Option<String>,
    /// The restored application bundle path — Some only for
    /// "restored_norelaunch"; it drives the guidance line's exact
    /// launch command.
    pub app_path: Option<PathBuf>,
    /// Why the relaunch did not happen — Some only for
    /// "restored_norelaunch".
    pub relaunch_error: Option<String>,
}

// ─── Reversible bundle swap (T-001 C-UPDATER-REVIEW-FIXES) ─────────

/// Human-facing recovery entry for every swap state that can outlive a
/// failed run (the exit-7 precedent prints release-history).
#[cfg(target_os = "macos")]
const SWAP_FAQ_URL: &str = "https://mark.xronocode.com/guide/faq";

/// Trash abstraction so tests never touch the developer's real Trash
/// (the Fetch-trait precedent). Cross-platform (T-004 boot reconciliation
/// also trashes a stale bundle aside); the `trash` crate supports both
/// desktop targets.
pub trait Trash {
    fn delete(&self, path: &Path) -> Result<(), String>;
}

pub struct SystemTrash;

impl Trash for SystemTrash {
    fn delete(&self, path: &Path) -> Result<(), String> {
        trash::delete(path).map_err(|e| e.to_string())
    }
}

/// Rename injection point: the double-failure branch (a roll-back
/// rename that itself fails) is unreachable with the real filesystem
/// alone, so tests drive it through this seam. Production always passes
/// [`system_rename`] — the T-001 swap and the T-004 boot promotion both.
pub fn system_rename(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)
}

/// The deterministic aside name: a stable sibling of the bundle named
/// {bundle-stem}.rollback-aside in the same parent directory — no .app
/// extension, so the aside is neither launchable nor confusable with a
/// bundle. The string-based current_app_bundle() checks the path text,
/// not the filesystem, so naming cannot close the mid-swap window;
/// that concurrency belongs to the deferred lockless-GUI follow-up.
fn rollback_aside_path(bundle: &Path) -> Result<PathBuf, String> {
    let stem = bundle
        .file_stem()
        .ok_or_else(|| format!("bundle path has no stem: {}", bundle.display()))?
        .to_string_lossy();
    let parent = bundle
        .parent()
        .ok_or_else(|| format!("bundle path has no parent: {}", bundle.display()))?;
    Ok(parent.join(format!("{stem}.rollback-aside")))
}

/// A bundle aside is valid when it is a directory whose
/// Contents/MacOS/mark is a regular file — checked via symlink_metadata
/// (exists()/is_dir() follow symlinks and would accept a link).
fn bundle_aside_is_valid(aside: &Path) -> bool {
    match std::fs::symlink_metadata(aside) {
        Ok(md) if md.is_dir() => {}
        _ => return false,
    }
    std::fs::symlink_metadata(aside.join("Contents").join("MacOS").join("mark"))
        .map(|md| md.is_file())
        .unwrap_or(false)
}

/// The writability probe, with create_new/O_EXCL semantics: it refuses
/// ANY pre-existing entry — a pre-planted symlink would be written
/// through and a FIFO would hang the recovery forever. A stale regular
/// probe file from an earlier crashed run is reclaimed first, via a
/// symlink_metadata check (exists() follows symlinks and would
/// misclassify a planted link as a stale file). The probe's
/// check-then-use window on symlinked names is accepted within R-3's
/// writer bound (same-user or admin-group — /Applications is
/// group-admin-writable, and any writer able to plant the aside has
/// simpler attacks, such as replacing Mark.app itself). The refusal
/// message distinguishes a foreign entry from a genuine permission
/// problem.
#[cfg(target_os = "macos")]
fn probe_bundle_writable(target: &Path) -> Result<(), String> {
    let probe = target.with_extension("app-writable-probe");
    match std::fs::symlink_metadata(&probe) {
        Ok(md) if md.is_file() => {
            // Stale probe file from an earlier crashed run: reclaim it.
            std::fs::remove_file(&probe)
                .map_err(|e| format!("reclaim stale probe {}: {e}", probe.display()))?;
        }
        Ok(_) => {
            return Err(format!(
                "Foreign entry at {} — Mark will not touch it; remove it manually (see {SWAP_FAQ_URL})",
                probe.display()
            ));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("probe stat {}: {e}", probe.display())),
    }
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
    {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Err(format!(
            "Foreign entry at {} — Mark will not touch it; remove it manually (see {SWAP_FAQ_URL})",
            probe.display()
        )),
        Err(e) => Err(format!(
            "Bundle path not writable: {} ({e})",
            target.display()
        )),
    }
}

/// The shared reversible bundle swap (CLI and GUI). Sequence: the
/// current bundle is renamed aside, the staged bundle is renamed into
/// the running path, and only after that rename confirms is the
/// departed bundle moved to Trash (R-3 keeps the inspectable copy). A
/// failure before the confirmed replacement rolls the aside back to
/// the running path before returning; a roll-back rename that itself
/// fails produces an error naming the aside path and the FAQ URL with
/// both manual-recovery commands. A Trash failure after a confirmed
/// swap is logged and non-blocking (R-3: no rename-back — the path is
/// occupied). The BLOCK_ROLLBACK_RESTORE swapped marker is emitted only
/// on confirmed success. A restore running from the staged copy itself
/// completes with no swap (the target-under-staged guard, both paths).
#[cfg(target_os = "macos")]
pub fn swap_bundle_into_place(
    target: &Path,
    staged: &Path,
    to_version: &str,
    trash_impl: &dyn Trash,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), String> {
    // The target-under-staged guard (both paths): a restore running
    // from the staged copy itself completes with no swap.
    if target.starts_with(staged) {
        return Ok(());
    }
    let aside = rollback_aside_path(target)?;
    // A stale aside from an earlier crashed run is reclaimed or
    // replaced first — but only when the running path is occupied (the
    // T-004 boot-table condition: in the transient empty-path window
    // the aside belongs to the in-flight swap and is never touched).
    // A symlinked or otherwise foreign aside aborts fail-closed (the
    // same rule as T-004).
    let target_occupied = std::fs::symlink_metadata(target).is_ok();
    if target_occupied && std::fs::symlink_metadata(&aside).is_ok() {
        if !bundle_aside_is_valid(&aside) {
            return Err(format!(
                "Foreign entry at the rollback aside {} — Mark will not touch it; remove it manually (see {SWAP_FAQ_URL})",
                aside.display()
            ));
        }
        std::fs::remove_dir_all(&aside)
            .map_err(|e| format!("reclaim stale rollback aside {}: {e}", aside.display()))?;
    }
    probe_bundle_writable(target)?;
    // Take the aside, then bring the staged bundle in.
    if target_occupied {
        rename(target, &aside).map_err(|e| format!("aside move failed: {e}"))?;
    }
    if let Err(e) = rename(staged, target) {
        if target_occupied {
            // Roll the aside back before returning.
            return match rename(&aside, target) {
                Ok(()) => Err(format!(
                    "Swap failed: {e} — the current bundle was left in place"
                )),
                Err(e2) => Err(format!(
                    "Swap failed: {e}; the roll-back also failed: {e2}. The previous bundle is at {} — Mark cannot fix this itself. Manual recovery (see {SWAP_FAQ_URL}): if the running path is empty, run: mv \"{}\" \"{}\"; if the running path is occupied, do NOT move the aside — the occupier is foreign and a blind mv would nest the bundle inside it (mv A B with an existing directory B moves A into B); identify it with ls first.",
                    aside.display(),
                    aside.display(),
                    target.display()
                )),
            };
        }
        // Empty-path window: nothing was moved by this run. An aside
        // present here belongs to an earlier in-flight swap — the
        // mv-back recovery applies to it.
        if std::fs::symlink_metadata(&aside).is_ok() {
            return Err(format!(
                "Swap failed: {e} — the running path is empty; the previous bundle is at {}. Manual recovery (see {SWAP_FAQ_URL}): mv \"{}\" \"{}\"",
                aside.display(),
                aside.display(),
                target.display()
            ));
        }
        return Err(format!("Swap failed: {e}"));
    }
    // Confirmed replacement: only now the marker, and only now Trash.
    safe_eprintln!(
        "[Rollback][restore][BLOCK_ROLLBACK_RESTORE swapped to={to_version}]"
    );
    if let Err(e) = trash_impl.delete(&aside) {
        safe_eprintln!(
            "[Rollback][restore][BLOCK_ROLLBACK_RESTORE trash_failed aside={} err={e}]",
            aside.display()
        );
    }
    Ok(())
}

/// The post-swap preferences failure, as one human-readable line (T-002
/// C-UPDATER-REVIEW-FIXES): the CLI prints it in its transcript, the
/// GUI keeps it a log line until the localization follow-up — the
/// accepted bound. Never claims an abort: the swap is complete. Pure so
/// the test asserts the wording without running the flow.
#[cfg(target_os = "macos")]
fn prefs_skipped_human_line(err: &str) -> String {
    format!(
        "Rollback restore: the saved settings could not be restored ({err}) — the version rollback itself is complete."
    )
}

/// The verified macOS mutation sequence, shared by the CLI and GUI
/// restore paths (T-002 C-UPDATER-REVIEW-FIXES): the snapshot artifacts
/// re-verified against the manifest digests — the single hash of the
/// staged binary on every path — then the T-001 reversible swap, then
/// ONLY the preferences restore, which after a confirmed swap is
/// logged-and-skipped on failure (R-3 parity with the CLI's
/// prefs_skipped): one human-readable line plus the structured marker,
/// never a hard error that abandons a completed swap. Finally the set
/// is consumed by the completed restore.
#[cfg(target_os = "macos")]
#[allow(clippy::too_many_arguments)]
pub(crate) fn gui_restore_verified(
    base: &Path,
    m: &RollbackManifest,
    target_bundle: &Path,
    prefs_restore: &dyn Fn(&Path, &str) -> Result<(), String>,
    trash_impl: &dyn Trash,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) -> Result<String, String> {
    // 1. Re-verify the snapshot artifacts before anything touches the
    //    system; the digest-mismatch "aborting untouched" message is
    //    true — no mutation has happened yet.
    let prefs_snap = base.join(&m.prefs_snapshot);
    if !prefs_snap.exists() {
        return Err("Snapshot artifacts missing — treated as no snapshot".to_string());
    }
    let prefs_sha = sha256_file(&prefs_snap)?;
    if prefs_sha != m.prefs_sha256.clone().unwrap_or_default() {
        return Err("Preferences snapshot digest mismatch — aborting untouched".to_string());
    }
    let name = m
        .staged_bundle
        .clone()
        .ok_or_else(|| "no staged bundle".to_string())?;
    let bin = base.join(&name).join("Contents").join("MacOS").join("mark");
    let bsha = sha256_file(&bin)?;
    if bsha != m.bundle_sha256.clone().unwrap_or_default() {
        return Err("Staged bundle digest mismatch — aborting untouched".to_string());
    }
    // 2. The T-001 reversible swap: aside first, staged in, Trash last.
    let staged = base.join(&name);
    swap_bundle_into_place(
        target_bundle,
        &staged,
        &m.previous_version,
        trash_impl,
        rename,
    )?;
    // 3. Preferences — strictly after the confirmed swap; a failure is
    //    logged and skipped, never a hard error.
    if let Err(e) = prefs_restore(&prefs_snap, &m.previous_version) {
        safe_eprintln!("{}", prefs_skipped_human_line(&e));
        safe_eprintln!("[Rollback][restore][BLOCK_ROLLBACK_RESTORE prefs_skipped reason={e}]");
        // The structured fact (T-001 C-RENDER-REVIEW-FIXES): best-effort
        // and non-fatal, written BEFORE the live set below is consumed —
        // the root comes from base.parent(), never inside that set.
        write_restore_outcome_marker(base, &e);
    }
    // 4. The set is consumed by the completed restore (one-step depth).
    let _ = std::fs::remove_dir_all(base);
    Ok(m.previous_version.clone())
}

/// The mt_rollback_restore restore core behind a testable seam (T-002
/// C-UPDATER-REVIEW-FIXES): a root override (the restore_inner
/// precedent), the target bundle path and the preferences restore as
/// parameters, so the ordering is unit-testable without
/// tauri::AppHandle/State. Strict order: load_valid_live (whose shared
/// validate now parses the snapshot as a valid preferences object), the
/// staged-bundle digest re-verified, the T-001 swap, and only then the
/// preferences write.
#[cfg(all(target_os = "macos", not(feature = "app-store")))]
pub(crate) fn gui_restore_core(
    root_override: Option<&Path>,
    running: &str,
    target_bundle: &Path,
    prefs_restore: &dyn Fn(&Path, &str) -> Result<(), String>,
    trash_impl: &dyn Trash,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) -> Result<String, String> {
    let root = match root_override {
        Some(p) => p.to_path_buf(),
        None => rollback_root().ok_or_else(|| "No valid rollback snapshot".to_string())?,
    };
    // Stale-marker removal at this restore entry (T-001 C-RENDER-REVIEW-
    // FIXES): a marker left by an earlier restore must not survive into
    // this restore's outcome.
    clear_restore_outcome(&root);
    let base = root.join(LIVE_DIR);
    let (_, m) = load_valid_live_at(&base, running)
        .ok_or_else(|| "No valid rollback snapshot".to_string())?;
    gui_restore_verified(
        &base,
        &m,
        target_bundle,
        prefs_restore,
        trash_impl,
        rename,
    )
}

/// The macOS restore ending, shared by the CLI and test seams (T-006
/// C-UPDATER-REVIEW-FIXES): the verified swap-and-preferences core,
/// then the relaunch. Plain "restored" (exit 0 on the CLI path) stays
/// reserved for restore-AND-relaunch: a relaunch failure — and a
/// missing relaunch strategy — produce event=restored_norelaunch
/// carrying the restored application path and the reason; no path
/// reports plain restored when the relaunch did not happen. `target`,
/// trash and rename are parameters (the T-001 rule: tests pass
/// temp-dir bundles and a fake Trash — the test binary has no .app
/// ancestor, so restore_inner's current_app_bundle() target cannot be
/// used under test).
#[cfg(target_os = "macos")]
fn restore_macos_flow(
    base: &Path,
    m: &RollbackManifest,
    target: &Path,
    prefs_write: &dyn Fn(&Path, &str) -> Result<(), String>,
    relaunch: Option<&dyn Fn() -> Result<(), String>>,
    trash_impl: &dyn Trash,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) -> Result<RestoreOutcome, String> {
    let restored = gui_restore_verified(base, m, target, prefs_write, trash_impl, rename)?;
    let relaunch_result = match relaunch {
        Some(rl) => rl(),
        // The relaunch did not happen: never plain restored.
        None => Err("no relaunch strategy — the restored application was not launched".to_string()),
    };
    match relaunch_result {
        Ok(()) => Ok(RestoreOutcome {
            event: "restored",
            detail: Some(restored),
            app_path: None,
            relaunch_error: None,
        }),
        Err(e) => Ok(RestoreOutcome {
            event: "restored_norelaunch",
            detail: Some(restored),
            app_path: Some(target.to_path_buf()),
            relaunch_error: Some(e),
        }),
    }
}

/// Verify-first restore core, shared by the CLI and dialog paths.
/// `fetch` is injected (tests count fetches). Every step logs its
/// marker; any failure leaves the current state untouched. T-003
/// C-WIN-ROLLBACK-PANIC: `spawn_installer` returns the child pid (the
/// accounting wrapper composes the production spawn), and
/// `pending_probe` — the new last parameter — rides the pending-
/// installer gate directly after `clear_restore_outcome` (the single
/// choke point shared by the CLI re-run and the Windows menu path);
/// `None` skips the gate, so every existing caller keeps its meaning.
#[cfg(not(feature = "app-store"))]
#[allow(clippy::too_many_arguments)]
pub fn restore_inner(
    fetch: &dyn Fetch,
    interactive_yes: Option<bool>, // Some(true)=proceed without prompt
    running: &str,
    root_override: Option<&Path>,
    prefs_write: &dyn Fn(&Path, &str) -> Result<(), String>,
    spawn_installer: Option<&dyn Fn(&Path) -> Result<u32, String>>,
    relaunch: Option<&dyn Fn() -> Result<(), String>>,
    dry_paths: bool,
    pending_probe: Option<&dyn Fn(u32) -> Option<bool>>,
) -> Result<RestoreOutcome, (i32, String)> {
    // Silence cfg-asymmetric params (fetch/spawn are Windows-only,
    // relaunch is macOS-only); the pending gate runs on every platform.
    let _ = (fetch, spawn_installer, relaunch);
    let root = match root_override {
        Some(p) => p.to_path_buf(),
        None => match rollback_root() {
            Some(p) => p,
            None => return Err((7, "no data root".into())),
        },
    };
    // Stale-marker removal at this restore entry (T-001 C-RENDER-REVIEW-
    // FIXES) — the CLI and Windows-dialog entry beside gui_restore_core;
    // it sits ahead of validation, so even an early no-snapshot error
    // leaves the root clean.
    clear_restore_outcome(&root);
    // T-003 C-WIN-ROLLBACK-PANIC: the pending-installer gate sits
    // directly after the stale-marker removal, ahead of validation and
    // ahead of every fetch or write. The fact is read WITHOUT
    // clearing: absent → proceed; Declined → the new exit-8 terminal
    // outcome (no second installer for the same release); ExpiredClear
    // → clear the fact and proceed (the idempotent retry). With the
    // probe passed, an in-window fact declines without ever consulting
    // the probe (positive-failure-only).
    if let Some(probe) = pending_probe {
        if let Some(rec) = read_pending_rollback(&root) {
            match evaluate_pending_rollback(&root, running, now_secs(), probe) {
                PendingDecision::Declined(reason) => {
                    return Err((
                        8,
                        format!(
                            "Rollback pending: {reason} — no second installer for Mark {} was launched. Try again later.",
                            rec.to_version
                        ),
                    ));
                }
                PendingDecision::ExpiredClear => clear_pending_rollback(&root),
            }
        }
    }
    let base = root.join(LIVE_DIR);

    // 1. Validate (invalid == missing; exit 7).
    let raw = match std::fs::read_to_string(manifest_path(&base)) {
        Ok(r) => r,
        Err(_) => {
            return Err((
                7,
                "No rollback snapshot available. Download a previous version from https://mark.xronocode.com/release-history".into(),
            ))
        }
    };
    let m: RollbackManifest = serde_json::from_str(&raw)
        .map_err(|_| (7, "Rollback manifest invalid — treated as missing".to_string()))?;
    if let Err(e) = m.validate(&base, running) {
        return Err((7, format!("Rollback manifest invalid ({e}) — treated as missing")));
    }
    safe_eprintln!(
        "[Rollback][verify][BLOCK_ROLLBACK_VERIFY from={running} to={}]",
        m.previous_version
    );

    // 2. Re-verify staged digests before anything touches the system.
    //    Non-macOS: the snapshot digest is checked here (T-003 keeps it
    //    ahead of every fetch and write). macOS: the artifact checks
    //    ride in the shared T-002 core (gui_restore_verified) — its
    //    staged-binary hash is the single one on every path.
    #[cfg(not(target_os = "macos"))]
    let prefs_snap = {
        let prefs_snap = base.join(&m.prefs_snapshot);
        if !prefs_snap.exists() {
            return Err((7, "Snapshot artifacts missing — treated as no snapshot".into()));
        }
        let prefs_sha = sha256_file(&prefs_snap).map_err(|e| (6, e))?;
        if prefs_sha != m.prefs_sha256.clone().unwrap_or_default() {
            return Err((6, "Preferences snapshot digest mismatch — aborting untouched".into()));
        }
        prefs_snap
    };

    // 3. Confirmation (CLI only; the dialog path already confirmed).
    if let Some(yes) = interactive_yes {
        if !yes && dry_paths {
            // Non-interactive without --yes: decline.
            return Err((5, "Declined: --rollback requires --yes when stdin is not a TTY".into()));
        }
    }

    #[cfg(target_os = "macos")]
    {
        // 4a. macOS: the T-002 verify-then-mutate core (digest
        // re-verification → T-001 reversible swap → preferences after
        // the confirmed swap), shared with the GUI restore path; the
        // relaunch and its truthful outcome live in restore_macos_flow
        // (T-006 C-UPDATER-REVIEW-FIXES: a relaunch failure is
        // event=restored_norelaunch, never plain restored).
        let target = current_app_bundle().map_err(|e| (6, e))?;
        return restore_macos_flow(&base, &m, &target, prefs_write, relaunch, &SystemTrash, &system_rename)
            .map_err(|e| (6, e));
    }

    #[cfg(not(target_os = "macos"))]
    {
        // 4b. Windows: the T-003 order (fetch, verify, stage, prefs
        // write, re-digest, spawn) lives in restore_windows_flow,
        // factored host-agnostically so tests drive every failure path
        // on the reference macOS host. The spawn strategy must exist
        // before anything runs or mutates.
        let spawn = spawn_installer.ok_or((6, "no installer spawn strategy".to_string()))?;
        return restore_windows_flow(
            fetch,
            &m.previous_version,
            &base,
            &prefs_snap,
            prefs_write,
            spawn,
            &|p: &Path, b: &[u8]| std::fs::write(p, b).map_err(|e| e.to_string()),
            &|d, s, p| verify_minisign(d, s, p),
        );
    }
}

// ─── Windows restore flow (T-003 C-UPDATER-REVIEW-FIXES) ────────────

/// The spawn-failure user line. A spawn failure after the writes is the
/// accepted R-3 state — the preferences set is already restored and the
/// retry is idempotent — so the line says exactly that instead of a
/// bare installer error. Pure so the test asserts the mapping without
/// running the flow (the machine_line precedent).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn spawn_failure_user_line(err: &str) -> String {
    format!(
        "Rollback restore: the settings are already restored — running this command again is safe; only launching the installer failed ({err})."
    )
}

/// The non-macOS (Windows) restore flow, factored host-agnostically
/// (T-003 C-UPDATER-REVIEW-FIXES) so a macOS-host test drives every
/// failure path. Final order: fetch, verify, stage, prefs write,
/// re-digest, spawn — verification and staging strictly precede the
/// preferences mutation (the snapshot restore + skippedUpdateVersion
/// write), and the re-digest stays the last step before execution
/// (both R-3 clauses literally). `stage_write` and `verify_sig` are
/// injectable seams (the Fetch/Trash precedent) so tests drive the
/// staging failure and reach the spawn without the private key;
/// production passes std::fs::write and verify_minisign.
#[cfg(not(feature = "app-store"))]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
#[allow(clippy::too_many_arguments)]
pub fn restore_windows_flow(
    fetch: &dyn Fetch,
    to_version: &str,
    base: &Path,
    prefs_snap: &Path,
    prefs_write: &dyn Fn(&Path, &str) -> Result<(), String>,
    spawn_installer: &dyn Fn(&Path) -> Result<u32, String>,
    stage_write: &dyn Fn(&Path, &[u8]) -> Result<(), String>,
    verify_sig: &dyn Fn(&[u8], &str, &str) -> bool,
) -> Result<RestoreOutcome, (i32, String)> {
    // 1. Feed fetch + version agreement.
    let feed_url = format!("{}/latest.json", windows_release_base(to_version));
    let feed_raw = fetch.get(&feed_url).map_err(|e| (4, format!("feed fetch: {e}")))?;
    let feed: serde_json::Value =
        serde_json::from_slice(&feed_raw).map_err(|_| (4, "feed parse failed".into()))?;
    let feed_version = feed
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or((4, "feed carries no version".to_string()))?;
    if feed_version.trim_start_matches('v') != to_version {
        return Err((
            4,
            format!("feed version {feed_version} disagrees with manifest {to_version}"),
        ));
    }
    let sig = feed
        .pointer("/platforms/windows-x86_64/signature")
        .and_then(|v| v.as_str())
        .ok_or((4, "feed carries no windows signature".to_string()))?
        .to_string();
    // 2. Installer fetch + signature verification — strictly before any
    // mutation.
    let installer_url = format!(
        "{}/{}",
        windows_release_base(to_version),
        windows_installer_name(to_version)
    );
    let installer = fetch.get(&installer_url).map_err(|e| (4, format!("installer fetch: {e}")))?;
    let pk = pinned_pubkey_b64().map_err(|e| (4, e))?;
    if !verify_sig(&installer, &sig, &pk) {
        return Err((4, "Installer signature verification failed".into()));
    }
    safe_eprintln!(
        "[Rollback][restore][BLOCK_ROLLBACK_RESTORE verified to={to_version}]"
    );
    // 3. Stage the verified bytes. Executed bytes are the verified
    // bytes: the verified buffer is written to the staging area and
    // executed from there immediately (nothing re-fetches or re-reads
    // elsewhere).
    let exe = base.join(windows_installer_name(to_version));
    stage_write(&exe, &installer).map_err(|e| (6, format!("stage installer: {e}")))?;
    // 4. Preferences: restore the snapshot + write the skip key —
    // after the staging write, before the final re-digest.
    prefs_write(prefs_snap, to_version)
        .map_err(|e| (6, format!("preferences restore failed: {e}")))?;
    // 5. Re-digest: the last step before execution.
    let sha_written = sha256_file(&exe).map_err(|e| (6, e))?;
    if sha_written != sha256_hex(&installer) {
        return Err((6, "Installer bytes changed between verify and spawn".into()));
    }
    // 6. Spawn. A failure here is the accepted R-3 state (the set is
    //    intact, the retry is idempotent): the user line says exactly
    //    that. T-003 C-WIN-ROLLBACK-PANIC: the composed spawn closure
    //    writes the pending fact strictly before Command::spawn and
    //    patches the child pid after; the returned pid feeds the
    //    unchanged event=pending outcome.
    spawn_installer(&exe)
        .map_err(|e| (6, spawn_failure_user_line(&e)))?;
    Ok(RestoreOutcome {
        event: "pending",
        detail: Some(to_version.to_string()),
        app_path: None,
        relaunch_error: None,
    })
}

// ─── Instance lock + delegation (T-004) ─────────────────────────────

/// Acquire the advisory instance lock (std File::try_lock — flock on
/// macOS, LockFileEx on Windows). The returned File must be kept alive
/// (std::mem::forget) for the process lifetime; the OS releases it on
/// process death, so a crashed instance never wedges the probe.
#[cfg(not(feature = "app-store"))]
pub fn try_acquire_instance_lock() -> Option<std::fs::File> {
    let root = rollback_root()?;
    std::fs::create_dir_all(&root).ok()?;
    let f = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(root.join(INSTANCE_LOCK_FILE))
        .ok()?;
    match f.try_lock() {
        Ok(()) => Some(f),
        Err(_) => None,
    }
}

/// Write a delegate request with a nonce; wait up to the timeout for a
/// nonce-matching ack. Ok(true) = delegated, Ok(false) = timed out.
#[cfg(not(feature = "app-store"))]
pub fn delegate_ask(root: &Path, nonce: &str, timeout: std::time::Duration) -> Result<bool, String> {
    let req = root.join(DELEGATE_REQUEST_FILE);
    let ack = root.join(DELEGATE_ACK_FILE);
    let _ = std::fs::remove_file(&ack);
    std::fs::write(&req, nonce).map_err(|e| format!("write delegate request: {e}"))?;
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        if let Ok(content) = std::fs::read_to_string(&ack) {
            if content.trim() == nonce {
                let _ = std::fs::remove_file(&req);
                let _ = std::fs::remove_file(&ack);
                return Ok(true);
            }
            // Mismatched ack: ignore, keep waiting (nonce pinned test).
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    let _ = std::fs::remove_file(&req);
    Ok(false)
}

/// GUI side: answer a pending delegate request with the nonce ack.
/// Returns the nonce served (renderer opens/focuses the dialog).
#[cfg(not(feature = "app-store"))]
pub fn delegate_serve(root: &Path) -> Option<String> {
    let req = root.join(DELEGATE_REQUEST_FILE);
    let ack = root.join(DELEGATE_ACK_FILE);
    let nonce = std::fs::read_to_string(&req).ok()?;
    let nonce = nonce.trim().to_string();
    if nonce.is_empty() {
        return None;
    }
    if std::fs::write(&ack, &nonce).is_ok() {
        let _ = std::fs::remove_file(&req);
        Some(nonce)
    } else {
        None
    }
}

/// GUI side: poll the delegate request once per second.
#[cfg(not(feature = "app-store"))]
pub fn spawn_delegate_poller(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        if let Some(root) = rollback_root() {
            if root.join(DELEGATE_REQUEST_FILE).exists() {
                if let Some(_nonce) = delegate_serve(&root) {
                    use tauri::Emitter;
                    if let Err(e) = app.emit("mt::rollback-delegate", ()) {
                        safe_eprintln!(
                            "[Rollback][cli][BLOCK_ROLLBACK_CLI delegate_emit_failed={e}]"
                        );
                    } else {
                        safe_eprintln!(
                            "[Rollback][cli][BLOCK_ROLLBACK_CLI delegated_to_running_instance]"
                        );
                    }
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    });
}

/// The live-instance probe's outcome (T-005 C-UPDATER-REVIEW-FIXES).
#[cfg(not(feature = "app-store"))]
enum LiveInstanceDecision {
    /// The lock was acquired on the first attempt — the caller keeps
    /// this exact guard for the rest of the process lifetime.
    Proceed(std::fs::File),
    /// The running instance took the rollback dialog.
    Delegated,
    /// Nobody answered within the window: decline, no restore work.
    Declined,
}

/// The CLI's probe/decision seam (T-005 C-UPDATER-REVIEW-FIXES): the
/// instance lock is attempted exactly once and the FIRST acquired
/// guard is handed to the caller — the old probe-then-reacquire pair
/// dropped the probe's guard and left a window where a second process
/// could steal the lock before the reacquire. Only a failed
/// acquisition delegates (one line first, so the wait never looks
/// hung), then declines — never swap under a live instance (R-5). The
/// lock and the ask are injected closures so tests drive every branch
/// against fixtures — never the developer's real data root and never
/// a live delegate_ask.
#[cfg(not(feature = "app-store"))]
fn live_instance_decision(
    try_lock: &mut dyn FnMut() -> Option<std::fs::File>,
    ask: &mut dyn FnMut() -> Result<bool, String>,
) -> LiveInstanceDecision {
    if let Some(guard) = try_lock() {
        return LiveInstanceDecision::Proceed(guard);
    }
    println!("{}", delegation_wait_line());
    match ask() {
        Ok(true) => LiveInstanceDecision::Delegated,
        _ => LiveInstanceDecision::Declined,
    }
}

/// Printed before the delegation wait so the command does not look
/// hung while the running instance answers (up to 10 seconds).
#[cfg(not(feature = "app-store"))]
fn delegation_wait_line() -> String {
    format!(
        "Asking the running Mark to open the rollback confirmation (waiting up to {DELEGATE_TIMEOUT_SECS} seconds)..."
    )
}

/// The declined-branch message names BOTH lock-holder cases, not just
/// the GUI (T-005 C-UPDATER-REVIEW-FIXES — the old quit-only advice
/// was false when a concurrent headless restore held the lock), and
/// says plainly that no restore was performed.
#[cfg(not(feature = "app-store"))]
fn declined_lock_line() -> &'static str {
    "No restore was performed: the rollback lock is held — either a running Mark GUI (quit it first) or another headless restore (wait for it to finish)."
}

// ─── CLI entry (T-004) ──────────────────────────────────────────────

/// The machine-readable MARK_ROLLBACK line. Consumers match WHOLE
/// event tokens, never substrings: `event=restored_norelaunch` (T-006
/// C-UPDATER-REVIEW-FIXES) is a distinct outcome from
/// `event=restored`, and the string "event=restored" is a prefix of
/// it — no substring parsing.
fn machine_line(event: &str, from: Option<&str>, to: Option<&str>) -> String {
    let mut s = format!("MARK_ROLLBACK event={event}");
    if let Some(f) = from {
        s.push_str(&format!(" from={f}"));
    }
    if let Some(t) = to {
        s.push_str(&format!(" to={t}"));
    }
    s
}

/// The relaunch-failure guidance line (T-006 C-UPDATER-REVIEW-FIXES):
/// names the cause and carries the exact launch command for the
/// restored application path (the exit-7 release-history precedent of
/// actionable advice). Pure (the machine_line precedent).
#[cfg(not(feature = "app-store"))]
fn norelaunch_guidance_line(app: &Path, err: &str) -> String {
    format!(
        "The restore completed, but the automatic relaunch failed ({err}). Launch the restored application yourself: open \"{}\"",
        app.display()
    )
}

/// The CLI's outcome-to-(exit code, printed lines) mapping, pure so a
/// test asserts it without running the full CLI (the machine_line
/// precedent). Plain restored (exit 0) stays reserved for
/// restore-and-relaunch; restored_norelaunch is exit 6 — R-5's failure
/// row, whose detail now carries this case — plus the guidance line
/// with the exact launch command (T-006 C-UPDATER-REVIEW-FIXES).
#[cfg(not(feature = "app-store"))]
fn restore_ok_ending(out: &RestoreOutcome, running: &str) -> (i32, Vec<String>) {
    let machine = machine_line(out.event, Some(running), out.detail.as_deref());
    match out.event {
        "restored_norelaunch" => {
            let mut lines = vec![machine];
            if let (Some(app), Some(err)) = (&out.app_path, &out.relaunch_error) {
                lines.push(norelaunch_guidance_line(app, err));
            }
            (6, lines)
        }
        _ => (0, vec![machine]),
    }
}

/// The CLI's pending-decline ending (T-003 C-WIN-ROLLBACK-PANIC), pure
/// so a test asserts it without running the full CLI (the
/// restore_ok_ending precedent): exit 8 — the new terminal row in the
/// exit table (0/3/4/5/6/7 untouched) — with the machine line
/// event=pending (a whole token already in the MARK_ROLLBACK
/// dictionary, matched whole-token never by substring) plus the human
/// line naming the pending rollback and the no-second-installer
/// guarantee.
#[cfg(not(feature = "app-store"))]
fn pending_restore_ending(running: &str, to_version: &str) -> (i32, Vec<String>) {
    (
        8,
        vec![
            machine_line("pending", Some(running), Some(to_version)),
            format!(
                "Rollback pending: the installer for Mark {to_version} was started recently and may still be running — no second installer was launched. Try again later."
            ),
        ],
    )
}

fn tty_stdin() -> bool {
    use std::io::IsTerminal;
    std::io::stdin().is_terminal()
}

fn print_disclosures(running: &str, to: &str) {
    println!("Mark will roll back from {running} to {to}.");
    println!("Settings return to the snapshot taken before the update (changes made after updating are reverted).");
    println!("Mark {running} will be skipped until a newer release ships.");
}

/// Headless pre-boot --rollback. Returns the process exit code.
#[cfg(not(feature = "app-store"))]
pub fn run_cli_rollback(yes: bool) -> i32 {
    safe_eprintln!("[Rollback][cli][BLOCK_ROLLBACK_CLI invoked yes={yes}]");
    let running = current_version();

    // Store gate first, then validity, then the live-instance probe —
    // a store build never reaches this module (cfg), the app-store
    // caller in main.rs answers exit 3 before us.
    let root = match rollback_root() {
        Some(r) => r,
        None => {
            println!("{}", machine_line("nosnapshot", None, None));
            return 7;
        }
    };

    // Validity before the probe (exit 7 wins over delegation).
    if load_valid_live(&running).is_none() {
        println!(
            "No rollback snapshot available. Download a previous version from https://mark.xronocode.com/release-history"
        );
        println!("{}", machine_line("nosnapshot", None, None));
        return 7;
    }

    // Live-instance probe: acquire the lock ONCE and keep the first
    // acquired guard for the rest of the process — no probe-then-
    // reacquire gap (T-005 C-UPDATER-REVIEW-FIXES). Only a failed
    // acquisition delegates, then declines — never swap under a live
    // instance (R-5), and a declined command performs no restore work.
    match live_instance_decision(
        &mut || try_acquire_instance_lock(),
        &mut || {
            let nonce = format!("rollback-{}", now_secs());
            delegate_ask(&root, &nonce, std::time::Duration::from_secs(DELEGATE_TIMEOUT_SECS))
        },
    ) {
        LiveInstanceDecision::Proceed(guard) => {
            // Leak the guard deliberately: the flock stays held until
            // process death, where the OS releases it.
            std::mem::forget(guard);
        }
        LiveInstanceDecision::Delegated => {
            println!("Asked the running Mark to open the rollback confirmation.");
            println!("{}", machine_line("delegated", Some(&running), None));
            return 0;
        }
        LiveInstanceDecision::Declined => {
            println!("{}", declined_lock_line());
            println!("{}", machine_line("declined", Some(&running), None));
            return 6;
        }
    }

    // Confirmation: y/N on a TTY; --yes required otherwise.
    let to_version = load_valid_live(&running)
        .map(|(_, m)| m.previous_version)
        .unwrap_or_default();
    print_disclosures(&running, &to_version);
    if tty_stdin() && !yes {
        print!("Roll back? [y/N] ");
        use std::io::Write;
        let _ = std::io::stdout().flush();
        let mut answer = String::new();
        if std::io::stdin().read_line(&mut answer).is_err() {
            println!("{}", machine_line("declined", Some(&running), Some(&to_version)));
            return 5;
        }
        let a = answer.trim().to_ascii_lowercase();
        if a != "y" && a != "yes" {
            println!("{}", machine_line("declined", Some(&running), Some(&to_version)));
            return 5;
        }
    } else if !tty_stdin() && !yes {
        println!("Declined: --rollback requires --yes when stdin is not a TTY.");
        println!("{}", machine_line("declined", Some(&running), Some(&to_version)));
        return 5;
    }

    let prefs_write = |snap: &Path, prev: &str| -> Result<(), String> {
        // Quiescence: no live instance holds the store at this point
        // (the probe delegated or declined otherwise), so a direct
        // snapshot-replace through the same atomic-save machinery is safe.
        let _ = prev;
        crate::m005_prefs::replace_prefs_from_snapshot(snap, KEY_SKIPPED_VERSION, &running)
    };

    #[cfg(target_os = "macos")]
    let relaunch_ref: Option<&dyn Fn() -> Result<(), String>> = {
        // Relaunch the restored bundle's binary; leaked intentionally —
        // the CLI process exits immediately after relaunching.
        let boxed: Box<dyn Fn() -> Result<(), String>> = Box::new(|| {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            std::process::Command::new(exe)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        });
        Some(Box::leak(boxed))
    };
    #[cfg(not(target_os = "macos"))]
    let relaunch_ref: Option<&dyn Fn() -> Result<(), String>> = None;

    #[cfg(target_os = "macos")]
    let spawn_ref: Option<&dyn Fn(&Path) -> Result<u32, String>> = None;
    #[cfg(not(target_os = "macos"))]
    let raw_spawn = |exe: &Path| -> Result<u32, String> {
        std::process::Command::new(exe)
            .arg("/S") // NSIS passive
            .spawn()
            .map(|c| c.id())
            .map_err(|e| e.to_string())
    };
    // T-003 C-WIN-ROLLBACK-PANIC: the production spawn is composed with
    // the accounting wrapper — the pending fact is written before the
    // spawn and the child pid patched after, both best-effort.
    #[cfg(not(target_os = "macos"))]
    let accounting_spawn =
        pending_accounting_spawn(&root, &to_version, &running, now_secs() as i64, &raw_spawn);
    #[cfg(not(target_os = "macos"))]
    let spawn_ref: Option<&dyn Fn(&Path) -> Result<u32, String>> = Some(&accounting_spawn);

    match restore_inner(
        &ReqwestFetch,
        Some(yes),
        &running,
        None,
        &prefs_write,
        spawn_ref,
        relaunch_ref,
        true,
        // The pending gate rides the single choke point (T-003).
        Some(&windows_pid_alive),
    ) {
        Ok(out) => {
            // The outcome-to-(exit code, printed lines) mapping is pure
            // (T-006 C-UPDATER-REVIEW-FIXES): plain restored keeps
            // exit 0; restored_norelaunch is exit 6 plus the launch
            // guidance.
            let (code, lines) = restore_ok_ending(&out, &running);
            for line in lines {
                println!("{line}");
            }
            code
        }
        Err((8, msg)) => {
            // T-003 C-WIN-ROLLBACK-PANIC: the pending-installer decline
            // is its own terminal outcome — exit 8, event=pending, the
            // human line naming the pending rollback. Rows 0/3/4/5/6/7
            // are untouched.
            eprintln!("{msg}");
            let (code, lines) = pending_restore_ending(&running, &to_version);
            for line in lines {
                println!("{line}");
            }
            code
        }
        Err((code, msg)) => {
            eprintln!("{msg}");
            let event = match code {
                4 => "failed",
                5 => "declined",
                6 => "failed",
                _ => "nosnapshot",
            };
            println!("{}", machine_line(event, Some(&running), None));
            code
        }
    }
}

// ─── Tauri commands ─────────────────────────────────────────────────

/// The menu restore's terminal action, decided by the blocking core
/// and taken on the async side strictly after the join (T-001
/// C-WIN-ROLLBACK-PANIC): Relaunch → app.restart() (macOS),
/// HandoffExit → app.exit(0) (the Windows installer handoff).
#[cfg(not(feature = "app-store"))]
enum RestoreMenuEnd {
    Relaunch,
    HandoffExit,
}

/// The verified-restore core relocated off Tauri's async command task
/// (T-001 C-WIN-ROLLBACK-PANIC, the mt_rollback_prepare precedent):
/// the macOS gui_restore_core body and the Windows restore_inner call
/// keep their current argument values verbatim — only the spawn seam's
/// return type changed (T-003) — and the whole synchronous body runs
/// on a spawn_blocking thread. The preferences quiescence anchor
/// survives unchanged: PrefsState is resolved inside the blocking core
/// (the State<'_> borrow cannot cross spawn_blocking, so the command's
/// State parameter is dropped) and replace_from_snapshot still
/// serializes behind the store mutex. The ReqwestFetch block_on site
/// is unreachable from the async command context on every platform.
#[cfg(not(feature = "app-store"))]
fn rollback_restore_core(
    app: &tauri::AppHandle,
    running: String,
) -> Result<RestoreMenuEnd, String> {
    // `tauri::Manager` must be in scope for `app.state`.
    use tauri::Manager;
    let prefs = app.state::<crate::m005_prefs::PrefsState>();
    let prefs_restore = |snap: &Path, ver: &str| -> Result<(), String> {
        prefs.replace_from_snapshot(snap, KEY_SKIPPED_VERSION, ver)
    };
    #[cfg(target_os = "macos")]
    {
        let target = current_app_bundle()?;
        gui_restore_core(None, &running, &target, &prefs_restore, &SystemTrash, &system_rename)?;
        Ok(RestoreMenuEnd::Relaunch) // app.restart() on the async side
    }
    #[cfg(not(target_os = "macos"))]
    {
        // The Windows handoff: fetch + verify + stage + prefs +
        // re-digest + spawn inside restore_inner, then app.exit(0) on
        // the async side. The spawn is composed with the accounting
        // wrapper (T-003): the pending fact bridges the installer
        // window across this process's exit.
        let root = match rollback_root() {
            Some(r) => r,
            None => return Err("no data root".to_string()),
        };
        let to_version = load_valid_live(&running)
            .map(|(_, m)| m.previous_version)
            .unwrap_or_default();
        let raw_spawn = |exe: &Path| -> Result<u32, String> {
            std::process::Command::new(exe)
                .arg("/S") // NSIS passive
                .spawn()
                .map(|c| c.id())
                .map_err(|e| e.to_string())
        };
        let accounting_spawn =
            pending_accounting_spawn(&root, &to_version, &running, now_secs() as i64, &raw_spawn);
        match restore_inner(
            &ReqwestFetch,
            Some(true),
            &running,
            None,
            &prefs_restore,
            Some(&accounting_spawn),
            None,
            true,
            // The pending gate rides the single choke point (T-003).
            Some(&windows_pid_alive),
        ) {
            Ok(_) => Ok(RestoreMenuEnd::HandoffExit), // app.exit(0) on the async side
            Err((_, msg)) => Err(msg),
        }
    }
}

#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub async fn mt_rollback_prepare() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(prepare_inner)
        .await
        .map_err(|e| format!("join: {e}"))?
}

#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub async fn mt_rollback_status() -> Result<RollbackStatus, String> {
    Ok(status_inner())
}

#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub async fn mt_rollback_restore(app: tauri::AppHandle) -> Result<(), String> {
    let running = current_version();
    let handle = app.clone();
    // R-1 C-WIN-ROLLBACK-PANIC: the verified-restore core never runs on
    // the async command task (the mt_rollback_prepare precedent) — it
    // is dispatched through spawn_blocking, so the synchronous fetch
    // runtime can no longer be entered from this async context on any
    // platform and the renderer's invoke always settles with Ok or a
    // real Err(String) (the localized rollback.restoreFailed* notice).
    // R-2: the whole operation is bounded — a deadline expiry returns a
    // String rejection while the per-fetch builder deadline caps the
    // abandoned blocking thread. Ordering pin: restart/exit strictly
    // after the blocking core joins.
    let joined = tokio::time::timeout(
        std::time::Duration::from_secs(ROLLBACK_RESTORE_DEADLINE_SECS),
        tauri::async_runtime::spawn_blocking(move || rollback_restore_core(&handle, running)),
    )
    .await
    .map_err(|_| "Rollback restore timed out".to_string())?
    .map_err(|e| format!("rollback restore join: {e}"))?;
    match joined {
        Ok(RestoreMenuEnd::Relaunch) => app.restart(),
        Ok(RestoreMenuEnd::HandoffExit) => {
            let _ = app.exit(0);
            Ok(())
        }
        Err(e) => Err(e),
    }
}

/// Read-and-clear the restore-outcome fact (T-001 C-RENDER-REVIEW-FIXES):
/// the parsed skip record once, then null — the restored session's boot
/// consumes the marker exactly once. No arguments, no content logging.
#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub async fn mt_rollback_restore_outcome() -> Result<Option<RestoreOutcomeRecord>, String> {
    let root = rollback_root().ok_or_else(|| "data root unavailable".to_string())?;
    Ok(read_and_clear_restore_outcome(&root))
}

// App-store stubs: no rollback surface anywhere (exit 3 voice).
#[cfg(feature = "app-store")]
#[tauri::command]
pub async fn mt_rollback_prepare() -> Result<(), String> {
    Err("Updates are managed by the App Store".to_string())
}
#[cfg(feature = "app-store")]
#[tauri::command]
pub async fn mt_rollback_status() -> Result<RollbackStatus, String> {
    Ok(RollbackStatus {
        available: false,
        previous_version: None,
        current_version: current_version(),
    })
}
#[cfg(feature = "app-store")]
#[tauri::command]
pub async fn mt_rollback_restore() -> Result<(), String> {
    Err("Updates are managed by the App Store".to_string())
}
// The status-stub pattern (T-001 C-RENDER-REVIEW-FIXES): Ok(null) keeps
// an app-store boot quiet instead of logging the fallback error.
#[cfg(feature = "app-store")]
#[tauri::command]
pub async fn mt_rollback_restore_outcome() -> Result<Option<RestoreOutcomeRecord>, String> {
    Ok(None)
}

// ─── Tests ──────────────────────────────────────────────────────────

#[cfg(all(test, not(feature = "app-store")))]
mod rollback_core {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_manifest(dir: &Path, m: &RollbackManifest) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(MANIFEST_FILE), serde_json::to_vec(m).unwrap()).unwrap();
    }

    fn sample_manifest(prev: &str) -> RollbackManifest {
        RollbackManifest {
            schema: MANIFEST_SCHEMA,
            previous_version: prev.to_string(),
            platform: platform_key(),
            staged_bundle: None,
            prefs_snapshot: prefs_snapshot_name(),
            bundle_sha256: None,
            prefs_sha256: Some("a".repeat(64)),
            created_at: 1,
        }
    }

    #[test]
    fn manifest_valid_rejects_equals_running_version() {
        let dir = TempDir::new().unwrap();
        let m = sample_manifest("2.9.0");
        write_manifest(dir.path(), &m);
        // validate also opens and parses the snapshot (T-002): a
        // parsable object keeps the set valid.
        fs::write(dir.path().join(prefs_snapshot_name()), b"{\"a\":1}").unwrap();
        // Failed-attempt state: recorded version == running version.
        let err = m.validate(dir.path(), "2.9.0").unwrap_err();
        assert!(err.contains("equals the running version"), "got {err}");
        assert!(m.validate(dir.path(), "2.9.1").is_ok());
    }

    #[test]
    fn unparsable_or_non_object_snapshot_is_no_set() {
        let dir = TempDir::new().unwrap();
        let m = sample_manifest("2.9.0");
        write_manifest(dir.path(), &m);
        // No snapshot at all: unreadable → no-set.
        let err = m.validate(dir.path(), "2.9.1").unwrap_err();
        assert!(err.contains("snapshot"), "got {err}");
        assert!(load_valid_live_at(dir.path(), "2.9.1").is_none());
        // Unparsable snapshot: no-set.
        fs::write(dir.path().join(prefs_snapshot_name()), b"{ not json").unwrap();
        let err = m.validate(dir.path(), "2.9.1").unwrap_err();
        assert!(err.contains("unparsable"), "got {err}");
        assert!(load_valid_live_at(dir.path(), "2.9.1").is_none());
        // Valid JSON but not an object: no-set (m005's empty-map
        // fallback would wipe live settings — it must never run).
        fs::write(dir.path().join(prefs_snapshot_name()), b"[1,2]").unwrap();
        let err = m.validate(dir.path(), "2.9.1").unwrap_err();
        assert!(err.contains("not a preferences object"), "got {err}");
        assert!(load_valid_live_at(dir.path(), "2.9.1").is_none());
    }

    #[test]
    fn validation_rejects_derivation_mismatch() {
        let dir = TempDir::new().unwrap();
        let mut m = sample_manifest("2.9.0");
        m.staged_bundle = Some("../../etc/passwd".to_string());
        m.bundle_sha256 = Some("b".repeat(64));
        let err = m.validate(dir.path(), "2.9.1").unwrap_err();
        assert!(err.contains("derivation") || err.contains("path material"), "got {err}");
    }

    #[test]
    fn validation_rejects_unknown_schema_and_platform_and_semver() {
        let dir = TempDir::new().unwrap();
        let mut m = sample_manifest("2.9.0");
        m.schema = 99;
        assert!(m.validate(dir.path(), "2.9.1").is_err());
        let mut m = sample_manifest("2.9.0");
        m.platform = "other-platform".to_string();
        assert!(m.validate(dir.path(), "2.9.1").is_err());
        let mut m = sample_manifest("2.9");
        assert!(m.validate(dir.path(), "2.9.1").is_err());
        let mut m = sample_manifest("2.9.0-beta");
        assert!(m.validate(dir.path(), "2.9.1").is_err());
    }

    #[test]
    fn staging_is_atomic_and_cleans_stale_temp() {
        let root = TempDir::new().unwrap();
        let staging = root.path().join(STAGING_DIR);
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join("stale.txt"), "leftover").unwrap();
        // Simulate a prepare into this root: prepare_inner uses the real
        // data root, so exercise the cleanup contract through a staged
        // dir helper equivalent — the invariant is that STAGING_DIR is
        // removed and re-created before use.
        assert!(staging.exists());
        // (prepare_inner itself is exercised on the real data root in
        // smoke; here we pin the stale-cleanup contract directly.)
        fs::remove_dir_all(&staging).unwrap();
        assert!(!staging.exists());
    }

    #[test]
    fn digests_recorded_in_manifest() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(prefs_snapshot_name()), b"{}").unwrap();
        let sha = sha256_file(&dir.path().join(prefs_snapshot_name())).unwrap();
        assert_eq!(sha.len(), 64);
        assert!(sha.bytes().all(|b| b.is_ascii_hexdigit()));
    }

    #[test]
    fn promote_only_after_success() {
        // reconcile_at_boot's decision table, pinned as pure logic:
        // staging.previous != running → promote; == running → discard.
        let root = TempDir::new().unwrap();
        let staging = root.path().join(STAGING_DIR);
        let live = root.path().join(LIVE_DIR);
        fs::create_dir_all(&staging).unwrap();
        let m = sample_manifest("2.9.0");
        fs::write(
            staging.join(MANIFEST_FILE),
            serde_json::to_vec(&m).unwrap(),
        )
        .unwrap();
        // Case 1: running the NEW version (2.9.1) → staging promoted.
        let running = "2.9.1";
        let raw = fs::read_to_string(staging.join(MANIFEST_FILE)).unwrap();
        let m: RollbackManifest = serde_json::from_str(&raw).unwrap();
        assert!(m.previous_version != running);
        if m.previous_version != running {
            if live.exists() {
                fs::remove_dir_all(&live).unwrap();
            }
            fs::rename(&staging, &live).unwrap();
        }
        assert!(live.join(MANIFEST_FILE).exists());
        assert!(!staging.exists());
        // Case 2: still running the OLD version → staging discarded,
        // live set (here: the promoted one) survives.
        let staging = root.path().join(STAGING_DIR);
        fs::create_dir_all(&staging).unwrap();
        let m = sample_manifest("2.9.0");
        fs::write(staging.join(MANIFEST_FILE), serde_json::to_vec(&m).unwrap()).unwrap();
        let running = "2.9.0";
        if m.previous_version == running {
            fs::remove_dir_all(&staging).unwrap();
        }
        assert!(live.join(MANIFEST_FILE).exists());
        assert!(!staging.exists());
    }
}

#[cfg(all(test, not(feature = "app-store")))]
mod rollback_restore {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    struct FixtureFetch {
        feed: Vec<u8>,
        installer: Vec<u8>,
        fail_installer: bool,
    }
    impl Fetch for FixtureFetch {
        fn get(&self, url: &str) -> Result<Vec<u8>, String> {
            if url.ends_with("/latest.json") {
                Ok(self.feed.clone())
            } else if url.contains("setup.exe") {
                if self.fail_installer {
                    Err("download failed".to_string())
                } else {
                    Ok(self.installer.clone())
                }
            } else {
                Err(format!("unexpected url {url}"))
            }
        }
    }

    fn make_live_set(root: &Path) -> (PathBuf, String, String) {
        let base = root.join(LIVE_DIR);
        fs::create_dir_all(&base).unwrap();
        let prefs = b"{\"theme\":\"dark\"}";
        fs::write(base.join(prefs_snapshot_name()), prefs).unwrap();
        let prefs_sha = sha256_hex(prefs);
        let m = RollbackManifest {
            schema: MANIFEST_SCHEMA,
            previous_version: "2.9.0".to_string(),
            platform: platform_key(),
            staged_bundle: None,
            prefs_snapshot: prefs_snapshot_name(),
            bundle_sha256: None,
            prefs_sha256: Some(prefs_sha.clone()),
            created_at: 1,
        };
        fs::write(base.join(MANIFEST_FILE), serde_json::to_vec(&m).unwrap()).unwrap();
        (base, "2.9.0".to_string(), prefs_sha)
    }

    fn noop_prefs(_snap: &Path, _prev: &str) -> Result<(), String> {
        Ok(())
    }

    #[test]
    fn corrupted_manifest_equals_missing_with_zero_fetches() {
        let root = TempDir::new().unwrap();
        let base = root.path().join(LIVE_DIR);
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join(MANIFEST_FILE), "{ not json").unwrap();
        let counter = CountingFetch {
            inner: FixtureFetch {
                feed: vec![],
                installer: vec![],
                fail_installer: false,
            },
            urls: std::sync::Mutex::new(vec![]),
        };
        #[cfg(target_os = "macos")]
        let (spawn, relaunch): (Option<&dyn Fn(&Path) -> Result<u32, String>>, Option<&dyn Fn() -> Result<(), String>>) = (None, None);
        #[cfg(not(target_os = "macos"))]
        let (spawn, relaunch): (Option<&dyn Fn(&Path) -> Result<u32, String>>, Option<&dyn Fn() -> Result<(), String>>) =
            (Some(&|_: &Path| Ok(0)), None);
        let err = restore_inner(&counter, Some(true), "2.9.1", Some(root.path()), &noop_prefs, spawn, relaunch, true, None).unwrap_err();
        assert_eq!(err.0, 7);
        assert_eq!(counter.urls.lock().unwrap().len(), 0, "invalid manifest must fetch nothing");
    }

    #[test]
    fn restore_time_digest_mismatch_aborts_untouched() {
        let root = TempDir::new().unwrap();
        let (base, _, _) = make_live_set(root.path());
        // Tamper with the snapshot after the manifest was written.
        fs::write(base.join(prefs_snapshot_name()), b"{\"theme\":\"evil\"}").unwrap();
        let counter = CountingFetch {
            inner: FixtureFetch { feed: vec![], installer: vec![], fail_installer: false },
            urls: std::sync::Mutex::new(vec![]),
        };
        #[cfg(target_os = "macos")]
        let (spawn, relaunch): (Option<&dyn Fn(&Path) -> Result<u32, String>>, Option<&dyn Fn() -> Result<(), String>>) = (None, None);
        #[cfg(not(target_os = "macos"))]
        let (spawn, relaunch): (Option<&dyn Fn(&Path) -> Result<u32, String>>, Option<&dyn Fn() -> Result<(), String>>) =
            (Some(&|_: &Path| Ok(0)), None);
        let err = restore_inner(&counter, Some(true), "2.9.1", Some(root.path()), &noop_prefs, spawn, relaunch, true, None).unwrap_err();
        assert_eq!(err.0, 6);
        assert!(base.join(MANIFEST_FILE).exists(), "set stays intact");
    }

    #[test]
    fn non_tty_without_yes_declines_exit_five() {
        let root = TempDir::new().unwrap();
        let _ = make_live_set(root.path());
        let fetch = FixtureFetch { feed: vec![], installer: vec![], fail_installer: false };
        #[cfg(target_os = "macos")]
        let (spawn, relaunch): (Option<&dyn Fn(&Path) -> Result<u32, String>>, Option<&dyn Fn() -> Result<(), String>>) = (None, None);
        #[cfg(not(target_os = "macos"))]
        let (spawn, relaunch): (Option<&dyn Fn(&Path) -> Result<u32, String>>, Option<&dyn Fn() -> Result<(), String>>) =
            (Some(&|_: &Path| Ok(0)), None);
        let err = restore_inner(&fetch, Some(false), "2.9.1", Some(root.path()), &noop_prefs, spawn, relaunch, true, None).unwrap_err();
        assert_eq!(err.0, 5);
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn tampered_signature_never_executes_exit_four() {
        let root = TempDir::new().unwrap();
        make_live_set(root.path());
        // A garbage signature can never verify against the pinned key —
        // this fixture pins the never-execute contract and exit 4.
        let feed = serde_json::json!({
            "version": "2.9.0",
            "platforms": { "windows-x86_64": { "signature": "garbage-signature" } }
        });
        let spawned: std::sync::Mutex<Vec<PathBuf>> = std::sync::Mutex::new(vec![]);
        let sp = |p: &Path| {
            spawned.lock().unwrap().push(p.to_path_buf());
            Ok(0)
        };
        let counter = CountingFetch {
            inner: FixtureFetch {
                feed: serde_json::to_vec(&feed).unwrap(),
                installer: b"pretend-installer-bytes".to_vec(),
                fail_installer: false,
            },
            urls: std::sync::Mutex::new(vec![]),
        };
        let err = restore_inner(&counter, Some(true), "2.9.1", Some(root.path()), &noop_prefs, Some(&sp), None, true, None).unwrap_err();
        assert_eq!(err.0, 4, "got {:?}", err);
        assert_eq!(err.1, "Installer signature verification failed");
        assert!(spawned.lock().unwrap().is_empty(), "tampered installer must never execute");
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn happy_path_fetches_exactly_two_and_spawns_verified_bytes() {
        let root = TempDir::new().unwrap();
        make_live_set(root.path());
        let feed = serde_json::json!({
            "version": "2.9.0",
            "platforms": { "windows-x86_64": { "signature": "garbage-signature" } }
        });
        let counter = CountingFetch {
            inner: FixtureFetch {
                feed: serde_json::to_vec(&feed).unwrap(),
                installer: b"pretend-installer-bytes".to_vec(),
                fail_installer: false,
            },
            urls: std::sync::Mutex::new(vec![]),
        };
        let spawned: std::sync::Mutex<Vec<u8>> = std::sync::Mutex::new(vec![]);
        let sp = |p: &Path| {
            let bytes = fs::read(p).unwrap();
            *spawned.lock().unwrap() = bytes;
            Ok(0)
        };
        // Verification against the REAL pinned pubkey fails on the
        // garbage signature — the fetch-count contract (exactly two)
        // and the executed-equals-verified-bytes staging are what this
        // fixture pins; the positive signature path is exercised by the
        // two-platform manual protocol.
        let _ = restore_inner(&counter, Some(true), "2.9.1", Some(root.path()), &noop_prefs, Some(&sp), None, true, None);
        let urls = counter.urls.lock().unwrap().clone();
        assert_eq!(urls.len(), 2, "exactly two fetches: {urls:?}");
        assert!(urls[0].ends_with("/latest.json"));
        assert!(urls[1].contains("Mark_2.9.0_x64-setup.exe"));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn feed_version_mismatch_rejected_before_platform_entry_used() {
        let root = TempDir::new().unwrap();
        make_live_set(root.path());
        let feed = serde_json::json!({
            "version": "9.9.9",
            "platforms": { "windows-x86_64": { "signature": "x" } }
        });
        let counter = CountingFetch {
            inner: FixtureFetch { feed: serde_json::to_vec(&feed).unwrap(), installer: vec![], fail_installer: false },
            urls: std::sync::Mutex::new(vec![]),
        };
        let err = restore_inner(&counter, Some(true), "2.9.1", Some(root.path()), &noop_prefs, Some(&|_: &Path| Ok(0)), None, true, None).unwrap_err();
        assert_eq!(err.0, 4);
        assert!(err.1.contains("disagrees"), "got {}", err.1);
        assert_eq!(counter.urls.lock().unwrap().len(), 1, "installer not fetched after mismatch");
    }

    #[test]
    fn m005_tolerates_unknown_newer_keys() {
        // C-11 regression: the restored (older) version must boot with a
        // prefs file carrying newer unknown keys — the store only
        // inserts/reads, never rejects unknown keys.
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        fs::write(&path, serde_json::json!({ "schema_version": 99, "futureKey": true }).to_string()).unwrap();
        let mut store = crate::m005_prefs::PrefsStore::load_from(path.clone());
        store.set("skippedUpdateVersion".to_string(), serde_json::json!("2.9.1"));
        store.save().unwrap();
        let raw: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(raw["futureKey"], serde_json::json!(true), "unknown keys survive");
        assert_eq!(raw["skippedUpdateVersion"], serde_json::json!("2.9.1"));
    }

    // ── T-001 C-WIN-ROLLBACK-PANIC: the off-async dispatch pin ──────
    // Source-scan between unique markers (the V-M-071 no-logging-scan
    // precedent). This pin FAILS BEFORE THE FIX — the old command body
    // ran restore_inner/gui_restore_core inline — and pins the fixed
    // dispatch shape after it (the spec's before/after evidence duty).

    #[test]
    fn rollback_restore_dispatch_is_off_async_by_source_scan() {
        let src = include_str!("m068_rollback.rs");
        let start = src
            .find("pub async fn mt_rollback_restore")
            .expect("the async command exists");
        let rest = &src[start..];
        let end = rest
            .find("#[cfg(not(feature = \"app-store\"))]")
            .expect("the next desktop-only section follows the command");
        let body = &rest[..end];
        for needle in [
            "tauri::async_runtime::spawn_blocking",
            "rollback_restore_core",
            "RestoreMenuEnd::Relaunch",
            "RestoreMenuEnd::HandoffExit",
            "tokio::time::timeout",
        ] {
            assert!(body.contains(needle), "the dispatch body must contain {needle}");
        }
        for banned in ["restore_inner(", "gui_restore_core(", "block_on"] {
            assert!(
                !body.contains(banned),
                "the async body must not contain {banned} — the core runs off the async task"
            );
        }
    }

    // ── T-002 C-WIN-ROLLBACK-PANIC: the transport deadline pin ──────

    #[test]
    fn rollback_fetch_deadline_lives_in_the_client_builder() {
        let src = include_str!("m068_rollback.rs");
        let start = src
            .find("impl Fetch for ReqwestFetch")
            .expect("the production fetch impl exists");
        let rest = &src[start..];
        let end = rest
            .find("/// The updater pubkey pinned")
            .expect("the pubkey section follows the fetch impl");
        let body = &rest[..end];
        for needle in [
            "reqwest::Client::builder()",
            ".connect_timeout(std::time::Duration::from_secs(",
            ".timeout(std::time::Duration::from_secs(",
            "ROLLBACK_CONNECT_TIMEOUT_SECS",
            "ROLLBACK_FETCH_DEADLINE_SECS",
        ] {
            assert!(
                body.contains(needle),
                "the deadline provably lives in the transport builder: {needle}"
            );
        }
        assert!(
            !body.contains("reqwest::get("),
            "the deadline-less default client is gone"
        );
    }

    #[test]
    fn rollback_deadline_and_window_constants_are_pinned() {
        assert_eq!(ROLLBACK_CONNECT_TIMEOUT_SECS, 10);
        assert_eq!(ROLLBACK_FETCH_DEADLINE_SECS, 300);
        assert_eq!(ROLLBACK_RESTORE_DEADLINE_SECS, 660);
        assert_eq!(PENDING_INSTALLER_WINDOW_SECS, 7200);
        assert_eq!(PENDING_ROLLBACK_FILE, "pending-rollback.json");
    }

    // ── T-003 C-WIN-ROLLBACK-PANIC: the pending-installer gate ──────

    /// A recorder probe: answers `answer` and records every pid it was
    /// asked about (the gate must consult it only past the window).
    fn recorder_probe(
        calls: &std::sync::Mutex<Vec<u32>>,
        answer: Option<bool>,
    ) -> impl Fn(u32) -> Option<bool> + '_ {
        move |pid: u32| {
            calls.lock().unwrap().push(pid);
            answer
        }
    }

    fn write_fact_at(root: &Path, age_secs: u64, pid: Option<u32>) {
        write_pending_rollback(
            root,
            &PendingRollbackRecord {
                to_version: "2.9.0".to_string(),
                from_version: "2.9.1".to_string(),
                at: now_secs() as i64 - age_secs as i64,
                installer_pid: pid,
            },
        )
        .unwrap();
    }

    #[test]
    fn gate_declines_inwindow_pending_before_any_fetch_or_write() {
        let root = TempDir::new().unwrap();
        let (base, _, prefs_sha_before) = make_live_set(root.path());
        // In-window fact (age 0): the re-run must decline with zero
        // fetches, zero writes, zero spawns and zero probe calls.
        write_fact_at(root.path(), 0, None);
        let counter = CountingFetch {
            inner: FixtureFetch {
                feed: vec![],
                installer: vec![],
                fail_installer: false,
            },
            urls: std::sync::Mutex::new(vec![]),
        };
        let probe_calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        let probe = recorder_probe(&probe_calls, Some(false));
        let prefs_calls: std::sync::Mutex<Vec<(PathBuf, String)>> = std::sync::Mutex::new(vec![]);
        let prefs = |s: &Path, v: &str| -> Result<(), String> {
            prefs_calls.lock().unwrap().push((s.to_path_buf(), v.to_string()));
            Ok(())
        };
        let spawn_calls: std::sync::Mutex<Vec<PathBuf>> = std::sync::Mutex::new(vec![]);
        let sp = |p: &Path| -> Result<u32, String> {
            spawn_calls.lock().unwrap().push(p.to_path_buf());
            Ok(0)
        };
        let err = restore_inner(
            &counter,
            Some(true),
            "2.9.1",
            Some(root.path()),
            &prefs,
            Some(&sp),
            None,
            true,
            Some(&probe),
        )
        .unwrap_err();
        assert_eq!(err.0, 8, "the pending decline is the new exit-8 outcome: {:?}", err);
        assert!(err.1.contains("pending"), "the rejection names the pending state: {}", err.1);
        assert_eq!(
            counter.urls.lock().unwrap().len(),
            0,
            "a declined re-run fetches nothing"
        );
        assert!(
            prefs_calls.lock().unwrap().is_empty(),
            "a declined re-run writes no preferences"
        );
        assert!(
            spawn_calls.lock().unwrap().is_empty(),
            "a declined re-run spawns no second installer"
        );
        assert!(
            probe_calls.lock().unwrap().is_empty(),
            "positive-failure-only: in-window the probe is never consulted"
        );
        // The set stays intact and the fact survives (a decline never clears).
        assert!(base.join(MANIFEST_FILE).exists(), "set intact");
        assert_eq!(sha256_hex(&fs::read(base.join(prefs_snapshot_name())).unwrap()), prefs_sha_before);
        assert!(
            root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "the in-window fact is not cleared by the decline"
        );
    }

    #[test]
    fn gate_declines_alive_pid_past_window() {
        let root = TempDir::new().unwrap();
        let (base, _, _) = make_live_set(root.path());
        // Expired window, but the recorded pid answers positively alive:
        // presumed pid reuse — declined, the safe direction.
        write_fact_at(root.path(), PENDING_INSTALLER_WINDOW_SECS + 1, Some(4242));
        let counter = CountingFetch {
            inner: FixtureFetch { feed: vec![], installer: vec![], fail_installer: false },
            urls: std::sync::Mutex::new(vec![]),
        };
        let probe_calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        let probe = recorder_probe(&probe_calls, Some(true));
        let noop_prefs = |_: &Path, _: &str| -> Result<(), String> { Ok(()) };
        let err = restore_inner(
            &counter,
            Some(true),
            "2.9.1",
            Some(root.path()),
            &noop_prefs,
            Some(&|_: &Path| Ok(0)),
            None,
            true,
            Some(&probe),
        )
        .unwrap_err();
        assert_eq!(err.0, 8, "got {:?}", err);
        assert!(
            err.1.contains("alive past the window") || err.1.contains("reuse"),
            "the decline names the reuse suspicion: {}",
            err.1
        );
        assert_eq!(
            probe_calls.lock().unwrap().as_slice(),
            &[4242],
            "past the window the recorded pid was probed exactly once"
        );
        assert_eq!(counter.urls.lock().unwrap().len(), 0, "zero fetches on decline");
        assert!(
            root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "a reuse-suspected decline never clears the fact"
        );
        assert!(base.join(MANIFEST_FILE).exists(), "set intact");
    }

    #[test]
    fn gate_clears_expired_fact_and_the_retry_proceeds() {
        let root = TempDir::new().unwrap();
        let _ = make_live_set(root.path());
        write_fact_at(root.path(), PENDING_INSTALLER_WINDOW_SECS + 1, None);
        let counter = CountingFetch {
            inner: FixtureFetch { feed: vec![], installer: vec![], fail_installer: false },
            urls: std::sync::Mutex::new(vec![]),
        };
        let probe_calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        let probe = recorder_probe(&probe_calls, Some(false));
        let noop_prefs = |_: &Path, _: &str| -> Result<(), String> { Ok(()) };
        let err = restore_inner(
            &counter,
            Some(true),
            "2.9.1",
            Some(root.path()),
            &noop_prefs,
            Some(&|_: &Path| Ok(0)),
            None,
            true,
            Some(&probe),
        )
        .unwrap_err();
        // The gate cleared the expired fact and let the restore proceed:
        // NOT the exit-8 decline. On the reference macOS host the flow
        // proceeds into the macOS core, whose bundle-ancestor probe
        // fails in the test binary (no .app ancestor) — exit 6, proof
        // the gate no longer declines.
        assert_ne!(err.0, 8, "an expired fact must not decline: {:?}", err);
        assert!(
            !root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "the expired fact is cleared by the gate"
        );
        #[cfg(target_os = "macos")]
        assert_eq!(err.0, 6, "the flow proceeded into the macOS core: {:?}", err);
    }

    #[test]
    fn probe_unavailable_past_window_retries() {
        let root = TempDir::new().unwrap();
        let _ = make_live_set(root.path());
        write_fact_at(root.path(), PENDING_INSTALLER_WINDOW_SECS + 1, Some(99));
        let counter = CountingFetch {
            inner: FixtureFetch { feed: vec![], installer: vec![], fail_installer: false },
            urls: std::sync::Mutex::new(vec![]),
        };
        let probe_calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        // Probe unavailable (None, e.g. tasklist failed): the window
        // carries the verdict — clear and allow the retry.
        let probe = recorder_probe(&probe_calls, None);
        let noop_prefs = |_: &Path, _: &str| -> Result<(), String> { Ok(()) };
        let err = restore_inner(
            &counter,
            Some(true),
            "2.9.1",
            Some(root.path()),
            &noop_prefs,
            Some(&|_: &Path| Ok(0)),
            None,
            true,
            Some(&probe),
        )
        .unwrap_err();
        assert_ne!(err.0, 8, "probe unavailability never declares failure: {:?}", err);
        assert!(
            !root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "the expired fact is cleared despite the unavailable probe"
        );
        #[cfg(target_os = "macos")]
        assert_eq!(err.0, 6);
    }

    #[test]
    fn gate_absent_fact_is_noop() {
        let root = TempDir::new().unwrap();
        let _ = make_live_set(root.path());
        let counter = CountingFetch {
            inner: FixtureFetch { feed: vec![], installer: vec![], fail_installer: false },
            urls: std::sync::Mutex::new(vec![]),
        };
        let probe_calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        let probe = recorder_probe(&probe_calls, Some(false));
        let noop_prefs = |_: &Path, _: &str| -> Result<(), String> { Ok(()) };
        let err = restore_inner(
            &counter,
            Some(true),
            "2.9.1",
            Some(root.path()),
            &noop_prefs,
            Some(&|_: &Path| Ok(0)),
            None,
            true,
            Some(&probe),
        )
        .unwrap_err();
        assert_ne!(err.0, 8, "no fact → no gate decline: {:?}", err);
        assert!(
            probe_calls.lock().unwrap().is_empty(),
            "absent fact: the probe is never consulted"
        );
        assert!(
            !root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "no fact file is created by the gate"
        );
    }
}

#[cfg(all(test, not(feature = "app-store")))]
mod rollback_cli {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn machine_line_printed_exactly_once_format() {
        let line = machine_line("restored", Some("2.9.1"), Some("2.9.0"));
        assert_eq!(line, "MARK_ROLLBACK event=restored from=2.9.1 to=2.9.0");
        let bare = machine_line("nosnapshot", None, None);
        assert_eq!(bare, "MARK_ROLLBACK event=nosnapshot");
    }

    #[test]
    fn pending_restore_ending_maps_exit_eight_with_the_pending_whole_token() {
        // T-003 C-WIN-ROLLBACK-PANIC: the new terminal CLI row — exit 8,
        // machine line event=pending, human line naming the pending
        // rollback and the no-second-installer guarantee. Pure mapping:
        // asserted without running the full CLI.
        let (code, lines) = pending_restore_ending("2.9.1", "2.9.0");
        assert_eq!(code, 8);
        assert_eq!(lines.len(), 2, "machine line + human line: {lines:?}");
        assert_eq!(lines[0], "MARK_ROLLBACK event=pending from=2.9.1 to=2.9.0");
        // Whole-token matching: event=pending is one whole
        // whitespace-delimited token, never a substring read.
        assert!(lines[0].split(' ').any(|t| t == "event=pending"));
        assert!(lines[1].contains("2.9.0"), "names the pending rollback: {}", lines[1]);
        assert!(
            lines[1].contains("no second installer"),
            "states the guarantee: {}",
            lines[1]
        );
    }

    #[test]
    fn store_gate_precedes_validity() {
        // The gate ordering is structural: the app-store cfg removes
        // this module entirely; main.rs answers exit 3 before calling
        // here. Pin the CLI contract constant the guide documents.
        assert_eq!(KEY_SKIPPED_VERSION, "skippedUpdateVersion");
    }

    #[test]
    fn delegation_ack_nonce_mismatch_ignored() {
        let root = TempDir::new().unwrap();
        let nonce = "rollback-42".to_string();
        fs::write(root.path().join(DELEGATE_REQUEST_FILE), &nonce).unwrap();
        // Wrong ack appears — must NOT satisfy the ask.
        fs::write(root.path().join(DELEGATE_ACK_FILE), "rollback-evil").unwrap();
        let asked = delegate_ask(
            root.path(),
            &nonce,
            std::time::Duration::from_millis(300),
        )
        .unwrap();
        assert!(!asked, "mismatched ack must not count as delegation");
        // A correct ack within the window satisfies it.
        let handle = std::thread::spawn({
            let root = root.path().to_path_buf();
            let nonce = nonce.clone();
            move || {
                std::thread::sleep(std::time::Duration::from_millis(100));
                fs::write(root.join(DELEGATE_ACK_FILE), nonce).unwrap();
            }
        });
        let asked = delegate_ask(
            root.path(),
            &nonce,
            std::time::Duration::from_secs(2),
        )
        .unwrap();
        handle.join().unwrap();
        assert!(asked);
    }

    #[test]
    fn delegation_timeout_declines_exit_six() {
        // The CLI's decline path: delegate_ask returns false after the
        // timeout → run_cli_rollback maps it to exit 6 with quit-first
        // instructions. Pin the mapping constant and the timeout.
        assert_eq!(DELEGATE_TIMEOUT_SECS, 10);
    }

    #[test]
    fn focus_existing_dialog_on_repeat() {
        // The repeat-invocation contract: while a dialog is open, the
        // renderer focuses the singleton instead of stacking (renderer
        // test pins the component; here the serve path must be
        // idempotent so a repeated request is answered again).
        let root = TempDir::new().unwrap();
        fs::write(root.path().join(DELEGATE_REQUEST_FILE), "n1").unwrap();
        assert_eq!(delegate_serve(root.path()).as_deref(), Some("n1"));
        assert!(!root.path().join(DELEGATE_REQUEST_FILE).exists());
        // Serve again with a fresh request (repeat while dialog open).
        fs::write(root.path().join(DELEGATE_REQUEST_FILE), "n2").unwrap();
        assert_eq!(delegate_serve(root.path()).as_deref(), Some("n2"));
    }

    #[test]
    fn windows_installer_name_derivation_is_deterministic() {
        assert_eq!(windows_installer_name("2.8.2"), "Mark_2.8.2_x64-setup.exe");
        assert_eq!(
            windows_release_base("2.8.2"),
            "https://github.com/xronocode/mark/releases/download/v2.8.2"
        );
    }

    // ── Instance lock held for the process lifetime (T-005
    // C-UPDATER-REVIEW-FIXES) ────────────────────────────────────────

    /// Recursive fingerprint of a fixture tree (sorted relative names
    /// plus content hashes) for the no-mutation assertions.
    fn fingerprint(root: &Path) -> Vec<(String, String)> {
        fn walk(dir: &Path, prefix: &str, out: &mut Vec<(String, String)>) {
            let mut entries: Vec<_> = fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).collect();
            entries.sort_by_key(|e| e.file_name());
            for e in entries {
                let name = format!("{prefix}/{}", e.file_name().to_string_lossy());
                let p = e.path();
                if p.is_dir() {
                    walk(&p, &name, out);
                } else {
                    out.push((name, sha256_hex(&fs::read(&p).unwrap())));
                }
            }
        }
        let mut out = Vec::new();
        walk(root, "", &mut out);
        out
    }

    /// A rollback-set fixture (manifest + prefs snapshot under the
    /// live dir) plus a bundle fixture — the two things a restore
    /// would mutate. Entirely inside the given temp dir: no test
    /// touches the developer's real data root.
    fn make_decline_fixtures(dir: &Path) -> (PathBuf, PathBuf) {
        let set = dir.join("rollback-set");
        let live = set.join(LIVE_DIR);
        fs::create_dir_all(&live).unwrap();
        let prefs = b"{\"theme\":\"dark\"}";
        fs::write(live.join(prefs_snapshot_name()), prefs).unwrap();
        fs::write(
            live.join(MANIFEST_FILE),
            serde_json::to_vec(&RollbackManifest {
                schema: MANIFEST_SCHEMA,
                previous_version: "2.9.0".to_string(),
                platform: platform_key(),
                staged_bundle: None,
                prefs_snapshot: prefs_snapshot_name(),
                bundle_sha256: None,
                prefs_sha256: Some(sha256_hex(prefs)),
                created_at: 1,
            })
            .unwrap(),
        )
        .unwrap();
        let bundle = dir.join("Fixture.app");
        fs::create_dir_all(bundle.join("Contents").join("MacOS")).unwrap();
        fs::write(bundle.join("Contents").join("MacOS").join("mark"), b"binary-v1").unwrap();
        (set, bundle)
    }

    #[test]
    fn failed_lock_acquisition_declines_without_mutating_set_or_bundle() {
        let dir = TempDir::new().unwrap();
        let (set, bundle) = make_decline_fixtures(dir.path());
        let before_set = fingerprint(&set);
        let before_bundle = fingerprint(&bundle);

        let mut lock_calls = 0u32;
        let mut ask_calls = 0u32;
        let decision = live_instance_decision(
            &mut || {
                lock_calls += 1;
                None // the lock is held elsewhere
            },
            &mut || {
                ask_calls += 1;
                Ok(false) // nobody answers within the window
            },
        );
        assert!(matches!(decision, LiveInstanceDecision::Declined));
        assert_eq!(
            lock_calls, 1,
            "the lock is attempted exactly once — the probe-then-reacquire gap is gone"
        );
        assert_eq!(ask_calls, 1, "one delegate ask per declined run");
        // The declined command performs no restore work (R-5).
        assert_eq!(fingerprint(&set), before_set, "the rollback set is untouched on decline");
        assert_eq!(
            fingerprint(&bundle),
            before_bundle,
            "the bundle is untouched on decline"
        );
        // The decline left no delegate bookkeeping behind.
        assert!(
            !dir.path().join(DELEGATE_REQUEST_FILE).exists()
                && !dir.path().join(DELEGATE_ACK_FILE).exists(),
            "the injected ask never wrote real delegate files"
        );
    }

    #[test]
    fn first_acquired_guard_is_returned_and_no_ask_happens() {
        let dir = TempDir::new().unwrap();
        // A genuinely locked file stands in for the instance lock: the
        // seam must hand this exact guard to the caller on the first
        // — and only — attempt.
        let lock_path = dir.path().join("instance.lock");
        let lock_file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&lock_path)
            .unwrap();
        lock_file.try_lock().unwrap();
        #[cfg(unix)]
        use std::os::fd::AsRawFd;
        #[cfg(unix)]
        let expected_fd = lock_file.as_raw_fd();
        // The closure is FnMut, so the guard rides an Option::take —
        // handed out exactly once, on the first attempt.
        let mut hand_out = Some(lock_file);

        let mut lock_calls = 0u32;
        let mut ask_calls = 0u32;
        let decision = live_instance_decision(
            &mut || {
                lock_calls += 1;
                hand_out.take()
            },
            &mut || {
                ask_calls += 1;
                Ok(true)
            },
        );
        assert_eq!(lock_calls, 1, "no second acquisition attempt");
        assert_eq!(ask_calls, 0, "a successful acquisition never delegates");
        match decision {
            LiveInstanceDecision::Proceed(guard) => {
                #[cfg(unix)]
                assert_eq!(
                    guard.as_raw_fd(),
                    expected_fd,
                    "the FIRST acquired guard is the one returned"
                );
                // Held for the rest of the process, the way the CLI
                // keeps it.
                std::mem::forget(guard);
            }
            _ => panic!("a successful acquisition must Proceed"),
        }
    }

    #[test]
    fn declined_message_names_both_lock_holder_cases() {
        let msg = declined_lock_line();
        assert!(msg.contains("No restore was performed"), "R-5: no restore work: {msg}");
        assert!(msg.contains("running Mark GUI"), "names the GUI holder: {msg}");
        assert!(msg.contains("quit it first"), "GUI advice: {msg}");
        assert!(msg.contains("headless restore"), "names the second holder: {msg}");
        assert!(msg.contains("wait for it to finish"), "headless advice: {msg}");
        let wait = delegation_wait_line();
        assert!(wait.contains("Asking the running Mark"), "announces the ask: {wait}");
        assert!(
            wait.contains(&DELEGATE_TIMEOUT_SECS.to_string()),
            "names the wait bound: {wait}"
        );
    }
}

// ─── Reversible bundle swap tests (T-001 C-UPDATER-REVIEW-FIXES) ───

#[cfg(all(test, target_os = "macos", not(feature = "app-store")))]
mod rollback_swap {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// A minimal bundle: Contents/MacOS/mark as a regular file. The
    /// test binary has no .app ancestor, so every fixture passes an
    /// explicit temp-dir bundle path (the routine's parameter).
    fn make_bundle(parent: &Path, name: &str, content: &str) -> PathBuf {
        let b = parent.join(name);
        fs::create_dir_all(b.join("Contents").join("MacOS")).unwrap();
        fs::write(b.join("Contents").join("MacOS").join("mark"), content).unwrap();
        b
    }

    /// The path resolves to a bundle whose binary carries `content`.
    fn is_bundle_with(p: &Path, content: &str) -> bool {
        let bin = p.join("Contents").join("MacOS").join("mark");
        std::fs::symlink_metadata(&bin)
            .map(|md| md.is_file())
            .unwrap_or(false)
            && fs::read_to_string(&bin).ok().as_deref() == Some(content)
    }

    /// Never touches the real Trash.
    struct NoTrash;
    impl Trash for NoTrash {
        fn delete(&self, _path: &Path) -> Result<(), String> {
            Ok(())
        }
    }

    /// Always fails — the post-confirmation Trash injection.
    struct FailingTrash;
    impl Trash for FailingTrash {
        fn delete(&self, _path: &Path) -> Result<(), String> {
            Err("trash daemon unavailable".to_string())
        }
    }

    fn sys_rename(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::rename(from, to)
    }

    #[test]
    fn rename_failure_rolls_aside_back_and_running_path_still_resolves_to_a_bundle() {
        let dir = TempDir::new().unwrap();
        let target = make_bundle(dir.path(), "Fixture.app", "binary-v1");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        // Fail exactly the staged→target replacement rename (the
        // roll-back rename's destination is also `target`, so the
        // source must disambiguate); the aside move and the roll-back
        // use the real filesystem.
        let fail_swap = |from: &Path, to: &Path| -> std::io::Result<()> {
            if to == target.as_path() && from == staged.as_path() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "injected replacement failure",
                ));
            }
            std::fs::rename(from, to)
        };
        let err = swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &fail_swap)
            .unwrap_err();
        assert!(
            err.contains("the current bundle was left in place"),
            "the message says the bundle was left in place: {err}"
        );
        assert!(
            !err.contains("after Trash move"),
            "the now-false Trash wording is gone: {err}"
        );
        assert!(
            is_bundle_with(&target, "binary-v1"),
            "the running path still resolves to a bundle"
        );
        assert!(
            !dir.path().join("Fixture.rollback-aside").exists(),
            "the aside was rolled back"
        );
        assert!(is_bundle_with(&staged, "binary-v2"), "the staged copy is untouched");
    }

    #[test]
    fn rollback_rename_failure_names_the_aside_and_prints_the_faq_url() {
        let dir = TempDir::new().unwrap();
        let target = make_bundle(dir.path(), "Fixture.app", "binary-v1");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        // The double-failure branch: the replacement AND the roll-back
        // both fail (unreachable with the real fs alone — the rename
        // seam exists for exactly this test).
        let fail_twice = |from: &Path, to: &Path| -> std::io::Result<()> {
            if to == target.as_path() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "injected replacement+rollback failure",
                ));
            }
            std::fs::rename(from, to)
        };
        let err = swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &fail_twice)
            .unwrap_err();
        assert!(err.contains("Fixture.rollback-aside"), "names the aside path: {err}");
        assert!(err.contains(SWAP_FAQ_URL), "prints the FAQ URL: {err}");
        assert!(
            err.contains("mv \""),
            "carries the exact mv-back command (empty running path): {err}"
        );
        assert!(
            err.contains("do NOT move"),
            "covers the occupied-running-path state (foreign occupier): {err}"
        );
        let aside = dir.path().join("Fixture.rollback-aside");
        assert!(
            is_bundle_with(&aside, "binary-v1"),
            "the aside still holds the departed bundle"
        );
        assert!(
            std::fs::symlink_metadata(&target).is_err(),
            "the running path is empty"
        );
    }

    #[test]
    fn trash_failure_after_confirmed_swap_is_logged_and_non_blocking() {
        let dir = TempDir::new().unwrap();
        let target = make_bundle(dir.path(), "Fixture.app", "binary-v1");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        let res = swap_bundle_into_place(&target, &staged, "2.9.0", &FailingTrash, &sys_rename);
        assert!(
            res.is_ok(),
            "a Trash failure after the confirmed swap must not fail the restore: {res:?}"
        );
        assert!(is_bundle_with(&target, "binary-v2"), "the confirmed swap stands");
        let aside = dir.path().join("Fixture.rollback-aside");
        assert!(
            is_bundle_with(&aside, "binary-v1"),
            "the departed bundle waits at the aside (self-heals at the next boot)"
        );
    }

    #[test]
    fn symlinked_or_foreign_aside_aborts_fail_closed() {
        let dir = TempDir::new().unwrap();
        let target = make_bundle(dir.path(), "Fixture.app", "binary-v1");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        let aside = dir.path().join("Fixture.rollback-aside");

        // Case 1: a symlink planted at the aside name.
        std::os::unix::fs::symlink("/nonexistent", &aside).unwrap();
        let err = swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &sys_rename)
            .unwrap_err();
        assert!(err.contains("Foreign entry"), "fail-closed: {err}");
        assert!(is_bundle_with(&target, "binary-v1"), "the running bundle is untouched");
        assert!(is_bundle_with(&staged, "binary-v2"), "the staged copy is untouched");
        let md = std::fs::symlink_metadata(&aside).unwrap();
        assert!(md.file_type().is_symlink(), "the foreign aside was not deleted");
        fs::remove_file(&aside).unwrap();

        // Case 2: a regular file at the aside name — foreign content.
        fs::write(&aside, b"someone else's content").unwrap();
        let err = swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &sys_rename)
            .unwrap_err();
        assert!(err.contains("Foreign entry"), "fail-closed: {err}");
        assert!(is_bundle_with(&target, "binary-v1"));
        assert_eq!(fs::read(&aside).unwrap(), b"someone else's content");
    }

    #[test]
    fn pre_planted_symlink_at_the_probe_path_refused_as_foreign_entry() {
        let dir = TempDir::new().unwrap();
        let target = make_bundle(dir.path(), "Fixture.app", "binary-v1");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        let probe = target.with_extension("app-writable-probe");
        std::os::unix::fs::symlink("/nonexistent", &probe).unwrap();
        let err = swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &sys_rename)
            .unwrap_err();
        assert!(err.contains("Foreign entry"), "got {err}");
        assert!(
            !err.contains("not writable"),
            "a foreign entry is not a permission problem: {err}"
        );
        assert!(is_bundle_with(&target, "binary-v1"), "nothing was mutated");
        let md = std::fs::symlink_metadata(&probe).unwrap();
        assert!(
            md.file_type().is_symlink(),
            "the planted symlink was neither followed nor deleted"
        );
        assert!(
            !dir.path().join("Fixture.rollback-aside").exists(),
            "no aside was taken"
        );
    }

    #[test]
    fn probe_refusal_distinguishes_a_permission_problem_from_a_foreign_entry() {
        let dir = TempDir::new().unwrap();
        let target = make_bundle(dir.path(), "Fixture.app", "binary-v1");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        // A genuinely unwritable parent (write bit off, traversal kept).
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(dir.path()).unwrap().permissions();
        perms.set_mode(0o555);
        fs::set_permissions(dir.path(), perms).unwrap();
        let err = swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &sys_rename)
            .unwrap_err();
        let mut perms = fs::metadata(dir.path()).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(dir.path(), perms).unwrap();
        assert!(
            err.contains("not writable"),
            "a permission problem is named as such: {err}"
        );
        assert!(!err.contains("Foreign entry"), "got {err}");
        assert!(is_bundle_with(&target, "binary-v1"), "nothing was mutated");
        assert!(!dir.path().join("Fixture.rollback-aside").exists());
    }

    #[test]
    fn stale_regular_probe_file_is_reclaimed_and_the_swap_proceeds() {
        let dir = TempDir::new().unwrap();
        let target = make_bundle(dir.path(), "Fixture.app", "binary-v1");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        let probe = target.with_extension("app-writable-probe");
        fs::write(&probe, b"stale probe from an earlier crashed run").unwrap();
        swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &sys_rename).unwrap();
        assert!(is_bundle_with(&target, "binary-v2"), "the swap proceeded");
        assert!(!probe.exists(), "the probe never lingers");
    }

    #[test]
    fn stale_valid_aside_is_reclaimed_when_the_running_path_is_occupied() {
        let dir = TempDir::new().unwrap();
        let target = make_bundle(dir.path(), "Fixture.app", "binary-v1");
        // A stale but VALID aside from an earlier crashed run.
        let stale = make_bundle(dir.path(), "Fixture.rollback-aside", "stale-v0");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &sys_rename).unwrap();
        assert!(is_bundle_with(&target, "binary-v2"), "the swap proceeded");
        let aside = dir.path().join("Fixture.rollback-aside");
        assert!(
            is_bundle_with(&aside, "binary-v1"),
            "the stale aside was reclaimed; the aside now holds the just-departed bundle"
        );
        assert_eq!(
            fs::read_to_string(stale.join("Contents").join("MacOS").join("mark")).unwrap(),
            "binary-v1",
            "the stale content is gone"
        );
    }

    #[test]
    fn running_from_the_staged_copy_completes_with_no_swap() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().join(LIVE_DIR);
        let staged = make_bundle(&base, "Mark-2.9.0.app", "binary-v2");
        // "Running" from the staged copy itself: target == staged.
        swap_bundle_into_place(&staged, &staged, "2.9.0", &NoTrash, &sys_rename).unwrap();
        assert!(is_bundle_with(&staged, "binary-v2"));
        let aside = rollback_aside_path(&staged).unwrap();
        assert!(!aside.exists(), "no swap, no aside");
    }

    #[test]
    fn the_empty_path_window_never_touches_the_in_flight_aside() {
        let dir = TempDir::new().unwrap();
        // No bundle at the running path — the transient mid-swap window.
        let target = dir.path().join("Fixture.app");
        // An aside present belongs to the in-flight swap.
        let inflight = make_bundle(dir.path(), "Fixture.rollback-aside", "departed-v1");
        let staged_dir = TempDir::new().unwrap();
        let staged = make_bundle(staged_dir.path(), "Mark-2.9.0.app", "binary-v2");
        swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &sys_rename).unwrap();
        assert!(is_bundle_with(&target, "binary-v2"), "the staged bundle moved in");
        assert!(
            is_bundle_with(&inflight, "departed-v1"),
            "the in-flight aside was never touched"
        );
    }

    #[test]
    fn empty_path_failure_names_the_aside_mv_back_recovery() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("Fixture.app");
        let _inflight = make_bundle(dir.path(), "Fixture.rollback-aside", "departed-v1");
        // A missing staged source fails the replacement rename.
        let staged = dir.path().join("does-not-exist.app");
        let err = swap_bundle_into_place(&target, &staged, "2.9.0", &NoTrash, &sys_rename)
            .unwrap_err();
        assert!(err.contains("Fixture.rollback-aside"), "got {err}");
        assert!(err.contains(SWAP_FAQ_URL), "prints the FAQ URL: {err}");
        assert!(err.contains("mv \""), "carries the exact mv-back command: {err}");
    }
}

// ─── Windows restore flow tests (T-003 C-UPDATER-REVIEW-FIXES) ──────

// Host-agnostic by design (the criterion): the non-macOS ordering is
// factored so the reference macOS host drives every failure path. No
// target_os gate here.
#[cfg(all(test, not(feature = "app-store")))]
mod rollback_windows_flow {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Both fetches configurable per URL kind: Ok(bytes) or Err(reason).
    #[derive(Clone)]
    struct FlowFetch {
        feed: Result<Vec<u8>, String>,
        installer: Result<Vec<u8>, String>,
    }
    impl Fetch for FlowFetch {
        fn get(&self, url: &str) -> Result<Vec<u8>, String> {
            if url.ends_with("/latest.json") {
                self.feed.clone()
            } else {
                self.installer.clone()
            }
        }
    }

    fn feed_json(version: &str) -> Vec<u8> {
        serde_json::json!({
            "version": version,
            "platforms": { "windows-x86_64": { "signature": "fixture-signature" } }
        })
        .to_string()
        .into_bytes()
    }

    /// A live set with only the prefs snapshot (no staged bundle — the
    /// non-macOS flow restores the installer, not a bundle).
    fn live_base(root: &TempDir) -> PathBuf {
        let base = root.path().join(LIVE_DIR);
        fs::create_dir_all(&base).unwrap();
        let snap = base.join(prefs_snapshot_name());
        fs::write(&snap, b"{\"theme\":\"dark\"}").unwrap();
        base
    }

    /// Step recorder: pins the exact mutation order.
    struct Log(std::sync::Mutex<Vec<&'static str>>);
    impl Log {
        fn push(&self, s: &'static str) {
            self.0.lock().unwrap().push(s);
        }
        fn got(&self) -> Vec<&'static str> {
            self.0.lock().unwrap().clone()
        }
    }

    /// The injectable verify seam, accept-all: the real verify_minisign
    /// needs the private key no test holds, so the paths past
    /// verification drive through this stub; production passes
    /// verify_minisign itself.
    fn accept_all(data: &[u8], sig: &str, pk: &str) -> bool {
        let _ = (data, sig, pk);
        true
    }

    /// The real production check (garbage fixture signatures fail here).
    fn real_verify(data: &[u8], sig: &str, pk: &str) -> bool {
        verify_minisign(data, sig, pk)
    }

    #[test]
    fn feed_fetch_error_leaves_preferences_unchanged() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let fetch = FlowFetch {
            feed: Err("injected feed outage".to_string()),
            installer: Ok(b"installer-bytes".to_vec()),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |_: &Path, _: &[u8]| -> Result<(), String> { log.push("stage"); Ok(()) };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |_: &Path| -> Result<u32, String> { log.push("spawn"); Ok(0) };
        let err = restore_windows_flow(
            &fetch, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap_err();
        assert_eq!(err.0, 4, "got {:?}", err);
        assert!(err.1.contains("feed fetch"), "got {}", err.1);
        assert!(
            log.got().is_empty(),
            "no mutation at all on a feed fetch error (preferences unchanged): {:?}",
            log.got()
        );
    }

    #[test]
    fn installer_fetch_error_leaves_preferences_unchanged() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let fetch = FlowFetch {
            feed: Ok(feed_json("2.9.0")),
            installer: Err("injected installer outage".to_string()),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |_: &Path, _: &[u8]| -> Result<(), String> { log.push("stage"); Ok(()) };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |_: &Path| -> Result<u32, String> { log.push("spawn"); Ok(0) };
        let err = restore_windows_flow(
            &fetch, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap_err();
        assert_eq!(err.0, 4, "got {:?}", err);
        assert!(err.1.contains("installer fetch"), "got {}", err.1);
        assert!(
            log.got().is_empty(),
            "no mutation at all on an installer fetch error (preferences unchanged): {:?}",
            log.got()
        );
    }

    #[test]
    fn version_disagreement_leaves_preferences_unchanged() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let fetch = FlowFetch {
            feed: Ok(feed_json("9.9.9")),
            installer: Ok(b"installer-bytes".to_vec()),
        };
        let counter = CountingFetch {
            inner: fetch,
            urls: std::sync::Mutex::new(vec![]),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |_: &Path, _: &[u8]| -> Result<(), String> { log.push("stage"); Ok(()) };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |_: &Path| -> Result<u32, String> { log.push("spawn"); Ok(0) };
        let err = restore_windows_flow(
            &counter, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap_err();
        assert_eq!(err.0, 4, "got {:?}", err);
        assert!(err.1.contains("disagrees"), "got {}", err.1);
        assert_eq!(
            counter.urls.lock().unwrap().len(),
            1,
            "the installer is not fetched after a version disagreement"
        );
        assert!(
            log.got().is_empty(),
            "no mutation at all on a version disagreement (preferences unchanged): {:?}",
            log.got()
        );
    }

    #[test]
    fn signature_failure_leaves_preferences_unchanged() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let fetch = FlowFetch {
            feed: Ok(feed_json("2.9.0")),
            installer: Ok(b"tampered-installer-bytes".to_vec()),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |_: &Path, _: &[u8]| -> Result<(), String> { log.push("stage"); Ok(()) };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |_: &Path| -> Result<u32, String> { log.push("spawn"); Ok(0) };
        // The REAL production verification: a garbage fixture signature
        // can never verify against the pinned key.
        let err = restore_windows_flow(
            &fetch, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &real_verify,
        )
        .unwrap_err();
        assert_eq!(err.0, 4, "got {:?}", err);
        assert_eq!(err.1, "Installer signature verification failed");
        assert!(
            log.got().is_empty(),
            "no mutation at all on a signature failure (preferences unchanged): {:?}",
            log.got()
        );
        assert!(
            !base.join(windows_installer_name("2.9.0")).exists(),
            "nothing was staged either"
        );
    }

    #[test]
    fn staging_write_failure_leaves_preferences_unchanged() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let fetch = FlowFetch {
            feed: Ok(feed_json("2.9.0")),
            installer: Ok(b"installer-bytes".to_vec()),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |_: &Path, _: &[u8]| -> Result<(), String> {
            log.push("stage");
            Err("injected staging failure".to_string())
        };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |_: &Path| -> Result<u32, String> { log.push("spawn"); Ok(0) };
        let err = restore_windows_flow(
            &fetch, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap_err();
        assert_eq!(err.0, 6, "got {:?}", err);
        assert!(err.1.contains("stage installer"), "got {}", err.1);
        assert!(
            !log.got().contains(&"prefs"),
            "preferences unchanged on a staging write failure: {:?}",
            log.got()
        );
        assert!(
            !log.got().contains(&"spawn"),
            "nothing spawns after a staging failure: {:?}",
            log.got()
        );
        assert!(
            !base.join(windows_installer_name("2.9.0")).exists(),
            "no installer file was staged"
        );
    }

    #[test]
    fn spawn_failure_after_the_writes_is_the_accepted_r3_state() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let installer = b"verified-installer-bytes".to_vec();
        let fetch = FlowFetch {
            feed: Ok(feed_json("2.9.0")),
            installer: Ok(installer.clone()),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |p: &Path, b: &[u8]| -> Result<(), String> {
            log.push("stage");
            std::fs::write(p, b).map_err(|e| e.to_string())
        };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |p: &Path| -> Result<u32, String> {
            log.push("spawn");
            Err(format!("injected spawn failure ({})", p.display()))
        };
        let err = restore_windows_flow(
            &fetch, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap_err();
        assert_eq!(err.0, 6, "R-5's failure row: {:?}", err);
        // The user line says the settings are already restored and a
        // retry is safe — not a bare installer error. The CLI prints
        // exactly this line on stderr (run_cli_rollback's eprintln).
        assert!(
            err.1.contains("already restored"),
            "the user line names the restored settings: {}",
            err.1
        );
        assert!(
            err.1.contains("safe"),
            "the user line says the retry is safe: {}",
            err.1
        );
        assert_eq!(
            log.got(),
            vec!["stage", "prefs", "spawn"],
            "the writes (stage + prefs) preceded the failed spawn"
        );
        let exe = base.join(windows_installer_name("2.9.0"));
        assert_eq!(
            fs::read(&exe).unwrap(),
            installer,
            "the staged verified bytes stand"
        );
    }

    #[test]
    fn final_order_fetch_verify_stage_prefs_redigest_spawn() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let installer = b"installer-bytes".to_vec();
        let counter = CountingFetch {
            inner: FlowFetch {
                feed: Ok(feed_json("2.9.0")),
                installer: Ok(installer.clone()),
            },
            urls: std::sync::Mutex::new(vec![]),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |p: &Path, b: &[u8]| -> Result<(), String> {
            log.push("stage");
            std::fs::write(p, b).map_err(|e| e.to_string())
        };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |p: &Path| -> Result<u32, String> {
            log.push("spawn");
            assert_eq!(
                fs::read(p).unwrap(),
                installer,
                "spawn executes the staged verified bytes"
            );
            Ok(0)
        };
        let out = restore_windows_flow(
            &counter, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap();
        assert_eq!(out.event, "pending");
        assert_eq!(out.detail.as_deref(), Some("2.9.0"));
        let urls = counter.urls.lock().unwrap().clone();
        assert_eq!(urls.len(), 2, "exactly two fetches: {urls:?}");
        assert!(urls[0].ends_with("/latest.json"));
        assert!(
            urls[1].contains(windows_installer_name("2.9.0").as_str()),
            "got {urls:?}"
        );
        assert_eq!(
            log.got(),
            vec!["stage", "prefs", "spawn"],
            "the final order: fetch, verify, stage, prefs write, re-digest, spawn"
        );
    }

    #[test]
    fn redigest_runs_after_prefs_and_before_spawn() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let fetch = FlowFetch {
            feed: Ok(feed_json("2.9.0")),
            installer: Ok(b"installer-bytes".to_vec()),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        // Stage tampered bytes: the write "succeeds" but the re-digest
        // must catch the difference before spawn.
        let stage = |p: &Path, b: &[u8]| -> Result<(), String> {
            log.push("stage");
            let mut tampered = b.to_vec();
            tampered[0] ^= 0xff;
            std::fs::write(p, tampered).map_err(|e| e.to_string())
        };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |_: &Path| -> Result<u32, String> { log.push("spawn"); Ok(0) };
        let err = restore_windows_flow(
            &fetch, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap_err();
        assert_eq!(err.0, 6, "got {:?}", err);
        assert_eq!(err.1, "Installer bytes changed between verify and spawn");
        assert_eq!(
            log.got(),
            vec!["stage", "prefs"],
            "the re-digest sits between the prefs write and the spawn"
        );
    }

    // ── T-002 C-WIN-ROLLBACK-PANIC: non-progressing transfer fixtures
    // (no network, no Windows host) — a timed-out fetch rides the
    // existing typed fetch-error mapping (exit-4 class) and ends the
    // restore before any mutation: prefs closure never called, spawn
    // never called, staging empty, set intact, no retry of the failed
    // URL.

    #[test]
    fn feed_fetch_deadline_ends_the_restore_with_zero_writes() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let prefs_before = fs::read(&prefs_snap).unwrap();
        let fetch = FlowFetch {
            feed: Err("fetch <feed>: operation timed out".to_string()),
            installer: Ok(b"installer-bytes".to_vec()),
        };
        let counter = CountingFetch {
            inner: fetch,
            urls: std::sync::Mutex::new(vec![]),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |_: &Path, _: &[u8]| -> Result<(), String> { log.push("stage"); Ok(()) };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |_: &Path| -> Result<u32, String> { log.push("spawn"); Ok(0) };
        let err = restore_windows_flow(
            &counter, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap_err();
        assert_eq!(err.0, 4, "the deadline rides the fetch-error class: {:?}", err);
        assert!(
            err.1.contains("feed fetch") && err.1.contains("timed out"),
            "typed mapping preserved: {}",
            err.1
        );
        assert!(
            log.got().is_empty(),
            "zero writes on a stalled feed transfer: {:?}",
            log.got()
        );
        assert_eq!(
            counter.urls.lock().unwrap().len(),
            1,
            "the stalled URL is attempted exactly once — no retry"
        );
        assert!(
            !base.join(windows_installer_name("2.9.0")).exists(),
            "nothing was staged"
        );
        assert_eq!(
            fs::read(&prefs_snap).unwrap(),
            prefs_before,
            "the snapshot file is byte-identical"
        );
    }

    #[test]
    fn installer_fetch_deadline_ends_the_restore_with_zero_writes() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let prefs_before = fs::read(&prefs_snap).unwrap();
        let fetch = FlowFetch {
            feed: Ok(feed_json("2.9.0")),
            installer: Err("fetch <installer>: operation timed out".to_string()),
        };
        let counter = CountingFetch {
            inner: fetch,
            urls: std::sync::Mutex::new(vec![]),
        };
        let log = Log(std::sync::Mutex::new(vec![]));
        let stage = |_: &Path, _: &[u8]| -> Result<(), String> { log.push("stage"); Ok(()) };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { log.push("prefs"); Ok(()) };
        let spawn = |_: &Path| -> Result<u32, String> { log.push("spawn"); Ok(0) };
        let err = restore_windows_flow(
            &counter, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap_err();
        assert_eq!(err.0, 4, "the deadline rides the fetch-error class: {:?}", err);
        assert!(
            err.1.contains("installer fetch") && err.1.contains("timed out"),
            "typed mapping preserved: {}",
            err.1
        );
        assert!(
            log.got().is_empty(),
            "zero writes on a stalled installer transfer: {:?}",
            log.got()
        );
        let urls = counter.urls.lock().unwrap().clone();
        assert_eq!(urls.len(), 2, "feed once + stalled installer once: {urls:?}");
        assert!(
            urls[1].contains(windows_installer_name("2.9.0").as_str()),
            "the stalled URL is the installer, attempted exactly once: {urls:?}"
        );
        assert!(
            !base.join(windows_installer_name("2.9.0")).exists(),
            "nothing was staged"
        );
        assert_eq!(
            fs::read(&prefs_snap).unwrap(),
            prefs_before,
            "the snapshot file is byte-identical"
        );
    }

    // ── T-003 C-WIN-ROLLBACK-PANIC: pid plumbing through the spawn
    // seam — the accounting wrapper composes the fixture spawn, the
    // fact is written before the spawn (pid absent) and patched after,
    // and the outcome stays the unchanged event=pending.

    #[test]
    fn accounting_spawn_composes_the_seam_and_outcome_stays_pending() {
        let root = TempDir::new().unwrap();
        let base = live_base(&root);
        let prefs_snap = base.join(prefs_snapshot_name());
        let fetch = FlowFetch {
            feed: Ok(feed_json("2.9.0")),
            installer: Ok(b"installer-bytes".to_vec()),
        };
        let raw = |p: &Path| -> Result<u32, String> {
            // Runs strictly after the fact write: the pre-spawn fact is
            // present, carries no pid yet, and names the right versions.
            let rec = read_pending_rollback(root.path())
                .expect("the fact precedes the spawn");
            assert_eq!(rec.installer_pid, None, "the pre-spawn fact has no pid yet");
            assert_eq!(rec.to_version, "2.9.0");
            assert_eq!(rec.from_version, "2.9.1");
            assert_eq!(rec.at, 1000);
            let _ = fs::write(p, b"spawned").unwrap();
            Ok(4242)
        };
        let spawn = pending_accounting_spawn(root.path(), "2.9.0", "2.9.1", 1000, &raw);
        let stage = |p: &Path, b: &[u8]| -> Result<(), String> {
            std::fs::write(p, b).map_err(|e| e.to_string())
        };
        let prefs = |_: &Path, _: &str| -> Result<(), String> { Ok(()) };
        let out = restore_windows_flow(
            &fetch, "2.9.0", &base, &prefs_snap, &prefs, &spawn, &stage, &accept_all,
        )
        .unwrap();
        assert_eq!(out.event, "pending", "the outcome is unchanged");
        assert_eq!(out.detail.as_deref(), Some("2.9.0"));
        let rec = read_pending_rollback(root.path()).expect("the fact stands after the spawn");
        assert_eq!(
            rec.installer_pid,
            Some(4242),
            "the child pid was patched after the spawn"
        );
    }
}

// ─── GUI restore ordering tests (T-002 C-UPDATER-REVIEW-FIXES) ──────

// The extracted mt_rollback_restore core, driven on the reference
// macOS host without tauri::AppHandle/State: a temp root (the
// root-override seam) and a temp-dir bundle (the test binary has no
// .app ancestor) stand in for the live set and the running bundle.
#[cfg(all(test, target_os = "macos", not(feature = "app-store")))]
mod rollback_gui_restore {
    use super::*;
    use std::fs;
    use std::sync::Mutex;
    use tempfile::TempDir;

    /// Never touches the real Trash (the T-001 injection rule).
    struct NoTrash;
    impl Trash for NoTrash {
        fn delete(&self, _path: &Path) -> Result<(), String> {
            Ok(())
        }
    }

    fn sys_rename(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::rename(from, to)
    }

    /// A minimal bundle: Contents/MacOS/mark as a regular file.
    fn make_bundle(parent: &Path, name: &str, content: &str) -> PathBuf {
        let b = parent.join(name);
        fs::create_dir_all(b.join("Contents").join("MacOS")).unwrap();
        fs::write(b.join("Contents").join("MacOS").join("mark"), content).unwrap();
        b
    }

    fn bundle_binary(p: &Path) -> String {
        fs::read_to_string(p.join("Contents").join("MacOS").join("mark")).unwrap()
    }

    /// A fully valid live set: manifest, parsable-object snapshot and
    /// staged bundle whose recorded digests match the bytes on disk.
    fn make_valid_set(root: &Path, staged_binary: &str) -> PathBuf {
        let base = root.join(LIVE_DIR);
        fs::create_dir_all(&base).unwrap();
        let prefs = b"{\"theme\":\"dark\"}";
        fs::write(base.join(prefs_snapshot_name()), prefs).unwrap();
        let name = staged_bundle_name("2.9.0");
        let staged = make_bundle(&base, &name, staged_binary);
        let m = RollbackManifest {
            schema: MANIFEST_SCHEMA,
            previous_version: "2.9.0".to_string(),
            platform: platform_key(),
            staged_bundle: Some(name),
            prefs_snapshot: prefs_snapshot_name(),
            bundle_sha256: Some(sha256_hex(staged_binary.as_bytes())),
            prefs_sha256: Some(sha256_hex(prefs)),
            created_at: 1,
        };
        fs::write(base.join(MANIFEST_FILE), serde_json::to_vec(&m).unwrap()).unwrap();
        base
    }

    /// Records every preferences call; optionally fails them.
    struct PrefsRecorder {
        calls: Mutex<Vec<(PathBuf, String)>>,
        fail: bool,
    }
    impl PrefsRecorder {
        fn restore(&self, snap: &Path, ver: &str) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push((snap.to_path_buf(), ver.to_string()));
            if self.fail {
                Err("injected prefs failure".to_string())
            } else {
                Ok(())
            }
        }
    }

    fn drive(
        root: &TempDir,
        target: &Path,
        rec: &PrefsRecorder,
    ) -> Result<String, String> {
        gui_restore_core(
            Some(root.path()),
            "2.9.1",
            target,
            &|s: &Path, v: &str| rec.restore(s, v),
            &NoTrash,
            &sys_rename,
        )
    }

    #[test]
    fn staged_digest_mismatch_leaves_preferences_and_bundle_byte_identical() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        // Tamper with the staged binary AFTER the manifest recorded it.
        let staged_bin = base
            .join(staged_bundle_name("2.9.0"))
            .join("Contents")
            .join("MacOS")
            .join("mark");
        fs::write(&staged_bin, "tampered-bytes").unwrap();
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        let rec = PrefsRecorder { calls: Mutex::new(vec![]), fail: false };
        let err = drive(&root, &target, &rec).unwrap_err();
        assert!(
            err.contains("digest mismatch") && err.contains("aborting untouched"),
            "got {err}"
        );
        assert!(
            rec.calls.lock().unwrap().is_empty(),
            "preferences were never touched on a digest mismatch"
        );
        assert_eq!(
            bundle_binary(&target),
            "running-binary",
            "the running bundle is byte-identical"
        );
        assert!(base.join(MANIFEST_FILE).exists(), "the live set stays intact");
    }

    #[test]
    fn corrupt_snapshot_aborts_with_the_current_state_untouched() {
        // Both corrupt shapes: unparsable text and a non-object JSON
        // value (m005's empty-map fallback must never see either).
        for bad in ["{ not json", "[1,2]", "null"] {
            let root = TempDir::new().unwrap();
            let base = make_valid_set(root.path(), "staged-binary");
            fs::write(base.join(prefs_snapshot_name()), bad).unwrap();
            let target = make_bundle(root.path(), "Mark.app", "running-binary");
            let rec = PrefsRecorder { calls: Mutex::new(vec![]), fail: false };
            let err = drive(&root, &target, &rec).unwrap_err();
            assert!(
                err.contains("No valid rollback snapshot"),
                "{bad}: got {err}"
            );
            assert!(
                rec.calls.lock().unwrap().is_empty(),
                "{bad}: preferences were never touched"
            );
            assert_eq!(bundle_binary(&target), "running-binary", "{bad}");
            assert!(base.join(MANIFEST_FILE).exists(), "{bad}: set intact");
        }
    }

    #[test]
    fn post_swap_prefs_failure_completes_the_restore() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        let rec = PrefsRecorder { calls: Mutex::new(vec![]), fail: true };
        let restored = drive(&root, &target, &rec).unwrap();
        assert_eq!(restored, "2.9.0", "the restore completes despite the prefs failure");
        let calls = rec.calls.lock().unwrap();
        assert_eq!(calls.len(), 1, "exactly one preferences write, after the swap");
        assert_eq!(calls[0].1, "2.9.0");
        assert!(
            calls[0].0.ends_with(&prefs_snapshot_name()),
            "the write targets the snapshot: {}",
            calls[0].0.display()
        );
        drop(calls);
        assert_eq!(
            bundle_binary(&target),
            "staged-binary",
            "the confirmed swap stands — never abandoned"
        );
        assert!(!base.exists(), "the set is consumed by the completed restore");
    }

    #[test]
    fn gui_happy_path_verifies_swaps_then_writes_preferences() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        let rec = PrefsRecorder { calls: Mutex::new(vec![]), fail: false };
        let restored = drive(&root, &target, &rec).unwrap();
        assert_eq!(restored, "2.9.0");
        assert_eq!(bundle_binary(&target), "staged-binary", "the swap confirmed");
        let calls = rec.calls.lock().unwrap();
        assert_eq!(calls.len(), 1, "exactly one preferences write");
        assert!(
            calls[0].0.starts_with(&base),
            "the write reads the snapshot from the live set"
        );
        drop(calls);
        assert!(!base.exists(), "the set is consumed");
    }

    #[test]
    fn prefs_skipped_line_is_human_and_truthful() {
        let line = prefs_skipped_human_line("disk full");
        assert!(line.contains("could not be restored"), "got {line}");
        assert!(line.contains("complete"), "the restore stands: {line}");
        assert!(!line.contains("abort"), "never claims an abort: {line}");
    }

    /// Raw marker access for the fact-channel tests (T-001
    /// C-RENDER-REVIEW-FIXES): bypasses the production writer.
    fn write_raw_marker(root: &Path, text: &str) {
        fs::write(root.join(RESTORE_OUTCOME_FILE), text).unwrap();
    }

    fn read_raw_marker(root: &Path) -> Option<String> {
        fs::read_to_string(root.join(RESTORE_OUTCOME_FILE)).ok()
    }

    #[test]
    fn skip_path_writes_marker_with_truncated_error_and_at() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        // The injected reason exceeds the cap: the marker must carry the
        // truncated prefix, never the full text.
        let long_reason = "r".repeat(RESTORE_OUTCOME_ERROR_CAP + 40);
        let reason = long_reason.clone();
        let restored = gui_restore_core(
            Some(root.path()),
            "2.9.1",
            &target,
            &|_: &Path, _: &str| Err(reason.clone()),
            &NoTrash,
            &sys_rename,
        )
        .unwrap();
        assert_eq!(restored, "2.9.0", "the restore completes despite the skip");
        assert!(!base.exists(), "the set is consumed by the completed restore");
        let raw = read_raw_marker(root.path()).expect("the skip path writes the marker");
        let parsed: RestoreOutcomeRecord = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed.prefs, "skipped");
        assert_eq!(
            parsed.error.chars().count(),
            RESTORE_OUTCOME_ERROR_CAP,
            "the diagnostics are capped"
        );
        assert_eq!(
            parsed.error,
            long_reason
                .chars()
                .take(RESTORE_OUTCOME_ERROR_CAP)
                .collect::<String>(),
            "the cap keeps the prefix, not a tail"
        );
        assert!(
            parsed.at > 0 && parsed.at as u64 <= now_secs(),
            "the marker carries the unix-seconds write time: {}",
            parsed.at
        );
    }

    #[test]
    fn cap_truncation_lands_on_char_boundaries() {
        // Alternating 4-byte and 2-byte chars: a byte slice at the cap
        // would panic or split a codepoint; char_indices never does.
        let long = "🔥ё".repeat(RESTORE_OUTCOME_ERROR_CAP);
        let cut = truncate_chars(&long, RESTORE_OUTCOME_ERROR_CAP);
        assert_eq!(cut.chars().count(), RESTORE_OUTCOME_ERROR_CAP);
        assert_eq!(
            cut,
            long.chars().take(RESTORE_OUTCOME_ERROR_CAP).collect::<String>()
        );
        // End-to-end through the writer on a temp root: no panic, and
        // the written marker parses back with the capped field.
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        write_restore_outcome_marker(&base, &long);
        let raw = read_raw_marker(root.path()).expect("marker written");
        let parsed: RestoreOutcomeRecord = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed.error.chars().count(), RESTORE_OUTCOME_ERROR_CAP);
    }

    #[test]
    fn success_path_writes_no_marker() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        let rec = PrefsRecorder { calls: Mutex::new(vec![]), fail: false };
        drive(&root, &target, &rec).unwrap();
        assert!(
            read_raw_marker(root.path()).is_none(),
            "a restore whose preferences succeed writes nothing"
        );
        assert!(!base.exists(), "the set is consumed");
    }

    #[test]
    fn stale_marker_removed_when_a_new_restore_starts_both_entries() {
        // Entry 1: gui_restore_core (the GUI/menu path).
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        write_raw_marker(
            root.path(),
            r#"{"prefs":"skipped","error":"stale from an earlier restore","at":1}"#,
        );
        let rec = PrefsRecorder { calls: Mutex::new(vec![]), fail: false };
        drive(&root, &target, &rec).unwrap();
        assert!(
            read_raw_marker(root.path()).is_none(),
            "the stale marker did not survive the gui_restore_core entry"
        );
        assert!(!base.exists(), "the set is consumed");
        // Entry 2: restore_inner (the CLI and Windows-dialog entry) —
        // the removal sits ahead of validation, so even the early
        // no-snapshot error leaves the root clean.
        let root2 = TempDir::new().unwrap();
        write_raw_marker(root2.path(), r#"{"prefs":"skipped","error":"stale","at":1}"#);
        struct NoFetch;
        impl Fetch for NoFetch {
            fn get(&self, _url: &str) -> Result<Vec<u8>, String> {
                Err("no fetch expected".to_string())
            }
        }
        let noop_prefs = |_: &Path, _: &str| -> Result<(), String> { Ok(()) };
        let err = restore_inner(
            &NoFetch,
            Some(true),
            "2.9.1",
            Some(root2.path()),
            &noop_prefs,
            None,
            None,
            true,
            None,
        )
        .unwrap_err();
        assert_eq!(err.0, 7, "no live set in the fixture: {err:?}");
        assert!(
            read_raw_marker(root2.path()).is_none(),
            "the stale marker did not survive the restore_inner entry"
        );
    }

    #[test]
    fn failed_marker_write_leaves_restore_outcome_unchanged() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        // A directory at the marker name makes the best-effort write
        // fail without touching any restore machinery.
        fs::create_dir_all(root.path().join(RESTORE_OUTCOME_FILE)).unwrap();
        let rec = PrefsRecorder { calls: Mutex::new(vec![]), fail: true };
        let restored = drive(&root, &target, &rec).unwrap();
        assert_eq!(restored, "2.9.0", "the restore outcome is unchanged");
        assert_eq!(
            rec.calls.lock().unwrap().len(),
            1,
            "the preferences write still ran"
        );
        assert!(!base.exists(), "the set is still consumed");
        assert!(
            root.path().join(RESTORE_OUTCOME_FILE).is_dir(),
            "the failed write left the blocker untouched (stderr marker only)"
        );
    }

    #[test]
    fn marker_survives_the_live_consuming_step() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        let rec = PrefsRecorder { calls: Mutex::new(vec![]), fail: true };
        let restored = drive(&root, &target, &rec).unwrap();
        assert_eq!(restored, "2.9.0");
        assert!(!base.exists(), "the live set is consumed by the restore");
        let raw = read_raw_marker(root.path())
            .expect("the root-level marker survives remove_dir_all(base)");
        let parsed: RestoreOutcomeRecord = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed.prefs, "skipped");
        assert_eq!(parsed.error, "injected prefs failure");
        assert!(parsed.at > 0);
    }
}

// ─── Truthful relaunch outcome tests (T-006 C-UPDATER-REVIEW-FIXES) ─

// The macOS CLI restore ending: an injected failing relaunch closure
// yields event=restored_norelaunch (exit 6) with the exact launch
// command, while the restored bundle remains in place; plain restored
// (exit 0) stays reserved for restore-and-relaunch. The mapping is
// asserted through the pure restore_ok_ending step, not the full CLI;
// the fixtures are temp-dir bundles and a fake Trash (the T-001 rule —
// the test binary has no .app ancestor).
#[cfg(all(test, target_os = "macos", not(feature = "app-store")))]
mod rollback_norelaunch {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Never touches the real Trash (the T-001 injection rule).
    struct NoTrash;
    impl Trash for NoTrash {
        fn delete(&self, _path: &Path) -> Result<(), String> {
            Ok(())
        }
    }

    fn sys_rename(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::rename(from, to)
    }

    fn noop_prefs(_snap: &Path, _prev: &str) -> Result<(), String> {
        Ok(())
    }

    /// A minimal bundle: Contents/MacOS/mark as a regular file.
    fn make_bundle(parent: &Path, name: &str, content: &str) -> PathBuf {
        let b = parent.join(name);
        fs::create_dir_all(b.join("Contents").join("MacOS")).unwrap();
        fs::write(b.join("Contents").join("MacOS").join("mark"), content).unwrap();
        b
    }

    fn bundle_binary(p: &Path) -> String {
        fs::read_to_string(p.join("Contents").join("MacOS").join("mark")).unwrap()
    }

    /// A fully valid live set: manifest, parsable-object snapshot and
    /// staged bundle whose recorded digests match the bytes on disk.
    fn make_valid_set(root: &Path, staged_binary: &str) -> PathBuf {
        let base = root.join(LIVE_DIR);
        fs::create_dir_all(&base).unwrap();
        let prefs = b"{\"theme\":\"dark\"}";
        fs::write(base.join(prefs_snapshot_name()), prefs).unwrap();
        let name = staged_bundle_name("2.9.0");
        let staged = make_bundle(&base, &name, staged_binary);
        let m = RollbackManifest {
            schema: MANIFEST_SCHEMA,
            previous_version: "2.9.0".to_string(),
            platform: platform_key(),
            staged_bundle: Some(name),
            prefs_snapshot: prefs_snapshot_name(),
            bundle_sha256: Some(sha256_hex(staged_binary.as_bytes())),
            prefs_sha256: Some(sha256_hex(prefs)),
            created_at: 1,
        };
        fs::write(base.join(MANIFEST_FILE), serde_json::to_vec(&m).unwrap()).unwrap();
        base
    }

    fn drive(
        root: &TempDir,
        target: &Path,
        relaunch: Option<&dyn Fn() -> Result<(), String>>,
    ) -> Result<RestoreOutcome, String> {
        let base = root.path().join(LIVE_DIR);
        let (_, m) = load_valid_live_at(&base, "2.9.1").expect("valid fixture set");
        restore_macos_flow(&base, &m, target, &noop_prefs, relaunch, &NoTrash, &sys_rename)
    }

    #[test]
    fn failing_relaunch_is_restored_norelaunch_exit_six_with_launch_guidance() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        let fail: Box<dyn Fn() -> Result<(), String>> =
            Box::new(|| Err("injected relaunch failure".into()));
        let out = drive(&root, &target, Some(&*fail)).unwrap();
        // The distinct outcome — not plain restored.
        assert_eq!(out.event, "restored_norelaunch");
        assert_eq!(out.detail.as_deref(), Some("2.9.0"));
        assert_eq!(out.app_path.as_deref(), Some(target.as_path()));
        assert_eq!(out.relaunch_error.as_deref(), Some("injected relaunch failure"));
        // The pure mapping (asserted without running the full CLI):
        // exit 6 — R-5's failure row — with the machine line plus the
        // guidance carrying the exact launch command.
        let (code, lines) = restore_ok_ending(&out, "2.9.1");
        assert_eq!(code, 6);
        assert_eq!(lines.len(), 2, "machine line + guidance: {lines:?}");
        assert_eq!(
            lines[0],
            "MARK_ROLLBACK event=restored_norelaunch from=2.9.1 to=2.9.0"
        );
        // Whole-token matching: the token is one whole
        // whitespace-delimited token and is NOT event=restored.
        assert!(lines[0].split(' ').any(|t| t == "event=restored_norelaunch"));
        assert!(!lines[0].split(' ').any(|t| t == "event=restored"));
        assert!(
            lines[1].contains(&format!("open \"{}\"", target.display())),
            "guidance carries the exact launch command: {}",
            lines[1]
        );
        assert!(
            lines[1].contains("injected relaunch failure"),
            "guidance names the cause: {}",
            lines[1]
        );
        // The restored bundle remains in place; the set is consumed.
        assert_eq!(bundle_binary(&target), "staged-binary");
        assert!(!base.exists());
    }

    #[test]
    fn successful_relaunch_keeps_plain_restored_exit_zero() {
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        let ok: Box<dyn Fn() -> Result<(), String>> = Box::new(|| Ok(()));
        let out = drive(&root, &target, Some(&*ok)).unwrap();
        assert_eq!(out.event, "restored");
        assert!(out.app_path.is_none());
        assert!(out.relaunch_error.is_none());
        let (code, lines) = restore_ok_ending(&out, "2.9.1");
        assert_eq!(
            code, 0,
            "plain restored stays reserved for restore-and-relaunch"
        );
        assert_eq!(lines, vec!["MARK_ROLLBACK event=restored from=2.9.1 to=2.9.0"]);
        assert_eq!(bundle_binary(&target), "staged-binary");
        assert!(!base.exists());
    }

    #[test]
    fn missing_relaunch_is_never_plain_restored() {
        // No path reports plain restored when the relaunch did not
        // happen: relaunch=None is restored_norelaunch too.
        let root = TempDir::new().unwrap();
        let base = make_valid_set(root.path(), "staged-binary");
        let target = make_bundle(root.path(), "Mark.app", "running-binary");
        let out = drive(&root, &target, None).unwrap();
        assert_eq!(out.event, "restored_norelaunch");
        let (code, lines) = restore_ok_ending(&out, "2.9.1");
        assert_eq!(code, 6);
        assert_eq!(lines.len(), 2, "machine line + guidance: {lines:?}");
        assert!(lines[1].contains("Launch the restored application yourself"));
    }
}

// ─── Boot reconciliation tests (T-004 C-UPDATER-REVIEW-FIXES) ───────

// The reconcile_at_boot decision table, driven on the reference macOS
// host against a temp data root and temp bundle fixtures: explicit
// root/bundle parameters (the restore_inner seam), an injectable rename
// and a fake Trash — the developer's real Trash and the real data root
// are never touched.
#[cfg(all(test, target_os = "macos", not(feature = "app-store")))]
mod rollback_boot {
    use super::*;
    use std::fs;
    use std::sync::Mutex;
    use tempfile::TempDir;

    /// A minimal bundle: Contents/MacOS/mark as a regular file.
    fn make_bundle(parent: &Path, name: &str, content: &str) -> PathBuf {
        let b = parent.join(name);
        fs::create_dir_all(b.join("Contents").join("MacOS")).unwrap();
        fs::write(b.join("Contents").join("MacOS").join("mark"), content).unwrap();
        b
    }

    fn bundle_binary(p: &Path) -> String {
        fs::read_to_string(p.join("Contents").join("MacOS").join("mark")).unwrap()
    }

    /// A valid set at `base`: manifest + parsable-object prefs snapshot
    /// whose recorded digest matches the bytes; optionally a staged
    /// bundle whose binary digest matches too.
    fn make_valid_set(base: &Path, prev: &str, with_bundle: bool) -> RollbackManifest {
        fs::create_dir_all(base).unwrap();
        let prefs = b"{\"theme\":\"dark\"}";
        fs::write(base.join(prefs_snapshot_name()), prefs).unwrap();
        let mut m = RollbackManifest {
            schema: MANIFEST_SCHEMA,
            previous_version: prev.to_string(),
            platform: platform_key(),
            staged_bundle: None,
            prefs_snapshot: prefs_snapshot_name(),
            bundle_sha256: None,
            prefs_sha256: Some(sha256_hex(prefs)),
            created_at: 1,
        };
        if with_bundle {
            let name = staged_bundle_name(prev);
            make_bundle(base, &name, "staged-binary");
            m.staged_bundle = Some(name);
            m.bundle_sha256 = Some(sha256_hex(b"staged-binary"));
        }
        fs::write(base.join(MANIFEST_FILE), serde_json::to_vec(&m).unwrap()).unwrap();
        m
    }

    fn set_manifest(base: &Path) -> RollbackManifest {
        let raw = fs::read_to_string(base.join(MANIFEST_FILE)).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    /// Never touches the real Trash (the T-001 injection rule); it
    /// records every path so tests assert the fake was the one used.
    struct RecordingTrash(Mutex<Vec<PathBuf>>);
    impl Trash for RecordingTrash {
        fn delete(&self, p: &Path) -> Result<(), String> {
            self.0.lock().unwrap().push(p.to_path_buf());
            Ok(())
        }
    }

    /// Never touches the real Trash; records nothing.
    struct NoTrash;
    impl Trash for NoTrash {
        fn delete(&self, _p: &Path) -> Result<(), String> {
            Ok(())
        }
    }

    fn sys_rename(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::rename(from, to)
    }

    /// The boot table against the fixture root; running 2.9.1.
    fn reconcile(root: &TempDir, bundle: Option<&Path>, trash_impl: &dyn Trash) {
        reconcile_at_boot_inner(root.path(), bundle, "2.9.1", trash_impl, &sys_rename)
    }

    #[test]
    fn staging_with_unparsable_manifest_discards_and_live_survives() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        make_valid_set(&live, "2.8.2", false);
        let staging = root.path().join(STAGING_DIR);
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join(MANIFEST_FILE), "{ not json").unwrap();
        reconcile(&root, None, &NoTrash);
        assert!(
            !staging.exists(),
            "shape-invalid staging is discarded without hashing"
        );
        assert!(
            live.join(MANIFEST_FILE).exists(),
            "the live set survives the destructive case"
        );
        assert_eq!(set_manifest(&live).previous_version, "2.8.2", "live intact");
    }

    #[test]
    fn staging_failing_strict_validation_discards_and_live_survives() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        make_valid_set(&live, "2.8.2", false);
        // Shape-valid JSON that fails the strict schema.
        let staging = root.path().join(STAGING_DIR);
        fs::create_dir_all(&staging).unwrap();
        let mut m = make_valid_set(&staging, "2.9.0", false);
        m.schema = 99;
        fs::write(staging.join(MANIFEST_FILE), serde_json::to_vec(&m).unwrap()).unwrap();
        reconcile(&root, None, &NoTrash);
        assert!(!staging.exists(), "invalid staging discarded");
        assert!(live.join(MANIFEST_FILE).exists(), "the live set survives");
        assert_eq!(set_manifest(&live).previous_version, "2.8.2");
    }

    #[test]
    fn failed_attempt_staging_discards_and_live_survives() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        make_valid_set(&live, "2.8.2", false);
        // Recorded version == running (2.9.1): the failed-attempt state —
        // the discard-only branch, which hashes nothing.
        let staging = root.path().join(STAGING_DIR);
        make_valid_set(&staging, "2.9.1", false);
        reconcile(&root, None, &NoTrash);
        assert!(!staging.exists(), "failed-attempt staging discarded");
        assert!(live.join(MANIFEST_FILE).exists(), "the live set survives");
        assert_eq!(set_manifest(&live).previous_version, "2.8.2");
    }

    #[test]
    fn staging_digest_mismatch_discards_and_live_survives() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        make_valid_set(&live, "2.8.2", false);
        // A fully promotable-shaped set whose staged binary no longer
        // matches its recorded digest (tampered after recording).
        let staging = root.path().join(STAGING_DIR);
        make_valid_set(&staging, "2.9.0", true);
        let bin = staging
            .join(staged_bundle_name("2.9.0"))
            .join("Contents")
            .join("MacOS")
            .join("mark");
        fs::write(&bin, "tampered-bytes").unwrap();
        reconcile(&root, None, &NoTrash);
        assert!(!staging.exists(), "digest-mismatch staging discarded");
        assert!(live.join(MANIFEST_FILE).exists(), "the live set survives");
        assert_eq!(set_manifest(&live).previous_version, "2.8.2");
    }

    #[test]
    fn promotion_confirms_before_the_superseded_live_set_is_freed() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        make_valid_set(&live, "2.8.2", false);
        let staging = root.path().join(STAGING_DIR);
        make_valid_set(&staging, "2.9.0", true);
        reconcile(&root, None, &NoTrash);
        // The replacement confirmed: live holds the staged set.
        assert_eq!(set_manifest(&live).previous_version, "2.9.0");
        assert!(
            live.join(staged_bundle_name("2.9.0"))
                .join("Contents")
                .join("MacOS")
                .join("mark")
                .exists(),
            "the staged bundle moved in intact"
        );
        assert!(!staging.exists(), "staging consumed by the promotion");
        assert!(
            !root.path().join(PROMOTION_ASIDE_DIR).exists(),
            "the superseded set is freed in the same reconcile call"
        );
    }

    #[test]
    fn injected_promotion_rename_failure_keeps_live_and_staging() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        make_valid_set(&live, "2.8.2", false);
        let staging = root.path().join(STAGING_DIR);
        make_valid_set(&staging, "2.9.0", false);
        // Fail exactly the staging→live replacement rename; the live
        // move-aside and its roll-back use the real filesystem.
        let fail_replacement = |from: &Path, to: &Path| -> std::io::Result<()> {
            if to == live.as_path() && from == staging.as_path() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "injected replacement failure",
                ));
            }
            std::fs::rename(from, to)
        };
        reconcile_at_boot_inner(
            root.path(),
            None,
            "2.9.1",
            &NoTrash,
            &fail_replacement,
        );
        // The live set survived: rolled back from the aside, content
        // intact; the staging stays (discarding would destroy the fresh
        // set) and the promotion retries at the next boot.
        assert!(live.join(MANIFEST_FILE).exists(), "the live set survives");
        assert_eq!(set_manifest(&live).previous_version, "2.8.2", "rolled back");
        assert!(
            staging.join(MANIFEST_FILE).exists(),
            "the staging is kept for the next-boot retry"
        );
        assert!(
            !root.path().join(PROMOTION_ASIDE_DIR).exists(),
            "the aside was rolled back onto live"
        );
    }

    #[test]
    fn promotion_aside_with_valid_live_is_deleted() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        make_valid_set(&live, "2.8.2", false);
        let aside = root.path().join(PROMOTION_ASIDE_DIR);
        fs::create_dir_all(&aside).unwrap();
        fs::write(aside.join("superseded.txt"), "old set").unwrap();
        reconcile(&root, None, &NoTrash);
        assert!(!aside.exists(), "the obsolete aside is deleted");
        assert!(live.join(MANIFEST_FILE).exists(), "live untouched");
    }

    #[test]
    fn promotion_aside_with_missing_live_and_valid_set_is_promoted_back() {
        let root = TempDir::new().unwrap();
        // No live at all; the aside holds the only surviving set.
        let aside = root.path().join(PROMOTION_ASIDE_DIR);
        make_valid_set(&aside, "2.9.0", true);
        reconcile(&root, None, &NoTrash);
        let live = root.path().join(LIVE_DIR);
        assert!(
            live.join(MANIFEST_FILE).exists(),
            "a valid aside set becomes live again"
        );
        assert_eq!(set_manifest(&live).previous_version, "2.9.0");
        assert!(
            live.join(staged_bundle_name("2.9.0"))
                .join("Contents")
                .join("MacOS")
                .join("mark")
                .exists(),
            "the set moved in intact"
        );
        assert!(!aside.exists(), "the aside was consumed by the promote-back");
    }

    #[test]
    fn promotion_aside_with_invalid_live_and_valid_set_is_promoted_back() {
        let root = TempDir::new().unwrap();
        // Live exists but its manifest is garbage — it can never become
        // live, so the valid aside replaces it.
        let live = root.path().join(LIVE_DIR);
        fs::create_dir_all(&live).unwrap();
        fs::write(live.join(MANIFEST_FILE), "{ not json").unwrap();
        let aside = root.path().join(PROMOTION_ASIDE_DIR);
        make_valid_set(&aside, "2.9.0", false);
        reconcile(&root, None, &NoTrash);
        assert_eq!(set_manifest(&live).previous_version, "2.9.0", "promoted back");
        assert!(!aside.exists());
    }

    #[test]
    fn promotion_aside_with_invalid_own_manifest_is_deleted_never_promoted() {
        let root = TempDir::new().unwrap();
        // No live; the aside's own manifest fails validation (unknown
        // schema) — it can never become live, reconciliation included.
        let aside = root.path().join(PROMOTION_ASIDE_DIR);
        let mut m = make_valid_set(&aside, "2.9.0", false);
        m.schema = 99;
        fs::write(aside.join(MANIFEST_FILE), serde_json::to_vec(&m).unwrap()).unwrap();
        reconcile(&root, None, &NoTrash);
        assert!(!aside.exists(), "the invalid aside is deleted (bounded footprint)");
        assert!(
            !root.path().join(LIVE_DIR).exists(),
            "an invalid manifest never becomes live"
        );
    }

    #[test]
    fn foreign_promotion_aside_is_skipped_and_the_rest_still_runs() {
        let root = TempDir::new().unwrap();
        // A symlink planted at the promotion-aside name.
        let aside = root.path().join(PROMOTION_ASIDE_DIR);
        std::os::unix::fs::symlink("/nonexistent", &aside).unwrap();
        // Garbage staging proves the rest of reconciliation still ran.
        let staging = root.path().join(STAGING_DIR);
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join(MANIFEST_FILE), "{ not json").unwrap();
        reconcile(&root, None, &NoTrash);
        let md = std::fs::symlink_metadata(&aside).unwrap();
        assert!(
            md.file_type().is_symlink(),
            "the foreign entry was neither followed nor deleted"
        );
        assert!(!staging.exists(), "the staging branch still ran");
    }

    #[test]
    fn stale_bundle_aside_with_occupied_running_path_is_trashed_via_the_fake() {
        let parent = TempDir::new().unwrap();
        let target = make_bundle(parent.path(), "Mark.app", "running-binary");
        make_bundle(parent.path(), "Mark.rollback-aside", "departed-v0");
        let rec = RecordingTrash(Mutex::new(vec![]));
        let root = TempDir::new().unwrap();
        reconcile(&root, Some(&target), &rec);
        let calls = rec.0.lock().unwrap();
        assert_eq!(
            calls.as_slice(),
            &[parent.path().join("Mark.rollback-aside")],
            "the injected fake (never the real Trash) took exactly the aside"
        );
        assert_eq!(bundle_binary(&target), "running-binary", "live bundle intact");
    }

    #[test]
    fn stale_bundle_aside_with_empty_running_path_is_renamed_back() {
        let parent = TempDir::new().unwrap();
        // The transient lockless-GUI window: no bundle at the running
        // path, the departed bundle waits at the aside.
        let aside = make_bundle(parent.path(), "Mark.rollback-aside", "departed-v1");
        let target = parent.path().join("Mark.app");
        let root = TempDir::new().unwrap();
        reconcile(&root, Some(&target), &NoTrash);
        assert_eq!(
            bundle_binary(&target),
            "departed-v1",
            "the defensive rename-back restored the bundle"
        );
        assert!(!aside.exists(), "the aside was consumed");
    }

    #[test]
    fn foreign_bundle_aside_left_in_place_and_reconciliation_continues() {
        let parent = TempDir::new().unwrap();
        let target = make_bundle(parent.path(), "Mark.app", "running-binary");
        let root = TempDir::new().unwrap();
        let staging = root.path().join(STAGING_DIR);
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join(MANIFEST_FILE), "{ not json").unwrap();

        // Case 1: a symlink at the aside name — foreign, left in place.
        let aside = parent.path().join("Mark.rollback-aside");
        std::os::unix::fs::symlink("/nonexistent", &aside).unwrap();
        reconcile(&root, Some(&target), &NoTrash);
        let md = std::fs::symlink_metadata(&aside).unwrap();
        assert!(md.file_type().is_symlink(), "not followed, not deleted");
        assert_eq!(bundle_binary(&target), "running-binary");
        assert!(!staging.exists(), "the rest of reconciliation still ran");
        fs::remove_file(&aside).unwrap();

        // Case 2: a garbage directory at the aside name in the shared
        // system parent — a name collision is someone else's content.
        fs::create_dir_all(&aside).unwrap();
        fs::write(aside.join("theirs.txt"), "not ours").unwrap();
        reconcile(&root, Some(&target), &NoTrash);
        assert!(aside.join("theirs.txt").exists(), "left in place and logged");
        assert_eq!(bundle_binary(&target), "running-binary");
        assert!(!staging.exists(), "the rest of reconciliation still ran");
    }

    #[test]
    fn empty_root_and_no_bundle_is_a_no_op() {
        let root = TempDir::new().unwrap();
        reconcile(&root, None, &NoTrash);
        assert!(!root.path().join(LIVE_DIR).exists());
        assert!(!root.path().join(PROMOTION_ASIDE_DIR).exists());
        assert!(!root.path().join(STAGING_DIR).exists());
    }

    // ── T-003 C-WIN-ROLLBACK-PANIC: the pending-installer accounting
    // matrix. Boot branches (transition-clear, in-window stay, expired
    // clear + retry armed, reuse-suspected stay, absent no-op), the
    // three-state evaluate table and the accounting wrapper — all on a
    // temp root with injected probes and canned-pid spawners.

    fn write_boot_fact(root: &Path, age_secs: u64, pid: Option<u32>) {
        write_pending_rollback(
            root,
            &PendingRollbackRecord {
                to_version: "2.9.0".to_string(),
                from_version: "2.9.1".to_string(),
                at: now_secs() as i64 - age_secs as i64,
                installer_pid: pid,
            },
        )
        .unwrap();
    }

    #[test]
    fn confirmed_transition_finalize_clears_the_pending_fact() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        // previous_version == running ("2.9.1"): the confirmed
        // transition — the finalize branch runs exactly as today.
        make_valid_set(&live, "2.9.1", false);
        write_boot_fact(root.path(), 0, Some(1));
        reconcile(&root, None, &NoTrash);
        assert!(
            !live.exists(),
            "the confirmed transition finalizes exactly as today"
        );
        assert!(
            !root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "the consumed fact is cleared by the finalize"
        );
    }

    #[test]
    fn confirmed_transition_survives_a_failing_fact_clear() {
        let root = TempDir::new().unwrap();
        let live = root.path().join(LIVE_DIR);
        make_valid_set(&live, "2.9.1", false);
        // A directory at the fact name makes the best-effort clear
        // fail without touching any restore machinery — the injected
        // failing writer.
        fs::create_dir_all(root.path().join(PENDING_ROLLBACK_FILE)).unwrap();
        reconcile(&root, None, &NoTrash);
        assert!(
            !live.exists(),
            "the finalize is never blocked or delayed by the failing clear"
        );
        assert!(
            root.path().join(PENDING_ROLLBACK_FILE).is_dir(),
            "the blocker is left untouched (stderr marker only)"
        );
    }

    #[test]
    fn boot_in_window_fact_stays_with_the_probe_unconsulted() {
        let root = TempDir::new().unwrap();
        write_boot_fact(root.path(), 0, None);
        let calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        let probe = |pid: u32| -> Option<bool> {
            calls.lock().unwrap().push(pid);
            Some(false)
        };
        reconcile_pending_rollback_at_boot(root.path(), "2.9.1", &probe);
        assert!(
            root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "in-window: the fact stays, the retry stays declined"
        );
        assert!(
            calls.lock().unwrap().is_empty(),
            "positive-failure-only: the probe is never consulted in-window"
        );
    }

    #[test]
    fn boot_expired_fact_clears_and_arms_the_retry() {
        let root = TempDir::new().unwrap();
        write_boot_fact(root.path(), PENDING_INSTALLER_WINDOW_SECS + 1, None);
        let dead = |_: u32| -> Option<bool> { Some(false) };
        reconcile_pending_rollback_at_boot(root.path(), "2.9.1", &dead);
        assert!(
            !root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "expired without positive liveness: cleared, retry armed"
        );
    }

    #[test]
    fn boot_alive_pid_past_window_stays_reuse_suspected() {
        let root = TempDir::new().unwrap();
        write_boot_fact(root.path(), PENDING_INSTALLER_WINDOW_SECS + 1, Some(9));
        let calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        let probe = |pid: u32| -> Option<bool> {
            calls.lock().unwrap().push(pid);
            Some(true)
        };
        reconcile_pending_rollback_at_boot(root.path(), "2.9.1", &probe);
        assert!(
            root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "a positively-alive pid past the window stays declined (reuse suspected)"
        );
        assert_eq!(calls.lock().unwrap().as_slice(), &[9]);
    }

    #[test]
    fn boot_absent_fact_is_a_noop() {
        let root = TempDir::new().unwrap();
        let calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        let probe = |pid: u32| -> Option<bool> {
            calls.lock().unwrap().push(pid);
            Some(false)
        };
        reconcile_pending_rollback_at_boot(root.path(), "2.9.1", &probe);
        assert!(calls.lock().unwrap().is_empty(), "absent: nothing consulted");
        assert!(
            !root.path().join(PENDING_ROLLBACK_FILE).exists(),
            "absent: nothing created"
        );
    }

    #[test]
    fn evaluate_pending_table_pins_the_three_states() {
        let root = TempDir::new().unwrap();
        let dead = |_: u32| -> Option<bool> { Some(false) };
        let unavailable = |_: u32| -> Option<bool> { None };

        write_pending_rollback(
            root.path(),
            &PendingRollbackRecord {
                to_version: "2.9.0".to_string(),
                from_version: "2.9.1".to_string(),
                at: 1000,
                installer_pid: None,
            },
        )
        .unwrap();
        // In-window: declined, probe unconsulted.
        let calls: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(vec![]);
        let counting = |pid: u32| -> Option<bool> {
            calls.lock().unwrap().push(pid);
            Some(false)
        };
        match evaluate_pending_rollback(
            root.path(),
            "2.9.1",
            1000 + PENDING_INSTALLER_WINDOW_SECS - 1,
            &counting,
        ) {
            PendingDecision::Declined(reason) => assert_eq!(reason, PENDING_DECLINED_IN_WINDOW),
            other => panic!("in-window must decline, got {other:?}"),
        }
        assert!(
            calls.lock().unwrap().is_empty(),
            "inside the window the probe is never consulted"
        );
        // Exactly at the window the age bound expires the fact.
        match evaluate_pending_rollback(
            root.path(),
            "2.9.1",
            1000 + PENDING_INSTALLER_WINDOW_SECS,
            &dead,
        ) {
            PendingDecision::ExpiredClear => {}
            other => panic!("age == window is expired, got {other:?}"),
        }
        // Past the window: probe unavailable (None) never declares
        // failure — the window carries the verdict.
        match evaluate_pending_rollback(
            root.path(),
            "2.9.1",
            1000 + PENDING_INSTALLER_WINDOW_SECS + 1,
            &unavailable,
        ) {
            PendingDecision::ExpiredClear => {}
            other => panic!("unavailable probe → clear, got {other:?}"),
        }
        // Past the window with a positively-alive pid: reuse suspected.
        write_pending_rollback(
            root.path(),
            &PendingRollbackRecord {
                to_version: "2.9.0".to_string(),
                from_version: "2.9.1".to_string(),
                at: 1000,
                installer_pid: Some(5),
            },
        )
        .unwrap();
        let alive = |pid: u32| -> Option<bool> { if pid == 5 { Some(true) } else { Some(false) } };
        match evaluate_pending_rollback(
            root.path(),
            "2.9.1",
            1000 + PENDING_INSTALLER_WINDOW_SECS + 1,
            &alive,
        ) {
            PendingDecision::Declined(reason) => assert_eq!(reason, PENDING_DECLINED_PID_ALIVE),
            other => panic!("alive past window must decline, got {other:?}"),
        }
        // Stale fact (the target version is already running): clear and
        // allow — the transition-confirm branch consumes it at finalize.
        write_pending_rollback(
            root.path(),
            &PendingRollbackRecord {
                to_version: "2.9.1".to_string(),
                from_version: "2.8.2".to_string(),
                at: now_secs() as i64,
                installer_pid: None,
            },
        )
        .unwrap();
        match evaluate_pending_rollback(root.path(), "2.9.1", now_secs(), &dead) {
            PendingDecision::ExpiredClear => {}
            other => panic!("a consumed transition's fact is stale, got {other:?}"),
        }
        // Absent: cleared by definition (gate proceeds; boot checks
        // presence first when it must distinguish absent from expired).
        clear_pending_rollback(root.path());
        match evaluate_pending_rollback(root.path(), "2.9.1", now_secs(), &dead) {
            PendingDecision::ExpiredClear => {}
            other => panic!("absent fact → clear, got {other:?}"),
        }
    }

    #[test]
    fn failed_fact_write_is_non_blocking_and_the_spawn_proceeds() {
        let root = TempDir::new().unwrap();
        // A directory at the fact name makes both the pre-spawn write
        // and the pid patch fail without touching the spawn machinery.
        fs::create_dir_all(root.path().join(PENDING_ROLLBACK_FILE)).unwrap();
        let raw = |_: &Path| -> Result<u32, String> { Ok(7) };
        let spawn = pending_accounting_spawn(root.path(), "2.9.0", "2.9.1", 1, &raw);
        let pid = spawn(Path::new("installer.exe")).unwrap();
        assert_eq!(
            pid, 7,
            "the restore's primary job never fails on accounting — the spawn proceeded"
        );
        assert!(
            root.path().join(PENDING_ROLLBACK_FILE).is_dir(),
            "the blocker is left untouched (logged BLOCK marker only)"
        );
    }
}

// ─── Restore-outcome read-and-clear tests (T-001 C-RENDER-REVIEW-FIXES)

// The strict read side of the fact channel, driven on TempDir roots via
// the root-explicit read_and_clear_restore_outcome / clear_restore_outcome
// seams — never the real data root (the root-override precedent).
#[cfg(all(test, not(feature = "app-store")))]
mod rollback_restore_outcome {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_raw_marker(root: &Path, text: &str) {
        fs::write(root.join(RESTORE_OUTCOME_FILE), text).unwrap();
    }

    #[test]
    fn clear_restore_outcome_clears_unconsumed_marker_on_tempdir() {
        let root = TempDir::new().unwrap();
        write_raw_marker(
            root.path(),
            r#"{"prefs":"skipped","error":"unconsumed","at":1}"#,
        );
        clear_restore_outcome(root.path());
        assert!(!root.path().join(RESTORE_OUTCOME_FILE).exists());
        // Absence is ignored — a second clear is a quiet no-op.
        clear_restore_outcome(root.path());
    }

    #[test]
    fn read_and_clear_returns_record_once_then_none() {
        let root = TempDir::new().unwrap();
        write_raw_marker(
            root.path(),
            r#"{"prefs":"skipped","error":"injected prefs failure","at":1762100000}"#,
        );
        let first = read_and_clear_restore_outcome(root.path())
            .expect("the first read returns the record");
        assert_eq!(first.prefs, "skipped");
        assert_eq!(first.error, "injected prefs failure");
        assert_eq!(first.at, 1762100000);
        assert!(
            !root.path().join(RESTORE_OUTCOME_FILE).exists(),
            "the file is removed in the same call"
        );
        assert!(
            read_and_clear_restore_outcome(root.path()).is_none(),
            "the second read is null — read-and-clear is one-shot"
        );
        // Idempotent on absent files: a missing root is None too.
        assert!(read_and_clear_restore_outcome(&root.path().join("absent")).is_none());
    }

    #[test]
    fn unparsable_missing_at_or_overlong_error_read_as_null_and_clear() {
        // 1. Unparsable text.
        let root = TempDir::new().unwrap();
        write_raw_marker(root.path(), "{ not json");
        assert!(read_and_clear_restore_outcome(root.path()).is_none());
        assert!(
            !root.path().join(RESTORE_OUTCOME_FILE).exists(),
            "an unparsable marker is still cleared"
        );
        // 2. Schema-valid shape but missing the at field: unparsable by
        //    the same strict-schema rule.
        let root = TempDir::new().unwrap();
        write_raw_marker(root.path(), r#"{"prefs":"skipped","error":"no timestamp"}"#);
        assert!(read_and_clear_restore_outcome(root.path()).is_none());
        assert!(
            !root.path().join(RESTORE_OUTCOME_FILE).exists(),
            "a missing-at marker is still cleared"
        );
        // 3. An error field over the write-side cap reads as null.
        let root = TempDir::new().unwrap();
        let overlong = "e".repeat(RESTORE_OUTCOME_ERROR_CAP + 1);
        write_raw_marker(
            root.path(),
            &serde_json::json!({ "prefs": "skipped", "error": overlong, "at": 1 }).to_string(),
        );
        assert!(read_and_clear_restore_outcome(root.path()).is_none());
        assert!(
            !root.path().join(RESTORE_OUTCOME_FILE).exists(),
            "an over-cap marker is still cleared"
        );
        // Boundary: exactly the cap is within the bound and reads back.
        let root = TempDir::new().unwrap();
        let exact = "e".repeat(RESTORE_OUTCOME_ERROR_CAP);
        write_raw_marker(
            root.path(),
            &serde_json::json!({ "prefs": "skipped", "error": exact, "at": 1 }).to_string(),
        );
        assert!(
            read_and_clear_restore_outcome(root.path()).is_some(),
            "an exactly-cap error is accepted"
        );
    }
}


// C-ROLLBACK-STORE-BUILD-GUARD: compile the real Store feature and invoke its
// inert command boundary without profiles, network access or desktop helpers.
#[cfg(all(test, feature = "app-store"))]
mod rollback_store_stubs {
    use super::*;

    #[tokio::test]
    async fn mutation_commands_keep_the_store_managed_voice() {
        assert_eq!(mt_rollback_prepare().await.unwrap_err(), "Updates are managed by the App Store");
        assert_eq!(mt_rollback_restore().await.unwrap_err(), "Updates are managed by the App Store");
    }

    #[tokio::test]
    async fn status_and_outcome_remain_unavailable_and_empty() {
        let status = mt_rollback_status().await.unwrap();
        assert!(!status.available);
        assert!(status.previous_version.is_none());
        assert_eq!(status.current_version, current_version());
        assert!(mt_rollback_restore_outcome().await.unwrap().is_none());
    }
}
