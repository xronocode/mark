// FILE: src/muya/lib/ui/tooltip/index.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Show readable viewport-bounded tooltips for Muya data-tooltip controls.
//   SCOPE: Delegated hover lifecycle, centered viewport placement with edge clamping and vertical flipping, cleanup when the source leaves the document.
//   DEPENDS: muya.eventCenter DOM listener lifecycle; index.css.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; C-71.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   positionTooltip - center a body-hosted tooltip on its source, clamp to the viewport and flip above when needed.
//   default - Tooltip delegated hover plugin with per-source tooltip cleanup.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-19 C-71: measure intrinsic label width before placement; fixed viewport coordinates, bounded wrapping and edge-aware positioning.
// END_CHANGE_SUMMARY

import './index.css'

export const positionTooltip = (source, ele) => {
  const { top, left, width, height } = source.getBoundingClientRect()
  const center = left + width / 2
  const x = Math.max(8, Math.min(center - ele.offsetWidth / 2, window.innerWidth - ele.offsetWidth - 8))
  const below = top + height + 10
  const above = below + ele.offsetHeight > window.innerHeight - 8
  ele.classList.toggle('ag-tooltip-above', above)
  Object.assign(ele.style, {
    top: `${above ? Math.max(8, top - ele.offsetHeight - 10) : below}px`,
    left: `${x}px`
  })
  ele.style.setProperty('--tooltip-arrow-left', `${Math.max(10, Math.min(ele.offsetWidth - 10, center - x))}px`)
}

class Tooltip {
  constructor (muya) {
    this.muya = muya
    this.cache = new WeakMap()
    this.timers = new WeakMap()
    const { container, eventCenter } = this.muya

    eventCenter.attachDOMEvent(container, 'mouseover', this.mouseOver.bind(this))
  }

  mouseOver (event) {
    const { target } = event
    const toolTipTarget = target.closest('[data-tooltip]')
    const { eventCenter } = this.muya
    if (toolTipTarget && !this.cache.has(toolTipTarget)) {
      const tooltip = toolTipTarget.getAttribute('data-tooltip')
      const tooltipEle = document.createElement('div')
      tooltipEle.textContent = tooltip
      tooltipEle.classList.add('ag-tooltip')
      document.body.appendChild(tooltipEle)
      positionTooltip(toolTipTarget, tooltipEle)

      this.cache.set(toolTipTarget, tooltipEle)

      const showTimer = setTimeout(() => {
        tooltipEle.classList.add('active')
      })

      const timer = setInterval(() => {
        if (!document.body.contains(toolTipTarget)) {
          this.mouseLeave({ target: toolTipTarget })
          clearInterval(timer)
        }
      }, 300)
      this.timers.set(toolTipTarget, { timer, showTimer })

      eventCenter.attachDOMEvent(toolTipTarget, 'mouseleave', this.mouseLeave)
    }
  }

  mouseLeave = (event) => {
    const { target } = event
    if (this.cache.has(target)) {
      const tooltipEle = this.cache.get(target)
      tooltipEle.remove()
      this.cache.delete(target)
      const { timer, showTimer } = this.timers.get(target)
      clearInterval(timer)
      clearTimeout(showTimer)
      this.timers.delete(target)
    }
  }
}

export default Tooltip
