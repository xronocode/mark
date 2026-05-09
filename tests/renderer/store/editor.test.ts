/**
 * Phase-4 Wave-1 (agent 2): unit tests for `store/editor.js`.
 *
 * Coverage targets (per Phase-3 roadmap, alpha-blocker territory):
 *   - Save flow: FILE_SAVE / APPLY_SAVE_OUTCOME / APPLY_TAB_SAVED /
 *     APPLY_TAB_SAVE_FAILURE / FILE_SAVE_AS — happy + error paths
 *   - File-watcher: APPLY_FILE_CHANGE — change/add/unlink/invalid + no-tab
 *   - Tab CRUD: NEW_UNTITLED_TAB / CLOSE_TAB(S) / pushTabNotification
 *   - Bootstrap: APPLY_BOOTSTRAP_EDITOR
 *   - Misc: copyGithubSlug / loadChange / updateScrollPosition /
 *     updateTabIdToIndex / APPLY_EXPORT_SUCCESS
 *
 * Pitfall mitigations from Phase-3 setup notes:
 *   #2 — bus singleton: mocked at module level so listener state can't leak
 *   #4 — editor.js transitively imports muya via deps; we mock direct
 *        deps (commands, util/markdownToHtml, util/pdf, util/dompurify)
 *        so the muya runtime never loads. editor.js itself does NOT
 *        import muya directly, so per-module mocks of `../commands` and
 *        sibling stores are sufficient.
 *   #5 — i18n: stubbed t() so the EN locale JSON never loads
 *   #6 — notification service: stubbed notify()
 */

import { setupTestPinia } from '../pinia'

// ─── module-level mocks (must precede dynamic store import) ───────────

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
// Editor.js imports `../bus`; alias `@/` resolves to src/renderer/src so
// `@/bus` and `../bus` (from store/) resolve to the same module — vitest
// dedups them under the alias path. Belt & suspenders: also mock the
// relative form vitest may see when the file imports it.
vi.mock('../bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/i18n', () => ({
  i18n: { global: { t: (k: string) => k } },
  t: (k: string) => k,
  setLanguage: vi.fn()
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(async () => undefined) }
}))

// element-plus ElMessageBox is used in CLOSE_UNSAVED_TAB / LISTEN_FOR_CLOSE.
// Stub the bits we touch; no DOM injection.
vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn(async () => 'confirm'),
    alert: vi.fn(async () => undefined)
  }
}))

// Commands are constructed inside LISTEN_FOR_BOOTSTRAP_WINDOW (not exercised
// here) but importing the module triggers their evaluation. Stub them as
// empty classes so no transitive muya/electron-log surface loads.
vi.mock('@/commands', () => ({
  FileEncodingCommand: class {},
  LineEndingCommand: class {},
  QuickOpenCommand: class {},
  TrailingNewlineCommand: class {}
}))

// Sibling stores — bypass Pinia entirely. Editor.js calls
// `useProjectStore()` etc. and reads/writes plain fields — we return
// hand-rolled plain-object "stores" that mimic the API surface used by
// editor.js. This avoids the Pinia activation issue you'd get if the real
// project.js loads (it imports `useEditorStore` and a stack of muya/IPC
// runtime helpers we don't want here).
const __preferencesStub: Record<string, any> = {
  autoSave: false,
  autoSaveDelay: 5000,
  defaultEncoding: 'utf8',
  endOfLine: 'lf',
  zoom: 1,
  SET_USER_PREFERENCE: vi.fn(),
  SET_MODE: vi.fn(),
  SET_SINGLE_PREFERENCE: vi.fn()
}
const __projectStub: Record<string, any> = { projectTree: null }
const __layoutStub: Record<string, any> = {
  rightColumn: 'files',
  showSideBar: false,
  showTabBar: false,
  SET_LAYOUT: vi.fn(function (this: any, p: Record<string, unknown>) {
    Object.assign(__layoutStub, p)
  }),
  DISPATCH_LAYOUT_MENU_ITEMS: vi.fn(),
  REQUEST_INITIAL_WINDOW_RESIZE: vi.fn()
}
const __mainStub: Record<string, any> = {
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

// Expose stubs so individual tests can read/reset state if needed.
;(globalThis as any).__editorStubs = {
  preferences: __preferencesStub,
  project: __projectStub,
  layout: __layoutStub,
  main: __mainStub
}

// ─── test suite ───────────────────────────────────────────────────────

describe('store/editor', () => {
  let editor: any
  let invoke: any
  let bus: any
  let notice: any

  beforeEach(async () => {
    setupTestPinia()

    // Late imports so module mocks above are in effect first.
    const editorMod = await import('@/store/editor')
    editor = editorMod.useEditorStore()

    invoke = (await import('@tauri-apps/api/core')).invoke
    bus = (await import('@/bus')).default
    notice = (await import('@/services/notification')).default
  })

  // ─── helpers ───────────────────────────────────────────────────────
  function makeTab(overrides: Record<string, unknown> = {}) {
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

  // ─── helpers / index maintenance ──────────────────────────────────

  describe('updateTabIdToIndex', () => {
    it('rebuilds the id→index map after array reorder', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.updateTabIdToIndex()
      expect(editor.tabIdToIndex).toEqual({ a: 0, b: 1, c: 2 })

      // reorder
      editor.tabs = [editor.tabs[2], editor.tabs[0], editor.tabs[1]]
      editor.updateTabIdToIndex()
      expect(editor.tabIdToIndex).toEqual({ c: 0, a: 1, b: 2 })
    })
  })

  describe('updateScrollPosition', () => {
    it('updates scrollTop on the matching tab', () => {
      editor.tabs = [makeTab({ id: 'a' })]
      editor.updateTabIdToIndex()
      editor.updateScrollPosition('a', 250)
      expect(editor.tabs[0].scrollTop).toBe(250)
    })

    it('logs warn when tab id is unknown', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.updateScrollPosition('nope', 100)
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot find tab index for id'),
        'nope'
      )
      spy.mockRestore()
    })
  })

  // ─── pushTabNotification ──────────────────────────────────────────

  describe('pushTabNotification', () => {
    it('adds a notification with default style/showConfirm/exclusiveType', () => {
      editor.tabs = [makeTab({ id: 'a' })]
      editor.pushTabNotification({ tabId: 'a', msg: 'hi' })
      expect(editor.tabs[0].notifications).toHaveLength(1)
      const n = editor.tabs[0].notifications[0]
      expect(n.msg).toBe('hi')
      expect(n.style).toBe('info')
      expect(n.showConfirm).toBe(false)
      expect(n.exclusiveType).toBe('')
      expect(typeof n.action).toBe('function')
    })

    it('exclusiveType replaces a prior matching notification', () => {
      editor.tabs = [makeTab({ id: 'a' })]
      editor.pushTabNotification({ tabId: 'a', msg: 'first', exclusiveType: 'file_changed' })
      editor.pushTabNotification({ tabId: 'a', msg: 'second', exclusiveType: 'file_changed' })
      const notifs = editor.tabs[0].notifications
      expect(notifs).toHaveLength(1)
      expect(notifs[0].msg).toBe('second')
    })

    it('logs error if tabId is unknown', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.pushTabNotification({ tabId: 'missing', msg: 'x' })
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  // ─── Tab CRUD ─────────────────────────────────────────────────────

  describe('NEW_UNTITLED_TAB', () => {
    it('adds a blank tab and sets currentFile when selected', () => {
      editor.NEW_UNTITLED_TAB({ markdown: '# hello', selected: true })
      expect(editor.tabs).toHaveLength(1)
      expect(editor.tabs[0].markdown).toBe('# hello')
      expect(editor.currentFile.id).toBe(editor.tabs[0].id)
      expect(editor.tabIdToIndex[editor.tabs[0].id]).toBe(0)
    })

    it('appends without selecting when selected=false', () => {
      editor.tabs = [makeTab({ id: 'existing' })]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()
      editor.NEW_UNTITLED_TAB({ markdown: '', selected: false })
      expect(editor.tabs).toHaveLength(2)
      expect(editor.currentFile.id).toBe('existing')
    })
  })

  describe('CLOSE_TAB / FORCE_CLOSE_TAB', () => {
    it('saved tab → FORCE_CLOSE_TAB splices the tab', () => {
      const a = makeTab({ id: 'a', isSaved: true })
      const b = makeTab({ id: 'b', isSaved: true })
      editor.tabs = [a, b]
      editor.currentFile = a
      editor.updateTabIdToIndex()

      editor.CLOSE_TAB(a)
      expect(editor.tabs.map((t: any) => t.id)).toEqual(['b'])
      expect(editor.currentFile.id).toBe('b')
    })

    it('CLOSE_TAB() with no arg falls back to currentFile', () => {
      const a = makeTab({ id: 'a', isSaved: true })
      editor.tabs = [a]
      editor.currentFile = a
      editor.updateTabIdToIndex()
      editor.CLOSE_TAB()
      expect(editor.tabs).toHaveLength(0)
    })

    it('CLOSE_TAB() with empty currentFile is a no-op', () => {
      // currentFile starts as {} → hasKeys returns false → early return
      expect(editor.tabs).toHaveLength(0)
      editor.CLOSE_TAB()
      expect(editor.tabs).toHaveLength(0)
    })
  })

  describe('CLOSE_TABS (bulk)', () => {
    it('splices multiple tabs by id and resets currentFile when it was closed', () => {
      const a = makeTab({ id: 'a', isSaved: true })
      const b = makeTab({ id: 'b', isSaved: true })
      const c = makeTab({ id: 'c', isSaved: true })
      editor.tabs = [a, b, c]
      editor.currentFile = b
      editor.updateTabIdToIndex()

      editor.CLOSE_TABS(['a', 'b'])
      expect(editor.tabs.map((t: any) => t.id)).toEqual(['c'])
      // currentFile was b → cleared then re-picked from remaining
      expect(editor.currentFile.id).toBe('c')
    })

    it('returns early on empty list', () => {
      const a = makeTab({ id: 'a' })
      editor.tabs = [a]
      editor.currentFile = a
      editor.updateTabIdToIndex()
      editor.CLOSE_TABS([])
      expect(editor.tabs).toHaveLength(1)
    })
  })

  // ─── Save flow (alpha-blocker territory) ──────────────────────────

  describe('FILE_SAVE', () => {
    it('invokes mt_response_file_save and applies outcome on success', async () => {
      const tab = makeTab({ id: 't1', filename: 'foo.md', pathname: '/tmp/foo.md', isSaved: false })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      ;(invoke as any).mockResolvedValueOnce({
        id: 't1',
        pathname: '/tmp/foo.md',
        filename: 'foo.md',
        isSaved: true
      })

      await editor.FILE_SAVE()

      expect(invoke).toHaveBeenCalledWith(
        'mt_response_file_save',
        expect.objectContaining({
          id: 't1',
          filename: 'foo.md',
          pathname: '/tmp/foo.md'
        })
      )
      expect(editor.tabs[0].isSaved).toBe(true)
    })

    it('returns early when currentFile has no id', async () => {
      editor.currentFile = {}
      await editor.FILE_SAVE()
      expect(invoke).not.toHaveBeenCalled()
    })

    it('shows a notification on rejection', async () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/foo.md' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      ;(invoke as any).mockRejectedValueOnce(new Error('disk full'))

      await editor.FILE_SAVE()

      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('disk full')
        })
      )
    })
  })

  describe('APPLY_SAVE_OUTCOME', () => {
    it('updates tab.isSaved and pathname/filename on save-as', () => {
      const tab = makeTab({ id: 't1', pathname: '', filename: 'Untitled-1', isSaved: false })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.APPLY_SAVE_OUTCOME({
        id: 't1',
        pathname: '/tmp/saved.md',
        filename: 'saved.md',
        isSaved: true
      })

      expect(editor.tabs[0].pathname).toBe('/tmp/saved.md')
      expect(editor.tabs[0].filename).toBe('saved.md')
      expect(editor.tabs[0].isSaved).toBe(true)
    })

    it('is a no-op when outcome has no id', () => {
      editor.tabs = [makeTab({ id: 't1', isSaved: false })]
      editor.APPLY_SAVE_OUTCOME({})
      expect(editor.tabs[0].isSaved).toBe(false)
    })

    it('is a no-op when no tab matches outcome.id', () => {
      editor.tabs = [makeTab({ id: 't1', isSaved: false })]
      editor.APPLY_SAVE_OUTCOME({ id: 'unknown', isSaved: true })
      expect(editor.tabs[0].isSaved).toBe(false)
    })

    it('closes a colliding tab if save-as overwrites another tab path', () => {
      const a = makeTab({ id: 'a', pathname: '/tmp/x.md', isSaved: true })
      const b = makeTab({ id: 'b', pathname: '', isSaved: false })
      editor.tabs = [a, b]
      editor.currentFile = b
      editor.updateTabIdToIndex()

      editor.APPLY_SAVE_OUTCOME({
        id: 'b',
        pathname: '/tmp/x.md',
        filename: 'x.md',
        isSaved: true
      })

      // 'a' should have been closed by the collision branch
      expect(editor.tabs.find((t: any) => t.id === 'a')).toBeUndefined()
      expect(editor.tabs.find((t: any) => t.id === 'b').pathname).toBe('/tmp/x.md')
    })
  })

  describe('APPLY_TAB_SAVED', () => {
    it('flips isSaved=true when history is at a valid edit index', () => {
      const tab = makeTab({
        id: 't1',
        isSaved: false,
        history: { stack: [{ id: 'h1' }], index: 0, lastEditIndex: 0 }
      })
      editor.tabs = [tab]
      editor.APPLY_TAB_SAVED('t1')
      expect(editor.tabs[0].isSaved).toBe(true)
      expect(editor.tabs[0].lastSavedHistoryId).toBe('h1')
    })

    it('does nothing when tab is missing', () => {
      editor.tabs = []
      expect(() => editor.APPLY_TAB_SAVED('nope')).not.toThrow()
    })
  })

  describe('APPLY_TAB_SAVE_FAILURE', () => {
    it('marks tab dirty and pushes a failure notification', () => {
      const tab = makeTab({ id: 't1', isSaved: true })
      editor.tabs = [tab]
      editor.APPLY_TAB_SAVE_FAILURE('t1', 'EACCES')
      expect(editor.tabs[0].isSaved).toBe(false)
      expect(editor.tabs[0].notifications).toHaveLength(1)
      expect(editor.tabs[0].notifications[0].style).toBe('crit')
    })

    it('falls back to global toast when the tab is unknown', () => {
      editor.APPLY_TAB_SAVE_FAILURE('missing', 'boom')
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: 'boom' })
      )
    })
  })

  describe('FILE_SAVE_AS', () => {
    it('invokes mt_response_file_save_as and applies outcome', async () => {
      const tab = makeTab({ id: 't1', filename: 'untitled.md', pathname: '' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      ;(invoke as any).mockResolvedValueOnce({
        id: 't1',
        pathname: '/tmp/new.md',
        filename: 'new.md',
        isSaved: true
      })

      await editor.FILE_SAVE_AS()

      expect(invoke).toHaveBeenCalledWith('mt_response_file_save_as', expect.any(Object))
      expect(editor.tabs[0].pathname).toBe('/tmp/new.md')
      expect(editor.tabs[0].isSaved).toBe(true)
    })

    it('shows notification on rejection', async () => {
      const tab = makeTab({ id: 't1' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()
      ;(invoke as any).mockRejectedValueOnce(new Error('user cancelled'))
      await editor.FILE_SAVE_AS()
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    })

    it('returns early when no currentFile id', async () => {
      editor.currentFile = {}
      await editor.FILE_SAVE_AS()
      expect(invoke).not.toHaveBeenCalled()
    })
  })

  // ─── File-watcher reactions (C-1 integration) ─────────────────────

  describe('APPLY_FILE_CHANGE', () => {
    function seedTab(over: Record<string, unknown> = {}) {
      const tab = makeTab({
        id: 'fc1',
        pathname: '/tmp/watched.md',
        filename: 'watched.md',
        isSaved: true,
        ...over
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()
      return tab
    }

    it("'change' marks tab dirty and pushes fileChangedOnDisk notification", () => {
      seedTab({ isSaved: true })
      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/watched.md' })
      expect(editor.tabs[0].isSaved).toBe(false)
      expect(editor.tabs[0].notifications).toHaveLength(1)
      expect(editor.tabs[0].notifications[0].showConfirm).toBe(true)
      expect(editor.tabs[0].notifications[0].exclusiveType).toBe('file_changed')
    })

    it("'add' takes the same path as 'change' (case fall-through)", () => {
      seedTab({ isSaved: true })
      editor.APPLY_FILE_CHANGE('add', { pathname: '/tmp/watched.md' })
      expect(editor.tabs[0].isSaved).toBe(false)
      expect(editor.tabs[0].notifications[0].exclusiveType).toBe('file_changed')
    })

    it("'unlink' marks dirty + pushes fileRemovedOnDisk notification (showConfirm=false)", () => {
      seedTab({ isSaved: true })
      editor.APPLY_FILE_CHANGE('unlink', { pathname: '/tmp/watched.md' })
      expect(editor.tabs[0].isSaved).toBe(false)
      const n = editor.tabs[0].notifications[0]
      expect(n.style).toBe('warn')
      expect(n.showConfirm).toBe(false)
      expect(n.exclusiveType).toBe('file_changed')
    })

    it('invalid type → console.error (no crash)', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      seedTab({ isSaved: true })
      editor.APPLY_FILE_CHANGE('weird', { pathname: '/tmp/watched.md' })
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Invalid type'))
      // tab untouched (apart from finding it)
      expect(editor.tabs[0].notifications).toHaveLength(0)
      spy.mockRestore()
    })

    it('no tab matches pathname → console.error early return, no crash', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.tabs = []
      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/missing.md' })
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Cannot find tab'))
      spy.mockRestore()
    })

    it('no pathname in change payload → silent early return', () => {
      seedTab({ isSaved: true })
      editor.APPLY_FILE_CHANGE('change', {})
      expect(editor.tabs[0].notifications).toHaveLength(0)
    })
  })

  // ─── Bootstrap ────────────────────────────────────────────────────

  describe('APPLY_BOOTSTRAP_EDITOR', () => {
    it('marks main store initialized and creates a blank tab when addBlankTab=true', async () => {
      const main = (globalThis as any).__editorStubs.main
      main.init = false // reset (vi.resetAllMocks does not touch plain state)

      editor.APPLY_BOOTSTRAP_EDITOR({
        addBlankTab: true,
        markdownList: [],
        lineEnding: 'lf',
        sideBarVisibility: true,
        tabBarVisibility: false,
        sourceCodeModeEnabled: false
      })

      expect(main.SET_INITIALIZED).toHaveBeenCalled()
      expect(editor.tabs).toHaveLength(1)
      expect(editor.tabs[0].markdown).toBe('')
    })

    it('opens a blank tab per markdownList entry when addBlankTab=false', () => {
      editor.APPLY_BOOTSTRAP_EDITOR({
        addBlankTab: false,
        markdownList: ['# one', '# two', '# three'],
        lineEnding: 'lf',
        sideBarVisibility: false,
        tabBarVisibility: true,
        sourceCodeModeEnabled: true
      })
      expect(editor.tabs).toHaveLength(3)
      expect(editor.tabs.map((t: any) => t.markdown)).toEqual(['# one', '# two', '# three'])
      expect(editor.currentFile.markdown).toBe('# one') // first selected
    })

    it('null payload does not crash', () => {
      expect(() => editor.APPLY_BOOTSTRAP_EDITOR(null)).not.toThrow()
    })
  })

  // ─── Misc ─────────────────────────────────────────────────────────

  describe('APPLY_EXPORT_SUCCESS', () => {
    it('pushes a success notification with file path basename', () => {
      editor.APPLY_EXPORT_SUCCESS('/tmp/out.pdf')
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          showConfirm: true
        })
      )
    })

    it('returns early on empty path', () => {
      editor.APPLY_EXPORT_SUCCESS('')
      expect(notice.notify).not.toHaveBeenCalled()
    })
  })

  describe('copyGithubSlug', () => {
    it('writes slug to clipboard + success toast on hit', () => {
      editor.listToc = [{ slug: 's1', githubSlug: 'github-slug-1' }]
      editor.copyGithubSlug('s1')
      expect(window.electron.clipboard.writeText).toHaveBeenCalledWith('#github-slug-1')
      expect(notice.notify).toHaveBeenCalled()
    })

    it('warns on miss', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.listToc = []
      editor.copyGithubSlug('nope')
      expect(spy).toHaveBeenCalled()
      expect(notice.notify).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('loadChange', () => {
    it('replaces tab content for a matched path and emits file-changed when current', () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/x.md', filename: 'x.md' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.loadChange({
        pathname: '/tmp/x.md',
        data: {
          markdown: 'new content',
          filename: 'x.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      expect(editor.tabs[0].markdown).toBe('new content')
      expect(bus.emit).toHaveBeenCalledWith('file-changed', expect.any(Object))
    })

    it('errors out + notifies when no tab matches', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      editor.tabs = []
      editor.loadChange({
        pathname: '/tmp/missing.md',
        data: {
          markdown: '',
          filename: 'missing.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Cannot find tab'))
      expect(notice.notify).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('pushes mixedLineEndings notification when flagged', () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/x.md', filename: 'x.md' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.loadChange({
        pathname: '/tmp/x.md',
        data: {
          markdown: 'mixed',
          filename: 'x.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'crlf',
          adjustLineEndingOnSave: true,
          trimTrailingNewline: 3,
          isMixedLineEndings: true
        }
      })
      expect(editor.tabs[0].notifications).toHaveLength(1)
    })
  })

  // ─── Smoke / spot-checks for surface coverage ─────────────────────

  describe('action surface', () => {
    it('LISTEN_FOR_CLOSE registers an ipcRenderer listener', () => {
      editor.LISTEN_FOR_CLOSE()
      expect(window.electron.ipcRenderer.on).toHaveBeenCalledWith(
        'mt::ask-for-close',
        expect.any(Function)
      )
    })

    it('LISTEN_FOR_SAVE / LISTEN_FOR_SAVE_AS / LISTEN_FOR_NEW_TAB subscribe on bus', () => {
      editor.LISTEN_FOR_SAVE()
      editor.LISTEN_FOR_SAVE_AS()
      editor.LISTEN_FOR_NEW_TAB()
      expect(bus.on).toHaveBeenCalledWith('mt::editor-ask-file-save', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::editor-ask-file-save-as', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::new-untitled-tab', expect.any(Function))
    })

    it('SET_LINE_ENDING flips the currentFile flags + isSaved', () => {
      editor.currentFile = makeTab({ id: 'a', lineEnding: 'lf', isSaved: false })
      editor.tabs = [editor.currentFile]
      editor.SET_LINE_ENDING('crlf')
      expect(editor.currentFile.lineEnding).toBe('crlf')
      expect(editor.currentFile.adjustLineEndingOnSave).toBe(true)
      expect(editor.currentFile.isSaved).toBe(true)
    })

    it('SET_LINE_ENDING is a no-op when value unchanged', () => {
      editor.currentFile = makeTab({ id: 'a', lineEnding: 'lf', isSaved: false })
      editor.SET_LINE_ENDING('lf')
      expect(editor.currentFile.isSaved).toBe(false)
    })

    it('SEARCH writes a deep-cloned value to currentFile.searchMatches', () => {
      editor.currentFile = makeTab({ id: 'a' })
      const value = { matches: [1], index: 0, value: 'foo' }
      editor.SEARCH(value)
      expect(editor.currentFile.searchMatches).toEqual(value)
      expect(editor.currentFile.searchMatches).not.toBe(value) // deep clone
    })

    it('SET_SAVE_STATUS_WHEN_REMOVE marks matching tab dirty', () => {
      editor.tabs = [
        makeTab({ id: 'a', pathname: '/tmp/a.md', isSaved: true }),
        makeTab({ id: 'b', pathname: '/tmp/b.md', isSaved: true })
      ]
      editor.SET_SAVE_STATUS_WHEN_REMOVE({ pathname: '/tmp/a.md' })
      expect(editor.tabs[0].isSaved).toBe(false)
      expect(editor.tabs[1].isSaved).toBe(true)
    })

    it('CYCLE_TABS no-op with ≤1 tab', () => {
      editor.tabs = [makeTab({ id: 'a' })]
      editor.currentFile = editor.tabs[0]
      editor.CYCLE_TABS(true)
      expect(editor.currentFile.id).toBe('a')
    })

    it('CYCLE_TABS rotates currentFile right', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()
      editor.CYCLE_TABS(true)
      expect(editor.currentFile.id).toBe('b')
    })

    it('SWITCH_TAB_BY_INDEX warns on out-of-range', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a' })]
      editor.currentFile = editor.tabs[0]
      editor.SWITCH_TAB_BY_INDEX(99)
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('SWITCH_TAB_BY_INDEX moves currentFile when valid', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()
      editor.SWITCH_TAB_BY_INDEX(1)
      expect(editor.currentFile.id).toBe('b')
    })

    it('SWITCH_TAB_BY_FILEPATH switches on hit', () => {
      editor.tabs = [
        makeTab({ id: 'a', pathname: '/x.md' }),
        makeTab({ id: 'b', pathname: '/y.md' })
      ]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()
      editor.SWITCH_TAB_BY_FILEPATH('/y.md')
      expect(editor.currentFile.id).toBe('b')
    })

    it('SWITCH_TAB_BY_FILEPATH warns/errors on miss', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'a', pathname: '/tmp/a.md' })]
      editor.currentFile = editor.tabs[0]
      editor.SWITCH_TAB_BY_FILEPATH('')
      editor.SWITCH_TAB_BY_FILEPATH('/nope.md')
      expect(warnSpy).toHaveBeenCalled()
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
      warnSpy.mockRestore()
    })
  })

  // ─── more action coverage ─────────────────────────────────────────

  describe('NEW_TAB_WITH_CONTENT', () => {
    function md(over: Record<string, unknown> = {}) {
      return {
        markdown: 'hello',
        filename: 'a.md',
        pathname: '/tmp/a.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 3,
        isMixedLineEndings: false,
        ...over
      }
    }

    it('creates a new tab and selects it', () => {
      editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md(), selected: true })
      expect(editor.tabs).toHaveLength(1)
      expect(editor.currentFile.pathname).toBe('/tmp/a.md')
    })

    it('reuses an existing tab when path matches', () => {
      editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md(), selected: true })
      editor.NEW_TAB_WITH_CONTENT({ markdownDocument: md(), selected: true })
      expect(editor.tabs).toHaveLength(1)
    })

    it('warns + falls back to NEW_UNTITLED_TAB when document is missing', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      editor.NEW_TAB_WITH_CONTENT({})
      expect(spy).toHaveBeenCalled()
      expect(editor.tabs).toHaveLength(1)
      spy.mockRestore()
    })

    it('pushes mixedLineEndings notification when flagged', () => {
      editor.NEW_TAB_WITH_CONTENT({
        markdownDocument: md({ isMixedLineEndings: true, lineEnding: 'crlf' }),
        selected: true
      })
      expect(editor.tabs[0].notifications.length).toBeGreaterThan(0)
    })

    it('appends without selection when selected=false', () => {
      const t0 = makeTab({ id: 'pre', pathname: '/tmp/pre.md', isSaved: true })
      editor.tabs = [t0]
      editor.currentFile = t0
      editor.updateTabIdToIndex()
      editor.NEW_TAB_WITH_CONTENT({
        markdownDocument: md({ pathname: '/tmp/new.md', filename: 'new.md' }),
        selected: false
      })
      expect(editor.tabs.length).toBe(2)
      expect(editor.currentFile.id).toBe('pre')
    })
  })

  describe('LISTEN_FOR_CONTENT_CHANGE', () => {
    it('updates markdown / wordCount / cursor / blocks on the matching tab', () => {
      const tab = makeTab({
        id: 't1',
        pathname: '/tmp/x.md',
        markdown: 'old',
        history: { stack: [{ id: 'h0' }], index: 0, lastEditIndex: 0 },
        lastSavedHistoryId: 'h0'
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'new content',
        wordCount: { word: 2, character: 11, paragraph: 1, all: 11 },
        cursor: { line: 0 },
        muyaIndexCursor: 1,
        history: { stack: [{ id: 'h1' }], index: 0, lastEditIndex: 0 },
        toc: [],
        blocks: []
      })

      expect(editor.tabs[0].markdown).toBe('new content')
      expect(editor.tabs[0].wordCount.word).toBe(2)
      expect(editor.tabs[0].isSaved).toBe(false)
    })

    it('throws when id is missing', () => {
      expect(() =>
        editor.LISTEN_FOR_CONTENT_CHANGE({ id: undefined, markdown: '' })
      ).toThrow(/id was not set/)
    })

    it('returns silently when no tabs are open', () => {
      editor.tabs = []
      expect(() =>
        editor.LISTEN_FOR_CONTENT_CHANGE({ id: 'anything', markdown: '' })
      ).not.toThrow()
    })

    it('returns silently when id is not in tabIdToIndex', () => {
      editor.tabs = [makeTab({ id: 'a' })]
      editor.updateTabIdToIndex()
      expect(() =>
        editor.LISTEN_FOR_CONTENT_CHANGE({ id: 'stale', markdown: '' })
      ).not.toThrow()
    })

    it('keeps isSaved=true on undo (history index aligns with lastSavedHistoryId)', () => {
      const tab = makeTab({
        id: 't1',
        markdown: 'a',
        history: { stack: [{ id: 'h-saved' }], index: 0, lastEditIndex: 0 },
        lastSavedHistoryId: 'h-saved'
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.LISTEN_FOR_CONTENT_CHANGE({
        id: 't1',
        markdown: 'a',
        history: { stack: [{ id: 'h-saved' }], index: 0, lastEditIndex: 0 }
      })
      expect(editor.tabs[0].isSaved).toBe(true)
    })
  })

  describe('CLOSE_OTHER_TABS / CLOSE_SAVED_TABS / CLOSE_ALL_TABS', () => {
    it('CLOSE_OTHER_TABS keeps only the given tab', () => {
      const a = makeTab({ id: 'a', isSaved: true })
      const b = makeTab({ id: 'b', isSaved: true })
      const c = makeTab({ id: 'c', isSaved: true })
      editor.tabs = [a, b, c]
      editor.currentFile = b
      editor.updateTabIdToIndex()
      editor.CLOSE_OTHER_TABS(b)
      expect(editor.tabs.map((t: any) => t.id)).toEqual(['b'])
    })

    it('CLOSE_SAVED_TABS removes only saved ones', () => {
      const a = makeTab({ id: 'a', isSaved: true })
      const b = makeTab({ id: 'b', isSaved: false })
      editor.tabs = [a, b]
      editor.currentFile = a
      editor.updateTabIdToIndex()
      editor.CLOSE_SAVED_TABS()
      expect(editor.tabs.map((t: any) => t.id)).toEqual(['b'])
    })

    it('CLOSE_ALL_TABS clears all (saved branch)', () => {
      editor.tabs = [
        makeTab({ id: 'a', isSaved: true }),
        makeTab({ id: 'b', isSaved: true })
      ]
      editor.currentFile = editor.tabs[0]
      editor.updateTabIdToIndex()
      editor.CLOSE_ALL_TABS()
      expect(editor.tabs).toHaveLength(0)
    })
  })

  describe('EXCHANGE_TABS_BY_ID', () => {
    it('moves tab to end when toId is falsy', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'a', toId: null })
      expect(editor.tabs.map((t: any) => t.id)).toEqual(['b', 'c', 'a'])
    })

    it('moves between two ids', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'c', toId: 'a' })
      expect(editor.tabs.map((t: any) => t.id)).toEqual(['c', 'a', 'b'])
    })

    it('returns early when fromId is unknown', () => {
      editor.tabs = [makeTab({ id: 'a' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'missing', toId: 'a' })
      expect(editor.tabs.map((t: any) => t.id)).toEqual(['a'])
    })

    it('returns early when toId is unknown', () => {
      editor.tabs = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]
      editor.updateTabIdToIndex()
      editor.EXCHANGE_TABS_BY_ID({ fromId: 'a', toId: 'missing' })
      expect(editor.tabs.map((t: any) => t.id)).toEqual(['a', 'b'])
    })
  })

  describe('UPDATE_CURRENT_FILE / RENAME_FILE / RENAME', () => {
    it('UPDATE_CURRENT_FILE sets currentFile + emits file-changed', () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md', markdown: 'x' })
      editor.UPDATE_CURRENT_FILE(tab)
      expect(editor.currentFile.id).toBe('t1')
      expect(editor.tabs).toHaveLength(1)
      expect(bus.emit).toHaveBeenCalledWith('file-changed', expect.any(Object))
    })

    it('UPDATE_CURRENT_FILE no-ops when same id', () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md' })
      editor.UPDATE_CURRENT_FILE(tab)
      ;(bus.emit as any).mockClear()
      editor.UPDATE_CURRENT_FILE(tab)
      expect(bus.emit).not.toHaveBeenCalledWith('file-changed', expect.any(Object))
    })

    it('RENAME_FILE delegates and emits rename', () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md' })
      editor.RENAME_FILE(tab)
      expect(bus.emit).toHaveBeenCalledWith('rename')
    })

    it('RENAME ipc-sends with new pathname', () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()
      editor.RENAME('b.md')
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::rename',
        expect.objectContaining({ id: 't1' })
      )
    })

    it('RENAME no-ops when filename unchanged', () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.RENAME('a.md')
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::rename',
        expect.any(Object)
      )
    })
  })

  describe('EXPORT', () => {
    it('returns early when currentFile is empty', () => {
      editor.currentFile = {}
      editor.EXPORT({ type: 'pdf', content: '<p/>', pageOptions: {} })
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalled()
    })

    it('sends mt::response-export with title from listToc top header', () => {
      editor.currentFile = makeTab({ id: 't1', pathname: '/tmp/a.md', filename: 'a.md' })
      editor.tabs = [editor.currentFile]
      editor.listToc = [{ slug: 's1', githubSlug: 'g1', content: 'Title', lvl: 1 }]
      editor.EXPORT({ type: 'pdf', content: '<p/>', pageOptions: {} })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::response-export',
        expect.objectContaining({ title: 'Title', type: 'pdf' })
      )
    })

    it('PRINT_RESPONSE sends mt::response-print', () => {
      editor.PRINT_RESPONSE()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::response-print')
    })
  })

  describe('SHOW_IMAGE_DELETION_URL', () => {
    it('shows a notification (notify is awaited; clipboard write happens on resolve)', async () => {
      editor.SHOW_IMAGE_DELETION_URL('https://example.com/del')
      expect(notice.notify).toHaveBeenCalled()
    })
  })

  describe('FORMAT_LINK_CLICK', () => {
    it('emits scroll-to-header on local anchor link', () => {
      editor.listToc = [{ slug: 'h1', githubSlug: 'h-one' }]
      editor.FORMAT_LINK_CLICK({ data: { href: '#h-one' }, dirname: '/tmp' })
      expect(bus.emit).toHaveBeenCalledWith('scroll-to-header', 'h1')
    })

    it('returns early on bare # link', () => {
      editor.FORMAT_LINK_CLICK({ data: { href: '#' }, dirname: '/' })
      expect(bus.emit).not.toHaveBeenCalledWith('scroll-to-header', expect.anything())
    })

    it('forwards non-anchor links via ipc', () => {
      editor.FORMAT_LINK_CLICK({ data: { href: 'https://x.com' }, dirname: '/' })
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::format-link-click',
        expect.any(Object)
      )
    })
  })

  describe('UPDATE_LINE_ENDING_MENU', () => {
    it('sends ipc when currentFile has lineEnding', () => {
      editor.currentFile = makeTab({ id: 't1', lineEnding: 'lf' })
      editor.UPDATE_LINE_ENDING_MENU()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::update-line-ending-menu',
        expect.any(Number),
        'lf'
      )
    })

    it('no-ops without lineEnding', () => {
      editor.currentFile = {}
      editor.UPDATE_LINE_ENDING_MENU()
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalled()
    })
  })

  describe('ASK_FOR_IMAGE_PATH', () => {
    it('routes through ipcRenderer.invoke', async () => {
      ;(window.electron.ipcRenderer.invoke as any).mockResolvedValueOnce('/tmp/img.png')
      const r = await editor.ASK_FOR_IMAGE_PATH()
      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('mt::ask-for-image-path')
      expect(r).toBe('/tmp/img.png')
    })
  })

  describe('ASK_FOR_IMAGE_AUTO_PATH', () => {
    it('returns [] when there is no current pathname', async () => {
      editor.currentFile = {}
      const result = await editor.ASK_FOR_IMAGE_AUTO_PATH('img.png')
      expect(result).toEqual([])
    })
  })

  describe('SELECTION_FORMATS', () => {
    it('sends mt::update-format-menu', () => {
      editor.SELECTION_FORMATS([{ type: 'strong' }, { type: 'em' }])
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::update-format-menu',
        expect.any(Number),
        expect.objectContaining({ strong: true, em: true })
      )
    })
  })

  describe('zoom + listeners surface', () => {
    it('EDIT_ZOOM updates preferences and webFrame', () => {
      editor.EDIT_ZOOM(1.25)
      expect(window.electron.webFrame.setZoomFactor).toHaveBeenCalledWith(1.25)
    })

    it('LISTEN_WINDOW_ZOOM subscribes', () => {
      editor.LISTEN_WINDOW_ZOOM()
      expect(bus.on).toHaveBeenCalledWith('mt::window-zoom', expect.any(Function))
    })

    it('LISTEN_FOR_MOVE_TO / LISTEN_FOR_RENAME / LISTEN_FOR_CLOSE_TAB / LISTEN_FOR_TAB_CYCLE / LINTEN_FOR_SET_LINE_ENDING / LINTEN_FOR_SET_ENCODING / LINTEN_FOR_SET_FINAL_NEWLINE register bus subs', () => {
      editor.LISTEN_FOR_MOVE_TO()
      editor.LISTEN_FOR_RENAME()
      editor.LISTEN_FOR_CLOSE_TAB()
      editor.LISTEN_FOR_TAB_CYCLE()
      editor.LINTEN_FOR_SET_LINE_ENDING()
      editor.LINTEN_FOR_SET_ENCODING()
      editor.LINTEN_FOR_SET_FINAL_NEWLINE()
      expect(bus.on).toHaveBeenCalledWith('mt::editor-move-file', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::editor-rename-file', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::editor-close-tab', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::tabs-cycle-left', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::tabs-cycle-right', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::set-line-ending', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::set-file-encoding', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('mt::set-final-newline', expect.any(Function))
    })
  })

  describe('ASK_FOR_SAVE_ALL', () => {
    it('closeTabs=true with no unsaved → CLOSE_TABS for all', () => {
      const a = makeTab({ id: 'a', isSaved: true, markdown: 'x' })
      const b = makeTab({ id: 'b', isSaved: true, markdown: 'y' })
      editor.tabs = [a, b]
      editor.currentFile = a
      editor.updateTabIdToIndex()
      editor.ASK_FOR_SAVE_ALL(true)
      // tabs should be closed
      expect(editor.tabs).toHaveLength(0)
    })

    it('closeTabs=false sends mt::save-tabs', () => {
      const a = makeTab({ id: 'a', isSaved: false, pathname: '/tmp/a.md', markdown: 'edits' })
      editor.tabs = [a]
      editor.currentFile = a
      editor.updateTabIdToIndex()
      editor.ASK_FOR_SAVE_ALL(false)
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::save-tabs',
        expect.any(Array)
      )
    })
  })

  describe('MOVE_FILE_TO + RESPONSE_FOR_RENAME', () => {
    it('MOVE_FILE_TO with named file sends mt::response-file-move-to', async () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md' })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()
      await editor.MOVE_FILE_TO()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::response-file-move-to',
        expect.objectContaining({ id: 't1', pathname: '/tmp/a.md' })
      )
    })

    it('MOVE_FILE_TO with no id is a no-op', async () => {
      editor.currentFile = {}
      await editor.MOVE_FILE_TO()
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::response-file-move-to',
        expect.anything()
      )
    })

    it('RESPONSE_FOR_RENAME emits rename when path is set', async () => {
      const tab = makeTab({ id: 't1', pathname: '/tmp/a.md' })
      editor.tabs = [tab]
      editor.currentFile = tab
      await editor.RESPONSE_FOR_RENAME()
      expect(bus.emit).toHaveBeenCalledWith('rename')
    })

    it('RESPONSE_FOR_RENAME with no id is a no-op', async () => {
      editor.currentFile = {}
      await editor.RESPONSE_FOR_RENAME()
      expect(bus.emit).not.toHaveBeenCalledWith('rename')
    })
  })

  describe('SELECTION_CHANGE', () => {
    it('writes search value snapshot when selection on a single line', () => {
      editor.currentFile = makeTab({ id: 't1' })
      editor.tabs = [editor.currentFile]
      editor.SELECTION_CHANGE({
        start: { key: 'k', offset: 0, block: { text: 'hello world', functionType: '' }, type: 'span' },
        end: { key: 'k', offset: 5, block: { text: 'hello world', functionType: '' }, type: 'span' },
        affiliation: []
      })
      expect(editor.currentFile.searchMatches.value).toBe('hello')
    })
  })

  describe('APPLY_FILE_CHANGE autoSave branch', () => {
    it("autoSave=true + isSaved=true triggers loadChange (no notification)", () => {
      const stubs = (globalThis as any).__editorStubs
      stubs.preferences.autoSave = true
      const tab = makeTab({
        id: 't1',
        pathname: '/tmp/x.md',
        filename: 'x.md',
        isSaved: true
      })
      editor.tabs = [tab]
      editor.currentFile = tab
      editor.updateTabIdToIndex()

      editor.APPLY_FILE_CHANGE('change', {
        pathname: '/tmp/x.md',
        data: {
          markdown: 'new disk content',
          filename: 'x.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })
      // loadChange path: content updated, no fileChangedOnDisk notif
      expect(editor.tabs[0].markdown).toBe('new disk content')
      stubs.preferences.autoSave = false
    })
  })
})
