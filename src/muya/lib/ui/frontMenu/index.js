// FILE: src/muya/lib/ui/frontMenu/index.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: The paragraph front menu float — the block toolbar's Duplicate / Turn into / New paragraph / Delete actions with their localized shortcut hints.
//   SCOPE: Menu construction from the quick-insert submenu source, content-aware menu/submenu sizing (FIX-004), snabbdom rendering and item selection into Muya contentState calls.
//   DEPENDS: muya baseFloat, snabbdom, frontMenu/config.js, quickInsert/config.js.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; docs/release-trains/2.5.x-next.md FIX-004.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   computeMenuWidth - FIX-004 content-aware width for one menu/submenu row set: canvas-measured label + scaled shortcut column + submenu arrow allowance, clamped to [190, 340] px (glyph estimate fallback without canvas).
//   default - FrontMenu muya UI plugin (pluginName 'frontMenu'): renders the paragraph float on muya-front-menu events and dispatches duplicate/delete/new/turnInto through contentState.
// END_MODULE_MAP

import BaseFloat from '../baseFloat'
import { patch, h } from '../../parser/render/snabbdom'
import { createMenu, createGetSubMenu, createGetLabel } from './config'

import './index.css'

const MAX_SUBMENU_HEIGHT = 400
const ITEM_HEIGHT = 28
const PADDING = 10

// START_BLOCK_FRONT_MENU_WIDTH
// FIX-004 (2026-10-20): the menu and its «Turn into» submenu were fixed
// at 190px, which wrapped/collided long localized rows (Russian
// «Математическая формула» + shortcut). Both surfaces now size to their
// widest row: label + shortcut measured with the menu font on a canvas,
// clamped to [190, 340] so English keeps today's compact look. The CSS
// keeps 190px as the no-JS-measure fallback (jsdom tests land there).
const BASE_MENU_WIDTH = 190
const MAX_MENU_WIDTH = 340
const MENU_FONT = '14px system-ui, -apple-system, "Segoe UI", "Noto Sans", sans-serif'
// icon (16) + icon margins (18) + shortcut column gap (~8) + row paddings (~24)
const FIXED_ROW_ALLOWANCE = 66

let menuMeasureCtx = null
const menuTextWidth = (text) => {
  if (!text) return 0
  const s = String(text)
  try {
    if (!menuMeasureCtx) {
      const canvas = document.createElement('canvas')
      menuMeasureCtx = canvas.getContext ? canvas.getContext('2d') : null
    }
    if (menuMeasureCtx && typeof menuMeasureCtx.measureText === 'function') {
      menuMeasureCtx.font = MENU_FONT
      return menuMeasureCtx.measureText(s).width
    }
  } catch (_) {
    // jsdom: no canvas — fall through to the glyph estimate.
  }
  return s.length * 7
}

export const computeMenuWidth = (items) => {
  let max = 0
  for (const item of items || []) {
    const label = item.text || item.title || ''
    const shortcut = item.shortCut || ''
    // The shortcut column renders at scale(.8); rows that open a submenu
    // (turnInto) reserve the 40px arrow affordance instead.
    const row =
      FIXED_ROW_ALLOWANCE +
      (item.hasSubmenu ? 40 : 0) +
      menuTextWidth(label) +
      (shortcut ? menuTextWidth(shortcut) * 0.8 : 0)
    if (row > max) max = row
  }
  return Math.min(MAX_MENU_WIDTH, Math.max(BASE_MENU_WIDTH, Math.ceil(max)))
}
// END_BLOCK_FRONT_MENU_WIDTH

const defaultOptions = {
  placement: 'bottom',
  modifiers: {
    offset: {
      offset: '0, 10'
    }
  },
  showArrow: false
}

class FrontMenu extends BaseFloat {
  static pluginName = 'frontMenu'

  constructor(muya, options = {}) {
    const name = 'ag-front-menu'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.oldVnode = null
    this.outmostBlock = null
    this.startBlock = null
    this.endBlock = null
    this.options = opts
    this.reference = null
    // 获取翻译函数
    this.t = opts.t || muya.options.t || ((key) => key)
    // 创建菜单和标签函数
    this.menu = createMenu(this.t)
    this.getLabel = createGetLabel(this.t)
    this.getSubMenu = createGetSubMenu(this.t)
    const frontMenuContainer = (this.frontMenuContainer = document.createElement('div'))
    Object.assign(this.container.parentNode.style, {
      overflow: 'visible'
    })
    this.container.appendChild(frontMenuContainer)
    this.listen()
  }

  listen() {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe(
      'muya-front-menu',
      ({ reference, outmostBlock, startBlock, endBlock }) => {
        if (reference) {
          this.outmostBlock = outmostBlock
          this.startBlock = startBlock
          this.endBlock = endBlock
          this.reference = reference
          setTimeout(() => {
            this.show(reference)
            this.render()
          }, 0)
        } else {
          this.hide()
          this.reference = null
        }
      }
    )
  }

  renderSubMenu(subMenu) {
    const { reference } = this
    const rect = reference.getBoundingClientRect()
    const windowHeight = document.documentElement.clientHeight
    const children = subMenu.map((menuItem) => {
      const { icon, title, label, shortCut } = menuItem
      const iconWrapperSelector = 'div.icon-wrapper'
      const iconWrapper = h(
        iconWrapperSelector,
        h(
          'i.icon',
          h(
            `i.icon-${label.replace(/\s/g, '-')}`,
            {
              style: {
                background: `url(${icon}) no-repeat`,
                'background-size': '100%'
              }
            },
            ''
          )
        )
      )

      const textWrapper = h('span', title)
      const shortCutWrapper = h('div.short-cut', [h('span', shortCut)])
      let itemSelector = `li.item.${label}`
      if (label === this.getLabel(this.outmostBlock)) {
        itemSelector += '.active'
      }
      return h(
        itemSelector,
        {
          on: {
            click: (event) => {
              this.selectItem(event, { label })
            }
          }
        },
        [iconWrapper, textWrapper, shortCutWrapper]
      )
    })
    let subMenuSelector = 'div.submenu'
    if (windowHeight - rect.bottom < MAX_SUBMENU_HEIGHT - (ITEM_HEIGHT + PADDING)) {
      subMenuSelector += '.align-bottom'
    }
    // FIX-004: size the submenu to its widest localized row (the CSS
    // 190px stays as the fallback for unmeasured environments).
    return h(
      subMenuSelector,
      { style: { width: `${computeMenuWidth(subMenu)}px` } },
      h('ul', children)
    )
  }

  render() {
    const { oldVnode, frontMenuContainer, outmostBlock, startBlock, endBlock } = this
    const { type, functionType } = outmostBlock
    const children = this.menu.map(({ icon, label, text, shortCut }) => {
      const subMenu = this.getSubMenu(outmostBlock, startBlock, endBlock)
      const iconWrapperSelector = 'div.icon-wrapper'
      const iconWrapper = h(
        iconWrapperSelector,
        h(
          'i.icon',
          h(
            `i.icon-${label.replace(/\s/g, '-')}`,
            {
              style: {
                background: `url(${icon}) no-repeat`,
                'background-size': '100%'
              }
            },
            ''
          )
        )
      )
      const textWrapper = h('span', text)
      const shortCutWrapper = h('div.short-cut', [h('span', shortCut)])
      let itemSelector = `li.item.${label}`
      const itemChildren = [iconWrapper, textWrapper, shortCutWrapper]
      if (label === 'turnInto' && subMenu.length !== 0) {
        itemChildren.push(this.renderSubMenu(subMenu))
      }
      if (label === 'turnInto' && subMenu.length === 0) {
        itemSelector += '.disabled'
      }
      // front matter can not be duplicated.
      if (label === 'duplicate' && type === 'pre' && functionType === 'frontmatter') {
        itemSelector += '.disabled'
      }
      return h(
        itemSelector,
        {
          on: {
            click: (event) => {
              this.selectItem(event, { label })
            }
          }
        },
        itemChildren
      )
    })

    const vnode = h('ul', children)

    if (oldVnode) {
      patch(oldVnode, vnode)
    } else {
      patch(frontMenuContainer, vnode)
    }
    this.oldVnode = vnode
    // FIX-004: the float box follows the same content-aware width as the
    // submenu, so every localized row stays on one line.
    if (this.container && this.container.style) {
      const sized = this.menu.map((m) => (m.label === 'turnInto' ? { ...m, hasSubmenu: true } : m))
      this.container.style.width = `${computeMenuWidth(sized)}px`
    }
  }

  selectItem(event, { label }) {
    event.preventDefault()
    event.stopPropagation()
    const { type, functionType } = this.outmostBlock
    // front matter can not be duplicated.
    if (label === 'duplicate' && type === 'pre' && functionType === 'frontmatter') {
      return
    }
    const { contentState } = this.muya
    contentState.selectedBlock = null
    switch (label) {
      case 'duplicate': {
        contentState.duplicate()
        break
      }
      case 'delete': {
        contentState.deleteParagraph()
        break
      }
      case 'new': {
        contentState.insertParagraph('after', '', true)
        break
      }
      case 'turnInto':
        // do nothing, do not hide float box.
        return
      default:
        contentState.updateParagraph(label)
        break
    }
    // delay hide to avoid dispatch enter hander
    setTimeout(this.hide.bind(this))
  }
}

export default FrontMenu
