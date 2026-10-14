// FILE: tests/renderer/pages/theme-paper-ink.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-41 T-001 registration and defaults — Paper/Ink in the real theme pipeline (themeColor factories, themeMap injection, dark classification, pairs), fresh-profile Auto defaults, stored-preference preservation, and the Settings theme page unhiding.
//   SCOPE: Real (unmocked) util/theme + util/themeColor + config + store/preferences + prefComponents/theme over jsdom, plus an SFC source pin.
//   DEPENDS: Vitest, Pinia test setup, util/theme.js, util/themeColor.js, util/autoTheme.js, config.js, store/preferences.js.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-38 (C-41 T-001).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root resolver for source pins.
//   readSfc - reads the Settings theme page source for the un-hide pin.
//   cleanDocument - strips injected style tags and theme vars between cases.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-41 T-001 initial pins.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))

const ROOT = resolve(__dirname, '..', '..', '..')
const readSfc = () =>
  readFileSync(resolve(ROOT, 'src/renderer/src/prefComponents/theme/index.vue'), 'utf-8')

const cleanDocument = () => {
  document.head.innerHTML = ''
  document.body.className = ''
  document.documentElement.style.cssText = ''
  delete document.documentElement.__themeVars
}

describe('Paper/Ink theme registration (C-41 T-001)', () => {
  beforeEach(() => {
    cleanDocument()
    localStorage.clear()
  })

  // Vitest resolves `*.css?inline` to an empty string, so CSS content is
  // pinned from the files on disk and the import wiring from the source;
  // the runtime effects of addThemeStyle (dark class, color-scheme, cache)
  // are asserted on the live DOM.
  it('themeColor exports paper and ink factories that bundle the Prism companions', async () => {
    const themeColor = await import('@/util/themeColor')
    expect(typeof themeColor.paper).toBe('function')
    expect(typeof themeColor.ink).toBe('function')
    const src = readFileSync(resolve(ROOT, 'src/renderer/src/util/themeColor.js'), 'utf-8')
    for (const t of ['paper', 'ink']) {
      expect(src).toContain(`../assets/themes/${t}.theme.css?inline`)
      expect(src).toContain(`../assets/themes/prismjs/${t}.theme.css?inline`)
      expect(readFileSync(resolve(ROOT, `src/renderer/src/assets/themes/prismjs/${t}.theme.css`), 'utf-8')).toContain('.token.keyword')
    }
    const paperCss = readFileSync(resolve(ROOT, 'src/renderer/src/assets/themes/paper.theme.css'), 'utf-8')
    const inkCss = readFileSync(resolve(ROOT, 'src/renderer/src/assets/themes/ink.theme.css'), 'utf-8')
    expect(paperCss).toContain('Paper theme')
    expect(paperCss).toContain('--themeColor: #9A6F00')
    expect(inkCss).toContain('Ink theme')
    expect(inkCss).toContain('--themeColor: #FFCF1A')
  })

  it('addThemeStyle applies Paper as a light theme', async () => {
    const { addThemeStyle } = await import('@/util/theme')
    addThemeStyle('paper')
    expect(document.querySelector('#ag-theme')).not.toBeNull()
    expect(document.body.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(localStorage.getItem('mark-cached-theme')).toBe('paper')
  })

  it('addThemeStyle applies Ink with the dark classification', async () => {
    const { addThemeStyle } = await import('@/util/theme')
    addThemeStyle('ink')
    // ink ∈ railscastsThemes → body.dark + color-scheme: dark (dark CodeMirror).
    expect(document.body.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('classifies ink as dark and paper as light; pairs them', async () => {
    const { isDarkTheme, themePairs, railscastsThemes, DEFAULT_STYLE } = await import('@/config')
    expect(isDarkTheme('ink')).toBe(true)
    expect(isDarkTheme('paper')).toBe(false)
    expect(railscastsThemes).toContain('ink')
    expect(themePairs.paper).toBe('ink')
    expect(themePairs.ink).toBe('paper')
    // The boot-fallback default follows the brand light theme.
    expect(DEFAULT_STYLE.theme).toBe('paper')
  })

  it('lists Paper and Ink in the Settings theme picker', async () => {
    const { themes } = await import('@/prefComponents/theme/config')
    const names = themes.map((t) => t.name)
    expect(names).toContain('paper')
    expect(names).toContain('ink')
  })

  it('registers Paper and Ink in the command palette theme list (and the native menu mirrors it)', async () => {
    const commandsSrc = readFileSync(
      resolve(ROOT, 'src/renderer/src/commands/index.js'),
      'utf-8'
    )
    const menuSrc = readFileSync(resolve(ROOT, 'src-tauri/src/m009_menu.rs'), 'utf-8')
    expect(commandsSrc).toContain(`id: 'window.change-theme-paper', description: 'Paper', value: 'paper'`)
    expect(commandsSrc).toContain(`id: 'window.change-theme-ink', description: 'Ink', value: 'ink'`)
    // menu-consistency requires every palette id to exist in the native menu.
    expect(menuSrc).toContain('"window.change-theme-paper", "Paper"')
    expect(menuSrc).toContain('"window.change-theme-ink", "Ink"')
  })
})

describe('Theme defaults and stored preferences (C-41 T-001)', () => {
  beforeEach(() => {
    setupTestPinia()
  })

  it('a fresh profile defaults to Auto with paper/ink members', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    expect(store.followSystemTheme).toBe(true)
    expect(store.lightModeTheme).toBe('paper')
    expect(store.darkModeTheme).toBe('ink')
    expect(store.theme).toBe('paper')
  })

  it('schema.json documents the same defaults', () => {
    const schema = JSON.parse(
      readFileSync(
        resolve(ROOT, 'src/renderer/src/_shims/preferences/schema.json'),
        'utf-8'
      )
    )
    expect(schema.theme.default).toBe('paper')
    expect(schema.followSystemTheme.default).toBe(true)
    expect(schema.lightModeTheme.default).toBe('paper')
    expect(schema.darkModeTheme.default).toBe('ink')
  })

  it('a stored manual theme (nord, followSystemTheme=false) survives hydration untouched', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const { effectiveTheme } = await import('@/util/autoTheme')
    const store = usePreferencesStore()
    // Simulate the boot hydration payload of an existing user.
    store.SET_USER_PREFERENCE({
      theme: 'nord',
      followSystemTheme: false,
      lightModeTheme: 'light',
      darkModeTheme: 'dark'
    })
    expect(store.theme).toBe('nord')
    expect(store.followSystemTheme).toBe(false)
    expect(effectiveTheme(store)).toBe('nord')
  })

  it('a stored Auto profile resolves to the mode member, not the stale stored theme', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const { effectiveTheme } = await import('@/util/autoTheme')
    const store = usePreferencesStore()
    store.SET_USER_PREFERENCE({
      theme: 'nord',
      followSystemTheme: true,
      lightModeTheme: 'paper',
      darkModeTheme: 'ink'
    })
    // jsdom reports a light OS appearance; Auto must resolve the member.
    expect(effectiveTheme(store)).toBe('paper')
  })

  it('hydration without theme keys (fresh preferences.json) keeps the defaults', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    store.SET_USER_PREFERENCE({ language: 'ru' })
    expect(store.theme).toBe('paper')
    expect(store.followSystemTheme).toBe(true)
  })
})

describe('Settings theme page exposes the Auto controls (C-41 T-001)', () => {
  it('shows followSystemTheme and the light/dark member selects (no v-if="false" hiding)', () => {
    const sfc = readSfc()
    expect(sfc).not.toContain('v-if="false"')
    expect(sfc).toContain('START_BLOCK_SELECT_THEME_CARD')
    expect(sfc).toMatch(/<compound v-if="followSystemTheme">/)
  })
})
