import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('electron-log', () => ({
  default: { error: vi.fn(), warn: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('commandPalette/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const CommandPalette = (await import('@/components/commandPalette/index.vue')).default
    const wrapper = shallowMount(CommandPalette, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          Loading: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.command-palette').exists()).toBe(true)
  })

  it('registers bus listeners on mount', async () => {
    const bus = (await import('@/bus')).default
    const CommandPalette = (await import('@/components/commandPalette/index.vue')).default
    shallowMount(CommandPalette, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          Loading: true
        }
      }
    })
    expect(bus.on).toHaveBeenCalledWith('show-command-palette', expect.any(Function))
    expect(bus.on).toHaveBeenCalledWith('language-changed', expect.any(Function))
  })
})
