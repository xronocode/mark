// FILE: tests/renderer/muya/table-cue.test.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-65 overflow cue and table toolbar — the pure «columns X–Y of N» range math (start / middle / end / fits / single column / degenerate), the caption formatting incl. the token fallback and the full-width «all N columns», the DOM state gathering and sync (caption text/visibility + shade side classes, live translator pin), the renderTableToolbar vnode (buttons, labels, active state, family classes, dataset actions, need-gated expand) and the C-65 CSS literals (toolbar above the table on the column edge, caption below it, class-gated shades, full-width breakout).
//   SCOPE: src/muya/lib/tableResize/tableCue.js, src/muya/lib/parser/render/renderBlock/renderTableToolbar.js, the C-65 section of lib/assets/styles/index.css, and the START_BLOCK_TABLE_TOOLBAR_AND_CAPTION placement in renderContainerBlock.js.
//   DEPENDS: Vitest + jsdom, muya snabbdom h, node:fs for the CSS read.
//   LINKS: .grace/changes/active/C-65 T-002/T-003; .grace/verification/runtime.xml V-M-012 scenario-66; the persistence twin tests/renderer/muya/table-layout-persistence.test.js; e2e tests/e2e/table-toolbar.spec.ts and table-layout.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TEMPLATES - token templates for the params-aware fake translator.
//   t - params-aware translator, compared with throwing/non-string/token-preserving fallback paths.
//   identityT - fake translator that ignores params (the fallback path exercises the token replacement).
//   columnsOf - builds a contiguous column geometry array.
//   buildFigure - jsdom table/caption scroll-block fixture with header, native scrollbar metrics and viewport geometry.
//   rangeOf - visibleColumnRange over a columnsOf geometry and a span.
//   NINE - test helper (NINE).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-20 C-TABLE-FOOTER: caption inside the wrapper, fitting expanded tables clear text, native scrollbar-space compensation retains a fixed footer.
//   v1.2.0 - 2026-10-19 C-71: CSS centers full-width tables;
//   integrate reviewed c65cov cases for complete cue/toolbar coverage.
//   v1.1.0 - 2026-10-19 C-70: three table toolbar actions.
//   C-65 R-7 coverage completion: the
//   initial identity translator (before any pin — must run before the
//   pinned-translator case), degenerate column descriptors (null entries,
//   non-finite geometry, zero/negative widths), the null-last-column
//   right-edge fallback, the throwing / non-string / token-preserving
//   translator paths, the all-zero-measure null state and the
//   missing-caption sync.
//   v1.0.0 - 2026-10-18 C-65: new — every case fails without
//   tableCue.js / renderTableToolbar.js (no caption, no shade classes, no
//   toolbar) or against the pre-C-65 CSS (no placement rules).
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  CLIP_TOLERANCE_PX,
  TABLE_CAPTION_CLASS,
  TABLE_CAPTION_ON_CLASS,
  TABLE_CUE_LEFT_CLASS,
  TABLE_CUE_RIGHT_CLASS,
  TABLE_FULL_WIDTH_CLASS,
  VISIBLE_COLUMN_FRACTION,
  formatColumnsCaption,
  setTableCueTranslator,
  syncTableCue,
  tableCueState,
  visibleColumnRange
} from 'muya/lib/tableResize/tableCue'
import renderTableToolbar, {
  TABLE_TOOLBAR_BUTTON_SELECTOR,
  TABLE_TOOLBAR_SELECTOR,
  TOOLBAR_TABLE_FIT_ICON_PATH,
  TOOLBAR_TABLE_FULLWIDTH_ICON_PATH
} from 'muya/lib/parser/render/renderBlock/renderTableToolbar'

const TEMPLATES = {
  'tableToolbar.columnsRange': 'columns {start}–{end} of {total}',
  'tableToolbar.allColumns': 'all {total} columns'
}

const t = (key, params) => {
  let text = TEMPLATES[key] || key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(`{${name}}`, String(value))
    }
  }
  return text
}

// A translator that ignores the params object (identity-style): the
// formatter must still replace the tokens itself.
const identityT = (key) => TEMPLATES[key] || key

// START_BLOCK_CUE_FIXTURES
const columnsOf = (widths, startLeft = 0) => {
  const columns = []
  let left = startLeft
  for (const width of widths) {
    columns.push({ left, width })
    left += width
  }
  return columns
}

// Nine 100px columns: the canonical wide-table geometry.
const NINE = columnsOf(Array.from({ length: 9 }, () => 100))

const rangeOf = (columns, spanLeft, spanWidth) =>
  visibleColumnRange({ columns, spanLeft, spanWidth })

// jsdom figure with stubbed geometry: wrapperRect {left,width}, and one
// rect per header cell (contiguous, starting at tableLeft inside the
// wrapper's coordinate space is irrelevant — rects are viewport coords).
const buildFigure = ({ role = 'TABLE', headerTexts = ['A', 'B', 'C'], wrapperRect = { left: 100, width: 600 }, cellRects = null, clientWidth = null, fullWidth = false } = {}) => {
  const figure = document.createElement('figure')
  if (role) figure.setAttribute('data-role', role)
  if (fullWidth) figure.classList.add(TABLE_FULL_WIDTH_CLASS)
  const wrapper = document.createElement('div')
  wrapper.className = 'ag-table-scroll'
  const table = document.createElement('table')
  const thead = table.createTHead()
  const row = thead.insertRow(0)
  headerTexts.forEach((text) => {
    const th = document.createElement('th')
    th.textContent = text
    row.appendChild(th)
  })
  wrapper.appendChild(table)
  figure.appendChild(wrapper)
  const caption = document.createElement('div')
  caption.className = TABLE_CAPTION_CLASS
  wrapper.appendChild(caption)
  wrapper.getBoundingClientRect = () => ({ left: wrapperRect.left, width: wrapperRect.width })
  Object.defineProperty(wrapper, 'clientWidth', {
    value: clientWidth !== null ? clientWidth : wrapperRect.width,
    configurable: true
  })
  const cells = Array.from(row.cells)
  const rects = cellRects || columnsOf(cells.map(() => 100), wrapperRect.left)
  cells.forEach((cell, i) => {
    cell.getBoundingClientRect = () => ({ left: rects[i].left, width: rects[i].width })
  })
  return { figure, wrapper, table, caption, row }
}
// END_BLOCK_CUE_FIXTURES

// START_BLOCK_CUE_RANGE_ASSERTIONS
describe('visible column range math (C-65 T-003)', () => {
  it('at the start: the first columns are visible, only the right side hides columns', () => {
    // Span covers columns 0..5 of 9 fully.
    const state = rangeOf(NINE, 0, 600)
    expect(state).toMatchObject({ fits: false, start: 1, end: 6, total: 9, hiddenLeft: false, hiddenRight: true })
  })

  it('scrolled to the middle: both sides hide columns', () => {
    // Span covers [150, 750) of a 0..900 table: both edges cut columns
    // (col 1 and col 7 are each half in — exactly the majority rule).
    const state = rangeOf(NINE, 150, 600)
    expect(state).toMatchObject({ fits: false, start: 2, end: 8, total: 9, hiddenLeft: true, hiddenRight: true })
  })

  it('scrolled to the end: only the left side hides columns', () => {
    // The span reaches the table's right edge (columns 3..9).
    const state = rangeOf(NINE, 900 - 600, 600)
    expect(state).toMatchObject({ start: 4, end: 9, hiddenLeft: true, hiddenRight: false })
  })

  it('a table that fits has no hidden side and reads as fits', () => {
    const state = rangeOf(NINE, 0, 900)
    expect(state).toMatchObject({ fits: true, start: 1, end: 9, hiddenLeft: false, hiddenRight: false })
    // A sub-pixel overhang stays within the clip tolerance.
    const almost = rangeOf(NINE, 0, 900 - CLIP_TOLERANCE_PX + 0.5)
    expect(almost.fits).toBe(true)
  })

  it('a column counts as visible when at least half of it is in the span', () => {
    // Span starts at 60: column 0 shows 40 of 100 px (< 50%) and is NOT
    // mostly visible, so the range starts at column 2.
    const state = rangeOf(NINE, 60, 540)
    expect(state.start).toBe(2)
    // 50% exactly counts.
    const exact = rangeOf(NINE, 50, 550)
    expect(exact.start).toBe(1)
    expect(VISIBLE_COLUMN_FRACTION).toBe(0.5)
  })

  it('a single column wider than the span still names itself (overlap fallback)', () => {
    const single = columnsOf([1200])
    const state = rangeOf(single, 0, 600)
    expect(state).toMatchObject({ fits: false, start: 1, end: 1, total: 1, hiddenLeft: false, hiddenRight: true })
    const cut = rangeOf(single, 300, 600)
    expect(cut).toMatchObject({ start: 1, end: 1, hiddenLeft: true, hiddenRight: true })
    // A single column fully inside the port fits — no cue.
    expect(rangeOf(columnsOf([500]), 0, 600).fits).toBe(true)
  })

  it('returns null for degenerate inputs (no columns, no span, no overlap)', () => {
    expect(visibleColumnRange()).toBeNull()
    expect(visibleColumnRange({ columns: [], spanLeft: 0, spanWidth: 600 })).toBeNull()
    expect(visibleColumnRange({ columns: NINE, spanLeft: 0, spanWidth: 0 })).toBeNull()
    // The span sits entirely to the right of every column.
    expect(visibleColumnRange({ columns: NINE, spanLeft: 5000, spanWidth: 600 })).toBeNull()
  })

  it('skips degenerate column descriptors: null entries, non-finite geometry, zero widths', () => {
    const state = visibleColumnRange({
      spanLeft: 0,
      spanWidth: 600,
      columns: [
        null,                      // null entry: left and width fall back to 0
        { left: NaN, width: NaN }, // non-finite geometry falls back to 0
        { left: 0, width: 0 },     // zero width is never visible
        { left: 0, width: NaN },   // non-finite width falls back to 0
        { left: -20, width: -5 },  // negative width is never visible
        { left: 10, width: 50 }    // the one usable column
      ]
    })
    // Only the last column is picked; the degenerate first entry also makes
    // tableLeft fall back to 0.
    expect(state).toMatchObject({ fits: true, start: 6, end: 6, total: 6 })
  })

  it('a null last column degrades the right edge to the table left (no phantom shade)', () => {
    const state = visibleColumnRange({
      spanLeft: 0,
      spanWidth: 600,
      columns: [{ left: 100, width: 50 }, null]
    })
    expect(state).toMatchObject({ fits: true, start: 1, end: 1, total: 2 })
  })
})
// END_BLOCK_CUE_RANGE_ASSERTIONS

// START_BLOCK_CUE_FORMAT_ASSERTIONS
describe('caption formatting (C-65 T-003, ten-locale templates)', () => {
  it('a fitting table gets no caption; an overflowing one gets the range; full width gets «all N»', () => {
    expect(formatColumnsCaption(t, { fits: true, start: 1, end: 9, total: 9, hiddenLeft: false, hiddenRight: false })).toBeNull()
    expect(formatColumnsCaption(t, { fits: false, start: 3, end: 7, total: 9, hiddenLeft: true, hiddenRight: true })).toBe('columns 3–7 of 9')
    expect(formatColumnsCaption(t, { fullWidth: true, fits: false, total: 15, start: 1, end: 15, hiddenLeft: false, hiddenRight: false })).toBe('all 15 columns')
  })

  it('a translator without params support still gets its tokens replaced (fallback)', () => {
    expect(formatColumnsCaption(identityT, { fits: false, start: 1, end: 4, total: 9, hiddenLeft: true, hiddenRight: true })).toBe('columns 1–4 of 9')
    expect(formatColumnsCaption(identityT, { fullWidth: true, fits: false, total: 4 })).toBe('all 4 columns')
  })

  it('an unusable state formats to nothing; a missing translator degrades to the key', () => {
    expect(formatColumnsCaption(t, null)).toBeNull()
    expect(formatColumnsCaption(null, { fits: false, start: 1, end: 2, total: 3 })).toBe('tableToolbar.columnsRange')
  })

  it('a throwing translator degrades to the key; a non-string answer formats to nothing', () => {
    const boom = () => { throw new Error('i18n down') }
    expect(formatColumnsCaption(boom, { fits: false, start: 1, end: 2, total: 3 })).toBe('tableToolbar.columnsRange')
    expect(formatColumnsCaption(() => 42, { fits: false, start: 1, end: 2, total: 3 })).toBeNull()
  })

  it('tokens the params do not carry survive the token pass verbatim', () => {
    const partial = () => 'cols {unknown} of {total}'
    expect(formatColumnsCaption(partial, { fits: false, start: 1, end: 2, total: 3 })).toBe('cols {unknown} of 3')
  })
})
// END_BLOCK_CUE_FORMAT_ASSERTIONS

// START_BLOCK_CUE_STATE_ASSERTIONS
describe('table cue DOM state + sync (C-65 T-003)', () => {
  // Must run BEFORE any setTableCueTranslator pin in this file: it pins the
  // module's INITIAL identity translator (the arrow at tableCue.js:49),
  // which later constructions would otherwise replace forever.
  it('syncs with the initial identity translator before any pin (the key itself)', () => {
    const { figure, caption } = buildFigure({
      headerTexts: ['a', 'b', 'c'],
      wrapperRect: { left: 100, width: 150 }
    })
    const state = syncTableCue(figure)
    expect(state.start).toBe(1)
    expect(caption.textContent).toBe('tableToolbar.columnsRange')
  })

  it('gathers the range from the wrapper geometry (middle scroll)', () => {
    const { figure, wrapper } = buildFigure({
      headerTexts: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      wrapperRect: { left: 100, width: 300 },
      cellRects: columnsOf(Array.from({ length: 9 }, () => 100), 100)
    })
    // jsdom's real clientLeft is 0; the stubbed rects decide the range.
    const state = tableCueState(figure)
    expect(state).toMatchObject({ fullWidth: false, total: 9, start: 1, end: 3, hiddenLeft: false, hiddenRight: true })
    expect(wrapper.clientWidth).toBe(300)
  })

  it('full width short-circuits to «all N» with no shades', () => {
    const { figure } = buildFigure({ fullWidth: true, headerTexts: ['a', 'b'] })
    const state = tableCueState(figure)
    expect(state).toMatchObject({ fullWidth: true, fits: false, total: 2, hiddenLeft: false, hiddenRight: false })
  })

  it('returns null for non-table figures, missing wrappers, empty rows and hidden panes', () => {
    expect(tableCueState(null)).toBeNull()
    expect(tableCueState(document.createElement('figure'))).toBeNull()
    const { figure } = buildFigure({ role: 'MERMAID' })
    expect(tableCueState(figure)).toBeNull()
    const noWrapper = buildFigure()
    noWrapper.wrapper.remove()
    expect(tableCueState(noWrapper.figure)).toBeNull()
    const empty = buildFigure({ headerTexts: [] })
    expect(tableCueState(empty.figure)).toBeNull()
    const hidden = buildFigure({ wrapperRect: { left: 0, width: 0 } })
    expect(tableCueState(hidden.figure)).toBeNull()
  })

  it('sync applies the caption text/visibility and the shade side classes', () => {
    const { figure, wrapper, caption } = buildFigure({
      headerTexts: ['a', 'b', 'c', 'd', 'e'],
      wrapperRect: { left: 100, width: 200 },
      cellRects: columnsOf([100, 100, 100, 100, 100], 100)
    })
    const state = syncTableCue(figure, t)
    expect(state.start).toBe(1)
    expect(state.end).toBe(2)
    expect(caption.classList.contains(TABLE_CAPTION_ON_CLASS)).toBe(true)
    expect(caption.textContent).toBe('columns 1–2 of 5')
    expect(wrapper.classList.contains(TABLE_CUE_RIGHT_CLASS)).toBe(true)
    expect(wrapper.classList.contains(TABLE_CUE_LEFT_CLASS)).toBe(false)
  })

  it('a fitting table clears the caption and both shades', () => {
    const { figure, wrapper, caption } = buildFigure({
      headerTexts: ['a', 'b'],
      wrapperRect: { left: 100, width: 400 }
    })
    // Pre-dirty the classes to prove the sync clears them.
    wrapper.classList.add(TABLE_CUE_LEFT_CLASS, TABLE_CUE_RIGHT_CLASS)
    caption.classList.add(TABLE_CAPTION_ON_CLASS)
    caption.textContent = 'stale'
    const state = syncTableCue(figure, t)
    expect(state.fits).toBe(true)
    expect(caption.classList.contains(TABLE_CAPTION_ON_CLASS)).toBe(false)
    expect(caption.textContent).toBe('')
    expect(wrapper.classList.contains(TABLE_CUE_LEFT_CLASS)).toBe(false)
    expect(wrapper.classList.contains(TABLE_CUE_RIGHT_CLASS)).toBe(false)
  })

  it('full width syncs «all N columns» and no shade classes', () => {
    const { figure, wrapper, caption } = buildFigure({ fullWidth: true, headerTexts: ['a', 'b', 'c'] })
    syncTableCue(figure, t)
    expect(caption.textContent).toBe('all 3 columns')
    expect(caption.classList.contains(TABLE_CAPTION_ON_CLASS)).toBe(true)
    expect(wrapper.classList.contains(TABLE_CUE_LEFT_CLASS)).toBe(false)
    expect(wrapper.classList.contains(TABLE_CUE_RIGHT_CLASS)).toBe(false)
  })

  it('a Full width table fitting its measured viewport clears the reserved caption', () => {
    const { figure, table, caption } = buildFigure({ fullWidth: true })
    table.getBoundingClientRect = () => ({ width: 500 })
    caption.textContent = 'stale'
    caption.classList.add(TABLE_CAPTION_ON_CLASS)
    expect(syncTableCue(figure, t).fits).toBe(true)
    expect(caption.textContent).toBe('')
    expect(caption.classList.contains(TABLE_CAPTION_ON_CLASS)).toBe(false)
    expect(caption.parentElement.className).toContain('ag-table-scroll')
  })

  it('tracks consumed and overlaid native scrollbar space without changing table content', () => {
    const { figure, wrapper, table } = buildFigure()
    const before = table.innerHTML
    Object.defineProperty(wrapper, 'offsetHeight', { value: 100, configurable: true })
    Object.defineProperty(wrapper, 'clientHeight', { value: 94, configurable: true })
    syncTableCue(figure, t)
    expect(wrapper.style.getPropertyValue('--ag-table-scrollbar-height')).toBe('6px')
    Object.defineProperty(wrapper, 'clientHeight', { value: 100, configurable: true })
    syncTableCue(figure, t)
    expect(wrapper.style.getPropertyValue('--ag-table-scrollbar-height')).toBe('0px')
    expect(table.innerHTML).toBe(before)
  })

  it('a not-laid-out figure is a no-op (no throw, no state)', () => {
    const { figure } = buildFigure({ wrapperRect: { left: 0, width: 0 } })
    expect(syncTableCue(figure, t)).toBeNull()
  })

  it('sync without a t uses the pinned translator (the resize funnel path)', () => {
    setTableCueTranslator(t)
    const { figure, caption } = buildFigure({
      headerTexts: ['a', 'b', 'c'],
      wrapperRect: { left: 100, width: 150 }
    })
    syncTableCue(figure)
    expect(caption.textContent).toBe('columns 1–2 of 3')
    // A non-function pin is ignored.
    setTableCueTranslator(undefined)
    const second = buildFigure({ headerTexts: ['a', 'b', 'c'], wrapperRect: { left: 100, width: 150 } })
    syncTableCue(second.figure)
    expect(second.caption.textContent).toBe('columns 1–2 of 3')
  })

  it('a laid-out wrapper whose columns all measure zero yields no state', () => {
    const { figure } = buildFigure({
      headerTexts: ['a', 'b'],
      wrapperRect: { left: 100, width: 200 },
      cellRects: [{ left: 100, width: 0 }, { left: 100, width: 0 }]
    })
    expect(tableCueState(figure)).toBeNull()
  })

  it('sync tolerates a figure whose caption element is missing', () => {
    const { figure, wrapper } = buildFigure({
      headerTexts: ['a', 'b', 'c', 'd', 'e'],
      wrapperRect: { left: 100, width: 200 },
      cellRects: columnsOf([100, 100, 100, 100, 100], 100)
    })
    figure.querySelector(`div.${TABLE_CAPTION_CLASS}`).remove()
    const state = syncTableCue(figure, t)
    expect(state.end).toBe(2)
    expect(wrapper.classList.contains(TABLE_CUE_RIGHT_CLASS)).toBe(true)
  })
})
// END_BLOCK_CUE_STATE_ASSERTIONS

// START_BLOCK_TABLE_TOOLBAR_VNODE_ASSERTIONS
describe('table toolbar vnode (C-65 T-002, C-56 family)', () => {
  const TRANSLATIONS = {
    'tableToolbar.fullWidth': 'Full width',
    'tableToolbar.fitToPage': 'Fit to page',
    'blockToolbar.openFullScreen': 'Open full screen'
  }
  const tt = (key) => TRANSLATIONS[key] || key

  const buttonsOf = (vnode) => (vnode.children || []).filter((c) => (c.sel || '').includes('ag-table-toolbar-btn'))

  it('renders the pill with the toggle and the need-gated expand action', () => {
    const vnode = renderTableToolbar(tt, { fullWidth: false })
    expect(vnode.sel).toBe(TABLE_TOOLBAR_SELECTOR)
    expect(vnode.data.attrs.contenteditable).toBe('false')
    const buttons = buttonsOf(vnode)
    // C-70: toggle, Copy as image, Open full screen.
    expect(buttons.length).toBe(3)
    const [toggle, copy, expand] = buttons
    expect(copy.sel).toBe('button.ag-block-expand.ag-block-toolbar-btn.ag-table-toolbar-btn.ag-block-toolbar-copy.ag-table-toolbar-copy')
    // Family classes: the keyboard.js key guard hooks ag-block-expand; the
    // shared pill button styling hooks ag-block-toolbar-btn.
    expect(toggle.sel).toBe('button.ag-block-expand.ag-block-toolbar-btn.ag-table-toolbar-btn.ag-table-toolbar-toggle')
    expect(expand.sel).toBe('button.ag-block-expand.ag-block-toolbar-btn.ag-table-toolbar-btn.ag-block-toolbar-expand.ag-table-toolbar-expand')
    // Labels + a11y.
    expect(toggle.data.attrs.title).toBe('Full width')
    expect(toggle.data.attrs['aria-label']).toBe('Full width')
    expect(expand.data.attrs.title).toBe('Open full screen')
    expect(toggle.data.attrs.tabindex).toBe('0')
    expect(expand.data.attrs.contenteditable).toBe('false')
    // Hidden hover-reveal label spans carry the same text.
    const toggleSpan = (toggle.children || []).find((c) => c.sel === 'span.ag-block-toolbar-label')
    expect(toggleSpan.text).toBe('Full width')
    // Icons: the drawn 16-grid glyphs.
    const togglePath = ((toggle.children || []).find((c) => c.sel === 'svg').children || [])[0]
    expect(togglePath.data.attrs.d).toBe(TOOLBAR_TABLE_FULLWIDTH_ICON_PATH)
    const expandPath = ((expand.children || []).find((c) => c.sel === 'svg').children || [])[0]
    expect(expandPath.data.attrs.d).toBeDefined()
    // The capture-phase routing distinguishes the actions by dataset.
    expect(toggle.data.dataset.tableToolbarAction).toBe('toggleFullWidth')
    expect(expand.data.dataset.tableToolbarAction).toBe('expand')
    // clickEvent.js's pill branch keys on blockToolbarAction — the table
    // buttons must never match it.
    expect(toggle.data.dataset.blockToolbarAction).toBeUndefined()
    expect(expand.data.dataset.blockToolbarAction).toBeUndefined()
  })

  it('the active state swaps the icon, the label and adds the active class', () => {
    const vnode = renderTableToolbar(tt, { fullWidth: true })
    const toggle = buttonsOf(vnode)[0]
    expect(toggle.sel).toContain('ag-table-toolbar-active')
    expect(toggle.data.attrs.title).toBe('Fit to page')
    const span = (toggle.children || []).find((c) => c.sel === 'span.ag-block-toolbar-label')
    expect(span.text).toBe('Fit to page')
    const path = ((toggle.children || []).find((c) => c.sel === 'svg').children || [])[0]
    expect(path.data.attrs.d).toBe(TOOLBAR_TABLE_FIT_ICON_PATH)
  })

  it('defaults to the resting (Fit OFF) state and keeps the glyphs distinct', () => {
    expect(renderTableToolbar(tt).children.length).toBe(3)
    expect(renderTableToolbar(tt, {}).children[0].data.attrs.title).toBe('Full width')
    expect(TOOLBAR_TABLE_FIT_ICON_PATH).not.toBe(TOOLBAR_TABLE_FULLWIDTH_ICON_PATH)
    expect(TABLE_TOOLBAR_BUTTON_SELECTOR).toBe('button.ag-table-toolbar-btn')
  })
})
// END_BLOCK_TABLE_TOOLBAR_VNODE_ASSERTIONS

// START_BLOCK_TABLE_CUE_CSS_ASSERTIONS
describe('table cue + toolbar CSS (C-65, mockup variant E)', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/muya/lib/assets/styles/index.css'),
    'utf8'
  )

  it('pins the toolbar ABOVE the table with its right edge on the text-column edge', () => {
    const rule = css.split("figure[data-role='TABLE'].ag-has-expand > div.ag-block-toolbar.ag-table-toolbar {")[1].split('}')[0]
    expect(rule).toContain('top: -36px')
    expect(rule).toContain('right: 0')
  })

  it('keeps an invisible caption line inside the wrapper and reveals it without reflow', () => {
    const base = css.split("figure[data-role='TABLE'] > div.ag-table-scroll > div.ag-table-caption {")[1].split('}')[0]
    expect(base).toContain('display: block')
    expect(base).toContain('visibility: hidden')
    expect(base).toContain('height: 20px')
    expect(base).toContain('position: sticky')
    expect(base).toContain('text-align: right')
    const on = css.split("figure[data-role='TABLE'] > div.ag-table-scroll > div.ag-table-caption.ag-table-caption-on {")[1].split('}')[0]
    expect(on).toContain('visibility: visible')
  })

  it('pins the class-gated edge shades (both sides, one rule per side plus the pair)', () => {
    expect(css).toContain('figure div.ag-table-scroll.ag-table-cue-left {')
    expect(css).toContain('figure div.ag-table-scroll.ag-table-cue-right {')
    expect(css).toContain('figure div.ag-table-scroll.ag-table-cue-left.ag-table-cue-right {')
    // The C-39 cover-gradient layers are gone — the classes are the only
    // shade mechanism now.
    expect(css).not.toContain('no-repeat local')
  })

  it('pins the full-width breakout: visible overflow, no own scrollbar, left-aligned table, no shades', () => {
    const wrapper = css.split('figure.ag-table-full-width > div.ag-table-scroll {')[1].split('}')[0]
    expect(wrapper).toContain('overflow: visible')
    expect(wrapper).toContain('max-width: none')
    expect(wrapper).toContain('padding-left: 0')
    const table = css.split('figure.ag-table-full-width > div.ag-table-scroll > table {')[1].split('}')[0]
    expect(table).toContain('margin-inline: auto')
    expect(css).toContain('figure.ag-table-full-width > div.ag-table-scroll.ag-table-cue-left,')
  })
})
// END_BLOCK_TABLE_CUE_CSS_ASSERTIONS
