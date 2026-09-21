/**
 * live-reload-scroll.spec.ts — visual gate for the C-2 R-9 scroll clamp.
 *
 * Regression scenario (user report 2026-09-21): an agent edits a file whose
 * tab is already open; the live reload restores the tab's pre-edit scrollTop
 * over the reloaded document. Without the clamp, scrollToCords pads the
 * container so the stale offset stays legal past the end of shorter new
 * content and the viewport reads BLANK until the user manually scrolls.
 *
 * These tests drive the real renderer (built bundle + tauri-shim): the
 * per-file watcher fires through mt::watch::event, the reload reads the new
 * content through mt_fs_read, and the assertion is purely visual/geometric —
 * new-document text must be inside the viewport with no user scroll and no
 * phantom bottom padding.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const TALL_DOC = [
  '# Tall Document',
  '',
  ...Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1} of the tall original document with filler text to guarantee real height.`),
  ''
].join('\n')

const SHORT_DOC = [
  '# Reloaded Shorter',
  '',
  'Visible paragraph one after the external edit.',
  'Visible paragraph two after the external edit.',
  'Visible paragraph three after the external edit.',
  ''
].join('\n')

interface ScrollState {
  scrollTop: number
  maxScroll: number
  padding: string
  visible: boolean
}

async function readScrollState(page: Page): Promise<ScrollState> {
  return page.evaluate(() => {
    const c = document.querySelector('.editor-component') as HTMLElement
    const editorId = c.firstElementChild as HTMLElement
    return {
      scrollTop: c.scrollTop,
      maxScroll: c.scrollHeight - c.clientHeight,
      padding: editorId?.style?.paddingBottom ?? '',
      visible: c.style.visibility !== 'hidden'
    }
  })
}

async function scrollToBottom(page: Page): Promise<void> {
  // Scroll deep so the tab saves a large pre-edit scrollTop (muya's scroll
  // listener is debounced 100ms — trailing edge needs a beat).
  await page.evaluate(() => {
    const c = document.querySelector('.editor-component') as HTMLElement
    c.scrollTop = c.scrollHeight
  })
  await page.waitForTimeout(400)
}

async function emitExternalEdit(page: Page, pathname: string, newMarkdown: string): Promise<void> {
  await page.evaluate(({ p, md }: { p: string; md: string }) => {
    // The disk now returns the shorter content; the shim's per-file watcher
    // subscription has no real subscriptionId, so the event filter
    // (undefined === undefined) lets it through.
    ;(window as any).__mockInvoke['mt_fs_read'] = () => md
    ;(window as any).__emitFakeEvent('mt::watch::event', {
      kind: 'modify',
      paths: [p]
    })
  }, { p: pathname, md: newMarkdown })
}

test.describe('live-reload scroll clamp (C-2 R-9)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('external edit shrinking the active scrolled tab keeps content visible without manual scroll', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/live-reload-scroll.md', TALL_DOC)

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Tall Document', { timeout: 5_000 })

    const before = await readScrollState(page)
    expect(before.maxScroll).toBeGreaterThan(500) // tall enough to scroll

    await scrollToBottom(page)
    const scrolled = await readScrollState(page)
    expect(scrolled.scrollTop).toBeGreaterThan(500) // deep pre-edit position saved

    await emitExternalEdit(page, '/tmp/live-reload-scroll.md', SHORT_DOC)

    // The reloaded (shorter) document renders.
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Reloaded Shorter', { timeout: 5_000 })
    await page.waitForTimeout(300) // clamp rAF settles

    const state = await readScrollState(page)
    // No phantom first-paint padding survives the reload restore.
    expect(state.padding).toBe('')
    // The viewport never sits past the end of the new content.
    expect(state.scrollTop).toBeLessThanOrEqual(state.maxScroll)
    expect(state.visible).toBe(true)

    // The visual gate: new-document text is on screen with no user scroll.
    const vp = page.viewportSize()
    const paragraph = page.locator('.editor-with-tabs p', { hasText: 'Visible paragraph one' }).first()
    await expect(paragraph).toBeVisible()
    const box = await paragraph.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(vp!.height)
  })

  test('external edit of a background tab shows content on activation without manual scroll', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/background-a.md', '# Active A\n\nAlpha body.')
    await openFileTab(page, '/tmp/background-b.md', TALL_DOC)

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Tall Document', { timeout: 5_000 })

    // Leave tab B deep-scrolled, then go back to tab A (B becomes background).
    await scrollToBottom(page)
    const tabs = page.locator('.editor-tabs .tabs-container li')
    await tabs.first().click()
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Active A', { timeout: 5_000 })

    // The agent rewrites B's file on disk while A is active: B is stamped,
    // no immediate re-render, and switching to B must clamp the stale offset.
    await emitExternalEdit(page, '/tmp/background-b.md', SHORT_DOC)
    await page.waitForTimeout(400) // 100ms settle + disk read + store stamp

    await tabs.nth(1).click()

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Reloaded Shorter', { timeout: 5_000 })
    await page.waitForTimeout(300)

    const state = await readScrollState(page)
    expect(state.padding).toBe('')
    expect(state.scrollTop).toBeLessThanOrEqual(state.maxScroll)
    expect(state.visible).toBe(true)

    const vp = page.viewportSize()
    const paragraph = page.locator('.editor-with-tabs p', { hasText: 'Visible paragraph one' }).first()
    await expect(paragraph).toBeVisible()
    const box = await paragraph.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(vp!.height)
  })
})
