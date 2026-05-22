/**
 * Tests for src/renderer/src/prefComponents/editor/index.vue
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

vi.mock('common/encoding', () => ({
  ENCODING_NAME_MAP: Object.freeze({ utf8: 'UTF-8' })
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

describe('EditorSettings.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(EditorSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          compound: true,
          'font-text-box': true,
          range: true,
          'cur-select': true,
          bool: true,
          'text-box': true
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

  it('has pref-editor root class', () => {
    expect(wrapper.find('.pref-editor').exists()).toBe(true)
  })

  it('renders the title h4', () => {
    const h4 = wrapper.find('h4')
    expect(h4.exists()).toBe(true)
  })

  it('renders multiple compound sections', () => {
    const compounds = wrapper.findAllComponents({ name: 'compound' })
    expect(compounds.length).toBeGreaterThanOrEqual(4)
  })
})
