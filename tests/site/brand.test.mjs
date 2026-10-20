// @vitest-environment node
// FILE: tests/site/brand.test.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-64 brand foundation — the shared tokens
//            (site/shared/brand.css) carry the icon palette exactly with a
//            dark set, the no-flash THEME_INIT_JS script resolves the
//            VitePress storage key and survives a throwing localStorage,
//            the gallery output carries no pre-brand palette, and the docs
//            nav keeps ≤ 5 top-level items with a base-safe Diagrams link.
//   SCOPE: site/shared/brand.css, site/shared/theme-init.mjs (+ the .js it
//          exports), site/scripts/build-gallery.mjs output,
//          site/.vitepress/config.mts themeConfig nav and
//          site/guide/themes.md gallery link (text-parsed).
//   DEPENDS: site scripts, Vitest (node environment — fakes, no DOM).
//   LINKS: M-053 SiteBuild; V-M-053 scenario-8; C-64 R-1/R-2/R-10, T-001;
//          corner-4 (dark choice shared docs -> gallery)
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   read - read a site file as UTF-8
//   BRAND_CSS - site/shared/brand.css text
//   LIGHT - light token block regex
//   DARK - dark token block regex
//   DARK_FALLBACK - no-JS dark fallback block regex
//   THEMES_MD - theme guide text with the full-navigation gallery link
//   blockVars - CSS selector block text -> { --token: value } map
//   runThemeInit - fakes (storage value/matches/throws) -> what the script set
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - 2026-10-21 base-path regression: the docs nav
//                 passes /diagrams/ to VitePress for one base application,
//                 while the raw guide anchor uses a base-agnostic relative
//                 URL and keeps full-page navigation.]
//   PREV: [v1.0.0 - 2026-10-18 C-64 T-001: first version.]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../site/scripts/build-gallery.mjs'
import { resolveSiteSettings } from '../../site/.vitepress/landing.mjs'
import { THEME_INIT_JS } from '../../site/shared/theme-init.mjs'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const BRAND_CSS = read('../../site/shared/brand.css')
const THEMES_MD = read('../../site/guide/themes.md')

// The declarations of one selector block, e.g. `:root{--a:#FFF;}` ->
// { '--a': '#FFF' } (values trimmed, no comments expected inside).
const blockVars = (css, selectorRe) => {
  const m = selectorRe.exec(css)
  expect(m, `brand.css has a block matching ${selectorRe}`).toBeTruthy()
  const vars = {}
  for (const [, name, value] of m[1].matchAll(/(--[\w-]+):\s*([^;}]+)/g)) {
    vars[name] = value.trim()
  }
  return vars
}

const LIGHT = /:root\{([^}]*)\}/
const DARK = /:root\.dark,\s*:root\[data-theme="dark"\]\{([^}]*)\}/
const DARK_FALLBACK = /:root:not\(\[data-theme\]\)\{([^}]*)\}/

// Evaluate THEME_INIT_JS against fake document/window/localStorage and
// return what the script set on the root element.
const runThemeInit = ({ stored, matches = false, throwOnRead = false }) => {
  const calls = { classList: [], attributes: [] }
  const classSet = new Set()
  const documentElement = {
    classList: {
      contains: (c) => classSet.has(c),
      toggle: (name, on) => { calls.classList.push([name, on]); on ? classSet.add(name) : classSet.delete(name) }
    },
    setAttribute: (name, value) => { calls.attributes.push([name, value]) }
  }
  const document = { documentElement }
  const window = { matchMedia: () => ({ matches }) }
  const localStorage = {
    getItem: () => {
      if (throwOnRead) throw new Error('SecurityError')
      return stored
    }
  }
  new Function('document', 'window', 'localStorage', THEME_INIT_JS)(document, window, localStorage)
  return calls
}

describe('brand tokens (site/shared/brand.css)', () => {
  it('defines the four icon colours exactly (C-64 R-1, D-3)', () => {
    const light = blockVars(BRAND_CSS, LIGHT)
    expect(light['--paper']).toBe('#F5EFE4')
    expect(light['--ink']).toBe('#17191E')
    expect(light['--marker']).toBe('#FFCF1A')
    expect(light['--on-marker']).toBe('#17191E')
    expect(light['--mute']).toBe('#5F584B')
    expect(light['--rule']).toBe('#D6CCB9')
    expect(light['--chip']).toBe('#EAE2D3')
    expect(light['--card']).toBe('#FBF8F2')
  })

  it('defines the dark set (marker and on-marker unchanged)', () => {
    const dark = blockVars(BRAND_CSS, DARK)
    expect(dark['--paper']).toBe('#17191E')
    expect(dark['--ink']).toBe('#F5EFE4')
    expect(dark['--mute']).toBe('#A49C8C')
    expect(dark['--rule']).toBe('#33353C')
    expect(dark['--chip']).toBe('#24262C')
    expect(dark['--card']).toBe('#1F2127')
    // not overridden in dark: the marker pair keeps the icon values
    expect(dark['--marker']).toBeUndefined()
    expect(dark['--on-marker']).toBeUndefined()
  })

  it('gives no-JS visitors the same dark set via prefers-color-scheme', () => {
    const fallback = blockVars(BRAND_CSS, DARK_FALLBACK)
    const dark = blockVars(BRAND_CSS, DARK)
    expect(fallback).toEqual(dark)
  })

  it('self-hosts exactly the five brand faces under /fonts/brand/', () => {
    const faces = [...BRAND_CSS.matchAll(/@font-face\{[^}]*url\("([^"]+)"\)[^}]*\}/g)].map((m) => m[1])
    expect(faces).toHaveLength(5)
    for (const url of faces) expect(url).toMatch(/^\/fonts\/brand\//)
    expect(BRAND_CSS).not.toMatch(/schibsted|jetbrains/i)
  })
})

describe('no-flash theme script (THEME_INIT_JS)', () => {
  // The GRACE header comments precede the IIFE; the code itself is the IIFE.
  const body = THEME_INIT_JS.replace(/^(?:\s|\/\*[\s\S]*?\*\/)+/, '').trim()

  it('is a self-contained IIFE on the VitePress storage key', () => {
    expect(body.startsWith('(function')).toBe(true)
    expect(body.endsWith('})();')).toBe(true)
    expect(THEME_INIT_JS).toContain("'vitepress-theme-appearance'")
    expect(THEME_INIT_JS).not.toMatch(/\b(import|export|require)\b/)
  })

  it('sets data-theme and toggles the dark class from the saved choice', () => {
    const dark = runThemeInit({ stored: 'dark', matches: false })
    expect(dark.classList).toContainEqual(['dark', true])
    expect(dark.attributes).toContainEqual(['data-theme', 'dark'])

    const light = runThemeInit({ stored: 'light', matches: true })
    expect(light.classList).toContainEqual(['dark', false])
    expect(light.attributes).toContainEqual(['data-theme', 'light'])
  })

  it('resolves auto/missing through prefers-color-scheme', () => {
    expect(runThemeInit({ stored: null, matches: true }).attributes).toContainEqual(['data-theme', 'dark'])
    expect(runThemeInit({ stored: 'auto', matches: false }).attributes).toContainEqual(['data-theme', 'light'])
  })

  it('survives a throwing localStorage (private mode) and still resolves', () => {
    const calls = runThemeInit({ throwOnRead: true, matches: true })
    expect(calls.attributes).toContainEqual(['data-theme', 'dark'])
    expect(calls.classList).toContainEqual(['dark', true])
  })
})

describe('the built gallery on the shared brand', () => {
  const HTML = renderGallery(resolveSiteSettings({ SITE_URL: 'https://mark.xronocode.com' }))

  it('carries no pre-brand palette values', () => {
    for (const stale of ['#F2EDE3', '#FFD21F', '#131418']) {
      expect(HTML, stale).not.toContain(stale)
    }
  })

  it('inlines THEME_INIT_JS before the first stylesheet (corner-4)', () => {
    const scriptAt = HTML.indexOf(THEME_INIT_JS)
    expect(scriptAt).toBeGreaterThan(-1)
    expect(scriptAt).toBeLessThan(HTML.indexOf('<style'))
  })

  it('gives the folio an appearance toggle on the same storage key', () => {
    expect(HTML).toContain('aria-label="Toggle dark mode"')
    expect(HTML).toContain("localStorage.setItem('vitepress-theme-appearance'")
  })
})

describe('docs themeConfig nav (C-64 R-10)', () => {
  it('has at most five top-level items and links Diagrams', () => {
    const config = read('../../site/.vitepress/config.mts')
    const navAt = config.indexOf('nav: [')
    expect(navAt, 'config.mts has a themeConfig nav').toBeGreaterThan(-1)
    const navBody = config.slice(navAt, config.indexOf(']', navAt))
    const items = [...navBody.matchAll(/\{\s*text:/g)]
    expect(items.length).toBeLessThanOrEqual(5)
    expect(navBody).toMatch(/text:\s*'Diagrams'/)
    expect(navBody).toMatch(/link:\s*'\/diagrams\/'/)
    expect(navBody).not.toContain('${base}diagrams/')
    expect(THEMES_MD).toContain('href="../diagrams/" target="_self"')
  })
})
