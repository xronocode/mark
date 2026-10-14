// FILE: tests/renderer/muya/table-scroll-wrapper.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-39 T-001 table scroll wrapper: the table element renders inside div.ag-table-scroll between the figure and the table, the table tools bar and front icon stay direct children of the figure, and the drag bars stay children of their cells.
//   SCOPE: START_BLOCK_TABLE_SCROLL_WRAPPER in src/muya/lib/parser/render/renderBlock/renderContainerBlock.js.
//   DEPENDS: StateRender (muya/lib/parser/render/index.js) with a mocked renderer loader, muya snabbdom h, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-39 T-001; .grace/verification/runtime.xml V-M-012 scenario-18; tests/e2e/table-layout.spec.ts for the laid-out behaviour.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeBlocks - the figure→table→thead/tbody→tr→th/td→span block tree fixture.
//   createStateRender - real StateRender with a fake muya and a stubbed renderLeafBlock.
//   renderFigure - renders the whole figure block with the given activeBlocks chain.
//   findVnode - depth-first vnode search by predicate.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-39 T-001: wrapper structure, toolbar/icon siblings, drag bars inside cells, table id preserved, non-table containers unwrapped; all fail against the pre-C-39 render (table was a direct child of the figure).
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import { h } from 'muya/lib/parser/render/snabbdom'

vi.mock('muya/lib/renderers', () => ({
  default: async () => ({})
}))

const makeBlocks = () => {
  const figure = { key: 'tf', type: 'figure', functionType: 'table', parent: null, children: [] }
  const table = { key: 'tt', type: 'table', row: 1, column: 1, parent: 'tf', children: [] }
  const thead = { key: 'thd', type: 'thead', parent: 'tt', children: [] }
  const tbody = { key: 'tbd', type: 'tbody', parent: 'tt', children: [] }
  const headRow = { key: 'tr0', type: 'tr', parent: 'thd', children: [] }
  const bodyRow = { key: 'tr1', type: 'tr', parent: 'tbd', children: [] }
  const th = { key: 'c0', type: 'th', align: '', column: 0, parent: 'tr0', children: [] }
  const td = { key: 'c1', type: 'td', align: '', column: 0, parent: 'tr1', children: [] }
  const thSpan = { key: 's0', type: 'span', functionType: 'cellContent', text: 'Head', parent: 'c0' }
  const tdSpan = { key: 's1', type: 'span', functionType: 'cellContent', text: 'Cell', parent: 'c1' }

  th.children.push(thSpan)
  td.children.push(tdSpan)
  headRow.children.push(th)
  bodyRow.children.push(td)
  thead.children.push(headRow)
  tbody.children.push(bodyRow)
  table.children.push(thead, tbody)
  figure.children.push(table)

  return { figure, table, thead, tbody, headRow, bodyRow, th, td, thSpan, tdSpan }
}

let StateRender

const createStateRender = async () => {
  if (!StateRender) {
    const mod = await import('muya/lib/parser/render/index')
    StateRender = mod.default
  }
  const sr = new StateRender({
    eventCenter: { dispatch: vi.fn() },
    options: {},
    contentState: {
      cursor: { start: { key: 'x' }, end: { key: 'x' } },
      selectedBlock: null,
      selectedTableCells: null
    }
  })
  // Keep the leaf rendering out of scope: cells render as plain spans.
  sr.renderLeafBlock = (parent, block, activeBlocks, matches, useCache, t) =>
    h(`span#${block.key}.ag-cell-content`, { dataset: {} }, block.text)
  return sr
}

const renderFigure = async (blocks, activeBlocks) => {
  const sr = await createStateRender()
  return sr.renderBlock(null, blocks.figure, activeBlocks, {}, false, (k) => k)
}

const findVnode = (vnode, predicate) => {
  if (!vnode) return null
  if (predicate(vnode)) return vnode
  for (const child of vnode.children || []) {
    const hit = findVnode(child, predicate)
    if (hit) return hit
  }
  return null
}

describe('table scroll wrapper (C-39 T-001)', () => {
  it('renders the table inside div.ag-table-scroll, a direct child of the figure', async () => {
    const blocks = makeBlocks()
    const figureVnode = await renderFigure(blocks, [])

    expect(figureVnode.sel.startsWith('figure#tf')).toBe(true)

    const wrapper = (figureVnode.children || []).find((c) => c.sel === 'div.ag-table-scroll')
    expect(wrapper, 'the figure must have a div.ag-table-scroll child').toBeTruthy()

    // The table keeps its id (drag/selection controllers look it up by key)
    // and is no longer a direct child of the figure.
    const tableVnode = (wrapper.children || []).find((c) => (c.sel || '').startsWith('table#tt'))
    expect(tableVnode, 'the table must be a child of the wrapper').toBeTruthy()
    expect((figureVnode.children || []).some((c) => (c.sel || '').startsWith('table#tt'))).toBe(false)

    // thead/tbody rows survive inside the table.
    expect(findVnode(tableVnode, (v) => (v.sel || '').startsWith('thead#thd'))).toBeTruthy()
    expect(findVnode(tableVnode, (v) => (v.sel || '').startsWith('tbody#tbd'))).toBeTruthy()
    expect(findVnode(tableVnode, (v) => (v.sel || '').startsWith('td#c1'))).toBeTruthy()
  })

  it('keeps the table tools bar and the front icon outside the wrapper (siblings of it)', async () => {
    const blocks = makeBlocks()
    // activeBlocks mirrors muya: [leaf span, cell, row, rowContainer, table, figure]
    const activeBlocks = [blocks.tdSpan, blocks.td, blocks.bodyRow, blocks.tbody, blocks.table, blocks.figure]
    const figureVnode = await renderFigure(blocks, activeBlocks)

    const wrapper = figureVnode.children.find((c) => c.sel === 'div.ag-table-scroll')
    expect(wrapper).toBeTruthy()

    // clickEvent resolves the toolbar via li -> ul -> div.ag-tool-table; the
    // toolbar must stay a direct child of the figure, not move into the
    // scroll wrapper.
    const toolbar = figureVnode.children.find((c) => (c.sel || '').startsWith('div.ag-tool-table'))
    expect(toolbar, 'the active table toolbar must be a figure child').toBeTruthy()
    expect(findVnode(wrapper, (v) => (v.sel || '').startsWith('div.ag-tool-table'))).toBeNull()
    expect(findVnode(wrapper, (v) => (v.sel || '').startsWith('a.ag-front-icon'))).toBeNull()
  })

  it('keeps the row/column drag bars as children of their cells inside the wrapper', async () => {
    const blocks = makeBlocks()
    const activeBlocks = [blocks.tdSpan, blocks.td, blocks.bodyRow, blocks.tbody, blocks.table, blocks.figure]
    const figureVnode = await renderFigure(blocks, activeBlocks)

    const tdVnode = findVnode(figureVnode, (v) => (v.sel || '').startsWith('td#c1'))
    expect(tdVnode).toBeTruthy()
    const sels = (tdVnode.children || []).map((c) => c.sel)
    expect(sels).toContain('span.ag-drag-handler.left')
    expect(sels).toContain('span.ag-drag-handler.bottom')

    // The bars must remain reachable from the table (mouseEvent targets
    // them via closest('tr') inside the table), i.e. inside the wrapper.
    const wrapper = figureVnode.children.find((c) => c.sel === 'div.ag-table-scroll')
    expect(findVnode(wrapper, (v) => v.sel === 'span.ag-drag-handler.left')).toBeTruthy()
  })

  it('renders no bars and no toolbar when the table is not active', async () => {
    const blocks = makeBlocks()
    const figureVnode = await renderFigure(blocks, [])
    expect(findVnode(figureVnode, (v) => v.sel === 'span.ag-drag-handler.left')).toBeNull()
    expect(findVnode(figureVnode, (v) => (v.sel || '').startsWith('div.ag-tool-table'))).toBeNull()
  })

  it('does not wrap non-table containers', async () => {
    const sr = await createStateRender()
    const quote = { key: 'bq', type: 'blockquote', parent: null, children: [{ key: 'p1', type: 'p', parent: 'bq', children: [{ key: 'sp', type: 'span', functionType: 'paragraphContent', text: 'q', parent: 'p1' }] }] }
    const vnode = sr.renderBlock(null, quote, [], {}, false, (k) => k)
    expect(vnode.sel.startsWith('blockquote#bq')).toBe(true)
    expect(findVnode(vnode, (v) => v.sel === 'div.ag-table-scroll')).toBeNull()
  })
})
