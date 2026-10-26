// FILE: tests/renderer/contextMenu/tabs-export.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the tab-context-menu export group (C-NATIVE-DOCX-RTF-EXPORT T-005): three items with pathname gating, label keys shared with the File menu wording, handlers that activate a background tab first and then run the identical export flow (docx via the modal-less store action, pdf/html via showExportDialog).
//   SCOPE: getEXPORT_PDF/HTML/DOCX, HANDLERS.tabExport*, showContextMenu item list and gating, activateThenExport in src/renderer/src/contextMenu/tabs/.
//   DEPENDS: Vitest; mocked @/bus, @/i18n, @/store/editor.
//   LINKS: .grace/changes/active/C-NATIVE-DOCX-RTF-EXPORT (R-2); contextMenu/tabs/menuItems.js, actions.js, index.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   busEmitMock - the bus emit spy.
//   updateCurrentFileMock - the activation spy.
//   exportDocxDocumentMock - the modal-less store action spy.
//   fakeTabs - background + current tab fixtures.
//   popupMock - the native popup ipc invoke spy (returns the clicked id).
// END_MODULE_MAP

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestPinia } from '../pinia'

const busEmitMock = vi.fn()
vi.mock('@/bus', () => ({ default: { emit: busEmitMock, on: vi.fn(), off: vi.fn() } }))
vi.mock('@/i18n', () => ({
  t: (key) => key,
  default: { global: { t: (key) => key } }
}))

const updateCurrentFileMock = vi.fn()
const exportDocxDocumentMock = vi.fn()
const fakeTabs = [
  { id: 'bg-1', filename: 'a.md', pathname: '/tmp/a.md' },
  { id: 'fg-0', filename: 'b.md', pathname: '/tmp/b.md' }
]
vi.mock('@/store/editor', () => ({
  useEditorStore: () => ({
    tabs: fakeTabs,
    currentFile: fakeTabs[1],
    UPDATE_CURRENT_FILE: updateCurrentFileMock,
    EXPORT_DOCX_DOCUMENT: exportDocxDocumentMock
  })
}))

const popupMock = vi.fn()
beforeEach(() => {
  setupTestPinia()
  window.electron = { ipcRenderer: { invoke: popupMock } }
  busEmitMock.mockReset()
  updateCurrentFileMock.mockReset()
  exportDocxDocumentMock.mockReset()
  popupMock.mockReset()
  popupMock.mockResolvedValue('')
})

describe('tab context menu export group (T-005)', () => {
  it('labels come from the shared export keys and use distinct ids', async () => {
    const { getEXPORT_PDF, getEXPORT_HTML, getEXPORT_DOCX } = await import('@/contextMenu/tabs/menuItems')
    expect(getEXPORT_PDF()).toEqual({ label: 'contextMenu.tabs.exportPdf', id: 'tabExportPdf' })
    expect(getEXPORT_HTML()).toEqual({ label: 'contextMenu.tabs.exportHtml', id: 'tabExportHtml' })
    expect(getEXPORT_DOCX()).toEqual({ label: 'contextMenu.tabs.exportDocx', id: 'tabExportDocx' })
  })

  it('showContextMenu appends the group gated on pathname exactly like the file block', async () => {
    const { showContextMenu } = await import('@/contextMenu/tabs')
    await showContextMenu({ clientX: 1, clientY: 1 }, fakeTabs[0])
    const items = popupMock.mock.calls[0][1].items
    const ids = items.map((i) => i.id)
    expect(ids).toContain('tabExportPdf')
    expect(ids).toContain('tabExportHtml')
    expect(ids).toContain('tabExportDocx')
    // the group sits after the LAST separator (fourth block, after the file block)
    const lastSeparatorIndex = items.map((i) => i.type).lastIndexOf('separator')
    expect(items.findIndex((i) => i.id === 'tabExportPdf')).toBeGreaterThan(lastSeparatorIndex)
    expect(items.find((i) => i.id === 'tabExportDocx').enabled).toBe(true)
    expect(items.find((i) => i.id === 'copyPath').enabled).toBe(true)
  })

  it('untitled tabs disable the whole export group like Copy path', async () => {
    const { showContextMenu } = await import('@/contextMenu/tabs')
    await showContextMenu({ clientX: 1, clientY: 1 }, { id: 'u-1', pathname: null })
    const items = popupMock.mock.calls[0][1].items
    for (const id of ['tabExportPdf', 'tabExportHtml', 'tabExportDocx', 'copyPath']) {
      expect(items.find((i) => i.id === id).enabled).toBe(false)
    }
  })

  it('a background tab activates first, then docx runs the modal-less store action', async () => {
    const { activateThenExport } = await import('@/contextMenu/tabs/actions')
    activateThenExport('bg-1', 'docx')
    expect(updateCurrentFileMock).toHaveBeenCalledWith(fakeTabs[0])
    expect(exportDocxDocumentMock).toHaveBeenCalledTimes(1)
    expect(busEmitMock).not.toHaveBeenCalled()
  })

  it('the current tab is not re-activated; pdf/html open the shared settings dialog', async () => {
    const { activateThenExport } = await import('@/contextMenu/tabs/actions')
    activateThenExport('fg-0', 'pdf')
    expect(updateCurrentFileMock).not.toHaveBeenCalled()
    expect(busEmitMock).toHaveBeenCalledWith('showExportDialog', 'pdf')
    activateThenExport('fg-0', 'styledHtml')
    expect(busEmitMock).toHaveBeenCalledWith('showExportDialog', 'styledHtml')
  })
})
