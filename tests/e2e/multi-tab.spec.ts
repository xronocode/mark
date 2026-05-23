import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('multi-tab management', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('opening multiple files creates tabs', async ({ page }) => {
    await bootEditor(page)

    const tabContainer = page.locator('.editor-tabs .tabs-container')
    await tabContainer.waitFor({ state: 'visible', timeout: 5_000 })

    await openFileTab(page, '/tmp/file-a.md', '# File A\n\nContent A.')
    const countAfterFirst = await tabContainer.locator('li').count()

    await openFileTab(page, '/tmp/file-b.md', '# File B\n\nContent B.')

    await expect
      .poll(async () => tabContainer.locator('li').count(), { timeout: 5_000 })
      .toBe(countAfterFirst + 1)
  })

  test('clicking a tab switches the active tab', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/alpha.md', '# Alpha\n\nAlpha content.')
    await openFileTab(page, '/tmp/beta.md', '# Beta\n\nBeta content.')

    const tabs = page.locator('.editor-tabs .tabs-container li')

    const lastTab = tabs.last()
    await expect(lastTab).toHaveClass(/active/, { timeout: 3_000 })

    const firstTab = tabs.first()
    await firstTab.click()

    await expect(firstTab).toHaveClass(/active/, { timeout: 3_000 })
    await expect(lastTab).not.toHaveClass(/active/)
  })

  test('tab shows filename in span', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/my-document.md', '# Hello\n')

    const tabSpan = page.locator('.editor-tabs .tabs-container li.active span')
    await expect(tabSpan.first()).toContainText('my-document', { timeout: 5_000 })
  })

  test('adding tab via + button works alongside file tabs', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/existing.md', '# Existing\n')

    const tabContainer = page.locator('.editor-tabs .tabs-container')
    const countBefore = await tabContainer.locator('li').count()

    await page.locator('.editor-tabs .new-file').click()

    await expect
      .poll(async () => tabContainer.locator('li').count(), { timeout: 5_000 })
      .toBe(countBefore + 1)
  })
})
