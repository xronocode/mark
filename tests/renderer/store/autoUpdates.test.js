// FILE: tests/renderer/store/autoUpdates.test.js
// VERSION: 1.3.0
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
//   LINKS: .grace/changes/archive/C-66/spec.xml R-1..R-5 + CornerMatrix;
//          .grace/verification/runtime.xml V-M-016 scenario-8.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   NOW - fixed clock, exercised both as Date and as a completed-check ISO string.
//   HOURS - hour/millisecond helper for relative stamps.
//   makeFakeIpc - in-memory prefs facade (get/set) capturing set() calls.
//   statusAvailable / statusUpToDate / statusNote - mt_updater_check answer fixtures.
//   installSignedUpdateMock - mocked shared install flow (commands export).
//   statusNote - test helper (statusNote).
//   statusUpToDate - test helper (statusUpToDate).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-11-03 C-RENDER-REVIEW-FIXES T-006: the
//   prefs-skip boot-notice pins — a fresh mt_rollback_restore_outcome
//   record raises exactly one sticky localized warning notice
//   (rollback.prefsSkipped*, dedupKey 'rollback-prefs-skipped', source
//   'rollback', the marker's error field never in the GUI) even when the
//   updater gate returns check:false; a null outcome is silent; a stale
//   (49 h) record is suppressed with a console marker only; a failing
//   outcome query stays quiet with zero unhandled rejections; the
//   invokeFn seam stays exclusive to mt_updater_check (the new tests
//   inject outcomeInvokeFn directly, the five existing invoke-count pins
//   are untouched).
//   v1.2.0 - 2026-11-03 C-RENDER-REVIEW-FIXES T-004: the
//   CONFIRM_ROLLBACK failure pins — an injected mt_rollback_restore
//   rejection and an injected @tauri-apps/api/core import failure both
//   raise the localized rollback.restoreFailed* error notice (source
//   'rollback', raw injected error never in the message) with zero
//   unhandled rejections; the happy path stays silent.
//   v1.1.0 - 2026-10-19 C-66 R-7 coverage completion: the
//   ISO-string clock on a COMPLETED check (String(now) stamp) and the
//   SKIP_VERSION lazy import of the real ipcPrefs facade.
//   v1.0.0 - 2026-10-19 C-66 T-001: initial pins — the gate
//   decision table, the launch-check orchestration (throttle, silence,
//   stamp, skip) and the three notice actions.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupTestPinia } from '../pinia'

const { installSignedUpdateMock } = vi.hoisted(() => ({
  installSignedUpdateMock: vi.fn()
}))

vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'auto-updates-id'),
  delay: vi.fn(async () => {}),
  isOsx: true,
  isWindows: false,
  isLinux: false
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
import { useNotificationsStore } from '@/store/notifications'
import { t } from '@/i18n'

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

  it('an ISO-string clock on a completed check stamps String(now)', async () => {
    const store = useAutoUpdatesStore()
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockResolvedValue(statusUpToDate())

    const out = await store.RUN_LAUNCH_CHECK({ ipc, invokeFn: invoke, now: NOW.toISOString() })

    expect(out.checked).toBe(true)
    expect(ipc.calls).toContainEqual({ key: LAST_UPDATE_CHECK_AT_KEY, value: NOW.toISOString() })
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

  it('SKIP_VERSION without an injected facade persists through the real ipcPrefs', async () => {
    const store = useAutoUpdatesStore()
    queueNotice(store, '2.6.0')
    const { ipcPrefs } = await import('@/ipc/runtime')
    const setSpy = vi.spyOn(ipcPrefs, 'set').mockResolvedValue(undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await store.SKIP_VERSION()

    expect(setSpy).toHaveBeenCalledWith(SKIPPED_UPDATE_VERSION_KEY, '2.6.0')
    expect(store.notice.visible).toBe(false)
    setSpy.mockRestore()
    log.mockRestore()
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

describe('autoUpdates — rollback confirmation (CONFIRM_ROLLBACK, C-RENDER-REVIEW-FIXES)', () => {
  beforeEach(() => {
    setupTestPinia()
    vi.clearAllMocks()
  })

  const armRollback = (store) => {
    store.rollback = { visible: true, previousVersion: '2.9.0', currentVersion: '2.9.1' }
  }

  it('an mt_rollback_restore rejection raises the localized error notice (source rollback; the raw error never reaches the GUI)', async () => {
    const store = useAutoUpdatesStore()
    armRollback(store)
    const rawError = 'restore failed: prefs copy skipped (os error 13)'
    const visibleAtInvoke = []
    const invoke = vi.fn().mockImplementation(async () => {
      visibleAtInvoke.push(store.rollback.visible)
      throw new Error(rawError)
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.CONFIRM_ROLLBACK({ invokeFn: invoke })

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('mt_rollback_restore')
    // The card hides BEFORE the attempt (unchanged order) and stays hidden.
    expect(visibleAtInvoke).toEqual([false])
    expect(store.rollback.visible).toBe(false)

    expect(useNotificationsStore().stack).toHaveLength(1)
    const notice = useNotificationsStore().stack[0]
    expect(notice.severity).toBe('error')
    expect(notice.sticky).toBe(true)
    expect(notice.source).toBe('rollback')
    // From the key, not the hardcoded English: compared against the live
    // i18n lookup, and the injected raw error string is absent.
    expect(notice.title).toBe(t('rollback.restoreFailedTitle'))
    expect(notice.message).toBe(t('rollback.restoreFailedBody'))
    expect(notice.message).not.toContain(rawError)
    error.mockRestore()
  })

  it('an @tauri-apps/api/core import failure joins the same failure path (finding-12): localized notice, zero unhandled rejections', async () => {
    const store = useAutoUpdatesStore()
    armRollback(store)
    const rawError = 'injected core import failure'
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rejections = []
    const onUnhandled = (reason) => rejections.push(reason)
    process.on('unhandledRejection', onUnhandled)

    // vi.doMock (not hoisted): the next dynamic import of the module runs
    // this throwing factory, so the store's import inside the try
    // rejects. This test is the last core consumer in the file; the
    // second doMock below restores the standard mock shape anyway.
    vi.doMock('@tauri-apps/api/core', () => {
      throw new Error(rawError)
    })

    await store.CONFIRM_ROLLBACK()

    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(async () => undefined),
      convertFileSrc: (path) => path
    }))

    // Give an unhandled rejection (if one existed) a macrotask to surface.
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(rejections).toEqual([])
    process.off('unhandledRejection', onUnhandled)

    expect(useNotificationsStore().stack).toHaveLength(1)
    const notice = useNotificationsStore().stack[0]
    expect(notice.severity).toBe('error')
    expect(notice.source).toBe('rollback')
    expect(notice.title).toBe(t('rollback.restoreFailedTitle'))
    expect(notice.message).toBe(t('rollback.restoreFailedBody'))
    expect(notice.message).not.toContain(rawError)
    error.mockRestore()
  })

  it('the happy path is unchanged: the restore resolves silently with no notice', async () => {
    const store = useAutoUpdatesStore()
    armRollback(store)
    const invoke = vi.fn().mockResolvedValue(undefined)

    await store.CONFIRM_ROLLBACK({ invokeFn: invoke })

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('mt_rollback_restore')
    expect(store.rollback.visible).toBe(false)
    expect(useNotificationsStore().stack).toHaveLength(0)
  })
})

describe('autoUpdates — rollback prefs-skip boot notice (RUN_LAUNCH_CHECK, C-RENDER-REVIEW-FIXES)', () => {
  beforeEach(() => {
    setupTestPinia()
    vi.clearAllMocks()
  })

  // The mt_rollback_restore_outcome record shape (T-001): unix-seconds `at`.
  const skipRecord = (ageHours) => ({
    prefs: 'skipped',
    error: 'disk full',
    at: Math.floor((NOW.getTime() - HOURS(ageHours)) / 1000)
  })

  it('a fresh skip record shows exactly the one sticky localized notice even when the updater gate is off (gated boot case)', async () => {
    const store = useAutoUpdatesStore()
    const outcomeInvoke = vi.fn().mockResolvedValue(skipRecord(0))
    const invoke = vi.fn()
    // Gate off via the facade stub: the early return this notice must survive.
    const ipc = makeFakeIpc({ [AUTO_CHECK_UPDATES_KEY]: false })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({
      ipc,
      invokeFn: invoke,
      outcomeInvokeFn: outcomeInvoke,
      now: NOW
    })

    // The gate still early-returns (unchanged boot result) — but the notice
    // was raised before it.
    expect(out).toEqual({ check: false, reason: 'disabled', checked: false })
    expect(outcomeInvoke).toHaveBeenCalledTimes(1)
    expect(outcomeInvoke).toHaveBeenCalledWith('mt_rollback_restore_outcome')
    // The shared updater seam stays exclusive to mt_updater_check: the gate
    // is off, so the injected invokeFn mock is never called.
    expect(invoke).not.toHaveBeenCalled()

    expect(useNotificationsStore().stack).toHaveLength(1)
    const notice = useNotificationsStore().stack[0]
    expect(notice.severity).toBe('warning')
    expect(notice.sticky).toBe(true)
    expect(notice.dedupKey).toBe('rollback-prefs-skipped')
    expect(notice.source).toBe('rollback')
    // From the keys, not interpolated diagnostics: the marker's error field
    // ('disk full') never reaches the GUI.
    expect(notice.title).toBe(t('rollback.prefsSkippedTitle'))
    expect(notice.message).toBe(t('rollback.prefsSkippedBody'))
    expect(notice.message).not.toContain('disk full')
    warn.mockRestore()
    log.mockRestore()
  })

  it('a null outcome changes nothing on the boot path and never touches the updater seam', async () => {
    const store = useAutoUpdatesStore()
    const outcomeInvoke = vi.fn().mockResolvedValue(null)
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockResolvedValue(statusUpToDate())

    const out = await store.RUN_LAUNCH_CHECK({
      ipc,
      invokeFn: invoke,
      outcomeInvokeFn: outcomeInvoke,
      now: NOW
    })

    expect(outcomeInvoke).toHaveBeenCalledTimes(1)
    expect(outcomeInvoke).toHaveBeenCalledWith('mt_rollback_restore_outcome')
    // Seam exclusivity on a due boot: exactly one updater invoke, for
    // mt_updater_check only — the outcome query never rides invokeFn.
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('mt_updater_check')
    expect(out.checked).toBe(true)
    expect(useNotificationsStore().stack).toHaveLength(0)
  })

  it('a stale record (at older than 48 h) is suppressed with a console marker only', async () => {
    const store = useAutoUpdatesStore()
    const outcomeInvoke = vi.fn().mockResolvedValue(skipRecord(49))
    const invoke = vi.fn()
    const ipc = makeFakeIpc({ [AUTO_CHECK_UPDATES_KEY]: false })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const out = await store.RUN_LAUNCH_CHECK({
      ipc,
      invokeFn: invoke,
      outcomeInvokeFn: outcomeInvoke,
      now: NOW
    })

    expect(outcomeInvoke).toHaveBeenCalledTimes(1)
    expect(out).toEqual({ check: false, reason: 'disabled', checked: false })
    expect(useNotificationsStore().stack).toHaveLength(0)
    expect(warn).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('[autoUpdates][RUN_LAUNCH_CHECK][BLOCK_OUTCOME_STALE]')
    warn.mockRestore()
    log.mockRestore()
  })

  it('a failing outcome query stays quiet: console marker, no notice, zero unhandled rejections', async () => {
    const store = useAutoUpdatesStore()
    const outcomeInvoke = vi.fn().mockRejectedValue(new Error('fact channel down'))
    const ipc = makeFakeIpc()
    const invoke = vi.fn().mockResolvedValue(statusUpToDate())
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rejections = []
    const onUnhandled = (reason) => rejections.push(reason)
    process.on('unhandledRejection', onUnhandled)

    const out = await store.RUN_LAUNCH_CHECK({
      ipc,
      invokeFn: invoke,
      outcomeInvokeFn: outcomeInvoke,
      now: NOW
    })

    // Give an unhandled rejection (if one existed) a macrotask to surface.
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(rejections).toEqual([])
    process.off('unhandledRejection', onUnhandled)

    expect(error.mock.calls.some((c) => String(c[0]).includes('BLOCK_OUTCOME_QUERY_FAILED'))).toBe(
      true
    )
    expect(useNotificationsStore().stack).toHaveLength(0)
    // The boot continues past the broken fact channel: the updater check
    // still runs and completes.
    expect(out).toMatchObject({ check: true, checked: true })
    error.mockRestore()
  })
})
