/**
 * Tests for src/renderer/src/prefComponents/image/components/folderSetting/index.vue
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
  isOsx: false, isWindows: false, isLinux: true,
  delay: vi.fn(), getUniqueId: vi.fn(() => 'id'), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import FolderSetting from '@/prefComponents/image/components/folderSetting/index.vue'

describe('FolderSetting.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(FolderSetting, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          bool: true,
          compound: true,
          'text-box': true,
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

  it('has image-folder root class', () => {
    expect(wrapper.find('.image-folder').exists()).toBe(true)
  })

  it('renders h5 title', () => {
    expect(wrapper.find('h5').exists()).toBe(true)
  })
})
