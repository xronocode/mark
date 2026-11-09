// FILE: tests/e2e/table-bar-menu.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-TABLE-BAR-MENU-OVERLAP — the table drag-pill context menus
//     (TableBarTools) must render every item as a single non-overlapping
//     line in every locale. The old CSS pinned the menu to 150px with
//     fixed-height 25px items, so long-locale labels (ru, de, fr, es, pt)
//     wrapped and the second line painted over the next item.
//   SCOPE: Renderer-only (vite preview + tauri shim); runs in the chromium
//     project and, via the table-*.spec.ts match, the webkit-tables project
//     (WKWebView is the engine the macOS build ships).
//   DEPENDS: tests/e2e/fixtures/tauri-shim.ts, tests/e2e/fixtures/helpers.ts
//   LINKS: .grace/verification/runtime.xml V-M-012 (C-TABLE-BAR-MENU-OVERLAP scenario)
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   RU_PREFS - full shim mt_prefs_get_all defaults with the ru locale.
//   DOC - three-column two-row markdown table used by every case.
//   openPillMenu - activates the table, clicks a drag pill and waits for the settled float menu.
//   measureMenu - per-item geometry via evaluate: heights, text rects, menu width.
//   expectSingleLineItems - asserts one text line per item and the 150px width floor.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-TABLE-BAR-MENU-OVERLAP locale-safe menu geometry.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '| Alpha | Beta | Gamma |',
  '| ----- | ---- | ----- |',
  '| 1     | 2    | 3     |',
  '| 4     | 5    | 6     |',
  ''
].join('\n')

// The shim replaces a handler wholesale, so the ru override carries the
// full default pref table with only the locale switched.
const RU_PREFS = {
  theme: 'paper', autoSave: false, autoSaveDelay: 5000,
  titleBarStyle: 'custom', openFilesInNewWindow: false,
  openFolderInNewWindow: false, hideScrollbar: false,
  sideBarVisibility: true, tabBarVisibility: true,
  sourceCodeModeEnabled: false, searchExclusions: [],
  searchMaxFileSize: '', searchIncludeHidden: false,
  searchNoIgnore: false, searchFollowSymlinks: false,
  watcherUsePolling: false, spellcheckerEnabled: false,
  spellcheckerNoUnderline: false, spellcheckerLanguage: 'en-US',
  language: 'ru', endOfLine: 'default', textDirection: 'ltr',
  codeFontSize: '14px', codeFontFamily: 'DejaVu Sans Mono',
  editorFontFamily: 'Open Sans', fontSize: 16, editorLineWidth: '',
  listIndentation: 1, frontmatterType: '-', followSystemTheme: false,
  lightModeTheme: 'paper', darkModeTheme: 'ink', customCss: '',
  bulletListMarker: '-', orderListDelimiter: '.',
  preferLooseListItem: true, tabSize: 4, lineHeight: 1.6,
  fontWeight: 'normal', trimUnnecessaryCodeBlockEmptyLines: false,
  sequenceTheme: 'hand'
}

async function openPillMenu (page: Page, pill: 'left' | 'bottom') {
  // ag-active shows the pills; the click on the pill opens TableBarTools.
  await page.locator('#ag-editor-id table td').first().click()
  const pillLocator = page.locator(`table.ag-active tr .ag-drag-handler.${pill}`).first()
  // The left wall of the table-resize affordance (12px, z-index 3) covers
  // the center and right half of the row pill in Auto mode; the pill's
  // left ~5px stay clickable, so aim there (observed geometry, not a
  // workaround for a flake — the wall interplay is recorded as a
  // follow-up observation in the change Evidence).
  const clickOpts = pill === 'left' ? { position: { x: 3, y: 9 } } : {}
  await pillLocator.click(clickOpts)
  const menu = page.locator('.ag-table-bar-tools.ag-float-container')
  await expect(menu).toBeVisible()
  // The float fades in on placement; wait for popper to settle before
  // measuring geometry.
  await page.waitForTimeout(300)
  return menu
}

const measureMenu = (page: Page) => page.evaluate(() => {
  const menu = document.querySelector('.ag-table-bar-tools.ag-float-container')!
  return {
    menuWidth: menu.offsetWidth,
    items: [...menu.querySelectorAll('li.item')].map((li) => {
      const range = document.createRange()
      range.selectNodeContents(li)
      return {
        label: li.textContent,
        clientHeight: li.clientHeight,
        scrollHeight: li.scrollHeight,
        // With nowrap, scrollWidth > offsetWidth means the label is
        // wider than the item — the float wrapper's overflow: hidden
        // would clip it (Codex review 1: one-line-ness alone proves
        // no vertical overlap, not horizontal fit).
        clientWidth: li.clientWidth,
        scrollWidth: li.scrollWidth,
        textRects: range.getClientRects().length
      }
    })
  }
})

const expectSingleLineItems = async (page: Page) => {
  const m = await measureMenu(page)
  expect(m.menuWidth).toBeGreaterThanOrEqual(150)
  for (const item of m.items) {
    // A wrapped label overflows the fixed-height item and its text range
    // spans two client rects — both must never happen (C-TABLE-BAR-MENU-OVERLAP C-1).
    expect(item.scrollHeight, `${item.label} must not wrap`).toBe(item.clientHeight)
    expect(item.textRects, `${item.label} must be one text line`).toBe(1)
    // No horizontal clipping: the label fits inside the grown menu.
    expect(item.scrollWidth, `${item.label} must fit the item width`).toBe(item.clientWidth)
  }
  return m
}

test.describe('table drag-pill menu geometry (C-TABLE-BAR-MENU-OVERLAP)', () => {
  test.describe('ru locale', () => {
    test.beforeEach(async ({ page }) => {
      await installTauriShim(page)
      await page.addInitScript((prefs) => {
        ;(window as any).__mockInvoke = {
          ...((window as any).__mockInvoke || {}),
          mt_prefs_get_all: () => prefs
        }
      }, RU_PREFS)
      await bootEditor(page, { sideBarVisibility: false })
      await openFileTab(page, '/tmp/mark-e2e/table-bar-menu-ru.md', DOC)
      await expect(page.locator('#ag-editor-id table')).toBeVisible({ timeout: 5_000 })
    })

    test('row pill menu: every item single-line, menu grown past the 150px floor', async ({ page }) => {
      await openPillMenu(page, 'left')
      const m = await expectSingleLineItems(page)
      expect(m.items.map((i) => i.label)).toEqual([
        'Вставить строку выше', 'Вставить строку ниже', 'Удалить строку'
      ])
      // The longest ru label cannot fit 150px — the content-driven width
      // must grow (Corner C-2).
      expect(m.menuWidth).toBeGreaterThan(150)
    })

    test('column pill menu: every item single-line, menu grown past the 150px floor', async ({ page }) => {
      await openPillMenu(page, 'bottom')
      const m = await expectSingleLineItems(page)
      expect(m.items.map((i) => i.label)).toEqual([
        'Вставить столбец слева', 'Вставить столбец справа', 'Удалить столбец'
      ])
      expect(m.menuWidth).toBeGreaterThan(150)
    })
  })

  test.describe('en locale (control)', () => {
    test.beforeEach(async ({ page }) => {
      await installTauriShim(page)
      await bootEditor(page, { sideBarVisibility: false })
      await openFileTab(page, '/tmp/mark-e2e/table-bar-menu-en.md', DOC)
      await expect(page.locator('#ag-editor-id table')).toBeVisible({ timeout: 5_000 })
    })

    test('row pill menu: unchanged single-line geometry at the 150px floor', async ({ page }) => {
      await openPillMenu(page, 'left')
      const m = await expectSingleLineItems(page)
      expect(m.items.map((i) => i.label)).toEqual([
        'Insert Row Above', 'Insert Row Below', 'Remove Row'
      ])
      // en labels fit inside the floor — the menu stays exactly 150px
      // (the pre-fix geometry, spec AC-3).
      expect(m.menuWidth).toBe(150)
    })

    test('column pill menu: unchanged single-line geometry at the 150px floor', async ({ page }) => {
      await openPillMenu(page, 'bottom')
      const m = await expectSingleLineItems(page)
      expect(m.items.map((i) => i.label)).toEqual([
        'Insert Column Left', 'Insert Column Right', 'Remove Column'
      ])
      expect(m.menuWidth).toBe(150)
    })
  })
})
