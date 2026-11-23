/**
 * Unit contract tests for store/recentlyClosed.js (C-FIX-009-RECENTLY-CLOSED).
 * Pins the owner-approved history semantics from the 2.5.x-next train
 * entry: dedup to the newest close, consume on any open, bounded list,
 * deterministic Reopen-all ordering with active-tab metadata, missing-
 * file drops with notices, clear, and the memory-only cold-start state.
 * C-SESSION-DURABILITY: the stat verdict is tri-state (the shared
 * exported filePositionStore.statFileExists) — an entry is dropped ONLY
 * on a confirmed-missing verdict (isFile:false or an MT_FS_NOT_FOUND-
 * coded rejection); a cannot-tell verdict keeps the entry behind its own
 * localized notice. The stat seam is window.fileUtils.stat (the
 * file-position-store.test.js:255-285 injection precedent): the vitest
 * setup's default stat answers is_file:true, per-test overrides stub
 * window.fileUtils.stat directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia } from 'pinia'
import { setupTestPinia } from '../pinia'

vi.mock('@/ipc/runtime', () => ({
  ipcFs: {
    stat: vi.fn(async () => ({ isFile: true, isDirectory: false, mtimeMs: 1 }))
  },
  ipcWatch: { subscribe: vi.fn(async () => vi.fn()) },
  ipcRecent: { add: vi.fn(), list: vi.fn(), clear: vi.fn() },
  ipcPrefs: { get: vi.fn(), set: vi.fn() }
}))
vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(async () => undefined) }
}))
vi.mock('@/i18n', () => ({
  default: { global: { t: (k) => k } },
  i18n: { global: { t: (k) => k } },
  t: (k) => k
}))
vi.mock('../bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

import notice from '@/services/notification'
import bus from '@/bus'
import {
  RECENTLY_CLOSED_MAX,
  useRecentlyClosedStore
} from '@/store/recentlyClosed'

const electronInvoke = vi.fn(async () => true)

// C-SESSION-DURABILITY: the coded-rejection injection seam — the shared
// verdict helper reads window.fileUtils.stat (the setup installs a
// default is_file:true stat per test; overrides stub it directly).
const stubStat = (impl) => {
  window.fileUtils.stat = vi.fn(impl)
}
const codedError = (code, message = 'stat failed') => {
  const err = new Error(message)
  err.code = code
  return err
}

describe('store/recentlyClosed.js (C-FIX-009-RECENTLY-CLOSED)', () => {
  let store

  const record = (pathname, extra = {}) =>
    store.RECORD_CLOSE({
      pathname,
      filename: pathname.split('/').pop(),
      stripIndex: 0,
      wasActive: false,
      root: '',
      closedAt: 1,
      ...extra
    })

  beforeEach(() => {
    setActivePinia(setupTestPinia())
    store = useRecentlyClosedStore()
    electronInvoke.mockClear()
    electronInvoke.mockResolvedValue(true)
    window.electron = { ipcRenderer: { invoke: electronInvoke, send: vi.fn() } }
    stubStat(async () => ({ isFile: true, isDirectory: false, mtimeMs: 1 }))
    vi.mocked(notice.notify).mockClear()
    vi.mocked(bus.emit).mockClear()
  })

  it('starts empty (a cold launch clears the history by construction)', () => {
    expect(store.entries).toEqual([])
    expect(store.count).toBe(0)
    expect(store.isEmpty).toBe(true)
    expect(store.newest).toBeNull()
  })

  it('records closed saved-file tabs newest-first', () => {
    record('/tmp/a.md', { closedAt: 1 })
    record('/tmp/b.md', { closedAt: 2 })
    expect(store.entries.map((e) => e.pathname)).toEqual(['/tmp/b.md', '/tmp/a.md'])
    expect(store.count).toBe(2)
  })

  it('never records a tab without a pathname (untitled drafts stay outside)', () => {
    store.RECORD_CLOSE({ pathname: '', filename: 'untitled.md' })
    store.RECORD_CLOSE({ filename: 'no-path.md' })
    expect(store.isEmpty).toBe(true)
  })

  it('deduplicates a repeatedly closed pathname to its newest entry', () => {
    record('/tmp/a.md', { closedAt: 1, stripIndex: 3 })
    record('/tmp/b.md', { closedAt: 2 })
    record('/tmp/a.md', { closedAt: 5, stripIndex: 0, wasActive: true })
    expect(store.entries.map((e) => e.pathname)).toEqual(['/tmp/a.md', '/tmp/b.md'])
    expect(store.entries[0].closedAt).toBe(5)
    expect(store.entries[0].wasActive).toBe(true)
  })

  it('bounds the list at RECENTLY_CLOSED_MAX, evicting the oldest closes', () => {
    for (let i = 0; i < RECENTLY_CLOSED_MAX + 5; i++) {
      record(`/tmp/f${i}.md`, { closedAt: i })
    }
    expect(store.count).toBe(RECENTLY_CLOSED_MAX)
    // Newest kept at the head; the five oldest closes evicted.
    expect(store.entries[0].pathname).toBe(`/tmp/f${RECENTLY_CLOSED_MAX + 4}.md`)
    expect(store.entries.some((e) => e.pathname === '/tmp/f0.md')).toBe(false)
  })

  it('CONSUME removes a matching entry (any independent open path)', () => {
    record('/tmp/a.md')
    record('/tmp/b.md')
    store.CONSUME('/tmp/a.md')
    expect(store.entries.map((e) => e.pathname)).toEqual(['/tmp/b.md'])
    store.CONSUME('/tmp/not-there.md')
    expect(store.count).toBe(1)
  })

  it('CLEAR empties the history', () => {
    record('/tmp/a.md')
    store.CLEAR()
    expect(store.isEmpty).toBe(true)
  })

  it('REOPEN_ONE opens through mt::open-file and consumes only on success', async () => {
    record('/tmp/a.md')
    electronInvoke.mockRejectedValueOnce(new Error('ipc down'))
    await expect(store.REOPEN_ONE(store.entries[0])).resolves.toBe(false)
    expect(store.count).toBe(1) // failed open keeps the entry
    electronInvoke.mockResolvedValue(true)
    await expect(store.REOPEN_ONE(store.entries[0])).resolves.toBe(true)
    expect(electronInvoke).toHaveBeenCalledWith('mt::open-file', '/tmp/a.md', {})
    expect(store.isEmpty).toBe(true)
  })

  it('REOPEN_ONE drops a missing file with a visible notice (never a silent no-op)', async () => {
    // C-SESSION-DURABILITY unfolded: the drop path requires a CONFIRMED
    // missing verdict — a coded MT_FS_NOT_FOUND rejection. Assertions
    // carry over unchanged from the pre-tri-state pin.
    record('/tmp/gone.md')
    stubStat(async () => { throw codedError('MT_FS_NOT_FOUND', 'No such file or directory') })
    await expect(store.REOPEN_ONE(store.entries[0])).resolves.toBe(false)
    expect(store.isEmpty).toBe(true)
    expect(notice.notify).toHaveBeenCalledTimes(1)
    expect(notice.notify.mock.calls[0][0].message).toBe('recent.recentlyClosed.missingNotice')
    expect(electronInvoke).not.toHaveBeenCalled()
  })

  it('reopen_one_keeps_the_entry_when_the_stat_verdict_is_cannot_tell', async () => {
    // An EACCES-class rejection carries no NOT_FOUND code: the verdict
    // is «cannot tell» — the entry stays recoverable, nothing opens, and
    // the transient notice is the NEW unverified copy, never the
    // confirmed-missing one.
    record('/tmp/locked.md')
    stubStat(async () => { throw codedError('MT_FS_PERM_DENIED', 'Permission denied') })
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(store.REOPEN_ONE(store.entries[0])).resolves.toBe(false)
    expect(store.count).toBe(1)
    expect(electronInvoke).not.toHaveBeenCalled()
    expect(notice.notify).toHaveBeenCalledTimes(1)
    const shown = notice.notify.mock.calls[0][0]
    expect(shown.message).toBe('recent.recentlyClosed.unverifiedNotice')
    expect(shown.message).not.toBe('recent.recentlyClosed.missingNotice')
    expect(String(shown.message)).not.toContain('missingNotice')
    expect(info).toHaveBeenCalledWith(expect.stringContaining('[RecentlyClosed][REOPEN_ONE][BLOCK_REOPEN_UNVERIFIED] file=locked.md'))
    info.mockRestore()
  })

  it('reopen_one_still_drops_on_confirmed_not_found', async () => {
    // The tri-state keeps today's exact drop behavior for a confirmed
    // false verdict (isFile:false counts the same way — a directory is
    // not an openable document).
    record('/tmp/gone.md')
    stubStat(async () => { throw codedError('MT_FS_NOT_FOUND') })
    await expect(store.REOPEN_ONE(store.entries[0])).resolves.toBe(false)
    expect(store.isEmpty).toBe(true)
    expect(electronInvoke).not.toHaveBeenCalled()
    expect(notice.notify.mock.calls[0][0].message).toBe('recent.recentlyClosed.missingNotice')
  })

  it('reopen_one_default_checker_maps_coded_not_found_to_confirmed_missing', async () => {
    // The default checker's code mapping (the file-position-store.test.js
    // :229/:255 precedent, mirrored through the shared exported verdict
    // helper): MT_FS_NOT_FOUND → confirmed missing → drop;
    // MT_FS_PERM_DENIED → cannot tell → keep.
    record('/tmp/n.md')
    record('/tmp/p.md')
    stubStat(async (p) => {
      throw codedError(
        p === '/tmp/n.md' ? 'MT_FS_NOT_FOUND' : 'MT_FS_PERM_DENIED',
        p === '/tmp/n.md' ? 'No such file or directory' : 'Permission denied'
      )
    })
    const n = store.entries.find((e) => e.pathname === '/tmp/n.md')
    const p = store.entries.find((e) => e.pathname === '/tmp/p.md')
    await expect(store.REOPEN_ONE(n)).resolves.toBe(false)
    expect(store.entries.map((e) => e.pathname)).toEqual(['/tmp/p.md'])
    await expect(store.REOPEN_ONE(p)).resolves.toBe(false)
    expect(store.count).toBe(1)
  })

  it('REOPEN_NEWEST reopens the newest entry and is a quiet no-op when empty', async () => {
    await expect(store.REOPEN_NEWEST()).resolves.toBe(false)
    expect(electronInvoke).not.toHaveBeenCalled()
    record('/tmp/a.md', { closedAt: 1 })
    record('/tmp/b.md', { closedAt: 2 })
    await expect(store.REOPEN_NEWEST()).resolves.toBe(true)
    expect(electronInvoke).toHaveBeenCalledWith('mt::open-file', '/tmp/b.md', {})
    expect(store.entries.map((e) => e.pathname)).toEqual(['/tmp/a.md'])
  })

  it('REOPEN_ALL reopens in ascending strip order regardless of close order', async () => {
    // Closed right-to-left: c (index 2, active) first, then b (1), a (0).
    record('/tmp/c.md', { closedAt: 3, stripIndex: 2, wasActive: true })
    record('/tmp/b.md', { closedAt: 2, stripIndex: 1 })
    record('/tmp/a.md', { closedAt: 1, stripIndex: 0 })
    const openedOrder = []
    electronInvoke.mockImplementation(async (_cmd, path) => {
      openedOrder.push(path)
      return true
    })
    const result = await store.REOPEN_ALL()
    expect(openedOrder).toEqual(['/tmp/a.md', '/tmp/b.md', '/tmp/c.md'])
    expect(result).toMatchObject({ reopened: 3, missing: 0, active: '/tmp/c.md' })
    expect(bus.emit).toHaveBeenCalledWith('mt::recently-closed-select', {
      pathname: '/tmp/c.md'
    })
    expect(store.isEmpty).toBe(true)
  })

  it('REOPEN_ALL drops missing files with one combined notice and continues', async () => {
    // C-SESSION-DURABILITY unfolded: the up-front drop requires a
    // CONFIRMED missing verdict — a coded MT_FS_NOT_FOUND rejection.
    // Assertions carry over unchanged from the pre-tri-state pin.
    record('/tmp/a.md', { closedAt: 1, stripIndex: 0 })
    record('/tmp/gone.md', { closedAt: 2, stripIndex: 1 })
    record('/tmp/b.md', { closedAt: 3, stripIndex: 2, wasActive: true })
    stubStat(async (p) => {
      if (p === '/tmp/gone.md') throw codedError('MT_FS_NOT_FOUND', 'No such file or directory')
      return { isFile: true, isDirectory: false, mtimeMs: 1 }
    })
    const openedOrder = []
    electronInvoke.mockImplementation(async (_cmd, path) => {
      openedOrder.push(path)
      return true
    })
    const result = await store.REOPEN_ALL()
    expect(openedOrder).toEqual(['/tmp/a.md', '/tmp/b.md'])
    expect(result).toMatchObject({ reopened: 2, missing: 1, active: '/tmp/b.md' })
    expect(notice.notify).toHaveBeenCalledTimes(1)
    expect(notice.notify.mock.calls[0][0].message).toBe('recent.recentlyClosed.someMissingNotice')
    expect(store.isEmpty).toBe(true)
  })

  it('reopen_all_keeps_transient_entries_and_counts_only_confirmed_missing', async () => {
    // A cannot-tell entry is neither opened nor consumed — it stays in
    // the list for the next attempt and is reported by its own localized
    // notice; missing counts CONFIRMED-missing only.
    record('/tmp/a.md', { closedAt: 1, stripIndex: 0 })
    record('/tmp/gone.md', { closedAt: 2, stripIndex: 1 })
    record('/tmp/flaky.md', { closedAt: 3, stripIndex: 2 })
    record('/tmp/b.md', { closedAt: 4, stripIndex: 3, wasActive: true })
    stubStat(async (p) => {
      if (p === '/tmp/gone.md') throw codedError('MT_FS_NOT_FOUND', 'No such file or directory')
      if (p === '/tmp/flaky.md') throw new Error('i/o timeout')
      return { isFile: true, isDirectory: false, mtimeMs: 1 }
    })
    const openedOrder = []
    electronInvoke.mockImplementation(async (_cmd, path) => {
      openedOrder.push(path)
      return true
    })
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const result = await store.REOPEN_ALL()
    expect(openedOrder).toEqual(['/tmp/a.md', '/tmp/b.md'])
    expect(result).toMatchObject({ reopened: 2, missing: 1, active: '/tmp/b.md' })
    // The transient entry survives for the next attempt.
    expect(store.entries.map((e) => e.pathname)).toEqual(['/tmp/flaky.md'])
    const messages = notice.notify.mock.calls.map((c) => c[0].message)
    expect(messages).toContain('recent.recentlyClosed.someMissingNotice')
    expect(messages).toContain('recent.recentlyClosed.someUnverifiedNotice')
    expect(info).toHaveBeenCalledWith(expect.stringContaining('unverified=1'))
    info.mockRestore()
  })

  it('reopen_all_still_drops_on_confirmed_not_found', async () => {
    // The tri-state keeps today's exact up-front drop for confirmed
    // false verdicts: the rest still reopens in strip order.
    record('/tmp/a.md', { closedAt: 1, stripIndex: 0 })
    record('/tmp/gone.md', { closedAt: 2, stripIndex: 1 })
    record('/tmp/b.md', { closedAt: 3, stripIndex: 2, wasActive: true })
    stubStat(async (p) => {
      if (p === '/tmp/gone.md') throw codedError('MT_FS_NOT_FOUND')
      return { isFile: true, isDirectory: false, mtimeMs: 1 }
    })
    const openedOrder = []
    electronInvoke.mockImplementation(async (_cmd, path) => {
      openedOrder.push(path)
      return true
    })
    const result = await store.REOPEN_ALL()
    expect(openedOrder).toEqual(['/tmp/a.md', '/tmp/b.md'])
    expect(result).toMatchObject({ reopened: 2, missing: 1, active: '/tmp/b.md' })
    expect(store.isEmpty).toBe(true)
    expect(notice.notify.mock.calls[0][0].message).toBe('recent.recentlyClosed.someMissingNotice')
  })

  it('a repeated close/reopen cycle drains the history to empty', async () => {
    record('/tmp/a.md')
    for (let round = 0; round < 3; round++) {
      await store.REOPEN_NEWEST()
      expect(store.isEmpty).toBe(true)
      record('/tmp/a.md', { closedAt: round + 2 })
    }
    expect(store.count).toBe(1)
    await store.REOPEN_NEWEST()
    expect(store.isEmpty).toBe(true)
    await expect(store.REOPEN_NEWEST()).resolves.toBe(false)
  })
})

describe('REOPEN_ALL accuracy (review wave 2)', () => {
  beforeEach(() => {
    setActivePinia(setupTestPinia())
    window.electron = { ipcRenderer: { invoke: electronInvoke, send: vi.fn() } }
    stubStat(async () => ({ isFile: true, isDirectory: false, mtimeMs: 1 }))
    vi.mocked(notice.notify).mockClear()
    vi.mocked(bus.emit).mockClear()
    electronInvoke.mockClear()
    electronInvoke.mockResolvedValue(true)
  })

  it('the empty-list early return keeps its exact shape without an active key', async () => {
    // C-SESSION-DURABILITY (review minor 3): the asymmetry is preserved
    // byte-identically — { reopened, missing } only, NO active key.
    const store = useRecentlyClosedStore()
    await expect(store.REOPEN_ALL()).resolves.toEqual({ reopened: 0, missing: 0 })
  })

  it('a directory that answers stat is not openable: only isFile entries reopen', async () => {
    const store = useRecentlyClosedStore()
    store.RECORD_CLOSE({ pathname: '/tmp/dir', filename: 'dir', stripIndex: 0, wasActive: false, root: '', closedAt: 1 })
    store.RECORD_CLOSE({ pathname: '/tmp/a.md', filename: 'a.md', stripIndex: 1, wasActive: false, root: '', closedAt: 2 })
    stubStat(async (p) =>
      p === '/tmp/dir'
        ? { isFile: false, isDirectory: true, mtimeMs: 1 }
        : { isFile: true, isDirectory: false, mtimeMs: 1 })
    const result = await store.REOPEN_ALL()
    expect(result).toMatchObject({ reopened: 1, missing: 1 })
    expect(electronInvoke).toHaveBeenCalledTimes(1)
    expect(electronInvoke).toHaveBeenCalledWith('mt::open-file', '/tmp/a.md', {})
  })

  it('failed opens are not counted as reopened and never become the selection target', async () => {
    const store = useRecentlyClosedStore()
    store.RECORD_CLOSE({ pathname: '/tmp/ok1.md', filename: 'ok1.md', stripIndex: 0, wasActive: true, root: '', closedAt: 1 })
    store.RECORD_CLOSE({ pathname: '/tmp/fails.md', filename: 'fails.md', stripIndex: 1, wasActive: true, root: '', closedAt: 2 })
    electronInvoke.mockImplementation(async (_cmd, path) => {
      if (path === '/tmp/fails.md') throw new Error('ipc down')
      return true
    })
    const result = await store.REOPEN_ALL()
    // Both were stat-live, but only one invoke succeeded; the active
    // selection falls back to the newest SUCCESS (ok1), never the
    // failed tab.
    expect(result).toMatchObject({ reopened: 1, missing: 0, active: '/tmp/ok1.md' })
    expect(bus.emit).toHaveBeenCalledWith('mt::recently-closed-select', { pathname: '/tmp/ok1.md' })
  })

  it('when every open fails, no selection event fires and nothing is reported reopened', async () => {
    const store = useRecentlyClosedStore()
    store.RECORD_CLOSE({ pathname: '/tmp/x.md', filename: 'x.md', stripIndex: 0, wasActive: true, root: '', closedAt: 1 })
    electronInvoke.mockRejectedValue(new Error('ipc down'))
    const result = await store.REOPEN_ALL()
    expect(result).toMatchObject({ reopened: 0, missing: 0, active: null })
    expect(bus.emit).not.toHaveBeenCalled()
    // Failed entries stay recoverable.
    expect(store.count).toBe(1)
  })
})
