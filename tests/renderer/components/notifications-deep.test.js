import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { nextTick } from 'vue'

vi.mock('../../i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('notifications.vue — deep coverage', () => {
  let pinia, Notifications

  beforeEach(async () => {
    pinia = setupTestPinia()
    Notifications = (await import('@/components/editorWithTabs/notifications.vue')).default
  })

  const mountWithNotifications = async (notifications = []) => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      notifications
    }
    return shallowMount(Notifications, {
      global: { plugins: [pinia] }
    })
  }

  describe('currentNotification computed', () => {
    it('returns null when notifications is null', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = { id: 'tab-1', notifications: null }

      const wrapper = shallowMount(Notifications, {
        global: { plugins: [pinia] }
      })
      expect(wrapper.vm.currentNotification).toBeNull()
    })

    it('returns null when notifications is empty', async () => {
      const wrapper = await mountWithNotifications([])
      expect(wrapper.vm.currentNotification).toBeNull()
    })

    it('returns first notification', async () => {
      const notif = { msg: 'First', style: 'info', showConfirm: false }
      const wrapper = await mountWithNotifications([notif, { msg: 'Second' }])
      expect(wrapper.vm.currentNotification).toStrictEqual(notif)
    })
  })

  describe('handleClick', () => {
    it('shifts notification and calls action with true (confirm)', async () => {
      const actionFn = vi.fn()
      const wrapper = await mountWithNotifications([
        { msg: 'Confirm me', style: 'warn', showConfirm: true, action: actionFn }
      ])

      // Find and click the confirm button
      const confirmBtn = wrapper.findAll('.inline-button')[0]
      await confirmBtn.trigger('click')

      expect(actionFn).toHaveBeenCalledWith(true)
    })

    it('shifts notification and calls action with false (dismiss)', async () => {
      const actionFn = vi.fn()
      const wrapper = await mountWithNotifications([
        { msg: 'Dismiss me', style: 'info', showConfirm: true, action: actionFn }
      ])

      // The close button is the last .inline-button
      const buttons = wrapper.findAll('.inline-button')
      await buttons[buttons.length - 1].trigger('click')

      expect(actionFn).toHaveBeenCalledWith(false)
    })

    it('handles click when no notifications (logs error)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = {
        id: 'tab-1',
        notifications: [{ msg: 'test', style: 'info', showConfirm: false, action: vi.fn() }]
      }

      const wrapper = shallowMount(Notifications, {
        global: { plugins: [pinia] }
      })

      // Clear notifications first, then click
      editorStore.currentFile.notifications.length = 0
      await nextTick()

      // Component should no longer render, but handleClick safety check tested
      wrapper.vm.handleClick(false)
      // The error log should be called because notifications is empty
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('handles notification without action', async () => {
      const wrapper = await mountWithNotifications([
        { msg: 'No action', style: 'info', showConfirm: false }
      ])

      // Should not throw even without action callback
      const buttons = wrapper.findAll('.inline-button')
      await buttons[buttons.length - 1].trigger('click')
    })

    it('shows confirm button when showConfirm is true', async () => {
      const wrapper = await mountWithNotifications([
        { msg: 'Confirm', style: 'info', showConfirm: true, action: vi.fn() }
      ])

      const buttons = wrapper.findAll('.inline-button')
      // Should have both OK button and close button
      expect(buttons.length).toBe(2)
    })

    it('hides confirm button when showConfirm is false', async () => {
      const wrapper = await mountWithNotifications([
        { msg: 'No confirm', style: 'info', showConfirm: false, action: vi.fn() }
      ])

      const buttons = wrapper.findAll('.inline-button')
      // Should only have close button
      expect(buttons.length).toBe(1)
    })
  })

  describe('style classes', () => {
    it('applies crit class for critical notifications', async () => {
      const wrapper = await mountWithNotifications([
        { msg: 'Critical', style: 'crit', showConfirm: false }
      ])
      expect(wrapper.find('.editor-notifications.crit').exists()).toBe(true)
    })

    it('applies no extra class for default style', async () => {
      const wrapper = await mountWithNotifications([
        { msg: 'Info', style: 'info', showConfirm: false }
      ])
      expect(wrapper.find('.editor-notifications').exists()).toBe(true)
      expect(wrapper.find('.editor-notifications.warn').exists()).toBe(false)
    })
  })

  describe('max-width style binding', () => {
    it('sets max-width with sidebar width when sidebar shown', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true
      layoutStore.sideBarWidth = 300

      const wrapper = await mountWithNotifications([
        { msg: 'Test', style: 'info', showConfirm: false }
      ])

      const style = wrapper.find('.editor-notifications').attributes('style')
      expect(style).toContain('300px')
    })

    it('sets max-width to 100vw when sidebar hidden', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = false

      const wrapper = await mountWithNotifications([
        { msg: 'Test', style: 'info', showConfirm: false }
      ])

      const style = wrapper.find('.editor-notifications').attributes('style')
      expect(style).toContain('100vw')
    })
  })

  describe('removes notification after click', () => {
    it('shifts the first notification from the array', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      const n1 = { msg: 'First', style: 'info', showConfirm: false, action: vi.fn() }
      const n2 = { msg: 'Second', style: 'warn', showConfirm: true, action: vi.fn() }
      editorStore.currentFile = { id: 'tab-1', notifications: [n1, n2] }

      const wrapper = shallowMount(Notifications, {
        global: { plugins: [pinia] }
      })

      expect(wrapper.vm.currentNotification).toStrictEqual(n1)

      // Click dismiss
      const buttons = wrapper.findAll('.inline-button')
      await buttons[buttons.length - 1].trigger('click')

      // After shift, n2 should be current
      await nextTick()
      expect(wrapper.vm.currentNotification).toStrictEqual(n2)
    })
  })
})
