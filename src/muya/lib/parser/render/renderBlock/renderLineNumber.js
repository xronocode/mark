// FILE: src/muya/lib/parser/render/renderBlock/renderLineNumber.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Build the non-editable line-numbers gutter vnode for a rendered code block (C-38 T-005, #1648).
//   SCOPE: Count the logical lines of the code block's text and render one empty counter span per line.
//   DEPENDS: muya snabbdom h; the .line-numbers CSS section in lib/assets/styles/index.css.
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-012 scenario-20; .grace/changes/active/C-38 T-005.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - renderLineNumberRows(codeBlock): span.line-numbers-rows vnode, aria-hidden + contenteditable=false, one empty span per logical line.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-15 C-38 T-005 (#1648): one span per logical
//   line counted over ALL code children (fence code keeps a single codeContent
//   span, so this equals its text), including the empty line after a trailing
//   newline; the gutter is aria-hidden and contenteditable=false so it never
//   joins the caret, selection, copy or markdown serialisation (the numbers
//   themselves are CSS counters on empty spans and produce no text).
//   v1.0.0 - upstream muya (disabled due to #1648 misalignment).
// END_CHANGE_SUMMARY

import { h } from '../snabbdom'

const countLogicalLines = (text) => {
  const newlines = text.match(/\n/g)
  return (newlines ? newlines.length : 0) + 1
}

// START_BLOCK_RENDER_LINE_NUMBERS
// The gutter mirrors the code block's logical lines, not its visual rows: a
// wrapped line keeps ONE number, anchored to its first visual row by the
// measured heights applied after render (utils/resizeCodeLineNumber.js).
const renderLineNumberRows = (codeBlock) => {
  const text = (codeBlock.children || [])
    .map((line) => (line && typeof line.text === 'string' ? line.text : ''))
    .join('\n')

  const data = {
    attrs: {
      'aria-hidden': 'true',
      contenteditable: 'false'
    }
  }
  const children = [...new Array(countLogicalLines(text))].map(() => h('span'))

  return h('span.line-numbers-rows', data, children)
}
// END_BLOCK_RENDER_LINE_NUMBERS

export default renderLineNumberRows
