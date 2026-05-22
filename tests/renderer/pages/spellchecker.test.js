/**
 * Tests for src/renderer/src/prefComponents/spellchecker/index.vue
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

vi.mock('@element-plus/icons-vue', () => ({
  Delete: { template: '<span />' }
}))

vi.mock('electron-log', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@/util', () => ({
  isOsx: false,
  delay: vi.fn()
}))

vi.mock('@/spellchecker', () => ({
  SpellChecker: {
    getAvailableDictionaries: vi.fn(async () => ['en-US', 'fr-FR'])
  }
}))

vi.mock('@/spellchecker/languageMap', () => ({
  getLanguageName: vi.fn((code) => `Language(${code})`)
}))

vi.mock('@/services/notification', () => ({
  default: {
    notify: vi.fn()
  }
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

import SpellcheckerSettings from '@/prefComponents/spellchecker/index.vue'

describe('SpellcheckerSettings.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(SpellcheckerSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          compound: true,
          'cur-select': true,
          bool: true,
          'el-table': true,
          'el-table-column': true,
          'el-button': true,
          Delete: true
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

  it('has pref-spellchecker root class', () => {
    expect(wrapper.find('.pref-spellchecker').exists()).toBe(true)
  })

  it('renders title h4', () => {
    const h4 = wrapper.find('h4')
    expect(h4.exists()).toBe(true)
  })
})
