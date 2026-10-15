// FILE: tests/renderer/components/recent.test.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-46 welcome screen — brand header + tagline, action row with platform shortcut hints, Last session row, recent files/folders with mtime + missing-file drop-off, remove + 5s Undo toast restoring exact order, native context-menu actions, agent-prompt copy, Guide footer and What's-new gating.
//   SCOPE: components/recent/index.vue unit behaviour over mocked stores/IPC; layout-only (no real muya, no real Tauri).
//   DEPENDS: @vue/test-utils, vitest, pinia (unused when stores are mocked).
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-45; .grace/changes/active/C-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   tMock - deterministic i18n double with named-param interpolation for the keys the screen renders.
//   mountRecent - mount the component with fresh mock state and flush the async hydration.
//   hydrateWith - seed recent files/folders/session in one call.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-15 C-46 redesign: rewritten for the approved mockup layout (old pins: welcome-title / action-button order / restore-button / no-recent are gone).
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupTestPinia } from '../pinia'

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
      case 'recent.filesCount':
        return `${params?.count} files`
      case 'recent.removedToast':
        return `Removed "${params?.name}" from Recent`
      case 'agentPrompt.prompt':
        return `PROMPT[${params?.openCommand}]`
      default:
        return key
    }
  })
}))

vi.mock('@/util', () => ({
  hasKeys: vi.fn((o) => o && Object.keys(o).length > 0),
  getUniqueId: vi.fn(() => `uid-${Date.now()}`),
  deepClone: vi.fn((o) => JSON.parse(JSON.stringify(o))),
  isOsx: true,
  isWindows: false,
  isLinux: false,
  animatedScrollTo: vi.fn()
}))

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
  RESTORE_SESSION: vi.fn()
}
vi.mock('@/store/editor', () => ({ useEditorStore: vi.fn(() => __editorStoreMock) }))

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
// maps path → resolved stat or an Error to reject with.
const hydrateWith = async ({ files = [], session = [], folders = [], statByPath = {} } = {}) => {
  __editorStoreMock.GET_RECENT_FILES.mockResolvedValue(files)
  __editorStoreMock.GET_SESSION_PATHS.mockResolvedValue(session)
  __projectStoreMock.GET_RECENT_FOLDERS.mockResolvedValue(folders)
  __ipcFsMock.stat.mockImplementation((p) => {
    const s = statByPath[p]
    if (s instanceof Error) return Promise.reject(s)
    return Promise.resolve(s ?? null)
  })
  return mountRecent()
}
const flushPromises = () => flushAsync(40)

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

    pinia = setupTestPinia()
    window.electron = {
      ipcRenderer: { send: vi.fn(), on: vi.fn(), invoke: vi.fn().mockResolvedValue(null) },
      webFrame: { setZoomFactor: vi.fn() },
      shell: { showItemInFolder: vi.fn() },
      clipboard: { writeText: vi.fn().mockResolvedValue() },
      webUtils: { getPathForFile: vi.fn((f) => `/dropped/${f.name}`) },
      process: { platform: 'darwin', env: { MARKTEXT_VERSION_STRING: '2.3.1-test' } }
    }
    window.marktext = { env: { HOME: '/Users/test' } }
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
    expect(sessionRow.text()).toContain('2 files')
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

  it('shows up to five recent files with folder path and relative time', async () => {
    const stat = { mtimeMs: NOW - 3 * 60 * 1000, size: 1, isFile: true }
    const wrapper = await hydrateWith({
      files: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((n) => `/Users/test/docs/${n}.md`),
      statByPath: Object.fromEntries(
        ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((n) => [`/Users/test/docs/${n}.md`, stat])
      )
    })
    const rows = wrapper.findAll('.recent-list .recent-item')
    // 5 files, no session row.
    expect(rows.length).toBe(5)
    expect(rows[0].find('.row-name').text()).toBe('f1.md')
    expect(rows[0].find('.row-path').text()).toBe('/Users/test/docs')
    expect(rows[0].find('.row-time').text()).toBe('3 min ago')
  })

  it('drops files whose stat reports not-found, but keeps rows on other stat failures', async () => {
    const stat = { mtimeMs: NOW - 30 * 1000, size: 1 }
    const wrapper = await hydrateWith({
      files: ['/keep/gone.md', '/keep/stays.md', '/keep/unknown.md'],
      statByPath: {
        '/keep/gone.md': new Error('MT_FS_NOT_FOUND: os error 2'),
        '/keep/stays.md': stat,
        // Degraded IPC (unknown command) must not wipe the list.
        '/keep/unknown.md': new Error('command mt_fs_stat not found')
      }
    })
    const names = wrapper.findAll('.row-name').map((n) => n.text())
    expect(names).toEqual(['stays.md', 'unknown.md'])
    // The degraded row stays but shows no time.
    const times = wrapper.findAll('.row-time')
    expect(times.length).toBe(1)
    expect(times[0].text()).toBe('just now')
  })

  it('opens a recent file on row click (click and Enter)', async () => {
    const wrapper = await hydrateWith({ files: ['/Users/test/doc.md'] })
    await wrapper.find('.recent-item .row-button').trigger('click')
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
      'mt::open-file', '/Users/test/doc.md', {}
    )
    await wrapper.find('.recent-item .row-button').trigger('keydown', { key: 'Enter' })
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledTimes(2)
  })

  it('opens a recent folder through the project store', async () => {
    const wrapper = await hydrateWith({ folders: ['/Users/test/pebble'] })
    await wrapper.find('.recent-item .row-button').trigger('click')
    expect(__projectStoreMock.OPEN_RECENT_FOLDER).toHaveBeenCalledWith('/Users/test/pebble')
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
    expect(window.electron.clipboard.writeText).toHaveBeenCalledWith('PROMPT[open -a Mark <file>.md]')
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

  it('hides the What’s-new link when the update is older than 7 days', async () => {
    __ipcPrefsMock.get.mockResolvedValue(NOW - 8 * 24 * 60 * 60 * 1000)
    const wrapper = await mountRecent()
    await flushPromises()
    expect(wrapper.findAll('.footer-link').length).toBe(1)
  })

  // ── drop zone ───────────────────────────────────────────────────

  it('shows a text-free drop highlight while dragging and forwards drops through mt::window::drop', async () => {
    const wrapper = await mountRecent()
    expect(wrapper.find('.drop-overlay').exists()).toBe(false)

    await wrapper.find('.welcome-screen').trigger('dragenter', {
      dataTransfer: { types: ['Files'] }
    })
    expect(wrapper.find('.drop-overlay').exists()).toBe(true)
    expect(wrapper.classes()).toContain('drop-active')

    await wrapper.find('.welcome-screen').trigger('dragleave')
    expect(wrapper.find('.drop-overlay').exists()).toBe(false)

    await wrapper.find('.welcome-screen').trigger('dragenter', {
      dataTransfer: { types: ['Files'] }
    })
    await wrapper.find('.welcome-screen').trigger('drop', {
      dataTransfer: { files: [{ name: 'note.md' }] }
    })
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
      'mt::window::drop', ['/dropped/note.md']
    )
    expect(wrapper.find('.drop-overlay').exists()).toBe(false)
  })
})
