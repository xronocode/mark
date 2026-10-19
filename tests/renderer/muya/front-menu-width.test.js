// FILE: tests/renderer/muya/front-menu-width.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the FIX-004 content-aware front-menu/submenu sizing — long localized rows widen the surfaces within the clamp.
//   SCOPE: computeMenuWidth clamping and row accounting (label, shortcut column, submenu arrow, empty items).
//   DEPENDS: src/muya/lib/ui/frontMenu/index.js, Vitest, jsdom.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; docs/release-trains/2.5.x-next.md FIX-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LONG_RU - The observed wide Russian quick-insert row that broke the fixed 190px layout.
//   row - Convenience builder for a menu row shape (text/title, shortCut, hasSubmenu).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-004: pin the [190, 340] clamp, the shortcut-column and submenu-arrow accounting, and the localized-row widening.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { computeMenuWidth } from 'muya/lib/ui/frontMenu'

const row = (text, shortCut, extra = {}) => ({ text, shortCut, ...extra })
const LONG_RU = 'Математическая формула'

describe('FIX-004 front-menu content-aware width', () => {
  it('keeps the 190px base for short/empty menus', () => {
    expect(computeMenuWidth([])).toBe(190)
    expect(computeMenuWidth([row('Абзац', '⌘+0')])).toBe(190)
  })

  it('widens for the observed long Russian row', () => {
    const width = computeMenuWidth([row(LONG_RU, '⌥⌘M')])
    expect(width).toBeGreaterThan(190)
    // jsdom has no canvas: the estimate is ~7px per glyph, so the long row
    // must land meaningfully above the base but inside the clamp.
    expect(width).toBeLessThanOrEqual(340)
  })

  it('accounts for the submenu arrow affordance', () => {
    // Both rows are long enough to clear the 190px base so the arrow's
    // 40px shows up in the difference, not in the clamp.
    const plain = computeMenuWidth([row(LONG_RU, '⌥⌘M')])
    const withArrow = computeMenuWidth([row(LONG_RU, '⌥⌘M', { hasSubmenu: true })])
    expect(withArrow - plain).toBe(40)
  })

  it('caps absurdly long rows at 340px', () => {
    expect(computeMenuWidth([row('о'.repeat(400), '⇧⌘D')])).toBe(340)
  })

  it('uses the widest row of the set', () => {
    const narrow = computeMenuWidth([row('Абзац', '⌘+0'), row(LONG_RU, '⌥⌘M'), row('Цитата', '⌥⌘Q')])
    const only = computeMenuWidth([row(LONG_RU, '⌥⌘M')])
    expect(narrow).toBe(only)
  })
})
