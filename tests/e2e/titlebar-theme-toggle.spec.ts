import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

test.describe('titlebar theme toggle', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
  })

  test('theme toggle button switches between light and dark', async ({ page }) => {
    await bootEditor(page)

    await expect(page.locator('body')).not.toHaveClass(/dark/)

    const themeBtn = page.locator('.titlebar-nav .titlebar-nav-btn').last()
    await themeBtn.click()

    await expect(page.locator('body')).toHaveClass(/dark/, { timeout: 5_000 })
  })
})
