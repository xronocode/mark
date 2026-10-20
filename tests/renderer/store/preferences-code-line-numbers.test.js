// FILE: tests/renderer/store/preferences-code-line-numbers.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-38 T-005 codeBlockLineNumbers default flip — false for new profiles, one-time migration of a stored true (the never-user-settable old default) via ASK_FOR_USER_PREFERENCE, and the codeBlockLineNumbersMigrated flag that keeps later user choices.
//   SCOPE: store/preferences.js state defaults, MIGRATE_CODE_BLOCK_LINE_NUMBERS, and its invocation at the end of ASK_FOR_USER_PREFERENCE.
//   DEPENDS: src/renderer/src/store/preferences.js, src/renderer/src/_shims/preferences/schema.json, Vitest + jsdom, mocked @tauri-apps/api/core + bus.
//   LINKS: .grace/changes/archive/C-38 T-005; .grace/verification/runtime.xml V-M-012 scenario-20.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   setLanguageMock - hoisted i18n setLanguage double.
//   busEmitMock - hoisted bus emit double.
//   readSchema - parsed _shims/preferences/schema.json.
//   importStore - lazily imports the store after setupTestPinia.
//   store - the preferences store instance under test.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-38 T-005: initial pin. The default and
//   schema cases fail against the pre-C-38 sources (default true); the
//   migration cases fail when MIGRATE_CODE_BLOCK_LINE_NUMBERS does not exist.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'

const { setLanguageMock, busEmitMock } = vi.hoisted(() => ({
  setLanguageMock: vi.fn(),
  busEmitMock: vi.fn()
}))

vi.mock('@/i18n', () => ({
  t: (key) => key,
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

const readSchema = () =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../../src/renderer/src/_shims/preferences/schema.json'), 'utf8')
  )

let store

const importStore = async () => {
  const { usePreferencesStore } = await import('@/store/preferences')
  return usePreferencesStore()
}

describe('store/preferences — C-38 T-005 codeBlockLineNumbers default + migration', () => {
  beforeEach(() => {
    setupTestPinia()
    setLanguageMock.mockReset()
    busEmitMock.mockReset()
  })

  describe('defaults (new profiles)', () => {
    it('defaults codeBlockLineNumbers to false', async () => {
      store = await importStore()
      expect(store.codeBlockLineNumbers).toBe(false)
      expect(store.codeBlockLineNumbersMigrated).toBe(false)
    })

    it('schema.json documents the same default', () => {
      const schema = readSchema()
      expect(schema.codeBlockLineNumbers.default).toBe(false)
      expect(schema.codeBlockLineNumbersMigrated.default).toBe(false)
    })
  })

  describe('one-time migration', () => {
    it('flips a stored true to false once and records that it ran', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ codeBlockLineNumbers: true })

      const flipped = await store.MIGRATE_CODE_BLOCK_LINE_NUMBERS()

      expect(flipped).toBe(true)
      expect(store.codeBlockLineNumbers).toBe(false)
      expect(store.codeBlockLineNumbersMigrated).toBe(true)
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'codeBlockLineNumbers', value: false })
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'codeBlockLineNumbersMigrated', value: true })
    })

    it('does not flip a stored false and still records that it ran', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ codeBlockLineNumbers: false })

      const flipped = await store.MIGRATE_CODE_BLOCK_LINE_NUMBERS()

      expect(flipped).toBe(false)
      expect(store.codeBlockLineNumbers).toBe(false)
      expect(store.codeBlockLineNumbersMigrated).toBe(true)
      expect(invoke).not.toHaveBeenCalledWith('mt_prefs_set', {
        key: 'codeBlockLineNumbers',
        value: expect.anything()
      })
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'codeBlockLineNumbersMigrated', value: true })
    })

    it('never runs again once the flag is stored — the user choice is kept', async () => {
      store = await importStore()
      // A post-migration profile that chose line numbers in Settings.
      store.SET_USER_PREFERENCE({ codeBlockLineNumbers: true, codeBlockLineNumbersMigrated: true })
      invoke.mockClear()

      const flipped = await store.MIGRATE_CODE_BLOCK_LINE_NUMBERS()

      expect(flipped).toBe(false)
      expect(store.codeBlockLineNumbers).toBe(true)
      expect(invoke).not.toHaveBeenCalled()
    })

    it('keeps the migrated in-memory state even if persistence rejects', async () => {
      store = await importStore()
      store.SET_USER_PREFERENCE({ codeBlockLineNumbers: true })
      invoke.mockRejectedValueOnce(new Error('prefs unavailable'))

      const flipped = await store.MIGRATE_CODE_BLOCK_LINE_NUMBERS()

      expect(flipped).toBe(true)
      expect(store.codeBlockLineNumbers).toBe(false)
      expect(store.codeBlockLineNumbersMigrated).toBe(true)
    })

    it('runs once per boot hydration via ASK_FOR_USER_PREFERENCE', async () => {
      invoke.mockImplementation((cmd) => {
        if (cmd === 'mt_prefs_get_all') {
          return { theme: 'light', codeBlockLineNumbers: true }
        }
        return undefined
      })
      store = await importStore()

      await store.ASK_FOR_USER_PREFERENCE()

      expect(store.codeBlockLineNumbers).toBe(false)
      expect(store.codeBlockLineNumbersMigrated).toBe(true)
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'codeBlockLineNumbers', value: false })
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'codeBlockLineNumbersMigrated', value: true })
    })
  })
})
