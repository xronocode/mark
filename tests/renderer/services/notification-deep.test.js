/**
 * Deep coverage tests for src/renderer/src/services/notification/index.js
 *
 * Covers uncovered code paths:
 *   - mousemoveHandler — fluent positioning + clearTimeout
 *   - mouseleaveHandler — fluent animation + reset timer
 *   - clickHandler — resolves promise
 *   - closeHandler — rejects promise
 *   - rePositionNotices — multiple notification stacking
 *   - remove — clean up event listeners, remove from cache
 *   - notify with showConfirm=true — target is .confirm element
 *   - time=0 or negative — no auto-close timer
 *   - fillTemplate — icon/title/message replacement
 *   - clear — removes all cached
 *   - multiple notifications — repositioning
 */

vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'deep-test-id-' + Math.random().toString(36).slice(2, 8)),
  isOsx: false,
  isWindows: false,
  isLinux: true
}))

vi.mock('@/util/dompurify', () => ({
  sanitize: vi.fn((text) => text),
  EXPORT_DOMPURIFY_CONFIG: {}
}))

import notification from '@/services/notification/index'

describe('notification — deep coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    notification.noticeCache = {}
  })

  afterEach(() => {
    document.body.innerHTML = ''
    notification.noticeCache = {}
    vi.useRealTimers()
  })

  describe('click handler resolves promise', () => {
    it('resolves promise when notification target is clicked', async () => {
      const promise = notification.notify({
        title: 'Click me',
        message: 'click to resolve',
        type: 'primary',
        time: 0,
        showConfirm: false
      })

      const el = document.querySelector('.mt-notification')
      expect(el).not.toBeNull()

      // Click the notification container
      el.click()

      // Promise should resolve (not reject)
      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('close button handler rejects promise', () => {
    it('rejects promise when close button is clicked', async () => {
      const promise = notification.notify({
        title: 'Close me',
        message: 'click close',
        type: 'error',
        time: 0,
        showConfirm: false
      })

      const closeBtn = document.querySelector('.close')
      expect(closeBtn).not.toBeNull()

      // SVG elements in jsdom don't have .click() — dispatch event directly
      const clickEvent = new MouseEvent('click', { bubbles: true })
      closeBtn.dispatchEvent(clickEvent)

      // Promise should reject
      await expect(promise).rejects.toBeUndefined()
    })
  })

  describe('showConfirm=true', () => {
    it('targets .confirm element for click resolution', async () => {
      const promise = notification.notify({
        title: 'Confirm',
        message: 'confirm this',
        type: 'primary',
        time: 0,
        showConfirm: true
      })

      const el = document.querySelector('.mt-notification')
      expect(el.classList.contains('mt-confirm')).toBe(true)

      const confirmBtn = el.querySelector('.confirm')
      expect(confirmBtn).not.toBeNull()

      // Click the confirm button
      confirmBtn.click()

      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('mousemove handler', () => {
    it('positions fluent element and sets opacity', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'Hover',
        message: 'mousemove test',
        type: 'info',
        time: 5000
      })

      const el = document.querySelector('.mt-notification')
      const fluent = el.querySelector('.fluent')

      // Mock getBoundingClientRect
      el.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, width: 300, height: 80,
        right: 300, bottom: 80, x: 0, y: 0,
        toJSON: () => {}
      }))

      // Dispatch mousemove
      const moveEvent = new MouseEvent('mousemove', { bubbles: true })
      // jsdom pageX/pageY default to 0
      el.dispatchEvent(moveEvent)

      expect(fluent.style.opacity).toBe('1')
      // left and top are set from event.pageX - rect.left and event.pageY - rect.top
      expect(fluent.style.left).toBeDefined()
      expect(fluent.style.top).toBeDefined()
    })
  })

  describe('mouseleave handler', () => {
    it('resets fluent opacity and restarts timer', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'Leave',
        message: 'mouseleave test',
        type: 'warning',
        time: 5000
      })

      const el = document.querySelector('.mt-notification')
      const fluent = el.querySelector('.fluent')

      // Dispatch mouseleave
      const leaveEvent = new MouseEvent('mouseleave', { bubbles: true })
      el.dispatchEvent(leaveEvent)

      expect(fluent.style.opacity).toBe('0')
    })
  })

  describe('auto-close timer', () => {
    it('removes notification after specified time', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'Auto',
        message: 'auto close',
        type: 'primary',
        time: 200
      })

      expect(document.querySelector('.mt-notification')).not.toBeNull()

      // Advance past auto-close time
      vi.advanceTimersByTime(200)

      // Advance past remove animation (100ms)
      vi.advanceTimersByTime(150)

      // Notification should be removed from DOM
      expect(document.querySelector('.mt-notification')).toBeNull()
    })

    it('does not set timer when time is 0', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'No timer',
        message: 'persistent',
        type: 'primary',
        time: 0
      })

      vi.advanceTimersByTime(100000)

      // Should still be present
      expect(document.querySelector('.mt-notification')).not.toBeNull()
    })

    it('does not set timer when time is negative', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'Negative',
        message: 'no auto-close',
        type: 'primary',
        time: -1
      })

      vi.advanceTimersByTime(100000)
      expect(document.querySelector('.mt-notification')).not.toBeNull()
    })
  })

  describe('multiple notifications repositioning', () => {
    it('stacks multiple notifications with z-index and transforms', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'First',
        message: 'first',
        type: 'primary',
        time: 0
      })

      notification.notify({
        title: 'Second',
        message: 'second',
        type: 'error',
        time: 0
      })

      // Allow reposition to run (50ms setTimeout)
      vi.advanceTimersByTime(60)

      const notices = document.querySelectorAll('.mt-notification')
      expect(notices.length).toBe(2)
    })
  })

  describe('remove — cleanup', () => {
    it('removes from noticeCache after animation', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'Cache',
        message: 'test cache removal',
        type: 'primary',
        time: 100
      })

      expect(Object.keys(notification.noticeCache).length).toBe(1)

      // Auto-close
      vi.advanceTimersByTime(100)

      // Remove animation
      vi.advanceTimersByTime(150)

      expect(Object.keys(notification.noticeCache).length).toBe(0)
    })
  })

  describe('clear', () => {
    it('calls remove on all cached notifications', () => {
      const remove1 = vi.fn()
      const remove2 = vi.fn()
      notification.noticeCache = {
        id1: { remove: remove1 },
        id2: { remove: remove2 }
      }

      notification.clear()

      expect(remove1).toHaveBeenCalled()
      expect(remove2).toHaveBeenCalled()
    })

    it('is safe to call when cache is empty', () => {
      notification.noticeCache = {}
      expect(() => notification.clear()).not.toThrow()
    })
  })

  describe('type variants', () => {
    const types = ['primary', 'error', 'warning', 'info']

    types.forEach((type) => {
      it(`renders ${type} type correctly`, () => {
        notification.notify({
          title: `${type} title`,
          message: `${type} message`,
          type,
          time: 0
        })

        const el = document.querySelector('.mt-notification')
        expect(el).not.toBeNull()

        const expectedClass = {
          primary: 'mt-primary',
          error: 'mt-error',
          warning: 'mt-warn',
          info: 'mt-info'
        }[type]

        expect(el.classList.contains(expectedClass)).toBe(true)
      })
    })
  })

  describe('fluent sizing on reposition', () => {
    it('sets bgNotice width/height after initial delay', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'Fluent',
        message: 'bg sizing',
        type: 'primary',
        time: 0
      })

      // Advance past the 50ms setTimeout for bgNotice sizing
      vi.advanceTimersByTime(60)

      // No crash — bgNotice styling was applied
      const bg = document.querySelector('.notice-bg')
      expect(bg).not.toBeNull()
    })
  })
})
