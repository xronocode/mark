// FILE: tests/renderer/muya/export-pele-theme.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-55 export wiring — ExportHtml.renderPele renders each ```mermaid block through the pele namespace (loadRenderer('pele'): pele.render, synchronous) with a unique 'pele-export-N' idPrefix and buildPeleRenderOptions(pele.detectType(code), tokens) options read from the live document, swaps the pre>code for a div.mermaid (the class the print stylesheet centres on), keeps the '< Invalid Mermaid Codes >' error placeholder, and generate() inlines a <style>:root { --pele-* } block whose values equal buildPeleVariables(readActiveThemeTokens()) so the standalone file carries the editor's diagram colours.
//   SCOPE: renderPele and generate on src/muya/lib/utils/exportHtml.js with the renderer loader mocked; the variable/derivation builders themselves are pinned in diagram-theme.test.js and pele-node-contrast.test.js.
//   DEPENDS: src/muya/lib/utils/exportHtml.js, muya/lib/parser/render/diagramTheme (readActiveThemeTokens, buildPeleVariables), muya/lib/parser/render/peleOptions (buildPeleRenderOptions, DEFAULT_PELE_FONT_SIZE), Vitest + jsdom.
//   LINKS: .grace/changes/archive/C-55 (renderPele + export inlining); .grace/changes/archive/C-51 T-003 (the export reads the app theme); .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   fakePele - pele namespace double (render/detectType) recording calls; render is synchronous like the real one.
//   requestedRenderers - every name passed to the mocked loadRenderer (proves the pele namespace is the requested engine).
//   buildExportContainer - a div.ag-render-container with N mermaid code blocks appended to body.
//   MIRRORED_VARS - the document-root CSS variables each scenario mirrors (the util/theme.js inline-mirror shape).
//   mirrorThemeVars - set a scenario's mirrored theme variables on the document root's inline style.
//   parseStyleVars - extract --name: value pairs from an inlined <style> block.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-17 C-55 (ported from
//   export-mermaid-theme.test.js): renderMermaid → renderPele. The old
//   initialize-per-diagram-type assertions are replaced by the pele option
//   surface: idPrefix 'pele-export-N' + buildPeleRenderOptions(
//   detectType(code), tokens) (fontFamily for measurement-matches-display,
//   per-type lab fontSize); the container class 'mermaid' and the
//   '< Invalid Mermaid Codes >' error placeholder survive verbatim. NEW:
//   generate() inlines the --pele-* variable block of the active theme —
//   pinned value-for-value against buildPeleVariables(readActiveThemeTokens()).
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExportHtml from 'muya/lib/utils/exportHtml'
import {
  readActiveThemeTokens,
  buildPeleVariables
} from 'muya/lib/parser/render/diagramTheme'
import {
  buildPeleRenderOptions,
  DEFAULT_PELE_FONT_SIZE
} from 'muya/lib/parser/render/peleOptions'

let fakePele
let requestedRenderers

vi.mock('muya/lib/renderers', () => ({
  default: async (name) => {
    requestedRenderers.push(name)
    if (name === 'pele') {
      return fakePele
    }
    // Inert doubles for the other diagram engines renderDiagram eagerly
    // loads — no non-mermaid block exists in these scenarios.
    return { parse: vi.fn() }
  }
}))

beforeEach(() => {
  requestedRenderers = []
  fakePele = {
    // Synchronous like the real pele.render (C-55 hard requirement).
    render: vi.fn((code, opts) => ({
      svg: `<svg id="${opts.idPrefix}" width="100" height="50"><g/></svg>`,
      width: 100,
      height: 50,
      links: [],
      type: 'flowchart'
    })),
    detectType: vi.fn((code) => (code.startsWith('gantt') ? 'gantt' : 'flowchart'))
  }
})

const MIRRORED_VARS = [
  '--themeColor', '--editorColor', '--editorBgColor', '--floatBgColor',
  '--codeBlockBgColor', '--tableBorderColor', '--chromeFontFamily'
]

afterEach(() => {
  document.body.innerHTML = ''
  const root = document.documentElement
  for (const name of MIRRORED_VARS) {
    root.style.removeProperty(name)
  }
})

const mirrorThemeVars = (vars) => {
  const root = document.documentElement
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }
}

const buildExportContainer = (codes) => {
  const container = document.createElement('div')
  container.classList.add('ag-render-container')
  for (const code of codes) {
    const pre = document.createElement('pre')
    const codeEl = document.createElement('code')
    codeEl.className = 'language-mermaid'
    codeEl.textContent = code
    pre.appendChild(codeEl)
    container.appendChild(pre)
  }
  document.body.appendChild(container)
  return container
}

const parseStyleVars = (css) => {
  const vars = {}
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim()
  }
  return vars
}

describe('exportHtml pele theming (C-55)', () => {
  it('renders each block through the pele namespace with per-diagram options', async () => {
    mirrorThemeVars({
      '--themeColor': '#9A6F00',
      '--editorColor': '#22252B',
      '--editorBgColor': '#FBF8F2',
      '--floatBgColor': '#FFFDF8'
    })
    const container = buildExportContainer([
      'flowchart TD\n    A[Start] --> B',
      'gantt\ndateFormat YYYY-MM-DD'
    ])
    const exporter = new ExportHtml('# title', null)
    exporter.exportContainer = container

    await exporter.renderPele()

    // The pele namespace (render/detectType) is the loaded engine.
    expect(requestedRenderers).toContain('pele')
    // Types are detected from the unescaped raw code.
    expect(fakePele.detectType.mock.calls.map(([code]) => code)).toEqual([
      'flowchart TD\n    A[Start] --> B',
      'gantt\ndateFormat YYYY-MM-DD'
    ])

    const tokens = readActiveThemeTokens()
    expect(tokens.accent).toBe('#9a6f00') // read from the live document mirror

    const calls = fakePele.render.mock.calls
    expect(calls).toHaveLength(2)
    // Options = idPrefix + buildPeleRenderOptions(detectType(code), tokens):
    // the measurement font matches the displayed --pele-font variable and
    // the flowchart keeps the global lab size.
    expect(calls[0][0]).toBe('flowchart TD\n    A[Start] --> B')
    expect(calls[0][1]).toEqual({
      idPrefix: 'pele-export-0',
      ...buildPeleRenderOptions('flowchart', tokens)
    })
    expect(calls[0][1].fontSize).toBe(DEFAULT_PELE_FONT_SIZE)
    expect(calls[0][1].fontFamily).toBe(tokens.font)
    // The gantt block got the type's own lab size (C-51 look, C-55 surface).
    expect(calls[1][1]).toEqual({
      idPrefix: 'pele-export-1',
      ...buildPeleRenderOptions('gantt', tokens)
    })
    expect(calls[1][1].fontSize).toBe(13)

    // Each pre>code became a div.mermaid carrying the rendered SVG.
    expect(container.querySelectorAll('pre')).toHaveLength(0)
    const rendered = container.querySelectorAll('div.mermaid')
    expect(rendered).toHaveLength(2)
    expect(container.querySelectorAll('div.mermaid > svg')).toHaveLength(2)
    expect(container.querySelector('#pele-export-1')).not.toBeNull()
  })

  it('still renders the error placeholder when a diagram fails', async () => {
    fakePele.render = vi.fn(() => {
      throw new Error('Parse error')
    })
    const container = buildExportContainer(['flowchart TD\n    A -->'])
    const exporter = new ExportHtml('# title', null)
    exporter.exportContainer = container

    await exporter.renderPele()

    expect(container.textContent).toContain('< Invalid Mermaid Codes >')
  })

  it('generate() inlines the --pele-* variables of the active theme into the exported document', async () => {
    mirrorThemeVars({
      '--themeColor': '#9A6F00',
      '--editorColor': '#22252B',
      '--editorBgColor': '#FBF8F2',
      '--floatBgColor': '#FFFDF8',
      '--codeBlockBgColor': '#F2ECE1',
      '--tableBorderColor': '#E4DBCB'
    })
    const exporter = new ExportHtml(
      '# title\n\n```mermaid\nflowchart TD\n    A[Start] --> B\n```\n',
      null
    )

    const html = await exporter.generate({
      printOptimization: false,
      title: 'Pele export',
      extraCss: '',
      toc: null
    })

    // The mermaid block rode along: rendered pele SVG in its mermaid-class
    // container (the print stylesheet hook).
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('<svg id="pele-export-0"')

    // The standalone document carries the variable block the SVGs resolve.
    const block = /<style>:root \{([\s\S]*?)\}<\/style>/.exec(html)
    expect(block, 'generate() inlines a <style>:root { … } pele block').not.toBeNull()
    const inlined = parseStyleVars(block[1])
    const expected = buildPeleVariables(readActiveThemeTokens())

    // (parseStyleVars keys drop the leading --; re-prefix for the comparison.)
    expect(Object.keys(inlined).map((k) => `--${k}`).sort()).toEqual(
      Object.keys(expected).sort()
    )
    const failures = []
    for (const [name, value] of Object.entries(expected)) {
      const inlinedValue = inlined[name.slice(2)]
      if (inlinedValue !== value) {
        failures.push(`${name}: inlined ${inlinedValue} ≠ derivation ${value}`)
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
    // No mermaid script/CDN references exist anymore (corner-7: standalone).
    expect(html).not.toMatch(/<script[^>]*mermaid|cdn\.jsdelivr\.net\/npm\/mermaid/)

    // The document body was left clean (renderHtml removes its container).
    expect(document.body.querySelector('.ag-render-container')).toBeNull()
  })
})
