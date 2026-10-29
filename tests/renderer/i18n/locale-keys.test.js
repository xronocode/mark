// FILE: tests/renderer/i18n/locale-keys.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: C-TITLEBAR-MODE-CHIPS T-003 pin — the titleBar.modeChips
//            namespace carries exactly fifteen families in all ten
//            locales, each value is non-empty native copy; and the
//            C-LOCALE-MIN-TWIN-REMOVAL guard — static/locales ships
//            exactly the ten full locale tables and no .min.json twin
//            (the retired byte-parity law's inverted successor).
//   SCOPE: static/locales/*.json (per-locale tables and the directory
//          inventory guard); no runtime.
//   DEPENDS: vitest, node:fs.
//   LINKS: .grace/changes/archive/C-TITLEBAR-MODE-CHIPS/spec.xml R-4.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from process.cwd().
//   LOCALES - the ten shipped locale codes.
//   FAMILIES - the fifteen modeChips keys R-4 inventories.
//   readTable - parse one locale file.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-28 C-LOCALE-MIN-TWIN-REMOVAL: the
//   min-twin byte-parity law retired with the twins themselves; the
//   directory guard (ten full tables, no .min.json) takes its place;
//   the stale seventeen-family header count corrected to fifteen.
//   v1.0.0 - 2026-10-27 C-TITLEBAR-MODE-CHIPS: presence and parity of
//   the modeChips families.
// END_CHANGE_SUMMARY

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
const FAMILIES = [
  'split', 'source', 'changes', 'typewriter', 'focus',
  'standard',
  'hintStandard', 'hintSplit', 'hintSource', 'hintChanges',
  'hintTypewriter', 'hintFocus',
  'viewGroup', 'writingGroup', 'narrowNote'
]

const readTable = (locale) =>
  JSON.parse(readFileSync(join(ROOT, 'static/locales', `${locale}.json`), 'utf8'))

describe('titleBar.modeChips locale families (C-TITLEBAR-MODE-CHIPS T-003)', () => {
  it('ships exactly the fifteen families in every locale', () => {
    for (const locale of LOCALES) {
      const chips = readTable(locale).titleBar?.modeChips
      expect(chips, locale).toBeTypeOf('object')
      expect(Object.keys(chips).sort(), locale).toEqual([...FAMILIES].sort())
    }
  })

  it('writes non-empty native copy everywhere', () => {
    for (const locale of LOCALES) {
      const chips = readTable(locale).titleBar.modeChips
      for (const family of FAMILIES) {
        expect(typeof chips[family], `${locale}.${family}`).toBe('string')
        expect(chips[family].trim().length, `${locale}.${family}`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the short chip labels within the truncation range', () => {
    for (const locale of LOCALES) {
      const chips = readTable(locale).titleBar.modeChips
      for (const family of ['split', 'source', 'changes', 'typewriter', 'focus']) {
        expect(chips[family].length, `${locale}.${family}`).toBeLessThanOrEqual(20)
      }
    }
  })

  it('ships exactly the ten full locale tables and no min twin (C-LOCALE-MIN-TWIN-REMOVAL)', () => {
    const files = readdirSync(join(ROOT, 'static/locales')).sort()
    expect(files, 'static/locales inventory').toEqual([...LOCALES].map((locale) => `${locale}.json`).sort())
    const twins = files.filter((file) => file.endsWith('.min.json'))
    expect(twins, 'min twins were removed by C-LOCALE-MIN-TWIN-REMOVAL; regenerate nothing, edit the full table').toEqual([])
  })
})
