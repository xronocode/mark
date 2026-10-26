/**
 * C-NOTIFICATION-SYSTEM: component tests for notificationsHistory/index.vue
 * (the CI coverage gate counts this component, previously e2e-only).
 *
 * Coverage focus:
 *   - Opens on the show-notifications-history bus event.
 *   - Lists entries newest-first with time, source label, severity glyph and
 *     the full untruncated text; empty state when nothing was shown.
 *   - The per-entry copy action writes exactly fullText (silent clipboard
 *     contract).
 */

import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'hist-id'),
  isOsx: true,
  isWindows: false,
  isLinux: false
}))

import { useNotificationsStore } from '@/store/notifications'
import NotificationsHistory from '@/components/notificationsHistory/index.vue'
import bus from '@/bus'

const writeText = vi.fn(() => Promise.resolve())

const mountHistory = () => mount(NotificationsHistory, {
  global: {
    stubs: {
      // el-dialog is globally registered in the app; pass its slots through.
      ElDialog: { template: '<div class="dialog-stub"><slot /></div>' }
    }
  },
  attachTo: document.body
})

describe('notificationsHistory (C-NOTIFICATION-SYSTEM)', () => {
  let store

  beforeEach(() => {
    setupTestPinia()
    store = useNotificationsStore()
    document.body.innerHTML = ''
    writeText.mockClear()
    Object.defineProperty(window, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true
    })
  })

  it('opens on the bus event and shows the empty state', async () => {
    const wrapper = mountHistory()
    bus.emit('show-notifications-history')
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('.dialog-stub').exists()).toBe(true)
    expect(wrapper.get('.history-empty').text()).toBe('notifications.history.empty')
    wrapper.unmount()
  })

  it('lists entries newest-first with full text, source label and severity glyph', async () => {
    store.NOTIFY({ severity: 'warning', source: 'export', title: 'First', message: 'first full text' })
    store.NOTIFY({ severity: 'error', source: 'file', title: 'Second', message: 'second full text' })
    const wrapper = mountHistory()
    bus.emit('show-notifications-history')
    await new Promise((r) => setTimeout(r, 0))

    const entries = wrapper.findAll('.history-entry')
    expect(entries).toHaveLength(2)
    expect(entries[0].attributes('data-severity')).toBe('error')
    expect(entries[0].get('.entry-title').text()).toBe('Second')
    expect(entries[0].get('.entry-text').text()).toBe('second full text')
    expect(entries[0].get('.entry-source').text()).toBe('notifications.source.file')
    expect(entries[1].get('.entry-text').text()).toBe('first full text')
    wrapper.unmount()
  })

  it('the per-entry copy button writes exactly fullText', async () => {
    store.NOTIFY({ severity: 'info', title: 'T', message: 'the copyable body' })
    const wrapper = mountHistory()
    bus.emit('show-notifications-history')
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.get('.entry-copy').trigger('click')
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('the copyable body')
    wrapper.unmount()
  })
})
