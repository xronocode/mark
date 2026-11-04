// FILE: tests/renderer/muya/table-layout-persistence.test.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the persistent table layout behaviour (C-65 T-001/T-004 + C-PAGE-WIDTH-TABLES T-007/T-008/T-009) — the persistent identity (ordinal + header signature), the schema-v2 adoption (widths + ratios + tableWidth + mode, with the idempotent legacy fit:true/fullWidth migration), the rememberTableColumnSizes gate, the identity-change drops (corner-2), the unseen-entry drop, the serialize/dispatch write path (only after real user actions), the honest three-mode defaults and the toolbar mode-segment routing, the degradation badge caption, the walls and the reset/wall-double-click persist paths.
//   SCOPE: src/muya/lib/tableResize/index.js (syncIdentities load versus write modes, applyPersistedLayouts, serializeTableLayouts, persist snapshot refresh, toggle/openViewer, handleToolbarAction/Click/Mousedown, handleScrollCapture, sanitizePersistedEntries, tableSignature) and the R-3 reset-persist paths of handleDoubleClick / handlePointerUp.
//   DEPENDS: TableResize with a real-listener event-center double, Vitest + jsdom.
//   LINKS: .grace/changes/archive/C-65 T-001/T-004; .grace/verification/runtime.xml V-M-012 scenario-66; the store twin tests/renderer/store/table-layout-store.test.js; the C-39 maths twin tests/renderer/muya/table-column-resize.test.js; e2e tests/e2e/table-width-persistence.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CLEANUP - teardown callbacks run after each test.
//   makeFakeMuya - fake muya {container, options, eventCenter with REAL addEventListener-backed attachDOMEvent, dispatch spy} with a real TableResize.
//   buildTableFigure - jsdom table/caption scroll block with header texts, ids and stubbed cell rects.
//   buildToolbarDom - the three-button mode segment DOM (Auto/Fit/Full + the expand action) the vnode builds in the real editor.
//   pidOf - computes the expected ordinal#signature identity of a buildTableFigure fixture.
//   buildBareTable - jsdom table.ag-paragraph with a thead (or tbody) row of th cells, NOT wrapped in a figure — the guard paths where closest('figure') must miss.
//   addHandles - appends one .ag-column-resizer span per row cell; returns the handles.
//   pidOf - computes the expected ordinal#signature identity of a buildTableFigure/buildBareTable fixture.
//   T - test helper (T).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007/T-008/T-009:
//   the suite moves to the honest three-mode model — v2 sanitize pins
//   (mode/ratios/tableWidth, the idempotent legacy migration), the retired
//   fake-fit default replaced by the mode-default/legacy-migration cases,
//   the toolbar toggle cases rewritten over the three-button segment, the
//   remember-off gate, the degradation badge caption and the tightened
//   zero-move drag rule; all C-65 identity/adoption/reset/guard coverage
//   carries over.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import TableResize, {
  MIN_COLUMN_WIDTH,
  RESIZER_CLASS,
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
    'tableToolbar.modeAuto': 'Auto',
    'tableToolbar.fullWidth': 'Full width',
    'tableToolbar.fitToPage': 'Fit to page',
    'tableToolbar.columnsRange': 'columns {start}–{end} of {total}',
    'tableToolbar.allColumns': 'all {total} columns',
    'tableToolbar.doesNotFitBy': 'does not fit by {px} px'
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
  wrapper.appendChild(caption)
  for (const cell of row.cells) {
    cell.getBoundingClientRect = () => ({ left: 0, width, height: 20 })
  }
  return { figure, wrapper, table, row, caption }
}

// The mode segment DOM the vnode builds in the real editor (T-007): three
// setMode buttons; updateToolbarModeDom keeps their active state in step.
const buildToolbarDom = (figure) => {
  const toolbar = document.createElement('div')
  toolbar.className = 'ag-block-toolbar ag-table-toolbar'
  const make = (mode, label) => {
    const button = document.createElement('button')
    button.className = `ag-block-expand ag-block-toolbar-btn ag-table-toolbar-btn ag-table-toolbar-mode${mode === 'auto' ? ' ag-table-toolbar-active' : ''}`
    button.dataset.tableToolbarAction = 'setMode'
    button.dataset.tableMode = mode
    button.title = label
    button.setAttribute('aria-label', label)
    const span = document.createElement('span')
    span.className = 'ag-block-toolbar-label'
    span.textContent = label
    button.appendChild(span)
    toolbar.appendChild(button)
    return button
  }
  const auto = make('auto', 'Auto')
  const fit = make('fit', 'Fit to page')
  const full = make('full', 'Full width')
  const expand = document.createElement('button')
  expand.className = 'ag-block-expand ag-block-toolbar-btn ag-table-toolbar-btn ag-block-toolbar-expand ag-table-toolbar-expand'
  expand.dataset.tableToolbarAction = 'expand'
  toolbar.appendChild(expand)
  figure.insertBefore(toolbar, figure.firstChild)
  return { toolbar, auto, fit, full, expand }
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

  it('sanitizes persisted entries (schema v2): widths clamped, modes kept, husks dropped', () => {
    const entries = sanitizePersistedEntries({
      '0#2:x': { widths: [120, 20], manual: [true] },
      '1#1:y': { widths: [], manual: [], mode: 'full' },
      '2#1:z': { widths: [90], manual: [false] },
      '3#1:w': { widths: ['nan', 90], manual: [true] },
      '4#1:r': { widths: [120, 80], manual: [true, false], ratios: [0.6, 0.4], tableWidth: 200 },
      'not-an-entry': 'nope'
    })
    expect(Object.keys(entries).sort()).toEqual(['0#2:x', '1#1:y', '3#1:w', '4#1:r'])
    expect(entries['0#2:x'].widths).toEqual([120, MIN_COLUMN_WIDTH])
    expect(entries['0#2:x'].manual).toEqual([true, false])
    expect(entries['1#1:y']).toEqual({ widths: [], manual: [], mode: 'full' })
    expect(entries['3#1:w'].widths).toEqual([90])
    expect(entries['4#1:r']).toEqual({
      widths: [120, 80], manual: [true, false], ratios: [0.6, 0.4], tableWidth: 200
    })
    expect(sanitizePersistedEntries(null)).toBeNull()
    expect(sanitizePersistedEntries('x')).toBeNull()
  })

  it('the legacy fake-fit flags migrate one-way to the v2 mode (idempotent, corner C-8)', () => {
    const entries = sanitizePersistedEntries({
      'a': { widths: [], manual: [], fit: true },
      'b': { widths: [], manual: [], fullWidth: true, fit: true }
    })
    // A legacy fit:true opens in the honest Fit page; Full width wins the
    // contradictory pair.
    expect(entries.a).toEqual({ widths: [], manual: [], mode: 'fit' })
    expect(entries.b).toEqual({ widths: [], manual: [], mode: 'full' })
    // Re-running the sanitizer on its own output changes nothing.
    expect(sanitizePersistedEntries(entries)).toEqual(entries)
    // Ratios of the wrong length drop; a valid pair survives with the px.
    const dropped = sanitizePersistedEntries({ 'c': { widths: [120, 80], manual: [true, true], ratios: [0.5] } })
    expect(dropped.c).toEqual({ widths: [120, 80], manual: [true, true] })
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
    expect(muya.tableResize.modeOf('t1')).toBe('full')
    // Adoption never writes back (corner-5: nothing was resized here).
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalledWith('muya-table-layouts', expect.anything())
  })

  it('a stored column-count mismatch adopts no widths (the identity includes the count)', () => {
    const muya = makeFakeMuya()
    const { figure, table } = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(figure)
    const pid = pidOf(0, ['Alpha', 'Beta'])

    muya.tableResize.applyPersistedLayouts({
      [pid]: { widths: [120, 80, 60], manual: [true, false, false] }
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
      [pid]: { widths: [120], manual: [true] },
      '5#1:gone': { widths: [200], manual: [true] }
    })
    expect(Object.keys(muya.tableResize.persisted)).toEqual([pid])
  })

  it('a table whose identity changed also loses its stored mode (T-007)', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const pid = pidOf(0, ['Alpha'])
    muya.tableResize.applyPersistedLayouts({ [pid]: { widths: [], manual: [], mode: 'full' } })
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)

    figure.querySelector('th').textContent = 'Changed'
    muya.tableResize.reconcileAfterRender()
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.tableResize.modes.has('t1')).toBe(false)
    expect(muya.tableResize.modeOf('t1')).toBe('auto')
  })
})
// END_BLOCK_IDENTITY_ASSERTIONS

// START_BLOCK_PERSIST_ASSERTIONS
describe('serialize + persist (C-65 R-1 + T-007/T-008 shapes)', () => {
  it('serializes only tables with a dragged column, ratios, a wall width or a mode', () => {
    const muya = makeFakeMuya()
    const first = buildTableFigure('t1', ['Alpha', 'Beta'])
    const second = buildTableFigure('t2', ['One'])
    const third = buildTableFigure('t3', ['X', 'Y'])
    muya.container.append(first.figure, second.figure, third.figure)
    muya.tableResize.setTableWidths('t1', [120, 80], [true, false])
    muya.tableResize.setTableWidths('t2', [90], [false])
    muya.tableResize.modes.set('t3', 'full')
    muya.tableResize.reconcileAfterRender()

    const entries = muya.tableResize.serializeTableLayouts()
    expect(Object.keys(entries).sort()).toEqual([pidOf(0, ['Alpha', 'Beta']), pidOf(2, ['X', 'Y'])].sort())
    // Schema v2: mode replaces the legacy booleans.
    expect(entries[pidOf(2, ['X', 'Y'])]).toEqual({ widths: [], manual: [], mode: 'full' })
  })

  it('persist dispatches muya-table-layouts with ratios written by the drag (T-008)', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    muya.tableResize.setTableWidths('t1', [120], [true])
    muya.tableResize.widths.get('t1').ratios = [1]
    muya.tableResize.persist()
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [120], manual: [true], ratios: [1] } }
    })
  })

  it('rememberTableColumnSizes=false gates the persistence bridge (T-008)', () => {
    const muya = makeFakeMuya({ rememberTableColumnSizes: false })
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    muya.tableResize.setTableWidths('t1', [120], [true])
    muya.tableResize.persist()
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalledWith('muya-table-layouts', expect.anything())
    expect(muya.tableResize.persisted).toBeNull()
    // Adoption is skipped the same way (a fresh key proves it — the
    // session entry above must stay untouched by the load path).
    muya.tableResize.applyPersistedLayouts({ [pidOf(1, ['Fresh'])]: { widths: [90], manual: [true] } })
    expect(muya.tableResize.persisted).toBeNull()
    expect(muya.tableResize.widths.has('t1')).toBe(true)
  })
})
// END_BLOCK_PERSIST_ASSERTIONS

// START_BLOCK_MODE_DEFAULT_ASSERTIONS
describe('the honest mode defaults (T-007, R-8 — the fake-fit default is retired)', () => {
  it('defaultMode maps the tri-state option; legacy booleans resolve to Auto', () => {
    for (const [option, expected] of [
      ['auto', 'auto'], ['fit', 'fit'], ['full', 'full'],
      [undefined, 'auto'], [true, 'auto'], [false, 'auto']
    ]) {
      const muya = makeFakeMuya({ tableFullWidthDefault: option })
      expect(muya.tableResize.defaultMode()).toBe(expected)
    }
  })

  it('a wide table stays Auto — no auto-expansion, nothing written', () => {
    const muya = makeFakeMuya()
    const wide = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(wide.figure)

    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.modeOf('t1')).toBe('auto')
    expect(wide.figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalledWith('muya-table-layouts', expect.anything())
    expect(muya.tableResize.serializeTableLayouts()).toEqual({})
  })

  it('the default mode puts every undecided table into fit or full when configured', () => {
    for (const [option, klass] of [['fit', 'fit'], ['full', 'full']]) {
      const muya = makeFakeMuya({ tableFullWidthDefault: option })
      const { figure } = buildTableFigure('t1', ['Alpha'])
      muya.container.appendChild(figure)
      expect(muya.tableResize.modeOf('t1')).toBe(klass)
      // The explicit choice remains unset (the preference owns the default),
      // and the render funnel paints the default mode's DOM state.
      expect(muya.tableResize.modes.has('t1')).toBe(false)
      muya.tableResize.reconcileAfterRender()
      expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(klass === 'full')
    }
  })

  it('a stored mode opens that mode after a reload; a second load changes nothing', () => {
    const build = () => {
      const instance = makeFakeMuya()
      const built = buildTableFigure('t1', ['Alpha'])
      instance.container.appendChild(built.figure)
      return instance
    }
    const first = build()
    first.tableResize.applyPersistedLayouts({
      [pidOf(0, ['Alpha'])]: { widths: [], manual: [], mode: 'fit' }
    })
    expect(first.tableResize.modeOf('t1')).toBe('fit')
    // The adopted state serializes honestly (the v2 mode, no legacy flags).
    expect(first.tableResize.serializeTableLayouts()).toEqual({
      [pidOf(0, ['Alpha'])]: { widths: [], manual: [], mode: 'fit' }
    })

    // A reopen re-adopts the same state (idempotent migration).
    const second = build()
    second.tableResize.applyPersistedLayouts({
      [pidOf(0, ['Alpha'])]: { widths: [], manual: [], mode: 'fit' }
    })
    expect(second.tableResize.modeOf('t1')).toBe('fit')
    expect(second.tableResize.serializeTableLayouts()).toEqual({
      [pidOf(0, ['Alpha'])]: { widths: [], manual: [], mode: 'fit' }
    })
  })

  it('a legacy fit:true profile entry opens in the honest Fit page (R-8 migration)', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    muya.tableResize.applyPersistedLayouts({
      [pidOf(0, ['Alpha'])]: { widths: [], manual: [], fit: true }
    })
    expect(muya.tableResize.modeOf('t1')).toBe('fit')
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    // The migration never writes the legacy flag back — only the v2 mode.
    expect(muya.tableResize.serializeTableLayouts()).toEqual({
      [pidOf(0, ['Alpha'])]: { widths: [], manual: [], mode: 'fit' }
    })
  })
})
// END_BLOCK_MODE_DEFAULT_ASSERTIONS

// START_BLOCK_MODE_SEGMENT_ASSERTIONS
describe('the mode segment routing (T-007) + toolbar/caption capture paths', () => {
  it('the bubble route applies the chosen mode exactly once before generic Muya click handling', () => {
    const muya = makeFakeMuya()
    const { figure, wrapper } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { full, auto } = buildToolbarDom(figure)
    const genericMuyaClick = vi.fn()
    muya.container.addEventListener('click', genericMuyaClick)

    full.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)
    expect(muya.tableResize.modeOf('t1')).toBe('full')
    expect(full.classList.contains('ag-table-toolbar-active')).toBe(true)
    expect(auto.classList.contains('ag-table-toolbar-active')).toBe(false)
    expect(wrapper.style.marginLeft).toBe('') // jsdom zero geometry: no breakout
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [], manual: [], mode: 'full' } }
    })
    expect(genericMuyaClick).not.toHaveBeenCalled()

    // Back to Auto in one click (R-8): the explicit choice is dropped.
    auto.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(muya.tableResize.modeOf('t1')).toBe('auto')
    expect(muya.tableResize.modes.has('t1')).toBe(false)
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.eventCenter.dispatch).toHaveBeenLastCalledWith('muya-table-layouts', { entries: {} })
  })

  it('the mode replaces an adopted entry instead of re-adopting stale persisted state', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { full, auto } = buildToolbarDom(figure)
    const pid = pidOf(0, ['Alpha'])

    // The file opens with an explicit Full width profile entry.
    muya.tableResize.applyPersistedLayouts({ [pid]: { widths: [], manual: [], mode: 'full' } })
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)
    expect(full.classList.contains('ag-table-toolbar-active')).toBe(true)

    auto.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(muya.tableResize.modeOf('t1')).toBe('auto')
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(auto.classList.contains('ag-table-toolbar-active')).toBe(true)
    expect(muya.eventCenter.dispatch).toHaveBeenLastCalledWith('muya-table-layouts', { entries: {} })
    // The stale Full width state must not come back on the next render.
    muya.tableResize.reconcileAfterRender()
    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
  })

  it('the expand button dispatches muya-block-viewer with the figure', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { expand } = buildToolbarDom(figure)

    expand.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-block-viewer', { element: figure })
  })

  it('a disabled surface (the Split View mirror) ignores the segment', () => {
    const muya = makeFakeMuya({ disableTableColumnResize: true })
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { full } = buildToolbarDom(figure)

    full.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(false)
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalled()
  })

  it('toolbar mousedown reaches the target and outer host without being cancelled', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { full } = buildToolbarDom(figure)
    const targetReached = vi.fn()
    const outerReached = vi.fn()
    full.addEventListener('mousedown', targetReached)
    document.body.addEventListener('mousedown', outerReached)

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    full.dispatchEvent(event)
    document.body.removeEventListener('mousedown', outerReached)

    expect(targetReached).toHaveBeenCalledTimes(1)
    expect(outerReached).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(false)
  })

  it("a click on the caption never reaches muya's caret routing", () => {
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

  it('the breakout geometry applies on Full and clears on Auto', () => {
    const muya = makeFakeMuya()
    const { figure, wrapper } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { full } = buildToolbarDom(figure)
    // The editor root sits 50px left of the wrapper (theme padding).
    const editor = document.createElement('div')
    editor.id = 'ag-editor-id'
    editor.appendChild(figure)
    muya.container.appendChild(editor)
    wrapper.getBoundingClientRect = () => ({ left: 60, width: 400 })
    muya.container.getBoundingClientRect = () => ({ left: 10, width: 800 })
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ marginLeft: '-11px' })
    CLEANUP.push(() => styleSpy.mockRestore())

    full.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    // A table wider than the editor area starts FULL_WIDTH_GUTTER_PX from
    // the edge: offset 50 → -11 - 50 + 24.
    expect(wrapper.style.marginLeft).toBe('-37px')

    muya.tableResize.applyModeDom(figure, 'auto')
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

    muya.tableResize.applyModeDom(figure, 'full')
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

  it('the degradation badge rides the caption dataset and the accent class (T-007)', () => {
    const muya = makeFakeMuya()
    const { figure, caption, wrapper } = buildTableFigure('t1', ['A', 'B'])
    muya.container.appendChild(figure)
    wrapper.getBoundingClientRect = () => ({ left: 100, width: 200 })
    Object.defineProperty(wrapper, 'clientWidth', { value: 200, configurable: true })
    let left = 100
    for (const cell of figure.querySelectorAll('th')) {
      const cellLeft = left
      cell.getBoundingClientRect = () => ({ left: cellLeft, width: 150 })
      left += 150
    }

    figure.dataset.degradeOverflow = '100'
    muya.tableResize.applyModeDom(figure, 'fit')

    expect(caption.classList.contains('ag-table-caption-degrade')).toBe(true)
    expect(caption.textContent).toBe('does not fit by 100 px')
    expect(caption.style.color).toContain('var(--chromeAccent')

    delete figure.dataset.degradeOverflow
    muya.tableResize.applyModeDom(figure, 'fit')
    expect(caption.classList.contains('ag-table-caption-degrade')).toBe(false)
    expect(caption.style.color).toBe('')
  })

  it('updateToolbarModeDom marks the live mode and survives a button without labels', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { auto, fit, full } = buildToolbarDom(figure)

    muya.tableResize.updateToolbarModeDom(figure, 'fit')
    expect(fit.classList.contains('ag-table-toolbar-active')).toBe(true)
    expect(auto.classList.contains('ag-table-toolbar-active')).toBe(false)
    expect(full.classList.contains('ag-table-toolbar-active')).toBe(false)

    muya.tableResize.updateToolbarModeDom(figure, 'full')
    expect(full.classList.contains('ag-table-toolbar-active')).toBe(true)

    // A figure with no segment at all is inert.
    expect(() => muya.tableResize.updateToolbarModeDom(document.createElement('figure'), 'fit')).not.toThrow()
  })
})
// END_BLOCK_MODE_SEGMENT_ASSERTIONS

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
    expect(entry.ratios).toEqual([0.5, 0.5])
    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha', 'Beta'])]: { widths: [120, 120], manual: [true, false], ratios: [0.5, 0.5] } }
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
      entries: { [pidOf(0, ['Alpha'])]: { widths: [180], manual: [true], ratios: [1] } }
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

  it('the mode segment and the viewer ignore non-figures and figures without a usable table', () => {
    const muya = makeFakeMuya()
    const foreign = document.createElement('button')
    foreign.dataset.tableToolbarAction = 'setMode'
    foreign.dataset.tableMode = 'full'
    muya.tableResize.setModeFromElement(foreign)
    muya.tableResize.setModeFromElement(null)

    const tableless = document.createElement('figure')
    tableless.setAttribute('data-role', 'TABLE')
    muya.container.appendChild(tableless)
    muya.tableResize.setModeFromElement(foreign)

    const idless = document.createElement('figure')
    idless.setAttribute('data-role', 'TABLE')
    idless.appendChild(document.createElement('table'))
    muya.container.appendChild(idless)
    muya.tableResize.setModeFromElement(foreign)

    // An unknown dataset.tableMode is refused too.
    const bad = document.createElement('button')
    bad.dataset.tableToolbarAction = 'setMode'
    bad.dataset.tableMode = 'bogus'
    const good = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(good.figure)
    muya.tableResize.setModeFromElement(bad)
    expect(muya.tableResize.modes.has('t1')).toBe(false)

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

  it('applyModeDom tolerates a null figure and a figure without a wrapper', () => {
    const muya = makeFakeMuya()
    expect(() => muya.tableResize.applyModeDom(null, 'full')).not.toThrow()
    const bare = document.createElement('figure')
    muya.tableResize.applyModeDom(bare, 'full')
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

  it('updateToolbarModeDom only toggles classes — it never needs the translator', () => {
    const muya = makeFakeMuya({ t: null })
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { fit } = buildToolbarDom(figure)
    expect(() => muya.tableResize.updateToolbarModeDom(figure, 'fit')).not.toThrow()
    expect(fit.classList.contains('ag-table-toolbar-active')).toBe(true)
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

  it('an identity change on a bare table (no figure) still drops widths and the mode', () => {
    const muya = makeFakeMuya()
    const built = buildBareTable('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.table)
    muya.tableResize.setTableWidths('t1', [120, 80], [true, false])
    muya.tableResize.modes.set('t1', 'full')
    muya.tableResize.reconcileAfterRender()

    built.row.cells[0].textContent = 'Renamed'
    muya.tableResize.reconcileAfterRender()

    expect(muya.tableResize.getWidths('t1')).toBeUndefined()
    expect(muya.tableResize.modes.has('t1')).toBe(false)
    expect(built.table.classList.contains('ag-column-widths-fixed')).toBe(false)
  })

  it('a stored mode adopts onto a bare table without a figure', () => {
    const muya = makeFakeMuya()
    const built = buildBareTable('t1', ['Alpha'])
    muya.container.appendChild(built.table)
    const pid = pidOf(0, ['Alpha'])

    muya.tableResize.applyPersistedLayouts({ [pid]: { widths: [], manual: [], mode: 'full' } })

    expect(muya.tableResize.modeOf('t1')).toBe('full')
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

    // A zero-length move is no user action: nothing persists, no manual flag.
    muya.tableResize.handlePointerUp()
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalled()
    expect(muya.tableResize.widths.get('t1').manual).toEqual([false])

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
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 190 }))
    muya.tableResize.dragging.table.closest = undefined
    muya.tableResize.handlePointerUp()

    expect(muya.eventCenter.dispatch).toHaveBeenCalledWith('muya-table-layouts', {
      entries: { [pidOf(0, ['Alpha'])]: { widths: [210], manual: [true], ratios: [1] } }
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
  it('drops modes of vanished keys and adopts a legacy fit flag on a bare table', () => {
    const muya = makeFakeMuya()
    const { table } = buildTableFigure('bare', ['Alpha'])
    muya.container.appendChild(table)
    muya.tableResize.modes.set('removed', 'full')
    muya.tableResize.applyPersistedLayouts({ [pidOf(0, ['Alpha'])]: { fit: true } })
    expect(muya.tableResize.modes.has('removed')).toBe(false)
    expect(muya.tableResize.modeOf('bare')).toBe('fit')
  })

  it('routes Copy as image through the live figure, including the capture click path', () => {
    const muya = makeFakeMuya()
    const { figure } = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(figure)
    const { full } = buildToolbarDom(figure)
    full.dataset.tableToolbarAction = 'copyImage'
    full.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
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
    muya.tableResize.applyModeDom(figure, 'auto')
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
