// FILE: tests/e2e/diff-snapshot.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Visual gate for C-43 S1 — after an external process rewrites an open file and live reload applies it, view.diff-mode shows the change against Mark's own pre-reload snapshot (header names the source with a timestamp) instead of failing on a missing .before/git baseline.
//   SCOPE: Real renderer via vite preview + tauri-shim: per-file watcher event (mt::watch::event) + disk read (mt_fs_read) deliver the external change; the diff view's baseline priority and header label are asserted, and mt_diff_baseline must not run while a snapshot exists.
//   DEPENDS: tests/e2e/fixtures/tauri-shim.ts, tests/e2e/fixtures/helpers.ts
//   LINKS: .grace/changes/active/C-43 acceptance criterion; .grace/verification/runtime.xml V-M-011 scenario-39
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ORIGINAL - pre-reload document (what the snapshot must keep).
//   EXTERNAL - post-reload document (what the current side must show).
//   emitExternalEdit - override mt_fs_read and fire the watcher modify event (shim subscriptionId filter passes on undefined === undefined).
//   PATHNAME - absolute path of the open saved tab the shim serves.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-43 S1 initial e2e gate.
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const PATHNAME = '/tmp/mark-e2e/diff-snapshot.md'
const ORIGINAL = '# Agent Doc\n\nOriginal paragraph kept from before the external save.\n'
const EXTERNAL = '# Agent Doc\n\nRewritten paragraph from the external save.\n'

// Same delivery mechanism as live-reload-scroll.spec.ts: the shim's watcher
// subscription has no real subscriptionId, so the event filter
// (undefined === undefined) lets the modify event through; the reload then
// reads the "disk" through mt_fs_read.
const emitExternalEdit = (page: any, pathname: string, newMarkdown: string) =>
  page.evaluate(({ p, md }: { p: string; md: string }) => {
    ;(window as any).__mockInvoke['mt_fs_read'] = () => md
    ;(window as any).__emitFakeEvent('mt::watch::event', {
      kind: 'modify',
      paths: [p]
    })
  }, { p: pathname, md: newMarkdown })

test.describe('C-43 diff against Mark\u2019s snapshots', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    // Track every stored-baseline lookup; the snapshot path must not use it.
    await page.addInitScript(() => {
      ;(window as any).__diffBaselineCalls = []
      ;(window as any).__mockInvoke.mt_diff_baseline = (args: any) => {
        ;(window as any).__diffBaselineCalls.push(args)
        return '# stored baseline (must not be used when a snapshot exists)\n'
      }
    })
  })

  test('external save, then view.diff-mode shows the snapshot diff with its source label', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, PATHNAME, ORIGINAL)
    await expect(page.locator('.editor-with-tabs p').first())
      .toContainText('Original paragraph kept', { timeout: 5_000 })

    // An agent rewrites the file on disk; live reload applies it and the
    // pre-reload content becomes this tab's snapshot.
    await emitExternalEdit(page, PATHNAME, EXTERNAL)
    await expect(page.locator('.editor-with-tabs p').first())
      .toContainText('Rewritten paragraph', { timeout: 5_000 })

    // ⌘D path: enter diff mode through the command dispatch.
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.diff-mode'))
    const diff = page.locator('.diff-view')
    await diff.waitFor({ state: 'visible', timeout: 5_000 })

    // The header names the snapshot source with a local 24h timestamp.
    const baselineSide = diff.locator('.diff-side').nth(1)
    await expect(baselineSide).toContainText('Before the last external save')
    await expect(baselineSide).toContainText(/\d{1,2}:\d{2}:\d{2}/)

    // The snapshot won over .before/git: the stored baseline never ran…
    const calls = await page.evaluate(() => (window as any).__diffBaselineCalls)
    expect(calls).toHaveLength(0)

    // …and the diff body carries both versions: the external rewrite on the
    // current side and the pre-reload content on the baseline side.
    await expect(diff.locator('.diff-body')).toContainText('Rewritten paragraph from the external save')
    await expect(diff.locator('.diff-body')).toContainText('Original paragraph kept from before the external save')
  })

  test('without a snapshot the stored baseline is used and labelled Previous version', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/plain.md', '# Plain\n\nNo external change here.\n')
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Plain', { timeout: 5_000 })

    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.diff-mode'))
    const diff = page.locator('.diff-view')
    await diff.waitFor({ state: 'visible', timeout: 5_000 })

    await expect(diff.locator('.diff-side').nth(1)).toContainText('Previous version')
    await expect.poll(
      async () => page.evaluate(() => (window as any).__diffBaselineCalls.length),
      { timeout: 5_000 }
    ).toBeGreaterThanOrEqual(1)
  })
})
