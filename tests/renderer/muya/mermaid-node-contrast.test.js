// FILE: tests/renderer/muya/mermaid-node-contrast.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin C-51 T-012 — Mermaid node shapes are distinguishable from the diagram panel they sit on (the code-block background): for EVERY registered theme (real theme CSS mirrored the way util/theme.js does, tokens through readActiveThemeTokens → buildMermaidThemeConfig) the node border reaches ≥ 3:1 (WCAG 1.4.11), the node fill is visibly different (≥ 1.25:1 or OKLCH ΔL ≥ 0.06), the node text keeps ≥ 4.5:1 on the fill, edges (lineColor) reach ≥ 3:1, the cluster background differs from the panel and the node fill, actors/notes follow the same fill/border rules and their INK follows the derived node text, and the %%{init}%% override path stays open (mainBkg/nodeBorder never set).
//   SCOPE: nodeContrastColors/wcagContrast pure-API pins (the reported Ink bug, the prescribed 8–14 % lift band, the dim-text fallbacks, surface passthrough, cluster distinctness, determinism), the all-themes gate over src/renderer/src/assets/themes/*.theme.css, and the cache-signature invalidation against the pre-T-012 digest.
//   DEPENDS: muya/lib/parser/render/mermaidTheme (nodeContrastColors, wcagContrast, blendHex, readActiveThemeTokens, buildMermaidThemeConfig, mermaidThemeSignature, chartPalette, palette), @/config (dark classification), Vitest + jsdom, Node fs/path.
//   LINKS: .grace/changes/active/C-51 T-012 (user 2026-10-16 «в темной теме у мермейд явно проблемы с контрастностью блоков»); .grace/verification/runtime.xml V-M-012 scenario-61; the e2e twin in tests/e2e/mermaid-theme.spec.ts ("node contrast (C-51 T-012)").
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root path (theme CSS discovery).
//   THEMES_DIR - src/renderer/src/assets/themes (top-level *.theme.css only).
//   readThemeCss - read one theme stylesheet from disk.
//   parseVars - extract a stylesheet's --name: value pairs (same shape as the C-41 contrast gate).
//   mirrorThemeVars - set every parsed theme variable as the root inline mirror (what util/theme.js addThemeStyle does) and flip body.dark.
//   clearThemeVars - remove the mirrored variables of one theme and the dark flag.
//   srgb2lin - sRGB channel → linear light (the Oklab math shared by the ΔL helper).
//   oklabLightness - hex → Oklab lightness 0-1 (the ΔL half of the fill rule; same math as the module-internal helper).
//   fillDistinctFromPanel - the fill rule: WCAG ≥ 1.25 OR ΔL ≥ 0.06.
//   PAPER_TOKENS - light lab theme tokens as fixed inputs (same fixture as mermaid-theme.test.js).
//   INK_TOKENS - dark lab theme tokens as fixed inputs (same fixture as mermaid-theme.test.js); the signature block reconstructs the pre-T-012 digest with a local djb2/preT012Signature to prove the cache invalidation.
//   EXPECTED_THEME_IDS - the 32 family members the gate covers.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-16 C-51 T-012 (orchestrator gate fix):
//   the all-themes gate now also pins actorTextColor/noteTextColor === the
//   derived node text — the pair the e2e twin measures as the PAINTED ink
//   (Mermaid fills `text.actor > tspan` with actorTextColor while the
//   `<text class="actor">` itself carries the `.actor` box fill; the e2e
//   read the <text> and saw «label vs fill = 1» — rendering was correct,
//   the measurement was not; no product change needed). MODULE_MAP rewritten
//   to one symbol per line to satisfy grace lint.
//   v1.0.0 - 2026-10-16 C-51 T-012: first version. Red on main:
//   the file fails to load (nodeContrastColors/wcagContrast did not exist)
//   and the old surface/border config fails every gate.
// END_CHANGE_SUMMARY

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  nodeContrastColors,
  wcagContrast,
  blendHex,
  readActiveThemeTokens,
  buildMermaidThemeConfig,
  mermaidThemeSignature,
  chartPalette
} from 'muya/lib/parser/render/mermaidTheme'

const ROOT = resolve(__dirname, '..', '..', '..')
const THEMES_DIR = resolve(ROOT, 'src/renderer/src/assets/themes')

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

// The accepted lab themes as fixed token inputs (same fixtures as
// mermaid-theme.test.js — the all-themes gate below reads the real CSS).
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

  it('is deterministic', () => {
    expect(nodeContrastColors(INK_TOKENS)).toEqual(nodeContrastColors({ ...INK_TOKENS }))
    expect(nodeContrastColors(PAPER_TOKENS)).toEqual(nodeContrastColors({ ...PAPER_TOKENS }))
  })
})

// ── every registered theme ────────────────────────────────────────────
describe('every registered theme passes the node-contrast gates (C-51 T-012)', () => {
  const themeIds = readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith('.theme.css'))
    .map((f) => f.replace(/\.theme\.css$/, ''))

  it('covers exactly the 32 family members — no other theme file ships', () => {
    expect([...themeIds].sort()).toEqual([...EXPECTED_THEME_IDS].sort())
  })

  it('nodes, borders, lines, clusters, actors and notes meet the gates on the panel', async () => {
    const { isDarkTheme } = await import('@/config')
    const failures = []
    for (const id of themeIds) {
      const dark = isDarkTheme(id)
      mirrorThemeVars(id, dark)
      const tokens = readActiveThemeTokens()
      const v = buildMermaidThemeConfig(tokens, 'flowchart').themeVariables
      const panel = tokens.code
      const where = (msg) => `${id}: ${msg}`

      if (wcagContrast(v.primaryBorderColor, panel) < 3) {
        failures.push(where(`border ${v.primaryBorderColor} vs panel ${panel} < 3:1`))
      }
      if (!fillDistinctFromPanel(v.primaryColor, panel)) {
        failures.push(where(`fill ${v.primaryColor} is not distinguishable from panel ${panel}`))
      }
      if (wcagContrast(v.primaryTextColor, v.primaryColor) < 4.5) {
        failures.push(where(`text ${v.primaryTextColor} vs fill ${v.primaryColor} < 4.5:1`))
      }
      if (wcagContrast(v.lineColor, panel) < 3) {
        failures.push(where(`line ${v.lineColor} vs panel ${panel} < 3:1`))
      }
      if (v.clusterBkg === panel || v.clusterBkg === v.primaryColor) {
        failures.push(where(`cluster ${v.clusterBkg} must differ from panel and fill`))
      }
      // Sequence actors and notes follow the same fill/border rules.
      if (v.actorBkg !== v.primaryColor || v.actorBorder !== v.primaryBorderColor) {
        failures.push(where('actor fill/border do not follow the node colours'))
      }
      if (v.noteBkgColor !== v.primaryColor || v.noteBorderColor !== v.primaryBorderColor) {
        failures.push(where('note fill/border do not follow the node colours'))
      }
      // The painted actor/note INK follows the derived node text: Mermaid's
      // sequence stylesheet fills `text.actor > tspan` / `.noteText` with
      // actorTextColor/noteTextColor, and the e2e twin measures the VISIBLE
      // actor ink (the foreignObject div's color, or that tspan fill for the
      // SVG fallback path) against the actor box — so the equality is part
      // of the contract (signalTextColor stays the theme text: message text
      // sits on the panel, not on a node fill).
      if (v.actorTextColor !== v.primaryTextColor || v.noteTextColor !== v.primaryTextColor) {
        failures.push(where('actor/note text does not follow the derived node text'))
      }
      if (v.signalColor !== v.lineColor || v.archEdgeColor !== v.lineColor) {
        failures.push(where('sequence signals / architecture edges do not follow the line colour'))
      }
      // The %%{init}%% override path: Mermaid derives mainBkg/nodeBorder
      // from primaryColor/primaryBorderColor only while we leave them unset.
      if (v.mainBkg !== undefined || v.nodeBorder !== undefined) {
        failures.push(where('mainBkg/nodeBorder must stay unset for user directives'))
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

// ── cache invalidation ────────────────────────────────────────────────
describe('mermaidThemeSignature invalidation (C-51 T-012)', () => {
  // djb2 — the same hash family the module uses; reconstructs the exact
  // signature the pre-T-012 module produced for a token set, so the
  // inequality proves every cached Ink/Paper diagram re-renders once.
  const djb2 = (str) => {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    return (hash >>> 0).toString(36)
  }

  const preT012Signature = (t) => {
    const digest = [
      t.dark ? 1 : 0,
      t.bg, t.surface, t.text, t.muted, t.border, t.line, t.accent, t.code, t.font,
      chartPalette(t).join('')
    ].join('|')
    return `${djb2(digest)}-${digest.length}`
  }

  it('the derived node colours ride the signature (Ink and Paper change)', () => {
    expect(mermaidThemeSignature(INK_TOKENS)).not.toBe(preT012Signature(INK_TOKENS))
    expect(mermaidThemeSignature(PAPER_TOKENS)).not.toBe(preT012Signature(PAPER_TOKENS))
  })

  it('the signature still separates themes and stays stable for identical tokens', () => {
    expect(mermaidThemeSignature(INK_TOKENS)).not.toBe(mermaidThemeSignature(PAPER_TOKENS))
    expect(mermaidThemeSignature(PAPER_TOKENS)).toBe(mermaidThemeSignature({ ...PAPER_TOKENS }))
  })
})
