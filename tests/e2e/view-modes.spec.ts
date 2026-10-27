import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('view modes', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
  })

  test('toggling tab bar via bus event hides and shows tabs', async ({ page }) => {
    await bootEditor(page)

    const tabBar = page.locator('.editor-tabs')
    await expect(tabBar).toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-layout-entry', 'showTabBar')
    })

    await expect(tabBar).not.toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-layout-entry', 'showTabBar')
    })

    await expect(tabBar).toBeVisible({ timeout: 5_000 })
  })

  test('focus mode dims non-active blocks and headings to 0.25, active to 1', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/focus-test.md',
      '# Heading one\n\nParagraph one.\n\nParagraph two.\n\nParagraph three.\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'focus')
    })

    const dimmed = page.locator('.ag-focus-mode')
    await expect(dimmed).toHaveCount(1, { timeout: 5_000 })

    // The cursor sits on the first paragraph; move it to the second so a
    // heading and another paragraph are both non-active.
    await page.locator('p.ag-paragraph').nth(1).click()

    const activeOpacityOf = async (selector: string): Promise<number> =>
      Number(
        await page
          .locator(selector)
          .first()
          .evaluate((el) => (el.ownerDocument.defaultView as Window).getComputedStyle(el).opacity)
      )

    expect(await activeOpacityOf('.ag-focus-mode .ag-active')).toBe(1)
    expect(await activeOpacityOf('.ag-focus-mode h1.ag-paragraph')).toBe(0.25)
    const paragraphs = await page
      .locator('.ag-focus-mode p.ag-paragraph:not(.ag-active)')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity))
    expect(paragraphs.length).toBeGreaterThan(0)
    for (const value of paragraphs) expect(Number(value)).toBe(0.25)

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'focus')
    })
    await expect(page.locator('.ag-focus-mode')).toHaveCount(0, { timeout: 5_000 })
    expect(await activeOpacityOf('p.ag-paragraph')).toBe(1)
  })

  // stable-line invariant: the active paragraph's centre holds within 60px
  // while the cursor walks the document (keyboard moves, the real flow).
  test('typewriter mode keeps the active line at one height across a cursor move', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/typewriter-test.md',
      '# Title\n\n' + Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}.\n\n`).join(''))

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'typewriter')
    })

    await expect(page.locator('.typewriter')).toHaveCount(1, { timeout: 5_000 })

    const centerOf = async (): Promise<number> => {
      const box = await page.locator('.typewriter .ag-active.ag-paragraph').first().boundingBox()
      if (!box) throw new Error('active paragraph has no box')
      return box.y + box.height / 2
    }

    await page.locator('#ag-editor-id').click()
    await page.waitForTimeout(800)
    // The first keypress is what asks typewriter to centre the cursor line;
    // compare the centres of two consecutive keyboard moves.
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(900)
    const before = await centerOf()

    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(900)
    const after = await centerOf()

    expect(Math.abs(after - before)).toBeLessThanOrEqual(60)
  })

  test('listener teardown no longer raises the shim unlisten pageerror', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(String(err.message)))

    await bootEditor(page)
    await openFileTab(page, '/tmp/teardown-test.md', '# Title\n\nParagraph one.\n\nParagraph two.\n')

    // Verified teardown trigger (probed 2026-10-27): closing the LAST tab
    // unmounts the live viewer and the titlebar resize listener, whose
    // unregister goes through @tauri-apps/api _unlisten. Without the shim's
    // __TAURI_EVENT_PLUGIN_INTERNALS__ this raises two pageerrors reading
    // 'unregisterListener' of undefined; with it, zero.
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.close-tab')
    })
    await page.waitForTimeout(1_200)

    const unlistenErrors = pageErrors.filter(
      (message) => message.includes('unregisterListener') || message.includes('__TAURI_EVENT_PLUGIN_INTERNALS__')
    )
    expect(unlistenErrors).toHaveLength(0)
  })

  test('theme change via titlebar button applies dark class', async ({ page }) => {
    await bootEditor(page)

    await expect(page.locator('body')).not.toHaveClass(/dark/)

    // C-40 T-002: the theme button lives in the .titlebar-right cluster.
    const themeBtn = page.locator('.titlebar-nav-btn[title*="Theme"]').first()
    await themeBtn.click()

    await expect(page.locator('body')).toHaveClass(/dark/, { timeout: 5_000 })
  })
})
