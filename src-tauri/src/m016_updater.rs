// MODULE_CONTRACT
//   PURPOSE: M-016 mt-updater. Wraps tauri-plugin-updater so the
//            renderer's existing mt::updater::check IPC contract
//            keeps working while update polling routes through the
//            ed25519-signed feed at tauri.conf.json plugins.updater
//            .endpoints[].
//   SCOPE:   check_status only. Download/install/quit-and-install
//            path is exposed by tauri-plugin-updater directly to the
//            renderer; we don't proxy those (renderer uses
//            @tauri-apps/plugin-updater for download/install UX).
//   DEPENDS: tauri-plugin-updater (B4 step-5 wired); std::env for
//            CARGO_PKG_VERSION fallback when the plugin endpoint is
//            unreachable.
//   LINKS:   docs/development-plan.xml Phase-B4 step-5/6;
//            tauri.conf.json plugins.updater config;
//            docs/F-UPDATER-WIRE-PLUGIN-handoff.md (user setup).
//   STATUS:  Phase-B4 step-5 wired 2026-05-08 — plugin loaded in
//            main.rs Builder; mt_updater_check proxies to
//            UpdaterExt::updater().check().
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-10: initial stub with stable shape.
//   - 2026-05-08 B4-step-5: proxy to tauri-plugin-updater.

use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub available: bool,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    /// Reason if a real check couldn't run (e.g. "no-feed-configured",
    /// "feed-unreachable"). Renderer surfaces this as a tooltip.
    pub status_note: Option<String>,
}

#[tauri::command]
pub async fn mt_updater_check(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();

    // tauri-plugin-updater performs the GET on plugins.updater
    // .endpoints[] from tauri.conf.json; verifies the ed25519
    // signature against plugins.updater.pubkey; parses latest.json
    // to determine if a newer version is available.
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[Updater][check][BLOCK_PLUGIN_UNAVAILABLE err={e}]");
            return Ok(UpdateStatus {
                current_version: current,
                available: false,
                latest_version: None,
                download_url: None,
                status_note: Some(format!("updater plugin not initialized: {e}")),
            });
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            eprintln!(
                "[Updater][check][BLOCK_UPDATE_AVAILABLE current={current} latest={}]",
                update.version
            );
            Ok(UpdateStatus {
                current_version: current,
                available: true,
                latest_version: Some(update.version.clone()),
                download_url: Some(update.download_url.to_string()),
                status_note: None,
            })
        }
        Ok(None) => {
            eprintln!("[Updater][check][BLOCK_UP_TO_DATE current={current}]");
            Ok(UpdateStatus {
                current_version: current,
                available: false,
                latest_version: None,
                download_url: None,
                status_note: None,
            })
        }
        Err(e) => {
            eprintln!("[Updater][check][BLOCK_FEED_FAILED err={e}]");
            // Soft-fail: don't surface as Result::Err so the renderer
            // gets a user-friendly status_note instead of an error
            // toast. Network glitches shouldn't crash the menu item.
            Ok(UpdateStatus {
                current_version: current,
                available: false,
                latest_version: None,
                download_url: None,
                status_note: Some(format!("update check failed: {e}")),
            })
        }
    }
}
