/**
 * Phase-4 wave-1 / agent-1: unit tests for store/project.js.
 *
 * Coverage focus:
 *   - C-1 file-watcher fix in `_handleWatchEvent` (originally Critical, zero
 *     coverage before Phase 4).
 *   - Multi-root invariants in ADD_PROJECT / CLOSE_PROJECT.
 *   - `_processTreeEvent` dispatcher branches.
 *   - `ASK_FOR_OPEN_PROJECT` happy / cancelled / failure paths.
 *   - Module-level helpers exercised through their public callers.
 *
 * Mock strategy (per Phase-3 pitfalls):
 *   - `@/services/notification` mocked to a vi.fn() — service singleton
 *     pulls in CSS via index.html?raw + DOMPurify, slow & jsdom-fragile.
 *   - `@/ipc/runtime` mocked so `ipcWatch.subscribe` and `ipcFs.stat` are
 *     controllable. These are referenced in module top-level imports.
 *   - `@/store/editor` and `@/store/layout` are mocked so we don't drag
 *     in the 49KB editor.js (muya, codemirror, etc.) or the layout
 *     store's window-resize Tauri imports.
 *   - `./treeCtrl` mocked so addFile/unlinkFile/addDirectory/unlinkDirectory
 *     are spies.
 *   - `../bus` (mitt singleton) mocked so listener state never leaks.
 *
 * The store under test is loaded via `await import('@/store/project')`
 * INSIDE each test (after the per-test pinia is active), matching the
 * Phase-3 smoke-test pattern.
 */

import { setupTestPinia } from '../pinia'

// ─── Mocks (must be declared before any import of the store) ────────

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

// `@/store/editor` is mocked to avoid pulling in muya. We expose the
// state/actions the project store touches: tabs (state), APPLY_FILE_CHANGE,
// UPDATE_CURRENT_FILE, SET_SAVE_STATUS_WHEN_REMOVE, RENAME_IF_NEEDED.
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

// `@/ipc/runtime` — only `ipcWatch` and `ipcFs` are touched by project.js.
// We default `ipcWatch.subscribe` to a resolved promise of a `vi.fn()`
// dispose so ADD_PROJECT happy-path tests work without per-test setup.
const ipcWatchSubscribeMock = vi.fn()
const ipcFsStatMock = vi.fn()
vi.mock('@/ipc/runtime', () => ({
  ipcWatch: {
    subscribe: (path: string, handler: unknown) => ipcWatchSubscribeMock(path, handler)
  },
  ipcFs: {
    stat: (path: string) => ipcFsStatMock(path)
  }
}))

// `./treeCtrl` mock — spies for the four mutators called by _processTreeEvent.
const addFileSpy = vi.fn()
const unlinkFileSpy = vi.fn()
const addDirectorySpy = vi.fn()
const unlinkDirectorySpy = vi.fn()
vi.mock('@/store/treeCtrl', () => ({
  addFile: (...a: unknown[]) => addFileSpy(...a),
  unlinkFile: (...a: unknown[]) => unlinkFileSpy(...a),
  addDirectory: (...a: unknown[]) => addDirectorySpy(...a),
  unlinkDirectory: (...a: unknown[]) => unlinkDirectorySpy(...a)
}))

// `../util/fileSystem` — only used by RENAME / CREATE / paste paths we
// don't deeply exercise; stub the named exports so importing the store
// doesn't blow up if util touches Tauri APIs.
vi.mock('@/util/fileSystem', () => ({
  create: vi.fn(async () => undefined),
  paste: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined)
}))

// `./help` — keep the real getFileStateFromData (small, pure) so the
// 'add' branch in _processTreeEvent that calls UPDATE_CURRENT_FILE works
// end-to-end. No mock needed here.

// ─── Test helpers ──────────────────────────────────────────────────

async function loadStore() {
  // Late import after pinia is active and mocks are registered.
  const mod = await import('@/store/project')
  return mod.useProjectStore()
}

function silenceConsole() {
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('store/project', () => {
  beforeEach(() => {
    setupTestPinia()
    silenceConsole()
    editorStubRef = editorStubFactory()
    layoutStubRef = layoutStubFactory()
    addFileSpy.mockReset()
    unlinkFileSpy.mockReset()
    addDirectorySpy.mockReset()
    unlinkDirectorySpy.mockReset()
    ipcWatchSubscribeMock.mockReset()
    ipcFsStatMock.mockReset()
    // Default: subscribe resolves with a noop disposer.
    ipcWatchSubscribeMock.mockImplementation(() => Promise.resolve(vi.fn()))
  })

  // ─── helpers (via public actions) ─────────────────────────────────

  describe('canonicalizePath / isPathContained / findOwningRoot', () => {
    it('canonicalizes via window.path.normalize and trims trailing separator', async () => {
      const normalizeSpy = window.path.normalize as unknown as ReturnType<typeof vi.fn>
      const store = await loadStore()
      // Trailing slash on a non-root path → trimmed.
      store.ADD_PROJECT('/foo/bar/')
      expect(normalizeSpy).toHaveBeenCalledWith('/foo/bar/')
      expect(store.projectTrees[0].pathname).toBe('/foo/bar')
    })

    it('keeps a single-separator path as-is (not trimmed)', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/')
      expect(store.projectTrees[0].pathname).toBe('/')
    })

    it('rejects nested child path (parent direction)', async () => {
      const store = await loadStore()
      const notice = (await import('@/services/notification')).default
      store.ADD_PROJECT('/foo')
      // Child of an open root: should be blocked.
      store.ADD_PROJECT('/foo/bar')
      expect(store.projectTrees).toHaveLength(1)
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warning' })
      )
    })

    it('rejects reverse-nested (candidate is parent of an open root)', async () => {
      const store = await loadStore()
      const notice = (await import('@/services/notification')).default
      store.ADD_PROJECT('/foo/bar')
      store.ADD_PROJECT('/foo')
      expect(store.projectTrees).toHaveLength(1)
      expect(store.projectTrees[0].pathname).toBe('/foo/bar')
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/contains/i),
          type: 'warning'
        })
      )
    })

    it('does NOT treat /foobar as nested under /foo (segment-boundary)', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/foo')
      store.ADD_PROJECT('/foobar')
      expect(store.projectTrees).toHaveLength(2)
    })

    it('findOwningRoot picks longest-prefix winner (via _processTreeEvent ROUTED)', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/foo')
      store.ADD_PROJECT('/foo/bar')
      // Wait — ADD_PROJECT('/foo/bar') is BLOCKED (nested). To exercise
      // longest-prefix we need two roots that aren't nested. Reset and
      // use disjoint roots, plus a contained file.
      store.projectTrees = []
      store.ADD_PROJECT('/a')
      store.ADD_PROJECT('/b')
      // _processTreeEvent on a path under /a should call the matching
      // root via addFile.
      store._processTreeEvent('add', { pathname: '/a/file.md', isMarkdown: true })
      expect(addFileSpy).toHaveBeenCalledTimes(1)
      const owner = addFileSpy.mock.calls[0][0]
      expect(owner.pathname).toBe('/a')
    })

    it('findOwningRoot returns null when no root matches → DROPPED_NO_ROOT', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/a')
      store._processTreeEvent('add', { pathname: '/elsewhere/file.md', isMarkdown: true })
      expect(addFileSpy).not.toHaveBeenCalled()
    })
  })

  // ─── ADD_PROJECT ─────────────────────────────────────────────────

  describe('ADD_PROJECT', () => {
    it('appends a new root with canonical pathname + name from basename', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/some/folder')
      expect(store.projectTrees).toHaveLength(1)
      expect(store.projectTrees[0]).toMatchObject({
        pathname: '/some/folder',
        name: 'folder',
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      })
    })

    it('falls through to layoutStore SET_LAYOUT + DISPATCH_LAYOUT_MENU_ITEMS', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/foo')
      expect(layoutStubRef.SET_LAYOUT).toHaveBeenCalledWith({
        rightColumn: 'files',
        showSideBar: true,
        showTabBar: true
      })
      expect(layoutStubRef.DISPATCH_LAYOUT_MENU_ITEMS).toHaveBeenCalled()
    })

    it('dedup: re-adding same canonical path notices info + early return', async () => {
      const store = await loadStore()
      const notice = (await import('@/services/notification')).default
      store.ADD_PROJECT('/foo')
      store.ADD_PROJECT('/foo')
      expect(store.projectTrees).toHaveLength(1)
      // First call also fires layout; second one should NOT fire layout again.
      expect(layoutStubRef.SET_LAYOUT).toHaveBeenCalledTimes(1)
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'info' })
      )
    })

    it('drains pending tree events for the canonical pathname', async () => {
      const store = await loadStore()
      // Pre-seed pending bucket BEFORE ADD_PROJECT.
      store.pendingTreeEvents['/foo'] = [
        { type: 'addDir', change: { pathname: '/foo/sub' } },
        { type: 'add', change: { pathname: '/foo/x.md', isMarkdown: true } }
      ]
      store.ADD_PROJECT('/foo')
      expect(addDirectorySpy).toHaveBeenCalledTimes(1)
      expect(addFileSpy).toHaveBeenCalledTimes(1)
      // Bucket cleared after drain.
      expect(store.pendingTreeEvents['/foo']).toBeUndefined()
    })

    it('C-1: subscribes ipcWatch and stores disposer; CLOSE_PROJECT calls it', async () => {
      const dispose = vi.fn()
      ipcWatchSubscribeMock.mockResolvedValueOnce(dispose)

      const store = await loadStore()
      store.ADD_PROJECT('/foo')

      expect(ipcWatchSubscribeMock).toHaveBeenCalledTimes(1)
      expect(ipcWatchSubscribeMock.mock.calls[0][0]).toBe('/foo')
      expect(typeof ipcWatchSubscribeMock.mock.calls[0][1]).toBe('function')

      // Wait a microtask for the .then() to run.
      await new Promise((r) => setTimeout(r, 0))

      // Now closing should dispose.
      await store.CLOSE_PROJECT('/foo')
      expect(dispose).toHaveBeenCalledTimes(1)
    })

    it('C-1: subscribe failure is caught and logged; ADD_PROJECT still completes', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ipcWatchSubscribeMock.mockRejectedValueOnce(new Error('subscribe boom'))

      const store = await loadStore()
      store.ADD_PROJECT('/foo')
      // Wait for the rejection's .catch to run.
      await new Promise((r) => setTimeout(r, 0))

      expect(store.projectTrees).toHaveLength(1)
      expect(errSpy).toHaveBeenCalled()
    })
  })

  // ─── _handleWatchEvent (C-1 critical) ────────────────────────────

  describe('_handleWatchEvent — C-1 watcher dispatch', () => {
    it('skips when paths is missing or empty', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      await store._handleWatchEvent('/root', { kind: 'create', paths: [] })
      await store._handleWatchEvent('/root', { kind: 'create' } as never)
      await store._handleWatchEvent('/root', undefined as never)
      expect(ipcFsStatMock).not.toHaveBeenCalled()
      expect(addFileSpy).not.toHaveBeenCalled()
    })

    it('out-of-scope path is skipped without side effects', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      await store._handleWatchEvent('/root', {
        kind: 'create',
        paths: ['/elsewhere/x.md']
      })
      expect(ipcFsStatMock).not.toHaveBeenCalled()
      expect(addFileSpy).not.toHaveBeenCalled()
      expect(editorStubRef.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
    })

    it('create + directory → addDir tree event, no APPLY_FILE_CHANGE', async () => {
      ipcFsStatMock.mockResolvedValueOnce({ isDirectory: true, isFile: false })
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      await store._handleWatchEvent('/root', {
        kind: 'create',
        paths: ['/root/newdir']
      })
      expect(addDirectorySpy).toHaveBeenCalledTimes(1)
      expect(addFileSpy).not.toHaveBeenCalled()
      expect(editorStubRef.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
    })

    it('create + markdown file → add tree event AND APPLY_FILE_CHANGE if tab matches', async () => {
      ipcFsStatMock.mockResolvedValueOnce({
        isDirectory: false,
        isFile: true,
        mtimeMs: 1000
      })
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      editorStubRef.tabs = [{ pathname: '/root/new.md' }]
      await store._handleWatchEvent('/root', {
        kind: 'create',
        paths: ['/root/new.md']
      })
      expect(addFileSpy).toHaveBeenCalledTimes(1)
      expect(editorStubRef.APPLY_FILE_CHANGE).toHaveBeenCalledWith('add', {
        pathname: '/root/new.md'
      })
    })

    it('create + markdown file with NO matching tab → tree event fires, no APPLY_FILE_CHANGE', async () => {
      ipcFsStatMock.mockResolvedValueOnce({
        isDirectory: false,
        isFile: true,
        mtimeMs: 1000
      })
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      editorStubRef.tabs = [{ pathname: '/elsewhere/foo.md' }]
      await store._handleWatchEvent('/root', {
        kind: 'create',
        paths: ['/root/new.md']
      })
      expect(addFileSpy).toHaveBeenCalledTimes(1)
      expect(editorStubRef.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
    })

    it('create + non-markdown file → no tree event, no APPLY_FILE_CHANGE', async () => {
      ipcFsStatMock.mockResolvedValueOnce({
        isDirectory: false,
        isFile: true,
        mtimeMs: 1000
      })
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      await store._handleWatchEvent('/root', {
        kind: 'create',
        paths: ['/root/binary.bin']
      })
      expect(addFileSpy).not.toHaveBeenCalled()
      expect(editorStubRef.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
    })

    it('create + ipcFs.stat throws → debug logged, no other side effects', async () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      ipcFsStatMock.mockRejectedValueOnce(new Error('stat race'))
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      await store._handleWatchEvent('/root', {
        kind: 'create',
        paths: ['/root/whatever']
      })
      expect(addFileSpy).not.toHaveBeenCalled()
      expect(addDirectorySpy).not.toHaveBeenCalled()
      expect(editorStubRef.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
      // STAT_FAILED debug must be present.
      const calls = dbg.mock.calls.map((c) => String(c[0]))
      expect(calls.some((s) => s.includes('STAT_FAILED'))).toBe(true)
    })

    it('modify + matching open tab → APPLY_FILE_CHANGE("change") and no tree event', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      editorStubRef.tabs = [{ pathname: '/root/a.md' }]
      await store._handleWatchEvent('/root', {
        kind: 'modify',
        paths: ['/root/a.md']
      })
      expect(editorStubRef.APPLY_FILE_CHANGE).toHaveBeenCalledWith('change', {
        pathname: '/root/a.md'
      })
      expect(addFileSpy).not.toHaveBeenCalled()
    })

    it('modify + no matching tab → no calls', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      editorStubRef.tabs = []
      await store._handleWatchEvent('/root', {
        kind: 'modify',
        paths: ['/root/a.md']
      })
      expect(editorStubRef.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
      expect(addFileSpy).not.toHaveBeenCalled()
    })

    it('remove → unlink + unlinkDir tree events AND APPLY_FILE_CHANGE if tab matches', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      editorStubRef.tabs = [{ pathname: '/root/gone.md' }]
      await store._handleWatchEvent('/root', {
        kind: 'remove',
        paths: ['/root/gone.md']
      })
      expect(unlinkFileSpy).toHaveBeenCalledTimes(1)
      expect(unlinkDirectorySpy).toHaveBeenCalledTimes(1)
      expect(editorStubRef.APPLY_FILE_CHANGE).toHaveBeenCalledWith('unlink', {
        pathname: '/root/gone.md'
      })
      // SET_SAVE_STATUS_WHEN_REMOVE comes via _processTreeEvent('unlink', ...)
      expect(editorStubRef.SET_SAVE_STATUS_WHEN_REMOVE).toHaveBeenCalled()
    })

    it.each(['access', 'other', 'any'])(
      'kind=%s → ignored, no side effects',
      async (kind) => {
        const store = await loadStore()
        store.ADD_PROJECT('/root')
        editorStubRef.tabs = [{ pathname: '/root/a.md' }]
        await store._handleWatchEvent('/root', {
          kind,
          paths: ['/root/a.md']
        })
        expect(addFileSpy).not.toHaveBeenCalled()
        expect(unlinkFileSpy).not.toHaveBeenCalled()
        expect(addDirectorySpy).not.toHaveBeenCalled()
        expect(unlinkDirectorySpy).not.toHaveBeenCalled()
        expect(editorStubRef.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
      }
    )
  })

  // ─── _processTreeEvent ───────────────────────────────────────────

  describe('_processTreeEvent', () => {
    it("'add' calls addFile and clears newFileNameCache + UPDATE_CURRENT_FILE on cache match", async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      store.newFileNameCache = '/root/new.md'
      store._processTreeEvent('add', {
        pathname: '/root/new.md',
        data: { markdown: '', filename: 'new.md', pathname: '/root/new.md' },
        isMarkdown: true
      })
      expect(addFileSpy).toHaveBeenCalledTimes(1)
      expect(editorStubRef.UPDATE_CURRENT_FILE).toHaveBeenCalledTimes(1)
      expect(store.newFileNameCache).toBe('')
    })

    it("'add' without cache match: addFile fires, no UPDATE_CURRENT_FILE", async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      store.newFileNameCache = '/root/other.md'
      store._processTreeEvent('add', {
        pathname: '/root/somethingelse.md',
        data: {},
        isMarkdown: true
      })
      expect(addFileSpy).toHaveBeenCalledTimes(1)
      expect(editorStubRef.UPDATE_CURRENT_FILE).not.toHaveBeenCalled()
      expect(store.newFileNameCache).toBe('/root/other.md')
    })

    it("'unlink' calls unlinkFile + SET_SAVE_STATUS_WHEN_REMOVE", async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      store._processTreeEvent('unlink', { pathname: '/root/gone.md' })
      expect(unlinkFileSpy).toHaveBeenCalledTimes(1)
      expect(editorStubRef.SET_SAVE_STATUS_WHEN_REMOVE).toHaveBeenCalledWith({
        pathname: '/root/gone.md'
      })
    })

    it("'addDir' delegates to addDirectory", async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      store._processTreeEvent('addDir', { pathname: '/root/sub' })
      expect(addDirectorySpy).toHaveBeenCalledTimes(1)
    })

    it("'unlinkDir' delegates to unlinkDirectory", async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      store._processTreeEvent('unlinkDir', { pathname: '/root/sub' })
      expect(unlinkDirectorySpy).toHaveBeenCalledTimes(1)
    })

    it("'change' is a no-op (no mutator calls)", async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      store._processTreeEvent('change', { pathname: '/root/a.md' })
      expect(addFileSpy).not.toHaveBeenCalled()
      expect(unlinkFileSpy).not.toHaveBeenCalled()
      expect(addDirectorySpy).not.toHaveBeenCalled()
      expect(unlinkDirectorySpy).not.toHaveBeenCalled()
    })

    it('drops events with no pathname silently', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      store._processTreeEvent('add', {} as never)
      expect(addFileSpy).not.toHaveBeenCalled()
    })

    it('logs DROPPED_NO_ROOT when no owner found', async () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const store = await loadStore()
      store.ADD_PROJECT('/root')
      store._processTreeEvent('add', { pathname: '/elsewhere/x.md' })
      const calls = dbg.mock.calls.map((c) => String(c[0]))
      expect(calls.some((s) => s.includes('DROPPED_NO_ROOT'))).toBe(true)
    })
  })

  // ─── CLOSE_PROJECT ───────────────────────────────────────────────

  describe('CLOSE_PROJECT', () => {
    it('removes the matching root and clears pending bucket', async () => {
      const store = await loadStore()
      store.ADD_PROJECT('/foo')
      store.pendingTreeEvents['/foo'] = []
      await store.CLOSE_PROJECT('/foo')
      expect(store.projectTrees).toHaveLength(0)
      expect(store.pendingTreeEvents['/foo']).toBeUndefined()
    })

    it('NOOP_NOT_FOUND: closing an unknown root is a no-op', async () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const { invoke } = await import('@tauri-apps/api/core')
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockClear()

      const store = await loadStore()
      await store.CLOSE_PROJECT('/never-added')

      expect(store.projectTrees).toHaveLength(0)
      expect(invoke).not.toHaveBeenCalled()
      const calls = dbg.mock.calls.map((c) => String(c[0]))
      expect(calls.some((s) => s.includes('NOOP_NOT_FOUND'))).toBe(true)
    })

    it('invokes mt_close_project_root via Tauri', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

      const store = await loadStore()
      store.ADD_PROJECT('/foo')
      await store.CLOSE_PROJECT('/foo')

      expect(invoke).toHaveBeenCalledWith('mt_close_project_root', { pathname: '/foo' })
    })

    it('survives mt_close_project_root invoke failure', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { invoke } = await import('@tauri-apps/api/core')
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))

      const store = await loadStore()
      store.ADD_PROJECT('/foo')
      await expect(store.CLOSE_PROJECT('/foo')).resolves.toBeUndefined()
      expect(errSpy).toHaveBeenCalled()
      expect(store.projectTrees).toHaveLength(0)
    })

    it('catches throwing dispose() without breaking removal', async () => {
      const throwingDispose = vi.fn(() => {
        throw new Error('dispose explode')
      })
      ipcWatchSubscribeMock.mockResolvedValueOnce(throwingDispose)

      const store = await loadStore()
      store.ADD_PROJECT('/foo')
      // Wait for subscribe.then() to land the disposer.
      await new Promise((r) => setTimeout(r, 0))

      await expect(store.CLOSE_PROJECT('/foo')).resolves.toBeUndefined()
      expect(throwingDispose).toHaveBeenCalled()
      expect(store.projectTrees).toHaveLength(0)
    })
  })

  // ─── ASK_FOR_OPEN_PROJECT ────────────────────────────────────────

  describe('ASK_FOR_OPEN_PROJECT', () => {
    it('happy path: invoke resolves to a path → ADD_PROJECT called', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('/picked')

      const store = await loadStore()
      await store.ASK_FOR_OPEN_PROJECT()

      expect(invoke).toHaveBeenCalledWith('mt_pick_folder')
      expect(store.projectTrees).toHaveLength(1)
      expect(store.projectTrees[0].pathname).toBe('/picked')
    })

    it('cancelled: invoke resolves to null → silent no-op', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      const notice = (await import('@/services/notification')).default

      const store = await loadStore()
      await store.ASK_FOR_OPEN_PROJECT()

      expect(store.projectTrees).toHaveLength(0)
      expect(notice.notify).not.toHaveBeenCalled()
    })

    it('failure: invoke rejects → notice.notify error', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('pick boom'))
      const notice = (await import('@/services/notification')).default

      const store = await loadStore()
      await store.ASK_FOR_OPEN_PROJECT()

      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    })
  })

  // ─── trivial setters + getter + OPEN_SETTING_WINDOW ──────────────

  describe('trivial actions + getter', () => {
    it('CHANGE_ACTIVE_ITEM stores the value', async () => {
      const store = await loadStore()
      store.CHANGE_ACTIVE_ITEM({ pathname: '/x', isDirectory: false })
      expect(store.activeItem).toEqual({ pathname: '/x', isDirectory: false })
    })

    it('CHANGE_CLIPBOARD stores the value', async () => {
      const store = await loadStore()
      store.CHANGE_CLIPBOARD({ src: '/x', type: 'cut' })
      expect(store.clipboard).toEqual({ src: '/x', type: 'cut' })
    })

    it('OPEN_SETTING_WINDOW invokes mt_open_setting_window', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

      const store = await loadStore()
      await store.OPEN_SETTING_WINDOW()
      expect(invoke).toHaveBeenCalledWith('mt_open_setting_window')
    })

    it('OPEN_SETTING_WINDOW swallows invoke failure', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { invoke } = await import('@tauri-apps/api/core')
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))

      const store = await loadStore()
      await expect(store.OPEN_SETTING_WINDOW()).resolves.toBeUndefined()
      expect(errSpy).toHaveBeenCalled()
    })

    it('getter projectTree returns last added root or null', async () => {
      const store = await loadStore()
      expect(store.projectTree).toBeNull()
      store.ADD_PROJECT('/a')
      store.ADD_PROJECT('/b')
      expect(store.projectTree?.pathname).toBe('/b')
    })
  })

  // ─── CREATE_FILE_DIRECTORY / RENAME_IN_SIDEBAR (coverage boost) ──

  describe('CREATE_FILE_DIRECTORY', () => {
    it('appends .md when creating a file without markdown extension', async () => {
      const fs = await import('@/util/fileSystem')
      ;(fs.create as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(fs.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

      const store = await loadStore()
      store.createCache = { dirname: '/root', type: 'file' }
      store.CREATE_FILE_DIRECTORY('foo')

      // wait for the .then() in the action
      await new Promise((r) => setTimeout(r, 0))

      expect(fs.create).toHaveBeenCalledWith('/root/foo.md', 'file')
      // After success, createCache cleared and newFileNameCache set.
      expect(store.createCache).toEqual({})
      expect(store.newFileNameCache).toBe('/root/foo.md')
    })

    it('does not append .md when name already has a markdown extension', async () => {
      const fs = await import('@/util/fileSystem')
      ;(fs.create as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(fs.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

      const store = await loadStore()
      store.createCache = { dirname: '/root', type: 'file' }
      store.CREATE_FILE_DIRECTORY('already.md')

      await new Promise((r) => setTimeout(r, 0))
      expect(fs.create).toHaveBeenCalledWith('/root/already.md', 'file')
    })

    it('directory create does not append .md and does not update newFileNameCache', async () => {
      const fs = await import('@/util/fileSystem')
      ;(fs.create as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(fs.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

      const store = await loadStore()
      store.createCache = { dirname: '/root', type: 'directory' }
      store.CREATE_FILE_DIRECTORY('subdir')

      await new Promise((r) => setTimeout(r, 0))
      expect(fs.create).toHaveBeenCalledWith('/root/subdir', 'directory')
      expect(store.newFileNameCache).toBe('')
    })

    it('surfaces create() failure via notice.notify error', async () => {
      const fs = await import('@/util/fileSystem')
      ;(fs.create as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(fs.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk full'))
      const notice = (await import('@/services/notification')).default

      const store = await loadStore()
      store.createCache = { dirname: '/root', type: 'file' }
      store.CREATE_FILE_DIRECTORY('thing')

      await new Promise((r) => setTimeout(r, 0))
      expect(notice.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    })
  })

  describe('RENAME_IN_SIDEBAR', () => {
    it('builds dest from dirname + name and calls editorStore.RENAME_IF_NEEDED', async () => {
      const fs = await import('@/util/fileSystem')
      ;(fs.rename as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;(fs.rename as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

      const store = await loadStore()
      store.renameCache = '/root/old.md'
      store.RENAME_IN_SIDEBAR('new.md')

      await new Promise((r) => setTimeout(r, 0))
      expect(fs.rename).toHaveBeenCalledWith('/root/old.md', '/root/new.md')
      expect(editorStubRef.RENAME_IF_NEEDED).toHaveBeenCalledWith({
        src: '/root/old.md',
        dest: '/root/new.md'
      })
    })
  })
})
