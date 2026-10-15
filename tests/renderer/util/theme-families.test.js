// FILE: tests/renderer/util/theme-families.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-41 T-002 — the 14-family model (THEME_FAMILIES,
//            derived symmetric themePairs, themeFamilyOf), registration of
//            every kept member in themeMap, retirement of the 13 dropped
//            ids everywhere, the retired-id migration map and its
//            application at the store's single load point, and the
//            family-member-per-mode resolution used by the picker.
//   SCOPE: Pure config/util assertions plus a Pinia store hydration test
//            with a mocked Tauri invoke; source pins for the palette and
//            the native View › Theme menu.
//   DEPENDS: Vitest, Pinia test setup, config.js, util/theme.js,
//            util/themeMigration.js, util/autoTheme.js, store/preferences.js.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-48 (C-41 T-002).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root resolver for source pins.
//   RETIRED_IDS - the 13 dropped theme ids (C-41 T-002 plan).
//   SPEC_FAMILY_ORDER - the 14 family ids in spec R-3 order.
//   T003_MEMBERS - the six member ids added by C-41 T-003.
//   readSource - reads a repo file for source-level absence pins.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-41 T-002 initial pins.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
// Family-picker component test doubles (mirrors theme-deep.test.js).
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))
vi.mock('@/util/markdownToHtml', () => ({
  default: vi.fn(async (md) => `<article>${md}</article>`)
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))
vi.mock('@/util', () => ({
  isOsx: false, isWindows: false, isLinux: true,
  delay: vi.fn(), getUniqueId: vi.fn(() => 'id'), serialize: vi.fn(), merge: vi.fn()
}))

const ROOT = resolve(__dirname, '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')

// The 13 retired ids (C-41 T-002 plan): dropped from every list, migrated
// on load.
const RETIRED_IDS = [
  'light', 'dark', 'material-dark', 'rose-pine-moon', 'tokyo-night-storm',
  'ayu-mirage', 'monokai-pro', 'nightfox', 'palenight', 'horizon-dark',
  'synthwave-84', 'cyberdream', 'oxocarbon-dark'
]

// one-light, alucard, nord-light, kanagawa-lotus, graphite-dark, and
// ulysses-dark are registered by C-41 T-003.
const T003_MEMBERS = ['one-light', 'alucard', 'nord-light', 'kanagawa-lotus', 'graphite-dark', 'ulysses-dark']

const SPEC_FAMILY_ORDER = [
  'paper', 'rose-pine', 'catppuccin', 'solarized', 'gruvbox', 'everforest',
  'tokyo-night', 'ayu', 'one', 'dracula', 'nord', 'kanagawa', 'graphite', 'ulysses'
]

describe('THEME_FAMILIES (C-41 T-002)', () => {
  it('exports 14 frozen families in spec R-3 order', async () => {
    const { THEME_FAMILIES } = await import('@/config')
    expect(THEME_FAMILIES).toHaveLength(14)
    expect(THEME_FAMILIES.map((f) => f.id)).toEqual(SPEC_FAMILY_ORDER)
    for (const family of THEME_FAMILIES) {
      expect(Object.isFrozen(family)).toBe(true)
    }
  })

  it('every family has a name and distinct light/dark members', async () => {
    const { THEME_FAMILIES } = await import('@/config')
    for (const family of THEME_FAMILIES) {
      expect(family.name.length).toBeGreaterThan(0)
      expect(family.light).not.toBe(family.dark)
    }
  })

  it('the 28 members are unique and include no retired id', async () => {
    const { THEME_FAMILIES } = await import('@/config')
    const members = THEME_FAMILIES.flatMap((f) => [f.light, f.dark])
    expect(new Set(members).size).toBe(28)
    for (const retired of RETIRED_IDS) {
      expect(members).not.toContain(retired)
    }
  })

  it('themeFamilyOf resolves the family of either member and rejects unknown ids', async () => {
    const { THEME_FAMILIES, themeFamilyOf } = await import('@/config')
    const brand = THEME_FAMILIES[0]
    expect(themeFamilyOf('paper')).toBe(brand)
    expect(themeFamilyOf('ink')).toBe(brand)
    expect(themeFamilyOf('monokai-pro')).toBeUndefined()
    expect(themeFamilyOf(undefined)).toBeUndefined()
  })
})

describe('themePairs stays symmetric and derived (C-41 T-002)', () => {
  it('every member maps to its partner both ways', async () => {
    const { THEME_FAMILIES, themePairs } = await import('@/config')
    expect(Object.isFrozen(themePairs)).toBe(true)
    for (const family of THEME_FAMILIES) {
      expect(themePairs[family.light]).toBe(family.dark)
      expect(themePairs[family.dark]).toBe(family.light)
    }
    expect(Object.keys(themePairs)).toHaveLength(28)
    for (const retired of RETIRED_IDS) {
      expect(themePairs[retired]).toBeUndefined()
    }
  })
})

describe('family members are registered (C-41 T-002)', () => {
  it('every family member is registered in themeMap', async () => {
    const { THEME_FAMILIES } = await import('@/config')
    const { themeMap } = await import('@/util/theme')
    for (const family of THEME_FAMILIES) {
      for (const member of [family.light, family.dark]) {
        expect(typeof themeMap[member], `${member} should be registered`).toBe('function')
      }
    }
  })

  it('themeMap registers only family members — no retired or foreign ids', async () => {
    const { THEME_FAMILIES } = await import('@/config')
    const { themeMap } = await import('@/util/theme')
    const members = new Set(THEME_FAMILIES.flatMap((f) => [f.light, f.dark]))
    for (const id of Object.keys(themeMap)) {
      expect(members.has(id), `${id} should be a family member`).toBe(true)
    }
    for (const retired of RETIRED_IDS) {
      expect(themeMap[retired]).toBeUndefined()
    }
  })

  it('every kept dark member is classified dark; every light member light', async () => {
    const { THEME_FAMILIES, isDarkTheme, railscastsThemes } = await import('@/config')
    expect(railscastsThemes).not.toContain('dark')
    for (const family of THEME_FAMILIES) {
      expect(isDarkTheme(family.light), `${family.light} should be light`).toBe(false)
      expect(isDarkTheme(family.dark), `${family.dark} should be dark`).toBe(true)
    }
  })
})

describe('retired ids are gone from every surface (C-41 T-002)', () => {
  it('the command palette and the native View › Theme menu list no retired id', () => {
    const commandsSrc = readSource('src/renderer/src/commands/index.js')
    const menuSrc = readSource('src-tauri/src/m009_menu.rs')
    for (const retired of RETIRED_IDS) {
      expect(commandsSrc).not.toContain(`window.change-theme-${retired}'`)
      expect(menuSrc).not.toContain(`window.change-theme-${retired}"`)
    }
  })

  it('no locale carries a retired theme name key', () => {
    const locales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
    const retiredNameKeys = [
      'light', 'dark', 'ayuMirage', 'cadmiumDark', 'cadmiumLight', 'cyberdream',
      'horizonDark', 'materialDark', 'monokaiPro', 'nightfox', 'oxocarbonDark',
      'palenight', 'rosePineMoon', 'synthwave84', 'tokyoNightStorm'
    ]
    for (const locale of locales) {
      const table = JSON.parse(readSource(`static/locales/${locale}.json`))
      for (const key of retiredNameKeys) {
        expect(table.menu.theme[key], `${locale}:${key} should be removed`).toBeUndefined()
      }
      // The kept names and the Auto/Light/Dark tooltip keys stay.
      expect(table.menu.theme.paper).toBeTruthy()
      expect(table.menu.theme.ink).toBeTruthy()
      expect(table.menu.theme.auto).toBeTruthy()
    }
  })

  it('the Settings picker lists no retired theme', async () => {
    const { themes } = await import('@/prefComponents/theme/config')
    const names = themes.map((t) => t.name)
    for (const retired of RETIRED_IDS) {
      expect(names).not.toContain(retired)
    }
  })
})

describe('retired-id migration map (C-41 T-002)', () => {
  const EXPECTED_MIGRATIONS = {
    'light': 'paper',
    'dark': 'ink',
    'rose-pine-moon': 'rose-pine',
    'tokyo-night-storm': 'tokyo-night',
    'ayu-mirage': 'ayu-dark',
    'monokai-pro': 'one-dark',
    'material-dark': 'one-dark',
    'nightfox': 'nord',
    'palenight': 'catppuccin-mocha',
    'horizon-dark': 'rose-pine',
    'synthwave-84': 'dracula',
    'cyberdream': 'tokyo-night',
    'oxocarbon-dark': 'graphite-dark'
  }

  it('THEME_MIGRATIONS is the frozen 13-entry plan map', async () => {
    const { THEME_MIGRATIONS } = await import('@/util/themeMigration')
    expect(Object.isFrozen(THEME_MIGRATIONS)).toBe(true)
    expect({ ...THEME_MIGRATIONS }).toEqual(EXPECTED_MIGRATIONS)
  })

  it('every dropped id migrates per the map for all three preference keys', async () => {
    const { migrateThemeId } = await import('@/util/themeMigration')
    for (const [from, to] of Object.entries(EXPECTED_MIGRATIONS)) {
      expect(migrateThemeId(from, 'light')).toBe(to)
      expect(migrateThemeId(from, 'dark')).toBe(to)
    }
  })

  it('unknown ids fall back to paper (light) / ink (dark)', async () => {
    const { migrateThemeId } = await import('@/util/themeMigration')
    expect(migrateThemeId('totally-unknown', 'light')).toBe('paper')
    expect(migrateThemeId('totally-unknown', 'dark')).toBe('ink')
    expect(migrateThemeId('', 'light')).toBe('paper')
    expect(migrateThemeId(undefined, 'dark')).toBe('ink')
  })

  it('valid stored ids are never rewritten', async () => {
    const { migrateThemeId } = await import('@/util/themeMigration')
    for (const valid of ['paper', 'ink', 'nord', 'dracula', 'rose-pine-dawn']) {
      expect(migrateThemeId(valid, 'light')).toBe(valid)
      expect(migrateThemeId(valid, 'dark')).toBe(valid)
    }
    // The six C-41 T-003 members are valid ids.
    for (const pending of T003_MEMBERS) {
      expect(migrateThemeId(pending, 'light')).toBe(pending)
    }
  })

  it('migrateThemePreferences rewrites only the three theme keys that changed', async () => {
    const { migrateThemePreferences } = await import('@/util/themeMigration')
    const preferences = {
      theme: 'monokai-pro',
      lightModeTheme: 'light',
      darkModeTheme: 'dark',
      language: 'ru',
      followSystemTheme: false
    }
    const changed = migrateThemePreferences(preferences)
    expect(changed).toEqual([
      { key: 'theme', from: 'monokai-pro', to: 'one-dark' },
      { key: 'lightModeTheme', from: 'light', to: 'paper' },
      { key: 'darkModeTheme', from: 'dark', to: 'ink' }
    ])
    expect(preferences.theme).toBe('one-dark')
    expect(preferences.lightModeTheme).toBe('paper')
    expect(preferences.darkModeTheme).toBe('ink')
    // Non-theme keys are untouched.
    expect(preferences.language).toBe('ru')
    expect(preferences.followSystemTheme).toBe(false)
  })

  it('migrateThemePreferences reports nothing for a valid payload', async () => {
    const { migrateThemePreferences } = await import('@/util/themeMigration')
    const preferences = { theme: 'ink', lightModeTheme: 'paper', darkModeTheme: 'ink' }
    expect(migrateThemePreferences(preferences)).toEqual([])
    expect(preferences.theme).toBe('ink')
  })
})

describe('store hydration applies the migration once (C-41 T-002)', () => {
  beforeEach(() => {
    setupTestPinia()
  })

  it('ASK_FOR_USER_PREFERENCE migrates retired values and persists each changed key once', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockClear()
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'mt_prefs_get_all') {
        return {
          theme: 'monokai-pro',
          lightModeTheme: 'light',
          darkModeTheme: 'dark',
          followSystemTheme: false
        }
      }
      return null
    })

    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    await store.ASK_FOR_USER_PREFERENCE()

    expect(store.theme).toBe('one-dark')
    expect(store.lightModeTheme).toBe('paper')
    expect(store.darkModeTheme).toBe('ink')
    expect(store.followSystemTheme).toBe(false)

    const persisted = invoke.mock.calls.filter(([cmd]) => cmd === 'mt_prefs_set')
    expect(persisted).toEqual([
      ['mt_prefs_set', { key: 'theme', value: 'one-dark' }],
      ['mt_prefs_set', { key: 'lightModeTheme', value: 'paper' }],
      ['mt_prefs_set', { key: 'darkModeTheme', value: 'ink' }]
    ])
  })

  it('a valid stored profile is hydrated untouched and persists nothing', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockClear()
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'mt_prefs_get_all') {
        return { theme: 'nord', lightModeTheme: 'paper', darkModeTheme: 'ink', followSystemTheme: false }
      }
      return null
    })

    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    await store.ASK_FOR_USER_PREFERENCE()

    expect(store.theme).toBe('nord')
    expect(store.lightModeTheme).toBe('paper')
    expect(store.darkModeTheme).toBe('ink')
    expect(invoke.mock.calls.filter(([cmd]) => cmd === 'mt_prefs_set')).toEqual([])
  })
})

describe('family member per mode (C-41 T-002 picker)', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  const installMatchMediaStub = (initialDark) => {
    let dark = initialDark
    window.matchMedia = vi.fn(() => ({
      media: '(prefers-color-scheme: dark)',
      get matches () { return dark }
    }))
  }

  it('Light mode picks the light member, Dark mode the dark member', async () => {
    const { familyMemberForMode } = await import('@/util/autoTheme')
    const family = { light: 'rose-pine-dawn', dark: 'rose-pine' }
    expect(familyMemberForMode(family, 'light')).toBe('rose-pine-dawn')
    expect(familyMemberForMode(family, 'dark')).toBe('rose-pine')
  })

  it('Auto mode resolves via the current system appearance', async () => {
    const { familyMemberForMode } = await import('@/util/autoTheme')
    const family = { light: 'catppuccin-latte', dark: 'catppuccin-mocha' }
    installMatchMediaStub(false)
    expect(familyMemberForMode(family, 'auto')).toBe('catppuccin-latte')
    installMatchMediaStub(true)
    expect(familyMemberForMode(family, 'auto')).toBe('catppuccin-mocha')
  })

  it('picking a family in manual Dark mode applies the dark member and stays manual', async () => {
    const { shallowMount, flushPromises } = await import('@vue/test-utils')
    const { default: ThemeSettings } = await import('@/prefComponents/theme/index.vue')
    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    store.SET_SINGLE_PREFERENCE = vi.fn()
    store.followSystemTheme = false
    store.theme = 'nord'
    const wrapper = shallowMount(ThemeSettings, {
      global: { stubs: { separator: true, Bool: true, 'cur-select': true, compound: true, 'el-button': true } }
    })
    await flushPromises()
    await wrapper.findAll('.theme-family')[3].trigger('click') // solarized family
    const calls = store.SET_SINGLE_PREFERENCE.mock.calls.map(([a]) => a)
    expect(calls).toContainEqual({ type: 'theme', value: 'solarized-dark' })
    expect(calls.find((c) => c.type === 'followSystemTheme')).toBeUndefined()
    wrapper.unmount()
  })

  it('picking a family persists both members and the member for the current mode', async () => {
    installMatchMediaStub(false) // light OS; the previous test left a dark stub
    const { shallowMount, flushPromises } = await import('@vue/test-utils')
    const { default: ThemeSettings } = await import('@/prefComponents/theme/index.vue')
    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    store.SET_SINGLE_PREFERENCE = vi.fn()
    // Explicit Auto + light theme: earlier tests in this file mutate the shared store.
    store.followSystemTheme = true
    store.theme = 'paper'

    const wrapper = shallowMount(ThemeSettings, {
      global: {
        stubs: {
          separator: true,
          Bool: true,
          'cur-select': true,
          compound: true,
          'el-button': true
        }
      }
    })
    await flushPromises()

    // Auto mode (store default followSystemTheme=true) on a light OS
    // (jsdom reports light): picking a family applies the light member and
    // never leaves Auto.
    const tile = wrapper.findAll('.theme-family')[2] // catppuccin family
    await tile.trigger('click')
    const calls = store.SET_SINGLE_PREFERENCE.mock.calls.map(([a]) => a)
    expect(calls).toContainEqual({ type: 'lightModeTheme', value: 'catppuccin-latte' })
    expect(calls).toContainEqual({ type: 'darkModeTheme', value: 'catppuccin-mocha' })
    expect(calls).toContainEqual({ type: 'theme', value: 'catppuccin-latte' })
    expect(calls.find((c) => c.type === 'followSystemTheme')).toBeUndefined()
    wrapper.unmount()
  })
})
