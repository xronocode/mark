// FILE: src/renderer/src/util/autoTheme.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Resolve the effective theme under followSystemTheme and track
//            live prefers-color-scheme changes (C-41 T-001 Auto mode).
//   SCOPE:   Pure resolution helpers over a preference-like object plus a
//            MediaQueryList change-listener factory. No store or DOM writes
//            here — callers (app.vue, preference.vue) own application.
//   DEPENDS: window.matchMedia (runtime), preference keys
//            followSystemTheme/lightModeTheme/darkModeTheme/theme.
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml
//            V-M-011 scenario-38 (C-41 T-001).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PREFERS_DARK_QUERY - matchMedia query string for the OS appearance.
//   systemPrefersDark - synchronous prefers-color-scheme snapshot (false when matchMedia is unavailable).
//   resolveAutoTheme - pick darkModeTheme or lightModeTheme for the current/overridden appearance.
//   effectiveTheme - followSystemTheme-aware theme for a preference-like object.
//   watchSystemColorScheme - register a live change listener; returns the unregister function.
// END_MODULE_MAP

export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)'

export const systemPrefersDark = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(PREFERS_DARK_QUERY).matches
}

// START_CONTRACT: resolveAutoTheme
//   PURPOSE: Pick the theme Auto mode should apply for an OS appearance.
//   INPUTS: { preferences: Object - needs darkModeTheme/lightModeTheme strings; prefersDark: boolean - optional appearance override (defaults to systemPrefersDark()) }
//   OUTPUTS: { string - theme id (darkModeTheme when dark, else lightModeTheme) }
//   SIDE_EFFECTS: none (reads matchMedia only when prefersDark is omitted)
//   LINKS: effectiveTheme, watchSystemColorScheme
// END_CONTRACT: resolveAutoTheme
export const resolveAutoTheme = (preferences, prefersDark = systemPrefersDark()) => {
  return prefersDark ? preferences.darkModeTheme : preferences.lightModeTheme
}

// START_CONTRACT: effectiveTheme
//   PURPOSE: The theme a window should apply right now for a preference set.
//   INPUTS: { preferences: Object - followSystemTheme plus theme/lightModeTheme/darkModeTheme }
//   OUTPUTS: { string - resolved Auto theme when followSystemTheme, else preferences.theme }
//   SIDE_EFFECTS: none
//   LINKS: resolveAutoTheme
// END_CONTRACT: effectiveTheme
export const effectiveTheme = (preferences) => {
  return preferences.followSystemTheme ? resolveAutoTheme(preferences) : preferences.theme
}

// START_CONTRACT: watchSystemColorScheme
//   PURPOSE: Run onChange(prefersDark) on every live prefers-color-scheme change.
//   INPUTS: { onChange: Function - receives the new boolean dark appearance }
//   OUTPUTS: { Function - unregisters the listener; safe to call twice or when matchMedia is missing }
//   SIDE_EFFECTS: Registers a MediaQueryList change listener (addEventListener, addListener fallback for old WKWebView).
//   LINKS: app.vue START_BLOCK_APPLY_AUTO_THEME, preference.vue theme watchers
// END_CONTRACT: watchSystemColorScheme
export const watchSystemColorScheme = (onChange) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mql = window.matchMedia(PREFERS_DARK_QUERY)
  const handler = (event) => onChange(event.matches)
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }
  // Legacy WebKit (older macOS WKWebView) — deprecated MediaQueryList API.
  mql.addListener(handler)
  return () => mql.removeListener(handler)
}
