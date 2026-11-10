// FILE: src/muya/lib/ui/linkTools/index.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Link hover tools own their logical target and cancel delayed callbacks on leave, replacement and teardown.
//   SCOPE: Scoped show/hide generations and actions; positioning remains in BaseFloat.
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
import BaseFloat from '../baseFloat'
import { getLinkInfo } from '../../utils/getLinkInfo'
import { patch, h } from '../../parser/render/snabbdom'
import icons from './config'

import './index.css'

const defaultOptions = {
  placement: 'bottom',
  modifiers: {
    offset: {
      offset: '0, 5'
    }
  },
  showArrow: false
}

class LinkTools extends BaseFloat {
  static pluginName = 'linkTools'

  constructor (muya, options = {}) {
    const name = 'ag-link-tools'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.oldVnode = null
    this.linkInfo = null
    this.options = opts
    this.icons = icons
    this.hideTimer = null
    this.showTimer = null
    this.generation = 0
    this.reference = null
    this.destroyed = false
    const linkContainer = this.linkContainer = document.createElement('div')
    this.container.appendChild(linkContainer)
    this.listen()
  }

  listen () {
    const { eventCenter } = this.muya
    super.listen()
    this.onTools = ({ reference, linkInfo }) => {
      this.cancelTimers()
      const generation = this.generation
      if (reference && linkInfo) {
        this.reference = reference
        this.linkInfo = linkInfo
        this.showTimer = setTimeout(() => {
          this.showTimer = null
          if (generation !== this.generation || !this.isCurrent()) return
          this.show(reference)
          this.render()
        }, 0)
      } else {
        this.hideTimer = setTimeout(() => this.hide(), 500)
      }
    }
    eventCenter.subscribe('muya-link-tools', this.onTools)
    eventCenter.attachDOMEvent(this.container, 'mouseover', () => {
      if (this.hideTimer) clearTimeout(this.hideTimer)
      this.hideTimer = null
    })
    eventCenter.attachDOMEvent(this.container, 'mouseleave', event => {
      if (this.reference?.contains(event.relatedTarget)) return
      if (this.hideTimer) clearTimeout(this.hideTimer)
      this.hideTimer = setTimeout(() => this.hide(), 300)
    })
  }

  cancelTimers () {
    clearTimeout(this.showTimer)
    clearTimeout(this.hideTimer)
    this.showTimer = this.hideTimer = null
    this.generation++
  }

  isCurrent () {
    if (this.destroyed || !this.reference?.isConnected || !this.muya.container.contains(this.reference)) return false
    const now = getLinkInfo(this.reference)
    const old = this.linkInfo
    if (old && typeof this.muya.contentState?.getBlock === 'function') {
      const block = this.muya.contentState.getBlock(old.key)
      if (!block || block.text?.slice(old.token.range.start, old.token.range.end) !== old.token.raw) return false
    }
    return !!now && !!old && now.key === old.key && now.href === old.href &&
      now.token.raw === old.token.raw && now.token.range.start === old.token.range.start &&
      now.token.range.end === old.token.range.end
  }

  hide () {
    this.cancelTimers()
    super.hide()
    this.reference = this.linkInfo = null
  }

  destroy () {
    this.hide()
    this.destroyed = true
    this.muya.eventCenter.unsubscribe('muya-link-tools', this.onTools)
    super.destroy()
  }

  render () {
    const { icons, oldVnode, linkContainer } = this
    const children = icons.map(i => {
      let icon
      let iconWrapperSelector
      if (i.icon) {
        // SVG icon Asset
        iconWrapperSelector = 'div.icon-wrapper'
        icon = h('i.icon', h('i.icon-inner', {
          style: {
            background: `url(${i.icon}) no-repeat`,
            'background-size': '100%'
          }
        }, ''))
      }
      const iconWrapper = h(iconWrapperSelector, icon)
      let itemSelector = `li.item.${i.type}`

      return h(itemSelector, {
        on: {
          click: event => {
            this.selectItem(event, i)
          }
        }
      }, iconWrapper)
    })

    const vnode = h('ul', children)

    if (oldVnode) {
      patch(oldVnode, vnode)
    } else {
      patch(linkContainer, vnode)
    }
    this.oldVnode = vnode
  }

  selectItem (event, item) {
    event.preventDefault()
    event.stopPropagation()
    if (!this.isCurrent()) return this.hide()
    const { contentState } = this.muya
    switch (item.type) {
      case 'unlink':
        contentState.unlink(this.linkInfo)
        this.hide()
        break
      case 'jump':
        this.muya.linkInteraction?.activateTool(this.reference, event)
        this.hide()
        break
    }
  }
}

export default LinkTools
