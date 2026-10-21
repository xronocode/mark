// FILE: tests/renderer/components/chrome-icons.test.js
// VERSION: 2.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the one drawn chrome icon set (C-40 T-002 / C-38 T-006 / C-51 T-006 / C-51 T-011 / C-51 T-013 / M-057) — descriptor integrity, the shared 16 px grid metrics, the ChromeIcon render component, the chromeIconMarkup string twin and the filled pin silhouette.
//   SCOPE: pure module tests over components/icons/chromeIcons.js.
//   DEPENDS: Vitest, vue (h) via the ChromeIcon component render.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-53, scenario-56, scenario-63; .canvas/Icons.dc.html.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ICON_NAMES - every shipped descriptor name (the whole chrome set after C-38 T-006).
//   COLOR_LITERAL - pattern for colour literals that must not appear in glyph markup.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.3.0 - 2026-10-17 C-51 T-013: the «pin» descriptor
//   test flips to the filled pushpin silhouette — every part fills with
//   currentColor (round head circle + tapering body + needle, no
//   stroke-only parts; at 12 px the stroked drawing read as a thin
//   stick/cross).
//   v2.2.0 - 2026-10-16 C-51 T-011: the «pin» glyph (upright
//   pushpin — T head, stem, flange, needle, round caps) joins the pinned
//   name list.
//   v2.1.0 - 2026-10-16 C-51 T-006: the «expand» glyph (canvas
//   Mermaid — outward corner brackets + diagonal, round caps/joins) joins
//   the pinned name list; muya's inline twin is asserted byte-identical in
//   tests/renderer/muya/block-expand-button.test.js.
//   v2.0.0 - 2026-10-15 C-38 T-006 N4 d: the set covers the
//   whole chrome (sidebar, find bar, dialogs, notifications, caption
//   buttons); every glyph sits on the single 0 0 16 16 grid (the 10×10
//   chevron exception is gone), open strokes declare round caps, no
//   part carries a colour literal, the rendered svg carries the
//   chrome-icon class, and chromeIconMarkup mirrors ChromeIcon.
// END_CHANGE_SUMMARY

import { mount } from '@vue/test-utils'
import {
  CHROME_ICONS,
  CHROME_ICON_NAMES,
  CHROME_ICON_STROKE,
  ChromeIcon,
  chromeIconMarkup
} from '@/components/icons/chromeIcons'

const ICON_NAMES = [
  // C-40 T-002 title-bar set (canvas Icons board).
  'sidebar', 'outline', 'auto', 'light', 'dark', 'share', 'guide',
  'split', 'lock', 'copy', 'menu', 'chevron-down', 'settings',
  // C-38 T-006 chrome set.
  'chevron-right', 'close', 'dot', 'plus', 'search',
  'case-sensitive', 'whole-word', 'regex', 'replace', 'replace-all',
  'arrow-up', 'arrow-down', 'folder', 'folder-open', 'file-plus',
  'file-markdown', 'save-all', 'broom', 'close-all', 'import',
  'info', 'warning', 'error', 'message', 'check', 'smile', 'sad',
  'github', 'twitter',
  'window-minimize', 'window-maximize', 'window-restore', 'window-close',
  // C-51 T-006: the diagram/table expand button glyph.
  'expand',
  // C-51 T-011: the pinned-file row mark (sidebar tree + Opened files).
  'pin',
  // C-FIX-009-RECENTLY-CLOSED: the tab-strip recovery button (↺).
  'reopen'
]

const COLOR_LITERAL = /#(?:[0-9a-f]{3,8})\b|rgb\(|rgba\(|hsl\(|hsla\(/i

describe('chromeIcons shared set (C-40 T-002, C-38 T-006)', () => {
  it('ships every chrome descriptor, frozen, with the shared 1.4 stroke', () => {
    expect(Object.keys(CHROME_ICONS).sort()).toEqual([...ICON_NAMES].sort())
    expect([...CHROME_ICON_NAMES]).toEqual([...ICON_NAMES].sort())
    expect(CHROME_ICON_STROKE).toBe(1.4)
    expect(Object.isFrozen(CHROME_ICONS)).toBe(true)
  })

  it('every glyph is built from well-formed primitives with attrs', () => {
    for (const name of ICON_NAMES) {
      const parts = CHROME_ICONS[name]
      expect(Array.isArray(parts)).toBe(true)
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) {
        expect(['path', 'rect', 'circle']).toContain(part.tag)
        expect(part.attrs).toBeTypeOf('object')
        expect(Object.isFrozen(part)).toBe(true)
      }
    }
  })

  it('no part carries a colour literal — colour only ever comes from currentColor', () => {
    for (const name of ICON_NAMES) {
      for (const part of CHROME_ICONS[name]) {
        const serialized = JSON.stringify(part.attrs)
        expect(serialized.match(COLOR_LITERAL), `${name}: ${serialized}`).toBeNull()
        if (part.fill) {
          // fill flag flips the part to currentColor at render time;
          // the flag itself must stay boolean.
          expect(typeof part.fill).toBe('boolean')
        }
      }
    }
  })

  it('every stroked path declares round caps (caption glyphs and closed shapes excepted)', () => {
    // C-WINDOWS-TITLEBAR-ALIGNMENT: the four window-* caption glyphs use
    // butt caps (Windows-convention flat terminals) and are exempt from the
    // hand-drawn round-cap invariant that governs the rest of the set.
    const FLAT_CAP = new Set(['window-minimize', 'window-maximize', 'window-restore', 'window-close'])
    for (const name of ICON_NAMES) {
      for (const part of CHROME_ICONS[name]) {
        if (part.tag !== 'path' || part.fill) continue
        if (FLAT_CAP.has(name)) {
          expect(part.cap, `${name} caption paths must stay flat-capped`).toBeUndefined()
          continue
        }
        expect(
          part.cap,
          `${name} path "${part.attrs.d}" must declare cap: 'round'`
        ).toBe('round')
      }
    }
  })

  it('renders an inline 16-grid svg.chrome-icon with the shared stroke and currentColor', () => {
    for (const name of ['sidebar', 'folder-open', 'twitter', 'window-close']) {
      const wrapper = mount(ChromeIcon, { props: { name } })
      const svg = wrapper.find('svg')
      expect(svg.exists(), name).toBe(true)
      expect(svg.classes(), name).toContain('chrome-icon')
      expect(svg.attributes('viewBox'), name).toBe('0 0 16 16')
      expect(svg.attributes('width'), name).toBe('16')
      expect(svg.attributes('fill'), name).toBe('none')
      expect(svg.attributes('stroke'), name).toBe('currentColor')
      expect(svg.attributes('stroke-width'), name).toBe('1.4')
      expect(svg.attributes('aria-hidden'), name).toBe('true')
    }
  })

  it('honours the size prop and hides unknown names', () => {
    const small = mount(ChromeIcon, { props: { name: 'chevron-down', size: 9 } })
    expect(small.find('svg').attributes('viewBox')).toBe('0 0 16 16')
    expect(small.find('svg').attributes('width')).toBe('9')

    const missing = mount(ChromeIcon, { props: { name: 'nope' } })
    expect(missing.find('svg').exists()).toBe(false)
  })

  it('fill parts render as currentColor fills with stroke none', () => {
    const wrapper = mount(ChromeIcon, { props: { name: 'dot' } })
    const circle = wrapper.find('circle')
    expect(circle.attributes('fill')).toBe('currentColor')
    expect(circle.attributes('stroke')).toBe('none')
  })

  it('the pin glyph is a filled pushpin silhouette — no stroke-only parts (C-51 T-013)', () => {
    const parts = CHROME_ICONS.pin
    expect(parts.length).toBeGreaterThanOrEqual(3)
    for (const part of parts) {
      // the whole glyph is fill-based: no thin stroked lines anywhere
      expect(part.fill, 'every pin part must fill').toBe(true)
      expect(part.cap).toBeUndefined()
      expect(part.join).toBeUndefined()
    }
    // round head + tapering body + needle
    const [head, body, needle] = parts
    expect(head.tag).toBe('circle')
    expect(head.attrs.r).toBeGreaterThan(2.5)
    expect(body.tag).toBe('path')
    expect(needle.tag).toBe('path')
    // the body and the needle are closed shapes
    expect(body.attrs.d.endsWith('z')).toBe(true)
    expect(needle.attrs.d.endsWith('z')).toBe(true)

    // rendered at the 12 px mark size, every part carries fill=currentColor
    // and stroke=none
    const wrapper = mount(ChromeIcon, { props: { name: 'pin', size: 12 } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('12')
    const drawn = wrapper.findAll('circle, path')
    expect(drawn.length).toBe(parts.length)
    for (const el of drawn) {
      expect(el.attributes('fill')).toBe('currentColor')
      expect(el.attributes('stroke')).toBe('none')
    }
  })

  it('cap/join flags render as round line attributes', () => {
    const wrapper = mount(ChromeIcon, { props: { name: 'close' } })
    const path = wrapper.find('path')
    expect(path.attributes('stroke-linecap')).toBe('round')
  })

  it('chromeIconMarkup mirrors ChromeIcon (class, grid, stroke, aria)', () => {
    const markup = chromeIconMarkup('close', 12, 'icon')
    expect(markup).toContain('class="chrome-icon icon"')
    expect(markup).toContain('viewBox="0 0 16 16"')
    expect(markup).toContain('width="12"')
    expect(markup).toContain('stroke="currentColor"')
    expect(markup).toContain('stroke-width="1.4"')
    expect(markup).toContain('aria-hidden="true"')
    expect(chromeIconMarkup('nope')).toBe('')
  })
})
