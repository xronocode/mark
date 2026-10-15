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

    // C-40 T-002: the theme button lives in the .titlebar-right cluster.
    const themeBtn = page.locator('.titlebar-nav-btn[title*="Theme"]').first()
    await themeBtn.click()

    await expect(page.locator('body')).toHaveClass(/dark/, { timeout: 5_000 })
  })
})
