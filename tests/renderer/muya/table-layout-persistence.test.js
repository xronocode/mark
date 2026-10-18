// FILE: tests/renderer/muya/table-layout-persistence.test.js
// VERSION: 1.0.0
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
//   pidOf - computes the expected ordinal#signature identity of a buildTableFigure fixture.
//   T - test helper (T).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-65: new — every adoption/drop/persist
//   case fails without the identity machinery; the toggle/click cases fail
//   without the capture-phase routing; the R-3 cases fail when the reset
//   paths do not persist.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import TableResize, {
  MIN_COLUMN_WIDTH,
  TABLE_FULL_WIDTH_CLASS,
  hashHeaderText,
  sanitizePersistedEntries,
  tableSignature
} from 'muya/lib/tableResize'
import { TABLE_CAPTION_CLASS } from 'muya/lib/tableResize/tableCue'

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
    expect(entries['1#1:y']).toEqual({ widths: [], manual: [], fullWidth: true })
    expect(entries['3#1:w'].widths).toEqual([90])
    expect(sanitizePersistedEntries(null)).toBeNull()
    expect(sanitizePersistedEntries('x')).toBeNull()
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
    expect(entries[pidOf(2, ['X', 'Y'])]).toEqual({ widths: [], manual: [], fullWidth: true })
  })

  it('persist dispatches muya-table-layouts with the serialized entries', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    muya.tableResize.setTableWidths('t1', [120], [true])
    muya.tableResize.persist()
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [120], manual: [true], fullWidth: false } }
    })
  })
})
// END_BLOCK_PERSIST_ASSERTIONS

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
      entries: { [pidOf(0, ['Alpha'])]: { widths: [], manual: [], fullWidth: true } }
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

    // offset 50 → -11 - 50 = -61px.
    expect(wrapper.style.marginLeft).toBe('-61px')

    muya.tableResize.toggleFullWidthFromElement(figure)
    expect(wrapper.style.marginLeft).toBe('')
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
      entries: { [pidOf(0, ['Alpha', 'Beta'])]: { widths: [120, 120], manual: [true, false], fullWidth: false } }
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
      entries: { [pidOf(0, ['Alpha'])]: { widths: [180], manual: [true], fullWidth: false } }
    })
  })
})
// END_BLOCK_RESET_PERSIST_ASSERTIONS
