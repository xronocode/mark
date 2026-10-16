/**
 * C-52 T-001 — File › Open from Clipboard wiring pins.
 *
 * Covers:
 *   - the renderer command registry carries file.open-from-clipboard
 *     (the native menu item added in m009_menu.rs dispatches this id via
 *     mt::menu-invoked → menu-bridge).
 *   - executing it runs util/clipboardOpen.openFromClipboard.
 *   - the menu-bridge dispatch path: an 'mt::menu-invoked' event with the
 *     id reaches the command (the same wiring the native File menu uses).
 *
 * Mock pattern mirrors tests/renderer/commands/capability-gate.test.js —
 * the commands module pulls window.electron-dependent utils at import
 * time, so i18n/bus/util/electron-log are mocked before the import.
 */

vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: () => Promise.resolve(),
  isOsx: true,
  isWindows: false,
  isLinux: false
}))

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

// C-52: the command dynamic-imports the resolver; capture the call.
const openFromClipboardMock = vi.fn(async () => undefined)
vi.mock('@/util/clipboardOpen', () => ({
  openFromClipboard: (...args) => openFromClipboardMock(...args)
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import commands from '@/commands'
import { installMenuBridge } from '@/menu-bridge'

const findCommand = (id, list = commands) => {
  for (const c of list) {
    if (c?.id === id) return c
    if (Array.isArray(c?.subcommands)) {
      const nested = findCommand(id, c.subcommands)
      if (nested) return nested
    }
  }
  return null
}

describe('file.open-from-clipboard command wiring (C-52)', () => {
  beforeEach(() => {
    openFromClipboardMock.mockClear()
  })

  it('the registry carries file.open-from-clipboard with the ⌥⌘V shortcut', () => {
    const command = findCommand('file.open-from-clipboard')
    expect(command).toBeTruthy()
    expect(typeof command.execute).toBe('function')
    // ['Alt', 'Cmd', 'V'] on macOS — mirrors the native Alt+CmdOrCtrl+V.
    expect(command.shortcut).toEqual(['Alt', 'Cmd', 'V'])
  })

  it('execute() runs the shared resolver', async () => {
    const command = findCommand('file.open-from-clipboard')
    await command.execute()
    expect(openFromClipboardMock).toHaveBeenCalledTimes(1)
  })

  it('menu-bridge dispatches mt::menu-invoked file.open-from-clipboard to the command', async () => {
    // window.electron.ipcRenderer.on comes from the global setup — grab
    // the handler installMenuBridge registered on the mt::menu-invoked
    // channel and feed it the native menu event.
    window.electron.ipcRenderer.on.mockImplementation((channel, handler) => {
      if (channel === 'mt::menu-invoked') {
        window.__testMenuHandler = handler
      }
      return () => {}
    })
    installMenuBridge()
    const handler = window.__testMenuHandler
    expect(handler).toBeTruthy()

    await handler(null, 'file.open-from-clipboard')
    expect(openFromClipboardMock).toHaveBeenCalledTimes(1)

    // Unknown ids stay ignored (no throw, no resolver call).
    await handler(null, 'file.does-not-exist')
    expect(openFromClipboardMock).toHaveBeenCalledTimes(1)
  })
})
