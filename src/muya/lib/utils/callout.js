// FILE: src/muya/lib/utils/callout.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Recognise GitHub alerts and Obsidian callouts from the first line of a blockquote.
//   SCOPE: Pure parsing of the `[!type]` marker line (type, alias-resolved style, title, fold) plus the style table shared by the editor and HTML export. No DOM, no state.
//   DEPENDS: none.
//   LINKS: .grace/changes/archive/C-24 R-5/R-7; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CALLOUT_STYLES - the base styles a callout can render with (GitHub five + Obsidian set).
//   CALLOUT_ALIASES - Obsidian alias -> base style.
//   parseCalloutMarker - parses a blockquote's first line into { type, style, title, fold, markerLength } or null.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-24: GitHub alerts and Obsidian callouts (aliases, custom titles, -/+ folds).
// END_CHANGE_SUMMARY

// START_BLOCK_CALLOUT_DETECT
export const CALLOUT_STYLES = [
  'note', 'abstract', 'info', 'todo', 'tip', 'important', 'success', 'question',
  'warning', 'caution', 'failure', 'danger', 'bug', 'example', 'quote'
]

export const CALLOUT_ALIASES = Object.freeze({
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote'
})

// `[!type]`, an optional fold sign, then an optional title on the same line.
// GitHub's five alerts are the subset with no fold and no title.
const CALLOUT_MARKER_REG = /^\[!([A-Za-z][\w-]*)\]([+-])?(?:[ \t]+([^\n]*?))?[ \t]*(?=\n|$)/

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export const parseCalloutMarker = (text) => {
  if (typeof text !== 'string') return null
  const match = CALLOUT_MARKER_REG.exec(text)
  if (!match) return null
  const type = match[1].toLowerCase()
  const style = CALLOUT_STYLES.includes(type) ? type : (CALLOUT_ALIASES[type] || 'note')
  const fold = match[2] === '-' ? 'collapsed' : match[2] === '+' ? 'expanded' : null
  const title = match[3] && match[3].trim() ? match[3].trim() : capitalize(type)
  return { type, style, title, fold, markerLength: match[0].length }
}
// END_BLOCK_CALLOUT_DETECT
