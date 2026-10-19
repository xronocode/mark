// FILE: tests/renderer/muya/tooltip-layout.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin tooltip centering, viewport clamps, vertical fallback and hover timer cleanup.
//   SCOPE: Muya general tooltips and image toolbar label positioning; browser text layout is covered by table-ui-regressions.spec.ts.
//   DEPENDS: Vitest, jsdom, muya/ui/tooltip, muya/ui/imageToolbar.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; C-71.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   tooltipBox - deterministic tooltip size with a real CSSStyleDeclaration.
//   sourceAt - source geometry double.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-19 C-71: tooltip geometry and cleanup regression tests.
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Tooltip, { positionTooltip } from 'muya/lib/ui/tooltip'
import ImageToolbar from 'muya/lib/ui/imageToolbar'

const tooltipBox = (width = 200, height = 30) => {
  const el = document.createElement('div')
  Object.defineProperties(el, { offsetWidth: { value: width }, offsetHeight: { value: height } })
  return el
}
const sourceAt = (left, top, width = 20, height = 20) => ({
  getBoundingClientRect: () => ({ left, top, width, height })
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('innerWidth', 1000)
  vi.stubGlobal('innerHeight', 600)
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('general tooltip placement', () => {
  it.each([
    [490, 100, '400px', '130px', false, '100px'],
    [0, 100, '8px', '130px', false, '10px'],
    [980, 100, '792px', '130px', false, '190px'],
    [490, 560, '400px', '520px', true, '100px'],
    [490, -10, '400px', '20px', false, '100px']
  ])('places source at (%i,%i) inside the viewport', (left, top, x, y, above, arrow) => {
    const tip = tooltipBox()
    positionTooltip(sourceAt(left, top), tip)
    expect(tip.style.left).toBe(x)
    expect(tip.style.top).toBe(y)
    expect(tip.classList.contains('ag-tooltip-above')).toBe(above)
    expect(tip.style.getPropertyValue('--tooltip-arrow-left')).toBe(arrow)
  })

  it('clamps a tall label at the top instead of using a negative coordinate', () => {
    const tip = tooltipBox(200, 590)
    positionTooltip(sourceAt(490, 100), tip)
    expect(tip.style.top).toBe('8px')
  })

  it('keeps one tooltip per source and cancels both timers on leave', () => {
    const container = document.createElement('div')
    container.innerHTML = '<button data-tooltip="Inline Image"><span>icon</span></button><p>plain</p>'
    document.body.appendChild(container)
    const muya = { container, eventCenter: { attachDOMEvent: (el, name, fn) => el.addEventListener(name, fn) } }
    const plugin = new Tooltip(muya)
    const button = container.querySelector('button')
    const icon = button.firstElementChild
    plugin.mouseOver({ target: container.querySelector('p') })
    expect(document.querySelector('.ag-tooltip')).toBeNull()
    icon.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    icon.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(document.querySelectorAll('.ag-tooltip')).toHaveLength(1)
    expect(document.querySelector('.ag-tooltip').textContent).toBe('Inline Image')
    vi.advanceTimersByTime(0)
    expect(document.querySelector('.ag-tooltip').classList.contains('active')).toBe(true)
    vi.advanceTimersByTime(300)
    expect(document.querySelector('.ag-tooltip')).not.toBeNull()
    button.dispatchEvent(new MouseEvent('mouseleave'))
    expect(document.querySelector('.ag-tooltip')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    plugin.mouseLeave({ target: button })
    icon.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('mouseleave'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes the tooltip and its interval when its source is removed', () => {
    const container = document.createElement('div')
    container.innerHTML = '<button data-tooltip="Align Left"></button>'
    document.body.appendChild(container)
    new Tooltip({ container, eventCenter: { attachDOMEvent: (el, name, fn) => el.addEventListener(name, fn) } })
    container.firstElementChild.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    container.remove()
    vi.advanceTimersByTime(300)
    expect(document.querySelector('.ag-tooltip')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('image toolbar tooltip placement', () => {
  it.each([
    [{ left: -20, right: 180, top: 100 }, '28px', false],
    [{ left: 900, right: 1100, top: 100 }, '-108px', false],
    [{ left: 400, right: 600, top: 3 }, '0px', true],
    [{ left: 400, right: 600, top: 100 }, '0px', false]
  ])('keeps the label inside the viewport: %j', (rect, shift, below) => {
    const item = document.createElement('li')
    item.innerHTML = '<div class="tooltip tooltip-below"></div>'
    const tooltip = item.firstElementChild
    tooltip.getBoundingClientRect = () => rect
    ImageToolbar.prototype.positionLabel(item)
    expect(tooltip.style.getPropertyValue('--tooltip-shift-x')).toBe(shift)
    expect(tooltip.classList.contains('tooltip-below')).toBe(below)
  })
})
