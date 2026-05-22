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
  addCustomStyle: vi.fn()
}))

vi.mock('@/config', () => ({
  DEFAULT_STYLE: {
    theme: 'light',
    codeFontFamily: 'monospace',
    codeFontSize: '14px',
    hideScrollbar: false
  }
}))

vi.mock('@/store/tweet', () => ({
  useTweetStore: () => ({ LISTEN_FOR_TWEET: vi.fn() })
}))
vi.mock('@/store/listenForMain', () => ({
  useListenForMainStore: () => ({ LISTEN_FOR_EDIT: vi.fn() })
}))
vi.mock('@/store/commandCenter', () => ({
  useCommandCenterStore: () => ({
    LISTEN_COMMAND_CENTER_BUS: vi.fn(async () => {}),
    rootCommand: {}
  })
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

const makeStubs = () => ({
  SideBar: true,
  TitleBar: true,
  EditorWithTabs: true,
  Recent: true,
  CommandPalette: true,
  AboutDialog: true,
  ExportSettingDialog: true,
  Rename: true,
  Tweet: true,
  ImportModal: true
})

describe('App.vue page — deep coverage', () => {
  let pinia, bus, AppPage

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default

    window.marktext = {
      initialState: null,
      env: { type: 'editor', windowId: 1, debug: false, paths: { userDataPath: '/tmp/mt-test' } }
    }

    AppPage = (await import('@/pages/app.vue')).default
  })

  const mountComponent = () =>
    shallowMount(AppPage, {
      global: {
        plugins: [pinia, i18n],
        stubs: makeStubs()
      }
    })

  describe('computed properties', () => {
    it('hasCurrentFile is true when markdown is defined', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = {
        id: 'tab-1',
        markdown: '# Hello',
        pathname: '/tmp/test.md',
        filename: 'test.md',
        isSaved: true,
        cursor: null,
        wordCount: null,
        muyaIndexCursor: null
      }

      const wrapper = mountComponent()
      expect(wrapper.vm.hasCurrentFile).toBe(true)
    })

    it('hasCurrentFile is false when markdown is undefined', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = { id: 'tab-1' }

      const wrapper = mountComponent()
      expect(wrapper.vm.hasCurrentFile).toBe(false)
    })

    it('pathname computed derives from currentFile', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = { pathname: '/tmp/doc.md' }

      const wrapper = mountComponent()
      expect(wrapper.vm.pathname).toBe('/tmp/doc.md')
    })

    it('filename computed derives from currentFile', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = { filename: 'doc.md' }

      const wrapper = mountComponent()
      expect(wrapper.vm.filename).toBe('doc.md')
    })

    it('isSaved computed derives from currentFile', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = { isSaved: false }

      const wrapper = mountComponent()
      expect(wrapper.vm.isSaved).toBe(false)
    })
  })

  describe('theme watcher', () => {
    it('calls addThemeStyle when theme changes', async () => {
      const { addThemeStyle } = await import('@/util/theme')
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.theme = 'light'

      const wrapper = mountComponent()
      addThemeStyle.mockClear()

      prefStore.theme = 'dark'
      await nextTick()

      expect(addThemeStyle).toHaveBeenCalledWith('dark')
    })

    it('handles theme watcher error', async () => {
      const { addThemeStyle } = await import('@/util/theme')
      addThemeStyle.mockImplementation(() => { throw new Error('fail') })

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.theme = 'light'

      const wrapper = mountComponent()
      addThemeStyle.mockClear()

      prefStore.theme = 'broken-theme'
      await nextTick()

      addThemeStyle.mockImplementation(() => {})
      errorSpy.mockRestore()
    })
  })

  describe('customCss watcher', () => {
    it('calls addCustomStyle when customCss changes', async () => {
      const { addCustomStyle } = await import('@/util/theme')
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.customCss = ''

      const wrapper = mountComponent()
      addCustomStyle.mockClear()

      prefStore.customCss = 'body { color: red; }'
      await nextTick()

      expect(addCustomStyle).toHaveBeenCalledWith({
        customCss: 'body { color: red; }'
      })
    })
  })

  describe('zoom watcher', () => {
    it('emits mt::window-zoom when zoom changes', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.zoom = 1.0

      const wrapper = mountComponent()
      bus.emit.mockClear()

      prefStore.zoom = 1.5
      await nextTick()

      expect(bus.emit).toHaveBeenCalledWith('mt::window-zoom', 1.5)
    })
  })

  describe('conditional rendering', () => {
    it('shows editor-placeholder initially (init is false by default)', async () => {
      const wrapper = mountComponent()
      await nextTick()

      expect(wrapper.find('.editor-placeholder').exists()).toBe(true)
    })

    it('shows editor content when init becomes true', async () => {
      const { useMainStore } = await import('@/store')
      const mainStore = useMainStore()
      // Set init to true before mounting
      mainStore.init = true

      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = {} // no markdown — show Recent

      const wrapper = mountComponent()
      await nextTick()

      // Should not show placeholder
      expect(wrapper.find('.editor-placeholder').exists()).toBe(false)
    })

    it('hides placeholder when init is true', async () => {
      const { useMainStore } = await import('@/store')
      const mainStore = useMainStore()
      mainStore.init = true

      const wrapper = mountComponent()
      await nextTick()

      expect(wrapper.find('.editor-placeholder').exists()).toBe(false)
    })
  })

  describe('onMounted', () => {
    it('hydrates preferences from initialState', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.SET_USER_PREFERENCE = vi.fn()

      window.marktext.initialState = { theme: 'dark', fontSize: 16 }

      mountComponent()
      await nextTick()

      expect(prefStore.SET_USER_PREFERENCE).toHaveBeenCalledWith({ theme: 'dark', fontSize: 16 })
    })

    it('does not call SET_USER_PREFERENCE when no initialState', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.SET_USER_PREFERENCE = vi.fn()

      window.marktext.initialState = null

      mountComponent()
      await nextTick()

      expect(prefStore.SET_USER_PREFERENCE).not.toHaveBeenCalled()
    })
  })
})
