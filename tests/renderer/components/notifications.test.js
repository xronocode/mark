import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('../../i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('notifications.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      notifications: []
    }
    const Notifications = (await import('@/components/editorWithTabs/notifications.vue')).default
    const wrapper = shallowMount(Notifications, {
      global: { plugins: [pinia] }
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('does not render when there are no notifications', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      notifications: []
    }
    const Notifications = (await import('@/components/editorWithTabs/notifications.vue')).default
    const wrapper = shallowMount(Notifications, {
      global: { plugins: [pinia] }
    })
    expect(wrapper.find('.editor-notifications').exists()).toBe(false)
  })

  it('renders notification message when present', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      notifications: [
        { msg: 'File changed on disk', style: 'warn', showConfirm: true, action: vi.fn() }
      ]
    }
    const Notifications = (await import('@/components/editorWithTabs/notifications.vue')).default
    const wrapper = shallowMount(Notifications, {
      global: { plugins: [pinia] }
    })
    expect(wrapper.find('.editor-notifications').exists()).toBe(true)
    expect(wrapper.find('.msg').text()).toBe('File changed on disk')
  })

  it('applies warn class for warning notifications', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      notifications: [
        { msg: 'Warning!', style: 'warn', showConfirm: false, action: vi.fn() }
      ]
    }
    const Notifications = (await import('@/components/editorWithTabs/notifications.vue')).default
    const wrapper = shallowMount(Notifications, {
      global: { plugins: [pinia] }
    })
    expect(wrapper.find('.editor-notifications.warn').exists()).toBe(true)
  })
})
