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
