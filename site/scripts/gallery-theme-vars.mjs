// FILE: site/scripts/gallery-theme-vars.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Derive the diagram gallery's theme variable table from the
//            app's own theme CSS files through the app's own
//            buildPeleVariables (muya diagramTheme) — never hand-copied.
//   SCOPE: parse src/renderer/src/assets/themes/*.theme.css into the token
//          object readActiveThemeTokens returns at runtime (same variable
//          names, same literal parsing, same fallbacks, same dark lists),
//          run buildPeleVariables on it, keep the 16 --pele-* colour keys
//          plus the page background and dark flag, and write
//          site/gallery/theme-vars.json. Also the strip order + display
//          names shared with build-gallery.mjs.
//   DEPENDS: ../../src/muya/lib/parser/render/diagramTheme.js
//            (buildPeleVariables, blendHex, DEFAULT_DIAGRAM_FONT), node:fs
//   LINKS: .grace/changes/active/C-58 R-2; .grace/graph/features.xml M-053;
//          .grace/verification/features.xml V-M-053; util/theme.js
//          addThemeStyle (the runtime path this mirrors);
//          site/gallery/prototype/theme-vars.runtime-snapshot-2026-10-18.json
//          (the parity oracle)
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   THEME_NAMES - theme id -> display name for the gallery theme strip
//   THEME_PRIORITY - strip order head (brand + Docs/macOS families first)
//   deriveThemeVars - themes dir -> { [id]: { 16 --pele-* keys, page, dark } }
//   themeOrder - derived vars -> strip order (priority head + rest sorted)
//   themeDisplayName - id -> strip label (prettified fallback for new files)
//   writeThemeVarsFile - regenerate site/gallery/theme-vars.json when stale
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-25 C-GITHUB-THEME: the GitHub pair
//   joins THEME_NAMES (brand casing) and github-dark joins DARK_THEMES
//   (mirroring config.js railscastsThemes), so the derived table grows
//   to 34 themes with 17 dark / 17 light.
//   PREV: v1.0.0 - 2026-10-18 C-58 T-001: first version. Token
//   reading mirrors readActiveThemeTokens exactly (literal values only —
//   the runtime inline mirror does not resolve var() chains either;
//   translucent rgba() composited over the theme background; the Paper/Ink
//   brand fallbacks), so buildPeleVariables produces byte-identical output
//   to the app. Run directly only with `npm run gallery:vars`
//   (node --experimental-default-type=module): src/muya/package.json has no
//   "type" field, so plain node treats diagramTheme.js as CommonJS; the
//   vitepress build and vitest load it through vite/esbuild, which is the
//   primary path (buildEnd refreshes the committed JSON on every build).
// END_CHANGE_SUMMARY

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  blendHex,
  buildPeleVariables,
  DEFAULT_DIAGRAM_FONT
} from '../../src/muya/lib/parser/render/diagramTheme.js'

const GALLERY_DIR = fileURLToPath(new URL('../gallery', import.meta.url))
const THEMES_DIR = fileURLToPath(new URL('../../src/renderer/src/assets/themes', import.meta.url))

// START_BLOCK_THEME_DISPLAY
// Strip order and labels for the gallery. The priority head is the brand
// pair plus the Docs/macOS families; everything else follows sorted so a
// newly added theme file appears without touching this module (corner-5).
export const THEME_NAMES = {
  paper: 'Paper',
  ink: 'Ink',
  docs: 'Docs',
  'docs-dark': 'Docs Dark',
  macos: 'macOS',
  'macos-dark': 'macOS Dark',
  alucard: 'Alucard',
  'ayu-dark': 'Ayu Dark',
  'ayu-light': 'Ayu Light',
  'catppuccin-latte': 'Catppuccin Latte',
  'catppuccin-mocha': 'Catppuccin Mocha',
  dracula: 'Dracula',
  'everforest-dark': 'Everforest Dark',
  'everforest-light': 'Everforest Light',
  github: 'GitHub',
  'github-dark': 'GitHub Dark',
  graphite: 'Graphite',
  'graphite-dark': 'Graphite Dark',
  'gruvbox-dark': 'Gruvbox Dark',
  'gruvbox-light': 'Gruvbox Light',
  kanagawa: 'Kanagawa',
  'kanagawa-lotus': 'Kanagawa Lotus',
  nord: 'Nord',
  'nord-light': 'Nord Light',
  'one-dark': 'One Dark',
  'one-light': 'One Light',
  'rose-pine': 'Rosé Pine',
  'rose-pine-dawn': 'Rosé Pine Dawn',
  'solarized-dark': 'Solarized Dark',
  'solarized-light': 'Solarized Light',
  'tokyo-night': 'Tokyo Night',
  'tokyo-night-light': 'Tokyo Night Light',
  ulysses: 'Ulysses',
  'ulysses-dark': 'Ulysses Dark'
}

export const THEME_PRIORITY = ['paper', 'ink', 'docs', 'docs-dark', 'macos', 'macos-dark']

// The runtime dark classification (src/renderer/src/config.js railscastsThemes
// + oneDarkThemes) decides body.dark, which readActiveThemeTokens reads. The
// module itself imports window.path at load time, so the list is mirrored
// here; the snapshot parity test pins every flag, and the count test fails
// when a new theme file is not classified either way.
const DARK_THEMES = new Set([
  'ink',
  'graphite-dark',
  'ulysses-dark',
  'docs-dark',
  'macos-dark',
  'github-dark',
  'dracula',
  'nord',
  'catppuccin-mocha',
  'gruvbox-dark',
  'tokyo-night',
  'solarized-dark',
  'ayu-dark',
  'everforest-dark',
  'rose-pine',
  'kanagawa',
  'one-dark'
])

export function themeDisplayName (id) {
  if (THEME_NAMES[id]) return THEME_NAMES[id]
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function themeOrder (vars) {
  const ids = new Set(Object.keys(vars))
  const head = THEME_PRIORITY.filter((id) => ids.has(id))
  return [...head, ...[...ids].filter((id) => !THEME_PRIORITY.includes(id)).sort()]
}
// END_BLOCK_THEME_DISPLAY

// START_BLOCK_THEME_CSS_PARSE
// Faithful node copies of diagramTheme.js's private colour parsing (the
// module exports only blendHex of these) so the token object built here is
// indistinguishable from readActiveThemeTokens' runtime result. Literal
// values only: the runtime reads the inline mirror first, so a var()
// reference would parse to null and hit the fallback — same here.
const clamp01 = (x) => Math.min(1, Math.max(0, x))

const toHex = (r, g, b) =>
  '#' +
  [r, g, b]
    .map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0'))
    .join('')

const toHex255 = (r, g, b) => toHex(r / 255, g / 255, b / 255)

const parseColor = (value) => {
  if (!value) return null
  const s = String(value).trim()
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s)
  if (m) {
    return {
      r: parseInt(m[1] + m[1], 16),
      g: parseInt(m[2] + m[2], 16),
      b: parseInt(m[3] + m[3], 16),
      a: 1
    }
  }
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s)
  if (m) {
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
      a: 1
    }
  }
  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)?/i.exec(s)
  if (m) {
    const r = Number.parseFloat(m[1])
    const g = Number.parseFloat(m[2])
    const b = Number.parseFloat(m[3])
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      const alpha = m[4] === undefined ? 1 : Number.parseFloat(m[4])
      return { r, g, b, a: Number.isFinite(alpha) ? alpha : 1 }
    }
  }
  return null
}

const colorToHex = (value, fallbackHex) => {
  const c = parseColor(value)
  return c ? toHex255(c.r, c.g, c.b) : String(fallbackHex).toLowerCase()
}

const opaqueColorToHex = (value, backdropHex, fallbackHex) => {
  const c = parseColor(value)
  if (!c) return String(fallbackHex).toLowerCase()
  const hex = toHex255(c.r, c.g, c.b)
  return c.a < 1 ? blendHex(hex, backdropHex, c.a) : hex
}

// The same variable-mirror regex util/theme.js uses to copy theme CSS
// variables onto the document root (last definition wins; `}` ends a value).
const cssVariables = (css) => {
  const vars = {}
  const varRegex = /--([\w-]+):\s*([^;}]+)/g
  let m
  while ((m = varRegex.exec(css)) !== null) {
    vars[`--${m[1]}`] = m[2].trim()
  }
  return vars
}
// END_BLOCK_THEME_CSS_PARSE

// START_BLOCK_DERIVE_THEME_VARS
// buildPeleVariables emits these colour keys plus font/radius/weight keys;
// the gallery table keeps exactly the 16 colour keys the runtime snapshot
// carries (diagrams fall back to pele's baked font stacks, as in the
// approved prototype).
const PELE_COLOR_KEYS = [
  '--pele-bg',
  '--pele-fg',
  '--pele-muted',
  '--pele-line',
  '--pele-surface',
  '--pele-surface-alt',
  '--pele-border',
  '--pele-accent',
  ...Array.from({ length: 8 }, (_, i) => `--pele-series-${i + 1}`)
]

// readActiveThemeTokens without the DOM: same raw variable names, same
// literal parsing, same Paper/Ink brand fallbacks, same derived
// muted/line blends and --chartPalette hook.
const themeTokens = (css, dark) => {
  const vars = cssVariables(css)
  const raw = (name) => vars[name] || ''
  const bg = colorToHex(raw('--editorBgColor'), dark ? '#17191e' : '#fbf8f2')
  const text = opaqueColorToHex(raw('--editorColor'), bg, dark ? '#ece6da' : '#22252b')
  const series = raw('--chartPalette')
    .split(',')
    .map((c) => colorToHex(c.trim(), ''))
    .filter(Boolean)
  return {
    dark,
    accent: colorToHex(raw('--themeColor'), dark ? '#ffcf1a' : '#9a6f00'),
    bg,
    surface: opaqueColorToHex(raw('--floatBgColor'), bg, bg),
    text,
    muted: blendHex(text, bg, 0.65),
    border: opaqueColorToHex(raw('--tableBorderColor'), bg, blendHex(text, bg, 0.18)),
    line: blendHex(text, bg, 0.5),
    code: opaqueColorToHex(raw('--codeBlockBgColor'), bg, bg),
    font: DEFAULT_DIAGRAM_FONT,
    series: series.length >= 6 ? series : null
  }
}

/**
 * Derive the gallery theme table from the app's theme CSS files.
 *
 * @param {string} [themesDir] - directory of *.theme.css files
 * @returns {Record<string, { '--pele-bg': string, ..., page: string, dark: boolean }>}
 */
export function deriveThemeVars (themesDir = THEMES_DIR) {
  const files = readdirSync(themesDir).filter((f) => f.endsWith('.theme.css')).sort()
  if (!files.length) {
    throw new Error(`[SiteGallery][deriveThemeVars][BLOCK_DERIVE_THEME_VARS] no *.theme.css files in ${themesDir}`)
  }
  const out = {}
  for (const f of files) {
    const id = f.slice(0, -'.theme.css'.length)
    const dark = DARK_THEMES.has(id)
    const tokens = themeTokens(readFileSync(join(themesDir, f), 'utf8'), dark)
    const pele = buildPeleVariables(tokens)
    const entry = {}
    for (const key of PELE_COLOR_KEYS) entry[key] = pele[key]
    const missing = PELE_COLOR_KEYS.filter((key) => !entry[key])
    if (missing.length) {
      throw new Error(`[SiteGallery][deriveThemeVars][BLOCK_DERIVE_THEME_VARS] theme ${id} is missing ${missing.join(', ')} — did buildPeleVariables change shape?`)
    }
    const page = parseColor(tokens.bg)
    if (!page) {
      throw new Error(`[SiteGallery][deriveThemeVars][BLOCK_DERIVE_THEME_VARS] theme ${id} has an unparsable editor background`)
    }
    // The page token matches what getComputedStyle reports at runtime
    // ("rgb(r, g, b)") — the snapshot parity test compares verbatim.
    entry.page = `rgb(${Math.round(page.r)}, ${Math.round(page.g)}, ${Math.round(page.b)})`
    entry.dark = dark
    out[id] = entry
  }
  const ordered = {}
  for (const id of themeOrder(out)) ordered[id] = out[id]
  return ordered
}
// END_BLOCK_DERIVE_THEME_VARS

// START_BLOCK_WRITE_THEME_VARS
/**
 * Regenerate site/gallery/theme-vars.json when it differs from a fresh
 * derivation (called from the vitepress buildEnd; also the CLI below).
 *
 * @param {string} [galleryDir] - the site/gallery directory
 * @param {string} [themesDir] - the app themes directory
 * @returns {{ file: string, changed: boolean, themes: number }}
 */
export function writeThemeVarsFile (galleryDir = GALLERY_DIR, themesDir = THEMES_DIR) {
  const vars = deriveThemeVars(themesDir)
  const file = join(galleryDir, 'theme-vars.json')
  const body = JSON.stringify(vars, null, 2) + '\n'
  const changed = !existsSync(file) || readFileSync(file, 'utf8') !== body
  if (changed) writeFileSync(file, body)
  return { file, changed, themes: Object.keys(vars).length }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  const result = writeThemeVarsFile()
  console.log(`[SiteGallery][writeThemeVarsFile][BLOCK_WRITE_THEME_VARS] themes=${result.themes} changed=${result.changed} file=${result.file}`)
}
// END_BLOCK_WRITE_THEME_VARS
