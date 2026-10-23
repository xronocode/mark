// FILE: src/renderer/src/util/pluralCount.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Translate a count noun with the correct plural form for the
//            UI language ("1 совпадение" / "2 совпадения" / "5 совпадений").
//   SCOPE: one helper — CLDR plural category via Intl.PluralRules, sub-key
//          lookup `<baseKey>.<category>` with a `.other` fallback.
//   DEPENDS: i18n (t, getCurrentLanguage).
//   LINKS: components/recent/index.vue filesCountLabel (the C-46 round-2
//          pattern this generalizes); components/projectSearch/index.vue
//          search result summary (C-MULTI-SOURCE-WORKSPACE fix wave).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-22 C-MULTI-SOURCE-WORKSPACE fix wave:
//     extracted from recent/index.vue's filesCountLabel so the project
//     search summary ("1 совпадений в 1 файлах") pluralizes correctly.
// END_CHANGE_SUMMARY

import { t, getCurrentLanguage } from '../i18n'

// START_MODULE_MAP
//   pluralCount - translate a count noun with the CLDR plural category
// END_MODULE_MAP

// START_BLOCK_PLURAL_COUNT
// The app's vue-i18n instance disables "a | b" plural parsing (i18n/
// index.js returns any message containing "|" verbatim), so plural forms
// live as CLDR-category sub-keys — <baseKey>.one / .few / .many /
// .other — picked with Intl.PluralRules for the UI language and falling
// back to .other when a locale has no form for that category.
export const pluralCount = (baseKey, count) => {
  let category = 'other'
  try {
    category = new Intl.PluralRules(getCurrentLanguage() || 'en').select(count)
  } catch {
    // unknown locale tag → 'other'
  }
  const key = `${baseKey}.${category}`
  const label = t(key, { count })
  if (label && label !== key) return label
  return t(`${baseKey}.other`, { count })
}
// END_BLOCK_PLURAL_COUNT
