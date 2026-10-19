// FILE: tests/e2e/diff-opened-baseline.spec.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Visual gate for C-68 T-001 — a file outside git always has a ⌘D baseline: after an edit the diff runs against the content at open (header «Since you opened the file · time», the mt_diff_baseline error swallowed into the fallback); with no edits ⌘D shows the calm «No changes since you opened the file» notice, never the raw error, and never enters diff mode.
//   SCOPE: Real renderer via vite preview + tauri-shim: mt_diff_baseline always rejects like m031_diff.rs does outside a repository; the opened snapshot recorded at mt::open-new-tab load is the asserted baseline; a real muya keyboard edit produces the current side.
//   DEPENDS: tests/e2e/fixtures/tauri-shim.ts, tests/e2e/fixtures/helpers.ts
//   LINKS: .grace/changes/active/C-68 corner-1/corner-2 acceptance; .grace/verification/runtime.xml V-M-011 scenario-67
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   NOT_A_GIT_REPO - backend error fixture that must never become a user notice.
//   currentMarkdown - the live tab markdown straight from the editor store (poll target after the keyboard edit).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Pass the active page into the Markdown poll and run baseline priority in both engines.
//   PREV: v1.0.0 - 2026-10-19 C-68 T-001 initial e2e gate (chromium + the webkit-diff project).
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// The raw error m031_diff.rs returns for an ordinary note outside any
// repository — the shim throws it verbatim so the spec proves it never
// reaches the UI.
const NOT_A_GIT_REPO = 'not_a_git_repo: /tmp/mark-e2e is not inside a git repository'

const currentMarkdown = (page: Page) =>
  page.evaluate(
    () =>
      (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state
        .value.editor.currentFile.markdown as string
  )

test.describe('C-68 ⌘D always has a baseline outside git', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    // Outside git: every stored-baseline lookup fails like the Rust side.
    await page.addInitScript((err: string) => {
      ;(window as any).__diffBaselineCalls = []
      ;(window as any).__mockInvoke.mt_diff_baseline = (args: any) => {
        ;(window as any).__diffBaselineCalls.push(args)
        throw err
      }
    }, NOT_A_GIT_REPO)
  })

  test('edited note: ⌘D diffs against the content at open, error swallowed into the fallback', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(
      page,
      '/tmp/mark-e2e/opened-baseline.md',
      '# Opened note\n\nThe paragraph exactly as it was when the file opened.\n'
    )
    await expect(page.locator('.editor-with-tabs p').first())
      .toContainText('The paragraph exactly as it was', { timeout: 5_000 })

    // A real user edit through muya.
    await page.locator('.editor-with-tabs p').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Now it is edited.')
    await expect.poll(() => currentMarkdown(page), { timeout: 5_000 }).toContain('Now it is edited.')

    // ⌘D path: enter diff mode through the command dispatch.
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.diff-mode'))
    const diff = page.locator('.diff-view')
    await diff.waitFor({ state: 'visible', timeout: 5_000 })

    // The backend was tried and its error swallowed into the opened
    // fallback — no raw error toast ever appears.
    await expect.poll(
      async () => page.evaluate(() => (window as any).__diffBaselineCalls.length),
      { timeout: 5_000 }
    ).toBeGreaterThanOrEqual(1)
    await expect(page.locator('.mt-notification')).toHaveCount(0)

    // The header names the opened source with a local 24h timestamp…
    const baselineSide = diff.locator('.diff-side').nth(1)
    await expect(baselineSide).toContainText('Since you opened the file')
    await expect(baselineSide).toContainText(/\d{1,2}:\d{2}:\d{2}/)

    // …and the diff body carries both versions: the edit on the current
    // side and the opened content on the baseline side.
    await expect(diff.locator('.diff-body')).toContainText('Now it is edited.')
    await expect(diff.locator('.diff-body')).toContainText('The paragraph exactly as it was when the file opened.')
  })

  test('untouched note: ⌘D shows the calm notice, no diff, no raw error', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(
      page,
      '/tmp/mark-e2e/opened-untouched.md',
      '# Untouched note\n\nNothing changed since the file opened.\n'
    )
    await expect(page.locator('.editor-with-tabs p').first())
      .toContainText('Nothing changed since the file opened', { timeout: 5_000 })

    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.diff-mode'))

    // The calm info notice — not the raw backend error.
    const notice = page.locator('.mt-notification')
    await expect(notice).toBeVisible({ timeout: 5_000 })
    await expect(notice).toContainText('No changes since you opened the file')
    await expect(notice).not.toContainText('not_a_git_repo')

    // Diff mode was never really entered: no diff view, editor intact.
    await expect(page.locator('.diff-view')).toHaveCount(0)
    await expect(page.locator('.editor-wrapper').first()).toBeVisible()
  })
})
