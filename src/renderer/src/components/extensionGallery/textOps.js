// MODULE_CONTRACT
//   PURPOSE: Frontend event listeners for extension text operations.
//            Listens for mt::text::op events from the Rust backend
//            (emitted by text_ops.rs) and applies them to the active
//            Muya editor instance via the application event bus.
//   SCOPE:   Event registration/teardown. Insert and transform handlers.
//            Does NOT own a Muya instance — routes through the bus so
//            the active editor.vue picks up the operation.
//   DEPENDS: @tauri-apps/api/event (listen), bus (application event bus).
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B4;
//            src-tauri/src/m045_ext/text_ops.rs (event emitter).
//   STATUS:  Phase-B4 initial.
//
// CHANGE_SUMMARY:
//   - 2026-06-08 B4: initial textOps listener creation.

import { listen } from '@tauri-apps/api/event'
import bus from '../../bus'

// START_BLOCK_STATE

let unlisten = null

// END_BLOCK_STATE

// START_BLOCK_HANDLERS

/**
 * Handle mt::text::op events from the backend.
 *
 * Event payload shape (from text_ops.rs TextOpEvent):
 *   { op_type: string, payload: object, extension_id: string }
 *
 * op_type values:
 *   "insert"    — { text, position? }
 *   "transform" — { text }
 */
function handleTextOp (event) {
  const data = event?.payload
  if (!data || typeof data !== 'object') return

  const { op_type: opType, payload, extension_id: extId } = data
  if (!opType || !payload) return

  if (opType === 'insert') {
    handleInsert(payload, extId)
  } else if (opType === 'transform') {
    handleTransform(payload, extId)
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[TextOps][BLOCK_UNKNOWN_OP op_type=${opType}]`)
  }
}

/**
 * Insert text at cursor position. Emits a bus event that the active
 * editor.vue handles via its Muya instance.
 *
 * Strategy: use insertParagraph('after', text) for block-level inserts,
 * or emit a custom 'ext-text-insert' event that the editor listens for.
 * The editor handler calls muya.insertText() or setMarkdown() depending
 * on whether a position is specified.
 */
function handleInsert (payload, extId) {
  const { text, position } = payload
  if (typeof text !== 'string') {
    // eslint-disable-next-line no-console
    console.warn('[TextOps][BLOCK_INSERT_INVALID_PAYLOAD]')
    return
  }

  bus.emit('ext-text-insert', { text, position, extensionId: extId })

  // eslint-disable-next-line no-console
  console.log(
    `[TextOps][BLOCK_INSERT_EMITTED ext=${extId} len=${text.length} hasPos=${!!position}]`
  )
}

/**
 * Transform (replace) selected text. Emits a bus event that the active
 * editor.vue handles. The editor handler gets the current selection,
 * replaces it with the provided text, and ensures the operation is
 * registered as a single undo step.
 */
function handleTransform (payload, extId) {
  const { text } = payload
  if (typeof text !== 'string') {
    // eslint-disable-next-line no-console
    console.warn('[TextOps][BLOCK_TRANSFORM_INVALID_PAYLOAD]')
    return
  }

  bus.emit('ext-text-transform', { text, extensionId: extId })

  // eslint-disable-next-line no-console
  console.log(
    `[TextOps][BLOCK_TRANSFORM_EMITTED ext=${extId} len=${text.length}]`
  )
}

// END_BLOCK_HANDLERS

// START_BLOCK_LIFECYCLE

/**
 * Register the Tauri event listener for text operations.
 * Call this once during app initialization (e.g., from App.vue or
 * the main entry point).
 *
 * Returns a cleanup function that unregisters the listener.
 */
export async function initTextOpsListener () {
  if (unlisten) {
    // Already registered — idempotent.
    return
  }

  unlisten = await listen('mt::text::op', handleTextOp)

  // eslint-disable-next-line no-console
  console.log('[TextOps][BLOCK_LISTENER_REGISTERED]')
}

/**
 * Unregister the Tauri event listener. Call during teardown.
 */
export function destroyTextOpsListener () {
  if (unlisten) {
    unlisten()
    unlisten = null
    // eslint-disable-next-line no-console
    console.log('[TextOps][BLOCK_LISTENER_DESTROYED]')
  }
}

// END_BLOCK_LIFECYCLE
