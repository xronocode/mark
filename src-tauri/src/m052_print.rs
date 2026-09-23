// FILE: src-tauri/src/m052_print.rs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Open the native WKWebView print panel for the caller window (C-18: Print + Export-PDF without pandoc; sandbox/MAS-safe).
//   SCOPE: One Tauri command mt_print_webview; no state, no files, no dialogs of its own.
//   DEPENDS: tauri 2 Webview::print (wry printOperationWithPrintInfo, macOS 11+).
//   LINKS: .grace/changes/active/C-18; .grace/graph/runtime.xml M-052; .grace/verification/runtime.xml V-M-052.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mt_print_webview - Opens the system print panel (with "Save as PDF") for the invoking window's webview content.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-23 v1.0.0: C-18 — replaces window.print() (silently ignored by WKWebView) and the pandoc PDF export path with the native print panel; works in app-store builds (no external binaries).
// END_CHANGE_SUMMARY

/// Open the native print panel for the calling window's webview.
///
/// On macOS this is the WKWebView print operation (system panel with
/// pagination and "Save as PDF"). wry's print is macOS-only and silently
/// no-ops elsewhere, so non-macOS builds fail fast with an explicit error
/// instead of pretending to print.
#[tauri::command]
pub async fn mt_print_webview(webview_window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = &webview_window;
        return Err("print panel is macOS-only".to_string());
    }
    #[cfg(target_os = "macos")]
    {
    // WebviewWindow has no public `.webview()` accessor; AsRef<Webview<R>>
    // is the supported route to the webview half.
        let wv: &tauri::Webview<_> = std::convert::AsRef::as_ref(&webview_window);
        wv.print().map_err(|e| format!("native print unavailable: {e}"))
    }
}
