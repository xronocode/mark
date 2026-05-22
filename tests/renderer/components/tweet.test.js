import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('tweet/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const Tweet = (await import('@/components/tweet/index.vue')).default
    const wrapper = shallowMount(Tweet, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.tweet-dialog').exists()).toBe(true)
  })

  it('registers tweetDialog bus listener', async () => {
    const bus = (await import('@/bus')).default
    const Tweet = (await import('@/components/tweet/index.vue')).default
    shallowMount(Tweet, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true
        }
      }
    })
    expect(bus.on).toHaveBeenCalledWith('tweetDialog', expect.any(Function))
  })
})
