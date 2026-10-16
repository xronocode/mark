// FILE: tests/renderer/muya/mermaid-theme.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-003/T-004 Mermaid theme engine — OKLCH categorical palette properties, render-time theme-token reading from the document's CSS variables, diagram type detection for all 22 types (init/frontmatter skipped), per-type config (quadrant single hue, radar series scale, sankey dark-only blend CSS, architecture attribute CSS, c4 keys, gantt/journey/packet/timeline lab sizes vs fit-column), and the theme signature that keys the SVG cache.
//   SCOPE: src/muya/lib/parser/render/mermaidTheme.js pure API; exportHtml wiring lives in export-mermaid-theme.test.js, pipeline behaviour in mermaid-pipeline.test.js.
//   DEPENDS: src/muya/lib/parser/render/mermaidTheme.js, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-51 T-003/T-004; .grace/verification/runtime.xml V-M-012 scenario-17; START_BLOCK_MERMAID_*.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PAPER_TOKENS / INK_TOKENS - lab theme tokens used as fixed inputs.
//   srgb2lin / lightnessOf - hex → Oklab lightness (round-trip check of the equal-lightness palette).
//   hueDist - circular hue distance in degrees.
//   setRootVars - jsdom inline CSS-variable fixture for readActiveThemeTokens.
//   PAPER_VARS - Paper theme CSS-variable fixture.
//   INK_TOKENS - Ink token set.
//   clearRootVars - removes the fixture variables and the dark flag.
//   lightnessOf - OKLCH lightness of a hex (palette assertions).
//   seriesFor - series palette helper for the assertions.
//   tintsFor - tint palette helper for the assertions.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-16 C-51 T-012: the primaryColor/
//   primaryBorderColor/primaryTextColor pins follow the node colours
//   derived against the code-block panel (nodeContrastColors) — the raw
//   surface/border tokens fail the panel gates in both light and dark
//   themes. The exhaustive per-theme gate lives in
//   mermaid-node-contrast.test.js.
//   v1.0.0 - 2026-10-16 C-51 T-003/T-004: first version. Every
//   case fails against the pre-C-51 pipeline (module did not exist).
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  oklch,
  hueOf,
  palette,
  DEFAULT_MERMAID_FONT,
  MERMAID_THEME_TYPES,
  readActiveThemeTokens,
  detectMermaidDiagramType,
  buildMermaidThemeConfig,
  mermaidThemeSignature,
  nodeContrastColors,
  wcagContrast,
  blendHex,
  postProcessMermaidSvg,
  MARKER_SCALE,
  DONUT_HOLE
} from 'muya/lib/parser/render/mermaidTheme'

// The accepted lab themes (paper/ink) as fixed token inputs — product code
// reads them from CSS variables; these tests exercise the config builder.
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

// ── OKLCH round-trip helpers ─────────────────────────────────────────
const srgb2lin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))

const lightnessOf = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  const r = srgb2lin(((n >> 16) & 255) / 255)
  const g = srgb2lin(((n >> 8) & 255) / 255)
  const b = srgb2lin((n & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.536301541 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

const hueDist = (a, b) => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

const seriesFor = (t) => palette(t.accent, t.dark ? 0.74 : 0.6, t.dark ? 0.11 : 0.12)
const tintsFor = (t) => palette(t.accent, t.dark ? 0.36 : 0.9, t.dark ? 0.05 : 0.05)

// ── CSS-variable fixtures ────────────────────────────────────────────
const PAPER_VARS = {
  '--themeColor': '#9A6F00',
  '--editorColor': '#22252B',
  '--editorBgColor': '#FBF8F2',
  '--floatBgColor': '#FFFDF8',
  '--codeBlockBgColor': '#F2ECE1',
  '--tableBorderColor': '#E4DBCB',
  '--chromeFontFamily': 'system-ui, sans-serif'
}

const setRootVars = (vars) => {
  const root = document.documentElement
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
}

const clearRootVars = () => {
  const root = document.documentElement
  for (const name of Object.keys(PAPER_VARS)) root.style.removeProperty(name)
  document.body.classList.remove('dark')
}

beforeEach(() => {
  clearRootVars()
})

afterEach(() => {
  clearRootVars()
})

// ── palette ──────────────────────────────────────────────────────────
describe('mermaidTheme palette (C-51 T-003)', () => {
  it('builds 8 distinct categorical hues at one perceived lightness', () => {
    const p = palette('#9A6F00', 0.6, 0.12)
    expect(p).toHaveLength(8)
    expect(new Set(p).size).toBe(8)
    for (const c of p) expect(c).toMatch(/^#[0-9a-f]{6}$/)

    // Equal OKLCH lightness ± tolerance (8-bit sRGB quantization only).
    const Ls = p.map(lightnessOf)
    const spread = Math.max(...Ls) - Math.min(...Ls)
    expect(spread).toBeLessThan(0.02)

    // The fixed spread keeps neighbours apart: accent, +180°, +90°, +270°.
    const accentHue = hueOf(p[0])
    expect(hueDist(hueOf(p[1]), accentHue)).toBeGreaterThan(178)
    expect(hueDist(hueOf(p[2]), accentHue)).toBeGreaterThan(88)
    expect(hueDist(hueOf(p[3]), accentHue)).toBeGreaterThan(88)
  })

  it('hue 0 is the theme accent hue', () => {
    const p = palette('#9A6F00', 0.6, 0.12)
    expect(hueDist(hueOf(p[0]), hueOf('#9A6F00'))).toBeLessThan(2)
    expect(hueDist(hueOf(p[1]), hueOf('#9A6F00'))).toBeGreaterThan(178)
    expect(hueDist(hueOf(p[2]), hueOf('#9A6F00'))).toBeGreaterThan(88)
  })

  it('light and dark palettes sit in separate lightness ranges', () => {
    const light = palette('#9A6F00', 0.6, 0.12)
    const dark = palette('#FFCF1A', 0.74, 0.11)
    for (let i = 0; i < 8; i++) {
      expect(lightnessOf(dark[i])).toBeGreaterThan(lightnessOf(light[i]))
    }
    for (const c of light) {
      expect(lightnessOf(c)).toBeGreaterThan(0.55)
      expect(lightnessOf(c)).toBeLessThan(0.65)
    }
    for (const c of dark) {
      expect(lightnessOf(c)).toBeGreaterThan(0.7)
      expect(lightnessOf(c)).toBeLessThan(0.78)
    }
  })

  it('oklch converts to sRGB hex (spot checks)', () => {
    expect(oklch(1, 0, 0)).toBe('#ffffff')
    expect(oklch(0, 0, 0)).toBe('#000000')
    expect(oklch(0.5, 0.12, 30)).toMatch(/^#[0-9a-f]{6}$/)
  })
})

// ── theme token reading ──────────────────────────────────────────────
describe('readActiveThemeTokens (C-51 T-003)', () => {
  it('maps the theme CSS variables to mermaid tokens', () => {
    setRootVars(PAPER_VARS)
    const t = readActiveThemeTokens()
    expect(t.dark).toBe(false)
    expect(t.accent).toBe('#9a6f00')
    expect(t.bg).toBe('#fbf8f2')
    expect(t.surface).toBe('#fffdf8')
    expect(t.text).toBe('#22252b')
    expect(t.border).toBe('#e4dbcb')
    expect(t.code).toBe('#f2ece1')
    expect(t.font).toBe('system-ui, sans-serif')
    // muted/line are deterministic text-over-bg blends of the same theme.
    expect(t.muted).toMatch(/^#[0-9a-f]{6}$/)
    expect(t.muted).not.toBe(t.bg)
    expect(t.line).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('the body dark flag flips the token set', () => {
    setRootVars(PAPER_VARS)
    document.body.classList.add('dark')
    const t = readActiveThemeTokens()
    expect(t.dark).toBe(true)
  })

  it('falls back to the brand defaults when no variables resolve', () => {
    const t = readActiveThemeTokens()
    expect(t.bg).toBe('#fbf8f2')
    expect(t.text).toBe('#22252b')
    expect(t.accent).toBe('#9a6f00')
    expect(t.surface).toBe(t.bg)
    expect(t.border).toMatch(/^#[0-9a-f]{6}$/)
    expect(t.font).toBe(DEFAULT_MERMAID_FONT)
  })

  it('keeps colour channels intact (review: 0..255 vs 0..1 clamp bug)', () => {
    expect(blendHex('#9A6F00', '#9A6F00', 1)).toBe('#9a6f00')
    expect(blendHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('parses rgb() colour values', () => {
    setRootVars({ ...PAPER_VARS, '--themeColor': 'rgb(10, 20, 30)' })
    const t = readActiveThemeTokens()
    expect(t.accent).toBe('#0a141e')
  })
})

// ── type detection ───────────────────────────────────────────────────
describe('detectMermaidDiagramType (C-51 T-003)', () => {
  const TYPE_SAMPLES = [
    ['flowchart LR\nA-->B', 'flowchart'],
    ['graph TD\nA-->B', 'flowchart'],
    ['flowchart\nA-->B', 'flowchart'],
    ['sequenceDiagram\nA->>B: hi', 'sequence'],
    ['classDiagram\nclass A', 'class'],
    ['stateDiagram-v2\n[*] --> s', 'state'],
    ['stateDiagram\n[*] --> s', 'state'],
    ['erDiagram\nA ||--o{ B : has', 'er'],
    ['gantt\ntitle t\ndateFormat YYYY-MM-DD', 'gantt'],
    ['pie title Pets\n"cats" : 3', 'pie'],
    ['journey\ntitle t', 'journey'],
    ['gitGraph\ncommit', 'git'],
    ['mindmap\nroot((r))', 'mindmap'],
    ['timeline\ntitle t', 'timeline'],
    ['quadrantChart\ntitle t', 'quadrant'],
    ['xychart-beta\nx-axis [a]', 'xychart'],
    ['xychart\nx-axis [a]', 'xychart'],
    ['sankey-beta\na,b,1', 'sankey'],
    ['block-beta\ncolumns 1', 'block'],
    ['packet-beta\n0-7: "x"', 'packet'],
    ['kanban\ntodo[To do]', 'kanban'],
    ['architecture-beta\nservice s(server)', 'architecture'],
    ['radar-beta\naxis a["A"]', 'radar'],
    ['treemap-beta\n"a": 1', 'treemap'],
    ['requirementDiagram\nrequirement r {}', 'requirement'],
    ['C4Context\nPerson(p, "P")', 'c4'],
    ['C4Container\nPerson(p, "P")', 'c4'],
    ['C4Component\nPerson(p, "P")', 'c4'],
    ['C4Dynamic\nPerson(p, "P")', 'c4'],
    ['C4Deployment\nPerson(p, "P")', 'c4']
  ]

  it('detects all 22 types (plus keyword variants)', () => {
    const detected = new Set()
    for (const [code, expected] of TYPE_SAMPLES) {
      expect(detectMermaidDiagramType(code)).toBe(expected)
      detected.add(expected)
    }
    expect(MERMAID_THEME_TYPES).toHaveLength(22)
    for (const type of MERMAID_THEME_TYPES) expect(detected.has(type)).toBe(true)
  })

  it('skips blank lines, %% directives and comments before the type line', () => {
    expect(detectMermaidDiagramType('\n\n%%{init: {"theme":"dark"}}%%\nflowchart TD\nA-->B')).toBe('flowchart')
    expect(detectMermaidDiagramType('%% just a comment\npie\n"cats": 1')).toBe('pie')
    expect(detectMermaidDiagramType('   \n  \nsequenceDiagram\nA->>B: hi')).toBe('sequence')
  })

  it('skips a YAML frontmatter config block before the type line', () => {
    expect(
      detectMermaidDiagramType('---\nconfig:\n  theme: dark\n---\nsequenceDiagram\nA->>B: hi')
    ).toBe('sequence')
    expect(detectMermaidDiagramType('---\ntitle: x\n---\ngantt\ndateFormat YYYY-MM-DD')).toBe('gantt')
  })

  it('handles CRLF line endings and returns unknown for non-diagrams', () => {
    expect(detectMermaidDiagramType('sequenceDiagram\r\nA->>B: hi')).toBe('sequence')
    expect(detectMermaidDiagramType('hello world\nnot a diagram')).toBe('unknown')
    expect(detectMermaidDiagramType('')).toBe('unknown')
    expect(detectMermaidDiagramType(undefined)).toBe('unknown')
  })
})

// ── config builder ───────────────────────────────────────────────────
describe('buildMermaidThemeConfig (C-51 T-003/T-004)', () => {
  it('uses theme base + look neo with the theme font', () => {
    const cfg = buildMermaidThemeConfig(PAPER_TOKENS, 'flowchart')
    expect(cfg.theme).toBe('base')
    expect(cfg.look).toBe('neo')
    expect(cfg.fontFamily).toBe(PAPER_TOKENS.font)
    expect(cfg.themeVariables.fontFamily).toBe(PAPER_TOKENS.font)
  })

  it('flowchart/sequence colours derive from the theme tokens against the panel (T-012)', () => {
    const v = buildMermaidThemeConfig(PAPER_TOKENS, 'flowchart').themeVariables
    const node = nodeContrastColors(PAPER_TOKENS)
    expect(v.mainBkg).toBeUndefined() // derived by Mermaid so %%{init}%% primaryColor wins
    expect(v.primaryColor).toBe(node.fill)
    expect(v.primaryTextColor).toBe(node.text)
    expect(v.primaryBorderColor).toBe(node.border)
    expect(v.lineColor).toBe(node.line)
    expect(v.background).toBe(PAPER_TOKENS.bg)
    // The pre-T-012 surface/hairline pair failed the panel gates (Paper's
    // surface is 1.15:1 and its border 1.16:1 on the code-block panel).
    expect(v.primaryColor).not.toBe(PAPER_TOKENS.surface)
    expect(v.primaryBorderColor).not.toBe(PAPER_TOKENS.border)
    expect(wcagContrast(v.primaryBorderColor, PAPER_TOKENS.code)).toBeGreaterThanOrEqual(3)
  })

  it('never emits the mermaid default palette or Trebuchet', () => {
    for (const tokens of [PAPER_TOKENS, INK_TOKENS]) {
      const text = JSON.stringify(buildMermaidThemeConfig(tokens, 'flowchart')).toLowerCase()
      expect(text).not.toContain('ececff')
      expect(text).not.toContain('9370db')
      expect(text).not.toContain('trebuchet')
    }
  })

  it('categorical scales: tints for areas, series colours for pie/git/xychart', () => {
    const v = buildMermaidThemeConfig(PAPER_TOKENS, 'flowchart').themeVariables
    const series = seriesFor(PAPER_TOKENS)
    const tint = tintsFor(PAPER_TOKENS)
    expect(v.cScale0).toBe(tint[0])
    expect(v.cScale8).toBe(tint[0]) // 12 scale slots wrap the 8 hues
    expect(v.cScale11).toBe(tint[3])
    expect(v.pie1).toBe(series[0])
    expect(v.pie2).toBe(series[1])
    expect(v.pie4).toBe(series[3])
    expect(v.git0).toBe(series[0])
    expect(v.git7).toBe(series[7])
    expect(v.fillType0).toBe(tint[0])
    expect(v.actor0).toBe(series[0])
    expect(v.xyChart.plotColorPalette).toBe(series.join(', '))
    expect(v.pieSectionTextColor).toBe('#ffffff') // Keynote: white on every theme // light
  })

  it('dark tokens flip the series range and label plates', () => {
    const light = buildMermaidThemeConfig(PAPER_TOKENS, 'flowchart').themeVariables
    const dark = buildMermaidThemeConfig(INK_TOKENS, 'flowchart').themeVariables
    expect(light.pie1).not.toBe(dark.pie1)
    expect(light.pieSectionTextColor).toBe('#ffffff')
    expect(dark.pieSectionTextColor).toBe('#ffffff') // Keynote: white on every theme
    expect(dark.gitBranchLabel0).toBe('#111')
    expect(light.gitBranchLabel0).toBe('#fff')
  })

  it('quadrant uses one hue by lightness (D-4)', () => {
    const v = buildMermaidThemeConfig(PAPER_TOKENS, 'quadrant').themeVariables
    const accentHue = hueOf(PAPER_TOKENS.accent)
    // The generated fills share the accent hue (tolerance covers the
    // 8-bit quantization of the low-chroma lightness steps); the third
    // quadrant is the theme surface by design, so its hue is the theme's.
    for (const f of [v.quadrant1Fill, v.quadrant2Fill, v.quadrant4Fill]) {
      expect(hueDist(hueOf(f), accentHue)).toBeLessThan(15)
    }
    const fills = [v.quadrant1Fill, v.quadrant2Fill, v.quadrant3Fill, v.quadrant4Fill]
    expect(new Set(fills).size).toBe(4)
    expect(v.quadrant3Fill).toBe(PAPER_TOKENS.surface)
    expect(v.quadrantPointFill).toBe(seriesFor(PAPER_TOKENS)[0])
    expect(v.quadrantXAxisTextFill).toBe(PAPER_TOKENS.muted)
  })

  it('radar draws its curves with series colours and the lab config', () => {
    const cfg = buildMermaidThemeConfig(PAPER_TOKENS, 'radar')
    const series = seriesFor(PAPER_TOKENS)
    expect(cfg.themeVariables.cScale0).toBe(series[0])
    expect(cfg.themeVariables.cScale1).toBe(series[1])
    expect(cfg.radar).toMatchObject({ curveTension: 0.12, useMaxWidth: true })
    expect(cfg.themeVariables.radar.axisLabelFontSize).toBe(13)
  })

  it('non-radar types keep the tint scale for areas', () => {
    const v = buildMermaidThemeConfig(PAPER_TOKENS, 'mindmap').themeVariables
    expect(v.cScale0).toBe(tintsFor(PAPER_TOKENS)[0])
  })

  it('sankey keeps gradient links; blend CSS is dark-only', () => {
    const light = buildMermaidThemeConfig(PAPER_TOKENS, 'sankey')
    const dark = buildMermaidThemeConfig(INK_TOKENS, 'sankey')
    expect(light.sankey).toMatchObject({
      showValues: true, prefix: ' ', linkColor: 'gradient', useMaxWidth: true
    })
    expect(light.themeCSS).not.toContain('mix-blend-mode')
    expect(dark.themeCSS).toContain('mix-blend-mode: normal')
    expect(dark.themeCSS).toContain('.link')
  })

  it('architecture repaints the built-in icon tiles via attribute CSS', () => {
    const cfg = buildMermaidThemeConfig(PAPER_TOKENS, 'architecture')
    expect(cfg.themeCSS).toContain('rect[style*="#087ebf"]')
    expect(cfg.themeCSS).toContain('[style*="fill: #fff"]')
  })

  it('c4 colours ride the c4 config keys (D-5)', () => {
    const cfg = buildMermaidThemeConfig(PAPER_TOKENS, 'c4')
    const c = cfg.c4
    expect(c.person_bg_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(c.system_bg_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(c.container_bg_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(c.component_bg_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(c.person_bg_color).not.toBe(c.system_bg_color)
    expect(c.system_bg_color).not.toBe(c.container_bg_color)
    expect(c.container_bg_color).not.toBe(c.component_bg_color)
    expect(c.external_system_bg_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(c.person_border_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(c.personFontSize).toBe(14)
    expect(c.personFontFamily).toBe(PAPER_TOKENS.font)
    expect(c.useMaxWidth).toBe(true)
  })

  it('gantt/journey/packet/timeline use the lab sizes at natural width (T-004)', () => {
    const cfg = buildMermaidThemeConfig(PAPER_TOKENS, 'gantt')
    expect(cfg.gantt).toMatchObject({ useMaxWidth: false, useWidth: 720, fontSize: 13, sectionFontSize: 13 })
    expect(cfg.journey).toMatchObject({ useMaxWidth: false, taskFontSize: 14 })
    expect(cfg.timeline).toMatchObject({ useMaxWidth: false, padding: 8 })
    expect(cfg.packet).toMatchObject({ useMaxWidth: false, bitWidth: 20, rowHeight: 34, bitsPerRow: 32 })
    const v = cfg.themeVariables
    expect(v.packet.labelFontSize).toBe('13px')
    expect(v.taskTextColor).toBe(PAPER_TOKENS.text)
    expect(v.taskBkgColor).toBe(tintsFor(PAPER_TOKENS)[0])
  })

  it('every other type keeps the C-34 fit-column useMaxWidth:true', () => {
    const cfg = buildMermaidThemeConfig(PAPER_TOKENS, 'flowchart')
    for (const key of [
      'flowchart', 'sequence', 'class', 'state', 'er', 'pie', 'quadrantChart',
      'xyChart', 'requirement', 'architecture', 'mindmap', 'kanban', 'gitGraph',
      'sankey', 'block', 'radar', 'ishikawa', 'treeView', 'venn'
    ]) {
      expect(cfg[key].useMaxWidth).toBe(true)
    }
    expect(cfg.flowchart).toMatchObject({ curve: 'basis', nodeSpacing: 44, rankSpacing: 52 })
    expect(cfg.sequence).toMatchObject({ mirrorActors: false, actorMargin: 60 })
    expect(cfg.xyChart).toMatchObject({ width: 640, height: 380 })
  })

  it('unknown types still get a fully themed config', () => {
    const cfg = buildMermaidThemeConfig(PAPER_TOKENS, 'unknown')
    expect(cfg.theme).toBe('base')
    expect(cfg.themeVariables.primaryColor).toBe(nodeContrastColors(PAPER_TOKENS).fill)
  })
})

// ── cache-key signature ──────────────────────────────────────────────
describe('mermaidThemeSignature (C-51 T-003)', () => {
  it('changes with the theme (identity and palette)', () => {
    expect(mermaidThemeSignature(PAPER_TOKENS)).not.toBe(mermaidThemeSignature(INK_TOKENS))
    // Same dark flag, different accent: a light→light switch also misses.
    const otherAccent = { ...PAPER_TOKENS, accent: '#3584E4' }
    expect(mermaidThemeSignature(PAPER_TOKENS)).not.toBe(mermaidThemeSignature(otherAccent))
    // Auto light/dark flip with the same accent also changes the signature.
    const flipped = { ...PAPER_TOKENS, dark: true }
    expect(mermaidThemeSignature(PAPER_TOKENS)).not.toBe(mermaidThemeSignature(flipped))
  })

  it('is stable for identical tokens and safe as a key prefix', () => {
    const sig = mermaidThemeSignature(PAPER_TOKENS)
    expect(sig).toBe(mermaidThemeSignature({ ...PAPER_TOKENS }))
    expect(typeof sig).toBe('string')
    expect(sig.length).toBeGreaterThan(0)
    expect(sig.length).toBeLessThan(100)
    expect(sig).not.toContain(':')
  })
})

// ── review additions 2026-10-16 ──────────────────────────────────────
describe('C-51 review: arrowheads, Keynote pie, theme palette hook', () => {
  it('shrinks markers per type and adds a viewBox to markers without one', () => {
    const svg = '<svg><marker id="a" markerWidth="12" markerHeight="12" viewBox="0 0 10 10"></marker><marker id="b" markerWidth="20" markerHeight="14"></marker></svg>'
    const out = postProcessMermaidSvg(svg, 'block')
    expect(out).toContain(`markerWidth="${(12 * MARKER_SCALE.block).toFixed(2)}"`)
    expect(out).toContain('viewBox="0 0 20 14"')
    expect(out).toContain(`markerWidth="${(20 * MARKER_SCALE.block).toFixed(2)}"`)
  })

  it('leaves sequence and ER markers alone', () => {
    const svg = '<svg><marker markerWidth="12" markerHeight="12"></marker></svg>'
    expect(postProcessMermaidSvg(svg, 'sequence')).toBe(svg)
    expect(postProcessMermaidSvg(svg, 'er')).toBe(svg)
  })

  it('pie is Keynote-style: separators in the background colour, no outer ring, white labels', () => {
    const v = buildMermaidThemeConfig(PAPER_TOKENS, 'pie').themeVariables
    expect(v.pieStrokeColor).toBe(PAPER_TOKENS.bg)
    expect(v.pieOuterStrokeWidth).toBe('0px')
    expect(v.pieSectionTextColor).toBe('#ffffff')
  })

  it('a theme-defined chart palette replaces the generated one and changes the signature', () => {
    const apple = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#30b0c7', '#ffcc00', '#ff2d55']
    const withPalette = { ...PAPER_TOKENS, series: apple }
    expect(buildMermaidThemeConfig(withPalette, 'pie').themeVariables.pie1).toBe('#007aff')
    expect(mermaidThemeSignature(withPalette)).not.toBe(mermaidThemeSignature(PAPER_TOKENS))
  })

  it('reads --chartPalette from the theme variables', () => {
    setRootVars({ ...PAPER_VARS, '--chartPalette': '#007AFF, #34C759, #FF9500, #FF3B30, #AF52DE, #30B0C7' })
    expect(readActiveThemeTokens().series).toEqual(['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#30b0c7'])
    document.documentElement.style.removeProperty('--chartPalette')
  })
})

describe('C-51 donut pie (user 2026-10-16)', () => {
  const PIE = '<g transform="translate(225,225)"><circle cx="0" cy="0" r="186" class="pieOuterCircle"></circle>' +
    '<path d="M0,-185A185,185,0,0,1,46,179L0,0Z" fill="#007aff" class="pieCircle"></path>' +
    '<text transform="translate(137,-17)" class="slice">46%</text></g>'

  it('inserts a hole in the panel colour right before the labels', () => {
    const out = postProcessMermaidSvg(PIE, 'pie', PAPER_TOKENS)
    const hole = `<circle cx="0" cy="0" r="${(185 * DONUT_HOLE).toFixed(1)}" class="pieDonutHole" fill="${PAPER_TOKENS.code}" stroke="none"></circle>`
    expect(out).toContain(hole + '<text')
    expect(out.indexOf('pieDonutHole')).toBeGreaterThan(out.indexOf('class="pieCircle"'))
  })

  it('is idempotent and leaves other types alone', () => {
    const once = postProcessMermaidSvg(PIE, 'pie', PAPER_TOKENS)
    expect(postProcessMermaidSvg(once, 'pie', PAPER_TOKENS)).toBe(once)
    expect(postProcessMermaidSvg(PIE, 'flowchart', PAPER_TOKENS)).toBe(PIE)
  })

  it('keeps the labels on the ring (hole smaller than the 0.75 label radius)', () => {
    expect(DONUT_HOLE).toBeLessThan(0.7)
  })
})
