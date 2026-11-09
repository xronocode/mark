/**
 * split-view.spec.ts — C-29 Split View: source and rendered panes side by
 * side for the current tab. Driven through the real command path
 * (mt::menu-invoked → view.split-view), as the native View menu does.
 *
 * Corners covered: 1 (dirty state untouched), 2 (mode toggle swaps the
 * editable pane), 3 (per-tab state), 6 (narrow window collapses), 7 (ratio
 * restored from prefs), 10 (divider clamp), plus the mirror-never-writes
 * contract (muya would normalize `* item` to `- item`).
 *
 * C-SPLIT-DBLCLICK-TOGGLE: the divider's plain double-click now turns
 * split off (swap = Alt+double-click or Enter), and a right-edge strip
 * double-click turns it on; gated by container width and Diff Mode.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Split\n\nFirst paragraph.\n\n* star bullet\n* second\n'

async function invokeMenu (page: Page, id: string): Promise<void> {
  await page.evaluate((cmd) => (window as any).__emitFakeEvent('mt::menu-invoked', cmd), id)
}

async function editorState (page: Page): Promise<any> {
  return page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const state = el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
    const tab = state?.editor?.currentFile ?? {}
    return {
      markdown: tab.markdown,
      isSaved: tab.isSaved,
      splitView: tab.splitView,
      ratio: state?.preferences?.splitViewRatio,
      swapped: state?.preferences?.splitViewSwapped
    }
  })
}

async function withPrefs (page: Page, prefs: Record<string, unknown>): Promise<void> {
  await page.addInitScript((p) => {
    ;(window as any).__mockInvoke = { ...(window as any).__mockInvoke, mt_prefs_get_all: () => p }
  }, prefs)
}

test.describe('Split View (C-29)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await installTauriShim(page)
  })

  test('C-SPLIT-DUAL-EDIT: both panes editable — typing in either reaches the document', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/a.md', DOC)
    const before = await editorState(page)

    await invokeMenu(page, 'view.split-view')
    const split = page.locator('.split-view.is-split')
    await expect(split).toBeVisible()
    const source = page.locator('.split-pane-source .CodeMirror')
    await expect(source).toContainText('* star bullet')
    // corner-1: toggling does not touch content or dirty state.
    const after = await editorState(page)
    expect(after.markdown).toBe(before.markdown)
    expect(after.isSaved).toBe(before.isSaved)
    expect(after.splitView).toBe(true)

    await page.locator('.split-pane-rich p', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Typed')
    await expect(source).toContainText('First paragraph. Typed', { timeout: 1_000 })

    // Dual editing: the source pane accepts a caret and input too.
    await page.locator('.split-pane-source .CodeMirror-line', { hasText: 'Split' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type('XYZ')
    await expect.poll(async () => (await editorState(page)).markdown, { timeout: 1_000 })
      .toContain('XYZ')
    // The rich pane shows the source edit within the cross-render window.
    await expect(page.locator('.split-pane-rich h1', { hasText: 'SplitXYZ' })).toBeVisible({ timeout: 1_000 })
    await page.screenshot({ path: 'test-results/c29-split-light.png' })
  })

  test('C-SPLIT-DUAL-EDIT corner-2: source mode + split — both editable, normalization never rewrites source text', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/b.md', DOC)
    await invokeMenu(page, 'view.split-view')
    await invokeMenu(page, 'view.source-code-mode')

    // The muya pane is editable now (dual editing); no mirror class remains.
    const rich = page.locator('.split-pane-rich .editor-wrapper')
    await expect(rich).not.toHaveClass(/is-mirror/)

    const cm = page.locator('.split-pane-source .CodeMirror')
    await cm.locator('.CodeMirror-line', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' From source')
    await expect(page.locator('.split-pane-rich p', { hasText: 'First paragraph. From source' }))
      .toBeVisible({ timeout: 1_000 })
    // muya renders `* item` as a list and would serialize it as `- item`;
    // the store must keep the source text exactly (render-only guard).
    await page.waitForTimeout(400)
    const { markdown } = await editorState(page)
    expect(markdown).toContain('* star bullet')
    expect(markdown).toContain('First paragraph. From source')

    // Leaving source mode: the source pane keeps the typed text.
    await invokeMenu(page, 'view.source-code-mode')
    await expect(rich).not.toHaveClass(/is-mirror/)
    await expect(page.locator('.split-pane-source .CodeMirror')).toContainText('From source')
  })

  test('corner-3: split state is per tab', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/one.md', '# One\n')
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()

    await openFileTab(page, '/tmp/c29/two.md', '# Two\n')
    await expect(page.locator('.split-view.is-split')).toHaveCount(0)

    await page.locator('.tabs-container li', { hasText: 'one.md' }).click()
    await expect(page.locator('.split-view.is-split')).toBeVisible()
    await expect(page.locator('.split-pane-source .CodeMirror')).toContainText('# One')
  })

  test('corner-6/7/10: saved ratio restores, drag clamps and persists, narrow window collapses', async ({ page }) => {
    await withPrefs(page, { splitViewRatio: 0.3 })
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/c.md', DOC)
    await invokeMenu(page, 'view.split-view')

    const split = page.locator('.split-view.is-split')
    const box = await split.boundingBox()
    const left = await page.locator('.split-pane-source').boundingBox()
    expect(Math.round((left!.width / box!.width) * 100)).toBeGreaterThanOrEqual(29)
    expect(Math.round((left!.width / box!.width) * 100)).toBeLessThanOrEqual(31)

    const divider = await page.locator('.split-divider').boundingBox()
    await page.mouse.move(divider!.x + 2, divider!.y + 100)
    await page.mouse.down()
    await page.mouse.move(box!.x + 2, divider!.y + 100, { steps: 5 })
    await page.mouse.up()
    expect((await editorState(page)).ratio).toBe(0.1)

    await page.setViewportSize({ width: 700, height: 800 })
    await expect(page.locator('.split-view.is-split')).toHaveCount(0)
    await expect(page.locator('.split-pane-source .CodeMirror')).toHaveCount(0)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator('.split-view.is-split')).toBeVisible()
  })

  test('C-SPLIT-DBLCLICK-TOGGLE: divider double-click turns split off with corner-1 guarantees; Alt swaps; dark theme probe', async ({ page }) => {
    // C-41 T-002: 'dark' retired — ink is the dark brand default.
    await withPrefs(page, { theme: 'ink' })
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/d.md', DOC)
    await invokeMenu(page, 'view.split-view')
    const before = await editorState(page)

    // Plain double-click toggles split OFF: content and dirty state untouched.
    await page.locator('.split-divider').dblclick()
    await expect(page.locator('.split-view.is-split')).toHaveCount(0)
    const after = await editorState(page)
    expect(after.markdown).toBe(before.markdown)
    expect(after.isSaved).toBe(before.isSaved)
    expect(after.splitView).toBe(false)
    // The plain gesture never swapped.
    expect(after.swapped).toBe(false)
    // Split off: the right-edge enable strip is back.
    await expect(page.locator('.split-edge-strip')).toBeVisible()

    // Alt+double-click swaps sides and persists (turn split back on first).
    await page.locator('.split-edge-strip').dblclick()
    await expect(page.locator('.split-view.is-split')).toBeVisible()
    await page.locator('.split-divider').dblclick({ modifiers: ['Alt'] })
    await expect(page.locator('.split-view')).toHaveClass(/is-swapped/)
    expect((await editorState(page)).swapped).toBe(true)
    const rich = await page.locator('.split-pane-rich').boundingBox()
    const source = await page.locator('.split-pane-source').boundingBox()
    expect(rich!.x).toBeLessThan(source!.x)

    // Enter on the focused divider still swaps (unswap back).
    await page.focus('.split-divider')
    await page.keyboard.press('Enter')
    await expect(page.locator('.split-view')).not.toHaveClass(/is-swapped/)
    await page.screenshot({ path: 'test-results/c29-split-dark.png' })
  })

  test('C-SPLIT-DBLCLICK-TOGGLE: right-edge strip gating, enable gesture, selection and diff corners', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/e.md', DOC)

    // Split off, wide container: the strip exists with the toggle marker.
    const strip = page.locator('.split-edge-strip')
    await expect(strip).toBeVisible()
    expect(await strip.getAttribute('data-action')).toBe('toggle-split')

    // A single click on the strip zone changes nothing (double-click only).
    await strip.click({ clickCount: 1 })
    await page.waitForTimeout(150)
    expect((await editorState(page)).splitView).toBe(false)

    // Text selection can be dragged THROUGH the strip zone: the strip
    // steals neither the selection nor plain clicks.
    const surface = page.locator('.editor-component p', { hasText: 'First paragraph.' }).first()
    const sbox = await surface.boundingBox()
    await page.mouse.move(sbox!.x + 10, sbox!.y + 5)
    await page.mouse.down()
    await page.mouse.move(1276, sbox!.y + 5, { steps: 8 })
    await page.mouse.up()
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
    expect(selected.length).toBeGreaterThan(0)
    expect((await editorState(page)).splitView).toBe(false)

    // Double-click enables split; while on, the strip is gone.
    await strip.dblclick()
    await expect(page.locator('.split-view.is-split')).toBeVisible()
    await expect(page.locator('.split-edge-strip')).toHaveCount(0)

    // Toggle off again, then narrow container: no strip below 800px.
    await page.locator('.split-divider').dblclick()
    await expect(page.locator('.split-view.is-split')).toHaveCount(0)
    await page.setViewportSize({ width: 700, height: 800 })
    await expect(page.locator('.split-edge-strip')).toHaveCount(0)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator('.split-edge-strip')).toBeVisible()

    // Diff mode replaces the surface: the strip must not exist.
    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      const tab = pinia?.state?.value?.editor?.currentFile
      if (tab) tab.diffMode = true
    })
    await expect(page.locator('.split-edge-strip')).toHaveCount(0)
    await expect(page.locator('.diff-view')).toBeVisible()
  })
})
