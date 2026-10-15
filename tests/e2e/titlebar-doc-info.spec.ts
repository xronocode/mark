import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

/**
 * C-40 T-002: document info popover from the title-bar file name and the
 * trimmed title bar (no word count). Runs in chromium + webkit; the
 * renderer platform follows the Playwright host (darwin locally, linux in
 * CI), so the «?» guide assertions branch on the page's own platform.
 */

const DOC_PATH = '/tmp/mark-e2e-fake-localdata/Notes/release-notes.md'
const DOC_MD =
  '# Release notes 2.3.2\n' +
  '\n' +
  'Mark is a calm Markdown editor for people who write with agents.\n' +
  '\n' +
  '## What changed\n' +
  '\n' +
  '- Title bar trimmed\n' +
  '- Outline on the right\n' +
  '- Optional status bar\n'

// Mirror of muya's wordCount (src/muya/lib/utils) for the ASCII fixture —
// pins the wiring (tab.wordCount → popover), not the algorithm.
const muyaCounts = (md: string) => {
  const tokens = md.split(/[\s\n]+/).filter((t) => t)
  return {
    word: tokens.length,
    character: tokens.reduce((acc, t) => acc + t.length, 0)
  }
}

test.describe('titlebar document info popover (C-40 T-002)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      const w = window as any
      // homeDir resolves through plugin:path|resolve_directory — the shim
      // default is /tmp/mark-e2e-fake-localdata, so the folder abbreviates.
      w.__mockInvoke.mt_fs_stat = () => ({
        isFile: true,
        isDirectory: false,
        size: 2150,
        mtimeMs: Date.now() - 4 * 60_000,
        mode: 0,
        isSymbolicLink: false
      })
      w.__copyPathCalls = []
      w.__mockInvoke['plugin:clipboard-manager|write_text'] = (args: any) => {
        w.__copyPathCalls.push(args)
        return null
      }
      w.__revealCalls = []
      w.__mockInvoke['plugin:opener|reveal_item_in_dir'] = (args: any) => {
        w.__revealCalls.push(args)
        return null
      }
    })
  })

  test('popover opens from the title, shows stats and file meta, closes on Esc', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, DOC_PATH, DOC_MD)

    const titleBtn = page.locator('.titlebar-title-btn')
    await expect(titleBtn).toBeVisible({ timeout: 5_000 })
    await expect(titleBtn).toContainText('release-notes.md')

    await titleBtn.click()
    const popover = page.locator('.doc-info-popover')
    await expect(popover).toBeVisible({ timeout: 5_000 })
    await expect(titleBtn).toHaveAttribute('aria-expanded', 'true')

    // name + meta: ~-abbreviated folder · size · edited-relative
    await expect(popover.locator('.doc-info-name')).toHaveText('release-notes.md')
    await expect(popover.locator('.doc-info-meta')).toHaveText(
      '~/Notes · 2.1 KB · edited 4 min ago'
    )

    // stats: words / characters / lines / reading time (words/230, min 1)
    const counts = muyaCounts(DOC_MD)
    const numbers = popover.locator('.doc-info-stat b')
    await expect(numbers.nth(0)).toHaveText(String(counts.word), { timeout: 10_000 })
    await expect(numbers.nth(1)).toHaveText(String(counts.character))
    await expect(numbers.nth(2)).toHaveText(String(DOC_MD.split('\n').length))
    await expect(numbers.nth(3)).toHaveText('1 min')
    const labels = popover.locator('.doc-info-stat span')
    await expect(labels.nth(0)).toHaveText('words')
    await expect(labels.nth(1)).toHaveText('characters')
    await expect(labels.nth(2)).toHaveText('lines')
    await expect(labels.nth(3)).toHaveText('reading')

    // Esc closes
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(titleBtn).toHaveAttribute('aria-expanded', 'false')
  })

  test('popover closes on an outside click and Copy path / reveal actions dispatch', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, DOC_PATH, DOC_MD)

    await page.locator('.titlebar-title-btn').click()
    const popover = page.locator('.doc-info-popover')
    await expect(popover).toBeVisible({ timeout: 5_000 })

    // Copy path goes through the native clipboard plugin (WKWebView-safe).
    await popover.locator('.doc-info-action', { hasText: 'Copy path' }).click()
    await expect
      .poll(() => page.evaluate(() => (window as any).__copyPathCalls.length))
      .toBeGreaterThanOrEqual(1)
    const copied = await page.evaluate(() => JSON.stringify((window as any).__copyPathCalls[0]))
    expect(copied).toContain(DOC_PATH)
    // The action closed the popover.
    await expect(popover).toBeHidden()

    // Reveal (label per OS) dispatches the opener reveal command.
    await page.locator('.titlebar-title-btn').click()
    await expect(popover).toBeVisible({ timeout: 5_000 })
    const revealBtn = popover.locator('.doc-info-action', {
      hasText: /Show in (Finder|Explorer|folder)/
    })
    await expect(revealBtn).toHaveCount(1)
    await revealBtn.click()
    await expect
      .poll(() => page.evaluate(() => (window as any).__revealCalls.length))
      .toBeGreaterThanOrEqual(1)
    await expect(popover).toBeHidden()

    // Outside click also closes after reopening.
    await page.locator('.titlebar-title-btn').click()
    await expect(popover).toBeVisible({ timeout: 5_000 })
    await page.mouse.click(400, 400)
    await expect(popover).toBeHidden()
  })

  test('the title bar carries no word counter, and the «?» guide entry follows the platform', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, DOC_PATH, DOC_MD)

    // The word count left the title bar (C-40 T-002).
    await expect(page.locator('.word-count')).toHaveCount(0)
    // The unsaved dot rides inside the title button.
    await expect(page.locator('.titlebar-title-btn .save-dot')).toHaveCount(1)

    // «?» is Win/Linux-only; macOS reaches the Guide from Help/palette.
    const platform = await page.evaluate(
      () => (window as any).electron.process.platform as string
    )
    const guide = page.locator('.titlebar-guide-btn')
    if (platform === 'darwin') {
      await expect(guide).toHaveCount(0)
    } else {
      await expect(guide).toHaveCount(1)
      await guide.click()
      // mt::open-guide opens the Mark Guide as an untitled tab (en title).
      await expect(page.locator('.titlebar-title-name')).toHaveText('Mark Guide', {
        timeout: 5_000
      })
    }
  })
})
