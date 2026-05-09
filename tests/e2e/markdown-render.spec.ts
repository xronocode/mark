import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

test.describe('markdown render', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test.skip(
    'typing # heading produces an <h1> in the muya document',
    async ({ page }) => {
      // SKIPPED: muya editor focus + key events are flaky in renderer-only
      // mode because @hfelix/electron-localshortcut shim swallows shortcuts
      // and the muya container expects native key dispatch through the
      // contextBridge. Will revisit once data-testid markers land
      // (F-E2E-DATA-TESTIDS) and we can address an internal contenteditable.
      await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')

      // Ensure an editor is mounted.
      await page
        .locator('.editor-component, .editor-wrapper')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })

      // Click into the muya editor area to focus it.
      const muyaContainer = page
        .locator('[contenteditable="true"]')
        .first()
      await muyaContainer.click()
      await page.keyboard.type('# Hello')

      // Muya converts a # paragraph into an h1 once the user types space.
      await expect(page.locator('h1', { hasText: 'Hello' })).toBeVisible({
        timeout: 5_000
      })
    }
  )
})
