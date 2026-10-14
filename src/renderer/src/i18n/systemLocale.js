// FILE: src/renderer/src/i18n/systemLocale.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Map the OS preferred languages (navigator.languages) onto one shipped UI locale for the language='system' preference.
//   SCOPE: pure resolution only — no i18n application, no listeners (C-45 T-001).
//   DEPENDS: none at runtime; SHIPPED_LOCALES mirrors static/locales/*.min.json (pinned by tests/renderer/i18n/locale-loader.test.js).
//   LINKS: src/renderer/src/i18n/index.js setLanguage; src/renderer/src/store/preferences.js LISTEN_SYSTEM_LANGUAGE; src/renderer/src/prefComponents/general/config.js getLanguageOptions.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SYSTEM_LANGUAGE - sentinel preference value meaning "follow the OS preferred languages".
//   SHIPPED_LOCALES - the ten locale codes with a bundled translation table.
//   resolveSystemLocale - preferred language tags → one shipped locale ('en' fallback).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-45 T-001 initial rules: exact match, zh script/region families, primary subtag, 'en' fallback.
// END_CHANGE_SUMMARY

export const SYSTEM_LANGUAGE = 'system'

// Keep in sync with static/locales/*.min.json (localeLoader BUNDLED_LOCALES).
export const SHIPPED_LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']

// zh script/region families (subtags lowercased): Hans + simplified-region
// tags → zh-CN; Hant + traditional-region tags → zh-TW (C-45 R-1).
const ZH_SIMPLIFIED_SUBTAGS = new Set(['hans', 'cn', 'sg'])
const ZH_TRADITIONAL_SUBTAGS = new Set(['hant', 'tw', 'hk', 'mo'])

// START_CONTRACT: resolveSystemLocale
//   PURPOSE: Pick the first shipped UI locale matching the preferred language tags, in preference order.
//   INPUTS: { languages: Array<string> - BCP-47 tags, defaults to navigator.languages }
//   OUTPUTS: { string - a SHIPPED_LOCALES code; 'en' when nothing matches }
//   SIDE_EFFECTS: none
//   LINKS: setLanguage('system'); store/preferences.js LISTEN_SYSTEM_LANGUAGE
// END_CONTRACT: resolveSystemLocale
export const resolveSystemLocale = (languages = navigator.languages) => {
  // START_BLOCK_RESOLVE_NO_TAGS
  const tags = Array.isArray(languages) ? languages : []
  if (tags.length === 0) {
    return 'en'
  }
  // END_BLOCK_RESOLVE_NO_TAGS

  for (const raw of tags) {
    if (typeof raw !== 'string' || !raw) continue
    const tag = raw.toLowerCase()

    // 1) Exact match ('en', 'zh-CN', 'zh-TW', …).
    const exact = SHIPPED_LOCALES.find((locale) => locale.toLowerCase() === tag)
    if (exact) return exact

    const [primary, ...subtags] = tag.split('-')

    // 2) zh script/region families: zh-Hans-CN / zh-CN / zh-SG → zh-CN,
    //    zh-Hant / zh-TW / zh-HK / zh-MO → zh-TW.
    if (primary === 'zh') {
      if (subtags.some((s) => ZH_SIMPLIFIED_SUBTAGS.has(s))) return 'zh-CN'
      if (subtags.some((s) => ZH_TRADITIONAL_SUBTAGS.has(s))) return 'zh-TW'
      // bare 'zh' with no family subtag falls through — no shipped 'zh'.
    }

    // 3) Primary subtag ('en-KG' → 'en', 'pt-BR' → 'pt', 'de-AT' → 'de').
    const byPrimary = SHIPPED_LOCALES.find((locale) => locale.toLowerCase() === primary)
    if (byPrimary) return byPrimary
  }

  return 'en'
}
