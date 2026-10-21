// FILE: tests/renderer/components/titleBar-osx.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the macOS titlebar variant — no Settings gear (the app menu owns Settings), no hamburger, traffic-light nav shift.
//   SCOPE: Vue/jsdom component tests with @/util mocked to darwin (C-38 N1) plus an SFC source pin for the isOsx gate.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, i18n, titleBar/index.vue.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-37; .grace/changes/archive/C-38 T-001.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - shared vue-i18n instance for component mounts
//   ROOT - repo root resolver for the SFC source pin
//   readSfc - read the titleBar SFC source for the v-if gate pin
//   startDraggingMock - spy for getCurrentWindow().startDragging
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.2.0: C-40 T-002 — the trimmed macOS bar: left cluster =
//     the sidebar toggle alone (no menu/gear/Files/TOC), right cluster =
//     theme + Share with NO «?» guide button (Win/Linux only), and the
//     popover reveal label says Finder. The resize-edge pins stay.
//   - 2026-10-15 v1.1.0: resize edge — presses within 6 px of the top/left/
//     right edges no longer start a window drag (top edge resizes again).
//   - 2026-10-15 v1.0.0: C-38 N1 — pin the macOS variant: the Settings gear
//     is hidden (Mark › Settings… ⌘, in the app menu is the entry), the
//     hamburger stays hidden (native menu bar), and the nav keeps 4 buttons.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

const { startDraggingMock } = vi.hoisted(() => ({ startDraggingMock: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => {
  const win = {
    startDragging: startDraggingMock,
    isFullscreen: vi.fn(async () => false),
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async () => () => {}),
    setTitle: vi.fn(async () => {})
  }
  return { getCurrentWindow: vi.fn(() => win), getCurrent: vi.fn(() => win) }
})

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
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

const ROOT = resolve(__dirname, '..', '..', '..')
const readSfc = () =>
  readFileSync(resolve(ROOT, 'src/renderer/src/components/titleBar/index.vue'), 'utf-8')

describe('titleBar/index.vue — macOS variant (C-38 N1)', () => {
  let pinia, TitleBar

  beforeEach(async () => {
    pinia = setupTestPinia()
    TitleBar = (await import('@/components/titleBar/index.vue')).default
  })

  const mountOsx = (propsOverride = {}, extra = {}) =>
    shallowMount(TitleBar, {
      ...extra,
      props: {
        project: null,
        filename: 'notes.md',
        pathname: '/Users/<fixture>/Documents/notes.md',
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

  it('renders the trimmed macOS clusters: sidebar toggle left, theme + Share right (C-40 T-002)', () => {
    const wrapper = mountOsx()
    const nav = wrapper.find('.titlebar-nav')
    expect(nav.exists()).toBe(true)
    expect(nav.classes()).toContain('titlebar-nav--osx')
    // Left: ONLY the sidebar toggle — no hamburger, no gear (C-38 N1), and
    // the Files and TOC buttons left with the C-40 T-002 trim.
    const navButtons = nav.findAll('.titlebar-nav-btn')
    expect(navButtons.length).toBe(1)
    expect(navButtons[0].attributes('title')).toBe('Toggle Sidebar')
    expect(nav.find('.titlebar-nav-menu').exists()).toBe(false)
    // Right: theme + Share only.
    const right = wrapper.findAll('.titlebar-right .titlebar-nav-btn')
    expect(right.length).toBe(2)
    expect(right[0].attributes('title')).toMatch(/^Theme: /)
    expect(right[1].attributes('title')).toBe('Share')
    // The Files and TOC entries are gone from the whole bar.
    expect(wrapper.findAll('.titlebar-nav-btn[title="Files"]').length).toBe(0)
    expect(wrapper.findAll('.titlebar-nav-btn[title="TOC"]').length).toBe(0)
  })

  it('hides the «?» guide button — the macOS entries are Help › Mark Guide and the palette (C-40 T-002)', () => {
    const wrapper = mountOsx()
    expect(wrapper.find('.titlebar-guide-btn').exists()).toBe(false)
    expect(wrapper.findAll('.titlebar-nav-btn[title="Mark Guide"]').length).toBe(0)
  })

  it('labels the popover reveal action for Finder (per-OS label)', () => {
    const wrapper = mountOsx()
    expect(wrapper.vm.showInFolderLabel).toBe('Show in Finder')
  })

  // Resize edge: the transparent title bar starts at the window's top pixel;
  // a press on the top edge or a top corner must reach the native resize
  // instead of starting a window drag.
  const pressOnTitle = (wrapper, clientX, clientY) => {
    const title = wrapper.find('.title').element
    const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX, clientY })
    title.dispatchEvent(evt)
    return evt
  }

  it('drags the window from the title bar away from the edges', () => {
    startDraggingMock.mockClear()
    const wrapper = mountOsx({}, { attachTo: document.body })
    const evt = pressOnTitle(wrapper, 300, 14)
    expect(startDraggingMock).toHaveBeenCalled()
    expect(evt.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('leaves presses on the top edge and the top corners to the native resize', () => {
    startDraggingMock.mockClear()
    const wrapper = mountOsx({}, { attachTo: document.body })
    const right = window.innerWidth
    for (const [x, y] of [[300, 0], [300, 5], [2, 14], [right - 2, 14], [0, 0], [right - 1, 1]]) {
      const evt = pressOnTitle(wrapper, x, y)
      expect(evt.defaultPrevented).toBe(false)
    }
    expect(startDraggingMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the gear gated to Win/Linux in the SFC source (amendment 5)', () => {
    // The gear returned for Win/Linux; the v-if="!isOsx" gate keeps macOS
    // clean (the native app menu owns Settings there).
    const sfc = readSfc()
    expect(sfc).toMatch(/v-if="!isOsx"[\s\S]*?:title="t\('sideBar\.icons\.settings'\)"/)
  })
})
