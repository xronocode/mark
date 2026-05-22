import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('dom-autoscroller', () => ({
  default: vi.fn(() => ({ down: false, destroy: vi.fn() }))
}))

vi.mock('dragula', () => ({
  default: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    dragging: false
  }))
}))

vi.mock('../../contextMenu/tabs', () => ({
  showContextMenu: vi.fn()
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('tabs.vue', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      filename: 'test.md',
      pathname: '/tmp/test.md',
      isSaved: true
    }
    editorStore.tabs = [editorStore.currentFile]
  })

  it('mounts and renders tab list', async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    const wrapper = shallowMount(Tabs, {
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.editor-tabs').exists()).toBe(true)
    // Should render one tab
    const items = wrapper.findAll('li')
    expect(items.length).toBe(1)
    expect(items[0].text()).toContain('test.md')
  })

  it('marks current tab as active', async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    const wrapper = shallowMount(Tabs, {
      global: {
        plugins: [pinia, i18n]
      }
    })
    const active = wrapper.find('li.active')
    expect(active.exists()).toBe(true)
  })

  it('has a new-file button', async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    const wrapper = shallowMount(Tabs, {
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.new-file').exists()).toBe(true)
  })
})
