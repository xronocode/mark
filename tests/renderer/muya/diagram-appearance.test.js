// FILE: tests/renderer/muya/diagram-appearance.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify portable metadata preservation, safe bounded author palettes and local fixed-color policy.
//   SCOPE: Pure source helpers and real Pele SVG paint normalization.
//   DEPENDS: Vitest, yaml, pele, muya/lib/utils/diagramAppearance.
//   LINKS: .grace/changes/archive/C-62 T-001; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   SOURCE - plain diagram with author comments.
//   CUSTOM - YAML author palette fixture with a retained comment.
//   preview - real Pele SVG wrapper for paint-policy assertions.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-62: source-preserving metadata, palette safety and rendered-paint regression cases.
// END_CHANGE_SUMMARY
import { describe, expect, it } from 'vitest'
import { render } from 'pele'
import { applyDiagramAppearance, readDiagramAppearance, stripDiagramAppearance, writeDiagramAppearance } from 'muya/lib/utils/diagramAppearance'

const SOURCE = '%% keep this comment\nflowchart LR\n  A[Alpha] --> B[Beta]\n'
const CUSTOM = '---\nconfig:\n  theme: base\n  themeVariables:\n    # keep my colors\n    background: "#fff7e8"\n    primaryColor: "#ffe0b2"\n    primaryTextColor: "#3c352d"\n    pie1: "#123456"\n---\n' + SOURCE
const preview = code => {
  const element = document.createElement('div')
  element.innerHTML = render(code).svg
  return element
}

describe('diagram appearance source and policy', () => {
  it('keeps Auto implicit and adds only a portable comment', () => {
    expect(writeDiagramAppearance(SOURCE, 'auto')).toBe(SOURCE)
    const selected = writeDiagramAppearance(SOURCE, 'dark')
    expect(selected).toBe('%% mark:appearance dark %%\n' + SOURCE)
    expect(stripDiagramAppearance(selected)).toBe(SOURCE)
    expect(writeDiagramAppearance(selected, 'dark')).toBe(selected)
    expect(writeDiagramAppearance(selected, 'auto')).toBe(SOURCE)
    expect(() => render(selected)).not.toThrow()
  })
  it('preserves all author YAML, formatting and comments while cycling', () => {
    for (const mode of ['light', 'dark', 'custom']) {
      const selected = writeDiagramAppearance(CUSTOM, mode)
      expect(selected).toContain('---\n%% mark:appearance ' + mode + ' %%\n%% keep')
      expect(stripDiagramAppearance(selected)).toBe(CUSTOM)
      expect(writeDiagramAppearance(selected, 'auto')).toBe(CUSTOM)
      expect(readDiagramAppearance(selected).mode).toBe(mode)
    }
  })
  it('keeps CRLF and ignores lookalikes in the diagram body', () => {
    const source = SOURCE.replaceAll('\n', '\r\n')
    expect(writeDiagramAppearance(source, 'light')).toBe('%% mark:appearance light %%\r\n' + source)
    const body = 'flowchart LR\nA["first\n%% mark:appearance dark %%\nlast"]'
    expect(readDiagramAppearance(body).mode).toBe('auto')
    expect(stripDiagramAppearance(body)).toBe(body)
  })
  it('normalizes duplicate/invalid header modes deterministically', () => {
    const source = '%% mark:appearance dark %%\n%% mark:appearance invalid %%\n' + SOURCE
    expect(readDiagramAppearance(source).mode).toBe('auto')
    const next = writeDiagramAppearance(source, 'light')
    expect(next.match(/mark:appearance/g)).toHaveLength(1)
    expect(stripDiagramAppearance(next)).toBe(SOURCE)
    expect(() => writeDiagramAppearance(SOURCE, 'sepia')).toThrow()
    expect(writeDiagramAppearance('%% mark:appearance invalid %%\n' + SOURCE, 'auto')).toBe(SOURCE)
  })
  it('reads safe author YAML and falls back when Custom has no palette', () => {
    const custom = readDiagramAppearance(CUSTOM, 'custom')
    expect(custom.hasCustom).toBe(true)
    expect(custom.palette).toMatchObject({ '--pele-bg': '#fff7e8', '--pele-surface': '#ffe0b2', '--pele-fg': '#3c352d', '--pele-series-1': '#123456' })
    expect(readDiagramAppearance(SOURCE, 'custom')).toMatchObject({ mode: 'auto', hasCustom: false })
  })
  it('supports JSON and YAML-compatible legacy init directives', () => {
    for (const directive of ['{"themeVariables":{"primaryColor":"#abc123"}}', "{'themeVariables': {'primaryColor': '#abc123'}}"]) {
      expect(readDiagramAppearance('%%{init: ' + directive + '}%%\n' + SOURCE, 'custom')).toMatchObject({ mode: 'custom', palette: { '--pele-surface': '#abc123' } })
    }
  })
  it('rejects malformed, duplicate-key, oversized and nonliteral color configs', () => {
    for (const yaml of ['config: [', 'config:\n themeVariables:\n  primaryColor: "#fff"\n  primaryColor: "#000"', 'config:\n themeVariables:\n  primaryColor: "url(https://example.com/x)"', 'config:\n themeVariables:\n  primaryColor: "#fff;--pele-fg:red"', '#'.repeat(16385)]) {
      expect(readDiagramAppearance('---\n' + yaml + '\n---\n' + SOURCE, 'custom').hasCustom).toBe(false)
    }
  })
  it('isolates fixed/custom variables and removes stale overrides on Auto', () => {
    const first = preview(SOURCE)
    const other = preview(SOURCE)
    applyDiagramAppearance(first, CUSTOM, 'custom')
    expect(first.style.getPropertyValue('--pele-surface')).toBe('#ffe0b2')
    expect(first.querySelector('svg').style.backgroundColor).toBe('var(--pele-bg)')
    expect(other.style.cssText).toBe('')
    applyDiagramAppearance(first, CUSTOM, 'dark')
    expect(first.style.getPropertyValue('--pele-surface')).toBe('#303d55')
    applyDiagramAppearance(first, CUSTOM, 'auto')
    expect(first.style.getPropertyValue('--pele-surface')).toBe('')
    expect(first.style.backgroundColor).toBe('')
    expect(first.querySelector('svg').style.backgroundColor).toBe('')
  })
  it('keeps author inline styles in Auto/Custom and normalizes only displayed paint in forced modes', () => {
    const code = SOURCE + 'classDef custom fill:#ffeecc,color:#123456,stroke:#abcdef,stroke-width:3px\nclass A custom'
    expect(readDiagramAppearance(code).hasCustom).toBe(true)
    for (const mode of ['auto', 'custom', 'light', 'dark']) {
      const element = preview(code)
      applyDiagramAppearance(element, code, mode)
      const shape = element.querySelector('[data-id="A"] rect')
      expect(shape.style.fill).toBe(['auto', 'custom'].includes(mode) ? 'rgb(255, 238, 204)' : '')
      expect(shape.style.strokeWidth).toBe('3px')
      expect(shape.getAttribute('fill')).toBe('var(--_s)')
    }
    expect(render(code).svg).toContain('fill:#ffeecc')
  })
})
