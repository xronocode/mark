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

use serde::Serialize;

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
