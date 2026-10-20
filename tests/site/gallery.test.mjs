// @vitest-environment node
// FILE: tests/site/gallery.test.mjs
// VERSION: 1.4.0
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
//   LAST_CHANGE: v1.4.0 - 2026-10-21 C-64 T-009: pins the P3 wiring — the
//   folio nav reports nav_click with placement gallery_nav (repo link
//   outbound_click), diagram_filter carries placement gallery on both the
//   theme strip and the group filters, and opening a card's Source details
//   sends diagram_code_view with the card's id.
//   PREV: v1.3.0 - 2026-10-18 C-64 T-007: cards gain
//   content-visibility with tuned intrinsic sizes (420px, wide 480px) and
//   a visually-hidden h2 per group (data-group aware) between the cards.
//   PREV: v1.2.0 - 2026-10-18 C-64 T-001+T-003 merge: fonts from
//   /fonts/brand/; three scripts (THEME_INIT_JS head script, controller,
//   JSON-LD that must parse with a SoftwareApplication node).
//   PREV: v1.0.0 - 2026-10-18 C-58 T-001/T-002: first version.
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
    // C-64: THEME_INIT_JS in <head> (before CSS), the controller at end of
    // body, and the shared head's JSON-LD. None has a src when analytics is off.
    expect((HTML.match(/<script\b/g) || []).length).toBe(3)
    expect(HTML).not.toMatch(/<script\b[^>]*\ssrc=/)
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(HTML)?.[1]
    expect(JSON.parse(ld)['@graph'].map((n) => n['@type'])).toContain('SoftwareApplication')
  })

  it('leaves no unrendered tokens or pele errors', () => {
    expect(HTML).not.toMatch(/%BASE%|<!--SITE_HEAD-->/)
    expect(HTML).not.toMatch(/PeleError/i)
  })

  it('skips layout/paint for off-screen cards with tuned intrinsic sizes (C-64 T-007 R-3)', () => {
    expect(HTML).toMatch(/\.card\{[^}]*content-visibility:auto/)
    expect(HTML).toMatch(/\.card\{[^}]*contain-intrinsic-size:auto 420px/)
    expect(HTML).toMatch(/\.card\.wide\{[^}]*grid-column:1\/-1;contain-intrinsic-size:auto 480px/)
    // Anchor targets stay on the (cv'd) articles themselves.
    for (const e of EXAMPLES.slice(0, 3)) expect(HTML).toContain(`id="${e.id}"`)
  })

  it('opens every group with a visually-hidden h2 the filter respects (C-64 T-007 A-2)', () => {
    for (const g of GROUPS) {
      const id = 'group-' + g.toLowerCase().replace(/\s+/g, '-')
      expect(HTML).toContain(`<h2 class="ghead" data-group="${g}" id="${id}">${g}</h2>`)
    }
    expect((HTML.match(/class="ghead"/g) || []).length).toBe(GROUPS.length)
    expect(HTML).toMatch(/\.ghead\{[^}]*clip-path:inset\(50%\)/)
    // The filter hides/shows the group headings together with their cards.
    expect(HTML).toMatch(/querySelectorAll\('\.card,\.ghead'\)/)
  })

  it('substitutes the site base everywhere under SITE_BASE=/mark/', () => {
    const html = renderGallery(resolveSiteSettings({ SITE_URL: 'https://xronocode.github.io/mark', SITE_BASE: '/mark/' }))
    expect(html).toContain('href="/mark/guide/"')
    expect(html).toContain('url("/mark/fonts/brand/BricolageGrotesque-800.woff2")')
    expect(html).not.toMatch(/%BASE%|(href|src)="\/(?!mark\/)/)
  })

  it('tracks the folio nav as gallery_nav and the P3 diagram events (C-64 T-009)', () => {
    for (const t of ['diagrams', 'docs', 'changelog']) {
      expect(HTML).toContain(`data-track="nav_click" data-target="${t}" data-placement="gallery_nav"`)
    }
    expect(HTML).toContain('data-track="outbound_click" data-target="github" data-placement="gallery_nav"')
    expect((HTML.match(/data-placement="gallery_nav"/g) || []).length).toBe(4)
    expect(HTML).toContain("markTrack('diagram_filter',{kind:'theme',placement:'gallery'})")
    expect(HTML).toContain("markTrack('diagram_filter',{kind:'group',placement:'gallery'})")
    expect(HTML).toContain("markTrack('diagram_code_view',{doc_id:")
  })
})
