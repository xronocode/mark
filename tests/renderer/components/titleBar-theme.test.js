// FILE: tests/renderer/components/titleBar-theme.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-41 T-001 title-bar theme button — Auto → Light → Dark cycle order, Avenex icons, localized tooltip/aria-label, and the persisted preference writes.
//   SCOPE: Vue/jsdom component tests over titleBar/index.vue with mocked config/platform and the real preferences store.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, i18n, titleBar/index.vue, @tauri-apps/api/core mock.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-38 (C-41 T-001).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - shared i18n instance carrying the titleBar.themeMode messages.
//   mountBar - mounts the titleBar with standard props and stubs.
//   themeButton - the theme nav button (last in the cluster) for the current mode.
//   iconKind - which Avenex icon the button renders: auto | light | dark.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-41 T-001 initial pins: three-state cycle,
//   icon-per-state, tooltip/aria label, and SET_SINGLE_PREFERENCE payloads.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/assets/window-controls.js', () => ({
  minimizePath: 'M0,0',
  restorePath: 'M0,0',
  maximizePath: 'M0,0',
  closePath: 'M0,0'
}))

// Real classification semantics for the modes under test: ink/dark are the
// dark members, everything else (paper, nord-light-pick…) reads as light.
vi.mock('@/config', () => ({
  PATH_SEPARATOR: '/',
  isDarkTheme: vi.fn((t) => t === 'ink' || t === 'dark')
}))

vi.mock('@/util', () => ({
  isOsx: false,
  isWindows: false,
  isLinux: true,
  animatedScrollTo: vi.fn()
}))

globalThis.__APP_VERSION__ = '2.0.0-test'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      menu: { view: { toggleSidebar: 'Toggle Sidebar' }, counter: { words: 'Words' } },
      sideBar: { icons: { files: 'Files', toc: 'TOC', settings: 'Settings' } },
      titleBar: {
        share: 'Share',
        themeMode: { auto: 'Theme: Auto', light: 'Theme: Light', dark: 'Theme: Dark' }
      }
    }
  }
})

describe('titleBar theme button — Auto/Light/Dark cycle (C-41 T-001)', () => {
  let pinia, TitleBar, prefStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    TitleBar = (await import('@/components/titleBar/index.vue')).default
    const { usePreferencesStore } = await import('@/store/preferences.js')
    prefStore = usePreferencesStore()
  })

  const mountBar = () =>
    shallowMount(TitleBar, {
      props: {
        project: null,
        filename: 'notes.md',
        pathname: '/tmp/notes.md',
        active: true,
        wordCount: null,
        platform: 'linux',
        isSaved: true
      },
      global: {
        plugins: [pinia, i18n],
        stubs: { ElTooltip: true }
      }
    })

  const themeButton = (wrapper, mode) =>
    wrapper.find(`.titlebar-nav-btn[title="Theme: ${mode}"]`)

  const iconKind = (wrapper) => {
    const btn = wrapper.findAll('.titlebar-nav-btn').at(-1)
    if (btn.find('circle').exists()) return 'light'
    const d = btn.find('path').attributes('d') || ''
    if (d.startsWith('M8 1a7')) return 'auto'
    if (d.startsWith('M6.2 1.2')) return 'dark'
    return 'unknown'
  }

  it('fresh profile starts in Auto (followSystemTheme default) with the half-disc icon and localized tooltip', () => {
    const wrapper = mountBar()
    // Fresh-profile defaults: Auto on, paper/ink members.
    expect(prefStore.followSystemTheme).toBe(true)
    const btn = themeButton(wrapper, 'Auto')
    expect(btn.exists()).toBe(true)
    expect(iconKind(wrapper)).toBe('auto')
    expect(btn.attributes('aria-label')).toBe('Theme: Auto')
  })

  it('cycles Auto → Light → Dark → Auto, pinning the mode members and persisting each transition', async () => {
    const wrapper = mountBar()

    // Auto → Light: leave Auto, pin lightModeTheme.
    await themeButton(wrapper, 'Auto').trigger('click')
    expect(prefStore.followSystemTheme).toBe(false)
    expect(prefStore.theme).toBe('paper')
    expect(iconKind(wrapper)).toBe('light')
    expect(themeButton(wrapper, 'Light').attributes('aria-label')).toBe('Theme: Light')

    // Light → Dark: pin darkModeTheme.
    await themeButton(wrapper, 'Light').trigger('click')
    expect(prefStore.followSystemTheme).toBe(false)
    expect(prefStore.theme).toBe('ink')
    expect(iconKind(wrapper)).toBe('dark')

    // Dark → Auto: back to followSystemTheme.
    await themeButton(wrapper, 'Dark').trigger('click')
    expect(prefStore.followSystemTheme).toBe(true)
    expect(iconKind(wrapper)).toBe('auto')
  })

  it('persists the exact preference writes for a full cycle', async () => {
    const wrapper = mountBar()
    await themeButton(wrapper, 'Auto').trigger('click')
    await themeButton(wrapper, 'Light').trigger('click')
    await themeButton(wrapper, 'Dark').trigger('click')

    const themeWrites = invoke.mock.calls.filter(([cmd]) => cmd === 'mt_prefs_set')
    expect(themeWrites).toEqual([
      ['mt_prefs_set', { key: 'followSystemTheme', value: false }],
      ['mt_prefs_set', { key: 'theme', value: 'paper' }],
      ['mt_prefs_set', { key: 'theme', value: 'ink' }],
      ['mt_prefs_set', { key: 'followSystemTheme', value: true }]
    ])
  })

  it('maps a stored manual dark theme (followSystemTheme=false) to the Dark state', () => {
    prefStore.followSystemTheme = false
    prefStore.theme = 'dark'
    const wrapper = mountBar()
    expect(themeButton(wrapper, 'Dark').exists()).toBe(true)
    expect(iconKind(wrapper)).toBe('dark')
  })

  it('maps a stored manual light theme outside the brand pair to the Light state', () => {
    prefStore.followSystemTheme = false
    prefStore.theme = 'nord' // mocked isDarkTheme: nord → light
    const wrapper = mountBar()
    expect(themeButton(wrapper, 'Light').exists()).toBe(true)
    expect(iconKind(wrapper)).toBe('light')
  })

  it('keeps the button as the last member of the nav cluster (same gated spot as the old toggle)', () => {
    const wrapper = mountBar()
    const navBtns = wrapper.findAll('.titlebar-nav-btn')
    // Linux frameless: menu, sidebar, files, toc, settings, theme = 6 —
    // the three-state button replaces the toggle in place.
    expect(navBtns.length).toBe(6)
    expect(navBtns[navBtns.length - 1].attributes('title')).toBe('Theme: Auto')
  })
})
