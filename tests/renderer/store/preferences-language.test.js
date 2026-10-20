// FILE: tests/renderer/store/preferences-language.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-45 language preference wiring — fresh-profile default 'system' (store + schema), stored concrete locales preserved, and the languagechange/focus re-resolution guards.
//   SCOPE: store/preferences.js language default, SET_USER_PREFERENCE / SET_SINGLE_PREFERENCE pass-through, LISTEN_SYSTEM_LANGUAGE binding; _shims/preferences/schema.json default.
//   DEPENDS: src/renderer/src/store/preferences.js, src/renderer/src/_shims/preferences/schema.json, Pinia, Vitest.
//   LINKS: .grace/changes/archive/C-45 spec R-1..R-3; tests/renderer/i18n/system-language.test.js (real setLanguage resolution).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   setLanguageMock - captures applied locales (i18n is mocked here; resolution itself is pinned in the i18n file).
//   getCurrentLanguageMock - stands in for the effective locale in only-if-changed guards.
//   SCHEMA - parsed _shims/preferences/schema.json.
//   stubLanguages - install an own navigator.languages value for one test.
//   importStore - fresh store module per test (resets the LISTEN_SYSTEM_LANGUAGE bind guard).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-45 T-001 initial pins.
// END_CHANGE_SUMMARY

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'

const setLanguageMock = vi.fn()
const getCurrentLanguageMock = vi.fn()

vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: setLanguageMock,
  getCurrentLanguage: getCurrentLanguageMock
}))

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() }
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

const SCHEMA = JSON.parse(
  readFileSync(resolve(__dirname, '../../../src/renderer/src/_shims/preferences/schema.json'), 'utf8')
)

const stubLanguages = (langs) => {
  Object.defineProperty(window.navigator, 'languages', { value: langs, configurable: true })
}

const importStore = async () => {
  const { usePreferencesStore } = await import('@/store/preferences')
  return usePreferencesStore()
}

describe('preferences store — language "system" (C-45)', () => {
  let addEventListenerSpy

  beforeEach(() => {
    setupTestPinia()
    // Fresh module scope per test: the module-level LISTEN_SYSTEM_LANGUAGE
    // bind guard must reset so each test can bind its own listeners.
    vi.resetModules()
    setLanguageMock.mockReset()
    getCurrentLanguageMock.mockReset()
    // Capture (and later remove) every window listener a test binds, so
    // handlers from one test never fire during another.
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
  })

  afterEach(() => {
    for (const [type, handler] of addEventListenerSpy.mock.calls) {
      window.removeEventListener(type, handler)
    }
    addEventListenerSpy.mockRestore()
    delete window.navigator.languages
  })

  it('fresh profile defaults to language system in the store and the schema', async () => {
    const s = await importStore()
    expect(s.language).toBe('system')
    expect(SCHEMA.language.default).toBe('system')
  })

  it('a stored concrete locale survives hydration and is applied as-is (no migration)', async () => {
    const s = await importStore()
    s.SET_USER_PREFERENCE({ language: 'ru' })
    expect(s.language).toBe('ru')
    expect(setLanguageMock).toHaveBeenCalledWith('ru')

    setLanguageMock.mockClear()
    await s.SET_SINGLE_PREFERENCE({ type: 'language', value: 'ru' })
    expect(s.language).toBe('ru')
    expect(setLanguageMock).toHaveBeenCalledWith('ru')
  })

  it('picking "As in system" passes the sentinel through to setLanguage', async () => {
    const s = await importStore()
    // The settings-select path (language/index.vue → SET_SINGLE_PREFERENCE);
    // SET_USER_PREFERENCE would skip it as equal to the fresh-profile default.
    await s.SET_SINGLE_PREFERENCE({ type: 'language', value: 'system' })
    expect(s.language).toBe('system')
    expect(setLanguageMock).toHaveBeenCalledWith('system')
  })

  describe('LISTEN_SYSTEM_LANGUAGE', () => {
    it('immediately applies the resolved locale while the preference is system', async () => {
      stubLanguages(['ru-RU', 'en-US'])
      getCurrentLanguageMock.mockReturnValue('en')
      const s = await importStore()
      s.LISTEN_SYSTEM_LANGUAGE()
      expect(setLanguageMock).toHaveBeenCalledWith('ru')
    })

    it('re-resolves on window languagechange and focus', async () => {
      stubLanguages(['ru-RU', 'en-US'])
      getCurrentLanguageMock.mockReturnValue('en')
      const s = await importStore()
      s.LISTEN_SYSTEM_LANGUAGE()
      setLanguageMock.mockClear()

      window.dispatchEvent(new Event('languagechange'))
      expect(setLanguageMock).toHaveBeenCalledWith('ru')

      setLanguageMock.mockClear()
      window.dispatchEvent(new Event('focus'))
      expect(setLanguageMock).toHaveBeenCalledWith('ru')
    })

    it('follows a later system language change (system switched to Russian)', async () => {
      stubLanguages(['en-US'])
      getCurrentLanguageMock.mockReturnValue('en')
      const s = await importStore()
      s.LISTEN_SYSTEM_LANGUAGE()
      expect(setLanguageMock).not.toHaveBeenCalled() // en already effective

      stubLanguages(['ru-RU'])
      window.dispatchEvent(new Event('languagechange'))
      expect(setLanguageMock).toHaveBeenCalledWith('ru')
    })

    it('applies only when the effective locale actually changed', async () => {
      stubLanguages(['ru-RU'])
      getCurrentLanguageMock.mockReturnValue('ru') // already effective
      const s = await importStore()
      s.LISTEN_SYSTEM_LANGUAGE()
      expect(setLanguageMock).not.toHaveBeenCalled()

      window.dispatchEvent(new Event('languagechange'))
      window.dispatchEvent(new Event('focus'))
      expect(setLanguageMock).not.toHaveBeenCalled()
    })

    it('does not re-resolve when the preference is a concrete locale', async () => {
      stubLanguages(['ru-RU'])
      getCurrentLanguageMock.mockReturnValue('en')
      const s = await importStore()
      s.SET_USER_PREFERENCE({ language: 'de' })
      setLanguageMock.mockClear()

      window.dispatchEvent(new Event('languagechange'))
      window.dispatchEvent(new Event('focus'))
      expect(setLanguageMock).not.toHaveBeenCalled()
    })

    it('never stacks duplicate listeners on repeated binds', async () => {
      stubLanguages(['ru-RU', 'en-US'])
      getCurrentLanguageMock.mockReturnValue('en')
      const s = await importStore()
      s.LISTEN_SYSTEM_LANGUAGE()
      s.LISTEN_SYSTEM_LANGUAGE()
      setLanguageMock.mockClear()

      window.dispatchEvent(new Event('languagechange'))
      expect(setLanguageMock).toHaveBeenCalledTimes(1)
    })
  })
})
