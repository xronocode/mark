// FILE: src/muya/lib/eventHandler/linkInteraction.js
// START_MODULE_CONTRACT
//   PURPOSE: Choose one link outcome from the native gesture's initial rendered/editing state.
//   SCOPE: Instance-local source-token leases, no-history selection rendering and single activation; no filesystem or document mutation.
//   DEPENDS: EventCenter capture listeners, getLinkInfo, selection, existing ContentState cursor/render APIs.
//   LINKS: M-012; C-MD-LINK-TABS T-003.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   default - LinkInteraction controller; invalidated on document replacement and destroy.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-10 C-MD-LINK-TABS: retain native detail=1 origin through detail=2, including exposed syntax; navigation never writes cursor-only history.
// END_CHANGE_SUMMARY
import selection from '../selection'
import { isOsx } from '../config'
import { getLinkInfo, resolveLinkElement } from '../utils/getLinkInfo'

class LinkInteraction {
  constructor(muya) {
    this.muya = muya
    this.epoch = 0
    this.gesture = null
    this.composing = false
    this.destroyed = false
    this.eventIds = []
    const listen = (type, fn) => this.eventIds.push(muya.eventCenter.attachDOMEvent(muya.container, type, fn, true))
    listen('mousedown', event => this.beginGesture(event))
    listen('click', event => this.handleClick(event))
    listen('dblclick', event => this.handleDoubleClick(event))
    listen('mousemove', event => {
      const g = this.gesture
      if (g && event.buttons === 1 && Math.hypot(event.clientX - g.x, event.clientY - g.y) > 4) g.dragged = true
    })
    listen('dragstart', () => this.invalidate('drag'))
    listen('pointercancel', () => this.invalidate('pointer-cancel'))
    listen('compositionstart', () => { this.composing = true; this.invalidate('composition') })
    listen('compositionend', () => { this.composing = false })
    listen('keydown', () => this.invalidate('keyboard'))
  }

  isLinkTarget(target) {
    return !!resolveLinkElement(target, this.muya.container)
  }

  currentInfo(anchor) {
    if (this.destroyed || !anchor?.isConnected || !this.muya.container.contains(anchor)) return null
    const info = getLinkInfo(anchor)
    const block = info && this.muya.contentState.getBlock?.(info.key)
    if (!block || typeof block.text !== 'string' || block.text.slice(info.token.range.start, info.token.range.end) !== info.token.raw) return null
    return info
  }

  sameLink(left, right) {
    return !!left && !!right && left.key === right.key && left.href === right.href &&
      left.token.raw === right.token.raw && left.token.range.start === right.token.range.start &&
      left.token.range.end === right.token.range.end
  }

  snapshotCursor() {
    const cursor = this.muya.contentState.cursor
    if (!cursor?.start || !cursor.end) return null
    const point = p => p && ({ key: p.key, offset: p.offset })
    return { start: point(cursor.start), end: point(cursor.end), anchor: point(cursor.anchor || cursor.start), focus: point(cursor.focus || cursor.end) }
  }

  beginGesture(event) {
    if (event.button !== 0 || this.destroyed || this.composing || this.muya.keyboard?.isComposed || event.isComposing) {
      this.gesture = null
      return
    }
    const anchor = resolveLinkElement(event.target, this.muya.container)
    const info = this.currentInfo(anchor)
    if (!info) { this.gesture = null; return }
    const modifier = !!(isOsx ? event.metaKey : event.ctrlKey)
    if ((!modifier && (event.altKey || event.shiftKey)) || (isOsx && event.ctrlKey && !event.metaKey)) {
      this.gesture = null
      return
    }
    const readonly = this.muya.container.getAttribute('contenteditable') === 'false'
    if (event.detail === 1 || modifier) {
      this.gesture = { info, epoch: this.epoch, rendered: readonly || info.rendered,
        readonly, modifier, handled: false, dragged: false, before: this.snapshotCursor(),
        x: event.clientX, y: event.clientY }
      if (modifier || readonly) event.preventDefault()
    } else if (event.detail === 2 && this.gesture && this.gesture.epoch === this.epoch &&
        this.sameLink(this.gesture.info, info)) {
      if (this.gesture.rendered && !this.gesture.dragged) event.preventDefault()
    } else {
      this.gesture = null
    }
  }

  consume(event) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return true
  }

  // Existing cursor/render APIs reveal syntax without producing a content
  // event or truncating redo with an intermediate cursor history snapshot.
  editLink() {
    const cursor = selection.getCursorRange()
    if (!cursor?.start || !cursor.end) return
    this.muya.contentState.cursor = { ...cursor, noHistory: true }
    this.muya.contentState.partialRender?.()
    this.muya.dispatchSelectionChange?.(this.muya.contentState.cursor)
    this.muya.dispatchSelectionFormats?.(this.muya.contentState.cursor)
  }

  restoreView(g) {
    if (g.readonly || !g.before || !g.rendered) return
    const state = this.muya.contentState
    if (!state.getBlock?.(g.before.start.key) || !state.getBlock(g.before.end.key)) return
    state.cursor = { ...g.before, noHistory: true }
    state.partialRender?.()
    this.muya.dispatchSelectionChange?.(state.cursor)
    this.muya.dispatchSelectionFormats?.(state.cursor)
  }

  handleClick(event) {
    const anchor = resolveLinkElement(event.target, this.muya.container)
    // The webview's anchor default must never navigate behind the editor,
    // including in established editing or after an invalidated gesture.
    if (anchor) event.preventDefault()
    const g = this.gesture
    if (!g || g.epoch !== this.epoch || this.destroyed || this.composing || g.dragged) return false
    const info = this.currentInfo(anchor)
    if (!this.sameLink(g.info, info)) return false
    if (g.handled) return this.consume(event)
    if (g.modifier || (event.detail === 2 && g.rendered)) {
      g.handled = true
      this.restoreView(g)
      this.activate(info, event, g.modifier ? 'modifier' : 'double')
      return this.consume(event)
    }
    if (event.detail === 1 && g.rendered) {
      if (!g.readonly) this.editLink()
      this.muya.linkTools?.hide()
      return this.consume(event)
    }
    return false
  }

  handleDoubleClick(event) {
    const g = this.gesture
    if (g?.handled && g.epoch === this.epoch) return this.consume(event)
    return false
  }

  activate(info, event, source) {
    this.muya.linkTools?.hide()
    this.muya.eventCenter.dispatch('link-activate', { event, linkInfo: info, epoch: this.epoch, source })
  }

  activateTool(anchor, event) {
    if (this.composing || this.muya.keyboard?.isComposed) return false
    const info = this.currentInfo(anchor)
    if (!info) return false
    this.gesture = null
    this.activate(info, event, 'tool')
    return true
  }

  invalidate() {
    this.epoch++
    this.gesture = null
    this.muya.linkTools?.hide()
  }

  destroy() {
    this.invalidate('destroy')
    this.destroyed = true
    for (const id of this.eventIds) this.muya.eventCenter.detachDOMEvent(id)
    this.eventIds = []
  }
}
export default LinkInteraction
