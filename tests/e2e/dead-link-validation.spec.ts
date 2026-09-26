/**
 * dead-link-validation.spec.ts — visual gate for C-21.
 *
 * A fixture with a live link, a dead file link, and a dead anchor shows
 * exactly the two dead issues in the problems panel; the live ones show
 * none.
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '# Strategy',
  '',
  'See [live](notes.md) and [dead](gone.md).',
  '',
  '[bad anchor](#no-such-heading)',
  ''
].join('\n')

test.describe('dead-link validation (C-21)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke['mt_fs_stat'] = (args: any) => {
        const p = String(args?.path || '')
        return { isFile: p.endsWith('notes.md'), isDirectory: false }
      }
    })
  })

  test('panel lists the dead file link and dead anchor, not the live ones', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/docs/strategy.md', DOC)

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Strategy', { timeout: 5_000 })

    // Open the problems panel (debounce 500ms + async stat).
    await page.waitForTimeout(900)
    await page.evaluate(() => (window as any).__bus.emit('problems'))
    await expect(page.locator('.problems-panel')).toBeVisible({ timeout: 5_000 })

    const rules = page.locator('.problems-panel .rule')
    await expect(rules.filter({ hasText: 'DEADLINK-FILE' })).toBeVisible({ timeout: 5_000 })
    await expect(rules.filter({ hasText: 'DEADLINK-ANCHOR' })).toBeVisible()
    // The live link produced no issue.
    await expect(rules.filter({ hasText: 'DEADLINK-IMAGE' })).toHaveCount(0)
    const deadCount = await rules.filter({ hasText: 'DEADLINK' }).count()
    expect(deadCount).toBe(2)
  })
})
