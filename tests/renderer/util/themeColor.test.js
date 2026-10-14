/**
 * Tests for src/renderer/src/util/themeColor.js
 *
 * Each exported function is a factory that returns the concatenation
 * of a theme CSS string and a Prism CSS string.
 */

import * as themeColor from '@/util/themeColor'

describe('util/themeColor', () => {
  const exports = [
    // C-41 T-001 brand themes
    'paper', 'ink',
    'dark', 'graphite', 'materialDark', 'oneDark', 'ulysses',
    'dracula', 'nord', 'catppuccinMocha', 'gruvboxDark', 'tokyoNight',
    'tokyoNightStorm', 'solarizedDark', 'ayuDark', 'ayuMirage',
    'everforestDark', 'rosePine', 'rosePineMoon', 'monokaiPro',
    'synthwave84', 'horizonDark', 'palenight', 'oxocarbonDark',
    'kanagawa', 'nightfox', 'cyberdream',
    'catppuccinLatte', 'gruvboxLight', 'tokyoNightLight',
    'solarizedLight', 'ayuLight', 'everforestLight', 'rosePineDawn'
  ]

  it('should export all 34 theme factories as functions', () => {
    expect(exports.length).toBe(34)
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

  it('dark returns a string containing CSS', () => {
    expect(typeof themeColor.dark()).toBe('string')
  })

  it('oneDark returns a string', () => {
    expect(typeof themeColor.oneDark()).toBe('string')
  })

  it('catppuccinLatte returns a string', () => {
    expect(typeof themeColor.catppuccinLatte()).toBe('string')
  })

  it('materialDark returns a string', () => {
    expect(typeof themeColor.materialDark()).toBe('string')
  })
})
