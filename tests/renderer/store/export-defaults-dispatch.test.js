// FILE: tests/renderer/store/export-defaults-dispatch.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove export dispatch reads current settings and captures a coherent operation before asynchronous Save.
//   SCOPE: Cross-window storage changes, defensive appearance/page snapshots, native-print separation and Word conversion options.
//   DEPENDS: Vitest, actual editor store and page-default helper; injected bus/dialog/converter/filesystem facades.
//   LINKS: M-011; V-M-011; C-EXPORT-SETTINGS-SECTION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   busEmit - Export-bus observation.
//   save - Native Save boundary.
//   exportToDocx - Word conversion boundary.
//   write - Output write boundary.
//   notify - Success notification boundary.
//   openSettings - Notice navigation observation.
//   appearanceKey - Persisted appearance schema.
//   pageKey - Persisted page-default schema.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-EXPORT-SETTINGS-SECTION: fresh defaults and immutable export operation regressions.
// END_CHANGE_SUMMARY

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestPinia } from '../pinia'

const { busEmit, save, exportToDocx, write, notify, openSettings } = vi.hoisted(() => ({
  busEmit: vi.fn(), save: vi.fn(), exportToDocx: vi.fn(), write: vi.fn(), notify: vi.fn(), openSettings: vi.fn()
}))
vi.mock('@/util/exportSettingsNavigation', () => ({ openExportSettings: openSettings }))
vi.mock('@/bus', () => ({ default: { emit: busEmit, on: vi.fn(), off: vi.fn() } }))
vi.mock('@/ipc/runtime', () => ({
  ipcFs: { read: vi.fn(), write: vi.fn(), stat: vi.fn(), readdir: vi.fn(), unlink: vi.fn() },
  ipcWatch: {}, ipcSearch: {}, ipcWorkspace: {}, ipcFonts: {},
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(), getAll: vi.fn(async () => ({})) },
  ipcRecent: { add: vi.fn(), list: vi.fn(async () => []), clear: vi.fn() },
  ipcShortcut: {}, ipcSpell: {}, ipcMenu: {}, ipcPandoc: {}, ipcUpdater: {}, ipcScreenshot: {}, ipcSecret: {},
  ipc: { fs: { read: vi.fn() } }
}))
vi.mock('@/services/notification', () => ({ default: { notify } }))
vi.mock('@/i18n', () => {
  const t = key => key
  return { t, i18n: { global: { t } }, default: { global: { t } } }
})
vi.mock('@/commands', () => ({
  FileEncodingCommand: class {}, QuickOpenCommand: class {}, LineEndingCommand: class {}, TrailingNewlineCommand: class {}
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }))
vi.mock('@/util/exportDocx', () => ({ exportToDocx }))

const appearanceKey = 'mark-last-print-options'
const pageKey = 'mark-export-page-options'

describe('remembered export operation snapshots', () => {
  let store, getAppearance
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.resetModules()
    localStorage.clear()
    setupTestPinia()
    for (const mock of [busEmit, save, exportToDocx, write, notify, openSettings]) mock.mockReset()
    window.fileUtils = { writeFile: write }
    window.path = { basename: p => String(p).split('/').pop(), dirname: p => String(p).split('/').slice(0, -1).join('/') }
    const mod = await import('@/store/editor')
    store = mod.useEditorStore()
    getAppearance = mod.getRememberedExportAppearance
    store.UPDATE_CURRENT_FILE({ id: 'current', filename: 'report.md', pathname: '/tmp/report.md', markdown: '# Report' })
  })

  it.each(['pdf', 'styledHtml', 'docx'])('reads both settings records immediately before %s dispatch', type => {
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: 'github.css', pageMarginLeft: 24, header: { type: 1, center: 'From settings' } }))
    localStorage.setItem(pageKey, JSON.stringify({ pageSize: 'Letter', isLandscape: true, htmlTitle: 'Explicit title' }))
    store.EXPORT_DOCUMENT(type)
    const options = busEmit.mock.calls.find(call => call[0] === 'export')[1]
    expect(options).toMatchObject({ type, theme: 'github.css', pageMarginLeft: 24, pageMarginRight: 15, pageSize: 'Letter', isLandscape: true, pageSizeWidth: 210, pageSizeHeight: 297 })
    expect(options.header.center).toBe('From settings')
    if (type === 'styledHtml') expect(options.htmlTitle).toBe('Explicit title')
    else expect(options).not.toHaveProperty('htmlTitle')
  })

  it('refreshes an imported accessor after another window changes or removes appearance', () => {
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: 'first.css' }))
    expect(getAppearance().theme).toBe('first.css')
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: 'second.css' }))
    expect(getAppearance().theme).toBe('second.css')
    localStorage.removeItem(appearanceKey)
    expect(getAppearance().theme).toBeNull()
  })

  it.each(['broken json', 'null', '[]', '17'])('falls back safely for malformed appearance (%s)', value => {
    localStorage.setItem(appearanceKey, value)
    expect(getAppearance()).toMatchObject({ theme: null, pageMarginTop: 20, tocIncludeTopHeading: true })
  })

  it('returns defensive nested appearance copies and freezes the captured operation', () => {
    const input = { header: { type: 1, center: 'Original' }, footer: { type: 2, left: 'Left', right: 'Right' } }
    expect(store.REMEMBER_EXPORT_OPTIONS(input)).toBe(true)
    getAppearance().header.center = 'Changed copy'
    expect(getAppearance().header.center).toBe('Original')
    store.EXPORT_DOCUMENT('pdf')
    const options = busEmit.mock.calls.find(call => call[0] === 'export')[1]
    input.header.center = 'Changed caller'
    localStorage.setItem(appearanceKey, JSON.stringify({ header: { center: 'Changed window' } }))
    expect(options.header.center).toBe('Original')
    expect(Object.isFrozen(options)).toBe(true)
    expect(Object.isFrozen(options.header)).toBe(true)
    expect(Object.isFrozen(options.footer)).toBe(true)
  })

  it('retains the existing appearance filtering and reports write failure honestly', () => {
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: 'old.css' }))
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(store.REMEMBER_EXPORT_OPTIONS({ theme: 'new.css', type: 'pdf', content: 'not appearance', pageSize: 'A3', isLandscape: true, htmlTitle: 'not appearance' })).toBe(false)
    expect(getAppearance().theme).toBe('new.css')
    expect(getAppearance()).not.toHaveProperty('pageSize')
    setItem.mockRestore()
    expect(store.REMEMBER_EXPORT_OPTIONS({ theme: 'saved.css', pageSizeWidth: 500, pageSizeHeight: 600 })).toBe(true)
    expect(JSON.parse(localStorage.getItem(appearanceKey))).toEqual({ theme: 'saved.css' })
    expect(localStorage.getItem(pageKey)).toBeNull()
  })

  it('keeps same-realm appearance available when storage cannot be read', () => {
    store.REMEMBER_EXPORT_OPTIONS({ theme: 'remembered.css' })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(getAppearance().theme).toBe('remembered.css')
  })

  it('prints with fresh appearance and leaves geometry to the native panel', () => {
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: 'print.css', pageMarginTop: 31, pageSize: 'A3', isLandscape: true, htmlTitle: 'ignore' }))
    localStorage.setItem(pageKey, JSON.stringify({ pageSize: 'Letter', isLandscape: true }))
    store.PRINT_DOCUMENT()
    const options = busEmit.mock.calls.find(call => call[0] === 'export')[1]
    expect(options).toMatchObject({ type: 'print', theme: 'print.css', pageMarginTop: 31 })
    for (const key of ['pageSize', 'pageSizeWidth', 'pageSizeHeight', 'isLandscape', 'htmlTitle']) expect(options).not.toHaveProperty(key)
  })

  it('delegates the Word compatibility entry and refuses unsupported/empty dispatch', () => {
    const dispatch = vi.spyOn(store, 'EXPORT_DOCUMENT')
    store.EXPORT_DOCX_DOCUMENT()
    expect(dispatch).toHaveBeenCalledWith('docx')
    busEmit.mockClear()
    store.EXPORT_DOCUMENT('unknown')
    store.UPDATE_CURRENT_FILE({})
    store.EXPORT_DOCUMENT('pdf')
    expect(busEmit).not.toHaveBeenCalled()
  })

  it('uses the same captured Word options after Save resolves and settings change', async () => {
    let finishSave
    save.mockImplementation(() => new Promise(resolve => { finishSave = resolve }))
    exportToDocx.mockResolvedValue(new Uint8Array([1]))
    const options = { pageSize: 'A5', isLandscape: true, pageMarginLeft: 22, header: { type: 1, center: 'Captured' } }
    const operation = store.EXPORT({ type: 'docx', content: '<p>Captured content</p>', pageOptions: options })
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    options.isLandscape = false
    options.header.center = 'Changed caller'
    store.REMEMBER_EXPORT_OPTIONS({ pageMarginLeft: 99 })
    localStorage.setItem(pageKey, JSON.stringify({ pageSize: 'A3', isLandscape: false }))
    finishSave('/tmp/report.docx')
    await operation
    expect(exportToDocx).toHaveBeenCalledTimes(1)
    const captured = exportToDocx.mock.calls[0][0]
    expect(captured.html).toBe('<p>Captured content</p>')
    expect(captured.printOptions).toMatchObject({ pageSize: 'A5', isLandscape: true, pageMarginLeft: 22, header: { center: 'Captured' } })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it.each(['pdf', 'styledHtml', 'docx'])('opens Settings from the %s success notice without dispatching another export', async type => {
    save.mockResolvedValue(`/tmp/report.${type === 'docx' ? 'docx' : type === 'pdf' ? 'pdf' : 'html'}`)
    exportToDocx.mockResolvedValue(new Uint8Array([1]))
    await store.EXPORT({ type, content: '<p>Report</p>', pageOptions: { pageSize: 'A4' } })
    const success = notify.mock.calls.find(([n]) => n.severity === 'success')?.[0]
    expect(success).toBeDefined()
    expect(success.actions[0].kind).toBe('reveal')
    const action = success.actions.find(a => a.style === 'quiet')
    expect(action).toMatchObject({ label: 'editor.export.settingsAction' })
    await action.handler()
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(busEmit).not.toHaveBeenCalled()
  })

  it.each(['pdf', 'styledHtml', 'docx'])('does not write or offer a settings notice after cancelling %s Save', async type => {
    save.mockResolvedValue(null)
    await store.EXPORT({ type, content: '<p>Report</p>', pageOptions: { pageSize: 'A4' } })
    expect(write).not.toHaveBeenCalled()
    expect(exportToDocx).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(openSettings).not.toHaveBeenCalled()
  })
})
