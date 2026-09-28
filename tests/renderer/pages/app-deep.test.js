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
  let pinia, bus, AppPage, _wrapper

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default

    window.marktext = {
      initialState: null,
      env: { type: 'editor', windowId: 1, debug: false, paths: { userDataPath: '/tmp/mt-test' } }
    }

    AppPage = (await import('@/pages/app.vue')).default
  })

  afterEach(() => {
    if (_wrapper) {
      _wrapper.unmount()
      _wrapper = null
    }
  })

  const mountComponent = () => {
    _wrapper = shallowMount(AppPage, {
      global: {
        plugins: [pinia, i18n],
        stubs: makeStubs()
      }
    })
    return _wrapper
  }

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

  describe('ctrl+wheel font-size handler (C-15 Phase W QA)', () => {
    const flush = () => new Promise(r => setTimeout(r, 0))
    const settleDebounce = () => new Promise(r => setTimeout(r, 220))

    const fireWheel = (deltaY, ctrlKey = true) => {
      const evt = new WheelEvent('wheel', { deltaY, ctrlKey, bubbles: true, cancelable: true })
      document.dispatchEvent(evt)
      return evt.defaultPrevented
    }

    it('increases fontSize on negative deltaY (zoom-in gesture)', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16

      mountComponent()
      await flush()

      expect(fireWheel(-20)).toBe(true)
      expect(prefStore.fontSize).toBe(17)
    })

    it('decreases fontSize on positive deltaY (zoom-out gesture)', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16

      mountComponent()
      await flush()

      fireWheel(20)
      expect(prefStore.fontSize).toBe(15)
    })

    it('ignores wheel events without ctrlKey', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16

      mountComponent()
      await flush()

      expect(fireWheel(-20, false)).toBe(false)
      expect(prefStore.fontSize).toBe(16)
    })

    it('does not grow past FONT_SIZE_MAX (36)', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 36

      mountComponent()
      await flush()

      fireWheel(-20)
      expect(prefStore.fontSize).toBe(36)
    })

    it('does not shrink past FONT_SIZE_MIN (12)', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 12

      mountComponent()
      await flush()

      fireWheel(20)
      expect(prefStore.fontSize).toBe(12)
    })

    it('accumulates delta below threshold without changing fontSize', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16

      mountComponent()
      await flush()

      fireWheel(-5)
      expect(prefStore.fontSize).toBe(16)
    })

    it('persists the final fontSize once, after the debounce', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16
      const persistSpy = vi.spyOn(prefStore, 'SET_SINGLE_PREFERENCE')

      mountComponent()
      await flush()

      fireWheel(-20)
      fireWheel(-20)
      fireWheel(-20)
      expect(prefStore.fontSize).toBe(19)
      expect(persistSpy).not.toHaveBeenCalled()

      await settleDebounce()
      expect(persistSpy).toHaveBeenCalledTimes(1)
      expect(persistSpy).toHaveBeenCalledWith({ type: 'fontSize', value: 19 })
    })
  })

  describe('zoom-keys font-size handler (C-15 Phase W QA)', () => {
    const flush = () => new Promise(r => setTimeout(r, 0))
    const settleDebounce = () => new Promise(r => setTimeout(r, 220))

    const fireKeydown = (key, { metaKey = false, ctrlKey = false } = {}) => {
      const evt = new KeyboardEvent('keydown', {
        key,
        metaKey,
        ctrlKey,
        bubbles: true,
        cancelable: true
      })
      const prevented = { value: false }
      const origPreventDefault = evt.preventDefault.bind(evt)
      Object.defineProperty(evt, 'preventDefault', {
        value: () => { prevented.value = true; origPreventDefault() }
      })
      document.dispatchEvent(evt)
      return prevented.value
    }

    it('increases fontSize on Cmd+= and prevents default', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16

      mountComponent()
      await flush()

      expect(fireKeydown('=', { metaKey: true })).toBe(true)
      expect(prefStore.fontSize).toBe(17)
    })

    it('decreases fontSize on Cmd+-', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16

      mountComponent()
      await flush()

      expect(fireKeydown('-', { metaKey: true })).toBe(true)
      expect(prefStore.fontSize).toBe(15)
    })

    it('resets fontSize to 16 on Cmd+0', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 22

      mountComponent()
      await flush()

      expect(fireKeydown('0', { metaKey: true })).toBe(true)
      expect(prefStore.fontSize).toBe(16)
    })

    it('also handles the plus key and Ctrl variants', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16

      mountComponent()
      await flush()

      expect(fireKeydown('+', { ctrlKey: true })).toBe(true)
      expect(prefStore.fontSize).toBe(17)
      expect(fireKeydown('-', { ctrlKey: true })).toBe(true)
      expect(prefStore.fontSize).toBe(16)
      expect(fireKeydown('0', { ctrlKey: true })).toBe(true)
      expect(prefStore.fontSize).toBe(16)
    })

    it('does NOT prevent or change anything for regular keys', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16

      mountComponent()
      await flush()

      expect(fireKeydown('=', {})).toBe(false)
      expect(fireKeydown('a', { metaKey: true })).toBe(false)
      expect(prefStore.fontSize).toBe(16)
    })

    it('persists key-driven changes after the debounce', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const prefStore = usePreferencesStore()
      prefStore.fontSize = 16
      const persistSpy = vi.spyOn(prefStore, 'SET_SINGLE_PREFERENCE')

      mountComponent()
      await flush()

      fireKeydown('=', { ctrlKey: true })
      fireKeydown('=', { ctrlKey: true })
      expect(prefStore.fontSize).toBe(18)
      await settleDebounce()
      expect(persistSpy).toHaveBeenCalledWith({ type: 'fontSize', value: 18 })
    })
  })

  describe('setupDragDropHandler', () => {
    const flush = () => new Promise(r => setTimeout(r, 0))

    const fireDragover = (types, items = []) => {
      const evt = new Event('dragover', { bubbles: true, cancelable: true })
      evt.dataTransfer = {
        types,
        items,
        dropEffect: '',
        get effectAllowed() { return 'all' }
      }
      evt.preventDefault = vi.fn()
      evt.stopPropagation = vi.fn()
      window.dispatchEvent(evt)
      return evt
    }

    it('ignores dragover with no dataTransfer types', async () => {
      mountComponent()
      await flush()
      bus.emit.mockClear()

      const evt = fireDragover([])

      expect(bus.emit).not.toHaveBeenCalledWith('importDialog', expect.anything())
    })

    it('shows import dialog for non-image file drag', async () => {
      mountComponent()
      await flush()
      bus.emit.mockClear()

      const evt = fireDragover(
        ['Files'],
        [{ type: 'text/plain' }, { type: 'text/plain' }]
      )

      expect(evt.preventDefault).toHaveBeenCalled()
      expect(bus.emit).toHaveBeenCalledWith('importDialog', true)
      expect(evt.dataTransfer.dropEffect).toBe('copy')
    })

    it('sets dropEffect to copy for single image drag', async () => {
      mountComponent()
      await flush()
      bus.emit.mockClear()

      const evt = fireDragover(
        ['Files'],
        [{ type: 'image/png' }]
      )

      expect(evt.dataTransfer.dropEffect).toBe('copy')
    })

    it('stops propagation for non-file drag', async () => {
      mountComponent()
      await flush()
      bus.emit.mockClear()

      const evt = fireDragover(['text/plain'])

      expect(evt.stopPropagation).toHaveBeenCalled()
      expect(evt.dataTransfer.dropEffect).toBe('none')
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

    it('handles addCommonStyle error gracefully', async () => {
      const flush = () => new Promise(r => setTimeout(r, 0))
      const { addCommonStyle } = await import('@/util/theme')
      addCommonStyle.mockImplementation(() => { throw new Error('style-fail') })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mountComponent()
      await flush()

      expect(errorSpy).toHaveBeenCalledWith(
        '[app][addCommonStyle] failed:',
        expect.any(Object),
        expect.any(Error)
      )
      addCommonStyle.mockImplementation(() => {})
      errorSpy.mockRestore()
    })

    it('clears existing timer on repeated drag', async () => {
      const flush = () => new Promise(r => setTimeout(r, 0))
      mountComponent()
      await flush()
      bus.emit.mockClear()

      const fireDrag = () => {
        const evt = new Event('dragover', { bubbles: true, cancelable: true })
        evt.dataTransfer = {
          types: ['Files'],
          items: [{ type: 'text/plain' }, { type: 'text/plain' }],
          dropEffect: ''
        }
        evt.preventDefault = vi.fn()
        window.dispatchEvent(evt)
      }

      fireDrag()
      fireDrag()

      expect(bus.emit).toHaveBeenCalledWith('importDialog', true)
    })

    it('emits importDialog false after timer fires', async () => {
      const flush = () => new Promise(r => setTimeout(r, 0))
      mountComponent()
      await flush()
      bus.emit.mockClear()

      vi.useFakeTimers()

      const evt = new Event('dragover', { bubbles: true, cancelable: true })
      evt.dataTransfer = {
        types: ['Files'],
        items: [{ type: 'text/plain' }, { type: 'text/plain' }],
        dropEffect: ''
      }
      evt.preventDefault = vi.fn()
      window.dispatchEvent(evt)

      vi.advanceTimersByTime(300)

      expect(bus.emit).toHaveBeenCalledWith('importDialog', false)
      vi.useRealTimers()
    })
  })
})
