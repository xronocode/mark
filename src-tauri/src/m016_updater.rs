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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub available: bool,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub status_note: Option<String>,
}

#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub async fn mt_updater_check(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    use tauri_plugin_updater::UpdaterExt;
    let current = env!("CARGO_PKG_VERSION").to_string();

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            safe_eprintln!("[Updater][check][BLOCK_PLUGIN_UNAVAILABLE err={e}]");
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
            safe_eprintln!(
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
            safe_eprintln!("[Updater][check][BLOCK_UP_TO_DATE current={current}]");
            Ok(UpdateStatus {
                current_version: current,
                available: false,
                latest_version: None,
                download_url: None,
                status_note: None,
            })
        }
        Err(e) => {
            safe_eprintln!("[Updater][check][BLOCK_FEED_FAILED err={e}]");
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

#[cfg(feature = "app-store")]
#[tauri::command]
pub async fn mt_updater_check(_app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    Ok(UpdateStatus {
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        available: false,
        latest_version: None,
        download_url: None,
        status_note: Some("Updates are managed by the App Store".to_string()),
    })
}
