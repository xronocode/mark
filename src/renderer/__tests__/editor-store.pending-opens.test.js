// MODULE_CONTRACT
//   PURPOSE: V-M-025 verification surface for the editor-store side of
//            M-025 perf-pending-opens-parallel. Confirms NEW_TAB_WITH_
//            CONTENT works during pre-mount window (Pinia ready, Vue not
//            yet mounted), preserves multi-tab queue ordering, and that
//            APPLY_PREVIEW_MODE pairs correctly with the previewMode
//            payload flag (V-M-022 contract preserved).
//   SCOPE:   pinia store unit tests. Sibling stores stubbed (Phase-4
//            Wave-1 pitfall #1 — defineStore factories trip "no active
//            Pinia" under vi.mock); muya / commands / element-plus
//            stubbed so the heavyweight editor module loads cleanly.
//   DEPENDS: pinia, vitest, store/editor (real impl).
//   LINKS:   docs/verification-plan.xml V-M-025 race-conditions R-2 +
//            integration line ("preview-mode preserved").

import { setupTestPinia } from '../../../tests/renderer/pinia'

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

const __preferencesStub = {
  autoSave: false,
  autoSaveDelay: 5000,
  defaultEncoding: 'utf8',
  endOfLine: 'lf',
  zoom: 1,
  previewModeOnFinderOpen: true
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

// ─── helpers ─────────────────────────────────────────────────────────

function makeMarkdownDocument(overrides = {}) {
  return {
    markdown: '# default',
    filename: 'default.md',
    pathname: '/tmp/default.md',
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 3,
    cursor: null,
    isMixedLineEndings: false,
    previewMode: false,
    ...overrides
  }
}

// ─── test suite ──────────────────────────────────────────────────────

describe('editor store / M-025 pending-opens drain receiver', () => {
  let editor

  beforeEach(async () => {
    setupTestPinia()
    __preferencesStub.previewModeOnFinderOpen = true
    __layoutStub.showSideBar = false

    const editorMod = await import('@/store/editor')
    editor = editorMod.useEditorStore()
  })

  it('NEW_TAB_WITH_CONTENT works pre-mount (Pinia ready, Vue not yet mounted)', () => {
    // Pre-mount surface: NEW_TAB_WITH_CONTENT is invoked from the
    // mt::open-new-tab handler that fires DURING setupIpcListeners()'s
    // top-level drain — before app.mount() resolves. The action must
    // tolerate empty `tabs` + empty `currentFile` (initial store state).
    expect(editor.tabs).toEqual([])
    expect(editor.currentFile).toEqual({})
    const md = makeMarkdownDocument({
      pathname: '/tmp/a.md',
      filename: 'a.md',
      markdown: '# A'
    })
    expect(() =>
      editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md, options: {}, selected: true })
    ).not.toThrow()
    // The new tab landed.
    expect(editor.currentFile?.pathname).toBe('/tmp/a.md')
  })

  it('multi-tab drain preserves queue order (3 paths → 3 tabs in order)', () => {
    // Simulate the drain emitting 3 mt::open-new-tab events back-to-back
    // (the Rust loop in mt_drain_pending_opens iterates `drained` in
    // FIFO insertion order — Apple Event push order = drain emit order).
    const docs = [
      makeMarkdownDocument({ pathname: '/tmp/a.md', filename: 'a.md', markdown: '# A' }),
      makeMarkdownDocument({ pathname: '/tmp/b.md', filename: 'b.md', markdown: '# B' }),
      makeMarkdownDocument({ pathname: '/tmp/c.md', filename: 'c.md', markdown: '# C' })
    ]
    // First with selected=true (matches drain default), rest with
    // selected=false to mirror multi-file Finder drag-drop behaviour.
    editor.NEW_TAB_WITH_CONTENT({
      markdownDocument: docs[0],
      options: {},
      selected: true
    })
    editor.NEW_TAB_WITH_CONTENT({
      markdownDocument: docs[1],
      options: {},
      selected: false
    })
    editor.NEW_TAB_WITH_CONTENT({
      markdownDocument: docs[2],
      options: {},
      selected: false
    })
    expect(editor.tabs.length).toBe(3)
    expect(editor.tabs.map((t) => t.pathname)).toEqual([
      '/tmp/a.md',
      '/tmp/b.md',
      '/tmp/c.md'
    ])
  })

  it('previewMode flag in payload propagates via APPLY_PREVIEW_MODE (V-M-022 contract)', () => {
    const md = makeMarkdownDocument({
      pathname: '/tmp/p.md',
      filename: 'p.md',
      markdown: '# preview'
    })
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md, options: {}, selected: true })
    const tabId = editor.currentFile.id
    expect(tabId).toBeTruthy()
    // bootstrap-ipc.js mt::open-new-tab handler calls APPLY_PREVIEW_MODE
    // when payload.previewMode === true and the user pref is enabled.
    editor.APPLY_PREVIEW_MODE(tabId, true)
    const tab = editor.tabs.find((t) => t.id === tabId)
    expect(tab.previewMode).toBe(true)
  })

  it('previewMode pref disabled → APPLY_PREVIEW_MODE no-ops (V-M-022 S-04)', () => {
    __preferencesStub.previewModeOnFinderOpen = false
    const md = makeMarkdownDocument({
      pathname: '/tmp/q.md',
      filename: 'q.md',
      markdown: '# nope'
    })
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md, options: {}, selected: true })
    const tabId = editor.currentFile.id
    editor.APPLY_PREVIEW_MODE(tabId, true)
    const tab = editor.tabs.find((t) => t.id === tabId)
    // Pref disabled → APPLY_PREVIEW_MODE early-returns without writing
    // to the tab. The field remains whatever the freshly-created tab
    // state default was (undefined for this code path; createDocumentState
    // does not initialize `previewMode` unless markdownDocument carries
    // it). Either way, must NOT be true.
    expect(tab.previewMode).not.toBe(true)
  })

  it('drain delivering same path twice is deduplicated by pathname (V-M-025 R-3 set-equality)', () => {
    // V-M-025 invariant (6) "set equality": every queued path appears in
    // exactly one NEW_TAB_RECEIVED. NEW_TAB_WITH_CONTENT enforces
    // dedup-by-pathname — second call switches to the existing tab
    // rather than creating a duplicate.
    const md = makeMarkdownDocument({
      pathname: '/tmp/dup.md',
      filename: 'dup.md',
      markdown: '# x'
    })
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md, options: {}, selected: true })
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md, options: {}, selected: true })
    expect(editor.tabs.length).toBe(1)
    expect(editor.tabs[0].pathname).toBe('/tmp/dup.md')
  })
})
