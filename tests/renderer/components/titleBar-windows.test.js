// FILE: tests/renderer/components/titleBar-windows.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the Windows titlebar layout — forced custom style, window-controls cluster, unshifted nav.
//   SCOPE: Vue/jsdom component tests with @/util mocked to win32 (C-15 T-W1).
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, i18n, titleBar/index.vue.
//   LINKS: .grace/verification/features.xml V-M-011 (scenario: windows titlebar variant); .grace/changes/active/C-15 T-W1.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - GRACE 4 synchronized symbol
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-28 v1.0.0: C-15 T-W1 — pin the Windows variant: decorations are
//     unconditionally off (tauri.windows.conf.json), so effectiveTitleBarStyle
//     is always 'custom' and the min/max/close cluster renders even when the
//     stored preference says 'native'.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/assets/window-controls.js', () => ({
  minimizePath: 'M0,0',
  restorePath: 'M0,0',
  maximizePath: 'M0,0',
  closePath: 'M0,0'
}))

vi.mock('@/config', () => ({
  PATH_SEPARATOR: '\\',
  themePairs: { light: 'dark', dark: 'light' },
  isDarkTheme: vi.fn(() => true)
}))

vi.mock('@/util', () => ({
  isOsx: false,
  isWindows: true,
  isLinux: false,
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
      titleBar: { switchToLight: 'Switch to Light', switchToDark: 'Switch to Dark', share: 'Share' }
    }
  }
})

describe('titleBar/index.vue — Windows variant (C-15 T-W1)', () => {
  let pinia, TitleBar

  beforeEach(async () => {
    pinia = setupTestPinia()
    TitleBar = (await import('@/components/titleBar/index.vue')).default
  })

  const mountWindows = (propsOverride = {}) =>
    shallowMount(TitleBar, {
      props: {
        project: null,
        filename: 'notes.md',
        pathname: 'C:\\Users\\user\\Documents\\notes.md',
        active: true,
        wordCount: { word: 1, character: 1, paragraph: 1, all: 1 },
        platform: 'win32',
        isSaved: true,
        ...propsOverride
      },
      global: {
        plugins: [pinia, i18n],
        stubs: { ElTooltip: true }
      }
    })

  it('forces effectiveTitleBarStyle to custom even when the preference is native', async () => {
    const { usePreferencesStore } = await import('@/store/preferences.js')
    const prefStore = usePreferencesStore()
    prefStore.titleBarStyle = 'native'

    const wrapper = mountWindows()
    expect(wrapper.vm.effectiveTitleBarStyle).toBe('custom')
    expect(wrapper.vm.showCustomTitleBar).toBe(true)
  })

  it('renders the window-controls cluster (min/max/close) and the hamburger menu', async () => {
    const { usePreferencesStore } = await import('@/store/preferences.js')
    const prefStore = usePreferencesStore()
    prefStore.titleBarStyle = 'custom'

    const wrapper = mountWindows()
    // isFullScreen starts false → cluster must be present.
    expect(wrapper.findAll('.frameless-titlebar-button').length).toBe(3)
    expect(wrapper.find('.frameless-titlebar-menu').exists()).toBe(true)
  })

  it('does not apply the macOS traffic-light shift to the nav cluster', () => {
    const wrapper = mountWindows()
    expect(wrapper.find('.titlebar-nav').classes()).not.toContain('titlebar-nav--osx')
  })

  it('splits breadcrumbs with the Windows path separator', () => {
    const wrapper = mountWindows({ pathname: 'C:\\Users\\user\\Documents\\notes.md' })
    // CONFIG PATH_SEPARATOR is mocked '\\' here; the computed splits on it
    // and keeps the last three directory segments.
    expect(wrapper.vm.paths).toEqual(['Users', 'user', 'Documents'])
  })
})
