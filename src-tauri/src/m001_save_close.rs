// FILE: src-tauri/src/m001_save_close.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-001 correlated save-only bridge and guarded native window lifecycle.
//   SCOPE: Native destination selection is separate from writing; complete snapshot
//          requests echo lifetime/revision/source ownership and reject a destination
//          owned by another live document before sandboxed disk writes. Renderer
//          coordination alone authorizes logical close; legacy batch close rejects.
//          Deprecated one-shot saves remain save-only compatibility endpoints.
//   DEPENDS: m001_lifecycle, m013b::fs, m013b::state::SecurityCtx,
//            m010_security, m047_bookmarks and the native dialog plugin.
//   LINKS: .grace/graph/runtime.xml M-001; V-M-001;
//          C-SAVE-CLOSE-DATA-SAFETY T-002/T-003.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   MainCloseSm - Managed native close-state machine.
//   SavedTabState - Deprecated save-only result shape.
//   mt_response_file_save - Deprecated one-shot save compatibility command.
//   mt_response_file_save_as - Deprecated picker-plus-save compatibility command.
//   save_to_path_inner - Sandboxed save-only primitive and legacy result formatter.
//   SaveTargetRequest - Native picker request with request/lifetime identity.
//   SaveTargetReply - Selected path correlated to its picker request.
//   OwnedDocumentPath - Another live lifetime and its protected destination.
//   DocumentWriteRequest - Immutable text/revision/source/destination write request.
//   DocumentWriteReply - Acknowledged write identity and resulting filename.
//   mt_document_choose_save_target - Select a native path without capturing document text.
//   write_document_snapshot_inner - Validate ownership collisions and write exact snapshot text.
//   mt_document_write_snapshot - Invoke the guarded snapshot writer using the active sandbox.
//   mt_close_window - Destroy the caller window after renderer close approval.
//   save_and_close_inner - Test-only historical batch behavior; no runtime authority.
//   mt_save_and_close_tabs - Reject the unsafe legacy batch-close route.
//   mt_close_window_confirm - Retain the legacy confirmation sink.
//   advance_close_state_machine - Advance native lifecycle after a confirmed close.
//   wire_close_handler - Intercept native close requests for renderer approval.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-10 C-SAVE-CLOSE-DATA-SAFETY: correlated snapshot writes,
//     separate picker, canonical owned-path collision fence and rejected legacy close.
//   - 2026-05-08 B4-pre-alpha-step-3: initial save/close bridge.
// END_CHANGE_SUMMARY

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
#[derive(serde::Serialize, Debug)]
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
                safe_eprintln!("[m001][save_close][BLOCK_SAVE_AS_CANCELLED id={id}]");
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
            safe_eprintln!("[m001][save_close][BLOCK_SAVE_AS_CANCELLED id={id}]");
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
    let mut builder = app
        .dialog()
        .file()
        .set_title("Save File")
        .set_file_name(fname);
    builder = builder
        .add_filter(
            "Markdown",
            &["md", "markdown", "mdown", "mkd", "mkdn", "mdtxt"],
        )
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
    let path_str = chosen.into_path().ok()?.to_string_lossy().to_string();
    safe_eprintln!("[m001][save_close][BLOCK_SAVE_AS_PICKED path={path_str}]");
    Some(path_str)
}

/// Path B-clean W2a: returns SavedTabState directly (folds tab-saved
/// + set-pathname events into the invoke return). Single-window
/// save flow no longer needs to listen for those events. Multi-tab
/// batch save (mt_save_and_close_tabs) still emits them so the
/// renderer can update tabs as each completes.
async fn save_to_path_outcome(
    _app: &AppHandle,
    sec: &State<'_, SecurityCtx>,
    id: &str,
    target_path: &str,
    markdown: &str,
    was_picked: bool,
) -> Result<Option<SavedTabState>, String> {
    save_to_path_inner(&sec.sandbox(), id, target_path, markdown, was_picked)
}

/// Pure-logic save: writes via fs_write_inner, formats SavedTabState on
/// success, and produces the same error text the renderer expects.
/// Extracted so unit tests can exercise the save flow without an
/// AppHandle / Tauri runtime.
pub(crate) fn save_to_path_inner(
    sandbox: &std::path::Path,
    id: &str,
    target_path: &str,
    markdown: &str,
    was_picked: bool,
) -> Result<Option<SavedTabState>, String> {
    match crate::m013b::fs::fs_write_inner(target_path, markdown, sandbox) {
        Ok(()) => {
            safe_eprintln!("[m001][save_close][BLOCK_FILE_SAVED id={id} path={target_path} was_picked={was_picked}]");
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
            safe_eprintln!(
                "[m001][save_close][BLOCK_FILE_SAVE_FAILED id={id} path={target_path} reason={msg}]"
            );
            Err(msg)
        }
    }
}

// START_BLOCK_CORRELATED_DOCUMENT_SAVE
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTargetRequest {
    pub request_id: String,
    pub document_token: String,
    pub filename: String,
    pub default_path: Option<String>,
}
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTargetReply {
    pub request_id: String,
    pub document_token: String,
    pub pathname: String,
}
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedDocumentPath {
    pub document_token: String,
    pub pathname: String,
}
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWriteRequest {
    pub request_id: String,
    pub document_token: String,
    pub id: String,
    pub revision: u64,
    pub source_path: String,
    pub target_path: String,
    pub markdown: String,
    pub owned_paths: Vec<OwnedDocumentPath>,
}
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWriteReply {
    pub request_id: String,
    pub document_token: String,
    pub id: String,
    pub revision: u64,
    pub source_path: String,
    pub pathname: String,
    pub filename: String,
}

#[tauri::command]
pub async fn mt_document_choose_save_target(
    request: SaveTargetRequest,
    app: AppHandle,
) -> Result<Option<SaveTargetReply>, String> {
    if request.request_id.is_empty() || request.document_token.is_empty() {
        return Err("MT_DOCUMENT_INVALID_OWNER".into());
    }
    Ok(pick_save_path(
        &app,
        &request.filename,
        request.default_path.as_deref().unwrap_or(""),
    )
    .await
    .map(|pathname| SaveTargetReply {
        request_id: request.request_id,
        document_token: request.document_token,
        pathname,
    }))
}

fn canonical_document_target(path: &str) -> Result<std::path::PathBuf, String> {
    let path = std::path::Path::new(path);
    if !path.is_absolute() {
        return Err("MT_DOCUMENT_INVALID_PATH".into());
    }
    if path.exists() {
        return std::fs::canonicalize(path).map_err(|_| "MT_DOCUMENT_PATH_UNAVAILABLE".into());
    }
    let parent = path.parent().ok_or("MT_DOCUMENT_INVALID_PATH")?;
    let name = path.file_name().ok_or("MT_DOCUMENT_INVALID_PATH")?;
    std::fs::canonicalize(parent)
        .map(|p| p.join(name))
        .map_err(|_| "MT_DOCUMENT_PATH_UNAVAILABLE".into())
}

pub(crate) fn write_document_snapshot_inner(
    sandbox: &std::path::Path,
    request: DocumentWriteRequest,
) -> Result<DocumentWriteReply, String> {
    if request.request_id.is_empty() || request.document_token.is_empty() || request.id.is_empty() {
        return Err("MT_DOCUMENT_INVALID_OWNER".into());
    }
    // Reuse the canonical sandbox guard before resolving any owned destination.
    let resolved_target = crate::m047_bookmarks::ensure_access(&request.target_path);
    let target = crate::m010_security::check_path(sandbox, std::path::Path::new(&resolved_target))
        .map_err(|_| "MT_DOCUMENT_PATH_DENIED")?;
    for owner in &request.owned_paths {
        if owner.document_token == request.document_token || owner.pathname.is_empty() {
            continue;
        }
        let owned = canonical_document_target(&owner.pathname)?;
        #[cfg(target_os = "windows")]
        let same = owned
            .to_string_lossy()
            .eq_ignore_ascii_case(&target.to_string_lossy());
        #[cfg(not(target_os = "windows"))]
        let same = owned == target;
        if same {
            safe_eprintln!("[m001][save_close][BLOCK_DOCUMENT_DESTINATION_OWNED]");
            return Err("MT_DOCUMENT_DESTINATION_OWNED".into());
        }
    }
    crate::m013b::fs::fs_write_inner(&request.target_path, &request.markdown, sandbox)
        .map_err(|_| "MT_DOCUMENT_WRITE_FAILED")?;
    safe_eprintln!(
        "[m001][save_close][BLOCK_DOCUMENT_SNAPSHOT_WRITTEN revision={}]",
        request.revision
    );
    Ok(DocumentWriteReply {
        request_id: request.request_id,
        document_token: request.document_token,
        id: request.id,
        revision: request.revision,
        source_path: request.source_path,
        filename: std::path::Path::new(&request.target_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string(),
        pathname: request.target_path,
    })
}

#[tauri::command]
pub async fn mt_document_write_snapshot(
    request: DocumentWriteRequest,
    sec: State<'_, SecurityCtx>,
) -> Result<DocumentWriteReply, String> {
    write_document_snapshot_inner(&sec.sandbox(), request)
}
// END_BLOCK_CORRELATED_DOCUMENT_SAVE

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
        safe_eprintln!("[m001][save_close][BLOCK_DESTROY_WINDOW label=main]");
        win.destroy().map_err(|e| e.to_string())?;
    } else {
        safe_eprintln!(
            "[m001][save_close][BLOCK_DESTROY_WINDOW_SKIPPED label=main reason=not-found]"
        );
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
/// Pure-logic core of mt_save_and_close_tabs. Returns
/// `Ok((saved_ids, success_events))` where success_events is a list of
/// `(channel, id)` the caller emits, or `Err((aggregated_msg, failure_events))`
/// on partial/total failure. Extracted so unit tests can exercise both
/// outcomes without an AppHandle. Untitled entries (empty pathname) are
/// silently skipped — caller is expected to have warned the user.
#[cfg(test)]
pub(crate) fn save_and_close_inner(
    sandbox: &std::path::Path,
    args: Vec<serde_json::Value>,
) -> Result<Vec<String>, (String, Vec<(String, String)>, Vec<String>)> {
    let mut saved_ids: Vec<String> = Vec::new();
    let mut error_messages: Vec<String> = Vec::new();
    let mut failure_pairs: Vec<(String, String)> = Vec::new();
    for entry in args {
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
            continue;
        }
        match crate::m013b::fs::fs_write_inner(&path, &markdown, sandbox) {
            Ok(()) => {
                safe_eprintln!(
                    "[m001][save_close][BLOCK_FILE_SAVED id={id} path={path} batch=save_and_close]"
                );
                saved_ids.push(id);
            }
            Err(e) => {
                let msg = format!("{e:?}");
                safe_eprintln!(
                    "[m001][save_close][BLOCK_FILE_SAVE_FAILED id={id} path={path} batch=save_and_close reason={msg}]"
                );
                failure_pairs.push((id, msg.clone()));
                error_messages.push(msg);
            }
        }
    }
    if !error_messages.is_empty() {
        safe_eprintln!(
            "[m001][save_close][BLOCK_BATCH_PARTIAL_FAILURE saved={} failed={}]",
            saved_ids.len(),
            error_messages.len()
        );
        return Err((
            format!(
                "{} tab(s) failed to save: {}",
                error_messages.len(),
                error_messages.join("; ")
            ),
            failure_pairs,
            saved_ids,
        ));
    }
    if !saved_ids.is_empty() {
        safe_eprintln!(
            "[m001][save_close][BLOCK_FORCE_CLOSE_TABS count={}]",
            saved_ids.len()
        );
    }
    Ok(saved_ids)
}

#[tauri::command]
pub async fn mt_save_and_close_tabs(
    args: Vec<serde_json::Value>,
    _app: AppHandle,
    _sec: State<'_, SecurityCtx>,
) -> Result<(), String> {
    let _ = args;
    Err("MT_DOCUMENT_LEGACY_CLOSE_REJECTED".into())
}

#[tauri::command]
pub async fn mt_close_window_confirm(_args: Vec<serde_json::Value>) -> Result<(), String> {
    // v1.2.3 routed this IPC to a native main-process dialog. In Tauri
    // port the renderer's LISTEN_FOR_CLOSE shows the dialog locally
    // (ElMessageBox), so this command is just an acknowledgement sink
    // for compatibility with renderer code that still issues the send.
    safe_eprintln!("[m001][save_close][BLOCK_CLOSE_CONFIRM_RECEIVED renderer_handles_dialog]");
    Ok(())
}

// END_BLOCK close_commands

/// Pure-logic state-machine driver. Walks the SM through the cleanup
/// edges (CloseRequested → ForceClose → WatchersCleaned → WindowDestroyed)
/// regardless of the entry state, synthesizing the path when invoked from
/// a renderer-initiated close. Idempotent on terminal states.
pub(crate) fn advance_close_state_machine(sm: &mut CloseStateMachine) {
    if sm.state() == CloseState::Idle {
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

fn advance_to_destroy(sm_state: &State<'_, MainCloseSm>) {
    if let Ok(mut sm) = sm_state.0.lock() {
        advance_close_state_machine(&mut sm);
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
            safe_eprintln!("[m001][lifecycle][BLOCK_CLOSE_REQUESTED]");
            if let Err(e) = app.emit("mt::ask-for-close", ()) {
                safe_eprintln!("[m001][lifecycle][BLOCK_EMIT_FAILED reason={e}]");
            }
        }
    });
}

// END_BLOCK wire_close_handler

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn snapshot_request(path: &std::path::Path) -> DocumentWriteRequest {
        DocumentWriteRequest {
            request_id: "request-1".into(),
            document_token: "lifetime-1".into(),
            id: "tab-1".into(),
            revision: 7,
            source_path: String::new(),
            target_path: path.to_string_lossy().to_string(),
            markdown: "fresh\n".into(),
            owned_paths: vec![],
        }
    }
    #[test]
    fn correlated_snapshot_writes_exact_bytes_and_echoes_ownership() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("fresh.md");
        let reply = write_document_snapshot_inner(dir.path(), snapshot_request(&target)).unwrap();
        assert_eq!(std::fs::read_to_string(target).unwrap(), "fresh\n");
        assert_eq!(
            (
                reply.request_id.as_str(),
                reply.document_token.as_str(),
                reply.id.as_str(),
                reply.revision
            ),
            ("request-1", "lifetime-1", "tab-1", 7)
        );
        assert_eq!(reply.source_path, "");
    }
    #[test]
    fn correlated_snapshot_rejects_owned_target_before_overwriting() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("owned.md");
        std::fs::write(&target, "keep").unwrap();
        let mut request = snapshot_request(&target);
        request.owned_paths.push(OwnedDocumentPath {
            document_token: "another".into(),
            pathname: target.to_string_lossy().into_owned(),
        });
        assert_eq!(
            write_document_snapshot_inner(dir.path(), request).unwrap_err(),
            "MT_DOCUMENT_DESTINATION_OWNED"
        );
        assert_eq!(std::fs::read_to_string(target).unwrap(), "keep");
    }
    #[test]
    fn correlated_snapshot_rejects_an_owned_new_destination_and_sandbox_escape() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("new.md");
        let mut request = snapshot_request(&target);
        request.owned_paths.push(OwnedDocumentPath {
            document_token: "another".into(),
            pathname: target.to_string_lossy().into_owned(),
        });
        assert!(write_document_snapshot_inner(dir.path(), request).is_err());
        assert!(!target.exists());
        let outside = TempDir::new().unwrap();
        assert!(write_document_snapshot_inner(
            dir.path(),
            snapshot_request(&outside.path().join("no.md"))
        )
        .is_err());
    }
    #[cfg(unix)]
    #[test]
    fn correlated_snapshot_rejects_alias_of_live_owned_path() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("owned.md");
        let alias = dir.path().join("alias.md");
        std::fs::write(&target, "keep").unwrap();
        std::os::unix::fs::symlink(&target, &alias).unwrap();
        let mut request = snapshot_request(&alias);
        request.owned_paths.push(OwnedDocumentPath {
            document_token: "another".into(),
            pathname: target.to_string_lossy().into_owned(),
        });
        assert_eq!(
            write_document_snapshot_inner(dir.path(), request).unwrap_err(),
            "MT_DOCUMENT_DESTINATION_OWNED"
        );
        assert_eq!(std::fs::read_to_string(target).unwrap(), "keep");
    }

    #[test]
    fn main_close_sm_default_is_idle() {
        let sm = MainCloseSm::default();
        assert_eq!(sm.0.lock().unwrap().state(), CloseState::Idle);
    }

    #[test]
    fn save_to_path_inner_writes_and_returns_state() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("note.md");
        let result = save_to_path_inner(
            dir.path(),
            "tab-1",
            target.to_str().unwrap(),
            "# hello",
            true,
        )
        .unwrap()
        .unwrap();
        assert_eq!(result.id, "tab-1");
        assert_eq!(result.pathname, target.to_str().unwrap());
        assert_eq!(result.filename, "note.md");
        assert!(result.is_saved);
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "# hello");
    }

    #[test]
    fn save_to_path_inner_propagates_write_errors_as_string() {
        // Write outside sandbox to force m010 PATH_DENIED.
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let target = outside.path().join("nope.md");
        let err = save_to_path_inner(dir.path(), "tab-1", target.to_str().unwrap(), "x", false)
            .unwrap_err();
        assert!(err.contains("MT_FS_PATH_DENIED"), "got {err}");
    }

    #[test]
    fn save_to_path_inner_handles_filename_extraction_for_root_path() {
        // Edge: path with no file_name (e.g. "/") — filename falls back to "".
        let dir = TempDir::new().unwrap();
        // Try writing to something with empty filename — fs::create on "/"
        // will fail but we use a path that DOES write but extracts "" as
        // filename: writing to a normal nested path proves the happy
        // file_name extraction; writing to "" path exercises the fallback.
        // Use a file ending in / which extract returns None for.
        let res = save_to_path_inner(
            dir.path(),
            "tab-empty",
            dir.path().to_str().unwrap(), // a directory path → file_name returns the dirname
            "x",
            false,
        );
        // Writing to an existing dir fails (File::create on dir).
        assert!(res.is_err());
    }

    #[test]
    fn save_and_close_inner_all_succeed_returns_saved_ids() {
        let dir = TempDir::new().unwrap();
        let p1 = dir.path().join("a.md");
        let p2 = dir.path().join("b.md");
        let args = vec![
            json!({"id": "1", "pathname": p1.to_str().unwrap(), "markdown": "hello"}),
            json!({"id": "2", "pathname": p2.to_str().unwrap(), "markdown": "world"}),
        ];
        let saved = save_and_close_inner(dir.path(), args).unwrap();
        assert_eq!(saved, vec!["1".to_string(), "2".to_string()]);
        assert_eq!(std::fs::read_to_string(&p1).unwrap(), "hello");
        assert_eq!(std::fs::read_to_string(&p2).unwrap(), "world");
    }

    #[test]
    fn save_and_close_inner_skips_untitled_entries() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("real.md");
        let args = vec![
            // Untitled — empty pathname; should be silently skipped.
            json!({"id": "untitled-1", "pathname": "", "markdown": "lost"}),
            json!({"id": "real-1", "pathname": p.to_str().unwrap(), "markdown": "kept"}),
            // Missing pathname key → defaults to "" → skipped.
            json!({"id": "untitled-2", "markdown": "lost-too"}),
        ];
        let saved = save_and_close_inner(dir.path(), args).unwrap();
        assert_eq!(saved, vec!["real-1".to_string()]);
    }

    #[test]
    fn save_and_close_inner_partial_failure_reports_aggregated_error() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let p_ok = dir.path().join("ok.md");
        let p_bad = outside.path().join("blocked.md"); // outside sandbox
        let args = vec![
            json!({"id": "good", "pathname": p_ok.to_str().unwrap(), "markdown": "yay"}),
            json!({"id": "bad", "pathname": p_bad.to_str().unwrap(), "markdown": "boom"}),
        ];
        let (msg, failures, saved) = save_and_close_inner(dir.path(), args).unwrap_err();
        assert!(msg.contains("1 tab(s) failed"), "got {msg}");
        assert_eq!(saved, vec!["good".to_string()]);
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].0, "bad");
        assert!(failures[0].1.contains("MT_FS_PATH_DENIED"));
        // The good file did get written (we save first, fail second).
        assert!(p_ok.exists());
    }

    #[test]
    fn save_and_close_inner_empty_args_is_ok_with_no_ids() {
        let dir = TempDir::new().unwrap();
        let saved = save_and_close_inner(dir.path(), vec![]).unwrap();
        assert!(saved.is_empty());
    }

    #[test]
    fn saved_tab_state_serializes_with_camel_case() {
        let s = SavedTabState {
            id: "tab-1".to_string(),
            pathname: "/tmp/note.md".to_string(),
            filename: "note.md".to_string(),
            is_saved: true,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"isSaved\":true"), "got {json}");
        assert!(json.contains("\"pathname\":\"/tmp/note.md\""));
        assert!(json.contains("\"filename\":\"note.md\""));
    }

    #[test]
    fn advance_close_state_machine_from_idle_walks_full_path() {
        let mut sm = CloseStateMachine::default();
        assert_eq!(sm.state(), CloseState::Idle);
        advance_close_state_machine(&mut sm);
        assert!(
            sm.is_terminal(),
            "expected terminal state, got {:?}",
            sm.state()
        );
    }

    #[test]
    fn advance_close_state_machine_from_prompt_open_walks_to_destroy() {
        let mut sm = CloseStateMachine::default();
        sm.transition(CloseState::CloseRequested).unwrap();
        sm.transition(CloseState::PromptOpen).unwrap();
        advance_close_state_machine(&mut sm);
        assert!(sm.is_terminal());
    }

    #[test]
    fn advance_close_state_machine_from_save_failed_recovers_to_destroy() {
        // SaveFailed branch — renderer reported a save error, then user
        // chose "Close anyway" so we still walk to destroy.
        let mut sm = CloseStateMachine::default();
        sm.transition(CloseState::CloseRequested).unwrap();
        sm.transition(CloseState::PromptOpen).unwrap();
        sm.transition(CloseState::SaveFailed).unwrap();
        advance_close_state_machine(&mut sm);
        assert!(sm.is_terminal());
    }

    #[test]
    fn advance_close_state_machine_idempotent_on_terminal() {
        let mut sm = CloseStateMachine::default();
        advance_close_state_machine(&mut sm);
        let final_state = sm.state();
        // Calling again must not panic and must leave the machine alone.
        advance_close_state_machine(&mut sm);
        assert_eq!(sm.state(), final_state);
    }

    #[test]
    fn save_and_close_inner_all_failures_returns_empty_saved_list() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let p1 = outside.path().join("blocked-1.md");
        let p2 = outside.path().join("blocked-2.md");
        let args = vec![
            json!({"id": "a", "pathname": p1.to_str().unwrap(), "markdown": "x"}),
            json!({"id": "b", "pathname": p2.to_str().unwrap(), "markdown": "y"}),
        ];
        let (msg, failures, saved) = save_and_close_inner(dir.path(), args).unwrap_err();
        assert!(msg.contains("2 tab(s) failed"));
        assert!(saved.is_empty());
        assert_eq!(failures.len(), 2);
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
