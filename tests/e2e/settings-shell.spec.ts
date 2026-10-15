import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

/**
 * C-38 T-003 — the redesigned Settings shell.
 *
 * Runs in chromium AND webkit (the WKWebView engine the macOS build
 * ships): the window is 640×640-like; every one of the 5 tabs must open
 * without horizontal overflow.
 */

test.use({ viewport: { width: 640, height: 620 } })

test.describe('settings shell', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('opens on the remembered tab and switches all five tabs without horizontal overflow', async ({
    page
  }) => {
    await page.goto('/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0')

    await page
      .locator('.pref-container')
      .waitFor({ state: 'visible', timeout: 15_000 })

    // Fresh profile → remembered tab defaults to general.
    await expect(page.locator('.pref-toolbar [data-tab="general"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )

    const tabs = ['general', 'appearance', 'editor', 'markdown', 'advanced'] as const
    for (const id of tabs) {
      await page.locator(`.pref-toolbar [data-tab="${id}"]`).click()
      await expect(page.locator(`.pref-toolbar [data-tab="${id}"]`)).toHaveAttribute(
        'aria-selected',
        'true'
      )

      // No horizontal overflow at 640 px: neither the document nor any
      // element inside the scrollable body may reach past the viewport.
      const overflow = await page.evaluate(() => {
        const vw = window.innerWidth
        let worst: null | { tag: string; cls: string; left: number; right: number } = null
        for (const el of Array.from(document.querySelectorAll('.pref-body *'))) {
          const rect = (el as HTMLElement).getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) continue
          if (rect.right > vw + 0.5 || rect.left < -0.5) {
            worst = {
              tag: el.tagName,
              cls: (el as HTMLElement).className?.toString?.().slice(0, 80) ?? '',
              left: rect.left,
              right: rect.right
            }
            break
          }
        }
        return {
          vw,
          worst,
          scrollWidth: (document.scrollingElement as HTMLElement).scrollWidth
        }
      })
      expect(overflow.worst, `${id}: overflowing element ${JSON.stringify(overflow.worst)}`).toBeNull()
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.vw)
    }
  })

  test('persisting the last tab: reopening lands on the previously selected tab', async ({
    page
  }) => {
    await page.goto('/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0')
    await page
      .locator('.pref-container')
      .waitFor({ state: 'visible', timeout: 15_000 })

    await page.locator('.pref-toolbar [data-tab="markdown"]').click()
    await expect(page.locator('.pref-toolbar [data-tab="markdown"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )

    // A "reopen" is a fresh hash navigation to the settings root.
    await page.evaluate(() => {
      window.location.hash = '#/preference'
    })
    await expect(page.locator('.pref-toolbar [data-tab="markdown"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })
})
