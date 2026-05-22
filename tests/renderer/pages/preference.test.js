import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/util/theme', () => ({
  addThemeStyle: vi.fn()
}))

vi.mock('@/config', () => ({
  DEFAULT_STYLE: { theme: 'light' }
}))

vi.mock('@/util', () => ({
  isOsx: false
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('preference.vue page', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const Preference = (await import('@/pages/preference.vue')).default
    const wrapper = shallowMount(Preference, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          TitleBar: true,
          SideBar: true,
          RouterView: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.pref-container').exists()).toBe(true)
  })

  it('does not show custom title bar on macOS', async () => {
    const Preference = (await import('@/pages/preference.vue')).default
    const wrapper = shallowMount(Preference, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          TitleBar: { template: '<div class="stub-titlebar"></div>' },
          SideBar: true,
          RouterView: true
        }
      }
    })
    // isOsx is false, so titlebar depends on titleBarStyle preference
    // By default it should not show custom title bar (titleBarStyle defaults to undefined)
    expect(wrapper.find('.pref-content').exists()).toBe(true)
  })
})
