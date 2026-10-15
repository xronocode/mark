/**
 * toc-sidebar-navigation.spec.ts — C-40 T-003 retirement gate.
 *
 * The sidebar TOC panel (sideBar/toc.vue) is retired in favour of the
 * «On this page» outline rail (outline-rail.spec.ts covers the rail's
 * navigation). This spec pins the retirement in the real renderer: the
 * sidebar never mounts the TOC panel — a stale rightColumn='toc' (the
 * title-bar TOC button until C-40 T-002 removes it) shows the Files
 * tree instead, and outline navigation still works through the rail.
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '# Outline Root',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i + 1} to push headings apart.`),
  '',
  '## Section One',
  '',
  '## Section Five',
  ''
].join('\n')

test.describe('sidebar TOC retirement (C-40 T-003)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('a stale toc right-column shows Files; navigation lives in the rail', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/toc-nav.md', DOC)

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Outline Root', { timeout: 5_000 })

    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      if (pinia) {
        // The old switchSidebarToToc path — must be a no-op for content.
        pinia.state.value.layout.rightColumn = 'toc'
        pinia.state.value.layout.showSideBar = true
      }
    })

    await expect(page.locator('.side-bar')).toBeVisible()
    // The TOC panel never mounts; the Files tree shows instead.
    await expect(page.locator('.side-bar-toc')).toHaveCount(0)
    await expect(page.locator('.side-bar .tree-view').first()).toBeVisible()

    // Outline navigation moved to the rail: it lists the headings and a
    // click scrolls the editor to the target section.
    const railItem = page.locator('.outline-rail-item', { hasText: 'Section Five' }).first()
    await expect(railItem).toBeVisible({ timeout: 10_000 })

    const before = await page.evaluate(() =>
      (document.querySelector('.editor-component') as HTMLElement).scrollTop
    )
    expect(before).toBe(0)

    await railItem.click()
    await page.waitForTimeout(500) // animated scroll (300ms) settles

    const scrollTop = await page.evaluate(() =>
      (document.querySelector('.editor-component') as HTMLElement).scrollTop
    )
    expect(scrollTop).toBeGreaterThan(before)

    const vp = page.viewportSize()
    const heading = page.locator('.editor-with-tabs h2', { hasText: 'Section Five' }).first()
    await expect(heading).toBeVisible()
    const box = await heading.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(vp!.height)
  })
})
