// FILE: src/renderer/src/util/nativeWindowTheme.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Keep the native window appearance (macOS NSAppearance: title bar, traffic lights, native menus) in step with the app theme's light/dark classification, so windows with a native title bar (Settings) follow the theme instead of the system appearance.
//   SCOPE: syncNativeWindowTheme(isDark) — lazy @tauri-apps/api/window import, setTheme('dark'|'light') on the current window, deduplicated, no-op outside Tauri.
//   DEPENDS: @tauri-apps/api/window (getCurrentWindow().setTheme; capability core:window:allow-set-theme).
//   LINKS: C-51 T-008 live smoke (Settings title bar stayed light under Ink); util/theme.js addThemeStyle (caller); .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   syncNativeWindowTheme - apply the light/dark appearance to the current native window once per change; resolves to the applied value or null when skipped.
//   resetNativeWindowThemeForTests - forget the last applied value (tests only).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-008: new — the Settings window
//   uses the native title bar, which followed the macOS appearance (light)
//   while the app theme was Ink.
// END_CHANGE_SUMMARY

let lastApplied = null

export const syncNativeWindowTheme = async (isDark) => {
  // START_BLOCK_NATIVE_WINDOW_THEME
  const theme = isDark ? 'dark' : 'light'
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return null
  if (lastApplied === theme) return null
  lastApplied = theme
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setTheme(theme)
    console.debug('[nativeWindowTheme][syncNativeWindowTheme][BLOCK_NATIVE_WINDOW_THEME] applied', { theme })
    return theme
  } catch (err) {
    lastApplied = null
    console.warn('[nativeWindowTheme][syncNativeWindowTheme][BLOCK_NATIVE_WINDOW_THEME] setTheme failed', { theme, error: String(err) })
    return null
  }
  // END_BLOCK_NATIVE_WINDOW_THEME
}

export const resetNativeWindowThemeForTests = () => {
  lastApplied = null
}
