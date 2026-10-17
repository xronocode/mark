// FILE: src/muya/lib/parser/render/diagramTheme.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Shared diagram theming (renamed from mermaidTheme.js in C-55) — the OKLCH categorical palette, the active-theme token reading, the WCAG node-contrast derivation against the code-block panel (C-51 T-012 / C-54), and the C-55 pele CSS-variable block (--pele-bg/fg/muted/line/surface/surface-alt/border/accent + --pele-series-1..8) that themes pele SVGs through the cascade with zero re-renders.
//   SCOPE: OKLCH colour math (oklch/hueOf/palette), the theme token reader (CSS variables + body dark flag, translucent values composited), the categorical chartPalette shared with contentTheme.js (Vega-Lite/flowchart/sequence), nodeContrastColors with its WCAG gates, buildPeleVariables (tokens → the pele variable map), and the theme signature used by the StateRender diagram log.
//   DEPENDS: none — pure colour math plus lazy DOM reads (window/document are touched only inside functions so tests can import the module cold).
//   LINKS: .grace/changes/active/C-55 R-3; .grace/changes/archive/C-51 T-003/T-004/T-005/T-012; .grace/changes/active/C-54; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-17.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   oklch - OKLCH (lightness 0-1, chroma, hue degrees) → "#rrggbb" hex.
//   hueOf - hex colour → OKLCH hue in degrees (0-360).
//   wcagContrast - two hex colours → WCAG 2.x contrast ratio (node border/line/text gates).
//   PALETTE_STEPS - the 8 hue offsets (accent first, then a fixed spread that keeps neighbours apart).
//   palette - accent hex + target lightness/chroma → 8 categorical hex colours at equal perceived lightness.
//   chartPalette - theme tokens → the categorical series palette (the theme's --chartPalette when present, else the OKLCH palette) — shared by the pele variables and the C-51 T-005 content theming.
//   DEFAULT_DIAGRAM_FONT - UI font fallback when --chromeFontFamily is not resolvable (the accepted lab stack).
//   DEFAULT_PELE_MONO_FONT - monospace stack for --pele-font-mono (code-ish diagram labels).
//   readActiveThemeTokens - lazily read the active theme's CSS variables + dark flag → { dark, accent, bg, surface, text, muted, border, line, code, font, series }.
//   nodeContrastColors - theme tokens → { panel, fill, border, line, clusterBkg, clusterBorder, text, labelText } derived against the code-block panel so node fill/border/line/text meet the WCAG gates (fill ≥ 1.25:1 or ΔL ≥ 0.06, border/line ≥ 3:1, text ≥ 4.5:1 on the fill).
//   buildPeleVariables - theme tokens → { '--pele-bg': …, …, '--pele-series-8': … } the CSS variable block pele SVG roots resolve (applied on the document root by util/theme.js; inlined by exportHtml.js).
//   diagramThemeSignature - theme tokens → short stable signature (includes the resolved palette AND the derived node colours) for the StateRender diagram theme log.
//   blendHex - text-over-background blend of two hex colours at a ratio (muted/line tokens).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-17 C-55: renamed from mermaidTheme.js
//   and re-pointed at pele. The shared colour math survives verbatim
//   (OKLCH palette, token reader, node-contrast gates); the mermaid
//   initialize config, per-type layout table, type detection, marker
//   scaling and donut post-pass are GONE (pele renders and detects by
//   itself). New buildPeleVariables(t) emits the --pele-* CSS variable
//   block (base colours from nodeContrastColors, series from chartPalette,
//   fonts from the chrome tokens) that pele SVG roots reference — a theme
//   switch changes the variables and recolors every diagram with zero
//   re-renders, so the pipeline's SVG cache key is code-only.
//   v1.3.0 - 2026-10-17 C-54 (user: «чини»): light themes
//   draw nodes as white cards again (surface lighter than the panel, border
//   ≥ 3:1) instead of the grey T-012 blend; edge labels and label boxes
//   take the panel colour with ≥ 4.5:1 text (labelText) — no more black
//   boxes on dark panels.
//   v1.2.0 - 2026-10-16 C-51 T-012 (user: «в темной теме у
//   мермейд явно проблемы с контрастностью блоков»): node colours are now
//   derived RELATIVE TO THE CODE-BLOCK PANEL (the background diagram SVGs
//   actually sit on), not the page tokens — see nodeContrastColors.
//   readActiveThemeTokens composites translucent CSS values over the theme
//   background (graphite/ulysses ship rgba() text and code-panel values).
//   v1.1.0 - 2026-10-16 C-51 T-005: chartPalette(tokens) is
//   exported as the single definition of the categorical series palette
//   so the other rendered content (Vega-Lite, flowchart.js, js-sequence —
//   contentTheme.js) uses the SAME palette as the diagrams.
//   v1.0.0 - 2026-10-16 C-51 T-003/T-004: first version — the
//   accepted round-2/3 lab palette/config logic ported from .lab/palette.js
//   with theme tokens read at render time from the document's CSS variables.
// END_CHANGE_SUMMARY

// START_BLOCK_DIAGRAM_OKLCH_MATH
// OKLCH → sRGB (Björn Ottosson's Oklab math): categorical colours are
// generated at one shared lightness/chroma so all 8 hues read equally
// "loud" — distinct, but quiet and matched to the theme.
const clamp01 = (x) => Math.min(1, Math.max(0, x))

const toHex = (r, g, b) =>
  '#' +
  [r, g, b]
    .map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0'))
    .join('')

const lin2srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
const srgb2lin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))

export const oklch = (L, C, hDeg) => {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return toHex(lin2srgb(r), lin2srgb(g), lin2srgb(bb))
}

// Oklab of a hex colour — shared by the categorical hue math below and the
// T-012 ΔL distinguishability rule (oklabLightness).
const oklabOf = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  const r = srgb2lin(((n >> 16) & 255) / 255)
  const g = srgb2lin(((n >> 8) & 255) / 255)
  const b = srgb2lin((n & 255) / 255)
  return [
    Math.cbrt(0.4122214708 * r + 0.536301541 * g + 0.0514459929 * b),
    Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.629978700 * b)
  ]
}

export const hueOf = (hex) => {
  const [l, m, s] = oklabOf(hex)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
}

// Oklab lightness 0-1 — the perceptual ΔL the T-012 fill rule accepts as
// "visibly different from the panel" even when the WCAG ratio is below 1.25
// (near-white/near-black greys compress in WCAG luminance).
const oklabLightness = (hex) => {
  const [l, m, s] = oklabOf(hex)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}
// END_BLOCK_DIAGRAM_OKLCH_MATH

// START_BLOCK_DIAGRAM_PALETTE
// 8 hues: accent first, then a fixed order that keeps neighbours apart.
export const PALETTE_STEPS = [0, 180, 90, 270, 45, 225, 135, 315]

export const palette = (accentHex, L, C) =>
  PALETTE_STEPS.map((d) => oklch(L, C, (hueOf(accentHex) + d) % 360))

/**
 * The categorical series palette of a theme — the theme-defined
 * --chartPalette (≥ 6 colours, e.g. the macOS family's Apple system
 * colours) when present, else the OKLCH palette generated from the accent
 * (light/dark lightness as accepted in the round-2/3 lab). Single
 * definition shared by the pele --pele-series-N variables and, since
 * C-51 T-005, the other rendered content (Vega-Lite range.category /
 * mark defaults, sequence/flowchart accents) via contentTheme.js.
 *
 * @param {object} t theme tokens (readActiveThemeTokens shape)
 * @returns {string[]} 8 (or theme-defined) categorical hex colours
 */
export const chartPalette = (t) =>
  (t.series && t.series.length >= 6)
    ? t.series
    : palette(t.accent, t.dark ? 0.74 : 0.6, t.dark ? 0.11 : 0.12)
// END_BLOCK_DIAGRAM_PALETTE

// The lab font stack — used when --chromeFontFamily cannot be resolved
// (tests, bare documents). Same stack the lab renders were accepted with.
export const DEFAULT_DIAGRAM_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif'

// Monospace companion for pele's --pele-font-mono (packet bytes, code-ish
// labels). Matches the editor's code font family ordering.
export const DEFAULT_PELE_MONO_FONT =
  'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

// START_BLOCK_DIAGRAM_THEME_TOKENS
// CSS-value parsing (#rgb/#rrggbb[#aa]/rgb()/rgba() → channels) and the
// render-time read of the active theme. Muted/line are deterministic blends
// of the theme's own text/bg pair, so every one of the 32 themes (incl. the
// Docs/macOS families) yields quiet greys matched to its paper.
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

// parseColor yields 0..255 channels; toHex takes 0..1 (the OKLCH path).
// Review 2026-10-16: passing 0..255 straight to toHex clamped every channel
// to 1, so every theme colour read as #ffffff / #ffff00.
const toHex255 = (r, g, b) => toHex(r / 255, g / 255, b / 255)

const colorToHex = (value, fallbackHex) => {
  const c = parseColor(value)
  return c ? toHex255(c.r, c.g, c.b) : String(fallbackHex).toLowerCase()
}

// Translucent theme values (graphite/ulysses ship rgba() text and code
// panels) composited over the theme background — the opaque colour a
// reader actually sees on screen. C-51 T-012: the node-contrast gates
// must measure the REAL panel, not the un-composited ink.
const opaqueColorToHex = (value, backdropHex, fallbackHex) => {
  const c = parseColor(value)
  if (!c) return String(fallbackHex).toLowerCase()
  const hex = toHex255(c.r, c.g, c.b)
  return c.a < 1 ? blendHex(hex, backdropHex, c.a) : hex
}

// text composited over bg at ratio t (0 = bg, 1 = text).
export const blendHex = (textHex, bgHex, t) => {
  const a = parseColor(textHex)
  const b = parseColor(bgHex)
  if (!a || !b) return textHex
  return toHex255(a.r * t + b.r * (1 - t), a.g * t + b.g * (1 - t), a.b * t + b.b * (1 - t))
}

/**
 * Read the active app theme for diagram/content rendering, at render time.
 *
 * The theme CSS (src/renderer/src/assets/themes/*.theme.css) is injected by
 * util/theme.js with every variable mirrored onto the document element's
 * inline style, so getComputedStyle(document.documentElement) resolves the
 * live values — including after a theme switch (app.vue applies the CSS
 * before muya's re-render watchers fire). The dark flag is the same
 * body.dark classification the pipeline already used for 'dark'/'default'.
 *
 * @returns {{ dark: boolean, accent: string, bg: string, surface: string,
 *             text: string, muted: string, border: string, line: string,
 *             code: string, font: string, series: string[] | null }}
 */
export const readActiveThemeTokens = () => {
  const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined'
  const rootStyle =
    hasDom && document.documentElement
      ? window.getComputedStyle(document.documentElement)
      : null
  const dark = hasDom && document.body
    ? document.body.classList.contains('dark')
    : false
  const raw = (name) => {
    if (!hasDom) return ''
    // Computed style resolves both stylesheet vars (e.g. the chrome font
    // in assets/styles/index.css) and util/theme.js's inline mirror; some
    // non-browser DOMs (jsdom) skip custom properties in computed styles,
    // so the inline mirror is the fallback.
    // util/theme.js mirrors every theme variable onto the root's inline
    // style, so the inline value is exact and read first; computed style
    // is the fallback for stylesheet-only variables (the chrome font).
    // (jsdom's computed custom properties are unreliable — a test caught
    // '#9a6f00' coming back as '#ffff00'.)
    const inline = document.documentElement.style.getPropertyValue(name)
    if (inline && inline.trim()) return inline.trim()
    const computed = rootStyle ? rootStyle.getPropertyValue(name) : ''
    return computed ? computed.trim() : ''
  }

  // Fallbacks = the Paper/Ink brand values, so a bare document (tests,
  // export shells) still renders the accepted look.
  const bg = colorToHex(raw('--editorBgColor'), dark ? '#17191e' : '#fbf8f2')
  const text = opaqueColorToHex(raw('--editorColor'), bg, dark ? '#ece6da' : '#22252b')
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
    font: raw('--chromeFontFamily') || DEFAULT_DIAGRAM_FONT,
    // Optional theme-defined chart palette (comma-separated colours, ≥ 6),
    // e.g. the macOS family's Apple system colours (C-51 T-007). Absent →
    // the OKLCH palette generated from the accent.
    series: (() => {
      const list = raw('--chartPalette').split(',').map((c) => colorToHex(c.trim(), '')).filter(Boolean)
      return list.length >= 6 ? list : null
    })()
  }
}
// END_BLOCK_DIAGRAM_THEME_TOKENS

// START_BLOCK_DIAGRAM_NODE_CONTRAST
// C-51 T-012 (user 2026-10-16: «в темной теме у мермейд явно проблемы с
// контрастностью блоков»): diagram node shapes sit on the CODE-BLOCK PANEL
// (the SVG's --codeBlockBgColor background, see muya's
// ag-container-preview CSS), not on the page background — most dark themes
// ship --floatBgColor == --codeBlockBgColor with hairline borders, so the
// pre-T-012 surface/border tokens rendered nodes invisible (Ink: border
// ≈ 1.2:1 against the panel). The node colours are derived RELATIVE TO THE
// PANEL with WCAG gates:
//   fill    — today's surface when it already passes both gates, else a
//             text-over-panel blend (the prescribed 8–14 % band first);
//             themes whose text is dim against their own panel
//             (solarized-dark, one-dark) step the panel darker instead,
//             light ones with the same problem (graphite/ulysses) take a
//             stronger lift and get their node text boosted to keep 4.5:1;
//   border  — the theme's border token when it already passes, else a
//             stronger text/panel blend (WCAG 1.4.11 non-text, ≥ 3:1);
//   line    — the theme's line token when it passes, else the border
//             (edges and arrowheads need ≥ 3:1 on the panel too);
//   cluster — midway between panel and fill, distinct from both.
// Pure: tokens in, colours out — every registered theme is gate-checked in
// tests/renderer/muya/pele-node-contrast.test.js.
const wcagLuminanceOf = (hex) => {
  const c = parseColor(hex)
  if (!c) return null
  const ch = (v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}

/**
 * WCAG 2.x contrast ratio of two hex colours (1 .. 21). Unparsable input
 * yields 1 (never gates a branch open).
 *
 * @param {string} a hex colour
 * @param {string} b hex colour
 * @returns {number} contrast ratio
 */
export const wcagContrast = (a, b) => {
  const la = wcagLuminanceOf(a)
  const lb = wcagLuminanceOf(b)
  if (la === null || lb === null) return 1
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// Fill candidates around the prescribed 8–14 % text-over-panel band
// (0.12 first; the fallback ladder walks the panel away below the text —
// only reached by dark themes whose text cannot keep 4.5:1 on any lift).
// C-54 R-1: a light card is strictly lighter than the panel (ΔL ≥ 0.015 in
// OKLab, so a surface that merely equals the panel never counts).
const LIGHT_CARD_MIN_DL = 0.015
const isLightCard = (hex, panel) =>
  oklabLightness(hex) - oklabLightness(panel) >= LIGHT_CARD_MIN_DL

const NODE_FILL_STEPS = [0.12, 0.14, 0.1, 0.16, 0.08, 0.18, 0.22, 0.26, 0.3]
const NODE_FILL_AWAY_STEPS = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75]
const NODE_TEXT_BOOST_STEPS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6]

/**
 * Derive the diagram node colours of a theme against the diagram panel
 * (the code-block background the rendered SVG sits on).
 *
 * @param {object} t theme tokens (readActiveThemeTokens shape)
 * @returns {{ panel: string, fill: string, border: string, line: string,
 *             clusterBkg: string, clusterBorder: string, text: string }}
 */
export const nodeContrastColors = (t) => {
  const panel = t.code
  const themeText = t.text
  const panelLightness = oklabLightness(panel)
  const distinctFromPanel = (hex) =>
    wcagContrast(hex, panel) >= 1.25 ||
    Math.abs(oklabLightness(hex) - panelLightness) >= 0.06
  const readableTextOn = (hex) => wcagContrast(themeText, hex) >= 4.5

  let fill = null
  let text = themeText
  // (a0) C-54 R-1: light themes draw nodes as white cards — the theme
  //      surface, lighter than the panel and outlined by the ≥ 3:1 border
  //      below — instead of a grey text blend (the T-012 distinctness gate
  //      is a dark-theme rule: a light card reads by its border and shadow).
  if (!t.dark && isLightCard(t.surface, panel) && readableTextOn(t.surface)) {
    fill = t.surface
  }
  // (a) Keep today's look when the theme surface already passes both gates.
  if (!fill && distinctFromPanel(t.surface) && readableTextOn(t.surface)) {
    fill = t.surface
  }
  // (b) The prescribed lift: blend text over the panel, the 8–14 % band
  //     first, until the fill separates from the panel while the theme
  //     text keeps ≥ 4.5:1 on it.
  if (!fill) {
    for (const k of NODE_FILL_STEPS) {
      const c = blendHex(themeText, panel, k)
      if (distinctFromPanel(c) && readableTextOn(c)) {
        fill = c
        break
      }
    }
  }
  // (c) Dark themes whose text is dim against their own panel (solarized-
  //     dark, one-dark): no lift can keep the text readable, so step the
  //     panel darker instead — inset nodes, theme text untouched.
  if (!fill && wcagLuminanceOf(themeText) >= wcagLuminanceOf(panel)) {
    for (const k of NODE_FILL_AWAY_STEPS) {
      const c = blendHex(panel, '#000000', k)
      if (distinctFromPanel(c) && readableTextOn(c)) {
        fill = c
        break
      }
    }
  }
  // (d) Light themes with the same dim-text problem (graphite, ulysses):
  //     only a strong lift separates from the panel, and the node text is
  //     boosted away from the fill to keep ≥ 4.5:1.
  if (!fill) {
    for (const k of NODE_FILL_STEPS) {
      const c = blendHex(themeText, panel, k)
      if (distinctFromPanel(c)) {
        fill = c
        break
      }
    }
    if (fill && !readableTextOn(fill)) {
      const far = wcagLuminanceOf(fill) >= wcagLuminanceOf(themeText) ? '#000000' : '#ffffff'
      for (const k of NODE_TEXT_BOOST_STEPS) {
        const c = blendHex(themeText, far, k)
        if (wcagContrast(c, fill) >= 4.5) {
          text = c
          break
        }
      }
    }
  }
  if (!fill) fill = blendHex(themeText, panel, 0.12)

  // Border: the theme's own hairline when it already passes WCAG 1.4.11,
  // else the first text/panel blend (0.30 … 0.90) that reaches 3:1.
  let border = wcagContrast(t.border, panel) >= 3 ? t.border : null
  if (!border) {
    for (let i = 6; i <= 18; i++) {
      const c = blendHex(themeText, panel, i / 20)
      if (wcagContrast(c, panel) >= 3) {
        border = c
        break
      }
    }
  }
  if (!border) border = themeText
  // Edges and arrowheads share the ≥ 3:1 rule; the line token already
  // passes on most themes (a 50 % text/bg blend), else it matches the border.
  const line = wcagContrast(t.line, panel) >= 3 ? t.line : border

  // Cluster/subgraph: midway between panel and fill — distinct from both;
  // nudge toward the fill if 8-bit rounding collapses the midpoint.
  let clusterBkg = blendHex(fill, panel, 0.5)
  for (let i = 11; (clusterBkg === panel || clusterBkg === fill) && i <= 19; i++) {
    clusterBkg = blendHex(fill, panel, i / 20)
  }
  // C-54 R-2: edge labels sit on the panel — the muted token when it keeps
  // ≥ 4.5:1 there, else the theme text.
  // Dim themes (one-dark, solarized) fail with both — push the text away
  // from the panel until it reaches 4.5:1.
  let labelText = wcagContrast(t.muted, panel) >= 4.5 ? t.muted : themeText
  if (wcagContrast(labelText, panel) < 4.5) {
    const far = wcagLuminanceOf(panel) >= wcagLuminanceOf(themeText) ? '#000000' : '#ffffff'
    for (const k of NODE_TEXT_BOOST_STEPS) {
      const c = blendHex(themeText, far, k)
      if (wcagContrast(c, panel) >= 4.5) {
        labelText = c
        break
      }
    }
  }
  return { panel, fill, border, line, clusterBkg, clusterBorder: border, text, labelText }
}
// END_BLOCK_DIAGRAM_NODE_CONTRAST

// START_BLOCK_PELE_VARIABLES
// C-55 R-3: pele SVG roots reference var(--pele-*) with light fallbacks
// baked in (see the rendered root style: --_bg:var(--pele-bg,#fff)…). The
// application sets these variables on the document root (util/theme.js,
// right after mirroring the theme's own CSS variables and toggling the
// body.dark flag) and exportHtml.js inlines the same block into the
// standalone file — so a theme switch recolors every diagram through the
// CSS cascade with ZERO re-renders and the pipeline's SVG cache key stays
// code-only. Mapping (T-012/C-54 derivation against the CODE PANEL):
//   bg          node.panel      — the panel edge-label rects paint on
//   fg          t.text          — primary ink (node/edge text)
//   muted       node.labelText  — secondary ink, ≥ 4.5:1 on the panel
//   line        node.line       — edges/arrowheads, ≥ 3:1 on the panel
//   surface     node.fill       — node cards
//   surface-alt node.clusterBkg — clusters/subgraph bands
//   border      node.border     — card outlines, ≥ 3:1 on the panel
//   accent      series[0]       — highlights
//   series-1..8 chartPalette(t)  — categorical colours
//   font/font-mono — the chrome font stacks (measurement matches display:
//   pelePipeline passes the same stacks as render options)
/**
 * Build the pele CSS variable block for a theme.
 *
 * @param {object} t theme tokens (readActiveThemeTokens shape)
 * @returns {Record<string, string>} '--pele-bg' … '--pele-series-8'
 */
export const buildPeleVariables = (t) => {
  const node = nodeContrastColors(t)
  const series = chartPalette(t)
  const vars = {
    '--pele-bg': node.panel,
    '--pele-fg': t.text,
    '--pele-muted': node.labelText,
    '--pele-line': node.line,
    '--pele-surface': node.fill,
    '--pele-surface-alt': node.clusterBkg,
    '--pele-border': node.border,
    '--pele-accent': series[0],
    '--pele-font': t.font,
    '--pele-font-mono': DEFAULT_PELE_MONO_FONT,
    // Card rounding + title weight: the accepted C-51 lab look (9 px cards
    // in mermaid ≈ 6 px at pele's denser geometry; semibold titles).
    '--pele-radius': '6px',
    '--pele-title-weight': '600'
  }
  for (let i = 0; i < 8; i++) {
    vars[`--pele-series-${i + 1}`] = series[i % series.length]
  }
  return vars
}
// END_BLOCK_PELE_VARIABLES

// START_BLOCK_DIAGRAM_SIGNATURE
// djb2 — same hash family the pipeline uses for diagram code.
const hashString = (str) => {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

/**
 * Stable signature of the resolved theme — theme identity AND the resolved
 * palette AND the derived node colours — used by the StateRender diagram
 * theme log (C-51 T-005). The pele SVG cache key is code-only (colors live
 * in CSS variables), so this signature no longer keys any render cache.
 *
 * @param {object} t theme tokens (readActiveThemeTokens shape)
 * @returns {string} short signature safe for a log field
 */
export const diagramThemeSignature = (t) => {
  if (!t) return 'no-theme'
  const series = chartPalette(t)
  const node = nodeContrastColors(t)
  const digest = [
    t.dark ? 1 : 0,
    t.bg, t.surface, t.text, t.muted, t.border, t.line, t.accent, t.code, t.font,
    node.fill, node.border, node.line, node.clusterBkg, node.text,
    series.join('')
  ].join('|')
  return `${hashString(digest).toString(36)}-${digest.length}`
}
// END_BLOCK_DIAGRAM_SIGNATURE
