// MODULE_CONTRACT
//   PURPOSE: Show a native-OS modal dialog (NSAlert on macOS, MessageBoxW on
//            Windows, GTK MessageDialog / xdg-portal on Linux) BEFORE
//            tauri::Builder takes over the runtime, asking the user whether
//            to migrate from a previously-installed Mark/MarkText namespace.
//
//   SCOPE: Dialog presentation only. The decision to show a dialog (i.e.
//          "did legacy::detect_layouts() find anything?") and the post-
//          decision migration logic both live elsewhere (M-005 mt-prefs).
//   DEPENDS: rfd 0.17 — wraps the platform-specific dialog APIs above; no
//            webview, no Tauri runtime, no NSApplication initialization
//            required (rfd lazily ensures the host UI process is set up).
//          : crate::migration_strings — locale-resolved strings for the
//            dialog body and buttons.
//   LINKS: M-001 mt-tauri-shell (call site), M-005 mt-prefs (consumer of
//          the resulting DialogChoice), Phase-B-pre2 step-2.
//   LOG MARKERS: [dialog][ask_migration][BLOCK_DIALOG_OPEN],
//                [dialog][ask_migration][BLOCK_DIALOG_CLOSED choice=...].

use crate::migration_strings::MigrationStrings;
use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DialogChoice {
    Continue,
    Cancel,
}

/// Convert an rfd result into our binary choice. Pure mapping function;
/// kept separate from `ask_migration` so it is exercisable by unit tests
/// without spawning a real native dialog.
pub fn map_result(result: &MessageDialogResult, continue_label: &str) -> DialogChoice {
    match result {
        // OkCancelCustom returns Custom(label) for the chosen button.
        MessageDialogResult::Custom(label) if label == continue_label => DialogChoice::Continue,
        // Some platforms map default OK/Cancel even when custom labels are set.
        MessageDialogResult::Ok | MessageDialogResult::Yes => DialogChoice::Continue,
        _ => DialogChoice::Cancel,
    }
}

/// Show the native migration dialog and block until the user answers.
/// MUST be called on the main thread on macOS (NSAlert requirement).
///
/// `body` is passed in as a runtime parameter rather than read from
/// `strings.body` so the caller can append the rate-limit hint when
/// recent-cancel count crosses the threshold (Phase-B-pre2 step-4).
/// Pass `strings.body` verbatim for the default case.
///
/// Side effects: opens a modal window. Emits stable log markers around the
/// open/close transitions so V-M-005 trace assertions can fire.
pub fn ask_migration(strings: &MigrationStrings, body: &str) -> DialogChoice {
    eprintln!("[dialog][ask_migration][BLOCK_DIALOG_OPEN]");

    let result = MessageDialog::new()
        .set_level(MessageLevel::Info)
        .set_title(strings.title)
        .set_description(body)
        .set_buttons(MessageButtons::OkCancelCustom(
            strings.continue_label.to_string(),
            strings.cancel_label.to_string(),
        ))
        .show();

    let choice = map_result(&result, strings.continue_label);

    eprintln!(
        "[dialog][ask_migration][BLOCK_DIALOG_CLOSED choice={:?}]",
        choice
    );

    choice
}

/// Single-button error dialog. Used by M-001 BLOCK_VALIDATE_AGAINST_FIXTURE
/// and the panic hook (B1 step-10). Title is shown in the OS dialog
/// chrome; description carries the diagnostic body. Always returns —
/// never panics — so callers can decide their own exit code.
pub fn ask_native_error(title: &str, body: &str) {
    eprintln!("[dialog][ask_native_error][BLOCK_DIALOG_OPEN title={title}]");
    let _ = MessageDialog::new()
        .set_level(MessageLevel::Error)
        .set_title(title)
        .set_description(body)
        .set_buttons(MessageButtons::Ok)
        .show();
    eprintln!("[dialog][ask_native_error][BLOCK_DIALOG_CLOSED]");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_result_custom_continue_label_returns_continue() {
        let r = MessageDialogResult::Custom("Continue".to_string());
        assert_eq!(map_result(&r, "Continue"), DialogChoice::Continue);
    }

    #[test]
    fn map_result_custom_cancel_label_returns_cancel() {
        let r = MessageDialogResult::Custom("Cancel".to_string());
        assert_eq!(map_result(&r, "Continue"), DialogChoice::Cancel);
    }

    #[test]
    fn map_result_ok_returns_continue() {
        let r = MessageDialogResult::Ok;
        assert_eq!(map_result(&r, "Continue"), DialogChoice::Continue);
    }

    #[test]
    fn map_result_yes_returns_continue() {
        let r = MessageDialogResult::Yes;
        assert_eq!(map_result(&r, "Continue"), DialogChoice::Continue);
    }

    #[test]
    fn map_result_cancel_returns_cancel() {
        let r = MessageDialogResult::Cancel;
        assert_eq!(map_result(&r, "Continue"), DialogChoice::Cancel);
    }

    #[test]
    fn map_result_no_returns_cancel() {
        let r = MessageDialogResult::No;
        assert_eq!(map_result(&r, "Continue"), DialogChoice::Cancel);
    }

    #[test]
    fn map_result_custom_unknown_label_returns_cancel() {
        // A custom label that matches neither continue_label nor any of the
        // canonical Ok/Yes results must default to Cancel — the safe choice
        // when the user closes the dialog via window-X or unexpected path.
        let r = MessageDialogResult::Custom("Maybe Later".to_string());
        assert_eq!(map_result(&r, "Continue"), DialogChoice::Cancel);
    }

    #[test]
    fn map_result_localized_continue_label_returns_continue() {
        // Verify the matcher works with non-ASCII labels (RU, ZH-CN, etc.).
        let r = MessageDialogResult::Custom("Продолжить".to_string());
        assert_eq!(map_result(&r, "Продолжить"), DialogChoice::Continue);

        let r = MessageDialogResult::Custom("继续".to_string());
        assert_eq!(map_result(&r, "继续"), DialogChoice::Continue);
    }
}
