/**
 * heading-navigation.spec.ts — visual gates for C-19.
 *
 * 1. The sidebar TOC highlights the heading the viewport scrolled into
 *    (and only that one).
 * 2. The Go-to-Heading command (invoked the way the native menu/palette
 *    would) jumps to the selected heading.
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '# Top',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Filler ${i + 1} for scrolling.\n`),
  '## Alpha Section',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Alpha filler ${i + 1}.\n`),
  '## Beta Section',
  '',
  ...Array.from({ length: 20 }, (_, i) => `Beta filler ${i + 1}.\n`),
  'Beta body.',
  ''
].join('\n')

test.describe('heading navigation (C-19)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('Go-to-Heading palette lists headings and jumps on Enter', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/heading-nav.md', DOC)

    await expect(page.locator('.editor-with-tabs h2').first())
      .toContainText('Alpha Section', { timeout: 5_000 })
    // listToc lands one macrotask after setMarkdown.
    await page.waitForTimeout(300)

    // REAL execute path — the same route the native Edit-menu accelerator
    // takes: cmd::execute finds the static registry twin, whose execute()
    // constructs the palette command and re-shows the palette (run()
    // populates the list). This gate catches palette lifecycle regressions
    // (the review-2 recursion blocker).
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'edit.go-to-heading')
    })
    await page.waitForTimeout(400) // twin's delay(100) + palette transition

    // The palette dialog opened with the full heading list already
    // populated (the root .command-palette div is always mounted — assert
    // the open dialog surface instead).
    await expect(page.locator('.command-palette input.search')).toBeVisible({ timeout: 5_000 })
    const items = page.locator('.command-palette .commands .title')
    await expect(items.filter({ hasText: 'Alpha Section' })).toBeVisible({ timeout: 5_000 })
    await expect(items.filter({ hasText: 'Beta Section' })).toBeVisible()

    // Select Beta via typing + Enter — the jump lands it in the viewport.
    await page.keyboard.type('beta')
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)

    const vp = page.viewportSize()
    const box = await page.locator('.editor-with-tabs h2', { hasText: 'Beta Section' }).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(vp!.height)
  })

  test('TOC highlights the heading the viewport is in while scrolling', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })
    await openFileTab(page, '/tmp/heading-nav.md', DOC)

    await expect(page.locator('.editor-with-tabs h2').first())
      .toContainText('Alpha Section', { timeout: 5_000 })

    await page.evaluate(() => {
      const pinia = (document.querySelector('#app') as any)?.__vue_app__?.config?.globalProperties?.$pinia
      pinia.state.value.layout.rightColumn = 'toc'
      pinia.state.value.layout.showSideBar = true
    })
    const alpha = page.locator('.side-bar-toc .el-tree-node', { hasText: 'Alpha Section' }).first()
    await expect(alpha).toBeVisible({ timeout: 5_000 })

    // Scroll by ACTUAL heading positions (fractions of scrollHeight kept
    // landing in Top's filler block): jump into Alpha's fillers, then to
    // Beta, then back to the top.
    const scrollToText = async (text: string) => {
      await page.evaluate((needle) => {
        const c = document.querySelector('.editor-component') as HTMLElement
        const headings = Array.from(c.querySelectorAll('[data-head]'))
        const target = headings.find((h) => h.textContent.includes(needle)) as HTMLElement | undefined
        if (target) {
          const delta = target.getBoundingClientRect().top - c.getBoundingClientRect().top
          c.scrollTop = c.scrollTop + delta + 200 // just past the heading
        }
        c.dispatchEvent(new Event('scroll', { bubbles: true }))
      }, text)
    }

    await scrollToText('Alpha Section')
    await expect(page.locator('.side-bar-toc .toc-node-label--active', { hasText: 'Alpha Section' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('.side-bar-toc .toc-node-label--active', { hasText: 'Top' })).toHaveCount(0)

    await scrollToText('Beta Section')
    await expect(page.locator('.side-bar-toc .toc-node-label--active', { hasText: 'Beta Section' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('.side-bar-toc .toc-node-label--active')).toHaveCount(1)

    await page.evaluate(() => {
      const c = document.querySelector('.editor-component') as HTMLElement
      c.scrollTop = 0
      c.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await expect(page.locator('.side-bar-toc .toc-node-label--active', { hasText: 'Top' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('.side-bar-toc .toc-node-label--active')).toHaveCount(1)
  })
})
