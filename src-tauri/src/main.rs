// Prevent additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod dialog;
mod legacy;
mod migration_strings;

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
                // Phase-B-pre2 step-5 will gate store-init on this branch and
                // perform the actual migration via M-005. For now we just log
                // and let tauri::Builder proceed unmodified.
                eprintln!("[main][bootstrap][BLOCK_MIGRATION_CONTINUE]");
            }
            DialogChoice::Cancel => {
                // Phase-B-pre2 step-3 will persist {timestamp, app_version}
                // to mt_paths::cache_root().join("sessions.jsonl") and exit
                // with code 0 here. Until that microstep ships we log a
                // sentinel and continue so the user is never silently locked
                // out of their app by an incomplete pipeline.
                eprintln!("[main][bootstrap][BLOCK_MIGRATION_CANCEL_NOOP_PRE_STEP3]");
            }
        }
    } else {
        eprintln!("[main][bootstrap][BLOCK_NO_MIGRATION_NEEDED]");
    }

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
