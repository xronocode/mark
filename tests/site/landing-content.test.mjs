// @vitest-environment node
// FILE: tests/site/landing-content.test.mjs
// VERSION: 1.4.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-64 T-002 landing content contract — the install
//            facts render (the download facts as release tokens filled by
//            fillLanding), stale claims and forbidden Mark Text wording are
//            absent, the consent anchor sits on the hero, every install CTA
//            carries the download_click attrs, the stage handle is a real
//            slider, the iOS detect script runs before any CSS, the
//            theme-init placeholder is present and DIAGRAM placeholders only
//            name gallery example ids.
//   SCOPE: site/landing/index.html through renderLanding (base '/'), i.e.
//          the template as the build receives it, placeholders included.
//   DEPENDS: Vitest (node env), site/.vitepress/landing.mjs renderLanding,
//            site/scripts/landing-fill.mjs fillLanding,
//            site/scripts/release.mjs releaseFacts (the fill facts),
//            site/gallery/examples.mjs (the id whitelist)
//   LINKS: M-053 SiteBuild; V-M-053; C-64 T-002 (R-3, R-4, R-5, R-7),
//          version sync; corners 1, 2, 5, 7, 8
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
//   LAST_CHANGE: [v1.4.0 - 2026-10-19 C-64 version sync: the download facts
//                 are asserted as the %VERSION%/%DMG_*/%EXE_* tokens in the
//                 template (App Store edition facts stay pinned), and a fill
//                 test proves fillLanding(TEMPLATE, undefined, facts) writes
//                 the resolved names, URLs and MB figures everywhere.]
//   PREV: [v1.3.0 - 2026-10-18 C-64 T-007: pins the audit fixes -
//                 every screenshot in a <picture> with 400/800/1440 webp
//                 sources and the jpg <img> fallback intact (R-2), the
//                 stage demo document's h2/h3 demoted to identically-styled
//                 p.h2/p.h3 (A-2), and footer nav links padded past the
//                 24 px target minimum (A-2).]
//   PREV: [v1.2.0 - 2026-10-18 C-64 T-006: pins the audit fixes -
//                 the tap-free brew one-liner in chip text/data-copy and
//                 aria-labels, method "dmg" on both DMG links with the
//                 GitHub repo links as outbound_click/target, #win-link +
//                 the setup.exe asset regex, the UTM-tagged share URL, the
//                 one-line hero captions (no .opt-i), --rest-driven stage
//                 rest with the 981+ doc offset, the template-wrapped lazy
//                 wall, content-visibility on ¶03-¶05 + footer only, and
//                 the comment-free rendered output starting at <!doctype
//                 (placeholders are asserted on the raw template now).]
//   PREV: [v1.1.0 - 2026-10-18 C-64 T-002 review round 2: pins the
//                 round-2 fixes - stage rests via CSS per breakpoint with a
//                 1.8 s from-rest sweep, one-line scrollable brew chip,
//                 secondary Windows button, phone-folded agent prompt,
//                 square-first phone wall with the count updated, iOS send
//                 buttons in hero + install card, and the .more/.opt phone
//                 trims.]
//   PREV: [v1.0.0 - 2026-10-18 C-64 T-002: first version.]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderLanding, resolveSiteSettings } from '../../site/.vitepress/landing.mjs'
import { fillLanding } from '../../site/scripts/landing-fill.mjs'
import { releaseFacts } from '../../site/scripts/release.mjs'
import { EXAMPLES } from '../../site/gallery/examples.mjs'

const TEMPLATE = readFileSync(resolve(import.meta.dirname, '../../site/landing/index.html'), 'utf8')
const HTML = renderLanding(TEMPLATE, resolveSiteSettings({}))

describe('landing install facts', () => {
  it('renders the App Store link, the brew one-liner and the release tokens for the download facts', () => {
    expect(HTML).toContain('https://apps.apple.com/app/id6814590464')
    // One canonical command everywhere (C-64 T-006 F-1): the tap-free
    // one-liner, identical in the data-copy attribute and the visible text.
    expect(HTML).toContain('brew install --cask xronocode/mark/mark')
    expect(HTML).not.toContain('brew tap xronocode/mark &amp;&amp;')
    // C-64 version sync: the download facts are build tokens filled from the
    // latest GitHub release (the fill test below pins the substitution).
    expect(TEMPLATE).toContain('%DMG_NAME%')
    expect(TEMPLATE).toContain('%EXE_NAME%')
    expect(TEMPLATE).toMatch(/id="version">v%VERSION%</)
    expect(TEMPLATE).toContain('id="dmg-hero" data-asset="dmg" href="%DMG_URL%"')
    expect(TEMPLATE).toContain('id="win-hero" data-asset="exe" href="%EXE_URL%"')
    expect(TEMPLATE).toContain('id="dmg-link" data-asset="dmg" href="%DMG_URL%"')
    expect(TEMPLATE).toContain('id="win-link" data-asset="exe" href="%EXE_URL%"')
    expect(TEMPLATE).toContain('&asymp; %DMG_MB% MB')
    expect(TEMPLATE).toContain('&asymp; %EXE_MB% MB')
  })

  it('fills the release tokens from the resolved facts (C-64 version sync)', () => {
    const facts = releaseFacts({
      version: '9.9.9',
      dmg: { name: 'Mark_9.9.9_aarch64.dmg', url: 'https://obj.example/Mark_9.9.9_aarch64.dmg', size: 14_800_000 },
      exe: { name: 'Mark_9.9.9_x64-setup.exe', url: 'https://obj.example/Mark_9.9.9_x64-setup.exe', size: 9_700_000 }
    }, '2.5.2')
    const filled = fillLanding(TEMPLATE, undefined, facts)
    expect(filled).toContain('Mark_9.9.9_aarch64.dmg')
    expect(filled).toContain('Mark_9.9.9_x64-setup.exe')
    expect(filled).toMatch(/id="version">v9\.9\.9</)
    expect(filled).toContain('href="https://obj.example/Mark_9.9.9_aarch64.dmg"')
    expect(filled).toContain('href="https://obj.example/Mark_9.9.9_x64-setup.exe"')
    expect(filled).toContain('&asymp; 15 MB')
    expect(filled).toContain('&asymp; 10 MB')
    expect(filled).not.toContain('%VERSION%')
    expect(filled).not.toContain('%DMG_')
    expect(filled).not.toContain('%EXE_')
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
    tag.includes('brew install --cask xronocode/mark/mark') ||
    tag.includes('github.com/xronocode/mark/releases/latest') ||
    // unfilled release tokens stand in for the DMG/Windows links here
    tag.includes('%DMG_URL%') ||
    tag.includes('%EXE_URL%')
  const CTAS = TAGS.filter(isInstallCta)

  it('finds the install CTAs (App Store, brew copies, DMG, Windows)', () => {
    expect(CTAS.length).toBeGreaterThanOrEqual(5)
  })

  it('tracks every install CTA with method and placement', () => {
    for (const tag of CTAS) {
      expect(tag, tag).toContain('data-track="download_click"')
      expect(tag, tag).toMatch(/data-method="(app_store|homebrew_copy|windows|dmg)"/)
      expect(tag, tag).toMatch(/data-placement="(hero|install|nav|footer|bar)"/)
    }
  })

  it('uses each install method somewhere and the hero placement exists', () => {
    const methods = CTAS.map((t) => /data-method="([^"]+)"/.exec(t)[1])
    for (const m of ['app_store', 'homebrew_copy', 'windows', 'dmg']) expect(methods).toContain(m)
    const places = CTAS.map((t) => /data-placement="([^"]+)"/.exec(t)[1])
    expect(places).toContain('hero')
    expect(places).toContain('install')
  })

  it('separates DMG downloads (dmg) from GitHub outbound links (C-64 T-006 M-1)', () => {
    const dmg = TAGS.filter((t) => /id="dmg-(hero|link)"/.test(t))
    expect(dmg).toHaveLength(2)
    for (const tag of dmg) expect(tag, tag).toContain('data-method="dmg"')
    const repo = TAGS.filter((t) => /href="https:\/\/github\.com\/xronocode\/mark"/.test(t))
    expect(repo.length).toBeGreaterThanOrEqual(3)
    for (const tag of repo) {
      expect(tag, tag).toContain('data-track="outbound_click"')
      expect(tag, tag).toContain('data-target="github"')
      expect(tag, tag).not.toContain('data-method')
    }
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

  it('shares the canonical URL with UTM tags and the documented share_to_mac outcomes', () => {
    expect(HTML).toContain("navigator.share")
    expect(HTML).toContain("'Mark \\u2014 Markdown editor for Mac'")
    expect(HTML).toContain("'Install Mark on my Mac'")
    expect(HTML).toContain("'utm_source=ios&utm_medium=share&utm_campaign=send_to_mac'")
    expect(HTML).toContain("markTrack('share_to_mac'")
    expect(HTML).toContain("'dismissed'")
    expect(HTML).toContain("'copied'")
    expect(HTML).toContain("localStorage.setItem('mark-mac-bar'")
  })

  it('refreshes every data-asset link (dmg / exe) from the releases API', () => {
    expect(HTML).toMatch(/id="win-link" data-asset="exe"[^>]*data-method="windows"/)
    expect(HTML).toContain('/Mark_.*_x64-setup\\.exe$/')
    expect(HTML).toContain("querySelectorAll('[data-asset]')")
  })
})

describe('landing build placeholders', () => {
  it('keeps the build placeholders in the template head; the rendered head starts clean', () => {
    // The placeholders live in the raw template (filled by fillLanding at
    // build); renderLanding strips every comment, so the served page has
    // none of them (C-64 T-006 S-4).
    expect(TEMPLATE.indexOf('<!--THEME_INIT-->')).toBeGreaterThan(TEMPLATE.indexOf('<head>'))
    expect(TEMPLATE.indexOf('<!--THEME_INIT-->')).toBeLessThan(TEMPLATE.indexOf('<style>'))
    expect(TEMPLATE).toContain('<!--BRAND_CSS-->')
    expect(TEMPLATE).toContain('<!--THEME_VARS_JSON-->')
    expect(HTML).not.toContain('<!--')
  })

  it('renders <meta charset> as the first element inside <head>', () => {
    expect(HTML).toMatch(/<head>\s*<meta charset="utf-8">/)
  })

  it('uses only gallery example ids for DIAGRAM placeholders', () => {
    const ids = new Set(EXAMPLES.map((e) => e.id))
    const used = [...TEMPLATE.matchAll(/<!--DIAGRAM:([\w-]+)-->/g)].map((m) => m[1])
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

describe('landing round-2 review fixes', () => {
  it('rests the stage divider on the CSS --rest value per breakpoint, with no inline start', () => {
    expect(HTML).not.toContain('style="--x"')
    expect(HTML).toMatch(/\.stage\s*\{[^}]*--rest:\s*34%/)
    expect(HTML).toMatch(/\.stage\s*\{[^}]*--x:\s*var\(--rest\)/)
    expect(HTML).toMatch(/@media \(min-width: 521px\)\s*\{[\s\S]*?\.stage\s*\{[^}]*--rest:\s*46%/)
    expect(HTML).toMatch(/@media \(min-width: 981px\)\s*\{[\s\S]*?\.stage\s*\{[^}]*--rest:\s*30%/)
    // At 981+ the rendered document starts just right of the rest divider.
    expect(HTML).toMatch(/\.layer\.page \.doc\s*\{[^}]*padding-left:\s*calc\(var\(--rest\) \+ 28px\)/)
    // The JS reads the same value from the computed style — never a hardcoded 34/46.
    expect(HTML).toContain("getPropertyValue('--rest')")
    expect(HTML).not.toMatch(/restX = phone\.matches/)
  })

  it('sweeps from rest and back in 1.8 s', () => {
    expect(HTML).toMatch(/\(t - t0\) \/ 1800/)
    expect(HTML).toMatch(/rest - \(rest - 10\) \* Math\.sin/)
  })

  it('lets the install brew command wrap inside its row instead of widening the page', () => {
    expect(HTML).toMatch(/\.dlist \.nm small \{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('picks the hero download button per system before paint (mac default, win, linux)', () => {
    expect(HTML).toContain("classList.add('os-' + os)")
    expect(HTML).toMatch(/\.dl-mac \{ display: inline-flex; \}/)
    expect(HTML).toMatch(/\.os-win \.dl-win, \.os-linux \.dl-linux \{ display: inline-flex; \}/)
    expect(HTML).toMatch(/class="dlbtn dl-linux" href="https:\/\/github\.com\/xronocode\/mark#build-from-source"/)
  })

  it('folds the agent prompt into a details that is closed on phones by script', () => {
    expect(HTML).toMatch(/<details class="prompt" id="agent-prompt" open>/)
    expect(HTML).toMatch(/summary>Prompt for your agent</)
    expect(HTML).toMatch(/promptBox\.open = !isPhone/)
  })

  it('hides the wide wall diagrams on phones, square ones first, count updated', () => {
    expect(HTML).toMatch(/\.c1,\s*\.c6,\s*\.c7\s*\{[^}]*display:\s*none/)
    expect(HTML).toMatch(/\.c3\s*\{\s*order:\s*-4/)
    expect(HTML).toContain('Swipe &middot; 4 of 32 types')
  })

  it('offers Send Mark to your Mac in the hero and the install card on iOS', () => {
    expect(HTML.match(/only-ios send-mac/g)?.length).toBe(2)
  })

  it('trims phone copy through hidden spans restored from 521px', () => {
    expect(HTML.match(/class="more"/g)?.length).toBeGreaterThanOrEqual(10)
    expect(HTML).toMatch(/\.more\s*\{\s*display:\s*none/)
    expect(HTML).toMatch(/\.more\s*\{\s*display:\s*inline/)
    expect(HTML).toMatch(/\.opt\s*\{\s*display:\s*none/)
  })
})

describe('landing C-64 T-006 audit fixes', () => {
  const ALL_TAGS = [...HTML.matchAll(/<(?:a|button)\b[^>]*>/gi)].map((m) => m[0])

  it('states the hero version captions as one-line facts (D-2)', () => {
    expect(HTML).toContain('macOS 12 or later &middot; sandboxed')
    expect(TEMPLATE).toContain('for macOS &middot; Apple silicon &middot; <span id="version">v%VERSION%</span>')
    expect(HTML).not.toContain('opt-i')
    expect(HTML).not.toContain('is coming')
    expect(HTML).not.toMatch(/\.get-o \.fine\s*\{\s*white-space/)
  })

  it('names both brew buttons with the visible command (A-1)', () => {
    const brew = ALL_TAGS.filter((t) => /data-method="homebrew_copy"/.test(t))
    expect(brew).toHaveLength(2)
    for (const tag of brew) {
      expect(tag, tag).toContain('aria-label="Copy brew install --cask xronocode/mark/mark"')
    }
  })

  it('ships the wall SVGs inside templates mounted near the viewport (R-1)', () => {
    expect((TEMPLATE.match(/<template data-diagram="/g) || []).length).toBe(7)
    expect(HTML).toMatch(/rootMargin:\s*'600px'/)
    expect(HTML).toContain('template[data-diagram]')
    // The hero stage diagrams stay inline (above the fold), not templated.
    expect(TEMPLATE).toMatch(/<div class="dia"><!--DIAGRAM:sankey--><\/div>/)
    expect(TEMPLATE).toMatch(/<div class="dia dia-pie"><!--DIAGRAM:pie--><\/div>/)
  })

  it('defers below-the-fold rendering to content-visibility on ¶03–¶05 and the footer only (R-1)', () => {
    expect(HTML).toMatch(/\.cv\s*\{\s*content-visibility:\s*auto/)
    expect(HTML).toMatch(/\.cv-a \{ contain-intrinsic-size:\s*auto \d+px/)
    expect((HTML.match(/class="sec cv cv-[abc]"/g) || []).length).toBe(3)
    expect(HTML).toMatch(/<footer class="foot cv">/)
    expect(HTML).toMatch(/<section class="top" id="hero"/)
    expect(HTML).toMatch(/<section class="sec" id="diagrams-sec"/)
    expect(HTML).toMatch(/<section class="sec" aria-labelledby="ag-h">/)
  })

  it('darkens the demo meta line to the 4.5:1 ink in the light theme only (A-1)', () => {
    expect(HTML).toMatch(/--w-meta:\s*#6B675F/)
    expect(HTML).toMatch(/\.win\.dk\s*\{[^}]*--w-meta:\s*#9D998F/)
    expect(HTML).toMatch(/\.md \.meta\s*\{[^}]*var\(--w-meta/)
  })
})

describe('landing C-64 T-007 audit fixes', () => {
  it('demotes the stage demo document headings to identically styled paragraphs (A-2)', () => {
    const stage = /<div class="layer page win" id="page">[\s\S]*?<span class="lab l">/.exec(HTML)?.[0] || ''
    expect(stage).not.toMatch(/<h[1-6]\b/)                     // the fake document leaves the page outline
    expect(stage).toMatch(/<p class="h2">Q3 review &mdash; growth<\/p>/)
    expect((stage.match(/<p class="h3">/g) || []).length).toBe(3)
    // The .h2/.h3 classes wear exactly the .md h2/h3 rules, at every breakpoint.
    expect(HTML).toMatch(/\.md h2, \.md \.h2\s*\{[^}]*font: 700 21px/)
    expect(HTML).toMatch(/\.md h3, \.md \.h3\s*\{[^}]*margin: 14px 0 8px/)
    expect(HTML).toMatch(/\.md h2, \.md \.h2\s*\{[^}]*font-size: 26px/)
    expect(HTML).toMatch(/\.md h3, \.md \.h3\s*\{[^}]*font-size: 17px/)
  })

  it('ships every screenshot as webp with the jpg fallback intact (R-2)', () => {
    const pictures = [...HTML.matchAll(/<picture>[\s\S]*?<\/picture>/g)].map((m) => m[0])
    expect(pictures.length).toBe(4)
    for (const p of pictures) {
      expect(p).toMatch(/<source type="image\/webp" srcset="[^"]*-400\.webp 400w, [^"]*-800\.webp 800w, [^"]*-1440\.webp 1440w" sizes="/)
      const sizes = [...p.matchAll(/sizes="([^"]+)"/g)].map((m) => m[1])
      expect(sizes).toHaveLength(2)                            // the source mirrors the img's sizes
      expect(sizes[0]).toBe(sizes[1])
      expect(p).toMatch(/<img [^>]*src="\/shots\/[^"]*\.jpg"/)
      expect(p).toMatch(/<img [^>]*srcset="[^"]*\.jpg 1440w, [^"]*\.jpg 800w"/)
      expect(p).toMatch(/<img [^>]*width="1440" height="900" loading="lazy"/)
    }
    // The hero stage and icons stay plain <img> — only the four shots switch.
    expect([...HTML.matchAll(/<img\b[^>]*src="\/shots\//g)]).toHaveLength(4)
  })

  it('gives the footer links a target at least 24 px tall (A-2, WCAG 2.5.8)', () => {
    // 14.5px text at the body's 1.55 line-height (~22.5px) + 2×5px padding ≈ 32px.
    expect(HTML).toMatch(/\.foot-nav a\s*\{[^}]*padding-block:\s*5px/)
  })
})
