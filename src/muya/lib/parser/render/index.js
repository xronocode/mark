// FILE: src/muya/lib/parser/render/index.js
// VERSION: 2.1.1
// START_MODULE_CONTRACT
//   PURPOSE: Render muya ContentState blocks to the DOM via snabbdom and drive the asynchronous previews (math, pele diagrams, diagrams, images).
//   SCOPE: StateRender — full/partial/single-block render, cursor-safe selector building, pele dispatch into the resilient pipeline, diagram rendering (C-51 T-005: vega-lite/flowchart/sequence options and post-pass themed from the active app theme), render caches, the C-38 line-number gutter measurement queue, keeping C-39 table scroll and C-39 T-002 session column widths across renders, and the C-51 T-010 expand-need sync after every render path and diagram insert. C-62: Pass appearance override and insert synchronization callbacks to Pele.
//   DEPENDS: ./snabbdom, ./renderBlock, ./renderInlines, ./pelePipeline, ./diagramTheme, ./contentTheme, ./renderBlock/expandNeed, ../../renderers, ../../config, ../../utils, ../rules; muya.diagramAppearance.
//   LINKS: M-011 muya editor surface; C-34 R2.1; C-55; START_BLOCK_PELE_DISPATCH; START_BLOCK_DIAGRAM_THEME_OPTIONS; C-38 T-005 lineNumberPreKeys; C-39 T-001 START_BLOCK_TABLE_SCROLL_KEEP; C-39 T-002 START_BLOCK_TABLE_WIDTHS_KEEP; C-51 T-010 expandNeed sync; .grace/changes/archive/C-62; .grace/changes/archive/C-FIX-012-RENDER-CURSOR-GUARD; .grace/changes/archive/C-FIX-012-RENDER-CONFLICT-GUARD.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - StateRender class: cursor-safe Muya block renderer and preview orchestrator; lineNumberPreKeys holds the pre keys whose gutter must be measured by the next postRender (C-38 T-005); every render path ends with syncExpandNeed (C-51 T-010); C-62 callbacks pass per-figure read-only appearance overrides and synchronize button attributes after every Pele insertion.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.1.1 - 2026-10-20 FIX-012: selector activity and token-conflict checks tolerate transient incomplete cursor state during tab rendering.
//   PREV: v2.1.0 - 2026-10-18 C-62: connect local appearance overrides and stable button-state synchronization to the raw SVG pipeline.
//   v1.6.0 - 2026-10-16 C-51 T-010 (D-7): every render path
//   (render/partialRender/singleRender) runs syncExpandNeed after the
//   diagram dispatch, renderDiagram re-evaluates each figure after its
//   insert — the ag-expand-needed class that gates the expand button
//   tracks the rendered size of every diagram/table block.
//   v1.5.2 - 2026-10-16 C-51 T-008: renderDiagram takes and
//   clears the diagram queue before its first await, so an overlapping
//   call cannot render the same block twice (two js-sequence SVGs in one
//   figure on CI).
//   v1.5.1 - 2026-10-16 C-51 T-008 (live smoke): the diagram
//   error text names the failing fence (DIAGRAM_ERROR_LABEL) — a failed
//   vega-lite block used to read «Invalid Sequence Codes». The failure
//   itself (vega codegen blocked by the Tauri CSP) is fixed in
//   ../../renderers (ast + vega-interpreter).
//   v1.5.0 - 2026-10-16 C-51 T-005 (R-3): renderDiagram themes
//   vega-lite, flowchart.js and js-sequence from the active app theme —
//   tokens are read at render time (readActiveThemeTokens) and the
//   builders/post-pass come from contentTheme.js (same categorical
//   palette as Mermaid); the vega named themes (latimes/dark) are gone
//   and the user's own vega spec config keeps winning (vega-embed merges
//   spec.config over the passed config). The sequenceTheme preference
//   (hand/simple) still rides the options; theme switches re-render
//   through the existing setOptions(_, true) full-render path that
//   re-queues every diagram block.
//   v1.4.0 - 2026-10-15 C-39 T-002: every render path calls
//   applyTableColumnWidths (START_BLOCK_TABLE_WIDTHS_KEEP) next to the
//   T-001 scroll restore so muya.tableResize can reconcile stored column
//   widths whose column count changed and re-apply widths a hidden render
//   could not measure. The widths themselves ride in the table vnode
//   (renderContainerBlock START_BLOCK_TABLE_COLUMN_WIDTHS).
//   v1.3.0 - 2026-10-15 C-38 T-005: lineNumberPreKeys — renderContainerBlock
//   records every fence/indent code block whose gutter it (re)rendered, so
//   contentState.resizeLineNumber measures only those pres after each render
//   pass (full render records all, partial render only the edited range).
//   v1.2.0 - 2026-10-15 C-39 T-001: keep the horizontal scroll of table wrappers across renders (START_BLOCK_TABLE_SCROLL_KEEP).
//   v2.0.0 - 2026-10-17 C-55: the mermaid engine is gone — renderPele
//   delegates to createPelePipeline (code-only LRU cache, sync DOM-free
//   renders, CSS-variable theming); mermaidTheme.js renamed diagramTheme.js
//   (diagramThemeSignature).
//   v1.1.0 - 2026-10-15 C-34 R2.1: renderMermaid delegates to createMermaidPipeline (code+theme LRU cache, keep-last-good + escaped error text, 250 ms debounce, natural size); module contract added.
// END_CHANGE_SUMMARY

import loadRenderer from '../../renderers'
import { CLASS_OR_ID, PREVIEW_DOMPURIFY_CONFIG } from '../../config'
import { conflict, mixins, camelToSnake, sanitize } from '../../utils'
import { patch, toVNode, toHTML, h } from './snabbdom'
import { beginRules } from '../rules'
import renderInlines from './renderInlines'
import renderBlock from './renderBlock'
import { createPelePipeline } from './pelePipeline'
import { readActiveThemeTokens, diagramThemeSignature } from './diagramTheme'
import { syncExpandNeed, updateFigureExpandNeed } from './renderBlock/expandNeed'
import {
  buildVegaThemeConfig,
  buildFlowchartThemeOptions,
  buildSequenceThemeOptions,
  applySequenceTheme,
  applySequenceThemeWhenDrawn
} from './contentTheme'

const DIAGRAM_ERROR_LABEL = {
  flowchart: 'Flow Chart',
  sequence: 'Sequence',
  plantuml: 'PlantUML',
  'vega-lite': 'Vega-Lite'
}

class StateRender {
  constructor(muya) {
    this.muya = muya
    this.eventCenter = muya.eventCenter
    this.codeCache = new Map()
    this.loadImageMap = new Map()
    this.loadMathMap = new Map()
    this.peleCache = new Map()
    this.pelePipeline = createPelePipeline({
      getAppearanceOverride: (target, code) => muya.diagramAppearance?.getOverride(target.closest('figure')?.id, code),
      onInsert: target => muya.diagramAppearance?.syncButton(target),
      resolveTarget: selector => (muya.container || document).querySelector(selector)
    })
    this.diagramCache = new Map()
    this.tokenCache = new Map()
    this.labels = new Map()
    this.urlMap = new Map()
    this.renderingTable = null
    this.renderingRowContainer = null
    // C-38 T-005: pre keys whose line-number gutter was (re)rendered in the
    // current pass; drained by contentState.resizeLineNumber in postRender.
    this.lineNumberPreKeys = new Set()
    this.container = null
  }

  setContainer(container) {
    this.container = container
  }

  // collect link reference definition
  collectLabels(blocks) {
    this.labels.clear()

    const travel = (block) => {
      const { text, children } = block
      if (children && children.length) {
        children.forEach((c) => travel(c))
      } else if (text) {
        const tokens = beginRules.reference_definition.exec(text)
        if (tokens) {
          const key = (tokens[2] + tokens[3]).toLowerCase()
          if (!this.labels.has(key)) {
            this.labels.set(key, {
              href: tokens[6],
              title: tokens[10] || ''
            })
          }
        }
      }
    }

    blocks.forEach((b) => travel(b))
  }

  checkConflicted(block, token, cursor) {
    // START_BLOCK_RENDER_CONFLICT_CURSOR_GUARD
    const start = cursor?.start
    const end = cursor?.end
    if (!start || !end) {
      return false
    }
    // END_BLOCK_RENDER_CONFLICT_CURSOR_GUARD
    const key = block.key
    const { start: tokenStart, end: tokenEnd } = token.range

    if (key !== start.key && key !== end.key) {
      return false
    } else if (key === start.key && key !== end.key) {
      return conflict([tokenStart, tokenEnd], [start.offset, start.offset])
    } else if (key !== start.key && key === end.key) {
      return conflict([tokenStart, tokenEnd], [end.offset, end.offset])
    } else {
      return (
        conflict([tokenStart, tokenEnd], [start.offset, start.offset]) ||
        conflict([tokenStart, tokenEnd], [end.offset, end.offset])
      )
    }
  }

  getClassName(outerClass, block, token, cursor) {
    return (
      outerClass ||
      (this.checkConflicted(block, token, cursor) ? CLASS_OR_ID.AG_GRAY : CLASS_OR_ID.AG_HIDE)
    )
  }

  getHighlightClassName(active) {
    return active ? CLASS_OR_ID.AG_HIGHLIGHT : CLASS_OR_ID.AG_SELECTION
  }

  getSelector(block, activeBlocks) {
    const { cursor, selectedBlock } = this.muya.contentState
    const type = block.type === 'hr' ? 'p' : block.type
    // START_BLOCK_RENDER_SELECTOR_CURSOR_GUARD
    const cursorKey = cursor?.start?.key
    const isActive = activeBlocks.some((b) => b.key === block.key) || block.key === cursorKey
    // END_BLOCK_RENDER_SELECTOR_CURSOR_GUARD

    let selector = `${type}#${block.key}.${CLASS_OR_ID.AG_PARAGRAPH}`
    if (isActive) {
      selector += `.${CLASS_OR_ID.AG_ACTIVE}`
    }
    if (type === 'span') {
      selector += `.ag-${camelToSnake(block.functionType)}`
    }
    if (!block.parent && selectedBlock && block.key === selectedBlock.key) {
      selector += `.${CLASS_OR_ID.AG_SELECTED}`
    }
    return selector
  }

  // START_BLOCK_PELE_DISPATCH
  // Drains the peleCache queued by renderLeafBlock into the resilient
  // pipeline (C-34 R2.1 contract, C-55 pele engine): code-only LRU cache,
  // keep-last-good + escaped error text, per-block ~250 ms debounce while
  // typing. Log markers
  // [Muya][renderPele][BLOCK_PELE_CACHE_HIT|RENDER|ERROR] live in
  // pelePipeline.js.
  async renderPele() {
    if (this.peleCache.size) {
      const entries = [...this.peleCache.entries()]
      this.peleCache.clear()
      await this.pelePipeline.render(entries)
    }
  }
  // END_BLOCK_PELE_DISPATCH

  // The error text names the fence that failed (vega-lite used to say
  // "Sequence").
  async renderDiagram() {
    const cache = this.diagramCache
    if (cache.size) {
      const RENDER_MAP = {
        flowchart: await loadRenderer('flowchart'),
        sequence: await loadRenderer('sequence'),
        plantuml: await loadRenderer('plantuml'),
        'vega-lite': await loadRenderer('vega-lite')
      }

      // START_BLOCK_DIAGRAM_THEME_OPTIONS
      // C-51 T-005 (R-3): the diagram renderers get their colours/fonts
      // from the ACTIVE APP THEME, read at render time from the document's
      // CSS variables — the same tokens and categorical palette Mermaid
      // uses (contentTheme.js). A theme switch re-renders through the
      // setOptions(_, true) full-render path that re-queues every diagram
      // block, so the tokens read here are always the live ones. The
      // vega config is passed as embed opts.config: the user's own
      // spec.config wins (vega-embed merges spec.config over it).
      const tokens = readActiveThemeTokens()
      console.debug('[Muya][renderDiagram][BLOCK_DIAGRAM_THEME] themed render', {
        themeSignature: diagramThemeSignature(tokens),
        blocks: cache.size
      })
      const themedOptions = (functionType) => {
        const options = {}
        if (functionType === 'sequence') {
          Object.assign(options, buildSequenceThemeOptions(tokens, this.muya.options.sequenceTheme))
        } else if (functionType === 'flowchart') {
          Object.assign(options, buildFlowchartThemeOptions(tokens))
        } else if (functionType === 'vega-lite') {
          Object.assign(options, {
            actions: false,
            tooltip: false,
            renderer: 'svg',
            config: buildVegaThemeConfig(tokens)
          })
        }
        return options
      }
      // END_BLOCK_DIAGRAM_THEME_OPTIONS

      // Take the queue before the first await: a second renderDiagram call
      // while vega is still embedding used to re-render the same blocks, and
      // js-sequence (async font load) then drew two SVGs into one block.
      const entries = [...cache.entries()]
      cache.clear()
      for (const [key, value] of entries) {
        const target = document.querySelector(key)
        if (!target) {
          continue
        }
        const { code, functionType } = value
        const render = RENDER_MAP[functionType]
        const options = themedOptions(functionType)
        try {
          if (functionType === 'flowchart' || functionType === 'sequence') {
            const diagram = render.parse(code)
            target.innerHTML = ''
            diagram.drawSVG(target, options)
            if (functionType === 'sequence') {
              // js-sequence hard-codes #000/#fff — repaint from the tokens.
              applySequenceThemeWhenDrawn(target, tokens)
            }
          } else if (functionType === 'plantuml') {
            const diagram = render.parse(code)
            target.innerHTML = ''
            diagram.insertImgElement(target)
          } else if (functionType === 'vega-lite') {
            await render(key, JSON.parse(code), options)
          }
        } catch (err) {
          target.innerHTML = `< Invalid ${DIAGRAM_ERROR_LABEL[functionType] || 'Diagram'} Codes >`
          target.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
        }
        // C-51 T-010: the just-drawn size decides the expand need. The
        // insert may have been awaited (vega embed) — re-resolve so the
        // verdict lands on the live figure, not a re-patched-away one.
        updateFigureExpandNeed(document.querySelector(key) || target)
      }
    }
  }

  // START_BLOCK_TABLE_SCROLL_KEEP
  // C-39 T-001: every render replaces the table's DOM, which resets the
  // horizontal scroll of its div.ag-table-scroll wrapper — typing in a
  // scrolled wide table jumped back to the first column on each key.
  // Remember scrollLeft per table id before the DOM swap, restore after.
  saveTableScroll() {
    const positions = new Map()
    for (const wrapper of document.querySelectorAll('div.ag-table-scroll')) {
      const table = wrapper.firstElementChild
      if (table && table.id && wrapper.scrollLeft) {
        positions.set(table.id, wrapper.scrollLeft)
      }
    }
    return positions
  }

  restoreTableScroll(positions) {
    for (const [id, left] of positions) {
      const table = document.getElementById(id)
      const wrapper = table && table.parentElement
      if (wrapper && wrapper.classList.contains('ag-table-scroll')) {
        wrapper.scrollLeft = left
      }
    }
  }
  // END_BLOCK_TABLE_SCROLL_KEEP

  // START_BLOCK_TABLE_WIDTHS_KEEP
  // C-39 T-002: re-apply session table column widths after the DOM swap.
  // The widths themselves are rendered into the table vnode (colgroup, see
  // renderContainerBlock START_BLOCK_TABLE_COLUMN_WIDTHS), so this pass
  // only reconciles tables whose column count changed since their widths
  // were stored (added columns get their measured auto width, removed
  // columns drop out — widths for surviving columns keep their index) and
  // re-applies widths a hidden render could not measure. Runs right next
  // to the T-001 scroll restore in every render path.
  applyTableColumnWidths() {
    const { tableResize } = this.muya
    if (tableResize && typeof tableResize.reconcileAfterRender === 'function') {
      tableResize.reconcileAfterRender()
    }
  }
  // END_BLOCK_TABLE_WIDTHS_KEEP

  render(blocks, activeBlocks, matches) {
    const selector = `div#${CLASS_OR_ID.AG_EDITOR_ID}`
    const t = this.muya.options.t || ((key) => key) // 获取翻译函数，如果没有则返回原始键值
    const children = blocks.map((block) => {
      return this.renderBlock(null, block, activeBlocks, matches, true, t)
    })
    const newVdom = h(selector, children)
    const rootDom = document.querySelector(selector) || this.container
    const oldVdom = toVNode(rootDom)

    const tableScroll = this.saveTableScroll()
    patch(oldVdom, newVdom)
    this.restoreTableScroll(tableScroll)
    this.applyTableColumnWidths()
    this.renderPele()
    this.renderDiagram()
    // C-51 T-010: tables and new figures are in the DOM now — evaluate
    // (over the LIVE editor root: stateRender.container is the initial
    // child that the first snabbdom patch replaces, i.e. detached)
    // their expand need (diagram previews follow via the pipeline hooks).
    syncExpandNeed((this.muya && this.muya.container) || this.container)
    this.codeCache.clear()
  }

  // Only render the blocks which you updated
  partialRender(blocks, activeBlocks, matches, startKey, endKey) {
    const cursorOutMostBlock = activeBlocks[activeBlocks.length - 1]
    // If cursor is not in render blocks, need to render cursor block independently
    const needRenderCursorBlock = blocks.indexOf(cursorOutMostBlock) === -1
    const t = this.muya.options.t || ((key) => key) // 获取翻译函数，如果没有则返回原始键值
    const newVnode = h(
      'section',
      blocks.map((block) => this.renderBlock(null, block, activeBlocks, matches, false, t))
    )
    const html = toHTML(newVnode).replace(/^<section>([\s\S]+?)<\/section>$/, '$1')

    const needToRemoved = []
    const firstOldDom = startKey
      ? document.querySelector(`#${startKey}`)
      : document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`).firstElementChild
    if (!firstOldDom) {
      // TODO@Jocs Just for fix #541, Because I'll rewrite block and render method, it will nolonger have this issue.
      return
    }
    const tableScroll = this.saveTableScroll()
    needToRemoved.push(firstOldDom)
    let nextSibling = firstOldDom.nextElementSibling
    while (nextSibling && nextSibling.id !== endKey) {
      needToRemoved.push(nextSibling)
      nextSibling = nextSibling.nextElementSibling
    }
    nextSibling && needToRemoved.push(nextSibling)

    firstOldDom.insertAdjacentHTML('beforebegin', html)

    Array.from(needToRemoved).forEach((dom) => dom.remove())

    // Render cursor block independently
    if (needRenderCursorBlock) {
      const { key } = cursorOutMostBlock
      const cursorDom = document.querySelector(`#${key}`)
      if (cursorDom) {
        const oldCursorVnode = toVNode(cursorDom)
        const newCursorVnode = this.renderBlock(
          null,
          cursorOutMostBlock,
          activeBlocks,
          matches,
          false,
          t
        )
        patch(oldCursorVnode, newCursorVnode)
      }
    }
    this.restoreTableScroll(tableScroll)
    this.applyTableColumnWidths()

    this.renderPele()
    this.renderDiagram()
    // C-51 T-010 (see render()): re-evaluate the figures this pass touched.
    syncExpandNeed((this.muya && this.muya.container) || this.container)
    this.codeCache.clear()
  }

  /**
   * Only render one block.
   *
   * @param {object} block
   * @param {array} activeBlocks
   * @param {array} matches
   */
  singleRender(block, activeBlocks, matches) {
    const selector = `#${block.key}`
    const t = this.muya.options.t || ((key) => key) // 获取翻译函数，如果没有则返回原始键值
    const newVdom = this.renderBlock(null, block, activeBlocks, matches, true, t)
    const rootDom = document.querySelector(selector)
    const oldVdom = toVNode(rootDom)
    const tableScroll = this.saveTableScroll()
    patch(oldVdom, newVdom)
    this.restoreTableScroll(tableScroll)
    this.applyTableColumnWidths()
    this.renderPele()
    this.renderDiagram()
    // C-51 T-010 (see render()): re-evaluate the figures this pass touched.
    syncExpandNeed((this.muya && this.muya.container) || this.container)
    this.codeCache.clear()
  }

  invalidateImageCache() {
    this.loadImageMap.forEach((imageInfo, key) => {
      imageInfo.touchMsec = Date.now()
      this.loadImageMap.set(key, imageInfo)
    })
  }
}

mixins(StateRender, renderInlines, renderBlock)

export default StateRender
