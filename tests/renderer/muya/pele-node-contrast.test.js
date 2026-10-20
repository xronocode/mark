// FILE: tests/renderer/muya/pele-node-contrast.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51/C-54 node-contrast derivation and its C-55 pele wiring — for EVERY registered theme (real theme CSS mirrored the way util/theme.js does, tokens through readActiveThemeTokens → nodeContrastColors/buildPeleVariables) the pele variable block maps the derivation 1:1 (exactly 20 variables: 8 token/derivation colours + fonts + radius + title-weight + series-1..8), the node border and line reach ≥ 3:1 on the code-block panel (WCAG 1.4.11), the node fill is visibly different (≥ 1.25:1 or OKLCH ΔL ≥ 0.06) or drawn as a light card, the node text keeps ≥ 4.5:1 on the fill, edge-label ink (--pele-muted = labelText) keeps ≥ 4.5:1 on the panel (--pele-bg), clusters differ from panel and fill, and the static Paper fallback in muya's stylesheet equals buildPeleVariables of its Paper token fixture (the fallback must never drift from the derivation).
//   SCOPE: nodeContrastColors/wcagContrast pure-API pins (the reported Ink bug, the prescribed 8–14 % lift band, the dim-text fallbacks, surface passthrough, cluster distinctness, determinism), the all-themes WCAG gate over src/renderer/src/assets/themes/*.theme.css, the all-themes buildPeleVariables composition gate, the index.css :root fallback parity gate, and the signature invalidation against the pre-C-55 digest.
//   DEPENDS: muya/lib/parser/render/diagramTheme (nodeContrastColors, wcagContrast, blendHex, readActiveThemeTokens, buildPeleVariables, diagramThemeSignature, chartPalette, DEFAULT_DIAGRAM_FONT, DEFAULT_PELE_MONO_FONT), @/config (dark classification), Vitest + jsdom, Node fs/path.
//   LINKS: .grace/changes/archive/C-55 R-3 (pele CSS-variable theming); .grace/changes/archive/C-51 T-012 (user 2026-10-16 "in the dark theme mermaid clearly has block contrast problems"); .grace/changes/archive/C-54 (light cards / label ink); .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root path (theme CSS and stylesheet discovery).
//   THEMES_DIR - src/renderer/src/assets/themes (top-level *.theme.css only).
//   STYLES_CSS - muya's index.css source (the pele :root fallback lives there).
//   readThemeCss - read one theme stylesheet from disk.
//   parseVars - extract a stylesheet's --name: value pairs (same shape as the C-41 contrast gate).
//   mirrorThemeVars - set every parsed theme variable as the root inline mirror (what util/theme.js addThemeStyle does) and flip body.dark.
//   clearThemeVars - remove the mirrored variables of one theme and the dark flag.
//   srgb2lin - sRGB channel → linear light (the Oklab math shared by the ΔL helper).
//   oklabLightness - hex → Oklab lightness 0-1 (the ΔL half of the fill rule; same math as the module-internal helper).
//   fillDistinctFromPanel - the fill rule: WCAG ≥ 1.25 OR ΔL ≥ 0.06.
//   readPeleFallbackVars - slice the C-55 :root fallback block out of muya's index.css and parse its variables.
//   normalizeCssValue - CSS-vs-JS cosmetic normalization (single → double quotes) so font stacks compare exactly.
//   PAPER_TOKENS - light lab theme tokens as fixed inputs (same fixture as diagram-theme.test.js).
//   INK_TOKENS - dark lab theme tokens as fixed inputs (same fixture as diagram-theme.test.js); the signature block reconstructs the pre-C-55 digest with describe-local djb2/preC55Signature helpers to prove the invalidation.
//   PAPER_FALLBACK_TOKENS - the Paper theme fixture the index.css :root fallback was derived from (code panel #f2ece1); the parity gate pins the stylesheet to buildPeleVariables of exactly these tokens.
//   EXPECTED_THEME_IDS - the 32 family members the gate covers.
//   EXPECTED_PELE_VAR_NAMES - the exact 20 --pele-* names buildPeleVariables emits.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-17 C-55 (ported from
//   mermaid-node-contrast.test.js): the WCAG gates survive verbatim on the
//   nodeContrastColors surface (fill distinct/border ≥ 3:1/line ≥ 3:1/text
//   ≥ 4.5:1 on fill/labelText ≥ 4.5:1 on panel/light-card rule); the
//   buildMermaidThemeConfig wiring assertions (edgeLabelBackground/
//   labelBackgroundColor boxes, actor/note colours, %%{init}%% override
//   headroom) are replaced by their buildPeleVariables equivalents —
//   --pele-bg is the panel the label boxes paint on and --pele-muted is the
//   label ink. NEW gates: every theme's buildPeleVariables block is exactly
//   the 20-variable nodeContrastColors/chartPalette composition, and the
//   static :root fallback in muya's index.css equals buildPeleVariables of
//   its Paper token fixture (zero drift). mermaidThemeSignature pins moved
//   to diagramThemeSignature with the pre-C-55 digest reconstruction.
// END_CHANGE_SUMMARY

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  nodeContrastColors,
  wcagContrast,
  blendHex,
  readActiveThemeTokens,
  buildPeleVariables,
  diagramThemeSignature,
  chartPalette,
  DEFAULT_DIAGRAM_FONT,
  DEFAULT_PELE_MONO_FONT
} from 'muya/lib/parser/render/diagramTheme'

const ROOT = resolve(__dirname, '..', '..', '..')
const THEMES_DIR = resolve(ROOT, 'src/renderer/src/assets/themes')
const STYLES_CSS = readFileSync(
  resolve(ROOT, 'src/muya/lib/assets/styles/index.css'),
  'utf-8'
)

const readThemeCss = (id) => readFileSync(resolve(THEMES_DIR, `${id}.theme.css`), 'utf-8')

const parseVars = (css) => {
  const vars = {}
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim()
  }
  return vars
}

// util/theme.js addThemeStyle mirrors every --var from the theme CSS onto
// the document element's inline style; readActiveThemeTokens reads that
// mirror first. Reproduce the mirror from the real theme file so the chain
// under test is the production one (same helper as the T-007 family test).
const mirrorThemeVars = (id, dark) => {
  const vars = parseVars(readThemeCss(id))
  const root = document.documentElement
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(`--${name}`, value)
  }
  document.body.classList.toggle('dark', Boolean(dark))
  return vars
}

const clearThemeVars = (id) => {
  const root = document.documentElement
  for (const name of Object.keys(parseVars(readThemeCss(id)))) {
    root.style.removeProperty(`--${name}`)
  }
  document.body.classList.remove('dark')
}

// START_BLOCK_T012_OKLAB
// Oklab lightness of a hex (Björn Ottosson's math) — the ΔL half of the
// fill distinguishability rule; mirrors the module-internal helper so the
// gate is computed independently of the code under test.
const srgb2lin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))

const oklabLightness = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  const r = srgb2lin(((n >> 16) & 255) / 255)
  const g = srgb2lin(((n >> 8) & 255) / 255)
  const b = srgb2lin((n & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.536301541 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

const fillDistinctFromPanel = (fill, panel) =>
  wcagContrast(fill, panel) >= 1.25 ||
  Math.abs(oklabLightness(fill) - oklabLightness(panel)) >= 0.06
// END_BLOCK_T012_OKLAB

// START_BLOCK_C55_FALLBACK_PARITY
// The static pre-theme fallback in muya's stylesheet (search marker
// "C-55: pele diagram theming fallbacks"). Slice the :root block that
// follows the marker comment and parse its variables — the parity gate
// then holds the baked values to buildPeleVariables of the Paper fixture.
const readPeleFallbackVars = () => {
  const at = STYLES_CSS.indexOf('C-55: pele diagram theming fallbacks')
  expect(at, 'index.css carries the C-55 pele fallback block').toBeGreaterThan(-1)
  const block = /:root\s*\{([^}]*)\}/.exec(STYLES_CSS.slice(at))
  expect(block, 'the fallback block is a parseable :root rule').not.toBeNull()
  return parseVars(block[1])
}

// CSS authors quote font stacks with single quotes, the JS constants with
// double quotes — normalize so font values compare exactly, not cosmetically.
const normalizeCssValue = (value) =>
  String(value).replace(/'/g, '"').replace(/\s+/g, ' ').trim()
// END_BLOCK_C55_FALLBACK_PARITY

// The accepted lab themes as fixed token inputs (same fixtures as
// diagram-theme.test.js — the all-themes gate below reads the real CSS).
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

// The Paper light fixture the stylesheet fallback documents («the exact
// Paper light derivation, code panel #f6f1e7»): white card surface, panel
// #f6f1e7, accent #9a6f00 (the fallback's --pele-series-1..8 ARE the OKLCH
// chartPalette of that accent). The parity gate pins index.css to
// buildPeleVariables of exactly these tokens — change either side and the
// gate forces the other to follow.
const PAPER_FALLBACK_TOKENS = {
  dark: false,
  accent: '#9a6f00',
  bg: '#fbf8f2',
  surface: '#fffdf8',
  text: '#22252b',
  muted: '#6e6a60',
  border: '#e4dbcb',
  line: '#8f8b81',
  code: '#f2ece1',
  font: DEFAULT_DIAGRAM_FONT
}

// The 16 C-41/C-51 families × 2 members — the exact set the gate covers
// (kept in parity with tests/renderer/util/theme-contrast.test.js).
const EXPECTED_THEME_IDS = [
  'paper', 'ink',
  'one-light', 'one-dark',
  'alucard', 'dracula',
  'nord-light', 'nord',
  'kanagawa-lotus', 'kanagawa',
  'graphite', 'graphite-dark',
  'ulysses', 'ulysses-dark',
  'rose-pine-dawn', 'rose-pine',
  'catppuccin-latte', 'catppuccin-mocha',
  'solarized-light', 'solarized-dark',
  'gruvbox-light', 'gruvbox-dark',
  'everforest-light', 'everforest-dark',
  'tokyo-night-light', 'tokyo-night',
  'ayu-light', 'ayu-dark',
  'docs', 'docs-dark',
  'macos', 'macos-dark'
]

// Exactly what buildPeleVariables emits (count from the function): 8
// derived/token colours + font + font-mono + radius + title-weight + the
// 8 series slots = 20 variables.
const EXPECTED_PELE_VAR_NAMES = [
  '--pele-bg',
  '--pele-fg',
  '--pele-muted',
  '--pele-line',
  '--pele-surface',
  '--pele-surface-alt',
  '--pele-border',
  '--pele-accent',
  '--pele-font',
  '--pele-font-mono',
  '--pele-radius',
  '--pele-title-weight',
  ...Array.from({ length: 8 }, (_, i) => `--pele-series-${i + 1}`)
]

beforeEach(() => {
  document.body.classList.remove('dark')
})

// ── the pure derivation ───────────────────────────────────────────────
describe('nodeContrastColors (C-51 T-012)', () => {
  it('documents the reported Ink bug: the theme tokens fail the panel gates', () => {
    // The user's screenshot: node fill = --floatBgColor on the
    // --codeBlockBgColor panel, border = --tableBorderColor — all ≈ 1.1–1.2:1.
    expect(wcagContrast(INK_TOKENS.surface, INK_TOKENS.code)).toBeLessThan(1.25)
    expect(wcagContrast(INK_TOKENS.border, INK_TOKENS.code)).toBeLessThan(3)
  })

  it('lifts the dark fill toward the text in the prescribed 8–14 % band', () => {
    const node = nodeContrastColors(INK_TOKENS)
    expect(node.fill).toBe(blendHex(INK_TOKENS.text, INK_TOKENS.code, 0.12))
    expect(node.text).toBe(INK_TOKENS.text) // the theme text is readable as-is
    expect(node.border).not.toBe(INK_TOKENS.border) // the hairline was replaced
    expect(node.line).toBe(INK_TOKENS.line) // Ink's own line token already passes
    expect(node.clusterBkg).not.toBe(node.panel)
    expect(node.clusterBkg).not.toBe(node.fill)
  })

  it('darkens the fill below the panel when the text is dim against it (solarized-dark shape)', () => {
    // Solarized Dark: text #839496 on panel #073642 is only ~4.1:1, so no
    // lift can keep 4.5:1 — the fill steps darker instead (inset nodes).
    const t = {
      ...INK_TOKENS,
      text: '#839496',
      code: '#073642',
      surface: '#073642',
      border: '#073642'
    }
    const node = nodeContrastColors(t)
    expect(node.text).toBe(t.text)
    expect(wcagContrast(node.text, node.fill)).toBeGreaterThanOrEqual(4.5)
    expect(fillDistinctFromPanel(node.fill, node.panel)).toBe(true)
    // The away-ladder fill is darker than the panel (blended toward black).
    expect(oklabLightness(node.fill)).toBeLessThan(oklabLightness(node.panel))
  })

  it('boosts the node text only when the theme text cannot keep 4.5:1 (graphite shape)', () => {
    // Graphite after the alpha compositing: mid-grey text on a near-white
    // panel — every distinguishable fill loses 4.5:1, so the node text is
    // darkened while the fill lifts.
    const t = {
      ...PAPER_TOKENS,
      text: '#686c6d',
      surface: '#f4f5f9',
      border: '#e5e5e5',
      code: '#f0f1f3'
    }
    const node = nodeContrastColors(t)
    expect(node.text).not.toBe(t.text)
    expect(wcagContrast(node.text, node.fill)).toBeGreaterThanOrEqual(4.5)
    expect(fillDistinctFromPanel(node.fill, node.panel)).toBe(true)
    // A theme whose text is strong keeps its own text colour.
    expect(nodeContrastColors(PAPER_TOKENS).text).toBe(PAPER_TOKENS.text)
  })

  it('keeps today’s surface when it already passes both gates', () => {
    // one-dark is the real example (floatBg darker than the code panel at
    // 1.46:1 with a 6.2:1 text) — modelled here with fixed tokens.
    const t = {
      ...INK_TOKENS,
      surface: '#21252b',
      code: '#3a3f4b',
      text: '#9da5b4'
    }
    expect(nodeContrastColors(t).fill).toBe('#21252b')
  })

  it('draws light-theme nodes as white cards over the panel (C-54 R-1)', () => {
  const node = nodeContrastColors(PAPER_TOKENS)
  if (oklabLightness(PAPER_TOKENS.surface) - oklabLightness(PAPER_TOKENS.code) >= 0.015) {
    expect(node.fill).toBe(PAPER_TOKENS.surface)
  }
  const t = { ...PAPER_TOKENS, surface: '#ffffff', code: '#f2f2f7', text: '#1d1d1f', border: '#d2d2d7' }
  const card = nodeContrastColors(t)
  expect(card.fill).toBe('#ffffff')
  expect(wcagContrast(card.border, t.code)).toBeGreaterThanOrEqual(3)
  // Dark themes keep the T-012 lift.
  expect(nodeContrastColors(INK_TOKENS).fill).toBe(blendHex(INK_TOKENS.text, INK_TOKENS.code, 0.12))
})

it('is deterministic', () => {
    expect(nodeContrastColors(INK_TOKENS)).toEqual(nodeContrastColors({ ...INK_TOKENS }))
    expect(nodeContrastColors(PAPER_TOKENS)).toEqual(nodeContrastColors({ ...PAPER_TOKENS }))
  })
})

// ── every registered theme ────────────────────────────────────────────
describe('every registered theme passes the node-contrast gates (C-51 T-012 / C-55)', () => {
  const themeIds = readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith('.theme.css'))
    .map((f) => f.replace(/\.theme\.css$/, ''))

  it('covers exactly the 32 family members — no other theme file ships', () => {
    expect([...themeIds].sort()).toEqual([...EXPECTED_THEME_IDS].sort())
  })

  it('nodes, borders, lines, clusters and label ink meet the gates on the panel', async () => {
    const { isDarkTheme } = await import('@/config')
    const failures = []
    for (const id of themeIds) {
      const dark = isDarkTheme(id)
      mirrorThemeVars(id, dark)
      const tokens = readActiveThemeTokens()
      const node = nodeContrastColors(tokens)
      const panel = tokens.code
      const where = (msg) => `${id}: ${msg}`

      if (wcagContrast(node.border, panel) < 3) {
        failures.push(where(`border ${node.border} vs panel ${panel} < 3:1`))
      }
      // C-54 R-1: a light theme may draw a white card — lighter than the
      // panel and outlined by the ≥ 3:1 border — instead of a lifted fill.
      const lightCard = !dark && oklabLightness(node.fill) - oklabLightness(panel) >= 0.015
      if (!fillDistinctFromPanel(node.fill, panel) && !lightCard) {
        failures.push(where(`fill ${node.fill} is not distinguishable from panel ${panel}`))
      }
      // C-54 R-2: edge labels sit on the panel — the pele variable block
      // paints their boxes with --pele-bg (the panel itself) and their ink
      // with --pele-muted (the derived labelText, ≥ 4.5:1).
      if (node.panel !== panel) {
        failures.push(where(`label box panel ${node.panel} is not the code panel ${panel}`))
      }
      if (wcagContrast(node.labelText, node.panel) < 4.5) {
        failures.push(where(`edge label text ${node.labelText} vs panel ${node.panel} < 4.5:1`))
      }
      if (wcagContrast(node.text, node.fill) < 4.5) {
        failures.push(where(`text ${node.text} vs fill ${node.fill} < 4.5:1`))
      }
      if (wcagContrast(node.line, panel) < 3) {
        failures.push(where(`line ${node.line} vs panel ${panel} < 3:1`))
      }
      if (node.clusterBkg === panel || node.clusterBkg === node.fill) {
        failures.push(where(`cluster ${node.clusterBkg} must differ from panel and fill`))
      }
      clearThemeVars(id)
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('buildPeleVariables is exactly the nodeContrastColors/chartPalette composition (20 variables)', async () => {
    const { isDarkTheme } = await import('@/config')
    const failures = []
    for (const id of themeIds) {
      const dark = isDarkTheme(id)
      mirrorThemeVars(id, dark)
      const tokens = readActiveThemeTokens()
      const node = nodeContrastColors(tokens)
      const series = chartPalette(tokens)
      const vars = buildPeleVariables(tokens)
      const where = (msg) => `${id}: ${msg}`

      const names = Object.keys(vars).sort()
      const expectedNames = [...EXPECTED_PELE_VAR_NAMES].sort()
      if (names.length !== expectedNames.length || names.some((n, i) => n !== expectedNames[i])) {
        failures.push(where(`emits ${names.length} variables — expected exactly ${expectedNames.length}: ${names.join(',')}`))
      }
      const expected = {
        '--pele-bg': node.panel,
        '--pele-fg': tokens.text,
        '--pele-muted': node.labelText,
        '--pele-line': node.line,
        '--pele-surface': node.fill,
        '--pele-surface-alt': node.clusterBkg,
        '--pele-border': node.border,
        '--pele-accent': series[0],
        '--pele-font': tokens.font,
        '--pele-font-mono': DEFAULT_PELE_MONO_FONT,
        '--pele-radius': '6px',
        '--pele-title-weight': '600'
      }
      for (const [name, value] of Object.entries(expected)) {
        if (vars[name] !== value) {
          failures.push(where(`${name} is ${vars[name]} — expected ${value}`))
        }
      }
      for (let i = 0; i < 8; i++) {
        const name = `--pele-series-${i + 1}`
        if (vars[name] !== series[i % series.length]) {
          failures.push(where(`${name} is ${vars[name]} — expected ${series[i % series.length]}`))
        }
      }
      clearThemeVars(id)
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('translucent theme values are composited over the theme background (graphite, ulysses)', () => {
    for (const id of ['graphite', 'ulysses']) {
      mirrorThemeVars(id, false)
      const tokens = readActiveThemeTokens()
      // The rgba() code panel composites to a near-background tint, not the
      // raw ink colour (graphite's raw rgba channels would be #6886aa).
      expect(wcagContrast(tokens.code, tokens.bg), `${id} panel ≈ bg`).toBeLessThan(1.25)
      expect(tokens.code).not.toBe(tokens.bg)
      clearThemeVars(id)
    }
  })
})

// ── static stylesheet fallback parity ─────────────────────────────────
describe('the index.css pele fallback equals the Paper derivation (C-55 R-3)', () => {
  it('every --pele-* value in the :root fallback matches buildPeleVariables(PAPER_FALLBACK_TOKENS)', () => {
    const cssVars = readPeleFallbackVars()
    const expected = buildPeleVariables(PAPER_FALLBACK_TOKENS)

    // The block declares exactly the 20 derivation outputs — nothing more
    // (stale variables would shadow the live root values forever), nothing
    // less (a missing variable falls back to pele's baked light default).
    // (parseVars keys drop the leading --; re-prefix for the comparison.)
    expect(Object.keys(cssVars).map((k) => `--${k}`).sort()).toEqual(
      Object.keys(expected).sort()
    )

    const failures = []
    for (const [name, value] of Object.entries(expected)) {
      const cssValue = cssVars[name.slice(2)]
      if (normalizeCssValue(cssValue) !== normalizeCssValue(value)) {
        failures.push(`${name}: css ${cssValue} ≠ derivation ${value}`)
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('the fallback series rides the OKLCH palette of the Paper accent, not hand-picked colours', () => {
    const cssVars = readPeleFallbackVars()
    const series = chartPalette(PAPER_FALLBACK_TOKENS)
    for (let i = 0; i < 8; i++) {
      expect(cssVars[`pele-series-${i + 1}`]).toBe(series[i % series.length])
    }
  })
})

// ── signature ─────────────────────────────────────────────────────────
describe('diagramThemeSignature invalidation (C-55)', () => {
  // djb2 — the same hash family the module uses; reconstructs the exact
  // signature the pre-C-55 module produced for a token set (no derived
  // node colours in the digest), so the inequality proves the signature
  // still moves when the derivation changes.
  const djb2 = (str) => {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    return (hash >>> 0).toString(36)
  }

  const preC55Signature = (t) => {
    const digest = [
      t.dark ? 1 : 0,
      t.bg, t.surface, t.text, t.muted, t.border, t.line, t.accent, t.code, t.font,
      chartPalette(t).join('')
    ].join('|')
    return `${djb2(digest)}-${digest.length}`
  }

  it('the derived node colours ride the signature (Ink and Paper change)', () => {
    expect(diagramThemeSignature(INK_TOKENS)).not.toBe(preC55Signature(INK_TOKENS))
    expect(diagramThemeSignature(PAPER_TOKENS)).not.toBe(preC55Signature(PAPER_TOKENS))
  })

  it('the signature still separates themes and stays stable for identical tokens', () => {
    expect(diagramThemeSignature(INK_TOKENS)).not.toBe(diagramThemeSignature(PAPER_TOKENS))
    expect(diagramThemeSignature(PAPER_TOKENS)).toBe(diagramThemeSignature({ ...PAPER_TOKENS }))
  })
})
