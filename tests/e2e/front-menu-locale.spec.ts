// FILE: tests/e2e/front-menu-locale.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the FIX-004 content-aware paragraph front-menu sizing with the real renderer and the Russian locale.
//   SCOPE: Front-menu open through the hover front-icon, localized row heights (one line per action), widened float width, submenu width and no-wrap rows.
//   DEPENDS: Playwright, renderer-only Tauri shim (language: ru), editor boot helpers.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; docs/release-trains/2.5.x-next.md FIX-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   ITEM_HEIGHT - The CSS row height; a wrapped row exceeds it.
//   rowHeights - offsetHeight of every rendered menu/submenu row.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-004: localized (ru) front-menu rows stay on one line and both surfaces widen beyond the 190px base.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const ITEM_HEIGHT = 28

const rowHeights = (page: Page, selector: string): Promise<number[]> =>
  page.evaluate((sel) =>
    Array.from(document.querySelectorAll(sel)).map((el) => (el as HTMLElement).offsetHeight)
  , selector)

test.describe('front menu localized sizing (FIX-004)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
      ;(window as any).__mockInvoke.mt_prefs_get_all = () => ({
        theme: 'light',
        language: 'ru',
        autoSave: false,
        spellcheckerEnabled: false,
        followSystemTheme: false,
        lightModeTheme: 'light',
        darkModeTheme: 'dark'
      })
    })
  })

  test('Russian rows stay on one line and widen the menu surfaces', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/front-menu-ru.md', 'Обычный абзац\n')

    const paragraph = page.locator('#ag-editor-id span.ag-paragraph').first()
    await paragraph.hover()
    const icon = page.locator('.ag-front-icon-button').first()
    await icon.click()
    await expect(page.locator('.ag-front-menu')).toBeVisible({ timeout: 5_000 })

    // The localized rows widen the float beyond the fixed 190px base…
    const menuWidth = await page.evaluate(() => {
      const menu = document.querySelector('.ag-front-menu') as HTMLElement
      return menu.getBoundingClientRect().width
    })
    expect(menuWidth).toBeGreaterThan(190)
    // …and every action still occupies exactly one 28px row.
    for (const height of await rowHeights(page, '.ag-front-menu > ul > li')) {
      expect(height).toBe(ITEM_HEIGHT)
    }

    // The «Transform into» submenu follows the same sizing with no wraps.
    // (offsetWidth: the hover transition animates transform, which would
    // shrink getBoundingClientRect mid-flight.)
    await page.locator('.ag-front-menu li.item.turnInto').hover()
    const submenu = page.locator('.ag-front-menu .submenu')
    await expect(submenu).toBeVisible({ timeout: 5_000 })
    const submenuWidth = await page.evaluate(() => {
      const el = document.querySelector('.ag-front-menu .submenu') as HTMLElement
      return el.offsetWidth
    })
    expect(submenuWidth).toBeGreaterThan(190)
    const heights = await rowHeights(page, '.ag-front-menu .submenu li.item')
    expect(heights.length).toBeGreaterThan(0)
    for (const height of heights) {
      expect(height).toBe(ITEM_HEIGHT)
    }
  })
})
