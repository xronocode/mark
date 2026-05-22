/**
 * Tests for src/renderer/src/ipc/runtime/fs.ts
 *
 * Covers: ipcFs.read, write, stat, readdir, unlink — all delegate
 * to ipcInvoke with the correct command and args.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { ipcFs } from '@/ipc/runtime/fs'

// Mock vue
vi.mock('vue', () => ({ onUnmounted: vi.fn() }))

describe('ipcFs', () => {
  describe('read', () => {
    it('calls ipcInvoke with mt::fs::read and path arg', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce('file content')

      const result = await ipcFs.read('/test.md')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_fs_read', { path: '/test.md' })
      expect(result).toBe('file content')
    })

    it('propagates errors', async () => {
      ;(tauriInvoke as any).mockRejectedValueOnce('missing field `path`')
      await expect(ipcFs.read('')).rejects.toThrow()
    })
  })

  describe('write', () => {
    it('calls ipcInvoke with mt::fs::write and path/content args', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

      await ipcFs.write('/out.md', '# Hello')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_fs_write', {
        path: '/out.md',
        content: '# Hello'
      })
    })

    it('propagates errors', async () => {
      ;(tauriInvoke as any).mockRejectedValueOnce('permission denied')
      await expect(ipcFs.write('/root/x', 'data')).rejects.toThrow()
    })
  })

  describe('stat', () => {
    it('calls ipcInvoke with mt::fs::stat and returns FsStat', async () => {
      const mockStat = {
        size: 1024,
        mode: 33188,
        mtimeMs: Date.now(),
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false
      }
      ;(tauriInvoke as any).mockResolvedValueOnce(mockStat)

      const result = await ipcFs.stat('/test.md')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_fs_stat', { path: '/test.md' })
      expect(result).toEqual(mockStat)
    })
  })

  describe('readdir', () => {
    it('calls ipcInvoke with mt::fs::readdir and returns string[]', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(['a.md', 'b.md', 'c.txt'])

      const result = await ipcFs.readdir('/docs')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_fs_readdir', { path: '/docs' })
      expect(result).toEqual(['a.md', 'b.md', 'c.txt'])
    })
  })

  describe('unlink', () => {
    it('calls ipcInvoke with mt::fs::unlink', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

      await ipcFs.unlink('/tmp/dead.md')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_fs_unlink', { path: '/tmp/dead.md' })
    })

    it('propagates errors', async () => {
      ;(tauriInvoke as any).mockRejectedValueOnce('is a directory')
      await expect(ipcFs.unlink('/dir')).rejects.toThrow()
    })
  })
})
