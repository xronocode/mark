// @vitest-environment node
// FILE: tests/site/landing-content.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-64 T-002 landing content contract — the four
//            install facts render, stale claims and forbidden Mark Text
//            wording are absent, the consent anchor sits on the hero, every
//            install CTA carries the download_click attrs, the stage handle
//            is a real slider, the iOS detect script runs before any CSS,
//            the theme-init placeholder is present and DIAGRAM placeholders
//            only name gallery example ids.
//   SCOPE: site/landing/index.html through renderLanding (base '/'), i.e.
//          the template as the build receives it, placeholders included.
//   DEPENDS: Vitest (node env), site/.vitepress/landing.mjs renderLanding,
//            site/gallery/examples.mjs (the id whitelist)
//   LINKS: M-053 SiteBuild; V-M-053; C-64 T-002 (R-3, R-4, R-5, R-7);
//          corners 1, 2, 5, 7, 8
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TEMPLATE - the landing template read from site/landing/index.html
//   HTML - renderLanding(TEMPLATE, default settings)
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-18 C-64 T-002: first version.]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderLanding, resolveSiteSettings } from '../../site/.vitepress/landing.mjs'
import { EXAMPLES } from '../../site/gallery/examples.mjs'

const TEMPLATE = readFileSync(resolve(import.meta.dirname, '../../site/landing/index.html'), 'utf8')
const HTML = renderLanding(TEMPLATE, resolveSiteSettings({}))

describe('landing install facts', () => {
  it('renders the App Store link, the full brew command, the Windows setup.exe and v2.5.0', () => {
    expect(HTML).toContain('https://apps.apple.com/app/id6814590464')
    // The & of the command is escaped in both the data-copy attribute and the visible chip text.
    expect(HTML).toContain('brew tap xronocode/mark &amp;&amp; brew install --cask mark')
    expect(HTML).toContain('Mark_2.5.0_x64-setup.exe')
    expect(HTML).toContain('Mark_2.5.0_aarch64.dmg')
    expect(HTML).toMatch(/id="version">v2\.5\.0</)
  })

  it('carries the editions facts: App Store 2.1.17 catching up to 2.5.0, macOS 12, SmartScreen note', () => {
    expect(HTML).toContain('2.1.17')
    expect(HTML).toContain('macOS 12 or later')
    expect(HTML).toContain('Windows protected your PC')
    expect(HTML).toContain('guide/editions#when-the-app-store-catches-up')
  })

  it('has no stale or forbidden claims', () => {
    expect(HTML).not.toContain('11 MB')
    expect(HTML).not.toContain('v2.1 beta')
    expect(HTML).not.toMatch(/successor|abandoned/i)
    expect(HTML).not.toMatch(/lorem ipsum/i)
  })
})

describe('landing consent + install analytics wiring', () => {
  it('puts the consent anchor on the hero section', () => {
    expect(HTML).toMatch(/<section[^>]*id="hero"[^>]*data-consent-after/)
  })

  const TAGS = [...HTML.matchAll(/<(?:a|button)\b[^>]*>/gi)].map((m) => m[0])
  const isInstallCta = (tag) =>
    tag.includes('apps.apple.com/app/id6814590464') ||
    tag.includes('brew tap xronocode/mark') ||
    tag.includes('github.com/xronocode/mark/releases/latest')
  const CTAS = TAGS.filter(isInstallCta)

  it('finds the install CTAs (App Store, brew copies, DMG, Windows)', () => {
    expect(CTAS.length).toBeGreaterThanOrEqual(5)
  })

  it('tracks every install CTA with method and placement', () => {
    for (const tag of CTAS) {
      expect(tag, tag).toContain('data-track="download_click"')
      expect(tag, tag).toMatch(/data-method="(app_store|homebrew_copy|windows|github)"/)
      expect(tag, tag).toMatch(/data-placement="(hero|install|nav|footer|bar)"/)
    }
  })

  it('uses each install method somewhere and the hero placement exists', () => {
    const methods = CTAS.map((t) => /data-method="([^"]+)"/.exec(t)[1])
    for (const m of ['app_store', 'homebrew_copy', 'windows']) expect(methods).toContain(m)
    const places = CTAS.map((t) => /data-placement="([^"]+)"/.exec(t)[1])
    expect(places).toContain('hero')
    expect(places).toContain('install')
  })
})

describe('landing hero stage and iOS surface', () => {
  it('makes the divider a keyboard slider with a live value', () => {
    const handle = /<div class="handle"[^>]*>/.exec(HTML)?.[0] || ''
    expect(handle).toContain('role="slider"')
    expect(handle).toContain('aria-valuenow="')
    expect(handle).toContain('tabindex="0"')
  })

  it('detects iOS before any style is parsed and keys iOS-only UI off html.ios', () => {
    const iosAt = HTML.indexOf("classList.add('ios')")
    const styleAt = HTML.indexOf('<style>')
    expect(iosAt).toBeGreaterThan(-1)
    expect(styleAt).toBeGreaterThan(-1)
    expect(iosAt).toBeLessThan(styleAt)
    expect(HTML).toContain('.ios .only-ios')
    expect(HTML).toContain('.ios .macbar')
  })

  it('shares the canonical URL with the documented share_to_mac outcomes', () => {
    expect(HTML).toContain("navigator.share")
    expect(HTML).toContain("'Mark \\u2014 Markdown editor for Mac'")
    expect(HTML).toContain("'Install Mark on my Mac'")
    expect(HTML).toContain("markTrack('share_to_mac'")
    expect(HTML).toContain("'dismissed'")
    expect(HTML).toContain("'copied'")
    expect(HTML).toContain("localStorage.setItem('mark-mac-bar'")
  })
})

describe('landing build placeholders', () => {
  it('starts the head with the shared theme-init placeholder and inlines the brand css slot', () => {
    expect(HTML.indexOf('<!--THEME_INIT-->')).toBeGreaterThan(HTML.indexOf('<head>'))
    expect(HTML.indexOf('<!--THEME_INIT-->')).toBeLessThan(HTML.indexOf('<style>'))
    expect(HTML).toContain('<!--BRAND_CSS-->')
    expect(HTML).toContain('<!--THEME_VARS_JSON-->')
  })

  it('uses only gallery example ids for DIAGRAM placeholders', () => {
    const ids = new Set(EXAMPLES.map((e) => e.id))
    const used = [...HTML.matchAll(/<!--DIAGRAM:([\w-]+)-->/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThanOrEqual(8)
    for (const id of used) expect(ids.has(id), id).toBe(true)
    // The hero stage and the d2 wall both need their diagrams.
    for (const id of ['sankey', 'pie', 'flowchart', 'venn', 'radar', 'kanban', 'gantt']) {
      expect(used, id).toContain(id)
    }
  })

  it('keeps every image on the site origin with explicit dimensions', () => {
    const imgs = [...HTML.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
    expect(imgs.length).toBeGreaterThanOrEqual(5)
    for (const img of imgs) {
      expect(img, img).toMatch(/src="\/(shots\/|mark-icon\.svg)/)
      expect(img, img).toContain('width=')
      expect(img, img).toContain('height=')
    }
    const shots = imgs.filter((i) => i.includes('src="/shots/'))
    expect(shots.length).toBeGreaterThanOrEqual(4)
  })
})

describe('landing hygiene', () => {
  it('uses no inline event handlers, javascript: URLs, eval or new Function', () => {
    expect(HTML).not.toMatch(/\son(click|load|error|mouseover)\s*=/i)
    expect(HTML).not.toMatch(/javascript:/i)
    expect(HTML).not.toMatch(/\beval\s*\(/)
    expect(HTML).not.toMatch(/new\s+Function\b/)
  })

  it('ships the appearance toggle on the shared VitePress storage key', () => {
    expect(HTML).toContain("localStorage.setItem('vitepress-theme-appearance'")
    expect(HTML).toContain('id="appearance"')
  })
})
