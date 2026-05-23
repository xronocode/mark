import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('bus-triggered commands', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
  })

  test('new-untitled-tab bus event creates a new tab', async ({ page }) => {
    await bootEditor(page)

    const tabContainer = page.locator('.editor-tabs .tabs-container')
    const countBefore = await tabContainer.locator('li').count()

    await page.evaluate(() => {
      ;(window as any).__bus.emit('mt::new-untitled-tab', { selected: '', markdown: '' })
    })

    await expect
      .poll(async () => tabContainer.locator('li').count(), { timeout: 5_000 })
      .toBe(countBefore + 1)
  })

  test('find event opens search, replace event opens replace mode', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/cmd-search.md', '# Test\n\nSome content.\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.search-bar .replace')).not.toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.search-bar')).not.toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('replace', 'replace')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.search-bar .replace')).toBeVisible({ timeout: 5_000 })
  })

  test('toggle sidebar via bus event', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })
    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-layout-entry', 'showSideBar')
    })

    await expect(page.locator('.side-bar')).not.toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-layout-entry', 'showSideBar')
    })

    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })
  })

  test('toggle source code mode via bus event', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/cmd-source.md', '# Title\n\nContent.\n')

    await expect(page.locator('.source-code')).not.toBeVisible()

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })

    await expect(page.locator('.source-code')).toBeVisible({ timeout: 5_000 })
  })
})
