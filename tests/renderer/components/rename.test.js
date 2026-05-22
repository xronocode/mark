import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('rename/index.vue', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      filename: 'test.md',
      pathname: '/tmp/test.md'
    }
  })

  it('mounts without errors', async () => {
    const Rename = (await import('@/components/rename/index.vue')).default
    const wrapper = shallowMount(Rename, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.rename').exists()).toBe(true)
  })

  it('registers rename bus listener', async () => {
    const bus = (await import('@/bus')).default
    const Rename = (await import('@/components/rename/index.vue')).default
    shallowMount(Rename, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true
        }
      }
    })
    expect(bus.on).toHaveBeenCalledWith('rename', expect.any(Function))
  })
})
