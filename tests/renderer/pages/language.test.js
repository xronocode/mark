/**
 * Tests for src/renderer/src/prefComponents/language/index.vue
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

import LanguageSettings from '@/prefComponents/language/index.vue'

describe('LanguageSettings.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(LanguageSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          compound: true,
          'cur-select': true
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

  it('has pref-language root class', () => {
    expect(wrapper.find('.pref-language').exists()).toBe(true)
  })

  it('renders title h4', () => {
    const h4 = wrapper.find('h4')
    expect(h4.exists()).toBe(true)
  })
})
