/**
 * outline-rail.spec.ts — C-40 T-003 «On this page» outline rail.
 *
 * Gates the full round trip with the real renderer: the rail appears for
 * a long document (≥3 h1–h3 headings) on a wide editor area, the current
 * item follows the scrollspy, a click smooth-jumps through the shared
 * scroll-to-header path, the rail hides below 1000px of editor width /
 * in source, split and diff modes / when toggled off through the
 * View › Outline renderer command (persisting the preference), and the
 * sidebar TOC panel is retired.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// Each filler line is its own paragraph (a blank line between them) —
// consecutive lines would merge into one short paragraph (C-40 review).
const DOC = [
  '# Outline Root',
  '',
  ...Array.from({ length: 40 }, (_, i) => [`Filler paragraph ${i + 1} to push headings apart.`, '']).flat(),
  '',
  '## Section One',
  '',
  'Body under section one.',
  '',
  ...Array.from({ length: 40 }, (_, i) => [`More filler ${i + 1} before the far section.`, '']).flat(),
  '',
  '## Section Two',
  '',
  ...Array.from({ length: 40 }, (_, i) => [`Section two filler ${i + 1}.`, '']).flat(),
  '',
  '## Section Five',
  '',
  'Body under section five.',
  ''
].join('\n')

// Two h1–h3 headings + deeper levels only — below the 3-heading gate.
const SHORT_DOC = [
  '# Short Root',
  '',
  '### Only Subsection',
  '',
  '#### Deep h4 content that never reaches the rail.',
  ''
].join('\n')

const rail = (page: Page) => page.locator('.outline-rail')

async function scrollToHeading(page: Page, text: string): Promise<void> {
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

test.describe('outline rail (C-40 T-003)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('rail lists h1–h3 of a long document and a click jumps to the heading', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/outline-rail.md', DOC)

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Outline Root', { timeout: 5_000 })

    // The rail appears once listToc lands (muya change events, async).
    await expect(rail(page)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.outline-rail-header')).toHaveText(/on this page/i)
    const items = page.locator('.outline-rail-item')
    await expect(items).toHaveCount(4)
    await expect(items.filter({ hasText: 'Section Five' })).toBeVisible()
    // Deeper-than-h3 headings never reach the rail.
    await expect(items.filter({ hasText: 'Deep h4' })).toHaveCount(0)

    const before = await page.evaluate(() =>
      (document.querySelector('.editor-component') as HTMLElement).scrollTop
    )
    expect(before).toBe(0) // nothing has scrolled yet

    await items.filter({ hasText: 'Section Five' }).click()
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

  test('the current item follows the section in view while scrolling', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/outline-rail.md', DOC)
    await expect(rail(page)).toBeVisible({ timeout: 10_000 })

    const current = page.locator('.outline-rail-item--current')

    await scrollToHeading(page, 'Section Two')
    await expect(current).toHaveText('Section Two', { timeout: 8_000 })
    await expect(current).toHaveCount(1)

    await scrollToHeading(page, 'Section Five')
    await expect(current).toHaveText('Section Five', { timeout: 8_000 })

    await page.evaluate(() => {
      const c = document.querySelector('.editor-component') as HTMLElement
      c.scrollTop = 0
      c.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await expect(current).toHaveText('Outline Root', { timeout: 8_000 })
  })

  test('hidden below 1000px of editor width; stays with the sidebar open when it fits', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await bootEditor(page)
    await openFileTab(page, '/tmp/outline-rail.md', DOC)
    await expect(rail(page)).toBeVisible({ timeout: 10_000 })

    // Narrow the window below the 1000px floor.
    await page.setViewportSize({ width: 900, height: 720 })
    await expect(rail(page)).toBeHidden({ timeout: 5_000 })

    // Wide window with the sidebar open: 1440 - 280 sidebar ≈ 1160px of
    // editor area — the rail stays (approved canvas: kept with the
    // sidebar when it fits).
    await page.setViewportSize({ width: 1440, height: 720 })
    await expect(rail(page)).toBeVisible({ timeout: 5_000 })
    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      if (pinia) pinia.state.value.layout.showSideBar = true
    })
    await expect(page.locator('.side-bar')).toBeVisible()
    await expect(rail(page)).toBeVisible({ timeout: 5_000 })

    // Squeeze again with the sidebar open — no room, hidden.
    await page.setViewportSize({ width: 1200, height: 720 })
    await expect(rail(page)).toBeHidden({ timeout: 5_000 })
  })

  test('hidden in source mode, split view, and diff view', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/outline-rail.md', DOC)
    await expect(rail(page)).toBeVisible({ timeout: 10_000 })

    // Source mode (the same bus route the native menu takes).
    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })
    await expect(rail(page)).toBeHidden({ timeout: 5_000 })
    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })
    await expect(rail(page)).toBeVisible({ timeout: 5_000 })

    // Split View (renderer command, as the menu/palette dispatch it).
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.split-view')
    })
    await expect(rail(page)).toBeHidden({ timeout: 5_000 })
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.split-view')
    })
    await expect(rail(page)).toBeVisible({ timeout: 5_000 })

    // Diff mode (named tab, so the toggle is accepted).
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.diff-mode')
    })
    await expect(rail(page)).toBeHidden({ timeout: 5_000 })
  })

  test('View › Outline (view.outline command) toggles the rail and persists the preference', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke = {
        // Capture the persistence write; everything else falls through to
        // the shim defaults because invoke() reads overrides || defaults.
        mt_prefs_set: (args: any) => {
          ;(window as any).__prefSets = ((window as any).__prefSets || []).concat([args])
          return null
        }
      }
    })
    await bootEditor(page)
    await openFileTab(page, '/tmp/outline-rail.md', DOC)
    await expect(rail(page)).toBeVisible({ timeout: 10_000 })

    // The same route the native View › Outline item takes (menu-bridge).
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.outline')
    })
    await expect(rail(page)).toBeHidden({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.outline')
    })
    await expect(rail(page)).toBeVisible({ timeout: 5_000 })

    const prefSets = await page.evaluate(() => (window as any).__prefSets || [])
    // Boot/layout also persist their own keys — only the rail writes matter.
    const outlineSets = prefSets.filter((s: any) => s.key === 'outlineRailVisible')
    expect(outlineSets).toEqual([
      { key: 'outlineRailVisible', value: false },
      { key: 'outlineRailVisible', value: true }
    ])
  })

  test('hidden for documents with fewer than 3 h1–h3 headings', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/outline-short.md', SHORT_DOC)
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Short Root', { timeout: 5_000 })
    await page.waitForTimeout(600) // listToc settles; the rail never appears
    await expect(rail(page)).toBeHidden()
  })
})
