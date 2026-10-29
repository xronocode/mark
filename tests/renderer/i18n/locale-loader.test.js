// FILE: tests/renderer/i18n/locale-loader.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin that every shipped UI language loads from the bundle (regression: the fetch path 404'd in Tauri builds).
//   SCOPE: loadLocaleTable over all static/locales/*.json; missing-locale fallback.
//   DEPENDS: src/renderer/src/i18n/localeLoader.js
//   LINKS: src/renderer/src/_shims/install-window-globals.js window.i18nUtils
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EXPECTED - the ten UI languages offered in Settings.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi } from 'vitest'
import { BUNDLED_LOCALES, loadLocaleTable } from '@/i18n/localeLoader'

const EXPECTED = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']

describe('localeLoader', () => {
  it('bundles all ten UI languages', () => {
    expect(BUNDLED_LOCALES).toEqual(EXPECTED)
  })

  it('loads a real translation table for every language', async () => {
    for (const locale of EXPECTED) {
      const table = await loadLocaleTable(locale)
      expect(table.contextMenu.editor.copyAsStructuredText, locale).toBeTruthy()
    }
    expect((await loadLocaleTable('ru')).contextMenu.editor.copyAsStructuredText)
      .toBe('Копировать как структурированный текст')
  })

  it('returns an empty map with an anchored warning for an unknown locale', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await loadLocaleTable('xx')).toEqual({})
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[i18n][loadLocaleTable][BLOCK_LOCALE_MISSING]'))
    } finally {
      warn.mockRestore()
    }
  })
})
