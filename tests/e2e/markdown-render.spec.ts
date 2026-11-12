// FILE: tests/e2e/markdown-render.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove live typed ATX conversion through the actual rich editor input path.
//   SCOPE: Real hash/space/text keyboard input, visible h1 semantics and exact canonical store Markdown; renderer shim, no native IPC claim.
//   DEPENDS: Playwright; Tauri shim; bootEditor/openFileTab; actual Muya input and Pinia state.
//   LINKS: M-012; V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   currentMarkdown - Read the canonical document from the actual Pinia editor store.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12: activate typed heading coverage with the current bootstrap and exact model oracle.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

async function currentMarkdown(page: Page): Promise<string> {
  return page.evaluate(() => {
    const app = document.querySelector('#app') as any
    return app.__vue_app__.config.globalProperties.$pinia._s.get('editor').currentFile.markdown
  })
}

test.describe('markdown render', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('typing # heading produces an h1 and exact Markdown in the live editor', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/typed-heading.md', 'Start\n')
    const paragraph = page.locator('.editor-with-tabs [contenteditable="true"] p').first()
    await expect(paragraph).toContainText('Start', { timeout: 5_000 })
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('#')
    await page.keyboard.press('Space')

    const heading = page.locator('.editor-with-tabs [contenteditable="true"] h1')
    await expect(heading).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type('Hello')
    await expect(heading).toContainText('Hello')
    await expect(page.locator('.editor-with-tabs [contenteditable="true"] h2')).toHaveCount(0)
    await expect.poll(() => currentMarkdown(page)).toBe('Start\n\n# Hello\n')
  })
})
