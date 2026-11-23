/**
 * Tests for src/renderer/src/ipc/runtime/recent.ts
 *
 * Covers: ipcRecent.add, list, clear, remove, insert (C-46 welcome
 * screen remove + undo pair).
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { ipcRecent } from '@/ipc/runtime/recent'

// Mock vue
vi.mock('vue', () => ({ onUnmounted: vi.fn() }))

describe('ipcRecent', () => {
  describe('add', () => {
    it('calls ipcInvoke with mt::recent::add and path', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

      await ipcRecent.add('/docs/readme.md')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_recent_add', { path: '/docs/readme.md' })
    })

    it('propagates errors', async () => {
      ;(tauriInvoke as any).mockRejectedValueOnce('error')
      await expect(ipcRecent.add('/x')).rejects.toThrow()
    })
  })

  describe('add serialization (C-RECENTS-SERIALIZE T-003)', () => {
    it('parallel_adds_invoke_one_at_a_time_and_all_resolve', async () => {
      // C-RECENTS-SERIALIZE T-003: the facade serializes add behind one
      // chained-promise queue — while the FIRST mt_recent_add invoke is
      // pending, NO second invoke may be issued (pre-fix both invokes
      // fire concurrently, which the red run records); after release
      // every queued add resolves and per-caller results keep
      // propagating. Deterministic: a controlled pending-first mock, no
      // timers, no sleeps — only microtask turns.
      let releaseFirst!: () => void
      const firstPending = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      let inFlight = 0
      ;(tauriInvoke as any).mockImplementationOnce(() => {
        inFlight += 1
        return firstPending.then(() => {
          inFlight -= 1
        })
      })

      const first = ipcRecent.add('/docs/one.md')
      await vi.waitFor(() => expect(tauriInvoke).toHaveBeenCalledTimes(1))
      expect(inFlight).toBe(1)

      const second = ipcRecent.add('/docs/two.md')
      const third = ipcRecent.add('/docs/three.md')

      // Give any eager (pre-fix) implementation every chance to fire —
      // several microtask turns, still no timers and no sleeps. The
      // pending first invoke must remain the ONLY one issued.
      for (let i = 0; i < 10; i++) await Promise.resolve()
      expect(tauriInvoke).toHaveBeenCalledTimes(1)
      expect(inFlight).toBe(1)

      releaseFirst()
      await Promise.all([first, second, third])
      expect(tauriInvoke).toHaveBeenCalledTimes(3)
      expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'mt_recent_add', { path: '/docs/two.md' })
      expect(tauriInvoke).toHaveBeenNthCalledWith(3, 'mt_recent_add', { path: '/docs/three.md' })
    })

    it('a_rejecting_add_fails_only_its_own_caller', async () => {
      // C-RECENTS-SERIALIZE T-003: queue-continuity guard — one
      // rejecting add fails ONLY its own caller while adds behind it
      // still resolve. Recorded honestly as green-by-design on the
      // baseline (there is no queue to break before the facade queue
      // lands); the contract binds the post-fix implementation: a
      // rejection must never poison the queue chain.
      ;(tauriInvoke as any)
        .mockRejectedValueOnce(new Error('recent add boom'))
        .mockResolvedValueOnce(undefined)

      await expect(ipcRecent.add('/docs/bad.md')).rejects.toThrow('recent add boom')
      await expect(ipcRecent.add('/docs/good.md')).resolves.toBeUndefined()
    })
  })

  describe('list', () => {
    it('calls ipcInvoke with mt::recent::list and returns string[]', async () => {
      const paths = ['/a.md', '/b.md', '/c.md']
      ;(tauriInvoke as any).mockResolvedValueOnce(paths)

      const result = await ipcRecent.list()

      expect(tauriInvoke).toHaveBeenCalledWith('mt_recent_list', {})
      expect(result).toEqual(paths)
    })

    it('returns empty array when no recent docs', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce([])
      const result = await ipcRecent.list()
      expect(result).toEqual([])
    })
  })

  describe('clear', () => {
    it('calls ipcInvoke with mt::recent::clear', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

      await ipcRecent.clear()

      expect(tauriInvoke).toHaveBeenCalledWith('mt_recent_clear', {})
    })
  })

  describe('remove', () => {
    it('calls ipcInvoke with mt::recent::remove and returns the old index', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(2)

      const result = await ipcRecent.remove('/docs/gone.md')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_recent_remove', { path: '/docs/gone.md' })
      expect(result).toBe(2)
    })

    it('returns null when the path was not in the list', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(null)
      await expect(ipcRecent.remove('/never-there.md')).resolves.toBeNull()
    })
  })

  describe('insert', () => {
    it('calls ipcInvoke with mt::recent::insert, path and index', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

      await ipcRecent.insert('/docs/back.md', 1)

      expect(tauriInvoke).toHaveBeenCalledWith('mt_recent_insert', { path: '/docs/back.md', index: 1 })
    })
  })
})
