/**
 * export-document-pin.spec.ts — C-EXPORT-DOCUMENT-PIN.
 *
 * End-to-end artifact assertion against the real renderer + tauri shim:
 *
 *   - A styledHtml export whose PlantUML consent card is answered AFTER the
 *     active tab switched to another document refuses with the honest
 *     localized notice and records NOTHING at the mt_fs_write double
 *     (spec AC-1). The pre-fix red for this pin is the wrong-content
 *     signature: pre-fix code writes the switched tab's document — a state
 *     the fix removes.
 *   - A file that changed on disk after consent (shim read surface flipped)
 *     refuses honestly with nothing written.
 *   - The happy path still writes exactly the consented document once
 *     (over-blocking control).
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC_A = ['# Pin flow A', '', '```plantuml', '@startuml', 'A -> B', '@enduml', '```', ''].join('\n')
const DOC_B = ['# Pin flow B', '', 'A different document body.', ''].join('\n')

const PLANTUML_CARD_TEXT = 'PlantUML diagrams are rendered by plantuml.com'
const CONFIRM_LABEL = 'Send to plantuml.com'
const IDENTITY_REFUSAL = 'Export stopped — the document changed'
const DISK_REFUSAL = 'Export stopped — the file changed on disk'

// START_BLOCK_EXPORT_DOCUMENT_PIN
test.describe('export document pin (C-EXPORT-DOCUMENT-PIN)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  // The pin baseline rides the binary bridge (mt_fs_read_binary) — every
  // scenario feeds the fixture bytes so the capture can digest them.
  const feedBaselineBytes = (page: import('@playwright/test').Page) =>
    page.addInitScript((doc: string) => {
      ;(window as any).__mockInvoke['mt_fs_read_binary'] = () => new TextEncoder().encode(doc)
    }, DOC_A)

  const writtenEntries = async (page: import('@playwright/test').Page) =>
    page.evaluate(() => (window as any).__written ?? [])

  // Resolves once the flow has visibly settled either way: a write landed
  // or a pin refusal card is on screen.
  const waitFlowSettled = (page: import('@playwright/test').Page) =>
    page.waitForFunction(
      () =>
        ((window as any).__written?.length ?? 0) > 0 ||
        [...document.querySelectorAll('.notification-card .card-title')].some((el) =>
          (el.textContent || '').includes('Export stopped')
        ),
      undefined,
      { timeout: 15_000 }
    )

  const startHtmlExport = async (page: import('@playwright/test').Page) => {
    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-html')
    })
    await expect(
      page.locator('.notification-card', { hasText: PLANTUML_CARD_TEXT })
    ).toBeVisible()
  }

  const confirmPlantUML = async (page: import('@playwright/test').Page) => {
    await page.locator('.notification-card .action-btn', { hasText: CONFIRM_LABEL }).click()
  }

  test('tab switch between consent and final write refuses with nothing written', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/pin-flow/out.html'
      w.__mockInvoke['mt_fs_write'] = (args: any) => {
        w.__written.push({ path: args?.path, content: args?.content })
        return null
      }
    })
    await feedBaselineBytes(page)

    await bootEditor(page)
    await openFileTab(page, '/tmp/pin-flow/a.md', DOC_A)
    await startHtmlExport(page)

    // The active tab switches to another document while the sticky consent
    // card is still unanswered.
    await openFileTab(page, '/tmp/pin-flow/b.md', DOC_B)
    await confirmPlantUML(page)
    await waitFlowSettled(page)

    // The honest refusal: nothing reached the write double.
    expect(await writtenEntries(page)).toHaveLength(0)
    await expect(page.locator('.notification-card', { hasText: IDENTITY_REFUSAL })).toBeVisible()
  })

  test('disk change after consent refuses honestly with nothing written', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/pin-flow/out.html'
      w.__mockInvoke['mt_fs_write'] = (args: any) => {
        w.__written.push({ path: args?.path, content: args?.content })
        return null
      }
    })
    await feedBaselineBytes(page)

    await bootEditor(page)
    await openFileTab(page, '/tmp/pin-flow/a.md', DOC_A)
    await startHtmlExport(page)

    // The on-disk file moves after the consent card is up (bytes diverging
    // from the pin baseline).
    await page.evaluate(() => {
      ;(window as any).__mockInvoke['mt_fs_read_binary'] = () =>
        new TextEncoder().encode('# Pin flow A TAMPERED ON DISK')
    })
    await confirmPlantUML(page)
    await waitFlowSettled(page)

    expect(await writtenEntries(page)).toHaveLength(0)
    await expect(page.locator('.notification-card', { hasText: DISK_REFUSAL })).toBeVisible()
  })

  test('happy path: consented export still writes the consented document', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/pin-flow/out.html'
      w.__mockInvoke['mt_fs_write'] = (args: any) => {
        w.__written.push({ path: args?.path, content: args?.content })
        return null
      }
    })
    await feedBaselineBytes(page)

    await bootEditor(page)
    await openFileTab(page, '/tmp/pin-flow/a.md', DOC_A)
    await startHtmlExport(page)
    await confirmPlantUML(page)

    await page.waitForFunction(() => ((window as any).__written?.length ?? 0) > 0, undefined, {
      timeout: 15_000
    })

    const entries = await writtenEntries(page)
    expect(entries).toHaveLength(1)
    expect(entries[0].path).toBe('/tmp/pin-flow/out.html')
    // The artifact is the consented document itself.
    expect(entries[0].content).toContain('Pin flow A')
    expect(entries[0].content).not.toContain('Pin flow B')

    const log = await page.evaluate(() => (window as any).__invokeLog)
    expect(log.filter((command: string) => command === 'plugin:dialog|save')).toHaveLength(1)
    expect(log.filter((command: string) => command === 'mt_fs_write')).toHaveLength(1)
  })
})
// END_BLOCK_EXPORT_DOCUMENT_PIN
