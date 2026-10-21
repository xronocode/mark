// FILE: tests/renderer/components/recent.test.js
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-46 welcome screen — brand header + tagline, action row with platform shortcut hints, Last session row, recent files/folders with mtime + missing-file drop-off, remove + 5s Undo toast restoring exact order, native context-menu actions, agent-prompt copy, Guide footer and What's-new gating.
//   SCOPE: components/recent/index.vue unit behaviour over mocked stores/IPC; layout-only (no real muya, no real Tauri).
//   DEPENDS: @vue/test-utils, vitest, pinia (unused when stores are mocked), ipc/contract/types IpcError (real rejection shape).
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-47; .grace/changes/archive/C-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   __i18nState - mutable UI language returned by the mocked getCurrentLanguage.
//   __utilMock - mutable platform flags (isOsx / isWindows / isLinux) for the mocked @/util.
//   __ipcPrefsMock - ipcPrefs double (lastUpdateAt gate).
//   __ipcRecentMock - ipcRecent double (M-017 remove/insert).
//   __ipcFsMock - ipcFs double (stat for mtime + missing-path drop-off).
//   __busMock - bus double; captures the 'mt::native-drag' subscription.
//   __projectStoreMock - project store double (recent folders).
//   __editorStoreMock - editor store double (recent files, session).
//   __recentlyClosedMock - recently-closed store double (FIX-009 recovery block).
//   NOW - pinned clock for relative-time assertions.
//   flushAsync - microtask-only flush that works under fake timers.
//   flushPromises - flushAsync with the default round count.
//   mountRecent - mount the component with fresh mock state and flush the async hydration.
//   hydrateWith - seed recent files/folders/session in one call.
//   notFoundError - IpcError shaped exactly like ipcInvoke's mapping of an MT_FS_NOT_FOUND rejection.
//   nativeDrag - deliver one bridge drag phase through the captured bus handler.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.1.0 - 2026-10-15 C-46 review round 2: folder remove/undo
//     against 5 stored folders (full list persisted + restored); missing-file
//     drop-off with the real IpcError rejection (cause.code); drop highlight
//     via the bridge's 'mt::native-drag' bus event (dead mt::window::drop
//     path removed); Windows path rows; "1 file" / Russian plural
//     categories; keyboard context menu anchored at the row; Linux "Show in
//     folder"; Undo after a null-index remove inserts nothing.
//   v2.0.0 - 2026-10-15 C-46 redesign: rewritten for the approved mockup layout (old pins: welcome-title / action-button order / restore-button / no-recent are gone).
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupTestPinia } from '../pinia'
import { IpcError } from '@/ipc/contract/types'

const __i18nState = { lang: 'en' }

vi.mock('@/i18n', () => ({
  t: vi.fn((key, params) => {
    switch (key) {
      case 'recent.time.justNow':
        return 'just now'
      case 'recent.time.minutesAgo':
        return `${params?.count} min ago`
      case 'recent.time.todayAt':
        return `today ${params?.time}`
      case 'recent.time.yesterday':
        return 'yesterday'
      case 'recent.time.daysAgo':
        return `${params?.count} days ago`
      case 'recent.filesCount.one':
        return __i18nState.lang === 'ru' ? `${params?.count} файл` : `${params?.count} file`
      case 'recent.filesCount.few':
        return __i18nState.lang === 'ru' ? `${params?.count} файла` : key
      case 'recent.filesCount.many':
        return __i18nState.lang === 'ru' ? `${params?.count} файлов` : key
      case 'recent.filesCount.other':
        return __i18nState.lang === 'ru' ? `${params?.count} файла` : `${params?.count} files`
      case 'recent.lastSessionWithCount':
        return __i18nState.lang === 'ru'
          ? `Последняя сессия (${params?.count})`
          : `Last session (${params?.count})`
      case 'recent.removedToast':
        return `Removed "${params?.name}" from Recent`
      case 'recent.recentlyClosed.title':
        return 'Recently closed'
      case 'recent.recentlyClosed.reopenClosedTab':
        return 'Reopen closed tab'
      case 'recent.recentlyClosed.reopenAll':
        return `Reopen all ${params?.count}`
      case 'recent.recentlyClosed.clear':
        return 'Clear'
      case 'recent.recentlyClosed.buttonLabel':
        return `Reopen closed tabs (${params?.count})`
      case 'guide.agentPrompt.mac':
        return 'PROMPT[mac]'
      case 'guide.agentPrompt.generic':
        return 'PROMPT[generic]'
      default:
        return key
    }
  }),
  getCurrentLanguage: vi.fn(() => __i18nState.lang)
}))

vi.mock('@/whatsNew/gate', () => ({
  LAST_UPDATE_AT_KEY: 'lastUpdateAt',
  getRunningVersion: vi.fn(() => '2.3.1')
}))

const __utilMock = {
  hasKeys: vi.fn((o) => o && Object.keys(o).length > 0),
  getUniqueId: vi.fn(() => `uid-${Date.now()}`),
  deepClone: vi.fn((o) => JSON.parse(JSON.stringify(o))),
  isOsx: true,
  isWindows: false,
  isLinux: false,
  animatedScrollTo: vi.fn()
}
vi.mock('@/util', () => __utilMock)

const __ipcPrefsMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue() }
const __ipcRecentMock = {
  add: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
  clear: vi.fn(),
  remove: vi.fn().mockResolvedValue(0),
  insert: vi.fn().mockResolvedValue()
}
const __ipcFsMock = {
  read: vi.fn(),
  write: vi.fn(),
  stat: vi.fn().mockResolvedValue(null),
  readdir: vi.fn(),
  unlink: vi.fn()
}

vi.mock('@/ipc/runtime', () => ({
  ipcFs: __ipcFsMock,
  ipcWatch: {},
  ipcSearch: {},
  ipcPrefs: __ipcPrefsMock,
  ipcWorkspace: {},
  ipcFonts: {},
  ipcRecent: __ipcRecentMock,
  ipcShortcut: {},
  ipcSpell: {},
  ipcMenu: {},
  ipcPandoc: {},
  ipcUpdater: {},
  ipcScreenshot: {},
  ipcSecret: {},
  ipc: { fs: { read: vi.fn() } }
}))

const __busMock = { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
vi.mock('@/bus', () => ({ default: __busMock }))

const __projectStoreMock = {
  ASK_FOR_OPEN_PROJECT: vi.fn(),
  OPEN_RECENT_FOLDER: vi.fn(),
  GET_RECENT_FOLDERS: vi.fn().mockResolvedValue([]),
  SET_RECENT_FOLDERS: vi.fn(async (list) => list),
  projectTrees: []
}
vi.mock('@/store/project', () => ({ useProjectStore: vi.fn(() => __projectStoreMock) }))

const __editorStoreMock = {
  GET_RECENT_FILES: vi.fn().mockResolvedValue([]),
  GET_SESSION_PATHS: vi.fn().mockResolvedValue([]),
  NEW_UNTITLED_TAB: vi.fn(),
  RESTORE_SESSION: vi.fn(),
  // C-FIX-009-SESSION-COLD-START: the row now reads the store's
  // boot-time offer snapshot instead of the live autosaved preference.
  tabs: [],
  coldStartSession: null
}
vi.mock('@/store/editor', () => ({ useEditorStore: vi.fn(() => __editorStoreMock) }))

// C-FIX-009-RECENTLY-CLOSED: the welcome recovery block reads the
// session-scoped store; a plain resettable stand-in keeps the component
// test free of a pinia instance (each case re-mounts, so cross-test
// reactivity is not needed).
const __recentlyClosedMock = {
  entries: [],
  count: 0,
  isEmpty: true,
  newest: null,
  REOPEN_NEWEST: vi.fn(async () => true),
  REOPEN_ONE: vi.fn(async () => true),
  REOPEN_ALL: vi.fn(async () => ({ reopened: 0, missing: 0 })),
  CLEAR: vi.fn()
}
vi.mock('@/store/recentlyClosed', () => ({
  useRecentlyClosedStore: vi.fn(() => __recentlyClosedMock),
  RECENTLY_CLOSED_MAX: 25
}))

// Deterministic "now" so relative-time assertions never flake around
// minute/day boundaries.
const NOW = new Date('2026-10-15T12:00:00').getTime()

// Microtask-only flush. The suite fakes setTimeout (toast expiry), and
// @vue/test-utils' flushPromises schedules a real setTimeout(0) which
// would never fire under fake timers — so drain the promise chains by
// awaiting resolved promises instead.
const flushAsync = async (rounds = 40) => {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}

const mountRecent = async () => {
  const Recent = (await import('@/components/recent/index.vue')).default
  const wrapper = shallowMount(Recent)
  await flushAsync()
  await wrapper.vm.$nextTick()
  return wrapper
}

// Seed the three async sources the screen hydrates from. `statByPath`
// maps path → resolved stat or an Error to reject with. `session` seeds
// the boot-time cold-start offer (C-FIX-009: it is the editor store's
// snapshot, not the autosaved preference).
const hydrateWith = async ({ files = [], session = [], folders = [], statByPath = {} } = {}) => {
  __editorStoreMock.GET_RECENT_FILES.mockResolvedValue(files)
  __editorStoreMock.GET_SESSION_PATHS.mockResolvedValue(session)
  __editorStoreMock.coldStartSession = session.length ? { tabs: session } : null
  __editorStoreMock.RESTORE_SESSION.mockResolvedValue({
    folders: 0,
    tabs: session.length,
    skipped: 0
  })
  __projectStoreMock.GET_RECENT_FOLDERS.mockResolvedValue(folders)
  __ipcFsMock.stat.mockImplementation((p) => {
    const s = statByPath[p]
    if (s instanceof Error) return Promise.reject(s)
    return Promise.resolve(s ?? null)
  })
  return mountRecent()
}
const flushPromises = () => flushAsync(40)

// What ipcInvoke actually throws for a backend Err(MtFsError): an
// IpcError whose message is String(raw) = "[object Object]" and whose
// cause is the structured { code, message } (contract/invoke.ts
// mapInvokeError). Matching e.message alone can never see the code.
const notFoundError = () => {
  const raw = { code: 'MT_FS_NOT_FOUND', message: 'not found' }
  return new IpcError('UNKNOWN_COMMAND', String(raw), 'mt_fs_stat', raw)
}

// The welcome screen subscribes to the bridge's bus event at setup.
const nativeDrag = async (wrapper, payload) => {
  const call = [...__busMock.on.mock.calls].reverse().find(([name]) => name === 'mt::native-drag')
  expect(call).toBeTruthy()
  call[1](payload)
  await wrapper.vm.$nextTick()
}

describe('recent/index.vue welcome screen (C-46)', () => {
  let pinia

  beforeEach(() => {
    // Only timers are faked (toast expiry); Date.now is pinned via spy so
    // relative-time assertions are stable. The global setup's
    // resetAllMocks clears mock implementations after every test, so the
    // defaults are re-seeded here for every case.
    vi.useFakeTimers({ now: NOW, toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    __editorStoreMock.GET_RECENT_FILES.mockResolvedValue([])
    __editorStoreMock.GET_SESSION_PATHS.mockResolvedValue([])
    __editorStoreMock.tabs = []
    __editorStoreMock.coldStartSession = null
    __editorStoreMock.RESTORE_SESSION.mockResolvedValue({ folders: 0, tabs: 0, skipped: 0 })
    __editorStoreMock.NEW_UNTITLED_TAB.mockClear()
    __editorStoreMock.RESTORE_SESSION.mockClear()
    __projectStoreMock.GET_RECENT_FOLDERS.mockResolvedValue([])
    __projectStoreMock.SET_RECENT_FOLDERS.mockClear()
    __projectStoreMock.SET_RECENT_FOLDERS.mockImplementation(async (list) => list)
    __projectStoreMock.ASK_FOR_OPEN_PROJECT.mockClear()
    __projectStoreMock.OPEN_RECENT_FOLDER.mockClear()
    __ipcRecentMock.remove.mockResolvedValue(0)
    __ipcRecentMock.insert.mockResolvedValue()
    __ipcRecentMock.remove.mockClear()
    __ipcRecentMock.insert.mockClear()
    __ipcPrefsMock.get.mockResolvedValue(null)
    __ipcFsMock.stat.mockResolvedValue(null)
    __busMock.emit.mockClear()
    __busMock.on.mockClear()
    __busMock.off.mockClear()
    __i18nState.lang = 'en'
    __utilMock.isOsx = true
    __utilMock.isWindows = false
    __utilMock.isLinux = false

    pinia = setupTestPinia()
    window.electron = {
      ipcRenderer: { send: vi.fn(), on: vi.fn(), invoke: vi.fn().mockResolvedValue(null) },
      webFrame: { setZoomFactor: vi.fn() },
      shell: { showItemInFolder: vi.fn() },
      clipboard: { writeText: vi.fn().mockResolvedValue() },
      webUtils: { getPathForFile: vi.fn((f) => `/dropped/${f.name}`) },
      process: { platform: 'darwin', env: { MARKTEXT_VERSION_STRING: '2.3.1-test' } }
    }
    window.marktext = { env: { HOME: "/Users/<fixture>" } }
    window.path = {
      basename: (p) => p.split('/').pop(),
      dirname: (p) => p.substring(0, p.lastIndexOf('/')) || '/',
      join: (...args) => args.join('/'),
      resolve: (...args) => args.join('/'),
      sep: '/'
    }
    window.DIRNAME = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ── header / actions ────────────────────────────────────────────

  it('mounts with the brand header, highlighted tagline and three action buttons', async () => {
    const wrapper = await mountRecent()
    expect(wrapper.find('.welcome-screen').exists()).toBe(true)
    expect(wrapper.find('.brand').exists()).toBe(true)
    expect(wrapper.find('.brand-icon').attributes('src')).toBeTruthy()
    expect(wrapper.find('.brand-name').text()).toBe('Mark')

    const tagline = wrapper.find('.tagline')
    expect(tagline.text()).toContain('recent.taglineLead')
    expect(tagline.find('.tagline-highlight').text()).toBe('recent.taglineHighlight')

    // Order per the approved mockup: Open File (primary), Open Folder
    // (secondary), New (ghost) — with macOS glyphs (isOsx mocked true).
    const buttons = wrapper.findAll('.action-button')
    expect(buttons.length).toBe(3)
    expect(buttons[0].classes()).toContain('primary')
    expect(buttons[0].text()).toContain('recent.openFile')
    expect(buttons[0].find('.action-kbd').text()).toBe('⌘O')
    expect(buttons[1].classes()).toContain('secondary')
    expect(buttons[1].find('.action-kbd').text()).toBe('⇧⌘O')
    expect(buttons[2].classes()).toContain('ghost')
    expect(buttons[2].find('.action-kbd').text()).toBe('⌘N')
  })

  it('wires the three actions to the existing open/new flows', async () => {
    const wrapper = await mountRecent()
    await wrapper.findAll('.action-button')[0].trigger('click')
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::cmd-open-file')

    await wrapper.findAll('.action-button')[1].trigger('click')
    expect(__projectStoreMock.ASK_FOR_OPEN_PROJECT).toHaveBeenCalledTimes(1)

    await wrapper.findAll('.action-button')[2].trigger('click')
    expect(__editorStoreMock.NEW_UNTITLED_TAB).toHaveBeenCalledWith({})
  })

  // ── recent files / session / folders ────────────────────────────

  it('shows the empty state when no recents and no session exist', async () => {
    const wrapper = await mountRecent()
    expect(wrapper.find('.no-recent').exists()).toBe(true)
    expect(wrapper.find('.row-session').exists()).toBe(false)
    expect(wrapper.findAll('.recent-item').length).toBe(0)
    // Folder section is hidden entirely when empty.
    expect(wrapper.findAll('.section-title').length).toBe(1)
  })

  it('shows the session row only when a previous session exists and restores it on click', async () => {
    const wrapper = await hydrateWith({ session: ['/tmp/a.md', '/tmp/b.md'] })
    const sessionRow = wrapper.find('.row-session')
    expect(sessionRow.exists()).toBe(true)
    expect(sessionRow.find('.row-name').text()).toBe('Last session (2)')
    expect(sessionRow.find('.row-path').text()).toBe('a.md, b.md')
    await sessionRow.trigger('click')
    expect(__editorStoreMock.RESTORE_SESSION).toHaveBeenCalledTimes(1)
  })

  it('caps the session summary at three names with an ellipsis', async () => {
    const wrapper = await hydrateWith({
      session: ['/tmp/a.md', '/tmp/b.md', '/tmp/c.md', '/tmp/d.md']
    })
    expect(wrapper.find('.row-session .row-path').text()).toBe('a.md, b.md, c.md, …')
  })

  it('renders the tab count in the row title for a one-file session', async () => {
    const wrapper = await hydrateWith({ session: ['/tmp/only.md'] })
    expect(wrapper.find('.row-session .row-name').text()).toBe('Last session (1)')
    expect(wrapper.find('.row-session .row-time').exists()).toBe(false)
  })

  it('renders the count inside the Russian row title for any plural category', async () => {
    __i18nState.lang = 'ru'
    let wrapper = await hydrateWith({ session: ['/a.md', '/b.md', '/c.md'] })
    expect(wrapper.find('.row-session .row-name').text()).toBe('Последняя сессия (3)')
    wrapper.unmount()
    wrapper = await hydrateWith({
      session: ['/1.md', '/2.md', '/3.md', '/4.md', '/5.md']
    })
    expect(wrapper.find('.row-session .row-name').text()).toBe('Последняя сессия (5)')
  })

  it('splits Windows paths on backslashes for the name and parent folder', async () => {
    const wrapper = await hydrateWith({
      files: ['C:\\Users\\x\\doc.md'],
      folders: ['C:\\Users\\x\\notes'],
      session: ['C:\\Users\\x\\a.md']
    })
    const fileRow = wrapper.findAll('.recent-list')[0].findAll('.recent-item')[1]
    expect(fileRow.find('.row-name').text()).toBe('doc.md')
    expect(fileRow.find('.row-path').text()).toBe('C:\\Users\\x')
    const folderRow = wrapper.findAll('.recent-list')[1].find('.recent-item')
    expect(folderRow.find('.row-name').text()).toBe('notes')
    expect(wrapper.find('.row-session .row-path').text()).toBe('a.md')
  })

  it('shows up to five recent files with folder path and relative time', async () => {
    const stat = { mtimeMs: NOW - 3 * 60 * 1000, size: 1, isFile: true }
    const wrapper = await hydrateWith({
      files: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((n) => `/Users/<fixture>/docs/${n}.md`),
      statByPath: Object.fromEntries(
        ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((n) => [`/Users/<fixture>/docs/${n}.md`, stat])
      )
    })
    const rows = wrapper.findAll('.recent-list .recent-item')
    // 5 files, no session row.
    expect(rows.length).toBe(5)
    expect(rows[0].find('.row-name').text()).toBe('f1.md')
    expect(rows[0].find('.row-path').text()).toBe('/Users/<fixture>/docs')
    expect(rows[0].find('.row-time').text()).toBe('3 min ago')
  })

  it('drops files whose stat reports not-found, but keeps rows on other stat failures', async () => {
    const stat = { mtimeMs: NOW - 30 * 1000, size: 1 }
    const wrapper = await hydrateWith({
      files: ['/keep/gone.md', '/keep/stays.md', '/keep/legacy.md', '/keep/unknown.md'],
      statByPath: {
        '/keep/gone.md': notFoundError(),
        // Plain string-message rejection still recognised (fallback).
        '/keep/legacy.md': new Error('No such file or directory (os error 2)'),
        '/keep/stays.md': stat,
        // Degraded IPC (unknown command) must not wipe the list.
        '/keep/unknown.md': new Error('command mt_fs_stat not found')
      }
    })
    const names = wrapper.findAll('.row-name').map((n) => n.text())
    expect(names).toEqual(['stays.md', 'unknown.md'])
    expect(names).not.toContain('legacy.md')
    // The degraded row stays but shows no time.
    const times = wrapper.findAll('.row-time')
    expect(times.length).toBe(1)
    expect(times[0].text()).toBe('just now')
  })

  it('opens a recent file on row click (click and Enter)', async () => {
    const wrapper = await hydrateWith({ files: ['/Users/<fixture>/doc.md'] })
    await wrapper.find('.recent-item .row-button').trigger('click')
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
      'mt::open-file', '/Users/<fixture>/doc.md', {}
    )
    await wrapper.find('.recent-item .row-button').trigger('keydown', { key: 'Enter' })
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledTimes(2)
  })

  it('opens a recent folder through the project store', async () => {
    const wrapper = await hydrateWith({ folders: ['/Users/<fixture>/pebble'] })
    await wrapper.find('.recent-item .row-button').trigger('click')
    expect(__projectStoreMock.OPEN_RECENT_FOLDER).toHaveBeenCalledWith('/Users/<fixture>/pebble')
  })

  // ── remove + undo ───────────────────────────────────────────────

  it('removes a file, shows the 5s undo toast and restores the exact order on Undo', async () => {
    const stat = { mtimeMs: NOW, size: 1 }
    const paths = ['/p/a.md', '/p/b.md', '/p/c.md']
    const wrapper = await hydrateWith({
      files: paths,
      statByPath: Object.fromEntries(paths.map((p) => [p, stat]))
    })
    __ipcRecentMock.remove.mockResolvedValueOnce(1)

    await wrapper.findAll('.row-remove')[1].trigger('click')
    await flushPromises()

    expect(__ipcRecentMock.remove).toHaveBeenCalledWith('/p/b.md')
    expect(wrapper.findAll('.row-name').map((n) => n.text())).toEqual(['a.md', 'c.md'])
    const toast = wrapper.find('.undo-toast')
    expect(toast.exists()).toBe(true)
    expect(toast.text()).toContain('Removed "b.md" from Recent')

    await wrapper.find('.toast-undo').trigger('click')
    await flushPromises()
    expect(__ipcRecentMock.insert).toHaveBeenCalledWith('/p/b.md', 1)
    // Exact order restored — b back in the middle, not at the head.
    expect(wrapper.findAll('.row-name').map((n) => n.text())).toEqual(['a.md', 'b.md', 'c.md'])
    expect(wrapper.find('.undo-toast').exists()).toBe(false)
  })

  it('auto-dismisses the toast after five seconds', async () => {
    const wrapper = await hydrateWith({ files: ['/p/a.md'] })
    await wrapper.find('.row-remove').trigger('click')
    await flushPromises()
    expect(wrapper.find('.undo-toast').exists()).toBe(true)

    vi.advanceTimersByTime(4999)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.undo-toast').exists()).toBe(true)
    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.undo-toast').exists()).toBe(false)
  })

  it('removes and undoes a recent folder through SET_RECENT_FOLDERS with exact order', async () => {
    const wrapper = await hydrateWith({
      folders: ['/p/one', '/p/two', '/p/three']
    })
    await wrapper.findAll('.row-remove')[1].trigger('click')
    await flushPromises()

    expect(__projectStoreMock.SET_RECENT_FOLDERS).toHaveBeenCalledWith(['/p/one', '/p/three'])
    expect(wrapper.findAll('.row-name').map((n) => n.text())).toEqual(['one', 'three'])

    await wrapper.find('.toast-undo').trigger('click')
    await flushPromises()
    expect(__projectStoreMock.SET_RECENT_FOLDERS).toHaveBeenLastCalledWith([
      '/p/one', '/p/two', '/p/three'
    ])
    expect(wrapper.findAll('.row-name').map((n) => n.text())).toEqual(['one', 'two', 'three'])
  })

  it('removes a folder from the FULL stored list (5 kept, 3 shown) and Undo restores all five', async () => {
    const stored = ['/p/one', '/p/gone', '/p/two', '/p/three', '/p/four']
    const wrapper = await hydrateWith({
      folders: stored,
      // '/p/gone' is missing on disk → hidden, but must stay stored.
      statByPath: { '/p/gone': notFoundError() }
    })
    // Three live rows shown; the missing one and the 5th stay hidden.
    const folderNames = () =>
      wrapper.findAll('.recent-list')[1].findAll('.row-name').map((n) => n.text())
    expect(folderNames()).toEqual(['one', 'two', 'three'])
    __projectStoreMock.GET_RECENT_FOLDERS.mockResolvedValue([...stored])

    await wrapper.findAll('.recent-list')[1].findAll('.row-remove')[1].trigger('click')
    await flushPromises()
    expect(__projectStoreMock.SET_RECENT_FOLDERS).toHaveBeenCalledTimes(1)
    expect(__projectStoreMock.SET_RECENT_FOLDERS).toHaveBeenLastCalledWith([
      '/p/one', '/p/gone', '/p/three', '/p/four'
    ])
    expect(folderNames()).toEqual(['one', 'three'])

    await wrapper.find('.toast-undo').trigger('click')
    await flushPromises()
    expect(__projectStoreMock.SET_RECENT_FOLDERS).toHaveBeenLastCalledWith(stored)
    expect(folderNames()).toEqual(['one', 'two', 'three'])
  })

  it('Undo after a remove that M-017 did not have (null index) inserts nothing', async () => {
    const wrapper = await hydrateWith({ files: ['/p/a.md', '/p/b.md'] })
    __ipcRecentMock.remove.mockResolvedValueOnce(null)
    await wrapper.findAll('.row-remove')[1].trigger('click')
    await flushPromises()
    await wrapper.find('.toast-undo').trigger('click')
    await flushPromises()
    expect(__ipcRecentMock.insert).not.toHaveBeenCalled()
    // The visible row comes back (it was on screen), storage untouched.
    expect(wrapper.findAll('.row-name').map((n) => n.text())).toEqual(['a.md', 'b.md'])
  })

  // ── context menu ────────────────────────────────────────────────

  it('opens the native context menu and acts on the clicked id', async () => {
    const wrapper = await hydrateWith({ files: ['/p/doc.md'] })
    const invoke = window.electron.ipcRenderer.invoke

    invoke.mockResolvedValueOnce('copyPath')
    await wrapper.find('.recent-item').trigger('contextmenu', { clientX: 10, clientY: 10 })
    await flushPromises()
    expect(invoke).toHaveBeenCalledWith(
      'mt::window-popup-context-menu',
      expect.objectContaining({ x: 10, y: 10 })
    )
    const items = invoke.mock.calls[0][1].items
    expect(items.map((i) => i.id || 'separator')).toEqual([
      'open', 'showInFolder', 'copyPath', 'separator', 'removeFromList'
    ])
    // macOS labelling (isWindows mocked false).
    expect(items[1].label).toBe('recent.showInFinder')
    expect(window.electron.clipboard.writeText).toHaveBeenCalledWith('/p/doc.md')

    invoke.mockResolvedValueOnce('showInFolder')
    await wrapper.find('.recent-item').trigger('contextmenu', { clientX: 0, clientY: 0 })
    await flushPromises()
    expect(window.electron.shell.showItemInFolder).toHaveBeenCalledWith('/p/doc.md')

    invoke.mockResolvedValueOnce('removeFromList')
    await wrapper.find('.recent-item').trigger('contextmenu', { clientX: 0, clientY: 0 })
    await flushPromises()
    expect(wrapper.find('.no-recent').exists()).toBe(true)
  })

  it('anchors a keyboard-opened context menu (clientX/Y = 0) at the row', async () => {
    const wrapper = await hydrateWith({ files: ['/p/doc.md'] })
    const item = wrapper.find('.recent-item')
    item.element.getBoundingClientRect = () => ({
      left: 40, top: 100, right: 400, bottom: 136, width: 360, height: 36, x: 40, y: 100
    })
    await item.trigger('contextmenu', { clientX: 0, clientY: 0 })
    await flushPromises()
    expect(window.electron.ipcRenderer.invoke).toHaveBeenLastCalledWith(
      'mt::window-popup-context-menu',
      expect.objectContaining({ x: 52, y: 136 })
    )
  })

  it('labels the reveal item per platform: Explorer on Windows, neutral folder on Linux', async () => {
    __utilMock.isOsx = false
    __utilMock.isWindows = true
    let wrapper = await hydrateWith({ files: ['/p/doc.md'] })
    const invoke = window.electron.ipcRenderer.invoke
    await wrapper.find('.recent-item').trigger('contextmenu', { clientX: 5, clientY: 5 })
    await flushPromises()
    expect(invoke.mock.calls.at(-1)[1].items[1].label).toBe('recent.showInExplorer')
    wrapper.unmount()

    __utilMock.isWindows = false
    __utilMock.isLinux = true
    wrapper = await hydrateWith({ files: ['/p/doc.md'] })
    await wrapper.find('.recent-item').trigger('contextmenu', { clientX: 5, clientY: 5 })
    await flushPromises()
    expect(invoke.mock.calls.at(-1)[1].items[1].label).toBe('recent.showInFolder')
  })

  it('opens a recent file via the context menu Open item', async () => {
    const wrapper = await hydrateWith({ files: ['/p/doc.md'] })
    window.electron.ipcRenderer.invoke.mockResolvedValueOnce('open')
    await wrapper.find('.recent-item').trigger('contextmenu', { clientX: 0, clientY: 0 })
    await flushPromises()
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::open-file', '/p/doc.md', {})
  })

  // ── connect your agent + footer ─────────────────────────────────

  it('copies the universal agent prompt from the C-40 module', async () => {
    const wrapper = await mountRecent()
    await wrapper.find('.chip-button.accent').trigger('click')
    await flushPromises()
    expect(window.electron.clipboard.writeText).toHaveBeenCalledWith('PROMPT[mac]')
  })

  it('emits mt::open-guide with the connect-agent section and for the Guide link', async () => {
    const wrapper = await mountRecent()
    await wrapper.find('.chip-button:not(.accent)').trigger('click')
    expect(__busMock.emit).toHaveBeenCalledWith('mt::open-guide', { section: 'connect-agent' })

    await wrapper.find('.footer-link').trigger('click')
    expect(__busMock.emit).toHaveBeenCalledWith('mt::open-guide', {})
  })

  it('hides the What’s-new link when no lastUpdateAt preference exists', async () => {
    __ipcPrefsMock.get.mockResolvedValue(null)
    const wrapper = await mountRecent()
    await flushPromises()
    expect(wrapper.findAll('.footer-link').length).toBe(1)
  })

  it('shows the What’s-new link only within 7 days of lastUpdateAt', async () => {
    __ipcPrefsMock.get.mockResolvedValue(NOW - 2 * 24 * 60 * 60 * 1000)
    const wrapper = await mountRecent()
    await flushPromises()
    const links = wrapper.findAll('.footer-link')
    expect(links.length).toBe(2)
    expect(links[1].text()).toBe('recent.whatsNewIn')
  })

  it('reads the ISO lastUpdateAt written by the C-48 gate and opens the What’s New sheet', async () => {
    __ipcPrefsMock.get.mockResolvedValue(new Date(NOW - 24 * 60 * 60 * 1000).toISOString())
    const wrapper = await mountRecent()
    await flushPromises()
    const links = wrapper.findAll('.footer-link')
    expect(links.length).toBe(2)
    await links[1].trigger('click')
    expect(__busMock.emit).toHaveBeenCalledWith('whatsNewDialog')
    expect(__busMock.emit).not.toHaveBeenCalledWith('mt::open-guide', { section: 'whats-new' })
  })

  it('hides the What’s-new link when the update is older than 7 days', async () => {
    __ipcPrefsMock.get.mockResolvedValue(NOW - 8 * 24 * 60 * 60 * 1000)
    const wrapper = await mountRecent()
    await flushPromises()
    expect(wrapper.findAll('.footer-link').length).toBe(1)
  })

  // ── drop zone ───────────────────────────────────────────────────

  it('drives the text-free drop highlight from the native drag bridge (mt::native-drag)', async () => {
    const wrapper = await mountRecent()
    expect(wrapper.find('.drop-overlay').exists()).toBe(false)

    await nativeDrag(wrapper, { type: 'enter', paths: ['/x/note.md'] })
    expect(wrapper.find('.drop-overlay').exists()).toBe(true)
    expect(wrapper.classes()).toContain('drop-active')

    // 'over' carries no paths and must not flicker the highlight.
    await nativeDrag(wrapper, { type: 'over', paths: [] })
    expect(wrapper.find('.drop-overlay').exists()).toBe(true)

    await nativeDrag(wrapper, { type: 'leave', paths: [] })
    expect(wrapper.find('.drop-overlay').exists()).toBe(false)

    await nativeDrag(wrapper, { type: 'enter', paths: ['/x/note.md'] })
    await nativeDrag(wrapper, { type: 'drop', paths: ['/x/note.md'] })
    expect(wrapper.find('.drop-overlay').exists()).toBe(false)
    // Opening is the bridge's job — the screen sends nothing itself.
    expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
      'mt::window::drop', expect.anything()
    )

    // An enter without paths (e.g. a text drag) does not light up.
    await nativeDrag(wrapper, { type: 'enter', paths: [] })
    expect(wrapper.find('.drop-overlay').exists()).toBe(false)
  })

  it('ignores HTML5 drag events (no OS path in a Tauri webview) and unsubscribes on unmount', async () => {
    const wrapper = await mountRecent()
    await wrapper.find('.welcome-screen').trigger('dragenter', {
      dataTransfer: { types: ['Files'] }
    })
    expect(wrapper.find('.drop-overlay').exists()).toBe(false)
    const handler = __busMock.on.mock.calls.find(([n]) => n === 'mt::native-drag')[1]
    wrapper.unmount()
    expect(__busMock.off).toHaveBeenCalledWith('mt::native-drag', handler)
  })
})

describe('recent/index.vue — FIX-009 current-run recovery block', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    __recentlyClosedMock.entries = []
    __recentlyClosedMock.count = 0
    __recentlyClosedMock.isEmpty = true
    __recentlyClosedMock.newest = null
    __recentlyClosedMock.REOPEN_NEWEST.mockClear()
    __recentlyClosedMock.REOPEN_ONE.mockClear()
    __recentlyClosedMock.REOPEN_ALL.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const seedClosed = (paths) => {
    __recentlyClosedMock.entries = paths.map((pathname, i) => ({
      pathname,
      filename: pathname.split('/').pop(),
      stripIndex: i,
      wasActive: i === 0,
      root: '',
      closedAt: NOW
    }))
    __recentlyClosedMock.count = paths.length
    __recentlyClosedMock.isEmpty = paths.length === 0
    __recentlyClosedMock.newest = __recentlyClosedMock.entries[0] || null
  }

  const mountRecovery = async (paths, { tabs = [] } = {}) => {
    seedClosed(paths)
    __editorStoreMock.tabs = tabs
    return mountRecent()
  }

  it('shows the recovery block when this run closed its last tab', async () => {
    const wrapper = await mountRecovery(['/tmp/a.md', '/tmp/b.md'])
    const block = wrapper.findAll('.welcome-section').find((s) => s.text().includes('Recently closed'))
    expect(block).toBeTruthy()
    expect(block.text()).toContain('Reopen closed tab')
    // Newest leads; one older entry follows.
    expect(block.findAll('.recent-item').length).toBe(2)
  })

  it('hides the block while tabs remain open or the history is empty', async () => {
    let wrapper = await mountRecovery(['/tmp/a.md'], { tabs: [{ id: 't1' }] })
    expect(wrapper.text()).not.toContain('Recently closed')
    wrapper.unmount()
    wrapper = await mountRecovery([])
    expect(wrapper.text()).not.toContain('Recently closed')
  })

  it('the primary action reopens the newest entry; rows reopen their own', async () => {
    const wrapper = await mountRecovery(['/tmp/a.md', '/tmp/b.md'])
    const block = wrapper.findAll('.welcome-section').find((s) => s.text().includes('Recently closed'))
    await block.findAll('.recent-item')[0].find('.row-button').trigger('click')
    expect(__recentlyClosedMock.REOPEN_NEWEST).toHaveBeenCalledTimes(1)
    await block.findAll('.recent-item')[1].find('.row-button').trigger('click')
    expect(__recentlyClosedMock.REOPEN_ONE).toHaveBeenCalledTimes(1)
    expect(__recentlyClosedMock.REOPEN_ONE.mock.calls[0][0].pathname).toBe('/tmp/b.md')
  })

  it('offers Reopen all only when more than one entry remains', async () => {
    let wrapper = await mountRecovery(['/tmp/a.md'])
    expect(wrapper.find('.reopen-all-chip').exists()).toBe(false)
    wrapper.unmount()
    wrapper = await mountRecovery(['/tmp/a.md', '/tmp/b.md'])
    const chip = wrapper.find('.reopen-all-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('2')
    await chip.trigger('click')
    expect(__recentlyClosedMock.REOPEN_ALL).toHaveBeenCalledTimes(1)
  })

  it('a mid-run empty session never conjures the stale Last session row', async () => {
    // The live autosave emptied the preference (GET_SESSION_PATHS is
    // seeded with [] by the shared beforeEach); with the preference ON
    // there is no cold-start offer, so no row may render even though a
    // closing run just happened.
    __editorStoreMock.coldStartSession = null
    const wrapper = await mountRecovery(['/tmp/a.md'])
    expect(wrapper.find('.row-session').exists()).toBe(false)
  })
})
