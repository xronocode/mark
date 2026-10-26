/**
 * export-office.spec.ts — C-NATIVE-DOCX-RTF-EXPORT (Word export + tab-menu group).
 *
 * Invoke-order traces against the real renderer + tauri shim:
 *
 *   Export to Word (File › Export to Word…, modal-less R-1):
 *     - NO export-settings dialog ever opens (owner decision 2026-10-23),
 *     - plugin:dialog|save (Word filter, .md→.docx default name) →
 *       mt_fs_write_binary (the ipc runtime normalizes mt::fs::write_binary) with the converted bytes (docx ZIP magic),
 *     - mt_print_webview / mt_export_pdf are NEVER invoked (R-3),
 *     - a cancelled save dialog writes nothing and notifies nobody.
 *
 *   Tab context menu (R-2):
 *     - the popup spec carries Export to PDF/HTML/Word after the file
 *       block, gated on pathname exactly like Copy path,
 *     - clicking Export to Word on a background tab activates that tab
 *       and exports ITS buffer (default name proves the right document).
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '# Word export spec',
  '',
  'body with **bold** text, кириллица и中文',
  '',
  '- [ ] task open',
  '- [x] task done',
  '',
  '> quote block',
  '',
  'Inline math $E = mc^2$.',
  '',
  'Footnote here[^1].',
  '',
  '[^1]: The footnote body.'
].join('\n')

test.describe('export to word and the tab-menu export group', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('Export to Word… is modal-less: save dialog → write_binary, never a settings dialog, never the print surface', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__saveCalls = []
      w.__writeCalls = []
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
        w.__saveCalls.push(args?.options ?? null)
        return '/tmp/mark-e2e-out.docx'
      }
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/word-flow.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-docx')
    })

    await page.waitForFunction(
      () => (window as any).__invokeLog?.includes('mt_fs_write_binary')
    )

    // R-1 pin: the settings dialog never mounts on the docx path.
    await expect(page.locator('.el-dialog')).toHaveCount(0)

    const saveCalls = await page.evaluate(() => (window as any).__saveCalls)
    expect(saveCalls).toHaveLength(1)
    expect(saveCalls[0]).toMatchObject({
      filters: [{ name: 'Word', extensions: ['docx'] }]
    })
    expect(saveCalls[0].defaultPath).toBe('word-flow.docx')

    // The written bytes are a real docx (ZIP magic) at the chosen path.
    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe('/tmp/mark-e2e-out.docx')
    const bytes = new Uint8Array(writes[0].data)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes[0]).toBe(0x50) // 'P'
    expect(bytes[1]).toBe(0x4b) // 'K'

    const log = await page.evaluate(() => (window as any).__invokeLog)
    const relevant = log.filter(
      (c: string) =>
        c === 'mt_print_webview' ||
        c === 'mt_export_pdf' ||
        c === 'plugin:dialog|save' ||
        c === 'mt_fs_write_binary'
    )
    expect(relevant).toEqual(['plugin:dialog|save', 'mt_fs_write_binary'])
  })

  test('a cancelled save dialog converts nothing, writes nothing, shows nothing (corner C-12)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__writeCalls = []
      w.__mockInvoke['plugin:dialog|save'] = () => null
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/word-cancel.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-docx')
    })

    // The save dialog resolves (to null) quickly; give the flow a beat,
    // then pin that nothing was written and no dialog ever mounted.
    await page.waitForTimeout(500)
    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(0)
    await expect(page.locator('.el-dialog')).toHaveCount(0)
  })

  test('tab context menu: the export group sits after the file block, gated on pathname; a background-tab Word export activates that tab first', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__saveCalls = []
      w.__writeCalls = []
      w.__popupSpecs = []
      w.__mockInvoke['mt_window_popup_context_menu'] = (args: any) => {
        // the electron shim may wrap positional args; unwrap defensively
        const spec = args && args.items ? args : (args?.args?.[0] ?? {})
        w.__popupSpecs.push(spec)
        return 'tabExportDocx'
      }
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
        w.__saveCalls.push(args?.options ?? null)
        return '/tmp/mark-e2e-tab.docx'
      }
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    // First tab stays in the background; the second one is active.
    await openFileTab(page, '/tmp/word-bg.md', DOC)
    await openFileTab(page, '/tmp/word-fg.md', '# Foreground\n')

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
    })
    await page.locator('li[data-id][title="/tmp/word-bg.md"]').click({ button: 'right' })

    await page.waitForFunction(
      () => (window as any).__invokeLog?.includes('mt_fs_write_binary')
    )

    const specs = await page.evaluate(() => (window as any).__popupSpecs)
    expect(specs).toHaveLength(1)
    const items = specs[0].items
    const ids = items.map((i: any) => i.id)
    expect(ids).toContain('tabExportPdf')
    expect(ids).toContain('tabExportHtml')
    expect(ids).toContain('tabExportDocx')
    const lastSeparator = items.map((i: any) => i.type).lastIndexOf('separator')
    expect(items.findIndex((i: any) => i.id === 'tabExportPdf')).toBeGreaterThan(lastSeparator)
    expect(items.find((i: any) => i.id === 'tabExportDocx').enabled).toBe(true)

    // The export acted on the BACKGROUND tab's document: the default save
    // name proves the activation-first semantics (R-2).
    const saveCalls = await page.evaluate(() => (window as any).__saveCalls)
    expect(saveCalls).toHaveLength(1)
    expect(saveCalls[0].defaultPath).toBe('word-bg.docx')

    // The modal-less pin holds on the tab-menu door too.
    await expect(page.locator('.el-dialog')).toHaveCount(0)
  })
})
