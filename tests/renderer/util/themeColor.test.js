/**
 * Tests for src/renderer/src/util/themeColor.js
 *
 * Each exported function is a factory that returns the concatenation
 * of a theme CSS string and a Prism CSS string.
 * C-41 T-002: the 12 retired factories are gone — 22 remain until the
 * six C-41 T-003 members join.
 */

import * as themeColor from '@/util/themeColor'

describe('util/themeColor', () => {
  const exports = [
    // C-41 T-001 brand themes
    'paper', 'ink',
    // C-41 T-003 new family members
    'oneLight', 'alucard', 'nordLight', 'kanagawaLotus', 'graphiteDark', 'ulyssesDark',
    'graphite', 'oneDark', 'ulysses',
    'dracula', 'nord', 'catppuccinMocha', 'gruvboxDark', 'tokyoNight',
    'solarizedDark', 'ayuDark', 'everforestDark', 'rosePine', 'kanagawa',
    'catppuccinLatte', 'gruvboxLight', 'tokyoNightLight',
    'solarizedLight', 'ayuLight', 'everforestLight', 'rosePineDawn'
  ]

  it('should export all 28 family-member theme factories as functions', () => {
    expect(exports.length).toBe(28)
    for (const name of exports) {
      expect(typeof themeColor[name], `${name} should be a function`).toBe('function')
    }
  })

  it('each factory should return a string', () => {
    for (const name of exports) {
      const result = themeColor[name]()
      expect(typeof result, `${name}() should return string`).toBe('string')
    }
  })

  it('paper and ink are registered factories (C-41 T-001)', () => {
    // CSS ?inline imports resolve to '' under vitest; content is pinned in
    // tests/renderer/pages/theme-paper-ink.test.js from the files on disk.
    expect(typeof themeColor.paper).toBe('function')
    expect(typeof themeColor.ink).toBe('function')
  })

  it('the retired C-41 T-002 factories are gone', () => {
    for (const retired of ['dark', 'materialDark', 'tokyoNightStorm', 'ayuMirage',
      'rosePineMoon', 'monokaiPro', 'synthwave84', 'horizonDark', 'palenight',
      'oxocarbonDark', 'nightfox', 'cyberdream']) {
      expect(themeColor[retired], `${retired} should be removed`).toBeUndefined()
    }
  })

  it('the six C-41 T-003 family members are registered factories', () => {
    // oneLight, alucard, nordLight, kanagawaLotus, graphiteDark, ulyssesDark.
    for (const name of ['oneLight', 'alucard', 'nordLight', 'kanagawaLotus', 'graphiteDark', 'ulyssesDark']) {
      expect(typeof themeColor[name], `${name} should be a function`).toBe('function')
    }
  })

  it('oneDark returns a string', () => {
    expect(typeof themeColor.oneDark()).toBe('string')
  })

  it('catppuccinLatte returns a string', () => {
    expect(typeof themeColor.catppuccinLatte()).toBe('string')
  })
})
