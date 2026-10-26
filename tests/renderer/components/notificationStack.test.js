/**
 * C-NOTIFICATION-SYSTEM: component tests for notificationStack/index.vue.
 *
 * Coverage focus (the CI coverage gate counts this component, previously
 * e2e-only):
 *   - Renders nothing when the stack is empty; renders at most the store's
 *     liveStack cards plus the overflow chip with the localized plural.
 *   - dismissEntry routing: entries with onDismiss call the owner hook
 *     (updateNotice semantics); plain entries DISMISS from the store.
 *   - Esc closes the topmost card, but never while an editor surface owns
 *     the Escape key (corner C-2).
 *   - The overflow chip opens the history surface via the bus event.
 */

import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({
  t: (key, n) => (n === undefined ? key : key + ':' + n)
}))

let idSeq = 0
vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'id-' + ++idSeq),
  isOsx: true,
  isWindows: false,
  isLinux: false
}))

import { useNotificationsStore } from '@/store/notifications'
import NotificationStack from '@/components/notificationStack/index.vue'
import bus from '@/bus'

const mountStack = () => mount(NotificationStack, { attachTo: document.body })

const keydown = (target) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  Object.defineProperty(event, 'target', { value: target })
  window.dispatchEvent(event)
}

describe('notificationStack (C-NOTIFICATION-SYSTEM)', () => {
  let store

  beforeEach(() => {
    setupTestPinia()
    store = useNotificationsStore()
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when the stack is empty', () => {
    const wrapper = mountStack()
    expect(wrapper.find('.notification-stack').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the live cards and the overflow chip with the plural count', () => {
    for (let i = 0; i < 5; i++) {
      store.NOTIFY({ severity: 'error', title: 'n' + i, message: 'm' })
    }
    const wrapper = mountStack()
    expect(wrapper.findAll('.notification-card')).toHaveLength(3)
    const chip = wrapper.get('.stack-overflow')
    expect(chip.text()).toContain('notifications.more:2')
    wrapper.unmount()
  })

  it('a plain card dismiss button removes the entry from the store', async () => {
    store.NOTIFY({ severity: 'info', time: 0, title: 'x', message: 'm' })
    const wrapper = mountStack()
    await wrapper.get('.card-close').trigger('click')
    expect(store.stack).toHaveLength(0)
    wrapper.unmount()
  })

  it('an onDismiss entry routes to its owner hook instead of a plain DISMISS', async () => {
    const ownerHook = vi.fn()
    store.NOTIFY({ severity: 'info', time: 0, title: 'x', message: 'm', onDismiss: ownerHook })
    const wrapper = mountStack()
    await wrapper.get('.card-close').trigger('click')
    expect(ownerHook).toHaveBeenCalledTimes(1)
    expect(store.stack).toHaveLength(1) // removal is the owner's business
    wrapper.unmount()
  })

  it('Esc closes the topmost card only', () => {
    store.NOTIFY({ severity: 'error', title: 'first', message: 'm' })
    store.NOTIFY({ severity: 'error', title: 'second', message: 'm' })
    const wrapper = mountStack()
    keydown(document.body)
    expect(store.stack).toHaveLength(1)
    expect(store.stack[0].title).toBe('first')
    wrapper.unmount()
  })

  it('Esc inside an editable surface belongs to that surface (corner C-2)', () => {
    store.NOTIFY({ severity: 'error', title: 'stays', message: 'm' })
    const wrapper = mountStack()
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    document.body.appendChild(editor)
    keydown(editor)
    expect(store.stack).toHaveLength(1)
    wrapper.unmount()
  })

  it('the overflow chip opens the history surface', async () => {
    const heard = []
    bus.on('show-notifications-history', () => heard.push(1))
    for (let i = 0; i < 4; i++) {
      store.NOTIFY({ severity: 'error', title: 'n' + i, message: 'm' })
    }
    const wrapper = mountStack()
    await wrapper.get('.stack-overflow').trigger('click')
    expect(heard).toHaveLength(1)
    bus.off('show-notifications-history', () => {})
    wrapper.unmount()
  })
})
