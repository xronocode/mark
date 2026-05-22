/**
 * Tests for editorWithTabs/editor.vue
 *
 * This component is extremely heavy (Muya, CodeMirror, SpellChecker).
 * We mock all heavy dependencies and verify the component mounts and
 * exposes expected reactive state.
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('electron-log', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}))

vi.mock('muya/lib', () => {
  class MockMuya {
    constructor(el, opts) {
      this.container = el
      this.contentState = { getBlocks: vi.fn(() => []) }
    }
    static use() {}
    on() {}
    off() {}
    destroy() {}
    setFocusMode() {}
    setFont() {}
    setOptions() {}
    setTabSize() {}
    setListIndentation() {}
    hideAllFloatTools() {}
    getSelection() { return { cursorCoords: { y: 0 } } }
    focus() {}
    blur() {}
  }
  return { default: MockMuya }
})

vi.mock('muya/lib/ui/tablePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/quickInsert', () => ({ default: {} }))
vi.mock('muya/lib/ui/codePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/emojiPicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/imagePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/imageSelector', () => ({ default: {} }))
vi.mock('muya/lib/ui/imageToolbar', () => ({ default: {} }))
vi.mock('muya/lib/ui/transformer', () => ({ default: {} }))
vi.mock('muya/lib/ui/formatPicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/linkTools', () => ({ default: {} }))
vi.mock('muya/lib/ui/footnoteTool', () => ({ default: {} }))
vi.mock('muya/lib/ui/tableTools', () => ({ default: {} }))
vi.mock('muya/lib/ui/frontMenu', () => ({ default: {} }))
vi.mock('muya/themes/default.css', () => ({}))
vi.mock('@/assets/themes/codemirror/one-dark.css', () => ({}))
vi.mock('@/assets/icons/close.svg', () => ({ default: { template: '<svg/>' } }))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))
vi.mock('@/services/printService', () => ({
  default: class { renderMarkdown() {} clearup() {} }
}))
vi.mock('@/commands', () => ({
  SpellcheckerLanguageCommand: class {}
}))
vi.mock('@/spellchecker', () => ({
  SpellChecker: class {
    constructor() { this.isEnabled = false; this.lang = 'en' }
    activateSpellchecker() {}
    deactivateSpellchecker() {}
  }
}))
vi.mock('@/util', () => ({
  isOsx: false,
  animatedScrollTo: vi.fn()
}))
vi.mock('@/util/fileSystem', () => ({
  moveImageToFolder: vi.fn(),
  moveToRelativeFolder: vi.fn(),
  uploadImage: vi.fn()
}))
vi.mock('@/util/clipboard', () => ({
  guessClipboardFilePath: vi.fn()
}))
vi.mock('@/util/pdf', () => ({
  getCssForOptions: vi.fn(async () => ''),
  getHtmlToc: vi.fn(() => '')
}))
vi.mock('@/util/theme', () => ({
  addCommonStyle: vi.fn(),
  setEditorWidth: vi.fn(),
  setWrapCodeBlocks: vi.fn()
}))
vi.mock('@/config', () => ({
  DEFAULT_EDITOR_FONT_FAMILY: 'sans-serif'
}))

// Polyfill ResizeObserver for jsdom
globalThis.ResizeObserver = class ResizeObserver {
  constructor(cb) { this._cb = cb }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('editor.vue (editorWithTabs/editor)', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    // Seed editor store with a currentFile
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      filename: 'test.md',
      pathname: '/tmp/test.md',
      markdown: '# Hello',
      isSaved: true,
      cursor: null,
      wordCount: { word: 1, character: 5, paragraph: 1, all: 7 },
      notifications: [],
      searchMatches: null,
      scrollTop: 0
    }
    editorStore.tabs = [editorStore.currentFile]
  })

  it('mounts without errors', async () => {
    const Editor = (await import('@/components/editorWithTabs/editor.vue')).default
    const wrapper = shallowMount(Editor, {
      props: {
        markdown: '# Hello',
        cursor: null,
        textDirection: 'ltr',
        platform: 'darwin'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          ElForm: true,
          ElFormItem: true,
          ElInputNumber: true,
          ElButton: true,
          EditorSearch: true,
          CloseIcon: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.editor-wrapper').exists()).toBe(true)
  })

  it('applies textDirection prop as dir attribute', async () => {
    const Editor = (await import('@/components/editorWithTabs/editor.vue')).default
    const wrapper = shallowMount(Editor, {
      props: {
        markdown: '# Hello',
        cursor: null,
        textDirection: 'rtl',
        platform: 'linux'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          ElForm: true,
          ElFormItem: true,
          ElInputNumber: true,
          ElButton: true,
          EditorSearch: true,
          CloseIcon: true
        }
      }
    })
    expect(wrapper.find('.editor-wrapper').attributes('dir')).toBe('rtl')
  })
})
