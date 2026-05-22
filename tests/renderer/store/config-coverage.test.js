/**
 * Unit tests for src/renderer/src/config.js
 *
 * Coverage target: 90.9% → 95%+
 *
 * The config module exports:
 *   - PATH_SEPARATOR — window.path.sep
 *   - THEME_STYLE_ID, COMMON_STYLE_ID — string constants
 *   - DEFAULT_EDITOR_FONT_FAMILY, DEFAULT_CODE_FONT_FAMILY — string constants
 *   - DEFAULT_STYLE — frozen object
 *   - railscastsThemes — frozen array of dark theme names
 *   - oneDarkThemes — frozen array of one-dark theme names
 *   - themePairs — frozen object mapping theme counterparts
 *   - isDarkTheme(theme) — returns true if theme is in railscasts or oneDark
 */

describe('config.js', () => {
  let config

  beforeEach(async () => {
    config = await import('@/config')
  })

  it('PATH_SEPARATOR is window.path.sep', () => {
    expect(config.PATH_SEPARATOR).toBe(window.path.sep)
  })

  it('exports THEME_STYLE_ID and COMMON_STYLE_ID as strings', () => {
    expect(config.THEME_STYLE_ID).toBe('ag-theme')
    expect(config.COMMON_STYLE_ID).toBe('ag-common-style')
  })

  it('exports DEFAULT_EDITOR_FONT_FAMILY as a non-empty string', () => {
    expect(typeof config.DEFAULT_EDITOR_FONT_FAMILY).toBe('string')
    expect(config.DEFAULT_EDITOR_FONT_FAMILY.length).toBeGreaterThan(0)
    expect(config.DEFAULT_EDITOR_FONT_FAMILY).toContain('Open Sans')
  })

  it('exports DEFAULT_CODE_FONT_FAMILY as a non-empty string', () => {
    expect(typeof config.DEFAULT_CODE_FONT_FAMILY).toBe('string')
    expect(config.DEFAULT_CODE_FONT_FAMILY).toContain('DejaVu Sans Mono')
  })

  it('DEFAULT_STYLE is a frozen object with expected keys', () => {
    expect(Object.isFrozen(config.DEFAULT_STYLE)).toBe(true)
    expect(config.DEFAULT_STYLE).toEqual({
      codeFontFamily: config.DEFAULT_CODE_FONT_FAMILY,
      codeFontSize: '14px',
      hideScrollbar: false,
      theme: 'light'
    })
  })

  it('railscastsThemes is a frozen non-empty array of strings', () => {
    expect(Object.isFrozen(config.railscastsThemes)).toBe(true)
    expect(config.railscastsThemes.length).toBeGreaterThan(0)
    expect(config.railscastsThemes).toContain('dark')
    expect(config.railscastsThemes).toContain('dracula')
    expect(config.railscastsThemes).toContain('nord')
  })

  it('oneDarkThemes is a frozen array containing "one-dark"', () => {
    expect(Object.isFrozen(config.oneDarkThemes)).toBe(true)
    expect(config.oneDarkThemes).toEqual(['one-dark'])
  })

  it('themePairs is a frozen object with bidirectional theme mappings', () => {
    expect(Object.isFrozen(config.themePairs)).toBe(true)
    expect(config.themePairs['catppuccin-mocha']).toBe('catppuccin-latte')
    expect(config.themePairs['catppuccin-latte']).toBe('catppuccin-mocha')
    expect(config.themePairs['dark']).toBe('graphite')
    expect(config.themePairs['graphite']).toBe('dark')
  })

  describe('isDarkTheme', () => {
    it('returns true for railscasts themes', () => {
      expect(config.isDarkTheme('dark')).toBe(true)
      expect(config.isDarkTheme('dracula')).toBe(true)
      expect(config.isDarkTheme('nord')).toBe(true)
      expect(config.isDarkTheme('material-dark')).toBe(true)
      expect(config.isDarkTheme('catppuccin-mocha')).toBe(true)
      expect(config.isDarkTheme('gruvbox-dark')).toBe(true)
      expect(config.isDarkTheme('tokyo-night')).toBe(true)
      expect(config.isDarkTheme('solarized-dark')).toBe(true)
      expect(config.isDarkTheme('cyberdream')).toBe(true)
    })

    it('returns true for one-dark themes', () => {
      expect(config.isDarkTheme('one-dark')).toBe(true)
    })

    it('returns false for light themes', () => {
      expect(config.isDarkTheme('light')).toBe(false)
      expect(config.isDarkTheme('graphite')).toBe(false)
      expect(config.isDarkTheme('ulysses')).toBe(false)
      expect(config.isDarkTheme('catppuccin-latte')).toBe(false)
      expect(config.isDarkTheme('gruvbox-light')).toBe(false)
    })

    it('returns false for unknown theme names', () => {
      expect(config.isDarkTheme('nonexistent')).toBe(false)
      expect(config.isDarkTheme('')).toBe(false)
    })
  })
})
