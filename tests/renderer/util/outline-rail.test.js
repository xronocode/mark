// FILE: tests/renderer/util/outline-rail.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-40 T-003 outline-rail pure gates — h1–h3 extraction, current-heading resolution (nearest visible ancestor), and the width/heading-count/no-overlap fit rules.
//   SCOPE: util/outlineRail.js pure heading/gate functions and strict table/rail/scrollport intersection, including clipping and invalid geometry.
//   DEPENDS: util/outlineRail.js, Vitest.
//   LINKS: .grace/changes/archive/C-40 T-003; .grace/verification/runtime.xml V-M-011 scenario-54.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TOC - listToc fixture with mixed heading levels.
//   rect - rectangle fixture from four viewport edges.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-19 v1.1.0: C-71-OUTLINE-OCCLUSION — positive visible intersection, clipping, edge contact and unusable geometry.
//   - 2026-10-15 v1.0.0: C-40 T-003 initial coverage.
// END_CHANGE_SUMMARY

import {
  extractRailHeadings,
  resolveCurrentHeading,
  railFitsWithoutOverlap,
  shouldShowRail,
  RAIL_MIN_EDITOR_WIDTH,
  RAIL_MIN_HEADINGS,
  railIntersectsTable
} from '@/util/outlineRail'

const TOC = [
  { slug: 'h1-title', content: 'Title', lvl: 1 },
  { slug: 'h2-alpha', content: 'Alpha', lvl: 2 },
  { slug: 'h4-nested', content: 'Nested', lvl: 4 },
  { slug: 'h3-deep', content: 'Deep', lvl: 3 },
  { slug: 'h5-hidden', content: 'Hidden', lvl: 5 }
]

const rect = (left, top, right, bottom) => ({ left, top, right, bottom })

describe('railIntersectsTable', () => {
  it.each([
    [rect(100, 80, 1150, 160), true],
    [rect(100, 80, 1100, 160), false],
    [rect(100, 200, 1150, 260), false],
    [rect(100, -200, 1150, -10), false],
    [rect(100, -200, 1150, 90), true],
    [rect(100, 80, 100, 160), false],
    [rect(NaN, 80, 1150, 160), false],
    [null, false]
  ])('requires positive intersection inside the viewport: %j', (table, expected) => {
    expect(railIntersectsTable(rect(1100, 60, 1280, 200), table, rect(0, 0, 1300, 700))).toBe(expected)
  })

  it('ignores a table/rail intersection clipped outside the owning scrollport', () => {
    expect(railIntersectsTable(rect(1100, 0, 1280, 200), rect(100, 0, 1200, 40), rect(0, 50, 1300, 700))).toBe(false)
    expect(railIntersectsTable(null, rect(100, 0, 1200, 40), rect(0, 0, 1300, 700))).toBe(false)
    expect(railIntersectsTable(rect(1100, 0, 1280, 200), rect(100, 0, 1200, 40), null)).toBe(false)
    expect(railIntersectsTable(rect(1100, 0, 1280, 200), rect(100, 0, 1200, 40), rect(0, 0, 1300, 700), rect(100, 0, 900, 100))).toBe(false)
  })
})

describe('extractRailHeadings', () => {
  it('keeps h1–h3 in document order and drops deeper levels', () => {
    expect(extractRailHeadings(TOC)).toEqual([
      { slug: 'h1-title', label: 'Title', lvl: 1 },
      { slug: 'h2-alpha', label: 'Alpha', lvl: 2 },
      { slug: 'h3-deep', label: 'Deep', lvl: 3 }
    ])
  })

  it('tolerates null and malformed entries', () => {
    expect(extractRailHeadings(null)).toEqual([])
    expect(extractRailHeadings(undefined)).toEqual([])
    expect(
      extractRailHeadings([
        null,
        { content: 'no slug', lvl: 1 },
        { slug: 'ok', content: 'Ok', lvl: 2 },
        { slug: 'no-content', lvl: 2 },
        { slug: 'bad-lvl', content: 'x', lvl: '2' },
        { slug: '', content: 'empty slug', lvl: 1 }
      ])
    ).toEqual([{ slug: 'ok', label: 'Ok', lvl: 2 }])
  })
})

describe('resolveCurrentHeading', () => {
  const rail = extractRailHeadings(TOC)

  it('highlights the exact slug when it is listed', () => {
    expect(resolveCurrentHeading(rail, TOC, 'h2-alpha')).toEqual({
      slug: 'h2-alpha',
      label: 'Alpha',
      lvl: 2
    })
  })

  it('maps a viewport inside an unlisted h4/h5 onto its nearest listed ancestor', () => {
    expect(resolveCurrentHeading(rail, TOC, 'h4-nested')?.slug).toBe('h2-alpha')
    expect(resolveCurrentHeading(rail, TOC, 'h5-hidden')?.slug).toBe('h3-deep')
  })

  it('clears for null, unknown, or empty-rail inputs', () => {
    expect(resolveCurrentHeading(rail, TOC, null)).toBeNull()
    expect(resolveCurrentHeading(rail, TOC, 'not-in-doc')).toBeNull()
    expect(resolveCurrentHeading([], TOC, 'h2-alpha')).toBeNull()
    expect(resolveCurrentHeading(rail, null, 'h2-alpha')).toBeNull()
  })
})

describe('railFitsWithoutOverlap (geometry gate)', () => {
  // Shipped default column: 750px wide, 50px inner padding, centred.
  const columnRightFor = (containerWidth, columnWidth = 750) =>
    (containerWidth + Math.min(columnWidth, containerWidth)) / 2

  it(`hides below ${RAIL_MIN_EDITOR_WIDTH}px of editor width`, () => {
    expect(railFitsWithoutOverlap(900, columnRightFor(900))).toBe(false)
    expect(railFitsWithoutOverlap(NaN, 800)).toBe(false)
  })

  it('shows on a wide default layout (1280px viewport, centred 750px column)', () => {
    // rail left edge = 1280 - 22 - 170 = 1088; text right edge = (1280+750)/2 - 50 = 965.
    expect(railFitsWithoutOverlap(1280, columnRightFor(1280))).toBe(true)
  })

  it('hides near the 1000px floor where the margin cannot clear the text column', () => {
    // At 1000px: rail left = 808, text right = 825 → the rail would overlap text.
    expect(railFitsWithoutOverlap(1000, columnRightFor(1000))).toBe(false)
    // From ~1070px the default layout fits.
    expect(railFitsWithoutOverlap(1100, columnRightFor(1100))).toBe(true)
  })

  it('honours a wider editorLineWidth column by staying hidden until it fits', () => {
    // 950px column in a 1200px editor: text right = (1200+950)/2 - 50 = 1025;
    // rail left = 1008 → overlap → hidden.
    expect(railFitsWithoutOverlap(1200, columnRightFor(1200, 950), 50)).toBe(false)
    // The same column in a 1400px editor fits: text right = 1125, rail left = 1208.
    expect(railFitsWithoutOverlap(1400, columnRightFor(1400, 950), 50)).toBe(true)
  })

  it('uses the 50px padding fallback when the live padding is unknown', () => {
    const width = 1280
    const columnRight = columnRightFor(width)
    expect(railFitsWithoutOverlap(width, columnRight, NaN)).toBe(
      railFitsWithoutOverlap(width, columnRight, 50)
    )
  })

  it('hides when the column is not measurable', () => {
    expect(railFitsWithoutOverlap(1280, NaN)).toBe(false)
  })
})

describe('shouldShowRail (combined gate)', () => {
  const base = {
    preferenceVisible: true,
    sourceCode: false,
    splitView: false,
    diffMode: false,
    containerWidth: 1280,
    columnRight: (1280 + 750) / 2,
    columnPaddingRight: 50,
    headings: [
      { slug: 'a', label: 'A', lvl: 1 },
      { slug: 'b', label: 'B', lvl: 2 },
      { slug: 'c', label: 'C', lvl: 2 }
    ]
  }

  it('shows when every gate passes', () => {
    expect(shouldShowRail(base)).toBe(true)
  })

  it('hides when the preference is off, or in source/split/diff modes', () => {
    expect(shouldShowRail({ ...base, preferenceVisible: false })).toBe(false)
    expect(shouldShowRail({ ...base, sourceCode: true })).toBe(false)
    expect(shouldShowRail({ ...base, splitView: true })).toBe(false)
    expect(shouldShowRail({ ...base, diffMode: true })).toBe(false)
  })

  it(`hides with fewer than ${RAIL_MIN_HEADINGS} h1–h3 headings`, () => {
    expect(shouldShowRail({ ...base, headings: base.headings.slice(0, 2) })).toBe(false)
    expect(shouldShowRail({ ...base, headings: [] })).toBe(false)
    expect(shouldShowRail({ ...base, headings: null })).toBe(false)
  })
})
