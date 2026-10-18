// FILE: src-tauri/src/m048_build_mode.rs
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: M-048 build-mode descriptor (C-15 T-115). Exposes which
//            distribution the renderer is running in so it can hide
//            sandbox-hostile surfaces instead of surfacing backend
//            errors: { mode: "app-store" | "desktop", features map }.
//   SCOPE: One query command, compile-time constant. No state, no I/O.
//   DEPENDS: stdlib (cfg), serde.
//   LINKS: .grace/changes/archive/C-15/plan.xml T-115; renderer preferences
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
//   - 2026-10-15 C-44: the app-store variant advertises share on macOS
//     (NSSharingServicePicker is sandbox-safe); the live server stays off.
//   - 2026-10-15 C-48: `review` flag — SKStoreReviewController (m053)
//     exists only in the App Store build on macOS; desktop stays false.
//   - 2026-10-18 C-57: `support` flag — the Help › Support Mark… Ko-fi
//     link ships only in desktop builds (ASC review risk in store
//     builds); the renderer capability gate prunes help.support when
//     false, mirroring how review gates help.rate in reverse.
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
    /// C-48: SKStoreReviewController (m053) exists only in the App Store
    /// build on macOS — the renderer review flow and Help › Rate Mark…
    /// gate on this, not on the mode string.
    pub review: bool,
    /// C-57: the external Ko-fi support link (Help › Support Mark…)
    /// ships only in desktop builds — no donation surface in store
    /// builds. The renderer gates help.support on this flag.
    pub support: bool,
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
            // C-44: NSSharingServicePicker on a user-opened file is
            // sandbox-safe — the App Store build shows Share on macOS too.
            share: cfg!(target_os = "macos"),
            // C-48: the system rating sheet (SKStoreReviewController,
            // m053) is App Store + macOS only.
            review: cfg!(target_os = "macos"),
            // C-57: no donation link in store builds (ASC review risk).
            support: false,
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
            // C-48: no system rating sheet exists outside the store.
            review: false,
            // C-57: the Ko-fi link ships in every desktop build.
            support: true,
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
            share: cfg!(target_os = "macos"),
            review: cfg!(target_os = "macos"),
            support: false,
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
            review: false,
            support: true,
        };
        assert!(matches!(m.mode, "app-store" | "desktop"));
        // app-store must never advertise a sandbox-hostile capability.
        if m.mode == "app-store" {
            assert!(!m.export_pandoc && !m.screenshot && !m.set_default_handler);
            // C-44: the share sheet is sandbox-safe and enabled on macOS.
            assert_eq!(m.share, cfg!(target_os = "macos"));
            // C-57: no donation surface in store builds.
            assert!(!m.support);
        } else {
            // C-57: every desktop build ships the Ko-fi support link.
            assert!(m.support);
        }
        // C-15 T-W2: desktop builds off macOS never advertise the
        // macOS-only binaries (screencapture, defaults/lsregister).
        if m.mode == "desktop" && cfg!(not(target_os = "macos")) {
            assert!(!m.screenshot && !m.set_default_handler);
        }
    }

    // START_BLOCK_REVIEW_FLAG_TEST
    // C-48: the review flow (m053 + renderer reviewRequest) may only run
    // where the system rating sheet exists — the App Store build on
    // macOS. cargo test without features pins the desktop false; the MAS
    // CI build (app-store feature) compiles the mirror assertion.
    #[cfg(not(feature = "app-store"))]
    #[tokio::test]
    async fn desktop_builds_never_advertise_the_review_capability() {
        let m = mt_build_mode().await.expect("build mode");
        assert_eq!(m.mode, "desktop");
        assert!(!m.review, "desktop builds have no system rating sheet");
    }

    #[cfg(all(feature = "app-store", target_os = "macos"))]
    #[tokio::test]
    async fn app_store_macos_advertises_the_review_capability() {
        let m = mt_build_mode().await.expect("build mode");
        assert_eq!(m.mode, "app-store");
        assert!(m.review, "the MAS build on macOS owns the rating sheet");
    }
    // END_BLOCK_REVIEW_FLAG_TEST

    // START_BLOCK_SUPPORT_FLAG_TEST
    // C-57: the Ko-fi support link (Help › Support Mark…) is
    // desktop-only — store builds must not advertise a donation surface
    // (ASC review risk). cargo test without features pins desktop true;
    // the MAS CI build compiles the mirror assertion.
    #[cfg(not(feature = "app-store"))]
    #[tokio::test]
    async fn desktop_builds_advertise_the_support_capability() {
        let m = mt_build_mode().await.expect("build mode");
        assert_eq!(m.mode, "desktop");
        assert!(m.support, "desktop builds ship the Ko-fi support link");
    }

    #[cfg(all(feature = "app-store", target_os = "macos"))]
    #[tokio::test]
    async fn app_store_builds_never_advertise_the_support_capability() {
        let m = mt_build_mode().await.expect("build mode");
        assert_eq!(m.mode, "app-store");
        assert!(!m.support, "store builds have no donation surface");
    }
    // END_BLOCK_SUPPORT_FLAG_TEST
}
