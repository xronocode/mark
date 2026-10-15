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

    const toggleBtn = page.locator('.titlebar-nav-btn[title="Toggle Sidebar"]')
    await toggleBtn.click()

    await expect(page.locator('.side-bar')).not.toBeVisible({ timeout: 5_000 })

    await toggleBtn.click()

    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })
  })

  test('the trimmed title bar keeps only the sidebar toggle (no Files/TOC buttons)', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })

    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })

    // C-40 T-002: the Files and TOC buttons left the title bar — Files
    // lives in the sidebar, the outline rail (T-003) will own TOC.
    await expect(page.locator('.titlebar-nav-btn[title="Files"]')).toHaveCount(0)
    await expect(page.locator('.titlebar-nav-btn[title="TOC"]')).toHaveCount(0)
    // The sidebar toggle itself still flips the sidebar.
    const toggleBtn = page.locator('.titlebar-nav-btn[title="Toggle Sidebar"]')
    await toggleBtn.click()
    await expect(page.locator('.side-bar')).not.toBeVisible({ timeout: 5_000 })
    await toggleBtn.click()
    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })
  })
})
