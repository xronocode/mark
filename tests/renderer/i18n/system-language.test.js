// FILE: tests/renderer/i18n/system-language.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-45 'system' interface language — navigator.languages resolution rules, setLanguage('system') applying the effective locale, and the localized "As in system" option label.
//   SCOPE: i18n/systemLocale.js pure resolution; i18n/index.js setLanguage('system'); prefComponents/general/config.js getLanguageOptions; preferences.language.system present in every shipped table.
//   DEPENDS: src/renderer/src/i18n/systemLocale.js, src/renderer/src/i18n/index.js, src/renderer/src/i18n/localeLoader.js, static/locales/*.
//   LINKS: .grace/changes/active/C-45 spec R-1..R-3; tests/renderer/store/preferences-language.test.js (store wiring).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CASES - single-tag resolution pins from the C-45 spec mapping table.
//   MULTI_TAG_CASES - preference-order and fallback pins.
//   stubLanguages - install an own navigator.languages value for one test.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-45 T-001 initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, afterEach, vi } from 'vitest'
import { SYSTEM_LANGUAGE, SHIPPED_LOCALES, resolveSystemLocale } from '@/i18n/systemLocale'
import { setLanguage, getCurrentLanguage } from '@/i18n'
import { BUNDLED_LOCALES, loadLocaleTable } from '@/i18n/localeLoader'
import { getLanguageOptions } from '@/prefComponents/tabs/general/config'
import enSource from '../../../static/locales/en.json'

const stubLanguages = (langs) => {
  Object.defineProperty(window.navigator, 'languages', { value: langs, configurable: true })
}

afterEach(() => {
  delete window.navigator.languages
})

const CASES = [
  ['en', 'en'],
  ['en-US', 'en'],
  ['en-KG', 'en'],
  ['ru-RU', 'ru'],
  ['pt-BR', 'pt'],
  ['pt-PT', 'pt'],
  ['de-AT', 'de'],
  ['de-DE', 'de'],
  ['fr-FR', 'fr'],
  ['ja-JP', 'ja'],
  ['ko-KR', 'ko'],
  ['es-ES', 'es'],
  ['es-MX', 'es'],
  ['zh-CN', 'zh-CN'],
  ['zh-SG', 'zh-CN'],
  ['zh-Hans', 'zh-CN'],
  ['zh-Hans-CN', 'zh-CN'],
  ['zh-TW', 'zh-TW'],
  ['zh-HK', 'zh-TW'],
  ['zh-MO', 'zh-TW'],
  ['zh-Hant', 'zh-TW'],
  ['zh-Hant-TW', 'zh-TW'],
  ['xx-YY', 'en'],
  ['xx', 'en'],
  ['ZH-HANT-HK', 'zh-TW']
]

const MULTI_TAG_CASES = [
  [['xx-YY', 'ru'], 'ru'],
  [['xx', 'ru'], 'ru'],
  [['fr-CA', 'en-US'], 'fr'],
  [['zh-Hant', 'zh-CN'], 'zh-TW'],
  [[], 'en'],
  [undefined, 'en']
]

describe('resolveSystemLocale (C-45 R-1)', () => {
  it.each(CASES)('maps %s to %s', (input, expected) => {
    expect(resolveSystemLocale([input])).toBe(expected)
  })

  it.each(MULTI_TAG_CASES)('maps %s to %s', (input, expected) => {
    expect(resolveSystemLocale(input)).toBe(expected)
  })

  it('iterates preferred tags in order and stops at the first shipped match', () => {
    expect(resolveSystemLocale(['xx-YY', 'pt-BR', 'en-US'])).toBe('pt')
  })

  it('defaults to navigator.languages when called with no argument', () => {
    stubLanguages(['ru-RU', 'en-US'])
    expect(resolveSystemLocale()).toBe('ru')
  })

  it('keeps SHIPPED_LOCALES in sync with the bundled locale tables', () => {
    expect([...SHIPPED_LOCALES].sort()).toEqual(BUNDLED_LOCALES)
  })
})

describe("setLanguage('system') (C-45 R-1)", () => {
  it('applies the resolved locale and never reports "system"', async () => {
    stubLanguages(['ru-RU', 'en-US'])
    window.i18nUtils.loadTranslations.mockResolvedValue({ 'app.title': 'Марк' })

    await setLanguage(SYSTEM_LANGUAGE)

    expect(window.i18nUtils.loadTranslations).toHaveBeenCalledWith('ru')
    expect(getCurrentLanguage()).toBe('ru')
    expect(getCurrentLanguage()).not.toBe('system')
  })

  it('keeps English on an English system without loading a table (en is bundled)', async () => {
    stubLanguages(['en-US'])
    await setLanguage(SYSTEM_LANGUAGE)
    expect(window.i18nUtils.loadTranslations).not.toHaveBeenCalled()
    expect(getCurrentLanguage()).toBe('en')
  })

  it('resolves traditional Chinese from a Hong Kong system', async () => {
    stubLanguages(['zh-HK'])
    window.i18nUtils.loadTranslations.mockResolvedValue({ x: 1 })

    await setLanguage(SYSTEM_LANGUAGE)

    expect(window.i18nUtils.loadTranslations).toHaveBeenCalledWith('zh-TW')
    expect(getCurrentLanguage()).toBe('zh-TW')
  })
})

describe("'As in system' option label (C-45)", () => {
  it('is the first entry of the language select with value system', async () => {
    await setLanguage('en') // real t() at a known locale
    const options = getLanguageOptions()
    expect(options[0].value).toBe('system')
    expect(options[0].label).toBe('As in system')
  })

  it('exists in every shipped translation table (min.json) and in the en source', async () => {
    for (const locale of BUNDLED_LOCALES) {
      const table = await loadLocaleTable(locale)
      expect(table.preferences.general.language.system, locale).toBeTruthy()
    }
    expect(enSource.preferences.general.language.system).toBe('As in system')
  })
})
