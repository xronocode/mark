import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/toc.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const Toc = (await import('@/components/sideBar/toc.vue')).default
    const wrapper = shallowMount(Toc, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTree: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.side-bar-toc').exists()).toBe(true)
  })

  it('renders el-tree when toc has items', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.toc = [
      { label: 'Heading 1', slug: 'heading-1', children: [] }
    ]

    const Toc = (await import('@/components/sideBar/toc.vue')).default
    const wrapper = shallowMount(Toc, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTree: true
        }
      }
    })
    expect(wrapper.findComponent({ name: 'ElTree' }).exists()).toBe(true)
  })
})
