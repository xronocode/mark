// FILE: tests/renderer/components/chrome-icons.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the shared redrawn chrome icon set (C-40 T-002 / M-057) — descriptor integrity and the ChromeIcon render component.
//   SCOPE: pure module tests over components/icons/chromeIcons.js.
//   DEPENDS: Vitest, vue (h) via the ChromeIcon component render.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-53; .canvas/Icons.dc.html.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ICON_NAMES - the shipped descriptor names (canvas Icons board row order).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-002 initial pins: the 12
//   descriptors from the approved Icons board, 1.4 stroke, fill-part
//   overrides, per-icon viewBox, and the render component contract.
// END_CHANGE_SUMMARY

import { mount } from '@vue/test-utils'
import { CHROME_ICONS, CHROME_ICON_STROKE, ChromeIcon } from '@/components/icons/chromeIcons'

const ICON_NAMES = [
  'sidebar',
  'outline',
  'auto',
  'light',
  'dark',
  'share',
  'guide',
  'split',
  'lock',
  'copy',
  'menu',
  'chevron-down'
]

describe('chromeIcons shared set (C-40 T-002)', () => {
  it('ships every descriptor from the approved Icons board', () => {
    expect(Object.keys(CHROME_ICONS).sort()).toEqual([...ICON_NAMES].sort())
    expect(CHROME_ICON_STROKE).toBe(1.4)
  })

  it('every part is a well-formed primitive with attrs', () => {
    for (const name of ICON_NAMES) {
      const parts = CHROME_ICONS[name]
      expect(Array.isArray(parts)).toBe(true)
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) {
        expect(['path', 'rect', 'circle']).toContain(part.tag)
        expect(part.attrs).toBeTypeOf('object')
      }
    }
  })

  it('only the canvas fill parts carry the fill override', () => {
    // auto half-disc wedge, outline marker dots, guide question dot.
    expect(CHROME_ICONS.auto.filter((p) => p.fill).length).toBe(1)
    expect(CHROME_ICONS.outline.filter((p) => p.fill).length).toBe(2)
    expect(CHROME_ICONS.guide.filter((p) => p.fill).length).toBe(1)
    for (const name of ['sidebar', 'light', 'dark', 'share', 'split', 'lock', 'copy', 'menu', 'chevron-down']) {
      expect(CHROME_ICONS[name].some((p) => p.fill)).toBe(false)
    }
  })

  it('renders an inline 16-grid svg with the shared stroke and currentColor', () => {
    const wrapper = mount(ChromeIcon, { props: { name: 'sidebar' } })
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('viewBox')).toBe('0 0 16 16')
    expect(svg.attributes('width')).toBe('16')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.attributes('stroke-width')).toBe('1.4')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.find('rect').exists()).toBe(true)
  })

  it('honours size and the chevron off-grid viewBox, and hides unknown names', () => {
    const chevron = mount(ChromeIcon, { props: { name: 'chevron-down', size: 9 } })
    expect(chevron.find('svg').attributes('viewBox')).toBe('0 0 10 10')
    expect(chevron.find('svg').attributes('width')).toBe('9')

    const missing = mount(ChromeIcon, { props: { name: 'nope' } })
    expect(missing.find('svg').exists()).toBe(false)
  })
})
