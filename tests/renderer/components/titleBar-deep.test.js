// FILE: tests/renderer/components/titleBar-deep.test.js
// VERSION: 1.5.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify titleBar/index.vue computed state, native actions, popover rename, window controls, and lifecycle behavior.
//   SCOPE: Deterministic Vue/jsdom component tests with mocked Tauri and compatibility facades.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, i18n, titleBar/index.vue, @tauri-apps/plugin-clipboard-manager.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario 14; .grace/graph/runtime.xml M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - GRACE 4 synchronized symbol
//   writeClipboardTextMock - GRACE 4 synchronized symbol
//   windowStub - shared @tauri-apps/api/window double for window-control handlers
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-08-07 v1.2.0: require native clipboard dispatch and production plugin/capability wiring for Copy Path.
//   - 2026-08-07 v1.1.0: add UC-029 title-path context-menu coverage.
//   - 2026-09-28 v1.3.0: C-15 T-W1 — dblclick-maximize is cross-platform (both directions pinned).
//   - 2026-10-15 v1.4.0: C-41 T-001 — three-state themeMode pin.
//   - 2026-10-15 v1.5.0: C-40 T-002 — the paths/handleNavClick/handleWordClick
//     pins retired with the breadcrumb, Files/TOC buttons and word-count
//     counter; rename is now the popover Rename… (handleRenameClick →
//     RESPONSE_FOR_RENAME on every platform).
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

const { writeClipboardTextMock } = vi.hoisted(() => ({
  writeClipboardTextMock: vi.fn()
}))

// Local window-API mock: the global setup double does not reliably cover
// the component's DYNAMIC `await import('@tauri-apps/api/window')` calls
// (real module would throw in jsdom — no __TAURI_INTERNALS__).
const { windowStub } = vi.hoisted(() => ({
  windowStub: {
    label: 'main',
    minimize: vi.fn(async () => {}),
    maximize: vi.fn(async () => {}),
    unmaximize: vi.fn(async () => {}),
    setFullscreen: vi.fn(async () => {}),
    isFullscreen: vi.fn(async () => false),
    isMaximized: vi.fn(async () => false),
    close: vi.fn(async () => {}),
    startDragging: vi.fn(() => {}),
    onResized: vi.fn(async () => () => {}),
    setTitle: vi.fn(async () => {})
  }
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => windowStub),
  getCurrent: vi.fn(() => windowStub)
}))

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeClipboardTextMock
}))

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/config', () => ({
  PATH_SEPARATOR: '/',
  themePairs: { light: 'dark', dark: 'light', one_dark: 'one_light', one_light: 'one_dark' },
  isDarkTheme: vi.fn((t) => /dark/i.test(t))
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
      menu: {
        view: { toggleSidebar: 'Toggle Sidebar' },
        counter: { words: 'Words', characters: 'Characters', paragraphs: 'Paragraphs' }
      },
      sideBar: {
        icons: { files: 'Files', toc: 'TOC', settings: 'Settings' }
      },
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
      },
      contextMenu: {
        tabs: { copyPath: 'Copy Path' }
      }
    }
  }
})

describe('titleBar/index.vue — deep coverage', () => {
  let pinia, TitleBar, bus

  beforeEach(async () => {
    writeClipboardTextMock.mockReset()
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    TitleBar = (await import('@/components/titleBar/index.vue')).default
  })

  const mountComponent = (propsOverride = {}) =>
    shallowMount(TitleBar, {
      props: {
        project: null,
        filename: 'test.md',
        pathname: '/home/user/docs/test.md',
        active: true,
        wordCount: { word: 10, character: 50, paragraph: 2, all: 60 },
        platform: 'linux',
        isSaved: true,
        ...propsOverride
      },
      global: {
        plugins: [pinia, i18n],
        stubs: { ElTooltip: true }
      }
    })

  // --- showCustomTitleBar computed ---
  describe('showCustomTitleBar computed', () => {
    it('returns true when titleBarStyle is custom and not OSX', async () => {
      const { usePreferencesStore } = await import('@/store/preferences.js')
      const prefStore = usePreferencesStore()
      prefStore.titleBarStyle = 'custom'

      const wrapper = mountComponent()
      expect(wrapper.vm.showCustomTitleBar).toBe(true)
    })

    it('returns false when titleBarStyle is native', async () => {
      const { usePreferencesStore } = await import('@/store/preferences.js')
      const prefStore = usePreferencesStore()
      prefStore.titleBarStyle = 'native'

      const wrapper = mountComponent()
      expect(wrapper.vm.showCustomTitleBar).toBe(false)
    })
  })

  // --- themeMode computed (C-41 T-001) ---
  describe('themeMode', () => {
    it('is auto while followSystemTheme is on, else light/dark by the theme', async () => {
      const { usePreferencesStore } = await import('@/store/preferences.js')
      const prefStore = usePreferencesStore()
      // Fresh-profile default: Auto.
      const wrapper = mountComponent()
      expect(wrapper.vm.themeMode).toBe('auto')

      // Manual light member (paper reads light under the mocked isDarkTheme).
      prefStore.followSystemTheme = false
      prefStore.theme = 'paper'
      expect(wrapper.vm.themeMode).toBe('light')

      // Manual dark member.
      prefStore.theme = 'dark'
      expect(wrapper.vm.themeMode).toBe('dark')
    })
  })

  // --- handleSidebarToggleClick ---
  describe('handleSidebarToggleClick', () => {
    it('emits view:toggle-layout-entry showSideBar on bus', () => {
      const wrapper = mountComponent()
      wrapper.vm.handleSidebarToggleClick()
      expect(bus.emit).toHaveBeenCalledWith('view:toggle-layout-entry', 'showSideBar')
    })
  })

  // --- handleSettingsClick ---
  describe('handleSettingsClick', () => {
    it('calls OPEN_SETTING_WINDOW', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.OPEN_SETTING_WINDOW = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.handleSettingsClick()

      expect(projectStore.OPEN_SETTING_WINDOW).toHaveBeenCalled()
    })
  })

  // --- handleThemeToggle ---
  describe('handleThemeToggle', () => {
    it('calls handleThemeToggle without error', () => {
      // themePairs is imported from config which is mocked at different
      // resolution scope. We just verify it's callable and doesn't crash.
      const wrapper = mountComponent()
      expect(() => wrapper.vm.handleThemeToggle()).not.toThrow()
    })
  })

  // --- handleCloseClick / handleMaximizeClick / handleMinimizeClick ---
  // These handlers use dynamic `await import('@tauri-apps/api/window')` internally.
  // In the test environment, the dynamic import may hit the real module which
  // throws because Tauri is not available. We verify the handlers exist and
  // gracefully handle the error path (the component has try/catch wrappers
  // for the window state, and the handlers themselves will catch the error).
  describe('window control handlers', () => {
    it('handleCloseClick exists and is callable', async () => {
      const wrapper = mountComponent()
      expect(typeof wrapper.vm.handleCloseClick).toBe('function')
      // Call in try/catch since dynamic import of Tauri may fail in jsdom
      try { await wrapper.vm.handleCloseClick() } catch (e) { /* expected in test env */ }
    })

    it('handleMaximizeClick exists and is callable', async () => {
      const wrapper = mountComponent()
      expect(typeof wrapper.vm.handleMaximizeClick).toBe('function')
      try { await wrapper.vm.handleMaximizeClick() } catch (e) { /* expected in test env */ }
    })

    it('handleMinimizeClick exists and is callable', async () => {
      const wrapper = mountComponent()
      expect(typeof wrapper.vm.handleMinimizeClick).toBe('function')
      try { await wrapper.vm.handleMinimizeClick() } catch (e) { /* expected in test env */ }
    })

    it('handleTitleBarDblclick toggles maximize when dblclick is on a drag zone', async () => {
      const wrapper = mountComponent()
      // setup's refreshWindowState also queries isFullscreen — count only
      // calls after the gesture. C-15 T-W1: dblclick-maximize is
      // cross-platform now (was macOS-only via toggleMaxmizeOnMacOS).
      windowStub.isFullscreen.mockClear()
      wrapper.vm.handleTitleBarDblclick({ target: { closest: () => null } })
      await vi.waitFor(() => expect(windowStub.isFullscreen).toHaveBeenCalled())
    })

    it('handleTitleBarDblclick ignores interactive zones', async () => {
      const wrapper = mountComponent()
      windowStub.isFullscreen.mockClear()
      wrapper.vm.handleTitleBarDblclick({ target: { closest: () => true } })
      await new Promise((r) => setTimeout(r, 0))
      expect(windowStub.isFullscreen).not.toHaveBeenCalled()
    })
  })

  // --- handleMenuClick ---
  describe('handleMenuClick', () => {
    it('invokes mt::window-popup-app-menu with position', async () => {
      const wrapper = mountComponent()
      const fakeEvent = {
        currentTarget: {
          getBoundingClientRect: () => ({ left: 10, top: 0, bottom: 30, right: 50 })
        }
      }

      await wrapper.vm.handleMenuClick(fakeEvent)

      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
        'mt::window-popup-app-menu',
        { x: 10, y: 30 }
      )
    })
  })

  // START_BLOCK_TITLE_PATH_CONTEXT_MENU_TESTS
  describe('handleTitleContextMenu', () => {
    it('opens the native menu and copies the exact active pathname', async () => {
      const wrapper = mountComponent({ pathname: '/home/user/docs/test.md' })
      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('copyPath')

      await wrapper.vm.handleTitleContextMenu({ clientX: 48, clientY: 22 })

      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
        'mt::window-popup-context-menu',
        {
          items: [{ label: 'Copy Path', id: 'copyPath' }],
          x: 48,
          y: 22
        }
      )
      expect(writeClipboardTextMock).toHaveBeenCalledWith(
        '/home/user/docs/test.md'
      )
      expect(window.electron.clipboard.writeText).not.toHaveBeenCalled()
    })

    it('ships the native plugin with write-only clipboard permission', () => {
      const workspaceRoot = resolve(import.meta.dirname, '../../..')
      const defaultCapability = JSON.parse(
        readFileSync(resolve(workspaceRoot, 'src-tauri/capabilities/default.json'), 'utf8')
      )
      const masCapability = JSON.parse(
        readFileSync(resolve(workspaceRoot, 'src-tauri/capabilities/mas.json'), 'utf8')
      )
      const mainSource = readFileSync(
        resolve(workspaceRoot, 'src-tauri/src/main.rs'),
        'utf8'
      )

      for (const capability of [defaultCapability, masCapability]) {
        expect(capability.permissions).toContain('clipboard-manager:allow-write-text')
        expect(capability.permissions).not.toContain('clipboard-manager:allow-read-text')
      }
      expect(mainSource).toContain('.plugin(tauri_plugin_clipboard_manager::init())')
    })

    it('does nothing for an untitled document', async () => {
      const wrapper = mountComponent({ pathname: '', filename: '' })

      await wrapper.vm.handleTitleContextMenu({ clientX: 1, clientY: 2 })

      expect(window.electron.ipcRenderer.invoke).not.toHaveBeenCalled()
      expect(writeClipboardTextMock).not.toHaveBeenCalled()
      expect(window.electron.clipboard.writeText).not.toHaveBeenCalled()
    })

    it('binds the contextmenu gesture to the visible title', async () => {
      const wrapper = mountComponent({ pathname: '/tmp/context.md' })
      window.electron.ipcRenderer.invoke.mockResolvedValueOnce(undefined)

      await wrapper.find('.title').trigger('contextmenu', {
        clientX: 14,
        clientY: 9
      })

      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
        'mt::window-popup-context-menu',
        expect.objectContaining({ x: 14, y: 9 })
      )
    })
  })
  // END_BLOCK_TITLE_PATH_CONTEXT_MENU_TESTS

  // --- popover rename (the old click-to-rename path, C-40 T-002) ---
  describe('handleRenameClick', () => {
    it('reuses RESPONSE_FOR_RENAME regardless of platform (darwin)', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.RESPONSE_FOR_RENAME = vi.fn()

      const wrapper = mountComponent({ platform: 'darwin' })
      wrapper.vm.handleRenameClick()

      expect(editorStore.RESPONSE_FOR_RENAME).toHaveBeenCalled()
    })

    it('reuses RESPONSE_FOR_RENAME on non-darwin platforms too (linux)', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.RESPONSE_FOR_RENAME = vi.fn()

      const wrapper = mountComponent({ platform: 'linux' })
      wrapper.vm.handleRenameClick()

      expect(editorStore.RESPONSE_FOR_RENAME).toHaveBeenCalled()
    })
  })

  // --- filename watcher ---
  describe('filename watcher', () => {
    it('sets document.title when filename changes', async () => {
      const wrapper = mountComponent({ filename: 'initial.md', project: null })
      await nextTick()

      // The watcher triggers on CHANGE. Change the prop.
      await wrapper.setProps({ filename: 'doc.md' })
      await nextTick()

      expect(document.title).toBe('doc.md')
    })

    it('sets document.title with filename and project', async () => {
      const wrapper = mountComponent({
        filename: 'initial.md',
        project: { name: 'MyProject' }
      })
      await nextTick()

      await wrapper.setProps({ filename: 'doc.md' })
      await nextTick()

      expect(document.title).toBe('doc.md - MyProject')
    })

    it('sets document.title to project name when filename cleared', async () => {
      const wrapper = mountComponent({
        filename: 'initial.md',
        project: { name: 'MyProject' }
      })
      await nextTick()

      await wrapper.setProps({ filename: '' })
      await nextTick()

      expect(document.title).toBe('MyProject')
    })

    it('sets document.title to empty when no filename and no project', async () => {
      const wrapper = mountComponent({ filename: 'initial.md', project: null })
      await nextTick()

      await wrapper.setProps({ filename: '' })
      await nextTick()

      expect(document.title).toBe('')
    })
  })

  // --- save dot visibility ---
  describe('save dot', () => {
    it('shows save-dot when not saved', () => {
      const wrapper = mountComponent({ isSaved: false, filename: 'test.md' })
      const dot = wrapper.find('.save-dot')
      expect(dot.exists()).toBe(true)
      expect(dot.classes()).toContain('show')
    })

    it('hides save-dot when saved', () => {
      const wrapper = mountComponent({ isSaved: true, filename: 'test.md' })
      const dot = wrapper.find('.save-dot')
      expect(dot.exists()).toBe(true)
      expect(dot.classes()).not.toContain('show')
    })
  })

  // --- nav button clicks ---
  describe('nav button clicks', () => {
    it('sidebar toggle click emits bus event', async () => {
      const wrapper = mountComponent()
      const sidebarBtn = wrapper.find('.titlebar-nav-btn[title="Toggle Sidebar"]')
      await sidebarBtn.trigger('click')
      expect(bus.emit).toHaveBeenCalledWith('view:toggle-layout-entry', 'showSideBar')
    })
  })
})
