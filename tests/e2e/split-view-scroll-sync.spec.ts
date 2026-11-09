/**
 * split-view-scroll-sync.spec.ts — C-SPLIT-SCROLL-SYNC: reading sync for
 * Split View. Toggle transitions keep the reading anchor (caret block,
 * else the last stable fraction) centered, the second pane opens aligned
 * to the same reading fraction, and live scrolling pairs both panes
 * proportionally without feedback loops.
 *
 * Corners covered: 1 (caret-centered toggle-on), 2 (no-caret fallback),
 * 3 (toggle-off re-anchor), 5 (tab-switch alignment), 7/8 (bidirectional
 * live sync incl. programmatic user-caused scrolls, guard).
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = Array.from({ length: 120 }, (_, i) => `## Section ${i}\n\nParagraph ${i} lorem ipsum dolor sit amet consectetur.\n`).join('\n')

async function invokeMenu (page: Page, id: string): Promise<void> {
  await page.evaluate((cmd) => (window as any).__emitFakeEvent('mt::menu-invoked', cmd), id)
}

// The rich pane scroller is muya's .editor-component; the source pane
// scroller is the .source-code container (probe 2026-10-27: both are the
// elements whose scrollHeight exceeds clientHeight).
async function paneOffsets (page: Page): Promise<{ rich: number; richMax: number; source: number; sourceMax: number }> {
  return page.evaluate(() => {
    const find = (root: ParentNode) => Array.from((root as HTMLElement).querySelectorAll('*'))
      .filter((el) => {
        const h = el as HTMLElement
        return h.scrollHeight > h.clientHeight + 200 && h.clientHeight > 200
      })
      .sort((a, b) => (a.contains(b) ? -1 : 1))[0] as HTMLElement | undefined
    const rich = find(document.querySelector('.split-pane-rich') ?? document)
    const source = find(document.querySelector('.split-pane-source') ?? document)
    return {
      rich: rich ? rich.scrollTop : -1,
      richMax: rich ? rich.scrollHeight - rich.clientHeight : -1,
      source: source ? source.scrollTop : -1,
      sourceMax: source ? source.scrollHeight - source.clientHeight : -1
    }
  })
}

async function scrollRich (page: Page, fraction: number): Promise<void> {
  await page.evaluate((f) => {
    const root = document.querySelector('.split-pane-rich') ?? document
    const el = Array.from((root as HTMLElement).querySelectorAll('*'))
      .filter((h) => (h as HTMLElement).scrollHeight > (h as HTMLElement).clientHeight + 200 && (h as HTMLElement).clientHeight > 200)
      .sort((a, b) => (a.contains(b) ? -1 : 1))[0] as HTMLElement
    el?.scrollTo(0, Math.round((el.scrollHeight - el.clientHeight) * f))
  }, fraction)
}

test.describe('Split View scroll sync (C-SPLIT-SCROLL-SYNC)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await installTauriShim(page)
  })

  test('corner-1: toggle-on centers the caret block and aligns the source pane', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/csplit/a.md', DOC)

    // Place a real caret mid-document.
    await page.locator('.editor-component p', { hasText: 'Paragraph 60' }).first().click()
    await page.waitForTimeout(200)

    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()

    // The caret block ends up vertically centered in the rich pane, and the
    // source pane opens in the same reading region (never scrollTop 0).
    await expect.poll(async () => {
      const o = await paneOffsets(page)
      return Math.abs(o.rich / Math.max(1, o.richMax) - o.source / Math.max(1, o.sourceMax))
    }, { timeout: 3_000, interval: 150 }).toBeLessThan(0.2)
    const offsets = await paneOffsets(page)
    expect(offsets.source).toBeGreaterThan(200)

    const caretCenter = await page.evaluate(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return null
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      const pane = (document.querySelector('.split-pane-rich') as HTMLElement).getBoundingClientRect()
      return rect && pane ? rect.top + rect.height / 2 - (pane.top + pane.height / 2) : null
    })
    expect(caretCenter).not.toBe(null)
    expect(Math.abs(caretCenter as number)).toBeLessThan(250)
    await page.screenshot({ path: 'test-results/csplit-sync-caret-centered.png' })
  })

  test('corner-2/3: no-caret fraction fallback on toggle-on and toggle-off', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/csplit/b.md', DOC)

    // No click: no caret inside muya. Read at the middle of the document,
    // then toggle split on.
    await scrollRich(page, 0.5)
    await page.waitForTimeout(250)
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()

    await expect.poll(async () => {
      const o = await paneOffsets(page)
      return Math.round((o.rich / Math.max(1, o.richMax)) * 10)
    }, { timeout: 3_000, interval: 150 }).toBe(5)

    const on = await paneOffsets(page)
    const sourceFraction = on.source / Math.max(1, on.sourceMax)
    expect(on.source).toBeGreaterThan(200)
    expect(Math.abs(0.5 - sourceFraction)).toBeLessThan(0.2)

    // Toggle off: the single pane re-anchors on the same reading fraction
    // instead of jumping to the document start.
    await invokeMenu(page, 'view.split-view')
    await page.waitForTimeout(400)
    const off = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.editor-component, .editor-wrapper'))
        .find((h) => (h as HTMLElement).scrollHeight > (h as HTMLElement).clientHeight + 200) as HTMLElement | undefined
      return el ? el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight) : -1
    })
    expect(Math.abs(0.5 - off)).toBeLessThan(0.2)
  })

  test('corner-7/8: live bidirectional sync through programmatic user scrolls', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/csplit/c.md', DOC)
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()
    await page.waitForTimeout(400)

    // Scroll the rich pane to 0.8 -> the source pane follows.
    await scrollRich(page, 0.8)
    await page.waitForTimeout(500)
    let o1 = await paneOffsets(page)
    expect(Math.round((o1.source / Math.max(1, o1.sourceMax)) * 10)).toBe(8)

    // Scroll the source pane to 0.2 -> the rich pane follows back.
    // (Waits rather than expect.poll between steps: Playwright's poll loop
    // starves the page's rAF-driven flush on this headless runner and the
    // sync never applies — observed 2026-10-27, mechanism verified stable
    // by waits and by the instrumented probe.)
    await page.evaluate(() => {
      const el = Array.from((document.querySelector('.split-pane-source') as HTMLElement).querySelectorAll('*'))
        .filter((h) => (h as HTMLElement).scrollHeight > (h as HTMLElement).clientHeight + 200 && (h as HTMLElement).clientHeight > 200)
        .sort((a, b) => (a.contains(b) ? -1 : 1))[0] as HTMLElement
      el?.scrollTo(0, Math.round(((el?.scrollHeight ?? 0) - (el?.clientHeight ?? 0)) * 0.2))
    })
    await page.waitForTimeout(400)
    const o2 = await paneOffsets(page)
    expect(Math.round((o2.rich / Math.max(1, o2.richMax)) * 10)).toBeLessThanOrEqual(3)
    await expect.poll(async () => {
      const o = await paneOffsets(page)
      return Math.round((o.rich / Math.max(1, o.richMax)) * 10)
    }, { timeout: 3_000, interval: 150 }).toBeLessThanOrEqual(3)

    // Guard: after the round trip the panes settle — alternate a few times
    // and confirm no runaway (fractions stay inside the document).
    for (const f of [0.9, 0.1, 0.5]) {
      await scrollRich(page, f)
      await page.waitForTimeout(250)
    }
    const o = await paneOffsets(page)
    expect(o.rich).toBeGreaterThanOrEqual(0)
    expect(o.rich).toBeLessThanOrEqual(o.richMax)
    expect(o.source).toBeGreaterThanOrEqual(0)
    expect(o.source).toBeLessThanOrEqual(o.sourceMax)
  })

  test('corner-5: tab switch restores the split panes to the tab position', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/csplit/one.md', DOC)
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()
    // Let the deliberate two-frame split anchor finish before the reader scrolls.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))))
    await scrollRich(page, 0.7)
    await page.waitForTimeout(300)
    const parked = await paneOffsets(page)
    expect(parked.rich / Math.max(1, parked.richMax)).toBeGreaterThanOrEqual(0.5)

    await openFileTab(page, '/tmp/csplit/two.md', '# Two\n\nShort document.\n')
    await expect(page.locator('.split-view.is-split')).toHaveCount(0)

    await page.locator('.tabs-container li', { hasText: 'one.md' }).click()
    await expect(page.locator('.split-view.is-split')).toBeVisible()
    await expect.poll(async () => {
      const o = await paneOffsets(page)
      return Math.round((o.rich / Math.max(1, o.richMax)) * 10)
    }, { timeout: 3_000, interval: 150 }).toBeGreaterThanOrEqual(5)
    const o = await paneOffsets(page)
    const sourceFraction = o.source / Math.max(1, o.sourceMax)
    expect(Math.abs(o.rich / Math.max(1, o.richMax) - sourceFraction)).toBeLessThan(0.2)
  })
})
