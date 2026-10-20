// FILE: src/muya/lib/utils/tableExport.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-70 table picture export — turn a rendered GFM table into a self-contained standalone SVG string drawn from its live layout (cell/row backgrounds, cell borders, inline-code chips, every text run at its measured position in its computed font and colour), so the C-56 rasterizer (diagramExport.rasterizeSvg) can copy it as a 2× PNG or the host can save it as PNG/SVG exactly like a diagram.
//   SCOPE: pure DOM reads (getBoundingClientRect / getClientRects / getComputedStyle incl. the ::before/::after grid boxes themes draw / Range) + string building; muya's hidden syntax markers (ag-hide) and invisible text skipped; text decorations collected from ancestors; no foreignObject (a foreignObject SVG taints the canvas in WKWebView), no editor chrome (resize handles, toolbar, caption), images inside cells are skipped; injectable style/measure/range factories for tests. No clipboard, dialog or fs I/O.
//   DEPENDS: none (DOM only).
//   LINKS: .grace/changes/archive/C-70 R-1/R-2; consumers: src/renderer/src/components/editorWithTabs/editor.vue handleDiagramExportAction (table branch); muya tableResize (toolbar copyImage dispatch) and ui/blockViewer (table export buttons) dispatch muya-diagram-export with the table figure / live table.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE_EXPORT_FIGURE_SELECTOR - selector of the table figures that export as pictures ("figure[data-role='TABLE']").
//   TABLE_EXPORT_PADDING - px of panel background kept around the table in the picture.
//   resolveTableExportTable - element (figure, table, anything inside, or the viewer's live table) → the rendered table element or null.
//   escapeXml - text → XML-safe text/attribute content.
//   isTransparentColor - computed colour string → true for transparent / zero-alpha values.
//   buildTableSvg - table element → { svg, width, height } standalone SVG drawn from the live layout, or null when the table has no measurable size.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-19 C-70: first version — tables leave
//   Mark as pictures like diagrams. The picture is rebuilt from the live
//   geometry instead of serializing HTML: every line run of words is a <text> at its
//   measured box with textLength pinned to the measured width, so a font
//   the SVG-as-image context resolves differently can never overflow a
//   cell.
// END_CHANGE_SUMMARY

export const TABLE_EXPORT_FIGURE_SELECTOR = "figure[data-role='TABLE']"
export const TABLE_EXPORT_PADDING = 16

// Editor chrome that lives inside the table DOM but is not table content,
// plus muya's hidden Markdown syntax markers (**, `, [](url), ~~ — the
// ag-hide spans collapse to zero width but still own text).
const SKIP_SELECTOR = '.ag-column-resizer, .ag-table-toolbar, .ag-table-caption, .ag-hide, .ag-remove, [data-role="hidden"]'

// START_BLOCK_TABLE_EXPORT_RESOLVE
export const resolveTableExportTable = (el) => {
  if (!el || el.nodeType !== 1) return null
  if (el.tagName === 'TABLE') return el
  const figure = typeof el.closest === 'function' ? el.closest(TABLE_EXPORT_FIGURE_SELECTOR) : null
  const host = figure || el
  return typeof host.querySelector === 'function' ? host.querySelector('table') : null
}
// END_BLOCK_TABLE_EXPORT_RESOLVE

// START_BLOCK_TABLE_EXPORT_HELPERS
export const escapeXml = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

export const isTransparentColor = (color) => {
  if (!color) return true
  const c = String(color).trim().toLowerCase()
  if (c === 'transparent' || c === 'none' || c === '') return true
  const m = c.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length >= 4 && parseFloat(parts[3]) === 0) return true
  }
  return false
}

const round = (n) => Math.round(n * 100) / 100

const fontShorthand = (cs) =>
  `${cs.fontStyle || 'normal'} ${cs.fontWeight || '400'} ${cs.fontSize || '16px'} ${cs.fontFamily || 'sans-serif'}`

// Canvas font metrics: where the baseline sits inside a line box of the
// given font. Falls back to 0.8/0.2 of the font size (jsdom, no canvas).
const defaultMeasure = () => {
  let ctx = null
  try {
    const canvas = document.createElement('canvas')
    ctx = canvas.getContext && canvas.getContext('2d')
  } catch (_) {
    ctx = null
  }
  const cache = new Map()
  return (cs) => {
    const font = fontShorthand(cs)
    if (cache.has(font)) return cache.get(font)
    const size = parseFloat(cs.fontSize) || 16
    let ascent = size * 0.8
    let descent = size * 0.2
    if (ctx) {
      try {
        ctx.font = font
        const m = ctx.measureText('Hg')
        if (Number.isFinite(m.fontBoundingBoxAscent) && m.fontBoundingBoxAscent > 0) {
          ascent = m.fontBoundingBoxAscent
          descent = m.fontBoundingBoxDescent
        } else if (Number.isFinite(m.actualBoundingBoxAscent) && m.actualBoundingBoxAscent > 0) {
          ascent = m.actualBoundingBoxAscent
          descent = m.actualBoundingBoxDescent
        }
      } catch (_) { /* keep the fallback */ }
    }
    const metrics = { ascent, descent }
    cache.set(font, metrics)
    return metrics
  }
}

// The colour the table sits on: the first non-transparent background up
// the ancestor chain (the editor surface / theme paper), white otherwise.
const panelBackground = (table, getStyle) => {
  let node = table.parentElement
  while (node && node.nodeType === 1) {
    const bg = getStyle(node).backgroundColor
    if (!isTransparentColor(bg)) return bg
    node = node.parentElement
  }
  return '#ffffff'
}
// END_BLOCK_TABLE_EXPORT_HELPERS

// START_CONTRACT: buildTableSvg
//   PURPOSE: Draw the live table as a standalone SVG picture.
//   INPUTS: { table: HTMLTableElement - the rendered table, options: { padding?: number, getStyle?: (el, pseudo?) => CSSStyleDeclaration, measure?: (cs) => { ascent, descent }, createRange?: () => Range, background?: string } }
//   OUTPUTS: { { svg: string, width: number, height: number } | null - null when the table has no size (hidden pane) }
//   SIDE_EFFECTS: none (reads layout).
//   LINKS: diagramExport.rasterizeSvg (reads width/height from the SVG root).
// END_CONTRACT: buildTableSvg
// START_BLOCK_TABLE_EXPORT_BUILD
export const buildTableSvg = (table, {
  padding = TABLE_EXPORT_PADDING,
  getStyle = (el, pseudo) => window.getComputedStyle(el, pseudo || null),
  measure = defaultMeasure(),
  createRange = () => document.createRange(),
  background = null
} = {}) => {
  if (!table || typeof table.getBoundingClientRect !== 'function') return null
  const box = table.getBoundingClientRect()
  if (!box || !(box.width > 0) || !(box.height > 0)) return null
  const pad = Number.isFinite(padding) && padding >= 0 ? padding : TABLE_EXPORT_PADDING
  const width = Math.ceil(box.width + pad * 2)
  const height = Math.ceil(box.height + pad * 2)
  const ox = pad - box.left
  const oy = pad - box.top
  const rect = (r, fill, extra = '') =>
    `<rect x="${round(r.left + ox)}" y="${round(r.top + oy)}" width="${round(r.width)}" height="${round(r.height)}" fill="${escapeXml(fill)}"${extra}/>`

  const backgrounds = []
  const borders = []
  const chips = []
  const texts = []

  const tableStyle = getStyle(table)
  if (!isTransparentColor(tableStyle.backgroundColor)) backgrounds.push(rect(box, tableStyle.backgroundColor))

  const rows = Array.from(table.rows || [])
  for (const row of rows) {
    const rowStyle = getStyle(row)
    if (!isTransparentColor(rowStyle.backgroundColor)) backgrounds.push(rect(row.getBoundingClientRect(), rowStyle.backgroundColor))
    for (const cell of Array.from(row.cells || [])) {
      const r = cell.getBoundingClientRect()
      if (!(r.width > 0) || !(r.height > 0)) continue
      const cs = getStyle(cell)
      if (!isTransparentColor(cs.backgroundColor)) backgrounds.push(rect(r, cs.backgroundColor))
      collectBorders(r, cs)
      // Themes draw the grid with an absolutely positioned ::before/::after
      // box over the cell (muya default.css: 1px border, 100% + 1px) — the
      // cell itself often has no border at all.
      for (const pseudo of ['::before', '::after']) {
        const ps = getStyle(cell, pseudo)
        if (!ps || !ps.content || ps.content === 'none' || ps.position !== 'absolute') continue
        const left = r.left + (parseFloat(ps.left) || 0)
        const top = r.top + (parseFloat(ps.top) || 0)
        const width = parseFloat(ps.width) > 0 ? parseFloat(ps.width) : r.width
        const height = parseFloat(ps.height) > 0 ? parseFloat(ps.height) : r.height
        collectBorders({ left, top, width, height, right: left + width, bottom: top + height }, ps)
      }
      collectCellContent(cell)
    }
  }

  // Borders as thin rects (crisp at 2×, no stroke centring maths).
  function collectBorders (r, cs) {
    const sides = [
      ['Top', (w) => ({ left: r.left, top: r.top, width: r.width, height: w })],
      ['Bottom', (w) => ({ left: r.left, top: r.bottom - w, width: r.width, height: w })],
      ['Left', (w) => ({ left: r.left, top: r.top, width: w, height: r.height })],
      ['Right', (w) => ({ left: r.right - w, top: r.top, width: w, height: r.height })]
    ]
    for (const [side, geometry] of sides) {
      const w = parseFloat(cs[`border${side}Width`])
      const color = cs[`border${side}Color`]
      const style = cs[`border${side}Style`]
      if (!(w > 0) || style === 'none' || style === 'hidden' || isTransparentColor(color)) continue
      borders.push(rect(geometry(w), color))
    }
  }

  // Text decorations are not inherited in computed style: collect them
  // from the text's ancestors up to the cell (a, del, s, u, ins).
  function decorationsOf (el, cell) {
    const found = new Set()
    let node = el
    while (node && node.nodeType === 1) {
      const line = String(getStyle(node).textDecorationLine || '')
      if (line.includes('underline')) found.add('underline')
      if (line.includes('line-through')) found.add('line-through')
      if (node === cell) break
      node = node.parentElement
    }
    return Array.from(found).join(' ')
  }

  function isVisible (el) {
    const cs = getStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && parseFloat(cs.fontSize) !== 0
  }

  function collectCellContent (cell) {
    // Inline chips (code spans, marks): background boxes per line fragment.
    for (const el of Array.from(cell.querySelectorAll('code, mark, kbd'))) {
      if (el.closest(SKIP_SELECTOR)) continue
      const cs = getStyle(el)
      if (isTransparentColor(cs.backgroundColor)) continue
      const radius = parseFloat(cs.borderTopLeftRadius) || 0
      for (const r of Array.from(el.getClientRects())) {
        if (!(r.width > 0) || !(r.height > 0)) continue
        chips.push(rect(r, cs.backgroundColor, radius ? ` rx="${round(radius)}"` : ''))
      }
    }
    const doc = cell.ownerDocument || document
    const walker = doc.createTreeWalker(cell, 4 /* NodeFilter.SHOW_TEXT */)
    let node = walker.nextNode()
    while (node) {
      const parent = node.parentElement
      if (parent && !parent.closest(SKIP_SELECTOR) && node.nodeValue && node.nodeValue.trim() && isVisible(parent)) {
        emitTextNode(node, getStyle(parent), decorationsOf(parent, cell))
      }
      node = walker.nextNode()
    }
  }

  function emitRun (text, r, cs, decoration) {
    if (!text || !(r.width > 0) || !(r.height > 0)) return
    const { ascent, descent } = measure(cs)
    const baseline = r.top + (r.height - (ascent + descent)) / 2 + ascent
    const attrs = [
      `x="${round(r.left + ox)}"`,
      `y="${round(baseline + oy)}"`,
      `textLength="${round(r.width)}"`,
      'lengthAdjust="spacingAndGlyphs"',
      `font-family="${escapeXml(cs.fontFamily || 'sans-serif')}"`,
      `font-size="${escapeXml(cs.fontSize || '16px')}"`,
      `font-weight="${escapeXml(cs.fontWeight || '400')}"`,
      `font-style="${escapeXml(cs.fontStyle || 'normal')}"`,
      `fill="${escapeXml(isTransparentColor(cs.color) ? '#000000' : cs.color)}"`
    ]
    if (decoration) attrs.push(`text-decoration="${decoration}"`)
    texts.push(`<text ${attrs.join(' ')}>${escapeXml(text)}</text>`)
  }

  // Words of one text node that share a line merge into one <text> run
  // (continuous underline, fewer nodes) spanning first.left → last.right;
  // a word broken over lines (overflow-wrap: anywhere) falls back to
  // per-character boxes.
  function emitTextNode (textNode, cs, decoration) {
    const value = textNode.nodeValue
    const re = /\S+/g
    let line = null
    const flush = () => {
      if (!line) return
      const box = { left: line.left, top: line.top, width: line.right - line.left, height: line.height }
      box.right = box.left + box.width
      box.bottom = box.top + box.height
      emitRun(line.words.join(' '), box, cs, decoration)
      line = null
    }
    const add = (word, r) => {
      if (line && Math.abs(line.top - r.top) <= 1 && r.left >= line.right - 1) {
        line.words.push(word)
        line.right = r.right
        return
      }
      flush()
      line = { words: [word], left: r.left, right: r.right, top: r.top, height: r.height }
    }
    let match
    while ((match = re.exec(value))) {
      const start = match.index
      const end = start + match[0].length
      const range = createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, end)
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
      if (rects.length === 1) {
        add(match[0], rects[0])
      } else if (rects.length > 1) {
        flush()
        for (let i = start; i < end; i++) {
          const charRange = createRange()
          charRange.setStart(textNode, i)
          charRange.setEnd(textNode, i + 1)
          const cr = Array.from(charRange.getClientRects()).find((r) => r.width > 0 && r.height > 0)
          if (cr) emitRun(value[i], cr, cs, decoration)
        }
      }
    }
    flush()
  }

  const panel = background || panelBackground(table, getStyle)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(panel)}"/>`,
    ...backgrounds,
    ...chips,
    ...borders,
    ...texts,
    '</svg>'
  ].join('')
  return { svg, width, height }
}
// END_BLOCK_TABLE_EXPORT_BUILD
