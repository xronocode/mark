/**
 * C-52 T-001: unit tests for projectStore.OPEN_FOLDER_AS_WORKSPACE —
 * the replace-workspace entry point shared by the clipboard resolver
 * (File › Open from Clipboard, welcome ⌘V) and the dropped-folder fix.
 *
 * Coverage focus:
 *   - D-1 replace semantics: foreign roots are CLOSED (mt_close_project_root
 *     per root) before the new root is added and walked.
 *   - Opening the folder that is already the workspace keeps it (ADD_PROJECT
 *     dedup) and still replaces any other roots.
 *   - Empty/invalid argument is a no-op.
 *
 * Mock strategy mirrors tests/renderer/store/project.test.ts (see its
 * header): notification / bus / editor / layout / treeCtrl / fileSystem /
 * ipc-runtime mocked; the store is late-imported inside each test after
 * pinia is active.
 */

import { setupTestPinia } from '../pinia'

vi.mock('@/services/notification', () => ({
  default: {
    notify: vi.fn(async (_opts: unknown) => undefined)
  }
}))

vi.mock('@/bus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    all: new Map()
  }
}))

const editorStubFactory = () => ({
  tabs: [] as Array<{ pathname: string }>,
  APPLY_FILE_CHANGE: vi.fn(),
  UPDATE_CURRENT_FILE: vi.fn(),
  SET_SAVE_STATUS_WHEN_REMOVE: vi.fn(),
  RENAME_IF_NEEDED: vi.fn()
})
let editorStubRef: ReturnType<typeof editorStubFactory>
vi.mock('@/store/editor', () => ({
  useEditorStore: vi.fn(() => editorStubRef)
}))

const layoutStubFactory = () => ({
  SET_LAYOUT: vi.fn(),
  DISPATCH_LAYOUT_MENU_ITEMS: vi.fn()
})
let layoutStubRef: ReturnType<typeof layoutStubFactory>
vi.mock('@/store/layout', () => ({
  useLayoutStore: vi.fn(() => layoutStubRef)
}))

const ipcWatchSubscribeMock = vi.fn()
const ipcFsStatMock = vi.fn()
vi.mock('@/ipc/runtime', () => ({
  ipcWatch: {
    subscribe: (path: string, handler: unknown, options?: unknown) =>
      ipcWatchSubscribeMock(path, handler, options)
  },
  ipcFs: {
    stat: (path: string) => ipcFsStatMock(path)
  }
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

// Same loosening cast project.test.ts uses for the setup.ts invoke mock.
const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>

async function loadStore() {
  const mod = await import('@/store/project')
  return mod.useProjectStore()
}

describe('projectStore.OPEN_FOLDER_AS_WORKSPACE (C-52)', () => {
  let invokeCalls // Array<[cmd, args?]

  beforeEach(() => {
    setupTestPinia()
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
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      invokeCalls.push([cmd, args])
      if (cmd === 'mt_prefs_get') return []
      return null
    })
  })

  it('replaces an open workspace: closes foreign roots, adds and walks the new one', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')

    await store.OPEN_FOLDER_AS_WORKSPACE('/tmp/beta')

    // D-1: exactly one root remains — the new one.
    expect(store.projectTrees).toHaveLength(1)
    expect(store.projectTrees[0].pathname).toBe('/tmp/beta')

    // The old root was unwatched backend-side before the walk.
    const closed = invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')
    expect(closed).toEqual([['mt_close_project_root', { pathname: '/tmp/alpha' }]])
    const walked = invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')
    expect(walked).toEqual([['mt_walk_project', { path: '/tmp/beta' }]])
  })

  it('replaces several roots at once', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    store.ADD_PROJECT('/tmp/gamma')

    await store.OPEN_FOLDER_AS_WORKSPACE('/tmp/beta')

    expect(store.projectTrees).toHaveLength(1)
    expect(store.projectTrees[0].pathname).toBe('/tmp/beta')
    const closedPaths = invokeCalls
      .filter(([cmd]) => cmd === 'mt_close_project_root')
      .map(([, args]) => (args as { pathname: string }).pathname)
    expect(closedPaths.sort()).toEqual(['/tmp/alpha', '/tmp/gamma'])
  })

  it('keeps the folder that is already the workspace (dedup) without re-walking', async () => {
    const store = await loadStore()
    const notice = (await import('@/services/notification')).default
    store.ADD_PROJECT('/tmp/alpha')
    invokeCalls.length = 0

    await store.OPEN_FOLDER_AS_WORKSPACE('/tmp/alpha')

    expect(store.projectTrees).toHaveLength(1)
    expect(store.projectTrees[0].pathname).toBe('/tmp/alpha')
    // ADD_PROJECT's dedup surfaced "already open"…
    expect(notice.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Folder already open' })
    )
    // …nothing was closed and the root was not re-walked.
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')).toHaveLength(0)
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')).toHaveLength(0)
  })

  it('canonicalizes before comparing, so a trailing slash still replaces cleanly', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')

    await store.OPEN_FOLDER_AS_WORKSPACE('/tmp/beta/')

    expect(store.projectTrees).toHaveLength(1)
    expect(store.projectTrees[0].pathname).toBe('/tmp/beta')
  })

  it('ignores an empty argument', async () => {
    const store = await loadStore()
    await store.OPEN_FOLDER_AS_WORKSPACE('')
    await store.OPEN_FOLDER_AS_WORKSPACE(undefined as unknown as string)
    expect(store.projectTrees).toHaveLength(0)
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')).toHaveLength(0)
  })
})
