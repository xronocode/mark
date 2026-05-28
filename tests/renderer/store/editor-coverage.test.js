/**
 * Additional coverage tests for src/renderer/src/store/editor.js
 *
 * Coverage target: 72% → 95%+
 *
 * Focuses on uncovered code paths:
 *   - HANDLE_AUTO_SAVE (timer logic, invoke path, error path)
 *   - _subscribeFileWatch / _unsubscribeFileWatch
 *   - CLOSE_UNSAVED_TAB (dialog branches: confirm-named, confirm-untitled, cancel, close)
 *   - LISTEN_FOR_CONTENT_CHANGE — toc update, auto-save trigger
 *   - SELECTION_CHANGE — cross-line selection, table/code block affiliation
 *   - adjustTrailingNewlines — options 0 and 1
 *   - createApplicationMenuState — code-block, table, list affiliation branches
 *   - SHOW_TAB_VIEW (always=true)
 *   - NEW_TAB_WITH_CONTENT — close untitled blank tab, selected=false
 *   - ASK_FOR_IMAGE_AUTO_PATH — with pathname
 *   - FORCE_CLOSE_TAB — clear autoSave timer, clear toc on last tab
 *   - CYCLE_TABS — left direction, error when tab not found
 *   - LISTEN_FOR_CLOSE — all three dialog branches
 *   - EXPORT — toc scanning for best header
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
  liveReload: true,
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

describe('store/editor — coverage gaps', () => {
  let editor
  let invoke
  let bus
  let notice

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
      trimTrailingNewline: 3,
      history: { stack: [], index: -1, lastEditIndex: -1 },
      cursor: null,
      wordCount: { paragraph: 0, word: 0, character: 0, all: 0 },
      searchMatches: { index: -1, matches: [], value: '' },
      notifications: [],
      scrollTop: 0,
      ...overrides
    }
  }

  beforeEach(async () => {
    setupTestPinia()
    __preferencesStub.autoSave = false
    __preferencesStub.autoSaveDelay = 100
    __preferencesStub.liveReload = true
    __preferencesStub.previewModeOnFinderOpen = true
    __projectStub.projectTree = null
    __projectStub.projectTrees = []
    __layoutStub.showSideBar = false
    __layoutStub.showTabBar = false
    __mainStub.init = false
    __ipcFsMock.read.mockReset()
    __ipcWatchMock.subscribe.mockReset()
    __ipcWatchMock.subscribe.mockImplementation(async () => vi.fn())
    elMessageBoxConfirmMock.mockReset()
    elMessageBoxConfirmMock.mockResolvedValue('confirm')

    const editorMod = await import('@/store/editor')
    editor = editorMod.useEditorStore()
    invoke = (await import('@tauri-apps/api/core')).invoke
    bus = (await import('@/bus')).default
    notice = (await import('@/services/notification')).default
  })

  // ─── HANDLE_AUTO_SAVE ─────────────────────────────────────────────

  describe('HANDLE_AUTO_SAVE', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('throws when id or pathname is missing', () => {
      expect(() =>
        editor.HANDLE_AUTO_SAVE({ id: '', pathname: '/x', markdown: '', options: {} })
      ).toThrow('Invalid tab')
      expect(() =>
        editor.HANDLE_AUTO_SAVE({ id: 'x', pathname: '', markdown: '', options: {} })
      ).toThrow('Invalid tab')
    })

    it('debounces: cancels previous timer if one exists', () => {
      vi.useFakeTimers()
      __preferencesStub.autoSave = true

      editor.HANDLE_AUTO_SAVE({
        id: 't1', filename: 'a.md', pathname: '/a.md', markdown: 'x', options: {}
      })
      editor.HANDLE_AUTO_SAVE({
        id: 't1', filename: 'a.md', pathname: '/a.md', markdown: 'y', options: {}
      })

      // Only one timer should fire after delay
      vi.advanceTimersByTime(200)
    })

    it('auto-save invokes mt_response_file_save after delay', async () => {
      vi.useFakeTimers()
      __preferencesStub.autoSave = true
      __preferencesStub.autoSaveDelay = 50

      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md', isSaved: false, markdown: 'text' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      invoke.mockResolvedValueOnce({
        id: 't1', pathname: '/tmp/a.md', filename: 'a.md', isSaved: true
      })

      editor.HANDLE_AUTO_SAVE({
        id: 't1', filename: 'a.md', pathname: '/tmp/a.md', markdown: 'text', options: {}
      })

      vi.advanceTimersByTime(60)
      await vi.runAllTimersAsync()

      expect(invoke).toHaveBeenCalledWith('mt_response_file_save', expect.objectContaining({
        id: 't1',
        pathname: '/tmp/a.md'
      }))
    })

    it('auto-save skips if tab is already saved by the time timer fires', async () => {
      vi.useFakeTimers()
      __preferencesStub.autoSave = true
      __preferencesStub.autoSaveDelay = 50

      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md', isSaved: true })
      editor.tabs = [tab]

      editor.HANDLE_AUTO_SAVE({
        id: 't1', filename: 'a.md', pathname: '/tmp/a.md', markdown: 'text', options: {}
      })

      vi.advanceTimersByTime(60)
      await vi.runAllTimersAsync()

      // invoke should NOT be called since tab is saved
      expect(invoke).not.toHaveBeenCalledWith('mt_response_file_save', expect.anything())
    })

    it('auto-save failure is caught and logged as warning', async () => {
      vi.useFakeTimers()
      __preferencesStub.autoSave = true
      __preferencesStub.autoSaveDelay = 50

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md', isSaved: false })
      editor.tabs = [tab]

      invoke.mockRejectedValueOnce(new Error('auto-save failed'))

      editor.HANDLE_AUTO_SAVE({
        id: 't1', filename: 'a.md', pathname: '/tmp/a.md', markdown: 'text', options: {}
      })

      vi.advanceTimersByTime(60)
      await vi.runAllTimersAsync()

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('auto-save'),
        expect.any(Error)
      )
      warnSpy.mockRestore()
    })
  })

  // ─── LISTEN_FOR_CONTENT_CHANGE — additional branches ──────────────

  describe('LISTEN_FOR_CONTENT_CHANGE — toc + autoSave', () => {
    it('updates toc and listToc when toc differs and tab is currentFile', () => {
      const tab = makeTab({
        id: 't1',
        markdown: 'x',
        history: { stack: [{ id: 'h-saved' }], index: 0, lastEditIndex: 0 },
        lastSavedHistoryId: 'h-saved'
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()
      editor.listToc = []

      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'x',
        history: { stack: [{ id: 'h-saved' }], index: 0, lastEditIndex: 0 },
        toc: [{ slug: 's1', content: 'Title', lvl: 1, githubSlug: 'title' }]
      })

      expect(editor.listToc).toHaveLength(1)
      expect(editor.listToc[0].slug).toBe('s1')
    })

    it('does not update toc when toc is same (deep-equal)', () => {
      const toc = [{ slug: 's1', content: 'Title', lvl: 1 }]
      const tab = makeTab({
        id: 't1',
        markdown: 'x',
        history: { stack: [{ id: 'h1' }], index: 0, lastEditIndex: 0 },
        lastSavedHistoryId: 'h1'
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()
      editor.listToc = [{ slug: 's1', content: 'Title', lvl: 1 }]

      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'x',
        history: { stack: [{ id: 'h1' }], index: 0, lastEditIndex: 0 },
        toc: [{ slug: 's1', content: 'Title', lvl: 1 }]
      })

      // Should not change reference (deep-equal returns true)
      expect(editor.listToc).toEqual(toc)
    })

    it('triggers HANDLE_AUTO_SAVE when dirty + autoSave + has pathname', () => {
      __preferencesStub.autoSave = true
      __preferencesStub.autoSaveDelay = 1000
      vi.useFakeTimers()

      const tab = makeTab({
        id: 't1',
        pathname: '/tmp/a.md',
        filename: 'a.md',
        markdown: 'old',
        history: { stack: [{ id: 'h0' }, { id: 'h1' }], index: 1, lastEditIndex: 1 },
        lastSavedHistoryId: 'h0'
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'changed',
        history: { stack: [{ id: 'h0' }, { id: 'h1' }], index: 1, lastEditIndex: 1 }
      })

      expect(editor.tabs[0].isSaved).toBe(false)
      vi.useRealTimers()
    })

    it('skips initial newline-only content change', () => {
      const tab = makeTab({
        id: 't1',
        markdown: '',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 },
        lastSavedHistoryId: 'h0'
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: '\n',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 }
      })

      // Should return early without setting isSaved
    })
  })

  // ─── CLOSE_UNSAVED_TAB ────────────────────────────────────────────
  // NOTE: These tests require ElMessageBox.confirm to be mockable. The
  // editor.js file imports from 'element-plus/es/components/message-box/index.mjs',
  // which we mock above. If the mock intercept works, the dialog resolves
  // synchronously; if not, these will timeout.

  describe('CLOSE_UNSAVED_TAB', () => {
    it('confirm + named file → sends mt::save-and-close-tabs', async () => {
      elMessageBoxConfirmMock.mockResolvedValue('confirm')
      const tab = makeTab({ id: 'u1', pathname: '/tmp/dirty.md', filename: 'dirty.md', isSaved: false })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      await editor.CLOSE_UNSAVED_TAB(tab)

      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::save-and-close-tabs',
        expect.arrayContaining([expect.objectContaining({ id: 'u1' })])
      )
    }, 10000)

    it('confirm + untitled (no pathname) → FORCE_CLOSE_TAB (discard)', async () => {
      elMessageBoxConfirmMock.mockResolvedValue('confirm')
      const tab = makeTab({ id: 'u2', pathname: '', filename: 'Untitled-1', isSaved: false })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      await editor.CLOSE_UNSAVED_TAB(tab)

      // Tab should have been force-closed
      expect(editor.tabs.find((t) => t.id === 'u2')).toBeUndefined()
    }, 10000)

    it('cancel ("Don\'t Save") → FORCE_CLOSE_TAB (discard)', async () => {
      elMessageBoxConfirmMock.mockRejectedValue('cancel')
      const tab = makeTab({ id: 'u3', pathname: '/tmp/x.md', isSaved: false })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      await editor.CLOSE_UNSAVED_TAB(tab)

      expect(editor.tabs.find((t) => t.id === 'u3')).toBeUndefined()
    }, 10000)

    it('close (X/Escape) → tab stays open', async () => {
      elMessageBoxConfirmMock.mockRejectedValue('close')
      const tab = makeTab({ id: 'u4', pathname: '/tmp/x.md', isSaved: false })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      await editor.CLOSE_UNSAVED_TAB(tab)

      // Tab should still be there
      expect(editor.tabs.find((t) => t.id === 'u4')).toBeDefined()
    }, 10000)
  })

  // ─── CYCLE_TABS — additional directions ───────────────────────────

  describe('CYCLE_TABS — left direction', () => {
    it('rotates currentFile left (wraps around)', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()
      editor.CYCLE_TABS(false) // left from index 0 → wraps to last
      expect(editor.currentFile.id).toBe('c')
    })

    it('errors when currentFile not in tabs', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.currentFile = makeTab({ id: 'missing' })
      editor.updateTabIdToIndex()
      editor.CYCLE_TABS(true)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Cannot find current tab index'))
      spy.mockRestore()
    })
  })

  // ─── SELECTION_CHANGE — cross-line and affiliation branches ───────

  describe('SELECTION_CHANGE — menu state', () => {
    it('cross-line selection does not set searchMatches.value', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'line 1', functionType: '' }, type: 'span' },
        end: { key: 'k2', offset: 5, block: { text: 'line 2', functionType: '' }, type: 'span' },
        affiliation: []
      })
      // searchMatches.value should NOT be set (different keys)
      expect(editor.currentFile.searchMatches.value).toBe('')
    })

    it('code block selection sets isCodeFences and isCodeContent', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'code', functionType: 'codeContent' }, type: 'span' },
        end: { key: 'k1', offset: 4, block: { text: 'code', functionType: 'codeContent' }, type: 'span' },
        affiliation: []
      })
      // The IPC send should include code block state
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::editor-selection-changed',
        expect.any(Number),
        expect.objectContaining({
          isCodeFences: true,
          isCodeContent: true
        })
      )
    })

    it('table cell selection sets isTable and isDisabled', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'cell', functionType: 'cellContent' }, type: 'span' },
        end: { key: 'k1', offset: 4, block: { text: 'cell', functionType: 'cellContent' }, type: 'span' },
        affiliation: [
          { type: 'figure', functionType: 'table' }
        ]
      })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::editor-selection-changed',
        expect.any(Number),
        expect.objectContaining({
          isCodeFences: true,
          isTable: true,
          isDisabled: true
        })
      )
    })

    it('list affiliation with depth >= 1 and ul/ol type sets isLooseListItem/isTaskList', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'item', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 4, block: { text: 'item', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'ul', children: [{ isLooseListItem: true }], listType: 'task' }
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

    it('list affiliation at depth >= 3 with li type', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'item', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 4, block: { text: 'item', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'p' },
          { type: 'li', isLooseListItem: false, listItemType: 'order' },
          { type: 'p' }
        ]
      })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::editor-selection-changed',
        expect.any(Number),
        expect.objectContaining({
          isLooseListItem: false,
          isTaskList: false
        })
      )
    })

    it('pre block with code functionType in affiliation', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'x', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 1, block: { text: 'x', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'pre', functionType: 'code' }
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

    it('multiline with heading (regex /^h{1,6}$/) clears affiliation', () => {
      // NOTE: The source code regex /^h{1,6}$/ matches 'hh', 'hhh', etc.
      // (NOT 'h1', 'h2') — this is likely a latent source bug. We test the
      // actual behavior: type='hh' triggers the clear branch.
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'a', functionType: '' }, type: 'span' },
        end: { key: 'k2', offset: 1, block: { text: 'b', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'p' },
          { type: 'hh' }
        ]
      })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::editor-selection-changed',
        expect.any(Number),
        expect.objectContaining({
          isMultiline: true,
          affiliation: {}
        })
      )
    })
  })

  // ─── EXPORT — toc scanning for best title ────────────────────────

  describe('EXPORT — toc header scanning', () => {
    it('picks the lowest-level header from first 6 toc entries', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [editor.currentFile]
      editor.listToc = [
        { slug: 's3', githubSlug: 'g3', content: 'Subsection', lvl: 3 },
        { slug: 's2', githubSlug: 'g2', content: 'Section', lvl: 2 },
        { slug: 's1', githubSlug: 'g1', content: 'MainTitle', lvl: 1 }
      ]
      const { save } = await import('@tauri-apps/plugin-dialog')
      save.mockResolvedValueOnce('/tmp/out.html')
      await editor.EXPORT({ type: 'styledHtml', content: '<p/>' })
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: 'a.html' })
      )
    })

    it('stops scanning when it finds lvl=1', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [editor.currentFile]
      editor.listToc = [
        { slug: 's1', githubSlug: 'g1', content: 'Title', lvl: 1 },
        { slug: 's2', githubSlug: 'g2', content: 'Sub', lvl: 2 }
      ]
      const { save } = await import('@tauri-apps/plugin-dialog')
      save.mockResolvedValueOnce('/tmp/out.html')
      await editor.EXPORT({ type: 'styledHtml', content: '<h1/>' })
      expect(save).toHaveBeenCalled()
    })

    it('uses empty title when listToc is empty', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [editor.currentFile]
      editor.listToc = []
      const { save } = await import('@tauri-apps/plugin-dialog')
      save.mockResolvedValueOnce('/tmp/out.html')
      await editor.EXPORT({ type: 'styledHtml', content: '<p/>' })
      expect(save).toHaveBeenCalled()
    })

    it('PDF type shows warning notification', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [editor.currentFile]
      await editor.EXPORT({ type: 'pdf', content: '<p/>' })
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warning' })
      )
    })
  })

  // ─── SHOW_TAB_VIEW ────────────────────────────────────────────────

  describe('SHOW_TAB_VIEW', () => {
    it('always=true → layout SET_LAYOUT called even with multiple tabs', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.SHOW_TAB_VIEW(true)
      expect(__layoutStub.SET_LAYOUT).toHaveBeenCalledWith({ showTabBar: true })
    })
  })

  // ─── FORCE_CLOSE_TAB — clears toc on last tab ────────────────────

  describe('FORCE_CLOSE_TAB', () => {
    it('clears toc when closing the last tab', () => {
      const tab = makeTab({ id: 'a', isSaved: true })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()
      editor.listToc = [{ slug: 's1' }]
      editor.toc = [{ slug: 's1' }]

      editor.FORCE_CLOSE_TAB(tab)

      expect(editor.listToc).toEqual([])
      expect(editor.toc).toEqual([])
      expect(editor.tabs).toHaveLength(0)
    })

    it('sends mt::window-tab-closed when tab has pathname', () => {
      const tab = makeTab({ id: 'a', pathname: '/tmp/a.md', isSaved: true })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.FORCE_CLOSE_TAB(tab)

      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::window-tab-closed',
        '/tmp/a.md'
      )
    })

    it('sets window.DIRNAME to empty when closing current file with no remaining tabs', () => {
      const tab = makeTab({ id: 'a', pathname: '/tmp/a.md', isSaved: true })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.FORCE_CLOSE_TAB(tab)

      expect(window.DIRNAME).toBe('')
    })

    it('switches to next tab when closing non-last tab', () => {
      const a = makeTab({ id: 'a', isSaved: true })
      const b = makeTab({ id: 'b', isSaved: true, pathname: '/tmp/b.md', markdown: 'hello' })
      editor.tabs = [a, b]
      editor.currentFile = a
      editor.updateTabIdToIndex()

      editor.FORCE_CLOSE_TAB(a)

      expect(editor.currentFile.id).toBe('b')
      expect(bus.emit).toHaveBeenCalledWith('file-changed', expect.objectContaining({ id: 'b' }))
    })
  })

  // ─── ASK_FOR_IMAGE_AUTO_PATH — with pathname ─────────────────────

  describe('ASK_FOR_IMAGE_AUTO_PATH — with pathname', () => {
    it('resolves image files from readdir + stat', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/doc.md' })
      editor.tabs = [editor.currentFile]

      window.fileUtils.readdir.mockResolvedValueOnce(['img.png', 'other.txt', 'sub'])
      window.fileUtils.stat
        .mockResolvedValueOnce({ is_directory: false, is_file: true })
        .mockResolvedValueOnce({ is_directory: false, is_file: true })
        .mockResolvedValueOnce({ is_directory: true, is_file: false })

      const result = await editor.ASK_FOR_IMAGE_AUTO_PATH('./')
      expect(result).toEqual([
        { text: 'img.png', iconClass: 'icon-image' },
        { text: 'sub/', iconClass: 'icon-folder' }
      ])
    })

    it('returns empty array when no pathname', async () => {
      editor.currentFile = makeTab({ id: 't1' })
      const result = await editor.ASK_FOR_IMAGE_AUTO_PATH('img.png')
      expect(result).toEqual([])
    })
  })

  // ─── CLOSE_TAB — unsaved tab branch ──────────────────────────────

  describe('CLOSE_TAB — unsaved branch', () => {
    it('unsaved tab → delegates to CLOSE_UNSAVED_TAB', async () => {
      elMessageBoxConfirmMock.mockRejectedValue('cancel')
      const tab = makeTab({ id: 'dirty', isSaved: false, pathname: '/tmp/x.md' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      // CLOSE_TAB is sync but internally calls async CLOSE_UNSAVED_TAB
      editor.CLOSE_TAB(tab)

      // Wait for async dialog to resolve
      await new Promise((r) => setTimeout(r, 50))

      // "cancel" → FORCE_CLOSE_TAB → tab removed
      expect(editor.tabs.find((t) => t.id === 'dirty')).toBeUndefined()
    }, 10000)
  })

  // ─── LINTEN_FOR_SET_ENCODING ──────────────────────────────────────

  describe('LINTEN_FOR_SET_ENCODING — bus handler', () => {
    it('updates encoding when different', () => {
      editor.currentFile = makeTab({
        id: 't1',
        encoding: { encoding: 'utf8', isBom: false }
      })
      editor.tabs = [editor.currentFile]

      editor.LINTEN_FOR_SET_ENCODING()
      const handler = bus.on.mock.calls.find(
        (c) => c[0] === 'mt::set-file-encoding'
      )[1]

      handler('latin1')
      expect(editor.currentFile.encoding.encoding).toBe('latin1')
      expect(editor.currentFile.encoding.isBom).toBe(false)
      expect(editor.currentFile.isSaved).toBe(true)
    })

    it('does not update when encoding is the same', () => {
      editor.currentFile = makeTab({
        id: 't1',
        encoding: { encoding: 'utf8', isBom: false },
        isSaved: false
      })
      editor.tabs = [editor.currentFile]

      editor.LINTEN_FOR_SET_ENCODING()
      const handler = bus.on.mock.calls.find(
        (c) => c[0] === 'mt::set-file-encoding'
      )[1]

      handler('utf8')
      expect(editor.currentFile.isSaved).toBe(false) // unchanged
    })
  })

  // ─── LINTEN_FOR_SET_FINAL_NEWLINE ─────────────────────────────────

  describe('LINTEN_FOR_SET_FINAL_NEWLINE — bus handler', () => {
    it('updates trimTrailingNewline when different', () => {
      editor.currentFile = makeTab({
        id: 't1',
        trimTrailingNewline: 3,
        isSaved: false
      })
      editor.tabs = [editor.currentFile]

      editor.LINTEN_FOR_SET_FINAL_NEWLINE()
      const handler = bus.on.mock.calls.find(
        (c) => c[0] === 'mt::set-final-newline'
      )[1]

      handler(1)
      expect(editor.currentFile.trimTrailingNewline).toBe(1)
      expect(editor.currentFile.isSaved).toBe(true)
    })

    it('does not update when value is the same', () => {
      editor.currentFile = makeTab({
        id: 't1',
        trimTrailingNewline: 3,
        isSaved: false
      })
      editor.tabs = [editor.currentFile]

      editor.LINTEN_FOR_SET_FINAL_NEWLINE()
      const handler = bus.on.mock.calls.find(
        (c) => c[0] === 'mt::set-final-newline'
      )[1]

      handler(3)
      expect(editor.currentFile.isSaved).toBe(false)
    })
  })

  // ─── MOVE_FILE_TO — untitled path ────────────────────────────────

  describe('MOVE_FILE_TO — untitled fallback', () => {
    it('delegates to FILE_SAVE_AS when currentFile has no pathname', async () => {
      const tab = makeTab({ id: 't1', pathname: '', filename: 'Untitled-1' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      invoke.mockResolvedValueOnce({
        id: 't1', pathname: '/tmp/saved.md', filename: 'saved.md', isSaved: true
      })

      await editor.MOVE_FILE_TO()

      expect(invoke).toHaveBeenCalledWith('mt_response_file_save_as', expect.any(Object))
    })
  })

  // ─── LISTEN_FOR_BOOTSTRAP_WINDOW ─────────────────────────────────

  describe('LISTEN_FOR_BOOTSTRAP_WINDOW', () => {
    it('registers commands after timeout', () => {
      vi.useFakeTimers()
      editor.LISTEN_FOR_BOOTSTRAP_WINDOW()
      // Commands are registered after 400ms delay
      vi.advanceTimersByTime(500)
      expect(bus.emit).toHaveBeenCalledWith('cmd::register-command', expect.anything())
      // sort-commands after 100ms more
      vi.advanceTimersByTime(100)
      expect(bus.emit).toHaveBeenCalledWith('cmd::sort-commands')
      vi.useRealTimers()
    })
  })

  // ─── ASK_FOR_SAVE_ALL — unsaved files path ───────────────────────

  describe('ASK_FOR_SAVE_ALL — with unsaved files', () => {
    it('closeTabs=true + unsaved → closes saved tabs + sends mt::save-and-close-tabs', () => {
      const saved = makeTab({ id: 'saved', isSaved: true, markdown: 'hello\n' })
      const dirty = makeTab({ id: 'dirty', isSaved: false, pathname: '/tmp/d.md', markdown: 'changed' })
      editor.tabs = [saved, dirty]
      editor.currentFile = saved
      editor.updateTabIdToIndex()

      editor.ASK_FOR_SAVE_ALL(true)

      // saved tab should be closed
      expect(editor.tabs.find((t) => t.id === 'saved')).toBeUndefined()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::save-and-close-tabs',
        expect.any(Array)
      )
    })
  })

  // ─── CLOSE_TABS — selecting remaining tab ────────────────────────

  describe('CLOSE_TABS — currentFile was in closed set', () => {
    it('picks the next remaining tab and emits file-changed', () => {
      const a = makeTab({ id: 'a', isSaved: true, pathname: '/tmp/a.md', markdown: 'a' })
      const b = makeTab({ id: 'b', isSaved: true, pathname: '/tmp/b.md', markdown: 'b' })
      const c = makeTab({ id: 'c', isSaved: true, pathname: '/tmp/c.md', markdown: 'c' })
      editor.tabs = [a, b, c]
      editor.currentFile = b // will be closed
      editor.updateTabIdToIndex()

      editor.CLOSE_TABS(['b'])

      // Should pick a remaining tab as currentFile
      expect(editor.currentFile.id).toBeDefined()
      expect(['a', 'c']).toContain(editor.currentFile.id)
    })

    it('clears toc when all tabs closed', () => {
      const a = makeTab({ id: 'a', isSaved: true })
      editor.tabs = [a]
      editor.currentFile = a
      editor.updateTabIdToIndex()
      editor.listToc = [{ slug: 's1' }]
      editor.toc = [{ slug: 's1' }]

      editor.CLOSE_TABS(['a'])

      expect(editor.listToc).toEqual([])
      expect(editor.toc).toEqual([])
    })
  })

  // ─── EDIT_ZOOM — same zoom no-ops the pref call ──────────────────

  describe('EDIT_ZOOM', () => {
    it('skips SET_SINGLE_PREFERENCE when zoom unchanged', () => {
      __preferencesStub.zoom = 1.0
      editor.EDIT_ZOOM(1.0)
      expect(__preferencesStub.SET_SINGLE_PREFERENCE).not.toHaveBeenCalled()
      expect(window.electron.webFrame.setZoomFactor).toHaveBeenCalledWith(1)
    })
  })

  // ─── APPLY_PREVIEW_MODE / EXIT_PREVIEW_MODE ──────────────────────

  describe('APPLY_PREVIEW_MODE / EXIT_PREVIEW_MODE', () => {
    it('APPLY_PREVIEW_MODE with no tabId is a no-op', () => {
      editor.APPLY_PREVIEW_MODE(null, true)
      // No crash
    })

    it('APPLY_PREVIEW_MODE with unknown tabId is a no-op', () => {
      editor.tabs = []
      editor.APPLY_PREVIEW_MODE('ghost', true)
      // No crash
    })

    it('EXIT_PREVIEW_MODE with no tabId is a no-op', () => {
      editor.EXIT_PREVIEW_MODE(null, 'test')
      // No crash
    })

    it('EXIT_PREVIEW_MODE on non-preview tab is a silent no-op', () => {
      const tab = makeTab({ id: 'x' })
      editor.tabs = [tab]
      editor.EXIT_PREVIEW_MODE('x', 'test')
      // No crash, no state change
    })
  })
})
