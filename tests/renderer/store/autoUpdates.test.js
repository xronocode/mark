// FILE: tests/renderer/store/autoUpdates.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-66 automatic-update gate — the full decision table
//            (24 h throttle, What's New deferral, App Store gate, switch
//            off, skip/next-version), the RUN_LAUNCH_CHECK orchestration
//            (one mt_updater_check per 24 h, offline/statusNote silence
//            without advancing lastUpdateCheckAt, notice queueing) and the
//            Later / Skip this version / Update actions.
//   SCOPE: pure gate functions + Pinia store actions with an injected
//          fake prefs facade, fake invoker and fake clock; the signed
//          install flow is a mocked commands export.
//   DEPENDS: src/renderer/src/store/autoUpdates.js, tests/renderer/pinia.
//   LINKS: .grace/changes/active/C-66/spec.xml R-1..R-5 + CornerMatrix;
//          .grace/verification/runtime.xml V-M-016 scenario-8.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   NOW - fixed fake-clock instant shared by every case.
//   HOURS - hour/millisecond helper for relative stamps.
//   makeFakeIpc - in-memory prefs facade (get/set) capturing set() calls.
//   statusAvailable / statusUpToDate / statusNote - mt_updater_check answer fixtures.
//   installSignedUpdateMock - mocked shared install flow (commands export).
//   statusNote - test helper (statusNote).
//   statusUpToDate - test helper (statusUpToDate).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-19 C-66 T-001: initial pins — the gate
//   decision table, the launch-check orchestration (throttle, silence,
//   stamp, skip) and the three notice actions.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupTestPinia } from '../pinia'

const { installSignedUpdateMock } = vi.hoisted(() => ({
  installSignedUpdateMock: vi.fn()
}))

vi.mock('@/commands', () => ({
  installSignedUpdate: installSignedUpdateMock
}))

import {
  useAutoUpdatesStore,
  evaluateAutoUpdateGate,
  evaluateUpdateNotice,
  AUTO_CHECK_UPDATES_KEY,
  LAST_UPDATE_CHECK_AT_KEY,
  SKIPPED_UPDATE_VERSION_KEY,
  CHECK_INTERVAL_MS
} from '@/store/autoUpdates'

const NOW = new Date('2026-10-19T09:00:00Z')
const HOURS = (n) => n * 60 * 60 * 1000

// TOP-LEVEL fake prefs facade (TEST/LOCALS: top-level locals only).
const makeFakeIpc = (initial = {}) => {
  const store = { ...initial }
  const calls = []
  return {
    calls,
    async get(key) {
      return key in store ? store[key] : null
    },
    async set(key, value) {
      store[key] = value
      calls.push({ key, value })
    }
  }
}

// mt_updater_check answer fixtures (m016 UpdateStatus shape).
const statusAvailable = (version) => ({
  currentVersion: '2.5.0',
  available: true,
  latestVersion: version,
  downloadUrl: 'https://example/feed/mark.dmg',
  statusNote: null
})
const statusUpToDate = () => ({
  currentVersion: '2.5.0',
  available: false,
  latestVersion: null,
  downloadUrl: null,
  statusNote: null
})
const statusNote = (note) => ({
  currentVersion: '2.5.0',
  available: false,
  latestVersion: null,
  downloadUrl: null,
  statusNote: note
})

describe('autoUpdates — evaluateAutoUpdateGate (decision table)', () => {
  it('App Store build never checks (corner-5), even when everything else would allow it', () => {
    const out = evaluateAutoUpdateGate({
      isDesktopBuild: false,
      whatsNewShown: false,
      autoCheckUpdates: true,
      lastCheckAt: '',
      now: NOW
    })
    expect(out).toEqual({ check: false, reason: 'app-store' })
  })

  it('What’s New shown this launch defers the check (corner-4) without touching the clock', () => {
    const out = evaluateAutoUpdateGate({
      isDesktopBuild: true,
      whatsNewShown: true,
      autoCheckUpdates: true,
      lastCheckAt: '',
      now: NOW
    })
    expect(out).toEqual({ check: false, reason: 'whats-new-deferred' })
  })

  it('autoCheckUpdates off never checks (corner-6)', () => {
    const out = evaluateAutoUpdateGate({
      autoCheckUpdates: false,
      lastCheckAt: '',
      now: NOW
    })
    expect(out).toEqual({ check: false, reason: 'disabled' })
  })

  it('a check less than 24 h ago is throttled (corner-1); exactly 24 h is due again', () => {
    const iso = (h) => new Date(NOW.getTime() - HOURS(h)).toISOString()
    expect(evaluateAutoUpdateGate({ lastCheckAt: iso(1), now: NOW })).toEqual({
      check: false,
      reason: 'throttled'
    })
    expect(evaluateAutoUpdateGate({ lastCheckAt: iso(23.9), now: NOW })).toEqual({
      check: false,
      reason: 'throttled'
    })
    expect(evaluateAutoUpdateGate({ lastCheckAt: iso(24), now: NOW })).toEqual({
      check: true,
      reason: 'due'
    })
    expect(evaluateAutoUpdateGate({ lastCheckAt: iso(48), now: NOW })).toEqual({
      check: true,
      reason: 'due'
    })
  })

  it('no lastCheckAt, or an unparseable one, counts as never checked', () => {
    expect(evaluateAutoUpdateGate({ lastCheckAt: '', now: NOW })).toEqual({
      check: true,
      reason: 'due'
    })
    expect(evaluateAutoUpdateGate({ lastCheckAt: null, now: NOW })).toEqual({
      check: true,
      reason: 'due'
    })
    expect(evaluateAutoUpdateGate({ lastCheckAt: 'not-a-date', now: NOW })).toEqual({
      check: true,
      reason: 'due'
    })
  })

  it('an ISO-string clock works and an unparseable clock degrades to due', () => {
    const oneHourAgo = new Date(NOW.getTime() - HOURS(1)).toISOString()
    expect(evaluateAutoUpdateGate({ lastCheckAt: oneHourAgo, now: NOW.toISOString() })).toEqual({
      check: false,
      reason: 'throttled'
    })
    // A clock that cannot be parsed never throttles (fail-open to due).
    expect(evaluateAutoUpdateGate({ lastCheckAt: oneHourAgo, now: 'not-a-date' })).toEqual({
      check: true,
      reason: 'due'
    })
  })

  it('exposes the 24 h interval and the prefs keys the wiring persists', () => {
    expect(CHECK_INTERVAL_MS).toBe(24 * 60 * 60 * 1000)
    expect(AUTO_CHECK_UPDATES_KEY).toBe('autoCheckUpdates')
    expect(LAST_UPDATE_CHECK_AT_KEY).toBe('lastUpdateCheckAt')
    expect(SKIPPED_UPDATE_VERSION_KEY).toBe('skippedUpdateVersion')
  })
})

describe('autoUpdates — evaluateUpdateNotice', () => {
  it('an available, not-skipped version shows with the normalized version', () => {
    expect(evaluateUpdateNotice({ status: statusAvailable('v2.6.0'), skippedVersion: '' })).toEqual({
      show: true,
      version: '2.6.0',
      reason: 'available'
    })
  })

  it('the skipped version stays hidden — decorations normalize (corner-3 first half)', () => {
    expect(
      evaluateUpdateNotice({ status: statusAvailable('2.6.0'), skippedVersion: 'v2.6.0' })
    ).toEqual({ show: false, version: '2.6.0', reason: 'skipped' })
  })

  it('a later version than the skipped one shows again (corner-3)', () => {
    expect(
      evaluateUpdateNotice({ status: statusAvailable('2.6.1'), skippedVersion: '2.6.0' })
    ).toEqual({ show: true, version: '2.6.1', reason: 'available' })
  })

  it('up-to-date, statusNote (feed failure / MAS), version-less and absent statuses never show', () => {
    expect(evaluateUpdateNotice({ status: statusUpToDate() })).toEqual({
      show: false,
      version: '',
      reason: 'not-available'
    })
    expect(evaluateUpdateNotice({ status: statusNote('update check failed: dns') })).toEqual({
      show: false,
      version: '',
      reason: 'check-note'
    })
    expect(evaluateUpdateNotice({ status: { available: true, latestVersion: null } })).toEqual({
      show: false,
      version: '',
      reason: 'no-version'
    })
    expect(evaluateUpdateNotice({ status: null })).toEqual({
      show: false,
      version: '',
      reason: 'no-status'
    })
    expect(evaluateUpdateNotice({})).toEqual({ show: false, version: '', reason: 'no-status' })
  })
})

describe('autoUpdates — RUN_LAUNCH_CHECK orchestration', () => {
  beforeEach(() => {
    setupTestPinia()
    vi.clearAllMocks()
  })

  it('a due launch check invokes mt_updater_check once, stamps the clock and queues the notice', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockResolvedValue(statusAvailable('2.6.0'))

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('mt_updater_check')
    expect(out).toMatchObject({ check: true, reason: 'due', checked: true })
    expect(out.decision).toEqual({ show: true, version: '2.6.0', reason: 'available' })
    expect(ipc.calls).toContainEqual({ key: LAST_UPDATE_CHECK_AT_KEY, value: NOW.toISOString() })
    expect(store.notice).toMatchObject({ visible: true, version: '2.6.0' })
    expect(store.notice.status).toMatchObject({ available: true, latestVersion: '2.6.0' })
  })

  it('launching twice within 24 h performs one mt_updater_check (corner-1)', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockResolvedValue(statusUpToDate())

    await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })
    const second = await store.RUN_LAUNCH_CHECK({
      ipc,
      invokeFn: invoke,
      now: new Date(NOW.getTime() + HOURS(1))
    })

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ check: false, reason: 'throttled', checked: false })
    expect(store.notice.visible).toBe(false)
  })

  it('offline / IPC failure is silent and does not advance lastUpdateCheckAt (corner-2)', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockRejectedValue(new Error('network unreachable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(out).toMatchObject({ check: true, checked: false, error: true })
    expect(ipc.calls).toEqual([])
    expect(store.notice.visible).toBe(false)
    // The next launch retries: nothing was stamped.
    const retry = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })
    expect(retry).toMatchObject({ check: true, reason: 'due' })
    warn.mockRestore()
  })

  it('a statusNote answer (feed/plugin failure) is silent and unstamped (corner-2)', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockResolvedValue(statusNote('update check failed: 503'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(out).toMatchObject({ checked: false, quiet: true })
    expect(ipc.calls).toEqual([])
    expect(store.notice.visible).toBe(false)
    log.mockRestore()
  })

  it('an empty answer (old backend / unknown command) is treated as a quiet failure', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockResolvedValue(undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(out).toMatchObject({ checked: false, quiet: true })
    expect(ipc.calls).toEqual([])
    log.mockRestore()
  })

  it('a clean up-to-date check stamps the clock and shows nothing', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockResolvedValue(statusUpToDate())

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(out.decision).toEqual({ show: false, version: '', reason: 'not-available' })
    expect(ipc.calls).toContainEqual({ key: LAST_UPDATE_CHECK_AT_KEY, value: NOW.toISOString() })
    expect(store.notice.visible).toBe(false)
  })

  it('an available-but-skipped version stamps the clock and stays hidden', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc({ [SKIPPED_UPDATE_VERSION_KEY]: '2.6.0' })
    const invoke = vi.fn().mockResolvedValue(statusAvailable('2.6.0'))

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(out.decision).toEqual({ show: false, version: '2.6.0', reason: 'skipped' })
    expect(ipc.calls).toContainEqual({ key: LAST_UPDATE_CHECK_AT_KEY, value: NOW.toISOString() })
    expect(store.notice.visible).toBe(false)
  })

  it('the App Store build never invokes the backend (corner-5)', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({
      ipc,
      invokeFn: invoke,
      now: NOW,
      isDesktopBuild: false
    })

    expect(invoke).not.toHaveBeenCalled()
    expect(out).toEqual({ check: false, reason: 'app-store', checked: false })
    expect(store.notice.visible).toBe(false)
    log.mockRestore()
  })

  it('a What’s New sheet in the same launch defers the check (corner-4)', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW, whatsNewShown: true })

    expect(invoke).not.toHaveBeenCalled()
    expect(out).toEqual({ check: false, reason: 'whats-new-deferred', checked: false })
    // Nothing was stamped: the next launch re-evaluates the 24 h rule.
    expect(ipc.calls).toEqual([])
    log.mockRestore()
  })

  it('autoCheckUpdates=false performs no backend check (corner-6)', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc({ [AUTO_CHECK_UPDATES_KEY]: false })
    const invoke = vi.fn()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(invoke).not.toHaveBeenCalled()
    expect(out).toEqual({ check: false, reason: 'disabled', checked: false })
    log.mockRestore()
  })

  it('a prefs read failure keeps the fail-open defaults (check runs, prefs set still attempted)', async () => {
    const store = useAutoUpdatesStore()
    const ipc = {
      get: vi.fn().mockRejectedValue(new Error('prefs bridge down')),
      set: vi.fn().mockResolvedValue()
    }
    const invoke = vi.fn().mockResolvedValue(statusUpToDate())
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(invoke).toHaveBeenCalledWith('mt_updater_check')
    expect(out).toMatchObject({ checked: true })
    expect(ipc.set).toHaveBeenCalledWith(LAST_UPDATE_CHECK_AT_KEY, NOW.toISOString())
    error.mockRestore()
  })

  it('a stamp failure does not lose the notice decision', async () => {
    const store = useAutoUpdatesStore()
    const ipc = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error('disk full'))
    }
    const invoke = vi.fn().mockResolvedValue(statusAvailable('2.6.0'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW })

    expect(out.decision.show).toBe(true)
    expect(store.notice.visible).toBe(true)
    error.mockRestore()
  })

  it('runs on the default facades when nothing is injected (ISO-string clock)', async () => {
    // No ipc / invokeFn / isDesktopBuild: the action lazy-imports the
    // real ipcPrefs facade and @tauri-apps/api/core invoke (both globally
    // mocked in tests/renderer/setup.ts) and fails open as a desktop
    // build. The setup invoke resolves undefined → the quiet path, with
    // the ISO-string `now` exercising the non-Date clock branches.
    const store = useAutoUpdatesStore()
    const { invoke } = await import('@tauri-apps/api/core')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({ now: NOW.toISOString() })

    expect(out).toMatchObject({ checked: false, quiet: true })
    expect(invoke).toHaveBeenCalledWith('mt_updater_check')
    expect(store.notice.visible).toBe(false)
    log.mockRestore()
  })
})

describe('autoUpdates — notice actions', () => {
  beforeEach(() => {
    setupTestPinia()
    vi.clearAllMocks()
  })

  const queueNotice = (store, version = '2.6.0') => {
    store.notice = { visible: true, version, status: statusAvailable(version) }
  }

  it('DISMISS_NOTICE (Later) hides without persisting anything', async () => {
    const store = useAutoUpdatesStore()
    queueNotice(store)
    store.DISMISS_NOTICE()
    expect(store.notice.visible).toBe(false)
    expect(store.notice.version).toBe('2.6.0')
  })

  it('SKIP_VERSION persists the skipped version and hides the notice', async () => {
    const store = useAutoUpdatesStore()
    queueNotice(store, '2.6.0')
    const ipc = makeFakeIpc()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await store.SKIP_VERSION({ ipc })

    expect(ipc.calls).toEqual([{ key: SKIPPED_UPDATE_VERSION_KEY, value: '2.6.0' }])
    expect(store.notice.visible).toBe(false)
    log.mockRestore()
  })

  it('SKIP_VERSION with no visible notice persists nothing', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    await store.SKIP_VERSION({ ipc })
    expect(ipc.calls).toEqual([])
  })

  it('SKIP_VERSION survives a persistence failure (notice still hides)', async () => {
    const store = useAutoUpdatesStore()
    queueNotice(store, '2.6.0')
    const ipc = { set: vi.fn().mockRejectedValue(new Error('prefs down')) }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.SKIP_VERSION({ ipc })

    expect(store.notice.visible).toBe(false)
    error.mockRestore()
  })

  it('INSTALL_UPDATE (Update) runs the shared signed install flow with the queued status', async () => {
    const store = useAutoUpdatesStore()
    queueNotice(store, '2.6.0')

    await store.INSTALL_UPDATE()

    expect(installSignedUpdateMock).toHaveBeenCalledTimes(1)
    expect(installSignedUpdateMock).toHaveBeenCalledWith(store.notice.status)
    expect(store.notice.visible).toBe(false)
  })

  it('INSTALL_UPDATE without a queued status never dispatches', async () => {
    const store = useAutoUpdatesStore()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.INSTALL_UPDATE()

    expect(installSignedUpdateMock).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('INSTALL_UPDATE survives a dispatch failure', async () => {
    const store = useAutoUpdatesStore()
    queueNotice(store, '2.6.0')
    installSignedUpdateMock.mockRejectedValueOnce(new Error('import blew up'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.INSTALL_UPDATE()

    expect(store.notice.visible).toBe(false)
    error.mockRestore()
  })
})
