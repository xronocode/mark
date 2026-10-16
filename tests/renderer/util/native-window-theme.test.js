// FILE: tests/renderer/util/native-window-theme.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin that the native window appearance follows the theme's dark/light classification (Settings title bar, C-51 T-008), deduplicated and skipped outside Tauri.
//   SCOPE: src/renderer/src/util/nativeWindowTheme.js with @tauri-apps/api/window mocked; util/theme.js addThemeStyle wiring; capability files.
//   DEPENDS: vitest, jsdom, src/renderer/src/util/nativeWindowTheme.js, src/renderer/src/util/theme.js.
//   LINKS: C-51 T-008; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   setTheme - the mocked window setTheme spy.
//   readCapability - read a capability JSON from src-tauri/capabilities.
// END_MODULE_MAP

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const setTheme = vi.fn(async () => {})
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setTheme }) }))

const readCapability = (name) =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../src-tauri/capabilities', name), 'utf8'))

describe('syncNativeWindowTheme (C-51 T-008)', () => {
  let mod
  beforeEach(async () => {
    setTheme.mockClear()
    window.__TAURI_INTERNALS__ = {}
    mod = await import('@/util/nativeWindowTheme')
    mod.resetNativeWindowThemeForTests()
  })
  afterEach(() => {
    delete window.__TAURI_INTERNALS__
  })

  it('applies dark and light to the current window', async () => {
    expect(await mod.syncNativeWindowTheme(true)).toBe('dark')
    expect(await mod.syncNativeWindowTheme(false)).toBe('light')
    expect(setTheme.mock.calls).toEqual([['dark'], ['light']])
  })

  it('does not call again for the same value', async () => {
    await mod.syncNativeWindowTheme(true)
    expect(await mod.syncNativeWindowTheme(true)).toBeNull()
    expect(setTheme).toHaveBeenCalledTimes(1)
  })

  it('is a no-op outside Tauri', async () => {
    delete window.__TAURI_INTERNALS__
    expect(await mod.syncNativeWindowTheme(true)).toBeNull()
    expect(setTheme).not.toHaveBeenCalled()
  })

  it('a failed setTheme is retried on the next call', async () => {
    setTheme.mockRejectedValueOnce(new Error('denied'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await mod.syncNativeWindowTheme(true)).toBeNull()
    expect(await mod.syncNativeWindowTheme(true)).toBe('dark')
    warn.mockRestore()
  })

  it('addThemeStyle syncs the window with the theme classification', async () => {
    const { addThemeStyle } = await import('@/util/theme')
    addThemeStyle('ink')
    await vi.waitFor(() => expect(setTheme).toHaveBeenCalledWith('dark'))
    addThemeStyle('paper')
    await vi.waitFor(() => expect(setTheme).toHaveBeenLastCalledWith('light'))
  })

  it('both capabilities grant setTheme to main and settings', () => {
    for (const name of ['default.json', 'mas.json']) {
      const cap = readCapability(name)
      expect(cap.windows).toEqual(expect.arrayContaining(['main', 'settings']))
      expect(cap.permissions).toContain('core:window:allow-set-theme')
    }
  })
})
