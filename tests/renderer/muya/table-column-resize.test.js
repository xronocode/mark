// FILE: tests/renderer/muya/table-column-resize.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin C-39 T-002 session-only table column resize: the width store keyed by table block key, min-width clamping, column-count reconciliation, the re-apply-after-render hook, the colgroup/resizer-handle vnodes, and the guarantee that resizing never touches markdown, history or DOM structure of unresized tables.
//   SCOPE: src/muya/lib/tableResize/index.js (store, reconcileWidths, reconcileAfterRender) and START_BLOCK_TABLE_COLUMN_WIDTHS / START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE in renderContainerBlock.js, plus the full render path via a real Muya in jsdom.
//   DEPENDS: TableResize, StateRender (mocked renderer loader), Muya (real instance), Vitest + jsdom.
//   LINKS: .grace/changes/active/C-39 T-002; .grace/verification/runtime.xml V-M-012 scenario-21; tests/e2e/table-column-resize.spec.ts for the laid-out drag behaviour; tests/renderer/muya/table-scroll-wrapper.test.js for the T-001 twin.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CLEANUP - teardown callbacks run after each test.
//   makeFakeMuya - fake muya {container, options, eventCenter, contentState} with a REAL TableResize instance attached.
//   buildTable - jsdom table with N header cells; omits the id attribute for missing-id guard scenarios.
//   stubCellWidths - monkey-patches getBoundingClientRect on the th cells (jsdom has no layout).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-19 C-65 R-7 coverage completion: finder
//   null/text-node/non-element guards, unmeasurable header rows, colgroup
//   trimming of surplus cols, the missing-container guards of
//   syncIdentities/reconcileAfterRender/refreshTableSurfaces, the
//   id-less and thead-less reconcile skips (stale entry kept), and the
//   figure-less surface-refresh skip.
//   v1.0.0 - 2026-10-15 C-39 T-002: clamp/reconcile maths, store isolation and cleanup, count-mismatch reconcile (incl. hidden-table skip), colgroup + handle vnodes, disabled-surface vnodes, and a full real-Muya render proving widths re-apply while markdown and history stay byte-identical. The colgroup/vnode cases fail without START_BLOCK_TABLE_COLUMN_WIDTHS; the store/reconcile cases fail without lib/tableResize.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi, afterEach } from 'vitest'
import { h } from 'muya/lib/parser/render/snabbdom'
import TableResize, {
  MIN_COLUMN_WIDTH,
  TABLE_FIXED_CLASS,
  RESIZER_CLASS,
  clampWidth,
  sumWidths,
  reconcileWidths
} from 'muya/lib/tableResize'

vi.mock('muya/lib/renderers', () => ({
  default: async () => ({})
}))

const CLEANUP = []
afterEach(() => {
  while (CLEANUP.length) CLEANUP.pop()()
})

const makeFakeMuya = (options = {}) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  CLEANUP.push(() => container.remove())
  const muya = {
    container,
    options,
    eventCenter: { attachDOMEvent: vi.fn(), dispatch: vi.fn() },
    contentState: {
      cursor: { start: { key: 'x' }, end: { key: 'x' } },
      selectedBlock: null,
      selectedTableCells: null
    }
  }
  muya.tableResize = new TableResize(muya)
  return muya
}

// jsdom has no layout engine: stub the th rects the way a laid-out table
// would report them.
const buildTable = (id, columnCount) => {
  const table = document.createElement('table')
  // No id passed → no id attribute (assigning undefined would stringify).
  if (id) table.id = id
  // muya renders every block with the ag-paragraph class; reconcile finds
  // tables via `table.ag-paragraph`.
  table.className = 'ag-paragraph'
  const thead = table.createTHead()
  const row = thead.insertRow(0)
  for (let i = 0; i < columnCount; i++) {
    row.appendChild(document.createElement('th'))
  }
  return table
}

const stubCellWidths = (table, widths) => {
  const cells = table.tHead.rows[0].cells
  for (let i = 0; i < cells.length; i++) {
    cells[i].getBoundingClientRect = () => ({ width: widths[i] })
  }
}

describe('table column resize maths (C-39 T-002)', () => {
  it('clamps dragged widths to the minimum column width', () => {
    expect(clampWidth(20)).toBe(MIN_COLUMN_WIDTH)
    expect(clampWidth(-100)).toBe(MIN_COLUMN_WIDTH)
    expect(clampWidth(120.4)).toBe(120)
    expect(clampWidth(120.6)).toBe(121)
  })

  it('sums clamped widths for the fixed table width', () => {
    expect(sumWidths([100, 20, 180.6])).toBe(100 + MIN_COLUMN_WIDTH + 181)
  })

  it('keeps surviving widths by index and measures new columns when a column is added', () => {
    const next = reconcileWidths([100, 200], [true, false], 3, [50, 60, 77])
    expect(next.widths).toEqual([100, 200, 77])
    expect(next.manual).toEqual([true, false, false])
  })

  it('drops the tail when a column is removed', () => {
    const next = reconcileWidths([100, 200, 300], [true, false, true], 2, [11, 22])
    expect(next.widths).toEqual([100, 200])
    expect(next.manual).toEqual([true, false])
  })

  it('falls back to the minimum for unmeasured new columns', () => {
    const next = reconcileWidths([100], [true], 3, undefined)
    expect(next.widths).toEqual([100, MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH])
    expect(next.manual).toEqual([true, false, false])
  })
})

describe('session width store (C-39 T-002)', () => {
  it('stores and returns widths per table key, isolated between tables', () => {
    const muya = makeFakeMuya()
    muya.tableResize.setTableWidths('t1', [120, 80], [true, false])
    muya.tableResize.setTableWidths('t2', [60])
    expect(muya.tableResize.getWidths('t1')).toEqual([120, 80])
    expect(muya.tableResize.getWidths('t2')).toEqual([60])
    expect(muya.tableResize.getWidths('t3')).toBeUndefined()
  })

  it('resets one table and clears everything (tab close surface)', () => {
    const muya = makeFakeMuya()
    muya.tableResize.setTableWidths('t1', [120, 80])
    muya.tableResize.setTableWidths('t2', [60])
    muya.tableResize.resetTable('t1')
    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
    expect(muya.tableResize.getWidths('t2')).toEqual([60])
    muya.tableResize.clearAll()
    expect(muya.tableResize.getWidths('t2')).toBeUndefined()
  })

  it('hands out render widths only for an exact column-count match', () => {
    const muya = makeFakeMuya()
    muya.tableResize.setTableWidths('t1', [120, 80])
    expect(muya.tableResize.getRenderWidths('t1', 2)).toBeTruthy()
    expect(muya.tableResize.getRenderWidths('t1', 3)).toBeNull()
    expect(muya.tableResize.getRenderWidths('t1', 0)).toBeNull()
    expect(muya.tableResize.getRenderWidths(undefined, 2)).toBeNull()
  })

  it('serves no render widths while the affordance is disabled', () => {
    const muya = makeFakeMuya({ disableTableColumnResize: true })
    muya.tableResize.setTableWidths('t1', [120, 80])
    expect(muya.tableResize.getRenderWidths('t1', 2)).toBeNull()
    expect(muya.tableResize.enabled()).toBe(false)
  })
})

describe('post-render reconciliation (C-39 T-002)', () => {
  it('reconciles stored widths when the column count changed (added column measured)', () => {
    const muya = makeFakeMuya()
    const table = buildTable('t1', 3)
    muya.container.appendChild(table)
    muya.tableResize.setTableWidths('t1', [100, 200], [true, false])
    stubCellWidths(table, [100, 200, 77])

    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.getWidths('t1')).toEqual([100, 200, 77])
    expect(table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    const cols = table.querySelectorAll('colgroup col')
    expect(cols.length).toBe(3)
    expect(cols[0].style.width).toBe('100px')
    expect(cols[2].style.width).toBe('77px')
    expect(table.style.width).toBe(`${100 + 200 + 77}px`)
  })

  it('truncates stored widths when a column was removed', () => {
    const muya = makeFakeMuya()
    const table = buildTable('t1', 2)
    muya.container.appendChild(table)
    muya.tableResize.setTableWidths('t1', [100, 200, 300], [true, false, true])
    stubCellWidths(table, [100, 200])

    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.getWidths('t1')).toEqual([100, 200])
    expect(table.querySelectorAll('colgroup col').length).toBe(2)
  })

  it('skips tables without usable layout and keeps the stale entry for the next render', () => {
    const muya = makeFakeMuya()
    const table = buildTable('t1', 3)
    muya.container.appendChild(table)
    // no stub: jsdom reports 0-width cells -> measurement refuses
    muya.tableResize.setTableWidths('t1', [100, 200], [true, false])

    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.getWidths('t1')).toEqual([100, 200])
    expect(table.classList.contains(TABLE_FIXED_CLASS)).toBe(false)
  })

  it('re-applies matching widths to a table the vnode left auto', () => {
    const muya = makeFakeMuya()
    const table = buildTable('t1', 2)
    muya.container.appendChild(table)
    muya.tableResize.setTableWidths('t1', [120, 80])
    stubCellWidths(table, [120, 80])

    muya.tableResize.reconcileAfterRender()

    expect(table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    expect(table.querySelector('colgroup col').style.width).toBe('120px')
  })
})

describe('rendered vnodes (C-39 T-002)', () => {
  const makeBlocks = (columnCount = 2) => {
    const figure = { key: 'tf', type: 'figure', functionType: 'table', parent: null, children: [] }
    const table = { key: 'tt', type: 'table', row: 2, column: columnCount, parent: 'tf', children: [] }
    const thead = { key: 'thd', type: 'thead', parent: 'tt', children: [] }
    const tbody = { key: 'tbd', type: 'tbody', parent: 'tt', children: [] }
    const headRow = { key: 'tr0', type: 'tr', parent: 'thd', children: [] }
    const bodyRow = { key: 'tr1', type: 'tr', parent: 'tbd', children: [] }
    table.children.push(thead, tbody)
    thead.children.push(headRow)
    tbody.children.push(bodyRow)
    for (let i = 0; i < columnCount; i++) {
      const th = { key: `h${i}`, type: 'th', align: '', column: i, parent: 'tr0', children: [] }
      const thSpan = { key: `hs${i}`, type: 'span', functionType: 'cellContent', text: `H${i}`, parent: `h${i}` }
      th.children.push(thSpan)
      headRow.children.push(th)
      const td = { key: `d${i}`, type: 'td', align: '', column: i, parent: 'tr1', children: [] }
      const tdSpan = { key: `ds${i}`, type: 'span', functionType: 'cellContent', text: `D${i}`, parent: `d${i}` }
      td.children.push(tdSpan)
      bodyRow.children.push(td)
    }
    figure.children.push(table)
    return { figure, table }
  }

  let StateRender
  const createStateRender = async (muya) => {
    if (!StateRender) {
      const mod = await import('muya/lib/parser/render/index')
      StateRender = mod.default
    }
    const sr = new StateRender(muya)
    sr.renderLeafBlock = (parent, block, activeBlocks, matches, useCache, t) =>
      h(`span#${block.key}.ag-cell-content`, { dataset: {} }, block.text)
    return sr
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

  const renderFigure = async (muya, blocks) => {
    const sr = await createStateRender(muya)
    return sr.renderBlock(null, blocks.figure, [], {}, false, (k) => k)
  }

  const tableVnodeOf = (figureVnode) => {
    const wrapper = figureVnode.children.find((c) => c.sel === 'div.ag-table-scroll')
    return wrapper.children.find((c) => (c.sel || '').startsWith('table#tt'))
  }

  it('renders the session colgroup, fixed class and width when widths are stored', async () => {
    const muya = makeFakeMuya()
    muya.tableResize.setTableWidths('tt', [120, 80], [true, false])
    const blocks = makeBlocks(2)
    const figureVnode = await renderFigure(muya, blocks)

    const tableVnode = tableVnodeOf(figureVnode)
    expect(tableVnode.sel).toContain(TABLE_FIXED_CLASS)
    expect(tableVnode.data.style.width).toBe('200px')
    const colgroup = (tableVnode.children || [])[0]
    expect(colgroup.sel).toBe('colgroup')
    const cols = colgroup.children
    expect(cols.length).toBe(2)
    expect(cols[0].sel).toBe('col')
    expect(cols[0].data.style.width).toBe('120px')
    expect(cols[1].data.style.width).toBe('80px')
  })

  it('keeps the auto layout when no widths are stored, but renders the header handles', async () => {
    const muya = makeFakeMuya()
    const blocks = makeBlocks(2)
    const figureVnode = await renderFigure(muya, blocks)

    const tableVnode = tableVnodeOf(figureVnode)
    expect(tableVnode.sel).not.toContain(TABLE_FIXED_CLASS)
    expect(tableVnode.data.style).toBeUndefined()
    expect((tableVnode.children || []).some((c) => c.sel === 'colgroup')).toBe(false)
    // The invisible hit zones: one per header cell, none in body cells.
    const headRow = findVnode(figureVnode, (v) => (v.sel || '').startsWith('tr#tr0'))
    const handlesInHead = (headRow.children || []).filter((th) =>
      (th.children || []).some((c) => c.sel === `span.${RESIZER_CLASS}`)
    )
    expect(handlesInHead.length).toBe(2)
    const bodyRow = findVnode(figureVnode, (v) => (v.sel || '').startsWith('tr#tr1'))
    const handlesInBody = (bodyRow.children || []).filter((td) =>
      (td.children || []).some((c) => c.sel === `span.${RESIZER_CLASS}`)
    )
    expect(handlesInBody.length).toBe(0)
  })

  it('renders auto layout when the stored column count differs', async () => {
    const muya = makeFakeMuya()
    muya.tableResize.setTableWidths('tt', [120, 80, 60], [true, false, false])
    const blocks = makeBlocks(2)
    const figureVnode = await renderFigure(muya, blocks)

    const tableVnode = tableVnodeOf(figureVnode)
    expect(tableVnode.sel).not.toContain(TABLE_FIXED_CLASS)
    expect((tableVnode.children || []).some((c) => c.sel === 'colgroup')).toBe(false)
  })

  it('renders no handles and no colgroup when the affordance is disabled', async () => {
    const muya = makeFakeMuya({ disableTableColumnResize: true })
    muya.tableResize.setTableWidths('tt', [120, 80], [true, false])
    const blocks = makeBlocks(2)
    const figureVnode = await renderFigure(muya, blocks)

    expect(findVnode(figureVnode, (v) => v.sel === `span.${RESIZER_CLASS}`)).toBeNull()
    const tableVnode = tableVnodeOf(figureVnode)
    expect(tableVnode.sel).not.toContain(TABLE_FIXED_CLASS)
    expect((tableVnode.children || []).some((c) => c.sel === 'colgroup')).toBe(false)
  })
})

describe('session resize never touches the document (C-39 T-002)', () => {
  const TABLE_MD = '| A | B |\n| --- | --- |\n| 1 | 2 |\n'

  // Real Muya over a table document. The instance is NOT destroyed (destroy
  // expects the UI plugins the app registers); removing its container from
  // the DOM is enough for the test.
  const mountMuya = async () => {
    const { default: Muya } = await import('muya/lib')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const muya = new Muya(el, { markdown: TABLE_MD })
    CLEANUP.push(() => muya.container.remove())
    return muya
  }

  it('a full re-render re-applies stored widths and leaves markdown and history untouched', async () => {
    const muya = await mountMuya()
    const markdownBefore = muya.getMarkdown()
    const historyBefore = JSON.stringify(muya.getHistory())
    const tableId = muya.container.querySelector('table.ag-paragraph').id
    expect(tableId).toBeTruthy()

    muya.tableResize.setTableWidths(tableId, [120, 80], [true, false])
    muya.contentState.render(false)

    const table = muya.container.querySelector('table.ag-paragraph')
    expect(table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    expect(table.querySelector('colgroup col').style.width).toBe('120px')
    expect(table.style.width).toBe('200px')
    // Widths never reach the markdown and never push an undo entry.
    expect(muya.getMarkdown()).toBe(markdownBefore)
    expect(JSON.stringify(muya.getHistory())).toBe(historyBefore)
  })

  it('a render after resetTable returns the table to auto layout', async () => {
    const muya = await mountMuya()
    const tableId = muya.container.querySelector('table.ag-paragraph').id
    muya.tableResize.setTableWidths(tableId, [120, 80], [true, false])
    muya.contentState.render(false)
    expect(muya.container.querySelector('table.ag-paragraph').classList.contains(TABLE_FIXED_CLASS)).toBe(true)

    muya.tableResize.resetTable(tableId)
    muya.contentState.render(false)

    const table = muya.container.querySelector('table.ag-paragraph')
    expect(table.classList.contains(TABLE_FIXED_CLASS)).toBe(false)
    expect(table.querySelector('colgroup')).toBeNull()
  })
})

describe('guard paths over unusable surfaces (C-39/C-65 R-7)', () => {
  it('the target finders return null for null, text-node and non-element targets', () => {
    const muya = makeFakeMuya()
    const text = document.createTextNode('x')
    expect(muya.tableResize.findHandle(null)).toBeNull()
    expect(muya.tableResize.findHandle(text)).toBeNull()
    expect(muya.tableResize.findHandle({})).toBeNull()
    expect(muya.tableResize.findTableToolbarButton(null)).toBeNull()
    expect(muya.tableResize.findTableToolbarButton(text)).toBeNull()
    expect(muya.tableResize.findTableFigure(null)).toBeNull()
    expect(muya.tableResize.findTableFigure(text)).toBeNull()
    const handle = document.createElement('span')
    handle.className = RESIZER_CLASS
    muya.container.appendChild(handle)
    expect(muya.tableResize.findHandle(handle)).toBe(handle)
  })

  it('measureColumnWidths refuses tables without a usable header row', () => {
    const muya = makeFakeMuya()
    expect(muya.tableResize.measureColumnWidths(document.createElement('table'))).toBeNull()
    const emptyRow = document.createElement('table')
    emptyRow.createTHead().insertRow(0)
    expect(muya.tableResize.measureColumnWidths(emptyRow)).toBeNull()
  })

  it('applyWidths trims surplus cols from an existing colgroup', () => {
    const muya = makeFakeMuya()
    const table = buildTable('t1', 1)
    const colgroup = document.createElement('colgroup')
    for (let i = 0; i < 3; i++) colgroup.appendChild(document.createElement('col'))
    table.insertBefore(colgroup, table.firstChild)

    muya.tableResize.applyWidths(table, { widths: [100], manual: [true] })

    expect(colgroup.children.length).toBe(1)
    expect(colgroup.children[0].style.width).toBe('100px')
  })

  it('syncIdentities, reconcileAfterRender and refreshTableSurfaces survive a missing container', () => {
    const muya = makeFakeMuya()
    muya.tableResize.setTableWidths('t1', [100], [true])
    muya.container = null
    expect(muya.tableResize.syncIdentities()).toBe(false)
    expect(() => muya.tableResize.reconcileAfterRender()).not.toThrow()
    expect(() => muya.tableResize.refreshTableSurfaces()).not.toThrow()
    muya.container = {}
    expect(muya.tableResize.syncIdentities()).toBe(false)
    expect(() => muya.tableResize.reconcileAfterRender()).not.toThrow()
    expect(() => muya.tableResize.refreshTableSurfaces()).not.toThrow()
    // The stale entry survives for the next render on a real container.
    expect(muya.tableResize.getWidths('t1')).toEqual([100])
  })

  it('reconcile skips id-less tables and tables without a header row, keeping their stale entries', () => {
    const muya = makeFakeMuya()
    const good = buildTable('t1', 2)
    const noId = buildTable(undefined, 1)
    const noHead = document.createElement('table')
    noHead.id = 't3'
    noHead.className = 'ag-paragraph'
    noHead.appendChild(document.createElement('tbody'))
    muya.container.append(good, noId, noHead)
    muya.tableResize.setTableWidths('t1', [100, 200], [true, false])
    muya.tableResize.setTableWidths('t3', [90], [true])
    stubCellWidths(good, [100, 200])

    muya.tableResize.reconcileAfterRender()

    expect(good.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    // t3 has no header row: the entry is kept stale for a later render.
    expect(muya.tableResize.getWidths('t3')).toEqual([90])
    expect(muya.tableResize.identities.has('t3')).toBe(false)
  })

  it('refreshTableSurfaces skips figures without a usable table', () => {
    const muya = makeFakeMuya()
    const childless = document.createElement('figure')
    childless.setAttribute('data-role', 'TABLE')
    const idless = document.createElement('figure')
    idless.setAttribute('data-role', 'TABLE')
    idless.appendChild(buildTable(undefined, 1))
    muya.container.append(childless, idless)
    expect(() => muya.tableResize.refreshTableSurfaces()).not.toThrow()
  })
})
