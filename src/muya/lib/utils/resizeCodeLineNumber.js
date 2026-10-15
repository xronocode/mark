// FILE: src/muya/lib/utils/resizeCodeLineNumber.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Size the line-numbers gutter of one code block so every number sits on the first visual row of its logical line (C-38 T-005, #1648).
//   SCOPE: resizeCodeBlockLineNumber(preEle) — non-wrapping code clears measured heights (natural one-line rows); wrapping code measures each logical line's top from the rendered text via collapsed caret rects and sets each row's height to bridge to the next line.
//   DEPENDS: DOM Range/TreeWalker/getComputedStyle; the .line-numbers CSS section in lib/assets/styles/index.css; called from contentState.resizeLineNumber (postRender + forced refreshes).
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-012 scenario-20; .grace/changes/active/C-38 T-005.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - resizeCodeBlockLineNumber(preEle): boolean — true when heights were applied or deliberately reset, false when measurement was impossible (element missing, text/gutter out of sync, no caret rects e.g. jsdom or a hidden editor).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-10-15 C-38 T-005 review: a line start resolves to the
//   text node containing it (not the end of the node holding the "\n"), the
//   first non-empty client rect is used (WebKit reports an empty one at the
//   previous row end), and only line-top differences are applied (the
//   gutter keeps its natural top) — verified by e2e in chromium + webkit.
//   PREVIOUS: v2.0.0 - 2026-10-15 C-38 T-005 (#1648): the upstream prism
//   sizer span was appended INSIDE the contenteditable code element — a
//   foreign child that snabbdom's positional patching then reshuffled every
//   render, and the re-measure walked the whole document per keystroke. The
//   rewrite mutates nothing inside the editable area: collapsed caret rects
//   of the real rendered text (prism tokens included) give each logical
//   line's exact top, so a wrapped line's number bridges all of its visual
//   rows. Rows are cleared back to natural heights when the code does not
//   wrap. Callers keep cost proportional: only pres re-rendered this pass
//   (stateRender.lineNumberPreKeys) or a forced refresh (wrap/font toggle,
//   container resize) are measured.
//   v1.0.0 - copied from prismjs/plugins/prism-line-number, disabled due to
//   #1648 (heavy performance issues, misalignment with wrapped lines).
// END_CHANGE_SUMMARY

// White-space values under which text wraps to several visual rows per
// logical line. `pre` (the wrapCodeBlocks-off mode) is deliberately absent:
// every logical line is exactly one row there and the gutter's natural
// one-line heights already align.
const WRAPPING_WHITE_SPACE = new Set(['pre-wrap', 'pre-line', 'break-spaces'])

const NEW_LINE_REG = /\n/g

const collectTextNodes = (root) => {
  const nodes = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Zero-length text nodes carry no offset space but a collapsed range
    // inside them has no rect — skip them.
    if (node.nodeValue.length > 0) {
      nodes.push(node)
    }
  }
  return nodes
}

// Map a text offset inside root to (textNode, nodeOffset).
// Resolve a character offset to the text node that CONTAINS it: a line
// start right after "\n" belongs to the next node, not to the end of the
// node holding the "\n" (whose end position sits on the previous visual
// row — the #1648 off-by-a-row). Only the very end of the text resolves to
// the end of the last node.
const locateOffset = (nodes, offset) => {
  let remaining = offset
  for (const node of nodes) {
    const length = node.nodeValue.length
    if (remaining < length) {
      return { node, offset: remaining }
    }
    remaining -= length
  }
  if (remaining === 0 && nodes.length > 0) {
    const last = nodes[nodes.length - 1]
    return { node: last, offset: last.nodeValue.length }
  }
  return null
}

// Top of the first visual row of the line starting at `offset`: the rect of
// its first character (a one-character range — collapsed carets at node
// boundaries are ambiguous across engines); the trailing empty line after a
// final "\n" has no character, so its collapsed caret is used.
const lineTopWithin = (nodes, offset, textLength, codeTop) => {
  const start = locateOffset(nodes, offset)
  if (!start) {
    return null
  }
  const range = document.createRange()
  try {
    range.setStart(start.node, start.offset)
    if (offset < textLength) {
      range.setEnd(start.node, start.offset + 1)
    } else {
      range.setEnd(start.node, start.offset)
    }
  } catch (err) {
    return null
  }
  // WebKit may report an empty rect at the previous row's end before the
  // character's own rect — take the first rect with a width.
  const rects = Array.from(range.getClientRects())
  const rect = rects.find((r) => r.width > 0) || rects[0] || range.getBoundingClientRect()
  if (!rect || (!rect.height && !rect.top && !rect.bottom)) {
    return null
  }
  return rect.top - codeTop
}

const roundPx = (value) => Math.round(value * 100) / 100

// START_BLOCK_RESIZE_CODE_LINE_NUMBERS
// With wrapping on, a logical line occupies as many visual rows as it wraps
// to; its number must bridge all of them. Heights come from caret tops
// measured on the real text:
//   row[i].height = top(line i+1) - top(line i)
// and the gutter is offset to top(line 0) so any code padding cannot shift
// the first number off its line. The last row keeps its natural height —
// nothing is below it. Failure mode: clear every measured height and return
// false, degrading to the wrap-off look instead of wrong overlaps.
const resizeCodeBlockLineNumber = function (preEle) {
  const codeEle = preEle.querySelector('code')
  const codeContentEle = preEle.querySelector('.ag-code-content')
  const rowsWrapper = preEle.querySelector('.line-numbers-rows')
  if (!codeEle || !codeContentEle || !rowsWrapper) {
    return false
  }

  const rows = Array.from(rowsWrapper.children)
  const clearMeasuredHeights = () => {
    for (const row of rows) {
      row.style.height = ''
    }
    rowsWrapper.style.top = ''
  }

  const styles = window.getComputedStyle(codeContentEle)
  if (!WRAPPING_WHITE_SPACE.has(styles.whiteSpace)) {
    // No wrapping: every gutter row is naturally one line tall (the gutter
    // inherits the code font/line-height). Drop any measured heights left
    // over from a wrapping configuration.
    clearMeasuredHeights()
    return true
  }

  const text = codeContentEle.textContent
  const textNodes = collectTextNodes(codeContentEle)
  if (rows.length === 0 || textNodes.length === 0) {
    clearMeasuredHeights()
    return false
  }

  const offsets = [0]
  let match
  NEW_LINE_REG.lastIndex = 0
  while ((match = NEW_LINE_REG.exec(text)) !== null) {
    offsets.push(match.index + 1)
  }
  // The gutter is rendered from the block model; if the DOM text disagrees
  // (mid-update), measuring now would mislabel rows — wait for the next pass.
  if (offsets.length !== rows.length) {
    clearMeasuredHeights()
    return false
  }

  const codeTop = codeEle.getBoundingClientRect().top
  let lineHeight = parseFloat(styles.lineHeight)
  if (!Number.isFinite(lineHeight)) {
    lineHeight = (parseFloat(styles.fontSize) || 16) * 1.2
  }

  const tops = []
  for (const offset of offsets) {
    const top = lineTopWithin(textNodes, offset, text.length, codeTop)
    if (top === null || Number.isNaN(top)) {
      clearMeasuredHeights()
      return false
    }
    // Monotonic guard: a caret rect can collapse onto the previous line at
    // an empty trailing line. Advance one line height instead of letting
    // numbers pile onto each other.
    if (tops.length > 0 && top < tops[tops.length - 1] + 1) {
      tops.push(tops[tops.length - 1] + lineHeight)
    } else {
      tops.push(top)
    }
  }

  // Only the DIFFERENCES between line tops are used: the gutter's natural
  // top already sits on the first line box (as with wrapping off), while a
  // character rect starts half a leading lower.
  rowsWrapper.style.top = ''
  for (let i = 0; i < rows.length - 1; i++) {
    rows[i].style.height = `${roundPx(tops[i + 1] - tops[i])}px`
  }
  rows[rows.length - 1].style.height = ''
  return true
}
// END_BLOCK_RESIZE_CODE_LINE_NUMBERS

export default resizeCodeBlockLineNumber
