// FILE: tests/renderer/store/export-docx-dispatch.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the modal-less Word export dispatch (C-NATIVE-DOCX-RTF-EXPORT T-004): EXPORT_DOCX_DOCUMENT rides the bus 'export' pipeline with the remembered print options; the EXPORT 'docx' branch runs the save dialog, the lazy conversion and the binary write exactly once, and the success notification carries the full actions contract (reveal + quiet "Export settings", source 'export'); cancel writes nothing.
//   SCOPE: EXPORT_DOCX_DOCUMENT / EXPORT('docx') / _EXPORT_DOCX in src/renderer/src/store/editor.js with dialog, conversion and fs facades mocked.
//   DEPENDS: Vitest, setupTestPinia; mocked @/bus, @/services/notification, @/util/exportDocx, @tauri-apps/plugin-dialog, window.fileUtils.
//   LINKS: .grace/changes/active/C-NATIVE-DOCX-RTF-EXPORT (R-1 notification contract); C-NOTIFICATION-SYSTEM export-settings-action corner.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   busEmitMock - the bus emit spy (EXPORT_DOCX_DOCUMENT payload assertions).
//   saveMock - the save-dialog plugin mock.
//   exportToDocxMock - the lazy converter mock.
//   writeMock - the binary write facade mock.
//   notifyMock - the notification facade spy (actions contract).
// END_MODULE_MAP

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestPinia } from '../pinia'

const busEmitMock = vi.fn()
vi.mock('@/bus', () => ({ default: { emit: busEmitMock, on: vi.fn(), off: vi.fn() } }))
vi.mock('@/ipc/runtime', () => ({
  ipcFs: { read: vi.fn(), write: vi.fn(), stat: vi.fn(), readdir: vi.fn(), unlink: vi.fn() },
  ipcWatch: {}, ipcSearch: {},
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(), getAll: vi.fn(async () => ({})) },
  ipcWorkspace: {}, ipcFonts: {},
  ipcRecent: { add: vi.fn(), list: vi.fn(async () => []), clear: vi.fn() },
  ipcShortcut: {}, ipcSpell: {}, ipcMenu: {}, ipcPandoc: {}, ipcUpdater: {}, ipcScreenshot: {}, ipcSecret: {},
  ipc: { fs: { read: vi.fn() } }
}))
const notifyMock = vi.fn()
vi.mock('@/services/notification', () => ({ default: { notify: notifyMock } }))
vi.mock('@/i18n', () => {
  const t = (key) => key
  return { t, i18n: { global: { t } }, default: { global: { t } } }
})
vi.mock('@/commands', () => ({
  FileEncodingCommand: class {},
  QuickOpenCommand: class {},
  LineEndingCommand: class {},
  TrailingNewlineCommand: class {}
}))

const saveMock = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: (...args) => saveMock(...args) }))

const exportToDocxMock = vi.fn()
vi.mock('@/util/exportDocx', () => ({ exportToDocx: (...args) => exportToDocxMock(...args) }))

const writeMock = vi.fn()

describe('editor store docx export dispatch (T-004)', () => {
  let store

  beforeEach(async () => {
    setupTestPinia()
    busEmitMock.mockReset()
    notifyMock.mockReset()
    saveMock.mockReset()
    exportToDocxMock.mockReset()
    writeMock.mockReset()
    window.fileUtils = { writeFile: writeMock }
    window.path = { basename: (p) => String(p).split('/').pop(), dirname: (p) => String(p).split('/').slice(0, -1).join('/') }
    const mod = await import('@/store/editor')
    store = mod.useEditorStore()
    store.UPDATE_CURRENT_FILE({
      id: 'tab-1',
      filename: 'report.md',
      pathname: '/tmp/report.md',
      markdown: '# T'
    })
  })

  it('EXPORT_DOCX_DOCUMENT emits the bus export pipeline with type docx and remembered options', () => {
    store.EXPORT_DOCX_DOCUMENT()
    expect(busEmitMock).toHaveBeenCalledTimes(1)
    const payload = busEmitMock.mock.calls.filter((c) => c[0] === 'export').map((c) => c[1]).find((p) => p && p.type === 'docx')
    expect(payload).toBeTruthy()
    expect(payload.pageMarginTop).toBe(20)
    expect(payload.pageMarginLeft).toBe(15)
  })

  it('EXPORT(docx) saves, converts once, writes binary and notifies with the full actions contract', async () => {
    saveMock.mockResolvedValue('/tmp/out/report.docx')
    exportToDocxMock.mockResolvedValue(new Uint8Array([1, 2, 3]))

    await store.EXPORT({ type: 'docx', content: '<p>html</p>' })

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].filters).toEqual([{ name: 'Word', extensions: ['docx'] }])
    expect(saveMock.mock.calls[0][0].defaultPath).toBe('report.docx')
    expect(exportToDocxMock).toHaveBeenCalledTimes(1)
    const call = exportToDocxMock.mock.calls[0][0]
    expect(call.html).toBe('<p>html</p>')
    expect(call.printOptions.pageMarginTop).toBe(20)
    expect(writeMock).toHaveBeenCalledTimes(1)
    expect(writeMock.mock.calls[0][0]).toBe('/tmp/out/report.docx')
    expect(writeMock.mock.calls[0][2]).toBe('binary')

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const n = notifyMock.mock.calls[0][0]
    expect(n.severity).toBe('success')
    expect(n.source).toBe('export')
    expect(n.actions).toHaveLength(2)
    expect(n.actions[0].kind).toBe('reveal')
    expect(typeof n.actions[0].payload).toBe('function')
    expect(n.actions[1].style).toBe('quiet')
    expect(n.actions[1].label).toBe('editor.export.settingsAction')
    expect(typeof n.actions[1].handler).toBe('function')
  })

  it('cancel in the save dialog converts nothing, writes nothing, notifies nothing', async () => {
    saveMock.mockResolvedValue(null)
    await store.EXPORT({ type: 'docx', content: '<p>html</p>' })
    expect(exportToDocxMock).not.toHaveBeenCalled()
    expect(writeMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('a conversion failure surfaces the editor.export.failed error notice', async () => {
    saveMock.mockResolvedValue('/tmp/out/report.docx')
    exportToDocxMock.mockRejectedValue(new Error('boom'))
    await store.EXPORT({ type: 'docx', content: '<p>html</p>' })
    expect(writeMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][0].title).toBe('editor.export.failed')
  })
})
