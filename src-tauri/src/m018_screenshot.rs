// MODULE_CONTRACT
//   PURPOSE: M-018 mt-screenshot. macOS-only screen capture via the
//            built-in `screencapture` CLI. Result bytes returned to
//            renderer for inline insertion as a markdown image.
//   SCOPE:   macOS only at v2.0; Windows / Linux deferred to v2.1+.
//            Modes: -i (interactive selection), -w (window), -m (main
//            display). All write to a temp file we then read + delete.
//   DEPENDS: stdlib std::process::Command + std::fs.
//   LINKS:   docs/development-plan.xml Phase-B3 step-11.
//   STATUS:  Phase-B3 step-11 shipped (macOS only).
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-11: initial macOS impl + cross-platform stubs.

use std::process::Command;

#[derive(serde::Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotOptions {
    /// "interactive" (-i, user selects region), "window" (-w),
    /// or "main" (-m, main display fullscreen). Defaults to "interactive".
    pub mode: Option<String>,
}

#[tauri::command]
pub async fn mt_screenshot_capture(
    options: Option<ScreenshotOptions>,
) -> Result<Vec<u8>, String> {
    if !cfg!(target_os = "macos") {
        eprintln!("[Screenshot][capture][BLOCK_PLATFORM_UNSUPPORTED]");
        return Err("MT_SCREENSHOT_PLATFORM: screencapture is macOS-only at v2.0".to_string());
    }
    let opts = options.unwrap_or_default();
    let mode = opts.mode.unwrap_or_else(|| "interactive".to_string());
    let mode_flag = match mode.as_str() {
        "interactive" => "-i",
        "window" => "-w",
        "main" => "-m",
        other => return Err(format!("MT_SCREENSHOT_BAD_MODE: '{other}'")),
    };

    // Temp file: cache_root/screenshot-{ts}.png
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("mark-screenshot-{ts}.png"));

    let status = Command::new("screencapture")
        .arg(mode_flag)
        .arg("-x") // no shutter sound
        .arg(&tmp)
        .status()
        .map_err(|e| {
            eprintln!("[Screenshot][capture][BLOCK_SPAWN_FAILED reason={e}]");
            e.to_string()
        })?;
    if !status.success() {
        eprintln!(
            "[Screenshot][capture][BLOCK_USER_CANCELLED status={}]",
            status
        );
        return Err("MT_SCREENSHOT_CANCELLED".to_string());
    }
    if !tmp.exists() {
        return Err("MT_SCREENSHOT_NO_OUTPUT".to_string());
    }
    let bytes = std::fs::read(&tmp).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp);
    eprintln!(
        "[Screenshot][capture][BLOCK_CAPTURE_OK mode={mode} bytes={}]",
        bytes.len()
    );
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn invalid_mode_rejected() {
        let opts = ScreenshotOptions {
            mode: Some("totally-bogus".to_string()),
        };
        // On non-macOS we early-return platform-unsupported BEFORE
        // mode validation. Skip on Linux/Win runners.
        if cfg!(target_os = "macos") {
            let err = mt_screenshot_capture(Some(opts)).await.unwrap_err();
            assert!(err.starts_with("MT_SCREENSHOT_BAD_MODE"));
        }
    }

    #[cfg(not(target_os = "macos"))]
    #[tokio::test]
    async fn non_macos_returns_platform_unsupported() {
        let err = mt_screenshot_capture(None).await.unwrap_err();
        assert!(err.starts_with("MT_SCREENSHOT_PLATFORM"));
    }
}
