import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

// C-41 T-002: the Settings theme page picks a FAMILY; the applied member is
// the one for the current mode (manual Light/Dark, or Auto = system).
test.describe('theme switch (preference window)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  const openThemePage = async (page) => {
    await page.goto(
      '/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0&theme=paper#/preference/theme'
    )
    await page.locator('.pref-theme').waitFor({ state: 'visible', timeout: 15_000 })
  }

  const draculaTile = (page) =>
    page.locator('.pref-theme .theme-family', {
      has: page.locator('.family-name', { hasText: /^Dracula$/ })
    })

  test('manual Light: picking Dracula applies its light member (Alucard)', async ({ page }) => {
    await openThemePage(page)
    await draculaTile(page).click()
    await expect(draculaTile(page)).toHaveClass(/(^|\s)active(\s|$)/, { timeout: 5_000 })
    await expect(page.locator('body')).not.toHaveClass(/(^|\s)dark(\s|$)/)
  })

  test('Auto on a dark system: picking Dracula applies its dark member', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke = {
        ...(window as any).__mockInvoke,
        mt_prefs_get_all: () => ({
          theme: 'ink',
          followSystemTheme: true,
          lightModeTheme: 'paper',
          darkModeTheme: 'ink',
          language: 'en'
        })
      }
    })
    await openThemePage(page)
    await draculaTile(page).click()
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })
    await expect(draculaTile(page)).toHaveClass(/(^|\s)active(\s|$)/)
  })
})
