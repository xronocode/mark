// FILE: tests/renderer/i18n/locale-keys.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-TITLEBAR-MODE-CHIPS T-003 pin — the titleBar.modeChips
//            namespace carries exactly fifteen families in all ten
//            locales, each value is non-empty native copy, and every
//            shipped *.min.json twin is byte-identical to the compact
//            serialization of its source table.
//   SCOPE: static/locales/*.json and their .min.json twins; no runtime.
//   DEPENDS: vitest, node:fs.
//   LINKS: .grace/changes/active/C-TITLEBAR-MODE-CHIPS/spec.xml R-4.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from process.cwd().
//   LOCALES - the ten shipped locale codes.
//   FAMILIES - the seventeen modeChips keys R-4 inventories.
//   readTable - parse one locale file.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-27 C-TITLEBAR-MODE-CHIPS: presence,
//   parity and min-twin byte-equality for the seventeen modeChips families.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
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

  it('keeps every minimized twin byte-identical to the compact source', () => {
    for (const locale of LOCALES) {
      const source = readFileSync(join(ROOT, 'static/locales', `${locale}.json`), 'utf8')
      const min = readFileSync(join(ROOT, 'static/locales', `${locale}.min.json`), 'utf8')
      expect(min, locale).toBe(JSON.stringify(JSON.parse(source)))
    }
  })
})
