// MODULE_CONTRACT
//   PURPOSE: M-045 text operation capabilities for extensions.
//            Provides text.insert and text.transform commands that
//            extensions can invoke to modify the active editor document.
//            Backend receives the payload and emits Tauri events to the
//            frontend, where the editor (Muya) applies the changes.
//   SCOPE:   Two Tauri commands: mt_ext_text_insert and
//            mt_ext_text_transform. Each validates the calling extension
//            is enabled, then emits a typed event to the renderer.
//            Actual text manipulation happens in the frontend via Muya API.
//   DEPENDS: tauri (AppHandle, Emitter), serde/serde_json, ExtRegistry.
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B4;
//            ROADMAP.md Decision D1 (HTTP POST IPC).
//   STATUS:  Phase-B4 initial — text.insert + text.transform.
//
// CHANGE_SUMMARY:
//   - 2026-06-08 B4: initial text_ops module creation.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::registry::ExtRegistry;

// START_BLOCK_TYPES

/// Payload for the text.insert operation. Extensions send text to be
/// inserted at the current cursor position (or at an explicit position
/// if provided).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextInsertPayload {
    /// The text (Markdown) to insert.
    pub text: String,
    /// Optional cursor position. If None, insert at current cursor.
    pub position: Option<CursorPosition>,
}

/// Cursor position descriptor. Matches Muya's cursor coordinate model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    /// Line number (0-based).
    pub line: u32,
    /// Character offset within the line (0-based).
    pub ch: u32,
}

/// Payload for the text.transform operation. Extensions send replacement
/// text for the current selection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextTransformPayload {
    /// Replacement text for the current selection.
    pub text: String,
}

/// Event payload emitted to the frontend for text operations.
/// The frontend textOps listener discriminates on `op_type`.
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

// START_BLOCK_EMIT

/// Emit a text operation event to the frontend.
///
/// Event name `mt::text::op` follows the project convention established
/// in bootstrap-ipc.js (all Tauri events use `mt::` prefix).
fn emit_text_op(app: &AppHandle, event: TextOpEvent) -> Result<(), String> {
    safe_eprintln!(
        "[ExtHost][text_ops][BLOCK_EMIT op_type={} ext={}]",
        event.op_type,
        event.extension_id,
    );

    app.emit("mt::text::op", &event)
        .map_err(|e| {
            safe_eprintln!(
                "[ExtHost][text_ops][BLOCK_EMIT_FAILED op_type={} reason={e}]",
                event.op_type,
            );
            e.to_string()
        })
}

// END_BLOCK_EMIT

// START_BLOCK_TAURI_COMMANDS

/// Insert text at the cursor position in the active editor.
///
/// The extension must be enabled and registered. The actual text insertion
/// is performed by the frontend Muya instance — this command only validates
/// and relays the payload as a Tauri event.
#[tauri::command]
pub async fn mt_ext_text_insert(
    app: AppHandle,
    extension_id: String,
    text: String,
    position: Option<CursorPosition>,
    registry: tauri::State<'_, ExtRegistry>,
) -> Result<(), String> {
    // Verify the extension is registered and enabled.
    let _manifest = registry.get_manifest(&extension_id)?;

    let payload = TextInsertPayload {
        text: text.clone(),
        position: position.clone(),
    };

    emit_text_op(&app, TextOpEvent {
        op_type: "insert".to_string(),
        payload: serde_json::to_value(&payload).map_err(|e| {
            safe_eprintln!(
                "[ExtHost][text_ops][BLOCK_SERIALIZE_FAILED op=insert reason={e}]"
            );
            format!("serialize payload: {e}")
        })?,
        extension_id: extension_id.clone(),
    })?;

    safe_eprintln!(
        "[ExtHost][text_ops][BLOCK_INSERT_OK ext={extension_id} len={}]",
        text.len()
    );
    Ok(())
}

/// Transform (replace) the currently selected text in the active editor.
///
/// The extension must be enabled and registered. The actual text replacement
/// is performed by the frontend Muya instance — this command only validates
/// and relays the payload as a Tauri event.
#[tauri::command]
pub async fn mt_ext_text_transform(
    app: AppHandle,
    extension_id: String,
    text: String,
    registry: tauri::State<'_, ExtRegistry>,
) -> Result<(), String> {
    // Verify the extension is registered and enabled.
    let _manifest = registry.get_manifest(&extension_id)?;

    let payload = TextTransformPayload {
        text: text.clone(),
    };

    emit_text_op(&app, TextOpEvent {
        op_type: "transform".to_string(),
        payload: serde_json::to_value(&payload).map_err(|e| {
            safe_eprintln!(
                "[ExtHost][text_ops][BLOCK_SERIALIZE_FAILED op=transform reason={e}]"
            );
            format!("serialize payload: {e}")
        })?,
        extension_id: extension_id.clone(),
    })?;

    safe_eprintln!(
        "[ExtHost][text_ops][BLOCK_TRANSFORM_OK ext={extension_id} len={}]",
        text.len()
    );
    Ok(())
}

// END_BLOCK_TAURI_COMMANDS
