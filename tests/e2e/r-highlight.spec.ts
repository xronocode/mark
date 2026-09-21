import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// R highlighting regression (2026-09-21): stock prism-r has no `function`
// token, so R call sites rendered flat next to JS/Rust blocks. muya's prism
// index now extends the grammar with builtin + function rules. This spec
// pins the token classes actually present in the rendered code block.
test.describe('r code highlighting', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('R fence emits function/builtin/operator tokens', async ({ page }) => {
    await bootEditor(page)
    const md = [
      '```r',
      '# Load libraries',
      'library(dplyr)',
      "df <- data.frame(x = rnorm(100), g = rep(c('A','B'), 50))",
      'result <- df |> group_by(g) |> summarise(mean_x = mean(x))',
      'if (TRUE) { cat("done") } else { next }',
      '```',
      ''
    ].join('\n')
    await openFileTab(page, '/tmp/probe/r-test.md', md)
    await page.waitForTimeout(3000)

    const report = await page.evaluate(() => {
      const pre = document.querySelectorAll('pre')[0]
      if (!pre) return null
      const byClass: Record<string, number> = {}
      for (const t of pre.querySelectorAll<HTMLElement>('[class*="token"]')) {
        const c = (t.className || '').replace('token ', '').trim()
        byClass[c] = (byClass[c] || 0) + 1
      }
      return byClass
    })
    expect(report).not.toBeNull()
    expect(report!.comment ?? 0).toBeGreaterThanOrEqual(1)
    expect(report!.string ?? 0).toBeGreaterThanOrEqual(2)
    expect(report!.operator ?? 0).toBeGreaterThanOrEqual(3) // <- and |>
    expect(report!.number ?? 0).toBeGreaterThanOrEqual(2)
    expect(report!.keyword ?? 0).toBeGreaterThanOrEqual(1) // if/else
    expect(report!.boolean ?? 0).toBeGreaterThanOrEqual(1) // TRUE
    // the extension's raison d'être — function-call coloring:
    expect(report!.builtin ?? 0).toBeGreaterThanOrEqual(4) // library/data.frame/c/group_by…
    expect(report!.function ?? 0).toBeGreaterThanOrEqual(1) // rnorm/rep — not in builtin set
  })
})
