/**
 * Function-coverage tests for src/renderer/src/prefComponents/editor/index.vue
 *
 * 32 uncovered functions out of 33. These are the setup function,
 * onSelectChange, each template lambda, and config generator calls.
 *
 * Strategy: mock child components with auto-invoking stubs that call their
 * onChange prop on mount, exercising every template lambda.
 */

import { mount, shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))
vi.mock('common/encoding', () => ({
  ENCODING_NAME_MAP: Object.freeze({ utf8: 'UTF-8', gbk: 'GBK' })
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))
vi.mock('@/util', () => ({
  isOsx: false, isWindows: false, isLinux: true,
  delay: vi.fn(), getUniqueId: vi.fn(() => 'id'), serialize: vi.fn(), merge: vi.fn()
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<span />' }
}))

// Auto-invoking stubs
vi.mock('@/prefComponents/common/compound/index.vue', () => ({
  default: {
    name: 'Compound',
    template: '<div><slot name="head"/><slot name="children"/></div>'
  }
}))

vi.mock('@/prefComponents/common/fontTextBox/index.vue', () => ({
  default: {
    name: 'FontTextBox',
    props: ['description', 'value', 'onChange', 'onlyMonospace'],
    mounted () {
      if (typeof this.onChange === 'function') this.onChange('TestFont')
    },
    template: '<div></div>'
  }
}))

vi.mock('@/prefComponents/common/range/index.vue', () => ({
  default: {
    name: 'Range',
    props: ['description', 'value', 'min', 'max', 'unit', 'step', 'onChange'],
    mounted () {
      if (typeof this.onChange === 'function') this.onChange(42)
    },
    template: '<div></div>'
  }
}))

vi.mock('@/prefComponents/common/select/index.vue', () => ({
  default: {
    name: 'CurSelect',
    props: ['description', 'value', 'options', 'onChange', 'disable'],
    mounted () {
      if (typeof this.onChange === 'function') this.onChange('selVal')
    },
    template: '<div></div>'
  }
}))

vi.mock('@/prefComponents/common/bool/index.vue', () => ({
  default: {
    name: 'Bool',
    props: ['description', 'bool', 'onChange', 'more'],
    mounted () {
      if (typeof this.onChange === 'function') this.onChange(true)
    },
    template: '<div></div>'
  }
}))

vi.mock('@/prefComponents/common/textBox/index.vue', () => ({
  default: {
    name: 'TextBox',
    props: ['description', 'notes', 'input', 'regexValidator', 'onChange'],
    mounted () {
      if (typeof this.onChange === 'function') this.onChange('80ch')
    },
    template: '<div></div>'
  }
}))

import EditorSettings from '@/prefComponents/editor/index.vue'
import { usePreferencesStore } from '@/store/preferences'

describe('EditorSettings – function coverage', () => {
  let wrapper, store

  beforeEach(() => {
    setupTestPinia()
    store = usePreferencesStore()
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  it('onSelectChange dispatches to store', () => {
    wrapper = shallowMount(EditorSettings, {
      global: { stubs: { compound: true, 'font-text-box': true, range: true, 'cur-select': true, bool: true, 'text-box': true } }
    })
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('fontSize', 18)
    expect(spy).toHaveBeenCalledWith({ type: 'fontSize', value: 18 })
  })

  it('exercises all template lambdas via auto-invoking stubs', () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper = mount(EditorSettings)

    // Range lambdas: fontSize, lineHeight, codeFontSize
    expect(spy).toHaveBeenCalledWith({ type: 'fontSize', value: 42 })
    expect(spy).toHaveBeenCalledWith({ type: 'lineHeight', value: 42 })
    expect(spy).toHaveBeenCalledWith({ type: 'codeFontSize', value: 42 })

    // FontTextBox lambdas: editorFontFamily, codeFontFamily
    expect(spy).toHaveBeenCalledWith({ type: 'editorFontFamily', value: 'TestFont' })
    expect(spy).toHaveBeenCalledWith({ type: 'codeFontFamily', value: 'TestFont' })

    // TextBox lambda: editorLineWidth
    expect(spy).toHaveBeenCalledWith({ type: 'editorLineWidth', value: '80ch' })

    // Bool lambdas: codeBlockLineNumbers, trimUnnecessaryCodeBlockEmptyLines,
    // autoPairBracket, autoPairMarkdownSyntax, autoPairQuote,
    // autoGuessEncoding, autoNormalizeLineEndings,
    // hideQuickInsertHint, hideLinkPopup, autoCheck, wrapCodeBlocks
    expect(spy).toHaveBeenCalledWith({ type: 'codeBlockLineNumbers', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'trimUnnecessaryCodeBlockEmptyLines', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'autoPairBracket', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'autoPairMarkdownSyntax', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'autoPairQuote', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'autoGuessEncoding', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'autoNormalizeLineEndings', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'hideQuickInsertHint', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'hideLinkPopup', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'autoCheck', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'wrapCodeBlocks', value: true })

    // Select lambdas: tabSize, endOfLine, defaultEncoding, trimTrailingNewline, textDirection
    expect(spy).toHaveBeenCalledWith({ type: 'tabSize', value: 'selVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'endOfLine', value: 'selVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'defaultEncoding', value: 'selVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'trimTrailingNewline', value: 'selVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'textDirection', value: 'selVal' })
  })

  it('renders the editor settings container', () => {
    wrapper = mount(EditorSettings)
    expect(wrapper.find('.pref-editor').exists()).toBe(true)
    expect(wrapper.find('h4').exists()).toBe(true)
  })
})
