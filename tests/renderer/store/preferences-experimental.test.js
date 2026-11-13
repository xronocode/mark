// FILE: tests/renderer/store/preferences-experimental.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-LARGE-DOC-WAVE-A T-004 experimental store behaviours — the session-only progressive-mount toggle (default off, never persisted, never reset), the content-free served-opens counters fed through the cross-window event listener, and the hydration strip that keeps a relaunch off even if prefs.json carries the key.
//   SCOPE: SET_EXPERIMENTAL_PROGRESSIVE_MOUNT / RECORD_EXPERIMENTAL_MOUNT_SERVED / LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT over the preferenceDefaults factory, plus the EXPERIMENTAL_SESSION_ONLY_KEYS hygiene (reset surface, hydration strip, no mt_prefs_set writes).
//   DEPENDS: src/renderer/src/store/preferences.js, the global @tauri-apps/api/event mock, Pinia, Vitest.
//   LINKS: .grace/changes/archive/C-LARGE-DOC-WAVE-A (spec R-4, plan T-004/corner-10); .grace/verification/performance.xml V-M-063.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SET_LANGUAGE_MOCK - hoisted i18n setLanguage spy (same pattern as preferences-t004.test.js).
//   handlerFor - helper that returns the handler registered on a given mt::experimental-progressive-* channel (drives the captured cross-window listeners).
// END_MODULE_MAP

import { setupTestPinia } from '../pinia'

const SET_LANGUAGE_MOCK = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: (...args) => SET_LANGUAGE_MOCK(...args)
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
// The store imports services/notification → util/index.js, which reads the
// window shim at import time (installed only in the global beforeEach).
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import {
  usePreferencesStore,
  preferenceDefaults,
  RESETTABLE_PREFERENCE_KEYS,
  EXPERIMENTAL_SESSION_ONLY_KEYS
} from '@/store/preferences'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'

const handlerFor = (channel) => {
  const call = listen.mock.calls.find(([name]) => name === channel)
  return call ? call[1] : null
}

describe('preferences store — C-LARGE-DOC-WAVE-A T-004 experimental surface', () => {
  beforeEach(() => {
    setupTestPinia()
    SET_LANGUAGE_MOCK.mockClear()
    invoke.mockClear()
    emit.mockClear()
    listen.mockClear()
  })

  describe('session-only toggle (R-4)', () => {
    it('defaults to off in the fresh state factory', () => {
      expect(preferenceDefaults().experimentalProgressiveMount).toBe(false)
      expect(preferenceDefaults().progressiveMountServedProgressiveCount).toBe(0)
      expect(preferenceDefaults().progressiveMountServedLegacyCount).toBe(0)
    })

    it('SET_EXPERIMENTAL_PROGRESSIVE_MOUNT flips the flag in memory and fans it out content-free', async () => {
      const store = usePreferencesStore()
      store.SET_EXPERIMENTAL_PROGRESSIVE_MOUNT(true)
      expect(store.experimentalProgressiveMount).toBe(true)
      expect(emit).toHaveBeenCalledTimes(1)
      const [channel, payload] = emit.mock.calls[0]
      expect(channel).toBe('mt::experimental-progressive-mount')
      expect(payload).toEqual({ enabled: true })

      store.SET_EXPERIMENTAL_PROGRESSIVE_MOUNT(false)
      expect(store.experimentalProgressiveMount).toBe(false)
      expect(emit.mock.calls[1][1]).toEqual({ enabled: false })
    })

    it('never writes the experimental keys through mt_prefs_set', async () => {
      const store = usePreferencesStore()
      store.SET_EXPERIMENTAL_PROGRESSIVE_MOUNT(true)
      store.RECORD_EXPERIMENTAL_MOUNT_SERVED('progressive')
      await Promise.resolve()
      const keys = invoke.mock.calls.map((c) => c[0] && c[1] && c[1].key).filter(Boolean)
      expect(keys).toEqual([])
      expect(invoke).not.toHaveBeenCalled()
    })

    it('the experimental keys are not resettable', () => {
      for (const key of EXPERIMENTAL_SESSION_ONLY_KEYS) {
        expect(RESETTABLE_PREFERENCE_KEYS).not.toContain(key)
      }
    })

    it('hydration strips the experimental keys so a relaunch always returns to off', async () => {
      const store = usePreferencesStore()
      // A fresh session starts at the code default (off); a hand-edited
      // prefs.json snapshot that somehow carries the flag must not
      // resurrect it (the strip in ASK_FOR_USER_PREFERENCE).
      expect(store.experimentalProgressiveMount).toBe(false)
      invoke.mockResolvedValueOnce({
        theme: 'ink',
        autoSave: true,
        experimentalProgressiveMount: true,
        progressiveMountServedProgressiveCount: 99
      })
      await store.ASK_FOR_USER_PREFERENCE()
      expect(store.experimentalProgressiveMount).toBe(false)
      expect(store.progressiveMountServedProgressiveCount).toBe(0)
      // Real persisted keys still hydrate normally (the strip touches
      // only the experimental keys). theme may be re-resolved by the
      // Auto-theme block afterwards — assert on a non-theme key.
      expect(store.autoSave).toBe(true)
    })
  })

  describe('cross-window listeners (bind-once, handler-applies-only)', () => {
    it('LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT registers both handlers exactly once', () => {
      const store = usePreferencesStore()
      store.LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT()
      store.LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT()
      const mountBinds = listen.mock.calls.filter(([name]) => name === 'mt::experimental-progressive-mount')
      const servedBinds = listen.mock.calls.filter(([name]) => name === 'mt::experimental-progressive-served')
      expect(mountBinds).toHaveLength(1)
      expect(servedBinds).toHaveLength(1)
    })

    it('the mount handler applies flips in memory and never emits (no echo loop)', () => {
      const store = usePreferencesStore()
      store.LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT()
      const handler = handlerFor('mt::experimental-progressive-mount')
      expect(handler).toBeTruthy()
      emit.mockClear()
      handler({ payload: { enabled: true } })
      expect(store.experimentalProgressiveMount).toBe(true)
      handler({ payload: { enabled: false } })
      expect(store.experimentalProgressiveMount).toBe(false)
      expect(emit).not.toHaveBeenCalled()
    })

    it('RECORD emits; the served handler is the single increment path', () => {
      const store = usePreferencesStore()
      store.LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT()
      const handler = handlerFor('mt::experimental-progressive-served')
      expect(handler).toBeTruthy()

      // The action itself never touches the counters — the listener does
      // (exactly-once per window, on every window incl. the emitter).
      store.RECORD_EXPERIMENTAL_MOUNT_SERVED('progressive')
      expect(store.progressiveMountServedProgressiveCount).toBe(0)
      expect(emit.mock.calls[0][0]).toBe('mt::experimental-progressive-served')
      expect(emit.mock.calls[0][1]).toEqual({ served: 'progressive' })

      handler({ payload: { served: 'progressive' } })
      handler({ payload: { served: 'progressive' } })
      handler({ payload: { served: 'legacy' } })
      handler({ payload: { served: 'nonsense' } })
      handler({ payload: null })
      expect(store.progressiveMountServedProgressiveCount).toBe(2)
      expect(store.progressiveMountServedLegacyCount).toBe(1)
    })

    it('RECORD ignores anything but the two content-free served values', () => {
      const store = usePreferencesStore()
      store.RECORD_EXPERIMENTAL_MOUNT_SERVED('nonsense')
      store.RECORD_EXPERIMENTAL_MOUNT_SERVED(undefined)
      expect(emit).not.toHaveBeenCalled()
    })
  })
})
