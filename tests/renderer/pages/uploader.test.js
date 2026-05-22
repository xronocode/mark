/**
 * Tests for src/renderer/src/prefComponents/image/components/uploader/index.vue
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

vi.mock('@/util/fileSystem', () => ({
  isFileExecutable: vi.fn(async () => false)
}))

vi.mock('@/services/notification', () => ({
  default: {
    notify: vi.fn()
  }
}))

vi.mock('@/util', () => ({
  isOsx: false, isWindows: false, isLinux: true,
  delay: vi.fn(), getUniqueId: vi.fn(() => 'id'), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

import UploaderSettings from '@/prefComponents/image/components/uploader/index.vue'

describe('UploaderSettings.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(UploaderSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          'cur-select': true,
          'legal-notices-checkbox': true,
          'el-button': true,
          'el-input': true,
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

  it('has pref-image-uploader root class', () => {
    expect(wrapper.find('.pref-image-uploader').exists()).toBe(true)
  })

  it('renders h5 title', () => {
    expect(wrapper.find('h5').exists()).toBe(true)
  })

  it('renders current uploader section', () => {
    expect(wrapper.find('.current-uploader').exists()).toBe(true)
  })
})
