// FILE: tests/renderer/util/theme-width-precedence.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PREFS-TRUTH T-003 (F-002) — pin the width precedence across
//            a theme switch for the LEGACY global tier: with a saved
//            global editorLineWidth and no per-document pipeline entry,
//            the theme's inline --editorAreaWidth mirror must not out-rank
//            the #editor-width declaration setEditorWidth writes, in both
//            switch orders; with a recorded pipeline width the pipeline
//            value still wins through reapplyLastEditorWidth; and the
//            reapplyLastEditorWidth contract (no-op when nothing is
//            recorded) stays unchanged. The C-PAGE-WIDTH-TABLES locked
//            model (document > theme > global, single writer, render-time
//            clamping) is not renegotiated — util/pageWidth.js is
//            untouched.
//   SCOPE: util/theme.js addThemeStyle ordering + setEditorWidth in jsdom;
//          themeColor/config mocked lightweight (mirrors page-width.test.js).
//   DEPENDS: Vitest; util/theme.js; util/pageWidth.js; @/config, @/util/themeColor, @/util/index mocked.
//   LINKS: tests/renderer/util/page-width.test.js (the pipeline tier pins);
//          tests/renderer/util/theme.test.js; util/pageWidth.js
//          START_BLOCK_WRITER; .grace/verification/performance.xml V-M-061.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   loadTheme - fresh import of util/theme.js after resetting the module
//               registry, so lastGlobalEditorWidth starts null per test.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-21 C-PREFS-TRUTH T-003: new — the
//   legacy global width tier keeps the saved editorLineWidth effective
//   across a theme switch (both switch orders, resolved variable +
//   #editor-width declaration), the pipeline tier still wins when it has
//   a recorded width, and the reapplyLastEditorWidth no-op contract is
//   pinned unchanged.
// END_CHANGE_SUMMARY

// Mock the config module (mirrors page-width.test.js)
vi.mock('@/config', () => ({
  THEME_STYLE_ID: 'ag-theme',
  COMMON_STYLE_ID: 'ag-common-style',
  DEFAULT_CODE_FONT_FAMILY: '"DejaVu Sans Mono", monospace',
  oneDarkThemes: Object.freeze(['one-dark']),
  railscastsThemes: Object.freeze(['ink', 'dracula', 'nord', 'gruvbox-dark'])
}))

// Mock themeColor — the factories carry the real themes' locked
// --editorAreaWidth re-declaration so the switch reproduces the shipped
// cascade (the theme mirror lands inline mid-switch).
vi.mock('@/util/themeColor', () => {
  const factory = (name) => () => `:root { --theme: ${name}; --editorAreaWidth: calc(100px + 768px); }`
  return {
    paper: factory('paper'),
    ink: factory('ink'),
    docs: factory('docs'),
    docsDark: factory('docsDark'),
    macos: factory('macos'),
    macosDark: factory('macosDark'),
    graphite: factory('graphite'),
    oneDark: factory('oneDark'),
    ulysses: factory('ulysses'),
    dracula: factory('dracula'),
    nord: factory('nord'),
    catppuccinMocha: factory('catppuccinMocha'),
    gruvboxDark: factory('gruvboxDark'),
    tokyoNight: factory('tokyoNight'),
    solarizedDark: factory('solarizedDark'),
    ayuDark: factory('ayuDark'),
    everforestDark: factory('everforestDark'),
    rosePine: factory('rosePine'),
    kanagawa: factory('kanagawa'),
    catppuccinLatte: factory('catppuccinLatte'),
    gruvboxLight: factory('gruvboxLight'),
    tokyoNightLight: factory('tokyoNightLight'),
    solarizedLight: factory('solarizedLight'),
    ayuLight: factory('ayuLight'),
    everforestLight: factory('everforestLight'),
    oneLight: factory('oneLight'),
    alucard: factory('alucard'),
    nordLight: factory('nordLight'),
    kanagawaLotus: factory('kanagawaLotus'),
    graphiteDark: factory('graphiteDark'),
    ulyssesDark: factory('ulyssesDark'),
    rosePineDawn: factory('rosePineDawn'),
    github: factory('github'),
    githubDark: factory('githubDark')
  }
})

// Mock util/index for isLinux
vi.mock('@/util/index', () => ({
  isLinux: false,
  isOsx: true,
  isWindows: false
}))

const loadTheme = async () => {
  vi.resetModules()
  return await import('@/util/theme')
}

describe('theme width precedence across a theme switch (C-PREFS-TRUTH F-002)', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.body.className = ''
    document.documentElement.style.cssText = ''
    delete document.documentElement.__themeVars
  })

  it('theme then width: the saved global width survives the switch — the inline mirror is dropped and the #editor-width declaration re-asserted', async () => {
    const theme = await loadTheme()
    // The saved global width (no per-document entry anywhere).
    theme.setEditorWidth('600px')
    // A theme switch mirrors the theme's own calc(100px + 768px) inline…
    theme.addThemeStyle('paper')
    // …but the resolved variable must NOT stay the theme's mirror value:
    // the legacy global tier owns the cascade again.
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('')
    expect(document.querySelector('#editor-width').textContent).toContain('--editorAreaWidth: calc(100px + 600px)')
  })

  it('width then theme: a switch AFTER the global assertion keeps the saved global width', async () => {
    const theme = await loadTheme()
    theme.addThemeStyle('paper')
    // The theme's mirror is inline at this point (the theme tier answer).
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('calc(100px + 768px)')
    // The user asserts a saved global width — the stale mirror must go.
    theme.setEditorWidth('600px')
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('')
    // And a FOLLOW-UP theme switch keeps the global tier effective.
    theme.addThemeStyle('ink')
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('')
    expect(document.querySelector('#editor-width').textContent).toContain('calc(100px + 600px)')
  })

  it('a theme switch re-asserts the global tier on its own (both orders settle on the saved width)', async () => {
    const theme = await loadTheme()
    theme.setEditorWidth('80ch')
    theme.addThemeStyle('paper')
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('')
    theme.addThemeStyle('ink')
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('')
    expect(document.querySelector('#editor-width').textContent).toContain('--editorAreaWidth: calc(100px + 80ch)')
  })

  it('with a recorded pipeline width, the pipeline value still wins through reapplyLastEditorWidth', async () => {
    const theme = await loadTheme()
    const { applyEditorWidth, getLastAppliedEditorWidth } = await import('@/util/pageWidth')
    // The per-document tier is in play (a recorded pipeline width) AND a
    // global width is remembered (setEditorWidth ran at mount).
    applyEditorWidth({ boxPx: 1000, source: 'document' })
    theme.setEditorWidth('600px')
    theme.addThemeStyle('paper')
    // The pipeline tier outranks the legacy global tier: the recorded box
    // is re-applied inline after the theme mirror landed.
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('1000px')
    expect(getLastAppliedEditorWidth()).toEqual({ boxPx: 1000, source: 'document' })
  })

  it('the reapplyLastEditorWidth contract stays unchanged — a no-op when nothing is recorded', async () => {
    const theme = await loadTheme()
    const { reapplyLastEditorWidth, getLastAppliedEditorWidth, clearAppliedEditorWidth } = await import('@/util/pageWidth')
    expect(getLastAppliedEditorWidth()).toBeNull()
    expect(reapplyLastEditorWidth()).toBe(false)
    // Even with a global width remembered, the theme hook has nothing to
    // re-apply until the pipeline itself has applied a width.
    theme.setEditorWidth('600px')
    expect(reapplyLastEditorWidth()).toBe(false)
    expect(clearAppliedEditorWidth()).toBe(false)
  })

  it('with no saved global width, the theme mirror stays in place (the theme tier answer — shipped behaviour)', async () => {
    const theme = await loadTheme()
    theme.addThemeStyle('paper')
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('calc(100px + 768px)')
    // A second switch behaves identically: no global tier, nothing to
    // re-assert, the theme's own mirror survives verbatim.
    theme.addThemeStyle('ink')
    expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('calc(100px + 768px)')
  })
})
