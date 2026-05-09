import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

test.describe('new tab', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('clicking the "+" tab button adds a tab', async ({ page }) => {
    await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')

    // Wait for setupIpcListeners to register listeners (which it does
    // asynchronously after pinia is installed). Then trigger the boot
    // event the backend would fire — flips mainStore.init=true so the
    // editor view (with tab bar) renders.
    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
      return false
    }, undefined, { timeout: 15_000 })
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
        addBlankTab: true,
        markdownList: [],
        lineEnding: 'lf',
        sideBarVisibility: true,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false
      })
    })

    // Wait for tab bar to be present.
    const tabContainer = page.locator('.editor-tabs .tabs-container')
    await tabContainer.waitFor({ state: 'visible', timeout: 15_000 })

    // Boot auto-creates an untitled tab via addBlankTab=true; capture baseline.
    const initialCount = await tabContainer.locator('li').count()

    // Click the "+" button (.editor-tabs .new-file).
    await page.locator('.editor-tabs .new-file').click()

    // Expect at least one more <li> in the tabs container.
    await expect
      .poll(async () => tabContainer.locator('li').count(), {
        timeout: 5_000
      })
      .toBe(initialCount + 1)
  })
})
