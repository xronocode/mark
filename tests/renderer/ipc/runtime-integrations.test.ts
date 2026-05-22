/**
 * Tests for src/renderer/src/ipc/runtime/integrations.ts
 *
 * Covers: ipcShortcut, ipcSpell, ipcMenu, ipcPandoc, ipcUpdater,
 * ipcScreenshot, ipcSecret — all thin wrappers over ipcInvoke.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import {
  ipcShortcut,
  ipcSpell,
  ipcMenu,
  ipcPandoc,
  ipcUpdater,
  ipcScreenshot,
  ipcSecret
} from '@/ipc/runtime/integrations'

// Mock vue
vi.mock('vue', () => ({ onUnmounted: vi.fn() }))

describe('ipcShortcut', () => {
  it('register calls ipcInvoke with command and accelerator', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(undefined)
    await ipcShortcut.register('edit.copy', 'CmdOrCtrl+C')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_shortcut_register', {
      command: 'edit.copy',
      accelerator: 'CmdOrCtrl+C'
    })
  })

  it('unregister calls ipcInvoke with command', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(undefined)
    await ipcShortcut.unregister('edit.copy')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_shortcut_unregister', {
      command: 'edit.copy'
    })
  })

  it('list calls ipcInvoke and returns array', async () => {
    const shortcuts = [{ command: 'edit.copy', accelerator: { modifiers: 8, key: 'c' } }]
    ;(tauriInvoke as any).mockResolvedValueOnce(shortcuts)

    const result = await ipcShortcut.list()
    expect(tauriInvoke).toHaveBeenCalledWith('mt_shortcut_list', {})
    expect(result).toEqual(shortcuts)
  })
})

describe('ipcSpell', () => {
  it('getConfig returns enabled + lang', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce({ enabled: true, lang: 'en-US' })

    const result = await ipcSpell.getConfig()
    expect(tauriInvoke).toHaveBeenCalledWith('mt_spell_get_config', {})
    expect(result).toEqual({ enabled: true, lang: 'en-US' })
  })

  it('setEnabled calls ipcInvoke', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(undefined)
    await ipcSpell.setEnabled(false)
    expect(tauriInvoke).toHaveBeenCalledWith('mt_spell_set_enabled', { enabled: false })
  })

  it('setLang calls ipcInvoke', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(undefined)
    await ipcSpell.setLang('de-DE')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_spell_set_lang', { lang: 'de-DE' })
  })
})

describe('ipcMenu', () => {
  it('taxonomy returns menu items', async () => {
    const items = [{ id: 'file', label: 'File', command: null, accelerator: null, items: null }]
    ;(tauriInvoke as any).mockResolvedValueOnce(items)

    const result = await ipcMenu.taxonomy()
    expect(tauriInvoke).toHaveBeenCalledWith('mt_menu_taxonomy', {})
    expect(result).toEqual(items)
  })
})

describe('ipcPandoc', () => {
  it('status returns availability info', async () => {
    const status = { available: true, version: '3.1', path: '/usr/bin/pandoc' }
    ;(tauriInvoke as any).mockResolvedValueOnce(status)

    const result = await ipcPandoc.status()
    expect(tauriInvoke).toHaveBeenCalledWith('mt_pandoc_status', {})
    expect(result).toEqual(status)
  })

  it('export calls ipcInvoke with input and format', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(new Uint8Array([1, 2, 3]))

    const result = await ipcPandoc.export('# Hello', 'pdf')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_pandoc_export', {
      input: '# Hello',
      format: 'pdf'
    })
    expect(result).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('ipcUpdater', () => {
  it('check returns update info', async () => {
    const info = {
      currentVersion: '2.0.0',
      available: true,
      latestVersion: '2.1.0',
      downloadUrl: 'https://example.com/update',
      statusNote: null
    }
    ;(tauriInvoke as any).mockResolvedValueOnce(info)

    const result = await ipcUpdater.check()
    expect(tauriInvoke).toHaveBeenCalledWith('mt_updater_check', {})
    expect(result).toEqual(info)
  })
})

describe('ipcScreenshot', () => {
  it('capture without mode passes empty options', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(new Uint8Array([0xFF]))

    await ipcScreenshot.capture()
    expect(tauriInvoke).toHaveBeenCalledWith('mt_screenshot_capture', { options: {} })
  })

  it('capture with mode passes { mode }', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(new Uint8Array([0xFF]))

    await ipcScreenshot.capture('window')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_screenshot_capture', {
      options: { mode: 'window' }
    })
  })

  it('capture with interactive mode', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(new Uint8Array([]))

    await ipcScreenshot.capture('interactive')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_screenshot_capture', {
      options: { mode: 'interactive' }
    })
  })
})

describe('ipcSecret', () => {
  it('set calls ipcInvoke with key and value', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(undefined)
    await ipcSecret.set('api-key', 'secret123')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_secret_set', {
      key: 'api-key',
      value: 'secret123'
    })
  })

  it('get returns string or null', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce('secret123')
    const result = await ipcSecret.get('api-key')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_secret_get', { key: 'api-key' })
    expect(result).toBe('secret123')
  })

  it('get returns null for missing key', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(null)
    const result = await ipcSecret.get('nope')
    expect(result).toBeNull()
  })

  it('delete calls ipcInvoke', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(undefined)
    await ipcSecret.delete('api-key')
    expect(tauriInvoke).toHaveBeenCalledWith('mt_secret_delete', { key: 'api-key' })
  })
})
