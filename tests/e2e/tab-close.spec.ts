import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('tab close', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('clicking close icon on tab removes it', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/close-a.md', '# File A\n')
    await openFileTab(page, '/tmp/close-b.md', '# File B\n')

    const tabContainer = page.locator('.editor-tabs .tabs-container')
    const countBefore = await tabContainer.locator('li').count()
    expect(countBefore).toBeGreaterThanOrEqual(2)

    const lastTab = tabContainer.locator('li').last()
    const closeIcon = lastTab.locator('.close-icon')
    await closeIcon.click()

    await expect
      .poll(async () => tabContainer.locator('li').count(), { timeout: 5_000 })
      .toBe(countBefore - 1)
  })

  test('closing active tab switches to another tab', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/stay-a.md', '# Stay A\n')
    await openFileTab(page, '/tmp/stay-b.md', '# Stay B\n')

    const tabContainer = page.locator('.editor-tabs .tabs-container')

    const lastTab = tabContainer.locator('li').last()
    await expect(lastTab).toHaveClass(/active/, { timeout: 3_000 })

    await lastTab.locator('.close-icon').click()

    await expect
      .poll(async () => {
        const activeTabs = await tabContainer.locator('li.active').count()
        return activeTabs
      }, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(1)
  })

  test('new file button (+) creates an untitled tab', async ({ page }) => {
    await bootEditor(page)

    const tabContainer = page.locator('.editor-tabs .tabs-container')
    const countBefore = await tabContainer.locator('li').count()

    await page.locator('.editor-tabs .new-file').click()

    await expect
      .poll(async () => tabContainer.locator('li').count(), { timeout: 5_000 })
      .toBe(countBefore + 1)
  })
})
