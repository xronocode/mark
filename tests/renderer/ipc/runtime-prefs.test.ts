/**
 * Tests for src/renderer/src/ipc/runtime/prefs.ts
 *
 * Covers: ipcPrefs.get, set, getAll, ipcWorkspace.set.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { ipcPrefs, ipcWorkspace } from '@/ipc/runtime/prefs'

// Mock vue
vi.mock('vue', () => ({ onUnmounted: vi.fn() }))

describe('ipcPrefs', () => {
  describe('get', () => {
    it('calls ipcInvoke with mt::prefs::get and returns value', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce('dark')

      const result = await ipcPrefs.get('theme')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_prefs_get', { key: 'theme' })
      expect(result).toBe('dark')
    })

    it('returns null for absent key', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(null)

      const result = await ipcPrefs.get('nonexistent')
      expect(result).toBeNull()
    })

    it('supports generic type parameter', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(42)

      const result = await ipcPrefs.get<number>('fontSize')
      expect(result).toBe(42)
    })

    it('propagates errors', async () => {
      ;(tauriInvoke as any).mockRejectedValueOnce('error')
      await expect(ipcPrefs.get('key')).rejects.toThrow()
    })
  })

  describe('set', () => {
    it('calls ipcInvoke with mt::prefs::set and key/value', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

      await ipcPrefs.set('theme', 'light')

      expect(tauriInvoke).toHaveBeenCalledWith('mt_prefs_set', {
        key: 'theme',
        value: 'light'
      })
    })

    it('handles object values', async () => {
      ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

      await ipcPrefs.set('editor', { tabSize: 4, wordWrap: true })

      expect(tauriInvoke).toHaveBeenCalledWith('mt_prefs_set', {
        key: 'editor',
        value: { tabSize: 4, wordWrap: true }
      })
    })
  })

  describe('getAll', () => {
    it('calls ipcInvoke with mt::prefs::get_all and empty args', async () => {
      const prefs = { theme: 'dark', fontSize: 14 }
      ;(tauriInvoke as any).mockResolvedValueOnce(prefs)

      const result = await ipcPrefs.getAll()

      expect(tauriInvoke).toHaveBeenCalledWith('mt_prefs_get_all', {})
      expect(result).toEqual(prefs)
    })
  })
})

describe('ipcWorkspace', () => {
  it('set calls ipcInvoke with mt::workspace::set and path', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

    await ipcWorkspace.set('/Users/dev/project')

    expect(tauriInvoke).toHaveBeenCalledWith('mt_workspace_set', {
      path: '/Users/dev/project'
    })
  })

  it('propagates errors from backend', async () => {
    ;(tauriInvoke as any).mockRejectedValueOnce('path not found')
    await expect(ipcWorkspace.set('/invalid')).rejects.toThrow()
  })
})
