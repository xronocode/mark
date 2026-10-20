// FILE: src/renderer/src/prefComponents/tabs/general/config.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Option builders for the General tab (C-38 T-004) — the app-language pop-up (with the 'system' sentinel), the line-endings pop-up labels and the file-encoding list.
//   SCOPE: Pure i18n-backed option lists; no store or window access.
//   DEPENDS: i18n (t), i18n/systemLocale (SYSTEM_LANGUAGE), common/encoding (ENCODING_NAME_MAP).
//   LINKS: .grace/changes/archive/C-38 T-004; docs/design/settings-ia-2026-10-15.md §3.1; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   getLanguageOptions - the 10 shipped locales led by 'system' (follows the OS preferred languages; C-45 default).
//   getEndOfLineOptions - "Match my operating system" / "LF (Unix, macOS)" / "CRLF (Windows)" in IA §3.1 wording.
//   getDefaultEncodingOptions - ENCODING_NAME_MAP entries, built once and cached (the list never changes at runtime).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: replaces prefComponents/general/config.js (title-bar/file-sort/zoom option builders retired with the old page); language options move here, line endings get plain-language labels.]
// END_CHANGE_SUMMARY

import { t } from '@/i18n'
import { SYSTEM_LANGUAGE } from '@/i18n/systemLocale'
import { ENCODING_NAME_MAP } from 'common/encoding'

// C-45 T-001: 'system' (As in system) leads the list — it is the
// new-profile default and follows the OS preferred languages.
export const getLanguageOptions = () => [{
  label: t('preferences.general.language.system'),
  value: SYSTEM_LANGUAGE
}, {
  label: t('preferences.general.language.english'),
  value: 'en'
}, {
  label: t('preferences.general.language.russian'),
  value: 'ru'
}, {
  label: t('preferences.general.language.chinese'),
  value: 'zh-CN'
}, {
  label: t('preferences.general.language.traditionalChinese'),
  value: 'zh-TW'
}, {
  label: t('preferences.general.language.spanish'),
  value: 'es'
}, {
  label: t('preferences.general.language.french'),
  value: 'fr'
}, {
  label: t('preferences.general.language.german'),
  value: 'de'
}, {
  label: t('preferences.general.language.japanese'),
  value: 'ja'
}, {
  label: t('preferences.general.language.korean'),
  value: 'ko'
}, {
  label: t('preferences.general.language.portuguese'),
  value: 'pt'
}]

// IA §3.1 "Line endings": plain-language labels instead of Default/CRLF/LF jargon.
export const getEndOfLineOptions = () => [{
  label: t('preferences.general.filesAndSaving.endOfLineSystem'),
  value: 'default'
}, {
  label: t('preferences.general.filesAndSaving.endOfLineLf'),
  value: 'lf'
}, {
  label: t('preferences.general.filesAndSaving.endOfLineCrlf'),
  value: 'crlf'
}]

// Built once and cached — the encoding list is static at runtime.
let defaultEncodingOptions = null
export const getDefaultEncodingOptions = () => {
  if (defaultEncodingOptions) {
    return defaultEncodingOptions
  }

  defaultEncodingOptions = []
  for (const [value, label] of Object.entries(ENCODING_NAME_MAP)) {
    defaultEncodingOptions.push({ label, value })
  }
  return defaultEncodingOptions
}
