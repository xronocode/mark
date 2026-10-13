/**
 * split-view.spec.ts — C-29 Split View: source and rendered panes side by
 * side for the current tab. Driven through the real command path
 * (mt::menu-invoked → view.split-view), as the native View menu does.
 *
 * Corners covered: 1 (dirty state untouched), 2 (mode toggle swaps the
 * editable pane), 3 (per-tab state), 6 (narrow window collapses), 7 (ratio
 * restored from prefs), 10 (divider clamp), plus the mirror-never-writes
 * contract (muya would normalize `* item` to `- item`).
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

  test('WYSIWYG left editable, source mirror follows typing; mirror never writes back', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/a.md', DOC)
    const before = await editorState(page)

    await invokeMenu(page, 'view.split-view')
    const split = page.locator('.split-view.is-split')
    await expect(split).toBeVisible()
    const mirror = page.locator('.split-pane-source .CodeMirror')
    await expect(mirror).toContainText('* star bullet')
    // corner-1: toggling does not touch content or dirty state.
    const after = await editorState(page)
    expect(after.markdown).toBe(before.markdown)
    expect(after.isSaved).toBe(before.isSaved)
    expect(after.splitView).toBe(true)

    await page.locator('.split-pane-rich p', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Typed')
    await expect(mirror).toContainText('First paragraph. Typed', { timeout: 1_000 })
    // The read-only CodeMirror pane does not accept input.
    await page.locator('.split-pane-source .CodeMirror-line', { hasText: 'Split' }).click()
    await page.keyboard.type('XYZ')
    await page.waitForTimeout(300)
    expect((await editorState(page)).markdown).not.toContain('XYZ')
    await page.screenshot({ path: 'test-results/c29-split-light.png' })
  })

  test('corner-2: source mode makes CodeMirror editable and muya the read-only mirror', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/b.md', DOC)
    await invokeMenu(page, 'view.split-view')
    await invokeMenu(page, 'view.source-code-mode')

    const rich = page.locator('.split-pane-rich .editor-wrapper')
    await expect(rich).toHaveClass(/is-mirror/)
    await expect(page.locator('.split-pane-rich #ag-editor-id, .split-pane-rich [contenteditable]').first())
      .toHaveAttribute('contenteditable', 'false')

    const cm = page.locator('.split-pane-source .CodeMirror')
    await cm.locator('.CodeMirror-line', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' From source')
    await expect(page.locator('.split-pane-rich p', { hasText: 'First paragraph. From source' }))
      .toBeVisible({ timeout: 1_000 })
    // muya renders `* item` as a list and would serialize it as `- item`;
    // the store must keep the source text exactly.
    await page.waitForTimeout(400)
    const { markdown } = await editorState(page)
    expect(markdown).toContain('* star bullet')
    expect(markdown).toContain('First paragraph. From source')

    // Leaving source mode: muya becomes editable again with the typed text.
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

  test('double-click on the divider swaps sides; dark theme probe', async ({ page }) => {
    await withPrefs(page, { theme: 'dark' })
    await bootEditor(page)
    await openFileTab(page, '/tmp/c29/d.md', DOC)
    await invokeMenu(page, 'view.split-view')
    await page.locator('.split-divider').dblclick()
    await expect(page.locator('.split-view')).toHaveClass(/is-swapped/)
    expect((await editorState(page)).swapped).toBe(true)
    const rich = await page.locator('.split-pane-rich').boundingBox()
    const source = await page.locator('.split-pane-source').boundingBox()
    expect(rich!.x).toBeLessThan(source!.x)
    await page.screenshot({ path: 'test-results/c29-split-dark.png' })
  })
})
