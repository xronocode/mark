// FILE: tests/renderer/store/preferences-load-repair.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PREFS-TRUTH T-001 (F-007) — pin the schema-driven hydration
//            validation and one-shot in-memory repair at the single load
//            point (ASK_FOR_USER_PREFERENCE → SET_USER_PREFERENCE): a
//            value failing its documented _shims/preferences/schema.json
//            constraints is repaired to the schema default exactly once
//            with a loud [PREFERENCES][BLOCK_PREFERENCES_REPAIR] marker,
//            a fully valid profile loads with zero repairs and zero
//            markers, and the documented legacy consumer value forms
//            (codeFontSize '14px', the C-49 contract), unknown keys and
//            the session-only experimental keys keep today's pass-through.
//   SCOPE: The hydration repair matrix and the corrected store values the
//          autosave gate (store/editor.js reads autoSave / autoSaveDelay)
//          and the General-tab presentation (autoSaveDelaySeconds) read.
//          Write semantics (SET_SINGLE_PREFERENCE) and the Rust store
//          (m005_prefs.rs loose-typed load_from) are out of scope.
//   DEPENDS: src/renderer/src/store/preferences.js, _shims/preferences/schema.json,
//            Pinia test setup, Vitest (mocked @tauri-apps/api/core + event,
//            i18n, bus, notification).
//   LINKS: src/renderer/src/store/preferences.js START_BLOCK_HYDRATION_VALIDATION;
//          src/renderer/src/_shims/preferences/schema.json;
//          tests/renderer/store/preference-defaults.test.js (the schema /
//          factory default consistency pin, C-PREFS-TRUTH T-004);
//          .grace/verification/runtime.xml V-M-005.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   invokeMock - the @tauri-apps/api/core invoke mock (mt_prefs_get_all serves currentProfile; mt_prefs_set records).
//   currentProfile - the prefs.json fixture the next hydration reads.
//   repairMarkers - console.log calls carrying [PREFERENCES][BLOCK_PREFERENCES_REPAIR].
//   hydrate - boot-hydrates currentProfile through the real ASK_FOR_USER_PREFERENCE.
//   consoleLogSpy - the console.log spy repair markers are read from.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-21 C-PREFS-TRUTH T-001: new — the
//   hydration repair matrix (valid profile byte-identical; the
//   "autoSave": "false" string repaired to true; autoSaveDelay
//   0/10001/non-number repaired to 5000; legacy codeFontSize '14px'
//   untouched; unknown and session-only keys untouched) and the corrected
//   store values the autosave gate and the General tab read.
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

// The prefs.json fixture the next boot hydration reads (mt_prefs_get_all).
let currentProfile = {}

const repairMarkers = () =>
  consoleLogSpy.mock.calls
    .map((call) => String(call[0]))
    .filter((line) => line.includes('[PREFERENCES][BLOCK_PREFERENCES_REPAIR]'))

const consoleLogSpy = vi.spyOn(console, 'log')

const hydrate = async () => {
  const { usePreferencesStore } = await import('@/store/preferences')
  const store = usePreferencesStore()
  await store.ASK_FOR_USER_PREFERENCE()
  return store
}

describe('C-PREFS-TRUTH T-001: schema-driven hydration validation and repair (F-007)', () => {
  beforeEach(() => {
    setupTestPinia()
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (command, args) => {
      if (command === 'mt_prefs_get_all') return currentProfile
      // mt_prefs_set (the code-block-line-numbers migration writes its flag)
      return null
    })
    consoleLogSpy.mockClear()
    currentProfile = {}
  })

  it('a fully valid profile loads with zero repairs and zero markers', async () => {
    currentProfile = {
      autoSave: false,
      autoSaveDelay: 3000,
      fontSize: 18,
      // The retired `theme` key migrates to the trio (C-41): ink is a valid
      // dark-mode id, so it lands on darkModeTheme and the light slot keeps
      // its schema default — no repair markers either way.
      theme: 'ink',
      language: 'en',
      editorLineWidth: '600px',
      codeFontSize: 16
    }
    const store = await hydrate()
    expect(store.autoSave).toBe(false)
    expect(store.autoSaveDelay).toBe(3000)
    expect(store.fontSize).toBe(18)
    expect(store.darkModeTheme).toBe('ink')
    expect(repairMarkers()).toEqual([])
  })

  it('a stored "autoSave": "false" string is repaired to true with exactly one marker naming key and reason', async () => {
    currentProfile = { autoSave: 'false' }
    const store = await hydrate()
    expect(store.autoSave).toBe(true)
    const markers = repairMarkers()
    expect(markers).toHaveLength(1)
    expect(markers[0]).toContain('key=autoSave')
    expect(markers[0]).toContain('raw="false"')
    expect(markers[0]).toContain('reason=type')
  })

  it('the corrected boolean is what the autosave gate reads (truthy true, not a truthy string)', async () => {
    currentProfile = { autoSave: 'false' }
    const store = await hydrate()
    // store/editor.js gates write-through autosave on `autoSave && …`; the
    // raw string 'false' was truthy and enabled autosave — the repaired
    // boolean false would disable it, the repaired default true re-enables
    // only the shipped default.
    expect(typeof store.autoSave).toBe('boolean')
    expect(store.autoSave).toBe(true)
  })

  it.each([0, 10001, 'fast'])(
    'an autoSaveDelay of %j is repaired to 5000 with exactly one marker',
    async (rawDelay) => {
      currentProfile = { autoSaveDelay: rawDelay }
      const store = await hydrate()
      expect(store.autoSaveDelay).toBe(5000)
      const markers = repairMarkers()
      expect(markers).toHaveLength(1)
      expect(markers[0]).toContain('key=autoSaveDelay')
      expect(markers[0]).toContain(`raw=${JSON.stringify(rawDelay)}`)
      const expectedReason = rawDelay === 0 ? 'min' : rawDelay === 10001 ? 'max' : 'type'
      expect(markers[0]).toContain(`reason=${expectedReason}`)
    }
  )

  it('the corrected delay is what the General-tab seconds presentation reads (5000ms → 5s)', async () => {
    currentProfile = { autoSaveDelay: 0 }
    const store = await hydrate()
    // prefComponents/tabs/general autoSaveDelaySeconds = delay / 1000 → the
    // 1-10 seconds range the tab renders; a raw 0 reached the timer raw.
    expect(Math.round(store.autoSaveDelay / 1000)).toBe(5)
  })

  it('the legacy codeFontSize "14px" string passes through unrepaired and unmarked (C-49 contract)', async () => {
    currentProfile = { codeFontSize: '14px' }
    const store = await hydrate()
    // util/theme.js addCommonStyle parses the legacy string form via
    // Number.parseFloat — the consumer contract wins over the schema's
    // type: number until the schema entry is honest.
    expect(store.codeFontSize).toBe('14px')
    expect(repairMarkers()).toEqual([])
  })

  it('an unknown key passes through untouched and unmarked', async () => {
    currentProfile = { notADocumentedPreference: 'keep-me' }
    const store = await hydrate()
    expect(store.notADocumentedPreference).toBeUndefined()
    expect(repairMarkers()).toEqual([])
  })

  it('a session-only experimental key stays stripped from hydration (never resurrected)', async () => {
    currentProfile = { experimentalProgressiveMount: true }
    const store = await hydrate()
    expect(store.experimentalProgressiveMount).toBe(false)
    expect(repairMarkers()).toEqual([])
  })
})
