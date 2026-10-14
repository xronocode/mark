import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('editor content', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('opening a markdown file renders headings and paragraphs', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/render-test.md',
      '# Main Title\n\n## Section One\n\nThis is a paragraph with **bold** and *italic* text.\n\n### Subsection\n\nAnother paragraph here.\n')

    await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Main Title', { timeout: 5_000 })
    await expect(page.locator('.editor-with-tabs h2').first()).toContainText('Section One', { timeout: 5_000 })
    await expect(page.locator('.editor-with-tabs h3').first()).toContainText('Subsection', { timeout: 5_000 })
  })

  test('opening a file with a list renders list items', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/list-test.md',
      '# Lists\n\n- Item one\n- Item two\n- Item three\n')

    const listItems = page.locator('.ag-bullet-list-item, .ag-list-item, [data-role="bulletListItem"]')
    await expect(listItems).toHaveCount(3, { timeout: 5_000 })
  })

  test('opening a file with a code block renders syntax highlighting', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/code-test.md',
      '# Code\n\n```javascript\nconst x = 42;\nconsole.log(x);\n```\n')

    const codeBlock = page.locator('.editor-with-tabs pre code, .editor-with-tabs .ag-code-block')
    await expect(codeBlock.first()).toBeVisible({ timeout: 5_000 })
  })

  test('opening a file with a blockquote renders it', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/bq-test.md',
      '# Quote\n\n> This is a blockquote\n> with multiple lines.\n')

    const blockquote = page.locator('.editor-with-tabs blockquote, .editor-with-tabs .ag-paragraph[data-role="blockquote"]')
    await expect(blockquote.first()).toBeVisible({ timeout: 5_000 })
  })

  test('opening a file with a table renders rows and columns', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/table-test.md',
      '# Table\n\n| Name | Value |\n| ---- | ----- |\n| A    | 1     |\n| B    | 2     |\n')

    const table = page.locator('.editor-with-tabs table')
    await expect(table.first()).toBeVisible({ timeout: 5_000 })

    const rows = table.first().locator('tr')
    await expect(rows).toHaveCount(3, { timeout: 5_000 })
  })

  test('text column is a flex item so WebKit stops selection paint at the column edge', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/column-test.md', '# Column\n\nShort.\n')
    await expect(page.locator('#ag-editor-id h1')).toBeVisible({ timeout: 5_000 })

    // A non-flex parent makes WKWebView fill fully selected blocks across
    // the whole window instead of the 750px column.
    const geo = await page.evaluate(() => {
      const editor = document.querySelector('#ag-editor-id') as HTMLElement
      const parent = editor.parentElement as HTMLElement
      const e = editor.getBoundingClientRect()
      const p = parent.getBoundingClientRect()
      return {
        display: getComputedStyle(parent).display,
        width: Math.round(e.width),
        leftGap: Math.round(e.left - p.left),
        rightGap: Math.round(p.right - e.right - (parent.offsetWidth - parent.clientWidth))
      }
    })
    expect(geo.display).toBe('flex')
    expect(geo.width).toBe(750)
    expect(Math.abs(geo.leftGap - geo.rightGap)).toBeLessThanOrEqual(1)
  })
})
