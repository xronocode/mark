// FILE: tests/renderer/muya/export-diagram-appearance.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify editor/export color parity for stored and read-only diagram modes using real Pele SVGs.
//   SCOPE: Local wrapper variables, inline paint normalization, independent repeated diagrams and portable metadata.
//   DEPENDS: Vitest, real Pele, ExportHtml, shared appearance policy.
//   LINKS: .grace/changes/archive/C-62 T-002; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   SOURCE - real authored flowchart and explicit classDef.
//   exportDiagrams - create an export-only container and run the actual export method.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-62: real-engine appearance parity and read-only export overrides.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it, vi } from 'vitest'
import ExportHtml from 'muya/lib/utils/exportHtml'
import { applyDiagramAppearance, writeDiagramAppearance } from 'muya/lib/utils/diagramAppearance'
import { render } from 'pele'
vi.mock('muya/lib/renderers', () => ({ default: async () => import('pele') }))
const SOURCE = 'flowchart LR\nA[Alpha] --> B[Beta]\nclassDef own fill:#ffeecc,color:#123456\nclass A own'
async function exportDiagrams(codes, muya = null) {
  const container = document.createElement('div')
  for (const source of codes) {
    const pre = document.createElement('pre'); const code = document.createElement('code')
    code.className = 'language-mermaid'; code.textContent = source; pre.appendChild(code); container.appendChild(pre)
  }
  document.body.appendChild(container)
  const exporter = new ExportHtml('', muya); exporter.exportContainer = container
  await exporter.renderPele()
  return [...container.querySelectorAll('.mermaid')]
}
afterEach(() => { document.body.innerHTML = '' })
describe('diagram appearance export parity', () => {
  it.each(['auto', 'custom', 'light', 'dark'])('exports the same local color policy for %s', async mode => {
    const source = writeDiagramAppearance(SOURCE, mode)
    const editor = document.createElement('div'); editor.innerHTML = render(source).svg
    applyDiagramAppearance(editor, source)
    const [exported] = await exportDiagrams([source])
    expect(exported.dataset.diagramAppearance).toBe(editor.dataset.diagramAppearance)
    expect(exported.style.cssText).toBe(editor.style.cssText)
    expect(exported.querySelector('svg').style.backgroundColor).toBe(mode === 'auto' ? '' : 'var(--pele-bg)')
    expect(exported.querySelector('[data-id="A"] rect').style.fill).toBe(editor.querySelector('[data-id="A"] rect').style.fill)
    expect(exported.querySelectorAll('button')).toHaveLength(0)
  })
  it('applies view-only overrides by diagram occurrence without changing source', async () => {
    const getExportOverride = vi.fn(index => index === 0 ? 'dark' : 'light')
    const result = await exportDiagrams([SOURCE, SOURCE], { diagramAppearance: { getExportOverride } })
    expect(result.map(element => element.dataset.diagramAppearance)).toEqual(['dark', 'light'])
    expect(getExportOverride.mock.calls).toEqual([[0, SOURCE], [1, SOURCE]])
  })
})
