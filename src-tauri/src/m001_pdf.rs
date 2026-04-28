// MODULE_CONTRACT
//   PURPOSE: M-001 mt::print_to_pdf stub. Returns Err(MT_UNSUPPORTED)
//            with a stable structured error envelope. PDF export is
//            DELEGATED to M-015 mt-pandoc-bridge (Phase-B3 step-9);
//            this surface exists so the menu/renderer code can call
//            it through the typed contract and get a distinct
//            error code from the deliberately-not-built case.
//   SCOPE:   single command; no implementation body — by design.
//   DEPENDS: serde::Serialize (via the IpcError shape).
//   LINKS:   docs/phase-b1-pdf-export-strategy.md (decision rationale);
//            docs/development-plan.xml Phase-B1 step-8;
//            M-015 mt-pandoc-bridge (Phase-B3 step-9 — actual export).
//   STATUS:  Phase-B1 final — stays a stub permanently. Real PDF
//            export goes through pandoc-bridge.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-8: initial unsupported stub.

use serde::Serialize;

/// Error envelope distinct from M-013b's MT_NOT_IMPLEMENTED.
/// MT_UNSUPPORTED = "deliberately not built; expected to fail forever
/// at this layer". MT_NOT_IMPLEMENTED = "stub awaiting Phase-B2/B3
/// real impl". Renderer code branches on this distinction to grey
/// out vs disable menu items.
#[derive(Serialize, Debug, Clone)]
pub struct UnsupportedError {
    pub code: String,
    pub message: String,
    pub command: String,
    pub planned_phase: String,
}

impl UnsupportedError {
    pub fn pdf_export() -> Self {
        Self {
            code: "MT_UNSUPPORTED".to_string(),
            message:
                "Direct WebView-to-PDF rendering is not supported in Mark v2 by design. Use File → Export → PDF (via pandoc) in Phase-B3, or copy HTML and use a system print dialog."
                    .to_string(),
            command: "mt::print_to_pdf".to_string(),
            planned_phase: "B3-step-9-pandoc-bridge".to_string(),
        }
    }
}

/// PDF export entry point. Always rejects with MT_UNSUPPORTED.
/// Renderer is expected to greylist the menu item by querying
/// M-015 pandoc-availability instead of invoking this.
#[tauri::command]
pub async fn mt_print_to_pdf(html: String) -> Result<Vec<u8>, UnsupportedError> {
    eprintln!(
        "[m001][pdf][BLOCK_MT_PRINT_TO_PDF_UNSUPPORTED html_bytes={}]",
        html.len()
    );
    Err(UnsupportedError::pdf_export())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn print_to_pdf_returns_unsupported() {
        let err = mt_print_to_pdf("<p>hi</p>".into()).await.unwrap_err();
        assert_eq!(err.code, "MT_UNSUPPORTED");
        assert_eq!(err.command, "mt::print_to_pdf");
        assert_eq!(err.planned_phase, "B3-step-9-pandoc-bridge");
    }

    #[test]
    fn unsupported_error_serializes_canonically() {
        let e = UnsupportedError::pdf_export();
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "MT_UNSUPPORTED");
        assert_eq!(json["command"], "mt::print_to_pdf");
        assert!(json["message"].as_str().unwrap().contains("pandoc"));
    }

    #[test]
    fn message_explains_why_not_what() {
        // Renderer toast / status-bar text shows this verbatim;
        // negative-assertion: it must not say "not implemented" because
        // that implies a future stub-replacement (which won't happen).
        let e = UnsupportedError::pdf_export();
        assert!(!e.message.to_lowercase().contains("not implemented"));
        assert!(e.message.to_lowercase().contains("by design"));
    }
}
