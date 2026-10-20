// FILE: src/muya/lib/tableResize/tableCue.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: C-65 T-003 overflow cue for wide tables — the pure «columns X–Y of N» range math (which columns are mostly visible in the C-39 scroll wrapper) plus the DOM sync pass that drives the caption below the table and the edge-shade side classes, live on scroll, resize and drag.
//   SCOPE: Visible-column range and caption formatting, live full-width fit detection, width-toggle gating against the text column, native scrollbar-space measurement and caption/shade DOM sync. The reserved caption lives inside the scroll wrapper; fitting tables clear its text without removing space. Scroll/resize/render listeners remain in tableResize and expandNeed.
//   DEPENDS: pure DOM measurements (wrapper/clientWidth/getBoundingClientRect; jsdom's zero rects degrade to a null state — no cue), a translator function (muya options.t or the module-level setTableCueTranslator pin).
//   LINKS: .grace/changes/archive/C-65 T-003; .grace/graph/runtime.xml M-012 fn-tableResize; .grace/verification/runtime.xml V-M-012 scenario-66; renderContainerBlock START_BLOCK_TABLE_TOOLBAR_AND_CAPTION; expandNeed.js updateFigureExpandNeed (the funnel call site); the C-65 CSS section of lib/assets/styles/index.css.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   VISIBLE_COLUMN_FRACTION - fraction of a column's width that must be inside the scrollport for the column to count as (mostly) visible.
//   CLIP_TOLERANCE_PX - sub-pixel tolerance for the table-edge clipping check that decides the shade sides.
//   TABLE_CAPTION_CLASS - reserved caption inside the scroll wrapper, below the table and above its scrollbar ("ag-table-caption").
//   TABLE_CAPTION_ON_CLASS - class marking a caption that currently shows text ("ag-table-caption-on").
//   TABLE_CUE_LEFT_CLASS / TABLE_CUE_RIGHT_CLASS - wrapper classes gating the edge shades ("ag-table-cue-left"/"ag-table-cue-right").
//   TABLE_FULL_WIDTH_CLASS - figure class marking the per-table Full width mode ("ag-table-full-width", applied by TableResize).
//   visibleColumnRange - pure: {spanLeft, spanWidth, columns:[{left,width}]} → {fits, start, end, total, hiddenLeft, hiddenRight} (1-based inclusive range) or null when nothing is measurable.
//   formatColumnsCaption - pure: translator + cue state → the caption text (null when the table fits or the state is unusable; «all N columns» in full-width mode).
//   setTableCueTranslator - pin the module-level translator used when syncTableCue gets no t (the expandNeed resize funnel has no muya at hand).
//   tableCueState - DOM gathering + rules for one figure, including a full-width table fitting its viewport.
//   syncTableCue - apply width-toggle eligibility, caption visibility, shades and measured native scrollbar space; return the state without document writes.
//   TABLE_CUE_RIGHT_CLASS - exported helper (TABLE_CUE_RIGHT_CLASS).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-20 C-TABLE-FOOTER owner review: hide the width toggle when the table fits its text column, including restored Full width layouts.
//   PREV: v1.1.0 - 2026-10-20 C-TABLE-FOOTER: retain invisible footer space when fitting, including Full width, and compensate actual native scrollbar height for a stable 2px gap.
//   v1.0.0 - 2026-10-18 C-65 T-003: new module. Approved
//   mockup variant E: no arrows, no chips — an edge shade on each side that
//   hides columns and a caption BELOW the table, right-aligned on the
//   text-column edge, both driven from one state object. The C-39 CSS-only
//   cover-gradient shadows are replaced by these class-gated shades so the
//   sides are the same fact the caption's range states (and unit tests pin
//   them). A table that fits shows neither; the full-width mode shows
//   «all N columns» and no shade.
// END_CHANGE_SUMMARY

export const VISIBLE_COLUMN_FRACTION = 0.5
export const CLIP_TOLERANCE_PX = 1
export const TABLE_CAPTION_CLASS = 'ag-table-caption'
export const TABLE_CAPTION_ON_CLASS = 'ag-table-caption-on'
export const TABLE_CUE_LEFT_CLASS = 'ag-table-cue-left'
export const TABLE_CUE_RIGHT_CLASS = 'ag-table-cue-right'
export const TABLE_FULL_WIDTH_CLASS = 'ag-table-full-width'

// The expandNeed resize funnel calls syncTableCue without a muya instance;
// TableResize pins the live translator here on construction and after every
// render (language switches arrive through muya options).
let cueTranslator = (key) => key

export const setTableCueTranslator = (t) => {
  if (typeof t === 'function') cueTranslator = t
}

// START_BLOCK_VISIBLE_COLUMN_RANGE
// Pure range math. A column is "mostly visible" when at least
// VISIBLE_COLUMN_FRACTION of its width lies inside the scrollport; the
// reported range spans the first..last mostly-visible column. When no
// column reaches the majority (a single column wider than the port), any
// overlap decides, so the caption still names the column under the port.
// The shade sides come from actual table-edge clipping, not from the
// majority rule: a barely-cut single column still reads as clipped.
export const visibleColumnRange = ({ spanLeft = 0, spanWidth = 0, columns = [] } = {}) => {
  if (!Array.isArray(columns) || columns.length === 0) return null
  if (!(spanWidth > 0)) return null
  const spanRight = spanLeft + spanWidth
  const mostlyVisible = []
  const overlapping = []
  columns.forEach((column, index) => {
    const left = column && Number.isFinite(column.left) ? column.left : 0
    const width = column && Number.isFinite(column.width) ? column.width : 0
    if (width <= 0) return
    const overlap = Math.min(left + width, spanRight) - Math.max(left, spanLeft)
    if (overlap > 0.5) overlapping.push(index)
    if (overlap >= width * VISIBLE_COLUMN_FRACTION) mostlyVisible.push(index)
  })
  const picked = mostlyVisible.length > 0 ? mostlyVisible : overlapping
  if (picked.length === 0) return null
  const first = picked[0]
  const last = picked[picked.length - 1]
  const total = columns.length
  const tableLeft = columns[0] && Number.isFinite(columns[0].left) ? columns[0].left : 0
  const lastColumn = columns[total - 1]
  const tableRight = lastColumn && Number.isFinite(lastColumn.left) && Number.isFinite(lastColumn.width)
    ? lastColumn.left + lastColumn.width
    : tableLeft
  const hiddenLeft = tableLeft < spanLeft - CLIP_TOLERANCE_PX
  const hiddenRight = tableRight > spanRight + CLIP_TOLERANCE_PX
  return {
    fits: !hiddenLeft && !hiddenRight,
    start: first + 1,
    end: last + 1,
    total,
    hiddenLeft,
    hiddenRight
  }
}
// END_BLOCK_VISIBLE_COLUMN_RANGE

// START_BLOCK_CAPTION_FORMAT
// vue-i18n interpolates {start}/{end}/{total} when the translator accepts a
// params object; the token pass after it covers identity-style translators
// (unit stubs, a missing t) so the caption never shows a stale placeholder.
const interpolate = (t, key, params) => {
  let text
  try {
    text = typeof t === 'function' ? t(key, params) : key
  } catch (_) {
    text = key
  }
  if (typeof text !== 'string') return null
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  )
}

export const formatColumnsCaption = (t, state) => {
  if (!state) return null
  if (state.fits) return null
  if (state.fullWidth) {
    return interpolate(t, 'tableToolbar.allColumns', { total: state.total })
  }
  return interpolate(t, 'tableToolbar.columnsRange', {
    start: state.start,
    end: state.end,
    total: state.total
  })
}
// END_BLOCK_CAPTION_FORMAT

// START_BLOCK_TABLE_CUE_STATE
// DOM gathering for one table figure. Full width short-circuits («all N
// columns», no shades — the editor scrolls, nothing is hidden by the
// wrapper). A hidden pane / jsdom measures a zero-width port → null (no
// verdict; the render/resize funnel re-runs the moment it lays out).
export const tableCueState = (figure) => {
  if (!figure || figure.nodeType !== 1 || !figure.querySelector) return null
  if (!figure.dataset || figure.dataset.role !== 'TABLE') return null
  const wrapper = figure.querySelector('div.ag-table-scroll')
  if (!wrapper) return null
  const table = wrapper.querySelector('table')
  const row = table && table.tHead && table.tHead.rows[0]
  if (!row || row.cells.length === 0) return null
  const total = row.cells.length
  if (figure.classList.contains(TABLE_FULL_WIDTH_CLASS)) {
    const width = table.getBoundingClientRect().width
    return {
      fullWidth: true,
      fits: width > 0 && wrapper.clientWidth > 0 && width <= wrapper.clientWidth + CLIP_TOLERANCE_PX,
      total,
      start: 1,
      end: total,
      hiddenLeft: false,
      hiddenRight: false
    }
  }
  const wrapperRect = wrapper.getBoundingClientRect()
  if (!wrapperRect || !(wrapperRect.width > 0)) return null
  const spanLeft = wrapperRect.left + (wrapper.clientLeft || 0)
  const spanWidth = wrapper.clientWidth
  if (!(spanWidth > 0)) return null
  const columns = []
  for (const cell of row.cells) {
    const rect = cell.getBoundingClientRect()
    columns.push({ left: rect.left, width: rect.width })
  }
  const range = visibleColumnRange({ spanLeft, spanWidth, columns })
  if (!range) return null
  return Object.assign({ fullWidth: false, total }, range)
}
// END_BLOCK_TABLE_CUE_STATE

// START_BLOCK_TABLE_CUE_SYNC
// Apply one figure's cue: caption text + visibility, shade side classes.
// Safe on any element (no table figure / not laid out → null, nothing
// touched). Returns the state for callers that chain (drag/toggle paths).
export const syncTableCue = (figure, t) => {
  const state = tableCueState(figure)
  if (!state) return null
  // Compare with the text column in either mode: a wide table still needs
  // its Fit to page action when it fits the expanded editor viewport.
  const table = figure.querySelector('div.ag-table-scroll > table')
  figure.classList.toggle('ag-table-width-toggle-needed',
    figure.clientWidth > 0 && table.getBoundingClientRect().width > figure.clientWidth + CLIP_TOLERANCE_PX)
  const text = formatColumnsCaption(t || cueTranslator, state)
  const wrapper = figure.querySelector('div.ag-table-scroll')
  if (wrapper) {
    // The native bar may consume 6px or overlay the scrollport. CSS keeps
    // one reserved bar zone and a 2px caption gap in either case.
    const height = `${Math.max(0, wrapper.offsetHeight - wrapper.clientHeight)}px`
    if (wrapper.style.getPropertyValue('--ag-table-scrollbar-height') !== height) {
      wrapper.style.setProperty('--ag-table-scrollbar-height', height)
    }
    wrapper.classList.toggle(TABLE_CUE_LEFT_CLASS, !!state.hiddenLeft)
    wrapper.classList.toggle(TABLE_CUE_RIGHT_CLASS, !!state.hiddenRight)
  }
  const caption = figure.querySelector(`div.${TABLE_CAPTION_CLASS}`)
  if (caption) {
    if (text) {
      caption.textContent = text
      caption.classList.add(TABLE_CAPTION_ON_CLASS)
    } else {
      caption.textContent = ''
      caption.classList.remove(TABLE_CAPTION_ON_CLASS)
    }
  }
  return state
}
// END_BLOCK_TABLE_CUE_SYNC
