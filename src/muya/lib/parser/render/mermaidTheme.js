// FILE: src/muya/lib/parser/render/mermaidTheme.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Build the Mermaid render config (theme "base", look "neo", themeVariables, themeCSS polish, per-type layout and sizes) from the ACTIVE APP THEME — the accepted C-51 round-2/3 lab (.lab/palette.js) ported into the product, with node colours derived against the code-block panel (T-012 contrast gates).
//   SCOPE: OKLCH colour math (oklch/hueOf/palette), active-theme token reading from the document's CSS variables plus the body "dark" flag (translucent values composited over the theme background), diagram type detection from the code's first meaningful line (22 types, frontmatter/%%{init}%% skipped), the WCAG node-contrast derivation against the diagram panel, the per-type config builder, and the theme signature that keys the pipeline's SVG cache.
//   DEPENDS: none — pure colour math plus lazy DOM reads (window/document are touched only inside functions so tests can import the module cold).
//   LINKS: .grace/changes/active/C-51 T-003/T-004 (R-2/R-2a), T-005 (chartPalette shared with contentTheme.js) and T-012 (node contrast, user 2026-10-16); .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-17.
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
//   chartPalette - theme tokens → the categorical series palette (the theme's --chartPalette when present, else the OKLCH palette) — shared by the Mermaid config and the C-51 T-005 content theming.
//   DEFAULT_MERMAID_FONT - UI font fallback when --chromeFontFamily is not resolvable (the accepted lab stack).
//   MERMAID_THEME_TYPES - the 22 canonical diagram type keys detected by detectMermaidDiagramType.
//   readActiveThemeTokens - lazily read the active theme's CSS variables + dark flag → { dark, accent, bg, surface, text, muted, border, line, code, font }.
//   detectMermaidDiagramType - diagram code → canonical type key ("flowchart"…"c4"), skipping blank lines, %% directives/comments and YAML frontmatter; "unknown" when nothing matches.
//   nodeContrastColors - theme tokens → { panel, fill, border, line, clusterBkg, clusterBorder, text, labelText } derived against the code-block panel so node fill/border/line/text meet the WCAG gates (fill ≥ 1.25:1 or ΔL ≥ 0.06, border/line ≥ 3:1, text ≥ 4.5:1 on the fill).
//   buildMermaidThemeConfig - theme tokens + type key → full mermaid.initialize config (themeVariables incl. cScale/pie/git/xyChart/quadrant/journey scales, themeCSS polish, per-type layout config with the C-34 fit-column useMaxWidth policy).
//   mermaidThemeSignature - theme tokens → short stable signature (includes the resolved palette AND the derived node colours) for the pipeline's cache key.
//   MARKER_SCALE - per-type arrowhead scale factors.
//   postProcessMermaidSvg - rendered SVG + type (+ theme tokens) → SVG with proportionate arrowheads and the donut pie.
//   DONUT_HOLE - donut hole radius as a fraction of the pie radius.
//   blendHex - text-over-background blend of two hex colours at a ratio (muted/line tokens).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-17 C-54 (user: «чини»): light themes
//   draw nodes as white cards again (surface lighter than the panel, border
//   ≥ 3:1) instead of the grey T-012 blend; edge labels and label boxes
//   take the panel colour with ≥ 4.5:1 text (labelText) — no more black
//   boxes on dark panels.
//   PREV: v1.2.0 - 2026-10-16 C-51 T-012 (user: «в темной теме у
//   мермейд явно проблемы с контрастностью блоков»): node colours are now
//   derived RELATIVE TO THE CODE-BLOCK PANEL (the background mermaid SVGs
//   actually sit on), not the page tokens — nodeContrastColors(t) (pure,
//   START_BLOCK_MERMAID_NODE_CONTRAST) picks a fill that is distinguishable
//   from the panel (today's surface when it passes, else a text-over-panel
//   blend in the prescribed 8–14 % band, stepping the panel darker only for
//   themes whose text is dim against their own panel), a border ≥ 3:1
//   (WCAG 1.4.11; the theme's border token kept when it already passes),
//   a line ≥ 3:1, a cluster background midway between panel and fill, and
//   a node text that keeps ≥ 4.5:1 on the fill (boosted only for themes
//   where the theme text cannot — graphite/ulysses after the alpha fix).
//   primaryColor/primaryBorderColor/actorBkg/actorBorder/noteBkgColor/
//   noteBorderColor/clusterBkg/clusterBorder/lineColor/signalColor/
//   archEdge colours come from the derivation; mainBkg/nodeBorder stay
//   unset so a user's %%{init}%% primaryColor still recolours nodes.
//   readActiveThemeTokens now composites translucent CSS values over the
//   theme background (graphite/ulysses ship rgba() text and code-panel
//   values — the opaque colour a reader sees); mermaidThemeSignature
//   includes the derived node colours, so every cached diagram re-renders
//   once after the update. The categorical palettes, tints, gantt/packet
//   task colours and the Keynote donut are unchanged.
//   v1.1.0 - 2026-10-16 C-51 T-005: chartPalette(tokens) is
//   exported as the single definition of the categorical series palette
//   (the theme's --chartPalette when present, else the OKLCH palette with
//   the light/dark lightness of the accepted lab) so the other rendered
//   content (Vega-Lite, flowchart.js, js-sequence — contentTheme.js) uses
//   the SAME palette as Mermaid; buildMermaidThemeConfig and
//   mermaidThemeSignature now compute their series through it (identical
//   values, pinned by the existing tests).
//   v1.0.0 - 2026-10-16 C-51 T-003/T-004: first version — the
//   accepted round-2/3 lab palette/config logic ported from .lab/palette.js
//   with theme tokens read at render time from the document's CSS variables
//   (--themeColor/--editorColor/--editorBgColor/--floatBgColor/
//   --codeBlockBgColor/--tableBorderColor/--chromeFontFamily) instead of the
//   lab's two hand-tuned themes; gantt/journey/packet/timeline keep the lab
//   sizes with useMaxWidth:false (natural width + in-block horizontal
//   scroll) while every other type keeps the C-34 fit-column
//   useMaxWidth:true behaviour.
// END_CHANGE_SUMMARY

// START_BLOCK_MERMAID_OKLCH_MATH
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
    Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
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
// END_BLOCK_MERMAID_OKLCH_MATH

// START_BLOCK_MERMAID_PALETTE
// 8 hues: accent first, then a fixed order that keeps neighbours apart.
export const PALETTE_STEPS = [0, 180, 90, 270, 45, 225, 135, 315]

export const palette = (accentHex, L, C) =>
  PALETTE_STEPS.map((d) => oklch(L, C, (hueOf(accentHex) + d) % 360))

/**
 * The categorical series palette of a theme — the theme-defined
 * --chartPalette (≥ 6 colours, e.g. the macOS family's Apple system
 * colours) when present, else the OKLCH palette generated from the accent
 * (light/dark lightness as accepted in the round-2/3 lab). Single
 * definition shared by the Mermaid theme config and, since C-51 T-005,
 * the other rendered content (Vega-Lite range.category / mark defaults,
 * sequence/flowchart accents) via contentTheme.js.
 *
 * @param {object} t theme tokens (readActiveThemeTokens shape)
 * @returns {string[]} 8 (or theme-defined) categorical hex colours
 */
export const chartPalette = (t) =>
  (t.series && t.series.length >= 6)
    ? t.series
    : palette(t.accent, t.dark ? 0.74 : 0.6, t.dark ? 0.11 : 0.12)
// END_BLOCK_MERMAID_PALETTE

// The lab font stack — used when --chromeFontFamily cannot be resolved
// (tests, bare documents). Same stack the lab renders were accepted with.
export const DEFAULT_MERMAID_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif'

// START_BLOCK_MERMAID_THEME_TOKENS
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
 * Read the active app theme for Mermaid, at render time.
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
 *             code: string, font: string }}
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
    font: raw('--chromeFontFamily') || DEFAULT_MERMAID_FONT,
    // Optional theme-defined chart palette (comma-separated colours, ≥ 6),
    // e.g. the macOS family's Apple system colours (C-51 T-007). Absent →
    // the OKLCH palette generated from the accent.
    series: (() => {
      const list = raw('--chartPalette').split(',').map((c) => colorToHex(c.trim(), '')).filter(Boolean)
      return list.length >= 6 ? list : null
    })()
  }
}
// END_BLOCK_MERMAID_THEME_TOKENS

// START_BLOCK_MERMAID_NODE_CONTRAST
// C-51 T-012 (user 2026-10-16: «в темной теме у мермейд явно проблемы с
// контрастностью блоков»): Mermaid node shapes sit on the CODE-BLOCK PANEL
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
// tests/renderer/muya/mermaid-node-contrast.test.js.
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
 * Derive the Mermaid node colours of a theme against the diagram panel
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
// END_BLOCK_MERMAID_NODE_CONTRAST

// START_BLOCK_MERMAID_MARKERS
// Arrowheads (user 2026-10-16 «не конские стрелки»): Mermaid markers are
// 10–12 units and scale with the stroke. Per-type factor; ER cardinality and
// sequence heads stay as they are. A marker without a viewBox first gets one
// with its original size, so the head scales instead of being clipped.
export const MARKER_SCALE = Object.freeze({
  flowchart: 0.7, block: 0.62, state: 0.8, class: 0.8, requirement: 0.8, architecture: 0.75, c4: 0.8
})

export const postProcessMermaidSvg = (svg, type, tokens = null) => {
  if (typeof svg !== 'string') return svg
  let out = svg
  const k = MARKER_SCALE[type]
  if (k) {
    out = out.replace(/<marker\b[^>]*>/g, (tag) => {
      const w = /markerWidth="([\d.]+)"/.exec(tag)
      const h = /markerHeight="([\d.]+)"/.exec(tag)
      if (!w || !h) return tag
      let t = tag
      if (!/viewBox=/.test(t)) t = t.replace('<marker', `<marker viewBox="0 0 ${w[1]} ${h[1]}"`)
      return t
        .replace(/markerWidth="[\d.]+"/, `markerWidth="${(Number(w[1]) * k).toFixed(2)}"`)
        .replace(/markerHeight="[\d.]+"/, `markerHeight="${(Number(h[1]) * k).toFixed(2)}"`)
    })
  }
  if (type === 'pie') out = donutPie(out, tokens)
  return out
}

// START_BLOCK_MERMAID_DONUT
// Keynote-style donut (user 2026-10-16: «думаю да» — on by default for every
// theme; Markdown has no place to store a per-diagram choice). A hole of
// DONUT_HOLE × radius, painted in the diagram panel colour, goes in right
// before the percentage labels (Mermaid places them at 0.75 × radius, so
// they stay on the ring).
export const DONUT_HOLE = 0.56

const donutPie = (svg, tokens) => {
  if (/class="pieDonutHole"/.test(svg)) return svg
  const arc = /class="pieCircle"/.test(svg) && /<path d="M[^"]*?A([\d.]+),/.exec(svg)
  const firstLabel = svg.search(/<text\b[^>]*class="slice"/)
  if (!arc || firstLabel < 0) return svg
  const r = Number(arc[1]) * DONUT_HOLE
  const fill = (tokens && (tokens.code || tokens.bg)) || '#ffffff'
  const hole = `<circle cx="0" cy="0" r="${r.toFixed(1)}" class="pieDonutHole" fill="${fill}" stroke="none"></circle>`
  return svg.slice(0, firstLabel) + hole + svg.slice(firstLabel)
}
// END_BLOCK_MERMAID_DONUT
// END_BLOCK_MERMAID_MARKERS

// START_BLOCK_MERMAID_TYPE_DETECT
// The 22 Mermaid diagram types this change themes (Mermaid 11.14). The key
// is canonical ("git" for gitGraph, "c4" for the C4 family); the per-type
// config below uses Mermaid's own config key names where they differ.
export const MERMAID_THEME_TYPES = [
  'flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'journey',
  'git', 'mindmap', 'timeline', 'quadrant', 'xychart', 'sankey', 'block',
  'packet', 'kanban', 'architecture', 'radar', 'treemap', 'requirement', 'c4'
]

const TYPE_LINE_PATTERNS = [
  [/^(?:flowchart|graph|flow)\b/i, 'flowchart'],
  [/^sequenceDiagram\b/i, 'sequence'],
  [/^classDiagram\b/i, 'class'],
  [/^stateDiagram(?:-v2)?\b/i, 'state'],
  [/^erDiagram\b/i, 'er'],
  [/^gantt\b/i, 'gantt'],
  [/^pie\b/i, 'pie'],
  [/^journey\b/i, 'journey'],
  [/^gitGraph\b/i, 'git'],
  [/^mindmap\b/i, 'mindmap'],
  [/^timeline\b/i, 'timeline'],
  [/^quadrantChart\b/i, 'quadrant'],
  [/^xychart(?:-beta)?\b/i, 'xychart'],
  [/^sankey(?:-beta)?\b/i, 'sankey'],
  [/^block(?:-beta)?\b/i, 'block'],
  [/^packet(?:-beta)?\b/i, 'packet'],
  [/^kanban\b/i, 'kanban'],
  [/^architecture(?:-beta)?\b/i, 'architecture'],
  [/^radar(?:-beta)?\b/i, 'radar'],
  [/^treemap(?:-beta)?\b/i, 'treemap'],
  [/^requirementDiagram\b/i, 'requirement'],
  [/^C4(?:Context|Container|Component|Dynamic|Deployment)\b/i, 'c4']
]

/**
 * Detect the diagram type from the first meaningful line of the code.
 * Blank lines, `%%` lines (both `%%{init}%%` directives and comments) and a
 * leading YAML frontmatter block are skipped, so a user directive before
 * the diagram never breaks detection. Returns "unknown" when nothing
 * matches (the config then still themes fonts/colours globally).
 *
 * @param {string} code the raw mermaid code block
 * @returns {string} canonical type key from MERMAID_THEME_TYPES or "unknown"
 */
export const detectMermaidDiagramType = (code) => {
  if (!code || typeof code !== 'string') return 'unknown'
  const lines = code.split(/\r?\n/)
  let inFrontmatter = false
  let frontmatterStarted = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (!frontmatterStarted && line === '---') {
      // Leading YAML frontmatter (Mermaid supports `---\nconfig:\n...`).
      inFrontmatter = true
      frontmatterStarted = true
      continue
    }
    if (inFrontmatter) {
      if (line === '---' || line === '...') {
        inFrontmatter = false
      }
      continue
    }
    if (line.startsWith('%%')) continue
    for (const [pattern, type] of TYPE_LINE_PATTERNS) {
      if (pattern.test(line)) return type
    }
    return 'unknown'
  }
  return 'unknown'
}
// END_BLOCK_MERMAID_TYPE_DETECT

// START_BLOCK_MERMAID_FIT_COLUMN
// C-34 fit-column policy (user decision 2026-10-15) meets the C-51 lab
// sizes: every type except gantt/journey/packet/timeline keeps
// useMaxWidth:true (wide diagrams fit the text column; natural size lives
// in the fullscreen viewer). The four group-3 types render at the lab's
// natural size with readable ≥ 11 px labels — anything wider than the
// column scrolls inside the block (the ag-mermaid-preview CSS) and the
// C-34 viewer expand stays available.
const SCROLLABLE_TYPES = ['gantt', 'journey', 'packet', 'timeline']

const buildTypeConfigs = () => {
  const configs = {}
  // Same key set (and Mermaid key names) the pre-C-51 pipeline configured
  // with useMaxWidth:true — behaviour is unchanged for these types.
  for (const key of [
    'flowchart', 'sequence', 'gantt', 'journey', 'timeline', 'class', 'state',
    'er', 'pie', 'quadrantChart', 'xyChart', 'requirement', 'architecture',
    'mindmap', 'ishikawa', 'kanban', 'gitGraph', 'c4', 'sankey', 'packet',
    'block', 'treeView', 'radar', 'venn'
  ]) {
    configs[key] = { useMaxWidth: true }
  }
  // Lab per-type layout config. The four scrollable types keep the lab's
  // useMaxWidth:false; everything else merges the lab values with
  // useMaxWidth:true.
  const lab = {
    flowchart: { curve: 'basis', nodeSpacing: 44, rankSpacing: 52, padding: 14 },
    sequence: { mirrorActors: false, actorMargin: 60, boxMargin: 8 },
    gantt: {
      useWidth: 720, axisFormat: '%d %b', tickInterval: '2day', fontSize: 13,
      sectionFontSize: 13, barHeight: 24, barGap: 6, topPadding: 44,
      leftPadding: 110, gridLineStartPadding: 34
    },
    journey: { taskFontSize: 14, width: 120, height: 50, leftMargin: 120 },
    timeline: { disableMulticolor: false, padding: 8 },
    packet: { bitWidth: 20, rowHeight: 34, bitsPerRow: 32 },
    sankey: { showValues: true, prefix: ' ', linkColor: 'gradient', nodeAlignment: 'justify' },
    radar: { curveTension: 0.12 },
    quadrantChart: { pointLabelFontSize: 13, quadrantLabelFontSize: 15 },
    xyChart: { width: 640, height: 380 },
    c4: (() => {
      const c = { diagramMarginX: 30, diagramMarginY: 20, c4ShapeMargin: 40, width: 200, height: 70 }
      const set = (k, bg, border) => {
        c[k + '_bg_color'] = bg
        c[k + '_border_color'] = border
      }
      return { c, set }
    })()
  }
  const merge = (key, extra) => {
    const fit = SCROLLABLE_TYPES.includes(key)
    configs[key] = { ...extra, useMaxWidth: fit ? false : true }
  }
  merge('flowchart', lab.flowchart)
  merge('sequence', lab.sequence)
  merge('gantt', lab.gantt)
  merge('journey', lab.journey)
  merge('timeline', lab.timeline)
  merge('packet', lab.packet)
  merge('sankey', lab.sankey)
  merge('radar', lab.radar)
  merge('quadrantChart', lab.quadrantChart)
  merge('xyChart', lab.xyChart)
  // C-4 colours ride the c4 config keys (D-5): person/system/container/
  // component each get their palette band; external shapes sit on the
  // theme's own neutral; fonts follow the chrome stack.
  const c4 = lab.c4.c
  const set = lab.c4.set
  return { configs, c4, set }
}
// END_BLOCK_MERMAID_FIT_COLUMN

// START_BLOCK_MERMAID_CONFIG
/**
 * Build the mermaid.initialize config for the active theme and one diagram
 * type — the accepted lab look: theme "base" + look "neo", categorical
 * OKLCH scales (tints for areas, series colours for lines/bars/sectors),
 * themeCSS polish, and the per-type layout/sizing config.
 *
 * @param {object} t theme tokens (readActiveThemeTokens shape)
 * @param {string} type canonical diagram type key
 * @returns {object} spread into mermaid.initialize (callers add securityLevel)
 */
export const buildMermaidThemeConfig = (t, type = 'unknown') => {
  const series = chartPalette(t)
  const tint = palette(t.accent, t.dark ? 0.36 : 0.9, t.dark ? 0.05 : 0.05)
  const tintBorder = palette(t.accent, t.dark ? 0.5 : 0.76, t.dark ? 0.07 : 0.08)
  // T-012: node shapes sit on the code-block panel, so their fill/border/
  // line/text derive against THAT panel (not the page tokens).
  const node = nodeContrastColors(t)
  const v = {
    background: t.bg, primaryColor: node.fill, primaryBorderColor: node.border,
    primaryTextColor: node.text, textColor: t.text, lineColor: node.line,
    // mainBkg / nodeBorder are left to Mermaid's derivation from
    // primaryColor / primaryBorderColor so a user's %%{init}%% primaryColor
    // still recolours the nodes (review 2026-10-16).
    secondaryColor: tint[0], tertiaryColor: t.code, clusterBkg: node.clusterBkg, clusterBorder: node.clusterBorder,
    // C-54 R-2: label boxes take the panel the diagram sits on (the page
    // colour drew black boxes on dark panels and white patches on light).
    edgeLabelBackground: node.panel, labelBackgroundColor: node.panel, titleColor: t.text,
    noteBkgColor: node.fill, noteBorderColor: node.border, noteTextColor: node.text,
    actorBkg: node.fill, actorBorder: node.border, actorTextColor: node.text, signalColor: node.line, signalTextColor: t.text,
    fontFamily: t.font, fontSize: '15px', darkMode: t.dark,
    useGradient: false, dropShadow: t.dark ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' : 'drop-shadow(0 1px 2px rgba(34,37,43,0.12))'
  }
  // Categorical scales: tinted areas with readable text, series-coloured peers.
  for (let i = 0; i < 12; i++) {
    v['cScale' + i] = tint[i % 8]
    v['cScalePeer' + i] = tintBorder[i % 8]
    v['cScaleLabel' + i] = t.text
    v['cScaleInv' + i] = series[i % 8]
  }
  for (let i = 0; i < 12; i++) v['pie' + (i + 1)] = series[i % 8]
  // Keynote-style pie (user 2026-10-16): thin background-coloured
  // separators, no outer ring, white semibold percentages inside.
  v.pieStrokeColor = t.bg; v.pieStrokeWidth = '2px'; v.pieOuterStrokeWidth = '0px'; v.pieOuterStrokeColor = t.bg
  v.pieSectionTextColor = '#ffffff'; v.pieSectionTextSize = '15px'; v.pieOpacity = '1'; v.pieLegendTextSize = '14px'
  v.pieTitleTextSize = '17px'; v.pieLegendTextColor = t.text; v.pieTitleTextColor = t.text
  for (let i = 0; i < 8; i++) {
    v['git' + i] = series[i]
    v['gitBranchLabel' + i] = t.dark ? '#111' : '#fff'
    v['gitInv' + i] = series[i]
  }
  v.commitLabelColor = t.text; v.commitLabelBackground = t.code
  for (let i = 0; i < 8; i++) v['fillType' + i] = tint[i]
  for (let i = 0; i < 6; i++) v['actor' + i] = series[i]
  v.faceColor = t.surface
  Object.assign(v, {
    // D-4: quadrant in one hue of different lightness.
    quadrant1Fill: oklch(t.dark ? 0.33 : 0.92, 0.04, hueOf(t.accent)),
    quadrant2Fill: oklch(t.dark ? 0.39 : 0.87, 0.06, hueOf(t.accent)),
    quadrant3Fill: t.surface,
    quadrant4Fill: oklch(t.dark ? 0.28 : 0.95, 0.025, hueOf(t.accent)),
    quadrant1TextFill: t.text, quadrant2TextFill: t.text, quadrant3TextFill: t.text, quadrant4TextFill: t.text,
    quadrantPointFill: series[0], quadrantPointTextFill: t.text, quadrantTitleFill: t.text,
    quadrantXAxisTextFill: t.muted, quadrantYAxisTextFill: t.muted,
    quadrantInternalBorderStrokeFill: t.border, quadrantExternalBorderStrokeFill: t.border
  })
  v.xyChart = {
    backgroundColor: t.bg, titleColor: t.text, xAxisLabelColor: t.muted, yAxisLabelColor: t.muted,
    xAxisTitleColor: t.muted, yAxisTitleColor: t.muted, xAxisLineColor: t.border, yAxisLineColor: t.border,
    xAxisTickColor: t.border, yAxisTickColor: t.border, plotColorPalette: series.join(', ')
  }
  v.radar = {
    axisColor: t.border, axisStrokeWidth: 1, axisLabelFontSize: 13, curveOpacity: 0.28,
    curveStrokeWidth: 2, graticuleColor: t.border, graticuleOpacity: 0.5,
    graticuleStrokeWidth: 1, legendBoxSize: 12, legendFontSize: 13
  }
  v.packet = {
    startByteColor: t.muted, endByteColor: t.muted, labelColor: t.text, titleColor: t.text,
    blockStrokeColor: t.border, blockFillColor: t.surface, labelFontSize: '13px', byteFontSize: '10px'
  }
  // Gantt
  Object.assign(v, {
    taskBkgColor: tint[0], taskBorderColor: tintBorder[0], taskTextColor: t.text, taskTextDarkColor: t.text, taskTextOutsideColor: t.text,
    activeTaskBkgColor: tint[2], activeTaskBorderColor: series[2], doneTaskBkgColor: t.code, doneTaskBorderColor: t.border,
    critBkgColor: tint[4], critBorderColor: series[4], todayLineColor: series[1], gridColor: t.border,
    sectionBkgColor: t.bg, altSectionBkgColor: t.code, sectionBkgColor2: t.bg, excludeBkgColor: t.code
  })
  // Architecture
  Object.assign(v, { archEdgeColor: node.line, archEdgeArrowColor: node.line, archGroupBorderColor: node.border, archGroupBorderWidth: '1px' })

  // Per-type overrides: series-coloured scales where the scale draws lines.
  if (type === 'radar') {
    for (let i = 0; i < 12; i++) v['cScale' + i] = series[i % 8]
  }
  const extraCss = []
  if (type === 'architecture') {
    // The built-in icons hard-code their tile and glyph colours in inline
    // styles; attribute selectors + !important repaint them per theme.
    extraCss.push(`rect[style*="#087ebf"] { fill: ${tint[0]} !important; stroke: ${tintBorder[0]} !important; stroke-width: 1px !important; rx: 14px; ry: 14px; }`)
    extraCss.push(`[style*="stroke: #fff"] { stroke: ${series[0]} !important; }`)
    extraCss.push(`[style*="fill: #fff"] { fill: ${series[0]} !important; }`)
  }
  if (type === 'pie') {
    extraCss.push(`.slice { font-weight: 600; }`)
    extraCss.push(`.pieTitleText { font-weight: 600; }`)
    extraCss.push(`.legend rect { rx: 3px; ry: 3px; }`)
  }
  if (type === 'sankey') {
    // Keep Mermaid's gradient links (they read best); only dark themes need
    // normal blending — multiply over a dark background swallows the links.
    if (t.dark) extraCss.push(`.link { mix-blend-mode: normal !important; stroke-opacity: 0.55 !important; }`)
  }
  const themeCSS = [
    `.node rect, rect.actor, .statediagram-state rect, rect.task { rx: 9px; ry: 9px; }`,
    `.node rect, .node polygon, .node circle, .node path, rect.actor, .classGroup rect, .er.entityBox, .mindmap-node path, .mindmap-node rect, .kanban-item rect, .section rect { filter: ${v.dropShadow}; }`,
    `.nodeLabel, text.actor, .messageText, .taskText, .stateLabel { font-weight: 500; }`,
    // journey and gitGraph hard-code Trebuchet on some labels.
    `text, tspan { font-family: ${t.font}; }`,
    `.edgeLabel, .edgeLabel p { color: ${node.labelText}; font-size: 13px; }`,
    `.flowchart-link, .messageLine0, .messageLine1, .transition, .relation { stroke-width: 1.4px; }`,
    `.mindmap-edges path, .edge-depth-1, .edge-depth-2 { stroke-width: 2px !important; }`,
    `.sankey-node rect, .node rect { rx: 3px; }`,
    `.timeline-node text, .timeline-node tspan { font-size: 13px; }`,
    ...extraCss
  ].join('\n')

  const { configs, c4, set } = buildTypeConfigs()
  // C-4 palette bands (see START_BLOCK_MERMAID_FIT_COLUMN).
  const strong = palette(t.accent, t.dark ? 0.5 : 0.5, 0.09)
  const strongB = palette(t.accent, t.dark ? 0.62 : 0.42, 0.09)
  set('person', strong[1], strongB[1])
  set('external_person', t.dark ? '#4a4e58' : '#7c7f87', t.dark ? '#5b606b' : '#6b6e76')
  for (const k of ['system', 'system_db', 'system_queue']) set(k, strong[0], strongB[0])
  for (const k of ['external_system', 'external_system_db', 'external_system_queue']) {
    set(k, t.dark ? '#4a4e58' : '#8a8d94', t.dark ? '#5b606b' : '#7a7d84')
  }
  for (const k of ['container', 'container_db', 'container_queue']) set(k, strong[2], strongB[2])
  for (const k of ['component', 'component_db', 'component_queue']) set(k, strong[3], strongB[3])
  for (const k of ['person', 'external_person', 'system', 'external_system', 'container', 'component', 'message', 'boundary']) {
    c4[k + 'FontFamily'] = t.font
    c4[k + 'FontSize'] = 14
  }
  configs.c4 = { ...c4, useMaxWidth: true }

  return {
    theme: 'base',
    look: 'neo',
    fontFamily: t.font,
    themeVariables: v,
    themeCSS,
    ...configs
  }
}
// END_BLOCK_MERMAID_CONFIG

// START_BLOCK_MERMAID_SIGNATURE
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
 * palette AND the derived node colours — for the pipeline's SVG cache key.
 * Any switch that changes the colours a diagram would render with (Paper →
 * Ink, Auto light/dark flip, a theme with a different accent) changes the
 * signature, so every diagram re-renders; two themes that resolve to
 * identical tokens keep their cache. T-012: the derived node fill/border/
 * text ride the digest, so the contrast rework invalidated every existing
 * cache entry exactly once.
 *
 * @param {object} t theme tokens (readActiveThemeTokens shape)
 * @returns {string} short signature safe for a cache-key prefix
 */
export const mermaidThemeSignature = (t) => {
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
// END_BLOCK_MERMAID_SIGNATURE
