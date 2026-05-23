/**
 * Additional coverage tests for src/renderer/src/bootstrap-ipc.js
 *
 * Coverage target: 94.89% → 95%+
 *
 * Focuses on uncovered branches:
 *   - mt_drain_pending_opens: count > 0 path (BLOCK_DRAINED marker)
 *   - mt_drain_pending_opens: reject path (BLOCK_DRAIN_FAILED marker)
 *   - mt::open-new-tab: previewMode=true path with preference gate
 *   - mt::open-new-tab: previewMode non-boolean (wrong type guard)
 *   - mt::open-new-tab: selected=false + previewMode
 *   - _safeUseStore: error path (BLOCK_PINIA_NOT_READY)
 *   - _elapsedMs: fallback when window.__BOOT_T0__ is set
 */

// ─── per-file mocks ────────────────────────────────────────────────

const setLanguageMock = vi.fn()
vi.mock('@/i18n', () => ({ setLanguage: setLanguageMock, t: (k) => k }))
vi.mock('./i18n', () => ({ setLanguage: setLanguageMock, t: (k) => k }))

const busEmitMock = vi.fn()
const busOnMock = vi.fn()
const busOffMock = vi.fn()
vi.mock('@/bus', () => ({
  default: { on: busOnMock, off: busOffMock, emit: busEmitMock }
}))
vi.mock('./bus', () => ({
  default: { on: busOnMock, off: busOffMock, emit: busEmitMock }
}))

const __prefsStub = {
  SET_USER_PREFERENCE: vi.fn(),
  previewModeOnFinderOpen: true
}
const __projectStub = {
  _processTreeEvent: vi.fn()
}
const __editorStub = {
  APPLY_TAB_SAVED: vi.fn(),
  APPLY_TAB_SAVE_FAILURE: vi.fn(),
  APPLY_SAVE_OUTCOME: vi.fn(),
  APPLY_BOOTSTRAP_EDITOR: vi.fn(),
  NEW_TAB_WITH_CONTENT: vi.fn(),
  NEW_UNTITLED_TAB: vi.fn(),
  CLOSE_TABS: vi.fn(),
  APPLY_PREVIEW_MODE: vi.fn(),
  END_BOOT_PHASE: vi.fn(),
  currentFile: { id: 'new-tab-id' },
  tabs: [{ id: 'new-tab-id' }]
}

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: vi.fn(() => __prefsStub)
}))
vi.mock('./store/preferences', () => ({
  usePreferencesStore: vi.fn(() => __prefsStub)
}))
vi.mock('@/store/project', () => ({
  useProjectStore: vi.fn(() => __projectStub)
}))
vi.mock('./store/project', () => ({
  useProjectStore: vi.fn(() => __projectStub)
}))
vi.mock('@/store/editor', () => ({
  useEditorStore: vi.fn(() => __editorStub)
}))
vi.mock('./store/editor', () => ({
  useEditorStore: vi.fn(() => __editorStub)
}))

// ─── helpers ──────────────────────────────────────────────────────

async function freshBootstrap () {
  vi.resetModules()
  Object.values(__prefsStub).forEach((v) => v?.mockReset?.())
  Object.values(__projectStub).forEach((v) => v?.mockReset?.())
  Object.values(__editorStub).forEach((v) => v?.mockReset?.())
  __prefsStub.previewModeOnFinderOpen = true
  __editorStub.currentFile = { id: 'new-tab-id' }
  __editorStub.tabs = [{ id: 'new-tab-id' }]
  setLanguageMock.mockReset()
  busEmitMock.mockReset()

  const eventMod = await import('@tauri-apps/api/event')
  const handlers = new Map()
  eventMod.listen.mockImplementation(
    async (channel, handler) => {
      handlers.set(channel, handler)
      return () => {}
    }
  )
  const mod = await import('@/bootstrap-ipc')
  return {
    setupIpcListeners: mod.setupIpcListeners,
    handlers,
    listen: eventMod.listen
  }
}

// ─── tests ────────────────────────────────────────────────────────

describe('bootstrap-ipc — coverage gaps', () => {
  it('drain: count > 0 → BLOCK_DRAINED marker logged', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValueOnce(['/tmp/a.md', '/tmp/b.md'])

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { setupIpcListeners } = await freshBootstrap()
    await setupIpcListeners()

    const logCalls = log.mock.calls.map((c) => String(c[0]))
    expect(logCalls.some((s) => s.includes('BLOCK_DRAINED count=2'))).toBe(true)
    log.mockRestore()
  })

  it('drain: reject → BLOCK_DRAIN_FAILED marker logged', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockRejectedValueOnce(new Error('drain boom'))

    const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { setupIpcListeners } = await freshBootstrap()
    await setupIpcListeners()

    const dbgCalls = dbg.mock.calls.map((c) => String(c[0]))
    expect(dbgCalls.some((s) => s.includes('BLOCK_DRAIN_FAILED'))).toBe(true)
    dbg.mockRestore()
    log.mockRestore()
  })

  it('drain: empty array → BLOCK_DRAIN_EMPTY marker', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValueOnce([])

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { setupIpcListeners } = await freshBootstrap()
    await setupIpcListeners()

    const logCalls = log.mock.calls.map((c) => String(c[0]))
    expect(logCalls.some((s) => s.includes('BLOCK_DRAIN_EMPTY'))).toBe(true)
    log.mockRestore()
  })

  it('drain: non-array response → count=0 → BLOCK_DRAIN_EMPTY', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValueOnce(null)

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { setupIpcListeners } = await freshBootstrap()
    await setupIpcListeners()

    const logCalls = log.mock.calls.map((c) => String(c[0]))
    expect(logCalls.some((s) => s.includes('BLOCK_DRAIN_EMPTY'))).toBe(true)
    log.mockRestore()
  })

  describe('mt::open-new-tab previewMode', () => {
    it('previewMode=true + pref enabled → APPLY_PREVIEW_MODE called with selected=true', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      invoke.mockResolvedValueOnce([])

      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { setupIpcListeners, handlers } = await freshBootstrap()
      __prefsStub.previewModeOnFinderOpen = true
      await setupIpcListeners()

      const h = handlers.get('mt::open-new-tab')
      await h({
        payload: {
          markdown: '# test',
          pathname: '/tmp/test.md',
          previewMode: true,
          selected: true
        }
      })

      expect(__editorStub.NEW_TAB_WITH_CONTENT).toHaveBeenCalled()
      expect(__editorStub.APPLY_PREVIEW_MODE).toHaveBeenCalledWith('new-tab-id', true)
      log.mockRestore()
    })

    it('previewMode=true + pref disabled → APPLY_PREVIEW_MODE NOT called', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      invoke.mockResolvedValueOnce([])

      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { setupIpcListeners, handlers } = await freshBootstrap()
      __prefsStub.previewModeOnFinderOpen = false
      await setupIpcListeners()

      const h = handlers.get('mt::open-new-tab')
      await h({
        payload: {
          markdown: '# test',
          pathname: '/tmp/test.md',
          previewMode: true
        }
      })

      expect(__editorStub.NEW_TAB_WITH_CONTENT).toHaveBeenCalled()
      expect(__editorStub.APPLY_PREVIEW_MODE).not.toHaveBeenCalled()
      log.mockRestore()
    })

    it('previewMode=false → no APPLY_PREVIEW_MODE', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      invoke.mockResolvedValueOnce([])

      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { setupIpcListeners, handlers } = await freshBootstrap()
      await setupIpcListeners()

      const h = handlers.get('mt::open-new-tab')
      await h({
        payload: {
          markdown: '# test',
          pathname: '/tmp/test.md',
          previewMode: false
        }
      })

      expect(__editorStub.APPLY_PREVIEW_MODE).not.toHaveBeenCalled()
      log.mockRestore()
    })

    it('previewMode wrong type (string) → debug log + return', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      invoke.mockResolvedValueOnce([])

      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const { setupIpcListeners, handlers } = await freshBootstrap()
      await setupIpcListeners()

      const h = handlers.get('mt::open-new-tab')
      await h({
        payload: {
          markdown: '# test',
          pathname: '/tmp/test.md',
          previewMode: 'yes'
        }
      })

      const dbgCalls = dbg.mock.calls.map((c) => String(c[0]))
      expect(dbgCalls.some((s) => s.includes('BLOCK_PAYLOAD_INVALID'))).toBe(true)
      expect(__editorStub.APPLY_PREVIEW_MODE).not.toHaveBeenCalled()
      log.mockRestore()
      dbg.mockRestore()
    })

    it('previewMode=true + selected=false → uses last tab id', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      invoke.mockResolvedValueOnce([])

      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { setupIpcListeners, handlers } = await freshBootstrap()
      __prefsStub.previewModeOnFinderOpen = true
      __editorStub.tabs = [{ id: 'tab-A' }, { id: 'tab-B' }]
      await setupIpcListeners()

      const h = handlers.get('mt::open-new-tab')
      await h({
        payload: {
          markdown: '# test',
          pathname: '/tmp/test.md',
          previewMode: true,
          selected: false
        }
      })

      expect(__editorStub.APPLY_PREVIEW_MODE).toHaveBeenCalledWith('tab-B', true)
      log.mockRestore()
    })
  })

  it('_elapsedMs respects window.__BOOT_T0__', async () => {
    window.__BOOT_T0__ = performance.now() - 100 // 100ms ago
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValueOnce([])

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { setupIpcListeners } = await freshBootstrap()
    await setupIpcListeners()

    // The BLOCK_LISTENERS_READY marker includes elapsed_ms
    const logCalls = log.mock.calls.map((c) => String(c[0]))
    const readyMarker = logCalls.find((s) => s.includes('BLOCK_LISTENERS_READY'))
    expect(readyMarker).toBeDefined()
    // elapsed_ms should be at least 50 (we set boot 100ms ago)
    const match = readyMarker.match(/elapsed_ms=(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match[1])).toBeGreaterThanOrEqual(50)

    delete window.__BOOT_T0__
    log.mockRestore()
  })
})
