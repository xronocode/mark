import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

test.describe('theme switch (preference window)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('clicking dark theme card adds .dark to body', async ({ page }) => {
    // Force the bootstrap into "settings" type so the router shows the
    // preference panels (theme picker lives there).
    await page.goto(
      '/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0&theme=light#/preference/theme'
    )

    // Wait for the theme prefComponent to mount.
    await page.locator('.pref-theme').waitFor({ state: 'visible', timeout: 15_000 })

    // The "dark" theme card has both .theme and .dark class. Click it.
    const darkCard = page.locator('.pref-theme .theme.dark').first()
    await darkCard.waitFor({ state: 'visible', timeout: 5_000 })
    await darkCard.click()

    // body.classList → 'dark' is added by util/theme.js addThemeStyle().
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, {
      timeout: 5_000
    })
  })
})
