import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('search bar', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('search bar element exists in DOM but is hidden', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/search-test.md',
      '# Hello World\n\nThis is a test paragraph.\n')

    const searchBar = page.locator('.search-bar')
    await expect(searchBar).toHaveCount(1, { timeout: 5_000 })
    await expect(searchBar).not.toBeVisible()
  })

  test('emitting find event shows the search bar', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/search-toggle.md',
      '# Test\n\nSome searchable text here.\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })

    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })
  })

  test('toggling case sensitivity button toggles active class', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/search-case.md', '# Test\n\nHello hello HELLO\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })

    const caseSensitiveBtn = page.locator('.search-bar .is-case-sensitive')
    await expect(caseSensitiveBtn).not.toHaveClass(/active/)

    await caseSensitiveBtn.click()
    await expect(caseSensitiveBtn).toHaveClass(/active/, { timeout: 3_000 })

    await caseSensitiveBtn.click()
    await expect(caseSensitiveBtn).not.toHaveClass(/active/, { timeout: 3_000 })
  })

  test('toggling regex button toggles active class', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/search-regex.md', '# Test\n\nSome text here.\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })

    const regexBtn = page.locator('.search-bar .is-regex')
    await expect(regexBtn).not.toHaveClass(/active/)

    await regexBtn.click()
    await expect(regexBtn).toHaveClass(/active/, { timeout: 3_000 })
  })

  test('toggling whole word button toggles active class', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/search-word.md', '# Test\n\nWord testing.\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })

    const wholeWordBtn = page.locator('.search-bar .is-whole-word')
    await expect(wholeWordBtn).not.toHaveClass(/active/)

    await wholeWordBtn.click()
    await expect(wholeWordBtn).toHaveClass(/active/, { timeout: 3_000 })
  })

  test('replace event shows search bar with replace section', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/search-replace.md', '# Test\n\nReplace me.\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('replace', 'replace')
    })

    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.search-bar .replace')).toBeVisible({ timeout: 3_000 })
  })

  test('Escape closes the search bar', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/search-esc.md', '# Test\n\nClose me.\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Escape')
    await expect(page.locator('.search-bar')).not.toBeVisible({ timeout: 5_000 })
  })
})
