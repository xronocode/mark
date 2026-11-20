// FILE: tests/renderer/muya/export-diagram-appearance.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify editor/export color parity for stored and read-only diagram modes using real Pele SVGs, and pin the C-PELE-HTML-POSTPROCESS export parity: exported pele SVGs equal postProcessPeleSvg(rendered.svg, rendered.type) — pie Keynote donut hole, kanban surface remap, flowchart no-op control — across both export APIs with the standalone --pele-* variables retained.
//   SCOPE: Local wrapper variables, inline paint normalization, independent repeated diagrams, portable metadata, export post-processing parity (pie/kanban/flowchart), both export APIs and mixed/idempotent documents.
//   DEPENDS: Vitest, real Pele, ExportHtml, shared appearance policy, muya/lib/parser/render/pelePipeline (postProcessPeleSvg, DONUT_HOLE), peleOptions, diagramTheme tokens.
//   LINKS: .grace/changes/archive/C-62 T-002; .grace/verification/runtime.xml V-M-012; .grace/changes/active/C-PELE-HTML-POSTPROCESS T-002.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   SOURCE - real authored flowchart and explicit classDef.
//   PIE_SOURCE - real pele pie fixture for the donut-hole parity pins.
//   KANBAN_SOURCE - real pele kanban fixture for the surface-remap pin.
//   FLOW_SOURCE - real pele flowchart fixture for the no-op control.
//   INVALID_SOURCE - real pele fixture that throws (unsupported number in a pie section).
//   exportDiagrams - create an export-only container and run the actual export method.
//   rawExportRender - the exporter's exact pele.render call (pele-export-N idPrefix + measurement options) for deterministic same-function comparisons.
//   editorRender - the live-editor equivalent render (buildPeleRenderOptions measurement from the active tokens, the pipeline's own idPrefix shape).
//   domRoundTrip - jsdom serialize(parse(svg)) normalization, so the permitted byte comparisons compare assigned export markup against postProcessPeleSvg's output, not serializer artifacts.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-11-20 C-PELE-HTML-POSTPROCESS: exported pele
//   SVGs must carry the live post-processing — pie donut hole (exactly one
//   correctly sized var(--pele-bg) hole + inert pieOuterCircle, painted after
//   the slices, live-parity r/fill, idempotent) under all four appearance
//   modes; kanban surface remap byte-equal to postProcessPeleSvg on the
//   identical raw render; flowchart no-op control; renderHtml() and
//   generate() both carry the processed SVGs with generate() keeping the
//   inlined --pele-bg/--pele-surface/--pele-surface-alt block; mixed
//   repeated/invalid document keeps one hole per pie, unique pele-export-N
//   prefixes and no getExportOverride index drift.
//   PREV: v1.0.0 - 2026-10-18 C-62: real-engine appearance parity and read-only export overrides.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it, vi } from 'vitest'
import ExportHtml from 'muya/lib/utils/exportHtml'
import { applyDiagramAppearance, writeDiagramAppearance } from 'muya/lib/utils/diagramAppearance'
import { render, detectType } from 'pele'
import { DONUT_HOLE, postProcessPeleSvg } from 'muya/lib/parser/render/pelePipeline'
import { buildPeleRenderOptions } from 'muya/lib/parser/render/peleOptions'
import { readActiveThemeTokens } from 'muya/lib/parser/render/diagramTheme'
vi.mock('muya/lib/renderers', () => ({ default: async () => import('pele') }))
// The export path loads the real pele through the mocked loader above; this
// transparent spy (real implementation) only makes the pele-export-N
// idPrefix allocation observable for the mixed-document pin.
vi.mock('pele', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, render: vi.fn(actual.render) }
})
const SOURCE = 'flowchart LR\nA[Alpha] --> B[Beta]\nclassDef own fill:#ffeecc,color:#123456\nclass A own'
const PIE_SOURCE = 'pie\n"One": 1\n"Two": 2'
const KANBAN_SOURCE = 'kanban\n  todo[To do]\n    a[Card one]\n  done[Done]\n    b[Card two]'
const FLOW_SOURCE = 'flowchart LR\n  A --> B'
const INVALID_SOURCE = 'pie\n"One": x'
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
// renderPele's render call line-for-line (C-PELE-HTML-POSTPROCESS): the
// pele-export-N idPrefix plus buildPeleRenderOptions(detectType, tokens).
// Pele renders synchronously and deterministically, so a comparison render
// with the identical source+options reproduces the exporter's raw SVG.
const rawExportRender = (source, index = 0) =>
  render(source, {
    idPrefix: `pele-export-${index}`,
    ...buildPeleRenderOptions(detectType(source), readActiveThemeTokens())
  })
// The live editor renders through createPelePipeline with the same
// measurement options and its own pele-<block>-<counter> idPrefix; pie and
// kanban SVGs do not embed the idPrefix (no accTitle/accDescr), so the
// geometry matches the editor output.
const editorRender = source =>
  render(source, buildPeleRenderOptions(detectType(source), readActiveThemeTokens()))
const domRoundTrip = (svg) => {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = svg
  return wrapper.innerHTML
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
describe('export pele post-processing parity (C-PELE-HTML-POSTPROCESS)', () => {
  it.each(['auto', 'custom', 'light', 'dark'])('carves the Keynote donut hole into exported pie SVGs in %s appearance', async mode => {
    const source = writeDiagramAppearance(PIE_SOURCE, mode)
    const live = editorRender(source)
    expect(live.type).toBe('pie')
    const liveProcessed = postProcessPeleSvg(live.svg, live.type)

    const [exported] = await exportDiagrams([source])
    // exactly one donut hole per exported pie
    const holes = exported.querySelectorAll('circle.pieDonutHole')
    expect(holes).toHaveLength(1)
    const hole = holes[0]
    // hole r = DONUT_HOLE × the outer radius parsed from the first slice arc
    const outer = Number(/A([\d.]+),/.exec(exported.querySelector('path.pele-slice').getAttribute('d'))[1])
    expect(outer).toBeGreaterThan(0)
    expect(hole.getAttribute('r')).toBe((outer * DONUT_HOLE).toFixed(1))
    expect(hole.getAttribute('fill')).toBe('var(--pele-bg)')
    // the inert outer marker carries the outer radius for verifiers
    const markers = exported.querySelectorAll('circle.pieOuterCircle')
    expect(markers).toHaveLength(1)
    expect(markers[0].getAttribute('r')).toBe(String(outer))
    expect(markers[0].getAttribute('fill')).toBe('none')
    // paint order: the hole is inserted after the slice paths
    const markup = exported.innerHTML
    expect(markup.indexOf('pieDonutHole')).toBeGreaterThan(markup.indexOf('class="pele-slice"'))
    // live parity: the exported hole equals the editor SVG processed by the same function
    const liveDoc = document.createElement('div')
    liveDoc.innerHTML = liveProcessed
    expect(hole.getAttribute('r')).toBe(liveDoc.querySelector('circle.pieDonutHole').getAttribute('r'))
    expect(hole.getAttribute('fill')).toBe(liveDoc.querySelector('circle.pieDonutHole').getAttribute('fill'))
    // idempotent post-processing — no duplicate holes
    expect(postProcessPeleSvg(markup, 'pie')).toBe(markup)
  })
  it('exports kanban with the surface card remap byte-equal to postProcessPeleSvg', async () => {
    const raw = rawExportRender(KANBAN_SOURCE)
    expect(raw.type).toBe('kanban')
    const [exported] = await exportDiagrams([KANBAN_SOURCE])
    const markup = exported.innerHTML
    expect(markup).toContain('fill="var(--pele-surface)" stroke="var(--_b)" stroke-opacity="0.35"')
    expect(markup).toContain('fill="var(--pele-surface-alt)"')
    expect(markup).not.toMatch(/fill="var\(--_s\)"/)
    expect(markup).not.toMatch(/fill="var\(--_bg\)" stroke="var\(--_b\)"/)
    // the one permitted whole-SVG byte comparison: against the same
    // function's own deterministic output on the identical raw render
    expect(markup).toBe(domRoundTrip(postProcessPeleSvg(raw.svg, raw.type)))
  })
  it('keeps flowchart exports a post-processing no-op', async () => {
    const raw = rawExportRender(FLOW_SOURCE)
    expect(raw.type).toBe('flowchart')
    const [exported] = await exportDiagrams([FLOW_SOURCE])
    const markup = exported.innerHTML
    expect(markup).toBe(domRoundTrip(postProcessPeleSvg(raw.svg, raw.type)))
    expect(markup).not.toContain('pieDonutHole')
    expect(markup).not.toContain('stroke-opacity="0.35"')
  })
  const EXPORT_DOC = [
    '# Parity export',
    '',
    '```mermaid',
    PIE_SOURCE,
    '```',
    '',
    '```mermaid',
    KANBAN_SOURCE,
    '```',
    ''
  ].join('\n')
  const parseStyleVars = (css) => {
    const vars = {}
    for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      vars[m[1]] = m[2].trim()
    }
    return vars
  }
  it('both export APIs carry the processed SVGs and generate() keeps the pele variables', async () => {
    const rendered = await new ExportHtml(EXPORT_DOC, null).renderHtml()
    expect(rendered).toContain('class="mermaid"')
    expect(rendered).toContain('class="pieDonutHole"')
    expect(rendered).toContain('class="pieOuterCircle"')
    expect(rendered).toContain('fill="var(--pele-bg)"')
    expect(rendered).toContain('fill="var(--pele-surface)" stroke="var(--_b)" stroke-opacity="0.35"')
    expect(rendered).toContain('fill="var(--pele-surface-alt)"')

    const html = await new ExportHtml(EXPORT_DOC, null).generate({
      printOptimization: false,
      title: 't',
      extraCss: '',
      toc: null
    })
    expect(html).toContain('class="pieDonutHole"')
    expect(html).toContain('fill="var(--pele-surface)" stroke="var(--_b)" stroke-opacity="0.35"')
    // the standalone document retains the variables the hole and the kanban
    // surfaces resolve
    const block = /<style>:root \{([\s\S]*?)\}<\/style>/.exec(html)
    expect(block, 'generate() inlines a <style>:root { … } pele block').not.toBeNull()
    const inlined = parseStyleVars(block[1])
    expect(inlined['pele-bg']).toBeTruthy()
    expect(inlined['pele-surface']).toBeTruthy()
    expect(inlined['pele-surface-alt']).toBeTruthy()
  })
  it('mixed repeated/invalid document keeps one hole per pie, unique prefixes and no override drift', async () => {
    const getExportOverride = vi.fn()
    render.mockClear()
    const diagrams = await exportDiagrams(
      [PIE_SOURCE, INVALID_SOURCE, PIE_SOURCE],
      { diagramAppearance: { getExportOverride } }
    )
    expect(diagrams).toHaveLength(3)
    // exactly one hole per pie — none introduced, none duplicated
    expect(diagrams[0].querySelectorAll('circle.pieDonutHole')).toHaveLength(1)
    expect(diagrams[2].querySelectorAll('circle.pieDonutHole')).toHaveLength(1)
    // the invalid block still takes the placeholder through the catch boundary
    expect(diagrams[1].textContent).toBe('< Invalid Mermaid Codes >')
    // unique pele-export-0/1/2 allocation intact after invalid input
    expect(render.mock.calls.map(([, options]) => options.idPrefix)).toEqual([
      'pele-export-0',
      'pele-export-1',
      'pele-export-2'
    ])
    // the invalid block never reaches appearance application, and the third
    // occurrence kept its own index — no index drift after invalid input
    expect(getExportOverride.mock.calls).toEqual([[0, PIE_SOURCE], [2, PIE_SOURCE]])
    // post-processing applied exactly once per pie — idempotent on the result
    for (const index of [0, 2]) {
      expect(postProcessPeleSvg(diagrams[index].innerHTML, 'pie')).toBe(diagrams[index].innerHTML)
    }
  })
})
