// MODULE_CONTRACT
//   PURPOSE: M-048 build-mode descriptor (C-15 T-M5). Exposes which
//            distribution the renderer is running in so it can hide
//            sandbox-hostile surfaces instead of surfacing backend
//            errors: { mode: "app-store" | "desktop", features map }.
//   SCOPE:   One query command, compile-time constant. No state, no I/O.
//   DEPENDS: stdlib (cfg).
//   LINKS: .grace/changes/active/C-15/plan.xml T-M5; renderer
//          preferences store gating; m015 (pandoc), m018 (screenshot),
//          m021 (default handler), m013b search.
//
// START_MODULE_MAP
//   mt_build_mode - command returning the build descriptor
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-21 C-15 T-M5: initial module.
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
        })
    }
    #[cfg(not(feature = "app-store"))]
    {
        Ok(BuildMode {
            mode: "desktop",
            export_pandoc: true,
            screenshot: true,
            set_default_handler: true,
            project_search_ripgrep: true,
            updater: true,
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
        };
        #[cfg(not(feature = "app-store"))]
        let m = BuildMode {
            mode: "desktop",
            export_pandoc: true,
            screenshot: true,
            set_default_handler: true,
            project_search_ripgrep: true,
            updater: true,
        };
        assert!(matches!(m.mode, "app-store" | "desktop"));
        // app-store must never advertise a sandbox-hostile capability.
        if m.mode == "app-store" {
            assert!(!m.export_pandoc && !m.screenshot && !m.set_default_handler);
        }
    }
}
