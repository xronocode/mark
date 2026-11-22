/**
 * project-search.spec.ts — C-SEARCH-RESULT-CONTRACT T-006.
 *
 * The Wave-3 acceptance receipt: the right file opens AT THE RIGHT MATCH
 * FROM THE KEYBOARD. The fixture envelope is delivered through the
 * tauri-shim search doubles (__emitSearchEvent) with honest bounds
 * across two files — one multi-match line and one bounds-absent hit.
 * This is a fixture-envelope proof: native rg transport on unmatched
 * platforms stays separately open, never substituted by this shim.
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

const FIXTURE_ROOT = '/tmp/proj'
const ALPHA_PATH = `${FIXTURE_ROOT}/alpha.md`
const BETA_PATH = `${FIXTURE_ROOT}/beta.md`

// Honest bounds come from the backend contract (UTF-16 units over the
// delivered snippet); the bounds-absent hit maps to the no-highlight
// zero pair downstream.
const MATCH_ENVELOPE = {
  kind: 'match',
  seq: 1,
  hits: [
    {
      path: ALPHA_PATH,
      line: 3,
      column: 7,
      snippet: 'alpha needle beta',
      truncated: false,
      matchStart: 6,
      matchEnd: 12
    },
    {
      path: ALPHA_PATH,
      line: 3,
      column: 19,
      snippet: 'more needle here',
      truncated: false,
      matchStart: 5,
      matchEnd: 11
    },
    {
      path: BETA_PATH,
      line: 7,
      column: 1,
      snippet: 'bounds unavailable line',
      truncated: true
    }
  ]
}

test.describe('project search keyboard open (C-SEARCH-RESULT-CONTRACT)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    // Record every mt::open-new-tab receipt (the mt_open_file double's
    // emit) so the keyboard-open receipt is assertable, and capture the
    // live searchId at spawn time (the spawn fires as soon as the query
    // lands — before any later page.evaluate could install a hook).
    await page.addInitScript(() => {
      const w = window as any
      const orig = w.__emitFakeEvent
      w.__openNewTabReceipts = []
      w.__emitFakeEvent = (event: string, payload: unknown) => {
        if (event === 'mt::open-new-tab') w.__openNewTabReceipts.push(payload)
        return orig(event, payload)
      }
      w.__mockInvoke.mt_search_spawn = (args: any) => {
        const a = Array.isArray(args?.args) ? args.args[0] : args
        w.__capturedSearchId = a?.searchId ?? a?.search_id ?? null
        return null
      }
    })
  })

  test('the right file opens at the right match from the keyboard; the bounds-absent hit shows no highlight with a defined line-start cursor', async ({ page }) => {
    await bootEditor(page)

    // Open a project root (no roots open at boot → mode 'ask' adds it
    // directly) so the search store can range over it.
    await page.evaluate((root) => {
      ;(window as any).__bus.emit('mt::open-folder-as-workspace', root)
    }, FIXTURE_ROOT)

    // Open the project-search overlay and submit the query.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('projectSearch')
    })
    const overlay = page.locator('.project-search-overlay')
    await expect(overlay).toBeVisible({ timeout: 5_000 })

    await page.locator('.search-input').fill('needle')

    // Wait until the searcher subscribed to the Tauri channel, then feed
    // the fixture envelope and its complete terminal.
    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::search-event') return true
      return false
    }, undefined, { timeout: 5_000 })

    await page.evaluate((envelope) => {
      const w = window as any
      w.__emitSearchEvent(w.__capturedSearchId, envelope)
      w.__emitSearchEvent(w.__capturedSearchId, { kind: 'complete', partial: false, seq: 2 })
    }, MATCH_ENVELOPE)

    // The expected rows render: two honest-bound matches on the
    // multi-match line plus the bounds-absent hit.
    const rows = page.locator('.panel-results .matches ul li')
    await expect(rows).toHaveCount(3, { timeout: 5_000 })
    const highlights = page.locator('.panel-results .matches ul li .highlight')
    await expect(highlights).toHaveText(['needle', 'needle', ''])

    // Wave-3 criterion from the keyboard: Enter from the input into the
    // results, arrows to the fixture match line, Enter.
    await page.locator('.search-input').focus()
    await page.keyboard.press('Enter')
    const firstRow = rows.nth(0)
    await expect(firstRow).toHaveClass(/active/, { timeout: 5_000 })

    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(1)).toHaveClass(/active/, { timeout: 5_000 })
    await page.keyboard.press('Enter')

    // Receipt 1: the fixture file opens carrying the cursor at the
    // honest fixture match position (UTF-16 units 5..11 on line 3).
    await page.waitForFunction(
      () => (window as any).__openNewTabReceipts.length >= 1,
      undefined,
      { timeout: 5_000 }
    )
    const receipts = await page.evaluate(() => (window as any).__openNewTabReceipts)
    expect(receipts[0].pathname).toBe(ALPHA_PATH)
    expect(receipts[0].options?.cursor?.anchor).toEqual({ line: 2, ch: 5 })
    expect(receipts[0].options?.cursor?.focus).toEqual({ line: 2, ch: 11 })

    // Arrow once more onto the bounds-absent hit and open it: no
    // highlight, defined line-start cursor. Opening the first file moved
    // focus into the editor (real app behavior); the user returns to the
    // overlay's selected row — the roving Tab target — before the next
    // arrows.
    await page.evaluate(() => {
      const active = document.querySelector('.panel-results .matches ul li.active')
      if (active instanceof HTMLElement) active.focus()
    })
    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(2)).toHaveClass(/active/, { timeout: 5_000 })
    await page.keyboard.press('Enter')

    await page.waitForFunction(
      () => (window as any).__openNewTabReceipts.length >= 2,
      undefined,
      { timeout: 5_000 }
    )
    const receipts2 = await page.evaluate(() => (window as any).__openNewTabReceipts)
    expect(receipts2[1].pathname).toBe(BETA_PATH)
    expect(receipts2[1].options?.cursor?.anchor).toEqual({ line: 6, ch: 0 })
    expect(receipts2[1].options?.cursor?.focus).toEqual({ line: 6, ch: 0 })
  })
})
