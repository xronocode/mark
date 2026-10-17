// FILE: tests/renderer/whatsNew/content.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-53 R-1 What's New 2.3.1 content — exactly the four
//            D-1 items in the approved order, every locale table (all 10)
//            carrying every item key plus the «Also» line and «See
//            everything new» link key, the sheet-layout length limits
//            (titles ≤ 32, texts ≤ 90, also ≤ 120), vue-i18n brace
//            safety, the kept-untranslated product names and shortcuts,
//            and the GitHub release URL lookup used by the footer link.
//   SCOPE: src/renderer/src/whatsNew/data.js tables + all
//          static/locales/*.json whatsNew sections (source tables — the
//          .min.json files are regenerated from them).
//   DEPENDS: vitest, whatsNew/data.js, static/locales/*.json.
//   LINKS: .grace/changes/active/C-53/spec.xml R-1 + D-1; V-M-011
//          scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LOCALES - the ten shipped locale codes and their source tables.
//   ITEM_KEY_ORDER - the four D-1 item keys in the approved order.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-17 C-53 T-001/R-1: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import {
  WHATS_NEW_CONTENT,
  WHATS_NEW_MAX_ITEMS,
  WHATS_NEW_ALSO_KEY,
  WHATS_NEW_SEE_EVERYTHING_KEY,
  WHATS_NEW_RELEASE_URLS,
  getWhatsNewItems,
  getWhatsNewReleaseUrl
} from '@/whatsNew/data'

import en from '../../../static/locales/en.json'
import ru from '../../../static/locales/ru.json'
import de from '../../../static/locales/de.json'
import fr from '../../../static/locales/fr.json'
import es from '../../../static/locales/es.json'
import ja from '../../../static/locales/ja.json'
import ko from '../../../static/locales/ko.json'
import pt from '../../../static/locales/pt.json'
import zhCN from '../../../static/locales/zh-CN.json'
import zhTW from '../../../static/locales/zh-TW.json'

const LOCALES = { en, ru, de, fr, es, ja, ko, pt, 'zh-CN': zhCN, 'zh-TW': zhTW }

// The four C-55 items, approved order: the pele engine swap — engine,
// theme-following, new types, lighter bundle.
const ITEM_KEY_ORDER = ['engine', 'theme', 'types', 'lighter']

// START_BLOCK_CONTENT_TABLE
describe('whatsNew/data — the C-55 content table', () => {
  it('ships exactly the four 2.4.0 items with icon, titleKey and textKey', () => {
    const items = WHATS_NEW_CONTENT['2.4.0']
    expect(items).toHaveLength(WHATS_NEW_MAX_ITEMS)
    expect(items.map((i) => i.titleKey.replace('whatsNew.v2_4_0.', '').replace('.title', '')))
      .toEqual(ITEM_KEY_ORDER)
    for (const item of items) {
      expect(typeof item.icon).toBe('string')
      expect(item.icon.length).toBe(1)
      expect(item.titleKey).toMatch(/^whatsNew\.v2_4_0\.\w+\.title$/)
      expect(item.textKey).toMatch(/^whatsNew\.v2_4_0\.\w+\.text$/)
    }
  })

  it('the four item keys are distinct (no shadowed board-3 leftovers)', () => {
    const items = getWhatsNewItems('2.4.0')
    expect(new Set(items.map((i) => i.titleKey)).size).toBe(items.length)
    expect(new Set(items.map((i) => i.icon)).size).toBe(items.length)
  })
})
// END_BLOCK_CONTENT_TABLE

// START_BLOCK_LOCALE_MATRIX
describe('whatsNew 2.4.0 content in every locale (C-55)', () => {
  const localeSection = (table) => table.whatsNew
  const localeItems = (table) => localeSection(table).v2_4_0

  it('every locale carries all four items, the also line and the see-everything key', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const section = localeSection(table)
      expect(section, `${code}: whatsNew section`).toBeTruthy()
      const items = localeItems(table)
      for (const key of ITEM_KEY_ORDER) {
        expect(items[key], `${code}: whatsNew.v2_4_0.${key}`).toBeTruthy()
        expect(typeof items[key].title).toBe('string')
        expect(typeof items[key].text).toBe('string')
      }
      expect(typeof section.also, `${code}: whatsNew.also`).toBe('string')
      expect(typeof section.seeEverything, `${code}: whatsNew.seeEverything`).toBe('string')
    }
  })

  it('the exported also/seeEverything keys point at real locale table entries', () => {
    expect(WHATS_NEW_ALSO_KEY).toBe('whatsNew.also')
    expect(WHATS_NEW_SEE_EVERYTHING_KEY).toBe('whatsNew.seeEverything')
    const at = (table, dotted) =>
      dotted.split('.').reduce((node, part) => (node == null ? undefined : node[part]), table)
    for (const [code, table] of Object.entries(LOCALES)) {
      expect(at(table, WHATS_NEW_ALSO_KEY), `${code}: ${WHATS_NEW_ALSO_KEY}`).toBeTruthy()
      expect(at(table, WHATS_NEW_SEE_EVERYTHING_KEY), `${code}: ${WHATS_NEW_SEE_EVERYTHING_KEY}`).toBeTruthy()
    }
  })

  it('titles fit the 32-character sheet layout in every locale', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const items = localeItems(table)
      for (const key of ITEM_KEY_ORDER) {
        const len = items[key].title.length
        expect(len, `${code} ${key}.title is ${len} chars (limit 32)`).toBeLessThanOrEqual(32)
        expect(items[key].title.length).toBeGreaterThan(0)
      }
    }
  })

  it('texts fit the 90-character sheet layout in every locale', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const items = localeItems(table)
      for (const key of ITEM_KEY_ORDER) {
        const len = items[key].text.length
        expect(len, `${code} ${key}.text is ${len} chars (limit 90)`).toBeLessThanOrEqual(90)
        expect(len).toBeGreaterThan(0)
      }
      const alsoLen = localeSection(table).also.length
      expect(alsoLen, `${code} also is ${alsoLen} chars (limit 120)`).toBeLessThanOrEqual(120)
      expect(localeSection(table).seeEverything.length).toBeLessThanOrEqual(32)
    }
  })

  it('no string carries vue-i18n interpolation braces or message syntax', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const section = localeSection(table)
      const strings = [
        section.also,
        section.seeEverything,
        ...ITEM_KEY_ORDER.flatMap((key) => [section.v2_4_0[key].title, section.v2_4_0[key].text])
      ]
      for (const s of strings) {
        expect(s, `${code}: vue-i18n braces in "${s}"`).not.toMatch(/[{}|@]/)
      }
    }
  })

  it('product names stay untranslated in every locale', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const items = localeItems(table)
      // Pele (the engine) and mermaid (the fence syntax) are product
      // names — no locale translates them (case-insensitive: German
      // compounds write Mermaid-Blöcken).
      expect(items.engine.text, `${code}: engine.text keeps Pele`).toContain('Pele')
      expect(items.types.text, `${code}: types.text keeps mermaid`).toMatch(/mermaid/i)
      expect(items.lighter.text, `${code}: lighter.text keeps MB units`).toMatch(/MB|МБ|Mo/)
      expect(localeSection(table).also, `${code}: also keeps Mermaid`).toMatch(/mermaid/i)
    }
  })
})
// END_BLOCK_LOCALE_MATRIX

// START_BLOCK_RELEASE_URL
describe('getWhatsNewReleaseUrl (C-53 «See everything new» link)', () => {
  it('points the 2.4.0 sheet at the GitHub release page', () => {
    expect(WHATS_NEW_RELEASE_URLS['2.4.0']).toBe(
      'https://github.com/xronocode/mark/releases/tag/v2.4.0'
    )
  })

  it('normalizes prerelease decorations like the item lookup', () => {
    expect(getWhatsNewReleaseUrl('2.4.0-beta')).toBe(WHATS_NEW_RELEASE_URLS['2.4.0'])
    expect(getWhatsNewReleaseUrl('2.4.0')).toBe(WHATS_NEW_RELEASE_URLS['2.4.0'])
  })

  it('returns an empty string for a version without a release page (link hides)', () => {
    expect(getWhatsNewReleaseUrl('9.9.9')).toBe('')
  })
})
// END_BLOCK_RELEASE_URL
