import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('source code mode', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('booting with sourceCodeModeEnabled shows CodeMirror', async ({ page }) => {
    await bootEditor(page, { sourceCodeModeEnabled: true })

    await expect(page.locator('.source-code')).toBeVisible({ timeout: 5_000 })
  })

  test('toggling sourceCode via bus event shows/hides CodeMirror', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/src-toggle.md', '# Toggle test\n\nSome content.\n')

    await expect(page.locator('.source-code')).not.toBeVisible()

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })

    await expect(page.locator('.source-code')).toBeVisible({ timeout: 5_000 })
  })
})
