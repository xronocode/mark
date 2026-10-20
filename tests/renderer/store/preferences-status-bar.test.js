// FILE: tests/renderer/store/preferences-status-bar.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-40 T-004 statusBarVisibility preference — the per-OS default resolved lazily at store creation, persistence through SET_SINGLE_PREFERENCE, and the «Restore all defaults» reset.
//   SCOPE: preferenceDefaults platform resolution (darwin/win32/linux), RESETTABLE_PREFERENCE_KEYS membership, RESET_PREFERENCES_TO_DEFAULTS write.
//   DEPENDS: src/renderer/src/store/preferences.js, Pinia, Vitest, tests/renderer/setup.ts window shims.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-55; .grace/changes/archive/C-40 T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SET_LANGUAGE_MOCK - hoisted i18n setLanguage spy.
//   makeStore - create a fresh preferences store under the given platform.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-004 initial pins: darwin
//   default off, win32/linux default on, stored choice wins over the
//   platform default, reset returns to the per-OS default and persists.
// END_CHANGE_SUMMARY

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

import { usePreferencesStore, RESETTABLE_PREFERENCE_KEYS } from '@/store/preferences'
import { invoke } from '@tauri-apps/api/core'

const makeStore = (platform) => {
  setupTestPinia()
  window.electron.process.platform = platform
  return usePreferencesStore()
}

describe('preferences store — C-40 T-004 statusBarVisibility', () => {
  afterEach(() => {
    // setup.ts re-installs the shim before every test; be tidy anyway.
    window.electron.process.platform = 'darwin'
  })

  it('defaults to off on macOS', () => {
    const store = makeStore('darwin')
    expect(store.statusBarVisibility).toBe(false)
  })

  it('defaults to on on Windows and Linux', () => {
    expect(makeStore('win32').statusBarVisibility).toBe(true)
    expect(makeStore('linux').statusBarVisibility).toBe(true)
  })

  it('is a Settings row: resettable and persisted through SET_SINGLE_PREFERENCE', async () => {
    const store = makeStore('darwin')
    expect(RESETTABLE_PREFERENCE_KEYS).toContain('statusBarVisibility')

    await store.SET_SINGLE_PREFERENCE({ type: 'statusBarVisibility', value: true })
    expect(store.statusBarVisibility).toBe(true)
    expect(invoke).toHaveBeenCalledWith('mt_prefs_set', {
      key: 'statusBarVisibility',
      value: true
    })
  })

  it('«Restore all defaults» returns the per-OS default and persists it', async () => {
    const store = makeStore('darwin')
    store.statusBarVisibility = true

    await store.RESET_PREFERENCES_TO_DEFAULTS()
    expect(store.statusBarVisibility).toBe(false)
    expect(invoke).toHaveBeenCalledWith('mt_prefs_set', {
      key: 'statusBarVisibility',
      value: false
    })
  })

  it('a stored choice from hydration wins over the platform default', () => {
    const store = makeStore('darwin')
    store.SET_USER_PREFERENCE({ statusBarVisibility: true })
    expect(store.statusBarVisibility).toBe(true)
  })
})
