// MODULE_CONTRACT
//   PURPOSE: M-016 mt-updater. Stub returning "no update available"
//            until tauri-plugin-updater is wired with a real release
//            feed + ed25519 signing key infrastructure (Phase-B4).
//            Renderer's "Check for Updates" menu item gets a
//            deterministic answer instead of an error.
//   SCOPE:   check_status only. Download/install path requires
//            release-signing-key infra that's a Phase-B4 deliverable.
//   DEPENDS: stdlib only at this layer; tauri-plugin-updater wired
//            in F-UPDATER-WIRE-PLUGIN.
//   LINKS:   docs/development-plan.xml Phase-B3 step-10 + Phase-B4
//            step-5 (dual-pubkey signing infra).
//   STATUS:  Phase-B3 step-10 stub — config surface only; runtime
//            wiring deferred to F-UPDATER-WIRE-PLUGIN.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-10: initial stub with stable shape.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateStatus {
    pub current_version: String,
    pub available: bool,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    /// Reason if a real check couldn't run (e.g. "no-feed-configured").
    pub status_note: Option<String>,
}

#[tauri::command]
pub async fn mt_updater_check() -> Result<UpdateStatus, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    eprintln!("[Updater][check][BLOCK_NO_FEED_STUB current={current}]");
    Ok(UpdateStatus {
        current_version: current,
        available: false,
        latest_version: None,
        download_url: None,
        status_note: Some(
            "Update feed not configured (B3 stub). Will activate when Phase-B4 ships dual-pubkey signing infra and points feed at GitHub Releases."
                .to_string(),
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stub_reports_current_version_and_no_update() {
        let status = mt_updater_check().await.unwrap();
        assert_eq!(status.current_version, env!("CARGO_PKG_VERSION"));
        assert!(!status.available);
        assert!(status.latest_version.is_none());
        assert!(status.status_note.is_some());
    }
}
