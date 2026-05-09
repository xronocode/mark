/**
 * Unit tests for src/renderer/src/store/notification.js
 *
 * Covers:
 *   - SHOW_NOTIFICATION: merges defaults with caller opts and calls
 *     notice.notify
 *   - SHOW_PANDOC_MISSING: async; calls notice.notify with showConfirm,
 *     then opens http://pandoc.org via window.electron.shell.openExternal
 */

import { setupTestPinia } from '../pinia'

// Mock notification SERVICE — its real index pulls in CSS + DOMPurify.
const notifyMock = vi.fn(async (_opts: unknown) => undefined)
vi.mock('@/services/notification', () => ({
  default: { notify: notifyMock }
}))

// i18n mock — `t(key)` returns the key so we can assert on it.
vi.mock('@/i18n', () => ({
  t: (key: string) => key
}))

describe('store/notification', () => {
  beforeEach(() => {
    setupTestPinia()
    notifyMock.mockReset()
  })

  describe('SHOW_NOTIFICATION', () => {
    it('calls notice.notify with merged default opts', async () => {
      const { useNotificationStore } = await import('@/store/notification')
      const s = useNotificationStore()
      s.SHOW_NOTIFICATION({ message: 'hi' })
      expect(notifyMock).toHaveBeenCalledTimes(1)
      const opts = notifyMock.mock.calls[0][0] as Record<string, unknown>
      expect(opts.title).toBe('notifications.defaultTitle')
      expect(opts.type).toBe('primary')
      expect(opts.time).toBe(10000)
      expect(opts.message).toBe('hi') // overridden
    })

    it('caller opts override defaults (title/type/time)', async () => {
      const { useNotificationStore } = await import('@/store/notification')
      const s = useNotificationStore()
      s.SHOW_NOTIFICATION({ title: 'X', type: 'error', time: 200, message: 'M' })
      const opts = notifyMock.mock.calls[0][0] as Record<string, unknown>
      expect(opts.title).toBe('X')
      expect(opts.type).toBe('error')
      expect(opts.time).toBe(200)
      expect(opts.message).toBe('M')
    })

    it('handles undefined opts (uses defaults entirely)', async () => {
      const { useNotificationStore } = await import('@/store/notification')
      const s = useNotificationStore()
      s.SHOW_NOTIFICATION(undefined as any)
      const opts = notifyMock.mock.calls[0][0] as Record<string, unknown>
      expect(opts.title).toBe('notifications.defaultTitle')
      expect(opts.message).toBe('notifications.defaultMessage')
    })
  })

  describe('SHOW_PANDOC_MISSING', () => {
    it('sets showConfirm:true, awaits notify, then opens pandoc.org', async () => {
      const { useNotificationStore } = await import('@/store/notification')
      const s = useNotificationStore()
      await s.SHOW_PANDOC_MISSING({ message: 'pandoc not found' })

      expect(notifyMock).toHaveBeenCalledTimes(1)
      const opts = notifyMock.mock.calls[0][0] as Record<string, unknown>
      expect(opts.showConfirm).toBe(true)
      expect(opts.message).toBe('pandoc not found')

      expect(window.electron.shell.openExternal).toHaveBeenCalledWith('http://pandoc.org')
    })

    it('uses defaults when no opts passed', async () => {
      const { useNotificationStore } = await import('@/store/notification')
      const s = useNotificationStore()
      await s.SHOW_PANDOC_MISSING(undefined as any)
      const opts = notifyMock.mock.calls[0][0] as Record<string, unknown>
      expect(opts.title).toBe('notifications.defaultTitle')
      expect(opts.showConfirm).toBe(true)
      expect(window.electron.shell.openExternal).toHaveBeenCalledWith('http://pandoc.org')
    })
  })
})
