// FILE: tests/e2e/keyboard-selection.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify native vertical selection while Muya's selection-format toolbar is visible.
//   SCOPE: Repeated Shift+Up/Down, direction reversal, wrapped lines, paragraph boundaries, painted selection and unchanged Markdown.
//   DEPENDS: Playwright, renderer-only Tauri shim, editor boot helpers.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   WRAPPED - Plain text long enough to span several visual lines in either browser.
//   selectedText - Reads the browser's actual selected text.
//   markdown - Reads the current document independently of DOM selection.
//   placeCaret - Places a collapsed caret at a deterministic text offset.
//   expectPaintedSelection - Verifies a visible selection color and multiple selected visual rows.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Reproduce and prevent format-toolbar interception of Shift+Up/Down.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const WRAPPED = 'Selection must keep moving across visual lines while its formatting toolbar is open. '.repeat(18)

const selectedText = (page: Page): Promise<string> => page.evaluate(() => window.getSelection()?.toString() || '')

const markdown = (page: Page): Promise<string> => page.evaluate(() => {
  const app = document.querySelector('#app') as any
  return app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile.markdown
})

async function placeCaret(page: Page, text: string, offset: number): Promise<void> {
  const paragraph = page.locator('#ag-editor-id span.ag-paragraph').filter({ hasText: text }).first()
  await paragraph.click()
  await paragraph.evaluate((element, pos) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const node = walker.nextNode()!
    window.getSelection()!.collapse(node, pos)
  }, offset)
}

async function expectPaintedSelection(page: Page): Promise<void> {
  const paint = await page.evaluate(() => {
    const selection = window.getSelection()!
    const element = selection.anchorNode!.parentElement!
    const color = getComputedStyle(element, '::selection').backgroundColor
    const rows = new Set([...selection.getRangeAt(0).getClientRects()]
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => Math.round(rect.top))).size
    return { color, rows }
  })
  expect(paint.color).not.toBe('rgba(0, 0, 0, 0)')
  expect(paint.color).not.toBe('transparent')
  expect(paint.rows).toBeGreaterThan(1)
}

test.describe('keyboard selection with the format toolbar', () => {
  test.use({ viewport: { width: 900, height: 650 } })

  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await bootEditor(page)
  })

  // START_BLOCK_SELECTION_TOOLBAR_REGRESSIONS
  for (const direction of ['Down', 'Up'] as const) {
    test(`Shift+${direction} grows and reverses selection over wrapped lines`, async ({ page }, testInfo) => {
      await openFileTab(page, '/tmp/keyboard-selection.md', WRAPPED)
      const original = await markdown(page)
      const offset = direction === 'Down' ? 20 : WRAPPED.length - 20
      await placeCaret(page, 'Selection must keep moving', offset)
      await page.keyboard.press(direction === 'Down' ? 'Shift+ArrowRight' : 'Shift+ArrowLeft')
      await expect.poll(() => selectedText(page)).toHaveLength(1)
      await expect(page.locator('.ag-format-picker-container')).toHaveAttribute('data-popper-placement', /.+/)

      const anchor = await page.evaluate(() => window.getSelection()!.anchorOffset)
      await page.keyboard.down('Shift')
      await page.keyboard.press(`Arrow${direction}`)
      await expect.poll(async () => (await selectedText(page)).length).toBeGreaterThan(1)
      const first = await selectedText(page)
      await page.keyboard.press(`Arrow${direction}`)
      await expect.poll(async () => (await selectedText(page)).length).toBeGreaterThan(first.length)
      const second = await selectedText(page)
      await expectPaintedSelection(page)
      await page.screenshot({ path: testInfo.outputPath(`selection-${direction.toLowerCase()}.png`) })

      await page.keyboard.press(direction === 'Down' ? 'ArrowUp' : 'ArrowDown')
      await expect.poll(async () => (await selectedText(page)).length).toBeLessThan(second.length)
      const reversed = await selectedText(page)
      await page.keyboard.up('Shift')
      expect(await selectedText(page)).toBe(reversed)
      expect(await page.evaluate(() => window.getSelection()!.anchorOffset)).toBe(anchor)
      expect(await markdown(page)).toBe(original)
    })

    test(`Shift+${direction} extends a selection into the adjacent paragraph`, async ({ page }) => {
      const document = 'First paragraph with enough words to select.\n\nSecond paragraph with enough words to select.\n\nThird paragraph with enough words to select.'
      await openFileTab(page, '/tmp/keyboard-paragraph-selection.md', document)
      const original = await markdown(page)
      await placeCaret(page, 'Second paragraph', 10)
      await page.keyboard.press(direction === 'Down' ? 'Shift+ArrowRight' : 'Shift+ArrowLeft')
      await expect(page.locator('.ag-format-picker-container')).toHaveAttribute('data-popper-placement', /.+/)
      await page.keyboard.press(`Shift+Arrow${direction}`)
      await expect.poll(() => page.evaluate(() => {
        const selection = window.getSelection()!
        return selection.anchorNode!.parentElement!.closest('.ag-paragraph')!.id !==
          selection.focusNode!.parentElement!.closest('.ag-paragraph')!.id
      })).toBe(true)
      expect((await selectedText(page)).length).toBeGreaterThan(1)
      expect(await markdown(page)).toBe(original)
    })
  }

  test('repeated Shift+Down keeps extending after the first line shows the toolbar', async ({ page }) => {
    await openFileTab(page, '/tmp/keyboard-selection-from-caret.md', WRAPPED)
    const original = await markdown(page)
    await placeCaret(page, 'Selection must keep moving', 20)
    await page.keyboard.press('Shift+ArrowDown')
    await expect(page.locator('.ag-format-picker-container')).toHaveAttribute('data-popper-placement', /.+/)
    const first = await selectedText(page)
    expect(first.length).toBeGreaterThan(1)
    await page.keyboard.press('Shift+ArrowDown')
    await expect.poll(async () => (await selectedText(page)).length).toBeGreaterThan(first.length)
    const second = await selectedText(page)
    await page.keyboard.press('Shift+ArrowLeft')
    expect((await selectedText(page)).length).toBe(second.length - 1)
    expect(await markdown(page)).toBe(original)
  })
  // END_BLOCK_SELECTION_TOOLBAR_REGRESSIONS
})
