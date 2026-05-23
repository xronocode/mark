import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('view modes', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
  })

  test('toggling tab bar via bus event hides and shows tabs', async ({ page }) => {
    await bootEditor(page)

    const tabBar = page.locator('.editor-tabs')
    await expect(tabBar).toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-layout-entry', 'showTabBar')
    })

    await expect(tabBar).not.toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-layout-entry', 'showTabBar')
    })

    await expect(tabBar).toBeVisible({ timeout: 5_000 })
  })

  test('focus mode adds ag-focus-mode class to editor', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/focus-test.md',
      '# Title\n\nParagraph one.\n\nParagraph two.\n\nParagraph three.\n')

    await expect(page.locator('.ag-focus-mode')).toHaveCount(0)

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'focus')
    })

    await expect(page.locator('.ag-focus-mode')).toHaveCount(1, { timeout: 5_000 })
  })

  test('typewriter mode can be toggled without errors', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('pageerror', (err) => consoleErrors.push(err.message))

    await bootEditor(page)

    await openFileTab(page, '/tmp/typewriter-test.md',
      '# Title\n\n' + Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}.\n\n`).join(''))

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'typewriter')
    })

    await page.waitForTimeout(500)

    expect(consoleErrors).toHaveLength(0)
  })

  test('theme change via titlebar button applies dark class', async ({ page }) => {
    await bootEditor(page)

    await expect(page.locator('body')).not.toHaveClass(/dark/)

    const themeBtn = page.locator('.titlebar-nav .titlebar-nav-btn').last()
    await themeBtn.click()

    await expect(page.locator('body')).toHaveClass(/dark/, { timeout: 5_000 })
  })
})
