// FILE: src/muya/lib/tableResize/tableFit.js
// VERSION: 1.2.1
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-007 (M-061) the honest table fit algorithm shared by the Fit page and Full width modes — per-column minContent/maxContent measurement over the header plus the first 50 rows, the slack-proportional distribution capped at maxContent with the even leftover split, the overflow-wrap-anywhere re-measure fallback under space pressure, and proportional squeeze when wrapped minima cannot fit. Pure maths are separated from the DOM measurement so every distribution rule is unit-pinnable without a layout engine.
//   SCOPE: FIT_MEASURE_ROW_LIMIT / FIT_MIN_COLUMN_WIDTH constants; measureColumnExtents (the three-phase DOM measurement — max-content, min-content, wrap-anywhere min — run on an offscreen clone inside the table's own scroll wrapper so the theme CSS chain still styles it; zero geometry degrades to null exactly like the rest of muya's measuring); planTableFit (the R-9 decision: distribute, or wrap first, or squeeze proportionally — the scroll degradation is retired, owner 2026-11-07); distributeIntoFrame (slack-proportional water-filling capped at maxContent, the leftover after all caps split evenly — the CSS auto-layout / Word AutoFit Window behaviour); snapWidthsToInt (largest-remainder rounding so a plan's widths sum to its frame); applyRatiosToWidth and ratiosFromWidths (the T-008 ratio re-application maths mirrored by the renderer util tableLayoutRatios.js — muya stays self-contained, no renderer imports).
//   DEPENDS: live DOM measurement (getBoundingClientRect; jsdom/hidden panes measure zero widths → null, callers skip), no muya state.
//   LINKS: .grace/changes/archive/C-STABILIZE-PRODUCT-REPAIRS; .grace/changes/archive/C-PAGE-WIDTH-TABLES (plan T-007/T-008, spec R-8/R-9/R-10, corners C-7/C-8/C-9); .grace/graph/performance.xml M-061; lib/tableResize/index.js (the mode model consuming this module); renderer util tableLayoutRatios.js (the store-side twin of the ratio maths); printService.css / exportHtml.js (the print-path overflow-wrap precedent, read-only reference).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FIT_MEASURE_ROW_LIMIT - body rows measured per column (header plus the first 50 rows — R-9).
//   FIT_MIN_COLUMN_WIDTH - sanity floor for the distributed/degraded minima (px; the same 48px the drag clamp uses).
//   MEASURE_TABLE_CLASS - class of the offscreen measurer clone (also the hook the unit tests stub geometry on).
//   measureColumnExtents - DOM: { minContent, maxContent, wrappedMin } per column over header + first rows; null when nothing is measurable.
//   planTableFit - pure: extents + frame → { kind: 'distribute' | 'wrap', widths } — distribute, wrap, then proportional squeeze; never a scrollbar (owner 2026-11-07).
//   distributeIntoFrame - pure: minima + maxima + frame → widths (slack-proportional, capped, even leftover).
//   snapWidthsToInt - pure: float widths + frame → integer widths summing to floor(frame) (largest remainder).
//   applyRatiosToWidth - pure: ratios + frame + minima → integer widths re-applying the stored proportions (floored at minima).
//   ratiosFromWidths - pure: widths → fractions of the table width (null when the sum collapses).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-10 C-STABILIZE-TABLE-E2E: all intrinsic measurement
//   phases explicitly use automatic layout even when the source is fitted.
//   Cloned fixed-layout classes cannot turn content measurements into frame widths.
//   LAST_CHANGE: 2026-11-09 C-STABILIZE-PRODUCT-REPAIRS: accepted owner smoke repairs integrated; lifecycle, sizing and accessible controls verified by focused gates.
//   PREV: v1.2.0 - 2026-11-09 owner audit: the squeeze reserves
//   4px per column for the collapsed borders WebKit paints over the
//   colgroup (Chromium folds them in) — without the reserve the REAL
//   table ran past the frame in WebKit and reopened the retired scroll.
//   PREV: v1.1.0 - 2026-11-07 owner mandate: the scrollable
//   degradation is RETIRED — when even the wrap-anywhere minima cannot
//   fit, the columns squeeze PROPORTIONALLY into the frame (mid-token
//   breaks instead of hidden-behind-a-scrollbar data).
//   PREV: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: new
//   module. The legacy fake-fit default (a pinned frame with scrolling
//   content) is retired; Fit page and Full width both distribute real
//   columns into their frame with this algorithm, wrapping anywhere under
//   pressure and only then degrading to minimal sizes + horizontal scroll
//   + the honest badge (spec R-8/R-9; data is never hidden or truncated).
// END_CHANGE_SUMMARY

export const FIT_MEASURE_ROW_LIMIT = 50
export const FIT_MIN_COLUMN_WIDTH = 48
export const MEASURE_TABLE_CLASS = 'ag-table-fit-measure'

// Sub-pixel tolerance used by the water-filling loop and the fit checks.
const EPSILON = 0.5

// START_BLOCK_MEASURE_COLUMN_EXTENTS
// The three-phase measurement of one table. The measurer is a clone of the
// header + the first rowLimit body rows, appended INSIDE the table's own
// scroll wrapper so every theme rule that styles the real table (fonts,
// paddings, the 40ch caps it overrides locally) still applies to the
// clone. Each phase reads one layout fact per column:
//   maxContent  — the column's max-content width (longest cell line);
//   minContent  — the column's width under normal wrapping (longest
//                 unbreakable token);
//   wrappedMin  — the column's width when overflow-wrap: anywhere lets
//                 tokens break at any character (the print-path precedent).
// jsdom and hidden panes measure zero-width cells → null (no verdict; the
// callers skip and the next laid-out pass re-measures).
export const measureColumnExtents = (table, { rowLimit = FIT_MEASURE_ROW_LIMIT } = {}) => {
  if (!table || !table.tHead || !table.tHead.rows[0]) return null
  const headRow = table.tHead.rows[0]
  const columnCount = headRow.cells.length
  if (columnCount === 0) return null
  const host = table.closest('div.ag-table-scroll') || table.parentElement
  if (!host || !host.appendChild || typeof document === 'undefined') return null

  const cloneRow = (sourceRow) => {
    const row = document.createElement('tr')
    for (const cell of sourceRow.cells) {
      const clone = cell.cloneNode(true)
      // The C-39 resizer hit zones and drag bars are affordance chrome —
      // they must not contribute to any measured width.
      clone.querySelectorAll(`.ag-column-resizer, .ag-drag-handler`).forEach(node => node.remove())
      row.appendChild(clone)
    }
    return row
  }

  const measurer = document.createElement('table')
  measurer.className = `${table.className || ''} ${MEASURE_TABLE_CLASS}`
  const thead = measurer.createTHead()
  thead.appendChild(cloneRow(headRow))
  const tbody = measurer.createTBody()
  const body = table.tBodies && table.tBodies[0]
  if (body) {
    for (let i = 0; i < Math.min(body.rows.length, rowLimit); i++) {
      tbody.appendChild(cloneRow(body.rows[i]))
    }
  }
  // Offscreen but laid out: absolute + hidden keeps it out of the flow and
  // out of sight while getBoundingClientRect still returns real geometry.
  const style = measurer.style
  style.position = 'absolute'
  style.left = '-99999px'
  style.top = '0'
  style.visibility = 'hidden'
  style.maxWidth = 'none'
  // A fitted source carries ag-column-widths-fixed. Its inherited fixed
  // layout measures the frame again, not intrinsic content. All three
  // phases need the browser's automatic table sizing, without live cols.
  style.tableLayout = 'auto'
  host.appendChild(measurer)
  try {
    const measurePhase = (tableWidth, cellOverrides) => {
      style.width = tableWidth
      // Every cell is overridden per phase: the shipped theme CSS caps
      // cells at 40ch and lets body cells wrap anywhere — the phases
      // measure the R-9 facts (longest line / longest token / widest
      // character cluster) and must not inherit those caps.
      for (const row of measurer.rows) {
        for (const cell of row.cells) {
          cell.style.maxWidth = 'none'
          cell.style.overflowWrap = cellOverrides.overflowWrap
          if (cellOverrides.whiteSpace) cell.style.whiteSpace = cellOverrides.whiteSpace
        }
      }
      // Read every cell in one pass after the phase's forced reflow.
      const widths = new Array(columnCount).fill(0)
      for (const row of measurer.rows) {
        const cells = row.cells
        for (let i = 0; i < columnCount; i++) {
          const cell = cells[i]
          if (!cell) return null
          const width = cell.getBoundingClientRect().width
          if (!Number.isFinite(width) || width <= 0) return null
          if (width > widths[i]) widths[i] = width
        }
      }
      return widths
    }
    // Phase 1 — max-content (normal wrapping disabled so soft-wrap points
    // do not shrink the line).
    const maxContent = measurePhase('max-content', { overflowWrap: 'normal', whiteSpace: 'nowrap' })
    if (!maxContent) return null
    // Phase 2 — min-content: the longest unbreakable token per column.
    const minContent = measurePhase('min-content', { overflowWrap: 'normal', whiteSpace: 'normal' })
    if (!minContent) return null
    // Phase 3 — the wrap-anywhere fallback: tokens break at any character.
    const wrappedMin = measurePhase('min-content', { overflowWrap: 'anywhere', whiteSpace: 'normal' })
    if (!wrappedMin) return null
    return {
      maxContent: maxContent.map(w => Math.ceil(w)),
      minContent: minContent.map(w => Math.ceil(w)),
      wrappedMin: wrappedMin.map(w => Math.ceil(w))
    }
  } finally {
    measurer.remove()
  }
}
// END_BLOCK_MEASURE_COLUMN_EXTENTS

// START_BLOCK_DISTRIBUTE_INTO_FRAME
// The R-9 distribution: start every column at its minimum, then give the
// free space to the columns proportionally to their remaining slack
// (maxContent − current width), capping each at its maxContent. Space
// released by capped columns keeps flowing to the rest (water-filling).
// The leftover after ALL columns are capped — a frame wider than the
// table's max-content — is split EVENLY, so the table still fills its
// frame exactly like Word's AutoFit Window.
export const distributeIntoFrame = (minima, maxima, frameWidth) => {
  const n = Math.min(minima.length, maxima.length)
  if (n === 0 || !Number.isFinite(frameWidth) || frameWidth <= 0) return null
  const widths = []
  for (let i = 0; i < n; i++) {
    const min = Number.isFinite(minima[i]) ? minima[i] : 0
    const max = Number.isFinite(maxima[i]) && maxima[i] >= min ? maxima[i] : min
    widths.push(Math.min(min, max))
  }
  let free = frameWidth - widths.reduce((total, w) => total + w, 0)
  if (free <= 0) return widths
  // Water-filling: each round distributes the remaining free space
  // proportionally to the open slack; a column that would overshoot its
  // max is capped exactly at max and drops out of the next round.
  for (let guard = n + 1; free > EPSILON && guard > 0; guard--) {
    const active = []
    let slack = 0
    for (let i = 0; i < n; i++) {
      const room = maxima[i] - widths[i]
      if (room > EPSILON) {
        active.push(i)
        slack += room
      }
    }
    if (active.length === 0 || slack <= 0) break
    const distributed = widths.slice()
    for (const i of active) {
      const share = free * (maxima[i] - widths[i]) / slack
      const room = maxima[i] - widths[i]
      distributed[i] = share >= room - EPSILON ? maxima[i] : widths[i] + share
    }
    for (let i = 0; i < n; i++) widths[i] = distributed[i]
    free = frameWidth - widths.reduce((total, w) => total + w, 0)
  }
  // The even leftover: every column (capped or not) takes an equal share,
  // letting the table fill a frame wider than its max-content.
  if (free > EPSILON) {
    const even = free / n
    for (let i = 0; i < n; i++) widths[i] += even
  }
  return widths
}
// END_BLOCK_DISTRIBUTE_INTO_FRAME

// START_BLOCK_SNAP_WIDTHS
// Integer widths whose sum is exactly floor(frameWidth) — the largest
// remainder carries the rounding residue so a fitted table never leaves
// its frame by a stray pixel (the fixed-layout colgroup sums to the
// table's inline width). FLOOR, not round: the frame is clientWidth minus
// a possibly fractional padding, and rounding a 756.5px frame up to 757
// paints a 1px overflow + the phantom mini-scrollbar (owner smoke
// 2026-11-05); the dropped sub-pixel never scrolls.
export const snapWidthsToInt = (widths, frameWidth) => {
  const rounded = widths.map(w => Math.max(0, Math.round(w)))
  let residual = Math.floor(frameWidth) - rounded.reduce((total, w) => total + w, 0)
  while (residual !== 0) {
    // Move one pixel at a time on the widest (residual < 0) or narrowest
    // (residual > 0) column that keeps its floor.
    let pick = -1
    for (let i = 0; i < rounded.length; i++) {
      if (residual < 0) {
        if (rounded[i] > 1 && (pick === -1 || rounded[i] > rounded[pick])) pick = i
      } else if (pick === -1 || rounded[i] < rounded[pick]) pick = i
    }
    if (pick === -1) break
    rounded[pick] += residual > 0 ? 1 : -1
    residual += residual > 0 ? -1 : 1
  }
  return rounded
}
// END_BLOCK_SNAP_WIDTHS

// START_BLOCK_PLAN_TABLE_FIT
// The R-9 decision for one frame:
//   1. If the minima fit the frame, distribute (slack-proportional,
//      capped at maxContent, even leftover).
//   2. Otherwise enable wrap-anywhere (the caller lets the cells
//      overflow-wrap: anywhere via the degrade class — the widths here
//      already assume it) and re-plan with the wrapped minima; if they
//      fit, distribute on top of them (kind 'wrap').
//   3. Otherwise squeeze proportionally into the frame; the owner retired
//      internal scrolling and the overflow badge.
// Minima carry the FIT_MIN_COLUMN_WIDTH sanity floor; the wrapped minima
// do not (a wrap-anywhere column may legitimately be narrower).
export const planTableFit = (extents, frameWidth, { minColumnWidth = FIT_MIN_COLUMN_WIDTH } = {}) => {
  if (!extents || !Number.isFinite(frameWidth) || frameWidth <= 0) return null
  const floorMin = (values) => values.map(w => Math.max(Number.isFinite(w) ? w : 0, minColumnWidth))
  const minima = floorMin(extents.minContent)
  const maxima = extents.maxContent.map(w => Math.max(Number.isFinite(w) ? w : 0, 0))
  const sum = (values) => values.reduce((total, w) => total + w, 0)
  if (sum(minima) <= frameWidth) {
    const widths = distributeIntoFrame(minima, maxima, frameWidth)
    if (!widths) return null
    return { kind: 'distribute', widths: snapWidthsToInt(widths, frameWidth) }
  }
  const wrappedMinima = Array.isArray(extents.wrappedMin)
    ? extents.wrappedMin.map(w => Math.max(Number.isFinite(w) ? w : 0, 1))
    : null
  if (wrappedMinima && sum(wrappedMinima) <= frameWidth) {
    const widths = distributeIntoFrame(wrappedMinima, maxima, frameWidth)
    if (!widths) return null
    return { kind: 'wrap', widths: snapWidthsToInt(widths, frameWidth) }
  }
  // Owner 2026-11-07: the horizontal-scroll degradation is RETIRED — a
  // table must never scroll its columns out of the page. When even the
  // wrap-anywhere minima cannot fit, they are squeezed PROPORTIONALLY
  // into the frame: every column keeps its share of the width and breaks
  // mid-token instead of hiding data behind a scrollbar.
  const squeezeBase = wrappedMinima && sum(wrappedMinima) > 0 ? wrappedMinima : minima
  // Reserve 4px per column for the collapsed borders WebKit paints over
  // the colgroup widths (~3px/column measured; Chromium folds them in);
  // without the reserve the real table ran past the frame in WebKit.
  const usable = Math.max(1, frameWidth - squeezeBase.length * 4)
  const factor = usable / sum(squeezeBase)
  const squeezed = squeezeBase.map(w => Math.max(1, Math.round(w * factor)))
  return { kind: 'wrap', widths: snapWidthsToInt(squeezed, usable) }
}
// END_BLOCK_PLAN_TABLE_FIT

// START_BLOCK_RATIO_MATHS
// T-008: re-apply the stored proportions to a new frame. Each column takes
// its ratio share of the frame, floored at its minimum (measured when the
// extents are at hand, the module floor otherwise); the space the floors
// consume comes back off the columns that still have room, so the widths
// sum to the frame again. Pure — the renderer's tableLayoutRatios.js
// mirrors these rules store-side.
export const applyRatiosToWidth = (ratios, frameWidth, minima = [], { minColumnWidth = FIT_MIN_COLUMN_WIDTH } = {}) => {
  if (!Array.isArray(ratios) || ratios.length === 0 ||
    !Number.isFinite(frameWidth) || frameWidth <= 0) return null
  if (!Array.isArray(minima)) minima = []
  if (ratios.some(r => !Number.isFinite(r) || r <= 0)) return null
  const n = ratios.length
  const widths = ratios.map(r => r * frameWidth)
  for (let i = 0; i < n; i++) {
    const min = Number.isFinite(minima[i]) ? Math.max(minima[i], 1) : minColumnWidth
    if (widths[i] < min) widths[i] = min
  }
  // Give back what the floors took, proportionally off the columns above
  // their minimum (bounded rounds; a fully-floored table just overflows).
  for (let guard = n + 1; guard > 0; guard--) {
    const used = widths.reduce((total, w) => total + w, 0)
    const excess = used - frameWidth
    if (excess <= EPSILON) break
    const donors = []
    let room = 0
    for (let i = 0; i < n; i++) {
      const min = Number.isFinite(minima[i]) ? Math.max(minima[i], 1) : minColumnWidth
      if (widths[i] - min > EPSILON) {
        donors.push(i)
        room += widths[i] - min
      }
    }
    if (donors.length === 0 || room <= 0) break
    const take = Math.min(excess, room)
    for (const i of donors) {
      const share = take * (widths[i] - minimaFallback(minima, i, minColumnWidth)) / room
      widths[i] -= share
    }
  }
  return snapWidthsToInt(widths, frameWidth)
}

const minimaFallback = (minima, i, fallback) =>
  Number.isFinite(minima[i]) ? Math.max(minima[i], 1) : fallback

export const ratiosFromWidths = (widths) => {
  if (!Array.isArray(widths) || widths.length === 0) return null
  const total = widths.reduce((sum, w) => sum + (Number.isFinite(w) ? w : 0), 0)
  if (!(total > 0)) return null
  return widths.map(w => (Number.isFinite(w) ? w : 0) / total)
}
// END_BLOCK_RATIO_MATHS
