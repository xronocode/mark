/**
 * tab-switch-scroll.spec.ts — visual gate for same-document scroll restore.
 *
 * Switching tabs away and back must restore the reading position through
 * the padding-preserving scrollToCords path (the boot/tab-switch restore,
 * deliberately NOT the live-reload clamp): the offset survives the round
 * trip and the document content is visible with no manual scroll.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const TALL = [
  '# Scroll Keeper',
  '',
  ...Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1} with filler text so the document really scrolls.`),
  ''
].join('\n')

function readScroll(page: Page): Promise<{ scrollTop: number; maxScroll: number }> {
  return page.evaluate(() => {
    const c = document.querySelector('.editor-component') as HTMLElement
    return { scrollTop: c.scrollTop, maxScroll: c.scrollHeight - c.clientHeight }
  })
}

test.describe('tab-switch scroll restore', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('switching away and back restores the reading position without a blank viewport', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/scroll-keeper.md', TALL)
    await openFileTab(page, '/tmp/other.md', '# Other\n\nOther tab body.')

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Other', { timeout: 5_000 })

    // Go back to the tall tab and scroll to a mid-document reading position.
    const tabs = page.locator('.editor-tabs .tabs-container li')
    await tabs.first().click()
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Scroll Keeper', { timeout: 5_000 })

    await page.evaluate(() => {
      const c = document.querySelector('.editor-component') as HTMLElement
      c.scrollTop = Math.floor((c.scrollHeight - c.clientHeight) / 2)
    })
    await page.waitForTimeout(400) // muya scroll debounce saves tab.scrollTop
    const before = await readScroll(page)
    expect(before.scrollTop).toBeGreaterThan(500)

    // Round trip: away and back.
    await tabs.nth(1).click()
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Other', { timeout: 5_000 })

    await tabs.first().click()
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Scroll Keeper', { timeout: 5_000 })
    await page.waitForTimeout(400) // scrollToCords + rAF re-apply settle

    const after = await readScroll(page)

    // Same-document restore keeps the reading position (not 0, not past end).
    expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(50)
    expect(after.scrollTop).toBeLessThanOrEqual(after.maxScroll)

    // Visual gate: a paragraph is on screen without any manual scroll.
    const vp = page.viewportSize()
    const box = await page.locator('.editor-with-tabs p').first().boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(-after.scrollTop - 1) // somewhere in the document
    const onScreen = await page.evaluate(() => {
      const c = document.querySelector('.editor-component') as HTMLElement
      const rect = c.getBoundingClientRect()
      // Any paragraph intersecting the container viewport?
      for (const p of c.querySelectorAll('p')) {
        const r = p.getBoundingClientRect()
        if (r.bottom > rect.top && r.top < rect.bottom) return true
      }
      return false
    })
    expect(onScreen).toBe(true)
    expect(vp).not.toBeNull()
  })
})
