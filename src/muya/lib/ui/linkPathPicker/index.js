// FILE: src/muya/lib/ui/linkPathPicker/index.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Inline relative-path autocomplete for markdown link destinations (C-20) — a scrollable float fed by the renderer's filePathAutoComplete option.
//   SCOPE: keyup-triggered detection of a cursor inside `](…`, debounced list fetch, BaseScrollFloat rendering with keyboard navigation, and inline insertion of the chosen path.
//   DEPENDS: BaseScrollFloat, snabbdom, muya selection/eventCenter/contentState cursor APIs, renderer-provided muya.options.filePathAutoComplete.
//   LINKS: .grace/changes/active/C-20; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-011 scenario-32.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - LinkPathPicker plugin (mirrors the emojiPicker inline pattern: keyup dispatch → muya-link-picker event → BaseScrollFloat).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-24 v1.0.0: C-20 — suggest real files while typing a link destination; directories continue browsing, files complete and close; Esc dismisses.
// END_CHANGE_SUMMARY

import BaseScrollFloat from '../baseScrollFloat'
import { patch, h } from '../../parser/render/snabbdom'
import { getParagraphReference } from '../../utils'
import selection from '../../selection'

import './index.css'

// Glyphs per entry kind (vite-svg-loader default-exports Vue components,
// not {viewBox, id} symbols — the svg <use> branch rendered blank boxes).
const GLYPHS = {
  'icon-folder': '📁',
  'icon-file': '📄'
}

// Text up to the cursor must end inside an unclosed link destination.
const LINK_DEST_REG = /\]\(([^()\s]*)$/

// True when the `]` at closeIndex belongs to an IMAGE destination: the
// nearest unpaired `[` to its left is preceded by '!'. The image popover
// owns that surface.
const isImageDestination = (text, closeIndex) => {
  for (let i = closeIndex - 1; i >= 0; i--) {
    if (text[i] === ']') return false // nested/closed earlier — not ours
    if (text[i] === '[') return text[i - 1] === '!'
  }
  return false
}
const NAV_KEYS = new Set(['Enter', 'ArrowDown', 'ArrowUp', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight'])

class LinkPathPicker extends BaseScrollFloat {
  static pluginName = 'linkPathPicker'

  constructor (muya) {
    const name = 'ag-link-path-picker'
    super(muya, name)
    this.renderArray = []
    this.oldVnode = null
    this.activeItem = null
    this.floatBox.classList.add('ag-link-path-picker-wrapper')
    this._timer = null
    this._seq = 0
    this._suppressNext = false
    this.listen()
  }

  listen () {
    super.listen()
    const { eventCenter, container } = this.muya
    eventCenter.subscribe('muya-link-picker', ({ reference, list, cb }) => {
      if (list && list.length) {
        this.show(reference, cb)
        this.renderArray = list
        this.activeItem = list[0]
        this.render()
      } else {
        this.hide()
      }
    })
    // BaseScrollFloat's keydown covers arrows/Tab/Enter; Escape is ours.
    eventCenter.attachDOMEvent(container, 'keyup', event => {
      if (event.key === 'Escape' && this.status) this.hide()
    })
    eventCenter.attachDOMEvent(container, 'keyup', this.keyupHandler)
  }

  keyupHandler = (event) => {
    if (NAV_KEYS.has(event.key)) return
    this.scheduleUpdate()
  }

  scheduleUpdate () {
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this._timer = null
      this.update()
    }, 150)
  }

  update () {
    if (this._suppressNext) {
      this._suppressNext = false
      return
    }
    const { contentState } = this.muya
    const { start } = contentState.cursor
    if (!start || !start.key) {
      this.hide()
      return
    }
    const block = contentState.getBlock(start.key)
    // Paragraph spans carry functionType 'paragraphContent' — only the
    // special editing surfaces (code, tables, front matter) opt out.
    const NON_TEXT_SURFACES = new Set([
      'codeContent', 'languageInput', 'cellContent', 'thematicBreakLine', 'frontmatter'
    ])
    if (
      !block ||
      typeof block.text !== 'string' ||
      NON_TEXT_SURFACES.has(block.functionType)
    ) {
      this.hide()
      return
    }
    const textToCursor = block.text.slice(0, start.offset)
    const match = LINK_DEST_REG.exec(textToCursor)
    if (!match || isImageDestination(textToCursor, match.index)) {
      // No unclosed link destination, or an IMAGE destination (![…](.
      this.hide()
      return
    }
    const typed = match[1]
    if (!typed) {
      this.hide()
      return
    }
    const autoComplete = this.muya.options.filePathAutoComplete
    if (typeof autoComplete !== 'function') {
      this.hide()
      return
    }

    const node = selection.getSelectionStart()
    const paragraph = node && node.closest
      ? node.closest('p, h1, h2, h3, h4, h5, h6, li')
      : null
    if (!paragraph) {
      this.hide()
      return
    }
    const reference = getParagraphReference(paragraph, paragraph.id)

    const seq = ++this._seq
    autoComplete(typed)
      .then(list => {
        // A newer keystroke won the race — drop the stale list.
        if (seq !== this._seq) return
        const cb = item => this.insertPath(item)
        this.muya.eventCenter.dispatch('muya-link-picker', { reference, list, cb })
      })
      .catch(() => {
        if (seq === this._seq) this.hide()
      })
  }

  // Replace the typed destination (the regex group) with the chosen entry
  // at the cursor, mirror the block-text splice pattern used by the C-16
  // smart-paste branch.
  insertPath (item) {
    const { text } = item
    // Invalidate any in-flight fetch: its .then would re-show the float
    // over the just-completed destination.
    this._seq++
    const { contentState } = this.muya
    const { start } = contentState.cursor
    const block = contentState.getBlock(start.key)
    if (!block || typeof block.text !== 'string') return

    const textToCursor = block.text.slice(0, start.offset)
    const match = LINK_DEST_REG.exec(textToCursor)
    if (!match || isImageDestination(textToCursor, match.index)) return
    const typed = match[1]
    // Replace through the END of the destination token (not just to the
    // cursor): completing with the caret mid-token must not duplicate the
    // remainder (](notes.m|d → ](notes.md, not ](notes.mnotes.mdd).
    let tokenEnd = start.offset
    while (tokenEnd < block.text.length && /[^()\s]/.test(block.text[tokenEnd])) {
      tokenEnd += 1
    }
    const insertAt = start.offset - typed.length
    block.text =
      block.text.slice(0, insertAt) + text + block.text.slice(tokenEnd)
    const offset = insertAt + text.length
    contentState.cursor = {
      start: { key: block.key, offset },
      end: { key: block.key, offset },
      isEdit: true
    }
    contentState.checkInlineUpdate(block)
    contentState.partialRender()
    this.muya.dispatchSelectionChange()
    this.muya.dispatchSelectionFormats()
    this.muya.dispatchChange()

    // A directory selection continues browsing into it; a file completion
    // must not re-trigger on the just-inserted destination (the regex
    // still matches until the user types the closing paren).
    if (text.endsWith('/')) {
      this.scheduleUpdate()
    } else {
      this._suppressNext = true
    }
  }

  render () {
    const { renderArray, oldVnode, scrollElement, activeItem } = this
    const children = renderArray.map(item => {
      const { text, iconClass } = item
      const icon = h('div.icon-wrapper', GLYPHS[iconClass] || '📄')
      const selector = activeItem === item ? 'div.ag-link-path-item.active' : 'div.ag-link-path-item'
      return h(selector, {
        attrs: { title: text, 'data-label': text },
        on: {
          click: () => {
            this.selectItem(item)
          }
        }
      }, [icon, h('div.item-text', text)])
    })
    const vnode = h('div', children)
    if (oldVnode) {
      patch(oldVnode, vnode)
    } else {
      patch(scrollElement, vnode)
    }
    this.oldVnode = vnode
  }

  destroy () {
    if (this._timer) clearTimeout(this._timer)
    super.destroy()
  }

  getItemElement (item) {
    // Keyed by data-label — textContent.includes mis-targets when one
    // label is a substring of another (notes.md vs xnotes.md).
    return this.floatBox.querySelector(`[data-label="${item.text}"]`)
  }
}

export default LinkPathPicker
