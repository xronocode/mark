// FILE: tests/renderer/store/editor-table-layouts.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-65 R-2 rename hooks in store/editor.js — RENAME (the title-bar card › Rename… flow) and RENAME_IF_NEEDED (the sidebar rename) both move the file's stored table layouts to the new path through util/tableLayoutStore.moveTableLayoutsEntry.
//   SCOPE: store/editor.js RENAME + RENAME_IF_NEEDED (the move call sites only — the store util itself is pinned in table-layout-store.test.js).
//   DEPENDS: the tests/renderer/store pinia harness with the standard store mocks; util/tableLayoutStore mocked with a spy.
//   LINKS: .grace/changes/active/C-65 R-2; .grace/verification/runtime.xml V-M-012 scenario-66; util/tableLayoutStore.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   moveTableLayoutsEntry - the mocked util spy the hooks must call.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-65: new — both rename paths call the
//   move with (oldPath, newPath); a failed move never breaks the rename.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'

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

describe('store/editor.js — C-65 R-2 rename moves the stored table layouts', () => {
  let editorStore

  beforeEach(async () => {
    setupTestPinia()
    vi.clearAllMocks()
    const { useEditorStore } = await import('@/store/editor')
    editorStore = useEditorStore()
    editorStore.tabs = []
    editorStore.currentFile = {
      id: 'tab-1',
      pathname: '/docs/old-name.md',
      filename: 'old-name.md',
      isSaved: true,
      markdown: '| a |\n| --- |\n| 1 |\n'
    }
  })

  it('RENAME (title-bar card › Rename…) moves the entry to the new path', async () => {
    editorStore.tabs = [editorStore.currentFile]
    await editorStore.RENAME('new-name.md')
    expect(window.fileUtils.move).toHaveBeenCalledWith('/docs/old-name.md', '/docs/new-name.md')
    expect(moveTableLayoutsEntry).toHaveBeenCalledWith('/docs/old-name.md', '/docs/new-name.md')
    expect(editorStore.currentFile.pathname).toBe('/docs/new-name.md')
  })

  it('RENAME_IF_NEEDED (sidebar rename) moves the entry with the tabs', () => {
    editorStore.tabs = [editorStore.currentFile]
    editorStore._subscribeFileWatch = vi.fn()
    editorStore._unsubscribeFileWatch = vi.fn()
    editorStore.RENAME_IF_NEEDED({ src: '/docs/old-name.md', dest: '/docs/renamed.md' })
    expect(editorStore.currentFile.pathname).toBe('/docs/renamed.md')
    expect(moveTableLayoutsEntry).toHaveBeenCalledWith('/docs/old-name.md', '/docs/renamed.md')
  })

  it('a failed rename (move throws) never calls the layout move and shows the notice', async () => {
    editorStore.tabs = [editorStore.currentFile]
    ;(window.fileUtils.move as any).mockRejectedValueOnce(new Error('EACCES'))
    const { default: notice } = await import('@/services/notification')
    await editorStore.RENAME('new-name.md')
    expect(moveTableLayoutsEntry).not.toHaveBeenCalled()
    expect(notice.notify).toHaveBeenCalled()
    expect(editorStore.currentFile.pathname).toBe('/docs/old-name.md')
  })
})
