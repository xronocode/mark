// FILE: src/muya/lib/ui/diagramAppearance/index.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Accessible per-diagram appearance menu with one-edit Markdown persistence and read-only view overrides.
//   SCOPE: Inline/viewer button handling, viewport-positioned radio menu, source mutation/history, source-keyed bounded view overrides, readonly-attribute observation, synchronization and teardown.
//   DEPENDS: utils/diagramAppearance; renderBlock/renderDiagramAppearance; muya contentState/history/eventCenter.
//   LINKS: .grace/changes/archive/C-62 R-1 through R-6; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   default - DiagramAppearance controller, owned and destroyed by Muya.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-62: four-mode menu, safe source/history updates, read-only overrides and viewer synchronization.
// END_CHANGE_SUMMARY
import { APPEARANCE_MODES, readDiagramAppearance, writeDiagramAppearance } from '../../utils/diagramAppearance'
import { APPEARANCE_BUTTON_SELECTOR, appearanceText, updateAppearanceButton } from '../../parser/render/renderBlock/renderDiagramAppearance'
import './index.css'

class DiagramAppearance {
  constructor(muya) {
    this.muya = muya
    this.overrides = new Map()
    this.viewOverridesActive = false
    this.menu = null
    this.figureKey = null
    this.anchor = null
    this.destroyed = false
    muya.eventCenter.attachDOMEvent(muya.container, 'mousedown', this.onMouseDown, true)
    muya.eventCenter.attachDOMEvent(muya.container, 'click', this.onClick, true)
    this.readonlyObserver = new MutationObserver(this.onReadonlyChange)
    this.readonlyObserver.observe(muya.container, { attributes: true, attributeFilter: ['aria-readonly'] })
  }

  t = key => appearanceText(this.muya.options.t, key)
  readonly() { return this.muya.container.getAttribute('aria-readonly') === 'true' }

  onReadonlyChange = () => {
    if (this.destroyed) return
    this.close({ restoreFocus: false })
    if (this.readonly() || !this.viewOverridesActive) return
    this.viewOverridesActive = false
    this.overrides.clear()
    const scrollTop = this.muya.container.scrollTop
    const hadFocus = this.muya.hasFocus()
    this.muya.contentState.render(false)
    if (hadFocus) this.muya.focus()
    this.muya.container.scrollTop = scrollTop
    this.muya.eventCenter.dispatch('muya-diagram-appearance-change', { persisted: false })
  }

  figure(key) {
    return [...this.muya.container.querySelectorAll('figure[data-role="MERMAID"]')].find(figure => figure.id === key) || null
  }

  source(key) {
    const block = this.muya.contentState?.getBlock(key)
    if (!block || block.type !== 'figure' || block.functionType !== 'mermaid') return null
    const pre = block.children.find(child => child.type === 'pre')
    const code = pre?.children.find(child => child.type === 'code')
    return code ? { block, code, text: code.children.map(line => line.text).join('\n') } : null
  }

  getOverride(key, code) {
    const stored = this.overrides.get(key)
    if (stored && (stored.code !== code || !this.readonly())) { this.overrides.delete(key); return undefined }
    return stored?.mode
  }

  getExportOverride(index, code) {
    const figure = this.muya.container.querySelectorAll('figure[data-role="MERMAID"]')[index]
    return figure ? this.getOverride(figure.id, code) : undefined
  }

  getAppearance(key) {
    const source = this.source(key)
    return source ? readDiagramAppearance(source.text, this.getOverride(key, source.text)) : null
  }

  syncButton(target) {
    const figure = target?.closest('figure[data-role="MERMAID"]')
    const button = figure?.querySelector(APPEARANCE_BUTTON_SELECTOR)
    const appearance = figure && this.getAppearance(figure.id)
    if (button && appearance) updateAppearanceButton(button, this.muya.options.t, appearance.mode)
  }

  onMouseDown = event => {
    if (event.target.closest?.(APPEARANCE_BUTTON_SELECTOR)) event.preventDefault()
  }

  onClick = event => {
    const button = event.target.closest?.(APPEARANCE_BUTTON_SELECTOR)
    if (!button) return
    event.preventDefault()
    event.stopPropagation()
    const figure = button.closest('figure[data-role="MERMAID"]')
    if (figure) this.openForFigure(figure, button)
  }

  openForFigure(figure, button) {
    if (this.destroyed || !figure || !button) return false
    if (this.menu && this.anchor === button) { this.close(); return false }
    this.close({ restoreFocus: false })
    const source = this.source(figure.id)
    if (!source || !source.text.trim()) return false
    this.figureKey = figure.id
    this.anchor = button
    const appearance = this.getAppearance(figure.id)
    const menu = document.createElement('div')
    menu.className = 'ag-diagram-appearance-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', this.t('label'))
    const heading = document.createElement('div')
    heading.className = 'ag-diagram-appearance-heading'
    heading.textContent = this.t('label')
    if (this.readonly()) {
      const hint = document.createElement('span')
      hint.className = 'ag-diagram-appearance-readonly'
      hint.textContent = this.t('viewOnly')
      heading.appendChild(hint)
    }
    menu.appendChild(heading)
    for (const mode of APPEARANCE_MODES) {
      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'ag-diagram-appearance-option'
      option.dataset.mode = mode
      option.setAttribute('role', 'menuitemradio')
      option.setAttribute('aria-checked', String(mode === appearance.mode))
      option.disabled = mode === 'custom' && !appearance.hasCustom
      const text = document.createElement('span')
      text.textContent = this.t(mode)
      const detail = document.createElement('small')
      detail.textContent = this.t(option.disabled ? 'noCustomPalette' : `${mode}Description`)
      text.appendChild(detail)
      const check = document.createElement('span')
      check.className = 'ag-diagram-appearance-check'
      check.setAttribute('aria-hidden', 'true')
      check.textContent = '✓'
      option.append(text, check)
      option.addEventListener('click', () => this.choose(mode))
      menu.appendChild(option)
    }
    document.body.appendChild(menu)
    this.menu = menu
    button.setAttribute('aria-expanded', 'true')
    this.position()
    document.addEventListener('pointerdown', this.onOutside, true)
    document.addEventListener('keydown', this.onKeydown, true)
    window.addEventListener('resize', this.onViewportChange)
    window.addEventListener('scroll', this.onScroll, true)
    const current = menu.querySelector('[aria-checked="true"]')
    ;(current || menu.querySelector('button:not(:disabled)'))?.focus()
    return true
  }

  position() {
    const rect = this.anchor.getBoundingClientRect()
    const menu = this.menu.getBoundingClientRect()
    const width = window.innerWidth || document.documentElement.clientWidth
    const height = window.innerHeight || document.documentElement.clientHeight
    this.menu.style.left = `${Math.max(8, Math.min(rect.right - menu.width, width - menu.width - 8))}px`
    const y = rect.bottom + menu.height + 6 <= height - 8 ? rect.bottom + 6 : rect.top - menu.height - 6
    this.menu.style.top = `${Math.max(8, Math.min(y, height - menu.height - 8))}px`
  }

  onOutside = event => {
    if (!this.menu?.contains(event.target) && !this.anchor?.contains(event.target)) this.close({ restoreFocus: false })
  }
  onViewportChange = () => this.close({ restoreFocus: false })
  onScroll = event => { if (!this.menu?.contains(event.target)) this.close({ restoreFocus: false }) }
  onKeydown = event => {
    if (!this.menu) return
    const options = [...this.menu.querySelectorAll('button:not(:disabled)')]
    const index = options.indexOf(document.activeElement)
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      this.guardKeyup(event.key)
      event.preventDefault(); event.stopImmediatePropagation()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length
      options[next]?.focus()
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      this.guardKeyup(event.key)
      event.preventDefault(); event.stopImmediatePropagation(); this.close()
    } else if (event.key === 'Enter' || event.key === ' ') {
      this.guardKeyup(event.key)
      if (this.menu.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); event.target.click() }
    }
  }

  // The application search handler also consumes Escape on KEYUP and
  // restores the editor selection. A key owned by this menu must keep
  // ownership through release, even after the menu closes on keydown.
  guardKeyup(key) {
    this.clearKeyupGuard()
    this.releaseKey = key
    document.addEventListener('keyup', this.onKeyup, true)
    this.keyupTimer = setTimeout(() => this.clearKeyupGuard(), 1500)
  }
  onKeyup = event => {
    if (event.key !== this.releaseKey) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.clearKeyupGuard()
  }
  clearKeyupGuard() {
    clearTimeout(this.keyupTimer)
    this.releaseKey = null
    document.removeEventListener('keyup', this.onKeyup, true)
  }

  // START_BLOCK_DIAGRAM_APPEARANCE_CHOICE
  choose(mode) {
    const key = this.figureKey
    const source = this.source(key)
    if (!source || !this.figure(key) || !APPEARANCE_MODES.includes(mode)) { this.close(); return false }
    const current = this.getAppearance(key)
    if (mode === 'custom' && !current.hasCustom) return false
    if (current.mode === mode) { this.close(); return false }
    const persisted = !this.readonly()
    if (persisted) {
      const next = writeDiagramAppearance(source.text, mode)
      if (next !== source.text) this.replaceSource(source, next)
      this.overrides.delete(key)
    } else {
      this.viewOverridesActive = true
      this.overrides.set(key, { code: source.text, mode })
      while (this.overrides.size > 100) this.overrides.delete(this.overrides.keys().next().value)
    }
    const scrollTop = this.muya.container.scrollTop
    this.muya.contentState.render(false)
    this.muya.container.scrollTop = scrollTop
    if (persisted) this.muya.dispatchChange()
    this.muya.eventCenter.dispatch('muya-diagram-appearance-change', { figureKey: key, mode, persisted })
    console.debug('[Muya][diagramAppearance][BLOCK_DIAGRAM_APPEARANCE_CHOICE] appearance selected', { mode, persisted })
    this.close()
    return true
  }

  replaceSource(source, next) {
    const state = this.muya.contentState
    const previous = source.code.children
    const cursor = state.cursor
    const positions = new Map()
    let offset = 0
    for (const line of previous) { positions.set(line.key, offset); offset += line.text.length + 1 }
    // Metadata changes only a prefix. Map any source selection through its
    // smallest replacement interval, retaining unrelated paragraph selections.
    let start = 0
    while (start < source.text.length && start < next.length && source.text[start] === next[start]) start++
    let oldEnd = source.text.length; let newEnd = next.length
    while (oldEnd > start && newEnd > start && source.text[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd-- }
    const lines = next.split('\n')
    state.history.commitPending()
    source.code.children = lines.map((text, index) => {
      const line = previous[index] || state.createBlock('span', { lang: source.code.lang, functionType: 'codeContent' })
      line.text = text
      line.parent = source.code.key
      return line
    })
    for (let index = 0; index < source.code.children.length; index++) {
      const line = source.code.children[index]
      line.preSibling = source.code.children[index - 1]?.key || null
      line.nextSibling = source.code.children[index + 1]?.key || null
    }
    const mapPosition = position => {
      if (!positions.has(position.key)) return { ...position }
      let absolute = positions.get(position.key) + position.offset
      absolute = absolute < start ? absolute : absolute >= oldEnd ? absolute + newEnd - oldEnd : newEnd
      let index = 0
      while (index < lines.length - 1 && absolute > lines[index].length) { absolute -= lines[index].length + 1; index++ }
      return { key: source.code.children[index].key, offset: Math.max(0, Math.min(absolute, lines[index].length)) }
    }
    state.cursor = { start: mapPosition(cursor.start), end: mapPosition(cursor.end), isEdit: true }
    state.history.commitPending()
  }
  // END_BLOCK_DIAGRAM_APPEARANCE_CHOICE

  close({ restoreFocus = true } = {}) {
    if (!this.menu) return
    const key = this.figureKey
    const anchor = this.anchor
    this.menu.remove()
    this.menu = null
    this.figureKey = null
    this.anchor = null
    anchor?.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', this.onOutside, true)
    document.removeEventListener('keydown', this.onKeydown, true)
    window.removeEventListener('resize', this.onViewportChange)
    window.removeEventListener('scroll', this.onScroll, true)
    if (restoreFocus) {
      const target = anchor?.isConnected ? anchor : this.figure(key)?.querySelector(APPEARANCE_BUTTON_SELECTOR)
      target?.focus()
    }
  }

  destroy() {
    this.destroyed = true
    this.readonlyObserver.disconnect()
    this.close({ restoreFocus: false })
    this.overrides.clear()
    this.clearKeyupGuard()
  }
}

export default DiagramAppearance
