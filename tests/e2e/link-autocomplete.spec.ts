/**
 * link-autocomplete.spec.ts — visual gate for C-20.
 *
 * Typing inside a link destination `](…` offers real files from the
 * document's directory (via the tauri-shim's fs mocks): the float lists
 * them, Enter completes the path inline, directories continue browsing.
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Links\n\nSee [notes]('

test.describe('link path autocomplete (C-20)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke['mt_fs_readdir'] = (args: any) => {
        const dir = String(args?.path || args?.dir || '')
        if (dir.endsWith('/docs') || dir === '/docs') {
          return ['notes.md', 'readme.md', 'pic.png', 'sub']
        }
        if (dir.endsWith('/docs/sub')) {
          return ['deep.md']
        }
        return []
      }
      ;(window as any).__mockInvoke['mt_fs_stat'] = (args: any) => {
        const p = String(args?.path || '')
        if (p.endsWith('/sub')) return { isFile: false, isDirectory: true, is_directory: true }
        return { isFile: true, isDirectory: false, is_directory: false }
      }
    })
  })

  test('typing a link destination offers files; Enter completes inline', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/docs/index.md', DOC)

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Links', { timeout: 5_000 })
    await page.waitForTimeout(400)

    // Focus the paragraph end and type a char to trigger the keyup path.
    const para = page.locator('.ag-paragraph p, p').last()
    await para.click()
    await page.keyboard.press('End')
    await page.keyboard.type('n', { delay: 60 })
    await page.waitForTimeout(600) // 150ms debounce + async fetch

    const float = page.locator('.ag-link-path-picker-wrapper')
    await expect(float).toBeVisible({ timeout: 5_000 })
    // Prefix filter: typing 'n' offers notes.md only — readme.md (wrong
    // prefix), pic.png (non-md), and sub/ (wrong prefix) stay hidden.
    await expect(float.locator('.item-text', { hasText: 'notes.md' })).toBeVisible()
    await expect(float.locator('.item-text', { hasText: 'readme.md' })).toHaveCount(0)
    await expect(float.locator('.item-text', { hasText: 'pic.png' })).toHaveCount(0)
    await expect(float.locator('.item-text', { hasText: 'sub/' })).toHaveCount(0)

    // Enter completes the first item (notes.md) inline.
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    const text = await page.evaluate(() =>
      (document.querySelector('.editor-component') as HTMLElement).innerText
    )
    // Path inserted inline; the closing paren is the user's next keypress.
    expect(text).toContain('](notes.md')
    // The float's popper placement attribute is gone on hide (the wrapper
    // itself persists off-screen with opacity 0 — Playwright visibility is
    // not a reliable hidden signal for muya floats).
    await expect
      .poll(async () => float.getAttribute('data-popper-placement'), { timeout: 5_000 })
      .toBeNull()
    // Typing the closing paren completes the link syntax.
    await page.keyboard.type(')')
    await page.waitForTimeout(200)
    const final = await page.evaluate(() =>
      (document.querySelector('.editor-component') as HTMLElement).innerText
    )
    expect(final).toContain('](notes.md)')
  })

  test('directories continue browsing; image destinations never trigger', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/docs/index.md', '# Links2\n\nSee [x](')

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Links2', { timeout: 5_000 })
    await page.waitForTimeout(400)

    const float = page.locator('.ag-link-path-picker-wrapper')
    const para = page.locator('.ag-paragraph p, p').last()
    await para.click()
    await page.keyboard.press('End')

    // 'su' prefix → sub/ offered; Enter keeps browsing INTO the directory
    // (next list comes from /docs/sub: deep.md).
    await page.keyboard.type('su', { delay: 60 })
    await expect(float).toBeVisible({ timeout: 5_000 })
    await expect(float.locator('.item-text', { hasText: 'sub/' })).toBeVisible()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    await expect(float.locator('.item-text', { hasText: 'deep.md' })).toBeVisible({ timeout: 5_000 })

    // Close the directory browser.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Image destination in a FRESH tab: no float at all.
    await openFileTab(page, '/docs/img.md', '# Im\n\nShot ![alt](')
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Im', { timeout: 5_000 })
    await page.waitForTimeout(400)
    const para2 = page.locator('.ag-paragraph p, p').last()
    await para2.click()
    await page.keyboard.press('End')
    await page.keyboard.type('n', { delay: 60 })
    await page.waitForTimeout(600)
    await expect
      .poll(async () => float.getAttribute('data-popper-placement'), { timeout: 3_000 })
      .toBeNull()
  })
})
