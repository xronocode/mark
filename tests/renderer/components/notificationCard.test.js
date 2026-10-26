/**
 * C-NOTIFICATION-SYSTEM: component tests for notificationCard/index.vue.
 *
 * Coverage focus:
 *   - One card per severity with the icon-chip family (data-severity,
 *     chromeIcons glyph, source label, count badge).
 *   - The actions contract (corner C-7): three styles, built-in kinds
 *     dispatch payloads, custom handlers fire, nothing resolves a promise.
 *   - Copy-on-select (corner C-3): selection release writes exactly the
 *     selection and pulses; an empty-selection click dismisses while a
 *     selection-release click does not.
 *   - Timer hairline follows sticky/paused state (corner C-2).
 */

import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

// util reads window.electron at module scope; mock it the way the legacy
// notification tests did.
vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'card-test-id')
}))

import NotificationCard from '@/components/notificationCard/index.vue'
import { useNotificationsStore } from '@/store/notifications'

const writeText = vi.fn(() => Promise.resolve())

const entry = (over = {}) => ({
  id: 'e1',
  severity: 'info',
  source: 'system',
  title: 'Title',
  message: 'A message with selectable text',
  actions: [],
  dedupKey: null,
  sticky: false,
  time: 8000,
  count: 1,
  paused: false,
  ...over
})

const mountCard = (e) => mount(NotificationCard, {
  props: { entry: e },
  attachTo: document.body
})

const selectInside = (wrapper) => {
  const msg = wrapper.get('.card-message')
  const range = document.createRange()
  range.selectNodeContents(msg.element)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  return sel
}

describe('notificationCard (C-NOTIFICATION-SYSTEM)', () => {
  beforeEach(() => {
    setupTestPinia()
    document.body.innerHTML = ''
    window.getSelection().removeAllRanges()
    writeText.mockClear()
    Object.defineProperty(window, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  })

  it('renders severity, icon chip, title, message and source label', () => {
    const wrapper = mountCard(entry({ severity: 'warning', source: 'export' }))
    expect(wrapper.attributes('data-severity')).toBe('warning')
    expect(wrapper.find('.sev-chip svg').exists()).toBe(true)
    expect(wrapper.get('.card-title').text()).toBe('Title')
    expect(wrapper.get('.card-message').text()).toContain('selectable')
    expect(wrapper.get('.card-source').text()).toBe('notifications.source.export')
  })

  it('shows the ×N badge only when dedup bumped the count', () => {
    const one = mountCard(entry())
    expect(one.find('.count-badge').exists()).toBe(false)
    one.unmount()
    const two = mountCard(entry({ count: 7 }))
    expect(two.get('.count-badge').text()).toBe('×7')
  })

  it('renders action styles and fires custom handlers (corner C-7)', async () => {
    const handler = vi.fn()
    const wrapper = mountCard(entry({
      actions: [
        { label: 'Go', style: 'primary', handler },
        { label: 'Meh', handler: () => {} },
        { label: 'Quiet', style: 'quiet', handler: () => {} }
      ]
    }))
    const buttons = wrapper.findAll('.action-btn')
    expect(buttons).toHaveLength(3)
    expect(buttons[0].classes()).toContain('action-primary')
    expect(buttons[2].classes()).toContain('action-quiet')
    await buttons[0].trigger('click')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('built-in copy action writes the payload; payload functions run', async () => {
    const fn = vi.fn()
    const wrapper = mountCard(entry({
      actions: [
        { kind: 'copy', payload: 'payload-text' },
        { kind: 'reveal', payload: fn }
      ]
    }))
    const buttons = wrapper.findAll('.action-btn')
    expect(buttons[0].text()).toBe('notifications.actions.copy')
    await buttons[0].trigger('click')
    expect(writeText).toHaveBeenCalledWith('payload-text')
    await buttons[1].trigger('click')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('an empty-selection click dismisses (corner C-3)', async () => {
    const wrapper = mountCard(entry())
    await wrapper.trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('a selection release copies exactly the selection and does not dismiss (corner C-3)', async () => {
    const wrapper = mountCard(entry())
    selectInside(wrapper)
    await wrapper.trigger('mouseup')
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('A message with selectable text')
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    // The same live selection must also suppress the click path.
    await wrapper.trigger('click')
    expect(wrapper.emitted('dismiss')).toBeUndefined()
  })

  it('the pulse span lands on the copied range and cleans up', async () => {
    const wrapper = mountCard(entry())
    selectInside(wrapper)
    await wrapper.trigger('mouseup')
    const pulse = wrapper.get('.card-message .notify-copied-pulse')
    pulse.element.dispatchEvent(new Event('animationend'))
    expect(pulse.element.classList.contains('notify-copied-pulse')).toBe(false)
  })

  it('timer hairline only for auto-dismiss entries; paused freezes the bar', () => {
    const sticky = mountCard(entry({ severity: 'error', sticky: true }))
    expect(sticky.find('.timer').exists()).toBe(false)
    sticky.unmount()
    const timed = mountCard(entry({ paused: true }))
    expect(timed.find('.timer').exists()).toBe(true)
    expect(timed.get('.timer i').attributes('style')).toContain('paused')
  })
})
