/**
 * Tests for src/renderer/src/store/notifications.js — the
 * C-NOTIFICATION-SYSTEM stack + history core.
 *
 * Covers: severity defaults and sticky errors (corner C-2), dedupKey
 * collapsing with per-occurrence history (corner C-5), the 3-card stack cap
 * with overflow counter (corner C-1), FIFO history capped at 50, auto-
 * dismiss timers with hover pause/resume (corner C-2), and dismiss actions.
 */

import { setupTestPinia } from '../pinia'

// util reads window.electron at module scope; mock it the way the legacy
// notification tests did.
let idSeq = 0
vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'id-' + ++idSeq)
}))

import { useNotificationsStore, HISTORY_CAP } from '@/store/notifications'

describe('store/notifications (C-NOTIFICATION-SYSTEM)', () => {
  let store

  beforeEach(() => {
    setupTestPinia()
    store = useNotificationsStore()
    vi.useFakeTimers()
  })

  afterEach(() => {
    store.CLEAR()
    vi.useRealTimers()
  })

  describe('severity defaults', () => {
    it('error entries are sticky with no timer', () => {
      store.NOTIFY({ severity: 'error', message: 'boom' })
      expect(store.stack[0].sticky).toBe(true)
      expect(store.stack[0].time).toBe(0)
    })

    it('info/success/warning auto-dismiss with their own defaults', () => {
      store.NOTIFY({ severity: 'info' })
      store.NOTIFY({ severity: 'success' })
      store.NOTIFY({ severity: 'warning' })
      expect(store.stack[0].time).toBe(8000)
      expect(store.stack[1].time).toBe(5000)
      expect(store.stack[2].time).toBe(10000)
    })

    it('an explicit time overrides the default; time 0 keeps the card alive', () => {
      store.NOTIFY({ severity: 'info', time: 250 })
      expect(store.stack[0].time).toBe(250)
      store.NOTIFY({ severity: 'info', time: 0 })
      expect(store.stack[1].sticky).toBe(true)
    })

    it('legacy primary and unknown types fall back to info (corner C-6)', () => {
      store.NOTIFY({ type: 'primary' })
      store.NOTIFY({ type: 'mystery' })
      expect(store.stack[0].severity).toBe('info')
      expect(store.stack[1].severity).toBe('info')
    })
  })

  describe('dedup collapsing (corner C-5)', () => {
    it('a repeated dedupKey bumps one card counter, never stacks', () => {
      for (let i = 0; i < 10; i++) {
        store.NOTIFY({ title: 'watcher', message: 'm' + i, dedupKey: 'w' })
      }
      expect(store.stack).toHaveLength(1)
      expect(store.stack[0].count).toBe(10)
    })

    it('history still logs one entry per occurrence', () => {
      store.NOTIFY({ message: 'a', dedupKey: 'w' })
      store.NOTIFY({ message: 'b', dedupKey: 'w' })
      expect(store.stack).toHaveLength(1)
      expect(store.history).toHaveLength(2)
      expect(store.history.map((h) => h.fullText)).toEqual(['a', 'b'])
    })

    it('entries without dedupKey never collapse', () => {
      store.NOTIFY({ message: 'a' })
      store.NOTIFY({ message: 'b' })
      expect(store.stack).toHaveLength(2)
    })
  })

  describe('stack cap (corner C-1)', () => {
    it('only the newest 3 render and the overflow counter grows', () => {
      for (let i = 0; i < 5; i++) {
        store.NOTIFY({ title: 'n' + i, severity: 'error' })
      }
      expect(store.liveStack).toHaveLength(3)
      expect(store.liveStack.map((e) => e.title)).toEqual(['n2', 'n3', 'n4'])
      expect(store.overflowCount).toBe(2)
    })
  })

  describe('history (spec R-6)', () => {
    it('is FIFO capped at 50 entries', () => {
      for (let i = 0; i < HISTORY_CAP + 5; i++) {
        store.NOTIFY({ message: 'm' + i })
      }
      expect(store.history).toHaveLength(HISTORY_CAP)
      expect(store.history[0].fullText).toBe('m5')
      expect(store.history[HISTORY_CAP - 1].fullText).toBe('m' + (HISTORY_CAP + 4))
    })

    it('records severity, source and title alongside fullText', () => {
      store.NOTIFY({ severity: 'warning', source: 'export', title: 'T', message: 'M' })
      const h = store.history[0]
      expect(h.severity).toBe('warning')
      expect(h.source).toBe('export')
      expect(h.title).toBe('T')
      expect(h.fullText).toBe('M')
    })
  })

  describe('timers and hover pause (corner C-2)', () => {
    it('a timed entry auto-dismisses when its time passes', () => {
      store.NOTIFY({ severity: 'info', time: 1000 })
      expect(store.stack).toHaveLength(1)
      vi.advanceTimersByTime(1001)
      expect(store.stack).toHaveLength(0)
    })

    it('a sticky entry survives any advance', () => {
      store.NOTIFY({ severity: 'error' })
      vi.advanceTimersByTime(60000)
      expect(store.stack).toHaveLength(1)
    })

    it('PAUSE freezes the countdown and RESUME finishes it', () => {
      const id = store.NOTIFY({ severity: 'info', time: 4000 })
      vi.advanceTimersByTime(2000)
      store.PAUSE(id)
      expect(store.stack[0].paused).toBe(true)
      vi.advanceTimersByTime(60000)
      expect(store.stack).toHaveLength(1)
      store.RESUME(id)
      expect(store.stack[0].paused).toBe(false)
      vi.advanceTimersByTime(2001)
      expect(store.stack).toHaveLength(0)
    })
  })

  describe('dismiss actions', () => {
    it('DISMISS removes one entry by id', () => {
      const a = store.NOTIFY({ severity: 'error' })
      store.NOTIFY({ severity: 'error' })
      store.DISMISS(a)
      expect(store.stack).toHaveLength(1)
    })

    it('DISMISS_TOP removes the newest card only', () => {
      store.NOTIFY({ title: 'old', severity: 'error' })
      store.NOTIFY({ title: 'new', severity: 'error' })
      const removed = store.DISMISS_TOP()
      expect(store.stack[0].title).toBe('old')
      expect(removed).not.toBeNull()
    })

    it('CLEAR empties the stack but keeps the history', () => {
      store.NOTIFY({ severity: 'error' })
      store.CLEAR()
      expect(store.stack).toHaveLength(0)
      expect(store.history).toHaveLength(1)
    })
  })
})
