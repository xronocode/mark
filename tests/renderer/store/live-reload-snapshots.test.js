/**
 * C-43 S1 — store-level tests for the pre-reload snapshot wiring in
 * editor.js APPLY_FILE_CHANGE. Every apply path must capture the tab's
 * markdown from just before the external content lands, and only when it
 * actually differs; closing the tab drops the ring.
 *
 * Covered paths:
 *   1. watcher disk-read path (liveReload=true, clean tab): snapshot of the
 *      pre-reload markdown is recorded
 *   2. hash-skip: identical disk content records nothing
 *   3. legacy change.data path records synchronously
 *   4. dirty-tab conflict prompt confirm records on both branches
 *      (disk-read and embedded data)
 *   5. FORCE_CLOSE_TAB clears the tab's snapshots
 *
 * Pitfall mitigations (same conventions as live-reload.test.js):
 *   #1 — sibling stores stubbed as plain objects
 *   #2 — bus singleton mocked at both @/bus and ../bus
 *   #4 — i18n / commands / element-plus stubbed so muya never loads
 */

// FILE: tests/renderer/store/live-reload-snapshots.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove APPLY_FILE_CHANGE records the pre-reload markdown into the C-43 snapshot ring on every apply path, skips identical content, and FORCE_CLOSE_TAB clears the ring.
//   SCOPE: editor.js APPLY_FILE_CHANGE (data, disk-read, conflict-confirm branches) + FORCE_CLOSE_TAB against the real store/diffSnapshots ring.
//   DEPENDS: src/renderer/src/store/editor.js, src/renderer/src/store/diffSnapshots.js, tests/renderer/pinia
//   LINKS: .grace/changes/active/C-43 R-1/R-4; .grace/verification/runtime.xml V-M-011 scenario-38
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeTab - minimal tab state for one pathname/id.
//   seedTab - install one tab as tabs[0] + currentFile.
//   dataChange - change payload with embedded data (legacy path).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-43 S1 initial wiring tests.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'
import {
  latestSnapshot,
  snapshotCount,
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
vi.mock('@/ipc/runtime', () => ({
  ipcFs: __ipcFsMock,
  ipcWatch: {},
  ipcSearch: {},
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}), getAll: vi.fn(async () => ({})) },
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
const __projectStub = { projectTree: null }
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

describe('store/editor — C-43 pre-reload snapshots', () => {
  let editor

  beforeEach(async () => {
    vi.useFakeTimers()
    setupTestPinia()
    __resetDiffSnapshots()

    __preferencesStub.autoSave = false
    __preferencesStub.liveReload = true
    __ipcFsMock.read.mockReset()
    __ipcFsMock.read.mockResolvedValue('# from disk')

    const editorMod = await import('@/store/editor')
    editorMod.__resetBootPhase()
    editor = editorMod.useEditorStore()
    editor.END_BOOT_PHASE()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── helpers ───────────────────────────────────────────────────────

  function makeTab(overrides = {}) {
    return {
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
  }

  function seedTab(overrides = {}) {
    const tab = makeTab(overrides)
    editor.tabs = [tab]
    editor.currentFile = tab
    editor.updateTabIdToIndex()
    return tab
  }

  const dataChange = (markdown, pathname = '/tmp/test.md') => ({
    pathname,
    data: {
      markdown,
      filename: 'test.md',
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 3,
      isMixedLineEndings: false
    }
  })

  // ─── watcher disk-read path ────────────────────────────────────────

  it('an external change records the tab markdown from before the reload', async () => {
    const tab = seedTab({ markdown: '# original' })
    __ipcFsMock.read.mockResolvedValue('# changed on disk')

    editor.APPLY_FILE_CHANGE('change', { pathname: tab.pathname })
    await vi.advanceTimersByTimeAsync(150)

    expect(editor.tabs[0].markdown).toBe('# changed on disk')
    expect(snapshotCount(tab.id)).toBe(1)
    expect(latestSnapshot(tab.id).markdown).toBe('# original')
  })

  it('an identical-content change records nothing (hash-skip)', async () => {
    const tab = seedTab({ markdown: '# original' })
    __ipcFsMock.read.mockResolvedValue('# original')

    editor.APPLY_FILE_CHANGE('change', { pathname: tab.pathname })
    await vi.advanceTimersByTimeAsync(150)

    expect(snapshotCount(tab.id)).toBe(0)
  })

  it('successive external changes keep a ring of pre-reload versions', async () => {
    const tab = seedTab({ markdown: '# v1' })
    __ipcFsMock.read.mockResolvedValue('# v2')

    editor.APPLY_FILE_CHANGE('change', { pathname: tab.pathname })
    await vi.advanceTimersByTimeAsync(150)
    __ipcFsMock.read.mockResolvedValue('# v3')
    editor.APPLY_FILE_CHANGE('change', { pathname: tab.pathname })
    await vi.advanceTimersByTimeAsync(150)

    expect(editor.tabs[0].markdown).toBe('# v3')
    expect(snapshotCount(tab.id)).toBe(2)
    expect(latestSnapshot(tab.id).markdown).toBe('# v2')
  })

  // ─── legacy change.data path ───────────────────────────────────────

  it('the embedded-data path records synchronously', () => {
    const tab = seedTab({ markdown: '# old' })

    editor.APPLY_FILE_CHANGE('change', dataChange('# from payload', tab.pathname))

    expect(editor.tabs[0].markdown).toBe('# from payload')
    expect(latestSnapshot(tab.id).markdown).toBe('# old')
  })

  it('embedded data identical to the tab records nothing', () => {
    const tab = seedTab({ markdown: '# same' })

    editor.APPLY_FILE_CHANGE('change', dataChange('# same', tab.pathname))

    expect(snapshotCount(tab.id)).toBe(0)
  })

  // ─── dirty-tab conflict confirm ────────────────────────────────────

  it('conflict confirm (disk branch) snapshots the dirty pre-reload content', async () => {
    __preferencesStub.liveReload = false
    __preferencesStub.autoSave = false
    const tab = seedTab({ isSaved: false, markdown: '# dirty edits' })
    __ipcFsMock.read.mockResolvedValue('# external truth')

    editor.APPLY_FILE_CHANGE('change', { pathname: tab.pathname })
    expect(editor.tabs[0].notifications).toHaveLength(1)
    editor.tabs[0].notifications[0].action(true)
    await vi.advanceTimersByTimeAsync(150)

    expect(editor.tabs[0].markdown).toBe('# external truth')
    expect(latestSnapshot(tab.id).markdown).toBe('# dirty edits')
  })

  it('conflict decline records nothing', async () => {
    __preferencesStub.liveReload = false
    __preferencesStub.autoSave = false
    const tab = seedTab({ isSaved: false, markdown: '# keep me' })

    editor.APPLY_FILE_CHANGE('change', { pathname: tab.pathname })
    editor.tabs[0].notifications[0].action(false)
    await vi.advanceTimersByTimeAsync(150)

    expect(editor.tabs[0].markdown).toBe('# keep me')
    expect(snapshotCount(tab.id)).toBe(0)
  })

  it('conflict confirm (embedded-data branch) snapshots too', async () => {
    __preferencesStub.liveReload = false
    __preferencesStub.autoSave = false
    const tab = seedTab({ isSaved: false, markdown: '# old' })

    editor.APPLY_FILE_CHANGE('change', dataChange('# embedded', tab.pathname))
    editor.tabs[0].notifications[0].action(true)
    await vi.advanceTimersByTimeAsync(150)

    expect(editor.tabs[0].markdown).toBe('# embedded')
    expect(latestSnapshot(tab.id).markdown).toBe('# old')
  })

  // ─── tab lifecycle ─────────────────────────────────────────────────

  it('closing the tab clears its snapshots', () => {
    const tab = seedTab({ markdown: '# original', isSaved: true })

    editor.APPLY_FILE_CHANGE('change', dataChange('# reloaded', tab.pathname))
    expect(snapshotCount(tab.id)).toBe(1)

    editor.FORCE_CLOSE_TAB(tab)

    expect(editor.tabs).toHaveLength(0)
    expect(snapshotCount(tab.id)).toBe(0)
    expect(latestSnapshot(tab.id)).toBeNull()
  })

  it('closing one tab leaves another tab\u2019s snapshots alone', () => {
    const tabA = seedTab({ id: 'tab-a', pathname: '/tmp/a.md', markdown: '# a' })
    const tabB = makeTab({ id: 'tab-b', pathname: '/tmp/b.md', markdown: '# b' })
    editor.tabs = [tabA, tabB]
    editor.currentFile = tabA
    editor.updateTabIdToIndex()

    editor.APPLY_FILE_CHANGE('change', dataChange('# a2', '/tmp/a.md'))
    editor.APPLY_FILE_CHANGE('change', dataChange('# b2', '/tmp/b.md'))
    expect(snapshotCount('tab-a')).toBe(1)
    expect(snapshotCount('tab-b')).toBe(1)

    editor.FORCE_CLOSE_TAB(tabA)

    expect(snapshotCount('tab-a')).toBe(0)
    expect(latestSnapshot('tab-b').markdown).toBe('# b')
  })

  it('a sidebar rename keeps the snapshots (keyed by tab id)', () => {
    const tab = seedTab({ markdown: '# original' })
    editor.APPLY_FILE_CHANGE('change', dataChange('# reloaded', tab.pathname))
    expect(snapshotCount(tab.id)).toBe(1)

    // C-4 RENAME_IF_NEEDED keeps tab.id — the ring follows the path move.
    editor.RENAME_IF_NEEDED({ src: '/tmp/test.md', dest: '/tmp/renamed.md' })

    expect(tab.pathname).toBe('/tmp/renamed.md')
    expect(latestSnapshot(tab.id).markdown).toBe('# original')
  })
})
