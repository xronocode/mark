// Prevent additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod legacy;
mod migration_strings;

fn main() {
    // Phase-B-pre2 step-1: detect pre-existing electron-store layouts BEFORE
    // tauri::Builder takes ownership of the runtime. Read-only at this stage —
    // migration decisions are deferred to M-005 mt-prefs.
    let layouts = legacy::detect_layouts();
    legacy::log_detection(&layouts);

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
