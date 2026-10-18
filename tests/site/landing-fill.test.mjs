// @vitest-environment node
// FILE: tests/site/landing-fill.test.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the landing build placeholders are filled from the real
//            sources (pele SVGs, brand.css, THEME_INIT_JS, theme vars) and
//            that a bad placeholder fails the build.
//   SCOPE: site/scripts/landing-fill.mjs
//   DEPENDS: vitest, pele (through the module)
//   LINKS: M-053 SiteBuild; C-64 T-002
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TEMPLATE - a template carrying every placeholder once (sankey twice)
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - 2026-10-18 C-64 T-006: the fill+render chain over
//                 the real template (as config.mts buildEnd runs it) must
//                 start with <!doctype html> and carry no HTML comment —
//                 pele SVGs included.]
//   PREV: [v1.0.0 - 2026-10-18 C-64 T-002: first version.]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fillLanding, LANDING_THEMES } from '../../site/scripts/landing-fill.mjs'
import { renderLanding, resolveSiteSettings } from '../../site/.vitepress/landing.mjs'
import { THEME_INIT_JS } from '../../site/shared/theme-init.mjs'

const TEMPLATE = '<head><!--THEME_INIT--><style><!--BRAND_CSS--></style></head><body><!--DIAGRAM:sankey--><!--DIAGRAM:sankey--><!--DIAGRAM:pie--><script>const T=<!--THEME_VARS_JSON-->;</script></body>'

describe('fillLanding', () => {
  const out = fillLanding(TEMPLATE)
  it('fills every placeholder', () => {
    expect(out).not.toMatch(/<!--(DIAGRAM:|THEME_INIT|BRAND_CSS|THEME_VARS_JSON)/)
    expect(out).toContain(`<script>${THEME_INIT_JS}</script>`)
    expect(out).toContain('--marker')
    expect(out).toContain('url("%BASE%fonts/brand/')
  })
  it('renders real SVGs with a unique id prefix per occurrence', () => {
    expect((out.match(/<svg\b/g) || []).length).toBe(3)
    // Some diagram types carry no ids at all; those that do must never collide.
    const ids = [...out.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^l\d+-/.test(id))).toBe(true)
  })
  it('embeds the chip themes as JSON', () => {
    const json = /const T=(\{.*?\});<\/script>/s.exec(out)[1]
    const table = JSON.parse(json)
    expect(Object.keys(table)).toEqual(LANDING_THEMES)
    expect(table.paper['--pele-bg']).toMatch(/^#/)
  })
  it('fails the build on an unknown diagram id', () => {
    expect(() => fillLanding('<!--DIAGRAM:nope-->')).toThrow(/unknown diagram nope/)
  })
  it('renders the real template fill+render chain comment-free, starting at <!doctype', () => {
    const real = readFileSync(resolve(import.meta.dirname, '../../site/landing/index.html'), 'utf8')
    const html = renderLanding(fillLanding(real), resolveSiteSettings({}))
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toContain('<!--')
  })
})
