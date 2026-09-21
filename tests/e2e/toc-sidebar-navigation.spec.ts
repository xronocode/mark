/**
 * toc-sidebar-navigation.spec.ts — visual gate for the sidebar TOC.
 *
 * The TOC tree (sideBar/toc.vue) is populated from store.toc, which only
 * updates through LISTEN_FOR_CONTENT_CHANGE (muya 'change'). This spec
 * pins the full round trip with the real renderer: a document renders,
 * the TOC lists its headings, and clicking a TOC node scrolls the editor
 * so the target heading is inside the viewport.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '# Outline Root',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i + 1} to push headings apart.`),
  '',
  '## Section One',
  '',
  'Body under section one.',
  '',
  ...Array.from({ length: 40 }, (_, i) => `More filler ${i + 1} before the far section.`),
  '',
  '## Section Five',
  '',
  'Body under section five.',
  ''
].join('\n')

async function switchSidebarToToc(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    if (pinia) {
      // showSideBar/rightColumn live in the LAYOUT store (sideBar/index.vue).
      pinia.state.value.layout.rightColumn = 'toc'
      pinia.state.value.layout.showSideBar = true
    }
  })
}

test.describe('sidebar TOC navigation', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('TOC lists document headings and a node click scrolls the heading into view', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })
    await openFileTab(page, '/tmp/toc-nav.md', DOC)

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Outline Root', { timeout: 5_000 })

    await switchSidebarToToc(page)
    await expect(page.locator('.side-bar-toc')).toBeVisible({ timeout: 5_000 })

    // The TOC populates from muya's change events (async dispatch).
    const tocNode = page.locator('.side-bar-toc .el-tree-node__content', { hasText: 'Section Five' }).first()
    await expect(tocNode).toBeVisible({ timeout: 5_000 })
    await expect(
      page.locator('.side-bar-toc .el-tree-node__content', { hasText: 'Section One' }).first()
    ).toBeVisible()

    const before = await page.evaluate(() =>
      (document.querySelector('.editor-component') as HTMLElement).scrollTop
    )
    expect(before).toBe(0) // nothing has scrolled yet

    await tocNode.click()
    await page.waitForTimeout(400) // animated scroll (300ms) settles

    const state = await page.evaluate(() => ({
      scrollTop: (document.querySelector('.editor-component') as HTMLElement).scrollTop
    }))

    // The click actually scrolled the editor...
    expect(state.scrollTop).toBeGreaterThan(before)

    // ...and the target heading is on screen.
    const vp = page.viewportSize()
    const heading = page.locator('.editor-with-tabs h2', { hasText: 'Section Five' }).first()
    await expect(heading).toBeVisible()
    const box = await heading.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(vp!.height)
  })
})
