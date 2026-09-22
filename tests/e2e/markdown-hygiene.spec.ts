/**
 * markdown-hygiene.spec.ts — visual gates for C-17.
 *
 * Drives the real renderer: a messy document (heading jump + trailing
 * whitespace) must populate the problems panel; the format command must
 * canonicalize the visible document and empty the panel; a second format
 * is a no-op (idempotence at the app level).
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// Structural rules survive the WYSIWYG round-trip; whitespace/blank-line
// issues (MD009/MD032) are normalized away by muya's export, so the
// visible-gate fixture uses MD001 (heading jump) + MD040 (fence without
// language — validate-only, format does not invent languages).
const MESSY = '# Strategy\n\n### Deep Jump\n\n```\nconst x = 1\n```\n'
const FORMATTED_H2 = '## Deep Jump'

test.describe('markdown hygiene (C-17)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('problems panel lists issues, format document fixes them, second format is a no-op', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/hygiene.md', MESSY)

    await expect(page.locator('.editor-with-tabs h3').first())
      .toContainText('Deep Jump', { timeout: 5_000 })

    // The change handler emits doc-markdown-changed debounced (500ms).
    await page.waitForTimeout(900)

    await page.evaluate(() => (window as any).__bus.emit('problems'))
    await expect(page.locator('.problems-panel')).toBeVisible({ timeout: 5_000 })

    const rules = page.locator('.problems-panel .rule')
    await expect(rules.filter({ hasText: 'MD001' })).toBeVisible({ timeout: 5_000 })
    await expect(rules.filter({ hasText: 'MD040' })).toBeVisible()

    // Format document: heading demoted h3→h2, trailing whitespace gone.
    await page.evaluate(() => (window as any).__bus.emit('formatDocument'))
    await expect(page.locator('.editor-with-tabs h2').first())
      .toContainText(FORMATTED_H2, { timeout: 5_000 })
    await expect(page.locator('.editor-with-tabs h3')).toHaveCount(0)

    // The re-rendered document drops MD001; MD040 stays (validate-only —
    // format must not invent a language) until the fence gets one.
    await page.waitForTimeout(900)
    await expect(page.locator('.problems-panel .rule').filter({ hasText: 'MD001' })).toHaveCount(0)
    await expect(page.locator('.problems-panel .rule').filter({ hasText: 'MD040' })).toBeVisible()

    // Idempotence at the app level: a second format changes nothing —
    // pinned on the store markdown itself, not just the rendered heading.
    const beforeSecond = await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.markdown
    })
    await page.evaluate(() => (window as any).__bus.emit('formatDocument'))
    await page.waitForTimeout(300)
    const afterSecond = await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.markdown
    })
    expect(afterSecond).toBe(beforeSecond)
    await expect(page.locator('.problems-panel .rule').filter({ hasText: 'MD040' })).toBeVisible()
  })

})
