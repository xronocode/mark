/**
 * C-MULTI-SOURCE-WORKSPACE: unit tests for the projectStore.OPEN_FOLDER
 * dispatcher (add / replace / ask), the chooser/replace-confirm pending
 * states and the replace tab rules. Supersedes the C-52
 * OPEN_FOLDER_AS_WORKSPACE suite (replace is now dispatcher mode
 * 'replace' with a dirty-tab guard).
 *
 * Coverage focus:
 *   - add appends; ask resolves to add with zero roots and parks a
 *     chooser choice otherwise; explicit modes never park a choice.
 *   - Replace closes foreign roots, closes exactly the tabs under them
 *     (after the one-shot dirty confirm), never touches rootless or
 *     kept-root tabs, and protects dirty work: Cancel mutates nothing,
 *     a failed save aborts the replace.
 *   - CLOSE_PROJECT (root X) never closes tabs.
 *   - Watcher dot-entry parity: `.icloud` placeholders never join the
 *     tree model, while open tabs on hidden files still get notified.
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

type StubTab = {
  id: string
  pathname: string
  filename?: string
  isSaved?: boolean
  markdown?: string
  contentRevision?: number
}

const editorStubFactory = () => ({
  tabs: [] as StubTab[],
  APPLY_FILE_CHANGE: vi.fn(),
  UPDATE_CURRENT_FILE: vi.fn(),
  SET_SAVE_STATUS_WHEN_REMOVE: vi.fn(),
  RENAME_IF_NEEDED: vi.fn(),
  FORCE_CLOSE_TAB: vi.fn(),
  APPLY_SAVE_OUTCOME: vi.fn()
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

describe('projectStore.OPEN_FOLDER dispatcher (C-MULTI-SOURCE-WORKSPACE)', () => {
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
      if (cmd === 'mt_response_file_save') {
        return { id: (args as { id: string }).id, isSaved: true }
      }
      return null
    })
  })

  // --- add mode ---------------------------------------------------------

  it('add appends a root without touching existing roots', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')

    await store.OPEN_FOLDER('/tmp/beta', { mode: 'add', origin: 'drop' })

    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual([
      '/tmp/alpha',
      '/tmp/beta'
    ])
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')).toHaveLength(0)
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')).toEqual([
      ['mt_walk_project', { path: '/tmp/beta' }]
    ])
  })

  it('add with zero roots works without parking a chooser choice', async () => {
    const store = await loadStore()
    await store.OPEN_FOLDER('/tmp/beta')
    expect(store.projectTrees).toHaveLength(1)
    expect(store.pendingFolderChoice).toBeNull()
  })

  it('ignores an empty argument', async () => {
    const store = await loadStore()
    await store.OPEN_FOLDER('', { mode: 'replace' })
    await store.OPEN_FOLDER(undefined as unknown as string, { mode: 'add' })
    expect(store.projectTrees).toHaveLength(0)
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')).toHaveLength(0)
  })

  // --- ask mode (chooser) ------------------------------------------------

  it('ask with roots open parks the choice and mutates nothing until resolved', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')

    await store.OPEN_FOLDER('/tmp/beta', { origin: 'clipboard' })

    expect(store.pendingFolderChoice).toEqual({ pathname: '/tmp/beta', origin: 'clipboard' })
    expect(store.projectTrees).toHaveLength(1)
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')).toHaveLength(0)
  })

  it('chooser Add appends and keeps the pending input discarded', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    await store.OPEN_FOLDER('/tmp/beta', { origin: 'clipboard' })

    await store.RESOLVE_FOLDER_CHOICE('add')

    expect(store.pendingFolderChoice).toBeNull()
    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual([
      '/tmp/alpha',
      '/tmp/beta'
    ])
  })

  it('chooser Cancel leaves roots, tabs and dirty flags bit-identical', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [
      { id: 't1', pathname: '/tmp/alpha/a.md', isSaved: false, markdown: 'draft' }
    ]
    await store.OPEN_FOLDER('/tmp/beta', { origin: 'drop' })

    await store.RESOLVE_FOLDER_CHOICE('cancel')

    expect(store.pendingFolderChoice).toBeNull()
    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual(['/tmp/alpha'])
    expect(editorStubRef.tabs).toHaveLength(1)
    expect(editorStubRef.tabs[0].isSaved).toBe(false)
    expect(editorStubRef.FORCE_CLOSE_TAB).not.toHaveBeenCalled()
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')).toHaveLength(0)
  })

  it('chooser Replace without dirty tabs replaces directly', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [{ id: 't1', pathname: '/tmp/alpha/a.md', isSaved: true }]
    await store.OPEN_FOLDER('/tmp/beta', { origin: 'drop' })

    await store.RESOLVE_FOLDER_CHOICE('replace')

    expect(store.pendingFolderChoice).toBeNull()
    expect(store.pendingReplaceConfirm).toBeNull()
    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual(['/tmp/beta'])
    // The clean foreign-root tab closed; the root unwatched; the new walked.
    expect(editorStubRef.FORCE_CLOSE_TAB).toHaveBeenCalledTimes(1)
    expect(editorStubRef.FORCE_CLOSE_TAB).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' })
    )
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')).toEqual([
      ['mt_close_project_root', { pathname: '/tmp/alpha' }]
    ])
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')).toEqual([
      ['mt_walk_project', { path: '/tmp/beta' }]
    ])
  })

  // --- replace mode (explicit command) ------------------------------------

  it('replaces several roots at once', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    store.ADD_PROJECT('/tmp/gamma')

    await store.OPEN_FOLDER('/tmp/beta', { mode: 'replace', origin: 'picker' })

    expect(store.projectTrees).toHaveLength(1)
    expect(store.projectTrees[0].pathname).toBe('/tmp/beta')
    const closedPaths = invokeCalls
      .filter(([cmd]) => cmd === 'mt_close_project_root')
      .map(([, args]) => (args as { pathname: string }).pathname)
    expect(closedPaths.sort()).toEqual(['/tmp/alpha', '/tmp/gamma'])
  })

  it('keeps the folder that is already the only root (dedup) without re-walking', async () => {
    const store = await loadStore()
    const notice = (await import('@/services/notification')).default
    store.ADD_PROJECT('/tmp/alpha')
    invokeCalls.length = 0

    await store.OPEN_FOLDER('/tmp/alpha', { mode: 'replace', origin: 'picker' })

    expect(store.projectTrees).toHaveLength(1)
    expect(store.projectTrees[0].pathname).toBe('/tmp/alpha')
    expect(notice.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Folder already open' })
    )
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')).toHaveLength(0)
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')).toHaveLength(0)
  })

  it('canonicalizes before comparing, so a trailing slash still replaces cleanly', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')

    await store.OPEN_FOLDER('/tmp/beta/', { mode: 'replace', origin: 'picker' })

    expect(store.projectTrees).toHaveLength(1)
    expect(store.projectTrees[0].pathname).toBe('/tmp/beta')
  })

  // --- replace dirty-guard -------------------------------------------------

  it('replace with a dirty foreign tab parks the confirm and mutates nothing', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [
      { id: 't1', pathname: '/tmp/alpha/a.md', isSaved: false, markdown: 'draft' },
      { id: 't2', pathname: '/tmp/loose/b.md', isSaved: true }
    ]

    await store.OPEN_FOLDER('/tmp/beta', { mode: 'replace', origin: 'picker' })

    expect(store.pendingReplaceConfirm).toEqual(
      expect.objectContaining({ pathname: '/tmp/beta', dirtyIds: ['t1'], tabIds: ['t1'] })
    )
    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual(['/tmp/alpha'])
    expect(editorStubRef.FORCE_CLOSE_TAB).not.toHaveBeenCalled()
  })

  it('confirm Cancel aborts with zero mutations', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [
      { id: 't1', pathname: '/tmp/alpha/a.md', isSaved: false, markdown: 'draft' }
    ]
    await store.OPEN_FOLDER('/tmp/beta', { mode: 'replace', origin: 'picker' })

    await store.RESOLVE_REPLACE_CONFIRM('cancel')

    expect(store.pendingReplaceConfirm).toBeNull()
    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual(['/tmp/alpha'])
    expect(editorStubRef.tabs).toHaveLength(1)
    expect(editorStubRef.tabs[0].isSaved).toBe(false)
    expect(editorStubRef.FORCE_CLOSE_TAB).not.toHaveBeenCalled()
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')).toHaveLength(0)
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_walk_project')).toHaveLength(0)
  })

  it('confirm Don’t Save closes dirty and clean foreign tabs but never rootless or kept-root tabs', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    store.ADD_PROJECT('/tmp/keep')
    editorStubRef.tabs = [
      { id: 't1', pathname: '/tmp/alpha/a.md', isSaved: false, markdown: 'draft' },
      { id: 't2', pathname: '/tmp/alpha/c.md', isSaved: true },
      { id: 't3', pathname: '/tmp/loose/b.md', isSaved: true },
      { id: 't4', pathname: '/tmp/keep/k.md', isSaved: true }
    ]
    await store.OPEN_FOLDER('/tmp/keep', { mode: 'replace', origin: 'picker' })
    expect(store.pendingReplaceConfirm).not.toBeNull()

    await store.RESOLVE_REPLACE_CONFIRM('dont-save')

    expect(store.pendingReplaceConfirm).toBeNull()
    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual(['/tmp/keep'])
    const closedIds = editorStubRef.FORCE_CLOSE_TAB.mock.calls.map(
      ([tab]: [StubTab]) => tab.id
    ).sort()
    expect(closedIds).toEqual(['t1', 't2'])
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')).toEqual([
      ['mt_close_project_root', { pathname: '/tmp/alpha' }]
    ])
  })

  it('confirm Save & Close persists each dirty tab before closing it', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [
      {
        id: 't1',
        pathname: '/tmp/alpha/a.md',
        filename: 'a.md',
        isSaved: false,
        markdown: 'draft',
        contentRevision: 3
      }
    ]
    await store.OPEN_FOLDER('/tmp/beta', { mode: 'replace', origin: 'picker' })

    await store.RESOLVE_REPLACE_CONFIRM('save-close')

    const save = invokeCalls.find(([cmd]) => cmd === 'mt_response_file_save')
    expect(save).toEqual([
      'mt_response_file_save',
      { id: 't1', filename: 'a.md', pathname: '/tmp/alpha/a.md', markdown: 'draft', defaultPath: null }
    ])
    expect(editorStubRef.APPLY_SAVE_OUTCOME).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', isSaved: true }),
      3
    )
    expect(editorStubRef.FORCE_CLOSE_TAB).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' })
    )
    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual(['/tmp/beta'])
  })

  it('a failed save aborts the replace and keeps the dirty tab open', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [
      { id: 't1', pathname: '/tmp/alpha/a.md', isSaved: false, markdown: 'draft' }
    ]
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      invokeCalls.push([cmd, args])
      if (cmd === 'mt_prefs_get') return []
      if (cmd === 'mt_response_file_save') throw new Error('disk full')
      return null
    })
    await store.OPEN_FOLDER('/tmp/beta', { mode: 'replace', origin: 'picker' })

    await store.RESOLVE_REPLACE_CONFIRM('save-close')

    expect(store.projectTrees.map((r: { pathname: string }) => r.pathname)).toEqual(['/tmp/alpha'])
    expect(editorStubRef.tabs).toHaveLength(1)
    expect(editorStubRef.tabs[0].isSaved).toBe(false)
    expect(editorStubRef.FORCE_CLOSE_TAB).not.toHaveBeenCalled()
    expect(invokeCalls.filter(([cmd]) => cmd === 'mt_close_project_root')).toHaveLength(0)
  })

  // --- root close never closes tabs ---------------------------------------

  it('CLOSE_PROJECT (root X) never closes tabs of that root', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/alpha')
    editorStubRef.tabs = [{ id: 't1', pathname: '/tmp/alpha/a.md', isSaved: true }]

    await store.CLOSE_PROJECT('/tmp/alpha')

    expect(store.projectTrees).toHaveLength(0)
    expect(editorStubRef.tabs).toHaveLength(1)
    expect(editorStubRef.FORCE_CLOSE_TAB).not.toHaveBeenCalled()
  })

  // --- watcher dot-entry parity (iCloud placeholder hygiene) ----------------

  it('watcher create of a dot entry never joins the tree model (.icloud placeholder)', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/notes')
    const treeCtrl = await import('@/store/treeCtrl')
    vi.mocked(treeCtrl.addFile).mockClear()
    vi.mocked(treeCtrl.addDirectory).mockClear()

    ipcFsStatMock.mockResolvedValue({ isDirectory: false, isFile: true, mtimeMs: 1 })
    const handler = ipcWatchSubscribeMock.mock.calls[0][1] as (event: unknown) => Promise<void>
    await handler({ kind: 'create', paths: ['/tmp/notes/.Заметка.md.icloud'] })

    expect(treeCtrl.addFile).not.toHaveBeenCalled()
    expect(treeCtrl.addDirectory).not.toHaveBeenCalled()
  })

  it('watcher remove of a dot entry skips the tree but still notifies an open tab', async () => {
    const store = await loadStore()
    store.ADD_PROJECT('/tmp/notes')
    const treeCtrl = await import('@/store/treeCtrl')
    editorStubRef.tabs = [{ id: 't1', pathname: '/tmp/notes/.hidden.md' }]
    vi.mocked(treeCtrl.unlinkFile).mockClear()
    vi.mocked(treeCtrl.unlinkDirectory).mockClear()

    const handler = ipcWatchSubscribeMock.mock.calls[0][1] as (event: unknown) => Promise<void>
    await handler({ kind: 'remove', paths: ['/tmp/notes/.hidden.md'] })

    expect(treeCtrl.unlinkFile).not.toHaveBeenCalled()
    expect(treeCtrl.unlinkDirectory).not.toHaveBeenCalled()
    expect(editorStubRef.APPLY_FILE_CHANGE).toHaveBeenCalledWith('unlink', {
      pathname: '/tmp/notes/.hidden.md'
    })
  })
})

// ─── C-MULTI-SOURCE-WORKSPACE fix wave: cloud follow-up ────────────
// displayRootName pretty names, the tree-event coalescer (a whole cloud
// drive froze the webview when every walk event folded synchronously)
// and the once-per-root online-files hint (owner manual acceptance
// 2026-10-22: «вандрайв зависает», «название уродское», «бабл про
// онлайн-файлы»).
describe('cloud follow-up (fix wave)', () => {
  // This describe sits OUTSIDE the dispatcher describe above, so its
  // beforeEach does not run here — mirror the store-mock essentials
  // ADD_PROJECT depends on (pinia, console silence, watcher subscribe).
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
    invokeMock.mockReset()
    invokeMock.mockImplementation(async () => null)
  })

  it('displayRootName maps cloud containers to product names, keeps plain basenames', async () => {
    const { displayRootName } = await import('@/store/project')
    expect(displayRootName('/vol/e2e/Library/CloudStorage/iCloudDrive-iCloudDrive (26-2-26 21:13)')).toBe('iCloud Drive')
    expect(displayRootName('/vol/e2e/Library/Mobile Documents/com~apple~CloudDocs')).toBe('iCloud Drive')
    expect(displayRootName('/vol/e2e/Library/CloudStorage/OneDrive-Personal')).toBe('OneDrive')
    expect(displayRootName('/vol/e2e/Downloads/scratch-msw/beta')).toBe('beta')
  })

  it('tree events coalesce: small streams wait for the timer, floods flush at the limit', async () => {
    vi.useFakeTimers()
    try {
      const store = await loadStore()
      store.ADD_PROJECT('/tmp/coalesce')
      const fold = vi.spyOn(store, '_processTreeEvent' as unknown as 'add').mockClear()

      store.ENQUEUE_TREE_EVENT({ type: 'add', change: { pathname: '/tmp/coalesce/a.md', name: 'a.md' } })
      store.ENQUEUE_TREE_EVENT({ type: 'add', change: { pathname: '/tmp/coalesce/b.md', name: 'b.md' } })
      // Under the limit → buffered, nothing folded yet.
      expect(fold).toHaveBeenCalledTimes(0)

      vi.advanceTimersByTime(200)
      // Timer flush folded BOTH events in one batch pass.
      expect(fold).toHaveBeenCalledTimes(2)

      // A flood at/over the limit flushes synchronously without a timer.
      for (let i = 0; i < 500; i++) {
        store.ENQUEUE_TREE_EVENT({ type: 'add', change: { pathname: `/tmp/coalesce/f${i}.md`, name: `f${i}.md` } })
      }
      expect(fold.mock.calls.length).toBeGreaterThan(400)
      expect(store.pendingTreeEvents['/tmp/coalesce']).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cloud root add shows the online-files hint exactly once per root', async () => {
    const notice = (await import('@/services/notification')).default
    vi.mocked(notice.notify).mockClear()
    const store = await loadStore()
    const cloudPath = '/vol/e2e/Library/CloudStorage/OneDrive-Personal'

    store.ADD_PROJECT(cloudPath)
    expect(notice.notify).toHaveBeenCalledTimes(1)
    expect(notice.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' })
    )

    // Close + re-add the same root: the hint must not repeat.
    store.CLOSE_PROJECT(cloudPath)
    vi.mocked(notice.notify).mockClear()
    store.ADD_PROJECT(cloudPath)
    expect(notice.notify).not.toHaveBeenCalled()

    // A local root never triggers the hint.
    vi.mocked(notice.notify).mockClear()
    store.ADD_PROJECT('/tmp/plain')
    expect(notice.notify).not.toHaveBeenCalled()
  })
})
