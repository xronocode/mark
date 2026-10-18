// FILE: tests/renderer/muya/diagram-theme.test.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the shared diagram theme engine (renamed from mermaidTheme.js in C-55) — OKLCH categorical palette properties, render-time theme-token reading from the document's CSS variables (Paper pins), the WCAG node-contrast gates of nodeContrastColors, chartPalette (OKLCH generation vs theme-defined series), the C-55 R-3 buildPeleVariables --pele-* block (Paper literal pin matching the static stylesheet fallback, Ink L 0.74/C 0.11 series derivation, theme-defined series override + modulo wrap), and diagramThemeSignature.
//   SCOPE: src/muya/lib/parser/render/diagramTheme.js pure API; export wiring lives in export-pele-theme.test.js, pipeline behaviour in pele-pipeline.test.js, the all-32-themes gate in pele-node-contrast.test.js.
//   DEPENDS: src/muya/lib/parser/render/diagramTheme.js, Vitest + jsdom.
//   LINKS: .grace/changes/archive/C-55 R-3; .grace/changes/archive/C-51 T-003/T-004/T-005/T-012 and C-54 (node-contrast rules); .grace/verification/runtime.xml V-M-012 scenario-17; START_BLOCK_PELE_VARIABLES, START_BLOCK_DIAGRAM_*.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PAPER_TOKENS - light Paper token fixture (lowercase hex) whose buildPeleVariables output is frozen verbatim as the static :root --pele-* fallback in muya's stylesheet.
//   INK_TOKENS - dark Ink token fixture (the accepted lab values) for the dark-path derivations.
//   APPLE_SERIES - 8-colour theme-defined series fixture (the macOS family's Apple system colours).
//   srgb2lin - sRGB channel → linear light (the Oklab math shared by the lightness helper).
//   lightnessOf - hex → Oklab lightness (equal-lightness palette checks and the ΔL fill rule).
//   hueDist - circular hue distance in degrees.
//   PAPER_VARS - Paper theme CSS-variable fixture for readActiveThemeTokens.
//   setRootVars - jsdom inline CSS-variable fixture for readActiveThemeTokens.
//   clearRootVars - removes the fixture variables and the dark flag.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-17 C-55: ported from mermaid-theme.test.js
//   v1.1.0 (git mv). Kept surviving surface: the OKLCH palette properties,
//   readActiveThemeTokens (incl. the Paper pin values, rgb() parsing, the
//   0..255 clamp regression pin, brand fallbacks), blendHex, and the theme
//   signature (renamed diagramThemeSignature, same digest semantics). The
//   --chartPalette theme hook test moved under chartPalette. DROPPED with
//   their removed exports: detectMermaidDiagramType, buildMermaidThemeConfig
//   (all per-type initialize/cScale/pie/quadrant/radar/sankey/c4/gantt
//   pins), postProcessMermaidSvg, MARKER_SCALE, DONUT_HOLE. ADDED for pele:
//   buildPeleVariables pins (Paper exact literal map incl. the stylesheet
//   fallback values --pele-bg #f2ece1 / --pele-surface #fffdf8 /
//   --pele-series-1..8, radius/title-weight/mono font; Ink series at
//   L 0.74/C 0.11; theme-defined series ≥6 wins and wraps modulo its
//   length), chartPalette generation-vs-override pins, and the
//   nodeContrastColors WCAG gates (border/line ≥ 3:1, text ≥ 4.5:1 on the
//   fill, labelText ≥ 4.5:1 on the panel, fill distinct, cluster distinct)
//   the old file exercised only through the mermaid config builder.
//   v1.1.0 - 2026-10-16 C-51 T-012: the primaryColor/primaryBorderColor/
//   primaryTextColor pins follow the node colours derived against the
//   code-block panel (nodeContrastColors).
//   v1.0.0 - 2026-10-16 C-51 T-003/T-004: first version.
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  oklch,
  hueOf,
  palette,
  chartPalette,
  DEFAULT_DIAGRAM_FONT,
  DEFAULT_PELE_MONO_FONT,
  readActiveThemeTokens,
  nodeContrastColors,
  wcagContrast,
  blendHex,
  buildPeleVariables,
  diagramThemeSignature
} from 'muya/lib/parser/render/diagramTheme'

// The accepted lab themes (paper/ink) as fixed token inputs — product code
// reads them from CSS variables; these tests exercise the pure builders.
// Paper is written lowercase because buildPeleVariables passes the tokens
// through verbatim: its output for this exact fixture is frozen as the
// static :root --pele-* pre-theme fallback in muya's stylesheet
// (lib/assets/styles/index.css — "the exact Paper light derivation").
const PAPER_TOKENS = {
  dark: false,
  accent: '#9a6f00',
  bg: '#fbf8f2',
  surface: '#fffdf8',
  text: '#22252b',
  muted: '#6e6a60',
  border: '#e4dbcb',
  line: '#8f8b81',
  code: '#f2ece1',
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

const APPLE_SERIES = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#30b0c7', '#ffcc00', '#ff2d55']

const setRootVars = (vars) => {
  const root = document.documentElement
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
}

const clearRootVars = () => {
  const root = document.documentElement
  for (const name of Object.keys(PAPER_VARS)) root.style.removeProperty(name)
  root.style.removeProperty('--chartPalette')
  document.body.classList.remove('dark')
}

beforeEach(() => {
  clearRootVars()
})

afterEach(() => {
  clearRootVars()
})

// ── palette ──────────────────────────────────────────────────────────
describe('diagramTheme palette (C-51 T-003)', () => {
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
  it('maps the theme CSS variables to diagram tokens', () => {
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
    expect(t.font).toBe(DEFAULT_DIAGRAM_FONT)
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

// ── categorical series palette ───────────────────────────────────────
describe('chartPalette (C-51 T-005 / C-55)', () => {
  it('generates the OKLCH palette from the accent when the theme defines no series', () => {
    expect(chartPalette(PAPER_TOKENS)).toEqual(palette(PAPER_TOKENS.accent, 0.6, 0.12))
    expect(chartPalette(INK_TOKENS)).toEqual(palette(INK_TOKENS.accent, 0.74, 0.11))
  })

  it('a theme-defined series of ≥ 6 colours replaces the generated one', () => {
    expect(chartPalette({ ...PAPER_TOKENS, series: APPLE_SERIES })).toEqual(APPLE_SERIES)
    // Fewer than 6 colours is not a palette — the OKLCH fallback applies.
    expect(chartPalette({ ...PAPER_TOKENS, series: APPLE_SERIES.slice(0, 4) })).toEqual(
      palette(PAPER_TOKENS.accent, 0.6, 0.12)
    )
  })

  it('reads --chartPalette from the theme variables', () => {
    setRootVars({ ...PAPER_VARS, '--chartPalette': '#007AFF, #34C759, #FF9500, #FF3B30, #AF52DE, #30B0C7' })
    expect(readActiveThemeTokens().series).toEqual(['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#30b0c7'])
  })
})

// ── node contrast gates ──────────────────────────────────────────────
describe('nodeContrastColors gates (C-51 T-012 / C-54)', () => {
  const gateCheck = (tokens) => {
    const node = nodeContrastColors(tokens)
    expect(node.panel).toBe(tokens.code)
    // Border and edges reach WCAG 1.4.11 (≥ 3:1) against the panel.
    expect(wcagContrast(node.border, node.panel)).toBeGreaterThanOrEqual(3)
    expect(wcagContrast(node.line, node.panel)).toBeGreaterThanOrEqual(3)
    // Node text keeps ≥ 4.5:1 on the fill; edge labels on the panel.
    expect(wcagContrast(node.text, node.fill)).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(node.labelText, node.panel)).toBeGreaterThanOrEqual(4.5)
    // The fill separates from the panel by the T-012 rule (WCAG ≥ 1.25 OR
    // OKLCH ΔL ≥ 0.06) — a dark-theme rule: C-54 R-1 lets a light theme
    // draw a white card instead (strictly lighter, ΔL ≥ 0.015) that reads
    // by its ≥ 3:1 border and shadow, already gated above.
    const dL = lightnessOf(node.fill) - lightnessOf(node.panel)
    const distinct = wcagContrast(node.fill, node.panel) >= 1.25 || Math.abs(dL) >= 0.06
    const lightCard = !tokens.dark && dL >= 0.015
    expect(distinct || lightCard).toBe(true)
    // Cluster bands are distinct from both the panel and the node fill.
    expect(new Set([node.clusterBkg, node.panel, node.fill]).size).toBe(3)
    return node
  }

  it('Paper (light): white cards over the panel with gated outlines', () => {
    const node = gateCheck(PAPER_TOKENS)
    // C-54 R-1: a light theme draws nodes as its (lighter) surface card.
    expect(node.fill).toBe(PAPER_TOKENS.surface)
  })

  it('Ink (dark): lifted fills and gated edges against the dark panel', () => {
    gateCheck(INK_TOKENS)
  })
})

// ── pele CSS variables ───────────────────────────────────────────────
describe('buildPeleVariables (C-55 R-3)', () => {
  it('Paper: exact variable map (the static pre-theme fallback derivation)', () => {
    const node = nodeContrastColors(PAPER_TOKENS)
    const series = chartPalette(PAPER_TOKENS)
    const vars = buildPeleVariables(PAPER_TOKENS)

    // Composition: expected values derive from the same fixture through
    // the module's own builders.
    expect(vars['--pele-bg']).toBe(node.panel)
    expect(vars['--pele-fg']).toBe(PAPER_TOKENS.text)
    expect(vars['--pele-muted']).toBe(node.labelText)
    expect(vars['--pele-line']).toBe(node.line)
    expect(vars['--pele-surface']).toBe(node.fill)
    expect(vars['--pele-surface-alt']).toBe(node.clusterBkg)
    expect(vars['--pele-border']).toBe(node.border)
    expect(vars['--pele-accent']).toBe(series[0])
    for (let i = 0; i < 8; i++) {
      expect(vars[`--pele-series-${i + 1}`]).toBe(series[i])
    }
    expect(vars['--pele-font']).toBe(PAPER_TOKENS.font)
    expect(vars['--pele-font-mono']).toBe(DEFAULT_PELE_MONO_FONT)

    // Pinned literals — the exact values frozen as the static :root
    // --pele-* fallback block in muya's stylesheet (pre-theme contexts).
    expect(vars).toEqual({
      '--pele-bg': '#f2ece1',
      '--pele-fg': '#22252b',
      '--pele-muted': '#6e6a60',
      '--pele-line': '#807f7d',
      '--pele-surface': '#fffdf8',
      '--pele-surface-alt': '#f9f5ed',
      '--pele-border': '#807f7d',
      '--pele-accent': '#a4780f',
      '--pele-font': PAPER_TOKENS.font,
      '--pele-font-mono': DEFAULT_PELE_MONO_FONT,
      '--pele-radius': '6px',
      '--pele-title-weight': '600',
      '--pele-series-1': '#a4780f',
      '--pele-series-2': '#577fc8',
      '--pele-series-3': '#009777',
      '--pele-series-4': '#b56088',
      '--pele-series-5': '#6d8d36',
      '--pele-series-6': '#936cb8',
      '--pele-series-7': '#0091ae',
      '--pele-series-8': '#bc644b'
    })
  })

  it('Ink (dark): series derive at L 0.74 / C 0.11 from the accent', () => {
    const vars = buildPeleVariables(INK_TOKENS)
    const darkSeries = palette(INK_TOKENS.accent, 0.74, 0.11)
    expect(chartPalette(INK_TOKENS)).toEqual(darkSeries)
    for (let i = 0; i < 8; i++) {
      expect(vars[`--pele-series-${i + 1}`]).toBe(darkSeries[i])
    }
    for (const c of darkSeries) {
      expect(lightnessOf(c)).toBeGreaterThan(0.7)
      expect(lightnessOf(c)).toBeLessThan(0.78)
    }

    // Base colours compose against the Ink panel; the look constants hold.
    const node = nodeContrastColors(INK_TOKENS)
    expect(vars['--pele-bg']).toBe(node.panel)
    expect(vars['--pele-fg']).toBe(INK_TOKENS.text)
    expect(vars['--pele-surface']).toBe(node.fill)
    expect(vars['--pele-radius']).toBe('6px')
    expect(vars['--pele-title-weight']).toBe('600')
    // Light and dark themes produce different series blocks.
    expect(vars['--pele-series-1']).not.toBe(buildPeleVariables(PAPER_TOKENS)['--pele-series-1'])
  })

  it('a theme-defined series (≥ 6 colours) wins over the OKLCH palette and wraps modulo its length', () => {
    const vars = buildPeleVariables({ ...PAPER_TOKENS, series: APPLE_SERIES })
    for (let i = 0; i < 8; i++) {
      expect(vars[`--pele-series-${i + 1}`]).toBe(APPLE_SERIES[i])
    }
    expect(vars['--pele-series-1']).not.toBe(chartPalette(PAPER_TOKENS)[0])
    expect(vars['--pele-accent']).toBe(APPLE_SERIES[0])

    // A 6-colour series wraps: series-7/8 reuse colours 1/2.
    const six = APPLE_SERIES.slice(0, 6)
    const wrapped = buildPeleVariables({ ...PAPER_TOKENS, series: six })
    expect(wrapped['--pele-series-6']).toBe(six[5])
    expect(wrapped['--pele-series-7']).toBe(six[0])
    expect(wrapped['--pele-series-8']).toBe(six[1])
  })
})

// ── theme signature ──────────────────────────────────────────────────
describe('diagramThemeSignature (C-51 T-003 / C-55)', () => {
  it('changes with the theme (identity and palette)', () => {
    expect(diagramThemeSignature(PAPER_TOKENS)).not.toBe(diagramThemeSignature(INK_TOKENS))
    // Same dark flag, different accent: a light→light switch also differs.
    const otherAccent = { ...PAPER_TOKENS, accent: '#3584e4' }
    expect(diagramThemeSignature(PAPER_TOKENS)).not.toBe(diagramThemeSignature(otherAccent))
    // Auto light/dark flip with the same accent also changes the signature.
    const flipped = { ...PAPER_TOKENS, dark: true }
    expect(diagramThemeSignature(PAPER_TOKENS)).not.toBe(diagramThemeSignature(flipped))
  })

  it('is stable for identical tokens and safe as a log field', () => {
    const sig = diagramThemeSignature(PAPER_TOKENS)
    expect(sig).toBe(diagramThemeSignature({ ...PAPER_TOKENS }))
    expect(typeof sig).toBe('string')
    expect(sig.length).toBeGreaterThan(0)
    expect(sig.length).toBeLessThan(100)
    expect(sig).not.toContain(':')
  })

  it('a theme-defined chart palette changes the signature', () => {
    const withPalette = { ...PAPER_TOKENS, series: APPLE_SERIES }
    expect(diagramThemeSignature(withPalette)).not.toBe(diagramThemeSignature(PAPER_TOKENS))
  })
})
