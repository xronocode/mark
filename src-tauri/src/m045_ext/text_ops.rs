// FILE: src-tauri/src/m045_ext/text_ops.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 text operation capabilities for extensions.
//            Provides text.insert and text.transform commands that
//            extensions could invoke to modify the active editor document.
//            C-EXT-EDIT-PROOF: both commands refuse — their unbound
//            mt::text::op events were always dropped by the editor
//            targeting gate, so the routes answer the stable refusal code
//            instead of emitting; /ext/apply under the binding gate is the
//            one live mutation path.
//   SCOPE:   Two Tauri commands: mt_ext_text_insert and
//            mt_ext_text_transform. Each validates the calling extension
//            is registered and enabled, then refuses with the stable
//            ext_text_op_refused string code (no event). The document-
//            bound mutation path is POST /ext/apply (live_server.rs).
//   DEPENDS: tauri (AppHandle), serde/serde_json, ExtRegistry.
//   LINKS:   .grace/graph/features.xml M-045;
//            .grace/graph/features.xml M-045 (PhaseRef Phase-B4);
//            ROADMAP.md Decision D1 (HTTP POST IPC).
//   STATUS:  C-EXT-EDIT-PROOF — commands refuse at the source.
//
// CHANGE_SUMMARY:
//   - 2026-11-22 C-EXT-EDIT-PROOF T-002: the dead command routes refuse at
//     the source — mt_ext_text_insert and mt_ext_text_transform answer the
//     stable Err("ext_text_op_refused") (BLOCK_TEXT_INSERT_REFUSED /
//     BLOCK_TEXT_TRANSFORM_REFUSED) after the unchanged registry
//     get_manifest refusal and emit no mt::text::op; names, parameters,
//     parameter order and allowlist entries stay byte-identical (the app
//     parameter rides the established generic-runtime command shape of
//     mt_ext_disable), and the now-unreachable emit path (emit_text_op
//     with its mt::text::op emit, BLOCK_EMIT / BLOCK_EMIT_FAILED, the
//     payload constructions and BLOCK_INSERT_OK / BLOCK_TRANSFORM_OK
//     logs) is removed.
//   - 2026-06-08 B4: initial text_ops module creation.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Coverage: GRACE 4 synchronized surface for M-045.
// END_MODULE_MAP

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::registry::ExtRegistry;

// START_BLOCK_TYPES

/// Cursor position descriptor. Matches Muya's cursor coordinate model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    /// Line number (0-based).
    pub line: u32,
    /// Character offset within the line (0-based).
    pub ch: u32,
}

/// Event payload emitted to the frontend for text operations.
/// The frontend textOps listener discriminates on `op_type`.
/// C-EXT-EDIT-PROOF: only the document-bound /ext/apply emit in
/// live_server.rs still constructs this event.
#[derive(Debug, Clone, Serialize)]
pub struct TextOpEvent {
    /// Operation type: "insert" or "transform".
    pub op_type: String,
    /// Operation-specific payload.
    pub payload: serde_json::Value,
    /// Extension id that requested the operation (for logging/audit).
    pub extension_id: String,
}

// END_BLOCK_TYPES

// START_BLOCK_TAURI_COMMANDS

/// Insert text at the cursor position in the active editor.
///
/// C-EXT-EDIT-PROOF: this route refuses at the source. The unbound
/// mt::text::op event it used to emit is dropped by the editor targeting
/// gate (an unbound event never matches the rendered document), so the
/// honest answer is the stable string-code refusal instead of a success
/// for an operation that can never be applied. The extension must still be
/// registered and enabled — the registry.get_manifest refusal keeps its
/// existing error.
#[tauri::command]
#[allow(unused_variables)]
pub async fn mt_ext_text_insert<R: tauri::Runtime>(
    app: AppHandle<R>,
    extension_id: String,
    text: String,
    position: Option<CursorPosition>,
    registry: tauri::State<'_, ExtRegistry>,
) -> Result<(), String> {
    // Verify the extension is registered and enabled.
    let _manifest = registry.get_manifest(&extension_id)?;

    safe_eprintln!(
        "[ExtHost][text_ops][BLOCK_TEXT_INSERT_REFUSED ext={extension_id} len={}]",
        text.len()
    );
    Err("ext_text_op_refused".to_string())
}

/// Transform (replace) the currently selected text in the active editor.
///
/// C-EXT-EDIT-PROOF: this route refuses at the source, mirroring
/// mt_ext_text_insert — the stable string-code refusal replaces the
/// unbound event emission the targeting gate always dropped; the
/// registry.get_manifest refusal keeps its existing error.
#[tauri::command]
#[allow(unused_variables)]
pub async fn mt_ext_text_transform<R: tauri::Runtime>(
    app: AppHandle<R>,
    extension_id: String,
    text: String,
    registry: tauri::State<'_, ExtRegistry>,
) -> Result<(), String> {
    // Verify the extension is registered and enabled.
    let _manifest = registry.get_manifest(&extension_id)?;

    safe_eprintln!(
        "[ExtHost][text_ops][BLOCK_TEXT_TRANSFORM_REFUSED ext={extension_id} len={}]",
        text.len()
    );
    Err("ext_text_op_refused".to_string())
}

// END_BLOCK_TAURI_COMMANDS
