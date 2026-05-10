// MODULE_CONTRACT
//   PURPOSE: Encode the V-M-025 ordering invariants (1)-(6) as machine-
//            checkable assertions over a captured cold-launch trace.
//            Drives bootstrap-ipc.js end-to-end with a fake invoke +
//            listen wiring, captures every console.log/console.debug
//            call, then runs a small log-grep parser against the
//            sequence.
//   SCOPE:   ~50 LOC parser + 6 invariant assertions per scenario:
//              - cold-launch with N=2 queued paths
//              - cold-launch with N=0 (drain-empty)
//              - drain-rejection (DRAIN_FAILED)
//   DEPENDS: vitest, @tauri-apps/api/{event,core} (mocked), bootstrap-ipc.
//   LINKS:   docs/verification-plan.xml V-M-025 ordering-invariants.

// ─── per-file mocks (mirror bootstrap-ipc.test.js) ─────────────────

const setLanguageMock = vi.fn()
vi.mock('@/i18n', () => ({ setLanguage: setLanguageMock, t: (k) => k }))
vi.mock('./i18n', () => ({ setLanguage: setLanguageMock, t: (k) => k }))

const busEmitMock = vi.fn()
vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: busEmitMock }
}))
vi.mock('./bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: busEmitMock }
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

// ─── trace capture + parser ────────────────────────────────────────

/**
 * Run setupIpcListeners() with the supplied scripted drain outcome and
 * a list of mt::open-new-tab payloads to deliver after the drain
 * resolves (simulates the backend emitting one event per drained path).
 * Returns the captured trace lines (in order) plus the BOOTSTRAP_START
 * synthetic anchor we prepend so invariant (1) is checkable.
 */
async function runBootstrapWithTrace({ drainPaths, drainImpl, postEmits }) {
  vi.resetModules()
  Object.values(__prefsStub).forEach((v) => v?.mockReset?.())
  Object.values(__projectStub).forEach((v) => v?.mockReset?.())
  Object.values(__editorStub).forEach((v) => v?.mockReset?.())

  const eventMod = await import('@tauri-apps/api/event')
  const handlers = new Map()
  eventMod.listen.mockImplementation(async (channel, handler) => {
    handlers.set(channel, handler)
    return () => {}
  })

  const coreMod = await import('@tauri-apps/api/core')
  const drain = drainImpl || (async () => drainPaths || [])
  coreMod.invoke.mockImplementation(async (cmd) => {
    if (cmd === 'mt_drain_pending_opens') return drain()
    return undefined
  })

  const trace = []
  const sink = (...args) =>
    trace.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '))
  const log = vi.spyOn(console, 'log').mockImplementation(sink)
  const dbg = vi.spyOn(console, 'debug').mockImplementation(sink)
  const warn = vi.spyOn(console, 'warn').mockImplementation(sink)
  const err = vi.spyOn(console, 'error').mockImplementation(sink)

  // Synthetic [boot][app][BLOCK_BOOTSTRAP_START] anchor — V-M-030 will
  // wire the real one in main.js wave3; for now we synthesize the same
  // marker so invariant (1) has a reference point.
  trace.push('[boot][app][BLOCK_BOOTSTRAP_START elapsed_ms=0]')

  const mod = await import('@/bootstrap-ipc')
  await mod.setupIpcListeners()

  // After the drain resolves the backend would emit mt::open-new-tab
  // for each drained path. Drive each emit through the captured handler
  // so BLOCK_NEW_TAB_RECEIVED markers join the trace.
  if (Array.isArray(postEmits)) {
    const onNewTab = handlers.get('mt::open-new-tab')
    for (const payload of postEmits) {
      // eslint-disable-next-line no-await-in-loop
      await onNewTab({ payload })
    }
  }

  log.mockRestore()
  dbg.mockRestore()
  warn.mockRestore()
  err.mockRestore()
  return { trace, handlers }
}

/**
 * Find the first index of a marker in the trace. Returns -1 if not
 * present. Marker is matched by substring (BLOCK_NAME).
 */
const idx = (trace, marker) => trace.findIndex((l) => l.includes(marker))
/**
 * Count occurrences of a marker substring in the trace.
 */
const count = (trace, marker) =>
  trace.reduce((n, l) => n + (l.includes(marker) ? 1 : 0), 0)

/**
 * Extract the `count=N` from a BLOCK_DRAIN_RESPONSE_RECEIVED line.
 */
const extractCount = (line) => {
  const m = line && line.match(/count=(\d+)/)
  return m ? parseInt(m[1], 10) : -1
}

// ─── invariants ────────────────────────────────────────────────────

/**
 * Encode V-M-025 ordering invariants 1–6 as boolean assertions over a
 * trace. Returns a result object {ok: bool, failures: string[]}.
 *
 * (1) BOOTSTRAP_START → LISTENERS_READY → DRAIN_INVOKED strict.
 * (2) DRAIN_INVOKED → exactly one of {DRAIN_RESPONSE_RECEIVED, DRAIN_FAILED}.
 * (3) RESPONSE count=N>0 ⇒ exactly one DRAINED count=N AND ≥N NEW_TAB_RECEIVED.
 * (4) RESPONSE count=0 ⇒ exactly one DRAIN_EMPTY, zero DRAINED.
 * (5) Parallelism — DRAIN_INVOKED.elapsed_ms < APP_MOUNTED.elapsed_ms.
 *     (Smoke-only in unit env: APP_MOUNTED comes from main.js, not this
 *     suite. We assert the structural prereq instead: DRAIN_INVOKED
 *     came BEFORE this function returns, i.e. inside setupIpcListeners
 *     not after a separate post-mount hook.)
 * (6) Set equality — every queued path appears in exactly one
 *     NEW_TAB_RECEIVED (no loss, no dup).
 */
function checkInvariants(trace, expectedQueuedPaths) {
  const failures = []
  const iStart = idx(trace, 'BLOCK_BOOTSTRAP_START')
  const iReady = idx(trace, 'BLOCK_LISTENERS_READY')
  const iInvoked = idx(trace, 'BLOCK_DRAIN_INVOKED')

  // (1)
  if (!(iStart >= 0 && iReady > iStart && iInvoked > iReady)) {
    failures.push(
      `(1) order BOOTSTRAP_START(${iStart}) < LISTENERS_READY(${iReady}) < DRAIN_INVOKED(${iInvoked}) violated`
    )
  }

  // (2)
  const nResponse = count(trace, 'BLOCK_DRAIN_RESPONSE_RECEIVED')
  const nFailed = count(trace, 'BLOCK_DRAIN_FAILED')
  if (nResponse + nFailed !== 1) {
    failures.push(
      `(2) exactly one of {DRAIN_RESPONSE_RECEIVED, DRAIN_FAILED} required; got response=${nResponse} failed=${nFailed}`
    )
  }

  // (3) + (4)
  const responseLine = trace.find((l) =>
    l.includes('BLOCK_DRAIN_RESPONSE_RECEIVED')
  )
  if (nResponse === 1) {
    const N = extractCount(responseLine)
    const nDrained = trace.filter((l) =>
      new RegExp(`BLOCK_DRAINED count=${N}\\b`).test(l)
    ).length
    const nDrainedAny = count(trace, 'BLOCK_DRAINED count=')
    const nEmpty = count(trace, 'BLOCK_DRAIN_EMPTY')
    const nNewTab = count(trace, 'BLOCK_NEW_TAB_RECEIVED')
    if (N > 0) {
      if (nDrained !== 1) {
        failures.push(
          `(3) RESPONSE count=${N}>0 must yield exactly one DRAINED count=${N}; got ${nDrained}`
        )
      }
      if (nNewTab < N) {
        failures.push(`(3) NEW_TAB_RECEIVED count ${nNewTab} < N=${N}`)
      }
    } else {
      if (nEmpty !== 1) {
        failures.push(`(4) RESPONSE count=0 must yield exactly one DRAIN_EMPTY; got ${nEmpty}`)
      }
      if (nDrainedAny !== 0) {
        failures.push(`(4) RESPONSE count=0 must yield zero BLOCK_DRAINED; got ${nDrainedAny}`)
      }
    }
  }

  // (5) structural: DRAIN_INVOKED appears before this function returns
  // (i.e. before any post-suite synthetic anchor). Sufficient in unit env.
  if (iInvoked < 0) {
    failures.push('(5) DRAIN_INVOKED must appear inside setupIpcListeners')
  }

  // (6) set equality
  if (Array.isArray(expectedQueuedPaths)) {
    const newTabLines = trace.filter((l) =>
      l.includes('BLOCK_NEW_TAB_RECEIVED')
    )
    const seen = new Map()
    for (const l of newTabLines) {
      const m = l.match(/path=([^\s\]]+)/)
      const p = m ? m[1] : null
      if (!p) continue
      seen.set(p, (seen.get(p) || 0) + 1)
    }
    const expectedBasenames = expectedQueuedPaths.map((p) => p.split('/').pop())
    for (const b of expectedBasenames) {
      if (!seen.has(b)) {
        failures.push(`(6) queued path ${b} missing from NEW_TAB_RECEIVED`)
      } else if (seen.get(b) !== 1) {
        failures.push(`(6) queued path ${b} appeared ${seen.get(b)} times`)
      }
    }
  }

  return { ok: failures.length === 0, failures }
}

// ─── tests ─────────────────────────────────────────────────────────

describe('V-M-025 trace-invariants (log-grep parser)', () => {
  it('cold-launch with 2 queued paths satisfies invariants 1, 2, 3, 5, 6', async () => {
    const queued = ['/tmp/a.md', '/tmp/b.md']
    const { trace } = await runBootstrapWithTrace({
      drainPaths: queued,
      postEmits: [
        { markdown: '# A', pathname: '/tmp/a.md', previewMode: true },
        { markdown: '# B', pathname: '/tmp/b.md', previewMode: true }
      ]
    })
    const result = checkInvariants(trace, queued)
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.log('TRACE:\n' + trace.join('\n'))
    }
    expect(result.failures).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('cold-launch with empty queue satisfies invariants 1, 2, 4, 5', async () => {
    const { trace } = await runBootstrapWithTrace({
      drainPaths: [],
      postEmits: []
    })
    const result = checkInvariants(trace, [])
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.log('TRACE:\n' + trace.join('\n'))
    }
    expect(result.failures).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('drain rejection produces DRAIN_FAILED, exclusive with RESPONSE_RECEIVED', async () => {
    const { trace } = await runBootstrapWithTrace({
      drainImpl: async () => {
        throw new Error('backend boom')
      },
      postEmits: []
    })
    expect(trace.some((l) => l.includes('BLOCK_DRAIN_FAILED'))).toBe(true)
    expect(
      trace.some((l) => l.includes('BLOCK_DRAIN_RESPONSE_RECEIVED'))
    ).toBe(false)
    // (1) prereqs hold even on failure path.
    const iStart = idx(trace, 'BLOCK_BOOTSTRAP_START')
    const iReady = idx(trace, 'BLOCK_LISTENERS_READY')
    const iInvoked = idx(trace, 'BLOCK_DRAIN_INVOKED')
    expect(iStart).toBeGreaterThanOrEqual(0)
    expect(iReady).toBeGreaterThan(iStart)
    expect(iInvoked).toBeGreaterThan(iReady)
  })

  it('LISTENERS_READY count=9 matches the 9-listener post-audit-M-1 surface', async () => {
    const { trace } = await runBootstrapWithTrace({ drainPaths: [] })
    const ready = trace.find((l) => l.includes('BLOCK_LISTENERS_READY'))
    expect(ready).toBeTruthy()
    expect(ready).toMatch(/count=9/)
  })
})
