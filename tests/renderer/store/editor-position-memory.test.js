// FILE: tests/renderer/store/editor-position-memory.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-FILE-POSITION-MEMORY hooks in store/editor.js — updateCursorPosition (the arrow-key write that never touches the revision guard, corner C-2), the flush boundaries (SAVE_ACTIVE_FILE_POSITION, the FORCE_CLOSE_TAB close flush and the _saveSessionState quit flush, corner C-7), the rename moves (corner C-6) and the NEW_TAB_WITH_CONTENT restore leg with clamping (corners C-3/C-4/C-5).
//   SCOPE: store/editor.js call sites only — util/filePositionStore itself is pinned in file-position-store.test.js.
//   DEPENDS: the tests/renderer/store pinia harness with the standard store mocks; util/filePositionStore mocked with spies (the real clamp passthrough).
//   LINKS: .grace/changes/active/C-FILE-POSITION-MEMORY (spec A/B, D-1..D-4); components/editorWithTabs/editor.vue (the selectionChange/scroll writers and the debounce).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   loadEditorStore - fresh editor store under the test pinia (lazy import after the mocks).
//   aCursor - block-key cursor fixture (the arrow-key write payload shape).
//   aIndexCursor - line/ch cursor fixture (the persisted representation).
//   makeTab - tab fixture with pathname, scrollTop, contentRevision and stored muyaIndexCursor.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-23 C-FILE-POSITION-MEMORY: new — cursor
//   write, flush boundaries, rename moves, restore leg.
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
vi.mock('@/util/filePositionStore', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    loadFilePosition: vi.fn(async () => null),
    saveFilePosition: vi.fn(async () => true),
    moveFilePositionsEntry: vi.fn(async () => true)
  }
})
vi.mock('@/store/diffSnapshots', () => ({
  recordSnapshot: vi.fn(),
  recordOpenedSnapshot: vi.fn(),
  clearSnapshots: vi.fn()
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

import { loadFilePosition, saveFilePosition, moveFilePositionsEntry } from '@/util/filePositionStore'

const aCursor = () => ({
  anchor: { key: 'ag-1', offset: 3 },
  focus: { key: 'ag-1', offset: 3 },
  start: { key: 'ag-1', offset: 3 },
  end: { key: 'ag-1', offset: 3 },
  isEdit: false
})
const aIndexCursor = () => ({ anchor: { line: 40, ch: 2 }, focus: { line: 40, ch: 2 } })

const makeTab = (over = {}) => ({
  id: 'tab-1',
  pathname: '/docs/report.md',
  filename: 'report.md',
  markdown: '# t\n\nbody\n',
  isSaved: true,
  scrollTop: 3778,
  contentRevision: 7,
  cursor: null,
  muyaIndexCursor: aIndexCursor(),
  history: { stack: [], index: -1 },
  ...over
})

describe('store/editor.js — C-FILE-POSITION-MEMORY', () => {
  let editorStore

  beforeEach(async () => {
    setupTestPinia()
    vi.clearAllMocks()
    loadFilePosition.mockResolvedValue(null)
    const useEditorStore = await loadEditorStore()
    editorStore = useEditorStore()
    editorStore.tabs = []
    editorStore.currentFile = {}
  })

  it('updateCursorPosition writes only the cursor — the revision guard never moves (C-2)', () => {
    const tab = makeTab()
    editorStore.tabs = [tab]
    editorStore.updateTabIdToIndex()
    editorStore.updateCursorPosition('tab-1', aCursor())
    expect(tab.cursor).toEqual(aCursor())
    expect(tab.contentRevision).toBe(7)
    expect(tab.isSaved).toBe(true)
    // Junk cursors and unknown ids are quietly ignored.
    editorStore.updateCursorPosition('tab-1', null)
    editorStore.updateCursorPosition('nope', aCursor())
    expect(tab.cursor).toEqual(aCursor())
  })

  it('SAVE_ACTIVE_FILE_POSITION writes the fresh cursor + live scrollTop once (C-9 boundary)', async () => {
    const tab = makeTab()
    editorStore.tabs = [tab]
    const fresh = { anchor: { line: 90, ch: 1 }, focus: { line: 90, ch: 1 } }
    await editorStore.SAVE_ACTIVE_FILE_POSITION({ id: 'tab-1', muyaIndexCursor: fresh })
    expect(saveFilePosition).toHaveBeenCalledWith('/docs/report.md', {
      scrollTop: 3778,
      muyaIndexCursor: fresh
    })
    // Without a fresh cursor the stored value is used (background/close path).
    await editorStore.SAVE_ACTIVE_FILE_POSITION({ id: 'tab-1', muyaIndexCursor: null })
    expect(saveFilePosition).toHaveBeenLastCalledWith('/docs/report.md', {
      scrollTop: 3778,
      muyaIndexCursor: aIndexCursor()
    })
    // Pathless tabs never persist.
    await editorStore.SAVE_ACTIVE_FILE_POSITION({ id: 'tab-x', muyaIndexCursor: fresh })
    expect(saveFilePosition).toHaveBeenCalledTimes(2)
  })

  it('FORCE_CLOSE_TAB flushes the position before the tab dies (C-7)', async () => {
    const tab = makeTab({ isSaved: true })
    editorStore.tabs = [tab]
    editorStore.currentFile = tab
    editorStore.updateTabIdToIndex()
    await editorStore.FORCE_CLOSE_TAB(tab)
    expect(saveFilePosition).toHaveBeenCalledWith('/docs/report.md', {
      scrollTop: 3778,
      muyaIndexCursor: aIndexCursor()
    })
    expect(editorStore.tabs).toHaveLength(0)
  })

  it('_saveSessionState flushes every pathname tab (quit flush, C-7)', async () => {
    const tabA = makeTab()
    const tabB = makeTab({ id: 'tab-2', pathname: '', muyaIndexCursor: null, scrollTop: 0 })
    editorStore.tabs = [tabA, tabB]
    editorStore.currentFile = tabA
    const projectStore = (await import('@/store/project')).useProjectStore()
    projectStore.projectTrees = []
    await editorStore._saveSessionState()
    expect(saveFilePosition).toHaveBeenCalledTimes(1)
    expect(saveFilePosition).toHaveBeenCalledWith('/docs/report.md', {
      scrollTop: 3778,
      muyaIndexCursor: aIndexCursor()
    })
  })

  it('NEW_TAB_WITH_CONTENT restores a clamped position into the tab state (C-3/C-5)', async () => {
    loadFilePosition.mockResolvedValue({
      scrollTop: 3778,
      muyaIndexCursor: { anchor: { line: 999, ch: 99 }, focus: { line: 999, ch: 99 } },
      savedAt: 1
    })
    editorStore.currentFile = {}
    const { default: notice } = await import('@/services/notification')
    const docState = await editorStore.NEW_TAB_WITH_CONTENT({
      markdownDocument: { pathname: '/docs/report.md', filename: 'report.md', markdown: '# t\n\nbody\n' },
      selected: true
    })
    void docState
    void notice
    expect(loadFilePosition).toHaveBeenCalledWith('/docs/report.md')
    const restored = editorStore.currentFile
    expect(restored.pathname).toBe('/docs/report.md')
    expect(restored.scrollTop).toBe(3778)
    // The clamp pulled line 999 into the document's last line (index 3:
    // '# t', '', 'body', '').
    expect(restored.muyaIndexCursor.anchor.line).toBe(3)
    expect(restored.muyaIndexCursor.focus.line).toBe(3)
  })

  it('NEW_TAB_WITH_CONTENT without a saved entry keeps the default state', async () => {
    loadFilePosition.mockResolvedValue(null)
    await editorStore.NEW_TAB_WITH_CONTENT({
      markdownDocument: { pathname: '/docs/new.md', filename: 'new.md', markdown: '# n\n' },
      selected: true
    })
    expect(editorStore.currentFile.scrollTop).toBeUndefined()
    expect(editorStore.currentFile.muyaIndexCursor).toBeUndefined()
  })

  it('both rename paths move the remembered position (C-6)', async () => {
    const tab = makeTab()
    editorStore.tabs = [tab]
    editorStore.currentFile = tab
    await editorStore.RENAME('renamed.md')
    expect(moveFilePositionsEntry).toHaveBeenCalledWith('/docs/report.md', '/docs/renamed.md')
    editorStore._subscribeFileWatch = vi.fn()
    editorStore._unsubscribeFileWatch = vi.fn()
    editorStore.RENAME_IF_NEEDED({ src: '/docs/renamed.md', dest: '/docs/renamed-again.md' })
    expect(moveFilePositionsEntry).toHaveBeenCalledWith('/docs/renamed.md', '/docs/renamed-again.md')
  })
})
