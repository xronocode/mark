// FILE: tests/renderer/components/titleBar-osx.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the macOS titlebar variant — no Settings gear (the app menu owns Settings), no hamburger, traffic-light nav shift.
//   SCOPE: Vue/jsdom component tests with @/util mocked to darwin (C-38 N1) plus an SFC source pin for the isOsx gate.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, i18n, titleBar/index.vue.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-37; .grace/changes/active/C-38 T-001.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - shared vue-i18n instance for component mounts
//   ROOT - repo root resolver for the SFC source pin
//   mountOsx - mount titleBar with the darwin platform fixture
//   readSfc - read the titleBar SFC source for the v-if gate pin
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 N1 — pin the macOS variant: the Settings gear
//     is hidden (Mark › Settings… ⌘, in the app menu is the entry), the
//     hamburger stays hidden (native menu bar), and the nav keeps 4 buttons.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  PATH_SEPARATOR: '/',
  themePairs: { light: 'dark', dark: 'light' },
  isDarkTheme: vi.fn(() => true)
}))

vi.mock('@/util', () => ({
  isOsx: true,
  isWindows: false,
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

const ROOT = resolve(__dirname, '..', '..', '..')
const readSfc = () =>
  readFileSync(resolve(ROOT, 'src/renderer/src/components/titleBar/index.vue'), 'utf-8')

describe('titleBar/index.vue — macOS variant (C-38 N1)', () => {
  let pinia, TitleBar

  beforeEach(async () => {
    pinia = setupTestPinia()
    TitleBar = (await import('@/components/titleBar/index.vue')).default
  })

  const mountOsx = (propsOverride = {}) =>
    shallowMount(TitleBar, {
      props: {
        project: null,
        filename: 'notes.md',
        pathname: '/Users/user/Documents/notes.md',
        active: true,
        wordCount: { word: 1, character: 1, paragraph: 1, all: 1 },
        platform: 'darwin',
        isSaved: true,
        ...propsOverride
      },
      global: {
        plugins: [pinia, i18n],
        stubs: { ElTooltip: true }
      }
    })

  it('hides the Settings gear — Mark › Settings… ⌘, is the macOS entry', () => {
    const wrapper = mountOsx()
    expect(wrapper.find('.titlebar-nav-btn[title="Settings"]').exists()).toBe(false)
  })

  it('renders the 4-button nav (sidebar toggle, Files, TOC, theme) with the traffic-light shift', () => {
    const wrapper = mountOsx()
    const nav = wrapper.find('.titlebar-nav')
    expect(nav.exists()).toBe(true)
    expect(nav.classes()).toContain('titlebar-nav--osx')
    // No gear (C-38 N1) and no hamburger (the native menu bar owns both).
    expect(nav.findAll('.titlebar-nav-btn').length).toBe(4)
    expect(nav.find('.titlebar-nav-menu').exists()).toBe(false)
    expect(nav.find('.titlebar-nav-btn[title="Toggle Sidebar"]').exists()).toBe(true)
    expect(nav.find('.titlebar-nav-btn[title="Files"]').exists()).toBe(true)
    expect(nav.find('.titlebar-nav-btn[title="TOC"]').exists()).toBe(true)
  })

  it('gates the gear with the isOsx flag in the SFC source', () => {
    const sfc = readSfc()
    expect(sfc).toMatch(
      /v-if="!isOsx"[\s\S]*?:title="t\('sideBar\.icons\.settings'\)"/
    )
  })
})
