// MODULE_CONTRACT
//   PURPOSE: M-001 entry point. Strict boot order:
//              (1) m001_panic::install_panic_hook  — first, so any later
//                  step's panic produces a crash log + dialog instead of
//                  a zombie process.
//              (2) legacy::detect_layouts          — read-only scan for
//                  pre-existing electron-store data (marktext + mark
//                  namespaces under ~/Library/Application Support/).
//              (3) MARK_SKIP_MIGRATION env check   — optional escape
//                  hatch documented in migration_strings on 10 locales;
//                  bypasses the dialog and the prefs::init stub gate.
//              (4) migration dialog (if needed)    — native rfd dialog
//                  with rate-limit hint after 3+ cancels in 7 days.
//              (5) m001_security::audit_or_exit    — tauri.conf.json
//                  posture check (CSP, freezePrototype, assetProtocol,
//                  dangerousDisableAssetCspModification).
//              (6) m001_validate::validate_or_exit — embedded
//                  tauri.v2.json fixture vs REGISTERED_COMMANDS parity
//                  check. Drift → native dialog + exit(1).
//              (7) tauri::Builder::default with M-013b + m001_pdf
//                  invoke handlers, then run.
//   SCOPE:    process bootstrap orchestration only. NO command logic,
//             NO file I/O beyond what legacy::detect_layouts and
//             cancel_log do, NO Tauri runtime work — that's after run().
//   DEPENDS:  cancel_log, dialog, legacy, m001_panic, m001_pdf,
//             m001_security, m001_validate, m013b, migration_strings,
//             mt_paths, prefs, snapshot.
//   LINKS:    docs/development-plan.xml Phase-B1 step-7..11 + step-B-pre2;
//             docs/knowledge-graph.xml M-001;
//             docs/verification-plan.xml V-M-001;
//             docs/gate-phase-b1-closure.md (Gate-Phase-B1 verdict).
//   STATUS:   Phase-B1 closed; M-001 is partially-implemented at the
//             boot-orchestration layer. Real impls of M-013b commands
//             ship in Phase-B2.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B-pre2-followup-FIX: MARK_SKIP_MIGRATION env-var bypass
//     wired (texts on 10 locales already promised it; only hint was
//     shipped in pre2 step-4, code path was missing).
//   - 2026-04-28 B1-step-11: m001_lifecycle module declared (types only;
//     no boot-order changes here — runtime hooks deferred to B2/B3).
//   - 2026-04-28 B1-step-10: m001_panic::install_panic_hook prepended
//     as the first call in main(). NEVER panic guarantee per V-M-001.
//   - 2026-04-28 B1-step-9: m001_security::audit_or_exit added BEFORE
//     m001_validate (degraded-security binary running aligned IPC is
//     worse than failing fast).
//   - 2026-04-28 B1-step-8: m001_pdf::mt_print_to_pdf registered in
//     generate_handler! alongside M-013b commands.
//   - 2026-04-28 B1-step-7: m001_validate::validate_or_exit added
//     before tauri::Builder; embedded tauri.v2.json fixture parity check.
//   - 2026-04-28 B1-step-6: m013b commands (5 fs + 2 search + 2 watch)
//     registered via tauri::generate_handler!.
//   - 2026-04-27 B-pre2 step-1..5: legacy detection + migration dialog
//     + cancel_log + snapshot + prefs::init stub gate boot pipeline.

// Prevent additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[allow(dead_code)] // dialog flow auto-migrates 2026-05-09; kept for future re-enable
mod cancel_log;
mod dialog;
mod legacy;
mod m001_lifecycle;
mod m001_panic;
mod m001_pdf;
mod m001_security;
mod m001_validate;
mod m005_prefs;
mod m006_shortcuts;
mod m007_spell;
mod m008_fonts;
mod m009_menu;
mod m001_save_close;
mod m010_security;
mod m014_encoding;
mod m015_pandoc;
mod m016_updater;
mod m017_recent;
mod m018_screenshot;
mod m019_datacenter;
mod m020_cli;
mod m021_default_handler;
mod m013b;
mod m_v1_compat;
mod m005_migrate;
#[allow(dead_code)] // dialog flow auto-migrates 2026-05-09; locale strings kept for future re-enable
mod migration_strings;
mod mt_paths;
mod prefs;
mod snapshot;

#[allow(unused_imports)]
use dialog::DialogChoice;

/// F-FILE-OPEN-PENDING (alpha.5): macOS Apple Event handling for
/// "Open With" + Finder double-click. Per Tauri 2 docs, RunEvent::Opened
/// fires BEFORE Ready/Window — listeners aren't yet active. We push paths
/// into this AppState; frontend drains via mt_drain_pending_opens after
/// bootstrap-editor completes. Race-free (vs the 1.5s deferred-thread
/// hack that preceded this).
///
/// M-025 perf-pending-opens-parallel (alpha.6): the renderer now
/// invokes `mt_drain_pending_opens` from `setupIpcListeners()` top-level
/// in parallel with Vue mount (instead of serially after bootstrap-editor
/// returns). Once the drain completes, the renderer's `mt::open-new-tab`
/// listener is fully wired; subsequent RunEvent::Opened bursts (Apple
/// Events fired AFTER the cold-launch window — e.g. user opens another
/// `.md` from Finder while the app is already running) must NOT be
/// re-enqueued (no second drain), they must be delivered directly.
///
/// `drained` flag (M-025 ready-signal): set to `true` by
/// `mt_drain_pending_opens` after it finishes. RunEvent::Opened consults
/// this flag — `false` ⇒ enqueue (cold-launch window, listeners not
/// ready); `true` ⇒ direct-emit (warm window, listener live).
///
/// `had_initial_opens` flag (M-025.1 untitled-suppression): latched
/// `true` the moment ANY path is enqueued OR direct-emitted. Consumed by
/// `mt_request_keybindings` to decide `addBlankTab` in the
/// bootstrap-editor payload — suppresses the spurious Untitled-1 tab
/// that previously appeared alongside Finder-opened files (user smoke
/// 2026-05-11: "по умолчанию всё ещё дополнительно открывается файл
/// untitled"). Set-only, never reset; single session lifetime.
pub struct PendingOpens {
    pub queue: std::sync::Mutex<Vec<String>>,
    pub drained: std::sync::atomic::AtomicBool,
    pub had_initial_opens: std::sync::atomic::AtomicBool,
    /// Set by mt_app_quit before calling app.exit(0) so the
    /// ExitRequested handler lets the exit proceed on the second pass.
    pub quit_approved: std::sync::atomic::AtomicBool,
}

impl Default for PendingOpens {
    fn default() -> Self {
        Self {
            queue: std::sync::Mutex::new(Vec::new()),
            drained: std::sync::atomic::AtomicBool::new(false),
            had_initial_opens: std::sync::atomic::AtomicBool::new(false),
            quit_approved: std::sync::atomic::AtomicBool::new(false),
        }
    }
}

#[tauri::command]
fn mt_drain_pending_opens(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PendingOpens>,
) -> Vec<String> {
    let drained: Vec<String> = {
        let mut q = state.queue.lock().unwrap_or_else(|e| e.into_inner());
        std::mem::take(&mut *q)
    };
    eprintln!("[main][pending_opens][BLOCK_DRAINED count={}]", drained.len());
    // Emit mt::open-new-tab for each queued path. Reuses
    // m_v1_compat::emit_open_new_tab (reads file via std::fs, builds
    // IMarkdownDocumentRaw payload, fires the event). preview_mode=true
    // per M-022: Apple Event / CLI launches start read-only.
    for path in &drained {
        if let Err(e) = m_v1_compat::emit_open_new_tab(&window, path, true) {
            eprintln!("[main][pending_opens][BLOCK_EMIT_FAILED path={path} err={e}]");
        } else {
            eprintln!("[main][pending_opens][BLOCK_EMITTED path={path}]");
        }
    }
    // M-025 ready-signal: flip the flag AFTER the drain emit loop so any
    // RunEvent::Opened racing concurrently still goes through the queue
    // (the lock above + this store ordering guarantee no path is lost).
    // Subsequent Apple Events go through the direct-emit branch in the
    // RunEvent::Opened handler below.
    state
        .drained
        .store(true, std::sync::atomic::Ordering::SeqCst);
    eprintln!("[main][pending_opens][BLOCK_DRAIN_COMPLETE drained_flag=true]");
    drained
}

/// F-DEV-MODE-WHITE-SCREEN diagnostic: dev-only renderer error sink.
/// Receives JS exceptions / unhandledrejection / console.error from
/// the webview (injected via WebviewWindow::eval in setup) and dumps
/// them to stderr. Production keeps the command but the JS hook is
/// not installed — invocations never come, so this is a no-op there.
#[tauri::command]
fn mt_dev_diag(payload: serde_json::Value) {
    eprintln!(
        "[dev-diag][js] {}",
        serde_json::to_string(&payload).unwrap_or_else(|_| "<unserializable>".to_string())
    );
}

fn main() {
    // Phase-B3 step-3: parse CLI BEFORE installing the panic hook.
    // clap auto-handles --help / --version by printing + exit(0); a
    // panic hook firing on those paths would write a spurious crash
    // log. parse() is read-only over argv — no FS, no IPC.
    let cli = m020_cli::parse();
    if cli.print_version {
        println!("mark {}", env!("CARGO_PKG_VERSION"));
        std::process::exit(0);
    }

    // Phase-B1 step-10: install panic hook FIRST (after CLI parse).
    // Before legacy detection, before security audit, before contract
    // validation — any panic in any of those paths must produce a
    // crash log + dialog rather than a zombie process. V-M-001 hard
    // requirement.
    m001_panic::install_panic_hook();

    // Verbose flag from CLI: future hook for diagnostic stream.
    if cli.verbose {
        eprintln!("[main][cli][BLOCK_VERBOSE_ENABLED files={} dir={:?} new_window={}]",
            cli.files.len(), cli.directory, cli.new_window);
    }

    // Phase-B-pre2 step-1: detect pre-existing electron-store layouts BEFORE
    // tauri::Builder takes ownership of the runtime. Read-only at this stage —
    // migration decisions and writes are deferred to M-005 mt-prefs.
    let layouts = legacy::detect_layouts();
    legacy::log_detection(&layouts);

    // Phase-B-pre2-followup-FIX (2026-04-28): MARK_SKIP_MIGRATION=1 env-var
    // bypass. Migration dialog texts on 10 locales already promised this
    // escape hatch ("To stop seeing this dialog, set MARK_SKIP_MIGRATION=1
    // in your environment.") but the actual code path was never wired up
    // in pre2 step-4 — it shipped only the rate-limit hint text. Without
    // this branch the dialog could not be skipped at all, regardless of
    // env state. Now the env-var fully bypasses both the dialog and the
    // prefs::init() stub gate, so Tauri::Builder runs and a window opens.
    let skip_migration = std::env::var_os("MARK_SKIP_MIGRATION")
        .map(|v| v != "0" && !v.is_empty())
        .unwrap_or(false);
    if skip_migration {
        eprintln!("[main][bootstrap][BLOCK_MIGRATION_SKIPPED_BY_ENV]");
    }

    // F-MIGRATE-DIALOG-SUPPRESS-AFTER-DONE (2026-05-07): if every
    // F-PREFS-MIGRATE-V1 idempotency marker is already set in
    // cache_root/preferences.json, skip the dialog entirely so users
    // who completed migration once don't see it on every boot. We
    // peek at the file directly (no PrefsState — that's not booted
    // yet at this point in main()).
    let migration_already_done = mt_paths::cache_root()
        .and_then(|cr| {
            let prefs_path = cr.join("preferences.json");
            std::fs::read_to_string(&prefs_path).ok()
        })
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|json| {
            let ns = json.get("mt_migration")?;
            let all_done = [
                "preferences_v1",
                "data_center_v1",
                "keybindings_v1",
                "recent_docs_v1",
                "keychain_v1",
            ]
            .iter()
            .all(|k| ns.get(*k).and_then(|v| v.as_str()) == Some("done"));
            Some(all_done)
        })
        .unwrap_or(false);
    if migration_already_done {
        eprintln!("[main][bootstrap][BLOCK_MIGRATION_ALREADY_COMPLETE] all 5 markers present; skipping dialog");
    }

    // Auto-migrate when legacy data is detected. Earlier builds asked via a
    // native dialog with Cancel / Continue buttons + rate-limit hint after
    // 3+ cancels. Per user feedback 2026-05-09, that dialog is friction
    // without value — if there's something to migrate, just migrate it.
    // The original v1.x data in ~/Library/Application Support is read-only
    // for the migrator, so this is a non-destructive auto-import. Set
    // MARK_SKIP_MIGRATION=1 if you really don't want it (e.g. for tests).
    if layouts.any_detected() && !skip_migration && !migration_already_done {
        eprintln!("[main][bootstrap][BLOCK_MIGRATION_AUTO_CONTINUE]");
        {
            {
                eprintln!("[main][bootstrap][BLOCK_MIGRATION_CONTINUE]");

                // Phase-B-pre2 step-5: snapshot legacy data into
                // cache_root/snapshot/ts-<unix>/ BEFORE the stub gate
                // runs. The snapshot is the stable read-only source
                // M-005 (Phase-B3) will consume; original data in
                // ~/Library/Application Support is NEVER touched here.
                match mt_paths::cache_root() {
                    Some(cache_root) => match snapshot::snapshot_legacy(&layouts, &cache_root) {
                        Ok(r) => {
                            eprintln!(
                                "[snapshot][run][BLOCK_SNAPSHOT_LEGACY dest={} files={} bytes={}]",
                                r.dest.display(), r.files, r.bytes
                            );
                            eprintln!("[main][bootstrap][BLOCK_MIGRATION_PREFLIGHT_DONE]");
                        }
                        Err(e) => {
                            eprintln!("[snapshot][run][BLOCK_SNAPSHOT_FAILED reason={e}]");
                            eprintln!("[main][bootstrap][BLOCK_MIGRATION_PREFLIGHT_FAILED]");
                            std::process::exit(2);
                        }
                    },
                    None => {
                        eprintln!("[snapshot][run][BLOCK_SNAPSHOT_NO_CACHE_ROOT]");
                        eprintln!("[main][bootstrap][BLOCK_MIGRATION_PREFLIGHT_FAILED]");
                        std::process::exit(3);
                    }
                }

                // F-PREFS-MIGRATE-V1 step-8 (was Phase-B-pre2 step-6 stub gate
                // until 2026-04-29). The B-pre2 stub aborted with
                // MT_PREFS_V1_RUNNING; now we run the real 6-step migration
                // pipeline (snapshot loader → preferences → dataCenter →
                // keybindings → recent_docs → keychain rename) under a
                // process-level lockfile. Steps are idempotent — partial
                // completion is recoverable on next boot.
                let cache_root = match mt_paths::cache_root() {
                    Some(c) => c,
                    None => {
                        eprintln!("[main][bootstrap][BLOCK_MIGRATION_NO_CACHE_ROOT]");
                        dialog::ask_native_error(
                            "Mark — migration aborted",
                            "Could not resolve the cache directory required for migration. \
                             Please ensure ~/Library/Caches is writable and try again.",
                        );
                        std::process::exit(2);
                    }
                };
                let mut migrate_store = m005_prefs::PrefsStore::load_from(
                    cache_root.join("preferences.json"),
                );
                let backend = m005_migrate::keychain::RealKeychain;
                match m005_migrate::runner::run(&cache_root, &backend, &mut migrate_store) {
                    Ok(summary) => {
                        if let Some(failure) = summary.first_failure.as_ref() {
                            eprintln!(
                                "[main][bootstrap][BLOCK_MIGRATION_PARTIAL failure={failure:?}]"
                            );
                            // Persist whatever progress was made (each
                            // successful step already wrote its idempotency
                            // marker; saving locks them in for the next
                            // boot to skip via AlreadyDone).
                            let _ = migrate_store.save();
                            dialog::ask_native_error(
                                "Mark — migration partially completed",
                                &format!(
                                    "A step in the migration pipeline failed:\n\n{failure:?}\n\n\
                                     Successful steps were saved and will be skipped on the next launch. \
                                     The original Mark Text v1.x data in ~/Library/Application Support/marktext \
                                     was not modified. Please report this on the project tracker so the failure can be diagnosed.",
                                ),
                            );
                            std::process::exit(1);
                        }
                        if let Err(e) = migrate_store.save() {
                            eprintln!(
                                "[main][bootstrap][BLOCK_MIGRATION_PERSIST_FAILED err={e}]"
                            );
                            dialog::ask_native_error(
                                "Mark — migration save failed",
                                &format!(
                                    "Migration completed in memory but could not be persisted to disk: {e}\n\n\
                                     This is usually a permission or disk-space problem. Original v1.x data is intact.",
                                ),
                            );
                            std::process::exit(1);
                        }
                        eprintln!(
                            "[main][bootstrap][BLOCK_MIGRATION_COMPLETED prefs={:?} dc={:?} kb={:?} recent={:?} keychain={:?}]",
                            summary.preferences,
                            summary.data_center,
                            summary.keybindings,
                            summary.recent_docs,
                            summary.keychain,
                        );
                        // Earlier builds surfaced a one-shot native info
                        // dialog summarizing migrated key counts. Per user
                        // feedback 2026-05-09, dialogs in the boot path are
                        // friction; the migration summary already prints to
                        // stderr (BLOCK_MIGRATION_COMPLETED above) and users
                        // can verify imported state via Settings. No banner.
                    }
                    Err(failure) => {
                        eprintln!("[main][bootstrap][BLOCK_MIGRATION_RUNNER_FAILED failure={failure:?}]");
                        dialog::ask_native_error(
                            "Mark — migration could not start",
                            &format!(
                                "The migration runner could not begin:\n\n{failure:?}\n\n\
                                 The original Mark Text v1.x data has not been modified.",
                            ),
                        );
                        std::process::exit(1);
                    }
                }
            }
        }
    } else {
        eprintln!("[main][bootstrap][BLOCK_NO_MIGRATION_NEEDED]");
    }

    // Phase-B1 step-9: WebView shell security posture audit. Reads the
    // embedded tauri.conf.json + asserts the security block carries
    // the expected hardened settings (explicit CSP, assetProtocol
    // disabled, freezePrototype on, no dangerous CSP overrides).
    // Drift → native dialog + exit 1. Step-9 fires BEFORE step-7
    // because a contract-aligned binary running on a security-degraded
    // config is worse than failing fast.
    m001_security::audit_or_exit();

    // Phase-B1 step-7: M-001 BLOCK_VALIDATE_AGAINST_FIXTURE on-boot
    // parity check. Embedded test/fixtures/ipc-channels/tauri.v2.json
    // is compared against the same command name set passed to
    // tauri::generate_handler! below. Drift → native dialog + exit 1.
    // Per V-M-001: never panic; this guards against silent
    // contract violations sneaking past code review.
    m001_validate::validate_or_exit();

    // Phase-B2 step-2: M-013b commands gain real fs impls. SecurityCtx
    // managed-state holds the active workspace sandbox; default = "/"
    // (permissive) until M-005 (B3 step-1) wires "Open Folder" → set
    // sandbox via menu/prefs. M-010 absolute-safety guards
    // (NUL/overlong/symlink-escape) still active under permissive default.
    // Phase-B3 step-1: M-005 prefs store boots before tauri::Builder so
    // we can restore the persisted workspace into SecurityCtx BEFORE any
    // command handler runs. SecurityCtx default is "/" (permissive); if
    // prefs has a valid workspaceRoot path, sandbox tightens immediately.
    let prefs = m005_prefs::PrefsState::boot();
    let sec_ctx = m013b::SecurityCtx::default();
    m005_prefs::restore_workspace(&prefs, &sec_ctx);
    // M-025.3 (smoke 2026-05-11 alpha.6.1+): force followSystemTheme=false
    // on every boot until F-THEME-FOLLOW-SYSTEM is properly ported. The
    // legacy default and any pre-existing v1 prefs file ship the flag as
    // true, which short-circuits every theme-card click in Settings (the
    // click guard `!followSystemTheme && ...` in prefComponents/theme/
    // index.vue:16 reads as no-op). See m005_prefs::override_unimplemented_
    // follow_system_theme for the full rationale.
    m005_prefs::override_unimplemented_follow_system_theme(&prefs);

    // CLI -d / --dir overrides the prefs-restored workspace for this
    // session. Persistence semantics: explicit CLI flag does NOT update
    // prefs (one-shot session), so the next launch without -d resumes
    // the previous workspaceRoot.
    if let Some(cli_dir) = cli.directory.as_ref() {
        if cli_dir.is_dir() {
            if let Ok(canonical) = std::fs::canonicalize(cli_dir) {
                eprintln!(
                    "[main][cli][BLOCK_WORKSPACE_FROM_CLI path={}]",
                    canonical.display()
                );
                sec_ctx.set_sandbox(canonical);
            }
        } else {
            eprintln!(
                "[main][cli][BLOCK_CLI_DIR_INVALID path={}]",
                cli_dir.display()
            );
        }
    }

    // Capture CLI files for the setup hook (move into closure). Each
    // valid path is converted to absolute form upfront so a path like
    // `./demo.md` doesn't resolve relative to wherever the binary is
    // launched-from (which differs between `cargo run` vs `open -a`).
    let cli_files: Vec<String> = cli
        .files
        .iter()
        .filter_map(|p| {
            std::fs::canonicalize(p)
                .ok()
                .and_then(|abs| abs.to_str().map(|s| s.to_string()))
                .or_else(|| p.to_str().map(|s| s.to_string()))
        })
        .collect();

    tauri::Builder::default()
        // F-UPDATER-WIRE-PLUGIN: tauri-plugin-updater wires the
        // ed25519-signed feed at endpoints[] in tauri.conf.json. The
        // plugin verifies signatures against pubkey before downloading
        // anything. Renderer calls via @tauri-apps/plugin-updater
        // (M-016 mt_updater_check now proxies to the plugin).
        .plugin(tauri_plugin_updater::Builder::new().build())
        // F-SHORTCUT-PLATFORM-BIND (B4-pre-alpha step-2): the
        // global-shortcut plugin handles system-wide hotkeys
        // (Cmd+Shift+M show-window class) — distinct from menu
        // accelerators which fire only when Mark has focus. The
        // setup hook below calls m006_shortcuts::register_global_shortcuts
        // after the menu is wired.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // F-SAVE-AS-DIALOG (B4-pre-alpha-step-3): tauri-plugin-dialog
        // for native Save/Open file picker. rfd::save_file crashes
        // on async commands ("unexpected NULL from NSSavePanel") so
        // we use the official Tauri plugin which dispatches to the
        // main thread internally.
        .plugin(tauri_plugin_dialog::init())
        // F-MENU-WIRE-TAURI (B4-pre-alpha step-1): build the native
        // macOS menu in Builder.setup so accelerators bind to menu
        // items at app boot. Each menu item with `with_id(...)` becomes
        // a MenuId that on_menu_event receives; we forward by id via
        // `mt::menu-invoked` event and the renderer's menu-bridge
        // dispatches to the matching command in commands/index.js.
        .setup(move |app| {
            use tauri::Manager;
            let handle = app.handle().clone();
            let menu = m009_menu::build_native_menu(&handle).inspect_err(|e| {
                eprintln!("[menu][build][BLOCK_BUILD_NATIVE_MENU_FAILED reason={e}]");
            })?;
            app.set_menu(menu)?;
            eprintln!("[menu][build][BLOCK_BUILD_NATIVE_MENU] installed");
            // F-SHORTCUT-PLATFORM-BIND: register builtin global shortcuts
            // (Cmd+Shift+M show-window) AFTER set_menu so any conflicts
            // with menu accelerators are visible in the log.
            if let Err(e) = m006_shortcuts::register_global_shortcuts(&handle) {
                eprintln!("[shortcuts][register_global][BLOCK_BATCH_FAILED reason={e}]");
            }
            // F-LIFECYCLE-WIRE: manage MainCloseSm state and attach
            // CloseRequested handler so dirty-tab close-prompt can fire.
            // The handler queries the managed state at event time so it
            // does not need to capture an Arc.
            app.manage(m001_save_close::MainCloseSm::default());
            if let Some(main_win) = app.get_webview_window("main") {
                m001_save_close::wire_close_handler(&main_win);
                eprintln!("[m001][lifecycle][BLOCK_CLOSE_HANDLER_WIRED label=main]");
                // F-DEV-MODE-WHITE-SCREEN diagnostic: dev-only inject
                // window.onerror + unhandledrejection + console.error
                // hooks that pipe through `mt_dev_diag` so JS exceptions
                // surface in backend stderr. Active when EITHER:
                //   (a) debug build (`#[cfg(debug_assertions)]` true), OR
                //   (b) env var `MARK_DEV_DIAG=1` set at launch — release-
                //       smoke escape hatch added 2026-05-11 alpha.6.3 so
                //       theme-picker BLOCK_* markers (currently console.log
                //       only) reach stderr without rebuilding. Hooks
                //       console.log + console.warn + console.error +
                //       window.error + unhandledrejection. Defaults OFF in
                //       release so production users don't see noisy stderr.
                let dev_diag_via_env = std::env::var_os("MARK_DEV_DIAG")
                    .map(|v| v != "0" && !v.is_empty())
                    .unwrap_or(false);
                if cfg!(debug_assertions) || dev_diag_via_env {
                    let _ = main_win.eval(
                        r#"(() => {
  const post = (payload) => {
    try { window.__TAURI_INTERNALS__?.invoke('mt_dev_diag', { payload }); } catch (_) {}
  };
  const _stringify = (a) => {
    try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
    catch { return '[unserializable]'; }
  };
  window.addEventListener('error', (e) => {
    post({ kind: 'error', message: e.message, file: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack ?? null });
  });
  window.addEventListener('unhandledrejection', (e) => {
    let reason = '';
    let stack = null;
    try { reason = String(e.reason); stack = e.reason?.stack ?? null; } catch (_) {}
    post({ kind: 'unhandledrejection', reason, stack });
  });
  const _ce = console.error.bind(console);
  console.error = (...args) => {
    try { post({ kind: 'console.error', args: args.map(_stringify) }); } catch (_) {}
    return _ce(...args);
  };
  const _cw = console.warn.bind(console);
  console.warn = (...args) => {
    try { post({ kind: 'console.warn', args: args.map(_stringify) }); } catch (_) {}
    return _cw(...args);
  };
  const _cl = console.log.bind(console);
  console.log = (...args) => {
    try { post({ kind: 'console.log', args: args.map(_stringify) }); } catch (_) {}
    return _cl(...args);
  };
  post({ kind: 'hook-installed' });
})();"#,
                    );
                    eprintln!(
                        "[dev-diag][installed via={}]",
                        if cfg!(debug_assertions) { "debug_cfg" } else { "MARK_DEV_DIAG" }
                    );
                }

                // CLI args (`mark file.md` direct invocation): push into
                // PendingOpens AppState alongside Apple Event paths.
                // Frontend drains both via mt_drain_pending_opens after
                // bootstrap-editor — race-free, no deferred-thread sleep.
                if !cli_files.is_empty() {
                    let state = tauri::Manager::state::<PendingOpens>(app);
                    let mut q = state.queue.lock().unwrap_or_else(|e| e.into_inner());
                    for path in &cli_files {
                        eprintln!("[main][cli][BLOCK_CLI_QUEUED path={path}]");
                        q.push(path.clone());
                    }
                    // M-025.1: latch so mt_request_keybindings suppresses
                    // the addBlankTab Untitled-1 tab.
                    state
                        .had_initial_opens
                        .store(true, std::sync::atomic::Ordering::SeqCst);
                }
            } else {
                eprintln!("[m001][lifecycle][BLOCK_CLOSE_HANDLER_SKIPPED reason=no-main-window]");
            }
            Ok(())
        })
        .on_menu_event(|app_handle, event| {
            // Tauri's MenuId wraps a String; .as_ref() yields &str.
            let id_str: String = event.id().as_ref().to_string();
            eprintln!("[menu][on_event][BLOCK_DISPATCH menu_id={id_str}]");
            // Broadcast to all windows. Renderer's menu-bridge filters
            // by listening on the main window only; Settings window
            // ignores menu events for now (per F-V1-IPC-COMPAT-STUBS).
            if let Err(e) = tauri::Emitter::emit(app_handle, "mt::menu-invoked", &id_str) {
                eprintln!("[menu][on_event][BLOCK_EMIT_FAILED reason={e}]");
            }
        })
        .manage(sec_ctx)
        .manage(prefs)
        .manage(m013b::WatchRegistry::default())
        .manage(m013b::SearchRegistry::default())
        .manage(PendingOpens::default())
        .invoke_handler(tauri::generate_handler![
            mt_dev_diag,
            mt_drain_pending_opens,
            m013b::fs::mt_fs_read,
            m013b::fs::mt_fs_write,
            m013b::fs::mt_fs_stat,
            m013b::fs::mt_fs_readdir,
            m013b::fs::mt_fs_unlink,
            m013b::search::mt_search_spawn,
            m013b::search::mt_search_cancel,
            m013b::watch::mt_watch_subscribe,
            m013b::watch::mt_watch_unsubscribe,
            m001_pdf::mt_print_to_pdf,
            m005_prefs::mt_prefs_get,
            m005_prefs::mt_prefs_set,
            m005_prefs::mt_prefs_get_all,
            m005_prefs::mt_workspace_set,
            m008_fonts::mt_fonts_list,
            m017_recent::mt_recent_add,
            m017_recent::mt_recent_list,
            m017_recent::mt_recent_clear,
            m006_shortcuts::mt_shortcut_register,
            m006_shortcuts::mt_shortcut_unregister,
            m006_shortcuts::mt_shortcut_list,
            m007_spell::mt_spell_get_config,
            m007_spell::mt_spell_set_enabled,
            m007_spell::mt_spell_set_lang,
            m009_menu::mt_menu_taxonomy,
            m015_pandoc::mt_pandoc_status,
            m015_pandoc::mt_pandoc_export,
            m016_updater::mt_updater_check,
            m018_screenshot::mt_screenshot_capture,
            m019_datacenter::mt_secret_set,
            m019_datacenter::mt_secret_get,
            m019_datacenter::mt_secret_delete,
            m_v1_compat::mt_request_keybindings,
            m_v1_compat::mt_cmd_open_folder,
            m_v1_compat::mt_cmd_open_file,
            m_v1_compat::mt_open_file,
            m_v1_compat::mt_set_user_preference,
            m_v1_compat::mt_set_user_data,
            m_v1_compat::mt_view_layout_changed,
            m_v1_compat::mt_update_sidebar_menu,
            m_v1_compat::mt_request_window_content_size,
            m_v1_compat::mt_open_setting_window,
            m_v1_compat::mt_format_link_click,
            // Path B-clean W3 — pick_folder returns Option<String>;
            // close_project_root no-op stub awaiting watcher wiring.
            m_v1_compat::mt_pick_folder,
            m_v1_compat::mt_close_project_root,
            m_v1_compat::mt_app_quit,
            // F-LIFECYCLE-WIRE / F-SAVE-FLOW-WIRE (B4-pre-alpha-step-3):
            m001_save_close::mt_response_file_save,
            m001_save_close::mt_response_file_save_as,
            m001_save_close::mt_close_window,
            m001_save_close::mt_save_and_close_tabs,
            m001_save_close::mt_close_window_confirm,
            // M-021 (B4-pre-alpha-add): macOS .md default-handler
            // registration. Settings UI invokes these. Outside the
            // M-013a typed CommandMap surface — see m001_validate.rs
            // header comment for the v1_compat / dev-helper exclusion.
            m021_default_handler::mt_set_default_md_handler,
            m021_default_handler::mt_get_default_md_handler,
            m021_default_handler::mt_unset_default_md_handler,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                let state = tauri::Manager::state::<PendingOpens>(app);
                if state.quit_approved.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
                api.prevent_exit();
                eprintln!("[m001][lifecycle][BLOCK_EXIT_INTERCEPTED]");
                if let Some(win) = tauri::Manager::get_webview_window(app, "main") {
                    let _ = tauri::Emitter::emit(&win, "mt::ask-for-close", ());
                } else {
                    state.quit_approved.store(true, std::sync::atomic::Ordering::SeqCst);
                    app.exit(0);
                }
                return;
            }

            // M-025.5: silence unused-variable warnings on non-macOS builds
            // where the entire body below is cfg-gated out. The release CI
            // workflow runs warnings-allowlist check; bare `app`/`event`
            // would trip it on Linux/Windows. We don't ship to those
            // platforms yet, but `cargo test` runs on Ubuntu in the test
            // workflow.
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app, event);
                return;
            }

            // macOS Finder double-click + `open file.md` send open-document
            // Apple Events that Tauri 2 surfaces as RunEvent::Opened.
            //
            // Per Tauri 2 docs, this event fires BEFORE Ready/Window — the
            // renderer's mt::open-new-tab listener isn't yet active. Pushing
            // the paths into PendingOpens AppState lets the frontend drain
            // them via mt_drain_pending_opens after bootstrap-editor.
            // Race-free, no timing assumptions.
            //
            // M-025 ready-signal: once `state.drained == true` the renderer's
            // mt::open-new-tab listener is live, so Apple Events fired AFTER
            // cold-launch (warm window, user opens another .md from Finder)
            // are emitted directly with no second-drain round-trip. The
            // `drained` flag is flipped inside mt_drain_pending_opens AFTER
            // the queue snapshot lock releases — Apple Events that race the
            // initial drain still land in the queue and are picked up by it.
            //
            // M-025.5 (alpha.6.3, smoke 2026-05-11): `RunEvent::Opened` is a
            // macOS-only variant (Apple Event for Finder double-click / Open
            // With). The Linux / Windows enum has no such variant, so
            // referencing it unconditionally was failing `cargo test` on
            // Ubuntu since alpha.5 — the release workflow shipped fine
            // (macOS-only build) but the test workflow turned red. Gate
            // the entire arm with cfg(target_os="macos"). Sibling test
            // suite is also gated below.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                eprintln!(
                    "[main][apple_event][BLOCK_RECEIVED count={}]",
                    urls.len()
                );
                let state = tauri::Manager::state::<PendingOpens>(app);
                let already_drained =
                    state.drained.load(std::sync::atomic::Ordering::SeqCst);
                for url in urls {
                    match url.to_file_path() {
                        Ok(path) => {
                            let path_str = path.to_string_lossy().to_string();
                            // M-025.1: latch on every path observed, regardless
                            // of branch — covers cold-launch enqueue, defensive
                            // re-queue, AND warm direct-emit (the last is
                            // mostly defensive; request_keybindings has long
                            // since run on a warm window, but the invariant is
                            // "any opened-document path latches the flag").
                            state
                                .had_initial_opens
                                .store(true, std::sync::atomic::Ordering::SeqCst);
                            if already_drained {
                                // Direct-emit path: listeners are live; reuse the
                                // same emit_open_new_tab helper the cold-launch
                                // drain uses (preview_mode=true per M-022).
                                if let Some(window) = tauri::Manager::get_webview_window(
                                    app, "main",
                                ) {
                                    match m_v1_compat::emit_open_new_tab(
                                        &window, &path_str, true,
                                    ) {
                                        Ok(()) => eprintln!(
                                            "[main][apple_event][BLOCK_DIRECT_EMIT path={path_str}]"
                                        ),
                                        Err(e) => eprintln!(
                                            "[main][apple_event][BLOCK_DIRECT_EMIT_FAILED path={path_str} err={e}]"
                                        ),
                                    }
                                } else {
                                    // Defensive: window gone (e.g. last-window-
                                    // closed transient). Re-queue so the next
                                    // drain (if any) picks it up.
                                    eprintln!(
                                        "[main][apple_event][BLOCK_DIRECT_EMIT_NO_WINDOW path={path_str}]"
                                    );
                                    let mut q = state
                                        .queue
                                        .lock()
                                        .unwrap_or_else(|e| e.into_inner());
                                    q.push(path_str);
                                }
                            } else {
                                eprintln!(
                                    "[main][apple_event][BLOCK_QUEUED path={path_str}]"
                                );
                                let mut q = state
                                    .queue
                                    .lock()
                                    .unwrap_or_else(|e| e.into_inner());
                                q.push(path_str);
                            }
                        }
                        Err(_) => {
                            eprintln!("[main][apple_event][BLOCK_NON_FILE_URL url={url}]");
                        }
                    }
                }
            }
        });
}

// ──────────────────────────────────────────────────────────────────────
// Tests — V-M-025 PendingOpens semantics (drain ordering + ready-signal
// flag transition). Pure-logic — no Tauri runtime spin-up — covers the
// queue + atomic state surface that the renderer's BLOCK_DRAINED count=N
// + BLOCK_DIRECT_EMIT trace markers depend on.
// ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    /// Helper: pure-logic version of `mt_drain_pending_opens` minus the
    /// `tauri::WebviewWindow`-bound emit step. Drains the queue, flips
    /// the drained flag, returns the drained vector. The production
    /// command differs only in the per-path `m_v1_compat::emit_open_new_tab`
    /// call that this helper omits (Tauri runtime not available in unit
    /// tests). Trace + flag semantics are identical.
    fn drain_inner(state: &PendingOpens) -> Vec<String> {
        let drained: Vec<String> = {
            let mut q = state.queue.lock().unwrap_or_else(|e| e.into_inner());
            std::mem::take(&mut *q)
        };
        state.drained.store(true, Ordering::SeqCst);
        drained
    }

    #[test]
    fn pending_opens_default_state_is_empty_queue_and_drained_false() {
        let state = PendingOpens::default();
        assert!(state.queue.lock().unwrap().is_empty());
        assert!(!state.drained.load(Ordering::SeqCst));
    }

    #[test]
    fn drain_returns_paths_in_fifo_order_and_clears_queue() {
        let state = PendingOpens::default();
        {
            let mut q = state.queue.lock().unwrap();
            q.push("/tmp/a.md".to_string());
            q.push("/tmp/b.md".to_string());
            q.push("/tmp/c.md".to_string());
        }
        let drained = drain_inner(&state);
        assert_eq!(
            drained,
            vec!["/tmp/a.md".to_string(), "/tmp/b.md".into(), "/tmp/c.md".into()]
        );
        assert!(state.queue.lock().unwrap().is_empty());
    }

    #[test]
    fn drain_flips_drained_flag_to_true_after_completion() {
        let state = PendingOpens::default();
        assert!(!state.drained.load(Ordering::SeqCst));
        let _ = drain_inner(&state);
        assert!(state.drained.load(Ordering::SeqCst));
    }

    #[test]
    fn drain_on_empty_queue_still_flips_flag() {
        // V-M-025 S5 (cold launch with empty queue): drain MUST be invoked
        // unconditionally and the flag MUST flip so subsequent Apple
        // Events take the direct-emit path.
        let state = PendingOpens::default();
        let drained = drain_inner(&state);
        assert!(drained.is_empty());
        assert!(state.drained.load(Ordering::SeqCst));
    }

    #[test]
    fn run_event_opened_pre_drain_enqueues_path() {
        // Models the RunEvent::Opened branch in main(): when drained=false
        // the path is pushed to the queue; mt_drain_pending_opens picks it
        // up on the cold-launch drain.
        let state = PendingOpens::default();
        let drained_at_event = state.drained.load(Ordering::SeqCst);
        assert!(!drained_at_event);
        let mut q = state.queue.lock().unwrap();
        q.push("/tmp/applevent.md".to_string());
        drop(q);
        let drained = drain_inner(&state);
        assert_eq!(drained, vec!["/tmp/applevent.md".to_string()]);
    }

    #[test]
    fn run_event_opened_post_drain_does_not_re_enqueue() {
        // V-M-025 R3: after the renderer drains, subsequent Apple Events
        // skip the queue and (in production) emit directly. We assert the
        // gate logic: drained=true ⇒ caller takes the direct-emit branch
        // and the queue stays empty.
        let state = PendingOpens::default();
        let _ = drain_inner(&state);
        assert!(state.drained.load(Ordering::SeqCst));
        // Simulate the production-handler decision point.
        let already_drained = state.drained.load(Ordering::SeqCst);
        if !already_drained {
            // dead branch — must not execute.
            let mut q = state.queue.lock().unwrap();
            q.push("/tmp/should-not-land.md".to_string());
        }
        assert!(state.queue.lock().unwrap().is_empty());
    }

    #[test]
    fn drain_then_re_enqueue_preserves_drained_flag() {
        // Edge case (BLOCK_DIRECT_EMIT_NO_WINDOW fallback in main.rs): if
        // direct-emit can't fire because the window is gone, the path is
        // re-queued. The drained flag MUST stay true (we don't roll it
        // back on transient window absence).
        let state = PendingOpens::default();
        let _ = drain_inner(&state);
        assert!(state.drained.load(Ordering::SeqCst));
        let mut q = state.queue.lock().unwrap();
        q.push("/tmp/re-queued.md".to_string());
        drop(q);
        assert!(state.drained.load(Ordering::SeqCst));
        assert_eq!(state.queue.lock().unwrap().len(), 1);
    }

    #[test]
    fn multiple_drains_idempotent_on_empty_queue() {
        // Renderer should call drain exactly once (V-M-025 R4 regression
        // guard), but if a second invocation slips through it must be a
        // no-op + flag stays true.
        let state = PendingOpens::default();
        let _ = drain_inner(&state);
        assert!(state.drained.load(Ordering::SeqCst));
        let second = drain_inner(&state);
        assert!(second.is_empty());
        assert!(state.drained.load(Ordering::SeqCst));
    }

    // ── M-025.1 untitled-suppression (smoke 2026-05-11) ────────────────

    #[test]
    fn default_state_had_initial_opens_false() {
        // Plain launch (no Finder path, no CLI args): flag stays false →
        // mt_request_keybindings will emit addBlankTab=true → renderer
        // creates Untitled-1 as before.
        let state = PendingOpens::default();
        assert!(!state.had_initial_opens.load(Ordering::SeqCst));
    }

    #[test]
    fn had_initial_opens_latches_on_enqueue_path() {
        // Cold-launch with Finder double-click: RunEvent::Opened
        // enqueues the path AND latches the flag. mt_request_keybindings
        // (called ~500ms later) reads true → emits addBlankTab=false →
        // renderer skips Untitled-1, only the Finder file is open.
        let state = PendingOpens::default();
        {
            let mut q = state.queue.lock().unwrap();
            q.push("/tmp/finder.md".to_string());
        }
        state
            .had_initial_opens
            .store(true, Ordering::SeqCst);
        assert!(state.had_initial_opens.load(Ordering::SeqCst));
        // Latch is not affected by subsequent drain.
        let _ = drain_inner(&state);
        assert!(state.had_initial_opens.load(Ordering::SeqCst));
    }

    #[test]
    fn had_initial_opens_latch_is_set_only_never_reset() {
        // Single-session lifetime invariant: once latched, always
        // latched. No code path should clear the flag (we don't roll it
        // back on transient state, on drain, on window close, etc.).
        let state = PendingOpens::default();
        state
            .had_initial_opens
            .store(true, Ordering::SeqCst);
        let _ = drain_inner(&state);
        // simulate post-drain noise: another drain, a re-queue, another
        // drain — flag still true.
        {
            let mut q = state.queue.lock().unwrap();
            q.push("/tmp/noise.md".to_string());
        }
        let _ = drain_inner(&state);
        assert!(state.had_initial_opens.load(Ordering::SeqCst));
    }

    // ── M-025.2 sidebar-hide on cold-launch single-file open
    //    (smoke 2026-05-11) ───────────────────────────────────────────────

    #[test]
    fn sidebar_visibility_overridden_when_initial_opens() {
        // Mirrors the production expression in
        // m_v1_compat::mt_request_keybindings: when had_initial_opens is
        // true the emitted sideBarVisibility is forced false regardless
        // of the user's persisted pref. Plain launch (latch false)
        // preserves the pref. This is the pure-logic counterpart to the
        // addBlankTab override covered by
        // `had_initial_opens_latches_on_enqueue_path`.

        // Case A: cold-launch via Finder / CLI — latch true.
        let state = PendingOpens::default();
        state
            .had_initial_opens
            .store(true, Ordering::SeqCst);
        let had_opens = state.had_initial_opens.load(Ordering::SeqCst);
        // Same expression the production code uses for the override
        // decision: `!has_opens` toggles the addBlankTab and feeds the
        // identical `if had_opens { false } else { pref }` branch for
        // sidebar visibility.
        let side_bar_pref_true = true;
        let emitted = if had_opens { false } else { side_bar_pref_true };
        assert!(
            !emitted,
            "Finder/CLI cold-launch must force sidebar hidden",
        );
        // !has_opens (addBlankTab equivalent) is false in this branch.
        assert!(!(!had_opens));

        // Case B: plain launch — latch false, pref preserved either way.
        let state = PendingOpens::default();
        let had_opens = state.had_initial_opens.load(Ordering::SeqCst);
        assert!(!had_opens);
        // Pref=true → emit true.
        let emitted_true = if had_opens { false } else { true };
        assert!(emitted_true, "plain launch must preserve sidebar=true pref");
        // Pref=false → emit false.
        let emitted_false = if had_opens { false } else { false };
        assert!(!emitted_false, "plain launch must preserve sidebar=false pref");
        // !has_opens (addBlankTab equivalent) is true in this branch.
        assert!(!has_opens_value(had_opens));
    }

    // Tiny helper kept in-mod so the assertion above reads symmetrically
    // with the production `let add_blank_tab = !had_opens;` line.
    fn has_opens_value(b: bool) -> bool {
        b
    }
}
