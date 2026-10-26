// @vitest-environment node
// FILE: tests/site/gallery-theme-vars.test.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the gallery theme-variable derivation (C-58 R-2/T-001) —
//            every app theme CSS file becomes a 16-key --pele-* table through
//            the app's own buildPeleVariables, the committed
//            site/gallery/theme-vars.json is never stale, and Paper/Ink (and
//            every theme shared with the capture) equal the 2026-10-18
//            runtime snapshot.
//   SCOPE: site/scripts/gallery-theme-vars.mjs exports; the committed JSON;
//          the runtime snapshot oracle; the site's pele version pin.
//   DEPENDS: site/scripts/gallery-theme-vars.mjs (imports the app's
//            muya diagramTheme), Vitest (DOM-free — runs under node or jsdom).
//   LINKS: M-053 SiteBuild; V-M-053; C-58 T-001, corner-5/corner-6;
//          tests/renderer/muya/diagram-theme.test.js (the engine's own pins)
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root (snapshot, committed JSON, theme dir, site package paths)
//   SNAPSHOT - the 2026-10-18 runtime capture (the parity oracle)
//   COMMITTED - the generated-but-committed site/gallery/theme-vars.json
//   THEME_FILES - the app's *.theme.css ids (the count the table must follow)
//   THEMES_DIR - the app theme directory the table must follow
//   PELE_KEYS - the 16 --pele-* colour keys every theme entry carries
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-25 C-GITHUB-THEME: the committed
//   theme-vars.json carries the github/github-dark pair, so the
//   classification grows to 34 themes as 17 dark / 17 light.
//   PREV: v1.0.0 - 2026-10-18 C-58 T-001: first version.
// END_CHANGE_SUMMARY

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { deriveThemeVars } from '../../site/scripts/gallery-theme-vars.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const THEMES_DIR = join(ROOT, 'src/renderer/src/assets/themes')
const SNAPSHOT = JSON.parse(
  readFileSync(join(ROOT, 'site/gallery/prototype/theme-vars.runtime-snapshot-2026-10-18.json'), 'utf8')
)
const COMMITTED = JSON.parse(readFileSync(join(ROOT, 'site/gallery/theme-vars.json'), 'utf8'))
const THEME_FILES = readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.theme.css'))
  .map((f) => f.replace(/\.theme\.css$/, ''))
  .sort()

const PELE_KEYS = [
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

describe('deriveThemeVars (C-58 R-2)', () => {
  it('derives an entry for every app theme css file (corner-5: the count follows the directory)', () => {
    const vars = deriveThemeVars()
    expect(Object.keys(vars).sort()).toEqual(THEME_FILES)
  })

  it('gives every theme exactly the 16 --pele-* colour keys plus page and dark', () => {
    const vars = deriveThemeVars()
    for (const [id, entry] of Object.entries(vars)) {
      const peleKeys = Object.keys(entry).filter((k) => k.startsWith('--pele-')).sort()
      expect(peleKeys, id).toEqual([...PELE_KEYS].sort())
      expect(Object.keys(entry), id).toHaveLength(PELE_KEYS.length + 2)
      for (const key of peleKeys) expect(entry[key], `${id} ${key}`).toMatch(/^#[0-9a-f]{6}$/)
      expect(entry.page, id).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
      expect(typeof entry.dark, id).toBe('boolean')
    }
  })

  it('classifies the current 34 themes as 17 dark / 17 light', () => {
    const vars = deriveThemeVars()
    const dark = Object.values(vars).filter((v) => v.dark)
    expect(THEME_FILES).toHaveLength(34)
    expect(dark).toHaveLength(17)
  })
})

describe('committed theme-vars.json', () => {
  it('equals a fresh derivation (a stale file fails, never ships)', () => {
    expect(COMMITTED).toEqual(deriveThemeVars())
  })
})

describe('runtime snapshot parity (2026-10-18 oracle)', () => {
  it('Paper and Ink equal the snapshot exactly (T-001 acceptance)', () => {
    expect(COMMITTED.paper).toEqual(SNAPSHOT.paper)
    expect(COMMITTED.ink).toEqual(SNAPSHOT.ink)
  })

  it('every theme the snapshot captured matches the derived table', () => {
    for (const [id, snap] of Object.entries(SNAPSHOT)) {
      expect(COMMITTED[id], id).toEqual(snap)
    }
  })
})

describe('pele version pin (C-58 constraint)', () => {
  it('site devDependencies pin pele to the exact version the app ships', () => {
    const sitePkg = JSON.parse(readFileSync(join(ROOT, 'site/package.json'), 'utf8'))
    expect(sitePkg.devDependencies.pele).toBe('1.10.0')
    const installed = JSON.parse(readFileSync(join(ROOT, 'node_modules/pele/package.json'), 'utf8'))
    expect(installed.version).toMatch(/^1\.10\./)
  })
})
