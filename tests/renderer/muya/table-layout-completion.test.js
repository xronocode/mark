// FILE: tests/renderer/muya/table-layout-completion.test.js
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: C-TABLE-LAYOUT-COMPLETION — pin the ONE TableResize completion stage (completeTableOperation) on the real model and DOM: the cause/readiness/write matrix (mode Auto/Fit/Full incl. repeated choice and hidden/zero-geometry deferred layout, wall/column preview and terminal moved gestures, no-move/return-to-start/pointercancel rollback, wall reset, whole-table and partial fitted reset), the ABSENCE of profile writes from preview/adoption/reconcile/refit/refresh/window/scroll/teardown completions while the cue/wall surfaces still run, the mutation controls (a refresh write permit, old-snapshot re-adoption, the remember-off gate, measurement independence), the lifecycle teardown, and the source inventory (exactly one authorized persist call site inside the stage; byte-identity anchors of the pure siblings and the external callers).
//   SCOPE: src/muya/lib/tableResize/index.js through its real handler entry points (setModeFromElement, handlePointerDown/Move/Up/pointercancel, handleDoubleClick, applyPersistedLayouts, reconcileAfterRender, refitNow, refreshTableSurfaces, handleScrollCapture, handleWindowResize, destroy) — never the stage in isolation (the PREVIEW-cause permit pin is the one documented exception); the static COMPLETION_CAUSE / COMPLETION_CAUSE_WRITES_PROFILE exports; the sibling sources tableFit.js / tableCue.js and the external callers render/index.js + eventHandler/resize.js read as text for the immutability anchors.
//   DEPENDS: TableResize with a real-listener event-center double, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-TABLE-LAYOUT-COMPLETION (plan T-001/T-002); tests/renderer/muya/table-layout-persistence.test.js (the harness twin + scoped boundary pins); tests/renderer/muya/table-column-resize.test.js; e2e tests/e2e/table-modes.spec.ts, table-column-resize.spec.ts, table-width-persistence.spec.ts, table-ui-regressions.spec.ts (the real-geometry cue-ordering proof, T-004).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CLEANUP - teardown callbacks run after each test.
//   ROOT - repository root for source reads.
//   readSrc - read a repo source file as text.
//   SOURCE_INDEX - byte-identity source snapshots.
//   SOURCE_FIT - byte-identity source snapshots.
//   SOURCE_CUE - byte-identity source snapshots.
//   SOURCE_RENDER - byte-identity source snapshots.
//   SOURCE_RESIZE_HANDLER - byte-identity source snapshots.
//   pointerEvent - build a window-level PointerEvent for the gesture helpers.
//   T - the translator stub (identity templates) handed to muya options.
//   makeFakeMuya - fake muya {container, options, eventCenter with REAL addEventListener-backed attachDOMEvent, dispatch spy} with a real TableResize.
//   buildTableFigure - jsdom table/caption scroll block with header texts, ids and cumulative stubbed cell rects.
//   buildToolbarDom - the three-button mode segment DOM (Auto/Fit/Full + the expand action).
//   pidOf - computes the expected ordinal#signature identity of a buildTableFigure fixture.
//   addHandles - appends one .ag-column-resizer span per row cell; returns the handles.
//   flushAdoption - flush the post-paint adoption frames.
//   layoutDispatches - the muya-table-layouts dispatch calls of a fake muya (type-filtered).
//   stubWallGeometry - figure/wrapper/table rect + clientWidth stubs so Auto walls/zone anchors are creatable in jsdom (the table rect tracks the live entry widths).
//   stubFrameGeometry - clientWidth stubs (+ an optional extentsFor spy) so the framed modes get a measurable plan.
//   makeFramedFixture - the sequential fitted-border fixture: seeded entry, mode, handles and real pointer helpers (down/move/up/cancel/drag).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-19 C-TABLE-LAYOUT-COMPLETION v1.0.1: verification
//   fixes against the unmodified implementation — the framed fixture's
//   cell rects degrade to natural widths while the whole-table reset has
//   the entry deleted (a real browser lays the stripped table out at its
//   natural width there); the return-to-start gesture returns to the down
//   point (move() is delta-from-down); the remember-off control mints the
//   identity through the render funnel first; the measurement-independence
//   refit runs on a framed (Fit) table, what refitNow re-plans; the
//   resize-handler funnel pin matches the real guarded caller line.
//   CURRENT: 2026-11-19 C-TABLE-LAYOUT-COMPLETION v1.0.0: new suite — the
//   cause/readiness/write matrix over the one completion stage, the
//   read-only absence-of-write pins with live cue facts, the mutation
//   controls (refresh permit, old snapshot, remember-off, measurement
//   independence), the teardown lifecycle and the source/sibling
//   immutability inventory.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import TableResize, {
  COMPLETION_CAUSE,
  COMPLETION_CAUSE_WRITES_PROFILE,
  TABLE_FIXED_CLASS,
  TABLE_FULL_WIDTH_CLASS,
  RESIZER_CLASS,
  hashHeaderText
} from 'muya/lib/tableResize'
import { TABLE_CAPTION_CLASS, TABLE_CUE_LEFT_CLASS, TABLE_CUE_RIGHT_CLASS } from 'muya/lib/tableResize/tableCue'

vi.mock('muya/lib/renderers', () => ({
  default: async () => ({})
}))

const CLEANUP = []
afterEach(() => {
  while (CLEANUP.length) CLEANUP.pop()()
  vi.restoreAllMocks()
})

// START_BLOCK_COMPLETION_FIXTURES
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
  // Cumulative per-cell rects (captured per cell — a shared closure made
  // every rect the last one) so the cue can compute a real range.
  let left = 0
  for (const cell of row.cells) {
    const cellLeft = left
    cell.getBoundingClientRect = () => ({ left: cellLeft, right: cellLeft + width, width, top: 0, height: 20 })
    left += width
  }
  return { figure, wrapper, table, row, caption }
}

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

const flushAdoption = async () => {
  await new Promise((r) => requestAnimationFrame(() => r()))
  await new Promise((r) => requestAnimationFrame(() => r()))
  await new Promise((r) => setTimeout(r, 0))
}

const layoutDispatches = (muya) =>
  muya.eventCenter.dispatch.mock.calls.filter(([type]) => type === 'muya-table-layouts')

const pointerEvent = (type, clientX) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX })

// Auto-mode geometry stubs: walls/zones become creatable, and the table
// rect tracks the LIVE entry widths so the stage's final settle can be
// asserted against the real edges.
const stubWallGeometry = (built, resize, { naturalWidth = 200, figureWidth = 400, wrapperWidth = 400 } = {}) => {
  built.figure.getBoundingClientRect = () => ({ left: 0, top: 0, right: figureWidth, width: figureWidth, height: 100 })
  built.wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, right: wrapperWidth, width: wrapperWidth, height: 100 })
  Object.defineProperty(built.figure, 'clientWidth', { value: figureWidth, configurable: true })
  Object.defineProperty(built.wrapper, 'clientWidth', { value: wrapperWidth, configurable: true })
  built.table.getBoundingClientRect = () => {
    const entry = resize.widths.get(built.table.id)
    const width = entry && Array.isArray(entry.widths) && entry.widths.length
      ? entry.widths.reduce((a, b) => a + b, 0)
      : naturalWidth
    return { left: 0, top: 0, right: width, width, height: 40 }
  }
}

// Framed-mode geometry stubs: a measurable frame (+ an optional extents
// spy) so planModeWidths produces a real plan instead of deferring.
const stubFrameGeometry = (built, resize, { figureWidth = 480, wrapperWidth = 601, extents } = {}) => {
  Object.defineProperty(built.figure, 'clientWidth', { value: figureWidth, configurable: true })
  Object.defineProperty(built.wrapper, 'clientWidth', { value: wrapperWidth, configurable: true })
  if (extents) vi.spyOn(resize, 'extentsFor').mockReturnValue(extents)
}

// The sequential fitted-border fixture: a framed table with a seeded
// entry, header handles and real window-level pointer helpers.
const makeFramedFixture = (mode, initial = [240, 240, 240], minima = initial.map(() => 48)) => {
  const muya = makeFakeMuya()
  const resize = muya.tableResize
  CLEANUP.push(() => resize.destroy())
  const headerTexts = initial.map((_, i) => `Column ${i}`)
  const built = buildTableFigure('seq', headerTexts)
  muya.container.appendChild(built.figure)
  const frame = initial.reduce((a, b) => a + b, 0)
  Object.defineProperty(built.figure, 'clientWidth', { value: frame + 1, configurable: true })
  Object.defineProperty(built.wrapper, 'clientWidth', { value: frame + 1, configurable: true })
  resize.modes.set(built.table.id, mode)
  // Fit's automatic squeeze can legitimately be below the drag floor.
  resize.widths.set(built.table.id, { widths: initial.slice(), manual: initial.map(() => false) })
  const handles = addHandles(built.row)
  const widths = () => resize.getWidths(built.table.id)
  const entryNow = () => resize.widths.get(built.table.id)
  built.table.getBoundingClientRect = () => ({ left: 0, right: frame, width: frame, top: 0, height: 40 })
  // Entry-safe cell rects: the whole-table framed reset deletes the width
  // entry BEFORE the mode re-fit re-creates it (resetTable → stripWidths →
  // ensureColumnWalls reads the cells). A real browser lays the stripped
  // table out at its natural width in that window — the fixture mirrors
  // that instead of throwing on the absent entry.
  Array.from(built.row.cells).forEach((cell, i) => {
    cell.getBoundingClientRect = () => {
      const entry = entryNow()
      const widthsNow = entry && Array.isArray(entry.widths) ? entry.widths : initial.slice()
      return {
        left: widthsNow.slice(0, i).reduce((a, b) => a + b, 0),
        width: widthsNow[i],
        right: widthsNow.slice(0, i + 1).reduce((a, b) => a + b, 0),
        top: 0, height: 20
      }
    }
  })
  vi.spyOn(resize, 'extentsFor').mockReturnValue({ minContent: minima, maxContent: initial.map(() => 600), wrappedMin: initial.map(() => 16) })
  resize.applyWidths(built.table, entryNow())
  const down = index => handles[index].dispatchEvent(pointerEvent('pointerdown', 400))
  const move = delta => window.dispatchEvent(pointerEvent('pointermove', 400 + delta))
  const up = () => window.dispatchEvent(new MouseEvent('pointerup'))
  const cancel = () => window.dispatchEvent(new MouseEvent('pointercancel'))
  const drag = (index, delta) => { down(index); move(delta); up() }
  return { ...built, headerTexts, muya, resize, widths, entryNow, down, move, up, cancel, drag, frame }
}
// END_BLOCK_COMPLETION_FIXTURES

// START_BLOCK_CAUSE_MODEL_ASSERTIONS
describe('the cause model and its static write permit (C-TABLE-LAYOUT-COMPLETION)', () => {
  it('defines every documented cause and gates writes by the closed per-cause set only', () => {
    const values = Object.values(COMPLETION_CAUSE)
    expect(new Set(values).size).toBe(values.length)
    expect(values.sort()).toEqual([
      'adopt', 'column-drag-end', 'column-reset', 'destroy', 'gesture-rollback',
      'mode-choice', 'preview', 'reconcile', 'refit', 'refresh',
      'scroll', 'wall-drag-end', 'wall-reset', 'window'
    ].sort())
    const qualifying = [
      COMPLETION_CAUSE.MODE_CHOICE,
      COMPLETION_CAUSE.WALL_DRAG_END,
      COMPLETION_CAUSE.COLUMN_DRAG_END,
      COMPLETION_CAUSE.WALL_RESET,
      COMPLETION_CAUSE.COLUMN_RESET
    ]
    expect([...COMPLETION_CAUSE_WRITES_PROFILE].sort()).toEqual(qualifying.slice().sort())
    // Every non-qualifying cause is outside the permit — a successful
    // measurement or a changed serialization can never widen it.
    for (const cause of values) {
      expect(COMPLETION_CAUSE_WRITES_PROFILE.has(cause)).toBe(qualifying.includes(cause))
    }
    expect(COMPLETION_CAUSE_WRITES_PROFILE.has(COMPLETION_CAUSE.PREVIEW)).toBe(false)
    expect(COMPLETION_CAUSE_WRITES_PROFILE.has(COMPLETION_CAUSE.REFRESH)).toBe(false)
    expect(COMPLETION_CAUSE_WRITES_PROFILE.has(COMPLETION_CAUSE.ADOPT)).toBe(false)
    expect(COMPLETION_CAUSE_WRITES_PROFILE.has(COMPLETION_CAUSE.DESTROY)).toBe(false)
  })
})
// END_BLOCK_CAUSE_MODEL_ASSERTIONS

// START_BLOCK_MODE_COMPLETION_ASSERTIONS
describe('MODE_CHOICE — the mode segment completions', () => {
  it('Auto drops session widths and the explicit table width, rebuilds the walls and writes once per action', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    const { auto, fit } = buildToolbarDom(built.figure)
    stubWallGeometry(built, resize)
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.widths.get('t1').tableWidth = 300
    resize.refreshTableSurfaces()
    expect(built.figure.querySelector('.ag-table-wall')).toBeTruthy()

    // The Fit switch removes the walls (Auto is their one home)…
    fit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(resize.modeOf('t1')).toBe('fit')
    expect(built.figure.querySelector('.ag-table-wall')).toBeNull()
    expect(layoutDispatches(muya)).toHaveLength(1)

    // …and the Auto choice REBUILDS them through the completion stage,
    // dropping the widths and the explicit table width with the mode.
    auto.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(resize.modeOf('t1')).toBe('auto')
    expect(built.figure.querySelector('.ag-table-wall')).toBeTruthy()
    expect(built.table.querySelector('colgroup')).toBeNull()
    expect(resize.getWidths('t1')).toBeUndefined()
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(2) // exactly one per qualifying action
    expect(dispatches[1][1]).toEqual({ entries: {} })
  })

  it('an explicit Auto under a non-Auto default persists the mode intent without stale widths', () => {
    const muya = makeFakeMuya({ tableFullWidthDefault: 'fit' })
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    const { auto } = buildToolbarDom(built.figure)
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.widths.get('t1').tableWidth = 300

    auto.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(resize.modeOf('t1')).toBe('auto')
    expect(resize.getWidths('t1')).toBeUndefined()
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({
      entries: { [pidOf(0, ['Alpha', 'Beta'])]: { widths: [], manual: [], mode: 'auto' } }
    })
  })

  it('Fit re-applies the stored ratios into the frame; a repeated choice writes exactly once per action', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    const { fit, full, auto } = buildToolbarDom(built.figure)
    stubFrameGeometry(built, resize, { figureWidth: 400 })
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.widths.get('t1').ratios = [0.5, 0.5]

    fit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(resize.modeOf('t1')).toBe('fit')
    expect(built.table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    expect(fit.classList.contains('ag-table-toolbar-active')).toBe(true)
    expect(full.classList.contains('ag-table-toolbar-active')).toBe(false)
    expect(auto.classList.contains('ag-table-toolbar-active')).toBe(false)
    // The ratios were re-applied to the new frame (not the seeded 120/80).
    const fitted = resize.getWidths('t1')
    expect(fitted.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(400)
    expect(fitted).not.toEqual([120, 80])

    // A repeated choice is one qualifying action: exactly one more write.
    fit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(2)
    const pid = pidOf(0, ['Alpha', 'Beta'])
    for (const [, payload] of dispatches) {
      expect(payload.entries[pid].mode).toBe('fit')
      expect(payload.entries[pid].ratios).toEqual([0.5, 0.5])
    }
    expect(dispatches[1][1]).toEqual({ entries: resize.serializeTableLayouts() })
  })

  it('Full spans its canvas frame; the segment and cue follow; one dispatch per action', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    const { fit, full } = buildToolbarDom(built.figure)
    stubFrameGeometry(built, resize, { figureWidth: 400, wrapperWidth: 601 })
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.widths.get('t1').ratios = [0.5, 0.5]

    full.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(resize.modeOf('t1')).toBe('full')
    expect(built.figure.classList.contains(TABLE_FULL_WIDTH_CLASS)).toBe(true)
    expect(full.classList.contains('ag-table-toolbar-active')).toBe(true)
    expect(fit.classList.contains('ag-table-toolbar-active')).toBe(false)
    // The ratios re-applied to the WIDER canvas frame, not the text column.
    const fitted = resize.getWidths('t1')
    expect(fitted.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(601)
    expect(fitted).not.toEqual([120, 80])
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({ entries: resize.serializeTableLayouts() })
    expect(dispatches[0][1].entries[pidOf(0, ['Alpha', 'Beta'])].mode).toBe('full')
  })

  it('a hidden/zero-geometry choice persists its intent, defers layout, and a later measurable pass applies the real layout with NO second write', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    const { fit } = buildToolbarDom(built.figure)
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.widths.get('t1').ratios = [0.5, 0.5]

    fit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    // Zero geometry: the layout is deferred (no widths fabricated, no
    // cached measurement) but the mode intent persists exactly once.
    expect(built.table.classList.contains(TABLE_FIXED_CLASS)).toBe(false)
    expect(resize.fitCache.has('t1')).toBe(false)
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({
      entries: {
        [pidOf(0, ['Alpha', 'Beta'])]: { widths: [120, 80], manual: [true, false], ratios: [0.5, 0.5], mode: 'fit' }
      }
    })

    // The later measurable pass (a read-only reconcile completion)
    // applies the real layout WITHOUT a second write.
    stubFrameGeometry(built, resize, {
      figureWidth: 480,
      extents: { minContent: [48, 48], maxContent: [400, 400], wrappedMin: [16, 16] }
    })
    resize.reconcileAfterRender()
    expect(built.table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    const fitted = resize.getWidths('t1')
    expect(fitted.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(480)
    expect(fitted).not.toEqual([120, 80])
    expect(layoutDispatches(muya)).toHaveLength(1)
  })
})
// END_BLOCK_MODE_COMPLETION_ASSERTIONS

// START_BLOCK_GESTURE_COMPLETION_ASSERTIONS
describe('terminal gestures — WALL_DRAG_END / COLUMN_DRAG_END / GESTURE_ROLLBACK', () => {
  it('a moved wall terminal persists the explicit width once and settles walls + cue on the final edges', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    stubWallGeometry(built, resize)
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.refreshTableSurfaces()
    const wall = built.figure.querySelector('.ag-table-wall.ag-table-wall-right')
    expect(wall).toBeTruthy()

    wall.dispatchEvent(pointerEvent('pointerdown', 200))
    window.dispatchEvent(pointerEvent('pointermove', 300))
    window.dispatchEvent(new MouseEvent('pointerup'))

    const entry = resize.widths.get('t1')
    expect(entry.tableWidth).toBe(300)
    expect(resize.getWidths('t1')).toEqual([180, 120])
    // The stage's final wall settle: the right wall sits on the dragged edge.
    expect(built.figure.querySelector('.ag-table-wall.ag-table-wall-right').style.left).toBe('300px')
    // The stage's cue ran against the real final geometry (the native
    // scrollbar-height CSS variable is written from the wrapper).
    expect(built.wrapper.style.getPropertyValue('--ag-table-scrollbar-height')).toBe('0px')
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({
      entries: { [pidOf(0, ['Alpha', 'Beta'])]: { widths: [180, 120], manual: [true, false], tableWidth: 300 } }
    })
  })

  it('a moved column terminal persists the paired manual flags + ratios once and keeps the entry identity', () => {
    const f = makeFramedFixture('fit')
    const entryBefore = f.resize.widths.get(f.table.id)
    f.drag(0, -180)
    expect(f.widths()).toEqual([60, 420, 240])
    // The active gesture keeps its entry object identity.
    expect(f.resize.widths.get(f.table.id)).toBe(entryBefore)
    expect(entryBefore.manual).toEqual([true, true, false])
    const dispatches = layoutDispatches(f.muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({
      entries: {
        [pidOf(0, f.headerTexts)]: {
          widths: [60, 420, 240], manual: [true, true, false], mode: 'fit', ratios: entryBefore.ratios
        }
      }
    })
  })

  it('a no-move wall click is a GESTURE_ROLLBACK: nothing freezes, nothing writes', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    stubWallGeometry(built, resize)
    resize.refreshTableSurfaces()
    const wall = built.figure.querySelector('.ag-table-wall.ag-table-wall-right')

    wall.dispatchEvent(pointerEvent('pointerdown', 200))
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(resize.widths.has('t1')).toBe(false)
    expect(built.table.classList.contains('ag-column-resizing')).toBe(false)
    expect(layoutDispatches(muya)).toHaveLength(0)
  })

  it('a return-to-start column gesture restores the baseline (natural width not frozen) and never writes', () => {
    const f = makeFramedFixture('fit')
    f.down(0)
    // move() takes the delta FROM THE DOWN POINT (clientX 400): the return
    // leg must land back on that point (delta 0), not drift another +100.
    f.move(-100)
    f.move(0)
    f.up()
    expect(f.widths()).toEqual([240, 240, 240])
    expect(f.entryNow().manual).toEqual([false, false, false])
    expect(layoutDispatches(f.muya)).toHaveLength(0)
  })

  it('a plain handle click (no move) undoes the created baseline and never writes', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(built.figure)
    const [handle] = addHandles(built.row)

    handle.dispatchEvent(pointerEvent('pointerdown', 100))
    expect(resize.widths.has('t1')).toBe(true) // the drag baseline was created
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(resize.widths.has('t1')).toBe(false)
    expect(built.table.querySelector('colgroup')).toBeNull()
    expect(layoutDispatches(muya)).toHaveLength(0)
  })

  // pointercancel shares handlePointerUp with pointerup — the outcomes
  // must be byte-identical, never a new cancel policy.
  const runFramedGesture = (terminal, moved) => {
    const f = makeFramedFixture('fit')
    f.down(0)
    if (moved) f.move(-180)
    f[terminal]()
    return {
      widths: f.widths(),
      manual: f.entryNow().manual.slice(),
      ratios: f.entryNow().ratios ? f.entryNow().ratios.slice() : undefined,
      payload: layoutDispatches(f.muya).map(([, p]) => p)
    }
  }
  it('pointercancel is byte-identical to pointerup for a moved column gesture', () => {
    expect(runFramedGesture('cancel', true)).toEqual(runFramedGesture('up', true))
    const viaCancel = runFramedGesture('cancel', true)
    expect(viaCancel.widths).toEqual([60, 420, 240])
    expect(viaCancel.payload).toHaveLength(1)
  })
  it('pointercancel is byte-identical to pointerup for a no-move column gesture', () => {
    expect(runFramedGesture('cancel', false)).toEqual(runFramedGesture('up', false))
    expect(runFramedGesture('cancel', false).payload).toHaveLength(0)
  })

  const runBareGesture = (terminal, moved) => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha'])
    muya.container.appendChild(built.figure)
    const [handle] = addHandles(built.row)
    handle.dispatchEvent(pointerEvent('pointerdown', 100))
    if (moved) window.dispatchEvent(pointerEvent('pointermove', 160))
    if (terminal === 'up') window.dispatchEvent(new MouseEvent('pointerup'))
    else window.dispatchEvent(new MouseEvent('pointercancel'))
    return {
      hasEntry: resize.widths.has('t1'),
      colgroup: !!built.table.querySelector('colgroup'),
      dispatchCount: layoutDispatches(muya).length
    }
  }
  it('pointercancel is byte-identical to pointerup for a moved bare-table gesture', () => {
    expect(runBareGesture('cancel', true)).toEqual(runBareGesture('up', true))
    expect(runBareGesture('cancel', true)).toEqual({ hasEntry: true, colgroup: true, dispatchCount: 1 })
  })
  it('pointercancel is byte-identical to pointerup for a no-move bare-table gesture', () => {
    expect(runBareGesture('cancel', false)).toEqual(runBareGesture('up', false))
    expect(runBareGesture('cancel', false)).toEqual({ hasEntry: false, colgroup: false, dispatchCount: 0 })
  })

  const runWallGesture = (terminal) => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    stubWallGeometry(built, resize)
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.refreshTableSurfaces()
    built.figure.querySelector('.ag-table-wall.ag-table-wall-right')
      .dispatchEvent(pointerEvent('pointerdown', 200))
    window.dispatchEvent(pointerEvent('pointermove', 300))
    if (terminal === 'up') window.dispatchEvent(new MouseEvent('pointerup'))
    else window.dispatchEvent(new MouseEvent('pointercancel'))
    return {
      widths: resize.getWidths('t1'),
      tableWidth: resize.widths.get('t1').tableWidth,
      payload: layoutDispatches(muya).map(([, p]) => p)
    }
  }
  it('pointercancel is byte-identical to pointerup for a moved wall gesture', () => {
    expect(runWallGesture('cancel')).toEqual(runWallGesture('up'))
    expect(runWallGesture('cancel').tableWidth).toBe(300)
    expect(runWallGesture('cancel').payload).toHaveLength(1)
  })
})
// END_BLOCK_GESTURE_COMPLETION_ASSERTIONS

// START_BLOCK_RESET_COMPLETION_ASSERTIONS
describe('the reset completions — WALL_RESET / COLUMN_RESET (whole and partial)', () => {
  it('WALL_RESET in Auto drops the explicit width back to content sizing and persists once', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    stubWallGeometry(built, resize)
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.widths.get('t1').tableWidth = 300
    resize.refreshTableSurfaces()
    const wall = built.figure.querySelector('.ag-table-wall.ag-table-wall-right')

    wall.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 200, button: 0 }))

    expect(resize.widths.has('t1')).toBe(false)
    expect(built.table.querySelector('colgroup')).toBeNull()
    expect(built.table.classList.contains(TABLE_FIXED_CLASS)).toBe(false)
    // The stage rebuilt the walls on the content-sized edges.
    expect(built.figure.querySelector('.ag-table-wall')).toBeTruthy()
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({ entries: {} })
  })

  it('WALL_RESET in a framed mode fits before persisting, without the explicit width', () => {
    const f = makeFramedFixture('fit')
    f.entryNow().ratios = [0.5, 0.5, 0.5]
    f.entryNow().tableWidth = 900
    // A stale wall element from the earlier Auto state is the dblclick target.
    const wall = document.createElement('span')
    wall.className = 'ag-table-wall ag-table-wall-right'
    wall.dataset.tableWallSide = 'right'
    f.figure.appendChild(wall)

    wall.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 200, button: 0 }))

    const entry = f.entryNow()
    expect(entry.tableWidth).toBeUndefined()
    // The fitted re-application precedes the persist.
    expect(entry.widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(f.frame)
    expect(entry.manual).toEqual([false, false, false])
    const dispatches = layoutDispatches(f.muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({ entries: f.resize.serializeTableLayouts() })
    expect(dispatches[0][1].entries[pidOf(0, f.headerTexts)].mode).toBe('fit')
    expect(dispatches[0][1].entries[pidOf(0, f.headerTexts)].tableWidth).toBeUndefined()
  })

  it('a whole-table COLUMN_RESET in Auto returns to content sizing and persists the removal', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    stubWallGeometry(built, resize)
    const handles = addHandles(built.row)
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.reconcileAfterRender()
    expect(built.table.querySelector('colgroup')).toBeTruthy()

    handles[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    expect(resize.widths.has('t1')).toBe(false)
    expect(built.table.querySelector('colgroup')).toBeNull()
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({ entries: {} })
  })

  it('a whole-table COLUMN_RESET in a framed mode re-fits the mode layout before persisting', () => {
    const f = makeFramedFixture('fit')
    const entry = f.entryNow()
    entry.manual = [true, false, false]
    const handles = f.figure.querySelectorAll(`.${RESIZER_CLASS}`)
    handles[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    expect(f.resize.modeOf(f.table.id)).toBe('fit')
    const next = f.entryNow()
    expect(next.manual).toEqual([false, false, false])
    expect(next.widths.every(Number.isInteger)).toBe(true)
    expect(next.widths.reduce((a, b) => a + b, 0)).toBe(f.frame)
    expect(f.table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    const dispatches = layoutDispatches(f.muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({ entries: f.resize.serializeTableLayouts() })
  })

  it('a partial COLUMN_RESET in Auto measures the natural width of the reset column and persists once', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    stubWallGeometry(built, resize)
    const handles = addHandles(built.row)
    resize.setTableWidths('t1', [120, 80], [true, true])
    resize.reconcileAfterRender()

    handles[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    // The stub sizes both header cells at 120: the reset column keeps its
    // MEASURED auto width and loses only its own manual flag.
    expect(resize.getWidths('t1')).toEqual([120, 120])
    const entry = resize.widths.get('t1')
    expect(entry.manual).toEqual([true, false])
    expect(entry.ratios).toEqual([0.5, 0.5])
    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1]).toEqual({
      entries: {
        [pidOf(0, ['Alpha', 'Beta'])]: { widths: [120, 120], manual: [true, false], ratios: [0.5, 0.5] }
      }
    })
  })

  it('a partial COLUMN_RESET in a framed mode fits before persisting and keeps the other manual flags', () => {
    const f = makeFramedFixture('fit')
    f.drag(0, -180) // manual [true, true, false]
    const handles = f.figure.querySelectorAll(`.${RESIZER_CLASS}`)
    handles[2].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    const entry = f.entryNow()
    expect(entry.manual).toEqual([true, true, false])
    expect(entry.widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(f.frame)
    const dispatches = layoutDispatches(f.muya)
    expect(dispatches).toHaveLength(2) // one per qualifying action (drag + reset)
    expect(dispatches[1][1]).toEqual({ entries: f.resize.serializeTableLayouts() })
  })
})
// END_BLOCK_RESET_COMPLETION_ASSERTIONS

// START_BLOCK_READONLY_ASSERTIONS
describe('read-only completions repaint their surfaces but never write', () => {
  // A wide two-column table over a 400px port: the cue reports the hidden
  // right edge — a positive, observable cue fact for every absence pin.
  const buildCueFixture = () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['A', 'B'], { width: 300 })
    muya.container.appendChild(built.figure)
    built.wrapper.getBoundingClientRect = () => ({ left: 100, top: 0, right: 300, width: 200, height: 100 })
    Object.defineProperty(built.wrapper, 'clientWidth', { value: 200, configurable: true })
    return { muya, resize, built }
  }

  it('PREVIEW never completes a write — behaviorally and by permit', () => {
    const f = makeFramedFixture('fit')
    f.down(0)
    f.move(-180) // the preview surface moved the widths and painted the chips…
    expect(f.widths()).toEqual([60, 420, 240])
    expect(f.figure.querySelector('.ag-table-size-chips')).toBeTruthy()
    expect(layoutDispatches(f.muya)).toHaveLength(0)
    // …and a preview-cause completion (never reachable from a handler)
    // cannot write either, while its surfaces still run.
    f.resize.completeTableOperation(COMPLETION_CAUSE.PREVIEW, { key: f.table.id, figure: f.figure, table: f.table })
    expect(layoutDispatches(f.muya)).toHaveLength(0)
    f.up()
    expect(layoutDispatches(f.muya)).toHaveLength(1) // the terminal still writes once
  })

  it('ADOPT applies the stored layout without a single write', async () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)

    resize.applyPersistedLayouts({
      [pidOf(0, ['Alpha', 'Beta'])]: { widths: [120, 80], manual: [true, false] }
    })
    await flushAdoption()

    expect(resize.getWidths('t1')).toEqual([120, 80])
    expect(built.table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    expect(layoutDispatches(muya)).toHaveLength(0)
  })

  it('RECONCILE re-applies a stored layout without a write', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    resize.setTableWidths('t1', [120, 80], [true, false])

    resize.reconcileAfterRender()

    expect(built.table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    expect(built.table.querySelector('colgroup col').style.width).toBe('120px')
    expect(layoutDispatches(muya)).toHaveLength(0)
  })

  it('REFIT re-applies the stored ratios into the frame without a write', () => {
    const f = makeFramedFixture('fit')
    f.entryNow().ratios = [1 / 3, 1 / 3, 1 / 3]
    f.resize.refitNow()
    // The ratios were re-applied to the frame (sum stays inside it)…
    expect(f.widths().reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(f.frame)
    // …and the read-only REFIT completion wrote nothing.
    expect(layoutDispatches(f.muya)).toHaveLength(0)
  })

  it('REFRESH repaints the cue surfaces (shades, scrollbar-height variable, caption) and writes nothing', () => {
    const { muya, built } = buildCueFixture()

    muya.tableResize.refreshTableSurfaces()

    expect(built.wrapper.classList.contains(TABLE_CUE_LEFT_CLASS)).toBe(true)
    expect(built.wrapper.classList.contains(TABLE_CUE_RIGHT_CLASS)).toBe(true)
    expect(built.wrapper.style.getPropertyValue('--ag-table-scrollbar-height')).toBe('0px')
    expect(built.caption.classList.contains('ag-table-caption-on')).toBe(true)
    expect(built.caption.textContent).toBe('columns 1–1 of 2')
    expect(layoutDispatches(muya)).toHaveLength(0)
  })

  it('WINDOW keeps the clip/walls/zones/cue surfaces alive and writes nothing', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    stubWallGeometry(built, resize)

    resize.handleWindowResize()

    // The clip prep ran (one-way ghost-tail clip)…
    expect(built.wrapper.style.overflowX).toBe('hidden')
    // …the stage's zone/walls/cue passes ran…
    expect(built.figure.querySelector('.ag-table-wall')).toBeTruthy()
    expect(built.wrapper.querySelector('.ag-column-walls')).toBeTruthy()
    expect(built.wrapper.style.getPropertyValue('--ag-table-scrollbar-height')).toBe('0px')
    // …and nothing was written.
    expect(layoutDispatches(muya)).toHaveLength(0)
  })

  it('SCROLL keeps the caption live and writes nothing', () => {
    const { muya, built } = buildCueFixture()

    built.wrapper.dispatchEvent(new Event('scroll'))

    expect(built.caption.classList.contains('ag-table-caption-on')).toBe(true)
    expect(built.caption.textContent).toBe('columns 1–1 of 2')
    expect(built.wrapper.classList.contains(TABLE_CUE_RIGHT_CLASS)).toBe(true)
    expect(layoutDispatches(muya)).toHaveLength(0)
  })
})
// END_BLOCK_READONLY_ASSERTIONS

// START_BLOCK_MUTATION_CONTROLS
describe('mutation controls — the write permit cannot be widened', () => {
  it('a REFRESH completion must not dispatch even when the serialization differs from the snapshot', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    // A deliberately stale/different host snapshot: the inequality would
    // tempt a serializer-driven write — the cause set refuses it.
    resize.persisted = { [pidOf(0, ['Alpha', 'Beta'])]: { widths: [1], manual: [true] } }
    resize.setTableWidths('t1', [130, 90], [true, false])
    expect(resize.serializeTableLayouts()).not.toEqual(resize.persisted)

    resize.refreshTableSurfaces()

    expect(layoutDispatches(muya)).toHaveLength(0)
  })

  it('a user commit replaces a stale host snapshot instead of re-adopting it', () => {
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    const pid = pidOf(0, ['Alpha', 'Beta'])
    // A stale snapshot from a previous document state.
    resize.persisted = { [pid]: { widths: [10, 10], manual: [true, true], mode: 'fit' } }
    stubWallGeometry(built, resize)
    resize.setTableWidths('t1', [120, 80], [true, false])
    resize.refreshTableSurfaces()

    // The real user write: a moved wall drag through the completion stage.
    built.figure.querySelector('.ag-table-wall.ag-table-wall-right')
      .dispatchEvent(pointerEvent('pointerdown', 200))
    window.dispatchEvent(pointerEvent('pointermove', 300))
    window.dispatchEvent(new MouseEvent('pointerup'))

    const dispatches = layoutDispatches(muya)
    expect(dispatches).toHaveLength(1)
    const entries = dispatches[0][1].entries
    // Nothing from the stale snapshot was adopted into the dispatch.
    expect(entries[pid].mode).toBeUndefined()
    expect(entries[pid].widths).toEqual([180, 120])
    expect(resize.modeOf('t1')).toBe('auto')
    // The in-memory snapshot now equals the dispatched entries.
    expect(resize.persisted).toEqual(entries)
  })

  it('the remember-off gate skips the stage write while the mode itself still applies', () => {
    const muya = makeFakeMuya({ rememberTableColumnSizes: false })
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['Alpha', 'Beta'])
    muya.container.appendChild(built.figure)
    const { fit } = buildToolbarDom(built.figure)
    stubFrameGeometry(built, resize, {
      figureWidth: 480,
      extents: { minContent: [48, 48], maxContent: [400, 400], wrappedMin: [16, 16] }
    })
    resize.setTableWidths('t1', [120, 80], [true, false])
    // A rendered document mints identities before the user acts (the render
    // funnel) — so the silent dispatch below is the remember-off GATE, not
    // a missing identity.
    resize.reconcileAfterRender()

    fit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    // The choice applied (session work continues)…
    expect(resize.modeOf('t1')).toBe('fit')
    expect(built.table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    // …and the state is even serializable — the GATE, not emptiness,
    // kept the dispatch silent.
    expect(Object.keys(resize.serializeTableLayouts())).toContain(pidOf(0, ['Alpha', 'Beta']))
    expect(layoutDispatches(muya)).toHaveLength(0)
  })

  it('a successful measurement during a read-only pass never writes; a zero-geometry user action still does', () => {
    // (1) A measurable read-only pass: the measurement succeeds and the
    // real layout is applied — still no write.
    const measured = makeFakeMuya()
    const mResize = measured.tableResize
    const mBuilt = buildTableFigure('m1', ['Alpha', 'Beta'])
    measured.container.appendChild(mBuilt.figure)
    stubFrameGeometry(mBuilt, mResize, {
      figureWidth: 480,
      extents: { minContent: [48, 48], maxContent: [400, 400], wrappedMin: [16, 16] }
    })
    mResize.setTableWidths('m1', [120, 80], [true, false])
    // The framed modes are what a refit re-plans (Auto re-flows natively):
    // give the table an explicit Fit choice so the measurement is real.
    mResize.modes.set('m1', 'fit')
    mResize.refitNow()
    expect(mBuilt.table.classList.contains(TABLE_FIXED_CLASS)).toBe(true)
    expect(layoutDispatches(measured)).toHaveLength(0)

    // (2) A zero-geometry qualifying action persists its mode intent.
    const hidden = makeFakeMuya()
    const hResize = hidden.tableResize
    const hBuilt = buildTableFigure('h1', ['Alpha', 'Beta'])
    hidden.container.appendChild(hBuilt.figure)
    const { fit } = buildToolbarDom(hBuilt.figure)
    hResize.setTableWidths('h1', [120, 80], [true, false])
    hResize.widths.get('h1').ratios = [0.5, 0.5]
    fit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const dispatches = layoutDispatches(hidden)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0][1].entries[pidOf(0, ['Alpha', 'Beta'])].mode).toBe('fit')
  })
})
// END_BLOCK_MUTATION_CONTROLS

// START_BLOCK_LIFECYCLE_ASSERTIONS
describe('lifecycle teardown — destroy cancels owned work and never writes', () => {
  it('cancels the pending adoption/refit/repaint frames, restores the prior transform, removes the drag listeners and writes nothing', () => {
    const frames = []
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => { frames.push(cb); return frames.length })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
    const muya = makeFakeMuya()
    const resize = muya.tableResize
    const built = buildTableFigure('t1', ['A', 'B'])
    muya.container.appendChild(built.figure)

    // A pending adoption (double rAF), a drag in flight, a pending
    // repaint frame over a prior transform, and a debounced refit.
    resize.applyPersistedLayouts({
      [pidOf(0, ['A', 'B'])]: { widths: [90, 80], manual: [true, false] }
    })
    const [handle] = addHandles(built.row)
    handle.dispatchEvent(pointerEvent('pointerdown', 100))
    expect(resize.dragging).toBeTruthy()
    built.table.getBoundingClientRect = () => ({ width: 200 })
    built.table.style.transform = 'scale(0.8)'
    resize.repaintTableLayer(built.table)
    resize.scheduleRefit()

    const removeSpy = vi.spyOn(window, 'removeEventListener')
    resize.destroy()
    while (frames.length) frames.shift()()

    expect(removeSpy).toHaveBeenCalledWith('pointermove', resize.handlePointerMove)
    expect(removeSpy).toHaveBeenCalledWith('pointerup', resize.handlePointerUp)
    expect(removeSpy).toHaveBeenCalledWith('pointercancel', resize.handlePointerUp)
    // The prior transform was restored (the translateZ layer hint stripped).
    expect(built.table.style.transform.includes('translateZ')).toBe(false)
    expect(built.table.style.transform.startsWith('scale(0.8)')).toBe(true)
    // The adoption never landed (the persisted widths were NOT adopted).
    expect(resize.getWidths('t1')).toEqual([120, 120])
    expect(resize.dragging).toBeNull()
    expect(layoutDispatches(muya)).toHaveLength(0)
  })
})
// END_BLOCK_LIFECYCLE_ASSERTIONS

// START_BLOCK_SOURCE_IMMUTABILITY_ASSERTIONS
// Source inventory + sibling immutability: the completion boundary must
// leave the pure maths modules and the external callers byte-identical,
// and the serializer must keep exactly ONE authorized call site — inside
// completeTableOperation. These pins complement, never replace, the
// behavioral pins above.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const readSrc = (rel) => readFileSync(resolve(ROOT, rel), 'utf8')
const SOURCE_INDEX = readSrc('src/muya/lib/tableResize/index.js')
const SOURCE_FIT = readSrc('src/muya/lib/tableResize/tableFit.js')
const SOURCE_CUE = readSrc('src/muya/lib/tableResize/tableCue.js')
const SOURCE_RENDER = readSrc('src/muya/lib/parser/render/index.js')
const SOURCE_RESIZE_HANDLER = readSrc('src/muya/lib/eventHandler/resize.js')

describe('source inventory + sibling immutability (C-TABLE-LAYOUT-COMPLETION)', () => {
  it('the serializer has exactly one authorized persist call site, inside the completion stage', () => {
    const callSites = SOURCE_INDEX.match(/this\.persist\(\)/g) || []
    expect(callSites).toHaveLength(1)
    const stageAt = SOURCE_INDEX.indexOf('completeTableOperation(cause, { key, figure, table } = {})')
    const persistAt = SOURCE_INDEX.indexOf('this.persist()')
    expect(stageAt).toBeGreaterThan(-1)
    expect(persistAt).toBeGreaterThan(stageAt)
    // Every rewritten completion site routes its cause through the stage.
    for (const marker of [
      'BLOCK_TABLE_MODE',
      'BLOCK_TABLE_WALL_WIDTH',
      'BLOCK_COLUMN_RESIZED',
      'BLOCK_TABLE_WALL_RESET',
      'col=${columnIndex} mode=auto]',
      'col=${columnIndex} width='
    ]) {
      const at = SOURCE_INDEX.indexOf(marker)
      expect(at).toBeGreaterThan(-1)
      expect(SOURCE_INDEX.indexOf('completeTableOperation(COMPLETION_CAUSE.', at)).toBeGreaterThan(at)
    }
  })

  it('the read-only funnels route through the stage; destroy and preview never complete', () => {
    expect(SOURCE_INDEX).toContain('refreshTableSurfaces(cause = COMPLETION_CAUSE.REFRESH)')
    expect(SOURCE_INDEX).toContain('this.refreshTableSurfaces(COMPLETION_CAUSE.ADOPT)')
    expect(SOURCE_INDEX).toContain('this.refreshTableSurfaces(COMPLETION_CAUSE.RECONCILE)')
    expect(SOURCE_INDEX).toContain('this.refreshTableSurfaces(COMPLETION_CAUSE.REFIT)')
    expect(SOURCE_INDEX).toContain('completeTableOperation(COMPLETION_CAUSE.SCROLL')
    expect(SOURCE_INDEX).toContain('completeTableOperation(COMPLETION_CAUSE.WINDOW')
    expect(SOURCE_INDEX).not.toContain('COMPLETION_CAUSE.DESTROY)')
    expect(SOURCE_INDEX).not.toContain('COMPLETION_CAUSE.PREVIEW)')
  })

  it('the pure sibling modules and the external callers stay byte-identical', () => {
    // tableFit.js — pure maths, untouched by the completion boundary.
    expect(SOURCE_FIT).toContain('// VERSION: 1.2.1')
    expect(SOURCE_FIT).toContain('export const measureColumnExtents')
    expect(SOURCE_FIT).toContain('export const planTableFit')
    expect(SOURCE_FIT).toContain('export const applyRatiosToWidth')
    expect(SOURCE_FIT).not.toContain('completeTableOperation')
    expect(SOURCE_FIT).not.toContain('COMPLETION_CAUSE')
    expect(SOURCE_FIT).not.toContain('this.persist()')
    // tableCue.js — the shared cue owner, consumed read-only by the stage.
    expect(SOURCE_CUE).toContain('// VERSION: 1.3.0')
    expect(SOURCE_CUE).toContain('export const syncTableCue')
    expect(SOURCE_CUE).not.toContain('completeTableOperation')
    expect(SOURCE_CUE).not.toContain('COMPLETION_CAUSE')
    // The external callers keep their argument-free funnel calls.
    expect(SOURCE_RENDER).toContain('tableResize.reconcileAfterRender()')
    expect(SOURCE_RESIZE_HANDLER).toContain('if (this.muya.tableResize?.refitNow) this.muya.tableResize.refitNow()')
    expect(SOURCE_RESIZE_HANDLER).toContain('this.muya.tableResize?.refreshTableSurfaces?.()')
  })
})
// END_BLOCK_SOURCE_IMMUTABILITY_ASSERTIONS


