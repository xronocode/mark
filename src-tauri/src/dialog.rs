// MODULE_CONTRACT
//   PURPOSE: Show a native-OS modal dialog (NSAlert on macOS, MessageBoxW on
//            Windows, GTK MessageDialog / xdg-portal on Linux) BEFORE
//            tauri::Builder takes over the runtime, for hard boot failures
//            (security audit, contract validation, panic hook).
//
//   SCOPE: Dialog presentation only; single-button error/info shapes.
//   DEPENDS: rfd 0.17 — wraps the platform-specific dialog APIs above; no
//            webview, no Tauri runtime, no NSApplication initialization
//            required (rfd lazily ensures the host UI process is set up).
//   LINKS: M-001 mt-tauri-shell (call sites: m001_security, m001_validate,
//          m001_panic). C-13 retired the migration dialog
//          (ask_migration/map_result/DialogChoice) and the dead
//          ask_native_info summary dialog along with the m005 pipeline.
//   LOG MARKERS: [dialog][ask_native_error][BLOCK_DIALOG_OPEN/CLOSED].

use rfd::{MessageButtons, MessageDialog, MessageLevel};

/// Single-button error dialog. Used by M-001 BLOCK_VALIDATE_AGAINST_FIXTURE
/// and the panic hook (B1 step-10). Title is shown in the OS dialog
/// chrome; description carries the diagnostic body. Always returns —
/// never panics — so callers can decide their own exit code.
pub fn ask_native_error(title: &str, body: &str) {
    safe_eprintln!("[dialog][ask_native_error][BLOCK_DIALOG_OPEN title={title}]");
    let _ = MessageDialog::new()
        .set_level(MessageLevel::Error)
        .set_title(title)
        .set_description(body)
        .set_buttons(MessageButtons::Ok)
        .show();
    safe_eprintln!("[dialog][ask_native_error][BLOCK_DIALOG_CLOSED]");
}

