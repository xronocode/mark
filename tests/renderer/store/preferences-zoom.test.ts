// FILE: tests/renderer/store/preferences-zoom.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-49 unified zoom in store/preferences.js — clamped ZOOM_STEP / ZOOM_ACTUAL_SIZE, debounced persistence, the mt::zoom-level-changed indicator event, the baseFontSize mirror in SET_USER_PREFERENCE, and the one-time legacy `zoom` migration.
//   SCOPE: preferences store zoom actions + migration only; key/wheel wiring is pinned in tests/renderer/pages/app-deep.test.js.
//   DEPENDS: src/renderer/src/store/preferences.js, Vitest + jsdom, mocked @tauri-apps/api/core + bus.
//   LINKS: .grace/changes/archive/C-49 R-1/R-2/R-4/R-5; .grace/verification/runtime.xml V-M-011 scenario-41.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FONT_SIZE_MIN - smallest editor text size (mirrors the store export).
//   FONT_SIZE_MAX - largest editor text size (mirrors the store export).
//   setLanguageMock - hoisted i18n setLanguage double.
//   busEmitMock - hoisted bus emit double.
//   store - the shared store under test (re-created per test).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-49 T-001: initial pin. The migration
//   and actual-size cases fail without the C-49 store actions; the mirror
//   cases fail when SET_USER_PREFERENCE does not re-base baseFontSize.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'

const { setLanguageMock, busEmitMock } = vi.hoisted(() => ({
  setLanguageMock: vi.fn(),
  busEmitMock: vi.fn()
}))

vi.mock('@/i18n', () => ({
  t: (key: string) => key,
  setLanguage: setLanguageMock,
  getCurrentLanguage: () => 'en'
}))

vi.mock('@/i18n/systemLocale', () => ({
  SYSTEM_LANGUAGE: 'system',
  resolveSystemLocale: () => 'en'
}))

vi.mock('@/bus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: busEmitMock
  }
}))

import { invoke } from '@tauri-apps/api/core'
// Mirrors store/preferences FONT_SIZE_MIN / FONT_SIZE_MAX; the store module is
// imported lazily (after setupTestPinia) like tests/renderer/store/preferences.test.ts.
const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 36

// Shared store under test — re-created per test by importStore().
let store

describe('store/preferences — C-49 unified zoom', () => {
  beforeEach(() => {
    setupTestPinia()
    busEmitMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(async () => {
    // Drain any pending persist debounce so it cannot leak into the next case.
    vi.advanceTimersByTime(250)
    vi.useRealTimers()
  })

  const importStore = async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    return usePreferencesStore()
  }

  describe('defaults and clamping', () => {
    it('defaults baseFontSize to 16', async () => {
      store = await importStore()
      expect(store.fontSize).toBe(16)
      expect(store.baseFontSize).toBe(16)
    })

    it('ZOOM_STEP applies instantly and clamps to 12–36', async () => {
      store = await importStore()
      store.fontSize = FONT_SIZE_MAX
      store.ZOOM_STEP(1)
      expect(store.fontSize).toBe(FONT_SIZE_MAX)

      store.fontSize = FONT_SIZE_MIN
      store.ZOOM_STEP(-1)
      expect(store.fontSize).toBe(FONT_SIZE_MIN)
    })

    it('ZOOM_STEP rounds fractional input into the clamp', async () => {
      store = await importStore()
      store.fontSize = 20
      store.APPLY_FONT_SIZE(22.6)
      expect(store.fontSize).toBe(23)
    })

    it('a step that changes nothing persists and emits nothing', async () => {
      store = await importStore()
      const setPrefSpy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
      store.fontSize = FONT_SIZE_MAX
      store.ZOOM_STEP(1)
      vi.advanceTimersByTime(250)
      expect(setPrefSpy).not.toHaveBeenCalled()
      expect(busEmitMock).not.toHaveBeenCalled()
    })
  })

  describe('persistence + indicator event', () => {
    it('persists the final fontSize once, after the 150 ms debounce', async () => {
      store = await importStore()
      const setPrefSpy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')

      store.ZOOM_STEP(1)
      store.ZOOM_STEP(1)
      store.ZOOM_STEP(1)
      expect(store.fontSize).toBe(19)
      expect(setPrefSpy).not.toHaveBeenCalled()

      vi.advanceTimersByTime(149)
      expect(setPrefSpy).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(setPrefSpy).toHaveBeenCalledTimes(1)
      expect(setPrefSpy).toHaveBeenCalledWith({ type: 'fontSize', value: 19 })
    })

    it('emits mt::zoom-level-changed with the live and base sizes', async () => {
      store = await importStore()
      store.baseFontSize = 16
      store.ZOOM_STEP(4)
      expect(busEmitMock).toHaveBeenCalledWith('mt::zoom-level-changed', {
        fontSize: 20,
        baseFontSize: 16
      })
    })
  })

  describe('⌘0 Actual Size restores the Settings size (R-2)', () => {
    it('ZOOM_ACTUAL_SIZE returns to baseFontSize, not a hard 16', async () => {
      store = await importStore()
      store.baseFontSize = 18
      store.fontSize = 24
      store.ZOOM_ACTUAL_SIZE()
      expect(store.fontSize).toBe(18)
    })

    it('zoom steps never overwrite baseFontSize', async () => {
      store = await importStore()
      store.baseFontSize = 18
      store.ZOOM_STEP(4)
      expect(store.fontSize).toBe(20)
      expect(store.baseFontSize).toBe(18)
      // The debounced persist writes fontSize only — never baseFontSize.
      vi.advanceTimersByTime(250)
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'fontSize', value: 20 })
      expect(invoke).not.toHaveBeenCalledWith('mt_prefs_set', {
        key: 'baseFontSize',
        value: expect.anything()
      })
    })
  })

  describe('baseFontSize mirror in SET_USER_PREFERENCE', () => {
    it('a Settings/hydration fontSize without baseFontSize re-bases it and persists', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ fontSize: 18 })
      expect(store.baseFontSize).toBe(18)
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'baseFontSize', value: 18 })
    })

    it('a payload that carries baseFontSize applies it verbatim (no mirror)', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ fontSize: 20, baseFontSize: 16 })
      expect(store.fontSize).toBe(20)
      expect(store.baseFontSize).toBe(16)
      expect(invoke).not.toHaveBeenCalledWith('mt_prefs_set', {
        key: 'baseFontSize',
        value: expect.anything()
      })
    })

    it('clamps a mirrored out-of-range Settings value', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ fontSize: 400 })
      expect(store.baseFontSize).toBe(FONT_SIZE_MAX)
    })
  })

  describe('legacy percentage-zoom migration (R-4)', () => {
    it('a stored zoom 1.25 opens as fontSize 20 (and baseFontSize 20), zoom reset to 1', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ zoom: 1.25, fontSize: 16, baseFontSize: 16 })

      const migrated = await store.MIGRATE_LEGACY_ZOOM()

      expect(migrated).toBe(true)
      expect(store.fontSize).toBe(20)
      expect(store.baseFontSize).toBe(20)
      expect(store.zoom).toBe(1)
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'fontSize', value: 20 })
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'baseFontSize', value: 20 })
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'zoom', value: 1 })
    })

    it('clamps the migrated size into 12–36', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ zoom: 2.5 })
      await store.MIGRATE_LEGACY_ZOOM()
      expect(store.fontSize).toBe(FONT_SIZE_MAX)

      store.SET_USER_PREFERENCE({ zoom: 0.4 })
      await store.MIGRATE_LEGACY_ZOOM()
      expect(store.fontSize).toBe(FONT_SIZE_MIN)
    })

    it('is a no-op when zoom is already 1', async () => {
      store = await importStore()
      store.zoom = 1
      const migrated = await store.MIGRATE_LEGACY_ZOOM()
      expect(migrated).toBe(false)
      expect(invoke).not.toHaveBeenCalledWith('mt_prefs_set', { key: 'zoom', value: 1 })
    })

    it('keeps the migrated in-memory state even if persistence rejects', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ zoom: 1.5 })
      invoke.mockRejectedValueOnce(new Error('prefs unavailable'))
      const migrated = await store.MIGRATE_LEGACY_ZOOM()
      expect(migrated).toBe(true)
      expect(store.fontSize).toBe(24)
      expect(store.zoom).toBe(1)
    })
  })
})
