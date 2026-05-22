/**
 * Tests for src/renderer/src/prefComponents/general/index.vue
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
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

vi.mock('@/util', () => ({
  isOsx: true,
  delay: vi.fn(),
  serialize: vi.fn(),
  merge: vi.fn()
}))

import GeneralSettings from '@/prefComponents/general/index.vue'

describe('GeneralSettings.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(GeneralSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          compound: true,
          range: true,
          'cur-select': true,
          bool: true,
          'text-box': true,
          'el-button': true,
          'el-radio-group': true,
          'el-radio': true
        }
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders without errors', () => {
    expect(wrapper.exists()).toBe(true)
  })

  it('has pref-general root class', () => {
    expect(wrapper.find('.pref-general').exists()).toBe(true)
  })

  it('renders the macOS integration section', () => {
    expect(wrapper.find('.macos-integration').exists()).toBe(true)
  })

  it('renders title h4', () => {
    const h4 = wrapper.find('h4')
    expect(h4.exists()).toBe(true)
  })
})
