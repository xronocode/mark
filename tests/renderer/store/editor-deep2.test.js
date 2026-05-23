/**
 * Deep coverage tests (wave 2) for src/renderer/src/store/editor.js
 *
 * Targets remaining uncovered statements not covered by existing tests
 * (editor.test.ts, editor-coverage.test.js, editor.preview.test.ts,
 *  editor-deep.test.js):
 *   - FORMAT_LINK_CLICK: anchor link + external link branches
 *   - SEARCH: sets searchMatches
 *   - SHOW_IMAGE_DELETION_URL: notice + clipboard
 *   - UPDATE_LINE_ENDING_MENU: sends IPC when lineEnding exists
 *   - RESPONSE_FOR_RENAME: with/without pathname
 *   - RENAME: sends mt::rename IPC
 *   - UPDATE_CURRENT_FILE: adds tab if not present
 *   - CLOSE_OTHER_TABS / CLOSE_SAVED_TABS / CLOSE_ALL_TABS
 *   - EXCHANGE_TABS_BY_ID: move with/without toId
 *   - RENAME_FILE
 *   - SWITCH_TAB_BY_FILEPATH / SWITCH_TAB_BY_INDEX
 *   - NEW_TAB_WITH_CONTENT: null doc, existing tab, mixed line endings
 *   - SET_SAVE_STATUS_WHEN_REMOVE
 *   - SET_LINE_ENDING
 *   - ASK_FOR_IMAGE_PATH / SELECTION_FORMATS / PRINT_RESPONSE
 *   - Bus listener registrations
 *   - _subscribeFileWatch / _unsubscribeFileWatch
 *   - APPLY_FILE_CHANGE auto-reload branches
 *   - SELECTION_CHANGE affiliation cleanup
 *   - LISTEN_FOR_CLOSE
 *   - loadChange edge cases
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

describe('store/editor — deep coverage (wave 2)', () => {
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
      muyaIndexCursor: null,
      blocks: null,
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
    editorMod.__resetBootPhase()
    editor = editorMod.useEditorStore()
    editor.END_BOOT_PHASE()
    invoke = (await import('@tauri-apps/api/core')).invoke
    bus = (await import('@/bus')).default
    notice = (await import('@/services/notification')).default
  })

  // ─── FORMAT_LINK_CLICK ──────────────────────────────────────────

  describe('FORMAT_LINK_CLICK', () => {
    it('scrolls to anchor for # link matching listToc', () => {
      editor.listToc = [
        { slug: 's1', githubSlug: 'intro', content: 'Intro', lvl: 1 }
      ]
      editor.FORMAT_LINK_CLICK({
        data: { href: '#intro' },
        dirname: '/tmp'
      })
      expect(bus.emit).toHaveBeenCalledWith('scroll-to-header', 's1')
    })

    it('returns early for # link not matching any toc item', () => {
      editor.listToc = [
        { slug: 's1', githubSlug: 'intro', content: 'Intro', lvl: 1 }
      ]
      editor.FORMAT_LINK_CLICK({
        data: { href: '#nonexistent' },
        dirname: '/tmp'
      })
      expect(bus.emit).not.toHaveBeenCalledWith('scroll-to-header', expect.anything())
    })

    it('returns early for empty anchor (#)', () => {
      editor.FORMAT_LINK_CLICK({
        data: { href: '#' },
        dirname: '/tmp'
      })
      expect(bus.emit).not.toHaveBeenCalled()
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::format-link-click',
        expect.anything()
      )
    })

    it('sends IPC for external links (non-#)', () => {
      editor.FORMAT_LINK_CLICK({
        data: { href: 'https://example.com' },
        dirname: '/tmp'
      })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::format-link-click',
        { data: { href: 'https://example.com' }, dirname: '/tmp' }
      )
    })
  })

  // ─── SEARCH ─────────────────────────────────────────────────────

  describe('SEARCH', () => {
    it('sets searchMatches on currentFile (deep clone)', () => {
      editor.currentFile = makeTab({ id: 't1' })
      const value = { index: 2, matches: [{ line: 1 }], value: 'test' }
      editor.SEARCH(value)
      expect(editor.currentFile.searchMatches).toEqual(value)
      // Deep clone check: modifying original should not affect store
      value.index = 99
      expect(editor.currentFile.searchMatches.index).toBe(2)
    })
  })

  // ─── SHOW_IMAGE_DELETION_URL ────────────────────────────────────

  describe('SHOW_IMAGE_DELETION_URL', () => {
    it('shows notice and copies to clipboard on confirm', async () => {
      notice.notify.mockResolvedValueOnce()
      editor.SHOW_IMAGE_DELETION_URL('https://delete.me/123')
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          showConfirm: true,
          time: 20000
        })
      )
      await new Promise(r => setTimeout(r, 10))
      expect(window.electron.clipboard.writeText).toHaveBeenCalledWith('https://delete.me/123')
    })
  })

  // ─── UPDATE_LINE_ENDING_MENU ────────────────────────────────────

  describe('UPDATE_LINE_ENDING_MENU', () => {
    it('sends IPC when lineEnding exists', () => {
      editor.currentFile = makeTab({ id: 't1', lineEnding: 'crlf' })
      editor.UPDATE_LINE_ENDING_MENU()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::update-line-ending-menu',
        expect.any(Number),
        'crlf'
      )
    })

    it('does nothing when lineEnding is falsy', () => {
      editor.currentFile = { lineEnding: '' }
      editor.UPDATE_LINE_ENDING_MENU()
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::update-line-ending-menu',
        expect.anything(),
        expect.anything()
      )
    })
  })

  // ─── RESPONSE_FOR_RENAME ────────────────────────────────────────

  describe('RESPONSE_FOR_RENAME', () => {
    it('emits rename when currentFile has pathname', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/test.md' })
      await editor.RESPONSE_FOR_RENAME()
      expect(bus.emit).toHaveBeenCalledWith('rename')
    })

    it('calls FILE_SAVE_AS when no pathname', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '' })
      invoke.mockResolvedValueOnce({
        id: 't1', pathname: '/tmp/saved.md', filename: 'saved.md', isSaved: true
      })
      await editor.RESPONSE_FOR_RENAME()
      expect(invoke).toHaveBeenCalledWith('mt_response_file_save_as', expect.any(Object))
    })

    it('returns early when no id', async () => {
      editor.currentFile = {}
      await editor.RESPONSE_FOR_RENAME()
      expect(bus.emit).not.toHaveBeenCalledWith('rename')
    })
  })

  // ─── RENAME ─────────────────────────────────────────────────────

  describe('RENAME', () => {
    it('sends mt::rename IPC when filename differs', () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/old.md', filename: 'old.md' })
      editor.RENAME('new.md')
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::rename',
        expect.objectContaining({
          id: 't1',
          pathname: '/tmp/old.md'
        })
      )
    })

    it('does nothing when newFilename equals current filename', () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/same.md', filename: 'same.md' })
      editor.RENAME('same.md')
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::rename',
        expect.anything()
      )
    })
  })

  // ─── UPDATE_CURRENT_FILE ────────────────────────────────────────

  describe('UPDATE_CURRENT_FILE', () => {
    it('adds file to tabs if not already present', () => {
      const file = makeTab({ id: 'new-file', pathname: '/tmp/new.md', markdown: '# new' })
      editor.tabs = []
      editor.currentFile = {}
      editor.updateTabIdToIndex()

      editor.UPDATE_CURRENT_FILE(file)

      expect(editor.tabs).toHaveLength(1)
      expect(editor.currentFile.id).toBe('new-file')
      expect(bus.emit).toHaveBeenCalledWith('file-changed', expect.objectContaining({ id: 'new-file' }))
    })

    it('does not emit file-changed when switching to same file', () => {
      const file = makeTab({ id: 'same', pathname: '/tmp/a.md' })
      editor.tabs = [file]
      editor.currentFile = file
      editor.updateTabIdToIndex()

      bus.emit.mockClear()
      editor.UPDATE_CURRENT_FILE(file)

      const fileChangedCalls = bus.emit.mock.calls.filter(c => c[0] === 'file-changed')
      expect(fileChangedCalls).toHaveLength(0)
    })
  })

  // ─── CLOSE_OTHER_TABS / CLOSE_SAVED_TABS / CLOSE_ALL_TABS ──────

  describe('CLOSE_OTHER_TABS', () => {
    it('closes all tabs except the specified one', () => {
      const a = makeTab({ id: 'a', isSaved: true })
      const b = makeTab({ id: 'b', isSaved: true })
      const c = makeTab({ id: 'c', isSaved: true })
      editor.tabs = [a, b, c]
      editor.currentFile = a
      editor.updateTabIdToIndex()

      editor.CLOSE_OTHER_TABS(b)
      expect(editor.tabs.map(t => t.id)).toEqual(['b'])
    })
  })

  describe('CLOSE_SAVED_TABS', () => {
    it('closes only saved tabs', () => {
      const saved = makeTab({ id: 'saved', isSaved: true })
      const dirty = makeTab({ id: 'dirty', isSaved: false })
      editor.tabs = [saved, dirty]
      editor.currentFile = saved
      editor.updateTabIdToIndex()

      editor.CLOSE_SAVED_TABS()
      expect(editor.tabs.map(t => t.id)).toEqual(['dirty'])
    })
  })

  describe('CLOSE_ALL_TABS', () => {
    it('closes all tabs', () => {
      editor.tabs = [makeTab({ id: 'a', isSaved: true }), makeTab({ id: 'b', isSaved: true })]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()

      editor.CLOSE_ALL_TABS()
      expect(editor.tabs).toHaveLength(0)
    })
  })

  // ─── EXCHANGE_TABS_BY_ID ────────────────────────────────────────

  describe('EXCHANGE_TABS_BY_ID', () => {
    it('moves tab to position of toId', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'a', toId: 'c' })
      expect(editor.tabs.map(t => t.id)).toEqual(['b', 'a', 'c'])
    })

    it('moves tab to end when toId is empty', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'a', toId: '' })
      expect(editor.tabs.map(t => t.id)).toEqual(['b', 'c', 'a'])
    })

    it('does nothing when fromId not found', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'missing', toId: 'a' })
      expect(editor.tabs.map(t => t.id)).toEqual(['a', 'b'])
    })

    it('does nothing when toId not found', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'a', toId: 'missing' })
      expect(editor.tabs.map(t => t.id)).toEqual(['a', 'b'])
    })
  })

  // ─── RENAME_FILE ────────────────────────────────────────────────

  describe('RENAME_FILE', () => {
    it('calls UPDATE_CURRENT_FILE and emits rename', () => {
      const file = makeTab({ id: 'rf1', pathname: '/tmp/renamed.md' })
      editor.tabs = []
      editor.currentFile = {}
      editor.updateTabIdToIndex()

      editor.RENAME_FILE(file)
      expect(editor.currentFile.id).toBe('rf1')
      expect(bus.emit).toHaveBeenCalledWith('rename')
    })
  })

  // ─── SWITCH_TAB_BY_FILEPATH ─────────────────────────────────────

  describe('SWITCH_TAB_BY_FILEPATH', () => {
    it('switches to tab matching filePath', () => {
      const a = makeTab({ id: 'a', pathname: '/tmp/a.md' })
      const b = makeTab({ id: 'b', pathname: '/tmp/b.md' })
      editor.tabs = [a, b]
      editor.currentFile = a
      editor.updateTabIdToIndex()

      editor.SWITCH_TAB_BY_FILEPATH('/tmp/b.md')
      expect(editor.currentFile.id).toBe('b')
    })

    it('warns on empty filePath', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.SWITCH_TAB_BY_FILEPATH('')
      expect(spy).toHaveBeenCalledWith('Invalid file path:', '')
      spy.mockRestore()
    })

    it('errors when no tab has that pathname', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a', pathname: '/tmp/a.md' })]
      editor.SWITCH_TAB_BY_FILEPATH('/tmp/missing.md')
      expect(spy).toHaveBeenCalledWith('Cannot find tab with pathname:', '/tmp/missing.md')
      spy.mockRestore()
    })
  })

  // ─── SWITCH_TAB_BY_INDEX ────────────────────────────────────────

  describe('SWITCH_TAB_BY_INDEX', () => {
    it('switches to tab at given index', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()
      editor.SWITCH_TAB_BY_INDEX(1)
      expect(editor.currentFile.id).toBe('b')
    })

    it('warns on negative index', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a' })]
      editor.currentFile = editor.tabs[0]
      editor.SWITCH_TAB_BY_INDEX(-1)
      expect(spy).toHaveBeenCalledWith('Invalid tab index:', -1)
      spy.mockRestore()
    })

    it('errors when currentFile not in tabs', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a' })]
      editor.currentFile = makeTab({ id: 'missing' })
      editor.updateTabIdToIndex()
      editor.SWITCH_TAB_BY_INDEX(0)
      expect(spy).toHaveBeenCalledWith('Cannot find current tab index.')
      spy.mockRestore()
    })
  })

  // ─── SET_SAVE_STATUS_WHEN_REMOVE ────────────────────────────────

  describe('SET_SAVE_STATUS_WHEN_REMOVE', () => {
    it('marks matching tab as unsaved', () => {
      const tab = makeTab({ id: 'a', pathname: '/tmp/a.md', isSaved: true })
      editor.tabs = [tab]
      editor.SET_SAVE_STATUS_WHEN_REMOVE({ pathname: '/tmp/a.md' })
      expect(editor.tabs[0].isSaved).toBe(false)
    })

    it('does not affect non-matching tabs', () => {
      const tab = makeTab({ id: 'a', pathname: '/tmp/a.md', isSaved: true })
      editor.tabs = [tab]
      editor.SET_SAVE_STATUS_WHEN_REMOVE({ pathname: '/tmp/b.md' })
      expect(editor.tabs[0].isSaved).toBe(true)
    })
  })

  // ─── SET_LINE_ENDING ────────────────────────────────────────────

  describe('SET_LINE_ENDING', () => {
    it('updates lineEnding when different', () => {
      editor.currentFile = makeTab({ id: 't1', lineEnding: 'lf' })
      editor.SET_LINE_ENDING('crlf')
      expect(editor.currentFile.lineEnding).toBe('crlf')
      expect(editor.currentFile.adjustLineEndingOnSave).toBe(true)
    })

    it('does nothing when same', () => {
      editor.currentFile = makeTab({ id: 't1', lineEnding: 'lf', isSaved: false })
      editor.SET_LINE_ENDING('lf')
      expect(editor.currentFile.isSaved).toBe(false)
    })
  })

  // ─── ASK_FOR_IMAGE_PATH ─────────────────────────────────────────

  describe('ASK_FOR_IMAGE_PATH', () => {
    it('invokes mt::ask-for-image-path', () => {
      editor.ASK_FOR_IMAGE_PATH()
      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('mt::ask-for-image-path')
    })
  })

  // ─── SELECTION_FORMATS ──────────────────────────────────────────

  describe('SELECTION_FORMATS', () => {
    it('sends IPC with format state', () => {
      editor.SELECTION_FORMATS([{ type: 'bold' }, { type: 'italic' }])
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::update-format-menu',
        expect.any(Number),
        { bold: true, italic: true }
      )
    })

    it('handles empty formats', () => {
      editor.SELECTION_FORMATS([])
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::update-format-menu',
        expect.any(Number),
        {}
      )
    })
  })

  // ─── PRINT_RESPONSE ────────────────────────────────────────────

  describe('PRINT_RESPONSE', () => {
    it('sends mt::response-print IPC', () => {
      editor.PRINT_RESPONSE()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::response-print')
    })
  })

  // ─── Bus listener registrations ─────────────────────────────────

  describe('bus listener registrations', () => {
    it('LISTEN_FOR_SAVE registers handler', () => {
      editor.LISTEN_FOR_SAVE()
      expect(bus.on).toHaveBeenCalledWith('mt::editor-ask-file-save', expect.any(Function))
    })

    it('LISTEN_FOR_SAVE_AS registers handler', () => {
      editor.LISTEN_FOR_SAVE_AS()
      expect(bus.on).toHaveBeenCalledWith('mt::editor-ask-file-save-as', expect.any(Function))
    })

    it('LISTEN_FOR_MOVE_TO registers handler', () => {
      editor.LISTEN_FOR_MOVE_TO()
      expect(bus.on).toHaveBeenCalledWith('mt::editor-move-file', expect.any(Function))
    })

    it('LISTEN_FOR_RENAME registers handler', () => {
      editor.LISTEN_FOR_RENAME()
      expect(bus.on).toHaveBeenCalledWith('mt::editor-rename-file', expect.any(Function))
    })

    it('LISTEN_FOR_CLOSE_TAB registers handler', () => {
      editor.LISTEN_FOR_CLOSE_TAB()
      expect(bus.on).toHaveBeenCalledWith('mt::editor-close-tab', expect.any(Function))
    })

    it('LISTEN_FOR_TAB_CYCLE registers left and right', () => {
      editor.LISTEN_FOR_TAB_CYCLE()
      expect(bus.on).toHaveBeenCalledWith('mt::tabs-cycle-left', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::tabs-cycle-right', expect.any(Function))
    })

    it('LISTEN_FOR_NEW_TAB registers handler', () => {
      editor.LISTEN_FOR_NEW_TAB()
      expect(bus.on).toHaveBeenCalledWith('mt::new-untitled-tab', expect.any(Function))
    })

    it('LINTEN_FOR_SET_LINE_ENDING registers handler', () => {
      editor.LINTEN_FOR_SET_LINE_ENDING()
      expect(bus.on).toHaveBeenCalledWith('mt::set-line-ending', expect.any(Function))
    })

    it('LISTEN_WINDOW_ZOOM registers handler', () => {
      editor.LISTEN_WINDOW_ZOOM()
      expect(bus.on).toHaveBeenCalledWith('mt::window-zoom', expect.any(Function))
    })
  })

  // ─── LISTEN_FOR_CLOSE ──────────────────────────────────────────

  describe('LISTEN_FOR_CLOSE', () => {
    it('registers mt::ask-for-close IPC listener', () => {
      editor.LISTEN_FOR_CLOSE()
      expect(window.electron.ipcRenderer.on).toHaveBeenCalledWith(
        'mt::ask-for-close',
        expect.any(Function)
      )
    })

    it('sends mt::close-window when all tabs saved', async () => {
      editor.tabs = [makeTab({ id: 'a', isSaved: true })]
      editor.LISTEN_FOR_CLOSE()

      const handler = window.electron.ipcRenderer.on.mock.calls.find(
        c => c[0] === 'mt::ask-for-close'
      )[1]

      await handler()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::close-window')
    })
  })

  // ─── NEW_UNTITLED_TAB defaults ──────────────────────────────────

  describe('NEW_UNTITLED_TAB', () => {
    it('selected=null defaults to true', () => {
      editor.NEW_UNTITLED_TAB({ markdown: '# test', selected: null })
      expect(editor.currentFile.markdown).toBe('# test')
    })
  })

  // ─── NEW_TAB_WITH_CONTENT ──────────────────────────────────────

  describe('NEW_TAB_WITH_CONTENT', () => {
    it('logs warning for null markdownDocument', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.NEW_TAB_WITH_CONTENT({ markdownDocument: null })
      expect(spy).toHaveBeenCalledWith('Cannot create a file tab without a markdown document!')
      spy.mockRestore()
    })

    it('switches to existing tab when pathname matches', () => {
      const existing = makeTab({ id: 'existing', pathname: '/tmp/a.md' })
      editor.tabs = [existing]
      editor.currentFile = existing
      editor.updateTabIdToIndex()

      window.fileUtils.isSamePathSync.mockReturnValue(true)
      editor.NEW_TAB_WITH_CONTENT({
        markdownDocument: { pathname: '/tmp/a.md', markdown: 'new', filename: 'a.md' },
        selected: true
      })
      expect(editor.tabs).toHaveLength(1)
      window.fileUtils.isSamePathSync.mockImplementation((a, b) => a === b)
    })
  })

  // ─── MOVE_FILE_TO — with pathname ───────────────────────────────

  describe('MOVE_FILE_TO', () => {
    it('sends IPC when pathname exists', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/file.md' })
      await editor.MOVE_FILE_TO()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::response-file-move-to',
        { id: 't1', pathname: '/tmp/file.md' }
      )
    })

    it('returns early when no id', async () => {
      editor.currentFile = {}
      await editor.MOVE_FILE_TO()
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::response-file-move-to',
        expect.anything()
      )
    })
  })

  // ─── ASK_FOR_SAVE_ALL — closeTabs=false ─────────────────────────

  describe('ASK_FOR_SAVE_ALL', () => {
    it('closeTabs=false sends mt::save-tabs without closing', () => {
      const dirty = makeTab({ id: 'd1', isSaved: false, pathname: '/tmp/d.md', markdown: 'x' })
      editor.tabs = [dirty]
      editor.currentFile = dirty
      editor.updateTabIdToIndex()

      editor.ASK_FOR_SAVE_ALL(false)
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::save-tabs',
        expect.any(Array)
      )
      expect(editor.tabs).toHaveLength(1)
    })
  })

  // ─── loadChange — edge cases ────────────────────────────────────

  describe('loadChange edge cases', () => {
    it('logs error when no tab matches pathname', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.tabs = []
      editor.loadChange({
        pathname: '/tmp/missing.md',
        data: { markdown: 'x', filename: 'missing.md', encoding: {}, lineEnding: 'lf', adjustLineEndingOnSave: false, trimTrailingNewline: 3, isMixedLineEndings: false }
      })
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })

    it('does not emit file-changed when tab is not currentFile', () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/x.md', filename: 'x.md' })
      const other = makeTab({ id: 't2', pathname: '/tmp/y.md', filename: 'y.md' })
      editor.tabs = [tab, other]
      editor.currentFile = other
      editor.updateTabIdToIndex()

      bus.emit.mockClear()
      editor.loadChange({
        pathname: '/tmp/x.md',
        data: { markdown: 'changed', filename: 'x.md', encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf', adjustLineEndingOnSave: false, trimTrailingNewline: 3, isMixedLineEndings: false }
      })

      const fileChangedCalls = bus.emit.mock.calls.filter(c => c[0] === 'file-changed')
      expect(fileChangedCalls).toHaveLength(0)
    })
  })

  // ─── _subscribeFileWatch ────────────────────────────────────────

  describe('_subscribeFileWatch', () => {
    it('skips when file inside project tree', () => {
      __projectStub.projectTrees = [{ pathname: '/tmp/project' }]
      editor._subscribeFileWatch('/tmp/project/file.md')
      expect(__ipcWatchMock.subscribe).not.toHaveBeenCalled()
    })

    it('subscribes for file outside project tree', () => {
      __projectStub.projectTrees = [{ pathname: '/tmp/project' }]
      editor._subscribeFileWatch('/tmp/other/file.md')
      expect(__ipcWatchMock.subscribe).toHaveBeenCalled()
    })
  })

  // ─── APPLY_FILE_CHANGE — auto-reload ───────────────────────────

  describe('APPLY_FILE_CHANGE — auto-reload with data', () => {
    it('calls loadChange directly when change has data', () => {
      __preferencesStub.autoSave = true
      __preferencesStub.liveReload = true
      const tab = makeTab({ id: 'r1', pathname: '/tmp/r.md', filename: 'r.md', isSaved: true })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.APPLY_FILE_CHANGE('change', {
        pathname: '/tmp/r.md',
        data: { markdown: 'new', filename: 'r.md', encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf', adjustLineEndingOnSave: false, trimTrailingNewline: 3, isMixedLineEndings: false }
      })

      expect(editor.tabs[0].markdown).toBe('new')
    })
  })

  // ─── SELECTION_CHANGE — affiliation cleanup ─────────────────────

  describe('SELECTION_CHANGE — affiliation cleanup', () => {
    it('removes p when 2+ keys present', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k1', offset: 0, block: { text: 'x', functionType: '' }, type: 'span' },
        end: { key: 'k1', offset: 1, block: { text: 'x', functionType: '' }, type: 'span' },
        affiliation: [
          { type: 'p' },
          { type: 'blockquote' }
        ]
      })
      const call = window.electron.ipcRenderer.send.mock.calls.find(
        c => c[0] === 'mt::editor-selection-changed'
      )
      expect(call[2].affiliation.p).toBeUndefined()
      expect(call[2].affiliation.blockquote).toBe(true)
    })
  })

  // ─── CYCLE_TABS — right wrapping ───────────────────────────────

  describe('CYCLE_TABS — right wrapping', () => {
    it('wraps from last to first', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.currentFile = editor.tabs[1]
      editor.updateTabIdToIndex()
      editor.CYCLE_TABS(true)
      expect(editor.currentFile.id).toBe('a')
    })
  })

  // ─── EXPORT — no currentFile ────────────────────────────────────

  describe('EXPORT — edge cases', () => {
    it('returns early when currentFile is empty', () => {
      editor.currentFile = {}
      editor.EXPORT({ type: 'pdf', content: '<p/>', pageOptions: {} })
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::response-export',
        expect.anything()
      )
    })
  })

  // ─── ASK_FOR_IMAGE_AUTO_PATH — without pathname ─────────────────

  describe('ASK_FOR_IMAGE_AUTO_PATH', () => {
    it('resolves empty when no pathname', async () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '' })
      const result = await editor.ASK_FOR_IMAGE_AUTO_PATH('img.png')
      expect(result).toEqual([])
    })
  })

  // ─── EDIT_ZOOM — different zoom ─────────────────────────────────

  describe('EDIT_ZOOM', () => {
    it('calls SET_SINGLE_PREFERENCE when zoom changes', () => {
      __preferencesStub.zoom = 1.0
      editor.EDIT_ZOOM(1.5)
      expect(__preferencesStub.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({
        type: 'zoom',
        value: 1.5
      })
    })
  })

  // ─── APPLY_SAVE_OUTCOME — lastSavedHistoryId ───────────────────

  describe('APPLY_SAVE_OUTCOME — history tracking', () => {
    it('sets lastSavedHistoryId when saved with valid history', () => {
      const tab = makeTab({
        id: 't1',
        isSaved: false,
        pathname: '/tmp/a.md',
        history: { stack: [{ id: 'h1' }, { id: 'h2' }], index: 1, lastEditIndex: 1 }
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.APPLY_SAVE_OUTCOME({ id: 't1', isSaved: true })
      expect(editor.tabs[0].lastSavedHistoryId).toBe('h2')
    })
  })
})
