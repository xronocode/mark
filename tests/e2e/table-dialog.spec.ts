// FILE: tests/e2e/table-dialog.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Browser proof for C-TABLE-DIALOG-CREATION-VERIFICATION — through the production menu-command path the insert-table dialog opens at the 4×3 defaults with stable row focus, Cancel creates nothing, and a real 7×5 confirmation creates exactly one real table (DOM rows/cells plus the canonical pipe Markdown).
//   SCOPE: Built-renderer chromium + webkit-tables via the real mt::menu-invoked → paragraph.table → dialog path; DOM and pinia Markdown oracles only. No native IPC/WKWebView/owner-acceptance claims.
//   DEPENDS: @playwright/test, fixtures/tauri-shim, fixtures/helpers, the built renderer bundle served by npm run preview.
//   LINKS: .grace/changes/active/C-TABLE-DIALOG-CREATION-VERIFICATION; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   invokeMenu - production command dispatch: fake menu event → menu-bridge registry → focusEditorAndExecute → bus paragraph table.
//   setNumberInput - fill + blur so el-input-number commits the typed value through its native input/change path.
//   renderedTableShape - direct th/td child counts per tr of the created table figure.
//   tabMarkdown - pinia probe of the owning tab current Markdown.
//   tabFileState - pinia probe of the owning tab Markdown plus its saved flag.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   CURRENT: v1.0.0 - 2026-11-19 C-TABLE-DIALOG-CREATION-VERIFICATION T-003: default opening with stable row-input focus, Cancel-no-create (Markdown/dirty state untouched), and the non-default 7×5 confirmation (one figure, 7 rows × 5 cells, canonical empty pipe table) in chromium and webkit-tables.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const invokeMenu = async (page: Page, id: string): Promise<void> => {
  await page.evaluate((command) => (window as any).__emitFakeEvent('mt::menu-invoked', command), id)
}

const setNumberInput = async (page: Page, selector: string, value: string): Promise<void> => {
  const input = page.locator(selector)
  await input.fill(value)
  await input.blur()
}

const renderedTableShape = (page: Page) => page.evaluate(() => {
  const table = document.querySelector("figure[data-role='TABLE'] table")
  if (!table) return null
  return Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.children).filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD').length
  )
})

const tabMarkdown = (page: Page) => page.evaluate(() => {
  const app = document.querySelector('#app') as any
  return app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile.markdown as string
})

const tabFileState = (page: Page) => page.evaluate(() => {
  const app = document.querySelector('#app') as any
  const file = app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
  return { markdown: file.markdown, isSaved: file.isSaved }
})

test.describe('table dialog creation (C-TABLE-DIALOG-CREATION-VERIFICATION)', () => {
  // Locale-independent selectors from the real template. element-plus 2.x
  // renders `custom-class` as a plain DOM attribute on the .el-dialog
  // container (it declares no customClass prop), so the dialog's identity
  // selector is the attribute form, and every inner selector scopes through
  // that container.
  const DIALOG = '.el-dialog[custom-class="ag-dialog-table"]'
  const ROW_INPUT = '.el-dialog[custom-class="ag-dialog-table"] .el-form-item:first-child input.el-input__inner'
  const COLUMN_INPUT = '.el-dialog[custom-class="ag-dialog-table"] .el-form-item:nth-child(2) input.el-input__inner'
  const CANCEL_BUTTON = '.el-dialog[custom-class="ag-dialog-table"] .dialog-footer button:not(.el-button--primary)'
  const OK_BUTTON = '.el-dialog[custom-class="ag-dialog-table"] .dialog-footer button.el-button--primary'
  const TABLE = "figure[data-role='TABLE'] table"


  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('default opening: 4×3 with stable row-input focus', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/table-dialog-defaults.md', '# Defaults\n')
    await invokeMenu(page, 'paragraph.table')

    const dialog = page.locator(DIALOG)
    await expect(dialog).toBeVisible()
    await expect(page.locator(ROW_INPUT)).toHaveValue('4')
    await expect(page.locator(COLUMN_INPUT)).toHaveValue('3')
    // After the real opening lifecycle settles, the row input's inner
    // element — not the dialog container — holds focus. The pre-fix traces
    // showed the FocusTrap overwriting the focus claim on the container.
    await expect(page.locator(ROW_INPUT)).toBeFocused()
  })

  test('Cancel closes the dialog and creates nothing', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/table-dialog-cancel.md', '# Cancel\n')
    const before = await tabFileState(page)

    await invokeMenu(page, 'paragraph.table')
    await expect(page.locator(DIALOG)).toBeVisible()

    await page.locator(CANCEL_BUTTON).click()
    await expect(page.locator(DIALOG)).toBeHidden()
    await expect(page.locator(TABLE)).toHaveCount(0)

    // Markdown and dirty state are untouched.
    expect(await tabFileState(page)).toEqual(before)
  })

  test('non-default 7×5 confirmation creates exactly one real table', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/table-dialog-confirm.md', 'Seven by five\n')
    await invokeMenu(page, 'paragraph.table')
    await expect(page.locator(DIALOG)).toBeVisible()

    await setNumberInput(page, ROW_INPUT, '7')
    await setNumberInput(page, COLUMN_INPUT, '5')
    await expect(page.locator(ROW_INPUT)).toHaveValue('7')
    await expect(page.locator(COLUMN_INPUT)).toHaveValue('5')

    await page.locator(OK_BUTTON).click()
    await expect(page.locator(DIALOG)).toBeHidden()

    // Exactly one table figure; the DOM table has 7 rows with 5 direct
    // th/td cells each (matching the verified Muya rendering).
    await expect(page.locator(TABLE)).toHaveCount(1)
    await expect.poll(async () => renderedTableShape(page))
      .toEqual(Array.from({ length: 7 }, () => 5))

    // The tab Markdown carries the canonical 7-row × 5-column pipe table:
    // an empty header row, the five-column separator, and six empty body rows.
    let markdownLines: string[] = []
    await expect
      .poll(async () => {
        markdownLines = (await tabMarkdown(page)).split('\n')
        return markdownLines
      })
      .toContain('| --- | --- | --- | --- | --- |')
    const separatorIndex = markdownLines.indexOf('| --- | --- | --- | --- | --- |')
    expect(separatorIndex).toBeGreaterThan(0)
    const tableLines = markdownLines.slice(separatorIndex - 1, separatorIndex + 7)
    expect(tableLines).toHaveLength(8)
    const emptyRow = /^\|( {5}\|){4} {5}\|$/
    for (const line of tableLines) {
      // The header row and the --- separator are structural; the six data
      // rows carry the empty-cell shape.
      if (line.includes('---')) continue
      expect(line).toMatch(emptyRow)
    }
  })
})
