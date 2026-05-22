import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/codeMirror', () => {
  const cm = vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    getCursor: vi.fn(() => ({ line: 0, ch: 0 })),
    getLine: vi.fn(() => ''),
    setSelection: vi.fn(),
    hasFocus: vi.fn(() => false),
    execCommand: vi.fn()
  }))
  return {
    default: cm,
    setMode: vi.fn(),
    setCursorAtFirstLine: vi.fn(),
    setTextDirection: vi.fn()
  }
})

vi.mock('muya/lib/utils', () => ({
  debounce: (fn) => fn,
  wordCount: vi.fn(() => ({ word: 0, character: 0, paragraph: 0 }))
}))

vi.mock('@/util', () => ({
  adjustCursor: vi.fn((cursor) => cursor),
  isOsx: false,
  isWindows: false,
  isLinux: true,
  animatedScrollTo: vi.fn()
}))

vi.mock('@/config', () => ({
  oneDarkThemes: ['dark'],
  railscastsThemes: []
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sourceCode.vue', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      filename: 'test.md',
      pathname: '/tmp/test.md',
      markdown: '# Hello',
      isSaved: true,
      scrollTop: undefined,
      blocks: undefined,
      cursor: undefined
    }
    editorStore.tabs = [editorStore.currentFile]
  })

  it('mounts without errors', async () => {
    const SourceCode = (await import('@/components/editorWithTabs/sourceCode.vue')).default
    const wrapper = shallowMount(SourceCode, {
      props: {
        markdown: '# Hello',
        muyaIndexCursor: null,
        textDirection: 'ltr'
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.source-code').exists()).toBe(true)
  })
})
