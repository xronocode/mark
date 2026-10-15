// FILE: tests/renderer/store/editor-lock.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-40 T-004 per-tab read-only lock — editorStore.TOGGLE_LOCK_DOCUMENT semantics over the M-022 previewMode surface.
//   SCOPE: Store-level tests with stubbed sibling stores/bus/i18n (muya never loads): lock entry/exit, sidebar semantics, Finder-preview interplay, background tabs, no-op guards.
//   DEPENDS: Vitest, Pinia test setup, store/editor.js.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-55; .grace/changes/active/C-40 T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   __preferencesStub - preferences store stub (previewModeOnFinderOpen, sidebar prefs).
//   __projectStub - project store stub (no tree).
//   __layoutStub - layout store stub recording sidebar changes.
//   __mainStub - main store stub with init done (boot phase ended).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-004 initial pins: lock flips
//   previewMode without the Finder sidebar collapse, unlock restores
//   editing without sidebar churn, a Finder-previewed tab locks sticky
//   and unlocks through EXIT_PREVIEW_MODE, background-tab toggle, no-op
//   without a current file.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'

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

vi.mock('@/ipc/runtime', () => ({
  ipcFs: { read: vi.fn(async () => ''), write: vi.fn(), stat: vi.fn(), readdir: vi.fn(), unlink: vi.fn() },
  ipcWatch: {},
  ipcSearch: {},
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}), getAll: vi.fn(async () => ({})) },
  ipcWorkspace: {},
  ipcFonts: {},
  ipcRecent: { add: vi.fn(async () => {}), list: vi.fn(async () => []) },
  ipcShortcut: {},
  ipcSpell: {},
  ipcMenu: {},
  ipcPandoc: {},
  ipcUpdater: {},
  ipcScreenshot: {},
  ipcSecret: {},
  ipc: {}
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
  showSideBar: true,
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

describe('store/editor — C-40 T-004 TOGGLE_LOCK_DOCUMENT', () => {
  let editor

  const makeTab = (overrides = {}) => ({
    id: overrides.id ?? 'tab-1',
    filename: 'notes.md',
    pathname: '/tmp/notes.md',
    markdown: '# content',
    isSaved: true,
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 3,
    history: { stack: [], index: -1, lastEditIndex: -1 },
    cursor: null,
    wordCount: { paragraph: 0, word: 0, character: 0, all: 0 },
    searchMatches: { index: -1, matches: [], value: '' },
    notifications: [],
    previewMode: false,
    ...overrides
  })

  const activate = (tab) => {
    editor.tabs = [tab]
    editor.currentFile = tab
    editor.updateTabIdToIndex()
  }

  beforeEach(async () => {
    setupTestPinia()
    __layoutStub.showSideBar = true
    __preferencesStub.previewModeOnFinderOpen = true

    const editorMod = await import('@/store/editor')
    editorMod.__resetBootPhase()
    editor = editorMod.useEditorStore()
    editor.END_BOOT_PHASE()
  })

  it('locking an editable tab enters the read-only surface without touching the sidebar', () => {
    const tab = makeTab()
    activate(tab)

    editor.TOGGLE_LOCK_DOCUMENT()

    expect(tab.locked).toBe(true)
    // The read-only surface is the existing previewMode flag (M-022) —
    // editor.vue flips contenteditable through isReadOnlySurface.
    expect(tab.previewMode).toBe(true)
    expect(tab._lockEnteredPreview).toBe(true)
    // A lock is not a Finder reading session: the sidebar stays as-is
    // (APPLY_PREVIEW_MODE would have collapsed it).
    expect(__layoutStub.showSideBar).toBe(true)
    expect(tab._previewSideBarSnapshot).toBeUndefined()
  })

  it('unlocking a self-entered lock restores editing without sidebar churn', () => {
    const tab = makeTab()
    activate(tab)
    editor.TOGGLE_LOCK_DOCUMENT()
    editor.TOGGLE_LOCK_DOCUMENT()

    expect(tab.locked).toBe(false)
    expect(tab.previewMode).toBe(false)
    expect(tab._lockEnteredPreview).toBeUndefined()
    // The lock never hid the sidebar, so unlocking must not touch it.
    expect(__layoutStub.showSideBar).toBe(true)
  })

  it('a Finder-previewed tab locks sticky and unlocks through the preview-exit semantics', () => {
    // Finder-open path: previewMode on with a sidebar snapshot.
    const tab = makeTab({
      previewMode: true,
      _previewSideBarSnapshot: true
    })
    activate(tab)
    __layoutStub.showSideBar = false

    // Lock makes the read-only state sticky (the click-to-exit gesture is
    // suppressed in editor.vue while tab.locked).
    editor.TOGGLE_LOCK_DOCUMENT()
    expect(tab.locked).toBe(true)
    expect(tab.previewMode).toBe(true)

    // Unlock restores editing through EXIT_PREVIEW_MODE: with the
    // previewModeOnFinderOpen pref on, the sidebar stays hidden after
    // the preview session (existing M-022 behavior).
    editor.TOGGLE_LOCK_DOCUMENT()
    expect(tab.locked).toBe(false)
    expect(tab.previewMode).toBe(false)
    expect(__layoutStub.showSideBar).toBe(false)
  })

  it('toggles a background tab by id without switching to it', () => {
    const current = makeTab({ id: 'current' })
    const background = makeTab({ id: 'background' })
    editor.tabs = [current, background]
    editor.currentFile = current
    editor.updateTabIdToIndex()

    editor.TOGGLE_LOCK_DOCUMENT('background')

    expect(background.locked).toBe(true)
    expect(background.previewMode).toBe(true)
    expect(current.locked).toBeUndefined()
    expect(current.previewMode).toBe(false)
    // No implicit activation.
    expect(editor.currentFile.id).toBe('current')
  })

  it('is a no-op without a current file', () => {
    editor.currentFile = {}
    expect(() => editor.TOGGLE_LOCK_DOCUMENT()).not.toThrow()
  })

  it('re-locking a locked tab keeps the state idempotent', () => {
    const tab = makeTab()
    activate(tab)
    editor.TOGGLE_LOCK_DOCUMENT()
    editor.TOGGLE_LOCK_DOCUMENT()
    editor.TOGGLE_LOCK_DOCUMENT()

    expect(tab.locked).toBe(true)
    expect(tab.previewMode).toBe(true)
    expect(tab._lockEnteredPreview).toBe(true)
  })

  it('honours the pref-off unlock path: a preview pre-existing the lock restores the snapshot', () => {
    __preferencesStub.previewModeOnFinderOpen = false
    const tab = makeTab({ previewMode: true, _previewSideBarSnapshot: true })
    activate(tab)
    __layoutStub.showSideBar = false

    editor.TOGGLE_LOCK_DOCUMENT()
    editor.TOGGLE_LOCK_DOCUMENT()

    expect(tab.previewMode).toBe(false)
    // pref off → EXIT restores the snapshotted visibility.
    expect(__layoutStub.showSideBar).toBe(true)
  })
})
