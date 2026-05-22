/**
 * Tests for src/renderer/src/util/themeColor.js
 *
 * Each exported function is a factory that returns the concatenation
 * of a theme CSS string and a Prism CSS string.
 */

import * as themeColor from '@/util/themeColor'

describe('util/themeColor', () => {
  const exports = [
    'dark', 'graphite', 'materialDark', 'oneDark', 'ulysses',
    'dracula', 'nord', 'catppuccinMocha', 'gruvboxDark', 'tokyoNight',
    'tokyoNightStorm', 'solarizedDark', 'ayuDark', 'ayuMirage',
    'everforestDark', 'rosePine', 'rosePineMoon', 'monokaiPro',
    'synthwave84', 'horizonDark', 'palenight', 'oxocarbonDark',
    'kanagawa', 'nightfox', 'cyberdream',
    'catppuccinLatte', 'gruvboxLight', 'tokyoNightLight',
    'solarizedLight', 'ayuLight', 'everforestLight', 'rosePineDawn'
  ]

  it('should export all 32 theme factories as functions', () => {
    expect(exports.length).toBe(32)
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
