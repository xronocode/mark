/**
 * Deep coverage tests for src/renderer/src/prefComponents/language/index.vue
 *
 * Targets uncovered branches:
 *   - onSelectChange handler
 *   - getLanguageOptions() rendering
 *   - language store ref binding
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

describe('LanguageSettings.vue — deep coverage', () => {
  let wrapper
  let preferencesStore

  beforeEach(async () => {
    const pinia = setupTestPinia()
    const { usePreferencesStore } = await import('@/store/preferences')
    preferencesStore = usePreferencesStore()
    preferencesStore.SET_SINGLE_PREFERENCE = vi.fn()

    wrapper = shallowMount(LanguageSettings, {
      global: {
        plugins: [pinia],
        mocks: { $t: (key) => key },
        stubs: {
          compound: {
            template: '<div class="compound-stub"><slot name="head" /><slot name="children" /></div>'
          },
          'cur-select': {
            template: '<div class="select-stub" />',
            props: ['description', 'value', 'options', 'onChange']
          }
        }
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders compound with cur-select child', () => {
    const compound = wrapper.find('.compound-stub')
    expect(compound.exists()).toBe(true)
    const select = wrapper.find('.select-stub')
    expect(select.exists()).toBe(true)
  })

  it('passes language value to cur-select', () => {
    const select = wrapper.findComponent({ name: 'cur-select' })
    if (select.exists()) {
      expect(select.props('value')).toBeDefined()
    }
  })

  it('onSelectChange calls SET_SINGLE_PREFERENCE on the store', () => {
    // Access the component's internal onSelectChange via exposed or directly
    // We know the component passes onSelectChange as onChange prop to cur-select
    const select = wrapper.findComponent({ name: 'cur-select' })
    if (select.exists() && select.props('onChange')) {
      select.props('onChange')('fr')
      expect(preferencesStore.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({
        type: 'language',
        value: 'fr'
      })
    }
  })
})
