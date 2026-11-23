// FILE: tests/renderer/store/export-document-pin.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-EXPORT-DOCUMENT-PIN store contract — the additive optional exportPin through EXPORT/_EXPORT_DOCX/_EXPORT_PDF, the pre-write assertExportPinCurrent verification (owner + revision + pathname surface identity, plus the HASH-OVER-BYTES disk predicate with the stat short-circuit that never waives the digest compare), the pre-dialog refusal for a pin whose document no longer owns the active surface, the localized editor.export.pinMismatch / pinDiskChanged refusal notices with the count-only BLOCK_EXPORT_PIN_MISMATCH marker, the matching-pin write compatibility, the pin-absent today's-path guard and the corner-2 cancel silence.
//   SCOPE: EXPORT / _EXPORT_DOCX / _EXPORT_PDF / _pdfDefaultName / assertExportPinCurrent in src/renderer/src/store/editor.js with dialog, conversion, ipc fs and window.fileUtils facades mocked.
//   DEPENDS: Vitest, setupTestPinia; mocked @/bus, @/services/notification, @/i18n, @/util/exportDocx, @tauri-apps/plugin-dialog, @/ipc/runtime, window.fileUtils/window.path.
//   LINKS: .grace/changes/active/C-EXPORT-DOCUMENT-PIN; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 scenario-export-document-pin.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   saveMock - the save-dialog plugin mock.
//   exportToDocxMock - the lazy Word converter mock.
//   writeMock - the window.fileUtils binary write facade mock.
//   fsWriteMock - the ipcFs.write facade mock (styledHtml leg).
//   notifyMock - the notification facade spy (refusal + success contracts).
//   debugSpy - the console.debug spy (count-only BLOCK_EXPORT_PIN_MISMATCH marker).
//   digestHex - the test-side SHA-256 hex helper mirroring the store predicate.
//   makePin - pin factory over the harness document identity.
// END_MODULE_MAP

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { setupTestPinia } from '../pinia'

const busEmitMock = vi.fn()
vi.mock('@/bus', () => ({ default: { emit: busEmitMock, on: vi.fn(), off: vi.fn() } }))
const ipcFsWriteMock = vi.fn()
const readBinaryMock = vi.fn()
vi.mock('@/ipc/runtime', () => ({
  ipcFs: { read: vi.fn(), write: ipcFsWriteMock, stat: vi.fn(), readdir: vi.fn(), unlink: vi.fn(), readBinary: readBinaryMock },
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
const statMock = vi.fn()

const digestHex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_EXPORT_DOCUMENT_PIN
// C-EXPORT-DOCUMENT-PIN: the store-level refusal and compatibility pins
// (see the module contract above).
// ──────────────────────────────────────────────────────────────────────

describe('editor store export document pin (C-EXPORT-DOCUMENT-PIN)', () => {
  let store
  let debugSpy

  const makePin = async (overrides = {}) => {
    const base = {
      owner: { id: 'tab-1', documentToken: 'token-a' },
      contentRevision: 3,
      pathname: '/tmp/report.md',
      documentDir: '/tmp',
      filename: 'report.md',
      firstHeading: 'Report heading',
      baselineDigest: await digestHex('original bytes'),
      baselineStat: '0:0'
    }
    return { ...base, ...overrides }
  }

  beforeEach(async () => {
    setupTestPinia()
    busEmitMock.mockReset()
    notifyMock.mockReset()
    saveMock.mockReset()
    exportToDocxMock.mockReset()
    writeMock.mockReset()
    ipcFsWriteMock.mockReset()
    readBinaryMock.mockReset()
    statMock.mockReset()
    readBinaryMock.mockResolvedValue(new TextEncoder().encode('original bytes'))
    statMock.mockResolvedValue({ size: 0, mtimeMs: 0, isFile: true, isDirectory: false })
    window.fileUtils = { writeFile: writeMock, stat: statMock }
    window.path = {
      basename: (p) => String(p).split('/').pop(),
      dirname: (p) => String(p).split('/').slice(0, -1).join('/')
    }
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const mod = await import('@/store/editor')
    store = mod.useEditorStore()
    store.currentFile = {
      id: 'tab-1',
      filename: 'report.md',
      pathname: '/tmp/report.md',
      markdown: '# T',
      documentToken: 'token-a',
      contentRevision: 3
    }
    store.tabs = [store.currentFile]
    store.listToc = []
  })

  afterEach(() => {
    debugSpy.mockRestore()
  })

  it('refuses before the save dialog when the pinned document no longer owns the active surface (owner swap)', async () => {
    saveMock.mockResolvedValue('/tmp/out/report.html')
    const pin = await makePin()
    // The active surface moved to another document before the dispatch.
    store.currentFile = {
      id: 'tab-2',
      filename: 'other.md',
      pathname: '/tmp/other.md',
      markdown: '# Other',
      documentToken: 'token-b',
      contentRevision: 1
    }
    store.tabs = [store.currentFile]

    await store.EXPORT({ type: 'styledHtml', content: '<p>html</p>', exportPin: pin })

    expect(saveMock).not.toHaveBeenCalled()
    expect(ipcFsWriteMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const n = notifyMock.mock.calls[0][0]
    expect(n.title).toBe('editor.export.pinMismatchTitle')
    expect(n.message).toBe('editor.export.pinMismatchMessage')
    expect(n.type).toBe('error')
    const logged = debugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('[export][pin][BLOCK_EXPORT_PIN_MISMATCH class=identity]')
  })

  it('refuses before the save dialog when the pinned revision moved', async () => {
    saveMock.mockResolvedValue('/tmp/out/report.html')
    const pin = await makePin({ contentRevision: 9 })

    await store.EXPORT({ type: 'styledHtml', content: '<p>html</p>', exportPin: pin })

    expect(saveMock).not.toHaveBeenCalled()
    expect(ipcFsWriteMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][0].title).toBe('editor.export.pinMismatchTitle')
    const logged = debugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('[export][pin][BLOCK_EXPORT_PIN_MISMATCH class=identity]')
  })

  it('refuses when the on-disk file changed after consent (digest decides, unchanged stat never waives)', async () => {
    saveMock.mockResolvedValue('/tmp/out/report.html')
    const pin = await makePin()
    // Entry verification sees the original bytes; the file changes while the
    // save dialog is up — the matching stat signature must NOT waive the
    // digest compare (HASH-OVER-BYTES decision, review minor 1).
    readBinaryMock.mockResolvedValueOnce(new TextEncoder().encode('original bytes'))
    readBinaryMock.mockResolvedValueOnce(new TextEncoder().encode('tampered bytes'))

    await store.EXPORT({ type: 'styledHtml', content: '<p>html</p>', exportPin: pin })

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(ipcFsWriteMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const n = notifyMock.mock.calls[0][0]
    expect(n.title).toBe('editor.export.pinDiskChangedTitle')
    expect(n.message).toBe('editor.export.pinDiskChangedMessage')
    expect(n.type).toBe('error')
    const logged = debugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('[export][pin][BLOCK_EXPORT_PIN_MISMATCH class=disk]')
  })

  it('writes exactly as today when the pin still matches', async () => {
    saveMock.mockResolvedValue('/tmp/out/report.html')
    const pin = await makePin()

    await store.EXPORT({ type: 'styledHtml', content: '<p>html</p>', exportPin: pin })

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].defaultPath).toBe('report.html')
    expect(ipcFsWriteMock).toHaveBeenCalledTimes(1)
    expect(ipcFsWriteMock.mock.calls[0][0]).toBe('/tmp/out/report.html')
    expect(ipcFsWriteMock.mock.calls[0][1]).toBe('<p>html</p>')
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][0].title).toBe('store.editor.exportSuccessTitle')
  })

  it("keeps today's path for a pin-absent EXPORT call", async () => {
    saveMock.mockResolvedValue('/tmp/out/report.html')

    await store.EXPORT({ type: 'styledHtml', content: '<p>html</p>' })

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].defaultPath).toBe('report.html')
    expect(ipcFsWriteMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][0].title).toBe('store.editor.exportSuccessTitle')
    const logged = debugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).not.toContain('BLOCK_EXPORT_PIN_MISMATCH')
  })

  it('cancel in the save dialog stays silent (corner-2)', async () => {
    saveMock.mockResolvedValue(null)
    const pin = await makePin()

    await store.EXPORT({ type: 'styledHtml', content: '<p>html</p>', exportPin: pin })

    expect(ipcFsWriteMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('derives the pdf default name from the pin and verifies before mt_export_pdf', async () => {
    saveMock.mockResolvedValue('/tmp/out/pinned-name.pdf')
    const { invoke } = await import('@tauri-apps/api/core')
    const pin = await makePin({ filename: 'pinned-name.md' })

    await store.EXPORT({ type: 'pdf', pageOptions: { pageSize: 'a4' }, exportPin: pin })

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].defaultPath).toBe('pinned-name.pdf')
    expect(invoke).toHaveBeenCalledWith('mt_export_pdf', { path: '/tmp/out/pinned-name.pdf', pageOptions: { pageSize: 'a4' } })
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][0].title).toBe('store.editor.exportSuccessTitle')
  })

  it('derives the docx default name from the pin and writes binary through the pinned run', async () => {
    saveMock.mockResolvedValue('/tmp/out/pinned-name.docx')
    exportToDocxMock.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const pin = await makePin({ filename: 'pinned-name.md' })

    await store.EXPORT({ type: 'docx', content: '<p>html</p>', exportPin: pin })

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].defaultPath).toBe('pinned-name.docx')
    expect(exportToDocxMock).toHaveBeenCalledTimes(1)
    expect(writeMock).toHaveBeenCalledTimes(1)
    expect(writeMock.mock.calls[0][0]).toBe('/tmp/out/pinned-name.docx')
    expect(writeMock.mock.calls[0][2]).toBe('binary')
  })
})
// END_BLOCK_EXPORT_DOCUMENT_PIN
