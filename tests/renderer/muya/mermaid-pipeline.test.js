// FILE: tests/renderer/muya/mermaid-pipeline.test.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-34 R2.1 resilient mermaid render pipeline: code+theme LRU cache, keep-last-good + escaped error text, orphan error-element cleanup, per-block debounce, unique render ids, and natural-size initialization.
//   SCOPE: createMermaidPipeline in src/muya/lib/parser/render/mermaidPipeline.js and StateRender.renderMermaid wiring in src/muya/lib/parser/render/index.js.
//   DEPENDS: src/muya/lib/parser/render/mermaidPipeline.js, src/muya/lib/parser/render/index.js, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-34 R2.1; .grace/verification/runtime.xml V-M-012 scenario-9; START_BLOCK_MERMAID_*.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   GOOD_CODE - fixture diagram source that renders.
//   BAD_CODE - fixture diagram source that makes the fake renderer throw.
//   fakeMermaid - the mocked mermaid module used by the StateRender-level tests.
//   StateRender - real StateRender class imported after the renderer-loader mock.
//   XSS_MESSAGE - error text whose HTML must never become an element.
//   createFakeMermaid - mermaid module double counting initialize/render calls; appends mermaid-style orphans (div#d<id>) on failure.
//   createTarget - a div.ag-container-preview block target appended to body.
//   LIGHT_TOKENS / DARK_TOKENS - fixed theme tokens (the accepted lab paper/ink values) injected into the pipeline.
//   makePipeline - pipeline with injected fake loader and theme tokens.
//   createStateRender - real StateRender against the mocked renderer loader (fail-without-fix surface).
//   DARK_TOKENS - Ink-like token set for the dark-theme cases.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-16 C-51 T-012: the initialize pins expect
//   the node fill/text derived against the code-block panel
//   (nodeContrastColors) instead of the raw surface/text tokens.
//   v1.2.0 - 2026-10-16 C-51 T-003/T-004: the pipeline injects
//   theme tokens instead of a 'dark'/'default' flag; initialize is pinned to
//   theme base + look neo + themeVariables with the C-34 fit-column policy
//   (useMaxWidth:true) and the four lab-sized scrollable types
//   (gantt/journey/packet/timeline) at useMaxWidth:false; cache-key misses
//   are proven for dark flips AND light→light accent changes.
//   v1.1.0 - 2026-10-15 C-49: data-natural-width + inline
//   calc(var(--mark-zoom, 1) × natural px) pinned on every insert path
//   (first render, inline-max-width and viewBox extraction, cache hit,
//   keep-last-good) — all fail against the pre-C-49 pipeline.
//   v1.0.0 - 2026-10-15 C-34 R2.1: cache-hit, theme-miss, keep-last-good, error escaping, first-time error, orphan cleanup, debounce collapse, LRU bound, unique ids, natural-size config; StateRender-level cache and keep-last-good cases fail against the pre-R2.1 implementation.
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMermaidPipeline } from 'muya/lib/parser/render/mermaidPipeline'
import { nodeContrastColors } from 'muya/lib/parser/render/mermaidTheme'

const GOOD_CODE = 'graph TD\n    A[Start] --> B{Decision}\n    B --> C[End]'
const BAD_CODE = 'graph TD\n    A[Start --> SYNTAX_ERROR'
const XSS_MESSAGE = '<img src=x onerror=alert(1)>'

// The mocked loader used by the StateRender-level tests. Assigned in
// beforeEach so every case gets fresh call counts.
let fakeMermaid

vi.mock('muya/lib/renderers', () => ({
  default: async () => fakeMermaid
}))

// START_BLOCK_PIPELINE_TEST_DOUBLES
const createFakeMermaid = () => ({
  initialize: vi.fn(),
  render: vi.fn(async (id, code) => {
    if (code.includes('SYNTAX_ERROR')) {
      // Mermaid v11 leaves its scratch div#d<id> (with the error-diagram
      // svg#<id>) behind in document.body when the render fails.
      const orphan = document.createElement('div')
      orphan.id = `d${id}`
      orphan.innerHTML = `<svg id="${id}"></svg>`
      document.body.appendChild(orphan)
      throw new Error(`Parse error on line 2 ${XSS_MESSAGE}`)
    }
    return {
      svg: `<svg id="${id}" width="700" height="200"><style>#${id} .node{fill:red}</style><g class="node"/></svg>`,
      bindFunctions: null
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
  createMermaidPipeline({
    loadRenderer: async () => fakeMermaid,
    getThemeTokens: () => LIGHT_TOKENS,
    ...overrides
  })
// END_BLOCK_PIPELINE_TEST_DOUBLES

// START_BLOCK_PIPELINE_THEME_TOKENS
// Fixed token sets (the accepted lab paper/ink values) — the product reads
// these from the document's CSS variables; the pipeline only needs a stable
// injectable source to prove cache-key and initialize behaviour.
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
  font: '-apple-system, system-ui, sans-serif'
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
  fakeMermaid = createFakeMermaid()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('mermaid pipeline (C-34 R2.1)', () => {
  it('renders a first-time diagram immediately (no debounce delay)', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(target.querySelector('svg')).not.toBeNull()
    expect(target.textContent).not.toContain('loading')
  })

  it('cache hit re-inserts the cached SVG and skips mermaid.render', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    // A snabbdom patch rebuilds the preview div with the "loading" text.
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    const svg = target.querySelector('svg')
    expect(svg).not.toBeNull()
    // WKWebView CSP style hoisting must also happen on cache hits.
    expect(target.firstElementChild.localName).toBe('style')
    expect(target.querySelector('svg > style')).toBeNull()
    expect(target.classList.contains('ag-mermaid-preview')).toBe(true)
  })

  it('a theme switch misses the cache and re-renders in the new theme', async () => {
    const target = createTarget('b1')
    let tokens = LIGHT_TOKENS
    const pipeline = makePipeline({ getThemeTokens: () => tokens })
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    tokens = DARK_TOKENS
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
    expect(fakeMermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        theme: 'base',
        look: 'neo',
        // T-012: node fill derives against the code-block panel.
        themeVariables: expect.objectContaining({ primaryColor: nodeContrastColors(DARK_TOKENS).fill })
      })
    )
    expect(target.querySelector('svg')).not.toBeNull()
  })

  it('a light→light theme change (same dark flag, new accent) also re-renders', async () => {
    const target = createTarget('b1')
    let tokens = LIGHT_TOKENS
    const pipeline = makePipeline({ getThemeTokens: () => tokens })
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    // Paper → another light theme: the old 'default'/'dark' key would hit
    // the cache; the signature includes the resolved palette, so it misses.
    tokens = { ...LIGHT_TOKENS, accent: '#3584E4' }
    target.textContent = 'loading...'
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
    expect(target.querySelector('svg')).not.toBeNull()
  })

  it('initializes mermaid per diagram type: fit-column for most, lab sizes for the scrollable four', async () => {
    createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakeMermaid.initialize).toHaveBeenCalledTimes(1)
    expect(fakeMermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        theme: 'base',
        look: 'neo',
        fontFamily: LIGHT_TOKENS.font,
        themeVariables: expect.objectContaining({
          primaryColor: nodeContrastColors(LIGHT_TOKENS).fill,
          primaryTextColor: nodeContrastColors(LIGHT_TOKENS).text
        }),
        flowchart: expect.objectContaining({ useMaxWidth: true, curve: 'basis' }),
        sequence: expect.objectContaining({ useMaxWidth: true, mirrorActors: false }),
        // C-51 T-004: readable sizes at natural width (in-block scroll).
        gantt: expect.objectContaining({ useMaxWidth: false, useWidth: 720, fontSize: 13 }),
        journey: expect.objectContaining({ useMaxWidth: false, taskFontSize: 14 }),
        packet: expect.objectContaining({ useMaxWidth: false, bitWidth: 20 }),
        timeline: expect.objectContaining({ useMaxWidth: false, padding: 8 })
      })
    )
  })

  it('a gantt block gets its own type initialize in the same flush', async () => {
    createTarget('b1')
    createTarget('b2')
    const pipeline = makePipeline()
    await pipeline.render([
      ['#b1', { code: GOOD_CODE, functionType: 'mermaid' }],
      ['#b2', { code: 'gantt\ndateFormat YYYY-MM-DD\ntitle T', functionType: 'mermaid' }]
    ])

    const inits = fakeMermaid.initialize.mock.calls
    expect(inits).toHaveLength(2)
    expect(inits[0][0].flowchart.useMaxWidth).toBe(true)
    expect(inits[1][0].gantt).toMatchObject({ useMaxWidth: false, useWidth: 720 })
    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
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
    const errorEl = target.querySelector('.ag-mermaid-error')
    expect(errorEl).not.toBeNull()
    expect(errorEl.textContent).toContain('Parse error on line 2')
    expect(target.classList.contains('ag-math-error')).toBe(false)
  })

  it('error text is escaped — a message with <img onerror> creates no element', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('img')).toBeNull()
    expect(target.querySelector('.ag-mermaid-error').textContent).toContain(XSS_MESSAGE)
  })

  it('a diagram that never rendered successfully shows the error text only', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('svg')).toBeNull()
    expect(target.classList.contains('ag-math-error')).toBe(true)
    expect(target.querySelector('.ag-mermaid-error')).not.toBeNull()
    expect(target.textContent).toContain('Parse error')
    expect(target.textContent).not.toContain('loading')
  })

  it('removes the orphan error elements mermaid leaves in document.body', async () => {
    createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    const renderId = fakeMermaid.render.mock.calls[0][0]
    expect(document.getElementById(`d${renderId}`)).toBeNull()
    expect(document.getElementById(renderId)).toBeNull()
  })

  it('a later successful render clears the error element and class', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('.ag-mermaid-error')).not.toBeNull()

    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(target.querySelector('.ag-mermaid-error')).toBeNull()
    expect(target.classList.contains('ag-math-error')).toBe(false)
    expect(target.querySelector('svg')).not.toBeNull()
  })

  it('debounce collapses N rapid re-renders into one mermaid.render', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

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
    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
  })

  it('debounce delay is injectable', async () => {
    createTarget('b1')
    const pipeline = makePipeline({ debounceDelayMs: 1000 })
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])
    const promise = pipeline.render([['#b1', { code: BAD_CODE, functionType: 'mermaid' }]])
    await vi.advanceTimersByTimeAsync(250)
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(750)
    await promise
    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
  })

  it('bounds the SVG cache with LRU eviction', async () => {
    const pipeline = makePipeline({ maxCacheEntries: 3 })
    const codes = ['graph TD; A-->A1', 'graph TD; B-->B1', 'graph TD; C-->C1', 'graph TD; D-->D1']
    for (let i = 0; i < codes.length; i++) {
      createTarget(`b${i}`)
      await pipeline.render([[`#b${i}`, { code: codes[i], functionType: 'mermaid' }]])
    }
    expect(fakeMermaid.render).toHaveBeenCalledTimes(4)

    // codes[0] was evicted by the 4th insert → re-render.
    await pipeline.render([['#b0', { code: codes[0], functionType: 'mermaid' }]])
    expect(fakeMermaid.render).toHaveBeenCalledTimes(5)

    // codes[3] is still cached → hit, no render.
    await pipeline.render([['#b3', { code: codes[3], functionType: 'mermaid' }]])
    expect(fakeMermaid.render).toHaveBeenCalledTimes(5)
  })

  it('render ids are unique per mermaid.render call', async () => {
    let tokens = LIGHT_TOKENS
    const pipeline = makePipeline({ getThemeTokens: () => tokens })
    createTarget('b1')
    createTarget('b2')
    await pipeline.render([
      ['#b1', { code: GOOD_CODE, functionType: 'mermaid' }],
      ['#b2', { code: GOOD_CODE, functionType: 'mermaid' }]
    ])
    tokens = DARK_TOKENS
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    const ids = fakeMermaid.render.mock.calls.map((call) => call[0])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('mermaid-'))).toBe(true)
  })

  // ─── C-49: diagrams scale with the editor font size ─────────────────
  // The pipeline must record each diagram's natural width and rewrite the
  // inline max-width as calc(var(--mark-zoom, 1) × natural px) on EVERY
  // insert path (first render, cache hit, keep-last-good).

  it('a first render records data-natural-width and the --mark-zoom calc max-width', async () => {
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    const svg = target.querySelector('svg')
    // The fake double emits width="700"; mermaid's real useMaxWidth SVGs
    // carry an inline max-width instead — covered by the cases below.
    expect(svg.getAttribute('data-natural-width')).toBe('700')
    expect(svg.style.maxWidth).toBe('calc(var(--mark-zoom, 1) * 700px)')
  })

  it('uses mermaid’s inline max-width (useMaxWidth:true) as the natural width', async () => {
    fakeMermaid.render = vi.fn(async (id) => ({
      svg: `<svg id="${id}" width="100%" style="max-width: 512px;" viewBox="0 0 512 128"><g/></svg>`,
      bindFunctions: null
    }))
    const target = createTarget('b1')
    const pipeline = makePipeline()
    await pipeline.render([['#b1', { code: GOOD_CODE, functionType: 'mermaid' }]])

    const svg = target.querySelector('svg')
    expect(svg.getAttribute('data-natural-width')).toBe('512')
    expect(svg.style.maxWidth).toBe('calc(var(--mark-zoom, 1) * 512px)')
  })

  it('falls back to the viewBox when the SVG has neither max-width nor a numeric width', async () => {
    fakeMermaid.render = vi.fn(async (id) => ({
      svg: `<svg id="${id}" width="100%" viewBox="0 0 320 90"><g/></svg>`,
      bindFunctions: null
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
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    // Snabbdom rebuilds the preview div — the cached SVG string is a fresh,
    // unmodified element, so the pipeline must re-derive the natural width.
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
})

// These two cases are the fail-without-fix proof for C-34 R2.1: against the
// pre-pipeline implementation they fail (render called twice / diagram
// replaced by "< Invalid Mermaid Codes >").
describe('StateRender.renderMermaid wiring (C-34 R2.1)', () => {
  beforeEach(async () => {
    StateRender = (await import('muya/lib/parser/render/index')).default
  })

  it('re-rendering an unchanged diagram is a cache hit, not a mermaid.render', async () => {
    createTarget('sr1')
    const render = createStateRender()
    render.mermaidCache.set('#sr1', { code: GOOD_CODE, functionType: 'mermaid' })
    await render.renderMermaid()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    const target = document.getElementById('sr1')
    target.textContent = 'loading...'
    render.mermaidCache.set('#sr1', { code: GOOD_CODE, functionType: 'mermaid' })
    await render.renderMermaid()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(target.querySelector('svg')).not.toBeNull()
    expect(target.firstElementChild.localName).toBe('style')
  })

  it('a syntax error after a good render keeps the SVG and shows the error', async () => {
    createTarget('sr1')
    const render = createStateRender()
    render.mermaidCache.set('#sr1', { code: GOOD_CODE, functionType: 'mermaid' })
    await render.renderMermaid()

    const target = document.getElementById('sr1')
    const goodSvgId = target.querySelector('svg').id
    target.textContent = 'loading...'
    render.mermaidCache.set('#sr1', { code: BAD_CODE, functionType: 'mermaid' })
    const promise = render.renderMermaid()
    await vi.advanceTimersByTimeAsync(250)
    await promise

    expect(target.querySelector('svg')).not.toBeNull()
    expect(target.querySelector('svg').id).toBe(goodSvgId)
    expect(target.querySelector('.ag-mermaid-error').textContent).toContain('Parse error')
    expect(target.querySelector('img')).toBeNull()
  })
})
