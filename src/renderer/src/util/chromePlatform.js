// FILE: src/renderer/src/util/chromePlatform.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Per-OS chrome identity for C-38 T-006 N4 — the root platform class the accent fallback CSS keys on, plus the single-source tables for the system UI font stack and the per-OS accent fallbacks.
//   SCOPE: Pure platform→class/color resolution and one installer that puts the class on the document root; reads the platform lazily (never at import).
//   DEPENDS: window.electron.process.platform (window shim).
//   LINKS: assets/styles/index.css (consumes the class + mirrors the values); .grace/graph/runtime.xml M-011, M-057; .grace/changes/active/C-38 T-006; tests/renderer/chrome/chrome-platform.test.js.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CHROME_FONT_FAMILY - the per-OS system UI stack (identical string to --chromeFontFamily in assets/styles/index.css; the unit test pins the two together).
//   CHROME_PLATFORM_CLASSES - platform id → root class (darwin→platform-darwin, win32→platform-win32, linux→platform-linux).
//   CHROME_ACCENT_FALLBACKS - platform id → { accentLight, accentDark, softLight, softDark } used when CSS AccentColor is unsupported (same literals as index.css).
//   resolveChromePlatform - platform string → normalized id (defaults to linux for unknown).
//   chromePlatformClass - platform string → root class name.
//   resolveChromeAccentFallback - (platform, dark) → { accent, soft } fallback pair.
//   installChromePlatformClass - add the platform class to a root element (default document.documentElement), idempotent; returns the class added.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-38 T-006 N4 a/b: initial module.
//   The chrome system-font stack and the per-OS accent fallbacks live
//   here as the testable single source; index.css mirrors the values
//   and resolves the live colours (@supports AccentColor first).
// END_CHANGE_SUMMARY

export const CHROME_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, Ubuntu, Cantarell, "Noto Sans", sans-serif'

export const CHROME_PLATFORM_CLASSES = Object.freeze({
  darwin: 'platform-darwin',
  win32: 'platform-win32',
  linux: 'platform-linux'
})

// Fallback accents per OS (task spec): macOS #007AFF light / #0A84FF
// dark, Windows #005FB8 light / #4CC2FF dark, Linux #3584E4 both.
// `soft` is the accent at ~14% alpha for selection backgrounds. The
// CSS AccentColor branch replaces these wherever supported.
export const CHROME_ACCENT_FALLBACKS = Object.freeze({
  darwin: Object.freeze({
    accentLight: '#007aff',
    accentDark: '#0a84ff',
    softLight: 'rgba(0, 122, 255, 0.14)',
    softDark: 'rgba(10, 132, 255, 0.14)'
  }),
  win32: Object.freeze({
    accentLight: '#005fb8',
    accentDark: '#4cc2ff',
    softLight: 'rgba(0, 103, 192, 0.14)',
    softDark: 'rgba(76, 194, 255, 0.14)'
  }),
  linux: Object.freeze({
    accentLight: '#3584e4',
    accentDark: '#3584e4',
    softLight: 'rgba(53, 132, 228, 0.14)',
    softDark: 'rgba(53, 132, 228, 0.14)'
  })
})

export const resolveChromePlatform = (platform) =>
  platform === 'darwin' || platform === 'win32' || platform === 'linux' ? platform : 'linux'

export const chromePlatformClass = (platform) =>
  CHROME_PLATFORM_CLASSES[resolveChromePlatform(platform)]

export const resolveChromeAccentFallback = (platform, dark = false) => {
  const entry = CHROME_ACCENT_FALLBACKS[resolveChromePlatform(platform)]
  return dark
    ? { accent: entry.accentDark, soft: entry.softDark }
    : { accent: entry.accentLight, soft: entry.softLight }
}

// START_BLOCK_INSTALL_PLATFORM_CLASS
// main.js calls this once after the window shim exists. The platform is
// read lazily (tests swap window.electron.process.platform with
// getters); the class lands on the document root so index.css can key
// the per-OS accent fallbacks, and adding is idempotent because boot
// paths and tests may re-run it.
export const installChromePlatformClass = (root) => {
  const target = root || (typeof document !== 'undefined' ? document.documentElement : null)
  if (!target || typeof target.classList === 'undefined') return null
  const platform =
    typeof window !== 'undefined' ? window.electron?.process?.platform : undefined
  const cls = chromePlatformClass(platform)
  Object.values(CHROME_PLATFORM_CLASSES).forEach((name) => {
    if (name !== cls) target.classList.remove(name)
  })
  target.classList.add(cls)
  return cls
}
// END_BLOCK_INSTALL_PLATFORM_CLASS
