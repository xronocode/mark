import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

/**
 * C-38 T-004 — real tab content at 640×620.
 *
 * Runs in chromium AND webkit: every tab opens on its redesigned rows
 * (a sentinel label per tab), nothing overflows horizontally, and no
 * .pref-row-label is clipped (scrollWidth <= clientWidth). The RU pass
 * repeats the geometry scan — until the .min.json regeneration runs, a
 * stale RU table falls back to the EN labels, which the generic
 * clipping check tolerates either way.
 */

test.use({ viewport: { width: 640, height: 620 } })

const SENTINELS: Record<string, string> = {
  general: 'App language',
  appearance: 'Text size',
  editor: 'Close brackets automatically',
  markdown: 'Footnotes',
  advanced: 'Keyboard shortcuts'
}

async function expectNoOverflow(page: Page): Promise<void> {
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
  expect(overflow.worst, `overflowing element ${JSON.stringify(overflow.worst)}`).toBeNull()
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.vw)
}

async function expectNoClippedLabels(page: Page, tabId: string): Promise<void> {
  const clipped = await page.evaluate(() => {
    const bad: string[] = []
    for (const el of Array.from(document.querySelectorAll('.pref-row-label'))) {
      const h = el as HTMLElement
      if (h.scrollWidth > h.clientWidth + 0.5) {
        bad.push(`${h.textContent?.slice(0, 40)} (${h.scrollWidth}>${h.clientWidth})`)
      }
    }
    return bad
  })
  expect(clipped, `${tabId}: clipped labels ${JSON.stringify(clipped)}`).toEqual([])
}

async function openSettings(page: Page): Promise<void> {
  await page.goto('/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0')
  await page.locator('.pref-container').waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('settings tabs content', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('every tab renders its redesigned rows without overflow or clipped labels (en)', async ({
    page
  }) => {
    await openSettings(page)

    for (const [tabId, sentinel] of Object.entries(SENTINELS)) {
      await page.locator(`.pref-toolbar [data-tab="${tabId}"]`).click()
      await expect(
        page.locator('.pref-row-label', { hasText: sentinel }).first()
      ).toBeVisible()
      await expectNoOverflow(page)
      await expectNoClippedLabels(page, tabId)
    }
  })

  test('the theme grid renders 16 compact family tiles with a selected one', async ({
    page
  }) => {
    await openSettings(page)
    await page.locator('.pref-toolbar [data-tab="appearance"]').click()
    await expect(page.locator('.pref-theme-swatches')).toBeVisible()
    await expect(page.locator('.theme-family-tile')).toHaveCount(16)
    await expect(page.locator('.theme-family-tile.is-selected')).toHaveCount(1)
    await expectNoOverflow(page)
  })

  test('the Advanced tab opens the shortcuts sheet and Esc closes it', async ({ page }) => {
    await openSettings(page)
    await page.locator('.pref-toolbar [data-tab="advanced"]').click()
    // Keyboard shortcuts «Edit…» (the first Edit… button in the Customise group).
    await page
      .locator('.pref-button', { hasText: 'Edit' })
      .first()
      .click()
    // The sheet itself (the keybinding editor's el-dialog also carries role=dialog).
    const sheet = page.locator('.pref-sheet-overlay[role="dialog"]')
    await expect(sheet).toBeVisible()
    await expect(page.locator('.pref-keybindings-search')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  })

  test('no overflow or clipped labels with the RU locale', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke = {
        mt_prefs_get_all: () => ({
          theme: 'paper',
          language: 'ru',
          autoSave: false,
          followSystemTheme: false,
          lightModeTheme: 'paper',
          darkModeTheme: 'ink',
          codeFontSize: '14px'
        })
      }
    })
    await openSettings(page)

    for (const tabId of Object.keys(SENTINELS)) {
      await page.locator(`.pref-toolbar [data-tab="${tabId}"]`).click()
      await expect(
        page.locator(`.pref-toolbar [data-tab="${tabId}"]`)
      ).toHaveAttribute('aria-selected', 'true')
      await expectNoOverflow(page)
      await expectNoClippedLabels(page, tabId)
    }
  })
})
