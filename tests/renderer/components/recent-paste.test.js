// FILE: tests/renderer/components/recent-paste.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-52 R-2 pins for the welcome screen's plain ⌘V/Ctrl+V —
//            it opens the clipboard through util/clipboardOpen while
//            mounted, ignores ⌥⌘V (the File-menu accelerator), other
//            keys, and targets inside text controls/contenteditable
//            (the document editor's paste stays untouched, D-3), and
//            removes the listener on unmount.
//   SCOPE: keydown wiring only; resolver routing is pinned in
//          tests/renderer/util/clipboard-open.test.js.
//   DEPENDS: @vue/test-utils, vitest, pinia, mocked stores/IPC/i18n
//            harness (mirrors tests/renderer/components/recent.test.js).
//   LINKS: .grace/changes/archive/C-52/spec.xml R-2;
//          .grace/verification/runtime.xml V-M-011 scenario-62.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   __i18nState - mutable language holder behind the @/i18n mock.
//   __utilMock - @/util double (isOsx pinned true for the shortcut glyphs).
//   __ipcPrefsMock - ipcPrefs double (whats-new gate reads null).
//   __ipcRecentMock - ipcRecent double (empty list, remove/insert spied).
//   __ipcFsMock - ipcFs double (stat resolves null).
//   __busMock - bus double (drag/guide emits spied).
//   __projectStoreMock - project store double (recent folders empty).
//   __editorStoreMock - editor store double (no recents, no session).
//   openFromClipboardMock - util/clipboardOpen double invoked by the handler.
//   flushAsync - drain the dynamic-import/hydration microtask chain.
//   mountRecent - shallow-mount the welcome screen and flush hydration.
//   fireKeyDown - dispatch a KeyboardEvent on a target and report preventDefault.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 C-52 T-001: initial pins.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupTestPinia } from '../pinia'

const __i18nState = { lang: 'en' }
vi.mock('@/i18n', () => ({
  t: vi.fn((key, params) => {
    if (key === 'recent.filesCount.other') return `${params?.count} files`
    if (key === 'recent.removedToast') return `Removed "${params?.name}" from Recent`
    return key
  }),
  getCurrentLanguage: vi.fn(() => __i18nState.lang)
}))

vi.mock('@/whatsNew/gate', () => ({
  LAST_UPDATE_AT_KEY: 'lastUpdateAt',
  getRunningVersion: vi.fn(() => '2.3.1')
}))

const __utilMock = {
  hasKeys: vi.fn((o) => o && Object.keys(o).length > 0),
  getUniqueId: vi.fn(() => 'uid-1'),
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
  RESTORE_SESSION: vi.fn()
}
vi.mock('@/store/editor', () => ({ useEditorStore: vi.fn(() => __editorStoreMock) }))

// C-52: the component's ⌘V handler dynamic-imports this module.
const openFromClipboardMock = vi.fn(async () => undefined)
vi.mock('@/util/clipboardOpen', () => ({
  openFromClipboard: (...args) => openFromClipboardMock(...args)
}))

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

// Dispatch a keydown on `target` (default: window) the way the browser
// would; returns the event so tests can check defaultPrevented.
const fireKeyDown = (target, opts) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts })
  target.dispatchEvent(event)
  return event
}

describe('recent/index.vue plain ⌘V opens the clipboard (C-52 R-2)', () => {
  let pinia

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-16T12:00:00').getTime(), toFake: ['setTimeout', 'clearTimeout'] })
    __editorStoreMock.GET_RECENT_FILES.mockResolvedValue([])
    __editorStoreMock.GET_SESSION_PATHS.mockResolvedValue([])
    __projectStoreMock.GET_RECENT_FOLDERS.mockResolvedValue([])
    __ipcPrefsMock.get.mockResolvedValue(null)
    __ipcFsMock.stat.mockResolvedValue(null)
    openFromClipboardMock.mockReset()
    pinia = setupTestPinia()
    window.electron = {
      ipcRenderer: { send: vi.fn(), on: vi.fn(), invoke: vi.fn().mockResolvedValue(null) },
      webFrame: { setZoomFactor: vi.fn() },
      shell: { showItemInFolder: vi.fn() },
      clipboard: { writeText: vi.fn().mockResolvedValue(), readText: vi.fn(async () => '') },
      webUtils: { getPathForFile: vi.fn((f) => `/dropped/${f.name}`) },
      process: { platform: 'darwin', env: {} }
    }
    window.path = {
      basename: (p) => p.split('/').pop(),
      dirname: (p) => p.substring(0, p.lastIndexOf('/')) || '/',
      join: (...args) => args.join('/'),
      resolve: (...args) => args.join('/'),
      sep: '/'
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('plain ⌘V opens the clipboard through the shared resolver', async () => {
    const wrapper = await mountRecent()
    const event = fireKeyDown(window, { key: 'v', metaKey: true })
    await flushAsync()
    expect(openFromClipboardMock).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('plain Ctrl+V works too (non-macOS modifier)', async () => {
    const wrapper = await mountRecent()
    fireKeyDown(window, { key: 'v', ctrlKey: true })
    await flushAsync()
    expect(openFromClipboardMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('⌥⌘V (the File-menu accelerator) and Shift variants are ignored', async () => {
    const wrapper = await mountRecent()
    fireKeyDown(window, { key: 'v', metaKey: true, altKey: true })
    fireKeyDown(window, { key: 'v', metaKey: true, shiftKey: true })
    fireKeyDown(window, { key: 'v', ctrlKey: true, altKey: true })
    await flushAsync()
    expect(openFromClipboardMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('other keys are ignored', async () => {
    const wrapper = await mountRecent()
    fireKeyDown(window, { key: 'c', metaKey: true })
    fireKeyDown(window, { key: 'v' })
    await flushAsync()
    expect(openFromClipboardMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('never steals a paste aimed at a text control (D-3 editor surface)', async () => {
    const wrapper = await mountRecent()
    const input = document.createElement('input')
    document.body.appendChild(input)
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.appendChild(editable)

    const inInput = fireKeyDown(input, { key: 'v', metaKey: true })
    const inTextarea = fireKeyDown(textarea, { key: 'v', metaKey: true })
    const inEditable = fireKeyDown(editable, { key: 'v', metaKey: true })
    await flushAsync()

    expect(openFromClipboardMock).not.toHaveBeenCalled()
    expect(inInput.defaultPrevented).toBe(false)
    expect(inTextarea.defaultPrevented).toBe(false)
    expect(inEditable.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('stops handling ⌘V once unmounted (the editor owns the document case)', async () => {
    const wrapper = await mountRecent()
    wrapper.unmount()
    fireKeyDown(window, { key: 'v', metaKey: true })
    await flushAsync()
    expect(openFromClipboardMock).not.toHaveBeenCalled()
  })
})
