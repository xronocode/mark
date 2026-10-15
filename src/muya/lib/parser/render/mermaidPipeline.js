// FILE: src/muya/lib/parser/render/mermaidPipeline.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Resilient Mermaid render pipeline (C-34 R2.1) — LRU SVG cache keyed by code+theme hash, keep-last-good rendering with escaped error text, per-block ~250 ms debounce while typing, unique render ids from a module counter, WKWebView CSP style hoisting, and C-49 fontSize-proportional diagram scaling via the --mark-zoom custom property.
//   SCOPE: createMermaidPipeline factory plus cache/LRU, hash, debounce, insert (incl. natural-width capture), error, and orphan-cleanup helpers; targets are resolved by selector at each flush so re-patched DOM is always current.
//   DEPENDS: muya/lib/renderers (loadRenderer, injectable), muya/lib/config (CLASS_OR_ID).
//   LINKS: .grace/changes/active/C-34 R2.1; .grace/changes/active/C-49 R-1; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-9.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createMermaidPipeline - builds a pipeline { render(entries), flushPending(), destroy() } with injectable loadRenderer/getTheme/debounceDelayMs for tests.
//   MERMAID_PREVIEW_CLASS - CSS hook class ("ag-mermaid-preview") added to a container that currently shows a mermaid SVG (scopes natural-size CSS).
//   MERMAID_ERROR_CLASS - CSS class ("ag-mermaid-error") of the small error element rendered below a kept-last-good diagram.
//   MERMAID_NATURAL_WIDTH_ATTR - SVG attribute ("data-natural-width") carrying the diagram's natural pixel width for C-49 zoom scaling.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-15 C-49: diagrams scale with the editor font size — every inserted SVG records its natural width (data-natural-width, from mermaid's inline max-width / width attr / viewBox) and gets an inline max-width: calc(var(--mark-zoom, 1) × natural px); pages/app.vue maintains --mark-zoom = fontSize / 16 on the document element. All insert paths (first render, cache hit, keep-last-good) run through insertSvg, so each carries the attribute. The fullscreen viewer clone is unaffected (it overrides inline width/height/max-width from the viewBox).
//   v1.1.0 - 2026-10-15 C-34: wide diagrams fit the text column by default (useMaxWidth:true, user decision); natural size lives in the fullscreen viewer.
//   v1.0.0 - 2026-10-15 C-34 R2.1: extracted from StateRender.renderMermaid; added LRU code+theme SVG cache, keep-last-good + escaped mermaid error text, orphan error-element cleanup, per-block trailing debounce, counter-based unique render ids, and useMaxWidth:false initialization for natural-size diagrams.
// END_CHANGE_SUMMARY

import loadRenderer from '../../renderers'
import { CLASS_OR_ID } from '../../config'

export const MERMAID_PREVIEW_CLASS = 'ag-mermaid-preview'
export const MERMAID_ERROR_CLASS = 'ag-mermaid-error'
export const MERMAID_NATURAL_WIDTH_ATTR = 'data-natural-width'

// START_BLOCK_MERMAID_FIT_COLUMN_CONFIG
// User decision 2026-10-15 (replaces the R2.1 natural-size default): wide
// diagrams fit the text column — useMaxWidth:true renders the SVG at
// width:100% with max-width = its natural width, so narrow diagrams keep
// their size and wide ones scale down; the fullscreen block viewer shows
// the natural size. Every diagram config extends BaseDiagramConfig
// (useMaxWidth), so this is one flat config per diagram type.
const FIT_COLUMN_KEYS = [
  'flowchart', 'sequence', 'gantt', 'journey', 'timeline', 'class', 'state',
  'er', 'pie', 'quadrantChart', 'xyChart', 'requirement', 'architecture',
  'mindmap', 'ishikawa', 'kanban', 'gitGraph', 'c4', 'sankey', 'packet',
  'block', 'treeView', 'radar', 'venn'
]

const buildFitColumnConfig = () => {
  const config = {}
  for (const key of FIT_COLUMN_KEYS) {
    config[key] = { useMaxWidth: true }
  }
  return config
}
// END_BLOCK_MERMAID_FIT_COLUMN_CONFIG

// START_BLOCK_MERMAID_CACHE_KEY
// djb2 hash: fast, synchronous, collision-safe for a ~50-entry cache when
// combined with the code length.
const hashMermaidCode = (str) => {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

const makeCacheKey = (theme, code) => `${theme}:${hashMermaidCode(code)}:${code.length}`
// END_BLOCK_MERMAID_CACHE_KEY

// START_BLOCK_MERMAID_LRU
// Map preserves insertion order: delete+set bumps recency, the first key is
// the least recently used entry to evict.
class LruCache {
  constructor(maxEntries) {
    this.maxEntries = maxEntries
    this.store = new Map()
  }

  has(key) {
    return this.store.has(key)
  }

  get(key) {
    if (!this.store.has(key)) {
      return undefined
    }
    const value = this.store.get(key)
    this.store.delete(key)
    this.store.set(key, value)
    return value
  }

  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key)
    }
    this.store.set(key, value)
    while (this.store.size > this.maxEntries) {
      this.store.delete(this.store.keys().next().value)
    }
  }
}
// END_BLOCK_MERMAID_LRU

// Render ids must stay unique per mermaid.render call; Date.now() alone
// collides when two diagrams render inside the same millisecond.
let renderIdCounter = 0

// START_BLOCK_MERMAID_ORPHAN_CLEANUP
// mermaid.render() (v11) builds its scratch markup in document.body inside
// div#d<id> and only removes it on success — a parse/draw error leaves the
// div (with the error-diagram svg#<id>) behind. Only ever touch elements
// that are direct children of body so the live diagram is never removed.
const removeOrphanErrorElements = (id) => {
  if (typeof document === 'undefined') {
    return
  }
  for (const orphanId of [`d${id}`, id]) {
    const el = document.getElementById(orphanId)
    if (el && el.parentElement === document.body) {
      el.remove()
    }
  }
}
// END_BLOCK_MERMAID_ORPHAN_CLEANUP

/**
 * Create a mermaid render pipeline.
 *
 * @param {object} [options]
 * @param {Function} [options.loadRenderer] async renderer loader (injectable for tests)
 * @param {Function} [options.getTheme] returns 'dark' | 'default' (injectable for tests)
 * @param {number} [options.debounceDelayMs=250] quiet window while typing (overridable post-hoc via pipeline.debounceDelayMs)
 * @param {number} [options.maxCacheEntries=50] LRU bound of the code+theme SVG cache
 * @returns {{ render: Function, flushPending: Function, destroy: Function, debounceDelayMs: number }}
 */
export const createMermaidPipeline = ({
  loadRenderer: load = loadRenderer,
  getTheme = () =>
    typeof document !== 'undefined' && document.body.classList.contains('dark')
      ? 'dark'
      : 'default',
  debounceDelayMs = 250,
  maxCacheEntries = 50
} = {}) => {
  const svgCache = new LruCache(maxCacheEntries)
  // blockKey -> { code, svg } of the last successful render per diagram block
  const lastGood = new Map()
  // blockKey -> { entry, timer } of the debounced re-render in flight
  const pending = new Map()
  let mermaidModule = null

  const loadMermaid = async () => {
    if (!mermaidModule) {
      mermaidModule = await load('mermaid')
    }
    return mermaidModule
  }

  // START_BLOCK_MERMAID_NATURAL_WIDTH
  // C-49: previews scale with the editor font size. useMaxWidth:true makes
  // mermaid emit width="100%" plus an inline max-width equal to the
  // diagram's natural width; capture that natural width on the SVG
  // (data-natural-width) and replace the inline max-width with
  // calc(var(--mark-zoom, 1) * <natural>px). --mark-zoom (fontSize / 16) is
  // maintained by pages/app.vue on the document element, so the diagram —
  // and its labels, which scale with the viewBox — grows with the editor
  // zoom while width:100% still keeps it inside the text column. The
  // fullscreen block viewer clone is unaffected: it overrides the inline
  // width/height/max-width from the viewBox (blockViewer/index.js).
  const parsePx = (str) => {
    if (!str) return 0
    const match = /([\d.]+)\s*px/.exec(String(str))
    if (!match) return 0
    const n = Number.parseFloat(match[1])
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  const extractNaturalWidth = (svg) => {
    const existing = parsePx(svg.getAttribute(MERMAID_NATURAL_WIDTH_ATTR) + 'px')
    if (existing > 0) return existing
    // A previously-scaled cached SVG carries its own calc() max-width — the
    // attribute check above already caught that case; a fresh mermaid SVG
    // carries "max-width: NNNpx".
    const inline = parsePx(svg.style && svg.style.maxWidth)
    if (inline > 0) return inline
    const attrWidth = parsePx(svg.getAttribute('width') + 'px')
    if (attrWidth > 0) return attrWidth
    const viewBox = svg.viewBox && svg.viewBox.baseVal
    return viewBox && viewBox.width > 0 ? viewBox.width : 0
  }

  const applyZoomableMaxWidth = (svg) => {
    if (!svg || !svg.style) return
    const natural = extractNaturalWidth(svg)
    if (natural <= 0) return
    svg.setAttribute(MERMAID_NATURAL_WIDTH_ATTR, String(natural))
    svg.style.maxWidth = `calc(var(--mark-zoom, 1) * ${natural}px)`
  }
  // END_BLOCK_MERMAID_NATURAL_WIDTH

  // START_BLOCK_MERMAID_INSERT
  const insertSvg = (target, svg) => {
    target.innerHTML = svg
    // Hoist <style> out of the SVG for WKWebView CSP compatibility.
    // WKWebView blocks <style> inside dynamically-inserted SVGs even
    // with 'unsafe-inline'. Mermaid scopes rules by SVG ID so they
    // still apply from the parent container.
    const svgStyle = target.querySelector('svg > style')
    if (svgStyle) {
      target.insertBefore(svgStyle, target.firstChild)
    }
    applyZoomableMaxWidth(target.querySelector('svg'))
    target.classList.add(MERMAID_PREVIEW_CLASS)
    target.classList.remove(CLASS_OR_ID.AG_MATH_ERROR)
  }
  // END_BLOCK_MERMAID_INSERT

  const clearError = (target) => {
    const errorEl = target.querySelector(`.${MERMAID_ERROR_CLASS}`)
    if (errorEl) {
      errorEl.remove()
    }
  }

  // The mermaid message goes in via textContent only — never innerHTML.
  const showError = (target, err) => {
    let errorEl = target.querySelector(`.${MERMAID_ERROR_CLASS}`)
    if (!errorEl) {
      errorEl = document.createElement('div')
      errorEl.className = MERMAID_ERROR_CLASS
      target.appendChild(errorEl)
    }
    errorEl.textContent =
      err && err.message ? String(err.message) : 'Mermaid render error'
  }

  // START_BLOCK_MERMAID_CACHE_HIT
  const applyCacheHit = (target, blockKey, code, cacheKey) => {
    const svg = svgCache.get(cacheKey)
    insertSvg(target, svg)
    lastGood.set(blockKey, { code, svg })
    console.debug('[Muya][renderMermaid][BLOCK_MERMAID_CACHE_HIT] reuse cached svg', {
      blockKey,
      cacheKey
    })
  }
  // END_BLOCK_MERMAID_CACHE_HIT

  // START_BLOCK_MERMAID_RENDER
  const renderOne = async (mermaid, entry) => {
    const { selector, blockKey, code, theme, cacheKey } = entry
    // Re-resolve the target: snabbdom may have re-patched the preview div
    // while mermaid.render was awaited for another entry.
    const target = document.querySelector(selector)
    if (!target) {
      return
    }
    const id = `mermaid-${blockKey.replace(/[^a-zA-Z0-9_-]/g, '-')}-${++renderIdCounter}`
    try {
      const { svg, bindFunctions } = await mermaid.render(id, code)
      const liveTarget = document.querySelector(selector) || target
      insertSvg(liveTarget, svg)
      clearError(liveTarget)
      svgCache.set(cacheKey, svg)
      lastGood.set(blockKey, { code, svg })
      if (bindFunctions) {
        bindFunctions(liveTarget)
      }
      console.debug('[Muya][renderMermaid][BLOCK_MERMAID_RENDER] rendered svg', {
        blockKey,
        cacheKey,
        renderId: id
      })
    } catch (err) {
      // START_BLOCK_MERMAID_ERROR
      removeOrphanErrorElements(id)
      const good = lastGood.get(blockKey)
      const liveTarget = document.querySelector(selector) || target
      if (good) {
        // Keep the last successful SVG visible and report the error below it.
        insertSvg(liveTarget, good.svg)
      } else {
        liveTarget.textContent = ''
        liveTarget.classList.remove(MERMAID_PREVIEW_CLASS)
        liveTarget.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
      }
      showError(liveTarget, err)
      console.warn('[Muya][renderMermaid][BLOCK_MERMAID_ERROR] mermaid render failed', {
        blockKey,
        renderId: id,
        message: err && err.message
      })
      // END_BLOCK_MERMAID_ERROR
    }
  }
  // END_BLOCK_MERMAID_RENDER

  const renderBatch = async (entries) => {
    const todo = []
    for (const entry of entries) {
      const target = document.querySelector(entry.selector)
      if (!target) {
        continue
      }
      const theme = getTheme()
      const cacheKey = makeCacheKey(theme, entry.code)
      // Another block in the same flush may have populated the cache.
      if (svgCache.has(cacheKey)) {
        applyCacheHit(target, entry.blockKey, entry.code, cacheKey)
        continue
      }
      todo.push({ ...entry, theme, cacheKey })
    }
    if (!todo.length) {
      return
    }
    const mermaid = await loadMermaid()
    mermaid.initialize({
      securityLevel: 'strict',
      theme: todo[0].theme,
      ...buildFitColumnConfig()
    })
    for (const entry of todo) {
      await renderOne(mermaid, entry)
    }
  }

  // START_BLOCK_MERMAID_DEBOUNCE
  const cancelPending = (blockKey) => {
    const state = pending.get(blockKey)
    if (state) {
      clearTimeout(state.timer)
      pending.delete(blockKey)
    }
  }

  // Trailing debounce per block: rapid re-requests (typing) collapse into a
  // single render once the input has been quiet for debounceDelayMs.
  const scheduleRender = (entry) => {
    cancelPending(entry.blockKey)
    const timer = setTimeout(() => {
      const state = pending.get(entry.blockKey)
      if (!state) {
        return
      }
      pending.delete(entry.blockKey)
      renderBatch([state.entry])
    }, pipeline.debounceDelayMs)
    pending.set(entry.blockKey, { entry, timer })
  }
  // END_BLOCK_MERMAID_DEBOUNCE

  const pipeline = {
    debounceDelayMs,

    /**
     * Render the entries drained from StateRender.mermaidCache.
     * Cache hits insert the cached SVG synchronously; a first render (no
     * last-good SVG) or a same-code theme switch renders immediately;
     * re-renders of an already-rendered block with changed code (typing)
     * are debounced and keep the last good SVG on screen meanwhile.
     *
     * @param {Array<[string, {code: string, functionType: string}]>} entries
     */
    async render(entries) {
      const immediate = []
      for (const [selector, value] of entries) {
        const { code } = value
        const blockKey = selector.replace(/^#/, '')
        const theme = getTheme()
        const cacheKey = makeCacheKey(theme, code)

        if (svgCache.has(cacheKey)) {
          const target = document.querySelector(selector)
          if (target) {
            cancelPending(blockKey)
            applyCacheHit(target, blockKey, code, cacheKey)
          }
          continue
        }

        const good = lastGood.get(blockKey)
        const target = document.querySelector(selector)
        if (target && good) {
          // Show the last good diagram right away — no "loading" flash and
          // no blank preview if the debounced render later fails.
          insertSvg(target, good.svg)
          clearError(target)
        }
        if (!good || good.code === code) {
          // First render of this block, or unchanged code under a new theme
          // (theme switch): do not delay.
          cancelPending(blockKey)
          immediate.push({ selector, blockKey, code })
        } else {
          scheduleRender({ selector, blockKey, code })
        }
      }
      if (immediate.length) {
        await renderBatch(immediate)
      }
    },

    /** Cancel and drop all debounced re-renders (editor teardown/tests). */
    flushPending() {
      for (const [blockKey] of pending) {
        cancelPending(blockKey)
      }
    },

    destroy() {
      pipeline.flushPending()
      svgCache.store.clear()
      lastGood.clear()
    }
  }

  return pipeline
}
