// FILE: tests/renderer/store/preferences-write-truth.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PREFS-WRITE-TRUTH T-003 — the write-side twin of the
//            C-PREFS-TRUTH load-repair suite: on a rejected mt_prefs_set
//            the optimistic SET_SINGLE_PREFERENCE apply rolls back (store
//            value, language side effect, boot-dirty mark), exactly one
//            localized preferences.writeFailure.* notice fires with the
//            raw error console-only, a fresh hydration carries only the
//            persisted value (the restart leg), and the happy path stays
//            byte-identical (synchronous apply, exactly one invoke, the
//            BLOCK_INVOKE_OK marker, no notice).
//   SCOPE: The SET_SINGLE_PREFERENCE write-truth contract on the
//          preferences-load-repair mock seams (invoke, i18n, notification,
//          bus). Read/hydration repair semantics stay with the
//          load-repair suite (its write-semantics-out-of-scope note);
//          the Rust store (m005_prefs.rs memory rollback) is pinned by
//          its own inline suite.
//   DEPENDS: src/renderer/src/store/preferences.js, Pinia test setup,
//            Vitest (mocked @tauri-apps/api/core + event, i18n, bus,
//            notification).
//   LINKS: tests/renderer/store/preferences-load-repair.test.js (the
//          read-side twin and the mock-seam source);
//          tests/renderer/i18n/locale-keys.test.js (the ten-locale
//          preferences.writeFailure.* gate);
//          src/renderer/src/store/preferences.js SET_SINGLE_PREFERENCE;
//          .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   invokeMock - the @tauri-apps/api/core invoke mock (mt_prefs_get_all serves currentProfile; mt_prefs_set is injected per test).
//   currentProfile - the persisted prefs.json fixture the next hydration reads.
//   hydrate - boot-hydrates currentProfile through the real ASK_FOR_USER_PREFERENCE.
//   consoleLogSpy - the BLOCK_INVOKE_OK marker spy.
//   consoleErrorSpy - the BLOCK_INVOKE_FAILED and write-rollback marker spy.
//   rejectingWrite - per-test mt_prefs_set override rejecting exactly one write.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-23 C-PREFS-WRITE-TRUTH T-003: new — the
//   failing-first write-truth matrix (store-value rollback, localized
//   write-failure notice with the raw error console-only, language
//   side-effect revert, boot-dirty-mark drop) plus the meaningful-proof
//   fresh-hydration restart leg and the happy-path byte-identical-shape
//   pins.
// END_CHANGE_SUMMARY

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestPinia } from '../pinia'

const invokeMock = vi.hoisted(() => vi.fn(async () => null))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => undefined)
}))
vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: vi.fn(),
  getCurrentLanguage: () => 'en'
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import notice from '@/services/notification'
import { setLanguage } from '@/i18n'

// The persisted prefs.json fixture the next boot hydration reads (mt_prefs_get_all).
let currentProfile = {}

const consoleLogSpy = vi.spyOn(console, 'log')
const consoleErrorSpy = vi.spyOn(console, 'error')

const hydrate = async () => {
  const { usePreferencesStore } = await import('@/store/preferences')
  const store = usePreferencesStore()
  await store.ASK_FOR_USER_PREFERENCE()
  return store
}

const rejectingWrite = () => {
  invokeMock.mockImplementation(async (command, args) => {
    if (command === 'mt_prefs_get_all') return currentProfile
    throw new Error('injected prefs write failure')
  })
}

describe('C-PREFS-WRITE-TRUTH T-003: preference write truth (SET_SINGLE_PREFERENCE rollback)', () => {
  beforeEach(() => {
    setupTestPinia()
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (command, args) => {
      if (command === 'mt_prefs_get_all') return currentProfile
      // mt_prefs_set (the code-block-line-numbers migration writes its flag)
      return null
    })
    consoleLogSpy.mockClear()
    consoleErrorSpy.mockClear()
    currentProfile = {}
  })

  it('set_single_preference_rolls_back_the_store_value_when_the_write_is_rejected', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    store.fontSize = 18
    rejectingWrite()

    await store.SET_SINGLE_PREFERENCE({ type: 'fontSize', value: 22 })

    expect(store.fontSize).toBe(18)
    // Exactly ONE mt_prefs_set — no retry, no second write attempt after
    // the rollback (the rollback is a direct state restore).
    const setCalls = invokeMock.mock.calls.filter(([command]) => command === 'mt_prefs_set')
    expect(setCalls).toHaveLength(1)
    // The loud rollback marker names the key (the raw error stays
    // console-only in the BLOCK_INVOKE_FAILED line).
    const errLines = consoleErrorSpy.mock.calls.map((call) => call.map(String).join(' '))
    expect(
      errLines.some((line) => line.includes('[PREFERENCES][BLOCK_PREFS_WRITE_ROLLED_BACK key=fontSize]'))
    ).toBe(true)
  })

  it('set_single_preference_surfaces_a_localized_write_failure_notice', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    store.fontSize = 18
    rejectingWrite()

    await store.SET_SINGLE_PREFERENCE({ type: 'fontSize', value: 22 })

    expect(notice.notify).toHaveBeenCalledTimes(1)
    const payload = notice.notify.mock.calls[0][0]
    // The t mock returns the keys, so the assertion is on the key strings.
    expect(payload.source).toBe('settings')
    expect(payload.severity).toBe('error')
    expect(payload.title).toBe('preferences.writeFailure.title')
    expect(payload.message).toBe('preferences.writeFailure.body')
    // The raw error string appears ONLY on the console, never in the
    // notice; the notice never claims the value was saved.
    expect(JSON.stringify(payload)).not.toContain('injected prefs write failure')
    expect(JSON.stringify(payload)).not.toContain('saved')
    const errLines = consoleErrorSpy.mock.calls.map((call) => call.map(String).join(' '))
    expect(
      errLines.some((line) => line.includes('[ipc][prefs_set][BLOCK_INVOKE_FAILED key=fontSize]'))
    ).toBe(true)
    expect(
      errLines.some((line) => line.includes('injected prefs write failure'))
    ).toBe(true)
  })

  it('set_single_preference_rolls_back_the_language_side_effect', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    store.language = 'en'
    rejectingWrite()

    await store.SET_SINGLE_PREFERENCE({ type: 'language', value: 'ru' })

    expect(store.language).toBe('en')
    expect(setLanguage).toHaveBeenLastCalledWith('en')
  })

  it('set_single_preference_drops_the_boot_dirty_mark_on_rollback', async () => {
    currentProfile = { fontSize: 18 }
    const store = await hydrate()
    rejectingWrite()

    await store.SET_SINGLE_PREFERENCE({ type: 'fontSize', value: 26 })

    // The persisted value changed elsewhere (another window accepted its
    // write); a fresh hydration must be able to correct the rolled-back
    // key — possible only if the boot-stomp guard no longer shields it.
    currentProfile = { fontSize: 20 }
    await store.ASK_FOR_USER_PREFERENCE()
    expect(store.fontSize).toBe(20)
  })

  it('a_fresh_hydration_after_a_rejected_write_carries_only_the_persisted_value', async () => {
    // Meaningful-proof restart leg (recorded honestly, per the R-3
    // convention): the fixture never contained the rejected value even
    // pre-fix, so this pin is green-by-design new coverage — the
    // red-first legs are the four write-truth pins above.
    currentProfile = { fontSize: 18 }
    const store = await hydrate()
    rejectingWrite()

    await store.SET_SINGLE_PREFERENCE({ type: 'fontSize', value: 26 })

    // Consume the module-level boot-dirty guard (the same-window
    // rehydration any window can run) so the fresh store hydrates the
    // complete persisted profile.
    await store.ASK_FOR_USER_PREFERENCE()
    const { usePreferencesStore } = await import('@/store/preferences')
    setupTestPinia()
    const fresh = usePreferencesStore()
    await fresh.ASK_FOR_USER_PREFERENCE()
    expect(fresh.fontSize).toBe(18)
    expect(fresh.fontSize).not.toBe(26)
  })

  it('applies the value synchronously — before the invoke resolves — and writes exactly once (happy path)', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const store = usePreferencesStore()
    let resolveInvoke
    invokeMock.mockImplementation((command) => {
      if (command === 'mt_prefs_set') {
        return new Promise((resolve) => {
          resolveInvoke = resolve
        })
      }
      return Promise.resolve(null)
    })

    const action = store.SET_SINGLE_PREFERENCE({ type: 'fontSize', value: 22 })

    // The synchronous optimistic apply: the store already carries the new
    // value while the write is still in flight.
    expect(store.fontSize).toBe(22)
    const setCalls = invokeMock.mock.calls.filter(([command]) => command === 'mt_prefs_set')
    expect(setCalls).toHaveLength(1)
    expect(setCalls[0]).toEqual(['mt_prefs_set', { key: 'fontSize', value: 22 }])

    resolveInvoke(null)
    await action
    expect(
      consoleLogSpy.mock.calls.some((call) =>
        String(call[0]).includes('[ipc][prefs_set][BLOCK_INVOKE_OK key=fontSize]')
      )
    ).toBe(true)
    expect(notice.notify).not.toHaveBeenCalled()
  })
})
