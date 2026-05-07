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
mod m010_security;
mod m014_encoding;
mod m015_pandoc;
mod m016_updater;
mod m017_recent;
mod m018_screenshot;
mod m019_datacenter;
mod m020_cli;
mod m013b;
mod m_v1_compat;
mod m005_migrate;
mod migration_strings;
mod mt_paths;
mod prefs;
mod snapshot;

use dialog::DialogChoice;

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

    // Phase-B-pre2 step-2: if any legacy namespace was detected, ask the user
    // (via a native-OS modal — NSAlert / MessageBoxW / GTK MessageDialog,
    // never a Tauri webview) whether to migrate. Strings are locale-resolved
    // from sys_locale; en_US is the universal fallback.
    if layouts.any_detected() && !skip_migration && !migration_already_done {
        let strings = migration_strings::detect();

        // Phase-B-pre2 step-4: count recent cancels in the last 7 days.
        // If the user has cancelled 3+ times we augment the dialog body
        // with a rate-limit hint pointing to docs / cancel history /
        // opt-out env var. Never force-migrates, never blocks the dialog.
        let recent_cancels: usize = mt_paths::cache_root()
            .map(|cr| cancel_log::count_recent_cancels(&cr, 7 * 86400))
            .unwrap_or(0);
        eprintln!(
            "[main][bootstrap][BLOCK_RECENT_CANCELS_COUNTED count={recent_cancels}]"
        );
        let body_text: String = if recent_cancels >= 3 {
            eprintln!("[main][bootstrap][BLOCK_RATE_LIMIT_HINT_ATTACHED]");
            format!("{}\n\n{}", strings.body, strings.rate_limit_hint)
        } else {
            strings.body.to_string()
        };

        let choice = dialog::ask_migration(&strings, &body_text);
        eprintln!("[main][bootstrap][BLOCK_DIALOG_CHOICE choice={:?}]", choice);

        match choice {
            DialogChoice::Continue => {
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
                        // Step-9: surface a one-shot success dialog only
                        // when at least one migrator did real work
                        // (Migrated{...}). Re-runs that hit AlreadyDone /
                        // NoSourceFile across the board are silent — no
                        // user-visible noise on every boot.
                        let did_migrate = matches!(
                            summary.preferences,
                            Some(m005_migrate::PreferencesMigrationOutcome::Migrated { .. })
                        ) || matches!(
                            summary.data_center,
                            Some(m005_migrate::DataCenterMigrationOutcome::Migrated { .. })
                        ) || matches!(
                            summary.keybindings,
                            Some(m005_migrate::KeybindingsMigrationOutcome::Migrated { .. })
                        ) || matches!(
                            summary.recent_docs,
                            Some(m005_migrate::RecentDocsMigrationOutcome::Migrated { .. })
                        ) || summary
                            .keychain
                            .as_ref()
                            .map(|k| k.renamed > 0)
                            .unwrap_or(false);
                        if did_migrate {
                            let prefs_n = match &summary.preferences {
                                Some(m005_migrate::PreferencesMigrationOutcome::Migrated { keys_migrated, .. }) => *keys_migrated,
                                _ => 0,
                            };
                            let dc_n = match &summary.data_center {
                                Some(m005_migrate::DataCenterMigrationOutcome::Migrated { keys_migrated, .. }) => *keys_migrated,
                                _ => 0,
                            };
                            let kb_n = match &summary.keybindings {
                                Some(m005_migrate::KeybindingsMigrationOutcome::Migrated { keys_migrated, .. }) => *keys_migrated,
                                _ => 0,
                            };
                            let recent_n = match &summary.recent_docs {
                                Some(m005_migrate::RecentDocsMigrationOutcome::Migrated { keys_migrated, .. }) => *keys_migrated,
                                _ => 0,
                            };
                            let kc_n = summary.keychain.as_ref().map(|k| k.renamed).unwrap_or(0);
                            dialog::ask_native_info(
                                "Mark — settings migrated from Mark Text v1.x",
                                &format!(
                                    "Your data has been imported successfully:\n\n\
                                     • Preferences: {prefs_n} keys\n\
                                     • Image-uploader configs: {dc_n} keys\n\
                                     • Custom shortcuts: {kb_n}\n\
                                     • Recent files: {recent_n}\n\
                                     • Keychain entries: {kc_n}\n\n\
                                     Your original Mark Text v1.x data in ~/Library/Application Support/marktext is unchanged — \
                                     this migration only copied settings into Mark's new storage location.",
                                ),
                            );
                        }
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
            DialogChoice::Cancel => {
                // Phase-B-pre2 step-3: persist a JSONL record to
                // mt_paths::cache_root().join("sessions.jsonl") (outside
                // Application Support per plan) and exit with code 0 so the
                // user is never force-migrated. step-4 reads this file to
                // rate-limit the dialog after 3+ cancels in 7 days.
                let record = cancel_log::CancelRecord::new_now(env!("CARGO_PKG_VERSION"));
                match mt_paths::cache_root() {
                    Some(cache_root) => match cancel_log::append_record(&cache_root, &record) {
                        Ok(()) => eprintln!(
                            "[main][bootstrap][BLOCK_MIGRATION_CANCEL_PERSISTED ts_unix={} version={}]",
                            record.ts_unix, record.app_version
                        ),
                        Err(e) => eprintln!(
                            "[main][bootstrap][BLOCK_MIGRATION_CANCEL_PERSIST_FAILED reason={}]",
                            e
                        ),
                    },
                    None => eprintln!(
                        "[main][bootstrap][BLOCK_MIGRATION_CANCEL_NO_CACHE_ROOT]"
                    ),
                }
                eprintln!("[main][bootstrap][BLOCK_MIGRATION_CANCEL_EXIT_0]");
                std::process::exit(0);
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

    tauri::Builder::default()
        // F-UPDATER-WIRE-PLUGIN: tauri-plugin-updater wires the
        // ed25519-signed feed at endpoints[] in tauri.conf.json. The
        // plugin verifies signatures against pubkey before downloading
        // anything. Renderer calls via @tauri-apps/plugin-updater
        // (M-016 mt_updater_check now proxies to the plugin).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(sec_ctx)
        .manage(prefs)
        .manage(m013b::WatchRegistry::default())
        .manage(m013b::SearchRegistry::default())
        .invoke_handler(tauri::generate_handler![
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
            m_v1_compat::mt_window_state,
            m_v1_compat::mt_request_keybindings,
            m_v1_compat::mt_cmd_open_folder,
            m_v1_compat::mt_cmd_open_file,
            m_v1_compat::mt_ask_for_open_project_in_sidebar,
            m_v1_compat::mt_open_file,
            m_v1_compat::mt_ask_for_user_preference,
            m_v1_compat::mt_ask_for_user_data,
            m_v1_compat::mt_set_user_preference,
            m_v1_compat::mt_set_user_data,
            m_v1_compat::mt_get_current_language,
            m_v1_compat::mt_view_layout_changed,
            m_v1_compat::mt_update_sidebar_menu,
            m_v1_compat::mt_request_window_content_size,
            m_v1_compat::mt_open_setting_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
