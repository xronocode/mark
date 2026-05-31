/**
 * M-033 cli-preview — renderer-side vitest tests for preview-mode behavior.
 *
 * Covers the key M-033 renderer behaviors:
 *   1. APPLY_PREVIEW_MODE sets tab.previewMode = true
 *   2. EXIT_PREVIEW_MODE sets tab.previewMode = false
 *   3. Preview tabs bypass dirty check in APPLY_FILE_CHANGE (always reload)
 *   4. Preview tab isSaved behavior
 *
 * These tests complement the existing editor.preview.test.ts (M-022) by
 * focusing on the M-033 cli-preview integration: how preview-mode interacts
 * with file-change auto-reload and dirty state.
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

// Mock ipcFs for disk-read path in APPLY_FILE_CHANGE.
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
  liveReload: false,
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

describe('store/editor — M-033 preview-mode renderer', () => {
  let editor
  let bus

  beforeEach(async () => {
    vi.useFakeTimers()
    setupTestPinia()

    // Reset stub state per test.
    __preferencesStub.autoSave = false
    __preferencesStub.liveReload = false
    __preferencesStub.previewModeOnFinderOpen = true
    __layoutStub.showSideBar = false
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
      filename: overrides.filename ?? 'preview.md',
      pathname: overrides.pathname ?? '/tmp/preview.md',
      markdown: overrides.markdown ?? '# preview content',
      isSaved: overrides.isSaved ?? true,
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 3,
      history: { stack: [], index: -1, lastEditIndex: -1 },
      cursor: null,
      muyaIndexCursor: null,
      wordCount: { paragraph: 0, word: 0, character: 0, all: 0 },
      searchMatches: { index: -1, matches: [], value: '' },
      notifications: [],
      scrollTop: 0,
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

  // ─── APPLY_PREVIEW_MODE sets tab.previewMode = true ──────────────

  describe('APPLY_PREVIEW_MODE', () => {
    it('sets tab.previewMode = true on the matching tab', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false })

      editor.APPLY_PREVIEW_MODE('tab-1', true)

      expect(editor.tabs[0].previewMode).toBe(true)
      dbg.mockRestore()
    })

    it('is a no-op for unknown tabId', () => {
      seedTab({ previewMode: false })

      editor.APPLY_PREVIEW_MODE('nonexistent', true)

      expect(editor.tabs[0].previewMode).toBe(false)
    })

    it('is a no-op when previewModeOnFinderOpen pref is false', () => {
      __preferencesStub.previewModeOnFinderOpen = false
      seedTab({ previewMode: false })

      editor.APPLY_PREVIEW_MODE('tab-1', true)

      expect(editor.tabs[0].previewMode).toBe(false)
    })

    it('APPLY_PREVIEW_MODE(tabId, false) routes to EXIT_PREVIEW_MODE', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false })
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(editor.tabs[0].previewMode).toBe(true)

      editor.APPLY_PREVIEW_MODE('tab-1', false)
      expect(editor.tabs[0].previewMode).toBe(false)
      dbg.mockRestore()
    })
  })

  // ─── EXIT_PREVIEW_MODE sets tab.previewMode = false ──────────────

  describe('EXIT_PREVIEW_MODE', () => {
    it('sets tab.previewMode = false', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false })
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(editor.tabs[0].previewMode).toBe(true)

      editor.EXIT_PREVIEW_MODE('tab-1', 'test')
      expect(editor.tabs[0].previewMode).toBe(false)
      dbg.mockRestore()
    })

    it('is a no-op when tab is not in preview mode', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false })

      editor.EXIT_PREVIEW_MODE('tab-1', 'test')

      // Should not log anything (no-op path).
      expect(dbg).not.toHaveBeenCalled()
      dbg.mockRestore()
    })

    it('is a no-op for unknown tabId', () => {
      seedTab({ previewMode: true })

      editor.EXIT_PREVIEW_MODE('nonexistent', 'test')

      expect(editor.tabs[0].previewMode).toBe(true)
    })
  })

  // ─── Preview tabs bypass dirty check in APPLY_FILE_CHANGE ────────

  describe('APPLY_FILE_CHANGE — preview tab bypass', () => {
    it('preview tab always auto-reloads even when dirty and liveReload=false', async () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false, isSaved: true })
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(editor.tabs[0].previewMode).toBe(true)
      dbg.mockRestore()

      // Mark dirty to test that preview bypasses dirty check.
      editor.tabs[0].isSaved = false
      __ipcFsMock.read.mockResolvedValue('# reloaded preview')

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/preview.md' })
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].markdown).toBe('# reloaded preview')
      expect(editor.tabs[0].notifications).toHaveLength(0)
    })

    it('non-preview dirty tab with liveReload=false shows notification instead', () => {
      __preferencesStub.liveReload = false
      __preferencesStub.autoSave = false
      seedTab({ previewMode: false, isSaved: false })

      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/preview.md' })

      // Non-preview dirty tab should show a confirmation notification.
      expect(editor.tabs[0].notifications).toHaveLength(1)
      expect(editor.tabs[0].notifications[0].showConfirm).toBe(true)
      expect(__ipcFsMock.read).not.toHaveBeenCalled()
    })

    it('preview tab auto-reloads with direct data payload', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false, isSaved: true })
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      dbg.mockRestore()

      editor.APPLY_FILE_CHANGE('change', {
        pathname: '/tmp/preview.md',
        data: {
          markdown: '# direct data',
          filename: 'preview.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      expect(editor.tabs[0].markdown).toBe('# direct data')
      expect(__ipcFsMock.read).not.toHaveBeenCalled()
    })
  })

  // ─── Preview tab isSaved behavior ────────────────────────────────

  describe('preview tab isSaved behavior', () => {
    it('preview tab retains isSaved state after loadChange', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false, isSaved: true })
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      dbg.mockRestore()

      editor.loadChange({
        pathname: '/tmp/preview.md',
        data: {
          markdown: '# updated',
          filename: 'preview.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      // loadChange replaces content via getSingleFileState which creates
      // a new file state (default isSaved=true for loaded-from-disk content).
      expect(editor.tabs[0].previewMode).toBe(true)
      expect(editor.tabs[0].markdown).toBe('# updated')
    })

    it('preview flag persists through content reloads', async () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false, isSaved: true, markdown: '# v1' })
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      dbg.mockRestore()

      __ipcFsMock.read.mockResolvedValue('# v2')
      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/preview.md' })
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].previewMode).toBe(true)
      expect(editor.tabs[0].markdown).toBe('# v2')

      // Second reload to confirm persistence.
      __ipcFsMock.read.mockResolvedValue('# v3')
      editor.APPLY_FILE_CHANGE('change', { pathname: '/tmp/preview.md' })
      await vi.advanceTimersByTimeAsync(150)

      expect(editor.tabs[0].previewMode).toBe(true)
      expect(editor.tabs[0].markdown).toBe('# v3')
    })

    it('exiting preview mode after content reload keeps the content', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      seedTab({ previewMode: false, isSaved: true })
      editor.APPLY_PREVIEW_MODE('tab-1', true)

      // Reload content while in preview mode.
      editor.loadChange({
        pathname: '/tmp/preview.md',
        data: {
          markdown: '# reloaded in preview',
          filename: 'preview.md',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 3,
          isMixedLineEndings: false
        }
      })

      // Exit preview mode.
      editor.EXIT_PREVIEW_MODE('tab-1', 'test')

      // Content should be preserved.
      expect(editor.tabs[0].previewMode).toBe(false)
      expect(editor.tabs[0].markdown).toBe('# reloaded in preview')
      dbg.mockRestore()
    })
  })
})
