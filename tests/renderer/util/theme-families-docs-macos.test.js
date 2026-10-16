// FILE: tests/renderer/util/theme-families-docs-macos.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-51 T-007 — the Docs and macOS theme families: family
//            model membership, member registration end-to-end (themeMap,
//            themeColor factories, Prism companions, command palette,
//            native menu, all ten locales), canvas-pinned theme colours,
//            swatch source values, Auto/Light/Dark member resolution, and
//            the --chartPalette → mermaidTheme.readActiveThemeTokens /
//            buildMermaidThemeConfig chain (R-2 derives from these themes).
//   SCOPE: Pure data + disk CSS parsing + jsdom inline CSS-variable mirrors
//            feeding the real mermaidTheme token reader. The C-41 gates
//            (variable parity with paper, WCAG AA contrast) cover the four
//            files through tests/renderer/util/theme-contrast.test.js.
//   DEPENDS: Vitest + jsdom, util/themeFamilies, util/theme, util/themeColor,
//            util/autoTheme, util/themeMigration, config.js,
//            muya/lib/parser/render/mermaidTheme, theme css files,
//            static/locales/*.json, commands/index.js, m009_menu.rs.
//   LINKS: .grace/changes/active/C-51 T-007 (R-5);
//          .grace/verification/runtime.xml V-M-011 scenario-60.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root resolver for source pins.
//   readSource / readThemeCss - read repo files from disk.
//   parseVars - extract --name: value pairs from a theme stylesheet (same shape as the contrast gate).
//   NEW_MEMBERS / NEW_FACTORIES - the four C-51 T-007 theme ids and factories.
//   CANVAS_PINS - canvas-critical colours per theme (bg/text/accent/sidebar/border).
//   CHART_PALETTES - the exact --chartPalette lists per theme.
//   EXPECTED_LOCALE_NAMES - menu.theme docs/docsDark/macos/macosDark per locale.
//   mirrorThemeVars - set every parsed theme variable as the root inline mirror (what util/theme.js addThemeStyle does).
//   clearRootVars - remove the mirrored variables and the dark flag.
//   NEW_FACTORIES - test fixture / helper.
//   paletteHexes - test fixture / helper.
//   readThemeCss - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-007 initial pins. Red on main:
//   every case fails (the families, themes, palettes and locale keys do
//   not exist there).
// END_CHANGE_SUMMARY

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  readActiveThemeTokens,
  buildMermaidThemeConfig,
  mermaidThemeSignature
} from 'muya/lib/parser/render/mermaidTheme'

const ROOT = resolve(__dirname, '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')
const readThemeCss = (id) => readSource(`src/renderer/src/assets/themes/${id}.theme.css`)

const parseVars = (css) => {
  const vars = {}
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim()
  }
  return vars
}

const NEW_MEMBERS = ['docs', 'docs-dark', 'macos', 'macos-dark']
const NEW_FACTORIES = { docs: 'docs', 'docs-dark': 'docsDark', macos: 'macos', 'macos-dark': 'macosDark' }

// Canvas-critical colours (canvas Main/DocsDark/MacOS + the task brief).
const CANVAS_PINS = {
  docs: {
    editorBgColor: '#FCFCFB', editorColor: '#1F1F1F', themeColor: '#1F1F1F',
    linkColor: '#1F1F1F', sideBarBgColor: '#F1F1EF', tableBorderColor: '#E4E4E1'
  },
  'docs-dark': {
    editorBgColor: '#161615', editorColor: '#ECECEA', themeColor: '#ECECEA',
    linkColor: '#ECECEA', sideBarBgColor: '#242422', tableBorderColor: '#2C2C2A'
  },
  macos: {
    editorBgColor: '#FFFFFF', editorColor: '#1D1D1F', themeColor: '#007AFF',
    sideBarBgColor: '#ECECEE', tableBorderColor: '#D1D1D6'
  },
  'macos-dark': {
    editorBgColor: '#1E1E1E', editorColor: '#F5F5F7', themeColor: '#0A84FF',
    sideBarBgColor: '#252527', tableBorderColor: '#3A3A3C'
  }
}

// The exact --chartPalette lists (lowercased by colorToHex in the tokens).
const CHART_PALETTES = {
  docs: '#4F6BED, #10A37F, #D97706, #E11D48, #7C3AED, #0891B2, #EA580C, #DB2777',
  'docs-dark': '#7C93F5, #34D399, #F59E0B, #FB7185, #A78BFA, #22D3EE, #FB923C, #F472B6',
  macos: '#007AFF, #34C759, #FF9500, #FF3B30, #AF52DE, #30B0C7, #FFCC00, #FF2D55',
  'macos-dark': '#0A84FF, #30D158, #FF9F0A, #FF453A, #BF5AF2, #40C8E0, #FFD60A, #FF375F'
}
const paletteHexes = (id) => CHART_PALETTES[id].split(',').map((c) => c.trim().toLowerCase())

// menu.theme names per locale (the "Dark" suffix follows each locale's
// existing convention — Dunkel/Oscuro/Sombre/ダーク/다크/Escuro/深色).
const EXPECTED_LOCALE_NAMES = {
  en: { docs: 'Docs', docsDark: 'Docs Dark', macos: 'macOS', macosDark: 'macOS Dark' },
  ru: { docs: 'Docs', docsDark: 'Docs Dark', macos: 'macOS', macosDark: 'macOS Dark' },
  de: { docs: 'Docs', docsDark: 'Docs Dunkel', macos: 'macOS', macosDark: 'macOS Dunkel' },
  es: { docs: 'Docs', docsDark: 'Docs Oscuro', macos: 'macOS', macosDark: 'macOS Oscuro' },
  fr: { docs: 'Docs', docsDark: 'Docs Sombre', macos: 'macOS', macosDark: 'macOS Sombre' },
  ja: { docs: 'Docs', docsDark: 'Docs ダーク', macos: 'macOS', macosDark: 'macOS ダーク' },
  ko: { docs: 'Docs', docsDark: 'Docs 다크', macos: 'macOS', macosDark: 'macOS 다크' },
  pt: { docs: 'Docs', docsDark: 'Docs Escuro', macos: 'macOS', macosDark: 'macOS Escuro' },
  'zh-CN': { docs: 'Docs', docsDark: 'Docs 深色', macos: 'macOS', macosDark: 'macOS 深色' },
  'zh-TW': { docs: 'Docs', docsDark: 'Docs 深色', macos: 'macOS', macosDark: 'macOS 深色' }
}

// START_BLOCK_MIRROR_THEME_VARS
// util/theme.js addThemeStyle mirrors every --var from the theme CSS onto
// the document element's inline style; readActiveThemeTokens reads that
// mirror first. Reproduce the mirror from the real theme file so the
// chain under test is the production one.
const mirrorThemeVars = (id) => {
  const vars = parseVars(readThemeCss(id))
  const root = document.documentElement
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(`--${name}`, value)
  }
  if (id.endsWith('-dark')) document.body.classList.add('dark')
  return vars
}

const clearRootVars = () => {
  const root = document.documentElement
  for (const id of NEW_MEMBERS) {
    for (const name of Object.keys(parseVars(readThemeCss(id)))) {
      root.style.removeProperty(`--${name}`)
    }
  }
  document.body.classList.remove('dark')
}

beforeEach(() => {
  clearRootVars()
})

afterEach(() => {
  clearRootVars()
})
// END_BLOCK_MIRROR_THEME_VARS

// ── family model ──────────────────────────────────────────────────────
describe('Docs and macOS families (C-51 T-007)', () => {
  it('are registered as families with distinct light/dark members', async () => {
    const { THEME_FAMILIES, themePairs, themeFamilyOf } = await import('@/util/themeFamilies')
    const docs = THEME_FAMILIES.find((f) => f.id === 'docs')
    const macos = THEME_FAMILIES.find((f) => f.id === 'macos')
    expect(docs).toEqual({ id: 'docs', name: 'Docs', light: 'docs', dark: 'docs-dark' })
    expect(macos).toEqual({ id: 'macos', name: 'macOS', light: 'macos', dark: 'macos-dark' })
    // Pairs resolve both ways.
    expect(themePairs.docs).toBe('docs-dark')
    expect(themePairs['docs-dark']).toBe('docs')
    expect(themePairs.macos).toBe('macos-dark')
    expect(themePairs['macos-dark']).toBe('macos')
    expect(themeFamilyOf('docs').id).toBe('docs')
    expect(themeFamilyOf('docs-dark').id).toBe('docs')
    expect(themeFamilyOf('macos').id).toBe('macos')
    expect(themeFamilyOf('macos-dark').id).toBe('macos')
  })

  it('every member is registered in themeMap with a CSS + Prism factory', async () => {
    const { themeMap } = await import('@/util/theme')
    const themeColor = await import('@/util/themeColor')
    const src = readSource('src/renderer/src/util/themeColor.js')
    for (const id of NEW_MEMBERS) {
      expect(typeof themeMap[id], `${id} in themeMap`).toBe('function')
      expect(src).toContain(`../assets/themes/${id}.theme.css?inline`)
      expect(src).toContain(`../assets/themes/prismjs/${id}.theme.css?inline`)
      expect(typeof themeColor[NEW_FACTORIES[id]], `${NEW_FACTORIES[id]} factory`).toBe('function')
      // The Prism companion exists on disk and is a real token stylesheet.
      const prismCss = readSource(`src/renderer/src/assets/themes/prismjs/${id}.theme.css`)
      expect(prismCss).toContain('.token.keyword')
    }
  })

  it('dark members are classified dark, light members light', async () => {
    const { isDarkTheme, railscastsThemes } = await import('@/config')
    expect(isDarkTheme('docs')).toBe(false)
    expect(isDarkTheme('macos')).toBe(false)
    expect(isDarkTheme('docs-dark')).toBe(true)
    expect(isDarkTheme('macos-dark')).toBe(true)
    expect(railscastsThemes).toContain('docs-dark')
    expect(railscastsThemes).toContain('macos-dark')
  })

  it('stored member ids pass the migration untouched', async () => {
    const { migrateThemeId } = await import('@/util/themeMigration')
    for (const id of NEW_MEMBERS) {
      expect(migrateThemeId(id, 'light')).toBe(id)
      expect(migrateThemeId(id, 'dark')).toBe(id)
    }
  })
})

// ── theme CSS pins (canvas colours) ───────────────────────────────────
describe('Docs and macOS theme colours (C-51 T-007)', () => {
  it('carry the canvas-pinned grounds, text, accent, sidebar and hairlines', () => {
    for (const [id, pins] of Object.entries(CANVAS_PINS)) {
      const vars = parseVars(readThemeCss(id))
      for (const [name, value] of Object.entries(pins)) {
        expect(vars[name], `${id} --${name}`).toBe(value)
      }
    }
  })

  it('define an explicit 8-colour --chartPalette so charts are not grey', () => {
    for (const id of NEW_MEMBERS) {
      const vars = parseVars(readThemeCss(id))
      expect(vars.chartPalette, `${id} --chartPalette`).toBe(CHART_PALETTES[id])
      expect(vars.chartPalette.split(',')).toHaveLength(8)
    }
  })

  it('the document uses the system UI font (editor-wrapper override)', () => {
    for (const id of NEW_MEMBERS) {
      const css = readThemeCss(id)
      expect(css, `${id} .editor-wrapper font override`).toMatch(
        /\.editor-wrapper\s*\{\s*font-family:[^}]*!important/
      )
      expect(css).toContain('-apple-system')
    }
  })

  it('swatch source colours resolve from the theme CSS (bg/fg/accent)', () => {
    // Vitest resolves *.css?inline to '' so themeSwatchColors falls back to
    // the neutral defaults there; pin the values it parses in production —
    // --editorBgColor/--editorColor/--themeColor straight from the files.
    for (const [id, pins] of Object.entries(CANVAS_PINS)) {
      const vars = parseVars(readThemeCss(id))
      expect(vars.editorBgColor.toLowerCase()).toBe(pins.editorBgColor.toLowerCase())
      expect(vars.editorColor.toLowerCase()).toBe(pins.editorColor.toLowerCase())
      expect(vars.themeColor.toLowerCase()).toBe(pins.themeColor.toLowerCase())
    }
  })
})

// ── mermaid/content theming derives from the new families ────────────
describe('mermaidTheme reads the new families (C-51 T-007, R-2)', () => {
  it('readActiveThemeTokens returns the theme-defined series from --chartPalette', () => {
    for (const id of NEW_MEMBERS) {
      mirrorThemeVars(id)
      const t = readActiveThemeTokens()
      const expected = paletteHexes(id)
      expect(t.series, `${id} series`).toEqual(expected)
      expect(t.accent, `${id} accent`).toBe(CANVAS_PINS[id].themeColor.toLowerCase())
      expect(t.bg, `${id} bg`).toBe(CANVAS_PINS[id].editorBgColor.toLowerCase())
      expect(t.text, `${id} text`).toBe(CANVAS_PINS[id].editorColor.toLowerCase())
      expect(t.dark, `${id} dark flag`).toBe(id.endsWith('-dark'))
      clearRootVars()
    }
  })

  it('the config builder uses the palette: pie1/git0/xy chart colours (macOS blue first)', () => {
    mirrorThemeVars('macos')
    const config = buildMermaidThemeConfig(readActiveThemeTokens(), 'pie')
    const series = paletteHexes('macos')
    expect(config.themeVariables.pie1).toBe(series[0])
    expect(config.themeVariables.pie1).toBe('#007aff')
    expect(config.themeVariables.git0).toBe(series[0])
    expect(config.themeVariables.xyChart.plotColorPalette.split(',').map((c) => c.trim()))
      .toEqual(series)
    clearRootVars()

    mirrorThemeVars('docs')
    const docsConfig = buildMermaidThemeConfig(readActiveThemeTokens(), 'pie')
    expect(docsConfig.themeVariables.pie1).toBe('#4f6bed')
    clearRootVars()
  })

  it('the theme signature separates the new families for the SVG cache', () => {
    const signatures = new Set()
    for (const id of NEW_MEMBERS) {
      mirrorThemeVars(id)
      signatures.add(mermaidThemeSignature(readActiveThemeTokens()))
      clearRootVars()
    }
    expect(signatures.size).toBe(NEW_MEMBERS.length)
  })
})

// ── Auto/Light/Dark switching within the families ────────────────────
describe('family member per mode (C-51 T-007 picker)', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  const installMatchMediaStub = (initialDark) => {
    let dark = initialDark
    window.matchMedia = vi.fn(() => ({
      media: '(prefers-color-scheme: dark)',
      get matches () { return dark }
    }))
  }

  it('Light mode picks the light member, Dark mode the dark member', async () => {
    const { familyMemberForMode } = await import('@/util/autoTheme')
    const docs = { light: 'docs', dark: 'docs-dark' }
    const macos = { light: 'macos', dark: 'macos-dark' }
    expect(familyMemberForMode(docs, 'light')).toBe('docs')
    expect(familyMemberForMode(docs, 'dark')).toBe('docs-dark')
    expect(familyMemberForMode(macos, 'light')).toBe('macos')
    expect(familyMemberForMode(macos, 'dark')).toBe('macos-dark')
  })

  it('Auto mode switches within the family on the system appearance', async () => {
    const { familyMemberForMode } = await import('@/util/autoTheme')
    const macos = { light: 'macos', dark: 'macos-dark' }
    installMatchMediaStub(false)
    expect(familyMemberForMode(macos, 'auto')).toBe('macos')
    installMatchMediaStub(true)
    expect(familyMemberForMode(macos, 'auto')).toBe('macos-dark')
  })
})

// ── every surface knows the members ──────────────────────────────────
describe('member registration on every surface (C-51 T-007)', () => {
  it('the command palette and the native View › Theme menu list all four members', () => {
    const commandsSrc = readSource('src/renderer/src/commands/index.js')
    const menuSrc = readSource('src-tauri/src/m009_menu.rs')
    const NAMES = { docs: 'Docs', 'docs-dark': 'Docs Dark', macos: 'macOS', 'macos-dark': 'macOS Dark' }
    for (const id of NEW_MEMBERS) {
      expect(commandsSrc).toContain(`id: 'window.change-theme-${id}', description: '${NAMES[id]}', value: '${id}'`)
      // menu-consistency requires every palette id to exist in the native menu.
      expect(menuSrc).toContain(`"window.change-theme-${id}", "${NAMES[id]}"`)
    }
  })

  it('every locale ships the four display names', () => {
    const locales = readdirSync(resolve(ROOT, 'static/locales'))
      .filter((f) => f.endsWith('.json') && !f.endsWith('.min.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
    expect(locales).toEqual(['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW'])
    for (const locale of locales) {
      const table = JSON.parse(readSource(`static/locales/${locale}.json`))
      const expected = EXPECTED_LOCALE_NAMES[locale]
      expect(table.menu.theme.docs, `${locale} menu.theme.docs`).toBe(expected.docs)
      expect(table.menu.theme.docsDark, `${locale} menu.theme.docsDark`).toBe(expected.docsDark)
      expect(table.menu.theme.macos, `${locale} menu.theme.macos`).toBe(expected.macos)
      expect(table.menu.theme.macosDark, `${locale} menu.theme.macosDark`).toBe(expected.macosDark)
    }
  })
})
