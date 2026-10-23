// FILE: tests/renderer/util/clipboard-open.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-52 routing pins for util/clipboardOpen.openFromClipboard —
//            folder → projectStore.OPEN_FOLDER ask dispatcher (the
//            shared Add-or-Replace chooser decides, C-MULTI-SOURCE-WORKSPACE),
//            .md → mt::open-new-tab, nothing → the localized
//            notification, the App Store gate → mt_pick_folder with
//            defaultPath, and the webview-clipboard text fallback when
//            the backend command is unavailable.
//   SCOPE: orchestrator behaviour over mocked stores/IPC; the pure
//            resolver is pinned in clipboard-path.test.js.
//   DEPENDS: vitest, tests/renderer/setup.ts (@tauri-apps mocks +
//            window globals), real @/i18n (en.json is statically loaded,
//            so the notification strings assert real EN text).
//   LINKS: .grace/changes/archive/C-52/spec.xml R-1/R-5;
//          .grace/verification/runtime.xml V-M-011 scenario-62.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ipcFsMock - ipc.fs double (stat/read) behind the resolver's default stat.
//   invokeMock - @tauri-apps/api/core invoke double (m059 read + mt_pick_folder).
//   emitMock - @tauri-apps/api/event emit double (mt::open-new-tab pin).
//   projectMock - project store double (OPEN_FOLDER ask-dispatcher spy).
//   prefsState - mutable buildCapabilities driving the m048 gate.
//   notifyMock - notification service double.
//   DIR_STAT - directory stat shape.
//   FILE_STAT - Markdown file stat shape.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 C-52 T-001: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { setupTestPinia } from '../pinia'

const ipcFsMock = { stat: vi.fn(), read: vi.fn() }
vi.mock('@/ipc/runtime', () => ({
  ipc: { fs: { stat: (p) => ipcFsMock.stat(p), read: (p) => ipcFsMock.read(p) } }
}))

const projectMock = { OPEN_FOLDER: vi.fn() }
vi.mock('@/store/project', () => ({
  useProjectStore: vi.fn(() => projectMock)
}))

const prefsState = { buildCapabilities: { mode: 'desktop' } }
vi.mock('@/store/preferences', () => ({
  usePreferencesStore: vi.fn(() => prefsState)
}))

const notifyMock = { notify: vi.fn() }
vi.mock('@/services/notification', () => ({ default: notifyMock }))

import { openFromClipboard } from '@/util/clipboardOpen'

const invokeMock = vi.mocked(invoke)
const emitMock = vi.mocked(emit)

const DIR_STAT = { isDirectory: true, isFile: false }
const FILE_STAT = { isDirectory: false, isFile: true }

describe('util/clipboardOpen.openFromClipboard (C-52)', () => {
  beforeEach(() => {
    setupTestPinia()
    invokeMock.mockReset()
    emitMock.mockReset()
    emitMock.mockResolvedValue(undefined)
    ipcFsMock.stat.mockReset()
    ipcFsMock.read.mockReset()
    projectMock.OPEN_FOLDER.mockReset()
    notifyMock.notify.mockReset()
    prefsState.buildCapabilities.mode = 'desktop'
    window.electron.clipboard.readText = vi.fn(async () => '')
    // Default backend read: nothing on the clipboard.
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'mt_read_clipboard_paths') return { paths: [], text: '' }
      return undefined
    })
  })

  it('R-1 folder: routes through the OPEN_FOLDER ask dispatcher (chooser decides)', async () => {
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'mt_read_clipboard_paths') {
        return { paths: ['/tmp/prj'], text: '' }
      }
      return undefined
    })
    ipcFsMock.stat.mockResolvedValue(DIR_STAT)

    await openFromClipboard()

    expect(projectMock.OPEN_FOLDER).toHaveBeenCalledTimes(1)
    expect(projectMock.OPEN_FOLDER).toHaveBeenCalledWith('/tmp/prj', {
      mode: 'ask',
      origin: 'clipboard'
    })
    expect(notifyMock.notify).not.toHaveBeenCalled()
    expect(invokeMock).not.toHaveBeenCalledWith(
      'mt_pick_folder',
      expect.anything()
    )
  })

  it('R-1 markdown: opens the file in a tab with the drop payload', async () => {
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'mt_read_clipboard_paths') {
        return { paths: [], text: '  /tmp/docs/notes.md\n' }
      }
      return undefined
    })
    ipcFsMock.stat.mockResolvedValue(FILE_STAT)
    ipcFsMock.read.mockResolvedValue('# Notes')

    await openFromClipboard()

    expect(projectMock.OPEN_FOLDER).not.toHaveBeenCalled()
    expect(ipcFsMock.read).toHaveBeenCalledWith('/tmp/docs/notes.md')
    expect(emitMock).toHaveBeenCalledWith(
      'mt::open-new-tab',
      expect.objectContaining({ filename: 'notes.md', pathname: '/tmp/docs/notes.md' })
    )
  })

  it('R-1 nothing usable: notifies with the localized message, no dialog', async () => {
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'mt_read_clipboard_paths') return { paths: [], text: 'not a path' }
      return undefined
    })

    await openFromClipboard()

    expect(projectMock.OPEN_FOLDER).not.toHaveBeenCalled()
    expect(emitMock).not.toHaveBeenCalled()
    expect(notifyMock.notify).toHaveBeenCalledTimes(1)
    expect(notifyMock.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'No folder or Markdown file on the clipboard',
        type: 'info'
      })
    )
  })

  it('R-5 App Store build: routes the folder through the Open Folder panel with defaultPath', async () => {
    prefsState.buildCapabilities.mode = 'app-store'
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'mt_read_clipboard_paths') {
        return { paths: [], text: '/tmp/sandboxed' }
      }
      if (cmd === 'mt_pick_folder') return '/tmp/sandboxed'
      return undefined
    })
    ipcFsMock.stat.mockResolvedValue(DIR_STAT)

    await openFromClipboard()

    const pickCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'mt_pick_folder')
    expect(pickCall).toBeTruthy()
    expect(pickCall[1]).toEqual({ defaultPath: '/tmp/sandboxed' })
    expect(projectMock.OPEN_FOLDER).toHaveBeenCalledWith('/tmp/sandboxed', {
      mode: 'ask',
      origin: 'clipboard'
    })
  })

  it('R-5 App Store build: a cancelled panel changes nothing', async () => {
    prefsState.buildCapabilities.mode = 'app-store'
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'mt_read_clipboard_paths') {
        return { paths: ['/tmp/sandboxed'], text: '' }
      }
      if (cmd === 'mt_pick_folder') return null
      return undefined
    })
    ipcFsMock.stat.mockResolvedValue(DIR_STAT)

    await openFromClipboard()

    expect(projectMock.OPEN_FOLDER).not.toHaveBeenCalled()
    expect(notifyMock.notify).not.toHaveBeenCalled()
  })

  it('falls back to the webview clipboard text when the backend command is missing', async () => {
    // Shimmed/older backend: the command REJECTS (not allowed) — the
    // readClipboard catch keeps going and the webview text is used.
    invokeMock.mockRejectedValue(new Error('mt_read_clipboard_paths not allowed by ACL'))
    window.electron.clipboard.readText = vi.fn(async () => '/tmp/fallback-folder')
    ipcFsMock.stat.mockResolvedValue(DIR_STAT)

    await openFromClipboard()

    expect(window.electron.clipboard.readText).toHaveBeenCalled()
    expect(projectMock.OPEN_FOLDER).toHaveBeenCalledWith('/tmp/fallback-folder', {
      mode: 'ask',
      origin: 'clipboard'
    })
  })
})
