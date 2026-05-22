/**
 * Function coverage tests for pages/app.vue
 * Covers: setupDragDropHandler, theme watcher, customCss watcher,
 * zoom watcher, hasCurrentFile computed
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/util/theme', () => ({
  addCommonStyle: vi.fn(),
  addThemeStyle: vi.fn(),
  addCustomStyle: vi.fn(),
  setEditorWidth: vi.fn(),
  setWrapCodeBlocks: vi.fn()
}))
vi.mock('@/config', () => ({
  DEFAULT_STYLE: {},
  DEFAULT_EDITOR_FONT_FAMILY: 'monospace'
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('pages/app.vue — fn coverage', () => {
  let pinia, App, bus, preferencesStore, editorStore, layoutStore, mainStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    const { usePreferencesStore } = await import('@/store/preferences')
    const { useEditorStore } = await import('@/store/editor')
    const { useLayoutStore } = await import('@/store/layout')
    const { useMainStore } = await import('@/store')
    preferencesStore = usePreferencesStore()
    editorStore = useEditorStore()
    layoutStore = useLayoutStore()
    mainStore = useMainStore()
    // Set minimal prefs so app.vue mount doesn't crash
    preferencesStore.theme = 'light'
    preferencesStore.customCss = ''
    preferencesStore.zoom = 1
    preferencesStore.codeFontFamily = 'monospace'
    preferencesStore.codeFontSize = 14
    preferencesStore.hideScrollbar = false
    preferencesStore.sourceCode = false
    preferencesStore.textDirection = 'ltr'
    mainStore.init = false
    mainStore.windowActive = true
    mainStore.platform = 'darwin'
    editorStore.currentFile = {}
    layoutStore.showTabBar = true
    App = (await import('@/pages/app.vue')).default
  })

  const stubs = {
    SideBar: true, TitleBar: true, Recent: true, EditorWithTabs: true,
    CommandPalette: true, AboutDialog: true, ExportSettingDialog: true,
    Rename: true, Tweet: true, ImportModal: true
  }

  const mount = () => shallowMount(App, {
    global: { plugins: [pinia, i18n], stubs }
  })

  it('mounts without errors', () => {
    const w = mount()
    expect(w.exists()).toBe(true)
  })

  it('hasCurrentFile returns false when no markdown', () => {
    editorStore.currentFile = {}
    const w = mount()
    expect(w.vm.hasCurrentFile).toBe(false)
  })

  it('hasCurrentFile returns true when markdown exists', async () => {
    editorStore.currentFile = { markdown: '# Hello' }
    const w = mount()
    expect(w.vm.hasCurrentFile).toBe(true)
  })

  it('computed filename returns currentFile.filename', () => {
    editorStore.currentFile = { filename: 'test.md' }
    const w = mount()
    expect(w.vm.filename).toBe('test.md')
  })

  it('computed pathname returns currentFile.pathname', () => {
    editorStore.currentFile = { pathname: '/a/test.md' }
    const w = mount()
    expect(w.vm.pathname).toBe('/a/test.md')
  })

  it('computed isSaved returns currentFile.isSaved', () => {
    editorStore.currentFile = { isSaved: true }
    const w = mount()
    expect(w.vm.isSaved).toBe(true)
  })

  it('theme watcher calls addThemeStyle', async () => {
    const { addThemeStyle } = await import('@/util/theme')
    const w = mount()
    preferencesStore.theme = 'dark'
    await nextTick()
    expect(addThemeStyle).toHaveBeenCalledWith('dark')
  })

  it('customCss watcher calls addCustomStyle', async () => {
    const { addCustomStyle } = await import('@/util/theme')
    const w = mount()
    preferencesStore.customCss = 'body { color: red; }'
    await nextTick()
    expect(addCustomStyle).toHaveBeenCalledWith({ customCss: 'body { color: red; }' })
  })

  it('zoom watcher emits bus event', async () => {
    const w = mount()
    bus.emit.mockClear()
    preferencesStore.zoom = 1.5
    await nextTick()
    expect(bus.emit).toHaveBeenCalledWith('mt::window-zoom', 1.5)
  })
})
