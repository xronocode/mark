// FILE: tests/renderer/store/preference-defaults.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-24 out-of-the-box defaults (footnotes on, images stored in a relative assets/ folder) and keep the two default sources in agreement.
//   SCOPE: usePreferencesStore initial state and static/preference.json.
//   DEPENDS: src/renderer/src/store/preferences.js, static/preference.json, Pinia, Vitest.
//   LINKS: .grace/changes/active/C-24 R-1/R-2; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   C24_DEFAULTS - the preference keys and values C-24 sets for new installs.
//   STORE_ONLY_DEFAULTS - defaults the C-24 image flow relies on that only the store defines.
//   STATIC_DEFAULTS - parsed static/preference.json (upstream legacy, kept in sync for the C-24 keys).
// END_MODULE_MAP

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

const C24_DEFAULTS = { footnote: true, imagePreferRelativeDirectory: true, imageRelativeDirectoryName: 'assets' }
// static/preference.json is upstream legacy (no runtime reader) and already disagrees on imageInsertAction ('path'); only the store governs it.
const STORE_ONLY_DEFAULTS = { imageInsertAction: 'folder' }
const STATIC_DEFAULTS = JSON.parse(readFileSync(resolve(__dirname, '../../../static/preference.json'), 'utf8'))

describe('C-24 preference defaults', () => {
  beforeEach(() => setupTestPinia())

  for (const [key, value] of Object.entries(C24_DEFAULTS)) {
    it(`store default ${key} = ${JSON.stringify(value)}`, async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      expect(usePreferencesStore().$state[key]).toBe(value)
    })
    it(`static/preference.json ${key} = ${JSON.stringify(value)}`, () => {
      expect(STATIC_DEFAULTS[key]).toBe(value)
    })
  }

  for (const [key, value] of Object.entries(STORE_ONLY_DEFAULTS)) {
    it(`store default ${key} = ${JSON.stringify(value)}`, async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      expect(usePreferencesStore().$state[key]).toBe(value)
    })
  }
})
