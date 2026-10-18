// FILE: src/muya/lib/contentState/history.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Maintain Muya content and selection undo/redo snapshots.
//   SCOPE: Pending edits, bounded history, edit indices and lazy restoration under the current footnote grammar.
//   DEPENDS: utils.deepCopy, config.UNDO_DEPTH, ContentState and Muya.reparseMarkdown.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-24; C-60.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   default - History class: capture/restore snapshots with their footnote grammar and preserve edit indices.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-18 C-60: stamp each snapshot's footnote grammar and lazily reparse mismatching/legacy snapshots on undo/redo.
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
  }
}

export default History
