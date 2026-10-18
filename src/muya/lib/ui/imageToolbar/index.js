// FILE: src/muya/lib/ui/imageToolbar/index.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: The embedded-image floating toolbar — edit (alt/title/src), the C-56 T-006 Copy image action, alignment and delete for a selected ![](…) image.
//   SCOPE: the float UI (BaseFloat subclass) and its click routing only: edit dispatches muya-image-selector, alignment goes through contentState.updateImage, delete through contentState.deleteImage, and Copy image dispatches the muya-image-copy event whose imageInfo carries the raw Markdown token (the host transport owns fs/fetch/canvas/clipboard).
//   DEPENDS: ui/baseFloat, snabbdom, ui/imageToolbar/config (getIcons), contentState image actions, eventCenter.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-65; .grace/changes/active/C-56 T-006; clickEvent.js (the muya-image-toolbar dispatch on image click); editor.vue handleImageCopyAction (the muya-image-copy subscriber); index.css (the 7-button layout).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - ImageToolbar class (pluginName 'imageToolbar'; renders the config entries — PNG icons via the icon-inner background trick, the Copy-image entry as an inline stroke SVG — and routes clicks; selectItem's copyImage case dispatches muya-image-copy and hides).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-18 C-56 T-006: the Copy image button
//   (config entry type copyImage) between edit and the alignment buttons —
//   the icon is the T-005 corner-pill copy glyph inlined as SVG (render
//   gains the i.icon svg branch; the PNG background path is unchanged),
//   and selectItem's copyImage case dispatches { imageInfo } on
//   muya-image-copy for the host transport. First GRACE contract.
//   v1.0.0 - upstream Mark Text image toolbar (edit/inline/left/center/
//   right/delete over pngicon assets).
// END_CHANGE_SUMMARY

import BaseFloat from '../baseFloat'
import { patch, h } from '../../parser/render/snabbdom'
import getIcons from './config'

import './index.css'

const defaultOptions = {
  placement: 'top',
  modifiers: {
    offset: {
      offset: '0, 10'
    }
  },
  showArrow: false
}

class ImageToolbar extends BaseFloat {
  static pluginName = 'imageToolbar'

  constructor (muya, options = {}) {
    const name = 'ag-image-toolbar'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.oldVnode = null
    this.imageInfo = null
    this.options = opts
    this.icons = getIcons(muya?.options?.t)
    this.reference = null
    const toolbarContainer = this.toolbarContainer = document.createElement('div')
    this.container.appendChild(toolbarContainer)
    this.floatBox.classList.add('ag-image-toolbar-container')
    this.listen()
  }

  listen () {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe('muya-image-toolbar', ({ reference, imageInfo }) => {
      this.reference = reference
      if (reference) {
        this.imageInfo = imageInfo
        setTimeout(() => {
          this.show(reference)
          this.render()
        }, 0)
      } else {
        this.hide()
      }
    })
  }

  render () {
    const { muya, oldVnode, toolbarContainer, imageInfo } = this
    const icons = getIcons(muya?.options?.t)
    const { attrs } = imageInfo.token
    const dataAlign = attrs['data-align']
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
      } else if (i.svg) {
        // C-56 T-006: inline stroke SVG (the corner-pill copy glyph family)
        // — currentColor rides the i.icon color rules, no PNG mask needed.
        iconWrapperSelector = 'div.icon-wrapper'
        icon = h('i.icon', h('svg', {
          attrs: {
            viewBox: '0 0 16 16',
            width: i.svg.width,
            height: i.svg.height,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '1.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'aria-hidden': 'true'
          }
        }, [
          h('rect', { attrs: { ...i.svg.rect } }),
          ...i.svg.paths.map(d => h('path', { attrs: { d } }))
        ]))
      }
      const iconWrapper = h(iconWrapperSelector, icon)
      let itemSelector = `li.item.${i.type}`

      if (i.type === dataAlign || !dataAlign && i.type === 'inline') {
        itemSelector += '.active'
      }
      return h(itemSelector, {
        dataset: {
          tip: i.tooltip
        },
        on: {
          click: event => {
            this.selectItem(event, i)
          }
        }
      }, [h('div.tooltip', i.tooltip), iconWrapper])
    })

    const vnode = h('ul', children)

    if (oldVnode) {
      patch(oldVnode, vnode)
    } else {
      patch(toolbarContainer, vnode)
    }
    this.oldVnode = vnode
  }

  selectItem (event, item) {
    event.preventDefault()
    event.stopPropagation()

    const { imageInfo } = this
    switch (item.type) {
      // Delete image.
      case 'delete':
        this.muya.contentState.deleteImage(imageInfo)
        // Hide image transformer
        this.muya.eventCenter.dispatch('muya-transformer', {
          reference: null
        })
        return this.hide()
      // Edit image, for example: editor alt and title, replace image.
      case 'edit': {
        const rect = this.reference.getBoundingClientRect()
        const reference = {
          getBoundingClientRect () {
            rect.height = 0
            return rect
          }
        }
        // Hide image transformer
        this.muya.eventCenter.dispatch('muya-transformer', {
          reference: null
        })
        this.muya.eventCenter.dispatch('muya-image-selector', {
          reference,
          imageInfo,
          cb: () => {}
        })
        return this.hide()
      }
      // C-56 T-006: copy the embedded image to the clipboard as a picture.
      // The host transport (editor.vue handleImageCopyAction) resolves the
      // raw Markdown src (imageInfo.token.attrs.src), reads/re-encodes the
      // bytes and writes the clipboard with the shared notice paths.
      case 'copyImage': {
        this.hide()
        this.muya.eventCenter.dispatch('muya-image-copy', { imageInfo: this.imageInfo })
        return
      }
      case 'inline':
      case 'left':
      case 'center':
      case 'right': {
        this.muya.contentState.updateImage(this.imageInfo, 'data-align', item.type)
        return this.hide()
      }
    }
  }
}

export default ImageToolbar
