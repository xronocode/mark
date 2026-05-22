/**
 * Tests for src/renderer/src/ipc/runtime/fonts.ts
 *
 * Covers: ipcFonts.list() — delegates to ipcInvoke('mt::fonts::list', {}).
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { ipcFonts } from '@/ipc/runtime/fonts'

// Mock vue
vi.mock('vue', () => ({ onUnmounted: vi.fn() }))

describe('ipcFonts', () => {
  it('exports a list function', () => {
    expect(typeof ipcFonts.list).toBe('function')
  })

  it('list() calls ipcInvoke with mt::fonts::list and empty args', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(['Arial', 'Helvetica', 'Courier New'])

    const result = await ipcFonts.list()

    expect(tauriInvoke).toHaveBeenCalledWith('mt_fonts_list', {})
    expect(result).toEqual(['Arial', 'Helvetica', 'Courier New'])
  })

  it('list() returns empty array when backend returns empty', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce([])

    const result = await ipcFonts.list()
    expect(result).toEqual([])
  })

  it('list() propagates errors from ipcInvoke', async () => {
    ;(tauriInvoke as any).mockRejectedValueOnce('command mt_fonts_list not found')

    await expect(ipcFonts.list()).rejects.toThrow()
  })
})
