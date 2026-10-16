// FILE: tests/e2e/sidebar-empty-state.spec.ts
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-011 e2e — with no folder open the sidebar Files column carries no Open Folder CTA and no RECENT folders list (both moved to the welcome screen, C-46); the file-sections column itself still renders.
//   SCOPE: renderer-only e2e against vite preview + tauri-shim (chromium).
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim, tests/e2e/fixtures/helpers (bootEditor).
//   LINKS: .grace/changes/active/C-51 T-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   REMOVED_EMPTY_STATE - selectors of the removed Open Folder CTA and recent-folders list; each must match nothing.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-16 C-51 T-011: the spec now pins the
//   ABSENCE of the removed empty state (open-folder CTA + recent folders
//   list) — v1 asserted the CTA was visible.
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

const REMOVED_EMPTY_STATE = ['.open-project', '.open-folder-btn', '.recent-folders', '.recent-folder-item']

test.describe('sidebar empty state', () => {
  test('with no project opened, the sidebar shows no open-folder CTA and no RECENT list', async ({
    page
  }) => {
    await installTauriShim(page)
    await bootEditor(page, { sideBarVisibility: true })

    // The Files column mounts…
    const tree = page.locator('.tree-view').first()
    await expect(tree).toBeVisible()

    // …but the C-51 T-011 removals hold: no Open Folder button, no
    // recent-folders block (they live on the welcome screen, C-46).
    for (const selector of REMOVED_EMPTY_STATE) {
      await expect(tree.locator(selector), selector).toHaveCount(0)
    }
  })
})
