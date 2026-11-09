/**
 * C-NOTIFICATION-SYSTEM: component tests for notificationCard/index.vue.
 *
 * Coverage focus:
 *   - One card per severity with the icon-chip family (data-severity,
 *     chromeIcons glyph, source label, count badge).
 *   - The actions contract (corner C-7): three styles, built-in kinds
 *     dispatch payloads, custom handlers fire, nothing resolves a promise.
 *   - The action-failure surface (C-RENDER-REVIEW-FIXES T-003): the card
 *     awaits handler/payload; a rejection raises the localized warning
 *     notice carrying the entry's own source; zero unhandled rejections.
 *   - Copy-on-select (corner C-3): selection release writes exactly the
 *     selection and pulses; an empty-selection click dismisses while a
 *     selection-release click does not.
 *   - The truthful copy pulse (C-RENDER-REVIEW-FIXES T-005): the pulse only
 *     follows a resolved successful clipboard write — a missing API and a
 *     rejected write never pulse; a selection collapsed before the write
 *     resolves still pulses the captured Range snapshot (no throw, no
 *     unhandled rejection).
 *   - Timer hairline follows sticky/paused state (corner C-2).
 */

import { mount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

// util reads window.electron at module scope; mock it the way the legacy
// notification tests did.
vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'card-test-id')
}))

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))

// C-RENDER-REVIEW-FIXES T-003: the card raises the action-failure notice
// through the facade's notify — capture that call directly while keeping
// the copy/pulse helpers real for the existing pins.
vi.mock('@/services/notification', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: Object.assign({}, actual.default, { notify: notifyMock })
  }
})

import NotificationCard from '@/components/notificationCard/index.vue'
import { useNotificationsStore } from '@/store/notifications'
import { t } from '@/i18n'

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
    await flushPromises()
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

  // C-RENDER-REVIEW-FIXES T-003: honest async actions — the card awaits
  // handler/payload; a rejection speaks once through the localized warning
  // notice with the entry's own source (honest provenance), the raw error
  // stays on the console marker only, and nothing escapes as an unhandled
  // promise rejection.
  describe('action failure surface (C-RENDER-REVIEW-FIXES T-003)', () => {
    const RAW = 'reveal-opener-failed-SYD-1555'
    let unhandled
    let onUnhandled

    const failingPayload = () => Promise.reject(new Error(RAW))

    beforeEach(() => {
      notifyMock.mockClear()
      unhandled = []
      onUnhandled = (reason) => { unhandled.push(reason) }
      process.on('unhandledRejection', onUnhandled)
    })

    afterEach(() => {
      process.off('unhandledRejection', onUnhandled)
      expect(unhandled).toEqual([])
    })

    it('a rejecting reveal payload (single-reveal export card) surfaces the localized warning notice', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapper = mountCard(entry({
        source: 'export',
        actions: [{ kind: 'reveal', payload: failingPayload }]
      }))
      await wrapper.findAll('.action-btn')[0].trigger('click')
      await flushPromises()
      expect(notifyMock).toHaveBeenCalledTimes(1)
      expect(notifyMock.mock.calls[0][0]).toEqual({
        title: t('notifications.actionFailedTitle'),
        message: t('notifications.actionFailedBody'),
        type: 'warning',
        source: 'export'
      })
      // The raw injected error stays on the console marker, never in the notice.
      expect(notifyMock.mock.calls[0][0].message).not.toContain(RAW)
      expect(errSpy).toHaveBeenCalledWith('[notificationCard][ACTION_FAILED]', expect.any(Error))
    })

    it('the export card shape (reveal + quiet shortcut) surfaces the notice from the failing reveal', async () => {
      const wrapper = mountCard(entry({
        source: 'export',
        actions: [
          { kind: 'reveal', payload: failingPayload },
          { label: 'Settings', style: 'quiet', handler: vi.fn() }
        ]
      }))
      await wrapper.findAll('.action-btn')[0].trigger('click')
      await flushPromises()
      expect(notifyMock).toHaveBeenCalledTimes(1)
      const opts = notifyMock.mock.calls[0][0]
      expect(opts.title).toBe(t('notifications.actionFailedTitle'))
      expect(opts.message).toBe(t('notifications.actionFailedBody'))
      expect(opts.message).not.toContain(RAW)
      expect(opts.type).toBe('warning')
      expect(opts.source).toBe('export')
    })

    it('a rejecting custom handler surfaces the same notice', async () => {
      const wrapper = mountCard(entry({
        source: 'system',
        actions: [{ label: 'Go', handler: () => Promise.reject(new Error(RAW)) }]
      }))
      await wrapper.findAll('.action-btn')[0].trigger('click')
      await flushPromises()
      expect(notifyMock).toHaveBeenCalledTimes(1)
      const opts = notifyMock.mock.calls[0][0]
      expect(opts.title).toBe(t('notifications.actionFailedTitle'))
      expect(opts.message).toBe(t('notifications.actionFailedBody'))
      expect(opts.message).not.toContain(RAW)
      expect(opts.type).toBe('warning')
      expect(opts.source).toBe('system')
    })

    it('a synchronously throwing handler is caught the same way', async () => {
      const wrapper = mountCard(entry({
        source: 'system',
        actions: [{
          label: 'Go',
          handler: () => { throw new Error(RAW) }
        }]
      }))
      await wrapper.findAll('.action-btn')[0].trigger('click')
      await flushPromises()
      expect(notifyMock).toHaveBeenCalledTimes(1)
      const opts = notifyMock.mock.calls[0][0]
      expect(opts.type).toBe('warning')
      expect(opts.message).not.toContain(RAW)
    })

    it('a resolving payload raises no notice; plain sync handlers still run', async () => {
      const syncHandler = vi.fn()
      const wrapper = mountCard(entry({
        source: 'export',
        actions: [
          { kind: 'reveal', payload: () => Promise.resolve(true) },
          { label: 'Sync', handler: syncHandler }
        ]
      }))
      const buttons = wrapper.findAll('.action-btn')
      await buttons[0].trigger('click')
      await buttons[1].trigger('click')
      await flushPromises()
      expect(syncHandler).toHaveBeenCalledTimes(1)
      expect(notifyMock).not.toHaveBeenCalled()
    })
  })

  // C-RENDER-REVIEW-FIXES T-005: truthful copy — the pulse only follows a
  // real clipboard write. The Range is captured synchronously at release, so
  // a selection that collapses before the write resolves can neither throw,
  // nor leave an unhandled rejection, nor pulse a node other than the
  // captured snapshot; a missing API and a rejected write never pulse.
  describe('truthful copy pulse (C-RENDER-REVIEW-FIXES T-005)', () => {
    let unhandled
    let onUnhandled

    beforeEach(() => {
      unhandled = []
      onUnhandled = (reason) => { unhandled.push(reason) }
      process.on('unhandledRejection', onUnhandled)
    })

    afterEach(() => {
      process.off('unhandledRejection', onUnhandled)
      expect(unhandled).toEqual([])
    })

    const pulseSpans = (wrapper) => wrapper.findAll('.card-message .notify-copied-pulse')

    it('a resolving write pulses exactly once on the copied range', async () => {
      const wrapper = mountCard(entry())
      selectInside(wrapper)
      await wrapper.trigger('mouseup')
      await flushPromises()
      expect(pulseSpans(wrapper)).toHaveLength(1)
    })

    it('a missing clipboard API produces no pulse and no throw', async () => {
      Object.defineProperty(window, 'navigator', { value: {}, configurable: true })
      const wrapper = mountCard(entry())
      selectInside(wrapper)
      await wrapper.trigger('mouseup')
      await flushPromises()
      expect(writeText).not.toHaveBeenCalled()
      expect(pulseSpans(wrapper)).toHaveLength(0)
    })

    it('a rejecting clipboard write stays silent and produces no pulse', async () => {
      writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')))
      const wrapper = mountCard(entry())
      selectInside(wrapper)
      await wrapper.trigger('mouseup')
      await flushPromises()
      expect(pulseSpans(wrapper)).toHaveLength(0)
    })

    it('the selection collapses before resolution: a real write still pulses the captured snapshot', async () => {
      let resolveWrite
      writeText.mockImplementationOnce(() => new Promise((resolve) => { resolveWrite = resolve }))
      const wrapper = mountCard(entry())
      selectInside(wrapper)
      await wrapper.trigger('mouseup')
      // The selection collapses while the write is still pending.
      window.getSelection().removeAllRanges()
      resolveWrite()
      await flushPromises()
      // The captured Range is a frozen snapshot — honest feedback for a
      // copy that did happen lands on the captured node.
      expect(pulseSpans(wrapper)).toHaveLength(1)
      expect(wrapper.get('.card-message .notify-copied-pulse').text()).toBe('A message with selectable text')
    })

    it('the selection collapses before resolution: an absent API never pulses', async () => {
      Object.defineProperty(window, 'navigator', { value: {}, configurable: true })
      const wrapper = mountCard(entry())
      selectInside(wrapper)
      await wrapper.trigger('mouseup')
      window.getSelection().removeAllRanges()
      await flushPromises()
      expect(pulseSpans(wrapper)).toHaveLength(0)
    })

    it('the selection collapses before resolution: a rejected write never pulses', async () => {
      let rejectWrite
      writeText.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectWrite = reject }))
      const wrapper = mountCard(entry())
      selectInside(wrapper)
      await wrapper.trigger('mouseup')
      window.getSelection().removeAllRanges()
      rejectWrite(new Error('denied'))
      await flushPromises()
      expect(pulseSpans(wrapper)).toHaveLength(0)
    })
  })
})
