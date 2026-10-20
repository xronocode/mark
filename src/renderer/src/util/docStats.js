// FILE: src/renderer/src/util/docStats.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Shared document-statistics helpers (lines, reading minutes, selection counts, status-bar visibility default) used by the C-40 T-002 title-bar document info popover and the C-40 T-004 status bar.
//   SCOPE: Pure computations over markdown/selection text plus the lazy per-OS statusBarVisibility default resolver; no DOM, no stores, no i18n.
//   DEPENDS: muya/lib/utils (wordCount).
//   LINKS: .grace/graph/runtime.xml M-011 fn-docStats; .grace/verification/runtime.xml V-M-011 scenario-55; .grace/changes/archive/C-40 T-002/T-004.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   READING_WORDS_PER_MINUTE - Reading-speed constant (words per minute) shared by the popover and the status bar.
//   countDocumentLines - Number of lines in a markdown string (split on \n; empty/absent markdown → 0).
//   readingMinutes - Reading time in whole minutes: words / 230 rounded up, minimum 1.
//   countSelectionStats - { word, character } of a selection string via muya's wordCount (same tokenizer as document counts).
//   defaultStatusBarVisibility - Per-OS status-bar default: off on macOS, on elsewhere (reads window.electron lazily — never at import time).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-10-15 v1.0.0 - C-40 T-004: extracted from the
//   titleBar document info popover (words/characters stay tab.wordCount
//   there; lines and reading minutes move here) and extended with the
//   selection counter and the per-OS status-bar default for the new
//   status bar. The popover and the status bar now share one source of
//   truth for line counting and reading time.
// END_CHANGE_SUMMARY

import { wordCount } from 'muya/lib/utils'

export const READING_WORDS_PER_MINUTE = 230

// START_BLOCK_COUNT_DOCUMENT_LINES
// The popover counted lines with `markdown ? markdown.split('\n').length : 0`;
// the status bar needs the identical number, so the formula lives here once.
export const countDocumentLines = (markdown) =>
  typeof markdown === 'string' && markdown.length > 0 ? markdown.split('\n').length : 0
// END_BLOCK_COUNT_DOCUMENT_LINES

// START_BLOCK_READING_MINUTES
// words/230 rounded up, minimum 1 — unchanged from the C-40 T-002 popover.
export const readingMinutes = (words) => {
  const n = Number(words)
  const safe = Number.isFinite(n) && n > 0 ? n : 0
  return Math.max(1, Math.ceil(safe / READING_WORDS_PER_MINUTE))
}
// END_BLOCK_READING_MINUTES

// START_BLOCK_SELECTION_STATS
// Selection-aware counts reuse muya's wordCount tokenizer so «12 words» in
// the status bar means the same thing as the document word count. The
// paragraph/all fields of the selection string are meaningless and dropped.
export const countSelectionStats = (text) => {
  if (typeof text !== 'string' || text.length === 0) {
    return { word: 0, character: 0 }
  }
  const { word, character } = wordCount(text)
  return { word: word || 0, character: character || 0 }
}
// END_BLOCK_SELECTION_STATS

// START_BLOCK_STATUS_BAR_OS_DEFAULT
// C-40 T-004 (approved canvas, option A): the status bar ships off on
// macOS and on on Windows/Linux. The platform is read lazily at store
// creation / reset time — never at module import, where tests have not
// installed window.electron yet. An absent or unreadable shim falls back
// to the Windows/Linux default (visible).
export const defaultStatusBarVisibility = () => {
  try {
    const platform = window.electron?.process?.platform
    return platform ? platform !== 'darwin' : true
  } catch (e) {
    return true
  }
}
// END_BLOCK_STATUS_BAR_OS_DEFAULT
