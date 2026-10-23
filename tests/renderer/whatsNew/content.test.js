// FILE: tests/renderer/whatsNew/content.test.js
// VERSION: 1.4.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the What's New release content — exactly four ordered
//            current release-draft items, every locale table (all 10)
//            carrying every item key plus the «Also» line and «See
//            everything new» link key, the sheet-layout length limits
//            (titles ≤ 32, texts ≤ 90, also ≤ 120), vue-i18n brace
//            safety, the kept-untranslated product names and shortcuts,
//            and the GitHub release URL lookup used by the footer link.
//   SCOPE: src/renderer/src/whatsNew/data.js tables + all
//          static/locales/*.json whatsNew sections (source tables — the
//          .min.json files are regenerated from them).
//   DEPENDS: vitest, whatsNew/data.js, static/locales/*.json.
//   LINKS: .grace/changes/archive/C-53/spec.xml R-1 + D-1; V-M-011
//          scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LOCALES - the ten shipped locale codes and their source tables.
//   RELEASE_DRAFT_VERSION - newest in-app sheet version owned by the release draft.
//   RELEASE_DRAFT_LOCALE_KEY - locale-table key derived from the current draft version.
//   RELEASE_DRAFT_ITEM_KEYS - the four current draft item keys in sheet order.
//   ITEM_KEY_ORDER_2_5_3 - the four 2.5.3 item keys in sheet order (session, tables, columns, updates).
//   ITEM_KEY_ORDER - the four D-1 item keys in the approved order.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.4.0 - 2026-10-20 derive the current release identity from the newest sheet so normalization never rewrites historical test text.
//   PREV: v1.3.0 - 2026-10-20 release 2.6.0 draft: pin the four
//   accepted-train items, their ten-locale matrix, layout limits, stable
//   product names/shortcuts and the future release URL.
//   v1.2.0 - 2026-10-19 release 2.5.3: a 2.5.3 block pins the four new items, their locale matrix and the release URL (the 2.5.0 pins stay — that sheet still exists).
//   v1.1.0 - 2026-10-18 release 2.5.0: pins move to the four
//   2.5.0 items (export, look, print, images); format names (PNG, SVG,
//   PDF) replace the Pele/mermaid name pins.
//   v1.0.0 - 2026-10-17 C-53 T-001/R-1: initial pins.
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
const RELEASE_DRAFT_VERSION = Object.keys(WHATS_NEW_CONTENT)[0]
const RELEASE_DRAFT_LOCALE_KEY = `v${RELEASE_DRAFT_VERSION.replace(/[.-]/g, '_')}`

// The four 2.5.0 items, approved order: diagrams as pictures (C-56), a
// look per diagram (C-62), direct print/PDF (C-61), image copy (C-56).
const ITEM_KEY_ORDER = ['export', 'look', 'print', 'images']

// START_BLOCK_CONTENT_TABLE
describe('whatsNew/data — the 2.5.0 content table', () => {
  it('ships exactly the four 2.5.0 items with icon, titleKey and textKey', () => {
    const items = WHATS_NEW_CONTENT['2.5.0']
    expect(items).toHaveLength(WHATS_NEW_MAX_ITEMS)
    expect(items.map((i) => i.titleKey.replace('whatsNew.v2_5_0.', '').replace('.title', '')))
      .toEqual(ITEM_KEY_ORDER)
    for (const item of items) {
      expect(typeof item.icon).toBe('string')
      expect(item.icon.length).toBe(1)
      expect(item.titleKey).toMatch(/^whatsNew\.v2_5_0\.\w+\.title$/)
      expect(item.textKey).toMatch(/^whatsNew\.v2_5_0\.\w+\.text$/)
    }
  })

  it('the four item keys are distinct (no shadowed board-3 leftovers)', () => {
    const items = getWhatsNewItems('2.5.0')
    expect(new Set(items.map((i) => i.titleKey)).size).toBe(items.length)
    expect(new Set(items.map((i) => i.icon)).size).toBe(items.length)
  })
})
// END_BLOCK_CONTENT_TABLE

// START_BLOCK_LOCALE_MATRIX
describe('whatsNew 2.5.0 content in every locale', () => {
  const localeSection = (table) => table.whatsNew
  const localeItems = (table) => localeSection(table).v2_5_0

  it('every locale carries all four items, the also line and the see-everything key', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const section = localeSection(table)
      expect(section, `${code}: whatsNew section`).toBeTruthy()
      const items = localeItems(table)
      for (const key of ITEM_KEY_ORDER) {
        expect(items[key], `${code}: whatsNew.v2_5_0.${key}`).toBeTruthy()
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
        ...ITEM_KEY_ORDER.flatMap((key) => [section.v2_5_0[key].title, section.v2_5_0[key].text])
      ]
      for (const s of strings) {
        expect(s, `${code}: vue-i18n braces in "${s}"`).not.toMatch(/[{}|@]/)
      }
    }
  })

  it('product names stay untranslated in every locale', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const items = localeItems(table)
      // File formats are names — no locale translates PNG, SVG or PDF.
      expect(items.export.text, `${code}: export.text keeps PNG`).toContain('PNG')
      expect(items.export.text, `${code}: export.text keeps SVG`).toContain('SVG')
      expect(items.print.title, `${code}: print.title keeps PDF`).toContain('PDF')
      expect(items.print.text, `${code}: print.text keeps PDF`).toContain('PDF')
    }
  })
})
// END_BLOCK_LOCALE_MATRIX

// START_BLOCK_CONTENT_2_5_3
// Release 2.5.3: session restore (C-69), wide tables at full width and
// remembered column widths (C-65), the daily update check (C-66).
const ITEM_KEY_ORDER_2_5_3 = ['session', 'tables', 'columns', 'updates']

describe('whatsNew 2.5.3 sheet', () => {
  it('ships the four 2.5.3 items in order with distinct one-char icons', () => {
    const items = getWhatsNewItems('2.5.3')
    expect(items.map((i) => i.titleKey.replace('whatsNew.v2_5_3.', '').replace('.title', '')))
      .toEqual(ITEM_KEY_ORDER_2_5_3)
    for (const item of items) {
      expect(item.icon.length).toBe(1)
      expect(item.textKey).toMatch(/^whatsNew\.v2_5_3\.\w+\.text$/)
    }
    expect(new Set(items.map((i) => i.icon)).size).toBe(items.length)
  })

  it('every locale carries the four items within the 32/90 layout, no message syntax, Markdown untranslated', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const section = table.whatsNew.v2_5_3
      expect(section, `${code}: whatsNew.v2_5_3`).toBeTruthy()
      for (const key of ITEM_KEY_ORDER_2_5_3) {
        const { title, text } = section[key]
        expect(title.length, `${code} ${key}.title`).toBeGreaterThan(0)
        expect(title.length, `${code} ${key}.title is ${title.length}`).toBeLessThanOrEqual(32)
        expect(text.length, `${code} ${key}.text is ${text.length}`).toBeLessThanOrEqual(90)
        expect(`${title} ${text}`, `${code}: vue-i18n syntax`).not.toMatch(/[{}|@]/)
      }
      expect(section.columns.text, `${code}: columns.text keeps Markdown`).toContain('Markdown')
      expect(section.updates.text, `${code}: updates.text keeps Mark`).toContain('Mark')
    }
  })

  it('points the 2.5.3 sheet at its GitHub release page', () => {
    expect(getWhatsNewReleaseUrl('2.5.3')).toBe('https://github.com/xronocode/mark/releases/tag/v2.5.3')
  })
})
// END_BLOCK_CONTENT_2_5_3

// START_BLOCK_CONTENT_2_5_4
// Release 2.8.1 draft (FIX-018, field-verified 2026-10-23): the
// macOS PDF-export root-cause repair — one safety item.
const RELEASE_DRAFT_ITEM_KEYS = ['pdfFix']

describe('current release-draft sheet', () => {
  it('ships the four accepted-train items in order with distinct one-char icons', () => {
    const items = getWhatsNewItems(RELEASE_DRAFT_VERSION)
    expect(items.map((i) => i.titleKey.replace(`whatsNew.${RELEASE_DRAFT_LOCALE_KEY}.`, '').replace('.title', '')))
      .toEqual(RELEASE_DRAFT_ITEM_KEYS)
    for (const item of items) {
      expect(item.icon.length).toBe(1)
      expect(item.textKey).toMatch(new RegExp(`^whatsNew\\.${RELEASE_DRAFT_LOCALE_KEY}\\.\\w+\\.text$`))
    }
    expect(new Set(items.map((i) => i.icon)).size).toBe(items.length)
  })

  it('every locale carries complete copy within the board layout limits', () => {
    for (const [code, table] of Object.entries(LOCALES)) {
      const section = table.whatsNew[RELEASE_DRAFT_LOCALE_KEY]
      expect(section, `${code}: whatsNew.${RELEASE_DRAFT_LOCALE_KEY}`).toBeTruthy()
      for (const key of RELEASE_DRAFT_ITEM_KEYS) {
        const { title, text } = section[key]
        expect(title.length, `${code} ${key}.title`).toBeGreaterThan(0)
        expect(title.length, `${code} ${key}.title is ${title.length}`).toBeLessThanOrEqual(32)
        expect(text.length, `${code} ${key}.text is ${text.length}`).toBeLessThanOrEqual(90)
        expect(`${title} ${text}`, `${code}: vue-i18n syntax`).not.toMatch(/[{}|@]/)
      }
      expect(table.whatsNew.also.length, `${code}: also`).toBeLessThanOrEqual(120)
      expect(section.pdfFix.text, `${code}: pdfFix names PDF`).toContain('PDF')
    }
  })

  it('points the draft sheet at its future GitHub release page', () => {
    expect(getWhatsNewReleaseUrl(RELEASE_DRAFT_VERSION)).toBe(
      `https://github.com/xronocode/mark/releases/tag/v${RELEASE_DRAFT_VERSION}`
    )
  })
})
// END_BLOCK_CONTENT_2_5_4

// START_BLOCK_RELEASE_URL
describe('getWhatsNewReleaseUrl (C-53 «See everything new» link)', () => {
  it('points the 2.5.0 sheet at the GitHub release page', () => {
    expect(WHATS_NEW_RELEASE_URLS['2.5.0']).toBe(
      'https://github.com/xronocode/mark/releases/tag/v2.5.0'
    )
  })

  it('normalizes prerelease decorations like the item lookup', () => {
    expect(getWhatsNewReleaseUrl('2.5.0-beta')).toBe(WHATS_NEW_RELEASE_URLS['2.5.0'])
    expect(getWhatsNewReleaseUrl('2.5.0')).toBe(WHATS_NEW_RELEASE_URLS['2.5.0'])
  })

  it('returns an empty string for a version without a release page (link hides)', () => {
    expect(getWhatsNewReleaseUrl('9.9.9')).toBe('')
  })
})
// END_BLOCK_RELEASE_URL
