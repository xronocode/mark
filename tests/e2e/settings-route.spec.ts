import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

test.describe('settings route', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('opening preference window mounts the shell + legacy theme deep link redirects to the appearance tab', async ({
    page
  }) => {
    await page.goto(
      '/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0#/preference/general'
    )

    // The C-38 T-003 shell mounts: toolbar + body.
    await page
      .locator('.pref-container')
      .waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.pref-toolbar')).toBeVisible()
    // The old left rail is gone.
    await expect(page.locator('.pref-sidebar')).toHaveCount(0)

    // Legacy deep link /preference/theme redirects to the appearance
    // tab, which now renders the redesigned Appearance page (C-38 T-004).
    await page.evaluate(() => {
      window.location.hash = '#/preference/theme'
    })

    await page
      .locator('.pref-tab-page--appearance')
      .waitFor({ state: 'visible', timeout: 5_000 })

    await expect(page.locator('.pref-tab-page--appearance').count()).resolves.toBeGreaterThan(0)
    // The appearance tab is the active one after the redirect.
    await expect(page.locator('.pref-toolbar [data-tab="appearance"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })
})
