import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('../../i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('recent/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: {
        plugins: [pinia]
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.recent-files-projects').exists()).toBe(true)
  })

  it('has a new-file button', async () => {
    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: {
        plugins: [pinia]
      }
    })
    expect(wrapper.find('.button-primary').exists()).toBe(true)
  })

  it('calls NEW_UNTITLED_TAB on button click', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: {
        plugins: [pinia]
      }
    })
    const editorStore = useEditorStore()
    editorStore.NEW_UNTITLED_TAB = vi.fn()

    await wrapper.find('.button-primary').trigger('click')
    expect(editorStore.NEW_UNTITLED_TAB).toHaveBeenCalledWith({})
  })
})
