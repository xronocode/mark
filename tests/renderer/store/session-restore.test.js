// FILE: tests/renderer/store/session-restore.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-69 session restore of store/editor.js — the snapshot (tab paths in order, active tab, project roots), the boot gate (restore only on a cold launch without files and with restoreSessionOnLaunch on; the debounced autosave starts only after it), the restore order (folders → files through mt::open-file → active tab) and the skip of missing paths.
//   SCOPE: _sessionSnapshot, _saveSessionState, START_SESSION_AUTOSAVE, BOOT_SESSION, RESTORE_SESSION, the APPLY_BOOTSTRAP_EDITOR hook.
//   DEPENDS: Vitest + jsdom, real pinia stores (editor, project, preferences) with an in-memory ipcPrefs and a stubbed window.electron.ipcRenderer.
//   LINKS: .grace/changes/archive/C-69 R-1/R-2/R-4; e2e tests/e2e/session-restore.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   formatB - complete pending format fixture.
//   PREFS - in-memory prefs backing the ipcPrefs mock.
//   FILES - fake files the ipcFs.stat mock answers isFile for.
//   DIRS - fake directories the ipcFs.stat mock answers isDirectory for.
//   editorStore - the store under test.
//   projectStore - project roots (OPEN_RECENT_FOLDER stubbed to push a root).
//   preferencesStore - restoreSessionOnLaunch source.
//   originalElectron - the setup's window.electron, restored after each test.
//   openFileInvoke - the mt::open-file stand-in: creates the tab like the mt::open-new-tab round trip.
//   flush - waits for the debounced autosave.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-19 C-69: new — the boot-gate case fails if the autosave starts before the restore (an empty boot would overwrite the session), the order case fails without the folder/active steps.
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestPinia } from '../pinia'

const PREFS = new Map()
const FILES = new Set()
const DIRS = new Set()

vi.mock('@/ipc/runtime', () => ({
  ipcFs: {
    read: vi.fn(async () => '# doc'),
    write: vi.fn(),
    stat: vi.fn(async (p) => {
      if (FILES.has(p)) return { isFile: true, isDirectory: false }
      if (DIRS.has(p)) return { isFile: false, isDirectory: true }
      throw new Error('ENOENT')
    })
  },
  ipcWatch: { subscribe: vi.fn(async () => vi.fn()), unsubscribe: vi.fn(async () => {}) },
  ipcRecent: { add: vi.fn(async () => {}), list: vi.fn(async () => []), clear: vi.fn(async () => {}) },
  ipcPrefs: {
    get: vi.fn(async (k) => (PREFS.has(k) ? PREFS.get(k) : null)),
    set: vi.fn(async (k, v) => { PREFS.set(k, v) }),
    getAll: vi.fn(async () => ({}))
  }
}))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn(async () => undefined) } }))

let editorStore
let projectStore
let preferencesStore
let originalElectron

const openFileInvoke = vi.fn(async (channel, pathname, options = {}) => {
  if (channel !== 'mt::open-file') return
  await editorStore.NEW_TAB_WITH_CONTENT({
    markdownDocument: {
      markdown: `# ${pathname}`,
      pathname,
      filename: pathname.split('/').pop(),
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      trimTrailingNewline: 3
    },
    options,
    selected: true
  })
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 450))

beforeEach(async () => {
  PREFS.clear(); FILES.clear(); DIRS.clear()
  openFileInvoke.mockClear()
  originalElectron = window.electron
  window.electron = {
    ...(originalElectron || {}),
    ipcRenderer: {
      ...((originalElectron && originalElectron.ipcRenderer) || {}),
      invoke: openFileInvoke,
      send: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn()
    }
  }
  setupTestPinia()
  const { useEditorStore } = await import('@/store/editor')
  const { useProjectStore } = await import('@/store/project')
  const { usePreferencesStore } = await import('@/store/preferences')
  editorStore = useEditorStore()
  projectStore = useProjectStore()
  preferencesStore = usePreferencesStore()
  vi.spyOn(projectStore, 'OPEN_RECENT_FOLDER').mockImplementation(async (p) => {
    projectStore.projectTrees.push({ pathname: p, name: p, folders: [], files: [] })
  })
})

afterEach(() => {
  window.electron = originalElectron
  vi.restoreAllMocks()
})

describe('session snapshot (C-69 R-1)', () => {
  it('saves the tab paths in order (untitled skipped), the active tab and the project roots', async () => {
    projectStore.projectTrees.push({ pathname: '/proj', name: 'proj', folders: [], files: [] })
    editorStore.tabs = [{ pathname: '/proj/a.md' }, { pathname: '' }, { pathname: '/proj/b.md' }]
    editorStore.currentFile = editorStore.tabs[2]
    await editorStore._saveSessionState()
    expect(PREFS.get('lastSessionTabs')).toEqual(['/proj/a.md', '/proj/b.md'])
    expect(PREFS.get('lastSessionActive')).toBe('/proj/b.md')
    expect(PREFS.get('lastSessionFolders')).toEqual(['/proj'])
  })
})

describe('restore (C-69 R-2/R-4)', () => {
  it('reopens existing folders, then files through mt::open-file in order, then the active tab; missing paths are skipped', async () => {
    DIRS.add('/proj')
    FILES.add('/proj/a.md'); FILES.add('/proj/b.md')
    PREFS.set('lastSessionFolders', ['/proj', '/gone-dir'])
    PREFS.set('lastSessionTabs', ['/proj/a.md', '/proj/gone.md', '/proj/b.md'])
    PREFS.set('lastSessionActive', '/proj/a.md')
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})

    await editorStore.RESTORE_SESSION()

    expect(projectStore.OPEN_RECENT_FOLDER).toHaveBeenCalledTimes(1)
    expect(projectStore.OPEN_RECENT_FOLDER).toHaveBeenCalledWith('/proj')
    expect(openFileInvoke.mock.calls.map((c) => c[1])).toEqual(['/proj/a.md', '/proj/b.md'])
    expect(editorStore.tabs.map((t) => t.pathname)).toEqual(['/proj/a.md', '/proj/b.md'])
    expect(editorStore.currentFile.pathname).toBe('/proj/a.md')
    expect(debug).toHaveBeenCalledWith(
      '[EditorStore][bootSession][BLOCK_SESSION_RESTORED] folders=1 tabs=2 skipped=2'
    )
  })

  it('an already open root is not reopened; no saved session does nothing', async () => {
    projectStore.projectTrees.push({ pathname: '/proj', name: 'proj', folders: [], files: [] })
    DIRS.add('/proj')
    PREFS.set('lastSessionFolders', ['/proj'])
    await editorStore.RESTORE_SESSION()
    expect(projectStore.OPEN_RECENT_FOLDER).not.toHaveBeenCalled()
    expect(openFileInvoke).not.toHaveBeenCalled()
    expect(editorStore.tabs).toHaveLength(0)
  })
})

describe('boot gate (C-69 R-1/R-2)', () => {
  it('a cold launch restores, and only then the autosave starts (an empty boot never overwrites the session)', async () => {
    FILES.add('/a.md')
    PREFS.set('lastSessionTabs', ['/a.md'])
    PREFS.set('lastSessionActive', '/a.md')

    await editorStore.BOOT_SESSION({ restore: true })
    expect(editorStore.tabs.map((t) => t.pathname)).toEqual(['/a.md'])
    // Nothing changed after the restore: the saved session is untouched.
    await flush()
    expect(PREFS.get('lastSessionTabs')).toEqual(['/a.md'])

    // A later change is autosaved (debounced).
    editorStore.tabs.push({ pathname: '/b.md' })
    await flush()
    expect(PREFS.get('lastSessionTabs')).toEqual(['/a.md', '/b.md'])
  })

  it('restoreSessionOnLaunch off: no restore, the autosave still runs', async () => {
    FILES.add('/a.md')
    PREFS.set('lastSessionTabs', ['/a.md'])
    preferencesStore.restoreSessionOnLaunch = false
    await editorStore.BOOT_SESSION({ restore: true })
    expect(openFileInvoke).not.toHaveBeenCalled()
    editorStore.tabs.push({ pathname: '/c.md' })
    await flush()
    expect(PREFS.get('lastSessionTabs')).toEqual(['/c.md'])
  })

  it('a launch with files (bootstrap addBlankTab false) does not restore', async () => {
    FILES.add('/a.md')
    PREFS.set('lastSessionTabs', ['/a.md'])
    editorStore.APPLY_BOOTSTRAP_EDITOR({ addBlankTab: false, markdownList: [] })
    await flush()
    expect(openFileInvoke).not.toHaveBeenCalled()
  })

  it('a cold launch through APPLY_BOOTSTRAP_EDITOR restores the session', async () => {
    FILES.add('/a.md')
    PREFS.set('lastSessionTabs', ['/a.md'])
    editorStore.APPLY_BOOTSTRAP_EDITOR({ addBlankTab: true, markdownList: [] })
    await vi.waitFor(() => expect(openFileInvoke).toHaveBeenCalledWith('mt::open-file', '/a.md', {}))
  })
})

// ── C-MULTI-SOURCE-WORKSPACE: visible degradation ──────────────────

describe('restore degradation (C-MULTI-SOURCE-WORKSPACE)', () => {
  it('a missing root produces a visible notice but never blocks the rest', async () => {
    const notice = (await import('@/services/notification')).default
    notice.notify.mockClear()
    DIRS.add('/proj')
    FILES.add('/proj/a.md')
    PREFS.set('lastSessionFolders', [
      '/vol/e2e/Library/Mobile Documents/com~apple~CloudDocs/Notes',
      '/proj'
    ])
    PREFS.set('lastSessionTabs', ['/proj/a.md'])
    PREFS.set('lastSessionActive', '/proj/a.md')
    vi.spyOn(console, 'debug').mockImplementation(() => {})

    await editorStore.RESTORE_SESSION()

    // The available root, tab and active tab restored; the missing iCloud
    // root degraded visibly.
    expect(projectStore.OPEN_RECENT_FOLDER).toHaveBeenCalledWith('/proj')
    expect(editorStore.tabs.map((t) => t.pathname)).toEqual(['/proj/a.md'])
    expect(editorStore.currentFile.pathname).toBe('/proj/a.md')
    // i18n resolves against the real en table here, so assert on the
    // notice's type and payload rather than the locale key.
    const warnings = notice.notify.mock.calls
      .map((c) => c[0])
      .filter((c) => c.type === 'warning')
    expect(warnings).toHaveLength(1)
    expect(String(warnings[0].message)).toContain('Mobile Documents')
  })

  it('a failed file open (evicted iCloud path) surfaces an error notice, not silence', async () => {
    const notice = (await import('@/services/notification')).default
    notice.notify.mockClear()
    const evicted = '/vol/e2e/Library/Mobile Documents/com~apple~CloudDocs/Notes/evicted.md'
    // stat says the file exists (the tree/restore list saw it) but the
    // read fails mid-download.
    FILES.add(evicted)
    PREFS.set('lastSessionFolders', [])
    PREFS.set('lastSessionTabs', [evicted])
    window.electron.ipcRenderer.invoke = vi.fn(async () => {
      throw new Error('MT_FS_READ_FAILED: content not downloaded')
    })
    vi.spyOn(console, 'debug').mockImplementation(() => {})

    await editorStore.RESTORE_SESSION()

    expect(editorStore.tabs).toHaveLength(0)
    const calls = notice.notify.mock.calls.map((c) => c[0])
    expect(calls.some((c) => c.type === 'error' && String(c.message).includes('not downloaded')))
      .toBe(true)
  })
})

const formatB = { encoding: 'utf16be', isBom: true, lineEnding: 'crlf', finalNewline: 1 }
describe('pending session format choices (B)', () => {
  it('persists named selected formats and format dirty intent without text or saved proof', async () => {
    await openFileInvoke('mt::open-file', '/a.md'); await openFileInvoke('mt::open-file', '/b.md')
    const a = editorStore.tabs[0]; const b = editorStore.tabs[1]
    editorStore.SET_FILE_ENCODING({ encoding:'utf16be',isBom:true })
    a.markdown = 'TEXT ONLY UNSAVED'; a.isSaved = false
    b.requiresExplicitSave = true
    editorStore.tabs.push({ pathname:'',markdown:'PRIVATE DRAFT' })
    await editorStore._saveSessionState()
    const records = PREFS.get('lastSessionFormats')
    expect(records).toHaveLength(2)
    expect(records[0]).toEqual({ pathname:'/a.md',format:a.savedFormat,dirty:false })
    expect(records[1].dirty).toBe(true)
    expect(JSON.stringify(records)).not.toMatch(/TEXT ONLY|PRIVATE|savedFormat|documentToken|history/)
  })
  it('restores selected policy onto a fresh actual disk checkpoint and preserves explicit dirty intent', async () => {
    FILES.add('/a.md'); PREFS.set('lastSessionTabs',['/a.md'])
    PREFS.set('lastSessionFormats',[{ pathname:'/a.md',format:formatB,dirty:true }])
    await editorStore.RESTORE_SESSION()
    const tab = editorStore.tabs[0]
    expect(tab.savedFormat).toEqual({ encoding:'utf8',isBom:false,lineEnding:'lf',finalNewline:3 })
    expect(tab.encoding).toEqual({ encoding:'utf16be',isBom:true }); expect(tab.lineEnding).toBe('crlf')
    expect(tab.trimTrailingNewline).toBe(1); expect(tab.isSaved).toBe(false); expect(tab.requiresExplicitSave).toBe(true)
    editorStore.LISTEN_FOR_CONTENT_CHANGE({ id:tab.id,markdown:tab.savedMarkdown })
    expect(tab.isSaved).toBe(false)
    const before = JSON.parse(JSON.stringify(tab))
    await openFileInvoke('mt::open-file','/a.md',{restoredFormat:{format:{...formatB,encoding:'utf8'},dirty:false}})
    expect(editorStore.tabs).toHaveLength(1); expect(JSON.parse(JSON.stringify(tab))).toEqual(before)
  })
  it('keeps a dirty obligation when the restored format now matches externally changed disk metadata', async () => {
    await openFileInvoke('mt::open-file','/a.md',{restoredFormat:{format:{encoding:'utf8',isBom:false,lineEnding:'lf',finalNewline:3},dirty:true}})
    expect(editorStore.tabs[0].isSaved).toBe(false); expect(editorStore.tabs[0].requiresExplicitSave).toBe(true)
  })
  it('ignores malformed/foreign records visibly and opens old sessions with the actual format', async () => {
    const notice = (await import('@/services/notification')).default; notice.notify.mockClear()
    FILES.add('/a.md'); PREFS.set('lastSessionTabs',['/a.md'])
    PREFS.set('lastSessionFormats',[null,{pathname:'/else.md',format:formatB,dirty:true},{pathname:'/a.md',format:{...formatB,encoding:'utf32be'},dirty:true}])
    await editorStore.RESTORE_SESSION()
    expect(editorStore.tabs[0].encoding.encoding).toBe('utf8'); expect(editorStore.tabs[0].isSaved).toBe(true)
    expect(notice.notify).toHaveBeenCalled()
  })
  it('freezes formats with the disabled automatic restore offer before autosave changes preferences', async () => {
    FILES.add('/a.md'); preferencesStore.restoreSessionOnLaunch = false
    PREFS.set('lastSessionTabs',['/a.md']); PREFS.set('lastSessionFormats',[{pathname:'/a.md',format:formatB,dirty:true}])
    await editorStore.BOOT_SESSION({restore:true})
    const offer = editorStore.coldStartSession
    PREFS.set('lastSessionFormats',[])
    expect(offer.formats).toEqual([{pathname:'/a.md',format:formatB,dirty:true}])
    await editorStore.RESTORE_SESSION({from:offer})
    expect(editorStore.tabs[0].encoding.encoding).toBe('utf16be'); expect(editorStore.tabs[0].isSaved).toBe(false)
  })
  it('preserves pending choices through current-run close and reopen', async () => {
    FILES.add('/a.md'); await openFileInvoke('mt::open-file','/a.md')
    editorStore.SET_LINE_ENDING('crlf')
    const {useRecentlyClosedStore} = await import('@/store/recentlyClosed'); const recent = useRecentlyClosedStore()
    editorStore.FORCE_CLOSE_TAB(editorStore.tabs[0])
    expect(recent.entries[0].restoredFormat.format.lineEnding).toBe('crlf')
    expect(await recent.REOPEN_NEWEST()).toBe(true)
    expect(editorStore.tabs[0].lineEnding).toBe('crlf'); expect(editorStore.tabs[0].savedFormat.lineEnding).toBe('lf')
    expect(editorStore.tabs[0].isSaved).toBe(false)
  })
})
