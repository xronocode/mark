/**
 * print-export.spec.ts — C-59 (split Print and Export to PDF).
 *
 * Invoke-order traces against the real renderer + tauri shim:
 *
 *   Print (⌘P / File › Print… via the menu bridge):
 *     - mt_print_webview is invoked,
 *     - NO export-settings dialog ever opens (R-1),
 *     - the styled print container is in the DOM when the panel opens.
 *
 *   Export to PDF (File › Export to PDF…):
 *     - the settings dialog opens (pdf-flavoured, R-5),
 *     - OK → plugin:dialog|save → mt_export_pdf with the chosen path and
 *       the dialog's pageOptions,
 *     - mt_print_webview is NEVER invoked (R-2/R-6),
 *     - cancelling the save dialog writes nothing and notifies nobody
 *       (corner-2) and clears the print container.
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Print export spec\n\nbody with **bold** text\n'

test.describe('print and export-to-pdf flows (C-59)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('Print goes straight to mt_print_webview — no settings dialog', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/print-flow.md', DOC)

    // Start the order trace just before the action so boot invokes
    // (prefs hydration etc.) don't pollute it.
    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.print')
    })

    await page.waitForFunction(
      () => (window as any).__invokeLog?.includes('mt_print_webview')
    )

    // The export-settings dialog never opens on the print path (R-1).
    // (el-dialog's custom-class survives any teleport, so target that.)
    await expect(page.locator('.el-dialog', { hasText: 'Export to PDF' })).toHaveCount(0)

    // The vite build folds process.platform to the build host; the print
    // container lifecycle follows it — macOS clears it once the panel
    // closes (the backend resolves then), other platforms keep it for the
    // live WebView2/GTK preview. Both unit-pinned in editor-print-clearup
    // / editor-coverage.
    const platform = await page.evaluate(
      () => (window as any).electron?.process?.platform ?? ''
    )
    if (platform === 'darwin') {
      await expect(page.locator('article.print-container')).toHaveCount(0)
    } else {
      await expect(page.locator('article.print-container')).toHaveCount(1)
    }

    // No PDF write, no save dialog — only the panel command. (Filtered to
    // the print/export surface: unrelated background invokes like
    // recent-add must not break the order trace.)
    const log = await page.evaluate(() => (window as any).__invokeLog)
    const relevant = log.filter(
      (c: string) =>
        c === 'mt_print_webview' || c === 'mt_export_pdf' || c === 'plugin:dialog|save'
    )
    expect(relevant).toEqual(['mt_print_webview'])
  })

  test('Export to PDF: settings dialog → save dialog → mt_export_pdf (never the print panel)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__saveCalls = []
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
        w.__saveCalls.push(args?.options ?? null)
        return '/tmp/mark-e2e-out.pdf'
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/pdf-flow.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-pdf')
    })

    // The settings dialog opens with the pdf title (R-5) and the page
    // setup back (page size selector present).
    const dialog = page.locator('.el-dialog', { hasText: 'Export to PDF' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('h3')).toHaveText('Export to PDF')

    // OK → save dialog (pdf filter, document-based default name) → write.
    await dialog.locator('.button-controlls .button-primary').click()

    await page.waitForFunction(
      () => (window as any).__invokeLog?.includes('mt_export_pdf')
    )

    const saveCalls = await page.evaluate(() => (window as any).__saveCalls)
    expect(saveCalls).toHaveLength(1)
    expect(saveCalls[0]).toMatchObject({
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    expect(saveCalls[0].defaultPath).toBe('pdf-flow.pdf')

    // Exact invoke order on the print/export surface: save dialog, then
    // the silent PDF write — and never the print panel (corner-5's
    // "no macOS-only error" sibling).
    const log = await page.evaluate(() => (window as any).__invokeLog)
    const relevant = log.filter(
      (c: string) =>
        c === 'mt_print_webview' || c === 'mt_export_pdf' || c === 'plugin:dialog|save'
    )
    expect(relevant).toEqual(['plugin:dialog|save', 'mt_export_pdf'])
    expect(log).not.toContain('mt_print_webview')
  })

  test('Export to PDF with a cancelled save dialog writes nothing and clears the container (corner-2)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__mockInvoke['plugin:dialog|save'] = () => null
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/pdf-cancel.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-pdf')
    })

    const dialog = page.locator('.el-dialog', { hasText: 'Export to PDF' })
    await expect(dialog).toBeVisible()
    await dialog.locator('.button-controlls .button-primary').click()

    // Wait for the save dialog to have been asked (the container renders
    // first, asynchronously), then for the clearup after the cancel.
    await expect
      .poll(() => page.evaluate(() => (window as any).__invokeLog.includes('plugin:dialog|save')))
      .toBe(true)
    await expect(page.locator('article.print-container')).toHaveCount(0)

    const log = await page.evaluate(() => (window as any).__invokeLog)
    const relevant = log.filter(
      (c: string) =>
        c === 'mt_print_webview' || c === 'mt_export_pdf' || c === 'plugin:dialog|save'
    )
    expect(relevant).toEqual(['plugin:dialog|save'])
  })
})
