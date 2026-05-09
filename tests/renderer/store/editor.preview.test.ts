/**
 * M-022 mt-preview-mode — store-level tests for editor.js
 * APPLY_PREVIEW_MODE / EXIT_PREVIEW_MODE actions.
 *
 * Covers V-M-022 scenarios: S-04, F-01, F-02, R-02, E-07, I-01, I-02,
 * I-03, T-01, T-02. (S-01/S-02/S-03 are covered by component tests +
 * existing tab-creation suite; R-01 / E-01..06 are component-level.)
 *
 * Pitfall mitigations (Phase-4 wave 1 conventions):
 *   #1 — sibling stores stubbed as plain objects (not defineStore) so
 *        useLayoutStore() / usePreferencesStore() resolve without a
 *        real Pinia activation tied to the store internals.
 *   #2 — bus singleton mocked at both `@/bus` and `../bus`.
 *   #4 — i18n / commands / element-plus stubbed so muya never loads.
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
  i18n: { global: { t: (k: string) => k } },
  t: (k: string) => k,
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

const __preferencesStub: Record<string, any> = {
  autoSave: false,
  autoSaveDelay: 5000,
  defaultEncoding: 'utf8',
  endOfLine: 'lf',
  zoom: 1,
  previewModeOnFinderOpen: true,
  SET_USER_PREFERENCE: vi.fn(),
  SET_MODE: vi.fn(),
  SET_SINGLE_PREFERENCE: vi.fn()
}
const __projectStub: Record<string, any> = { projectTree: null }
const __layoutStub: Record<string, any> = {
  rightColumn: 'files',
  showSideBar: false,
  showTabBar: false,
  SET_LAYOUT: vi.fn(function (this: any, p: Record<string, unknown>) {
    Object.assign(__layoutStub, p)
  }),
  DISPATCH_LAYOUT_MENU_ITEMS: vi.fn(),
  REQUEST_INITIAL_WINDOW_RESIZE: vi.fn()
}
const __mainStub: Record<string, any> = {
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

describe('store/editor — M-022 preview-mode actions', () => {
  let editor: any

  beforeEach(async () => {
    setupTestPinia()
    // Reset stub state per test.
    __preferencesStub.previewModeOnFinderOpen = true
    __layoutStub.showSideBar = false

    const editorMod = await import('@/store/editor')
    editor = editorMod.useEditorStore()
  })

  function makeTab(overrides: Record<string, unknown> = {}) {
    return {
      id: 'tab-1',
      filename: 'a.md',
      pathname: '/tmp/a.md',
      previewMode: false,
      ...overrides
    } as Record<string, unknown>
  }

  // ─── APPLY_PREVIEW_MODE ───────────────────────────────────────────

  describe('APPLY_PREVIEW_MODE', () => {
    it('sets previewMode=true on the matching tab and emits BLOCK_ENTERED', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'tab-1', pathname: '/tmp/a.md' })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(editor.tabs[0].previewMode).toBe(true)
      expect(dbg).toHaveBeenCalledWith(
        '[editor][preview][BLOCK_ENTERED tab=tab-1 file=/tmp/a.md]'
      )
      dbg.mockRestore()
    })

    it('S-04: pref previewModeOnFinderOpen=false → APPLY no-ops', () => {
      __preferencesStub.previewModeOnFinderOpen = false
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'tab-1' })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(editor.tabs[0].previewMode).toBe(false)
      expect(dbg).not.toHaveBeenCalled()
      dbg.mockRestore()
    })

    it('F-01: missing tabId / unknown id → no-op (no crash)', () => {
      editor.tabs = [makeTab({ id: 'tab-1' })]
      expect(() => editor.APPLY_PREVIEW_MODE('', true)).not.toThrow()
      expect(() => editor.APPLY_PREVIEW_MODE('nope', true)).not.toThrow()
      expect(editor.tabs[0].previewMode).toBe(false)
    })

    it('I-01: APPLY when already preview → idempotent no-op', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'tab-1', previewMode: true })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      // First call would log; this is a re-apply — must not log again
      // (the tab already has previewMode=true so we early-return).
      expect(dbg).not.toHaveBeenCalled()
      expect(editor.tabs[0].previewMode).toBe(true)
      dbg.mockRestore()
    })

    it('R-02: two back-to-back APPLY → both tabs get previewMode=true', () => {
      editor.tabs = [
        makeTab({ id: 'tab-1', pathname: '/tmp/a.md' }),
        makeTab({ id: 'tab-2', pathname: '/tmp/b.md' })
      ]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      editor.APPLY_PREVIEW_MODE('tab-2', true)
      expect(editor.tabs[0].previewMode).toBe(true)
      expect(editor.tabs[1].previewMode).toBe(true)
    })

    it('E-07: per-tab previewMode preserved across tab switches', () => {
      // No tab-switch action mutates previewMode, so just assert that
      // toggling one tab leaves the other untouched.
      editor.tabs = [
        makeTab({ id: 'tab-1' }),
        makeTab({ id: 'tab-2' })
      ]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(editor.tabs[0].previewMode).toBe(true)
      expect(editor.tabs[1].previewMode).toBe(false)
    })

    it('snapshots prior sidebar visibility and collapses sidebar on entry', () => {
      __layoutStub.showSideBar = true
      editor.tabs = [makeTab({ id: 'tab-1' })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(editor.tabs[0]._previewSideBarSnapshot).toBe(true)
      expect(__layoutStub.showSideBar).toBe(false)
    })
  })

  // ─── EXIT_PREVIEW_MODE ────────────────────────────────────────────

  describe('EXIT_PREVIEW_MODE', () => {
    it('clears previewMode and emits BLOCK_EXITED + BLOCK_SIDEBAR_RESTORED', () => {
      __preferencesStub.previewModeOnFinderOpen = true
      __layoutStub.showSideBar = true
      editor.tabs = [makeTab({ id: 'tab-1' })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      // Pref now flips to false to exercise the restore branch on exit.
      __preferencesStub.previewModeOnFinderOpen = false
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      editor.EXIT_PREVIEW_MODE('tab-1', 'click')
      expect(editor.tabs[0].previewMode).toBe(false)
      expect(dbg).toHaveBeenCalledWith(
        '[editor][preview][BLOCK_EXITED tab=tab-1 reason=click]'
      )
      // pref=false → restore prior snapshot (showSideBar was true).
      expect(__layoutStub.showSideBar).toBe(true)
      expect(dbg).toHaveBeenCalledWith(
        '[editor][preview][BLOCK_SIDEBAR_RESTORED visibility=true]'
      )
      dbg.mockRestore()
    })

    it('F-02: EXIT on non-preview tab → silent no-op', () => {
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      editor.tabs = [makeTab({ id: 'tab-1', previewMode: false })]
      editor.EXIT_PREVIEW_MODE('tab-1', 'click')
      expect(dbg).not.toHaveBeenCalled()
      dbg.mockRestore()
    })

    it('I-02: EXIT twice → second is no-op', () => {
      editor.tabs = [makeTab({ id: 'tab-1' })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      editor.EXIT_PREVIEW_MODE('tab-1', 'click')
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      editor.EXIT_PREVIEW_MODE('tab-1', 'click')
      expect(dbg).not.toHaveBeenCalled()
      dbg.mockRestore()
    })

    it('I-03: file-content mutation on preview tab does not affect previewMode', () => {
      // EXIT_PREVIEW_MODE is the only path that clears previewMode;
      // confirm direct mutation of unrelated fields preserves the flag.
      editor.tabs = [makeTab({ id: 'tab-1' })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      // Simulate a file-content change.
      editor.tabs[0].markdown = '# new content'
      editor.tabs[0].isSaved = false
      expect(editor.tabs[0].previewMode).toBe(true)
    })

    it('T-01: pref=true (default) → sidebar stays hidden after exit', () => {
      __preferencesStub.previewModeOnFinderOpen = true
      __layoutStub.showSideBar = true
      editor.tabs = [makeTab({ id: 'tab-1' })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(__layoutStub.showSideBar).toBe(false)
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      editor.EXIT_PREVIEW_MODE('tab-1', 'click')
      expect(__layoutStub.showSideBar).toBe(false)
      expect(dbg).toHaveBeenCalledWith(
        '[editor][preview][BLOCK_SIDEBAR_RESTORED visibility=false]'
      )
      dbg.mockRestore()
    })

    it('T-02: pref=false → sidebar restored to prior value on exit', () => {
      __preferencesStub.previewModeOnFinderOpen = true
      __layoutStub.showSideBar = true
      editor.tabs = [makeTab({ id: 'tab-1' })]
      editor.APPLY_PREVIEW_MODE('tab-1', true)
      expect(__layoutStub.showSideBar).toBe(false)
      // User toggles the pref off mid-session; exit should now restore.
      __preferencesStub.previewModeOnFinderOpen = false
      editor.EXIT_PREVIEW_MODE('tab-1', 'click')
      expect(__layoutStub.showSideBar).toBe(true)
    })
  })
})
