// FILE: tests/renderer/store/guide-tab.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-40 G-3 guide tab lifecycle — temporary untitled tab, single-instance reuse, never written to disk, optional section deep link.
//   SCOPE: OPEN_GUIDE_TAB (create/reuse/section), LISTEN_FOR_OPEN_GUIDE ('mt::open-guide' bus event).
//   DEPENDS: src/renderer/src/store/editor.js, src/renderer/src/util/guideDoc.js (real, bundled docs).
//   LINKS: tests/renderer/store/editor-coverage.test.js (mock scaffold); tests/e2e/guide.spec.ts (visual gates).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   I18N_TABLE - t() translation table so guide.tabTitle resolves to a real title.
//   getOpenGuideHandler - extract the handler bus.on registered for 'mt::open-guide'.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - initial pins (C-40 2.3.1).
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'

// ─── module-level mocks (editor-coverage scaffold) ────────────────

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('../bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const I18N_TABLE = {
  'guide.tabTitle': 'Mark Guide'
}
vi.mock('@/i18n', () => ({
  i18n: {
    global: {
      t: (k) => I18N_TABLE[k] || k,
      locale: { value: 'en' }
    }
  },
  t: (k) => I18N_TABLE[k] || k,
  setLanguage: vi.fn()
}))
vi.mock('../i18n', () => ({
  i18n: {
    global: {
      t: (k) => I18N_TABLE[k] || k,
      locale: { value: 'en' }
    }
  },
  t: (k) => I18N_TABLE[k] || k,
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

const __ipcFsMock = { read: vi.fn(async () => 'mocked'), write: vi.fn() }
vi.mock('@/ipc/runtime', () => ({
  ipcFs: __ipcFsMock,
  ipcWatch: { subscribe: vi.fn(async () => vi.fn()) },
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}), getAll: vi.fn(async () => ({})) },
  ipcRecent: { add: vi.fn(async () => {}), list: vi.fn(async () => []), clear: vi.fn(async () => {}) }
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
  SET_USER_PREFERENCE: vi.fn(),
  SET_MODE: vi.fn(),
  SET_SINGLE_PREFERENCE: vi.fn()
}
const __layoutStub = {
  rightColumn: 'files',
  showSideBar: false,
  showTabBar: false,
  SET_LAYOUT: vi.fn(),
  DISPATCH_LAYOUT_MENU_ITEMS: vi.fn(),
  REQUEST_INITIAL_WINDOW_RESIZE: vi.fn()
}

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => __preferencesStub
}))
vi.mock('@/store/project', () => ({
  useProjectStore: () => ({ projectTree: null, projectTrees: [] })
}))
vi.mock('@/store/layout', () => ({
  useLayoutStore: () => __layoutStub
}))
vi.mock('@/store', () => ({ useMainStore: () => ({ init: false, SET_INITIALIZED: vi.fn() }) }))
vi.mock('@/store/index', () => ({ useMainStore: () => ({ init: false, SET_INITIALIZED: vi.fn() }) }))

// ─── test suite ───────────────────────────────────────────────────

const GUIDE_MD = [
  '# Mark Guide',
  '',
  'Intro line.',
  '',
  '## Connect your agent',
  '',
  'Prompt body.',
  '',
  '## Try it: tables',
  '',
  'Body.'
].join('\n')

// bus.on is a vi.fn() — recover the handler registered for mt::open-guide.
const getOpenGuideHandler = (bus) => {
  const call = bus.on.mock.calls.find((c) => c[0] === 'mt::open-guide')
  return call ? call[1] : null
}

describe('store/editor — C-40 guide tab', () => {
  let editor
  let bus

  beforeEach(async () => {
    setupTestPinia()
    const editorMod = await import('@/store/editor')
    editor = editorMod.useEditorStore()
    bus = (await import('@/bus')).default
    editor.END_BOOT_PHASE()
  })

  it('opens the guide as a temporary untitled tab that is never disk-backed', async () => {
    await editor.OPEN_GUIDE_TAB({ markdown: GUIDE_MD })

    expect(editor.tabs).toHaveLength(1)
    const guide = editor.currentFile
    expect(guide.isGuide).toBe(true)
    expect(guide.filename).toBe('Mark Guide')
    // Untitled + not dirty-tracked as a file: saving can only go through Save As.
    expect(guide.pathname).toBe('')
    expect(guide.markdown).toContain('## Connect your agent')
    expect(guide.markdown).not.toContain('@@AGENT_PROMPT@@')
    // The editor surface learns about the content through file-loaded.
    expect(bus.emit).toHaveBeenCalledWith('file-loaded', {
      id: guide.id,
      markdown: GUIDE_MD
    })
  })

  it('loads the bundled guide document when markdown is omitted', async () => {
    await editor.OPEN_GUIDE_TAB({})
    expect(editor.currentFile.isGuide).toBe(true)
    expect(editor.currentFile.markdown).toContain('# Mark Guide')
    expect(editor.currentFile.markdown).toContain('## Connect your agent')
  })

  it('reopening focuses the existing guide tab instead of making another', async () => {
    await editor.OPEN_GUIDE_TAB({ markdown: GUIDE_MD })
    const guideId = editor.currentFile.id

    // User opens another tab and makes it current; the guide stays open.
    editor.NEW_UNTITLED_TAB({ markdown: 'other' })
    expect(editor.tabs).toHaveLength(2)
    expect(editor.currentFile.id).not.toBe(guideId)

    await editor.OPEN_GUIDE_TAB({ markdown: GUIDE_MD })
    expect(editor.tabs).toHaveLength(2) // no third tab
    expect(editor.currentFile.id).toBe(guideId) // focused, not recreated
  })

  it('reuse never overwrites the user edits in the living guide document', async () => {
    await editor.OPEN_GUIDE_TAB({ markdown: GUIDE_MD })
    const guideId = editor.currentFile.id

    // The user shapes the page (the store tracks edits on the tab).
    editor.currentFile.markdown = GUIDE_MD + '\n\nMy notes.'
    editor.currentFile.isSaved = false

    editor.NEW_UNTITLED_TAB({ markdown: 'other' })
    await editor.OPEN_GUIDE_TAB({ markdown: GUIDE_MD })

    const guide = editor.tabs.find((t) => t.id === guideId)
    expect(editor.currentFile.id).toBe(guideId)
    expect(guide.markdown).toContain('My notes.')
  })

  it('a new untitled tab gets a proper Untitled-N name while the guide tab is open', async () => {
    // C-40 regression: the guide tab carries a real title ("Mark Guide"),
    // which must not corrupt the Untitled-N counter (was "Untitled-NaN").
    await editor.OPEN_GUIDE_TAB({ markdown: GUIDE_MD })
    editor.NEW_UNTITLED_TAB({ markdown: '' })
    const untitled = editor.tabs.find((t) => !t.isGuide)
    expect(untitled.filename).toBe('Untitled-1')
  })

  it('recreates the guide tab after the user closes it', async () => {
    await editor.OPEN_GUIDE_TAB({ markdown: GUIDE_MD })
    expect(editor.tabs).toHaveLength(1)

    editor.FORCE_CLOSE_TAB(editor.currentFile)
    expect(editor.tabs).toHaveLength(0)

    await editor.OPEN_GUIDE_TAB({ markdown: GUIDE_MD })
    expect(editor.tabs).toHaveLength(1)
    expect(editor.currentFile.isGuide).toBe(true)
  })

  it('deep-links to the connect-agent section via scroll-to-header with the muya block key', async () => {
    vi.useFakeTimers()
    try {
      bus.emit.mockClear()
      const promise = editor.OPEN_GUIDE_TAB({
        markdown: GUIDE_MD,
        section: 'connect-agent'
      })
      // listToc lands one macrotask after file-loaded — seed it the way
      // LISTEN_FOR_CONTENT_CHANGE would for the rendered guide document.
      editor.listToc = [{ content: 'Connect your agent', lvl: 2, slug: 'muya-key-1' }]
      await promise
      vi.advanceTimersByTime(300)
      expect(bus.emit).toHaveBeenCalledWith('scroll-to-header', 'muya-key-1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips the section scroll when the heading was removed by the user', async () => {
    vi.useFakeTimers()
    try {
      bus.emit.mockClear()
      await editor.OPEN_GUIDE_TAB({ markdown: '# No sections' })
      vi.advanceTimersByTime(300)
      const scrolled = bus.emit.mock.calls.some((c) => c[0] === 'scroll-to-header')
      expect(scrolled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips the section scroll when the TOC has not been built yet', async () => {
    vi.useFakeTimers()
    try {
      bus.emit.mockClear()
      const promise = editor.OPEN_GUIDE_TAB({
        markdown: GUIDE_MD,
        section: 'connect-agent'
      })
      editor.listToc = [] // muya change event has not landed yet
      await promise
      vi.advanceTimersByTime(300)
      const scrolled = bus.emit.mock.calls.some((c) => c[0] === 'scroll-to-header')
      expect(scrolled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('LISTEN_FOR_OPEN_GUIDE wires the mt::open-guide bus event', async () => {
    editor.LISTEN_FOR_OPEN_GUIDE()
    const handler = getOpenGuideHandler(bus)
    expect(handler).toBeTypeOf('function')

    await handler({ section: 'connect-agent' })
    expect(editor.tabs).toHaveLength(1)
    expect(editor.currentFile.isGuide).toBe(true)
    expect(editor.currentFile.markdown).toContain('# Mark Guide')
    // Locale comes from the i18n instance ('en' in the mock).
    expect(bus.emit).toHaveBeenCalledWith(
      'file-loaded',
      expect.objectContaining({ markdown: expect.stringContaining('# Mark Guide') })
    )
  })

  it('LISTEN_FOR_OPEN_GUIDE tolerates a missing payload', async () => {
    editor.LISTEN_FOR_OPEN_GUIDE()
    const handler = getOpenGuideHandler(bus)
    await handler(undefined)
    expect(editor.currentFile.isGuide).toBe(true)
  })
})
