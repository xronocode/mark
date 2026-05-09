import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

test.describe('sidebar empty state', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('with no project opened, the sidebar shows the open-folder CTA', async ({
    page
  }) => {
    await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')

    // Fire the boot event so init flips and the sidebar mounts.
    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
      return false
    }, undefined, { timeout: 15_000 })
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
        addBlankTab: false,
        markdownList: [],
        lineEnding: 'lf',
        sideBarVisibility: true,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false
      })
    })

    // Sidebar tree-view mounts.
    await page
      .locator('.tree-view')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // The empty-state lives inside .open-project (sideBar/tree.vue:123).
    const cta = page
      .locator('.tree-view .open-project .button-primary')
      .first()
    await cta.waitFor({ state: 'visible', timeout: 5_000 })
    expect(await cta.isVisible()).toBe(true)
  })
})
