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
mod m010_security;
mod m013b;
mod migration_strings;
mod mt_paths;
mod prefs;
mod snapshot;

use dialog::DialogChoice;

fn main() {
    // Phase-B1 step-10: install panic hook FIRST. Before legacy
    // detection, before security audit, before contract validation —
    // any panic in any of those paths must produce a crash log + dialog
    // rather than a zombie process. V-M-001 hard requirement.
    m001_panic::install_panic_hook();

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

    // Phase-B-pre2 step-2: if any legacy namespace was detected, ask the user
    // (via a native-OS modal — NSAlert / MessageBoxW / GTK MessageDialog,
    // never a Tauri webview) whether to migrate. Strings are locale-resolved
    // from sys_locale; en_US is the universal fallback.
    if layouts.any_detected() && !skip_migration {
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

                // Phase-B-pre2 step-6: M-005 stub gate. Even after the
                // preflight snapshot, the stub still refuses to run
                // because real migration hasn't shipped — original
                // legacy data is still present. Phase-B3 will replace
                // this stub with the real migration that consumes the
                // snapshot and clears the original.
                if let Err(marker) = prefs::init(&layouts) {
                    eprintln!(
                        "[prefs][init][{marker}] legacy still present; M-005 stub refuses bootstrap until B3 ships real migration"
                    );
                    eprintln!("[main][bootstrap][BLOCK_PREFS_STUB_ABORT marker={marker}]");
                    std::process::exit(1);
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
    tauri::Builder::default()
        .manage(m013b::SecurityCtx::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
