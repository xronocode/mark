/**
 * callouts.spec.ts — C-24 R-5/R-7: GitHub alerts and Obsidian callouts render
 * as callouts (style class, title row, hidden marker line), a foldable
 * callout toggles on title click, and none of it changes the markdown.
 */

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), '../renderer/muya/fixtures/lexer-corpus')
const GITHUB = readFileSync(resolve(CORPUS, 'github-alerts.md'), 'utf8')
const OBSIDIAN = readFileSync(resolve(CORPUS, 'obsidian-callouts.md'), 'utf8')

async function currentMarkdown (page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('#app') as any
    return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.markdown ?? ''
  })
}

test.describe('callouts (C-24)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('GitHub alerts render with style and title; plain quotes stay plain', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c24/alerts.md', GITHUB)
    const callouts = page.locator('.editor-with-tabs blockquote.ag-callout')
    await expect(callouts).toHaveCount(7, { timeout: 5_000 })
    for (const style of ['note', 'tip', 'important', 'warning', 'caution']) {
      await expect(page.locator(`blockquote.ag-callout-${style}`).first()).toBeVisible()
    }
    await expect(page.locator('blockquote.ag-callout-note .ag-callout-title-text').first()).toHaveText('Note')
    await expect(page.locator('.ag-callout-title-text', { hasText: 'Custom title on a GitHub type' })).toBeVisible()
    // The marker line is hidden while the cursor is elsewhere.
    const marker = page.locator('blockquote.ag-callout-tip .ag-callout-marker').first()
    await expect(marker).toHaveClass(/ag-hide/)
    // "> Plain quote with [!NOTE] inside." is not a callout.
    await expect(page.locator('.editor-with-tabs blockquote:not(.ag-callout)')).toHaveCount(1)
    await page.screenshot({ path: 'test-results/c24-callouts-github.png', fullPage: true })
  })

  test('Obsidian aliases, custom titles and folds; fold toggle leaves markdown untouched', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c24/callouts.md', OBSIDIAN)
    await expect(page.locator('blockquote.ag-callout').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('blockquote.ag-callout-abstract')).toHaveCount(1)
    await expect(page.locator('blockquote.ag-callout-bug')).toHaveCount(1)
    await expect(page.locator('.ag-callout-title-text', { hasText: 'Falls back to note' })).toBeVisible()

    const collapsed = page.locator('blockquote.ag-callout-question')
    await expect(collapsed).toHaveClass(/ag-callout-collapsed/)
    await expect(collapsed.locator('p')).toBeHidden()
    const expanded = page.locator('blockquote.ag-callout-example')
    await expect(expanded).not.toHaveClass(/ag-callout-collapsed/)

    const before = await currentMarkdown(page)
    await collapsed.locator('.ag-callout-title').click()
    await expect(page.locator('blockquote.ag-callout-question')).not.toHaveClass(/ag-callout-collapsed/)
    await expect(page.locator('blockquote.ag-callout-question p').first()).toBeVisible()
    await page.locator('blockquote.ag-callout-example .ag-callout-title').click()
    await expect(page.locator('blockquote.ag-callout-example')).toHaveClass(/ag-callout-collapsed/)
    await page.waitForTimeout(300)
    expect(await currentMarkdown(page)).toBe(before)
    await page.screenshot({ path: 'test-results/c24-callouts-obsidian.png', fullPage: true })
  })
})
