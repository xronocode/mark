// FILE: tests/renderer/store/editor-move-file-to.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin the per-file state transfer of the store/editor.js MOVE_FILE_TO flow (the title-bar card › Move to… flow) — the stored table layouts, the remembered cursor position and the remembered page width (with its pinned per-document theme) all follow the file to the new directory, exactly like the rename flows (RENAME / RENAME_IF_NEEDED) already do.
//   SCOPE: store/editor.js MOVE_FILE_TO (the move call sites only — the store utils themselves are pinned in table-layout-store.test.js / editor-page-width.test.js / editor-position-memory.test.js).
//   DEPENDS: the tests/renderer/store pinia harness with the standard store mocks; util/tableLayoutStore, util/pageWidthStore and util/filePositionStore mocked with spies; @tauri-apps/plugin-dialog open overridden per test.
//   LINKS: util/tableLayoutStore.js; util/pageWidthStore.js; util/filePositionStore.js; store/editor.js RENAME / RENAME_IF_NEEDED (the mirrored transfer).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   loadEditorStore - fresh editor store under the test pinia (lazy import after the mocks).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-26 complexity f-003 fix: MOVE_FILE_TO transfers the same
//   per-file state the rename flows transfer — move-to used to leave the
//   layouts/positions/pageWidth parked on the old path while rename moved
//   them (audited 2026-11-25).
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'

const loadEditorStore = async () => (await import('@/store/editor')).useEditorStore

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('../bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/ipc/runtime', () => ({
  ipcFs: { read: vi.fn(async () => 'mocked'), write: vi.fn() },
  ipcWatch: { subscribe: vi.fn(async () => vi.fn()) },
  ipcRecent: { add: vi.fn(async () => {}), list: vi.fn(async () => []), clear: vi.fn(async () => {}) },
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}), getAll: vi.fn(async () => ({})) }
}))
vi.mock('@/util/tableLayoutStore', () => ({
  moveTableLayoutsEntry: vi.fn(async () => true)
}))
vi.mock('@/util/pageWidthStore', () => ({
  movePageWidthEntry: vi.fn(async () => true)
}))
vi.mock('@/util/filePositionStore', () => ({
  loadFilePosition: vi.fn(async () => null),
  saveFilePosition: vi.fn(async () => {}),
  moveFilePositionsEntry: vi.fn(async () => true),
  clampEntryToMarkdown: vi.fn(() => null)
}))
vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(async () => undefined) }
}))
vi.mock('element-plus/es/components/message-box/index.mjs', () => ({
  ElMessageBox: {
    confirm: vi.fn(async () => 'confirm'),
    alert: vi.fn(async () => undefined)
  }
}))
vi.mock('deep-equal', () => ({ default: vi.fn(() => false) }))
vi.mock('@/util', () => ({
  hasKeys: vi.fn((o) => o && Object.keys(o).length > 0),
  getUniqueId: vi.fn(() => `uid-${Date.now()}`),
  deepClone: vi.fn((o) => JSON.parse(JSON.stringify(o))),
  isOsx: false,
  animatedScrollTo: vi.fn()
}))
vi.mock('@/util/listToTree', () => ({ default: vi.fn((arr) => arr) }))
vi.mock('@/store/help', () => ({
  createDocumentState: vi.fn((doc) => ({
    id: doc.id || `id-${Date.now()}`,
    filename: doc.filename || 'untitled.md',
    pathname: doc.pathname || '',
    markdown: doc.markdown || '',
    isSaved: true
  })),
  getOptionsFromState: vi.fn(() => ({})),
  getSingleFileState: vi.fn((o) => ({ id: 'x', isSaved: true, ...o })),
  getBlankFileState: vi.fn(() => ({ id: 'b', pathname: '', isSaved: true }))
}))
vi.mock('@/commands', () => ({
  FileEncodingCommand: vi.fn(),
  LineEndingCommand: vi.fn(),
  QuickOpenCommand: vi.fn(),
  TrailingNewlineCommand: vi.fn()
}))
vi.mock('@/i18n', () => ({
  i18n: { global: { t: (k) => k } },
  t: (k) => k,
  setLanguage: vi.fn()
}))

import { moveTableLayoutsEntry } from '@/util/tableLayoutStore'
import { moveFilePositionsEntry } from '@/util/filePositionStore'
import { movePageWidthEntry } from '@/util/pageWidthStore'

describe('store/editor.js — MOVE_FILE_TO transfers the per-file state like the rename flows', () => {
  let editorStore

  beforeEach(async () => {
    setupTestPinia()
    vi.clearAllMocks()
    const { open } = await import('@tauri-apps/plugin-dialog')
    open.mockResolvedValue('/elsewhere')
    const useEditorStore = await loadEditorStore()
    editorStore = useEditorStore()
    editorStore.tabs = []
    editorStore.currentFile = {
      id: 'tab-1',
      pathname: '/docs/report.md',
      filename: 'report.md',
      isSaved: true,
      markdown: '| a |\n| --- |\n| 1 |\n'
    }
  })

  it('MOVE_FILE_TO moves layouts, positions and page width to the new path', async () => {
    editorStore.tabs = [editorStore.currentFile]
    await editorStore.MOVE_FILE_TO()

    expect(window.fileUtils.move).toHaveBeenCalledWith('/docs/report.md', '/elsewhere/report.md')
    // The rename flows move the same three per-file stores; move-to must not
    // leave them parked on the old directory.
    expect(moveTableLayoutsEntry).toHaveBeenCalledWith('/docs/report.md', '/elsewhere/report.md')
    expect(moveFilePositionsEntry).toHaveBeenCalledWith('/docs/report.md', '/elsewhere/report.md')
    expect(movePageWidthEntry).toHaveBeenCalledWith('/docs/report.md', '/elsewhere/report.md')
    expect(editorStore.currentFile.pathname).toBe('/elsewhere/report.md')
  })

  it('a failed move never calls the state transfers and shows the notice', async () => {
    editorStore.tabs = [editorStore.currentFile]
    ;(window.fileUtils.move).mockRejectedValueOnce(new Error('EACCES'))
    const { default: notice } = await import('@/services/notification')
    await editorStore.MOVE_FILE_TO()

    expect(moveTableLayoutsEntry).not.toHaveBeenCalled()
    expect(moveFilePositionsEntry).not.toHaveBeenCalled()
    expect(movePageWidthEntry).not.toHaveBeenCalled()
    expect(notice.notify).toHaveBeenCalled()
    expect(editorStore.currentFile.pathname).toBe('/docs/report.md')
  })

  it('a cancelled directory picker never calls the state transfers', async () => {
    editorStore.tabs = [editorStore.currentFile]
    const { open } = await import('@tauri-apps/plugin-dialog')
    open.mockResolvedValue(null)
    await editorStore.MOVE_FILE_TO()

    expect(window.fileUtils.move).not.toHaveBeenCalled()
    expect(moveTableLayoutsEntry).not.toHaveBeenCalled()
    expect(moveFilePositionsEntry).not.toHaveBeenCalled()
    expect(movePageWidthEntry).not.toHaveBeenCalled()
    expect(editorStore.currentFile.pathname).toBe('/docs/report.md')
  })
})
