/**
 * Deep tests for src/renderer/src/prefComponents/editor/index.vue
 *
 * Targets: onSelectChange for all editor settings, store bindings for
 * all storeToRefs properties, config options, and all rendering paths.
 */

import { shallowMount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('common/encoding', () => ({
  ENCODING_NAME_MAP: Object.freeze({
    utf8: 'UTF-8',
    gbk: 'GBK',
    'iso-8859-1': 'ISO-8859-1'
  })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

vi.mock('@/util', () => ({
  isOsx: false,
  isWindows: false,
  isLinux: true,
  delay: vi.fn(),
  getUniqueId: vi.fn(() => 'test-id'),
  serialize: vi.fn(),
  merge: vi.fn()
}))

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() }
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

import EditorSettings from '@/prefComponents/editor/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const globalStubs = {
  compound: true,
  'font-text-box': true,
  range: true,
  'cur-select': true,
  bool: true,
  'text-box': true
}

describe('EditorSettings.vue – deep tests', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(EditorSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: globalStubs
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  // ── onSelectChange ───────────────────────────────────────────────────

  it('onSelectChange dispatches SET_SINGLE_PREFERENCE for fontSize', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('fontSize', 18)
    expect(spy).toHaveBeenCalledWith({ type: 'fontSize', value: 18 })
  })

  it('onSelectChange dispatches for lineHeight', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('lineHeight', 1.8)
    expect(spy).toHaveBeenCalledWith({ type: 'lineHeight', value: 1.8 })
  })

  it('onSelectChange dispatches for editorFontFamily', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('editorFontFamily', 'Menlo')
    expect(spy).toHaveBeenCalledWith({ type: 'editorFontFamily', value: 'Menlo' })
  })

  it('onSelectChange dispatches for codeFontSize', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('codeFontSize', 16)
    expect(spy).toHaveBeenCalledWith({ type: 'codeFontSize', value: 16 })
  })

  it('onSelectChange dispatches for codeFontFamily', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('codeFontFamily', 'Fira Code')
    expect(spy).toHaveBeenCalledWith({ type: 'codeFontFamily', value: 'Fira Code' })
  })

  it('onSelectChange dispatches for autoPairBracket', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('autoPairBracket', false)
    expect(spy).toHaveBeenCalledWith({ type: 'autoPairBracket', value: false })
  })

  it('onSelectChange dispatches for autoPairMarkdownSyntax', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('autoPairMarkdownSyntax', false)
    expect(spy).toHaveBeenCalledWith({ type: 'autoPairMarkdownSyntax', value: false })
  })

  it('onSelectChange dispatches for autoPairQuote', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('autoPairQuote', false)
    expect(spy).toHaveBeenCalledWith({ type: 'autoPairQuote', value: false })
  })

  it('onSelectChange dispatches for tabSize', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('tabSize', 2)
    expect(spy).toHaveBeenCalledWith({ type: 'tabSize', value: 2 })
  })

  it('onSelectChange dispatches for endOfLine', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('endOfLine', 'lf')
    expect(spy).toHaveBeenCalledWith({ type: 'endOfLine', value: 'lf' })
  })

  it('onSelectChange dispatches for textDirection', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('textDirection', 'rtl')
    expect(spy).toHaveBeenCalledWith({ type: 'textDirection', value: 'rtl' })
  })

  it('onSelectChange dispatches for defaultEncoding', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('defaultEncoding', 'gbk')
    expect(spy).toHaveBeenCalledWith({ type: 'defaultEncoding', value: 'gbk' })
  })

  it('onSelectChange dispatches for autoGuessEncoding', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('autoGuessEncoding', false)
    expect(spy).toHaveBeenCalledWith({ type: 'autoGuessEncoding', value: false })
  })

  it('onSelectChange dispatches for trimTrailingNewline', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('trimTrailingNewline', 1)
    expect(spy).toHaveBeenCalledWith({ type: 'trimTrailingNewline', value: 1 })
  })

  it('onSelectChange dispatches for hideQuickInsertHint', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('hideQuickInsertHint', true)
    expect(spy).toHaveBeenCalledWith({ type: 'hideQuickInsertHint', value: true })
  })

  it('onSelectChange dispatches for hideLinkPopup', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('hideLinkPopup', true)
    expect(spy).toHaveBeenCalledWith({ type: 'hideLinkPopup', value: true })
  })

  it('onSelectChange dispatches for autoCheck', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('autoCheck', true)
    expect(spy).toHaveBeenCalledWith({ type: 'autoCheck', value: true })
  })

  it('onSelectChange dispatches for wrapCodeBlocks', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('wrapCodeBlocks', false)
    expect(spy).toHaveBeenCalledWith({ type: 'wrapCodeBlocks', value: false })
  })

  it('onSelectChange dispatches for editorLineWidth', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('editorLineWidth', '80ch')
    expect(spy).toHaveBeenCalledWith({ type: 'editorLineWidth', value: '80ch' })
  })

  it('onSelectChange dispatches for trimUnnecessaryCodeBlockEmptyLines', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('trimUnnecessaryCodeBlockEmptyLines', false)
    expect(spy).toHaveBeenCalledWith({ type: 'trimUnnecessaryCodeBlockEmptyLines', value: false })
  })

  it('onSelectChange dispatches for autoNormalizeLineEndings', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('autoNormalizeLineEndings', true)
    expect(spy).toHaveBeenCalledWith({ type: 'autoNormalizeLineEndings', value: true })
  })

  it('onSelectChange dispatches for codeBlockLineNumbers', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('codeBlockLineNumbers', false)
    expect(spy).toHaveBeenCalledWith({ type: 'codeBlockLineNumbers', value: false })
  })

  // ── Store bindings ───────────────────────────────────────────────────

  it('reflects store fontSize value', () => {
    const store = usePreferencesStore()
    store.fontSize = 20
    expect(wrapper.vm.fontSize).toBe(20)
  })

  it('reflects store lineHeight value', () => {
    const store = usePreferencesStore()
    store.lineHeight = 1.8
    expect(wrapper.vm.lineHeight).toBe(1.8)
  })

  it('reflects store editorFontFamily value', () => {
    const store = usePreferencesStore()
    store.editorFontFamily = 'Georgia'
    expect(wrapper.vm.editorFontFamily).toBe('Georgia')
  })

  it('reflects store codeFontSize value', () => {
    const store = usePreferencesStore()
    store.codeFontSize = 16
    expect(wrapper.vm.codeFontSize).toBe(16)
  })

  it('reflects store tabSize value', () => {
    const store = usePreferencesStore()
    store.tabSize = 2
    expect(wrapper.vm.tabSize).toBe(2)
  })

  it('reflects store endOfLine value', () => {
    const store = usePreferencesStore()
    store.endOfLine = 'crlf'
    expect(wrapper.vm.endOfLine).toBe('crlf')
  })

  it('reflects store textDirection value', () => {
    const store = usePreferencesStore()
    store.textDirection = 'rtl'
    expect(wrapper.vm.textDirection).toBe('rtl')
  })

  // ── Rendering ────────────────────────────────────────────────────────

  it('renders all 5 compound sections', () => {
    const compounds = wrapper.findAllComponents({ name: 'compound' })
    expect(compounds.length).toBe(5)
  })

  it('renders the title', () => {
    expect(wrapper.find('h4').exists()).toBe(true)
  })
})
