// FILE: tests/renderer/muya/chart-palette-fixture.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the e2e palette fixture (tests/e2e/fixtures/chartPalette.ts) to muya's mermaidTheme maths so expected colours never drift.
//   SCOPE: palette and blendHex parity over several accents and lightness/chroma pairs.
//   DEPENDS: src/muya/lib/parser/render/mermaidTheme.js, tests/e2e/fixtures/chartPalette.ts.
//   LINKS: C-51 T-005.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ACCENTS - accent colours covering light and dark themes.
// END_MODULE_MAP
import { describe, it, expect } from 'vitest'
import { palette, blendHex } from 'muya/lib/parser/render/mermaidTheme'
import * as fixture from '../../e2e/fixtures/chartPalette'

const ACCENTS = ['#9A6F00', '#FFCF1A', '#007AFF', '#10A37F', '#E11D48']

describe('e2e chart palette fixture parity (C-51 T-005)', () => {
  it('palette() matches muya for light and dark ranges', () => {
    for (const a of ACCENTS) {
      for (const [L, C] of [[0.6, 0.12], [0.74, 0.11], [0.9, 0.05], [0.36, 0.05]]) {
        expect(fixture.palette(a, L, C)).toEqual(palette(a, L, C))
      }
    }
  })
  it('blendHex() matches muya', () => {
    expect(fixture.blendHex('#22252B', '#FBF8F2', 0.65)).toBe(blendHex('#22252B', '#FBF8F2', 0.65))
    expect(fixture.blendHex('#ECE6DA', '#17191E', 0.5)).toBe(blendHex('#ECE6DA', '#17191E', 0.5))
  })
})
