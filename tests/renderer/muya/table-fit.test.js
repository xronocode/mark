// FILE: tests/renderer/muya/table-fit.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-007: pin the honest table fit algorithm (spec R-9, corners C-7/C-8) — the three-phase DOM measurement (max-content, min-content, wrap-anywhere min over the header plus the first 50 rows, with the jsdom/hidden-pane null guard), the distribution decision order (slack-proportional capped at maxContent, even leftover; wrap-anywhere fallback under space pressure; minimal-size scroll degradation reporting the exact overflow px), the integer snap whose sum equals the frame, and the ratio maths the mode model re-applies on resizes and Fit↔Full switches.
//   SCOPE: src/muya/lib/tableResize/tableFit.js — measureColumnExtents, planTableFit, distributeIntoFrame, snapWidthsToInt, applyRatiosToWidth, ratiosFromWidths, FIT_MEASURE_ROW_LIMIT. The consuming mode model is pinned in table-layout-persistence.test.js; the store-side ratio twin in tests/renderer/util/table-layout-ratios.test.js.
//   DEPENDS: Vitest + jsdom (measureColumnExtents refuses zero geometry; the three-phase measurement is pinned through a getBoundingClientRect stub keyed on the measurer class).
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-007; spec R-8/R-9; corners C-7/C-8); .grace/graph/performance.xml M-061; src/muya/lib/tableResize/index.js (the consumer); tests/renderer/util/table-layout-ratios.test.js (the store-side twin).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   extents - fixture factory: build a synthetic { minContent, maxContent, wrappedMin } triple.
//   sum - reducer helper for width arrays.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: new
//   suite. Pins the plan's corner-7 fixtures (a table that fits is
//   distributed, a wrap-fittable table wraps before it scrolls, an
//   unfittable one degrades at its minima with the exact overflow), the
//   water-filling cap and even-leftover rules, the 50-row measurement
//   limit, and the ratio re-application maths.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it } from 'vitest'
import {
  FIT_MEASURE_ROW_LIMIT,
  MEASURE_TABLE_CLASS,
  applyRatiosToWidth,
  distributeIntoFrame,
  measureColumnExtents,
  planTableFit,
  ratiosFromWidths,
  snapWidthsToInt
} from 'muya/lib/tableResize/tableFit'

// Synthetic extents: { minContent, maxContent, wrappedMin }.
const extents = (minContent, maxContent, wrappedMin = null) => ({
  minContent,
  maxContent,
  wrappedMin: wrappedMin || minContent.map(w => Math.min(w, 24))
})

const sum = (values) => values.reduce((total, w) => total + w, 0)

describe('distributeIntoFrame (R-9 distribution)', () => {
  it('gives the free space proportionally to the slack, capped at maxContent', () => {
    // Two columns: min 100/100, max 200/300, frame 500 → free 300 split
    // by slack 100:200 — both columns reach exactly their caps.
    const widths = distributeIntoFrame([100, 100], [200, 300], 500)
    expect(widths).toEqual([200, 300])
  })

  it('splits a partially fillable frame by the slack ratio', () => {
    // min 100/100, max 400/400, frame 300 → free 100 split 1:1.
    const widths = distributeIntoFrame([100, 100], [400, 400], 300)
    expect(widths[0]).toBeCloseTo(150, 5)
    expect(widths[1]).toBeCloseTo(150, 5)
  })

  it('fills the frame exactly', () => {
    const widths = distributeIntoFrame([100, 100, 100], [200, 200, 200], 480)
    expect(sum(widths)).toBeCloseTo(480, 5)
  })

  it('caps columns at their maxContent and the leftover splits evenly', () => {
    // min 100/100, max 150/400, frame 600: proportional split gives col0
    // its cap (150) quickly; the rest flows to col1 up to 400; the final
    // leftover (600 − 550) splits evenly over BOTH columns — col0 exceeds
    // its max (the Word AutoFit Window behaviour).
    const widths = distributeIntoFrame([100, 100], [150, 400], 600)
    expect(sum(widths)).toBeCloseTo(600, 5)
    expect(widths[0]).toBeGreaterThan(150) // even leftover past the cap
    expect(widths[1]).toBeLessThan(450)
  })

  it('never drops below the minima when the frame equals their sum', () => {
    const widths = distributeIntoFrame([120, 80], [400, 400], 200)
    expect(widths).toEqual([120, 80])
  })

  it('refuses unusable input', () => {
    expect(distributeIntoFrame([], [], 100)).toBeNull()
    expect(distributeIntoFrame([100], [200], 0)).toBeNull()
    expect(distributeIntoFrame([100], [200], NaN)).toBeNull()
  })
})

describe('snapWidthsToInt', () => {
  it('rounds so the widths sum exactly to the frame', () => {
    // The +1 residue lands on the first (narrowest-tie) column.
    expect(snapWidthsToInt([100.4, 100.4, 100.4], 301.2)).toEqual([101, 100, 100])
    expect(sum(snapWidthsToInt([33.33, 33.33, 33.34], 100))).toBe(100)
  })

  it('keeps columns positive while absorbing a negative residual', () => {
    const snapped = snapWidthsToInt([10.5, 10.5], 20)
    expect(sum(snapped)).toBe(20)
    expect(Math.min(...snapped)).toBeGreaterThanOrEqual(9)
  })
})

describe('planTableFit — the R-9 decision order (corners C-7/C-8)', () => {
  it('a table whose minima fit is distributed into the frame', () => {
    const plan = planTableFit(extents([80, 120, 60], [200, 240, 90]), 600)
    expect(plan.kind).toBe('distribute')
    // The frame (600) exceeds the max-content sum (530): every column
    // reaches its cap first, then the even leftover fills the rest —
    // the table never leaves its frame.
    expect(sum(plan.widths)).toBe(600)
    expect(plan.widths[0]).toBeGreaterThanOrEqual(80)
    expect(plan.widths[1]).toBeGreaterThanOrEqual(120)
    expect(plan.widths[2]).toBeGreaterThanOrEqual(60)
  })

  it('the wrap fallback runs BEFORE degradation (wrap-anywhere re-measure)', () => {
    // One long-token column: min 700 > frame 500, but wrap-anywhere
    // minima (24/24) fit → the plan wraps instead of scrolling.
    const plan = planTableFit(
      extents([700, 100], [700, 300], [24, 24]),
      500
    )
    expect(plan.kind).toBe('wrap')
    expect(sum(plan.widths)).toBe(500)
  })

  it('degradation reports minimal sizes and the exact overflow px', () => {
    // wrappedMinima (300+300) still exceed the 500px frame → scroll.
    const plan = planTableFit(extents([300, 300], [400, 400], [300, 300]), 500)
    expect(plan.kind).toBe('scroll')
    expect(plan.widths).toEqual([300, 300])
    expect(plan.overflowPx).toBe(100)
  })

  it('degradation prefers the wrapped minima when they are smaller', () => {
    const plan = planTableFit(extents([400, 400], [400, 400], [260, 260]), 500)
    expect(plan.kind).toBe('scroll')
    expect(plan.widths).toEqual([260, 260])
    expect(plan.overflowPx).toBe(20)
  })

  it('refuses zero/negative frames and missing extents', () => {
    expect(planTableFit(extents([100], [200]), 0)).toBeNull()
    expect(planTableFit(extents([100], [200]), -10)).toBeNull()
    expect(planTableFit(null, 500)).toBeNull()
  })

  it('a frame wider than max-content fills through the even leftover', () => {
    const plan = planTableFit(extents([100, 100], [150, 150]), 600)
    expect(plan.kind).toBe('distribute')
    expect(sum(plan.widths)).toBe(600)
    expect(plan.widths[0]).toBeGreaterThan(150)
    expect(plan.widths[1]).toBeGreaterThan(150)
  })
})

describe('ratio maths (T-008 re-application)', () => {
  it('ratiosFromWidths returns fractions of the sum', () => {
    expect(ratiosFromWidths([100, 300])).toEqual([0.25, 0.75])
    expect(ratiosFromWidths([0, 0])).toBeNull()
    expect(ratiosFromWidths([])).toBeNull()
  })

  it('applyRatiosToWidth re-applies proportions to a new frame', () => {
    const widths = applyRatiosToWidth([0.25, 0.75], 800)
    expect(sum(widths)).toBe(800)
    expect(widths[0]).toBe(200)
    expect(widths[1]).toBe(600)
  })

  it('floors columns at their minima and re-balances over the rest', () => {
    // ratio share 75 → below the 120 floor; the donor gives the missing
    // 45 back so the sum stays the frame.
    const widths = applyRatiosToWidth([0.3, 0.7], 250, [120, 0])
    expect(sum(widths)).toBe(250)
    expect(widths[0]).toBeGreaterThanOrEqual(120)
  })

  it('refuses invalid ratios and frames', () => {
    expect(applyRatiosToWidth([], 500)).toBeNull()
    expect(applyRatiosToWidth([0.5, -1], 500)).toBeNull()
    expect(applyRatiosToWidth([0.5, 0.5], 0)).toBeNull()
  })
})

describe('measureColumnExtents (three-phase DOM measurement)', () => {
  const nativeRect = HTMLElement.prototype.getBoundingClientRect
  let stubbed = false

  const stubMeasurerRects = (rows) => {
    stubbed = true
    const seen = { measurerRows: 0 }
    const stub = function () {
      const measurer = this.closest && this.closest(`.${MEASURE_TABLE_CLASS}`)
      if (!measurer) return nativeRect.call(this)
      if (!seen.measurerRows) seen.measurerRows = measurer.rows.length
      // The phase is the table's width style; the answer is synthetic:
      // max-content → the spec's max, the min phases the token/wrapped
      // values.
      const phase = measurer.style.width
      const cellIndex = Array.prototype.indexOf.call(this.parentElement.children, this)
      const spec = rows[cellIndex] || { max: 100, min: 40, wrapped: 10 }
      const width = phase === 'min-content'
        ? (this.style.overflowWrap === 'anywhere' ? spec.wrapped : spec.min)
        : spec.max
      return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0 }
    }
    HTMLElement.prototype.getBoundingClientRect = stub
    return seen
  }

  afterEach(() => {
    if (stubbed) {
      HTMLElement.prototype.getBoundingClientRect = nativeRect
      stubbed = false
    }
    document.querySelectorAll(`.${MEASURE_TABLE_CLASS}`).forEach(node => node.remove())
  })

  const buildTable = (headerTexts, bodyRowCount = 2) => {
    const table = document.createElement('table')
    table.className = 'ag-paragraph'
    const head = table.createTHead().insertRow()
    for (const text of headerTexts) {
      const th = document.createElement('th')
      th.textContent = text
      head.appendChild(th)
    }
    const body = table.createTBody()
    for (let r = 0; r < bodyRowCount; r++) {
      const row = body.insertRow()
      for (const text of headerTexts) {
        const td = document.createElement('td')
        td.textContent = `${text}-${r}`
        row.appendChild(td)
      }
    }
    const figure = document.createElement('figure')
    figure.setAttribute('data-role', 'TABLE')
    const wrapper = document.createElement('div')
    wrapper.className = 'ag-table-scroll'
    wrapper.appendChild(table)
    figure.appendChild(wrapper)
    document.body.appendChild(figure)
    return table
  }

  it('measures maxContent, minContent and wrappedMin per column', () => {
    const table = buildTable(['AA', 'BBBB'])
    stubMeasurerRects([
      { max: 120, min: 50, wrapped: 8 },
      { max: 240, min: 90, wrapped: 12 }
    ])
    const result = measureColumnExtents(table)
    expect(result).toEqual({
      maxContent: [120, 240],
      minContent: [50, 90],
      wrappedMin: [8, 12]
    })
    // The measurer is removed again.
    expect(document.querySelectorAll(`.${MEASURE_TABLE_CLASS}`).length).toBe(0)
  })

  it('clones only the header plus the first FIT_MEASURE_ROW_LIMIT body rows', () => {
    expect(FIT_MEASURE_ROW_LIMIT).toBe(50)
    const table = buildTable(['A'], 70)
    const seen = stubMeasurerRects([{ max: 100, min: 40, wrapped: 10 }])
    measureColumnExtents(table)
    // thead row + 50 body rows (the fixture has 70).
    expect(seen.measurerRows).toBe(51)
  })

  it('returns null when the geometry is zero (jsdom, no stub)', () => {
    const table = buildTable(['A', 'B'])
    expect(measureColumnExtents(table)).toBeNull()
  })

  it('refuses tables without a header row or cells', () => {
    expect(measureColumnExtents(null)).toBeNull()
    const empty = document.createElement('table')
    expect(measureColumnExtents(empty)).toBeNull()
  })
})
