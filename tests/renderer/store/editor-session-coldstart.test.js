/**
 * Cold-start session semantics for store/editor.js
 * (C-FIX-009-SESSION-COLD-START) plus the FORCE_CLOSE_TAB record hook
 * and the reopen-closed bus listeners (C-FIX-009-RECENTLY-CLOSED).
 * Pins the owner decision recorded in the 2.5.x-next train, FIX-009:
 * the boot offer exists only when this launch skipped auto-restore, the
 * explicit restore never silently no-ops, and closed saved-file tabs
 * enter the recovery history at their original strip position.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('@/ipc/runtime', () => ({
  ipcFs: {
    read: vi.fn(async () => ''),
    stat: vi.fn(async () => ({ isFile: true, isDirectory: false, mtimeMs: 1 })),
    write: vi.fn()
  },
  ipcWatch: { subscribe: vi.fn(async () => vi.fn()) },
  ipcRecent: { add: vi.fn(), list: vi.fn(async () => []), clear: vi.fn() },
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}) }
}))
vi.mock('deep-equal', () => ({ default: vi.fn(() => false) }))
vi.mock('@/util', () => ({
  hasKeys: vi.fn((o) => o && Object.keys(o).length > 0),
  getUniqueId: vi.fn(() => `uid-${Math.random()}`),
  deepClone: vi.fn((o) => JSON.parse(JSON.stringify(o))),
  isOsx: false,
  animatedScrollTo: vi.fn()
}))
vi.mock('@/util/listToTree', () => ({ default: vi.fn((arr) => arr) }))
vi.mock('@/store/help', () => ({
  createDocumentState: vi.fn(),
  getOptionsFromState: vi.fn(() => ({})),
  getSingleFileState: vi.fn((o) => ({
    id: `id-${Math.random()}`,
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
  getBlankFileState: vi.fn(() => ({
    id: `blank-${Math.random()}`,
    filename: 'Untitled-1',
    pathname: '',
    markdown: '\n',
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
  }))
}))
vi.mock('@/store/project', () => ({
  useProjectStore: vi.fn(() => ({
    projectTrees: [],
    OPEN_RECENT_FOLDER: vi.fn(async () => {})
  }))
}))
vi.mock('@/store/preferences', () => ({
  usePreferencesStore: vi.fn(() => ({ restoreSessionOnLaunch: undefined }))
}))

import { ipcPrefs, ipcFs } from '@/ipc/runtime'
import bus from '@/bus'

const electronInvoke = vi.fn(async () => true)

describe('store/editor.js — FIX-009 cold start + record hooks', () => {
  let editorStore, recentlyClosed, usePreferencesStore

  const loadStores = async () => {
    const { useEditorStore } = await import('@/store/editor')
    const { useRecentlyClosedStore } = await import('@/store/recentlyClosed')
    const preferences = await import('@/store/preferences')
    usePreferencesStore = preferences.usePreferencesStore
    return { editorStore: useEditorStore(), recentlyClosed: useRecentlyClosedStore() }
  }

  beforeEach(async () => {
    setupTestPinia()
    vi.mocked(ipcPrefs.get).mockReset()
    vi.mocked(ipcFs.stat).mockReset()
    vi.mocked(ipcFs.stat).mockImplementation(async () => ({ isFile: true, isDirectory: false, mtimeMs: 1 }))
    electronInvoke.mockClear()
    electronInvoke.mockResolvedValue(true)
    window.electron = { ipcRenderer: { invoke: electronInvoke, send: vi.fn() } }
    ;({ editorStore, recentlyClosed } = await loadStores())
    editorStore.tabs = []
    editorStore.currentFile = {}
    editorStore.coldStartSession = null
  })

  describe('BOOT_SESSION cold-start offer', () => {
    it('auto-restores when the preference is on and offers nothing', async () => {
      vi.mocked(usePreferencesStore).mockReturnValue({ restoreSessionOnLaunch: true })
      vi.mocked(ipcPrefs.get).mockImplementation(async (key) => {
        if (key === 'lastSessionTabs') return ['/tmp/a.md']
        if (key === 'lastSessionFolders') return []
        if (key === 'lastSessionActive') return null
        return null
      })
      await editorStore.BOOT_SESSION({ restore: true })
      expect(editorStore.coldStartSession).toBeNull()
      expect(electronInvoke).toHaveBeenCalledWith('mt::open-file', '/tmp/a.md', {})
    })

    it('skipped restore (preference off) records the boot-time snapshot as the offer', async () => {
      vi.mocked(usePreferencesStore).mockReturnValue({ restoreSessionOnLaunch: false })
      vi.mocked(ipcPrefs.get).mockImplementation(async (key) =>
        key === 'lastSessionTabs' ? ['/tmp/a.md', '/tmp/b.md'] : null
      )
      await editorStore.BOOT_SESSION({ restore: true })
      expect(editorStore.coldStartSession).toEqual({
        tabs: ['/tmp/a.md', '/tmp/b.md'],
        folders: [],
        active: null
      })
      expect(electronInvoke).not.toHaveBeenCalled()
    })

    it('a skipped restore with an empty snapshot offers nothing', async () => {
      vi.mocked(usePreferencesStore).mockReturnValue({ restoreSessionOnLaunch: false })
      vi.mocked(ipcPrefs.get).mockResolvedValue([])
      await editorStore.BOOT_SESSION({ restore: true })
      expect(editorStore.coldStartSession).toBeNull()
    })

    it('a boot with files to open (restore=false) never offers', async () => {
      vi.mocked(ipcPrefs.get).mockResolvedValue(['/tmp/a.md'])
      await editorStore.BOOT_SESSION({ restore: false })
      expect(editorStore.coldStartSession).toBeNull()
    })
  })

  describe('RESTORE_SESSION result + offer consumption', () => {
    it('an explicit restore reopens the FROZEN offer after the live preferences changed (review wave 2 regression)', async () => {
      vi.mocked(usePreferencesStore).mockReturnValue({ restoreSessionOnLaunch: false })
      vi.mocked(ipcPrefs.get).mockImplementation(async (key) => {
        if (key === 'lastSessionTabs') return ['/tmp/previous.md']
        if (key === 'lastSessionFolders') return []
        if (key === 'lastSessionActive') return null
        return null
      })
      await editorStore.BOOT_SESSION({ restore: true })
      expect(editorStore.coldStartSession).toMatchObject({ tabs: ['/tmp/previous.md'] })

      // The session autosave legitimately rewrites the live preferences
      // after the run opens/closes something: the visible offer must
      // still restore what it advertises.
      vi.mocked(ipcPrefs.get).mockImplementation(async (key) => {
        if (key === 'lastSessionTabs') return []
        if (key === 'lastSessionFolders') return []
        return null
      })
      const result = await editorStore.RESTORE_SESSION({ from: editorStore.coldStartSession })
      expect(result.tabs).toBe(1)
      expect(electronInvoke).toHaveBeenCalledWith('mt::open-file', '/tmp/previous.md', {})
      expect(editorStore.coldStartSession).toBeNull()
    })
    it('returns { folders, tabs, skipped } counts for missing paths', async () => {
      vi.mocked(ipcFs.stat).mockImplementation(async (p) => {
        if (p === '/tmp/gone.md') throw new Error('not found')
        if (p === '/tmp/root') return { isFile: false, isDirectory: true, mtimeMs: 1 }
        return { isFile: true, isDirectory: false, mtimeMs: 1 }
      })
      vi.mocked(ipcPrefs.get).mockImplementation(async (key) => {
        if (key === 'lastSessionTabs') return ['/tmp/a.md', '/tmp/gone.md']
        if (key === 'lastSessionFolders') return ['/tmp/root', '/tmp/nope']
        return null
      })
      const result = await editorStore.RESTORE_SESSION()
      expect(result).toEqual({ folders: 1, tabs: 1, skipped: 2 })
    })

    it('a successful explicit restore consumes the cold-start offer', async () => {
      editorStore.coldStartSession = { tabs: ['/tmp/a.md'] }
      vi.mocked(ipcPrefs.get).mockImplementation(async (key) =>
        key === 'lastSessionTabs' ? ['/tmp/a.md'] : null
      )
      const result = await editorStore.RESTORE_SESSION()
      expect(result.tabs).toBe(1)
      expect(editorStore.coldStartSession).toBeNull()
    })

    it('a restore that opens nothing keeps the offer (the notice path)', async () => {
      editorStore.coldStartSession = { tabs: ['/tmp/gone.md'] }
      vi.mocked(ipcFs.stat).mockRejectedValue(new Error('not found'))
      vi.mocked(ipcPrefs.get).mockImplementation(async (key) =>
        key === 'lastSessionTabs' ? ['/tmp/gone.md'] : null
      )
      const result = await editorStore.RESTORE_SESSION()
      expect(result.folders + result.tabs).toBe(0)
      expect(editorStore.coldStartSession).not.toBeNull()
    })
  })

  describe('FORCE_CLOSE_TAB records the history entry', () => {
    it('records pathname tabs with strip position and active flag', () => {
      const a = { id: 'a', pathname: '/tmp/a.md', filename: 'a.md', isSaved: true, markdown: 'x' }
      const b = { id: 'b', pathname: '/tmp/b.md', filename: 'b.md', isSaved: true, markdown: 'x' }
      editorStore.tabs = [a, b]
      editorStore.currentFile = b
      editorStore.FORCE_CLOSE_TAB(b)
      expect(recentlyClosed.count).toBe(1)
      const entry = recentlyClosed.entries[0]
      expect(entry.pathname).toBe('/tmp/b.md')
      expect(entry.stripIndex).toBe(1)
      expect(entry.wasActive).toBe(true)
    })

    it('untitled tabs never enter the history', () => {
      const u = { id: 'u', pathname: '', filename: 'Untitled-1', isSaved: true, markdown: 'x' }
      editorStore.tabs = [u]
      editorStore.currentFile = u
      editorStore.FORCE_CLOSE_TAB(u)
      expect(recentlyClosed.isEmpty).toBe(true)
    })
  })

  describe('reopen-closed bus listeners', () => {
    const listenerFor = (name) => {
      const call = vi.mocked(bus.on).mock.calls.find(([n]) => n === name)
      expect(call).toBeTruthy()
      return call[1]
    }

    it('mt::editor-reopen-closed-tab reopens the newest entry', async () => {
      editorStore.LISTEN_FOR_REOPEN_CLOSED()
      recentlyClosed.RECORD_CLOSE({
        pathname: '/tmp/a.md',
        filename: 'a.md',
        stripIndex: 0,
        wasActive: false,
        root: '',
        closedAt: 1
      })
      await listenerFor('mt::editor-reopen-closed-tab')()
      expect(electronInvoke).toHaveBeenCalledWith('mt::open-file', '/tmp/a.md', {})
    })

    it('mt::recently-closed-select waits for the tab and selects it', async () => {
      editorStore.LISTEN_FOR_REOPEN_CLOSED()
      const tab = { id: 't1', pathname: '/tmp/a.md', filename: 'a.md', markdown: 'x' }
      editorStore.tabs = [tab]
      editorStore.currentFile = {}
      const done = listenerFor('mt::recently-closed-select')({ pathname: '/tmp/a.md' })
      await done
      // Pinia wraps state in reactive proxies, so compare identity by
      // the stable fields rather than object reference.
      expect(editorStore.currentFile.id).toBe('t1')
      expect(editorStore.currentFile.pathname).toBe('/tmp/a.md')
    })
  })
})
