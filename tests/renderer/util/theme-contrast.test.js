// FILE: tests/renderer/util/theme-contrast.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: WCAG AA contrast gate over every shipped editor theme plus
//            C-41 T-003 registration pins for the six new family members.
//   SCOPE: Parse src/renderer/src/assets/themes/*.theme.css (top level
//          only — prismjs/ and export/ companions are separate surfaces),
//          resolve var() references inside a file, composite rgba alpha
//          over the background, compute WCAG relative-luminance contrast,
//          and assert the editor text/link/muted floors; assert every
//          theme defines the same variable set as paper.theme.css; pin
//          the six new theme ids in the registration sources and locales.
//   DEPENDS: Vitest, Node fs/path, theme css files, util/theme.js source,
//            util/themeColor.js source, config.js source, commands/index.js
//            source, m009_menu.rs source, static/locales/*.json.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-48 (C-41 T-003).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// Variable mapping (chosen from paper.theme.css, the reference structure):
//   - body text  = --editorColor       on --editorBgColor  ≥ 4.5 (WCAG AA)
//   - link colour = --linkColor        on --editorBgColor  ≥ 4.5 (WCAG AA)
//   - muted/secondary = --blockquoteTextColor on --editorBgColor ≥ 3.0
// All three foreground variables may carry an alpha (e.g. rgba(43,48,50,.7));
// such colours are composited over the opaque editor background before the
// ratio is computed, because that is what a reader actually sees.
//
// START_MODULE_MAP
//   THEMES_DIR - assets/themes path (top-level *.theme.css only).
//   readThemeFiles - read and parse every kept theme file.
//   parseVars - extract --name: value pairs from a theme stylesheet.
//   resolveVar - resolve var(--x) references within one file.
//   parseColor - #rgb / #rrggbb / rgb() / rgba() to {r,g,b,a}.
//   flattenOver - composite an (possibly translucent) colour over an opaque one.
//   relativeLuminance - WCAG 2.x relative luminance of a flattened colour.
//   contrastRatio - WCAG contrast ratio between two flattened colours.
//   ratioFor - contrast of a theme foreground variable on --editorBgColor.
//   ROOT - GRACE 4 synchronized symbol
//   EXPECTED_THEME_IDS - the 28 family member ids the gate covers.
//   channelLuminance - sRGB channel to linear luminance (WCAG).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-41 T-003: first contrast gate over
//   the 28 kept themes (six new members + AA fixes across 11 older ones)
//   plus registration pins for one-light, alucard, nord-light,
//   kanagawa-lotus, graphite-dark, ulysses-dark.
// END_CHANGE_SUMMARY

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..', '..')
const THEMES_DIR = resolve(ROOT, 'src/renderer/src/assets/themes')


// The 14 C-41 families × 2 members of spec R-3 plus the four C-51 T-007
// members — the exact set this gate covers.
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
  // C-51 T-007: Docs and macOS family members.
  'docs', 'docs-dark',
  'macos', 'macos-dark'
]

const parseVars = (css) => {
  const vars = {}
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim()
  }
  return vars
}

const resolveVar = (value, vars, depth = 0) => {
  if (depth > 5) return value
  const m = value.match(/^var\(\s*(--[\w-]+)\s*\)$/)
  if (!m) return value
  const next = vars[m[1].slice(2)]
  return next === undefined ? value : resolveVar(next, vars, depth + 1)
}

const parseColor = (raw) => {
  const value = raw.trim().toLowerCase()
  let m = value.match(/^#([0-9a-f]{3})$/)
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16))
    return { r, g, b, a: 1 }
  }
  m = value.match(/^#([0-9a-f]{6})$/)
  if (m) {
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
      a: 1
    }
  }
  m = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] === undefined ? 1 : Number(m[4])
    }
  }
  return null
}

// Composite a possibly translucent colour over an opaque backdrop
// (source-over). A translucent backdrop is first flattened over white.
const flattenOver = (fg, bg) => {
  const base = bg.a === 1 ? bg : flattenOver(bg, { r: 255, g: 255, b: 255, a: 1 })
  return {
    r: fg.a * fg.r + (1 - fg.a) * base.r,
    g: fg.a * fg.g + (1 - fg.a) * base.g,
    b: fg.a * fg.b + (1 - fg.a) * base.b,
    a: 1
  }
}

const channelLuminance = (c255) => {
  const c = c255 / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

const relativeLuminance = ({ r, g, b }) =>
  0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)

const contrastRatio = (flatA, flatB) => {
  const la = relativeLuminance(flatA)
  const lb = relativeLuminance(flatB)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// Contrast of a theme's foreground variable, composited over its
// --editorBgColor (the editor writing surface).
const ratioFor = (vars, fgName) => {
  const bg = parseColor(resolveVar(vars.editorBgColor, vars))
  const fg = parseColor(resolveVar(vars[fgName], vars))
  if (!bg || !fg) return null
  return contrastRatio(flattenOver(fg, bg), bg)
}

const readThemeFiles = () => {
  const themes = {}
  for (const file of readdirSync(THEMES_DIR)) {
    if (!file.endsWith('.theme.css')) continue
    const id = file.replace(/\.theme\.css$/, '')
    themes[id] = parseVars(readFileSync(resolve(THEMES_DIR, file), 'utf-8'))
  }
  return themes
}

describe('theme contrast (C-41 T-003)', () => {
  const themes = readThemeFiles()

  it('covers exactly the 32 family members — no other theme file ships', () => {
    expect(Object.keys(themes).sort()).toEqual([...EXPECTED_THEME_IDS].sort())
  })

  it('body text and links meet WCAG AA (4.5:1) on the editor background', () => {
    const failures = []
    for (const [id, vars] of Object.entries(themes)) {
      for (const fgVar of ['editorColor', 'linkColor']) {
        const ratio = ratioFor(vars, fgVar)
        if (ratio === null) {
          failures.push(`${id}: ${fgVar} is not a parsable colour`)
        } else if (ratio < 4.5) {
          failures.push(`${id}: ${fgVar} = ${ratio.toFixed(2)} < 4.5`)
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('muted/secondary text (blockquotes) meets 3:1 on the editor background', () => {
    const failures = []
    for (const [id, vars] of Object.entries(themes)) {
      const ratio = ratioFor(vars, 'blockquoteTextColor')
      if (ratio === null) {
        failures.push(`${id}: blockquoteTextColor is not a parsable colour`)
      } else if (ratio < 3.0) {
        failures.push(`${id}: blockquoteTextColor = ${ratio.toFixed(2)} < 3.0`)
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('every theme defines the same variable set as paper (missing list per theme)', () => {
    const paperVars = new Set(Object.keys(themes.paper))
    const report = []
    for (const [id, vars] of Object.entries(themes)) {
      const missing = [...paperVars].filter((name) => !(name in vars))
      if (missing.length > 0) {
        report.push(`${id} missing: ${missing.join(', ')}`)
      }
    }
    expect(report, report.join('\n')).toEqual([])
  })
})

describe('six new family member registration (C-41 T-003)', () => {
  const NEW_MEMBERS = ['one-light', 'alucard', 'nord-light', 'kanagawa-lotus', 'graphite-dark', 'ulysses-dark']
  const NEW_FACTORIES = ['oneLight', 'alucard', 'nordLight', 'kanagawaLotus', 'graphiteDark', 'ulyssesDark']
  const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')

  it('themeColor.js imports a css + prismjs companion and exports a factory per member', async () => {
    const themeColor = await import('@/util/themeColor')
    const src = readSource('src/renderer/src/util/themeColor.js')
    for (let i = 0; i < NEW_MEMBERS.length; i++) {
      expect(src).toContain(`../assets/themes/${NEW_MEMBERS[i]}.theme.css?inline`)
      expect(src).toContain(`../assets/themes/prismjs/${NEW_MEMBERS[i]}.theme.css?inline`)
      expect(typeof themeColor[NEW_FACTORIES[i]], `${NEW_FACTORIES[i]} factory`).toBe('function')
      // The Prism companion exists on disk and is a real token stylesheet.
      const prismCss = readFileSync(
        resolve(ROOT, `src/renderer/src/assets/themes/prismjs/${NEW_MEMBERS[i]}.theme.css`),
        'utf-8'
      )
      expect(prismCss).toContain('.token.keyword')
    }
  })

  it('theme.js themeMap, dark classification, palette, and native menu all know the members', async () => {
    const themeSrc = readSource('src/renderer/src/util/theme.js')
    const config = await import('@/config')
    const commandsSrc = readSource('src/renderer/src/commands/index.js')
    const menuSrc = readSource('src-tauri/src/m009_menu.rs')
    for (const id of NEW_MEMBERS) {
      expect(themeSrc).toContain(`'${id}':`)
      expect(commandsSrc).toContain(`id: 'window.change-theme-${id}'`)
      // menu-consistency requires every palette id to exist in the native menu.
      expect(menuSrc).toContain(`"window.change-theme-${id}"`)
    }
    // Graphite Dark and Ulysses Dark are dark themes; the four light
    // members must not be classified dark.
    expect(config.railscastsThemes).toContain('graphite-dark')
    expect(config.railscastsThemes).toContain('ulysses-dark')
    expect(config.isDarkTheme('graphite-dark')).toBe(true)
    expect(config.isDarkTheme('ulysses-dark')).toBe(true)
    expect(config.isDarkTheme('one-light')).toBe(false)
    expect(config.isDarkTheme('alucard')).toBe(false)
    expect(config.isDarkTheme('nord-light')).toBe(false)
    expect(config.isDarkTheme('kanagawa-lotus')).toBe(false)
  })

  it('every locale ships an untranslated display name for each member', () => {
    const NAMES = {
      alucard: 'Alucard',
      kanagawaLotus: 'Kanagawa Lotus',
      nordLight: 'Nord Light',
      oneLight: 'One Light',
      graphiteDark: 'Graphite Dark',
      ulyssesDark: 'Ulysses Dark'
    }
    const locales = readdirSync(resolve(ROOT, 'static/locales'))
      .filter((f) => f.endsWith('.json') && !f.endsWith('.min.json'))
    expect(locales.length).toBe(10)
    for (const file of locales) {
      const table = JSON.parse(readFileSync(resolve(ROOT, 'static/locales', file), 'utf-8'))
      for (const [key, name] of Object.entries(NAMES)) {
        expect(table.menu.theme[key], `${file} menu.theme.${key}`).toBe(name)
      }
    }
  })
})
