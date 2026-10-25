// FILE: src/muya/lib/index.js
// VERSION: 1.9.0
// START_MODULE_CONTRACT
//   PURPOSE: Muya editor entry class — construction, options, and the public API surface other modules call.
//   SCOPE: Class construction/init, markdown IO (get/set), view-only Markdown reparse on footnote option changes and history restoration (C-60), export helpers, clipboard accessors, public editing commands, setOptions (dispatching muya-options-rerender after a needRender re-render so open overlays can follow theme-switch re-renders, C-51 T-014), the C-38 code-block line-number refresh entry, the C-39 T-002 session table column resize store (muya.tableResize), and destroy() teardown incl. the C-51 T-010 expand-need observation release. C-62: Per-diagram appearance controller lifecycle, writable metadata and read-only view overrides.
//   DEPENDS: contentState, event handlers (clipboard/keyboard/mouse/click/dragDrop/resize), tableResize, parser/render/renderBlock/expandNeed (observation release), utils (ExportMarkdown/ExportHtml), ui plugins.; ./ui/diagramAppearance.
//   LINKS: .grace/graph/runtime.xml M-012 fn-getCopyData and fn-tableResize; .grace/verification/runtime.xml V-M-012 scenario-14, scenario-20 and scenario-21; C-3; C-38 T-005; C-39 T-002; C-51 T-010; C-51 T-014 (muya-options-rerender, consumed by ui/blockViewer).; .grace/changes/archive/C-62.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   muya.diagramAppearance - per-diagram four-mode menu, portable metadata edits and bounded read-only overrides (C-62).
//   default - GRACE 4 synchronized symbol (Muya class).
//   Muya#reparseMarkdown - rebuild blocks under the current footnote grammar without a content event or history entry, preserving source selection and scroll.
//   Muya#refreshCodeBlockLineNumbers - re-measure every code-block gutter (wrap or code-font change without a re-render).
//   muya.tableResize - TableResize instance (C-39 T-002): in-memory session column widths per table block key; never touches markdown, history or isSaved.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.9.1 - 2026-10-25 C-FILE-POSITION-MEMORY e2e hardening:
//                Muya.use is idempotent (editor.vue re-runs it per mount; a
//                duplicate registration instantiated extra float plugins and
//                leaked body-level containers), and destroy() tears down
//                every registered plugin via the registry instead of a
//                hand list that missed frontMenu/formatPicker/transformer/
//                imageToolbar/linkTools/footnoteTool/tableBarTools.
//   v1.9.0 - 2026-10-18 C-62: own the diagram appearance controller before plugins/rendering and tear it down with the editor.
//   PREV: v1.8.0 - 2026-10-18 C-60: a rendered footnote option change
//   reparses the in-memory document with source-coordinate selection and
//   scroll preservation; no content event, disk read or undo entry.
//   v1.7.0 - 2026-10-17 C-51 T-014: setOptions(_, true)
//   dispatches muya-options-rerender on the event center after the full
//   re-render — the theme-switch path (editor.vue watch(theme)) rebuilds
//   every block, and the open fullscreen block viewer listens for the
//   event to re-clone from the re-rendered block once its diagram has
//   re-drawn (previously the viewer kept the old theme's clone until it
//   was closed and reopened).
//   v1.6.0 - 2026-10-16 C-51 T-010: destroy() releases this
//   editor's figures from the shared expand-need ResizeObserver (the
//   observer serves every muya instance; only this container's figures
//   are dropped).
//   v1.5.0 - 2026-10-15 C-39 T-002: the constructor creates
//   muya.tableResize (TableResize) before the first render — session-only
//   column widths keyed by table block key, with the drag/double-click
//   interaction on header-border handles. No teardown method: its container
//   listeners are registered through eventCenter and removed by
//   detachAllDomEvents; a window pointermove/up pair from an interrupted
//   drag is self-removing and inert afterwards.
//   v1.4.0 - 2026-10-15 C-38 T-005 (#1648): setOptions no longer
//   force-disables codeBlockLineNumbers (the option re-renders and the gutter
//   is measured by postRender); new refreshCodeBlockLineNumbers() for CSS-only
//   changes (wrapCodeBlocks / codeFontSize) that re-render nothing; destroy()
//   now tears the Resize handler down so split-view instances stop observing.
//   v1.3.0 - 2026-10-15 C-34 R2.2/C-39 T2: destroy the blockViewer UI plugin (shared fullscreen block viewer) on editor teardown.
//   v1.2.0 - C-24 R-4: insertImageFromPath — public entry for the Tauri file drop (inserts a local image at the cursor via imageAction).
//   v1.1.0 - Add getCopyData: markdown text of whatever is selected (DOM range, table cells, image) for the Copy as HTML clipboard path; mirrors docCopyHandler/copyHandler special cases (C-3).
// END_CHANGE_SUMMARY

import ContentState from './contentState'
import EventCenter from './eventHandler/event'
import MouseEvent from './eventHandler/mouseEvent'
import Clipboard from './eventHandler/clipboard'
import Keyboard from './eventHandler/keyboard'
import DragDrop from './eventHandler/dragDrop'
import Resize from './eventHandler/resize'
import ClickEvent from './eventHandler/clickEvent'
import TableResize from './tableResize'
import { releaseExpandNeedObservations } from './parser/render/renderBlock/expandNeed'
import { CLASS_OR_ID, MUYA_DEFAULT_OPTION } from './config'
import { wordCount, debounce } from './utils'
import ExportMarkdown from './utils/exportMarkdown'
import ExportHtml from './utils/exportHtml'
import ToolTip from './ui/tooltip'
import I18nCSS from './utils/i18nCSS'
import DiagramAppearance from './ui/diagramAppearance'
import './assets/styles/index.css'
import './assets/styles/callout.css'

class Muya {
  static plugins = []

  static use(plugin, options = {}) {
    // C-FILE-POSITION-MEMORY e2e hardening: editor components re-run
    // Muya.use on every mount (editor.vue onMounted), so a re-mounted
    // editor used to push the whole plugin list again and the NEXT Muya
    // constructed one extra float instance per duplicate — leaking
    // body-level float containers (3× .ag-front-menu broke strict-mode
    // locators). Registration is idempotent: the first registration wins.
    if (this.plugins.some((entry) => entry.plugin === plugin)) {
      return
    }
    this.plugins.push({
      plugin,
      options
    })
  }

  constructor(container, options) {
    this.options = Object.assign({}, MUYA_DEFAULT_OPTION, options)
    const { markdown } = this.options
    this.markdown = markdown
    this.container = getContainer(container, this.options)
    this.eventCenter = new EventCenter()
    this.tooltip = new ToolTip(this)
    // C-39 T-002: session-only table column resize. Created before
    // ContentState so the very first render (init → setMarkdown) can ask
    // it for stored widths — irrelevant on a fresh instance, but it keeps
    // the construction order render-independent.
    this.tableResize = new TableResize(this)
    this.diagramAppearance = new DiagramAppearance(this)
    // UI plugins
    if (Muya.plugins.length) {
      for (const { plugin: Plugin, options: opts } of Muya.plugins) {
        this[Plugin.pluginName] = new Plugin(this, opts)
      }
    }

    this.contentState = new ContentState(this, this.options)
    this.clipboard = new Clipboard(this)
    this.clickEvent = new ClickEvent(this)
    this.keyboard = new Keyboard(this)
    this.dragdrop = new DragDrop(this)
    this.resize = new Resize(this)
    this.mouseEvent = new MouseEvent(this)
    this.i18nCSS = new I18nCSS(this.options.t)
    this.init()
  }

  init() {
    const { container, contentState, eventCenter } = this
    contentState.stateRender.setContainer(container.children[0])
    eventCenter.subscribe('stateChange', this.dispatchChange)
    const { markdown } = this
    const { focusMode } = this.options

    // Initialize CSS variables for internationalization
    if (this.i18nCSS) {
      this.i18nCSS.updateCSSVariables()
    }

    this.setMarkdown(markdown)
    this.setFocusMode(focusMode)
    this.mutationObserver()

    const handleScroll = debounce(() => {
      eventCenter.dispatch('scroll', {
        scrollTop: container.scrollTop
      })
    }, 100)

    eventCenter.attachDOMEvent(container, 'focus', () => {
      eventCenter.dispatch('focus')
    })
    eventCenter.attachDOMEvent(container, 'blur', () => {
      eventCenter.dispatch('blur')
    })
    eventCenter.attachDOMEvent(container, 'scroll', handleScroll)
  }

  mutationObserver() {
    // Select the node that will be observed for mutations
    const { container, eventCenter } = this

    // Options for the observer (which mutations to observe)
    const config = { childList: true, subtree: true }

    // Callback function to execute when mutations are observed
    const callback = (mutationsList, observer) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          const { removedNodes, target } = mutation
          // If the code executes any of the following `if` statements, the editor has gone wrong.
          // need to report bugs.
          if (removedNodes && removedNodes.length) {
            const hasTable = Array.from(removedNodes).some(
              (node) => node.nodeType === 1 && node.closest('table.ag-paragraph')
            )
            if (hasTable) {
              eventCenter.dispatch('crashed')
              console.warn('There was a problem with the table deletion.')
            }
          }

          if (target.getAttribute('id') === 'ag-editor-id' && target.childElementCount === 0) {
            // TODO: the editor can not be input any more. report bugs and recovery...
            eventCenter.dispatch('crashed')
            console.warn('editor crashed, and can not be input any more.')
          }
        }
      }
    }

    // Create an observer instance linked to the callback function
    const observer = new MutationObserver(callback)

    // Start observing the target node for configured mutations
    observer.observe(container, config)
  }

  dispatchChange = () => {
    const { eventCenter } = this
    const markdown = (this.markdown = this.getMarkdown())
    const wordCount = this.getWordCount(markdown)
    const cursor = this.getCursor()
    const muyaIndexCursor = this.contentState.getMuyaIndexCursor()
    const history = this.getHistory()
    const toc = this.getTOC()

    eventCenter.dispatch('change', { markdown, wordCount, cursor, muyaIndexCursor, history, toc })
  }

  dispatchSelectionChange = (cursor) => {
    const selectionChanges = this.contentState.selectionChange(cursor)

    if (!this.container) return

    this.eventCenter.dispatch('selectionChange', selectionChanges)
    this.eventCenter.dispatch('scroll', { scrollTop: this.container.scrollTop })
  }

  dispatchSelectionFormats = (cursor) => {
    const { formats } = this.contentState.selectionFormats(cursor)

    this.eventCenter.dispatch('selectionFormats', formats)
  }

  getMarkdown() {
    const blocks = this.contentState.getBlocks()
    const { isGitlabCompatibilityEnabled, listIndentation } = this.contentState
    return new ExportMarkdown(blocks, listIndentation, isGitlabCompatibilityEnabled).generate()
  }

  getHistory() {
    return this.contentState.getHistory()
  }

  getTOC() {
    return this.contentState.getTOC()
  }

  setHistory(history) {
    return this.contentState.setHistory(history)
  }

  clearHistory() {
    return this.contentState.history.clearHistory()
  }

  exportStyledHTML(options) {
    const { markdown } = this
    return new ExportHtml(markdown, this).generate(options)
  }

  exportHtml() {
    const { markdown } = this
    return new ExportHtml(markdown, this).renderHtml()
  }

  getWordCount(markdown) {
    return wordCount(markdown)
  }

  getCursor() {
    return this.contentState.getCursor()
  }

  setMarkdown(
    markdown,
    cursor,
    isRenderCursor = true,
    muyaIndexCursor = undefined,
    blocks = undefined
  ) {
    let finalCursor = null

    if (blocks && cursor) {
      // We have blocks and a cursor, so we can set the blocks and the cursor in the contentState.
      finalCursor = cursor
      this.contentState.setBlocks(JSON.parse(JSON.stringify(blocks)))
    } else if (muyaIndexCursor && muyaIndexCursor.anchor && muyaIndexCursor.focus) {
      // We do not have a cursor, but we have a muyaIndexCursor, which is not based on a block key.
      // We need to convert the muyaIndexCursor to a cursor, so we can set it in the contentState.

      // We need to add the CURSOR_ANCHOR_DNA and CURSOR_FOCUS_DNA to the markdown BEFORE parsing if we have a muyaIndexCursor.
      // This is because muyaIndexCursors are not based off a key to a specific block, so we don't know which it is
      // We get a muyaIndexCursor if we are using the Source Code editor.
      const cursorInfo = this.contentState.addCursorToMarkdown(markdown, muyaIndexCursor)
      // #54 https://github.com/Tkaixiang/marktext/issues/54 This line adds the cursor signature infront that messes up the markdown parsing, so we need to handle the
      // parsing of the cursor signatures in the lexer.
      const newMarkdown = cursorInfo.markdown

      this.contentState.importMarkdown(newMarkdown, true) // Tell the lexer to check for the cursor signatures.

      finalCursor = this.contentState.convertMuyaIndexCursortoCursor(muyaIndexCursor)
    } else {
      // No cursor defined, we can just parse the markdown
      this.contentState.importMarkdown(markdown)
    }

    this.contentState.importCursor(finalCursor)
    this.contentState.render(isRenderCursor)
    setTimeout(() => {
      this.dispatchChange()
    }, 0)
  }

  setCursor(cursor) {
    const markdown = this.getMarkdown()
    const isRenderCursor = true

    return this.setMarkdown(markdown, cursor, isRenderCursor)
  }

  createTable(tableChecker) {
    return this.contentState.createTable(tableChecker)
  }

  getSelection() {
    return this.contentState.selectionChange()
  }

  setFocusMode(bool) {
    const { container } = this
    const { focusMode } = this.options
    if (bool && !focusMode) {
      container.classList.add(CLASS_OR_ID.AG_FOCUS_MODE)
    } else {
      container.classList.remove(CLASS_OR_ID.AG_FOCUS_MODE)
    }
    this.options.focusMode = bool
  }

  setFont({ fontSize, lineHeight }) {
    if (fontSize) {
      this.options.fontSize = parseInt(fontSize, 10)
    }
    if (lineHeight) {
      this.options.lineHeight = lineHeight
    }
    this.contentState.render(false)
  }

  setTabSize(tabSize) {
    if (!tabSize || typeof tabSize !== 'number') {
      tabSize = 4
    } else if (tabSize < 1) {
      tabSize = 1
    } else if (tabSize > 4) {
      tabSize = 4
    }
    this.contentState.tabSize = tabSize
  }

  setListIndentation(listIndentation) {
    if (typeof listIndentation === 'number') {
      if (listIndentation < 1 || listIndentation > 4) {
        listIndentation = 1
      }
    } else if (listIndentation !== 'dfm') {
      listIndentation = 1
    }
    this.contentState.listIndentation = listIndentation
  }

  updateParagraph(type) {
    this.contentState.updateParagraph(type)
  }

  duplicate() {
    this.contentState.duplicate()
  }

  deleteParagraph() {
    this.contentState.deleteParagraph()
  }

  insertParagraph(location /* before or after */, text = '', outMost = false) {
    this.contentState.insertParagraph(location, text, outMost)
  }

  editTable(data) {
    this.contentState.editTable(data)
  }

  hasFocus() {
    return document.activeElement === this.container
  }

  focus() {
    this.contentState.setCursor()
    this.container.focus()
  }

  blur(isRemoveAllRange = false, unSelect = false) {
    if (isRemoveAllRange) {
      const selection = document.getSelection()
      selection.removeAllRanges()
    }

    if (unSelect) {
      this.contentState.selectedImage = null
      this.contentState.selectedTableCells = null
    }

    this.hideAllFloatTools()
    this.container.blur()
  }

  format(type) {
    this.contentState.format(type)
  }

  insertImage(imageInfo) {
    this.contentState.insertImage(imageInfo)
  }

  // C-24 R-4: insert a local image file at the cursor through imageAction.
  insertImageFromPath(imagePath, alt) {
    return this.contentState.insertImageFromPath(imagePath, alt)
  }

  search(value, opt) {
    const { selectHighlight } = opt
    this.contentState.search(value, opt)
    this.contentState.render(!!selectHighlight)
    return this.contentState.searchMatches
  }

  replace(value, opt) {
    this.contentState.replace(value, opt)
    this.contentState.render(false)
    return this.contentState.searchMatches
  }

  find(action /* pre or next */) {
    this.contentState.find(action)
    this.contentState.render(false)
    return this.contentState.searchMatches
  }

  on(event, listener) {
    this.eventCenter.subscribe(event, listener)
  }

  off(event, listener) {
    this.eventCenter.unsubscribe(event, listener)
  }

  once(event, listener) {
    this.eventCenter.subscribeOnce(event, listener)
  }

  invalidateImageCache() {
    this.contentState.stateRender.invalidateImageCache()
    this.contentState.render(true)
  }

  undo() {
    this.contentState.history.undo()

    this.dispatchSelectionChange()
    this.dispatchSelectionFormats()
    this.dispatchChange()
  }

  redo() {
    this.contentState.history.redo()

    this.dispatchSelectionChange()
    this.dispatchSelectionFormats()
    this.dispatchChange()
  }

  selectAll() {
    if (!this.hasFocus() && !this.contentState.selectedTableCells) {
      return
    }
    this.contentState.selectAll()
  }

  /**
   * Get all images' src from the given markdown.
   * @param {string} markdown you want to extract images from this markdown.
   */
  extractImages(markdown = this.markdown) {
    return this.contentState.extractImages(markdown)
  }

  copyAsRich() {
    this.clipboard.copyAsRich()
  }

  /**
   * Get the markdown text of whatever is currently selected — a DOM
   * range, selected table cells, or a selected image — without writing
   * to the system clipboard. Returns { text } where text is '' when
   * nothing is selected. Mirrors the special cases of muya's copy
   * handlers (docCopyHandler for table cells, copyHandler for images).
   * NOTE: not a pure query — the range branch delegates to
   * getClipBoardData(), which may repair the DOM selection or blur the
   * editor when the cursor state is invalid.
   */
  getCopyData() {
    const contentState = this.contentState
    if (contentState.selectedTableCells) {
      const { row, column, cells } = contentState.selectedTableCells
      if (row === 1 && column === 1) {
        return { text: cells[0].text }
      }
      // Copy cells as a markdown table (same as docCopyHandler).
      const tableContents = []
      for (let i = 0; i < row; i++) {
        const rowWrapper = []
        for (let j = 0; j < column; j++) {
          const cell = cells[i * column + j]
          rowWrapper.push({ text: cell.text, align: cell.align })
        }
        tableContents.push(rowWrapper)
      }
      const figureBlock = contentState.createBlock('figure', {
        functionType: 'table'
      })
      const table = contentState.createTableInFigure(
        { rows: row, columns: column },
        tableContents
      )
      contentState.appendChild(figureBlock, table)
      const { isGitlabCompatibilityEnabled, listIndentation } = contentState
      const markdown = new ExportMarkdown(
        [figureBlock],
        listIndentation,
        isGitlabCompatibilityEnabled
      ).generate()
      return { text: markdown }
    }
    if (contentState.selectedImage) {
      const { token } = contentState.selectedImage
      if (token && token.raw.length > 0) {
        return { text: token.raw }
      }
      return { text: '' }
    }
    return { text: contentState.getClipBoardData().text }
  }

  copyAsHtml() {
    this.clipboard.copyAsHtml()
  }

  pasteAsPlainText() {
    this.clipboard.pasteAsPlainText()
  }

  /**
   * Copy the anchor block contains the block with `info`. like copy as markdown.
   * @param {string|object} key the block key or block
   */
  copy(info) {
    return this.clipboard.copy('copyBlock', info)
  }

  // START_CONTRACT: reparseMarkdown
  //   PURPOSE: Rebuild the current block tree under the current grammar without editing the document or history.
  //   INPUTS: { isRenderCursor: Boolean - restore the DOM caret only for an explicit history action }
  //   OUTPUTS: { void }
  //   SIDE_EFFECTS: Replaces blocks and internal cursor, clears stale selection/search block keys, renders and restores scroll; emits no content change.
  //   LINKS: C-60; History.restore; V-M-012 scenario-24.
  // END_CONTRACT: reparseMarkdown
  // START_BLOCK_FOOTNOTE_OPTION_REPARSE
  reparseMarkdown(isRenderCursor = false) {
    const state = this.contentState
    const markdown = this.getMarkdown()
    const sourceCursor = state.getMuyaIndexCursor()
    // A caret in the definition's hidden delimiters cannot survive as-is:
    // cursor signatures before '[' or between ']:' would change the grammar,
    // and a signature before its padding would preserve an extra space.
    // Move only these syntax-only positions to the identifier/body boundary.
    if (sourceCursor) {
      const lines = markdown.split('\n')
      for (const point of [sourceCursor.anchor, sourceCursor.focus]) {
        const line = lines[point.line] ?? ''
        const prefix = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*/.exec(line)
        if (!prefix) continue
        const start = line.indexOf('[^') + 2
        const end = start + prefix[1].length
        if (point.ch < start) point.ch = start
        else if (point.ch > end && point.ch < prefix[0].length) point.ch = prefix[0].length
      }
    }
    const marked = sourceCursor && state.addCursorToMarkdown(markdown, sourceCursor)
    const { scrollTop, scrollLeft } = this.container
    state.importMarkdown(marked?.markdown ?? markdown, marked?.isValid === true)
    const cursor = marked?.isValid && state.convertMuyaIndexCursortoCursor(sourceCursor)
    const first = state.getFirstBlock()
    const fallback = { key: first.key, offset: Math.min(first.text.length, sourceCursor?.anchor?.ch ?? 0) }
    state.importCursor(cursor?.anchor && cursor?.focus
      ? { ...cursor, noHistory: true }
      : { start: fallback, end: fallback, noHistory: true })
    state.selectedImage = null
    state.selectedTableCells = null
    state.selectedBlock = null
    state.renderRange = [null, null]
    // Search matches refer to the old block keys; the next search rebuilds them.
    state.searchMatches.matches = []
    state.searchMatches.index = -1
    state.render(isRenderCursor, true)
    this.container.scrollTop = scrollTop
    this.container.scrollLeft = scrollLeft
    console.debug('[Muya][reparseMarkdown][BLOCK_FOOTNOTE_OPTION_REPARSE]', {
      footnote: !!this.options.footnote
    })
  }
  // END_BLOCK_FOOTNOTE_OPTION_REPARSE

  setOptions(options, needRender = false) {
    const footnoteChanged = typeof options.footnote === 'boolean' && options.footnote !== this.options.footnote
    Object.assign(this.options, options)
    if (needRender) {
      if (footnoteChanged) this.reparseMarkdown()
      else this.contentState.render(false, true)
      // C-51 T-014: option-driven re-renders (the app theme switch) rebuild
      // every block. Open overlays that mirror a block (the fullscreen
      // block viewer) listen for this and refresh their clone from the
      // re-rendered DOM — the diagrams finish drawing asynchronously, so
      // consumers poll for content rather than cloning immediately.
      this.eventCenter.dispatch('muya-options-rerender')
    }

    // Set quick insert hint visibility
    const hideQuickInsertHint = options.hideQuickInsertHint
    if (typeof hideQuickInsertHint !== 'undefined') {
      const hasClass = this.container.classList.contains('ag-show-quick-insert-hint')
      if (hideQuickInsertHint && hasClass) {
        this.container.classList.remove('ag-show-quick-insert-hint')
      } else if (!hideQuickInsertHint && !hasClass) {
        this.container.classList.add('ag-show-quick-insert-hint')
      }
    }

    // Set spellcheck container attribute
    const spellcheckEnabled = options.spellcheckEnabled
    if (typeof spellcheckEnabled !== 'undefined') {
      this.container.setAttribute('spellcheck', !!spellcheckEnabled)
    }

    if (options.bulletListMarker) {
      this.contentState.turndownConfig.bulletListMarker = options.bulletListMarker
    }

    // Update I18n CSS variables
    if (options.t && this.i18nCSS) {
      this.i18nCSS.setTranslationFunction(options.t)
    }
  }

  /**
   * Re-measure every code-block line-number gutter (C-38 T-005). Wrapping
   * (wrapCodeBlocks) and the code font size are applied as pure CSS by the
   * renderer without a muya re-render, so their watchers must call this to
   * keep each number on the first visual row of its logical line.
   */
  refreshCodeBlockLineNumbers() {
    this.contentState.resizeLineNumber(true)
  }

  hideAllFloatTools() {
    return this.keyboard.hideAllFloatTools()
  }

  /**
   * Replace the word range with the given replacement.
   *
   * @param {*} line A line block reference of the line that contains the word to
   *                 replace - must be a valid reference!
   * @param {*} wordCursor The range of the word to replace (line: "abc >foo< abc"
   *                       whereas `>`/`<` is start and end of `wordCursor`). This
   *                       range is replaced by `replacement`.
   * @param {string} replacement The replacement.
   * @param {boolean} setCursor Shoud we update the editor cursor?
   */
  replaceWordInline(line, wordCursor, replacement, setCursor = false) {
    this.contentState.replaceWordInline(line, wordCursor, replacement, setCursor)
  }

  /**
   * Replace the current selected word with the given replacement.
   *
   * NOTE: Unsafe method because exacly one word have to be selected. This
   * is currently used to replace a misspelled word in MarkText that was selected
   * by Chromium.
   *
   * @param {string} word The old word that should be replaced. The whole word must be selected.
   * @param {string} replacement The word to replace the selecte one.
   * @returns {boolean} True on success.
   */
  _replaceCurrentWordInlineUnsafe(word, replacement) {
    // __MARKTEXT_PATCH__
    return this.contentState._replaceCurrentWordInlineUnsafe(word, replacement)
  }

  destroy() {
    this.diagramAppearance.destroy()
    this.contentState.clear()
    // C-FILE-POSITION-MEMORY e2e hardening: destroy every registered UI
    // plugin. The former hand list covered only some of them, so a
    // destroyed editor leaked the rest's body-level float containers
    // (frontMenu, formatPicker, transformer, imageToolbar, linkTools,
    // footnoteTool, tableBarTools) — the registry is the source of truth
    // and new plugins can no longer be forgotten here.
    for (const { plugin } of Muya.plugins) {
      const instance = this[plugin.pluginName]
      if (instance && typeof instance.destroy === 'function') {
        instance.destroy()
      }
    }
    // C-38 T-005: the resize handler owns window/container listeners that
    // outlive the editor DOM (split-view instances come and go).
    this.resize.destroy()
    // C-51 T-010: drop this editor's figures from the shared expand-need
    // ResizeObserver (other muya instances keep their observations).
    releaseExpandNeedObservations(this.container)
    this.eventCenter.detachAllDomEvents()
  }
}

/**
 * [ensureContainerDiv ensure container element is div]
 */
function getContainer(originContainer, options) {
  const { hideQuickInsertHint, spellcheckEnabled } = options
  const container = document.createElement('div')
  const rootDom = document.createElement('div')
  const attrs = originContainer.attributes
  // copy attrs from origin container to new div element
  Array.from(attrs).forEach((attr) => {
    container.setAttribute(attr.name, attr.value)
  })

  if (!hideQuickInsertHint) {
    container.classList.add('ag-show-quick-insert-hint')
  }

  container.setAttribute('contenteditable', true)
  container.setAttribute('autocorrect', false)
  container.setAttribute('autocomplete', 'off')
  // NOTE: The browser is not able to correct misspelled words words without
  // a custom implementation like in MarkText.
  container.setAttribute('spellcheck', !!spellcheckEnabled)
  container.appendChild(rootDom)
  originContainer.replaceWith(container)
  return container
}

export default Muya
