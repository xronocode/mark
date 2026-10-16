// FILE: tests/renderer/muya/export-mermaid-theme.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-003 export wiring — ExportHtml.renderMermaid initializes mermaid with the active-theme config (theme base + look neo + themeVariables read from the document) once per diagram type, replacing the old default/dark flip.
//   SCOPE: renderMermaid on src/muya/lib/utils/exportHtml.js with the renderer loader mocked; the config builder itself is pinned in mermaid-theme.test.js.
//   DEPENDS: src/muya/lib/utils/exportHtml.js, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-51 T-003; .grace/verification/runtime.xml V-M-012 scenario-17.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   fakeMermaid - mermaid module double recording initialize/render calls.
//   buildExportContainer - a div.ag-render-container with N mermaid code blocks appended to body.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-16 C-51 T-012: the primaryColor pin
//   follows the node fill derived against the code-block panel
//   (nodeContrastColors(readActiveThemeTokens())) instead of the raw
//   --floatBgColor surface.
//   v1.0.0 - 2026-10-16 C-51 T-003: first version. Fails
//   against the pre-C-51 export path (initialize used theme default/dark).
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExportHtml from 'muya/lib/utils/exportHtml'
import { nodeContrastColors, readActiveThemeTokens } from 'muya/lib/parser/render/mermaidTheme'

let fakeMermaid

vi.mock('muya/lib/renderers', () => ({
  default: async () => fakeMermaid
}))

beforeEach(() => {
  fakeMermaid = {
    initialize: vi.fn(),
    render: vi.fn(async (id) => ({
      svg: `<svg id="${id}" width="100" height="50"><g/></svg>`,
      bindFunctions: null
    }))
  }
})

afterEach(() => {
  document.body.innerHTML = ''
  const root = document.documentElement
  for (const name of [
    '--themeColor', '--editorColor', '--editorBgColor', '--floatBgColor',
    '--codeBlockBgColor', '--tableBorderColor', '--chromeFontFamily'
  ]) {
    root.style.removeProperty(name)
  }
})

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

describe('exportHtml mermaid theming (C-51 T-003)', () => {
  it('initializes mermaid per diagram type with the active-theme config', async () => {
    const root = document.documentElement
    root.style.setProperty('--themeColor', '#9A6F00')
    root.style.setProperty('--editorColor', '#22252B')
    root.style.setProperty('--editorBgColor', '#FBF8F2')
    root.style.setProperty('--floatBgColor', '#FFFDF8')
    const container = buildExportContainer([
      'flowchart TD\n    A[Start] --> B',
      'gantt\ndateFormat YYYY-MM-DD'
    ])
    const exporter = new ExportHtml('# title', null)
    exporter.exportContainer = container

    await exporter.renderMermaid()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
    expect(container.querySelectorAll('svg')).toHaveLength(2)

    const inits = fakeMermaid.initialize.mock.calls
    expect(inits).toHaveLength(2)
    expect(inits[0][0]).toMatchObject({ securityLevel: 'strict', theme: 'base', look: 'neo' })
    // Tokens were read from the live document's CSS variables (lowercase
    // normalization happens in readActiveThemeTokens); T-012: the node fill
    // is derived against the code-block panel (--codeBlockBgColor is unset
    // here, so the panel falls back to the editor background).
    expect(inits[0][0].themeVariables.primaryColor).toBe(nodeContrastColors(readActiveThemeTokens()).fill)
    expect(inits[0][0].flowchart).toMatchObject({ useMaxWidth: true, curve: 'basis' })
    // The gantt block got the type's own initialize (lab sizes, T-004).
    expect(inits[1][0].gantt).toMatchObject({ useMaxWidth: false, useWidth: 720, fontSize: 13 })
  })

  it('still renders the error placeholder when a diagram fails', async () => {
    fakeMermaid.render = vi.fn(async () => {
      throw new Error('Parse error')
    })
    const container = buildExportContainer(['flowchart TD\n    A -->'])
    const exporter = new ExportHtml('# title', null)
    exporter.exportContainer = container

    await exporter.renderMermaid()

    expect(container.textContent).toContain('< Invalid Mermaid Codes >')
  })
})
