import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

test.describe('settings route', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('opening preference window mounts pref container + can switch panels', async ({
    page
  }) => {
    await page.goto(
      '/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0#/preference/general'
    )

    // pref-container mounts when pages/preference.vue renders.
    await page
      .locator('.pref-container')
      .waitFor({ state: 'visible', timeout: 15_000 })

    // Default landing should be General; navigating to Theme via hash
    // should swap router-view contents.
    await page.evaluate(() => {
      window.location.hash = '#/preference/theme'
    })

    await page
      .locator('.pref-theme')
      .waitFor({ state: 'visible', timeout: 5_000 })

    expect(await page.locator('.pref-theme').count()).toBeGreaterThan(0)
  })
})
