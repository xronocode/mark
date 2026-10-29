// FILE: tests/e2e/open-file-timing.spec.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the FIX-002 open-file timing trace — the renderer legs of the sidebar-click open path emit bounded BLOCK_OPEN_* markers.
//   SCOPE: Click mark → open-new-tab arrival → first paint markers for a small and a large document; per-leg millisecond budgets.
//   DEPENDS: Playwright, renderer-only Tauri shim, editor boot helpers.
//   LINKS: .grace/verification/performance.xml V-M-025; docs/release-trains/2.5.x-next.md FIX-002.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   MARKER_RE - Extracts the marker name and its millisecond value from a BLOCK_OPEN_* log line.
//   LARGE_DOC_PAINT_BUDGET_MS - Paint budget constant: 10000 ms locally, 20000 ms on CI (concurrent-job noise headroom, #119).
//   openTiming - Boots the app, arms the click stamp, delivers one mt::open-new-tab event and collects the emitted markers.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-28: the ~600 KB paint budget stays 10000 ms locally and widens to 20000 ms on CI, where concurrent macOS jobs add runner noise (observed 18.1-18.6 s on otherwise green branches); the strict local budget still catches a real regression.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

const MARKER_RE = /\[(BLOCK_OPEN_[A-Z_]+) [^\]]*?(?:since_click|since_arrival)_ms=(\d+)/

// CI macOS runners are shared and occasionally paint the 600 KB fixture in
// ~18 s on an otherwise green branch (owner report 2026-10-28). Keep the
// strict 10 s local budget and give only CI a noise-tolerant ceiling.
const LARGE_DOC_PAINT_BUDGET_MS = process.env.CI ? 20_000 : 10_000

async function openTiming(page: Page, pathname: string, markdown: string): Promise<Record<string, number>> {
  const markers: Record<string, number> = {}
  const listener = (m: { text(): string }) => {
    const match = MARKER_RE.exec(m.text())
    if (match && !(match[1] in markers)) markers[match[1]] = Number(match[2])
  }
  page.on('console', listener)
  await page.evaluate(({ p, md }: { p: string; md: string }) => {
    ;(window as any).__openFileClickAt = performance.now()
    ;(window as any).__emitFakeEvent('mt::open-new-tab', {
      pathname: p,
      filename: p.split('/').pop(),
      markdown: md,
      isUtf8BomEncoded: false,
      lineEnding: 'lf',
      adjustLineEndingOnSave: false
    })
  }, { p: pathname, md: markdown })
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('#ag-editor-id p, #ag-editor-id h1').length), { timeout: 10_000 })
    .toBeGreaterThan(0)
  await page.waitForTimeout(250)
  page.off('console', listener)
  return markers
}

test.describe('open-file timing trace (FIX-002)', () => {
  test('a small document paints within the renderer budgets', async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
    await bootEditor(page)

    const markers = await openTiming(page, '/tmp/timing-small.md', '# Timing\n\nbody\n')
    // The event-arrival leg (click → backend read → event delivery; in the
    // shim the delivery is immediate) and the paint leg stay millisecond
    // scale for an ordinary document.
    expect(markers.BLOCK_OPEN_FILE_ARRIVAL).toBeDefined()
    expect(markers.BLOCK_OPEN_FILE_ARRIVAL).toBeLessThan(100)
    expect(markers.BLOCK_OPEN_FIRST_PAINT).toBeDefined()
    expect(markers.BLOCK_OPEN_FIRST_PAINT).toBeLessThan(2_000)
  })

  test('a large document stays inside the large-document paint budget', async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
    await bootEditor(page)

    // ~600KB: 8000 sections stress the state build + Muya parse.
    const big = Array.from({ length: 8000 }, (_, i) => `## Section ${i}\n\nParagraph ${i} body text. `).join('\n')
    const markers = await openTiming(page, '/tmp/timing-big.md', big)
    expect(markers.BLOCK_OPEN_FIRST_PAINT).toBeDefined()
    expect(markers.BLOCK_OPEN_FIRST_PAINT).toBeLessThan(LARGE_DOC_PAINT_BUDGET_MS)
  })
})
