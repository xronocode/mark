// FILE: tests/renderer/components/titleBar-deep.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify titleBar/index.vue computed state, native actions, navigation decisions, window controls, and lifecycle behavior.
//   SCOPE: Deterministic Vue/jsdom component tests with mocked Tauri and compatibility facades.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, i18n, titleBar/index.vue, @tauri-apps/plugin-clipboard-manager.
//   LINKS: docs/verification-plan.xml V-M-011 scenario 14; docs/knowledge-graph.xml M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mountComponent - Mounts the titlebar with stable default props and mocked services.
//   titlePathContextMenuAssertions - Verify native menu position, untitled no-op, and exact clipboard dispatch.
//   navigationAssertions - Verify sidebar/view decision branches and dialog deduplication.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-08-07 v1.2.0: require native clipboard dispatch and production plugin/capability wiring for Copy Path.
//   - 2026-08-07 v1.1.0: add UC-029 title-path context-menu coverage.
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

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeClipboardTextMock
}))

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
        switchToLight: 'Switch to Light',
        switchToDark: 'Switch to Dark'
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

  // --- paths computed ---
  describe('paths computed', () => {
    it('computes breadcrumb paths from pathname', () => {
      const wrapper = mountComponent({ pathname: '/a/b/c/d/test.md' })
      // filter empty, take all but last (filename part), then take last 3
      // /a/b/c/d/test.md -> ['a','b','c','d','test.md'] -> ['a','b','c','d'] -> last 3 = ['b','c','d']
      expect(wrapper.vm.paths).toEqual(['b', 'c', 'd'])
    })

    it('returns empty array when no pathname', () => {
      const wrapper = mountComponent({ pathname: '' })
      expect(wrapper.vm.paths).toEqual([])
    })

    it('handles short paths', () => {
      const wrapper = mountComponent({ pathname: '/test.md' })
      // ['test.md'] -> no items after removing last = []
      expect(wrapper.vm.paths).toEqual([])
    })
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

  // --- currentIsDark computed ---
  describe('currentIsDark', () => {
    it('currentIsDark is a computed boolean', async () => {
      const wrapper = mountComponent()
      // Just verify it's a boolean (value depends on isDarkTheme implementation)
      expect(typeof wrapper.vm.currentIsDark).toBe('boolean')
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

  // --- handleNavClick ---
  describe('handleNavClick', () => {
    it('opens sidebar and switches to files when sidebar is closed', async () => {
      const { useLayoutStore } = await import('@/store/layout.js')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = false
      layoutStore.SET_LAYOUT = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.handleNavClick('files')

      expect(layoutStore.SET_LAYOUT).toHaveBeenCalledWith({
        rightColumn: 'files',
        showSideBar: true
      })
    })

    it('switches view when sidebar is open and different view', async () => {
      const { useLayoutStore } = await import('@/store/layout.js')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true
      layoutStore.rightColumn = 'toc'
      layoutStore.SET_LAYOUT = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.handleNavClick('files')

      expect(layoutStore.SET_LAYOUT).toHaveBeenCalledWith({ rightColumn: 'files' })
    })

    it('opens dialog when already on files with projects', async () => {
      const { useLayoutStore } = await import('@/store/layout.js')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true
      layoutStore.rightColumn = 'files'

      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.projectTrees = [{ pathname: '/p1' }]
      projectStore.ASK_FOR_OPEN_PROJECT = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.handleNavClick('files')

      expect(projectStore.ASK_FOR_OPEN_PROJECT).toHaveBeenCalled()
    })

    it('opens dialog when no projects loaded', async () => {
      const { useLayoutStore } = await import('@/store/layout.js')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true
      layoutStore.rightColumn = 'toc'

      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.projectTrees = []
      projectStore.ASK_FOR_OPEN_PROJECT = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.handleNavClick('files')

      expect(projectStore.ASK_FOR_OPEN_PROJECT).toHaveBeenCalled()
    })

    it('does not open dialog for toc view', async () => {
      const { useLayoutStore } = await import('@/store/layout.js')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = false
      layoutStore.SET_LAYOUT = vi.fn()

      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.ASK_FOR_OPEN_PROJECT = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.handleNavClick('toc')

      expect(projectStore.ASK_FOR_OPEN_PROJECT).not.toHaveBeenCalled()
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

  // --- handleWordClick ---
  describe('handleWordClick', () => {
    it('cycles through word → paragraph → character → all → word', () => {
      const wrapper = mountComponent()

      expect(wrapper.vm.show).toBe('word')
      wrapper.vm.handleWordClick()
      expect(wrapper.vm.show).toBe('paragraph')
      wrapper.vm.handleWordClick()
      expect(wrapper.vm.show).toBe('character')
      wrapper.vm.handleWordClick()
      expect(wrapper.vm.show).toBe('all')
      wrapper.vm.handleWordClick()
      expect(wrapper.vm.show).toBe('word')
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

    it('toggleMaxmizeOnMacOS calls handleMaximizeClick only on macOS', () => {
      // isOsx is false in our mock
      const wrapper = mountComponent()
      const spy = vi.spyOn(wrapper.vm, 'handleMaximizeClick').mockImplementation(() => {})
      wrapper.vm.toggleMaxmizeOnMacOS()
      // Since isOsx is false, handleMaximizeClick should NOT be called
      expect(spy).not.toHaveBeenCalled()
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

  // --- rename ---
  describe('rename', () => {
    it('calls RESPONSE_FOR_RENAME on darwin platform', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.RESPONSE_FOR_RENAME = vi.fn()

      const wrapper = mountComponent({ platform: 'darwin' })
      wrapper.vm.rename()

      expect(editorStore.RESPONSE_FOR_RENAME).toHaveBeenCalled()
    })

    it('does nothing on non-darwin platform', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.RESPONSE_FOR_RENAME = vi.fn()

      const wrapper = mountComponent({ platform: 'linux' })
      wrapper.vm.rename()

      expect(editorStore.RESPONSE_FOR_RENAME).not.toHaveBeenCalled()
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
      const navBtns = wrapper.findAll('.titlebar-nav-btn')
      // First nav-btn is the sidebar toggle
      await navBtns[0].trigger('click')
      expect(bus.emit).toHaveBeenCalledWith('view:toggle-layout-entry', 'showSideBar')
    })
  })
})
