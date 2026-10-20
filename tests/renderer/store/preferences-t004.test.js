// FILE: tests/renderer/store/preferences-t004.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-38 T-004 store behaviours — the null-stomp guard for boot URL params (IA §5 bug 15), the image-upload retirement (user decision 0c17da80), and RESET_PREFERENCES_TO_DEFAULTS (Advanced › Reset).
//   SCOPE: SET_USER_PREFERENCE guards/fallbacks and the reset action over the preferenceDefaults factory.
//   DEPENDS: src/renderer/src/store/preferences.js, Pinia, Vitest.
//   LINKS: .grace/changes/archive/C-38 T-004; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   NULL_PAYLOAD - the bootstrap initialState shape with absent URL params.
//   DROPPED_FROM_SCHEMA - keys the T-004 schema no longer defines.
//   SET_LANGUAGE_MOCK - hoisted i18n setLanguage spy.
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

import { usePreferencesStore } from '@/store/preferences'
import { invoke } from '@tauri-apps/api/core'

// bootstrap.js parseUrlArgs builds exactly this shape when no cff/cfs/tbs
// params ride the URL (IA §5 bug 15).
const NULL_PAYLOAD = {
  codeFontFamily: null,
  codeFontSize: null,
  hideScrollbar: false,
  theme: null,
  titleBarStyle: null
}

describe('preferences store — C-38 T-004', () => {
  beforeEach(() => {
    setupTestPinia()
    SET_LANGUAGE_MOCK.mockClear()
    invoke.mockClear()
  })

  describe('null-stomp guard (IA §5 bug 15)', () => {
    it('null URL-param values never overwrite the style defaults', () => {
      const store = usePreferencesStore()
      store.SET_USER_PREFERENCE(NULL_PAYLOAD)
      expect(store.codeFontSize).toBe(14)
      expect(store.codeFontFamily).toBe('DejaVu Sans Mono')
      expect(store.titleBarStyle).toBe('custom')
    })

    it('real values still apply', () => {
      const store = usePreferencesStore()
      store.SET_USER_PREFERENCE({ codeFontSize: 18, titleBarStyle: 'native' })
      expect(store.codeFontSize).toBe(18)
      expect(store.titleBarStyle).toBe('native')
    })

    it('undefined values stay filtered as before', () => {
      const store = usePreferencesStore()
      store.SET_USER_PREFERENCE({ autoSave: undefined })
      expect(store.autoSave).toBe(false)
    })
  })

  describe('image upload retired (user decision 2026-10-15, 0c17da80)', () => {
    it('a stored upload insert action falls back to folder', () => {
      const store = usePreferencesStore()
      store.SET_USER_PREFERENCE({ imageInsertAction: 'upload' })
      expect(store.imageInsertAction).toBe('folder')
    })
  })
})

// The 14 IA §4.1 dropped keys must be absent from the schema (they may
// still exist in stored prefs.json — the backend ignores unknown keys).
const DROPPED_FROM_SCHEMA = [
  'startUpAction', 'restoreLayoutState', 'defaultDirectoryToOpen',
  'openFilesInNewWindow', 'openFolderInNewWindow', 'fileSortBy',
  'lastOpenedFolder', 'autoGuessEncoding', 'autoNormalizeLineEndings',
  'trimTrailingNewline', 'preferHeadingStyle', 'autoSnapWindowWidth',
  'watcherUsePolling'
]

describe('dropped keys are gone from the reset surface', () => {
  beforeEach(() => setupTestPinia())

  it('resetting never writes a dropped key', async () => {
    const store = usePreferencesStore()
    await store.RESET_PREFERENCES_TO_DEFAULTS()
    const persistedKeys = invoke.mock.calls.map((call) => call[1]?.key)
    for (const key of DROPPED_FROM_SCHEMA) {
      expect(persistedKeys).not.toContain(key)
    }
  })
})
