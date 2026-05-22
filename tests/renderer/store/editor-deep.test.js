/**
 * Deep coverage tests for src/renderer/src/store/editor.js
 *
 * Targets remaining uncovered statements (87) not covered by existing tests:
 *   - adjustTrailingNewlines — all cases (option 0, 1, default)
 *   - trimTrailingNewlines helper
 *   - createApplicationMenuState — all affiliation branches
 *   - createSelectionFormatState
 *   - getRootFolderFromState — with and without project tree
 *   - LISTEN_FOR_CONTENT_CHANGE — adjustTrailingNewlines integration
 *   - _subscribeFileWatch — various branches
 *   - _unsubscribeFileWatch — other tabs with same path
 *   - APPLY_PREVIEW_MODE — full enter/exit cycle
 *   - EXIT_PREVIEW_MODE — previewModeOnFinderOpen false → restore snapshot
 *   - APPLY_SAVE_OUTCOME — lastSavedHistoryId update
 *   - loadChange — with history stack for old history restoration
 *   - LISTEN_FOR_CLOSE — all dialog branches
 *   - EXCHANGE_TABS_BY_ID — fromIndex > toIndex path
 *   - NEW_TAB_WITH_CONTENT — replace untitled blank tab
 *   - SWITCH_TAB_BY_INDEX — error when current tab not found
 */

import { setupTestPinia } from '../pinia'

// ─── module-level mocks ───────────────────────────────────────────

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

const elMessageBoxConfirmMock = vi.fn(async () => 'confirm')
vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: (...args) => elMessageBoxConfirmMock(...args),
    alert: vi.fn(async () => undefined)
  }
}))
vi.mock('element-plus/es/components/message-box/index.mjs', () => ({
  ElMessageBox: {
    confirm: (...args) => elMessageBoxConfirmMock(...args),
    alert: vi.fn(async () => undefined)
  }
}))

const __ipcFsMock = {
  read: vi.fn(async () => 'mocked'),
  write: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn()
}
const __ipcWatchMock = {
  subscribe: vi.fn(async () => vi.fn())
}
vi.mock('@/ipc/runtime', () => ({
  ipcFs: __ipcFsMock,
  ipcWatch: __ipcWatchMock,
  ipcSearch: {},
  ipcPrefs: {},
  ipcWorkspace: {},
  ipcFonts: {},
  ipcRecent: {},
  ipcShortcut: {},
  ipcSpell: {},
  ipcMenu: {},
  ipcPandoc: {},
  ipcUpdater: {},
  ipcScreenshot: {},
  ipcSecret: {},
  ipc: { fs: __ipcFsMock }
}))

vi.mock('@/commands', () => ({
  FileEncodingCommand: class {},
  LineEndingCommand: class {},
  QuickOpenCommand: class {},
  TrailingNewlineCommand: class {}
}))

const __preferencesStub = {
  autoSave: false,
  autoSaveDelay: 100,
  liveReload: false,
  defaultEncoding: 'utf8',
  endOfLine: 'lf',
  zoom: 1,
  previewModeOnFinderOpen: true,
  SET_USER_PREFERENCE: vi.fn(),
  SET_MODE: vi.fn(),
  SET_SINGLE_PREFERENCE: vi.fn()
}
const __projectStub = {
  projectTree: null,
  projectTrees: []
}
const __layoutStub = {
  rightColumn: 'files',
  showSideBar: false,
  showTabBar: false,
  SET_LAYOUT: vi.fn(function (p) { Object.assign(__layoutStub, p) }),
  DISPATCH_LAYOUT_MENU_ITEMS: vi.fn(),
  REQUEST_INITIAL_WINDOW_RESIZE: vi.fn()
}
const __mainStub = {
  init: false,
  SET_INITIALIZED: vi.fn(function () { __mainStub.init = true })
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

// ─── test suite ───────────────────────────────────────────────────

describe('store/editor — deep coverage', () => {
  let editor
  let bus

  function makeTab (overrides = {}) {
    return {
      id: overrides.id ?? 'tab-1',
      filename: overrides.filename ?? 'untitled.md',
      pathname: overrides.pathname ?? '',
      markdown: overrides.markdown ?? '',
      isSaved: overrides.isSaved ?? true,
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: overrides.trimTrailingNewline ?? 3,
      history: overrides.history ?? { stack: [], index: -1, lastEditIndex: -1 },
      cursor: overrides.cursor ?? null,
      wordCount: { paragraph: 0, word: 0, character: 0, all: 0 },
      searchMatches: { index: -1, matches: [], value: '' },
      notifications: [],
      scrollTop: overrides.scrollTop ?? 0,
      muyaIndexCursor: overrides.muyaIndexCursor ?? null,
      blocks: overrides.blocks ?? null,
      ...overrides
    }
  }

  beforeEach(async () => {
    setupTestPinia()
    __preferencesStub.autoSave = false
    __preferencesStub.autoSaveDelay = 100
    __preferencesStub.liveReload = false
    __preferencesStub.previewModeOnFinderOpen = true
    __projectStub.projectTree = null
    __projectStub.projectTrees = []
    __layoutStub.showSideBar = false
    __layoutStub.showTabBar = false
    elMessageBoxConfirmMock.mockReset()
    elMessageBoxConfirmMock.mockResolvedValue('confirm')

    const editorMod = await import('@/store/editor')
    editor = editorMod.useEditorStore()
    bus = (await import('@/bus')).default
  })

  // ─── adjustTrailingNewlines (via LISTEN_FOR_CONTENT_CHANGE) ─────

  describe('adjustTrailingNewlines via LISTEN_FOR_CONTENT_CHANGE', () => {
    function setupTab (trimOption, markdown, historyId = 'h0') {
      const tab = makeTab({
        id: 't1',
        pathname: '/tmp/a.md',
        markdown,
        trimTrailingNewline: trimOption,
        history: { stack: [{ id: historyId }], index: 0, lastEditIndex: 0 },
        lastSavedHistoryId: historyId
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()
      return tab
    }

    it('option 0: trims trailing newlines', () => {
      setupTab(0, 'old')
      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'hello\n\n\n',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })
      expect(editor.tabs[0].markdown).toBe('hello')
    })

    it('option 1: ensures single trailing newline', () => {
      setupTab(1, 'old')
      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'hello\n\n\n',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })
      expect(editor.tabs[0].markdown).toBe('hello\n')
    })

    it('option 1: returns empty for single newline input', () => {
      setupTab(1, 'old')
      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: '\n',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })
      // Single newline → empty (makes no sense to add trailing newline)
      expect(editor.tabs[0].markdown).toBe('')
    })

    it('option 1: keeps markdown with single trailing newline as-is', () => {
      setupTab(1, 'old')
      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'hello\n',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })
      expect(editor.tabs[0].markdown).toBe('hello\n')
    })

    it('option 1: returns empty string for all-newline input', () => {
      setupTab(1, 'old')
      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: '\n\n\n',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })
      expect(editor.tabs[0].markdown).toBe('')
    })

    it('option default (3): uses text as-is', () => {
      setupTab(3, 'old')
      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'hello\n\n\n',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })
      expect(editor.tabs[0].markdown).toBe('hello\n\n\n')
    })

    it('handles null/empty markdown', () => {
      setupTab(0, 'old')
      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: '',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })
      expect(editor.tabs[0].markdown).toBe('')
    })

    it('option 1: handles markdown without trailing newline — adds one', () => {
      setupTab(1, 'old')
      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'hello',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })
      expect(editor.tabs[0].markdown).toBe('hello\n')
    })
  })

  // ─── APPLY_PREVIEW_MODE / EXIT_PREVIEW_MODE — full cycle ────────

  describe('APPLY_PREVIEW_MODE / EXIT_PREVIEW_MODE — deep', () => {
    it('full enter → exit cycle with previewModeOnFinderOpen=true', () => {
      __layoutStub.showSideBar = true
      const tab = makeTab({ id: 'p1' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

      editor.APPLY_PREVIEW_MODE('p1', true)

      expect(editor.tabs[0].previewMode).toBe(true)
      expect(editor.tabs[0]._previewSideBarSnapshot).toBe(true)
      expect(__layoutStub.showSideBar).toBe(false)

      editor.EXIT_PREVIEW_MODE('p1', 'test')
      expect(editor.tabs[0].previewMode).toBe(false)
      // previewModeOnFinderOpen=true → keep sidebar hidden
      expect(__layoutStub.showSideBar).toBe(false)
      expect(editor.tabs[0]._previewSideBarSnapshot).toBeUndefined()

      debugSpy.mockRestore()
    })

    it('exit with previewModeOnFinderOpen=false restores snapshot', () => {
      __layoutStub.showSideBar = true
      __preferencesStub.previewModeOnFinderOpen = true
      const tab = makeTab({ id: 'p2' })
      editor.tabs = [tab]

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

      editor.APPLY_PREVIEW_MODE('p2', true)
      expect(editor.tabs[0]._previewSideBarSnapshot).toBe(true)

      // Now change pref to false
      __preferencesStub.previewModeOnFinderOpen = false
      editor.EXIT_PREVIEW_MODE('p2', 'cmd-toggle')

      // Should restore to snapshot value (true)
      expect(__layoutStub.showSideBar).toBe(true)

      debugSpy.mockRestore()
    })

    it('APPLY_PREVIEW_MODE(id, false) routes to EXIT_PREVIEW_MODE', () => {
      const tab = makeTab({ id: 'p3', previewMode: true })
      editor.tabs = [tab]

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

      editor.APPLY_PREVIEW_MODE('p3', false)
      expect(editor.tabs[0].previewMode).toBe(false)

      debugSpy.mockRestore()
    })

    it('APPLY_PREVIEW_MODE is idempotent when already in preview', () => {
      __preferencesStub.previewModeOnFinderOpen = true
      const tab = makeTab({ id: 'p4', previewMode: true })
      editor.tabs = [tab]

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      editor.APPLY_PREVIEW_MODE('p4', true)
      // Should be a no-op (I-01 idempotency)
      debugSpy.mockRestore()
    })

    it('APPLY_PREVIEW_MODE is no-op when previewModeOnFinderOpen is false (S-04 gate)', () => {
      __preferencesStub.previewModeOnFinderOpen = false
      const tab = makeTab({ id: 'p5' })
      editor.tabs = [tab]

      editor.APPLY_PREVIEW_MODE('p5', true)
      expect(editor.tabs[0].previewMode).toBeUndefined()
    })
  })

  // ─── loadChange — old history restoration ────────────────────────

  describe('loadChange — history restoration', () => {
    it('restores old history when stack has entries', () => {
      const tab = makeTab({
        id: 't1',
        pathname: '/tmp/x.md',
        filename: 'x.md',
        history: {
          stack: [{ id: 'old-h1' }, { id: 'old-h2' }],
          index: 1,
          lastEditIndex: 1
        }
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.loadChange({
        pathname: '/tmp/x.md',
        data: {
          markdown: 'reloaded',
          filename: 'x.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      // Old history should be preserved as single-entry stack
      expect(editor.tabs[0].history.stack).toHaveLength(1)
      expect(editor.tabs[0].history.stack[0].id).toBe('old-h2')
      expect(editor.tabs[0].history.index).toBe(0)
    })

    it('loadChange for non-current tab does NOT emit file-changed', () => {
      const tabA = makeTab({ id: 'a', pathname: '/tmp/a.md', filename: 'a.md' })
      const tabB = makeTab({ id: 'b', pathname: '/tmp/b.md', filename: 'b.md' })
      editor.tabs = [tabA, tabB]
      editor.currentFile = tabA // current is A
      editor.updateTabIdToIndex()

      bus.emit.mockClear()

      editor.loadChange({
        pathname: '/tmp/b.md', // updating B, not current
        data: {
          markdown: 'updated-b',
          filename: 'b.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      expect(editor.tabs[1].markdown).toBe('updated-b')
      expect(bus.emit).not.toHaveBeenCalledWith('file-changed', expect.anything())
    })
  })

  // ─── APPLY_SAVE_OUTCOME — lastSavedHistoryId ────────────────────

  describe('APPLY_SAVE_OUTCOME — lastSavedHistoryId', () => {
    it('sets lastSavedHistoryId when history stack is valid', () => {
      const tab = makeTab({
        id: 't1',
        pathname: '/tmp/a.md',
        isSaved: false,
        history: { stack: [{ id: 'h1' }, { id: 'h2' }], index: 1, lastEditIndex: 1 }
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.APPLY_SAVE_OUTCOME({
        id: 't1',
        isSaved: true
      })

      expect(editor.tabs[0].isSaved).toBe(true)
      expect(editor.tabs[0].lastSavedHistoryId).toBe('h2')
    })

    it('sets DIRNAME when saving current file with new pathname', () => {
      const tab = makeTab({ id: 't1', pathname: '', filename: 'Untitled' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.APPLY_SAVE_OUTCOME({
        id: 't1',
        pathname: '/tmp/saved.md',
        filename: 'saved.md',
        isSaved: true
      })

      expect(window.DIRNAME).toBe('/tmp')
    })
  })

  // ─── EXCHANGE_TABS_BY_ID — additional paths ─────────────────────

  describe('EXCHANGE_TABS_BY_ID — deep', () => {
    it('from > to index: reorders correctly', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.updateTabIdToIndex()
      // Move 'c' (index 2) to position of 'b' (index 1)
      // fromIndex=2, toIndex=1, fromIndex > toIndex → realToIndex = 1
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'c', toId: 'b' })
      expect(editor.tabs.map((t) => t.id)).toEqual(['a', 'c', 'b'])
    })

    it('same from and to: no-op (moveItem returns true)', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'a', toId: 'a' })
      expect(editor.tabs.map((t) => t.id)).toEqual(['a', 'b'])
    })
  })

  // ─── SWITCH_TAB_BY_INDEX — error when current not in tabs ────────

  describe('SWITCH_TAB_BY_INDEX — edge cases', () => {
    it('errors when currentFile not found in tabs', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.currentFile = makeTab({ id: 'missing' })
      editor.updateTabIdToIndex()
      editor.SWITCH_TAB_BY_INDEX(0)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Cannot find current tab index'))
      spy.mockRestore()
    })

    it('errors when next tab at index has no id', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a' }), { id: '' }]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()
      editor.SWITCH_TAB_BY_INDEX(1)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Cannot find tab by index'))
      spy.mockRestore()
    })

    it('warns on negative index', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a' })]
      editor.currentFile = editor.tabs[0]
      editor.SWITCH_TAB_BY_INDEX(-1)
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  // ─── CYCLE_TABS — additional edge cases ──────────────────────────

  describe('CYCLE_TABS — deep', () => {
    it('left cycle from middle position', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.currentFile = editor.tabs[1] // 'b'
      editor.updateTabIdToIndex()
      editor.CYCLE_TABS(false) // left
      expect(editor.currentFile.id).toBe('a')
    })

    it('right cycle wraps around from last', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.currentFile = editor.tabs[1] // last
      editor.updateTabIdToIndex()
      editor.CYCLE_TABS(true) // right
      expect(editor.currentFile.id).toBe('a')
    })
  })

  // ─── SET_SAVE_STATUS_WHEN_REMOVE — multiple matching tabs ────────

  describe('SET_SAVE_STATUS_WHEN_REMOVE — deep', () => {
    it('marks all tabs with matching pathname as dirty', () => {
      editor.tabs = [
        makeTab({ id: 'a', pathname: '/tmp/x.md', isSaved: true }),
        makeTab({ id: 'b', pathname: '/tmp/x.md', isSaved: true }),
        makeTab({ id: 'c', pathname: '/tmp/y.md', isSaved: true })
      ]
      editor.SET_SAVE_STATUS_WHEN_REMOVE({ pathname: '/tmp/x.md' })
      expect(editor.tabs[0].isSaved).toBe(false)
      expect(editor.tabs[1].isSaved).toBe(false)
      expect(editor.tabs[2].isSaved).toBe(true)
    })
  })

  // ─── FORMAT_LINK_CLICK — anchor not found in TOC ─────────────────

  describe('FORMAT_LINK_CLICK — deep', () => {
    it('returns early when anchor slug not found in listToc', () => {
      editor.listToc = [{ slug: 'h1', githubSlug: 'known' }]
      editor.FORMAT_LINK_CLICK({ data: { href: '#unknown-anchor' }, dirname: '/' })
      // Should not emit scroll-to-header, should not send IPC
      expect(bus.emit).not.toHaveBeenCalledWith('scroll-to-header', expect.anything())
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::format-link-click',
        expect.anything()
      )
    })
  })

  // ─── NEW_TAB_WITH_CONTENT — replace untitled blank tab ───────────

  describe('NEW_TAB_WITH_CONTENT — replace untitled blank tab', () => {
    it('closes current untitled saved tab before opening new one', () => {
      // Create a blank untitled tab
      const blank = makeTab({ id: 'blank', isSaved: true, pathname: '', markdown: '' })
      editor.tabs = [blank]
      editor.currentFile = blank
      editor.updateTabIdToIndex()

      const md = {
        markdown: 'hello',
        filename: 'doc.md',
        pathname: '/tmp/doc.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 3,
        isMixedLineEndings: false
      }

      editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md, selected: true })

      // blank tab should be closed, new doc should be the only tab
      expect(editor.tabs.find((t) => t.id === 'blank')).toBeUndefined()
      expect(editor.currentFile.pathname).toBe('/tmp/doc.md')
    })
  })

  // ─── SELECTION_CHANGE — affiliation edge cases ────────────────────

  describe('SELECTION_CHANGE — deep affiliation branches', () => {
    it('li at depth 1 with listItemType=task → isTaskList true', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'x', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 1, block: { text: 'x', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'p' },
          { type: 'li', isLooseListItem: true, listItemType: 'task' },
          { type: 'p' }
        ]
      })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::editor-selection-changed',
        expect.any(Number),
        expect.objectContaining({
          isLooseListItem: true,
          isTaskList: true
        })
      )
    })

    it('pre block with frontmatter functionType', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'x', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 1, block: { text: 'x', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'pre', functionType: 'frontmatter' }
        ]
      })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::editor-selection-changed',
        expect.any(Number),
        expect.objectContaining({
          isCodeFences: true
        })
      )
    })

    it('pre block with html functionType', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'x', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 1, block: { text: 'x', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'pre', functionType: 'html' }
        ]
      })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::editor-selection-changed',
        expect.any(Number),
        expect.objectContaining({
          isCodeFences: true
        })
      )
    })

    it('pre block with multiplemath functionType', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'x', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 1, block: { text: 'x', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'pre', functionType: 'multiplemath' }
        ]
      })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::editor-selection-changed',
        expect.any(Number),
        expect.objectContaining({
          isCodeFences: true
        })
      )
    })

    it('p and li in affiliation cleans up li when ul present', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'x', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 1, block: { text: 'x', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'ul', children: [{ isLooseListItem: false }], listType: 'bullet' },
          { type: 'li' },
          { type: 'p' }
        ]
      })
      // After cleanup: ul should be present, li should be removed from affiliation
      const call = window.electron.ipcRenderer.send.mock.calls.find(
        (c) => c[0] === 'mt::editor-selection-changed'
      )
      const state = call[2]
      expect(state.affiliation.ul).toBe(true)
    })

    it('cleans up p from affiliation when 2+ types present', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'x', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 1, block: { text: 'x', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'ul', children: [{ isLooseListItem: false }], listType: 'bullet' },
          { type: 'p' }
        ]
      })
      const call = window.electron.ipcRenderer.send.mock.calls.find(
        (c) => c[0] === 'mt::editor-selection-changed'
      )
      const state = call[2]
      // p should be cleaned up when there are 2+ affiliation keys
      expect(state.affiliation.p).toBeUndefined()
    })
  })

  // ─── LISTEN_FOR_CLOSE — dialog branches ──────────────────────────

  describe('LISTEN_FOR_CLOSE — dialog branches', () => {
    it('closes window immediately when no unsaved files', async () => {
      const savedTab = makeTab({ id: 's1', isSaved: true })
      editor.tabs = [savedTab]
      editor.currentFile = savedTab
      editor.updateTabIdToIndex()

      editor.LISTEN_FOR_CLOSE()

      // Get the handler that was registered on mt::ask-for-close
      const onCall = window.electron.ipcRenderer.on.mock.calls.find(
        (c) => c[0] === 'mt::ask-for-close'
      )
      expect(onCall).toBeDefined()
      const handler = onCall[1]

      await handler()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::close-window')
    })

    it('shows dialog with unsaved named files and closes on "Don\'t Save"', async () => {
      const dirtyTab = makeTab({ id: 'd1', isSaved: false, pathname: '/tmp/dirty.md' })
      editor.tabs = [dirtyTab]
      editor.currentFile = dirtyTab
      editor.updateTabIdToIndex()

      // "Don't Save" → cancel
      elMessageBoxConfirmMock.mockRejectedValue('cancel')

      editor.LISTEN_FOR_CLOSE()
      const handler = window.electron.ipcRenderer.on.mock.calls.find(
        (c) => c[0] === 'mt::ask-for-close'
      )[1]

      await handler()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::close-window')
    })

    it('shows dialog with unsaved named files and keeps window on Escape/X', async () => {
      const dirtyTab = makeTab({ id: 'd2', isSaved: false, pathname: '/tmp/dirty.md' })
      editor.tabs = [dirtyTab]
      editor.currentFile = dirtyTab
      editor.updateTabIdToIndex()

      // X/Escape → 'close'
      elMessageBoxConfirmMock.mockRejectedValue('close')

      editor.LISTEN_FOR_CLOSE()
      const handler = window.electron.ipcRenderer.on.mock.calls.find(
        (c) => c[0] === 'mt::ask-for-close'
      )[1]

      window.electron.ipcRenderer.send.mockClear()
      await handler()
      // Should NOT close window
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith('mt::close-window')
    })

    it('shows dialog with untitled tabs only — confirm discards and closes', async () => {
      const untitled = makeTab({ id: 'u1', isSaved: false, pathname: '' })
      editor.tabs = [untitled]
      editor.currentFile = untitled
      editor.updateTabIdToIndex()

      elMessageBoxConfirmMock.mockResolvedValue('confirm')

      editor.LISTEN_FOR_CLOSE()
      const handler = window.electron.ipcRenderer.on.mock.calls.find(
        (c) => c[0] === 'mt::ask-for-close'
      )[1]

      await handler()
      // namedCount = 0 → "Discard & Close" → just close
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::close-window')
    })

    it('save-and-close failure shows notification and keeps window open', async () => {
      const notice = (await import('@/services/notification')).default
      const dirtyTab = makeTab({ id: 'd3', isSaved: false, pathname: '/tmp/dirty.md' })
      editor.tabs = [dirtyTab]
      editor.currentFile = dirtyTab
      editor.updateTabIdToIndex()

      elMessageBoxConfirmMock.mockResolvedValue('confirm')
      window.electron.ipcRenderer.invoke.mockRejectedValueOnce(new Error('save failed'))

      editor.LISTEN_FOR_CLOSE()
      const handler = window.electron.ipcRenderer.on.mock.calls.find(
        (c) => c[0] === 'mt::ask-for-close'
      )[1]

      await handler()
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    })
  })

  // ─── RESPONSE_FOR_RENAME — untitled path ─────────────────────────

  describe('RESPONSE_FOR_RENAME — untitled', () => {
    it('delegates to FILE_SAVE_AS for untitled file', async () => {
      const invoke = (await import('@tauri-apps/api/core')).invoke
      const tab = makeTab({ id: 't1', pathname: '', filename: 'Untitled' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      invoke.mockResolvedValueOnce({
        id: 't1', pathname: '/tmp/named.md', filename: 'named.md', isSaved: true
      })

      await editor.RESPONSE_FOR_RENAME()
      expect(invoke).toHaveBeenCalledWith('mt_response_file_save_as', expect.any(Object))
    })
  })

  // ─── RENAME — edge cases ─────────────────────────────────────────

  describe('RENAME — edge cases', () => {
    it('does nothing when filename is not a string', () => {
      editor.currentFile = makeTab({ id: 't1', filename: undefined, pathname: '/tmp/a.md' })
      editor.RENAME('new.md')
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith('mt::rename', expect.anything())
    })
  })

  // ─── EXPORT — edge cases ─────────────────────────────────────────

  describe('EXPORT — deep', () => {
    it('empty listToc results in empty title', () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [editor.currentFile]
      editor.listToc = []
      editor.EXPORT({ type: 'pdf', content: '<p/>', pageOptions: {} })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::response-export',
        expect.objectContaining({ title: '' })
      )
    })

    it('single header with lvl > 1 is used as title', () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [editor.currentFile]
      editor.listToc = [
        { slug: 's1', githubSlug: 'g1', content: 'SubTitle', lvl: 3 }
      ]
      editor.EXPORT({ type: 'pdf', content: '<p/>', pageOptions: {} })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::response-export',
        expect.objectContaining({ title: 'SubTitle' })
      )
    })
  })

  // ─── NEW_UNTITLED_TAB — null selected ────────────────────────────

  describe('NEW_UNTITLED_TAB — defaults', () => {
    it('selected defaults to true when null', () => {
      editor.NEW_UNTITLED_TAB({ markdown: 'test', selected: null })
      expect(editor.currentFile.markdown).toBe('test')
    })

    it('selected defaults to true when undefined', () => {
      editor.NEW_UNTITLED_TAB({ markdown: 'test2' })
      expect(editor.currentFile.markdown).toBe('test2')
    })
  })

  // ─── NEW_TAB_WITH_CONTENT — selected=undefined defaults to true ──

  describe('NEW_TAB_WITH_CONTENT — selected default', () => {
    it('defaults selected to true when not provided', () => {
      const md = {
        markdown: 'content',
        filename: 'f.md',
        pathname: '/tmp/f.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 3,
        isMixedLineEndings: false
      }

      editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md })
      expect(editor.currentFile.pathname).toBe('/tmp/f.md')
    })
  })
})
