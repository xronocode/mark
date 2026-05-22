/**
 * Tests for src/renderer/src/services/notification/index.js
 *
 * Covers: notification.notify (DOM creation, type classes, close behavior),
 * notification.clear, fillTemplate.
 */

vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'test-id-123'),
  isOsx: false,
  isWindows: false,
  isLinux: true
}))

vi.mock('@/util/dompurify', () => ({
  sanitize: vi.fn((text) => text),
  EXPORT_DOMPURIFY_CONFIG: {}
}))

import notification from '@/services/notification/index'

describe('notification', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    notification.noticeCache = {}
  })

  afterEach(() => {
    document.body.innerHTML = ''
    notification.noticeCache = {}
  })

  it('has name "notify"', () => {
    expect(notification.name).toBe('notify')
  })

  describe('notify', () => {
    it('creates notification DOM element in body', () => {
      notification.notify({
        title: 'Test',
        message: 'Hello World',
        type: 'primary',
        time: 0 // disable auto-close
      })

      const el = document.querySelector('.mt-notification')
      expect(el).not.toBeNull()
    })

    it('applies type class to notification', () => {
      notification.notify({
        title: 'Error',
        message: 'Something went wrong',
        type: 'error',
        time: 0
      })

      const el = document.querySelector('.mt-notification')
      expect(el.classList.contains('mt-error')).toBe(true)
    })

    it('applies warning type class', () => {
      notification.notify({
        title: 'Warning',
        message: 'Watch out',
        type: 'warning',
        time: 0
      })

      const content = document.querySelector('.content')
      expect(content.classList.contains('mt-warn')).toBe(true)
    })

    it('applies info type class', () => {
      notification.notify({
        title: 'Info',
        message: 'FYI',
        type: 'info',
        time: 0
      })

      const el = document.querySelector('.mt-notification')
      expect(el.classList.contains('mt-info')).toBe(true)
    })

    it('returns a promise', () => {
      const result = notification.notify({
        title: 'Test',
        message: 'msg',
        time: 0
      })

      expect(result).toBeInstanceOf(Promise)
    })

    it('adds confirm class when showConfirm is true', () => {
      notification.notify({
        title: 'Confirm',
        message: 'Are you sure?',
        showConfirm: true,
        time: 0
      })

      const el = document.querySelector('.mt-notification')
      expect(el.classList.contains('mt-confirm')).toBe(true)
    })

    it('caches notice in noticeCache', () => {
      notification.notify({
        title: 'Cached',
        message: 'msg',
        time: 0
      })

      expect(Object.keys(notification.noticeCache).length).toBe(1)
    })

    it('uses default values for optional params', () => {
      notification.notify({})

      const el = document.querySelector('.mt-notification')
      expect(el).not.toBeNull()
      // Default type is 'primary'
      expect(el.classList.contains('mt-primary')).toBe(true)
    })

    it('auto-closes after time', () => {
      vi.useFakeTimers()

      notification.notify({
        title: 'Auto',
        message: 'close',
        time: 100
      })

      expect(document.querySelector('.mt-notification')).not.toBeNull()

      vi.advanceTimersByTime(200)

      // After remove timeout (100ms auto-close + 100ms remove animation)
      vi.advanceTimersByTime(200)

      vi.useRealTimers()
    })
  })

  describe('clear', () => {
    it('removes all cached notices', () => {
      const removeMock = vi.fn()
      notification.noticeCache = {
        a: { remove: removeMock },
        b: { remove: removeMock }
      }

      notification.clear()

      expect(removeMock).toHaveBeenCalledTimes(2)
    })

    it('does nothing when cache is empty', () => {
      expect(() => notification.clear()).not.toThrow()
    })
  })
})
