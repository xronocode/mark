// FILE: tests/renderer/muya/export-content-theme.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-005 export wiring — ExportHtml.renderDiagram renders vega-lite, flowchart.js and sequence diagrams with the same theme-driven configs as the editor (contentTheme.js, tokens read from the live document), replacing the old hard-coded latimes vega theme and the un-coloured flowchart/sequence options.
//   SCOPE: renderDiagram on src/muya/lib/utils/exportHtml.js with the renderer loader mocked; the config builders themselves are pinned in content-theme.test.js.
//   DEPENDS: src/muya/lib/utils/exportHtml.js, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-51 T-005; .grace/verification/runtime.xml V-M-012 scenario-23.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeFakeRenderers - flowchart/sequence/vega-lite doubles recording drawSVG options / embed opts; the sequence double draws a js-sequence-shaped SVG.
//   buildExportContainer - a div.ag-render-container with language-vega-lite/flowchart/sequence code blocks appended to body.
//   PAPER_VARS - test fixture / helper.
//   VEGA_SPEC - test fixture / helper.
//   fakeRenderers - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-005: first version. Fails
//   against the pre-T-005 export path (vega theme was hard-coded
//   'latimes', flowchart/sequence had no theme colours).
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExportHtml from 'muya/lib/utils/exportHtml'
import { buildVegaThemeConfig } from 'muya/lib/parser/render/contentTheme'
import { palette, blendHex } from 'muya/lib/parser/render/mermaidTheme'

let fakeRenderers

vi.mock('muya/lib/renderers', () => ({
  default: async (name) => {
    if (!fakeRenderers[name]) {
      throw new Error(`Unknown diagram name ${name}`)
    }
    return fakeRenderers[name]
  }
}))

const makeFakeRenderers = () => ({
  flowchart: {
    parse: vi.fn(() => ({
      drawSVG: vi.fn((target, options) => {
        target.__flowchartOptions = options
        target.innerHTML = '<svg></svg>'
      })
    }))
  },
  sequence: {
    parse: vi.fn(() => ({
      drawSVG: vi.fn((target, options) => {
        target.__sequenceOptions = options
        const themeClass = options && options.theme === 'simple' ? 'simple' : 'hand'
        target.innerHTML = `
          <svg class="sequence ${themeClass}" xmlns="http://www.w3.org/2000/svg">
            <defs><marker id="m"><path d="M0 0 L5 2.5 L0 5 z" fill="#000"></path></marker></defs>
            <g class="actor"><rect x="0" y="0" width="60" height="30" stroke="#000" fill="#fff"></rect><text x="30" y="20">Alice</text></g>
            <g class="signal"><text x="10" y="60">hello</text><line x1="0" y1="60" x2="200" y2="60" stroke="#000"></line></g>
          </svg>`
      })
    }))
  },
  plantuml: {
    parse: vi.fn(() => ({ insertImgElement: vi.fn() }))
  },
  'vega-lite': (() => {
    const embed = async (el, spec, opts) => {
      embed.recorded.push({ el, spec, opts })
    }
    embed.recorded = []
    return embed
  })()
})

const PAPER_VARS = {
  '--themeColor': '#9A6F00',
  '--editorColor': '#22252B',
  '--editorBgColor': '#FBF8F2',
  '--floatBgColor': '#FFFDF8',
  '--codeBlockBgColor': '#F2ECE1',
  '--tableBorderColor': '#E4DBCB',
  '--chromeFontFamily': 'system-ui, sans-serif'
}

const VEGA_SPEC = {
  data: { values: [{ kind: 'A', count: 3 }] },
  mark: 'bar',
  encoding: { x: { field: 'kind', type: 'nominal' }, y: { field: 'count', type: 'quantitative' } }
}

const buildExportContainer = (blocks) => {
  const container = document.createElement('div')
  container.classList.add('ag-render-container')
  for (const [lang, code] of blocks) {
    const pre = document.createElement('pre')
    const codeEl = document.createElement('code')
    codeEl.className = `language-${lang}`
    codeEl.textContent = code
    pre.appendChild(codeEl)
    container.appendChild(pre)
  }
  document.body.appendChild(container)
  return container
}

beforeEach(() => {
  fakeRenderers = makeFakeRenderers()
  const root = document.documentElement
  for (const [name, value] of Object.entries(PAPER_VARS)) root.style.setProperty(name, value)
})

afterEach(() => {
  document.body.innerHTML = ''
  const root = document.documentElement
  for (const name of Object.keys(PAPER_VARS)) root.style.removeProperty(name)
  document.body.classList.remove('dark')
})

describe('exportHtml diagram theming (C-51 T-005)', () => {
  it('renders vega-lite, flowchart and sequence with the editor theme configs', async () => {
    const container = buildExportContainer([
      ['vega-lite', JSON.stringify(VEGA_SPEC)],
      ['flowchart', 'st=>start: Start\ne=>end\nst->e'],
      ['sequence', 'Title: T\nA->B: hello']
    ])
    const exporter = new ExportHtml('# title', null)
    exporter.exportContainer = container

    await exporter.renderDiagram()

    // vega: token-built config, the hard-coded latimes theme is gone
    const vega = fakeRenderers['vega-lite'].recorded
    expect(vega).toHaveLength(1)
    expect(vega[0].el).toBeInstanceOf(Element)
    expect(vega[0].spec).toEqual(VEGA_SPEC)
    expect(vega[0].opts.theme).toBeUndefined()
    expect(vega[0].opts.config).toEqual(
      buildVegaThemeConfig({
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
      })
    )
    expect(vega[0].opts.config.mark.color).toBe(palette('#9a6f00', 0.6, 0.12)[0])

    // flowchart: token colours + theme font
    const flowContainer = container.querySelector('div.flowchart')
    expect(flowContainer.__flowchartOptions).toEqual({
      'line-color': blendHex('#22252b', '#fbf8f2', 0.5),
      'element-color': '#e4dbcb',
      'fill': '#fffdf8',
      'font-color': '#22252b',
      'font-family': 'system-ui, sans-serif'
    })

    // sequence: js-sequence repainted from the tokens (readable on dark)
    const seqContainer = container.querySelector('div.sequence')
    expect(seqContainer.__sequenceOptions).toEqual({})
    const seqSvg = seqContainer.querySelector('svg.sequence')
    expect(seqSvg.querySelector('text').getAttribute('fill')).toBe('#22252b')
    expect(seqSvg.querySelector('g.actor rect').getAttribute('fill')).toBe('#fffdf8')
    expect(seqSvg.querySelector('line').getAttribute('stroke')).toBe(blendHex('#22252b', '#fbf8f2', 0.5))
  })

  it('a muya-provided sequenceTheme rides the options', async () => {
    const container = buildExportContainer([['sequence', 'Title: T\nA->B: hello']])
    const exporter = new ExportHtml('# title', { options: { sequenceTheme: 'simple' } })
    exporter.exportContainer = container

    await exporter.renderDiagram()

    const seqContainer = container.querySelector('div.sequence')
    expect(seqContainer.__sequenceOptions).toEqual({
      theme: 'simple',
      'font-family': 'system-ui, sans-serif'
    })
  })

  it('dark document tokens theme the export render too', async () => {
    document.body.classList.add('dark')
    const root = document.documentElement
    root.style.setProperty('--themeColor', '#FFCF1A')
    root.style.setProperty('--editorColor', '#ECE6DA')
    root.style.setProperty('--editorBgColor', '#17191E')
    root.style.setProperty('--floatBgColor', '#1F2228')
    root.style.setProperty('--codeBlockBgColor', '#21242B')
    root.style.setProperty('--tableBorderColor', '#3A3E48')

    const darkContainer = buildExportContainer([['flowchart', 'st=>start: Start\ne=>end\nst->e']])
    const exporter = new ExportHtml('# title', null)
    exporter.exportContainer = darkContainer

    await exporter.renderDiagram()

    const vega = fakeRenderers['vega-lite'].recorded
    expect(vega).toHaveLength(0)
    const flowOptions = document.querySelector('div.flowchart').__flowchartOptions
    expect(flowOptions['font-color']).toBe('#ece6da')
    expect(flowOptions['fill']).toBe('#1f2228')
    expect(flowOptions['line-color']).toBe(blendHex('#ece6da', '#17191e', 0.5))
  })

  it('still renders the error placeholder when a diagram fails', async () => {
    fakeRenderers.flowchart.parse = vi.fn(() => {
      throw new Error('Parse error')
    })
    const container = buildExportContainer([['flowchart', 'st=>start: (broken']])
    const exporter = new ExportHtml('# title', null)
    exporter.exportContainer = container

    await exporter.renderDiagram()

    expect(container.textContent).toContain('< Invalid Diagram >')
  })
})
