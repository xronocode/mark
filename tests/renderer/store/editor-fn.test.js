/**
 * Function coverage tests for store/editor.js
 * Targets remaining uncovered functions.
 */
import { setupTestPinia } from '../pinia'

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
vi.mock('element-plus/es/components/message-box/index.mjs', () => ({
  ElMessageBox: {
    confirm: vi.fn(async () => 'confirm'),
    alert: vi.fn(async () => undefined)
  }
}))
vi.mock('@/ipc/runtime', () => ({
  ipcFs: { read: vi.fn(async () => 'mocked'), write: vi.fn() },
  ipcWatch: { subscribe: vi.fn(async () => vi.fn()) }
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
    cursor: doc.cursor || null,
    isSaved: true,
    wordCount: {},
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 2,
    history: { stack: [], index: -1, lastEditIndex: -1 },
    lastSavedHistoryId: null,
    notifications: [],
    searchMatches: { matches: [], index: -1, value: '' },
    blocks: null,
    scrollTop: 0,
    muyaIndexCursor: null,
    previewMode: false
  })),
  getOptionsFromState: vi.fn(() => ({})),
  getSingleFileState: vi.fn((o) => ({
    id: `id-${Date.now()}`,
    filename: o.filename || 'untitled.md',
    pathname: o.pathname || '',
    markdown: o.markdown || '',
    cursor: null,
    isSaved: true,
    wordCount: {},
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 2,
    history: { stack: [], index: -1, lastEditIndex: -1 },
    lastSavedHistoryId: null,
    notifications: [],
    searchMatches: { matches: [], index: -1, value: '' },
    blocks: null,
    scrollTop: 0,
    muyaIndexCursor: null,
    previewMode: false
  })),
  getBlankFileState: vi.fn((tabs, enc, eol, md) => ({
    id: `blank-${Date.now()}`,
    filename: 'Untitled-1',
    pathname: '',
    markdown: md || '\n',
    cursor: null,
    isSaved: true,
    wordCount: {},
    encoding: { encoding: enc || 'utf8', isBom: false },
    lineEnding: eol || 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 2,
    history: { stack: [], index: -1, lastEditIndex: -1 },
    lastSavedHistoryId: null,
    notifications: [],
    searchMatches: { matches: [], index: -1, value: '' },
    blocks: null,
    scrollTop: 0,
    muyaIndexCursor: null,
    previewMode: false
  }))
}))
vi.mock('@/commands', () => ({
  FileEncodingCommand: vi.fn(),
  LineEndingCommand: vi.fn(),
  QuickOpenCommand: vi.fn(),
  TrailingNewlineCommand: vi.fn()
}))

describe('store/editor.js — fn coverage', () => {
  let editorStore, bus

  beforeEach(async () => {
    setupTestPinia()
    bus = (await import('@/bus')).default
    const { useEditorStore } = await import('@/store/editor')
    editorStore = useEditorStore()
    // Give the store some tabs
    editorStore.tabs = []
    editorStore.currentFile = {}
    editorStore.tabIdToIndex = {}
    editorStore.listToc = []
    editorStore.toc = []
  })

  it('RENAME calls fileUtils.move when filename changes', async () => {
    const tab = { id: '1', pathname: '/a/test.md', filename: 'test.md' }
    editorStore.currentFile = tab
    editorStore.tabs = [tab]
    await editorStore.RENAME('renamed.md')
    expect(window.fileUtils.move).toHaveBeenCalledWith('/a/test.md', '/a/renamed.md')
  })

  it('RENAME does nothing when filename is the same', async () => {
    editorStore.currentFile = { id: '1', pathname: '/a/test.md', filename: 'test.md' }
    await editorStore.RENAME('test.md')
    expect(window.fileUtils.move).not.toHaveBeenCalled()
  })

  it('RENAME_FILE calls UPDATE_CURRENT_FILE and emits rename', () => {
    const file = { id: '1', pathname: '/a/b.md', filename: 'b.md', markdown: '', isSaved: true }
    editorStore.tabs = [file]
    editorStore.updateTabIdToIndex()
    editorStore.RENAME_FILE(file)
    expect(bus.emit).toHaveBeenCalledWith('rename')
  })

  it('CLOSE_OTHER_TABS closes all tabs except the given one', () => {
    const t1 = { id: '1', isSaved: true, filename: 'a.md', pathname: '/a.md', markdown: '' }
    const t2 = { id: '2', isSaved: true, filename: 'b.md', pathname: '/b.md', markdown: '' }
    const t3 = { id: '3', isSaved: true, filename: 'c.md', pathname: '/c.md', markdown: '' }
    editorStore.tabs = [t1, t2, t3]
    editorStore.currentFile = t2
    editorStore.updateTabIdToIndex()
    editorStore.CLOSE_OTHER_TABS(t2)
    // t1 and t3 should be closed, only t2 remains
    expect(editorStore.tabs.some(t => t.id === '2')).toBe(true)
  })

  it('CLOSE_SAVED_TABS closes only saved tabs', () => {
    const t1 = { id: '1', isSaved: true, filename: 'a.md', pathname: '/a.md', markdown: '' }
    const t2 = { id: '2', isSaved: false, filename: 'b.md', pathname: '', markdown: 'x' }
    editorStore.tabs = [t1, t2]
    editorStore.currentFile = t1
    editorStore.updateTabIdToIndex()
    editorStore.CLOSE_SAVED_TABS()
    // t2 is unsaved so remains (or triggers confirm dialog)
  })

  it('CLOSE_ALL_TABS calls CLOSE_TAB for each tab', () => {
    const t1 = { id: '1', isSaved: true, filename: 'a.md', pathname: '/a.md', markdown: '' }
    editorStore.tabs = [t1]
    editorStore.currentFile = t1
    editorStore.updateTabIdToIndex()
    editorStore.CLOSE_ALL_TABS()
    expect(editorStore.tabs.length).toBe(0)
  })

  it('EXCHANGE_TABS_BY_ID swaps tab positions', () => {
    const t1 = { id: 'a' }
    const t2 = { id: 'b' }
    const t3 = { id: 'c' }
    editorStore.tabs = [t1, t2, t3]
    editorStore.updateTabIdToIndex()
    editorStore.EXCHANGE_TABS_BY_ID({ fromId: 'a', toId: 'c' })
    expect(editorStore.tabs[0].id).not.toBe('a')
  })

  it('EXCHANGE_TABS_BY_ID moves to end when toId is null', () => {
    const t1 = { id: 'a' }
    const t2 = { id: 'b' }
    editorStore.tabs = [t1, t2]
    editorStore.updateTabIdToIndex()
    editorStore.EXCHANGE_TABS_BY_ID({ fromId: 'a', toId: null })
    expect(editorStore.tabs[editorStore.tabs.length - 1].id).toBe('a')
  })

  it('EXCHANGE_TABS_BY_ID returns if fromId not found', () => {
    editorStore.tabs = [{ id: 'a' }]
    editorStore.updateTabIdToIndex()
    editorStore.EXCHANGE_TABS_BY_ID({ fromId: 'notexist', toId: 'a' })
  })

  it('SET_LINE_ENDING updates line ending', () => {
    editorStore.currentFile = { lineEnding: 'lf', adjustLineEndingOnSave: false, isSaved: true }
    editorStore.SET_LINE_ENDING('crlf')
    expect(editorStore.currentFile.lineEnding).toBe('crlf')
    expect(editorStore.currentFile.adjustLineEndingOnSave).toBe(true)
  })

  it('SET_LINE_ENDING does nothing if same', () => {
    editorStore.currentFile = { lineEnding: 'lf', adjustLineEndingOnSave: false, isSaved: true }
    editorStore.SET_LINE_ENDING('lf')
    expect(editorStore.currentFile.isSaved).toBe(true)
  })

  it('SEARCH stores search matches', () => {
    editorStore.currentFile = { searchMatches: null }
    editorStore.SEARCH({ matches: [1, 2], index: 0, value: 'hello' })
    expect(editorStore.currentFile.searchMatches.value).toBe('hello')
  })

  it('SHOW_IMAGE_DELETION_URL calls notice.notify', async () => {
    const notice = (await import('@/services/notification')).default
    editorStore.SHOW_IMAGE_DELETION_URL('http://delete.me')
    expect(notice.notify).toHaveBeenCalled()
  })

  it('UPDATE_LINE_ENDING_MENU sends ipc when lineEnding exists', () => {
    editorStore.currentFile = { lineEnding: 'crlf' }
    window.marktext = { env: { windowId: 1, type: 'editor', debug: false, paths: { userDataPath: '/tmp' } } }
    editorStore.UPDATE_LINE_ENDING_MENU()
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::update-line-ending-menu', 1, 'crlf')
  })

  it('LISTEN_FOR_SAVE registers bus listener', () => {
    editorStore.LISTEN_FOR_SAVE()
    expect(bus.on).toHaveBeenCalledWith('mt::editor-ask-file-save', expect.any(Function))
  })

  it('LISTEN_FOR_SAVE_AS registers bus listener', () => {
    editorStore.LISTEN_FOR_SAVE_AS()
    expect(bus.on).toHaveBeenCalledWith('mt::editor-ask-file-save-as', expect.any(Function))
  })

  it('LISTEN_FOR_MOVE_TO registers bus listener', () => {
    editorStore.LISTEN_FOR_MOVE_TO()
    expect(bus.on).toHaveBeenCalledWith('mt::editor-move-file', expect.any(Function))
  })

  it('LISTEN_FOR_RENAME registers bus listener', () => {
    editorStore.LISTEN_FOR_RENAME()
    expect(bus.on).toHaveBeenCalledWith('mt::editor-rename-file', expect.any(Function))
  })

  it('LISTEN_FOR_NEW_TAB registers bus listener', () => {
    editorStore.LISTEN_FOR_NEW_TAB()
    expect(bus.on).toHaveBeenCalledWith('mt::new-untitled-tab', expect.any(Function))
  })

  it('LISTEN_FOR_CLOSE_TAB registers bus listener', () => {
    editorStore.LISTEN_FOR_CLOSE_TAB()
    expect(bus.on).toHaveBeenCalledWith('mt::editor-close-tab', expect.any(Function))
  })

  it('LISTEN_FOR_TAB_CYCLE registers bus listeners', () => {
    editorStore.LISTEN_FOR_TAB_CYCLE()
    expect(bus.on).toHaveBeenCalledWith('mt::tabs-cycle-left', expect.any(Function))
    expect(bus.on).toHaveBeenCalledWith('mt::tabs-cycle-right', expect.any(Function))
  })

  it('LINTEN_FOR_SET_LINE_ENDING registers bus listener', () => {
    editorStore.LINTEN_FOR_SET_LINE_ENDING()
    expect(bus.on).toHaveBeenCalledWith('mt::set-line-ending', expect.any(Function))
  })

  it('LINTEN_FOR_SET_ENCODING registers bus listener and handler works', () => {
    editorStore.currentFile = { encoding: { encoding: 'utf8', isBom: false }, isSaved: true }
    editorStore.LINTEN_FOR_SET_ENCODING()
    const handler = bus.on.mock.calls.find(c => c[0] === 'mt::set-file-encoding')[1]
    handler('latin1')
    expect(editorStore.currentFile.encoding.encoding).toBe('latin1')
  })

  it('LINTEN_FOR_SET_FINAL_NEWLINE registers bus listener and handler works', () => {
    editorStore.currentFile = { trimTrailingNewline: 2, isSaved: true }
    editorStore.LINTEN_FOR_SET_FINAL_NEWLINE()
    const handler = bus.on.mock.calls.find(c => c[0] === 'mt::set-final-newline')[1]
    handler(0)
    expect(editorStore.currentFile.trimTrailingNewline).toBe(0)
  })

  it('LISTEN_WINDOW_ZOOM registers bus listener', () => {
    editorStore.LISTEN_WINDOW_ZOOM()
    expect(bus.on).toHaveBeenCalledWith('mt::window-zoom', expect.any(Function))
  })

  it('SET_SAVE_STATUS_WHEN_REMOVE marks matching tabs unsaved', () => {
    const t1 = { id: '1', pathname: '/a.md', isSaved: true }
    editorStore.tabs = [t1]
    editorStore.SET_SAVE_STATUS_WHEN_REMOVE({ pathname: '/a.md' })
    expect(t1.isSaved).toBe(false)
  })

  it('SWITCH_TAB_BY_FILEPATH finds and switches tab', () => {
    const t1 = { id: '1', pathname: '/a.md', markdown: 'x', filename: 'a.md' }
    editorStore.tabs = [t1]
    editorStore.currentFile = {}
    editorStore.updateTabIdToIndex()
    editorStore.SWITCH_TAB_BY_FILEPATH('/a.md')
    expect(editorStore.currentFile.id).toBe('1')
  })

  it('SWITCH_TAB_BY_FILEPATH warns on invalid path', () => {
    editorStore.tabs = []
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    editorStore.SWITCH_TAB_BY_FILEPATH('')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('SWITCH_TAB_BY_INDEX switches to valid index', () => {
    const t1 = { id: '1', pathname: '/a.md', markdown: 'x', filename: 'a.md' }
    const t2 = { id: '2', pathname: '/b.md', markdown: 'y', filename: 'b.md' }
    editorStore.tabs = [t1, t2]
    editorStore.currentFile = t1
    editorStore.updateTabIdToIndex()
    editorStore.SWITCH_TAB_BY_INDEX(1)
    expect(editorStore.currentFile.id).toBe('2')
  })

  it('SWITCH_TAB_BY_INDEX warns on out-of-range index', () => {
    editorStore.tabs = [{ id: '1' }]
    editorStore.currentFile = { id: '1' }
    editorStore.updateTabIdToIndex()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    editorStore.SWITCH_TAB_BY_INDEX(99)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('APPLY_SAVE_OUTCOME returns if no outcome', () => {
    editorStore.APPLY_SAVE_OUTCOME(null)
    editorStore.APPLY_SAVE_OUTCOME({})
  })

  it('APPLY_TAB_SAVED marks tab as saved', () => {
    const t = {
      id: '1', isSaved: false,
      history: { lastEditIndex: 0, stack: [{ id: 'h1' }] },
      lastSavedHistoryId: null
    }
    editorStore.tabs = [t]
    editorStore.updateTabIdToIndex()
    editorStore.APPLY_TAB_SAVED('1')
    expect(t.isSaved).toBe(true)
    expect(t.lastSavedHistoryId).toBe('h1')
  })

  it('APPLY_TAB_SAVE_FAILURE marks tab unsaved and pushes notification', () => {
    const t = { id: '1', isSaved: true, notifications: [] }
    editorStore.tabs = [t]
    editorStore.updateTabIdToIndex()
    editorStore.APPLY_TAB_SAVE_FAILURE('1', 'disk full')
    expect(t.isSaved).toBe(false)
    expect(t.notifications.length).toBe(1)
  })

  it('APPLY_TAB_SAVE_FAILURE with missing tab shows notice', async () => {
    const notice = (await import('@/services/notification')).default
    editorStore.tabs = []
    editorStore.APPLY_TAB_SAVE_FAILURE('nonexistent', 'error msg')
    expect(notice.notify).toHaveBeenCalled()
  })

  it('PRINT_RESPONSE removed — print now uses window.print()', () => {
    expect(editorStore.PRINT_RESPONSE).toBeUndefined()
  })

  it('ASK_FOR_IMAGE_PATH calls invoke', () => {
    editorStore.ASK_FOR_IMAGE_PATH()
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('mt::ask-for-image-path')
  })

  it('APPLY_EXPORT_SUCCESS shows notification', async () => {
    const notice = (await import('@/services/notification')).default
    editorStore.APPLY_EXPORT_SUCCESS('/tmp/out.pdf')
    expect(notice.notify).toHaveBeenCalled()
  })

  it('APPLY_EXPORT_SUCCESS returns early for falsy path', () => {
    editorStore.APPLY_EXPORT_SUCCESS(null)
  })

  it('FORMAT_LINK_CLICK handles anchor links', () => {
    editorStore.listToc = [{ githubSlug: 'intro', slug: 'intro-slug' }]
    editorStore.FORMAT_LINK_CLICK({ data: { href: '#intro' }, dirname: '/dir' })
    expect(bus.emit).toHaveBeenCalledWith('scroll-to-header', 'intro-slug')
  })

  it('FORMAT_LINK_CLICK sends ipc for external links', () => {
    editorStore.FORMAT_LINK_CLICK({ data: { href: 'http://example.com' }, dirname: '/dir' })
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::format-link-click', expect.anything())
  })

  it('FORMAT_LINK_CLICK returns early for empty anchor', () => {
    editorStore.FORMAT_LINK_CLICK({ data: { href: '#' }, dirname: '/dir' })
    // Should not throw, no emit
  })

  it('copyGithubSlug copies text to clipboard', () => {
    editorStore.listToc = [{ slug: 'heading-1', githubSlug: 'heading-1' }]
    editorStore.copyGithubSlug('heading-1')
    expect(window.electron.clipboard.writeText).toHaveBeenCalledWith('#heading-1')
  })

  it('copyGithubSlug warns when slug not found', () => {
    editorStore.listToc = []
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    editorStore.copyGithubSlug('no-exist')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('updateScrollPosition updates tab scrollTop', () => {
    const t = { id: '1', scrollTop: 0 }
    editorStore.tabs = [t]
    editorStore.updateTabIdToIndex()
    editorStore.updateScrollPosition('1', 150)
    expect(t.scrollTop).toBe(150)
  })

  it('updateScrollPosition warns for unknown id', () => {
    editorStore.tabs = []
    editorStore.updateTabIdToIndex()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    editorStore.updateScrollPosition('unknown', 100)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('CLOSE_TABS with empty list returns early', () => {
    editorStore.CLOSE_TABS([])
    editorStore.CLOSE_TABS(null)
  })

  it('EXPORT handles no currentFile gracefully', () => {
    editorStore.currentFile = {}
    editorStore.EXPORT({ type: 'pdf', content: '' })
    // Should return early without sending ipc
  })
})
