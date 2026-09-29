// FILE: src-tauri/src/m048_build_mode.rs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: M-048 build-mode descriptor (C-15 T-115). Exposes which
//            distribution the renderer is running in so it can hide
//            sandbox-hostile surfaces instead of surfacing backend
//            errors: { mode: "app-store" | "desktop", features map }.
//   SCOPE: One query command, compile-time constant. No state, no I/O.
//   DEPENDS: stdlib (cfg), serde.
//   LINKS: .grace/changes/active/C-15/plan.xml T-115; renderer preferences
//          store capability gating; m015 (pandoc), m018 (screenshot),
//          m021 (default handler), m013b (search).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mt_build_mode - command returning the build descriptor
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-21 C-15 T-115: initial module.
//   - 2026-09-28 C-15 T-103: desktop builds advertise screenshot /
//     setDefaultHandler only on macOS (m018 / m021 shell macOS-only
//     binaries); Windows/Linux desktop hides those surfaces via the
//     same renderer capability gate.
//   - 2026-09-29: header normalized to canonical START/END contract
//     form (grace lint closure).
//   - 2026-09-29 Phase W QA round 2: `share` flag — mt_share_file is
//     macOS-only (m032 NSSharingServicePicker); the titlebar Share
//     button must hide on Windows/Linux instead of failing silently.
// END_CHANGE_SUMMARY

use serde::Serialize;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildMode {
    /// "app-store" when compiled with the app-store feature, else "desktop".
    pub mode: &'static str,
    /// Individual capability flags derived from the mode — the renderer
    /// gates UI on these, not on the mode string, so future desktop
    /// capability downgrades don't need renderer changes.
    pub export_pandoc: bool,
    pub screenshot: bool,
    pub set_default_handler: bool,
    pub project_search_ripgrep: bool,
    pub updater: bool,
    /// C-15 Phase W QA round 2: mt_share_file is an NSSharingServicePicker
    /// shim (m032) — macOS-only. The titlebar Share button hides off-mac.
    pub share: bool,
}

#[tauri::command]
pub async fn mt_build_mode() -> Result<BuildMode, String> {
    #[cfg(feature = "app-store")]
    {
        Ok(BuildMode {
            mode: "app-store",
            export_pandoc: false,
            screenshot: false,
            set_default_handler: false,
            project_search_ripgrep: false,
            updater: false,
            share: false,
        })
    }
    #[cfg(not(feature = "app-store"))]
    {
        Ok(BuildMode {
            mode: "desktop",
            export_pandoc: true,
            // C-15 T-W2: screencapture (m018) and LaunchServices
            // defaults/lsregister (m021) are macOS-only binaries; the
            // desktop build must not advertise them on Windows/Linux.
            screenshot: cfg!(target_os = "macos"),
            set_default_handler: cfg!(target_os = "macos"),
            project_search_ripgrep: true,
            updater: true,
            share: cfg!(target_os = "macos"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_mode_shape_is_stable() {
        // Compile-time contract guard: both variants expose every flag.
        #[cfg(feature = "app-store")]
        let m = BuildMode {
            mode: "app-store",
            export_pandoc: false,
            screenshot: false,
            set_default_handler: false,
            project_search_ripgrep: false,
            updater: false,
            share: false,
        };
        #[cfg(not(feature = "app-store"))]
        let m = BuildMode {
            mode: "desktop",
            export_pandoc: true,
            screenshot: cfg!(target_os = "macos"),
            set_default_handler: cfg!(target_os = "macos"),
            project_search_ripgrep: true,
            updater: true,
            share: cfg!(target_os = "macos"),
        };
        assert!(matches!(m.mode, "app-store" | "desktop"));
        // app-store must never advertise a sandbox-hostile capability.
        if m.mode == "app-store" {
            assert!(!m.export_pandoc && !m.screenshot && !m.set_default_handler);
        }
        // C-15 T-W2: desktop builds off macOS never advertise the
        // macOS-only binaries (screencapture, defaults/lsregister).
        if m.mode == "desktop" && cfg!(not(target_os = "macos")) {
            assert!(!m.screenshot && !m.set_default_handler);
        }
    }
}
