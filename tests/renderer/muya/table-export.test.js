// FILE: tests/renderer/muya/table-export.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-70 table picture builder — the SVG is drawn from the live layout (size + padding, panel/row/cell backgrounds, borders, code chips, one text per word at its measured box with textLength), editor chrome is skipped, text is XML-escaped, zero-size tables yield null; plus the table toolbar's Copy as image button and the <doc>-table-N file name fallback.
//   SCOPE: src/muya/lib/utils/tableExport.js, renderTableToolbar.js copy button, diagramExport.suggestFileName noun.
//   DEPENDS: Vitest + jsdom with stubbed rects/styles/ranges (jsdom has no layout).
//   LINKS: .grace/changes/active/C-70 R-1/R-2/R-3; e2e tests/e2e/table-export.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   rectOf - DOMRect-like literal.
//   STYLES - per-element computed style stubs keyed by element.
//   styleOf - the getStyle injection reading STYLES with defaults.
//   buildFixture - a 2×2 table (header + one row, a code span, a resize handle) with stubbed geometry.
//   WORD_RECTS - stubbed word rects keyed by text node and start offset.
//   fakeRange - Range stand-in returning the stubbed word rects.
//   build - buildTableSvg with the stubbed style/measure/range injections.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-19 C-70: new.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import {
  buildTableSvg,
  escapeXml,
  isTransparentColor,
  resolveTableExportTable
} from 'muya/lib/utils/tableExport'
import { suggestFileName } from 'muya/lib/utils/diagramExport'
import renderTableToolbar from 'muya/lib/parser/render/renderBlock/renderTableToolbar'

vi.mock('muya/lib/renderers', () => ({ default: async () => ({}) }))

const rectOf = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })

const STYLES = new Map()
const styleOf = (el) => ({
  backgroundColor: 'rgba(0, 0, 0, 0)',
  color: 'rgb(20, 20, 20)',
  fontFamily: 'Inter, sans-serif',
  fontSize: '14px',
  fontWeight: '400',
  fontStyle: 'normal',
  borderTopWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', borderRightWidth: '0px',
  borderTopStyle: 'none', borderBottomStyle: 'none', borderLeftStyle: 'none', borderRightStyle: 'none',
  borderTopColor: 'rgb(0,0,0)', borderBottomColor: 'rgb(0,0,0)', borderLeftColor: 'rgb(0,0,0)', borderRightColor: 'rgb(0,0,0)',
  ...(STYLES.get(el) || {})
})

// Word rects keyed by the text node + start offset.
const WORD_RECTS = new Map()
const fakeRange = () => {
  const r = { node: null, start: 0 }
  return {
    setStart: (node, start) => { r.node = node; r.start = start },
    setEnd: () => {},
    getClientRects: () => (WORD_RECTS.get(r.node) || {})[r.start] || []
  }
}

const buildFixture = () => {
  STYLES.clear(); WORD_RECTS.clear()
  const host = document.createElement('div')
  host.innerHTML = `<figure data-role="TABLE"><div class="ag-table-scroll"><table class="ag-paragraph" id="t1">
    <thead><tr><th>Name<span class="ag-column-resizer">RZ</span></th><th>A &amp; B</th></tr></thead>
    <tbody><tr><td>one</td><td><code>x&lt;y</code></td></tr></tbody></table></div></figure>`
  document.body.appendChild(host)
  const table = host.querySelector('table')
  table.getBoundingClientRect = () => rectOf(100, 50, 200, 60)
  const [headRow, bodyRow] = table.rows
  headRow.getBoundingClientRect = () => rectOf(100, 50, 200, 30)
  bodyRow.getBoundingClientRect = () => rectOf(100, 80, 200, 30)
  STYLES.set(headRow, { backgroundColor: 'rgb(240, 240, 240)' })
  const cells = [...headRow.cells, ...bodyRow.cells]
  const cellRects = [rectOf(100, 50, 100, 30), rectOf(200, 50, 100, 30), rectOf(100, 80, 100, 30), rectOf(200, 80, 100, 30)]
  cells.forEach((cell, i) => {
    cell.getBoundingClientRect = () => cellRects[i]
    STYLES.set(cell, { borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgb(200, 200, 200)' })
  })
  STYLES.set(headRow.cells[0], {
    borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgb(200, 200, 200)', fontWeight: '600'
  })
  const textOf = (el) => Array.from(el.childNodes).find((n) => n.nodeType === 3)
  WORD_RECTS.set(textOf(headRow.cells[0]), { 0: [rectOf(110, 58, 40, 16)] })
  WORD_RECTS.set(textOf(headRow.cells[1]), { 0: [rectOf(210, 58, 10, 16)], 2: [rectOf(222, 58, 10, 16)], 4: [rectOf(234, 58, 10, 16)] })
  WORD_RECTS.set(textOf(bodyRow.cells[0]), { 0: [rectOf(110, 88, 24, 16)] })
  const code = bodyRow.cells[1].querySelector('code')
  WORD_RECTS.set(code.firstChild, { 0: [rectOf(212, 88, 30, 16)] })
  code.getClientRects = () => [rectOf(210, 86, 34, 20)]
  STYLES.set(code, { backgroundColor: 'rgb(230, 230, 250)', borderTopLeftRadius: '4px', fontFamily: 'Menlo, monospace' })
  STYLES.set(host, { backgroundColor: 'rgb(255, 255, 250)' })
  return { host, table }
}

const build = (table, extra = {}) => buildTableSvg(table, {
  getStyle: styleOf,
  measure: () => ({ ascent: 11, descent: 3 }),
  createRange: fakeRange,
  ...extra
})

describe('buildTableSvg (C-70 R-1)', () => {
  it('sizes the picture to the table plus padding and paints the panel colour', () => {
    const { table, host } = buildFixture()
    const out = build(table)
    expect(out.width).toBe(232)
    expect(out.height).toBe(92)
    expect(out.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="232" height="92" viewBox="0 0 232 92">')).toBe(true)
    expect(out.svg).toContain('<rect x="0" y="0" width="232" height="92" fill="rgb(255, 255, 250)"/>')
    expect(out.svg).not.toContain('foreignObject')
    host.remove()
  })

  it('draws the header row background, the cell borders and the code chip', () => {
    const { table, host } = buildFixture()
    const { svg } = build(table)
    expect(svg).toContain('<rect x="16" y="16" width="200" height="30" fill="rgb(240, 240, 240)"/>')
    // bottom border of the first header cell: 1px at the cell's bottom edge
    expect(svg).toContain('<rect x="16" y="45" width="100" height="1" fill="rgb(200, 200, 200)"/>')
    expect(svg).toContain('<rect x="126" y="52" width="34" height="20" fill="rgb(230, 230, 250)" rx="4"/>')
    host.remove()
  })

  it('places every word at its measured box with its font, pinned width and escaped text; chrome is skipped', () => {
    const { table, host } = buildFixture()
    const { svg } = build(table)
    // baseline = top + (height - (ascent + descent)) / 2 + ascent → 58 + 1 + 11 = 70 → +oy(-34) = 36
    expect(svg).toContain('<text x="26" y="36" textLength="40" lengthAdjust="spacingAndGlyphs" font-family="Inter, sans-serif" font-size="14px" font-weight="600" font-style="normal" fill="rgb(20, 20, 20)">Name</text>')
    // «A & B» shares one line → one merged run spanning 210 → 244.
    expect(svg).toContain('textLength="34" lengthAdjust="spacingAndGlyphs" font-family="Inter, sans-serif" font-size="14px" font-weight="400" font-style="normal" fill="rgb(20, 20, 20)">A &amp; B</text>')
    expect(svg).toContain('font-family="Menlo, monospace"')
    expect(svg).toContain('>x&lt;y</text>')
    expect(svg).not.toContain('RZ')
    host.remove()
  })

  it('returns null for a table without layout (hidden pane, jsdom default)', () => {
    const table = document.createElement('table')
    expect(buildTableSvg(table, { getStyle: styleOf })).toBeNull()
    expect(buildTableSvg(null)).toBeNull()
  })
})

describe('helpers', () => {
  it('escapeXml / isTransparentColor', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;')
    expect(isTransparentColor('rgba(0, 0, 0, 0)')).toBe(true)
    expect(isTransparentColor('transparent')).toBe(true)
    expect(isTransparentColor('')).toBe(true)
    expect(isTransparentColor('rgb(1, 2, 3)')).toBe(false)
    expect(isTransparentColor('rgba(1, 2, 3, 0.5)')).toBe(false)
  })

  it('resolveTableExportTable accepts the figure, the table and anything inside', () => {
    const { table, host } = buildFixture()
    expect(resolveTableExportTable(table)).toBe(table)
    expect(resolveTableExportTable(host.querySelector('figure'))).toBe(table)
    expect(resolveTableExportTable(table.querySelector('td'))).toBe(table)
    expect(resolveTableExportTable(null)).toBeNull()
    host.remove()
  })

  it('suggestFileName falls back to <doc>-table-N for tables', () => {
    expect(suggestFileName({ docName: 'notes.md', index: 2, ext: 'png', noun: 'table' })).toBe('notes-table-2.png')
    expect(suggestFileName({ docName: '', index: 1, ext: 'svg', noun: 'table' })).toBe('table-1.svg')
    expect(suggestFileName({ docName: 'notes.md', index: 2, ext: 'png' })).toBe('notes-diagram-2.png')
  })
})

describe('table toolbar Copy as image (C-70 R-2)', () => {
  it('renders the copy button between the toggle and Open full screen with the shared label', () => {
    const vnode = renderTableToolbar((key) => key, { fullWidth: false })
    const buttons = vnode.children
    expect(buttons).toHaveLength(3)
    expect(buttons[1].sel).toContain('ag-table-toolbar-copy')
    expect(buttons[1].data.dataset.tableToolbarAction).toBe('copyImage')
    expect(buttons[1].data.attrs['aria-label']).toBe('blockToolbar.copyImage')
    expect(buttons[2].data.dataset.tableToolbarAction).toBe('expand')
  })
})
