/**
 * guide.spec.ts — visual gates for C-40 G-3 (Mark Guide).
 *
 * 1. The help.guide command (the route the native Help menu and the
 *    command palette take) opens ONE "Mark Guide" tab with the
 *    "Connect your agent" section and the universal prompt block.
 * 2. A second invocation focuses the existing tab instead of opening
 *    another one.
 * 3. The guide tab is temporary: untitled, never written to disk (no
 *    pathname, not dirty-tracked as a file).
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

test.describe('mark guide (C-40)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('help.guide opens one guide tab with the agent prompt; a second call focuses it', async ({ page }) => {
    await bootEditor(page)

    const tabs = page.locator('.editor-tabs .tabs-container li')
    // Boot creates one untitled tab.
    await expect(tabs).toHaveCount(1, { timeout: 10_000 })

    // REAL execute path — the same route the native Help menu / palette
    // takes: cmd::execute finds the static registry twin help.guide.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'help.guide')
    })

    // One more tab appears, titled "Mark Guide".
    await expect
      .poll(async () => tabs.count(), { timeout: 10_000 })
      .toBe(2)
    const guideTab = tabs.filter({ hasText: 'Mark Guide' })
    await expect(guideTab).toHaveCount(1)
    await expect(guideTab).toHaveClass(/active/)

    // The guide document renders: first section heading + prompt block.
    const heading = page.locator('.editor-with-tabs h2', { hasText: 'Connect your agent' })
    await expect(heading).toBeVisible({ timeout: 10_000 })
    // The universal prompt (macOS variant on this build host) sits in a
    // fenced block that muya gives a copy button.
    const prompt = page.locator('.editor-with-tabs pre')
    await expect(prompt.filter({ hasText: 'open -a Mark' })).toBeVisible({ timeout: 10_000 })
    await expect(prompt.filter({ hasText: 'your next instruction' })).toBeVisible()

    // The tab is a temporary untitled document — no pathname on the tab
    // tooltip and no unsaved-file state.
    expect(await guideTab.getAttribute('title')).toBe('')

    // Second invocation focuses the existing guide tab — no third tab.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'help.guide')
    })
    await page.waitForTimeout(600)
    await expect(tabs).toHaveCount(2)
    await expect(guideTab).toHaveClass(/active/)
  })

  test('the mt::open-guide bus event with a section deep-links to the connect-agent heading', async ({ page }) => {
    await bootEditor(page)

    // Spy on the renderer bus for the deep-link jump before triggering it.
    await page.evaluate(() => {
      ;(window as any).__guideScrolls = []
      ;(window as any).__bus.on('scroll-to-header', (slug: string) => {
        ;(window as any).__guideScrolls.push(slug)
      })
    })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('mt::open-guide', { section: 'connect-agent' })
    })

    const heading = page.locator('.editor-with-tabs h2', { hasText: 'Connect your agent' })
    await expect(heading).toBeVisible({ timeout: 10_000 })

    // The heading anchor exists in the WYSIWYG DOM (data-head) and the
    // deep link emitted scroll-to-header with its muya block key — the
    // id scroll-to-header actually queries (headings carry id=<block key>).
    await expect(page.locator('.editor-with-tabs h2[data-head]', { hasText: 'Connect your agent' })).toBeVisible()
    const scrolls = await page.waitForFunction(
      () => ((window as any).__guideScrolls || []).length > 0,
      undefined,
      { timeout: 8_000 }
    )
    expect(scrolls).toBeTruthy()
    const slugs = await page.evaluate(() => (window as any).__guideScrolls)
    expect(slugs[0]).toBeTruthy()
    expect(slugs[0]).not.toBe('connect-your-agent') // muya key, not a github slug
  })
})
