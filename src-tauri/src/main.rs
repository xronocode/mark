// Prevent additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cancel_log;
mod dialog;
mod legacy;
mod migration_strings;
mod mt_paths;
mod prefs;

use dialog::DialogChoice;

fn main() {
    // Phase-B-pre2 step-1: detect pre-existing electron-store layouts BEFORE
    // tauri::Builder takes ownership of the runtime. Read-only at this stage —
    // migration decisions and writes are deferred to M-005 mt-prefs.
    let layouts = legacy::detect_layouts();
    legacy::log_detection(&layouts);

    // Phase-B-pre2 step-2: if any legacy namespace was detected, ask the user
    // (via a native-OS modal — NSAlert / MessageBoxW / GTK MessageDialog,
    // never a Tauri webview) whether to migrate. Strings are locale-resolved
    // from sys_locale; en_US is the universal fallback.
    if layouts.any_detected() {
        let strings = migration_strings::detect();
        let choice = dialog::ask_migration(&strings);
        eprintln!("[main][bootstrap][BLOCK_DIALOG_CHOICE choice={:?}]", choice);

        match choice {
            DialogChoice::Continue => {
                eprintln!("[main][bootstrap][BLOCK_MIGRATION_CONTINUE]");
                // Phase-B-pre2 step-6: M-005 stub gate. Until Phase-B3
                // ships real migration logic, the stub refuses to run
                // when any legacy namespace is still present. Step-5
                // will introduce the snapshot+preflight path that
                // moves legacy data out of Application Support before
                // this gate runs, at which point Continue can succeed.
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

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
