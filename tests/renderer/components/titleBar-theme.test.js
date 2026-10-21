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
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-40 T-002: the theme button moved to
//   the .titlebar-right cluster (guide «?» / theme / Share) and its icons
//   come from the redrawn chrome set (auto = circle r6 + fill wedge,
//   light = circle r2.8 + rays, dark = stroke-only crescent); the cycle,
//   tooltip and persisted writes are unchanged from v1.0.0 (C-41 T-001).
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
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
        guide: 'Mark Guide',
        documentInfo: 'Document info',
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
        // ChromeIcon must render for real: iconKind reads circle/path d.
        stubs: { ElTooltip: true, ChromeIcon: false }
      }
    })

  // Amendment 3 (C-WINDOWS-TITLEBAR-ALIGNMENT): the theme button rides
  // the caption row as the 4th cell (.frameless-titlebar-theme), not the
  // right cluster.
  const themeButton = (wrapper, mode) =>
    wrapper.find(`.frameless-titlebar-theme[title="Theme: ${mode}"]`)

  // C-40 T-002 redrawn chrome icons: auto = circle r6 + filled wedge,
  // light = circle r2.8 + ray path, dark = a single stroke-only crescent.
  const iconKind = (wrapper) => {
    const btn = wrapper.find('.frameless-titlebar-theme')
    const circles = btn.findAll('circle')
    if (circles.length > 0) {
      return circles[0].attributes('r') === '6' ? 'auto' : 'light'
    }
    const d = btn.find('path').attributes('d') || ''
    if (d.startsWith('M13.6 9.6')) return 'dark'
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

  it('rides the caption row as the 4th cell (amendment 3), right cluster = Share only', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.frameless-titlebar-theme').exists()).toBe(true)
    // Linux frameless right cluster after amendment 3: Share only (the
    // guide button is gone; theme moved next to the window controls).
    const rightBtns = wrapper.findAll('.titlebar-right .titlebar-nav-btn')
    expect(rightBtns.length).toBe(1)
    expect(rightBtns[0].attributes('title')).toBe('Share')
  })
})
