// FILE: src/renderer/src/util/splitDualEdit.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-SPLIT-DUAL-EDIT — caret translation for the split panes (a remembered CodeMirror position re-maps into updated text) and the IME composition fence bookkeeping.
//   SCOPE: Pure helpers only; no DOM, no state beyond what is passed in.
//   DEPENDS: diff-match-patch.
//   LINKS: .grace/changes/archive/C-STABILIZE-SPLIT-DUAL-EDIT; components editor.vue, sourceCode.vue.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   translateAndClamp - Translate line/ch through old/new text diffs and clamp deleted positions; two-argument legacy clamp supported.
//   preserveSourceSyntax - Reapply only the native rich delta to exact raw source without normalizing unrelated syntax.
//   createCompositionFence - per-surface IME fence: arm() while composing, consumed() check, release() on compositionend (defers store-driven re-renders of the composing pane only).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-09 C-STABILIZE-SPLIT-DUAL-EDIT: Translate both selection endpoints through text deltas and merge native edits into exact source; pure per-surface IME fence.
//   LAST_CHANGE: v1.0.0 - C-SPLIT-DUAL-EDIT T-325 initial helpers.
// END_CHANGE_SUMMARY

import DiffMatchPatch from 'diff-match-patch'

export const translateAndClamp = (position, oldText, text = oldText) => {
  if (!position || !Number.isFinite(position.line) || !Number.isFinite(position.ch)) {
    return null
  }
  if (typeof text !== 'string') return null
  if (typeof oldText === 'string' && oldText !== text) {
    const oldLines = oldText.split('\n')
    const oldLine = Math.min(Math.max(0, position.line), oldLines.length - 1)
    const offset = oldLines.slice(0, oldLine).reduce((n, line) => n + line.length + 1, 0) + Math.min(Math.max(0, position.ch), oldLines[oldLine].length)
    const dmp = new DiffMatchPatch()
    const mapped = dmp.diff_xIndex(dmp.diff_main(oldText, text), offset)
    const prefix = text.slice(0, mapped).split('\n')
    return { line: prefix.length - 1, ch: prefix[prefix.length - 1].length }
  }
  const lines = text.split('\n')
  const line = Math.min(Math.max(0, position.line), lines.length - 1)
  const ch = Math.min(Math.max(0, position.ch), lines[line].length)
  return { line, ch }
}

// Apply the rich editor's actual text delta to the raw source. Parsing a
// source document must never normalize unrelated list markers or whitespace.
export const preserveSourceSyntax = (raw, before, after) => {
  if (raw === before || before === after) return before === after ? raw : after
  const dmp = new DiffMatchPatch()
  const [result, applied] = dmp.patch_apply(dmp.patch_make(before, after), raw)
  return applied.every(Boolean) ? result : after
}

// The fence belongs to ONE surface (the pane the user is composing in).
// While armed, store-driven re-renders of THAT pane are deferred; the other
// pane still updates. release() reports whether a deferred render was
// pending so the caller can flush it on compositionend.
export const createCompositionFence = () => {
  let armed = false
  let deferred = false
  return {
    arm () {
      armed = true
      deferred = false
    },
    isArmed () {
      return armed
    },
    markDeferred () {
      if (armed) {
        deferred = true
        return true
      }
      return false
    },
    release () {
      const hadDeferred = deferred
      armed = false
      deferred = false
      return hadDeferred
    }
  }
}
