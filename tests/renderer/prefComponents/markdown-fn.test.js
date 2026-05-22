/**
 * Function-coverage tests for src/renderer/src/prefComponents/markdown/index.vue
 *
 * 21 uncovered out of 22. Strategy: mount with functional stubs that
 * call their onChange prop upon mount, exercising each template lambda.
 */

import { mount, shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))
vi.mock('@/util', () => ({
  isOsx: false, delay: vi.fn(), serialize: vi.fn(), merge: vi.fn()
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<span />' }
}))

// Collect all onChange calls from child components
const onChangeCalls = []

// Auto-invoking stubs: call onChange on mount to trigger the lambda
vi.mock('@/prefComponents/common/bool', () => ({
  default: {
    name: 'Bool',
    props: ['description', 'bool', 'onChange', 'more', 'notes'],
    mounted () {
      if (typeof this.onChange === 'function') {
        onChangeCalls.push({ type: 'bool', fn: this.onChange })
        this.onChange(true)
      }
    },
    template: '<div class="bool-stub"></div>'
  }
}))

vi.mock('@/prefComponents/common/select', () => ({
  default: {
    name: 'CurSelect',
    props: ['description', 'value', 'options', 'onChange', 'more', 'disable'],
    mounted () {
      if (typeof this.onChange === 'function') {
        onChangeCalls.push({ type: 'select', fn: this.onChange })
        this.onChange('testVal')
      }
    },
    template: '<div class="select-stub"></div>'
  }
}))

vi.mock('@/prefComponents/common/compound', () => ({
  default: {
    name: 'Compound',
    template: '<div><slot name="head"/><slot name="children"/></div>'
  }
}))

import MarkdownSettings from '@/prefComponents/markdown/index.vue'
import { usePreferencesStore } from '@/store/preferences'

describe('MarkdownSettings – function coverage', () => {
  let wrapper, store

  beforeEach(() => {
    onChangeCalls.length = 0
    setupTestPinia()
    store = usePreferencesStore()
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  it('onSelectChange dispatches to store', () => {
    wrapper = shallowMount(MarkdownSettings, {
      global: { stubs: { compound: true, 'cur-select': true, bool: true } }
    })
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('bulletListMarker', '-')
    expect(spy).toHaveBeenCalledWith({ type: 'bulletListMarker', value: '-' })
  })

  it('exercises all template lambdas by mounting with auto-invoking stubs', () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')

    wrapper = mount(MarkdownSettings)

    // All onChange lambdas were called during mount
    // Bool lambdas: preferLooseListItem, superSubScript, footnote, isHtmlEnabled, isGitlabCompatibilityEnabled
    expect(spy).toHaveBeenCalledWith({ type: 'preferLooseListItem', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'superSubScript', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'footnote', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'isHtmlEnabled', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'isGitlabCompatibilityEnabled', value: true })

    // Select lambdas: bulletListMarker, orderListDelimiter, listIndentation,
    // frontmatterType, sequenceTheme, preferHeadingStyle
    expect(spy).toHaveBeenCalledWith({ type: 'bulletListMarker', value: 'testVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'orderListDelimiter', value: 'testVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'listIndentation', value: 'testVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'frontmatterType', value: 'testVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'sequenceTheme', value: 'testVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'preferHeadingStyle', value: 'testVal' })
  })

  it('renders the component with title', () => {
    wrapper = mount(MarkdownSettings)
    expect(wrapper.find('.pref-markdown').exists()).toBe(true)
    expect(wrapper.find('h4').exists()).toBe(true)
  })
})
