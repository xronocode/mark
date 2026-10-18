// FILE: tests/renderer/muya/pele-pipeline.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-55 pele render pipeline (the C-34 R2.1 resilience contract carried onto the pele engine): code-only LRU SVG cache — a theme switch is a CACHE HIT (corner-2: colors live in the --pele-* CSS variables), keep-last-good + escaped PeleError text, per-block ~250 ms debounce, counter-unique idPrefixes, C-49 data-natural-width from RenderResult.width with the --mark-zoom calc max-width, pele.detectType feeding the per-type render options, no <style> hoisting (pele SVGs carry none), and the C-51 T-010 expand-need re-evaluation after every insert.
//   SCOPE: createPelePipeline in src/muya/lib/parser/render/pelePipeline.js and StateRender.renderPele wiring in src/muya/lib/parser/render/index.js.
//   DEPENDS: src/muya/lib/parser/render/pelePipeline.js, src/muya/lib/parser/render/index.js, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-55 R-2/R-4 and the plan's corner-2; .grace/changes/archive/C-34 R2.1 (resilience contract), C-49 (zoom), C-51 T-010 (expand-need); .grace/verification/runtime.xml V-M-012 scenario-9; START_BLOCK_PELE_*.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   GOOD_CODE - fixture diagram source that renders.
//   BAD_CODE - fixture diagram source that makes the fake renderer throw.
//   XSS_MESSAGE - error text whose HTML must never become an element.
//   fakePele - the mocked pele namespace (detectType/render named exports) used by every case.
//   StateRender - real StateRender class imported after the renderer-loader mock.
//   expandNeedMock - hoisted double of renderBlock/expandNeed whose results record the SVG count at call time (insert-order proof).
//   createFakePele - pele module double counting detectType/render calls; render embeds the idPrefix into the SVG so keep-last-good identity is observable.
//   createTarget - a div.ag-container-preview block target appended to body.
//   LIGHT_TOKENS - light theme tokens injected into the pipeline (the measurement font only — the pele colors come from CSS variables).
//   DARK_TOKENS - dark theme tokens (different font) for the theme-switch cache-hit case.
//   makePipeline - pipeline with injected fake loader and theme tokens.
//   createStateRender - real StateRender against the mocked renderer loader (fail-without-fix surface).
//   expandCallsOn - updateFigureExpandNeed calls recorded for one target element.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-17 C-55: ported from
//   mermaid-pipeline.test.js v1.3.0 (git mv). Carried verbatim: first
//   render immediate, LRU bound + eviction, keep-last-good on render
//   error, escaped error textContent, debounce collapse + injectable
//   delay, unique render ids, C-49 data-natural-width + calc max-width on
//   every insert path, StateRender-level cache and keep-last-good wiring.
//   INVERTED by the code-only cache key (corner-2): theme switches — dark
//   flip AND light→light accent change — are now CACHE HITS, asserted as
//   "no second pele.render". REPLACED mermaid-specific pins: initialize
//   themeVariables → pele.detectType feeds buildPeleRenderOptions
//   (fontSize 15 default, 13 for gantt, fontFamily from tokens); WKWebView
//   <style> hoisting → pele inserts the SVG as the first child with no
//   svg>style; orphan scratch cleanup dropped (pele is DOM-free — the fake
//   throws a PeleError with code/line/column). ADDED: cache hit cancels a
//   pending debounced re-render, flushPending drops pending timers,
//   destroy clears the caches and pending timers, width=100% attribute on
//   the zoom rewrite, expand-need re-evaluated after every insert (hoisted
//   module double; jsdom cannot lay out figures, so the double records
//   that the SVG was already inserted when it fired).
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  postProcessPeleSvg,
  DONUT_HOLE,
  createPelePipeline } from 'muya/lib/parser/render/pelePipeline'

const GOOD_CODE = 'graph TD\n    A[Start] --> B{Decision}\n    B --> C[End]'
const BAD_CODE = 'graph TD\n    A[Start --> SYNTAX_ERROR'
const XSS_MESSAGE = '<img src=x onerror=alert(1)>'

// The mocked loader used by every test. Assigned in beforeEach so every
// case gets fresh call counts.
let fakePele

vi.mock('muya/lib/renderers', () => ({
  default: async () => fakePele
}))

// START_BLOCK_PIPELINE_TEST_DOUBLES
// C-51 T-010: the pipeline must re-evaluate the figure expand need after
// EVERY insert. The real module needs laid-out figures (jsdom measures
// 0×0), so a hoisted double records each call's target AND — via its
// return value — how many SVGs the target already contained when the call
// fired, which pins the insert-before-expand-need ordering. render/index.js
// imports syncExpandNeed too, so the double provides the module's other
// exports as no-ops.
const expandNeedMock = vi.hoisted(() => ({
  updateFigureExpandNeed: vi.fn((el) => (el && el.querySelectorAll ? el.querySelectorAll('svg').length : 0))
}))

vi.mock('muya/lib/parser/render/renderBlock/expandNeed', () => ({
  updateFigureExpandNeed: expandNeedMock.updateFigureExpandNeed,
  syncExpandNeed: vi.fn(),
  releaseExpandNeedObservations: vi.fn(),
  diagramNeedRule: vi.fn(() => false),
  tableNeedRule: vi.fn(() => false),
  figureNeedsExpand: vi.fn(() => false)
}))

const createFakePele = () => ({
  // pele's named exports — the pipeline uses the namespace, not a default.
  detectType: vi.fn(() => 'flowchart'),
  render: vi.fn((code, opts) => {
    if (code.includes('SYNTAX_ERROR')) {
      // PeleError shape: an Error with { code, line, column, snippet }.
      // pele renders without touching the DOM, so no orphan element is
      // left behind (the mermaid-era div#d<id> scratch is gone).
      const err = new Error(`Parse error on line 2 ${XSS_MESSAGE}`)
      err.code = 'syntax'
      err.line = 2
      err.column = 7
      err.snippet = 'A[Start --> SYNTAX_ERROR'
      throw err
    }
    // The idPrefix rides the opts and is embedded in the SVG so the tests
    // can observe render identity and the keep-last-good contract.
    return {
      svg: `<svg id="${opts.idPrefix}" viewBox="0 0 700 200" width="700" height="200"><g class="node"/></svg>`,
      width: 700,
      height: 200,
      links: [],
      type: 'flowchart'
    }
  })
})

const createTarget = (id) => {
  const el = document.createElement('div')
  el.id = id
  el.className = 'ag-container-preview'
  el.textContent = 'loading...'
  document.body.appendChild(el)
  return el
}

const makePipeline = (overrides = {}) =>
  createPelePipeline({
    loadRenderer: async () => fakePele,
    getThemeTokens: () => LIGHT_TOKENS,
    ...overrides
  })

const expandCallsOn = (target) =>
  expandNeedMock.updateFigureExpandNeed.mock.calls.filter(([el]) => el === target)
// END_BLOCK_PIPELINE_TEST_DOUBLES

// START_BLOCK_PIPELINE_THEME_TOKENS
// Fixed token sets — the product reads these from the document's CSS
// variables; pele colors resolve through the --pele-* CSS variables at
// display time, so the pipeline only consumes tokens.font (the measurement
// font). The cache key must contain NEITHER.
const LIGHT_TOKENS = {
  dark: false,
  accent: '#9A6F00',
  bg: '#FBF8F2',
  surface: '#FFFDF8',
  text: '#22252B',
  muted: '#6B655A',
  border: '#D9D0BB',
  line: '#8F8775',
  code: '#F2ECE1',
  font: '-apple-system, system-ui, sans-serif'
}

const DARK_TOKENS = {
  dark: true,
  accent: '#FFCF1A',
  bg: '#17191E',
  surface: '#1F2228',
  text: '#ECE6DA',
  muted: '#A39C8E',
  border: '#3A3E48',
  line: '#8A8F9C',
  code: '#21242B',
  font: 'Georgia, "Times New Roman", serif'
}
// END_BLOCK_PIPELINE_THEME_TOKENS

// Real StateRender against the mocked renderer loader — this is the
// surface the C-34 R2.1 fail-without-fix proof runs against.
const createStateRender = () =>
  new StateRender({
    eventCenter: { dispatch: vi.fn() },
    options: {},
    contentState: { cursor: { start: { key: 'x' }, end: { key: 'x' } }, selectedBlock: null }
  })

let StateRender

beforeEach(() => {
  vi.useFakeTimers()
  fakePele = createFakePele()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('pele pipeline (C-34 R2.1 on the C-55 pele engine)', () => {
  it('renders a first-time diagram immediately (no debounce delay)', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)
    expect(fakePele.detectType).toHaveBeenCalledWith(GOOD_CODE)
    expect(target.querySelector('svg')).not.toBeNull()
    expect(target.textContent).not.toContain('loading')
  })

  it('cache hit re-inserts the cached SVG and skips pele.render', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    // A snabbdom patch rebuilds the preview div with the "loading" text.
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    expect(fakePele.render).toHaveBeenCalledTimes(1)
    const svg = target.querySelector('svg')
    expect(svg).not.toBeNull()
    // pele SVGs carry no <style> blocks — nothing is hoisted: the SVG
    // itself is the container's first child (the mermaid WKWebView CSP
    // hoisting is gone by construction).
    expect(target.firstElementChild.localName).toBe('svg')
    expect(target.querySelector('svg > style')).toBeNull()
    expect(target.classList.contains('ag-pele-preview')).toBe(true)
  })

  // ─── corner-2: the cache key is CODE-ONLY ───────────────────────────
  // Colors live in the --pele-* CSS variables, so a theme switch recolors
  // the cached SVG through the cascade — the render must be a cache hit.

  it('a theme switch is a cache hit, not a re-render (dark tokens, new font)', async () => {
    const target = createTarget('b1')
    let tokens = LIGHT_TOKENS
    const pipeline = makePipeline({ getThemeTokens: () => tokens })
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    tokens = DARK_TOKENS
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    expect(fakePele.render).toHaveBeenCalledTimes(1)
    expect(target.querySelector('svg')).not.toBeNull()
    expect(target.classList.contains('ag-pele-preview')).toBe(true)
  })

  it('a light→light theme change (same dark flag, new accent) is also a cache hit', async () => {
    const target = createTarget('b1')
    let tokens = LIGHT_TOKENS
    const pipeline = makePipeline({ getThemeTokens: () => tokens })
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    // Paper → another light theme: the mermaid-era signature keyed the
    // resolved palette into the cache; the pele key is code-only, so even
    // an accent change must NOT trigger a second render.
    tokens = { ...LIGHT_TOKENS, accent: '#3584E4', font: 'Verdana, sans-serif' }
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    expect(fakePele.render).toHaveBeenCalledTimes(1)
    expect(target.querySelector('svg')).not.toBeNull()
  })

  it('pele.detectType feeds buildPeleRenderOptions: global size and the theme measurement font', async () => {
    createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    expect(fakePele.detectType).toHaveBeenCalledWith(GOOD_CODE)
    const [, opts] = fakePele.render.mock.calls[0]
    expect(opts.fontFamily).toBe(LIGHT_TOKENS.font)
    expect(opts.fontSize).toBe(15)
    expect(String(opts.idPrefix).startsWith('pele-')).toBe(true)
  })

  it('a detected gantt type renders with the lab fontSize 13', async () => {
    createTarget('b1')
    fakePele.detectType = vi.fn(() => 'gantt')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    const [, opts] = fakePele.render.mock.calls[0]
    expect(opts.fontSize).toBe(13)
    expect(opts.fontFamily).toBe(LIGHT_TOKENS.font)
  })

  it('an error after a success keeps the old SVG and shows the error text', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    const goodSvgId = target.querySelector('svg').id

    // Typing a syntax error: changed code on an already-rendered block is
    // debounced; the quiet window must elapse before the failed render.
    target.textContent = 'loading...'
    const promise = pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    await vi.advanceTimersByTimeAsync(250)
    await promise

    const svg = target.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg.id).toBe(goodSvgId)
    const errorEl = target.querySelector('.ag-pele-error')
    expect(errorEl).not.toBeNull()
    expect(errorEl.textContent).toContain('Parse error on line 2')
    expect(target.classList.contains('ag-math-error')).toBe(false)
  })

  it('error text is escaped — a PeleError message with <img onerror> creates no element', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('img')).toBeNull()
    expect(target.querySelector('.ag-pele-error').textContent).toContain(XSS_MESSAGE)
  })

  it('a diagram that never rendered successfully shows the error text only', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('svg')).toBeNull()
    expect(target.classList.contains('ag-math-error')).toBe(true)
    expect(target.querySelector('.ag-pele-error')).not.toBeNull()
    expect(target.textContent).toContain('Parse error')
    expect(target.textContent).not.toContain('loading')
  })

  it('a later successful render clears the error element and class', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('.ag-pele-error')).not.toBeNull()

    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('.ag-pele-error')).toBeNull()
    expect(target.classList.contains('ag-math-error')).toBe(false)
    expect(target.querySelector('svg')).not.toBeNull()
  })

  it('debounce collapses N rapid re-renders into one pele.render', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 5; i++) {
      // Each keystroke: the preview was patched back to "loading" and the
      // code changed slightly.
      target.textContent = 'loading...'
      const promise = pipeline.render([
        ['#b1', { code: `${GOOD_CODE}\n    C --> N${i}`, functionType: 'mermaid' }]
      ])
      await vi.advanceTimersByTimeAsync(60)
      await promise
    }

    // The last good SVG is shown while the debounce window runs.
    expect(target.querySelector('svg')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(250)
    expect(fakePele.render).toHaveBeenCalledTimes(2)
  })

  it('debounce delay is injectable', async () => {
    createTarget('b1')
    const pipeline = makePipeline({ debounceDelayMs: 1000 })
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    const promise = pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    await vi.advanceTimersByTimeAsync(250)
    expect(fakePele.render).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(750)
    await promise
    expect(fakePele.render).toHaveBeenCalledTimes(2)
  })

  it('a cache hit inserts synchronously and cancels a pending debounced re-render', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    // Typing (changed code) schedules the debounced re-render…
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: `${GOOD_CODE}\n    C --> X`, functionType: 'mermaid' }]])
    // …but the code is reverted to the cached one before the window ends:
    // a synchronous cache hit that must also cancel the pending timer.
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('svg')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(250)
    expect(fakePele.render).toHaveBeenCalledTimes(1)
  })

  it('flushPending drops the pending debounced re-renders', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    pipeline.flushPending()
    await vi.advanceTimersByTimeAsync(250)

    expect(fakePele.render).toHaveBeenCalledTimes(1)
    // The last good SVG stayed on screen through the cancelled flush.
    expect(target.querySelector('svg')).not.toBeNull()
  })

  it('destroy clears the caches and cancels pending timers', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    // A pending re-render is dropped by destroy…
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    pipeline.destroy()
    await vi.advanceTimersByTimeAsync(250)
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    // …and the destroyed pipeline no longer serves cached SVGs: the same
    // code re-renders (cache and last-good are gone).
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(2)
    expect(target.querySelector('svg')).not.toBeNull()
  })

  it('bounds the SVG cache with LRU eviction', async () => {
    const pipeline = makePipeline({ maxCacheEntries: 3 })
    const codes = ['graph TD; A-->A1', 'graph TD; B-->B1', 'graph TD; C-->C1', 'graph TD; D-->D1']
    for (let i = 0; i < codes.length; i++) {
      createTarget(`b${i}`)
      await pipeline.render([[`#b${i}`, { code: codes[i], functionType: 'mermaid' }]])
    }
    expect(fakePele.render).toHaveBeenCalledTimes(4)

    // codes[0] was evicted by the 4th insert → re-render.
    await pipeline.render([['#b0', { code: codes[0], functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(5)

    // codes[3] is still cached → hit, no render.
    await pipeline.render([['#b3', { code: codes[3], functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(5)
  })

  it('idPrefixes are unique per pele.render call', async () => {
    const pipeline = makePipeline()
    createTarget('b1')
    createTarget('b2')
    await pipeline.render([
      ['#b1', { code: GOOD_CODE, functionType: 'mermaid' }],
      ['#b2', { code: GOOD_CODE, functionType: 'mermaid' }]
    ])
    // A third render with fresh code (new block → immediate).
    createTarget('b3')
    await pipeline.render([['#b3', { code: 'graph TD; X-->Y', functionType: 'mermaid' }]])

    const prefixes = fakePele.render.mock.calls.map((call) => call[1].idPrefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
    expect(prefixes.every((id) => id.startsWith('pele-'))).toBe(true)
    // The sanitized block key rides every prefix (pele-<blockKey>-<counter>).
    expect(prefixes[0]).toMatch(/^pele-b1-\d+$/)
    expect(prefixes[1]).toMatch(/^pele-b2-\d+$/)
  })

  // ─── C-49: diagrams scale with the editor font size ─────────────────
  // The pipeline must record each diagram's natural width (RenderResult
  // .width, with the width attribute and the viewBox as fallbacks) and
  // rewrite width to 100% with the inline max-width as
  // calc(var(--mark-zoom, 1) × natural px) on EVERY insert path.

  it('a first render records data-natural-width from RenderResult.width', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    const svg = target.querySelector('svg')
    expect(svg.getAttribute('data-natural-width')).toBe('700')
    expect(svg.getAttribute('width')).toBe('100%')
    expect(svg.style.maxWidth).toBe('calc(var(--mark-zoom, 1) * 700px)')
  })

  it('falls back to the SVG width attribute when RenderResult.width is absent', async () => {
    fakePele.render = vi.fn((code, opts) => ({
      svg: `<svg id="${opts.idPrefix}" width="512" viewBox="0 0 512 128"><g/></svg>`,
      width: 0,
      height: 0,
      links: [],
      type: 'flowchart'
    }))
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    const svg = target.querySelector('svg')
    expect(svg.getAttribute('data-natural-width')).toBe('512')
    expect(svg.style.maxWidth).toBe('calc(var(--mark-zoom, 1) * 512px)')
  })

  it('falls back to the viewBox when neither RenderResult.width nor a numeric width exists', async () => {
    fakePele.render = vi.fn((code, opts) => ({
      svg: `<svg id="${opts.idPrefix}" width="100%" viewBox="0 0 320 90"><g/></svg>`,
      width: 0,
      height: 0,
      links: [],
      type: 'flowchart'
    }))
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    const svg = target.querySelector('svg')
    expect(svg.getAttribute('data-natural-width')).toBe('320')
    expect(svg.style.maxWidth).toBe('calc(var(--mark-zoom, 1) * 320px)')
  })

  it('a cache hit re-applies data-natural-width and the calc max-width', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    // Snabbdom rebuilds the preview div — the cached SVG string is a fresh,
    // unmodified element, so the pipeline must re-derive the natural width
    // (the cached width rides the cache entry).
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    const svg = target.querySelector('svg')
    expect(svg.getAttribute('data-natural-width')).toBe('700')
    expect(svg.style.maxWidth).toBe('calc(var(--mark-zoom, 1) * 700px)')
  })

  it('the keep-last-good insert after a failed render also carries data-natural-width', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    target.textContent = 'loading...'
    const promise = pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    await vi.advanceTimersByTimeAsync(250)
    await promise

    const svg = target.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('data-natural-width')).toBe('700')
    expect(svg.style.maxWidth).toBe('calc(var(--mark-zoom, 1) * 700px)')
  })

  // ─── C-51 T-010: expand-need re-evaluation after every insert ───────
  it('re-evaluates the figure expand need after every insert (svg already present)', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    // Every recorded call targeted this element AND saw the SVG already
    // inside it (the double returns the svg count at call time), on the
    // first render and on the cache-hit insert alike.
    const calls = expandCallsOn(target)
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const result of expandNeedMock.updateFigureExpandNeed.mock.results) {
      expect(result.value).toBeGreaterThanOrEqual(1)
    }
  })
})

// These two cases are the fail-without-fix proof for C-34 R2.1: against the
// pre-pipeline implementation they fail (render called twice / diagram
// replaced by "< Invalid Mermaid Codes >").
describe('StateRender.renderPele wiring (C-34 R2.1)', () => {
  beforeEach(async () => {
    StateRender = (await import('muya/lib/parser/render/index')).default
  })

  it('re-rendering an unchanged diagram is a cache hit, not a pele.render', async () => {
    createTarget('sr1')
    const render = createStateRender()
    render.peleCache.set('#sr1', { code: GOOD_CODE, functionType: 'mermaid' })
    await render.renderPele()
    expect(fakePele.render).toHaveBeenCalledTimes(1)

    const target = document.getElementById('sr1')
    target.textContent = 'loading...'
    render.peleCache.set('#sr1', { code: GOOD_CODE, functionType: 'mermaid' })
    await render.renderPele()

    expect(fakePele.render).toHaveBeenCalledTimes(1)
    expect(target.querySelector('svg')).not.toBeNull()
    // No <style> hoisting on the pele path — the SVG is the first child.
    expect(target.firstElementChild.localName).toBe('svg')
  })

  it('a syntax error after a good render keeps the SVG and shows the error', async () => {
    createTarget('sr1')
    const render = createStateRender()
    render.peleCache.set('#sr1', { code: GOOD_CODE, functionType: 'mermaid' })
    await render.renderPele()

    const target = document.getElementById('sr1')
    const goodSvgId = target.querySelector('svg').id
    target.textContent = 'loading...'
    render.peleCache.set('#sr1', { code: BAD_CODE, functionType: 'mermaid' })
    const promise = render.renderPele()
    await vi.advanceTimersByTimeAsync(250)
    await promise

    expect(target.querySelector('svg')).not.toBeNull()
    expect(target.querySelector('svg').id).toBe(goodSvgId)
    expect(target.querySelector('.ag-pele-error').textContent).toContain('Parse error')
    expect(target.querySelector('img')).toBeNull()
  })

  // C-51 Keynote donut (kept from the mermaid era): pie SVGs gain a
  // panel-coloured hole (var(--pele-bg)) painted after the slices plus the
  // inert pieOuterCircle radius marker; non-pie types pass through.
  it('postProcessPeleSvg re-maps kanban cards to the surface with a light frame and columns to surface-alt', async () => {
    const pele = await import('pele')
    const { svg, type } = pele.render('kanban\n  todo[To do]\n    a[Card one]\n  done[Done]\n    b[Card two]')
    expect(type).toBe('kanban')
    const out = postProcessPeleSvg(svg, type)
    expect(out).not.toMatch(/fill="var\(--_bg\)" stroke="var\(--_b\)"/)
    expect(out).toMatch(/fill="var\(--pele-surface\)" stroke="var\(--_b\)" stroke-opacity="0.35"/)
    expect(out).not.toMatch(/fill="var\(--_s\)"/)
    expect(out).toMatch(/fill="var\(--pele-surface-alt\)"/)
    // Other types are untouched.
    const flow = pele.render('flowchart LR\n  A --> B').svg
    expect(postProcessPeleSvg(flow, 'flowchart')).toBe(flow)
  })

  it('postProcessPeleSvg carves the Keynote donut into pie SVGs only', async () => {
    const pieSvg =
      '<svg class="pele pele-pie"><g class="pele-slices" transform="translate(156,195)">' +
      '<path class="pele-slice" d="M0,0L0,-120A120,120 0 1 1 -116.92,-27.02Z" fill="var(--pele-series-1,#4c78a8)"/>' +
      '</g></svg>'
    const out = postProcessPeleSvg(pieSvg, 'pie')
    expect(out).toContain(`class="pieDonutHole" r="${(120 * DONUT_HOLE).toFixed(1)}" fill="var(--pele-bg)"`)
    expect(out).toContain('class="pieOuterCircle" r="120"')
    // paint order: the hole comes AFTER the slice path
    expect(out.indexOf('pieDonutHole')).toBeGreaterThan(out.indexOf('pele-slice'))
    // idempotent + passthrough
    expect(postProcessPeleSvg(out, 'pie')).toBe(out)
    expect(postProcessPeleSvg('<svg class="pele pele-flowchart"><g/></svg>', 'flowchart'))
      .toBe('<svg class="pele pele-flowchart"><g/></svg>')
  })
})
