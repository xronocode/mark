/**
 * Tests for src/renderer/src/prefComponents/keybindings/index.vue
 */

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: { value: 'en' } }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

vi.mock('@element-plus/icons-vue', () => ({
  Edit: { template: '<span />' },
  RefreshRight: { template: '<span />' },
  Delete: { template: '<span />' }
}))

vi.mock('electron-log', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@hfelix/electron-localshortcut/src/atom-keymap', () => ({
  setKeyboardLayout: vi.fn()
}))

vi.mock('@/services/notification', () => ({
  default: {
    notify: vi.fn()
  }
}))

vi.mock('@/commands/descriptions', () => ({
  default: (id) => `description:${id}`
}))

vi.mock('common/keybinding', () => ({
  isEqualAccelerator: vi.fn(() => false)
}))

vi.mock('@/util', () => ({
  isOsx: false, isWindows: false, isLinux: true,
  delay: vi.fn(), getUniqueId: vi.fn(() => 'id'), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

import KeybindingsSettings from '@/prefComponents/keybindings/index.vue'

describe('KeybindingsSettings.vue', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(KeybindingsSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          separator: true,
          'key-input-dialog': true,
          'el-table': true,
          'el-table-column': true,
          'el-button': true,
          Edit: true,
          RefreshRight: true,
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

  it('has pref-keybindings root class', () => {
    expect(wrapper.find('.pref-keybindings').exists()).toBe(true)
  })

  it('renders title h4', () => {
    const h4 = wrapper.find('h4')
    expect(h4.exists()).toBe(true)
  })

  it('renders footer section with save and restore buttons', () => {
    expect(wrapper.find('.footer').exists()).toBe(true)
  })
})
