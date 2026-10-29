/**
 * Unit tests for src/renderer/src/store/notification.js
 *
 * Covers:
 *   - SHOW_NOTIFICATION: merges defaults with caller opts and calls
 *     notice.notify, forwarding the C-NOTIFICATION-SYSTEM event fields
 *   - Dead-code pins (C-NOTIFICATION-SYSTEM T-004): SHOW_PANDOC_MISSING,
 *     showConfirm and the installPandoc locale key are gone for good.
 */

import fs from 'node:fs'
import path from 'node:path'
import { setupTestPinia } from '../pinia'

// Mock notification SERVICE — its real index pulls in the store; here we
// pin the facade call shape only.
const notifyMock = vi.fn(() => undefined)
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
      expect(opts.severity).toBe('info')
      expect(opts.time).toBe(10000)
      expect(opts.message).toBe('hi') // overridden
    })

    it('caller opts override defaults (title/severity/time)', async () => {
      const { useNotificationStore } = await import('@/store/notification')
      const s = useNotificationStore()
      s.SHOW_NOTIFICATION({ title: 'X', severity: 'error', time: 200, message: 'M' })
      const opts = notifyMock.mock.calls[0][0] as Record<string, unknown>
      expect(opts.title).toBe('X')
      expect(opts.severity).toBe('error')
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

    it('forwards the C-NOTIFICATION-SYSTEM event fields', async () => {
      const { useNotificationStore } = await import('@/store/notification')
      const s = useNotificationStore()
      const actions = [{ kind: 'copy', payload: 'p' }]
      s.SHOW_NOTIFICATION({
        message: 'm',
        source: 'export',
        actions,
        dedupKey: 'k',
        sticky: true
      })
      const opts = notifyMock.mock.calls[0][0] as Record<string, unknown>
      expect(opts.source).toBe('export')
      expect(opts.actions).toBe(actions)
      expect(opts.dedupKey).toBe('k')
      expect(opts.sticky).toBe(true)
    })
  })

  describe('dead-code pins (C-NOTIFICATION-SYSTEM T-004)', () => {
    const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8')

    it('the pandoc-missing action identifier is gone from the renderer source', () => {
      const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const p = path.join(dir, e.name)
          return e.isDirectory() ? walk(p) : [p]
        })
      const hits = walk(path.resolve(__dirname, '../../../src/renderer/src'))
        .filter((f) => /\.(js|ts|vue)$/.test(f))
        .filter((f) => fs.readFileSync(f, 'utf8').includes('SHOW_PANDOC_MISSING'))
      expect(hits).toEqual([])
    })

    it('the toast layer carries no showConfirm semantics (banner keeps its own)', () => {
      // The banner queue (editorWithTabs + pushTabNotification) keeps its
      // confirm flag by design (spec R-8); the toast service and its store
      // facade must never grow it back (corner C-7).
      const service = fs.readFileSync(
        path.resolve(__dirname, '../../../src/renderer/src/services/notification/index.js'),
        'utf8'
      )
      expect(service.includes('showConfirm')).toBe(false)
      const facadeStore = fs.readFileSync(
        path.resolve(__dirname, '../../../src/renderer/src/store/notification.js'),
        'utf8'
      )
      expect(facadeStore.includes('showConfirm')).toBe(false)
    })

    it('the installPandoc locale key is gone from every locale', () => {
      const locales = fs.readdirSync(path.resolve(__dirname, '../../../static/locales'))
        .filter((f) => f.endsWith('.json'))
      expect(locales.length).toBe(10)
      const hits = locales.filter((f) =>
        fs.readFileSync(path.resolve(__dirname, '../../../static/locales', f), 'utf8').includes('installPandoc')
      )
      expect(hits).toEqual([])
    })
  })
})
