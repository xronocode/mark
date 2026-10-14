// FILE: tests/renderer/util/autoTheme.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-41 T-001 Auto-mode resolution — paper/ink per prefers-color-scheme, stored-theme pass-through, and the live matchMedia change listener.
//   SCOPE: Pure helpers in src/renderer/src/util/autoTheme.js against a controllable window.matchMedia stub.
//   DEPENDS: Vitest, jsdom window, util/autoTheme.js.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-38 (C-41 T-001).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   installMatchMediaStub - controllable matchMedia double (matches + change listeners).
//   PREFS - fresh-profile preference fixture (paper/ink, followSystemTheme=true).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-41 T-001 initial pins: Auto resolves paper/ink for
//   light/dark OS appearance, follows a live change event, stays a no-op
//   without matchMedia, and never rewrites a manual theme.
// END_CHANGE_SUMMARY

import {
  PREFERS_DARK_QUERY,
  systemPrefersDark,
  resolveAutoTheme,
  effectiveTheme,
  watchSystemColorScheme
} from '@/util/autoTheme'

// jsdom's matchMedia cannot be flipped or fired for prefers-color-scheme,
// so tests install a controllable MediaQueryList double.
const installMatchMediaStub = (initialDark) => {
  let dark = initialDark
  const listeners = new Set()
  const mql = {
    media: PREFERS_DARK_QUERY,
    get matches () { return dark },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
    // Legacy WKWebView API — kept so the fallback path is exercisable.
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn)
  }
  window.matchMedia = vi.fn(() => mql)
  return {
    setScheme (nextDark) {
      dark = nextDark
      for (const fn of listeners) fn({ matches: dark })
    },
    listenerCount: () => listeners.size
  }
}

const PREFS = {
  followSystemTheme: true,
  theme: 'paper',
  lightModeTheme: 'paper',
  darkModeTheme: 'ink'
}

describe('util/autoTheme (C-41 T-001)', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  describe('resolveAutoTheme', () => {
    it('resolves the light member (paper) when the OS is light', () => {
      expect(resolveAutoTheme(PREFS, false)).toBe('paper')
    })

    it('resolves the dark member (ink) when the OS is dark', () => {
      expect(resolveAutoTheme(PREFS, true)).toBe('ink')
    })

    it('reads the current system appearance when prefersDark is omitted', () => {
      installMatchMediaStub(true)
      expect(resolveAutoTheme(PREFS)).toBe('ink')
      expect(window.matchMedia).toHaveBeenCalledWith(PREFERS_DARK_QUERY)
    })

    it('honours custom mode members, not just the brand pair', () => {
      expect(resolveAutoTheme({ lightModeTheme: 'graphite', darkModeTheme: 'dracula' }, true)).toBe('dracula')
    })
  })

  describe('effectiveTheme', () => {
    it('follows the system while followSystemTheme is on', () => {
      expect(effectiveTheme({ ...PREFS, followSystemTheme: true })).toBe('paper')
      installMatchMediaStub(true)
      expect(effectiveTheme({ ...PREFS, followSystemTheme: true })).toBe('ink')
    })

    it('passes the stored manual theme through untouched when Auto is off', () => {
      const stored = { followSystemTheme: false, theme: 'nord', lightModeTheme: 'paper', darkModeTheme: 'ink' }
      installMatchMediaStub(true)
      expect(effectiveTheme(stored)).toBe('nord')
    })
  })

  describe('systemPrefersDark', () => {
    it('is false without a matchMedia implementation', () => {
      window.matchMedia = undefined
      expect(systemPrefersDark()).toBe(false)
    })
  })

  describe('watchSystemColorScheme', () => {
    it('calls the callback with the new appearance on a live change and stops after unregister', () => {
      const stub = installMatchMediaStub(false)
      const seen = []
      const stop = watchSystemColorScheme((prefersDark) => seen.push(prefersDark))

      stub.setScheme(true)
      stub.setScheme(false)
      expect(seen).toEqual([true, false])

      stop()
      stub.setScheme(true)
      expect(seen).toEqual([true, false])
      expect(stub.listenerCount()).toBe(0)
    })

    it('uses the legacy addListener API when addEventListener is missing', () => {
      let dark = false
      const listeners = new Set()
      window.matchMedia = vi.fn(() => ({
        media: PREFERS_DARK_QUERY,
        get matches () { return dark },
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn)
      }))
      const stop = watchSystemColorScheme((prefersDark) => { dark = prefersDark })
      for (const fn of listeners) fn({ matches: true })
      expect(dark).toBe(true)
      stop()
      expect(listeners.size).toBe(0)
    })

    it('returns a safe no-op unregister without matchMedia', () => {
      window.matchMedia = undefined
      expect(() => watchSystemColorScheme(() => {})()).not.toThrow()
    })
  })
})
