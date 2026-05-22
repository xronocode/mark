/**
 * Deep tests for src/renderer/src/prefComponents/markdown/index.vue
 *
 * Targets: onSelectChange for all markdown settings, store bindings for
 * all storeToRefs properties, config options, rendering.
 */

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@/util', () => ({
  isOsx: false, isWindows: false, isLinux: true,
  delay: vi.fn(), getUniqueId: vi.fn(() => 'id'), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import MarkdownSettings from '@/prefComponents/markdown/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const globalStubs = {
  compound: true,
  'cur-select': true,
  bool: true
}

describe('MarkdownSettings.vue – deep tests', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(MarkdownSettings, {
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

  it('onSelectChange dispatches for preferLooseListItem', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('preferLooseListItem', false)
    expect(spy).toHaveBeenCalledWith({ type: 'preferLooseListItem', value: false })
  })

  it('onSelectChange dispatches for bulletListMarker', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('bulletListMarker', '*')
    expect(spy).toHaveBeenCalledWith({ type: 'bulletListMarker', value: '*' })
  })

  it('onSelectChange dispatches for orderListDelimiter', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('orderListDelimiter', ')')
    expect(spy).toHaveBeenCalledWith({ type: 'orderListDelimiter', value: ')' })
  })

  it('onSelectChange dispatches for preferHeadingStyle', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('preferHeadingStyle', 'setext')
    expect(spy).toHaveBeenCalledWith({ type: 'preferHeadingStyle', value: 'setext' })
  })

  it('onSelectChange dispatches for listIndentation', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('listIndentation', 'tab')
    expect(spy).toHaveBeenCalledWith({ type: 'listIndentation', value: 'tab' })
  })

  it('onSelectChange dispatches for frontmatterType', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('frontmatterType', '+')
    expect(spy).toHaveBeenCalledWith({ type: 'frontmatterType', value: '+' })
  })

  it('onSelectChange dispatches for superSubScript', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('superSubScript', true)
    expect(spy).toHaveBeenCalledWith({ type: 'superSubScript', value: true })
  })

  it('onSelectChange dispatches for footnote', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('footnote', true)
    expect(spy).toHaveBeenCalledWith({ type: 'footnote', value: true })
  })

  it('onSelectChange dispatches for isHtmlEnabled', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('isHtmlEnabled', false)
    expect(spy).toHaveBeenCalledWith({ type: 'isHtmlEnabled', value: false })
  })

  it('onSelectChange dispatches for isGitlabCompatibilityEnabled', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('isGitlabCompatibilityEnabled', true)
    expect(spy).toHaveBeenCalledWith({ type: 'isGitlabCompatibilityEnabled', value: true })
  })

  it('onSelectChange dispatches for sequenceTheme', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('sequenceTheme', 'simple')
    expect(spy).toHaveBeenCalledWith({ type: 'sequenceTheme', value: 'simple' })
  })

  // ── Store bindings ───────────────────────────────────────────────────

  it('reflects preferLooseListItem from store', () => {
    const store = usePreferencesStore()
    store.preferLooseListItem = false
    expect(wrapper.vm.preferLooseListItem).toBe(false)
  })

  it('reflects bulletListMarker from store', () => {
    const store = usePreferencesStore()
    store.bulletListMarker = '*'
    expect(wrapper.vm.bulletListMarker).toBe('*')
  })

  it('reflects orderListDelimiter from store', () => {
    const store = usePreferencesStore()
    store.orderListDelimiter = ')'
    expect(wrapper.vm.orderListDelimiter).toBe(')')
  })

  it('reflects preferHeadingStyle from store', () => {
    const store = usePreferencesStore()
    store.preferHeadingStyle = 'setext'
    expect(wrapper.vm.preferHeadingStyle).toBe('setext')
  })

  it('reflects listIndentation from store', () => {
    const store = usePreferencesStore()
    store.listIndentation = 2
    expect(wrapper.vm.listIndentation).toBe(2)
  })

  it('reflects frontmatterType from store', () => {
    const store = usePreferencesStore()
    store.frontmatterType = '+'
    expect(wrapper.vm.frontmatterType).toBe('+')
  })

  it('reflects superSubScript from store', () => {
    const store = usePreferencesStore()
    store.superSubScript = true
    expect(wrapper.vm.superSubScript).toBe(true)
  })

  it('reflects footnote from store', () => {
    const store = usePreferencesStore()
    store.footnote = true
    expect(wrapper.vm.footnote).toBe(true)
  })

  it('reflects isHtmlEnabled from store', () => {
    const store = usePreferencesStore()
    store.isHtmlEnabled = false
    expect(wrapper.vm.isHtmlEnabled).toBe(false)
  })

  it('reflects isGitlabCompatibilityEnabled from store', () => {
    const store = usePreferencesStore()
    store.isGitlabCompatibilityEnabled = true
    expect(wrapper.vm.isGitlabCompatibilityEnabled).toBe(true)
  })

  it('reflects sequenceTheme from store', () => {
    const store = usePreferencesStore()
    store.sequenceTheme = 'simple'
    expect(wrapper.vm.sequenceTheme).toBe('simple')
  })

  // ── Rendering ────────────────────────────────────────────────────────

  it('renders pref-markdown container', () => {
    expect(wrapper.find('.pref-markdown').exists()).toBe(true)
    // The component wraps 5 compound sections
    expect(wrapper.html()).toContain('pref-markdown')
  })

  it('renders the title h4', () => {
    expect(wrapper.find('h4').exists()).toBe(true)
  })

  it('component name is Markdown', () => {
    expect(wrapper.vm.$options.name).toBe('Markdown')
  })
})
