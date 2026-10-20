// FILE: tests/renderer/muya/content-theme.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-005 (R-3) content theming — the Vega-Lite config built from the theme tokens (transparent background, theme font, axis/legend/title colours, categorical range = the SAME palette Mermaid uses, user spec config winning through vega's own mergeConfig), the flowchart.js drawSVG options, the js-sequence options (hand/simple preference kept), the js-sequence SVG repaint, and the StateRender.renderDiagram wiring incl. the re-render on a theme switch.
//   SCOPE: src/muya/lib/parser/render/contentTheme.js pure API + chartPalette from diagramTheme.js + StateRender.renderDiagram with the renderer loader mocked; the export wiring lives in export-content-theme.test.js.
//   DEPENDS: src/muya/lib/parser/render/contentTheme.js, src/muya/lib/parser/render/diagramTheme.js, src/muya/lib/parser/render/index.js, vega (mergeConfig — the exact merge vega-lite compile applies), Vitest + jsdom.
//   LINKS: .grace/changes/archive/C-51 T-005; .grace/verification/runtime.xml V-M-012 scenario-23; START_BLOCK_CONTENT_*.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PAPER_TOKENS / INK_TOKENS - fixed theme token sets (the accepted lab paper/ink values) used as builder inputs.
//   PAPER_VARS / INK_VARS - jsdom inline CSS-variable fixtures for the renderDiagram wiring cases.
//   setRootVars / clearRootVars - install/remove the CSS-variable fixture and the body dark flag.
//   makeFakeFlowchart / makeFakeSequence / makeFakeVegaEmbed - renderer doubles recording drawSVG options / embed opts; the sequence double draws a js-sequence-shaped SVG (marker, actor rect, hand-theme filled path box, fill="none" lifeline, note).
//   createStateRender - real StateRender against the mocked renderer loader.
//   appendPreviewTarget - a div.ag-container-preview block target appended to body.
//   FLOWCHART_CODE - test fixture / helper.
//   INK_TOKENS - test fixture / helper.
//   INK_VARS - test fixture / helper.
//   SEQUENCE_CODE - test fixture / helper.
//   StateRender - test fixture / helper.
//   VEGA_SPEC - test fixture / helper.
//   clearRootVars - test fixture / helper.
//   fakeRenderers - test fixture / helper.
//   makeFakeSequence - test fixture / helper.
//   makeFakeVegaEmbed - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-005: first version. Fails
//   against the pre-T-005 renderDiagram (named vega themes, no colours
//   for flowchart/sequence — contentTheme.js did not exist).
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildVegaThemeConfig,
  buildFlowchartThemeOptions,
  buildSequenceThemeOptions,
  applySequenceTheme
} from 'muya/lib/parser/render/contentTheme'
import { chartPalette, palette, blendHex } from 'muya/lib/parser/render/diagramTheme'

// The accepted lab themes (paper/ink) as fixed token inputs — product code
// reads them from CSS variables; these tests exercise the builders.
const PAPER_TOKENS = {
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

const INK_TOKENS = {
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

// ── chartPalette: one palette definition for every renderer ──────────
describe('chartPalette (C-51 T-005 shared palette)', () => {
  it('generates the OKLCH palette from the accent with the lab lightness', () => {
    expect(chartPalette(PAPER_TOKENS)).toEqual(palette('#9A6F00', 0.6, 0.12))
    expect(chartPalette(INK_TOKENS)).toEqual(palette('#FFCF1A', 0.74, 0.11))
    expect(chartPalette(PAPER_TOKENS)).toHaveLength(8)
  })

  it('prefers the theme-defined --chartPalette series (≥ 6 colours)', () => {
    const apple = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#30b0c7']
    expect(chartPalette({ ...PAPER_TOKENS, series: apple })).toEqual(apple)
    // fewer than 6 colours is treated as absent
    expect(chartPalette({ ...PAPER_TOKENS, series: apple.slice(0, 3) })).toEqual(
      palette('#9A6F00', 0.6, 0.12)
    )
  })
})

// ── Vega-Lite config ─────────────────────────────────────────────────
describe('buildVegaThemeConfig (C-51 T-005)', () => {
  it('replaces every vega default that fights the theme', () => {
    const cfg = buildVegaThemeConfig(PAPER_TOKENS)
    // default background is 'white' — transparent lets the block's own
    // --codeBlockBgColor panel show through on every theme.
    expect(cfg.background).toBeNull()
    // default mark colour is Tableau10 #4c78a8.
    expect(cfg.mark).toEqual({ color: chartPalette(PAPER_TOKENS)[0] })
    expect(cfg.mark.color).not.toBe('#4c78a8')
    // default rule/text mark colour is 'black'.
    expect(cfg.text).toEqual({ color: PAPER_TOKENS.text })
    expect(cfg.rule).toEqual({ color: PAPER_TOKENS.line })
    expect(cfg.font).toBe(PAPER_TOKENS.font)
  })

  it('axis/legend/title/header colours come from the tokens', () => {
    const cfg = buildVegaThemeConfig(PAPER_TOKENS)
    expect(cfg.axis).toEqual({
      domainColor: PAPER_TOKENS.border,
      tickColor: PAPER_TOKENS.border,
      gridColor: PAPER_TOKENS.border,
      labelColor: PAPER_TOKENS.muted,
      titleColor: PAPER_TOKENS.muted
    })
    expect(cfg.legend).toEqual({ labelColor: PAPER_TOKENS.muted, titleColor: PAPER_TOKENS.muted })
    expect(cfg.title).toEqual({ color: PAPER_TOKENS.text, subtitleColor: PAPER_TOKENS.muted })
    expect(cfg.header).toEqual({ labelColor: PAPER_TOKENS.text, titleColor: PAPER_TOKENS.text })
  })

  it('the categorical range is the same palette Mermaid uses', () => {
    for (const tokens of [PAPER_TOKENS, INK_TOKENS]) {
      expect(buildVegaThemeConfig(tokens).range).toEqual({ category: chartPalette(tokens) })
    }
    const apple = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#30b0c7', '#ffcc00', '#ff2d55']
    expect(buildVegaThemeConfig({ ...PAPER_TOKENS, series: apple }).range.category).toEqual(apple)
  })

  it('light and dark themes yield different palettes and label colours', () => {
    const light = buildVegaThemeConfig(PAPER_TOKENS)
    const dark = buildVegaThemeConfig(INK_TOKENS)
    expect(light.mark.color).not.toBe(dark.mark.color)
    expect(light.axis.labelColor).not.toBe(dark.axis.labelColor)
  })

  it('the user spec config wins through vega\'s own merge (sub-objects wholesale)', async () => {
    // vega-lite compile applies mergeConfig(opt.config, inputSpec.config):
    // our config first, the user's spec.config second — the real merge
    // order, exercised with vega's own implementation.
    const { mergeConfig } = await import('vega')
    const themed = buildVegaThemeConfig(PAPER_TOKENS)
    const user = {
      mark: { color: '#123456', opacity: 0.9 },
      range: { category: ['#111111', '#222222', '#333333'] }
    }
    const merged = mergeConfig(themed, user)
    expect(merged.mark).toEqual({ color: '#123456', opacity: 0.9 })
    expect(merged.range.category).toEqual(['#111111', '#222222', '#333333'])
    // Parts the user did not touch still theme the chart.
    expect(merged.axis.labelColor).toBe(PAPER_TOKENS.muted)
    expect(merged.background).toBeNull()
    expect(merged.font).toBe(PAPER_TOKENS.font)
  })
})

// ── flowchart.js options ─────────────────────────────────────────────
describe('buildFlowchartThemeOptions (C-51 T-005)', () => {
  it('maps the tokens onto the drawSVG colour/font options', () => {
    expect(buildFlowchartThemeOptions(PAPER_TOKENS)).toEqual({
      'line-color': PAPER_TOKENS.line,
      'element-color': PAPER_TOKENS.border,
      'fill': PAPER_TOKENS.surface,
      'font-color': PAPER_TOKENS.text,
      'font-family': PAPER_TOKENS.font
    })
  })

  it('never emits the flowchart.js black/white defaults', () => {
    const flat = (o) => JSON.stringify(o).toLowerCase()
    expect(flat(buildFlowchartThemeOptions(PAPER_TOKENS))).not.toContain('black')
    expect(flat(buildFlowchartThemeOptions(INK_TOKENS))).not.toContain('white')
    // dark themes flip every colour
    const light = buildFlowchartThemeOptions(PAPER_TOKENS)
    const dark = buildFlowchartThemeOptions(INK_TOKENS)
    expect(light['line-color']).not.toBe(dark['line-color'])
    expect(light['fill']).not.toBe(dark['fill'])
  })
})

// ── js-sequence options ──────────────────────────────────────────────
describe('buildSequenceThemeOptions (C-51 T-005)', () => {
  it('keeps the hand/simple preference; only simple gets the theme font', () => {
    expect(buildSequenceThemeOptions(PAPER_TOKENS, 'hand')).toEqual({ theme: 'hand' })
    expect(buildSequenceThemeOptions(PAPER_TOKENS, 'simple')).toEqual({
      theme: 'simple',
      'font-family': PAPER_TOKENS.font
    })
  })

  it('an unset preference stays unset (the library default applies)', () => {
    expect(buildSequenceThemeOptions(PAPER_TOKENS, undefined)).toEqual({})
  })
})

// ── js-sequence SVG repaint ──────────────────────────────────────────
describe('applySequenceTheme (C-51 T-005)', () => {
  const buildDrawnSequence = () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <svg class="sequence hand" xmlns="http://www.w3.org/2000/svg">
        <desc>fixture</desc>
        <defs>
          <marker id="markerArrowBlock"><path d="M0 0 L5 2.5 L0 5 z" fill="#000" stroke="#000"></path></marker>
          <marker id="markerArrowOpen"><path d="M9.6 8 L1.92 16 L0 13.7 z" fill="#000"></path></marker>
        </defs>
        <g class="title"><text x="20" y="12">Title</text></g>
        <g class="actor">
          <rect x="0" y="0" width="60" height="30" stroke="#000" fill="#fff"></rect>
          <text x="30" y="20">Alice</text>
          <!-- hand theme: boxes are wobbly paths, lifelines fill="none" paths -->
          <path d="M0 0 q30 4 60 0 q30 4 0 30 q-30 4 -60 0 z" stroke="#000" fill="#fff"></path>
          <path d="M30 30 L30 200" stroke="#000" fill="none" stroke-dasharray="6,2"></path>
        </g>
        <g class="signal">
          <text x="10" y="60">hello</text>
          <line x1="0" y1="60" x2="200" y2="60" stroke="#000" marker-end="url(#markerArrowBlock)"></line>
          <path d="M10 80 L200 80" stroke="#000" fill="none"></path>
        </g>
        <g class="note">
          <rect x="20" y="100" width="60" height="24" stroke="#000" fill="#fff"></rect>
          <text x="24" y="116">a note</text>
        </g>
      </svg>`
    document.body.appendChild(container)
    return container
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('repaints text, connectors, boxes, notes and arrowheads from the tokens', () => {
    const container = buildDrawnSequence()
    applySequenceTheme(container, PAPER_TOKENS)

    const svg = container.querySelector('svg.sequence')
    const tint = palette('#9A6F00', 0.9, 0.05)
    const tintBorder = palette('#9A6F00', 0.76, 0.08)

    for (const text of svg.querySelectorAll('text')) {
      expect(text.getAttribute('fill')).toBe(PAPER_TOKENS.text)
    }
    for (const line of svg.querySelectorAll('line')) {
      expect(line.getAttribute('stroke')).toBe(PAPER_TOKENS.line)
    }
    // marker arrowheads follow the line colour
    for (const path of svg.querySelectorAll('marker path')) {
      expect(path.getAttribute('fill')).toBe(PAPER_TOKENS.line)
    }
    // lifelines keep fill="none" (hand-theme paths) and take the line colour
    const lifeline = svg.querySelector('g.actor path[stroke-dasharray]')
    expect(lifeline.getAttribute('stroke')).toBe(PAPER_TOKENS.line)
    expect(lifeline.getAttribute('fill')).toBe('none')
    // hand-theme actor box: filled path → surface plate + border stroke
    const handBox = svg.querySelector('g.actor path:not([stroke-dasharray])')
    expect(handBox.getAttribute('fill')).toBe(PAPER_TOKENS.surface)
    expect(handBox.getAttribute('stroke')).toBe(PAPER_TOKENS.border)
    // simple-theme actor rect → surface plate + border stroke
    const actorRect = svg.querySelector('g.actor rect')
    expect(actorRect.getAttribute('fill')).toBe(PAPER_TOKENS.surface)
    expect(actorRect.getAttribute('stroke')).toBe(PAPER_TOKENS.border)
    // notes get js-sequence's own accent tint pair (Mermaid's notes follow
    // the C-51 T-012 node colours derived against the code-block panel)
    const noteRect = svg.querySelector('g.note rect')
    expect(noteRect.getAttribute('fill')).toBe(tint[0])
    expect(noteRect.getAttribute('stroke')).toBe(tintBorder[0])
  })

  it('dark tokens repaint dark and the tint flips', () => {
    const container = buildDrawnSequence()
    applySequenceTheme(container, INK_TOKENS)
    const svg = container.querySelector('svg.sequence')
    expect(svg.querySelector('text').getAttribute('fill')).toBe(INK_TOKENS.text)
    expect(svg.querySelector('g.actor rect').getAttribute('fill')).toBe(INK_TOKENS.surface)
    const tint = palette('#FFCF1A', 0.36, 0.05)
    expect(svg.querySelector('g.note rect').getAttribute('fill')).toBe(tint[0])
  })

  it('tolerates containers without a drawn sequence svg', () => {
    const container = document.createElement('div')
    expect(() => applySequenceTheme(container, PAPER_TOKENS)).not.toThrow()
    expect(() => applySequenceTheme(null, PAPER_TOKENS)).not.toThrow()
  })
})

// ── StateRender.renderDiagram wiring ─────────────────────────────────
// The mocked loader used by the wiring cases. Assigned in beforeEach so
// every case gets fresh recorded calls.
let fakeRenderers

vi.mock('muya/lib/renderers', () => ({
  default: async (name) => {
    if (!fakeRenderers[name]) {
      throw new Error(`Unknown diagram name ${name}`)
    }
    return fakeRenderers[name]
  }
}))

const PAPER_VARS = {
  '--themeColor': '#9A6F00',
  '--editorColor': '#22252B',
  '--editorBgColor': '#FBF8F2',
  '--floatBgColor': '#FFFDF8',
  '--codeBlockBgColor': '#F2ECE1',
  '--tableBorderColor': '#E4DBCB',
  '--chromeFontFamily': 'system-ui, sans-serif'
}

const INK_VARS = {
  '--themeColor': '#FFCF1A',
  '--editorColor': '#ECE6DA',
  '--editorBgColor': '#17191E',
  '--floatBgColor': '#1F2228',
  '--codeBlockBgColor': '#21242B',
  '--tableBorderColor': '#3A3E48',
  '--chromeFontFamily': 'system-ui, sans-serif'
}

const setRootVars = (vars, dark) => {
  const root = document.documentElement
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
  document.body.classList.toggle('dark', !!dark)
}

const clearRootVars = () => {
  const root = document.documentElement
  for (const name of [...Object.keys(PAPER_VARS), ...Object.keys(INK_VARS)]) {
    root.style.removeProperty(name)
  }
  document.body.classList.remove('dark')
}

const makeFakeFlowchart = () => {
  const recorded = []
  return {
    parse: vi.fn(() => ({
      drawSVG: (target, options) => {
        recorded.push(options)
        target.innerHTML = '<svg></svg>'
      }
    })),
    recorded
  }
}

const makeFakeSequence = () => {
  const recorded = []
  return {
    parse: vi.fn(() => ({
      drawSVG: (target, options) => {
        recorded.push(options)
        const themeClass = options && options.theme === 'simple' ? 'simple' : 'hand'
        target.innerHTML = `
          <svg class="sequence ${themeClass}" xmlns="http://www.w3.org/2000/svg">
            <defs><marker id="m"><path d="M0 0 L5 2.5 L0 5 z" fill="#000"></path></marker></defs>
            <g class="actor"><rect x="0" y="0" width="60" height="30" stroke="#000" fill="#fff"></rect><text x="30" y="20">Alice</text></g>
            <g class="signal"><text x="10" y="60">hello</text><line x1="0" y1="60" x2="200" y2="60" stroke="#000"></line></g>
          </svg>`
      }
    })),
    recorded
  }
}

const makeFakeVegaEmbed = () => {
  const recorded = []
  const embed = async (el, spec, opts) => {
    recorded.push({ el, spec, opts })
  }
  embed.recorded = recorded
  return embed
}

const appendPreviewTarget = (id) => {
  const el = document.createElement('div')
  el.id = id
  el.className = 'ag-container-preview'
  el.textContent = 'loading...'
  document.body.appendChild(el)
  return el
}

let StateRender

const createStateRender = () =>
  new StateRender({
    eventCenter: { dispatch: vi.fn() },
    options: { sequenceTheme: 'hand' },
    contentState: { cursor: { start: { key: 'x' }, end: { key: 'x' } }, selectedBlock: null }
  })

const VEGA_SPEC = {
  data: { values: [{ kind: 'A', count: 3 }, { kind: 'B', count: 5 }] },
  mark: 'bar',
  encoding: {
    x: { field: 'kind', type: 'nominal' },
    y: { field: 'count', type: 'quantitative' }
  }
}

const FLOWCHART_CODE = 'st=>start: Start\ne=>end\nst->e'
const SEQUENCE_CODE = 'Title: T\nA->B: hello'

describe('StateRender.renderDiagram theming wiring (C-51 T-005)', () => {
  beforeEach(() => {
    fakeRenderers = {
      flowchart: makeFakeFlowchart(),
      sequence: makeFakeSequence(),
      plantuml: { parse: vi.fn(() => ({ insertImgElement: vi.fn() })) },
      'vega-lite': makeFakeVegaEmbed()
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearRootVars()
  })

  it('passes themed options/configs to every renderer', async () => {
    StateRender = (await import('muya/lib/parser/render/index')).default
    setRootVars(PAPER_VARS, false)
    const sr = createStateRender()
    appendPreviewTarget('v1')
    appendPreviewTarget('f1')
    appendPreviewTarget('s1')
    sr.diagramCache.set('#v1', { code: JSON.stringify(VEGA_SPEC), functionType: 'vega-lite' })
    sr.diagramCache.set('#f1', { code: FLOWCHART_CODE, functionType: 'flowchart' })
    sr.diagramCache.set('#s1', { code: SEQUENCE_CODE, functionType: 'sequence' })

    await sr.renderDiagram()

    // vega: token-built config, no named theme fighting it
    const vega = fakeRenderers['vega-lite'].recorded
    expect(vega).toHaveLength(1)
    expect(vega[0].opts.theme).toBeUndefined()
    expect(vega[0].opts.config).toEqual(buildVegaThemeConfig({
      dark: false,
      accent: '#9a6f00',
      bg: '#fbf8f2',
      surface: '#fffdf8',
      text: '#22252b',
      muted: blendHex('#22252b', '#fbf8f2', 0.65),
      border: '#e4dbcb',
      line: blendHex('#22252b', '#fbf8f2', 0.5),
      code: '#f2ece1',
      font: 'system-ui, sans-serif'
    }))
    expect(vega[0].opts.config.mark.color).toBe(palette('#9a6f00', 0.6, 0.12)[0])

    // flowchart: token colours + theme font
    const flow = fakeRenderers.flowchart.recorded
    expect(flow).toHaveLength(1)
    expect(flow[0]).toEqual({
      'line-color': blendHex('#22252b', '#fbf8f2', 0.5),
      'element-color': '#e4dbcb',
      'fill': '#fffdf8',
      'font-color': '#22252b',
      'font-family': 'system-ui, sans-serif'
    })

    // sequence: preference passed through, SVG repainted from the tokens
    const seq = fakeRenderers.sequence.recorded
    expect(seq).toHaveLength(1)
    expect(seq[0]).toEqual({ theme: 'hand' })
    const seqSvg = document.querySelector('#s1 svg.sequence')
    expect(seqSvg.querySelector('text').getAttribute('fill')).toBe('#22252b')
    expect(seqSvg.querySelector('g.actor rect').getAttribute('fill')).toBe('#fffdf8')
    expect(seqSvg.querySelector('line').getAttribute('stroke')).toBe(blendHex('#22252b', '#fbf8f2', 0.5))
    expect(seqSvg.querySelector('marker path').getAttribute('fill')).toBe(blendHex('#22252b', '#fbf8f2', 0.5))
  })

  it('a sequenceTheme of simple rides the options with the theme font', async () => {
    StateRender = (await import('muya/lib/parser/render/index')).default
    setRootVars(PAPER_VARS, false)
    const sr = createStateRender()
    sr.muya.options.sequenceTheme = 'simple'
    appendPreviewTarget('s1')
    sr.diagramCache.set('#s1', { code: SEQUENCE_CODE, functionType: 'sequence' })

    await sr.renderDiagram()

    expect(fakeRenderers.sequence.recorded[0]).toEqual({
      theme: 'simple',
      'font-family': 'system-ui, sans-serif'
    })
  })

  it('a theme switch re-renders every diagram with the new tokens', async () => {
    StateRender = (await import('muya/lib/parser/render/index')).default
    setRootVars(PAPER_VARS, false)
    let sr = createStateRender()
    appendPreviewTarget('v1')
    appendPreviewTarget('s1')
    sr.diagramCache.set('#v1', { code: JSON.stringify(VEGA_SPEC), functionType: 'vega-lite' })
    sr.diagramCache.set('#s1', { code: SEQUENCE_CODE, functionType: 'sequence' })
    await sr.renderDiagram()

    const paperBar = fakeRenderers['vega-lite'].recorded[0].opts.config.mark.color
    const paperSeqText = document.querySelector('#s1 svg.sequence text').getAttribute('fill')

    // Theme switch: new CSS variables + dark flag, full re-render re-queues
    // the blocks (setOptions(_, true) path) — renderDiagram re-reads tokens.
    setRootVars(INK_VARS, true)
    sr = createStateRender()
    sr.diagramCache.set('#v1', { code: JSON.stringify(VEGA_SPEC), functionType: 'vega-lite' })
    sr.diagramCache.set('#s1', { code: SEQUENCE_CODE, functionType: 'sequence' })
    await sr.renderDiagram()

    const vega = fakeRenderers['vega-lite'].recorded
    expect(vega).toHaveLength(2)
    expect(vega[1].opts.config.mark.color).toBe(palette('#ffcf1a', 0.74, 0.11)[0])
    expect(vega[1].opts.config.mark.color).not.toBe(paperBar)
    expect(vega[1].opts.config.background).toBeNull()
    const inkSeqText = document.querySelector('#s1 svg.sequence text').getAttribute('fill')
    expect(inkSeqText).toBe('#ece6da')
    expect(inkSeqText).not.toBe(paperSeqText)
  })

  it('a renderer error still shows the invalid-diagram placeholder', async () => {
    StateRender = (await import('muya/lib/parser/render/index')).default
    setRootVars(PAPER_VARS, false)
    const sr = createStateRender()
    const target = appendPreviewTarget('f1')
    sr.diagramCache.set('#f1', { code: 'st=>start: (broken', functionType: 'flowchart' })
    fakeRenderers.flowchart.parse = vi.fn(() => {
      throw new Error('Parse error')
    })

    await sr.renderDiagram()

    expect(target.classList.contains('ag-math-error')).toBe(true)
    expect(target.textContent).toContain('Invalid Flow Chart')
  })
})

describe('StateRender.renderDiagram overlapping calls (C-51 T-008)', () => {
  beforeEach(() => {
    let release
    const slowEmbed = vi.fn(() => new Promise((resolve) => { release = resolve }))
    slowEmbed.release = () => release && release()
    fakeRenderers = {
      flowchart: makeFakeFlowchart(),
      sequence: makeFakeSequence(),
      plantuml: { parse: vi.fn(() => ({ insertImgElement: vi.fn() })) },
      'vega-lite': slowEmbed
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearRootVars()
  })

  it('a second call while vega is embedding renders every block only once', async () => {
    StateRender = (await import('muya/lib/parser/render/index')).default
    setRootVars(PAPER_VARS, false)
    const sr = createStateRender()
    appendPreviewTarget('v1')
    appendPreviewTarget('s1')
    sr.diagramCache.set('#v1', { code: JSON.stringify(VEGA_SPEC), functionType: 'vega-lite' })
    sr.diagramCache.set('#s1', { code: SEQUENCE_CODE, functionType: 'sequence' })

    const first = sr.renderDiagram()
    const second = sr.renderDiagram()
    await new Promise((resolve) => setTimeout(resolve, 0))
    fakeRenderers['vega-lite'].release()
    await Promise.all([first, second])

    expect(fakeRenderers['vega-lite']).toHaveBeenCalledTimes(1)
    expect(fakeRenderers.sequence.recorded).toHaveLength(1)
    expect(sr.diagramCache.size).toBe(0)
  })

  it('a block queued while vega is embedding is rendered, not dropped', async () => {
    StateRender = (await import('muya/lib/parser/render/index')).default
    setRootVars(PAPER_VARS, false)
    const sr = createStateRender()
    appendPreviewTarget('v1')
    appendPreviewTarget('s1')
    sr.diagramCache.set('#v1', { code: JSON.stringify(VEGA_SPEC), functionType: 'vega-lite' })

    const first = sr.renderDiagram()
    await new Promise((resolve) => setTimeout(resolve, 0))
    sr.diagramCache.set('#s1', { code: SEQUENCE_CODE, functionType: 'sequence' })
    const second = sr.renderDiagram()
    fakeRenderers['vega-lite'].release()
    await Promise.all([first, second])

    expect(fakeRenderers.sequence.recorded).toHaveLength(1)
    expect(document.querySelector('#s1 svg.sequence')).not.toBeNull()
  })
})
