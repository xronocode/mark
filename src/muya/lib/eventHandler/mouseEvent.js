// FILE: src/muya/lib/eventHandler/mouseEvent.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Resolve logical links across nested labels and preserve independent footnote/table pointer routes.
//   SCOPE: Container-scoped hover transitions and existing mousedown forwarding.
//   DEPENDS: Existing Muya inline/event APIs and getLinkInfo ownership helpers.
//   LINKS: M-012; C-MD-LINK-TABS.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   default - Preserved module entry with scoped logical-link behavior.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-10 C-MD-LINK-TABS: stable container-local hit testing and cancellable hover ownership; canonical Markdown unchanged.
// END_CHANGE_SUMMARY
import { getLinkInfo, resolveLinkElement } from '../utils/getLinkInfo'
import { collectFootnotes } from '../utils'

class MouseEvent {
  constructor (muya) {
    this.muya = muya
    this.mouseBinding()
    this.mouseDown()
  }

  mouseBinding () {
    const { container, eventCenter } = this.muya
    const handler = event => {
      const target = event.target
      const parent = target.parentNode
      const preSibling = target.previousElementSibling
      const parentPreSibling = parent ? parent.previousElementSibling : null
      const { hideLinkPopup, footnote } = this.muya.options
      const reference = parent || target
      const link = resolveLinkElement(target, container)
      const previousLink = resolveLinkElement(event.relatedTarget, container)
      const linkInfo = link && getLinkInfo(link)
      if (!hideLinkPopup && link && link !== previousLink && linkInfo?.rendered) {
        eventCenter.dispatch('muya-link-tools', { reference: link, linkInfo })
      }

      if (
        footnote &&
        parent &&
        parent.tagName === 'SUP' &&
        parent.classList.contains('ag-inline-footnote-identifier') &&
        preSibling &&
        preSibling.classList.contains('ag-hide')
      ) {
        const identifier = target.textContent
        eventCenter.dispatch('muya-footnote-tool', {
          reference,
          identifier,
          footnotes: collectFootnotes(this.muya.contentState.blocks)
        })
      }
    }
    const leaveHandler = event => {
      const target = event.target
      const parent = target.parentNode
      const preSibling = target.previousElementSibling
      const { footnote } = this.muya.options
      const link = resolveLinkElement(target, container)
      const nextLink = resolveLinkElement(event.relatedTarget, container)
      const inTools = this.muya.linkTools?.container?.contains(event.relatedTarget)
      if (link && nextLink !== link && !inTools) {
        eventCenter.dispatch('muya-link-tools', { reference: null })
      }

      if (
        footnote &&
        parent &&
        parent.tagName === 'SUP' &&
        parent.classList.contains('ag-inline-footnote-identifier') &&
        preSibling &&
        preSibling.classList.contains('ag-hide')
      ) {
        eventCenter.dispatch('muya-footnote-tool', {
          reference: null
        })
      }
    }

    eventCenter.attachDOMEvent(container, 'mouseover', handler)
    eventCenter.attachDOMEvent(container, 'mouseout', leaveHandler)
  }

  mouseDown () {
    const { container, eventCenter, contentState } = this.muya
    const handler = event => {
      if (event.defaultPrevented) return
      const target = event.target
      if (target.classList && target.classList.contains('ag-drag-handler')) {
        contentState.handleMouseDown(event)
      } else if (target && target.closest('tr')) {
        contentState.handleCellMouseDown(event)
      }
    }
    eventCenter.attachDOMEvent(container, 'mousedown', handler)
  }
}

export default MouseEvent
