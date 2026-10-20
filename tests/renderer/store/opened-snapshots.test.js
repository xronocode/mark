/**
 * C-68 T-001 — store-level tests for the «opened» baseline wiring in
 * editor.js. Every path that loads a file from disk must record the
 * content it lands into the per-tab opened slot: NEW_TAB_WITH_CONTENT
 * (open, reopen, session restore) and loadChange (the content an
 * external reload replaces). Untitled tabs never record; focusing an
 * already-open file keeps the original slot; closing the tab clears it.
 *
 * Pitfall mitigations (same conventions as live-reload-snapshots.test.js):
 *   #1 — sibling stores stubbed as plain objects
 *   #2 — bus singleton mocked at both @/bus and ../bus
 *   #4 — i18n / commands / element-plus stubbed so muya never loads
 */

// FILE: tests/renderer/store/opened-snapshots.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove editor.js records the opened baseline on every disk-load path (NEW_TAB_WITH_CONTENT, RESTORE_SESSION, loadChange via APPLY_FILE_CHANGE), never for untitled tabs, keeps it across re-focus, and clears it with the tab.
//   SCOPE: editor.js NEW_TAB_WITH_CONTENT / NEW_UNTITLED_TAB / RESTORE_SESSION / APPLY_FILE_CHANGE-loadChange / FORCE_CLOSE_TAB against the real store/diffSnapshots opened slot.
//   DEPENDS: src/renderer/src/store/editor.js, src/renderer/src/store/diffSnapshots.js, tests/renderer/pinia
//   LINKS: .grace/changes/archive/C-68 R-1; .grace/verification/runtime.xml V-M-011 scenario-67
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   __ipcFsMock - hoisted ipcFs mock (read) shared with the vi.mock factory.
//   __ipcPrefsMock - hoisted prefs-IPC mock (lastSessionTabs for RESTORE_SESSION).
//   __layoutStub - hoisted layout store stub.
//   __mainStub - hoisted main store stub.
//   __preferencesStub - hoisted preferences store stub (liveReload on).
//   __projectStub - hoisted project store stub.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Follow the current C-69 restore bridge and verify both restored opened slots.
//   PREV: v1.0.0 - 2026-10-19 C-68 T-001 initial opened-slot wiring tests.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'
import {
  latestSnapshot,
  openedSnapshot,
  __resetDiffSnapshots
} from '@/store/diffSnapshots'

// ─── module-level mocks (must precede dynamic store import) ───────────

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('../bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/i18n', () => ({
  i18n: { global: { t: (k) => k } },
  t: (k) => k,
  setLanguage: vi.fn()
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(async () => undefined) }
}))

vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn(async () => 'confirm'),
    alert: vi.fn(async () => undefined)
  }
}))

vi.mock('@/commands', () => ({
  FileEncodingCommand: class {},
  LineEndingCommand: class {},
  QuickOpenCommand: class {},
  TrailingNewlineCommand: class {}
}))

const __ipcFsMock = {
  read: vi.fn(async () => 'mocked content'),
  write: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn()
}
const __ipcPrefsMock = {
  get: vi.fn(async () => null),
  set: vi.fn(async () => {})
}
vi.mock('@/ipc/runtime', () => ({
  ipcFs: __ipcFsMock,
  ipcWatch: {},
  ipcSearch: {},
  ipcPrefs: __ipcPrefsMock,
  ipcWorkspace: {},
  ipcFonts: {},
  ipcRecent: { add: vi.fn(async () => {}), list: vi.fn(async () => []), clear: vi.fn(async () => {}) },
  ipcShortcut: {},
  ipcSpell: {},
  ipcMenu: {},
  ipcPandoc: {},
  ipcUpdater: {},
  ipcScreenshot: {},
  ipcSecret: {},
  ipc: { fs: __ipcFsMock }
}))

const __preferencesStub = {
  autoSave: false,
  autoSaveDelay: 5000,
  liveReload: true,
  defaultEncoding: 'utf8',
  endOfLine: 'lf',
  zoom: 1,
  previewModeOnFinderOpen: true,
  SET_USER_PREFERENCE: vi.fn(),
  SET_MODE: vi.fn(),
  SET_SINGLE_PREFERENCE: vi.fn()
}
const __projectStub = { projectTree: null, projectTrees: [] }
const __layoutStub = {
  rightColumn: 'files',
  showSideBar: false,
  showTabBar: false,
  SET_LAYOUT: vi.fn(function (p) {
    Object.assign(__layoutStub, p)
  }),
  DISPATCH_LAYOUT_MENU_ITEMS: vi.fn(),
  REQUEST_INITIAL_WINDOW_RESIZE: vi.fn()
}
const __mainStub = {
  init: false,
  SET_INITIALIZED: vi.fn(function () {
    __mainStub.init = true
  })
}

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => __preferencesStub
}))
vi.mock('@/store/project', () => ({
  useProjectStore: () => __projectStub
}))
vi.mock('@/store/layout', () => ({
  useLayoutStore: () => __layoutStub
}))
vi.mock('@/store', () => ({
  useMainStore: () => __mainStub
}))
vi.mock('@/store/index', () => ({
  useMainStore: () => __mainStub
}))

// ─── test suite ───────────────────────────────────────────────────────

describe('store/editor — C-68 opened baselines', () => {
  let editor

  beforeEach(async () => {
    vi.useFakeTimers()
    setupTestPinia()
    __resetDiffSnapshots()

    __preferencesStub.autoSave = false
    __preferencesStub.liveReload = true
    __ipcFsMock.read.mockReset()
    __ipcFsMock.read.mockResolvedValue('# from disk')
    __ipcPrefsMock.get.mockReset()
    __ipcPrefsMock.get.mockResolvedValue(null)

    const editorMod = await import('@/store/editor')
    editorMod.__resetBootPhase()
    editor = editorMod.useEditorStore()
    editor.END_BOOT_PHASE()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── helpers ───────────────────────────────────────────────────────

  const mdDocument = (markdown, pathname, filename) => ({
    markdown,
    pathname,
    filename: filename ?? pathname.split('/').pop(),
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 3,
    isMixedLineEndings: false
  })

  const dataChange = (markdown, pathname) => ({
    pathname,
    data: mdDocument(markdown, pathname)
  })

  function seedTab(overrides = {}) {
    const tab = {
      id: overrides.id ?? 'tab-1',
      filename: overrides.filename ?? 'test.md',
      pathname: overrides.pathname ?? '/tmp/test.md',
      markdown: overrides.markdown ?? '# original',
      isSaved: overrides.isSaved ?? true,
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 3,
      history: { stack: [], index: -1, lastEditIndex: -1 },
      cursor: { line: 1, ch: 0 },
      muyaIndexCursor: null,
      wordCount: { paragraph: 0, word: 0, character: 0, all: 0 },
      searchMatches: { index: -1, matches: [], value: '' },
      notifications: [],
      scrollTop: 0,
      previewMode: false,
      ...overrides
    }
    editor.tabs = [tab]
    editor.currentFile = tab
    editor.updateTabIdToIndex()
    return tab
  }

  // ─── open / reopen / session restore (NEW_TAB_WITH_CONTENT) ───────

  it('opening a file records the opened snapshot of the loaded content', () => {
    editor.NEW_TAB_WITH_CONTENT({
      markdownDocument: mdDocument('# From disk', '/tmp/opened.md'),
      options: {},
      selected: true
    })

    const id = editor.currentFile.id
    expect(editor.currentFile.pathname).toBe('/tmp/opened.md')
    expect(openedSnapshot(id)).toEqual({
      markdown: '# From disk',
      takenAt: expect.any(Number),
      kind: 'opened'
    })
  })

  it('a background (unselected) disk load records the opened snapshot too', () => {
    editor.NEW_TAB_WITH_CONTENT({
      markdownDocument: mdDocument('# Background load', '/tmp/bg.md'),
      options: {},
      selected: false
    })

    const bg = editor.tabs.find((t) => t.pathname === '/tmp/bg.md')
    expect(openedSnapshot(bg.id).markdown).toBe('# Background load')
  })

  it('an untitled tab never records an opened snapshot', () => {
    editor.NEW_UNTITLED_TAB({ markdown: '# scratch' })

    expect(openedSnapshot(editor.currentFile.id)).toBeNull()
  })

  it('focusing an already-open file keeps the original opened snapshot', () => {
    editor.NEW_TAB_WITH_CONTENT({
      markdownDocument: mdDocument('# v1', '/tmp/same.md'),
      options: {},
      selected: true
    })
    const id = editor.currentFile.id
    const first = openedSnapshot(id)

    // Re-open of the same pathname focuses the existing tab and returns
    // early — the slot (and its takenAt) must survive.
    editor.NEW_TAB_WITH_CONTENT({
      markdownDocument: mdDocument('# v2 on disk', '/tmp/same.md'),
      options: {},
      selected: true
    })

    expect(editor.tabs).toHaveLength(1)
    expect(openedSnapshot(id)).toEqual(first)
  })

  it('session restore records an opened snapshot per restored tab', async () => {
    const paths = ['/tmp/restored.md', '/tmp/second.md']
    __ipcPrefsMock.get.mockImplementation(async key => key === 'lastSessionTabs' ? paths : null)
    __ipcFsMock.stat.mockResolvedValue({ isFile: true })
    // C-69 restores through the normal bridge open path. Its native/browser
    // routing has separate session-restore coverage; pin this load funnel.
    const invoke = vi.spyOn(window.electron.ipcRenderer, 'invoke').mockImplementation(async (command, pathname) => {
      expect(command).toBe('mt::open-file')
      editor.NEW_TAB_WITH_CONTENT({ markdownDocument: mdDocument(`# Loaded ${pathname}`, pathname), options: {}, selected: true })
    })
    try {
      await editor.RESTORE_SESSION()
      for (const pathname of paths) {
        const tab = editor.tabs.find(t => t.pathname === pathname)
        expect(tab).toBeTruthy()
        expect(openedSnapshot(tab.id).markdown).toBe(`# Loaded ${pathname}`)
      }
    } finally {
      invoke.mockRestore()
    }
  })

  // ─── external reload (loadChange) ──────────────────────────────────

  it('an external reload moves the opened slot to the landed content while the ring keeps the pre-reload version', () => {
    const tab = seedTab({ markdown: '# original' })

    editor.APPLY_FILE_CHANGE('change', dataChange('# rewritten by the agent', tab.pathname))

    expect(editor.tabs[0].markdown).toBe('# rewritten by the agent')
    // Ring (C-43, preferred baseline): the pre-reload content…
    expect(latestSnapshot(tab.id).markdown).toBe('# original')
    // …opened slot (C-68): what the reload just landed.
    expect(openedSnapshot(tab.id).markdown).toBe('# rewritten by the agent')
  })

  // ─── tab lifecycle ─────────────────────────────────────────────────

  it('closing the tab clears the opened slot with the ring', () => {
    editor.NEW_TAB_WITH_CONTENT({
      markdownDocument: mdDocument('# From disk', '/tmp/closeme.md'),
      options: {},
      selected: true
    })
    const tab = editor.currentFile
    expect(openedSnapshot(tab.id)).not.toBeNull()

    editor.FORCE_CLOSE_TAB(tab)

    expect(openedSnapshot(tab.id)).toBeNull()
  })
})
