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

    // C-40 T-002: the theme button lives in the .titlebar-right cluster;
    // C-FOCUS-CANON-COMPLETE: selected through the locale-independent
    // data-testid hook (the modeChips precedent), never the localized title.
    const themeBtn = page.locator('[data-testid="titlebar-theme-toggle"]').first()
    await themeBtn.click()

    await expect(page.locator('body')).toHaveClass(/dark/, { timeout: 5_000 })
  })

  // C-FOCUS-CANON-COMPLETE: under ru the tooltip renders "Тема: …" with no
  // "Theme" substring, so the localized matchers miss — the hook alone
  // must find and drive the toggle.
  test('theme toggle answers the data-testid hook under the ru locale', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      const defaults = w.__TAURI_INTERNALS__.invoke('mt_prefs_get_all')
      w.__mockInvoke.mt_prefs_get_all = async () => ({ ...await defaults, language: 'ru' })
    })

    await bootEditor(page)

    await expect(page.locator('body')).not.toHaveClass(/dark/)

    const themeBtn = page.locator('[data-testid="titlebar-theme-toggle"]').first()
    await expect(themeBtn).toHaveCount(1)
    await expect(themeBtn).toHaveAttribute('title', /Тема:/)
    await themeBtn.click()

    await expect(page.locator('body')).toHaveClass(/dark/, { timeout: 5_000 })
  })
})
