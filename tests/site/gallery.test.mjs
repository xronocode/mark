// @vitest-environment node
// FILE: tests/site/gallery.test.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the gallery corpus and the built /diagrams/ page
//            (C-58 R-1/R-3, T-001/T-002) — every example renders with pele
//            DOM-free with zero errors (the corpus doubles as a pele upgrade
//            canary), and renderGallery emits one card + SVG + copyable
//            source per example with the shared head, the theme strip and
//            the controller hooks, with no unrendered tokens or external
//            font hosts.
//   SCOPE: site/gallery/examples.mjs, site/scripts/build-gallery.mjs,
//          site/.vitepress/landing.mjs renderPage path.
//   DEPENDS: pele, site scripts, Vitest (DOM-free — node or jsdom).
//   LINKS: M-053 SiteBuild; V-M-053 scenario-7; C-58 corner-6;
//          site/gallery/prototype/build.reference.mjs (the approved
//          prototype this page must match)
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   GROUPS - the five example kinds
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-18 C-64 T-001: fonts now load from
//   /fonts/brand/ (moved from /fonts/gallery/), and the page carries two
//   inline scripts (the shared no-flash THEME_INIT_JS + the controller) —
//   the count assertion follows deliberately; CSP hashing lands in T-003.
//   v1.0.0 - 2026-10-18 C-58 T-001/T-002: first version.
// END_CHANGE_SUMMARY

import { render } from 'pele'
import { EXAMPLES } from '../../site/gallery/examples.mjs'
import { renderGallery } from '../../site/scripts/build-gallery.mjs'
import { resolveSiteSettings } from '../../site/.vitepress/landing.mjs'
import { describe, expect, it } from 'vitest'

const GROUPS = ['Process', 'Structure', 'Ideas', 'Plans', 'Data']

describe('gallery examples (the corpus)', () => {
  it('carries one example per diagram type with unique ids and valid groups', () => {
    const ids = EXAMPLES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(32)
    for (const e of EXAMPLES) {
      expect(GROUPS, e.id).toContain(e.group)
      expect(e.code.trim().length, e.id).toBeGreaterThan(0)
    }
  })

  for (const e of EXAMPLES) {
    it(`renders ${e.id} with pele, error-free (corner-6)`, () => {
      const r = render(e.code, { idPrefix: `g-${e.id}-` })
      expect(r && r.svg, e.id).toBeTruthy()
      expect(r.svg, e.id).toMatch(/<svg[\s>]/)
      expect(r.svg, e.id).not.toMatch(/PeleError/i)
      expect(r.svg, e.id).not.toContain('NaN')
    })
  }

  it('renders two cards with disjoint SVG id prefixes (no id collisions)', () => {
    const first = render(EXAMPLES[0].code, { idPrefix: 'g-a-' })
    const second = render(EXAMPLES[1].code, { idPrefix: 'g-b-' })
    const ids = [...(first.svg + second.svg).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('renderGallery (the built page)', () => {
  const SETTINGS = resolveSiteSettings({ SITE_URL: 'https://mark.xronocode.com' })
  const HTML = renderGallery(SETTINGS)

  it('injects the shared head for /diagrams/ (canonical + OG + favicon)', () => {
    expect(HTML).toContain('<link rel="canonical" href="https://mark.xronocode.com/diagrams/">')
    expect(HTML).toContain('<meta property="og:url" content="https://mark.xronocode.com/diagrams/">')
    expect(HTML).toContain('<title>Mark · Every diagram, in every theme</title>')
  })

  it('emits one card, one SVG and one copyable source per example', () => {
    expect((HTML.match(/class="card(?: wide)?"/g) || []).length).toBe(EXAMPLES.length)
    // Count cards with a rendered SVG — architecture nests icon <svg>s.
    expect(HTML.split('<article').slice(1).filter((c) => /<svg[\s>]/.test(c)).length).toBe(EXAMPLES.length)
    expect((HTML.match(/class="copy"/g) || []).length).toBe(EXAMPLES.length)
    for (const e of EXAMPLES) {
      expect(HTML).toContain(`id="src-${e.id}">\`\`\`mermaid`)
    }
  })

  it('uses unique element ids across the whole page', () => {
    const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds the filter chips with counts and the full theme strip', () => {
    expect(HTML).toContain('data-g="all"')
    for (const g of GROUPS) {
      expect(HTML).toContain(`data-g="${g}"`)
    }
    const chips = HTML.match(/class="chip"/g) || []
    expect(chips.length).toBe(32)
    expect(HTML).toContain('>Paper</button>')
    expect(HTML).toContain('>Ink</button>')
  })

  it('wires the slideshow, the fullscreen show and the empty state', () => {
    expect(HTML).toContain('id="play"')
    expect(HTML).toContain('id="show"')
    expect(HTML).toContain('id="showbox"')
    expect(HTML).toContain('id="shstage"')
    expect(HTML).toContain('class="empty" hidden')
    expect(HTML).toContain("localStorage.setItem('mark-gallery-theme'")
  })

  it('uses only the self-hosted site fonts (no Google Fonts, CSP-friendly)', () => {
    expect(HTML).not.toContain('fonts.googleapis.com')
    expect(HTML).not.toContain('fonts.gstatic.com')
    expect(HTML).not.toContain('src="undefined')
    // C-64 T-001: two inline scripts now — the shared no-flash THEME_INIT_JS
    // in <head> (must run before CSS) and the controller at end of body.
    // Neither has a src when analytics is off; C-64 T-003 hashes both.
    expect((HTML.match(/<script\b/g) || []).length).toBe(2)
    expect(HTML).not.toMatch(/<script\b[^>]*\ssrc=/)
  })

  it('leaves no unrendered tokens or pele errors', () => {
    expect(HTML).not.toMatch(/%BASE%|<!--SITE_HEAD-->/)
    expect(HTML).not.toMatch(/PeleError/i)
  })

  it('substitutes the site base everywhere under SITE_BASE=/mark/', () => {
    const html = renderGallery(resolveSiteSettings({ SITE_URL: 'https://xronocode.github.io/mark', SITE_BASE: '/mark/' }))
    expect(html).toContain('href="/mark/guide/"')
    expect(html).toContain('url("/mark/fonts/brand/BricolageGrotesque-800.woff2")')
    expect(html).not.toMatch(/%BASE%|(href|src)="\/(?!mark\/)/)
  })
})
