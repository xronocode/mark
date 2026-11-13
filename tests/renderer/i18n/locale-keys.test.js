// FILE: tests/renderer/i18n/locale-keys.test.js
// VERSION: 1.3.0
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
//   SCOPE: Locale tables/inventory and a gallery failure fixture with mocked IPC.
//   DEPENDS: vitest, node:fs, Vue Test Utils, ExtensionGallery.
//   LINKS: .grace/changes/archive/C-TITLEBAR-MODE-CHIPS/spec.xml R-4;
//          .grace/changes/archive/C-RENDER-REVIEW-FIXES plan T-002.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from process.cwd().
//   LOCALES - the ten shipped locale codes.
//   FAMILIES - the fifteen modeChips keys R-4 inventories.
//   FEEDBACK_KEYS - rollback and extension-disable feedback dotted key paths.
//   readTable - parse one locale file.
//   readKey - resolve one dotted key path inside a locale table.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-09 v1.3.0 C-SEC-AUDIT-FIXES T-004: require localized extension-disable failure feedback.
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
import { describe, expect, it, vi } from 'vitest'

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
  'notifications.source.rollback',
  'extensions.disableFailed'
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

describe('rollback and extension feedback locale keys', () => {
  it('carries the required feedback keys in every locale', () => {
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

  it('keeps revocation failure visible after refreshing the disabled extension', async () => {
    const fixture = {
      id: 'dummy.gallery-extension', name: 'Dummy extension', version: '1.0.0',
      enabled: true, healthy: true, capabilities: ['text.insert']
    }
    const invoke = vi.fn(async (command) => {
      if (command === 'mt_ext_list') return [{ ...fixture }]
      if (command === 'mt_ext_disable') {
        fixture.enabled = false
        throw 'ext_disable_revoke_failed'
      }
      throw new Error(`Unexpected fixture command: ${command}`)
    })
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }))
    vi.doMock('vue-i18n', () => ({
      useI18n: () => ({ t: (key, fallback) => key === 'extensions.disableFailed' ? 'Localized revocation failure' : fallback })
    }))
    const { mount, flushPromises } = await import('@vue/test-utils')
    const { default: Gallery } = await import('../../../src/renderer/src/components/extensionGallery/index.vue')
    const wrapper = mount(Gallery)
    try {
      await flushPromises()
      await wrapper.get('input[type="checkbox"]').setValue(false)
      await flushPromises()
      expect(wrapper.get('.gallery-error').text()).toBe('Localized revocation failure')
      expect(wrapper.get('input[type="checkbox"]').element.checked).toBe(false)
    } finally {
      wrapper.unmount()
      vi.doUnmock('@tauri-apps/api/core')
      vi.doUnmock('vue-i18n')
    }
  })
})
