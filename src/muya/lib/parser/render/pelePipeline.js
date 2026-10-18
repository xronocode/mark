// FILE: src/muya/lib/parser/render/pelePipeline.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Resilient pele render pipeline (C-55) — replaces mermaidPipeline.js after the mermaid→pele hard cut. Synchronous DOM-free pele renders through a code-only LRU SVG cache (colors live in the --pele-* CSS variables, so a theme switch recolors every diagram with ZERO re-renders), keep-last-good rendering with escaped error text, per-block ~250 ms debounce while typing, counter-unique idPrefixes, C-49 fontSize-proportional scaling via data-natural-width from RenderResult.width, and the C-51 T-010 expand-need re-evaluation after every insert.
//   SCOPE: createPelePipeline factory plus cache/LRU, hash, debounce, insert (incl. natural-width capture and expand-need), and error helpers; targets are resolved by selector at each flush so re-patched DOM is always current. Pele renders without DOM and emits SVG without <style> blocks, so the mermaid-era orphan-cleanup and WKWebView style-hoisting are deliberately gone. C-62: Apply local appearance on every raw SVG insertion and reject superseded async requests.
//   DEPENDS: muya/lib/renderers (loadRenderer, injectable), muya/lib/config (CLASS_OR_ID), ./diagramTheme (readActiveThemeTokens — FONT ONLY, measurement must match the displayed --pele-font), ./peleOptions (buildPeleRenderOptions), ./renderBlock/expandNeed (updateFigureExpandNeed after every insert).; ../../utils/diagramAppearance.
//   LINKS: .grace/changes/archive/C-55 R-2/R-4; .grace/changes/archive/C-34 R2.1 (resilience contract), C-49 (zoom), C-51 T-003/T-004 (theming, now CSS variables) and T-010 (expand-need); .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.; .grace/changes/archive/C-62.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createPelePipeline - builds a pipeline { render(entries), flushPending(), destroy() } with injectable loader/theme/debounce and appearance callbacks; raw SVG cache excludes Mark mode comments, colors apply per insertion, superseded pending requests are ignored.
//   PELE_PREVIEW_CLASS - CSS hook class ("ag-pele-preview") added to a container that currently shows a pele SVG (scopes natural-size CSS).
//   PELE_ERROR_CLASS - CSS class ("ag-pele-error") of the small error element rendered below a kept-last-good diagram.
//   PELE_NATURAL_WIDTH_ATTR - SVG attribute ("data-natural-width") carrying the diagram's natural pixel width for C-49 zoom scaling.
//   DONUT_HOLE - C-51 Keynote donut: hole radius as a fraction of the pie radius (kept from the mermaid era).
//   postProcessPeleSvg - rendered SVG + type → SVG with the Keynote donut hole for pie (panel-coloured via var(--pele-bg), recolors with the theme).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-18 C-62: local appearance on every insert; mode-only cache reuse, read-only overrides and latest-request guards.
//   PREV: v1.0.0 - 2026-10-17 C-55: first version, ported from
//   mermaidPipeline.js v2.1.0. What carried over verbatim: the resilience
//   contract (keep-last-good, debounce, LRU, unique render ids, expand-need
//   sync, C-49 zoomable max-width). What changed with pele: the render is
//   synchronous and DOM-free (no orphan scratch cleanup), the SVG carries
//   no <style> block (no WKWebView CSP hoisting), the theme left the cache
//   key ENTIRELY (colors resolve through the --pele-* CSS variables at
//   display time — theme switches are cache hits, the C-54 bug class is
//   structurally gone), natural width comes from RenderResult.width, and
//   per-type sizing rides peleOptions instead of mermaid.initialize, and
//   the C-51 Keynote pie donut survives as postProcessPeleSvg (a
//   var(--pele-bg) hole painted after the slices).
// END_CHANGE_SUMMARY

import loadRenderer from '../../renderers'
import { CLASS_OR_ID } from '../../config'
import { readActiveThemeTokens } from './diagramTheme'
import { buildPeleRenderOptions } from './peleOptions'
import { updateFigureExpandNeed } from './renderBlock/expandNeed'
import { applyDiagramAppearance, stripDiagramAppearance } from '../../utils/diagramAppearance'

export const PELE_PREVIEW_CLASS = 'ag-pele-preview'
export const PELE_ERROR_CLASS = 'ag-pele-error'
export const PELE_NATURAL_WIDTH_ATTR = 'data-natural-width'

// START_BLOCK_PELE_CACHE_KEY
// djb2 hash: fast, synchronous, collision-safe for a ~50-entry cache when
// combined with the code length. CODE ONLY — the theme is deliberately
// absent: pele SVGs resolve their colours through the --pele-* CSS
// variables at display time, so a theme switch recolors cached SVGs and
// must NOT miss (corner-2).
const hashPeleCode = (str) => {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

const makeCacheKey = (code) => {
  const source = stripDiagramAppearance(code)
  return `${hashPeleCode(source)}:${source.length}`
}
// END_BLOCK_PELE_CACHE_KEY

// START_BLOCK_PELE_LRU
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
// END_BLOCK_PELE_LRU

// START_BLOCK_PELE_DONUT
// C-51 Keynote-style donut (user 2026-10-16: «думаю да» — on by default;
// Markdown has no place to store a per-diagram choice), ported from the
// mermaid-era post-pass: pele draws plain pies, so a hole of DONUT_HOLE ×
// radius goes in AFTER the slice paths (paint order) inside the
// pele-slices group. The fill resolves var(--pele-bg) — the diagram panel
// — so the hole recolors with the theme like the rest of the SVG. The
// inert pieOuterCircle marker carries the outer radius for verifiers.
export const DONUT_HOLE = 0.56

export const postProcessPeleSvg = (svg, type) => {
  if (typeof svg !== 'string' || type !== 'pie') return svg
  if (/class="pieDonutHole"/.test(svg)) return svg
  const group = /<g class="pele-slices"[^>]*>/.exec(svg)
  const arc = /<path class="pele-slice"[^>]*d="M[^"]*?A([\d.]+),/.exec(svg)
  if (!group || !arc) return svg
  const outer = Number(arc[1])
  if (!Number.isFinite(outer) || outer <= 0) return svg
  const closeIdx = svg.indexOf('</g>', group.index)
  if (closeIdx < 0) return svg
  const hole =
    `<circle class="pieDonutHole" r="${(outer * DONUT_HOLE).toFixed(1)}" fill="var(--pele-bg)" stroke="none"></circle>` +
    `<circle class="pieOuterCircle" r="${outer}" fill="none" stroke="none" pointer-events="none"></circle>`
  return svg.slice(0, closeIdx) + hole + svg.slice(closeIdx)
}
// END_BLOCK_PELE_DONUT

// idPrefixes must stay unique per pele render call; Date.now() alone
// collides when two diagrams render inside the same millisecond.
let renderIdCounter = 0

/**
 * Create a pele render pipeline.
 *
 * @param {object} [options]
 * @param {Function} [options.loadRenderer] async renderer loader (injectable for tests)
 * @param {Function} [options.getThemeTokens] returns the active theme tokens (readActiveThemeTokens shape; injectable for tests — used ONLY for the measurement font)
 * @param {number} [options.debounceDelayMs=250] quiet window while typing (overridable post-hoc via pipeline.debounceDelayMs)
 * @param {number} [options.maxCacheEntries=50] LRU bound of the code-only SVG cache
 * @param {Function} [options.getAppearanceOverride] temporary read-only mode for the target/source pair
 * @param {Function} [options.onInsert] synchronize the owning figure controls after insertion
 * @param {Function} [options.resolveTarget] resolve a preview within its owning editor, excluding viewer clones
 * @returns {{ render: Function, flushPending: Function, destroy: Function, debounceDelayMs: number }}
 */
export const createPelePipeline = ({
  loadRenderer: load = loadRenderer,
  getThemeTokens = readActiveThemeTokens,
  debounceDelayMs = 250,
  maxCacheEntries = 50,
  getAppearanceOverride = () => undefined,
  onInsert = () => {},
  resolveTarget = selector => document.querySelector(selector)
} = {}) => {
  // cacheKey -> { svg, width } — the width rides the cache so a cache hit
  // can re-apply the C-49 zoomable max-width without re-parsing.
  const svgCache = new LruCache(maxCacheEntries)
  // blockKey -> { code, svg, width } of the last successful render per block
  const lastGood = new Map()
  // blockKey -> { entry, timer } of the debounced re-render in flight
  const pending = new Map()
  const latest = new Map()
  let peleModule = null

  const loadPele = async () => {
    if (!peleModule) {
      peleModule = await load('pele')
    }
    return peleModule
  }

  // START_BLOCK_PELE_NATURAL_WIDTH
  // C-49: previews scale with the editor font size. pele emits
  // width="<natural>" + style max-width:100%;height:auto — the same shape
  // mermaid's useMaxWidth produced. Capture the natural width
  // (RenderResult.width — the layout-exact value; attribute parse as the
  // fallback), record it on the SVG (data-natural-width), switch the width
  // attribute to 100% and replace the inline max-width with
  // calc(var(--mark-zoom, 1) * <natural>px). --mark-zoom (fontSize / 16)
  // is maintained by pages/app.vue on the document element, so the diagram
  // — and its labels, which scale with the viewBox — grows with the editor
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

  const applyZoomableMaxWidth = (svg, naturalWidth) => {
    if (!svg || !svg.style) return
    let natural = Number(naturalWidth)
    if (!Number.isFinite(natural) || natural <= 0) {
      natural = parsePx(svg.getAttribute('width') + 'px')
    }
    if (natural <= 0) {
      const viewBox = svg.viewBox && svg.viewBox.baseVal
      natural = viewBox && viewBox.width > 0 ? viewBox.width : 0
    }
    if (natural <= 0) return
    svg.setAttribute(PELE_NATURAL_WIDTH_ATTR, String(natural))
    svg.setAttribute('width', '100%')
    svg.style.maxWidth = `calc(var(--mark-zoom, 1) * ${natural}px)`
  }
  // END_BLOCK_PELE_NATURAL_WIDTH

  // START_BLOCK_PELE_INSERT
  const insertSvg = (target, svg, naturalWidth, code) => {
    target.innerHTML = svg
    // pele SVGs carry no <style> blocks — the WKWebView CSP hoisting the
    // mermaid pipeline needed is gone by construction.
    applyZoomableMaxWidth(target.querySelector('svg'), naturalWidth)
    target.classList.add(PELE_PREVIEW_CLASS)
    target.classList.remove(CLASS_OR_ID.AG_MATH_ERROR)
    applyDiagramAppearance(target, code, getAppearanceOverride(target, code))
    onInsert(target)
    // C-51 T-010: the just-inserted size decides whether the figure
    // benefits from the fullscreen viewer (scaled/tall → the
    // ag-expand-needed class that shows the expand button).
    updateFigureExpandNeed(target)
  }
  // END_BLOCK_PELE_INSERT

  const clearError = (target) => {
    const errorEl = target.querySelector(`.${PELE_ERROR_CLASS}`)
    if (errorEl) {
      errorEl.remove()
    }
  }

  // The pele message goes in via textContent only — never innerHTML.
  const showError = (target, err) => {
    let errorEl = target.querySelector(`.${PELE_ERROR_CLASS}`)
    if (!errorEl) {
      errorEl = document.createElement('div')
      errorEl.className = PELE_ERROR_CLASS
      target.appendChild(errorEl)
    }
    errorEl.textContent =
      err && err.message ? String(err.message) : 'Diagram render error'
  }

  // START_BLOCK_PELE_CACHE_HIT
  const applyCacheHit = (target, blockKey, code, cacheKey) => {
    const hit = svgCache.get(cacheKey)
    insertSvg(target, hit.svg, hit.width, code)
    lastGood.set(blockKey, { code, svg: hit.svg, width: hit.width })
    console.debug('[Muya][renderPele][BLOCK_PELE_CACHE_HIT] reuse cached svg', {
      blockKey,
      cacheKey
    })
  }
  // END_BLOCK_PELE_CACHE_HIT

  // START_BLOCK_PELE_RENDER
  const renderOne = (pele, entry) => {
    const { selector, blockKey, code, cacheKey, tokens } = entry
    if (latest.get(blockKey) !== code) return
    // Re-resolve the target: snabbdom may have re-patched the preview div
    // between the drain and this render.
    const target = resolveTarget(selector)
    if (!target) {
      return
    }
    const idPrefix = `pele-${blockKey.replace(/[^a-zA-Z0-9_-]/g, '-')}-${++renderIdCounter}`
    try {
      const type = pele.detectType(code)
      const rendered = pele.render(code, {
        idPrefix,
        ...buildPeleRenderOptions(type, tokens)
      })
      const svg = postProcessPeleSvg(rendered.svg, rendered.type)
      const liveTarget = resolveTarget(selector) || target
      insertSvg(liveTarget, svg, rendered.width, code)
      clearError(liveTarget)
      svgCache.set(cacheKey, { svg, width: rendered.width })
      lastGood.set(blockKey, { code, svg, width: rendered.width })
      console.debug('[Muya][renderPele][BLOCK_PELE_RENDER] rendered svg', {
        blockKey,
        cacheKey,
        renderId: idPrefix,
        type: rendered.type
      })
    } catch (err) {
      // START_BLOCK_PELE_ERROR
      // PeleError {code: 'unsupported-diagram'|'syntax'|'semantic'|'limit',
      // line, column, snippet} maps onto the same keep-last-good UX the
      // mermaid pipeline had. pele renders without touching the DOM, so
      // there is no orphan scratch element to clean up.
      const good = lastGood.get(blockKey)
      const liveTarget = resolveTarget(selector) || target
      if (good) {
        // Keep the last successful SVG visible and report the error below it.
        insertSvg(liveTarget, good.svg, good.width, code)
      } else {
        liveTarget.textContent = ''
        liveTarget.classList.remove(PELE_PREVIEW_CLASS)
        liveTarget.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
      }
      showError(liveTarget, err)
      console.warn('[Muya][renderPele][BLOCK_PELE_ERROR] pele render failed', {
        blockKey,
        renderId: idPrefix,
        peleErrorCode: err && err.code,
        message: err && err.message
      })
      // END_BLOCK_PELE_ERROR
    }
  }
  // END_BLOCK_PELE_RENDER

  const renderBatch = async (entries) => {
    // The tokens carry ONLY the measurement font into the render — every
    // colour resolves through the --pele-* CSS variables at display time.
    const tokens = getThemeTokens()
    const todo = []
    for (const entry of entries) {
      const target = resolveTarget(entry.selector)
      if (!target) {
        continue
      }
      const cacheKey = makeCacheKey(entry.code)
      // Another block in the same flush may have populated the cache.
      if (svgCache.has(cacheKey)) {
        applyCacheHit(target, entry.blockKey, entry.code, cacheKey)
        continue
      }
      todo.push({ ...entry, tokens, cacheKey })
    }
    if (!todo.length) {
      return
    }
    const pele = await loadPele()
    for (const entry of todo) {
      renderOne(pele, entry)
    }
  }

  // START_BLOCK_PELE_DEBOUNCE
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
  // END_BLOCK_PELE_DEBOUNCE

  const pipeline = {
    debounceDelayMs,

    /**
     * Render the entries drained from StateRender.peleCache.
     * Cache hits insert the cached SVG synchronously; a first render (no
     * last-good SVG) renders immediately; re-renders of an already-rendered
     * block with changed code (typing) are debounced and keep the last good
     * SVG on screen meanwhile. A theme switch re-enters here with unchanged
     * code — a pure cache hit, because colors live in the CSS variables.
     *
     * @param {Array<[string, {code: string, functionType: string}]>} entries
     */
    async render(entries) {
      const immediate = []
      for (const [selector, value] of entries) {
        const { code } = value
        const blockKey = selector.replace(/^#/, '')
        latest.set(blockKey, code)
        const cacheKey = makeCacheKey(code)

        if (svgCache.has(cacheKey)) {
          const target = resolveTarget(selector)
          if (target) {
            cancelPending(blockKey)
            applyCacheHit(target, blockKey, code, cacheKey)
          }
          continue
        }

        const good = lastGood.get(blockKey)
        const target = resolveTarget(selector)
        if (target && good) {
          // Show the last good diagram right away — no "loading" flash and
          // no blank preview if the debounced render later fails.
          insertSvg(target, good.svg, good.width, code)
          clearError(target)
        }
        if (!good || good.code === code) {
          // First render of this block, or unchanged code after the block
          // was re-queued (e.g. a full re-render): do not delay.
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
      latest.clear()
    }
  }

  return pipeline
}
