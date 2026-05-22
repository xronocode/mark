import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('../../assets/images/logo.png', () => ({
  default: 'logo.png'
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('about/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const About = (await import('@/components/about/index.vue')).default
    const wrapper = shallowMount(About, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          ElRow: true,
          ElCol: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.about-dialog').exists()).toBe(true)
  })

  it('registers aboutDialog bus listener', async () => {
    const bus = (await import('@/bus')).default
    const About = (await import('@/components/about/index.vue')).default
    shallowMount(About, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          ElRow: true,
          ElCol: true
        }
      }
    })
    expect(bus.on).toHaveBeenCalledWith('aboutDialog', expect.any(Function))
  })
})
