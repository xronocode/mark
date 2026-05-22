/**
 * Tests for src/renderer/src/prefComponents/image/index.vue
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

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<span />' }
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

import ImageSettings from '@/prefComponents/image/index.vue'

describe('ImageSettings.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(ImageSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          CurSelect: true,
          Separator: true,
          Uploader: true,
          FolderSetting: true,
          'el-tooltip': true,
          InfoFilled: true
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

  it('has pref-image root class', () => {
    expect(wrapper.find('.pref-image').exists()).toBe(true)
  })

  it('renders the image ctrl section', () => {
    expect(wrapper.find('.image-ctrl').exists()).toBe(true)
  })
})
