/**
 * Tests for src/renderer/src/ipc/runtime/recent.ts
 *
 * Covers: ipcRecent.add, list, clear.
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
})
