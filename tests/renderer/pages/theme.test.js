/**
 * Tests for src/renderer/src/prefComponents/theme/index.vue
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

vi.mock('@/util/markdownToHtml', () => ({
  default: vi.fn(async () => '<article>mock html</article>')
}))

vi.mock('./theme.md?raw', () => ({
  default: '# {theme}'
}))

vi.mock('@/util', () => ({
  isOsx: false, isWindows: false, isLinux: true,
  delay: vi.fn(), getUniqueId: vi.fn(() => 'id'), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import ThemeSettings from '@/prefComponents/theme/index.vue'

describe('ThemeSettings.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(ThemeSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          separator: true,
          Bool: true,
          'cur-select': true,
          compound: true,
          'el-button': true
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

  it('has pref-theme root class', () => {
    expect(wrapper.find('.pref-theme').exists()).toBe(true)
  })

  it('renders title h4', () => {
    const h4 = wrapper.find('h4')
    expect(h4.exists()).toBe(true)
  })

  it('renders official themes section', () => {
    expect(wrapper.find('.offcial-themes').exists()).toBe(true)
  })

  it('renders custom CSS textarea', () => {
    expect(wrapper.find('textarea').exists()).toBe(true)
  })
})
