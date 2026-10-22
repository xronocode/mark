/**
 * C-MULTI-SOURCE-WORKSPACE: component tests for the shared
 * Add-or-Replace chooser / replace dirty-confirm dialog
 * (sideBar/workspaceModeDialog.vue).
 *
 * Coverage focus:
 *   - The dialog renders only while a pending choice (or replace confirm)
 *     exists, and disappears after resolution.
 *   - The safe default resolves Add / Save & Close; the destructive button
 *     resolves Replace / Don't Save; Cancel, Escape and a backdrop click
 *     resolve Cancel with zero mutations.
 *   - The replace-confirm Save & Close path persists dirty tabs before
 *     anything closes; a failed save aborts the replace.
 *
 * Mock strategy mirrors tests/renderer/store/project-workspace.test.ts;
 * the project store itself is real so resolution actions run end-to-end.
 */
import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(async () => undefined) }
}))

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), all: new Map() }
}))

const editorStubFactory = () => ({
  tabs: [],
  APPLY_FILE_CHANGE: vi.fn(),
  UPDATE_CURRENT_FILE: vi.fn(),
  SET_SAVE_STATUS_WHEN_REMOVE: vi.fn(),
  RENAME_IF_NEEDED: vi.fn(),
  FORCE_CLOSE_TAB: vi.fn(),
  APPLY_SAVE_OUTCOME: vi.fn()
})
let editorStubRef
vi.mock('@/store/editor', () => ({
  useEditorStore: vi.fn(() => editorStubRef)
}))

const layoutStubFactory = () => ({
  SET_LAYOUT: vi.fn(),
  DISPATCH_LAYOUT_MENU_ITEMS: vi.fn()
})
let layoutStubRef
vi.mock('@/store/layout', () => ({
  useLayoutStore: vi.fn(() => layoutStubRef)
}))

const ipcWatchSubscribeMock = vi.fn()
const ipcFsStatMock = vi.fn()
vi.mock('@/ipc/runtime', () => ({
  ipcWatch: {
    subscribe: (path, handler, options) => ipcWatchSubscribeMock(path, handler, options)
  },
  ipcFs: { stat: (path) => ipcFsStatMock(path) }
}))

vi.mock('@/store/treeCtrl', () => ({
  addFile: vi.fn(),
  unlinkFile: vi.fn(),
  addDirectory: vi.fn(),
  unlinkDirectory: vi.fn()
}))

vi.mock('@/util/fileSystem', () => ({
  create: vi.fn(async () => undefined),
  paste: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined)
}))

import { invoke } from '@tauri-apps/api/core'
// setup.ts mocks @tauri-apps/api/core invoke as a vi.fn — plain JS file,
// no TS cast needed.
const invokeMock = invoke

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

async function loadStore() {
  const mod = await import('@/store/project')
  return mod.useProjectStore()
}

async function loadDialog() {
  const mod = await import('@/components/sideBar/workspaceModeDialog.vue')
  return mod.default
}

describe('sideBar/workspaceModeDialog.vue (C-MULTI-SOURCE-WORKSPACE)', () => {
  let store, Dialog, invokeCalls, pinia

  const mountDialog = async () => {
    const wrapper = mount(Dialog, {
      global: { plugins: [pinia, i18n] },
      attachTo: document.body
    })
    await new Promise((r) => setTimeout(r, 0))
    return wrapper
  }

  beforeEach(async () => {
    pinia = setupTestPinia()
    document.body.innerHTML = ''
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    editorStubRef = editorStubFactory()
    layoutStubRef = layoutStubFactory()
    ipcWatchSubscribeMock.mockReset()
    ipcWatchSubscribeMock.mockImplementation(() => Promise.resolve(vi.fn()))
    ipcFsStatMock.mockReset()
    invokeCalls = []
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (cmd, args) => {
      invokeCalls.push([cmd, args])
      if (cmd === 'mt_prefs_get') return []
      if (cmd === 'mt_response_file_save') {
        return { id: args.id, isSaved: true }
      }
      return null
    })
    store = await loadStore()
    Dialog = await loadDialog()
  })

  it('renders nothing without a pending choice', async () => {
    const wrapper = await mountDialog()
    expect(document.querySelector('.workspace-mode-overlay')).toBeNull()
    wrapper.unmount()
  })

  it('chooser: the safe default resolves Add and appends the root', async () => {
    store.ADD_PROJECT('/tmp/alpha')
    store.pendingFolderChoice = { pathname: '/tmp/beta', origin: 'drop' }
    const wrapper = await mountDialog()

    const overlay = document.querySelector('.workspace-mode-overlay')
    expect(overlay).not.toBeNull()
    const buttons = document.querySelectorAll('.workspace-mode-btn')
    expect(buttons).toHaveLength(3)

    document.querySelector('.workspace-mode-default').click()
    await new Promise((r) => setTimeout(r, 0))

    expect(store.pendingFolderChoice).toBeNull()
    expect(store.projectTrees.map((r) => r.pathname)).toEqual(['/tmp/alpha', '/tmp/beta'])
    wrapper.unmount()
  })

  it('chooser: Cancel (button, Escape, backdrop) mutates nothing', async () => {
    store.ADD_PROJECT('/tmp/alpha')
    store.pendingFolderChoice = { pathname: '/tmp/beta', origin: 'clipboard' }
    const wrapper = await mountDialog()

    document.querySelector('.workspace-mode-cancel').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(store.pendingFolderChoice).toBeNull()
    expect(store.projectTrees.map((r) => r.pathname)).toEqual(['/tmp/alpha'])

    // Escape on a fresh pending choice
    store.pendingFolderChoice = { pathname: '/tmp/gamma', origin: 'clipboard' }
    await new Promise((r) => setTimeout(r, 0))
    const box = document.querySelector('.workspace-mode-dialog')
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(store.pendingFolderChoice).toBeNull()
    expect(store.projectTrees).toHaveLength(1)

    // Backdrop click on a fresh pending choice
    store.pendingFolderChoice = { pathname: '/tmp/delta', origin: 'recent' }
    await new Promise((r) => setTimeout(r, 0))
    const overlay = document.querySelector('.workspace-mode-overlay')
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(store.pendingFolderChoice).toBeNull()
    expect(store.projectTrees).toHaveLength(1)
    wrapper.unmount()
  })

  it('chooser: the destructive button resolves Replace', async () => {
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [{ id: 't1', pathname: '/tmp/alpha/a.md', isSaved: true }]
    store.pendingFolderChoice = { pathname: '/tmp/beta', origin: 'drop' }
    const wrapper = await mountDialog()

    document.querySelector('.workspace-mode-destructive').click()
    await new Promise((r) => setTimeout(r, 0))

    expect(store.pendingFolderChoice).toBeNull()
    expect(store.pendingReplaceConfirm).toBeNull()
    expect(store.projectTrees.map((r) => r.pathname)).toEqual(['/tmp/beta'])
    wrapper.unmount()
  })

  it('replace-confirm: Save & Close persists the dirty tab before closing it', async () => {
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [
      {
        id: 't1',
        pathname: '/tmp/alpha/a.md',
        filename: 'a.md',
        isSaved: false,
        markdown: 'draft',
        contentRevision: 2
      }
    ]
    store.pendingReplaceConfirm = {
      pathname: '/tmp/beta',
      origin: 'picker',
      tabIds: ['t1'],
      dirtyIds: ['t1']
    }
    const wrapper = await mountDialog()

    document.querySelector('.workspace-mode-default').click()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(store.pendingReplaceConfirm).toBeNull()
    expect(invokeCalls.find(([cmd]) => cmd === 'mt_response_file_save')).toBeTruthy()
    expect(editorStubRef.APPLY_SAVE_OUTCOME).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', isSaved: true }),
      2
    )
    expect(editorStubRef.FORCE_CLOSE_TAB).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
    expect(store.projectTrees.map((r) => r.pathname)).toEqual(['/tmp/beta'])
    wrapper.unmount()
  })

  it('replace-confirm: a failed save aborts the replace and keeps the tab', async () => {
    const notice = (await import('@/services/notification')).default
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [
      { id: 't1', pathname: '/tmp/alpha/a.md', filename: 'a.md', isSaved: false, markdown: 'x' }
    ]
    invokeMock.mockImplementation(async (cmd, args) => {
      invokeCalls.push([cmd, args])
      if (cmd === 'mt_prefs_get') return []
      if (cmd === 'mt_response_file_save') throw new Error('read-only volume')
      return null
    })
    store.pendingReplaceConfirm = {
      pathname: '/tmp/beta',
      origin: 'picker',
      tabIds: ['t1'],
      dirtyIds: ['t1']
    }
    const wrapper = await mountDialog()

    document.querySelector('.workspace-mode-default').click()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(store.pendingReplaceConfirm).toBeNull()
    expect(store.projectTrees.map((r) => r.pathname)).toEqual(['/tmp/alpha'])
    expect(editorStubRef.FORCE_CLOSE_TAB).not.toHaveBeenCalled()
    expect(editorStubRef.tabs).toHaveLength(1)
    expect(notice.notify).toHaveBeenCalled()
    wrapper.unmount()
  })
})
