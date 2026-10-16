// FILE: tests/e2e/fixtures/chartPalette.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Test-side copy of muya's pure palette maths (OKLCH palette, hex blend) so e2e specs can compute expected theme colours — Playwright cannot load muya's ESM sources.
//   SCOPE: oklch, hueOf, PALETTE_STEPS, palette, blendHex — verbatim from src/muya/lib/parser/render/mermaidTheme.js; tests/renderer/muya/chart-palette-fixture.test.js pins parity.
//   DEPENDS: none.
//   LINKS: C-51 T-005; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   oklch - OKLCH → hex.
//   hueOf - hex → OKLCH hue.
//   PALETTE_STEPS - the 8 hue offsets.
//   palette - accent + lightness/chroma → 8 hex colours.
//   blendHex - text-over-background blend.
//   clamp01 - channel clamp.
//   toHex - 0..1 channels → hex.
//   toHex255 - 0..255 channels → hex.
//   lin2srgb - linear → sRGB.
//   srgb2lin - sRGB → linear.
//   parseColor - CSS colour → channels.
// END_MODULE_MAP
/* eslint-disable */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

const toHex = (r: number, g: number, b: number) =>
  '#' +
  [r, g, b]
    .map((v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0'))
    .join('')

const lin2srgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)

const srgb2lin = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))

export const oklch = (L: number, C: number, hDeg: number) => {
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

export const hueOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const r = srgb2lin(((n >> 16) & 255) / 255)
  const g = srgb2lin(((n >> 8) & 255) / 255)
  const b = srgb2lin((n & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.536301541 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
}

export const PALETTE_STEPS = [0, 180, 90, 270, 45, 225, 135, 315]

export const palette = (accentHex: string, L: number, C: number) =>
  PALETTE_STEPS.map((d: number) => oklch(L, C, (hueOf(accentHex) + d) % 360))

const parseColor = (value: string): { r: number, g: number, b: number } | null => {
  if (!value) return null
  const s = String(value).trim()
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s)
  if (m) {
    return {
      r: parseInt(m[1] + m[1], 16),
      g: parseInt(m[2] + m[2], 16),
      b: parseInt(m[3] + m[3], 16)
    }
  }
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s)
  if (m) {
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16)
    }
  }
  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s)
  if (m) {
    const r = Number.parseFloat(m[1])
    const g = Number.parseFloat(m[2])
    const b = Number.parseFloat(m[3])
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return { r, g, b }
    }
  }
  return null
}

const toHex255 = (r: number, g: number, b: number) => toHex(r / 255, g / 255, b / 255)

export const blendHex = (textHex: string, bgHex: string, t: number) => {
  const a = parseColor(textHex)
  const b = parseColor(bgHex)
  if (!a || !b) return textHex
  return toHex255(a.r * t + b.r * (1 - t), a.g * t + b.g * (1 - t), a.b * t + b.b * (1 - t))
}
