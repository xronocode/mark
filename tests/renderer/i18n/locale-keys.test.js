// FILE: tests/renderer/i18n/locale-keys.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: C-TITLEBAR-MODE-CHIPS T-003 pin — the titleBar.modeChips
//            namespace carries exactly fifteen families in all ten
//            locales, each value is non-empty native copy; and the
//            C-LOCALE-MIN-TWIN-REMOVAL guard — static/locales ships
//            exactly the ten full locale tables and no .min.json twin
//            (the retired byte-parity law's inverted successor); and
//            the C-RENDER-REVIEW-FIXES rollback-feedback pin — the
//            seven rollback/notification feedback keys present and
//            non-empty in all ten locales.
//   SCOPE: static/locales/*.json (per-locale tables and the directory
//          inventory guard); no runtime.
//   DEPENDS: vitest, node:fs.
//   LINKS: .grace/changes/archive/C-TITLEBAR-MODE-CHIPS/spec.xml R-4;
//          .grace/changes/active/C-RENDER-REVIEW-FIXES plan T-002.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from process.cwd().
//   LOCALES - the ten shipped locale codes.
//   FAMILIES - the fifteen modeChips keys R-4 inventories.
//   FEEDBACK_KEYS - the seven rollback-feedback dotted key paths.
//   readTable - parse one locale file.
//   readKey - resolve one dotted key path inside a locale table.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-11-03 C-RENDER-REVIEW-FIXES: the
//   rollback-feedback pin — rollback.restoreFailedTitle/Body,
//   rollback.prefsSkippedTitle/Body, notifications.actionFailedTitle/
//   Body and notifications.source.rollback present and non-empty in
//   all ten locale tables.
//   v1.1.0 - 2026-10-28 C-LOCALE-MIN-TWIN-REMOVAL: the
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
const FEEDBACK_KEYS = [
  'rollback.restoreFailedTitle', 'rollback.restoreFailedBody',
  'rollback.prefsSkippedTitle', 'rollback.prefsSkippedBody',
  'notifications.actionFailedTitle', 'notifications.actionFailedBody',
  'notifications.source.rollback'
]

const readTable = (locale) =>
  JSON.parse(readFileSync(join(ROOT, 'static/locales', `${locale}.json`), 'utf8'))

const readKey = (table, dotted) =>
  dotted.split('.').reduce((node, segment) => (node == null ? node : node[segment]), table)

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

describe('rollback feedback locale keys (C-RENDER-REVIEW-FIXES T-002)', () => {
  it('carries the seven feedback keys in every locale', () => {
    for (const locale of LOCALES) {
      const table = readTable(locale)
      for (const key of FEEDBACK_KEYS) {
        expect(readKey(table, key), `${locale}.${key}`).toBeTypeOf('string')
      }
    }
  })

  it('writes non-empty native copy everywhere', () => {
    for (const locale of LOCALES) {
      const table = readTable(locale)
      for (const key of FEEDBACK_KEYS) {
        expect(readKey(table, key).trim().length, `${locale}.${key}`).toBeGreaterThan(0)
      }
    }
  })
})
