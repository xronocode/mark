// FILE: tests/renderer/muya/table-layout-persistence.test.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-65 T-001/T-004 persistent table layout behaviour of muya.tableResize — the persistent identity (ordinal + header signature), adoption of stored entries into fresh block keys, the identity-change drop (header edited / column count changed — corner-2), the unseen-entry drop, the serialize/dispatch write path (only after real user actions), the Full width toggle (class + toolbar DOM + persistence) and the capture-phase toolbar/caption routing incl. the viewer dispatch and the disabled-surface guard.
//   SCOPE: src/muya/lib/tableResize/index.js (syncIdentities, applyPersistedLayouts, serializeTableLayouts, persist, toggle/openViewer, handleToolbarClick/Mousedown, handleScrollCapture, sanitizePersistedEntries, tableSignature) and the R-3 reset-persist paths of handleDoubleClick / handlePointerUp.
//   DEPENDS: TableResize with a real-listener event-center double, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-65 T-001/T-004; .grace/verification/runtime.xml V-M-012 scenario-66; the store twin tests/renderer/store/table-layout-store.test.js; the C-39 maths twin tests/renderer/muya/table-column-resize.test.js; e2e tests/e2e/table-width-persistence.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CLEANUP - teardown callbacks run after each test.
//   makeFakeMuya - fake muya {container, options, eventCenter with REAL addEventListener-backed attachDOMEvent, dispatch spy} with a real TableResize.
//   buildTableFigure - jsdom figure[data-role=TABLE] > div.ag-table-scroll > table.ag-paragraph with header texts, ids and stubbed cell rects.
//   buildToolbarDom - the live toolbar DOM TableResize swaps on toggle (button + label span + svg path).
//   makeWide - stubs natural and text-column widths for Full width defaults; geometry cases pin the client viewport independently of the outline.
//   pidOf - computes the expected ordinal#signature identity of a buildTableFigure fixture.
//   buildBareTable - jsdom table.ag-paragraph with a thead (or tbody) row of th cells, NOT wrapped in a figure — the guard paths where closest('figure') must miss.
//   addHandles - appends one .ag-column-resizer span per row cell; returns the handles.
//   pidOf - computes the expected ordinal#signature identity of a buildTableFigure/buildBareTable fixture.
//   T - test helper (T).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-19 C-71-TABLE-CENTER: outline geometry never reserves table viewport width or shifts the page center.
//   v1.2.0 - 2026-10-19 C-71: viewport geometry, scrollbar
//   coordinates, overlay ownership, removed auto-width entries and C-70
//   copy routing; integrate and update the reviewed c65cov guard tests.
//   v1.1.0 - 2026-10-19 Full width default: a wide table gets
//   the mode with nothing persisted, «Fit to page» on it persists fit: true
//   and survives a reload, a fitting table / disabled option / mirror stay
//   untouched; entries now carry the fit flag.
//   v1.1.0 - 2026-10-19 C-65 R-7 coverage completion: the
//   finder null guards, the handle-mousedown eat, the caption/scroll
//   routing guards, the full-width DOM fallbacks (null figure, no wrapper,
//   no editor anchor, no container, unparseable margin), the key-fallback
//   toolbar translator, the svg/label-less toolbar swap, identity edge
//   cases (no id / no header cells / bare-table change / bare full-width
//   adoption / removed table), applyPersistedLayouts(null), the pointer
//   guards (non-handle, right button, disabled, unusable cell/table/id/
//   column index, unmeasurable baseline, existing entry, optional pointer
//   capture, figure-less pointerup) and the double-click guards (off-handle,
//   disabled, no entry, bare full reset, thead-less partial reset).
//   v1.0.0 - 2026-10-18 C-65: new — every adoption/drop/persist
//   case fails without the identity machinery; the toggle/click cases fail
//   without the capture-phase routing; the R-3 cases fail when the reset
//   paths do not persist.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import TableResize, {
  MIN_COLUMN_WIDTH,
  RESIZER_CLASS,
  TABLE_FULL_WIDTH_CLASS,
  hashHeaderText,
  overflowsTextColumn,
  sanitizePersistedEntries,
  tableSignature
} from 'muya/lib/tableResize'
import { TABLE_CAPTION_CLASS } from 'muya/lib/tableResize/tableCue'
import { TOOLBAR_TABLE_FULLWIDTH_ICON_PATH } from 'muya/lib/parser/render/renderBlock/renderTableToolbar'

vi.mock('muya/lib/renderers', () => ({
  default: async () => ({})
}))

const CLEANUP = []
afterEach(() => {
  while (CLEANUP.length) CLEANUP.pop()()
})

// START_BLOCK_PERSISTENCE_FIXTURES
const T = (key, params) => {
  const templates = {
    'tableToolbar.fullWidth': 'Full width',
    'tableToolbar.fitToPage': 'Fit to page',
    'tableToolbar.columnsRange': 'columns {start}–{end} of {total}',
    'tableToolbar.allColumns': 'all {total} columns'
  }
  let text = templates[key] || key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(`{${name}}`, String(value))
    }
  }
  return text
}

const makeFakeMuya = (options = {}) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  CLEANUP.push(() => container.remove())
  const muya = {
    container,
    options: Object.assign({ t: T }, options),
    eventCenter: {
      dispatch: vi.fn(),
      attachDOMEvent: (target, type, handler, capture) =>
        target.addEventListener(type, handler, capture)
    },
    contentState: {
      cursor: { start: { key: 'x' }, end: { key: 'x' } },
      selectedBlock: null,
      selectedTableCells: null
    }
  }
  muya.tableResize = new TableResize(muya)
  return muya
}

const buildTableFigure = (id, headerTexts, { width = 120 } = {}) => {
  const figure = document.createElement('figure')
  figure.setAttribute('data-role', 'TABLE')
  figure.id = `f-${id}`
  const wrapper = document.createElement('div')
  wrapper.className = 'ag-table-scroll'
  const table = document.createElement('table')
  table.id = id
  table.className = 'ag-paragraph'
  const thead = table.createTHead()
  const row = thead.insertRow(0)
  headerTexts.forEach((text) => {
    const th = document.createElement('th')
    th.textContent = text
    row.appendChild(th)
  })
  table.appendChild(document.createElement('tbody'))
  wrapper.appendChild(table)
  figure.appendChild(wrapper)
  const caption = document.createElement('div')
  caption.className = TABLE_CAPTION_CLASS
  figure.appendChild(caption)
  for (const cell of row.cells) {
    cell.getBoundingClientRect = () => ({ left: 0, width, height: 20 })
  }
  return { figure, wrapper, table, row, caption }
}

// The live toggle DOM updateToolbarToggleDom expects (the vnode builds this
// in the real editor; the persistence tests exercise the swap path).
const buildToolbarDom = (figure) => {
  const toolbar = document.createElement('div')
  toolbar.className = 'ag-block-toolbar ag-table-toolbar'
  const toggle = document.createElement('button')
  toggle.className = 'ag-block-expand ag-block-toolbar-btn ag-table-toolbar-btn ag-table-toolbar-toggle'
  toggle.dataset.tableToolbarAction = 'toggleFullWidth'
  toggle.title = 'Full width'
  toggle.setAttribute('aria-label', 'Full width')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  svg.appendChild(path)
  const span = document.createElement('span')
  span.className = 'ag-block-toolbar-label'
  span.textContent = 'Full width'
  toggle.appendChild(svg)
  toggle.appendChild(span)
  const expand = document.createElement('button')
  expand.className = 'ag-block-expand ag-block-toolbar-btn ag-table-toolbar-btn ag-block-toolbar-expand ag-table-toolbar-expand'
  expand.dataset.tableToolbarAction = 'expand'
  toolbar.appendChild(toggle)
  toolbar.appendChild(expand)
  figure.insertBefore(toolbar, figure.firstChild)
  return { toolbar, toggle, expand, span, path }
}

const pidOf = (ordinal, headerTexts) =>
  `${ordinal}#${headerTexts.length}:${hashHeaderText(headerTexts.map(t => t.trim()).join('\u0001'))}`

// A table outside any figure — the guard paths where closest('figure')
// must miss. With inTbody the row lives in a tbody and the table has NO
// thead at all (the thead-less dblclick/measure paths).
const buildBareTable = (id, headerTexts, { inTbody = false } = {}) => {
  const table = document.createElement('table')
  if (id) table.id = id
  table.className = 'ag-paragraph'
  const section = inTbody ? document.createElement('tbody') : table.createTHead()
  const row = section.insertRow(0)
  headerTexts.forEach((text) => {
    const th = document.createElement('th')
    th.textContent = text
    row.appendChild(th)
  })
  table.appendChild(section)
  return { table, row }
}

const addHandles = (row) => {
  const handles = []
  for (const cell of row.cells) {
    const handle = document.createElement('span')
    handle.className = RESIZER_CLASS
    cell.appendChild(handle)
    handles.push(handle)
  }
  return handles
}
// END_BLOCK_PERSISTENCE_FIXTURES

// START_BLOCK_IDENTITY_ASSERTIONS
describe('persistent identity (C-65 R-1)', () => {
  it('hashes header texts deterministically; the signature counts the columns', () => {
    expect(hashHeaderText('abc')).toBe(hashHeaderText('abc'))
    expect(hashHeaderText('abc')).not.toBe(hashHeaderText('abd'))
    const rowOf = (texts) => {
      const table = document.createElement('table')
      const row = table.createTHead().insertRow(0)
      texts.forEach((t) => {
        const th = document.createElement('th')
        th.textContent = t
        row.appendChild(th)
      })
      return row
    }
    expect(tableSignature(rowOf(['A', 'B']))).toBe(tableSignature(rowOf(['A', 'B'])))
    expect(tableSignature(rowOf(['A', 'B']))).not.toBe(tableSignature(rowOf(['A', 'B', 'C'])))
    expect(tableSignature(rowOf(['A', 'B']))).not.toBe(tableSignature(rowOf(['A', 'X'])))
    // Whitespace is trimmed so re-flowed markdown keeps the identity.
    expect(tableSignature(rowOf([' A ', 'B']))).toBe(tableSignature(rowOf(['A', 'B '])))
    expect(tableSignature(null)).toBeNull()
    expect(tableSignature(document.createElement('table').createTHead().insertRow(0))).toBeNull()
  })

  it('sanitizes persisted entries: widths clamped, invalid dropped, fullWidth-only kept', () => {
    const entries = sanitizePersistedEntries({
      '0#2:x': { widths: [120, 20], manual: [true], fullWidth: false },
      '1#1:y': { widths: [], manual: [], fullWidth: true },
      '2#1:z': { widths: [90], manual: [false], fullWidth: false },
      '3#1:w': { widths: ['nan', 90], manual: [true] },
      'not-an-entry': 'nope'
    })
    expect(Object.keys(entries).sort()).toEqual(['0#2:x', '1#1:y', '3#1:w'])
    expect(entries['0#2:x'].widths).toEqual([120, MIN_COLUMN_WIDTH])
    expect(entries['0#2:x'].manual).toEqual([true, false])
    expect(entries['1#1:y']).toEqual({ widths: [], manual: [], fullWidth: true, fit: false })
    expect(entries['3#1:w'].widths).toEqual([90])
    expect(sanitizePersistedEntries(null)).toBeNull()
    expect(sanitizePersistedEntries('x')).toBeNull()
  })

  it('a fullWidth-only entry without a widths array survives; empty husks drop', () => {
    const entries = sanitizePersistedEntries({
      '0#1:fw': { fullWidth: true },
      '1#1:husk': {},
      '2#1:manual-only': { manual: [true] }
    })
    // The husks have no widths AND no fullWidth — nothing to restore.
    expect(Object.keys(entries)).toEqual(['0#1:fw'])
    expect(entries['0#1:fw']).toEqual({ widths: [], manual: [], fullWidth: true, fit: false })
  })
})

describe('adoption and drops (C-65 R-1, corners 1/2/3/5)', () => {
  it('adopts stored widths + manual flags and the full-width mode into fresh block keys', () => {
    const muya = makeFakeMuya()
    const { figure, wrapper, table } = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(figure)
    const pid = pidOf(0, ['Alpha', 'Beta'])

    muya.tableResize.applyPersistedLayouts({
      [pid]: { widths: [120, 80], manual: [true, false], fullWidth: true }
    })

    expect(muya.tableResize.getWidths('t1')).toEqual([120, 80])
    expect(table.classList.contains('ag-column-widths-fixed')).toBe(true)
    expect(table.querySelector('colgroup col').style.width).toBe('120px')
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)
    expect(muya.tableResize.isFullWidth('t1')).toBe(true)
    // Adoption never writes back (corner-5: nothing was resized here).
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalledWith('muya-table-layouts', expect.anything())
  })

  it('a stored column-count mismatch adopts no widths (the identity includes the count)', () => {
    const muya = makeFakeMuya()
    const { figure, table } = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(figure)
    const pid = pidOf(0, ['Alpha', 'Beta'])

    muya.tableResize.applyPersistedLayouts({
      [pid]: { widths: [120, 80, 60], manual: [true, false, false], fullWidth: false }
    })

    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
    expect(table.classList.contains('ag-column-widths-fixed')).toBe(false)
  })

  it('an edited header drops that table\'s widths while others keep theirs (corner-2)', () => {
    const muya = makeFakeMuya()
    const first = buildTableFigure('t1', ['Alpha', 'Beta'])
    const second = buildTableFigure('t2', ['One', 'Two'])
    muya.container.append(first.figure, second.figure)
    muya.tableResize.setTableWidths('t1', [120, 80], [true, false])
    muya.tableResize.setTableWidths('t2', [90, 70], [true, true])
    // First render maps the identities…
    muya.tableResize.reconcileAfterRender()
    expect(muya.tableResize.getWidths('t1')).toEqual([120, 80])

    // …then the user edits t1's header text: its identity changes.
    first.row.cells[0].textContent = 'Renamed'
    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
    expect(first.table.classList.contains('ag-column-widths-fixed')).toBe(false)
    expect(first.table.querySelector('colgroup')).toBeNull()
    expect(muya.tableResize.getWidths('t2')).toEqual([90, 70])
    expect(second.table.classList.contains('ag-column-widths-fixed')).toBe(true)
  })

  it('a column-count change drops the widths through the same identity rule', () => {
    const muya = makeFakeMuya()
    const { figure, row } = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(figure)
    muya.tableResize.setTableWidths('t1', [120, 80], [true, false])
    muya.tableResize.reconcileAfterRender()

    const extra = document.createElement('th')
    extra.textContent = 'Gamma'
    extra.getBoundingClientRect = () => ({ left: 0, width: 60, height: 20 })
    row.appendChild(extra)
    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
  })

  it('persisted entries whose identity disappeared are dropped from the live store', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const pid = pidOf(0, ['Alpha'])
    muya.tableResize.applyPersistedLayouts({
      [pid]: { widths: [120], manual: [true], fullWidth: false },
      '5#1:gone': { widths: [200], manual: [true], fullWidth: false }
    })
    expect(Object.keys(muya.tableResize.persisted)).toEqual([pid])
  })

  it('a table whose identity changed also loses a stale full-width mode', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const pid = pidOf(0, ['Alpha'])
    muya.tableResize.applyPersistedLayouts({ [pid]: { widths: [], manual: [], fullWidth: true } })
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)

    figure.querySelector('th').textContent = 'Changed'
    muya.tableResize.reconcileAfterRender()
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.tableResize.isFullWidth('t1')).toBe(false)
  })
})
// END_BLOCK_IDENTITY_ASSERTIONS

// START_BLOCK_PERSIST_ASSERTIONS
describe('serialize + persist (C-65 R-1: written only after a real action)', () => {
  it('serializes only tables with a manual column or the full-width mode, keyed by identity', () => {
    const muya = makeFakeMuya()
    const first = buildTableFigure('t1', ['Alpha', 'Beta'])
    const second = buildTableFigure('t2', ['One'])
    const third = buildTableFigure('t3', ['X', 'Y'])
    muya.container.append(first.figure, second.figure, third.figure)
    muya.tableResize.setTableWidths('t1', [120, 80], [true, false])
    muya.tableResize.setTableWidths('t2', [90], [false])
    muya.tableResize.fullWidth.add('t3')
    muya.tableResize.reconcileAfterRender()

    const entries = muya.tableResize.serializeTableLayouts()
    expect(Object.keys(entries).sort()).toEqual([pidOf(0, ['Alpha', 'Beta']), pidOf(2, ['X', 'Y'])].sort())
    expect(entries[pidOf(2, ['X', 'Y'])]).toEqual({ widths: [], manual: [], fullWidth: true, fit: false })
  })

  it('persist dispatches muya-table-layouts with the serialized entries', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    muya.tableResize.setTableWidths('t1', [120], [true])
    muya.tableResize.persist()
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [120], manual: [true], fullWidth: false, fit: false } }
    })
  })
})
// END_BLOCK_PERSIST_ASSERTIONS

// START_BLOCK_DEFAULT_FULL_WIDTH_ASSERTIONS
const makeWide = (figure, tableWidth, columnWidth = 700) => {
  const table = figure.querySelector('table')
  table.getBoundingClientRect = () => ({ left: 0, top: 0, right: tableWidth, bottom: 40, width: tableWidth, height: 40 })
  Object.defineProperty(figure, 'clientWidth', { configurable: true, get: () => columnWidth })
}

describe('Full width is the default for wide tables (C-65 R-6, 2026-10-19)', () => {
  it('overflowsTextColumn: only a measurable table wider than the column triggers', () => {
    expect(overflowsTextColumn(900, 700)).toBe(true)
    expect(overflowsTextColumn(701, 700)).toBe(false) // 1px tolerance
    expect(overflowsTextColumn(500, 700)).toBe(false)
    expect(overflowsTextColumn(900, 0)).toBe(false) // zero geometry
    expect(overflowsTextColumn(NaN, 700)).toBe(false)
  })

  it('a wide table opens in Full width without writing anything; a fitting one does not', () => {
    const muya = makeFakeMuya()
    const wide = buildTableFigure('t1', ['Alpha'])
    const narrow = buildTableFigure('t2', ['Beta'])
    muya.container.appendChild(wide.figure)
    muya.container.appendChild(narrow.figure)
    makeWide(wide.figure, 1200)
    makeWide(narrow.figure, 300)

    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.isFullWidth('t1')).toBe(true)
    expect(wide.figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)
    expect(muya.tableResize.isFullWidth('t2')).toBe(false)
    expect(narrow.figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalledWith('muya-table-layouts', expect.anything())
    expect(muya.tableResize.serializeTableLayouts()).toEqual({})
  })

  it('«Fit to page» on a default-wide table persists fit and survives a reload', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    makeWide(figure, 1200)
    const { toggle } = buildToolbarDom(figure)
    muya.tableResize.reconcileAfterRender()
    expect(muya.tableResize.isFullWidth('t1')).toBe(true)

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(muya.tableResize.isFullWidth('t1')).toBe(false)
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.eventCenter.dispatch).toHaveBeenLastCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [], manual: [], fullWidth: false, fit: true } }
    })
    // The next render does not re-apply the default over the choice.
    muya.tableResize.reconcileAfterRender()
    expect(muya.tableResize.isFullWidth('t1')).toBe(false)

    // A fresh surface (reopen) adopts the stored choice.
    const reopened = makeFakeMuya()
    const again = buildTableFigure('k9', ['Alpha'])
    reopened.container.appendChild(again.figure)
    makeWide(again.figure, 1200)
    reopened.tableResize.applyPersistedLayouts({
      [pidOf(0, ['Alpha'])]: { widths: [], manual: [], fullWidth: false, fit: true }
    })
    reopened.tableResize.reconcileAfterRender()
    expect(reopened.tableResize.isFullWidth('k9')).toBe(false)

    // Full width again: back to an explicit Full width entry.
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(muya.tableResize.isFullWidth('t1')).toBe(true)
    expect(muya.eventCenter.dispatch).toHaveBeenLastCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [], manual: [], fullWidth: true, fit: false } }
    })
  })

  it('the default follows the table: it narrows back when the table becomes narrow', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    makeWide(figure, 1200)
    muya.tableResize.reconcileAfterRender()
    expect(muya.tableResize.isFullWidth('t1')).toBe(true)
    makeWide(figure, 400)
    muya.tableResize.reconcileAfterRender()
    expect(muya.tableResize.isFullWidth('t1')).toBe(false)
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
  })

  it('tableFullWidthDefault: false and the read-only mirror keep wide tables fitted', () => {
    for (const options of [{ tableFullWidthDefault: false }, { disableTableColumnResize: true }]) {
      const muya = makeFakeMuya(options)
      const { figure } = buildTableFigure('t1', ['Alpha'])
      muya.container.appendChild(figure)
      makeWide(figure, 1200)
      muya.tableResize.reconcileAfterRender()
      expect(muya.tableResize.isFullWidth('t1')).toBe(false)
    }
  })

  it('sanitize keeps a fit-only entry and lets Full width win a contradictory one', () => {
    const entries = sanitizePersistedEntries({
      'a': { widths: [], manual: [], fit: true },
      'b': { widths: [], manual: [], fullWidth: true, fit: true }
    })
    expect(entries.a).toEqual({ widths: [], manual: [], fullWidth: false, fit: true })
    expect(entries.b).toEqual({ widths: [], manual: [], fullWidth: true, fit: false })
  })
})
// END_BLOCK_DEFAULT_FULL_WIDTH_ASSERTIONS

// START_BLOCK_TOGGLE_ASSERTIONS
describe('full width toggle + toolbar routing (C-65 R-4/R-6)', () => {
  it('a capture-phase click on the toggle flips the class, swaps the label/icon and persists', () => {
    const muya = makeFakeMuya()
    const { figure, wrapper } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { toggle, span, path } = buildToolbarDom(figure)

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)
    expect(muya.tableResize.isFullWidth('t1')).toBe(true)
    expect(toggle.classList.contains('ag-table-toolbar-active')).toBe(true)
    expect(toggle.title).toBe('Fit to page')
    expect(toggle.getAttribute('aria-label')).toBe('Fit to page')
    expect(span.textContent).toBe('Fit to page')
    expect(path.getAttribute('d')).toBeDefined()
    expect(wrapper.style.marginLeft).toBe('') // jsdom zero geometry: no breakout
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [], manual: [], fullWidth: true, fit: false } }
    })

    // Back to Fit to page: the entry disappears (nothing user-made remains).
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.eventCenter.dispatch).toHaveBeenLastCalledWith('muya-table-layouts', { entries: {} })
  })

  it('the expand button dispatches muya-block-viewer with the figure', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { expand } = buildToolbarDom(figure)

    expand.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-block-viewer', { element: figure })
  })

  it('a disabled surface (the Split View mirror) ignores the toggle', () => {
    const muya = makeFakeMuya({ disableTableColumnResize: true })
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { toggle } = buildToolbarDom(figure)

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalled()
  })

  it('mousedown on a toolbar button stops propagation without eating the focus default', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { toggle } = buildToolbarDom(figure)
    const bubbled = vi.fn()
    muya.container.addEventListener('mousedown', bubbled)

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    toggle.dispatchEvent(event)

    expect(bubbled).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('a click on the caption never reaches muya\'s caret routing', () => {
    const muya = makeFakeMuya()
    const { figure, caption } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const bubbled = vi.fn()
    muya.container.addEventListener('click', bubbled)

    caption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(bubbled).not.toHaveBeenCalled()

    // A plain paragraph click still bubbles (the guard is scoped).
    const p = document.createElement('p')
    muya.container.appendChild(p)
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(bubbled).toHaveBeenCalled()
  })

  it('the geometry breakout applies the measured inline margin and is cleared on fit-back', () => {
    const muya = makeFakeMuya()
    const { figure, wrapper } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    // The editor root sits 50px left of the wrapper (theme padding).
    const editor = document.createElement('div')
    editor.id = 'ag-editor-id'
    editor.appendChild(figure)
    muya.container.appendChild(editor)
    wrapper.getBoundingClientRect = () => ({ left: 60, width: 400 })
    muya.container.getBoundingClientRect = () => ({ left: 10, width: 800 })
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ marginLeft: '-11px' })
    CLEANUP.push(() => styleSpy.mockRestore())

    muya.tableResize.toggleFullWidthFromElement(figure.querySelector('button.ag-table-toolbar-toggle') || figure)

    // A table wider than the editor area (natural width unknown → no fit)
    // starts FULL_WIDTH_GUTTER_PX from the edge: offset 50 → -11 - 50 + 24.
    expect(wrapper.style.marginLeft).toBe('-37px')

    muya.tableResize.toggleFullWidthFromElement(figure)
    expect(wrapper.style.marginLeft).toBe('')
  })

  it('a Full width table that fits the editor area is centred in it', () => {
    const muya = makeFakeMuya()
    const { figure, wrapper, table } = buildTableFigure('t1', ['Alpha'])
    const editor = document.createElement('div')
    editor.id = 'ag-editor-id'
    editor.appendChild(figure)
    muya.container.appendChild(editor)
    wrapper.getBoundingClientRect = () => ({ left: 60, width: 400 })
    table.getBoundingClientRect = () => ({ left: 60, width: 500 })
    muya.container.getBoundingClientRect = () => ({ left: 10, width: 800 })
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ marginLeft: '-11px' })
    CLEANUP.push(() => styleSpy.mockRestore())

    muya.tableResize.toggleFullWidthFromElement(figure)
    // The viewport starts at the gutter, and CSS auto margins center the
    // table inside its 752px width even when fonts change after this pass.
    expect(wrapper.style.marginLeft).toBe('-37px')
    expect(wrapper.style.width).toBe('752px')
  })

  it('scrolling a wrapper refreshes its cue through the capture listener', () => {
    const muya = makeFakeMuya()
    const { figure, wrapper, caption } = buildTableFigure('t1', ['A', 'B', 'C', 'D', 'E'])
    muya.container.appendChild(figure)
    wrapper.getBoundingClientRect = () => ({ left: 100, width: 200 })
    Object.defineProperty(wrapper, 'clientWidth', { value: 200, configurable: true })
    let left = 100
    for (const cell of figure.querySelectorAll('th')) {
      const cellLeft = left // capture per cell (a shared `left` made every rect the last one)
      cell.getBoundingClientRect = () => ({ left: cellLeft, width: 100 })
      left += 100
    }

    wrapper.dispatchEvent(new Event('scroll'))

    expect(caption.classList.contains('ag-table-caption-on')).toBe(true)
    expect(caption.textContent).toBe('columns 1–2 of 5')
  })
})
// END_BLOCK_TOGGLE_ASSERTIONS

// START_BLOCK_RESET_PERSIST_ASSERTIONS
describe('reset paths persist (C-65 R-3)', () => {
  const withHandle = (muya, headerTexts) => {
    const built = buildTableFigure('t1', headerTexts)
    muya.container.appendChild(built.figure)
    for (const cell of built.row.cells) {
      const handle = document.createElement('span')
      handle.className = 'ag-column-resizer'
      cell.appendChild(handle)
    }
    return built
  }

  it('double-click with no other manual column resets the table and persists the removal', () => {
    const muya = makeFakeMuya()
    const { row } = withHandle(muya, ['Alpha'])
    muya.tableResize.setTableWidths('t1', [120], [true])
    muya.tableResize.reconcileAfterRender()

    row.cells[0].querySelector('.ag-column-resizer')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', { entries: {} })
  })

  it('double-click with other manual columns resets only that column and persists the entry', () => {
    const muya = makeFakeMuya()
    const { row, table } = withHandle(muya, ['Alpha', 'Beta'])
    muya.tableResize.setTableWidths('t1', [120, 80], [true, true])
    muya.tableResize.reconcileAfterRender()

    row.cells[1].querySelector('.ag-column-resizer')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    // The reset column keeps its MEASURED auto width (the stub sizes both
    // header cells at 120) and loses its manual flag; the other stays.
    expect(muya.tableResize.getWidths('t1')).toEqual([120, 120])
    const entry = muya.tableResize.widths.get('t1')
    expect(entry.manual).toEqual([true, false])
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha', 'Beta'])]: { widths: [120, 120], manual: [true, false], fullWidth: false, fit: false } }
    })
    expect(table.classList.contains('ag-column-widths-fixed')).toBe(true)
  })

  it('a drag with movement persists; a plain handle click does not', () => {
    const muya = makeFakeMuya()
    const { row, table } = withHandle(muya, ['Alpha'])
    const handle = row.cells[0].querySelector('.ag-column-resizer')

    // Plain click: pointerdown + pointerup without movement — the baseline
    // entry created on pointerdown is undone and NOTHING persists.
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 100 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalled()

    // Real drag: +60px.
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 100 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(muya.tableResize.getWidths('t1')).toEqual([180])
    expect(table.classList.contains('ag-column-widths-fixed')).toBe(true)
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [180], manual: [true], fullWidth: false, fit: false } }
    })
  })
})
// END_BLOCK_RESET_PERSIST_ASSERTIONS

// START_BLOCK_GUARD_ASSERTIONS
describe('finder + capture routing guards (C-65 R-7)', () => {
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

  it('mousedown on a resizer handle is eaten before muya can place the caret', () => {
    const muya = makeFakeMuya()
    const { figure, row } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const [handle] = addHandles(row)
    const bubbled = vi.fn()
    muya.container.addEventListener('mousedown', bubbled)

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    handle.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(bubbled).not.toHaveBeenCalled()
  })

  it('mousedown outside the toolbar buttons evaluates the caption branch; a null target is inert', () => {
    const muya = makeFakeMuya()
    const { figure, caption } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const bubbled = vi.fn()
    muya.container.addEventListener('mousedown', bubbled)

    caption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(bubbled).not.toHaveBeenCalled()

    const p = document.createElement('p')
    muya.container.appendChild(p)
    p.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(bubbled).toHaveBeenCalled()

    expect(() => muya.tableResize.handleToolbarMousedown({ target: null })).not.toThrow()
    expect(() => muya.tableResize.handleToolbarClick({
      target: null, preventDefault: vi.fn(), stopPropagation: vi.fn()
    })).not.toThrow()
  })

  it('the scroll capture ignores plain elements, stray wrappers and non-element targets', () => {
    const muya = makeFakeMuya()
    const plain = document.createElement('div')
    muya.container.appendChild(plain)
    expect(() => plain.dispatchEvent(new Event('scroll'))).not.toThrow()

    // A wrapper-looking div outside any table figure: no cue to refresh.
    const stray = document.createElement('div')
    stray.className = 'ag-table-scroll'
    muya.container.appendChild(stray)
    expect(() => stray.dispatchEvent(new Event('scroll'))).not.toThrow()

    expect(() => muya.tableResize.handleScrollCapture({ target: null })).not.toThrow()
    expect(() => muya.tableResize.handleScrollCapture({ target: {} })).not.toThrow()
    expect(() => muya.tableResize.handleScrollCapture({
      target: { classList: { contains: () => true } }
    })).not.toThrow()
  })

  it('the toggle and the viewer ignore non-figure elements and figures without a usable table', () => {
    const muya = makeFakeMuya()
    muya.tableResize.toggleFullWidthFromElement(document.createElement('p'))

    const tableless = document.createElement('figure')
    tableless.setAttribute('data-role', 'TABLE')
    muya.container.appendChild(tableless)
    muya.tableResize.toggleFullWidthFromElement(tableless)

    const idless = document.createElement('figure')
    idless.setAttribute('data-role', 'TABLE')
    idless.appendChild(document.createElement('table'))
    muya.container.appendChild(idless)
    muya.tableResize.toggleFullWidthFromElement(idless)

    muya.tableResize.openViewerFromElement(document.createElement('p'))
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalled()
  })
})

describe('full-width DOM guards (C-65 R-6/R-7)', () => {
  it('applyPersistedLayouts(null) keeps a null persisted store', () => {
    const muya = makeFakeMuya()
    muya.tableResize.applyPersistedLayouts(null)
    expect(muya.tableResize.persisted).toBeNull()
  })

  it('applyFullWidthDom tolerates a null figure and a figure without a wrapper', () => {
    const muya = makeFakeMuya()
    expect(() => muya.tableResize.applyFullWidthDom(null, true)).not.toThrow()
    const bare = document.createElement('figure')
    muya.tableResize.applyFullWidthDom(bare, true)
    expect(bare.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)
  })

  it('the breakout geometry refuses unusable anchors: no wrapper, no editor, no container, unparseable margin', () => {
    const muya = makeFakeMuya()
    // No wrapper at all.
    expect(() => muya.tableResize.applyFullWidthGeometry(document.createElement('figure'))).not.toThrow()

    // Wrapper present but no editor anchor: the figure sits outside the
    // muya container and the container itself is empty.
    const outside = buildTableFigure('t1', ['Alpha'])
    expect(() => muya.tableResize.applyFullWidthGeometry(outside.figure)).not.toThrow()

    // Editor anchor found (an #ag-editor-id host) but the muya container is
    // gone — first missing entirely, then without getBoundingClientRect.
    const host = document.createElement('div')
    host.id = 'ag-editor-id'
    const hosted = buildTableFigure('t2', ['Alpha'])
    host.appendChild(hosted.figure)
    document.body.appendChild(host)
    CLEANUP.push(() => host.remove())
    const saved = muya.container
    muya.container = null
    expect(() => muya.tableResize.applyFullWidthGeometry(hosted.figure)).not.toThrow()
    muya.container = {}
    expect(() => muya.tableResize.applyFullWidthGeometry(hosted.figure)).not.toThrow()
    muya.container = saved

    // A measurable offset but an unparseable current margin: no breakout.
    const third = buildTableFigure('t3', ['Alpha'])
    muya.container.appendChild(third.figure)
    third.wrapper.getBoundingClientRect = () => ({ left: 60, width: 400 })
    muya.container.getBoundingClientRect = () => ({ left: 10, width: 800 })
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ marginLeft: 'auto' })
    CLEANUP.push(() => styleSpy.mockRestore())
    muya.tableResize.applyFullWidthGeometry(third.figure)
    expect(third.wrapper.style.marginLeft).toBe('')
  })

  it('the toggle label falls back to the i18n key when muya has no translator', () => {
    const muya = makeFakeMuya({ t: null })
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { toggle, span } = buildToolbarDom(figure)

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(toggle.title).toBe('tableToolbar.fitToPage')
    expect(toggle.getAttribute('aria-label')).toBe('tableToolbar.fitToPage')
    expect(span.textContent).toBe('tableToolbar.fitToPage')
  })

  it('the icon/label swap tolerates a button without svg or without a label span', () => {
    const muya = makeFakeMuya()
    const first = document.createElement('figure')
    first.setAttribute('data-role', 'TABLE')
    const spanOnly = document.createElement('button')
    spanOnly.className = 'ag-table-toolbar-toggle'
    const span = document.createElement('span')
    span.className = 'ag-block-toolbar-label'
    spanOnly.appendChild(span)
    first.appendChild(spanOnly)
    muya.container.appendChild(first)

    muya.tableResize.updateToolbarToggleDom(first, true)
    expect(span.textContent).toBe('Fit to page')
    expect(spanOnly.classList.contains('ag-table-toolbar-active')).toBe(true)

    const second = document.createElement('figure')
    second.setAttribute('data-role', 'TABLE')
    const iconOnly = document.createElement('button')
    iconOnly.className = 'ag-table-toolbar-toggle'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    svg.appendChild(path)
    iconOnly.appendChild(svg)
    second.appendChild(iconOnly)
    muya.container.appendChild(second)

    muya.tableResize.updateToolbarToggleDom(second, false)
    expect(iconOnly.title).toBe('Full width')
    expect(path.getAttribute('d')).toBe(TOOLBAR_TABLE_FULLWIDTH_ICON_PATH)
  })
})

describe('identity edge cases (C-65 R-1/R-7)', () => {
  it('tables without an id or without header cells never mint an identity', () => {
    const muya = makeFakeMuya()
    const noId = buildBareTable('', ['A'])
    const emptyRow = buildBareTable('t2', [])
    const good = buildBareTable('t1', ['Alpha'])
    muya.container.append(noId.table, emptyRow.table, good.table)
    muya.tableResize.setTableWidths('t1', [120], [true])

    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.identities.size).toBe(1)
    expect(muya.tableResize.identities.has('t1')).toBe(true)
  })

  it('an identity change on a bare table (no figure) still drops widths and full width', () => {
    const muya = makeFakeMuya()
    const built = buildBareTable('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.table)
    muya.tableResize.setTableWidths('t1', [120, 80], [true, false])
    muya.tableResize.fullWidth.add('t1')
    muya.tableResize.reconcileAfterRender()

    built.row.cells[0].textContent = 'Renamed'
    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
    expect(muya.tableResize.isFullWidth('t1')).toBe(false)
    expect(built.table.classList.contains('ag-column-widths-fixed')).toBe(false)
  })

  it('a stored full-width mode adopts onto a bare table without a figure', () => {
    const muya = makeFakeMuya()
    const built = buildBareTable('t1', ['Alpha'])
    muya.container.appendChild(built.table)
    const pid = pidOf(0, ['Alpha'])

    muya.tableResize.applyPersistedLayouts({ [pid]: { widths: [], manual: [], fullWidth: true } })

    expect(muya.tableResize.isFullWidth('t1')).toBe(true)
    expect(Object.keys(muya.tableResize.persisted)).toEqual([pid])
  })

  it('a table removed from the document drops its identity on the next sync', () => {
    const muya = makeFakeMuya()
    const built = buildBareTable('t1', ['Alpha'])
    muya.container.appendChild(built.table)
    muya.tableResize.setTableWidths('t1', [120], [true])
    muya.tableResize.reconcileAfterRender()
    expect(muya.tableResize.identities.has('t1')).toBe(true)

    built.table.remove()
    muya.tableResize.reconcileAfterRender()
    expect(muya.tableResize.identities.has('t1')).toBe(false)
  })
})

describe('pointer + double-click guard paths (C-65 R-3/R-7)', () => {
  const mkEvent = (target, extra = {}) => Object.assign({
    target,
    button: 0,
    clientX: 100,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  }, extra)

  it('ignores non-handle targets, right buttons and disabled surfaces', () => {
    const muya = makeFakeMuya()
    const off = mkEvent(document.createElement('span'))
    muya.tableResize.handlePointerDown(off)
    expect(muya.tableResize.dragging).toBeNull()
    expect(off.preventDefault).not.toHaveBeenCalled()

    const built = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(built.figure)
    const [handle] = addHandles(built.row)
    const right = mkEvent(handle, { button: 2 })
    muya.tableResize.handlePointerDown(right)
    expect(muya.tableResize.dragging).toBeNull()
    expect(right.preventDefault).not.toHaveBeenCalled()

    const disabled = makeFakeMuya({ disableTableColumnResize: true })
    const other = buildTableFigure('t2', ['Alpha'])
    disabled.container.appendChild(other.figure)
    const [disabledHandle] = addHandles(other.row)
    const eaten = mkEvent(disabledHandle)
    disabled.tableResize.handlePointerDown(eaten)
    expect(eaten.preventDefault).toHaveBeenCalled()
    expect(eaten.stopPropagation).toHaveBeenCalled()
    expect(disabled.tableResize.dragging).toBeNull()
  })

  it('a handle without a usable cell, table, id or column index never starts a drag', () => {
    const muya = makeFakeMuya()
    const bare = document.createElement('span')
    bare.className = RESIZER_CLASS
    muya.tableResize.handlePointerDown(mkEvent(bare))
    expect(muya.tableResize.dragging).toBeNull()

    const detachedTh = document.createElement('th')
    const inner = document.createElement('span')
    inner.className = RESIZER_CLASS
    detachedTh.appendChild(inner)
    muya.tableResize.handlePointerDown(mkEvent(inner))
    expect(muya.tableResize.dragging).toBeNull()

    const idless = buildBareTable('', ['Alpha'])
    muya.container.appendChild(idless.table)
    const [idlessHandle] = addHandles(idless.row)
    muya.tableResize.handlePointerDown(mkEvent(idlessHandle))
    expect(muya.tableResize.dragging).toBeNull()

    // A th directly under thead (not in a tr) has cellIndex -1.
    const odd = document.createElement('table')
    odd.id = 'odd'
    odd.className = 'ag-paragraph'
    const orphan = document.createElement('th')
    const orphanHandle = document.createElement('span')
    orphanHandle.className = RESIZER_CLASS
    orphan.appendChild(orphanHandle)
    odd.createTHead().appendChild(orphan)
    muya.container.appendChild(odd)
    expect(orphan.cellIndex).toBe(-1)
    muya.tableResize.handlePointerDown(mkEvent(orphanHandle))
    expect(muya.tableResize.dragging).toBeNull()
  })

  it('an unmeasurable table refuses to freeze a drag baseline', () => {
    const muya = makeFakeMuya()
    const built = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(built.figure)
    const [handle] = addHandles(built.row)
    for (const cell of built.row.cells) {
      cell.getBoundingClientRect = () => ({ left: 0, width: 0, height: 0 })
    }

    muya.tableResize.handlePointerDown(mkEvent(handle))

    expect(muya.tableResize.dragging).toBeNull()
    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
  })

  it('a drag onto a stored entry skips the baseline; a zero-length move keeps the width', () => {
    const muya = makeFakeMuya()
    const built = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(built.figure)
    const [handle] = addHandles(built.row)
    muya.tableResize.setTableWidths('t1', [120], [false])

    muya.tableResize.handlePointerDown(mkEvent(handle))
    expect(muya.tableResize.dragging.createdThisDrag).toBe(false)
    muya.tableResize.handlePointerMove({ clientX: 100 })
    expect(muya.tableResize.getWidths('t1')).toEqual([120])

    muya.tableResize.handlePointerUp()
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [120], manual: [true], fullWidth: false, fit: false } }
    })

    // move/up without an active drag are inert.
    muya.tableResize.handlePointerMove({ clientX: 50 })
    muya.tableResize.handlePointerUp()
  })

  it('pointer capture is optional: a working and a throwing capture both drag', () => {
    const muya = makeFakeMuya()
    const built = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(built.figure)
    const [handle] = addHandles(built.row)
    muya.tableResize.setTableWidths('t1', [120], [false])
    handle.setPointerCapture = vi.fn()

    muya.tableResize.handlePointerDown(mkEvent(handle, { pointerId: 7 }))
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7)
    muya.tableResize.handlePointerUp()

    const second = buildTableFigure('t2', ['Alpha'])
    muya.container.appendChild(second.figure)
    const [throwing] = addHandles(second.row)
    muya.tableResize.setTableWidths('t2', [120], [false])
    throwing.setPointerCapture = () => { throw new Error('pointer busy') }

    expect(() => muya.tableResize.handlePointerDown(mkEvent(throwing, { pointerId: 9 }))).not.toThrow()
    expect(muya.tableResize.dragging.key).toBe('t2')
    muya.tableResize.handlePointerUp()
  })

  it('a pointerup on a table without a figure ancestor persists without a cue sync', () => {
    const muya = makeFakeMuya()
    const built = buildBareTable('t1', ['Alpha'])
    muya.container.appendChild(built.table)
    const [handle] = addHandles(built.row)
    muya.tableResize.setTableWidths('t1', [120], [false])

    muya.tableResize.handlePointerDown(mkEvent(handle))
    muya.tableResize.dragging.table.closest = undefined
    muya.tableResize.handlePointerUp()

    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [120], manual: [true], fullWidth: false, fit: false } }
    })
  })

  it('double-clicks off the handle, on disabled surfaces or without a table do nothing', () => {
    const muya = makeFakeMuya()
    const off = mkEvent(document.createElement('span'))
    muya.tableResize.handleDoubleClick(off)
    expect(off.preventDefault).not.toHaveBeenCalled()

    const detached = document.createElement('span')
    detached.className = RESIZER_CLASS
    const stray = mkEvent(detached)
    muya.tableResize.handleDoubleClick(stray)
    expect(stray.preventDefault).toHaveBeenCalled()
    expect(stray.stopPropagation).toHaveBeenCalled()

    const disabled = makeFakeMuya({ disableTableColumnResize: true })
    const other = buildTableFigure('t2', ['Alpha'])
    disabled.container.appendChild(other.figure)
    const [handle] = addHandles(other.row)
    disabled.tableResize.setTableWidths('t2', [120], [true])
    const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    handle.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(disabled.tableResize.getWidths('t2')).toEqual([120])
  })

  it('a double-click on a table without stored widths is a no-op (already auto)', () => {
    const muya = makeFakeMuya()
    const built = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(built.figure)
    const [handle] = addHandles(built.row)

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    expect(muya.eventCenter.dispatch).not.toHaveBeenCalled()
  })

  it('the full reset on a bare table (no figure) persists the removal', () => {
    const muya = makeFakeMuya()
    const built = buildBareTable('t1', ['Alpha'])
    muya.container.appendChild(built.table)
    const [handle] = addHandles(built.row)
    muya.tableResize.setTableWidths('t1', [120], [true])
    muya.tableResize.reconcileAfterRender()

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', { entries: {} })
  })

  it('the partial reset on a thead-less table keeps the stored width and persists', () => {
    const muya = makeFakeMuya()
    const built = buildBareTable('t1', ['Alpha', 'Beta'], { inTbody: true })
    muya.container.appendChild(built.table)
    const handles = addHandles(built.row)
    muya.tableResize.setTableWidths('t1', [120, 80], [true, true])

    handles[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    // No thead row to measure: the reset column keeps its stored width and
    // only loses its manual flag; the identity never mints (no thead), so
    // the persist carries no entry.
    expect(muya.tableResize.getWidths('t1')).toEqual([120, 80])
    expect(muya.tableResize.widths.get('t1').manual).toEqual([true, false])
    expect(built.table.classList.contains('ag-column-widths-fixed')).toBe(true)
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', { entries: {} })
  })
})
// END_BLOCK_GUARD_ASSERTIONS

describe('table viewport and export regression paths (C-71)', () => {
  it('drops removed automatic layouts and restores fit on a bare table', () => {
    const muya = makeFakeMuya()
    const { table } = buildTableFigure('bare', ['Alpha'])
    muya.container.appendChild(table)
    muya.tableResize.autoFullWidth.add('removed')
    muya.tableResize.applyPersistedLayouts({ [pidOf(0, ['Alpha'])]: { fit: true } })
    expect(muya.tableResize.autoFullWidth.has('removed')).toBe(false)
    expect(muya.tableResize.fitToPage.has('bare')).toBe(true)
  })

  it('routes Copy as image through the live figure, including the capture click path', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { toggle } = buildToolbarDom(figure)
    toggle.dataset.tableToolbarAction = 'copyImage'
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(muya.eventCenter.dispatch).toHaveBeenCalledExactlyOnceWith('muya-diagram-export', { action: 'copyImage', element: figure })
    muya.tableResize.copyImageFromElement(document.createElement('p'))
    expect(muya.eventCenter.dispatch).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ left: 700, width: 100 }, '752px'],
    [{ left: 700, width: 0 }, '752px'],
    [{ left: 0, width: 100 }, '752px'],
    [{ left: 1000, width: 100 }, '752px']
  ])('keeps the full client viewport independently of own-outline geometry: %j', (rect, expected) => {
    const muya = makeFakeMuya()
    const host = document.createElement('div')
    host.className = 'editor-with-tabs'
    document.body.appendChild(host)
    CLEANUP.push(() => host.remove())
    host.appendChild(muya.container)
    const { figure, wrapper } = buildTableFigure('t1', ['Alpha'])
    const editor = document.createElement('div')
    editor.id = 'ag-editor-id'
    editor.appendChild(figure)
    muya.container.appendChild(editor)
    Object.defineProperty(muya.container, 'clientWidth', { value: 800 })
    muya.container.scrollLeft = 100
    muya.container.getBoundingClientRect = () => ({ left: 10, width: 820 })
    wrapper.getBoundingClientRect = () => ({ left: -66, width: 400 })
    const overlay = document.createElement('aside')
    overlay.dataset.editorOverlayRight = ''
    overlay.getBoundingClientRect = () => rect
    host.appendChild(overlay)
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ marginLeft: '0px' })
    CLEANUP.push(() => styleSpy.mockRestore())
    muya.tableResize.applyFullWidthGeometry(figure)
    expect(wrapper.style.width).toBe(expected)
    expect(wrapper.style.marginLeft).toBe('') // content coordinate is already the 24px gutter
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalled()
    muya.tableResize.applyFullWidthDom(figure, false)
    expect(wrapper.style.width).toBe('')
  })

  it('ignores absent container rectangles and overlays from another editor', () => {
    const muya = makeFakeMuya()
    const { figure, wrapper } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const foreign = document.createElement('aside')
    foreign.dataset.editorOverlayRight = ''
    foreign.getBoundingClientRect = () => ({ left: 100, width: 100 })
    document.body.appendChild(foreign)
    CLEANUP.push(() => foreign.remove())
    muya.container.getBoundingClientRect = () => null
    muya.tableResize.applyFullWidthGeometry(figure)
    expect(wrapper.style.width).toBe('')
    muya.container.getBoundingClientRect = () => ({ left: 10, width: 800 })
    wrapper.getBoundingClientRect = () => ({ left: NaN, width: 400 })
    muya.tableResize.applyFullWidthGeometry(figure)
    expect(wrapper.style.width).toBe('')
    wrapper.getBoundingClientRect = () => ({ left: 60, width: 400 })
    muya.container.getBoundingClientRect = () => ({ left: 10, width: 800 })
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ marginLeft: '0px' })
    CLEANUP.push(() => styleSpy.mockRestore())
    muya.tableResize.applyFullWidthGeometry(figure)
    expect(wrapper.style.width).toBe('752px')
    expect(wrapper.style.marginLeft).toBe('-26px')
  })
})
