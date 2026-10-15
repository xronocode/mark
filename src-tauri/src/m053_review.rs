// FILE: src-tauri/src/m053_review.rs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-053 C-48 review request. mt_request_review asks the
//            system rating sheet (SKStoreReviewController) in the App
//            Store build on macOS; every other build is a no-op that
//            resolves Ok(false).
//   SCOPE: One command. No state, no prefs, no network — Apple decides
//          whether the sheet actually shows and caps the frequency.
//   DEPENDS: tauri (AppHandle, run_on_main_thread), objc (macOS
//            app-store variant, mirroring m032_share).
//   LINKS: .grace/changes/active/C-48/spec.xml R-2 (board 5); m048
//          advertises the `review` capability; the renderer decides
//          WHEN to ask (review/reviewRequest.js); Help › Rate Mark…
//          (m009) opens the store page directly.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mt_request_review - dispatch SKStoreReviewController requestReview on the main thread; Ok(false) everywhere else.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 C-48 T-001: initial module.
// END_CHANGE_SUMMARY

#[cfg(all(feature = "app-store", target_os = "macos"))]
#[tauri::command]
pub async fn mt_request_review(app: tauri::AppHandle) -> Result<bool, String> {
    // SKStoreReviewController.requestReview must run on the main thread
    // (same dispatch pattern as m032_share). StoreKit may not be linked
    // in a bare binary — resolve the class at runtime and degrade to a
    // logged no-op instead of panicking inside class!.
    app.run_on_main_thread(move || {
        use objc::msg_send;
        use objc::runtime::Class;
        use objc::sel;
        use objc::sel_impl;

        unsafe {
            match Class::get("SKStoreReviewController") {
                Some(cls) => {
                    let _: () = msg_send![cls, requestReview];
                    safe_eprintln!("[Review][request][BLOCK_REQUEST_REVIEW_DISPATCHED]");
                }
                None => {
                    safe_eprintln!(
                        "[Review][request][BLOCK_REQUEST_REVIEW_NO_STOREKIT]"
                    );
                }
            }
        }
    })
    .map_err(|e| format!("main thread dispatch: {e}"))?;
    Ok(true)
}

// START_BLOCK_REVIEW_NOOP
// Homebrew / direct-download desktop builds and non-macOS targets: no
// system rating sheet exists (board 5: "nothing is shown"). The renderer
// never calls this in those builds (the m048 `review` capability is off),
// but the stub keeps the command surface uniform.
#[cfg(not(all(feature = "app-store", target_os = "macos")))]
#[tauri::command]
pub async fn mt_request_review() -> Result<bool, String> {
    safe_eprintln!("[Review][request][BLOCK_REQUEST_REVIEW_NOOP]");
    Ok(false)
}
// END_BLOCK_REVIEW_NOOP

#[cfg(test)]
mod tests {
    use super::*;

    // The default cargo test profile compiles without the app-store
    // feature, so the no-op variant is what plain `cargo test` sees;
    // the app-store variant is exercised by the MAS CI build (and the
    // m048 review-flag test pins that only that build advertises it).
    #[cfg(not(all(feature = "app-store", target_os = "macos")))]
    #[tokio::test]
    async fn mt_request_review_is_a_noop_outside_the_app_store_build() {
        let asked = mt_request_review().await.expect("noop must not error");
        assert_eq!(asked, false, "desktop builds never request the system sheet");
    }
}
