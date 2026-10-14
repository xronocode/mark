// FILE: src/renderer/src/i18n/localeLoader.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Load a UI translation table for a locale from the bundled static/locales/*.min.json files.
//   SCOPE: import.meta.glob lazy chunks (one per locale), so the tables ship inside the renderer bundle in dev and in every Tauri build; unknown locales resolve to an empty map.
//   DEPENDS: static/locales/*.min.json (build-time glob).
//   LINKS: src/renderer/src/_shims/install-window-globals.js window.i18nUtils; src/renderer/src/i18n/index.js setLanguage.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   BUNDLED_LOCALES - locale codes with a bundled table.
//   loadLocaleTable - locale code → translation table ({} when missing or broken).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - block anchors for both log markers; error object logged with its stack. Replaces fetch(`/locales/<l>.min.json`), which 404'd in every Tauri build (vite publicDir does not exist), so non-English UI languages never loaded.
// END_CHANGE_SUMMARY

const LOADERS = import.meta.glob('../../../../static/locales/*.min.json', { import: 'default' })

const codeOf = (path) => path.split('/').pop().replace('.min.json', '')

export const BUNDLED_LOCALES = Object.keys(LOADERS).map(codeOf).sort()

// START_CONTRACT: loadLocaleTable
//   PURPOSE: Resolve one locale's translation table from the bundle.
//   INPUTS: { locale: string - e.g. 'ru', 'zh-CN' }
//   OUTPUTS: { Promise<object> - the table, or {} when the locale is not bundled or fails to load }
//   SIDE_EFFECTS: console.warn on a missing or broken locale
//   LINKS: window.i18nUtils.loadTranslations
// END_CONTRACT: loadLocaleTable
export async function loadLocaleTable(locale) {
  // START_BLOCK_LOCALE_MISSING
  const load = LOADERS[`../../../../static/locales/${locale}.min.json`]
  if (!load) {
    console.warn(`[i18n][loadLocaleTable][BLOCK_LOCALE_MISSING] no bundled locale ${locale}`)
    return {}
  }
  // END_BLOCK_LOCALE_MISSING
  // START_BLOCK_LOCALE_LOAD_FAILED
  try {
    const table = await load()
    return table && typeof table === 'object' ? table : {}
  } catch (e) {
    console.warn(`[i18n][loadLocaleTable][BLOCK_LOCALE_LOAD_FAILED] ${locale}:`, e)
    return {}
  }
  // END_BLOCK_LOCALE_LOAD_FAILED
}
