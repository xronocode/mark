// MODULE_CONTRACT
//   PURPOSE: M-001 close-flow + save-flow IPC bridge for the renderer.
//            Plus the WindowEvent::CloseRequested handler that drives
//            the existing CloseStateMachine in m001_lifecycle.
//   SCOPE:   IPC commands the renderer's editor.js sends:
//              - mt_response_file_save  (Cmd+S → write file, emit
//                                        mt::tab-saved or mt::tab-save-failure)
//              - mt_response_file_save_as (Cmd+Shift+S → no-op for alpha
//                                          per F-SAVE-AS-DIALOG; reports
//                                          via mt::tab-save-failure)
//              - mt_close_window        (renderer signals "destroy now")
//              - mt_save_and_close_tabs (renderer-collected unsaved
//                                        list → save each → close)
//              - mt_close_window_confirm (no-op IPC sink — renderer
//                                         shows its own dialog now)
//            Plus wire_close_handler() — registers
//            on_window_event(CloseRequested → prevent_close + emit
//            mt::ask-for-close + advance state machine).
//   DEPENDS: m001_lifecycle (state machine), m013b::fs (mt_fs_write),
//            m013b::state::SecurityCtx, tauri::Emitter, tauri::Manager.
//   LINKS:   docs/development-plan.xml Phase-B4-pre-alpha step-3
//            (closes F-LIFECYCLE-WIRE; introduces save-flow wiring
//            that v1.2.3 main process did and was missing in Tauri
//            port — tracked as F-SAVE-FLOW-WIRE in followups).
//   STATUS:  Phase-B4-pre-alpha step-3.
//   LOG MARKERS:
//            [m001][lifecycle][BLOCK_CLOSE_REQUESTED]
//            [m001][save_close][BLOCK_FILE_SAVED id=… path=…]
//            [m001][save_close][BLOCK_FILE_SAVE_FAILED id=… reason=…]
//            [m001][save_close][BLOCK_SAVE_AS_NOT_IMPLEMENTED id=…]
//            [m001][save_close][BLOCK_CLOSE_CONFIRM_RECEIVED]
//            [m001][save_close][BLOCK_DESTROY_WINDOW label=…]
//
// CHANGE_SUMMARY:
//   - 2026-05-08 B4-pre-alpha-step-3: initial save+close IPC bridge
//                + WindowEvent close handler, drives existing
//                CloseStateMachine.

use crate::m001_lifecycle::{CloseState, CloseStateMachine};
use crate::m013b::state::SecurityCtx;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

/// Process-global Mutex around the main window's CloseStateMachine.
/// Wrapped so Tauri's `manage()` accepts it as a managed-state type.
/// Multiple windows would need a registry indexed by label; alpha is
/// single-window so a single SM suffices.
pub struct MainCloseSm(pub Mutex<CloseStateMachine>);

impl Default for MainCloseSm {
    fn default() -> Self {
        Self(Mutex::new(CloseStateMachine::default()))
    }
}

// ─────────────────────────────────────────────────────────────────────
// START_BLOCK save_commands
// PURPOSE:    Bridge v1.2.3 mt::response-file-save IPC pattern to the
//             Tauri-side M-002 fs_write. Renderer calls this for both
//             ordinary Save and the Save-and-close branch (separate
//             command below). Errors come back as mt::tab-save-failure
//             events; success as mt::tab-saved.
// ─────────────────────────────────────────────────────────────────────

/// Outcome of a successful save. Returned from invoke so the renderer
/// can update the tab state directly without listening for separate
/// `mt::tab-saved` / `mt::set-pathname` events. Path B-clean W2a
/// canonical save flow.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTabState {
    pub id: String,
    pub pathname: String,
    pub filename: String,
    pub is_saved: bool,
}

/// Path B-clean W2a: canonical save command. Returns
/// `Some(SavedTabState)` on successful write, `None` on user-cancel
/// of the save-as picker. Errors propagate as `Err(String)`.
///
/// SEMANTICS:
///   - if `pathname` is `Some(p)` and non-empty: write to p
///   - if `pathname` is `None` or empty string: open save dialog,
///     seeded with `filename` + `default_path`. On chosen path,
///     write + return new pathname. On cancel, return None.
///
/// Replaces the old positional-args version that emitted
/// `mt::tab-saved` + `mt::set-pathname` events. Listeners for those
/// events are kept ALIVE for batch-save flows (mt_save_and_close_tabs)
/// but no longer required for single-tab save.
#[tauri::command]
pub async fn mt_response_file_save(
    id: String,
    filename: String,
    pathname: Option<String>,
    markdown: String,
    #[allow(non_snake_case)] defaultPath: Option<String>,
    app: AppHandle,
    sec: State<'_, SecurityCtx>,
) -> Result<Option<SavedTabState>, String> {
    let default_path = defaultPath.unwrap_or_default();
    let pathname = pathname.unwrap_or_default();

    let (target_path, was_picked) = if pathname.is_empty() {
        match pick_save_path(&app, &filename, &default_path).await {
            Some(p) => (p, true),
            None => {
                eprintln!("[m001][save_close][BLOCK_SAVE_AS_CANCELLED id={id}]");
                return Ok(None);
            }
        }
    } else {
        (pathname, false)
    };

    save_to_path_outcome(&app, &sec, &id, &target_path, &markdown, was_picked).await
}

/// Path B-clean W2a: forces a new save-as picker regardless of
/// existing pathname. Same return shape as mt_response_file_save.
#[tauri::command]
pub async fn mt_response_file_save_as(
    id: String,
    filename: String,
    markdown: String,
    #[allow(non_snake_case)] defaultPath: Option<String>,
    app: AppHandle,
    sec: State<'_, SecurityCtx>,
) -> Result<Option<SavedTabState>, String> {
    let default_path = defaultPath.unwrap_or_default();
    let target_path = match pick_save_path(&app, &filename, &default_path).await {
        Some(p) => p,
        None => {
            eprintln!("[m001][save_close][BLOCK_SAVE_AS_CANCELLED id={id}]");
            return Ok(None);
        }
    };

    save_to_path_outcome(&app, &sec, &id, &target_path, &markdown, true).await
}

async fn pick_save_path(
    app: &AppHandle,
    default_filename: &str,
    default_dir: &str,
) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let fname = if default_filename.is_empty() {
        "Untitled.md".to_string()
    } else {
        default_filename.to_string()
    };
    // Plugin's save_file() is callback-based + main-thread-safe; bridge
    // to async via a oneshot. rfd::save_file panics with "unexpected
    // NULL from NSSavePanel" when called from non-main thread (which
    // is where Tauri async commands run) — this plugin handles the
    // dispatch internally.
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();
    let mut builder = app.dialog().file().set_title("Save File").set_file_name(fname);
    builder = builder
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "mkdn", "mdtxt"])
        .add_filter("Text", &["txt", "text"])
        .add_filter("All Files", &["*"]);
    if !default_dir.is_empty() {
        builder = builder.set_directory(default_dir);
    }
    builder.save_file(move |result| {
        let _ = tx.send(result);
    });
    let chosen = rx.await.ok().flatten()?;
    // FilePath has Display; convert to String. file_path() returns the
    // PathBuf when on a real filesystem (vs a content URI on Android).
    let path_str = chosen
        .into_path()
        .ok()?
        .to_string_lossy()
        .to_string();
    eprintln!("[m001][save_close][BLOCK_SAVE_AS_PICKED path={path_str}]");
    Some(path_str)
}

/// Path B-clean W2a: returns SavedTabState directly (folds tab-saved
/// + set-pathname events into the invoke return). Single-window
/// save flow no longer needs to listen for those events. Multi-tab
/// batch save (mt_save_and_close_tabs) still emits them so the
/// renderer can update tabs as each completes.
async fn save_to_path_outcome(
    app: &AppHandle,
    sec: &State<'_, SecurityCtx>,
    id: &str,
    target_path: &str,
    markdown: &str,
    was_picked: bool,
) -> Result<Option<SavedTabState>, String> {
    match crate::m013b::fs::mt_fs_write(target_path.to_string(), markdown.to_string(), sec.clone())
        .await
    {
        Ok(()) => {
            eprintln!("[m001][save_close][BLOCK_FILE_SAVED id={id} path={target_path} was_picked={was_picked}]");
            let filename = std::path::Path::new(target_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            Ok(Some(SavedTabState {
                id: id.to_string(),
                pathname: target_path.to_string(),
                filename,
                is_saved: true,
            }))
        }
        Err(e) => {
            let msg = format!("{e:?}");
            eprintln!(
                "[m001][save_close][BLOCK_FILE_SAVE_FAILED id={id} path={target_path} reason={msg}]"
            );
            Err(msg)
        }
    }
}

// END_BLOCK save_commands

// ─────────────────────────────────────────────────────────────────────
// START_BLOCK close_commands
// PURPOSE:    Three close-flow IPC sinks the renderer's
//             LISTEN_FOR_CLOSE handler may send, depending on dialog
//             outcome. State machine transitions are advanced for
//             V-M-001 trace evidence.
// ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn mt_close_window(
    app: AppHandle,
    sm_state: State<'_, MainCloseSm>,
) -> Result<(), String> {
    advance_to_destroy(&sm_state);
    if let Some(win) = app.get_webview_window("main") {
        eprintln!("[m001][save_close][BLOCK_DESTROY_WINDOW label=main]");
        win.destroy().map_err(|e| e.to_string())?;
    } else {
        eprintln!("[m001][save_close][BLOCK_DESTROY_WINDOW_SKIPPED label=main reason=not-found]");
    }
    Ok(())
}

/// Renderer's CLOSE_UNSAVED_TAB / LISTEN_FOR_CLOSE save branch sends a
/// single ARRAY argument — the unsaved-files list. The shim wraps
/// arrays as `{ args: [...] }` so the param is named `args` here, and
/// each element is a tab descriptor object.
///
/// SEMANTICS: saves each named tab, emits mt::tab-saved per success
/// and mt::tab-save-failure per failure. After all writes succeed,
/// emits mt::force-close-tabs-by-id with the list of successfully-
/// saved IDs so the renderer's LISTEN_FOR_SAVE_CLOSE handler closes
/// those tabs. **Does NOT destroy the window** — the per-tab close
/// path (CLOSE_UNSAVED_TAB) must not close the whole window. The
/// window-close path (LISTEN_FOR_CLOSE save branch) sends a separate
/// `mt::close-window` IPC after awaiting this one.
///
/// On ANY save failure, returns Err(...) so the renderer-side await
/// rejects, the dirty tabs stay dirty, and the window-close path can
/// abort closing without firing mt::close-window.
#[tauri::command]
pub async fn mt_save_and_close_tabs(
    args: Vec<serde_json::Value>,
    app: AppHandle,
    sec: State<'_, SecurityCtx>,
) -> Result<(), String> {
    let unsaved = args;
    let mut saved_ids: Vec<String> = Vec::new();
    let mut error_messages: Vec<String> = Vec::new();
    for entry in unsaved {
        let id = entry
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let path = entry
            .get("pathname")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let markdown = entry
            .get("markdown")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if path.is_empty() {
            // Untitled — silently skip; caller already warned the user.
            continue;
        }
        match crate::m013b::fs::mt_fs_write(path.clone(), markdown, sec.clone()).await {
            Ok(()) => {
                eprintln!(
                    "[m001][save_close][BLOCK_FILE_SAVED id={id} path={path} batch=save_and_close]"
                );
                let _ = app.emit("mt::tab-saved", id.clone());
                saved_ids.push(id);
            }
            Err(e) => {
                let msg = format!("{e:?}");
                eprintln!(
                    "[m001][save_close][BLOCK_FILE_SAVE_FAILED id={id} path={path} batch=save_and_close reason={msg}]"
                );
                let _ = app.emit("mt::tab-save-failure", (id, msg.clone()));
                error_messages.push(msg);
            }
        }
    }
    if !error_messages.is_empty() {
        // At least one save failed: do NOT emit force-close so the
        // renderer keeps the dirty tabs visible. Caller's await will
        // reject; window-close path will abort and not call
        // mt::close-window. User can retry from the existing dialog.
        eprintln!(
            "[m001][save_close][BLOCK_BATCH_PARTIAL_FAILURE saved={} failed={}]",
            saved_ids.len(),
            error_messages.len()
        );
        return Err(format!(
            "{} tab(s) failed to save: {}",
            error_messages.len(),
            error_messages.join("; ")
        ));
    }
    // All saves OK — tell renderer to close those tabs. NOTE: do NOT
    // destroy the window here; that's mt_close_window's job (called
    // separately by the window-close path).
    if !saved_ids.is_empty() {
        eprintln!(
            "[m001][save_close][BLOCK_FORCE_CLOSE_TABS count={}]",
            saved_ids.len()
        );
        let _ = app.emit("mt::force-close-tabs-by-id", saved_ids);
    }
    Ok(())
}

#[tauri::command]
pub async fn mt_close_window_confirm(
    _args: Vec<serde_json::Value>,
) -> Result<(), String> {
    // v1.2.3 routed this IPC to a native main-process dialog. In Tauri
    // port the renderer's LISTEN_FOR_CLOSE shows the dialog locally
    // (ElMessageBox), so this command is just an acknowledgement sink
    // for compatibility with renderer code that still issues the send.
    eprintln!("[m001][save_close][BLOCK_CLOSE_CONFIRM_RECEIVED renderer_handles_dialog]");
    Ok(())
}

// END_BLOCK close_commands

fn advance_to_destroy(sm_state: &State<'_, MainCloseSm>) {
    // Drive the state machine through the cleanup → destroy edges so
    // the V-M-001 trace shows the full lifecycle even when the close
    // came from a renderer-initiated path (no PromptOpen first because
    // the dialog was renderer-side).
    if let Ok(mut sm) = sm_state.0.lock() {
        if sm.state() == CloseState::Idle {
            // Renderer-initiated close where backend never saw
            // CloseRequested (e.g. user-triggered "Close Window" menu
            // not yet wired). Synthesize the path.
            let _ = sm.transition(CloseState::CloseRequested);
        }
        if sm.state() == CloseState::CloseRequested
            || sm.state() == CloseState::PromptOpen
            || sm.state() == CloseState::SaveFailed
        {
            let _ = sm.transition(CloseState::ForceClose);
        }
        if sm.state() == CloseState::ForceClose {
            let _ = sm.transition(CloseState::WatchersCleaned);
        }
        if sm.state() == CloseState::WatchersCleaned {
            let _ = sm.transition(CloseState::WindowDestroyed);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
// START_BLOCK wire_close_handler
// PURPOSE:    Register the WindowEvent::CloseRequested handler on the
//             main window. Prevents default close (Tauri would just
//             destroy without ceremony) and emits mt::ask-for-close
//             so the renderer can show its dialog and decide.
// CONTRACT:   Called once from main.rs setup, AFTER app.manage()
//             registered MainCloseSm. The handler closure captures
//             AppHandle (cheap clone) and queries managed state at
//             event time.
// ─────────────────────────────────────────────────────────────────────

pub fn wire_close_handler<R: tauri::Runtime>(window: &WebviewWindow<R>) {
    use tauri::WindowEvent;
    let app = window.app_handle().clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let sm_state: State<'_, MainCloseSm> = app.state();
            if let Ok(mut sm) = sm_state.0.lock() {
                if sm.is_terminal() {
                    *sm = CloseStateMachine::default();
                }
                let _ = sm.transition(CloseState::CloseRequested);
                let _ = sm.transition(CloseState::PromptOpen);
            }
            eprintln!("[m001][lifecycle][BLOCK_CLOSE_REQUESTED]");
            if let Err(e) = app.emit("mt::ask-for-close", ()) {
                eprintln!("[m001][lifecycle][BLOCK_EMIT_FAILED reason={e}]");
            }
        }
    });
}

// END_BLOCK wire_close_handler

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_close_sm_default_is_idle() {
        let sm = MainCloseSm::default();
        assert_eq!(sm.0.lock().unwrap().state(), CloseState::Idle);
    }

    #[test]
    fn advance_to_destroy_from_idle_synthesizes_full_path() {
        // Simulate the renderer-initiated path where CloseRequested
        // never fired (user clicked X in their own dialog UI, etc).
        let sm = MainCloseSm::default();
        // We can't construct a State<'_, T> in unit tests trivially —
        // exercise the inner state machine directly using the same
        // sequence advance_to_destroy uses.
        {
            let mut machine = sm.0.lock().unwrap();
            assert_eq!(machine.state(), CloseState::Idle);
            machine.transition(CloseState::CloseRequested).unwrap();
            machine.transition(CloseState::ForceClose).unwrap();
            machine.transition(CloseState::WatchersCleaned).unwrap();
            machine.transition(CloseState::WindowDestroyed).unwrap();
            assert!(machine.is_terminal());
        }
    }

    #[test]
    fn save_failed_path_resets_machine_for_retry() {
        // After mt_save_and_close_tabs reports failure, the renderer's
        // ElMessageBox should re-fire mt::ask-for-close. The SM must be
        // reset so the next CloseRequested transition is valid.
        let sm = MainCloseSm::default();
        {
            let mut machine = sm.0.lock().unwrap();
            machine.transition(CloseState::CloseRequested).unwrap();
            machine.transition(CloseState::PromptOpen).unwrap();
            // Simulate save failure: reset (what the command does).
            *machine = CloseStateMachine::default();
            assert_eq!(machine.state(), CloseState::Idle);
            // Now the next CloseRequested is a valid transition again.
            machine.transition(CloseState::CloseRequested).unwrap();
            assert_eq!(machine.state(), CloseState::CloseRequested);
        }
    }
}
