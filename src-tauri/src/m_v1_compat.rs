// MODULE_CONTRACT
//   PURPOSE: Tauri-side stubs for v1.2.3 IPC channels that the renderer
//            (ported as-is per variant-(a)) calls but that we haven't
//            ported to dedicated modules yet. Each stub returns a
//            sensible default so the renderer's `.then(...)` chains
//            resolve instead of throwing unhandled rejections.
//   SCOPE:   thin compatibility shims only. Every command here has a
//            corresponding F-* followup pointing at the proper module
//            that should own it long-term.
//   DEPENDS: tauri (WebviewWindow for window-state queries).
//   LINKS:   docs/development-plan.xml F-V1-IPC-COMPAT-STUBS;
//            install-window-globals.js electron.ipcRenderer.invoke
//            translates 'mt::xxx-yyy' → 'mt_xxx_yyy' before dispatch.
//   STATUS:  shipped 2026-04-29 with F-MAIN-ENTRY-DISABLED runtime close.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 F-MAIN-ENTRY-DISABLED runtime: mt_window_state stub.
//   - 2026-04-29 F-EDITOR-BOOTSTRAP-EVENT: mt_request_keybindings doubles
//     as the renderer-ready signal — emits mt::bootstrap-editor with
//     migrated prefs config so editor.js:593 listener fires.
//   - 2026-04-29 F-V1-FILE-OPS: mt_cmd_open_folder + mt_cmd_open_file +
//     mt_ask_for_open_project_in_sidebar use rfd file pickers and emit
//     mt::open-directory / mt::open-file events so File→Open and the
//     sidebar's Open Folder button work.

use serde::Serialize;
use serde_json::json;
use tauri::{Emitter, Manager};

use crate::m005_prefs::PrefsState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub is_full_screen: bool,
    pub is_maximized: bool,
}

/// Maps to v1 'mt::window-state' invoke from titleBar/index.vue.
/// Renderer uses this to seed initial isFullScreen/isMaximized refs;
/// subsequent state changes flow through Tauri WindowEvent listeners
/// (wired in F-LIFECYCLE-WIRE).
#[tauri::command]
pub async fn mt_window_state(window: tauri::Window) -> Result<WindowState, String> {
    let is_full_screen = window.is_fullscreen().unwrap_or(false);
    let is_maximized = window.is_maximized().unwrap_or(false);
    Ok(WindowState {
        is_full_screen,
        is_maximized,
    })
}

/// Maps to v1 'mt::request-keybindings' send from editor.js:588 — the
/// renderer fires this ~500 ms after registering the
/// `mt::bootstrap-editor` listener (line 593). v1.2.3 main process
/// answered with the keybinding map; in our port, we use it as the
/// renderer-ready signal to push the bootstrap-editor event back, which
/// flips mainStore.SET_INITIALIZED() and unblocks the editor surface.
/// Without this hook, the editor remains in editor-placeholder mode
/// forever (F-EDITOR-BOOTSTRAP-EVENT).
///
/// Config fields read from the migrated PrefsStore (set by F-PREFS-MIGRATE-V1).
/// Defaults match v1.2.3 schema defaults so a fresh install also boots cleanly.
#[tauri::command]
pub async fn mt_request_keybindings(
    app: tauri::AppHandle,
    window: tauri::Window,
    prefs: tauri::State<'_, PrefsState>,
) -> Result<(), String> {
    let side_bar_visibility = prefs
        .get("sideBarVisibility")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let tab_bar_visibility = prefs
        .get("tabBarVisibility")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let source_code_mode_enabled = prefs
        .get("sourceCodeModeEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let line_ending = prefs
        .get("endOfLine")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "default".to_string());

    let config = json!({
        "addBlankTab": true,
        "markdownList": [],
        "lineEnding": line_ending,
        "sideBarVisibility": side_bar_visibility,
        "tabBarVisibility": tab_bar_visibility,
        "sourceCodeModeEnabled": source_code_mode_enabled,
    });

    eprintln!(
        "[v1_compat][bootstrap_editor][BLOCK_EMIT side_bar={side_bar_visibility} tab_bar={tab_bar_visibility} source_code={source_code_mode_enabled} line_ending={line_ending}]"
    );

    // Use AppHandle::emit so the event reaches every listener; window
    // label "main" is the standard Mark window per tauri.conf.json.
    let _ = window.label();
    let _ = app.webview_windows();
    if let Err(e) = window.emit("mt::bootstrap-editor", &config) {
        eprintln!(
            "[v1_compat][bootstrap_editor][BLOCK_EMIT_FAILED err={e}]"
        );
        return Err(e.to_string());
    }

    Ok(())
}

/// Maps to v1 'mt::cmd-open-folder' and 'mt::ask-for-open-project-in-sidebar'.
/// Shows a native folder picker; on selection, emits mt::open-directory
/// with the chosen path. Renderer's project store listens for this and
/// adds the folder as a project root + watches it.
#[tauri::command]
pub async fn mt_cmd_open_folder(window: tauri::Window) -> Result<(), String> {
    open_folder_internal(window).await
}

/// Alias of mt_cmd_open_folder. v1.2.3 used a separate channel for the
/// sidebar's "Open Folder" button vs the File menu; the dialog flow is
/// identical so we route both through the same impl.
#[tauri::command]
pub async fn mt_ask_for_open_project_in_sidebar(window: tauri::Window) -> Result<(), String> {
    open_folder_internal(window).await
}

async fn open_folder_internal(window: tauri::Window) -> Result<(), String> {
    let chosen = rfd::AsyncFileDialog::new()
        .set_title("Open Folder")
        .pick_folder()
        .await;
    let path = match chosen {
        Some(handle) => handle.path().to_string_lossy().to_string(),
        None => {
            eprintln!("[v1_compat][open_folder][BLOCK_USER_CANCELLED]");
            return Ok(());
        }
    };
    eprintln!("[v1_compat][open_folder][BLOCK_PICKED path={path}]");
    if let Err(e) = window.emit("mt::open-directory", &path) {
        eprintln!("[v1_compat][open_folder][BLOCK_EMIT_FAILED err={e}]");
        return Err(e.to_string());
    }
    Ok(())
}

/// Maps to v1 'mt::cmd-open-file'. Shows a native file picker (markdown
/// extensions); emits mt::open-file with the chosen path so the editor
/// store can load it as a new tab.
#[tauri::command]
pub async fn mt_cmd_open_file(window: tauri::Window) -> Result<(), String> {
    let chosen = rfd::AsyncFileDialog::new()
        .set_title("Open Markdown File")
        .add_filter(
            "Markdown",
            &["md", "markdown", "mmd", "mkd", "mkdn", "mdown", "mdtxt", "mdtext", "mdx", "text", "txt"],
        )
        .pick_file()
        .await;
    let path = match chosen {
        Some(handle) => handle.path().to_string_lossy().to_string(),
        None => {
            eprintln!("[v1_compat][open_file][BLOCK_USER_CANCELLED]");
            return Ok(());
        }
    };
    eprintln!("[v1_compat][open_file][BLOCK_PICKED path={path}]");
    if let Err(e) = window.emit("mt::open-file", &path) {
        eprintln!("[v1_compat][open_file][BLOCK_EMIT_FAILED err={e}]");
        return Err(e.to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_state_serializes_camel_case() {
        let s = WindowState { is_full_screen: true, is_maximized: false };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("isFullScreen"));
        assert!(json.contains("isMaximized"));
    }
}
