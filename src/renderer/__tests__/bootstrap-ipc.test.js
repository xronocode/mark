// MODULE_CONTRACT
//   PURPOSE: V-M-025 verification surface for bootstrap-ipc.js after the
//            M-025 perf-pending-opens-parallel reorder. Asserts the
//            top-level drain invocation, ordering invariants (LISTENERS_
//            READY → DRAIN_INVOKED), drain-empty no-spam (BLOCK_DRAIN_
//            EMPTY instead of BLOCK_DRAINED count=0), error paths, and
//            preserved per-event handler semantics from the W1 baseline.
//   SCOPE:   pure renderer-unit tests. Tauri `invoke` / `listen` are
//            mocked in tests/renderer/setup.ts; this file extends with
//            per-test mockImplementation.
//   DEPENDS: vitest, @tauri-apps/api/{event,core} (mocked), bootstrap-ipc.
//   LINKS:   docs/verification-plan.xml V-M-025 ordering-invariants 1-6.

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
const __projectStub = { _processTreeEvent: vi.fn() }
const __editorStub = {
  APPLY_TAB_SAVED: vi.fn(),
  APPLY_TAB_SAVE_FAILURE: vi.fn(),
  APPLY_SAVE_OUTCOME: vi.fn(),
  APPLY_BOOTSTRAP_EDITOR: vi.fn(),
  NEW_TAB_WITH_CONTENT: vi.fn(),
  NEW_UNTITLED_TAB: vi.fn(),
  CLOSE_TABS: vi.fn(),
  APPLY_PREVIEW_MODE: vi.fn(),
  currentFile: { id: 'tab-1' },
  tabs: []
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

async function freshBootstrap({
  drainImpl
} = {}) {
  vi.resetModules()
  Object.values(__prefsStub).forEach((v) => v?.mockReset?.())
  Object.values(__projectStub).forEach((v) => v?.mockReset?.())
  Object.values(__editorStub).forEach((v) => v?.mockReset?.())
  setLanguageMock.mockReset()
  busEmitMock.mockReset()

  const eventMod = await import('@tauri-apps/api/event')
  const handlers = new Map()
  eventMod.listen.mockImplementation(async (channel, handler) => {
    handlers.set(channel, handler)
    return () => {}
  })

  const coreMod = await import('@tauri-apps/api/core')
  const drain = drainImpl || (async () => [])
  coreMod.invoke.mockImplementation(async (cmd, args) => {
    if (cmd === 'mt_drain_pending_opens') return drain(args)
    return undefined
  })

  const mod = await import('@/bootstrap-ipc')
  return {
    setupIpcListeners: mod.setupIpcListeners,
    handlers,
    listen: eventMod.listen,
    invoke: coreMod.invoke
  }
}

function captureLogs() {
  const logs = []
  const real = (...args) => logs.push(args.map((a) => String(a)).join(' '))
  const log = vi.spyOn(console, 'log').mockImplementation(real)
  const debug = vi.spyOn(console, 'debug').mockImplementation(real)
  const warn = vi.spyOn(console, 'warn').mockImplementation(real)
  const error = vi.spyOn(console, 'error').mockImplementation(real)
  return {
    logs,
    restore: () => {
      log.mockRestore()
      debug.mockRestore()
      warn.mockRestore()
      error.mockRestore()
    }
  }
}

// ─── test suite ────────────────────────────────────────────────────

describe('bootstrap-ipc / setupIpcListeners (M-025 reorder)', () => {
  it('registers all 9 listeners, emits LISTENERS_READY then DRAIN_INVOKED', async () => {
    const { setupIpcListeners, handlers } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()

    expect(handlers.size).toBe(9)
    const channels = Array.from(handlers.keys()).sort()
    expect(channels).toEqual(
      [
        'mt::user-preference',
        'mt::current-language',
        'mt::update-object-tree',
        'mt::tab-saved',
        'mt::tab-save-failure',
        'mt::set-pathname',
        'mt::bootstrap-editor',
        'mt::open-new-tab',
        'mt::force-close-tabs-by-id'
      ].sort()
    )

    const idxReady = cap.logs.findIndex((l) =>
      l.includes('BLOCK_LISTENERS_READY')
    )
    const idxInvoked = cap.logs.findIndex((l) =>
      l.includes('BLOCK_DRAIN_INVOKED')
    )
    const idxAll = cap.logs.findIndex((l) =>
      l.includes('BLOCK_ALL_LISTENERS_REGISTERED')
    )
    expect(idxReady).toBeGreaterThanOrEqual(0)
    expect(idxInvoked).toBeGreaterThanOrEqual(0)
    expect(idxAll).toBeGreaterThanOrEqual(0)
    // V-M-025 invariant (1): ALL_LISTENERS_REGISTERED → LISTENERS_READY
    // → DRAIN_INVOKED.
    expect(idxAll).toBeLessThan(idxReady)
    expect(idxReady).toBeLessThan(idxInvoked)
    cap.restore()
  })

  it('drain-empty path emits BLOCK_DRAIN_EMPTY (NOT BLOCK_DRAINED count=0)', async () => {
    const { setupIpcListeners } = await freshBootstrap({
      drainImpl: async () => []
    })
    const cap = captureLogs()
    await setupIpcListeners()
    const empty = cap.logs.filter((l) => l.includes('BLOCK_DRAIN_EMPTY'))
    const drained = cap.logs.filter((l) =>
      /BLOCK_DRAINED count=/.test(l)
    )
    expect(empty.length).toBe(1)
    expect(drained.length).toBe(0)
    cap.restore()
  })

  it('drain-nonempty path emits BLOCK_DRAINED count=N + RESPONSE count=N', async () => {
    const { setupIpcListeners } = await freshBootstrap({
      drainImpl: async () => ['/tmp/a.md', '/tmp/b.md']
    })
    const cap = captureLogs()
    await setupIpcListeners()
    const drained = cap.logs.filter((l) =>
      /BLOCK_DRAINED count=2/.test(l)
    )
    const response = cap.logs.filter((l) =>
      /BLOCK_DRAIN_RESPONSE_RECEIVED .*count=2/.test(l)
    )
    const empty = cap.logs.filter((l) => l.includes('BLOCK_DRAIN_EMPTY'))
    expect(drained.length).toBe(1)
    expect(response.length).toBe(1)
    expect(empty.length).toBe(0)
    cap.restore()
  })

  it('drain rejection emits BLOCK_DRAIN_FAILED, does NOT throw', async () => {
    const { setupIpcListeners } = await freshBootstrap({
      drainImpl: async () => {
        throw new Error('backend boom')
      }
    })
    const cap = captureLogs()
    await expect(setupIpcListeners()).resolves.not.toThrow()
    const failed = cap.logs.filter((l) => l.includes('BLOCK_DRAIN_FAILED'))
    const response = cap.logs.filter((l) =>
      l.includes('BLOCK_DRAIN_RESPONSE_RECEIVED')
    )
    expect(failed.length).toBe(1)
    // V-M-025 invariant (2): DRAIN_FAILED is mutually exclusive with
    // DRAIN_RESPONSE_RECEIVED.
    expect(response.length).toBe(0)
    cap.restore()
  })

  it('drain invoke happens AFTER all listen() calls (order check)', async () => {
    let invokeCalledAt = -1
    let lastListenAt = -1
    let counter = 0
    const { setupIpcListeners } = await freshBootstrap({
      drainImpl: async () => {
        invokeCalledAt = counter++
        return []
      }
    })
    const eventMod = await import('@tauri-apps/api/event')
    const realImpl = eventMod.listen.getMockImplementation()
    eventMod.listen.mockImplementation(async (channel, handler) => {
      lastListenAt = counter++
      return realImpl(channel, handler)
    })
    const cap = captureLogs()
    await setupIpcListeners()
    // V-M-025 invariant (1): every listen() registration completed before
    // the drain invoke ran.
    expect(lastListenAt).toBeGreaterThanOrEqual(0)
    expect(invokeCalledAt).toBeGreaterThan(lastListenAt)
    cap.restore()
  })

  it('is idempotent — second call warns and does NOT re-register', async () => {
    const { setupIpcListeners, listen } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()
    const firstCallCount = listen.mock.calls.length
    await setupIpcListeners()
    const warnHit = cap.logs.find((l) =>
      l.includes('setupIpcListeners called twice')
    )
    expect(warnHit).toBeTruthy()
    expect(listen.mock.calls.length).toBe(firstCallCount)
    cap.restore()
  })

  it('mt::open-new-tab handler emits BLOCK_NEW_TAB_RECEIVED with basename + previewMode', async () => {
    const { setupIpcListeners, handlers } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()
    const onNewTab = handlers.get('mt::open-new-tab')
    expect(onNewTab).toBeTruthy()
    await onNewTab({
      payload: {
        markdown: '# hi',
        pathname: '/tmp/notes/readme.md',
        previewMode: true
      }
    })
    const hit = cap.logs.find(
      (l) =>
        l.includes('BLOCK_NEW_TAB_RECEIVED') &&
        l.includes('path=readme.md') &&
        l.includes('previewMode=true')
    )
    expect(hit).toBeTruthy()
    cap.restore()
  })

  it('mt::open-new-tab still invokes editorStore.NEW_TAB_WITH_CONTENT', async () => {
    const { setupIpcListeners, handlers } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()
    handlers.get('mt::open-new-tab')({
      payload: {
        markdown: '# hi',
        pathname: '/p.md',
        selected: true,
        options: { foo: 1 }
      }
    })
    expect(__editorStub.NEW_TAB_WITH_CONTENT).toHaveBeenCalledTimes(1)
    cap.restore()
  })

  it('mt::bootstrap-editor handler is now a thin forwarder (does NOT invoke drain)', async () => {
    const { setupIpcListeners, handlers, invoke } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()
    invoke.mockClear()
    handlers.get('mt::bootstrap-editor')({ payload: { tabs: [] } })
    expect(__editorStub.APPLY_BOOTSTRAP_EDITOR).toHaveBeenCalled()
    // M-025 hoist: drain MUST NOT fire from inside this handler — it
    // already fired at top-level before APPLY_BOOTSTRAP_EDITOR ran.
    const drainCalls = invoke.mock.calls.filter(
      (c) => c[0] === 'mt_drain_pending_opens'
    )
    expect(drainCalls.length).toBe(0)
    cap.restore()
  })

  // ─── retained per-event handler semantics from the W1 baseline ─────

  it('mt::user-preference forwards object payload', async () => {
    const { setupIpcListeners, handlers } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()
    handlers.get('mt::user-preference')({ payload: { theme: 'dark' } })
    expect(__prefsStub.SET_USER_PREFERENCE).toHaveBeenCalledWith({
      theme: 'dark'
    })
    cap.restore()
  })

  it('mt::current-language calls setLanguage + bus.emit', async () => {
    const { setupIpcListeners, handlers } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()
    handlers.get('mt::current-language')({ payload: 'de' })
    expect(setLanguageMock).toHaveBeenCalledWith('de')
    expect(busEmitMock).toHaveBeenCalledWith('language-changed', 'de')
    cap.restore()
  })

  it('mt::tab-saved forwards string id', async () => {
    const { setupIpcListeners, handlers } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()
    handlers.get('mt::tab-saved')({ payload: 'tab-42' })
    expect(__editorStub.APPLY_TAB_SAVED).toHaveBeenCalledWith('tab-42')
    cap.restore()
  })

  it('mt::force-close-tabs-by-id forwards non-empty array', async () => {
    const { setupIpcListeners, handlers } = await freshBootstrap()
    const cap = captureLogs()
    await setupIpcListeners()
    handlers.get('mt::force-close-tabs-by-id')({ payload: ['a', 'b'] })
    expect(__editorStub.CLOSE_TABS).toHaveBeenCalledWith(['a', 'b'])
    cap.restore()
  })
})
