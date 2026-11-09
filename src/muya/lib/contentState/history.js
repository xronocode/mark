// FILE: src/muya/lib/contentState/history.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Maintain Muya content and selection undo/redo snapshots.
//   SCOPE: Legacy block snapshots and footnote restoration; unified split stores one exact Markdown payload instead of blocks, bounded pending edits and constant-size per-surface caret metadata.
//   DEPENDS: utils.deepCopy, config.UNDO_DEPTH, ContentState and Muya.reparseMarkdown.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-24; C-60.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   default - History class: capture/restore snapshots with their footnote grammar and preserve edit indices.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - C-STABILIZE-SPLIT-DUAL-EDIT: single raw-payload snapshots, exact replay and constant-size caret metadata; legacy snapshots unchanged.
//   PREV: v1.2.0 - C-SPLIT-DUAL-EDIT: flushPendingExternal + commitExternal(meta) — external surfaces commit into the document history as single undoable entries (the caller renders with a noHistory cursor so the push happens exactly once).
//   PREV: v1.1.0 - 2026-10-18 C-60: stamp each snapshot's footnote grammar and lazily reparse mismatching/legacy snapshots on undo/redo.
// END_CHANGE_SUMMARY

import { deepCopy } from '../utils'
import { UNDO_DEPTH } from '../config'

// History stores both position changes and content changes, so we need a pointer to see what is the "last" actual content change.
class History {
  constructor(contentState) {
    this.stack = []
    this.id = -1 // unique id for each history entry
    this.index = -1 // what entry we are at in the stack
    this.contentState = contentState
    this.pendingIndex = -1
    this.lastEditIndex = -1 // The current index is not necessarily an "edit" operation.
    this.unified = false
  }

  updateFinalEditIndex() {
    for (let i = this.index; i >= 0; i--) {
      if (this.stack[i].cursor.isEdit) {
        this.lastEditIndex = i
        return
      }
    }
    this.lastEditIndex = -1
  }

  undo() {
    this.commitPending()
    if (this.index > 0) {
      this.index = this.index - 1
      this.updateFinalEditIndex()

      this.restore(this.stack[this.index])
    }
  }

  redo() {
    this.pendingIndex = -1
    const { index, stack } = this
    const len = stack.length
    if (index < len - 1) {
      this.index = index + 1
      this.updateFinalEditIndex()
      this.restore(stack[this.index])
    }
  }

  // START_BLOCK_HISTORY_FOOTNOTE_RESTORE
  restore(snapshot) {
    if (this.unified) this.replaying = true
    if (this.unified && typeof snapshot.markdown === 'string') {
      this.contentState.muya.setMarkdown(snapshot.markdown, null, false, snapshot.meta?.rich || {}, undefined, { renderOnly: true })
      this.replayMarkdown = snapshot.markdown
      return
    }
    const { blocks, cursor, renderRange, footnote } = deepCopy(snapshot)
    cursor.noHistory = true
    this.contentState.blocks = blocks
    this.contentState.renderRange = renderRange
    this.contentState.cursor = cursor
    const { muya } = this.contentState
    if (muya && footnote !== !!muya.options.footnote) {
      muya.reparseMarkdown(true)
    } else {
      this.contentState.render()
    }
  }
  // END_BLOCK_HISTORY_FOOTNOTE_RESTORE

  push(state, isPending = false) {
    if (!isPending) this.pendingIndex = -1 // Prevent instant reset of the pendingIndex
    // But, we should reset it if another event comes in that is not pending.
    this.stack.splice(this.index + 1)
    this.id += 1
    const copyState = { id: this.id, ...deepCopy(state), footnote: !!this.contentState.muya?.options.footnote }
    this.stack.push(copyState)
    if (this.stack.length > UNDO_DEPTH) {
      this.stack.shift()
      this.index = this.index - 1
    }
    this.index = this.index + 1
    this.updateFinalEditIndex()
    return this.index
  }

  pushPending(state) {
    if (this.pendingIndex === -1) {
      // No pending state yet
      this.pendingIndex = this.push(state, true)
    } else {
      // Replace the pending state
      const dirtyState = this.stack[this.pendingIndex]
      this.stack[this.pendingIndex] = { ...dirtyState, ...deepCopy(state), footnote: !!this.contentState.muya?.options.footnote }
    }
  }

  commitPending() {
    if (this.pendingIndex !== -1) {
      this.pendingIndex = -1
    }
  }

  clearHistory() {
    this.stack = []
    this.index = -1
    this.pendingIndex = -1
    this.lastEditIndex = -1
    this.unified = false
  }

  enableUnified(markdown, meta = {}) {
    if (this.unified) return
    this.commitPending()
    // Native history includes navigation snapshots. Collapse adjacent equal
    // documents once at activation, retaining real pre-split edits and ids.
    const compact = []
    let previous = null
    let nextIndex = -1
    this.stack.forEach((snapshot, index) => {
      const document = JSON.stringify(snapshot.blocks)
      if (document !== previous || !compact.length) compact.push(snapshot)
      else {
        const entry = compact[compact.length - 1]
        entry.cursor = { ...snapshot.cursor, isEdit: entry.cursor.isEdit }
      }
      if (index === this.index) nextIndex = compact.length - 1
      previous = document
    })
    this.stack = compact
    this.index = nextIndex
    this.updateFinalEditIndex()
    this.unified = true
    // Keep pre-split history, and stamp its current state with exact source.
    if (this.index < 0) this.push({ cursor: { isEdit: false } })
    const entry = this.stack[this.index]
    delete entry.blocks
    delete entry.renderRange
    Object.assign(entry, { markdown, meta: this.documentMeta(meta) })
  }

  documentMeta({ rich, source, focused } = {}) {
    // Selection text/UI state is never copied into a document snapshot.
    return deepCopy({ rich, source, focused })
  }

  commitDocument(markdown, meta = {}, pending = false) {
    const current = this.stack[this.index]
    if (current?.markdown === markdown) {
      current.meta = this.documentMeta(meta)
      return false
    }
    const state = { markdown, meta: this.documentMeta(meta), cursor: { isEdit: true } }
    if (pending) this.pushPending(state)
    else this.push(state)
    return true
  }

  // START_BLOCK_HISTORY_EXTERNAL_COMMIT
  // C-SPLIT-DUAL-EDIT: an external surface (the split CodeMirror pane, or a
  // unified undo/redo replay) commits the document through this entry point
  // so the change is one first-class undo step: the caller first flushes
  // any pending muya edit (flushPendingExternal), applies the new markdown
  // with a noHistory cursor so setMarkdown's importCursor does not push a
  // second entry, then pushes the resulting state here with renderer meta
  // (source surface, CodeMirror cursor at edit time) for caret restoration.
  flushPendingExternal() {
    this.commitPending()
  }

  commitExternal(meta = {}) {
    const cs = this.contentState
    this.push({
      blocks: cs.blocks,
      renderRange: cs.renderRange,
      cursor: { ...cs.cursor, isEdit: true },
      meta
    })
  }
  // END_BLOCK_HISTORY_EXTERNAL_COMMIT
}

export default History
