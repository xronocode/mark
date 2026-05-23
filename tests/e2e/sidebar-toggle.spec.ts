import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

test.describe('sidebar toggle', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('sidebar is visible when booted with sideBarVisibility=true', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })

    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })
  })

  test('sidebar is hidden when booted with sideBarVisibility=false', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: false })

    await expect(page.locator('.side-bar')).not.toBeVisible({ timeout: 3_000 })
  })

  test('clicking sidebar toggle button toggles sidebar visibility', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })

    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })

    const toggleBtn = page.locator('.titlebar-nav-btn').first()
    await toggleBtn.click()

    await expect(page.locator('.side-bar')).not.toBeVisible({ timeout: 5_000 })

    await toggleBtn.click()

    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })
  })

  test('clicking files/toc nav buttons switches sidebar panel', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })

    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })

    const tocBtn = page.locator('.titlebar-nav-btn').nth(2)
    await tocBtn.click()

    await expect(tocBtn).toHaveClass(/active/, { timeout: 3_000 })

    const filesBtn = page.locator('.titlebar-nav-btn').nth(1)
    await filesBtn.click()

    await expect(filesBtn).toHaveClass(/active/, { timeout: 3_000 })
  })
})
