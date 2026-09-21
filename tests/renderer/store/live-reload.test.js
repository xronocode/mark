/**
 * M-032 live-reload — store-level tests for editor.js
 * APPLY_FILE_CHANGE async disk-read path + loadChange cursor/scrollTop
 * preservation + hash-skip + liveReload preference integration.
 *
 * Covers the key M-032 behaviors:
 *   1. loadChange preserves cursor and scrollTop across reload
 *   2. APPLY_FILE_CHANGE reads file via ipcFs when change.data is missing
 *   3. Hash-skip: same content doesn't trigger loadChange
 *   4. liveReload preference off skips reload for clean tabs
 *   5. Dirty tabs are not auto-reloaded (unless previewMode)
 *   6. previewMode tabs always auto-reload (M-033 integration)
 *   7. C-2 follow-up: the file-changed reload carries contentReloaded: true
 *      so editor.vue clamps the preserved scrollTop into the new range
 *
 * Pitfall mitigations (Phase-4 wave 1 conventions):
 *   #1 — sibling stores stubbed as plain objects
 *   #2 — bus singleton mocked at both @/bus and ../bus
 *   #4 — i18n / commands / element-plus stubbed so muya never loads
 */

import { setupTestPinia } from '../pinia'

// ─── module-level mocks (must precede dynamic store import) ───────────

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

vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn(async () => 'confirm'),
    alert: vi.fn(async () => undefined)
  }
}))

vi.mock('@/commands', () => ({
  FileEncodingCommand: class {},
  LineEndingCommand: class {},
  QuickOpenCommand: class {},
  TrailingNewlineCommand: class {}
}))

// M-032: mock ipcFs for the async disk-read path in APPLY_FILE_CHANGE.
const __ipcFsMock = {
  read: vi.fn(async () => 'mocked content'),
  write: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn()
}
vi.mock('@/ipc/runtime', () => ({
  ipcFs: __ipcFsMock,
  ipcWatch: {},
  ipcSearch: {},
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}), getAll: vi.fn(async () => ({})) },
  ipcWorkspace: {},
  ipcFonts: {},
  ipcRecent: { add: vi.fn(async () => {}), list: vi.fn(async () => []), clear: vi.fn(async () => {}) },
  ipcShortcut: {},
  ipcSpell: {},
  ipcMenu: {},
  ipcPandoc: {},
  ipcUpdater: {},
  ipcScreenshot: {},
  ipcSecret: {},
  ipc: { fs: __ipcFsMock }
}))

const __preferencesStub = {
  autoSave: false,
  autoSaveDelay: 5000,
  liveReload: true,
  defaultEncoding: 'utf8',
  endOfLine: 'lf',
  zoom: 1,
  previewModeOnFinderOpen: true,
  SET_USER_PREFERENCE: vi.fn(),
  SET_MODE: vi.fn(),
  SET_SINGLE_PREFERENCE: vi.fn()
}
const __projectStub = { projectTree: null }
const __layoutStub = {
  rightColumn: 'files',
  showSideBar: false,
  showTabBar: false,
  SET_LAYOUT: vi.fn(function (p) {
    Object.assign(__layoutStub, p)
  }),
  DISPATCH_LAYOUT_MENU_ITEMS: vi.fn(),
  REQUEST_INITIAL_WINDOW_RESIZE: vi.fn()
}
const __mainStub = {
  init: false,
  SET_INITIALIZED: vi.fn(function () {
    __mainStub.init = true
  })
}

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => __preferencesStub
}))
vi.mock('@/store/project', () => ({
  useProjectStore: () => __projectStub
}))
vi.mock('@/store/layout', () => ({
  useLayoutStore: () => __layoutStub
}))
vi.mock('@/store', () => ({
  useMainStore: () => __mainStub
}))
vi.mock('@/store/index', () => ({
  useMainStore: () => __mainStub
}))

// ─── test suite ───────────────────────────────────────────────────────

describe('store/editor — M-032 live-reload', () => {
  let editor
  let bus

  beforeEach(async () => {
    vi.useFakeTimers()
    setupTestPinia()

    // Reset stub state per test.
    __preferencesStub.autoSave = false
    __preferencesStub.liveReload = true
    __preferencesStub.previewModeOnFinderOpen = true
    __ipcFsMock.read.mockReset()
    __ipcFsMock.read.mockResolvedValue('new disk content')

    const editorMod = await import('@/store/editor')
    editorMod.__resetBootPhase()
    editor = editorMod.useEditorStore()
    editor.END_BOOT_PHASE()

    bus = (await import('@/bus')).default
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── helpers ───────────────────────────────────────────────────────

  function makeTab(overrides = {}) {
    return {
      id: overrides.id ?? 'tab-1',
      filename: overrides.filename ?? 'test.md',
      pathname: overrides.pathname ?? '/tmp/test.md',
      markdown: overrides.markdown ?? '# original',
      isSaved: overrides.isSaved ?? true,
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 3,
      history: { stack: [], index: -1, lastEditIndex: -1 },
      cursor: overrides.cursor ?? { line: 5, ch: 10 },
      muyaIndexCursor: overrides.muyaIndexCursor ?? null,
      wordCount: { paragraph: 0, word: 0, character: 0, all: 0 },
      searchMatches: { index: -1, matches: [], value: '' },
      notifications: [],
      scrollTop: overrides.scrollTop ?? 42,
      previewMode: overrides.previewMode ?? false,
      ...overrides
    }
  }

  function seedTab(overrides = {}) {
    const tab = makeTab(overrides)
    editor.tabs = [tab]
    editor.currentFile = tab
    editor.updateTabIdToIndex()
    return tab
  }

  // ─── loadChange: cursor/scrollTop preservation ───────────────────

  describe('loadChange — cursor/scrollTop preservation', () => {
    it('preserves cursor and scrollTop across reload', () => {
      const tab = seedTab({
        cursor: { line: 10, ch: 5 },
        scrollTop: 200
      })

      editor.loadChange({
        pathname: '/tmp/test.md',
        data: {
          markdown: 'reloaded content',
          filename: 'test.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      expect(editor.tabs[0].markdown).toBe('reloaded content')
      // Cursor and scroll must be preserved (not reset to defaults).
      expect(editor.tabs[0].cursor).toEqual({ line: 10, ch: 5 })
      expect(editor.tabs[0].scrollTop).toBe(200)
    })

    it('emits file-changed with preserved cursor when tab is current', () => {
      seedTab({
        cursor: { line: 3, ch: 7 },
        scrollTop: 99
      })

      editor.loadChange({
        pathname: '/tmp/test.md',
        data: {
          markdown: 'updated',
          filename: 'test.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      expect(bus.emit).toHaveBeenCalledWith(
        'file-changed',
        expect.objectContaining({
          cursor: { line: 3, ch: 7 },
          scrollTop: 99
        })
      )
    })

    it('marks the file-changed reload as contentReloaded so the editor clamps the scroll restore', () => {
      seedTab({ scrollTop: 5000 })

      editor.loadChange({
        pathname: '/tmp/test.md',
        data: {
          markdown: 'shorter on disk',
          filename: 'test.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      // The raw offset is still preserved in tab state; the flag tells
      // editor.vue to clamp it into the reloaded document's range.
      expect(editor.tabs[0].scrollTop).toBe(5000)
      expect(bus.emit).toHaveBeenCalledWith(
        'file-changed',
        expect.objectContaining({
          scrollTop: 5000,
          contentReloaded: true
        })
      )
    })

    it('stamps a background tab and forwards the stamp on later activation (no double restore)', () => {
      // Current tab is a different file; the reloaded tab is in background.
      const background = seedTab({ id: 'tab-2', pathname: '/tmp/test.md', scrollTop: 3000 })
      const current = makeTab({ id: 'tab-1', pathname: '/tmp/other.md' })
      editor.tabs = [current, background]
      editor.currentFile = current
      editor.updateTabIdToIndex()
      bus.emit.mockClear()

      editor.loadChange({
        pathname: '/tmp/test.md',
        data: {
          markdown: 'shorter on disk',
          filename: 'test.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      // Background reload: no immediate file-changed emit, but the tab is
      // stamped so activation routes through the reload clamp.
      expect(bus.emit).not.toHaveBeenCalled()
      expect(background.contentReloaded).toBe(true)

      editor.UPDATE_CURRENT_FILE(background)

      expect(bus.emit).toHaveBeenCalledWith(
        'file-changed',
        expect.objectContaining({
          id: 'tab-2',
          scrollTop: 3000,
          contentReloaded: true
        })
      )
      // The stamp is consumed — a later same-document restore keeps the
      // padding-preserving path.
      expect(background.contentReloaded).toBe(false)
    })

    it('preserves muyaIndexCursor across reload', () => {
      seedTab({
        muyaIndexCursor: { blockIndex: 2, offset: 5 }
      })

      editor.loadChange({
        pathname: '/tmp/test.md',
        data: {
          markdown: 'new text',
          filename: 'test.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      expect(editor.tabs[0].muyaIndexCursor).toEqual({ blockIndex: 2, offset: 5 })
    })
  })

  // ─── APPLY_FILE_CHANGE: ipcFs disk-read path ────────────────────

  describe('APPLY_FILE_CHANGE — ipcFs disk-read path', () => {
    it('reads file via ipcFs.read when change.data is missing', async () => {
      seedTab({ markdown: '# original' })
      __ipcFsMock.read.mockResolvedValue('# from disk')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })

      // The 100ms settle delay is driven by setTimeout — advance timers.
      await vi.advanceTimersByTimeAsync(150)

      expect(__ipcFsMock.read).toHaveBeenCalledWith('/tmp/test.md')
      expect(editor.tabs[0].markdown).toBe('# from disk')
    })

    it('uses change.data directly when present (legacy path)', () => {
      seedTab({ markdown: '# old' })

      editor.APPLY_FILE_CHANGE('change', {
        pathname: '/tmp/test.md',
        data: {
          markdown: '# from payload',
          filename: 'test.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      // Legacy path doesn't use setTimeout — loads synchronously.
      expect(__ipcFsMock.read).not.toHaveBeenCalled()
      expect(editor.tabs[0].markdown).toBe('# from payload')
    })
  })

  // ─── Hash-skip: same content doesn't trigger loadChange ──────────

  describe('APPLY_FILE_CHANGE — hash-skip', () => {
    it('same content from disk does not trigger loadChange', async () => {
      const existingContent = '# original'
      seedTab({ markdown: existingContent })
      __ipcFsMock.read.mockResolvedValue(existingContent)

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      await vi.advanceTimersByTimeAsync(150)

      expect(__ipcFsMock.read).toHaveBeenCalledWith('/tmp/test.md')
      // bus.emit('file-changed', ...) should NOT have been called
      // because loadChange is skipped when markdown === tab.markdown.
      expect(bus.emit).not.toHaveBeenCalledWith(
        'file-changed',
        expect.anything()
      )
    })

    it('different content from disk triggers loadChange', async () => {
      seedTab({ markdown: '# original' })
      __ipcFsMock.read.mockResolvedValue('# changed on disk')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# changed on disk')
      expect(bus.emit).toHaveBeenCalledWith(
        'file-changed',
        expect.objectContaining({ markdown: '# changed on disk' })
      )
    })
  })

  // ─── liveReload preference off skips reload for clean tabs ───────

  describe('APPLY_FILE_CHANGE — liveReload preference', () => {
    it('liveReload=false + autoSave=false shows notification instead of reloading', () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: true })

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })

      // Should show a notification prompt, not auto-reload.
      expect(editor.tabs[0].isSaved).toBe(false)
      expect(editor.tabs[0].notifications).toHaveLength(1)
      expect(editor.tabs[0].notifications[0].showConfirm).toBe(true)
      expect(editor.tabs[0].notifications[0].exclusiveType).toBe('file_changed')
      expect(__ipcFsMock.read).not.toHaveBeenCalled()
    })

    it('liveReload=true auto-reloads saved tabs without notification', async () => {
      __preferencesStub.liveReload = true
      __preferencesStub.autoSave = false
      seedTab({ isSaved: true, markdown: '# old' })
      __ipcFsMock.read.mockResolvedValue('# new')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# new')
      expect(editor.tabs[0].notifications).toHaveLength(0)
    })
  })

  // ─── Dirty tabs are not auto-reloaded ────────────────────────────

  describe('APPLY_FILE_CHANGE — dirty tab behavior', () => {
    it('dirty tab (isSaved=false) with liveReload=false shows notification', () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false })

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })

      expect(editor.tabs[0].notifications).toHaveLength(1)
      expect(editor.tabs[0].notifications[0].showConfirm).toBe(true)
    })

    it('dirty tab with liveReload=true still reloads (liveReload forces reload)', async () => {
      __preferencesStub.liveReload = true
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, markdown: '# dirty' })
      __ipcFsMock.read.mockResolvedValue('# from disk')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      await vi.advanceTimersByTimeAsync(150)

      // liveReload=true forces reload regardless of isSaved.
      expect(editor.tabs[0].markdown).toBe('# from disk')
    })

    it('dirty tab with autoSave=true but isSaved=false skips reload unless liveReload', () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = true
      seedTab({ isSaved: false })

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })

      // autoSave=true but isSaved=false — dirty tab shows notification.
      expect(editor.tabs[0].notifications).toHaveLength(1)
      expect(editor.tabs[0].notifications[0].showConfirm).toBe(true)
    })

    // C-2: the watcher path sends {pathname} only — the confirm action
    // must read the file from disk (previously it crashed destructuring
    // change.data inside loadChange).
    it('conflict prompt confirm=true reloads from disk; decline keeps local content', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, markdown: '# dirty edits' })
      __ipcFsMock.read.mockResolvedValue('# external truth')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      expect(editor.tabs[0].notifications).toHaveLength(1)

      const action = editor.tabs[0].notifications[0].action
      expect(typeof action).toBe('function')
      action(true)
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# external truth')
      expect(__ipcFsMock.read).toHaveBeenCalledWith('/tmp/test.md')
    })

    it('conflict prompt decline (status=false) does not touch the tab', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, markdown: '# keep me' })
      __ipcFsMock.read.mockClear()

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      editor.tabs[0].notifications[0].action(false)
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# keep me')
      expect(__ipcFsMock.read).not.toHaveBeenCalled()
    })

    it('conflict confirm with stale generation is skipped', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, markdown: '# v1' })
      __ipcFsMock.read.mockResolvedValue('# v2')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      const action = editor.tabs[0].notifications[0].action

      // A newer change lands before the user clicks confirm → this
      // dialog's read is stale and must not clobber the newer state.
      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      action(true)
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# v1')
    })

    it('conflict confirm uses embedded data when present (legacy path)', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, markdown: '# old' })
      __ipcFsMock.read.mockClear()

      editor.APPLY_FILE_CHANGE('change', {
        pathname: '/tmp/test.md',
        data: {
          markdown: '# embedded',
          filename: 'test.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })
      editor.tabs[0].notifications[0].action(true)
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# embedded')
      expect(__ipcFsMock.read).not.toHaveBeenCalled()
    })

    it('conflict confirm tolerates a disk read failure', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, markdown: '# stable' })
      __ipcFsMock.read.mockRejectedValue(new Error('io boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      editor.tabs[0].notifications[0].action(true)
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# stable')
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('BLOCK_READ_FAILED'),
        expect.any(Error)
      )
      errSpy.mockRestore()
    })

    // Review-1 finding: pin the liveReloadGenerations cleanup behavior.
    // When the last tab for a pathname closes, the generation entry is
    // dropped, so clicking confirm on the stale dialog must not reach
    // loadChange — no "cannot find tab" error toast. (The disk read
    // itself happens before the guard, mirroring the auto-reload path.)
    it('confirm after the last tab closed is a no-op (generation dropped)', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, markdown: '# gone soon' })
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      const action = editor.tabs[0].notifications[0].action

      // Last tab for the pathname closes → _unsubscribeFileWatch drops
      // the generation entry.
      editor.tabs = []
      editor.currentFile = {}
      editor._unsubscribeFileWatch('/tmp/test.md')

      action(true)
      await vi.advanceTimersByTimeAsync(150)

      // Stale generation → the guard returns before loadChange; without
      // the cleanup this would log "Cannot find tab in tab list".
      expect(errSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Cannot find tab'),
      )
      expect(editor.tabs).toHaveLength(0)
      errSpy.mockRestore()
    })

    it('confirm with legacy embedded data also respects the generation guard', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, markdown: '# v1' })

      const change = {
        pathname: '/tmp/test.md',
        data: {
          markdown: '# embedded stale',
          filename: 'test.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      }
      editor.APPLY_FILE_CHANGE('change', change)
      const action = editor.tabs[0].notifications[0].action

      // A newer change supersedes the dialog before confirm.
      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      action(true)
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# v1')
    })
  })

  // ─── previewMode tabs always auto-reload (M-033 integration) ────

  describe('APPLY_FILE_CHANGE — previewMode auto-reload', () => {
    it('preview-mode tab always auto-reloads even when liveReload=false', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: true, previewMode: true, markdown: '# old' })
      __ipcFsMock.read.mockResolvedValue('# preview update')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# preview update')
      expect(editor.tabs[0].notifications).toHaveLength(0)
    })

    it('dirty preview-mode tab still auto-reloads (bypass dirty check)', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ isSaved: false, previewMode: true, markdown: '# dirty' })
      __ipcFsMock.read.mockResolvedValue('# preview override')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/test.md' })
      await vi.advanceTimersByTimeAsync(150)

      // previewMode bypasses both liveReload and isSaved checks.
      expect(editor.tabs[0].markdown).toBe('# preview override')
      expect(editor.tabs[0].notifications).toHaveLength(0)
    })
  })
})
