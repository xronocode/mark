/**
 * export-html-images.spec.ts — C-SELF-CONTAINED-HTML-EXPORT.
 *
 * End-to-end artifact assertion against the real renderer + tauri shim:
 *
 *   Export as HTML (File › Export › HTML via the menu bridge):
 *     - the pass stats + reads the document's local image through the
 *       read-binary bridge (mt_fs_stat / mt_fs_read_binary),
 *     - the saved HTML (captured at mt_fs_write) embeds the image as a
 *       data:image/png;base64 URL that decodes to the fixture bytes
 *       (spec AC-3, byte-identical),
 *     - a remote image in the same document keeps its URL (R-2),
 *     - the relative src appears nowhere in the saved file (R-1).
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// The PNG signature bytes the fs bridge "returns from disk". Tiny on
// purpose: the assertion is byte identity, not image validity.
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_B64 = Buffer.from(PNG_BYTES).toString('base64')

const DOC = [
  '# HTML export spec',
  '',
  'local ![shot](img/shot.png)',
  '',
  'remote ![remote](https://example.com/remote.png)',
  ''
].join('\n')

test.describe('export to HTML embeds local images (C-SELF-CONTAINED-HTML-EXPORT)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('Export as HTML: local PNG embedded byte-identical, remote URL untouched', async ({ page }) => {
    await page.addInitScript((pngBytes: number[]) => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/mark-e2e-out.html'
      w.__mockInvoke['mt_fs_stat'] = (args: any) => {
        if (args?.path === '/tmp/html-flow/img/shot.png') {
          return {
            size: pngBytes.length,
            mode: 0o100644,
            mtimeMs: 0,
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false
          }
        }
        return { isFile: false, isDirectory: false }
      }
      w.__mockInvoke['mt_fs_read_binary'] = (args: any) => {
        if (args?.path === '/tmp/html-flow/img/shot.png') return pngBytes
        return null
      }
      w.__mockInvoke['mt_fs_write'] = (args: any) => {
        w.__written.push({ path: args?.path, content: args?.content })
        return null
      }
    }, PNG_BYTES)

    await bootEditor(page)
    await openFileTab(page, '/tmp/html-flow/flow.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-html')
    })

    // The styledHtml export dialog (title is the shared "Export Options").
    const dialog = page.locator('.el-dialog', { hasText: 'Export Options' })
    await expect(dialog).toBeVisible()
    await dialog.locator('.button-controlls .button-primary').click()

    // The write happens after the embedding pass resolves.
    const written = await page.waitForFunction(
      () => (window as any).__written?.length > 0
    )
    const entry = (await written.evaluate(() => (window as any).__written))[0] as {
      path: string
      content: string
    }
    expect(entry.path).toBe('/tmp/mark-e2e-out.html')

    // AC-3: the local image is a data URL decoding to the fixture bytes.
    const dataUrl = entry.content.match(/src="data:image\/png;base64,([^"]+)"/)?.[1]
    expect(dataUrl).toBeDefined()
    expect(dataUrl).toBe(PNG_B64)

    // R-1: the relative src is gone from the saved file; R-2: the remote
    // URL survives verbatim.
    expect(entry.content).not.toContain('img/shot.png')
    expect(entry.content).toContain('https://example.com/remote.png')

    // The pass went through the binary bridge, not the UTF-8 read.
    const log = await page.evaluate(() => (window as any).__invokeLog)
    expect(log).toContain('mt_fs_stat')
    expect(log).toContain('mt_fs_read_binary')
    expect(log).not.toContain('mt_fs_read')
  })
})
