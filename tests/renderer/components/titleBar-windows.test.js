// FILE: tests/renderer/components/titleBar-windows.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the Windows titlebar layout — forced custom style, window-controls cluster, unshifted nav.
//   SCOPE: Vue/jsdom component tests with @/util mocked to win32 (C-15 T-W1).
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, i18n, titleBar/index.vue.
//   LINKS: .grace/verification/features.xml V-M-011 (scenario: windows titlebar variant); .grace/changes/archive/C-15 T-W1.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - GRACE 4 synchronized symbol
//   ROOT - repo root for source pins.
//   readSfc - reads the titleBar SFC source.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-28 v1.0.0: C-15 T-W1 — pin the Windows variant: decorations are
//     unconditionally off (tauri.windows.conf.json), so effectiveTitleBarStyle
//     is always 'custom' and the min/max/close cluster renders even when the
//     stored preference says 'native'.
//   - 2026-09-28 v1.1.0: C-15 Phase W QA — hamburger moved into titlebar-nav
//     (first button), share/word-count cluster is .titlebar-aux--custom;
//     regression-pins that no .left-toolbar cluster stacks over the nav.
//   - 2026-10-15 v1.2.0: C-38 N1 — pin that the Settings gear STAYS in the
//     Win/Linux frameless titlebar (macOS hides it; titleBar-osx.test.js).
//   - 2026-10-15 v1.3.0: C-40 T-002 — the trimmed bar: left = menu +
//     sidebar + settings, right cluster is .titlebar-right (guide «?» +
//     theme + share) left of the window controls; the breadcrumb path is
//     gone; the «?» guide button and the Explorer reveal label are pinned.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
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

const ROOT = resolve(__dirname, '..', '..', '..')
const readSfc = () =>
  readFileSync(resolve(ROOT, 'src/renderer/src/components/titleBar/index.vue'), 'utf-8')

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
        themeMode: { auto: 'Theme: Auto', light: 'Theme: Light', dark: 'Theme: Dark' },
        popover: {
          words: 'words',
          characters: 'characters',
          lines: 'lines',
          reading: 'reading',
          minutes: '{count} min',
          rename: 'Rename…',
          edited: 'edited {time}'
        }
      },
      recent: {
        showInFinder: 'Show in Finder',
        showInExplorer: 'Show in Explorer',
        showInFolder: 'Show in folder',
        copyPath: 'Copy path'
      }
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
    // C-40 T-002: the left cluster keeps the hamburger + sidebar toggle +
    // Settings gear (3 buttons — the Files and TOC buttons are gone).
    const nav = wrapper.find('.titlebar-nav')
    expect(nav.exists()).toBe(true)
    const navButtons = nav.findAll('.titlebar-nav-btn')
    expect(navButtons.length).toBe(3)
    expect(navButtons[0].classes()).toContain('titlebar-nav-menu')
    expect(wrapper.find('.left-toolbar').exists()).toBe(false)
  })

  it('places the right cluster (guide/theme/share) left of the window controls, not over the nav', async () => {
    const wrapper = mountWindows()
    const right = wrapper.find('.titlebar-right')
    expect(right.exists()).toBe(true)
    // C-40 T-002: the right cluster holds «?», theme and Share and sits
    // before the caption buttons (CSS margin clears the 138px cluster).
    expect(right.find('.titlebar-guide-btn').exists()).toBe(true)
    expect(right.find('.titlebar-share-btn').exists()).toBe(true)
    const css = readSfc()
    expect(css).toMatch(/\.title-bar\.frameless:not\(\.isOsx\) \.titlebar-right \{[\s\S]*?margin-right: 146px/)
  })

  it('shows the «?» Mark Guide button that macOS hides (C-40 T-002)', () => {
    const wrapper = mountWindows()
    const guide = wrapper.find('.titlebar-guide-btn')
    expect(guide.exists()).toBe(true)
    expect(guide.attributes('title')).toBe('Mark Guide')
    expect(guide.attributes('aria-label')).toBe('Mark Guide')
  })

  it('labels the popover reveal action for Explorer (per-OS label)', async () => {
    const wrapper = mountWindows()
    expect(wrapper.vm.showInFolderLabel).toBe('Show in Explorer')
  })

  it('hides the Share button when the m048 share capability is off (macOS-only feature)', async () => {
    const { usePreferencesStore } = await import('@/store/preferences.js')
    const prefStore = usePreferencesStore()
    prefStore.buildCapabilities = { ...prefStore.buildCapabilities, share: false }

    const wrapper = mountWindows()
    expect(wrapper.find('.titlebar-share-btn').exists()).toBe(false)
  })

  it('does not apply the macOS traffic-light shift to the nav cluster', () => {
    const wrapper = mountWindows()
    expect(wrapper.find('.titlebar-nav').classes()).not.toContain('titlebar-nav--osx')
  })

  it('keeps the Settings gear reachable in the frameless titlebar (C-38 N1)', () => {
    const wrapper = mountWindows()
    // macOS hides the gear (app menu owns Settings there); Win/Linux must
    // keep a titlebar entry — pinned here so the gate never over-reach.
    expect(wrapper.find('.titlebar-nav-btn[title="Settings"]').exists()).toBe(true)
  })

  it('derives the popover folder from the Windows path separator (C-40 T-002)', () => {
    const wrapper = mountWindows({ pathname: 'C:\\Users\\user\\Documents\\notes.md' })
    // CONFIG PATH_SEPARATOR is mocked '\\' here; the folder is the dirname
    // (home abbreviations never match a drive-letter prefix).
    expect(wrapper.vm.folderLabel).toBe('C:\\Users\\user\\Documents')
  })
})
