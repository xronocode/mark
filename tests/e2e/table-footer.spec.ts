// FILE: tests/e2e/table-footer.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce the owner's table/counter/scrollbar spacing report and pin a compact constant-height reserved footer.
//   SCOPE: Real Chromium/WebKit caption placement, 2px scrollbar gap, sticky counter visibility, hidden fitting-table space, bottom drag-handle hit testing and unchanged Markdown.
//   DEPENDS: @playwright/test, fixtures/tauri-shim, fixtures/helpers, built renderer.
//   LINKS: .grace/changes/active/C-TABLE-FOOTER; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   TABLES - long-cell and narrow fixtures with content after each table.
//   footer - actual table, caption and native scrollbar geometry for one figure.
//   documentState - normalized Markdown and saved state for non-editing interactions.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 C-TABLE-FOOTER: counter inside the scroll block above its scrollbar, with compact stable invisible space when fitting.
// END_CHANGE_SUMMARY

import { test, expect, type Page, type Locator } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const TABLES = `# Compact footer

| Description | Additional context | Result |
| --- | --- | --- |
| A deliberately long cell containing ordinary words that should wrap inside the table without changing the page centre. | Another long explanation that makes the natural table wider than the text column while keeping all content readable. | A long result with supporting details and a clear outcome for the table layout regression. |

Paragraph after the wide table.

| A | B |
| --- | --- |
| one | two |

Paragraph after the narrow table.
`

const footer = (figure: Locator) => figure.evaluate(el => {
  const wrapper = el.querySelector('.ag-table-scroll') as HTMLElement
  const table = wrapper.querySelector('table')!
  const caption = el.querySelector('.ag-table-caption') as HTMLElement
  const wr = wrapper.getBoundingClientRect()
  const tr = table.getBoundingClientRect()
  const cr = caption.getBoundingClientRect()
  const nativeBar = wrapper.offsetHeight - wrapper.clientHeight
  return { inside: caption.parentElement === wrapper, tableBottom: tr.bottom,
    captionTop: cr.top, captionBottom: cr.bottom, captionRight: cr.right,
    wrapperLeft: wr.left, wrapperRight: wr.right, scrollWidth: wrapper.scrollWidth,
    clientWidth: wrapper.clientWidth, footerSpace: wr.bottom - tr.bottom,
    scrollbarTop: wr.bottom - Math.max(6, nativeBar),
    captionVisible: getComputedStyle(caption).visibility,
    captionText: caption.textContent || '' }
})

const documentState = (page: Page) => page.evaluate(() => {
  const app = document.querySelector('#app') as any
  const file = app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
  return { markdown: file.markdown, isSaved: file.isSaved }
})

test.beforeEach(async ({ page }) => {
  await installTauriShim(page)
  await page.setViewportSize({ width: 1400, height: 900 })
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/table-footer.md', TABLES)
})

test('reserved footer keeps the counter inside and 2px above the scrollbar while scrolling', async ({ page }, testInfo) => {
  const figure = page.locator("figure[data-role='TABLE']").first()
  await expect(figure).toHaveClass(/ag-table-full-width/)
  await figure.hover()
  await figure.locator('.ag-table-toolbar-toggle').click()
  await expect(figure).not.toHaveClass(/ag-table-full-width/)
  const beforeDocument = await documentState(page)
  const geometry = await footer(figure)
  expect(geometry.inside).toBe(true)
  expect(Math.abs(geometry.captionTop - geometry.tableBottom)).toBeLessThanOrEqual(1)
  expect(geometry.scrollbarTop - geometry.captionBottom).toBeGreaterThanOrEqual(1)
  expect(geometry.scrollbarTop - geometry.captionBottom).toBeLessThanOrEqual(3)
  expect(geometry.footerSpace).toBeGreaterThanOrEqual(26)
  expect(geometry.footerSpace).toBeLessThanOrEqual(30)
  expect(geometry.captionVisible).toBe('visible')
  expect(geometry.captionText).toMatch(/^columns /)
  for (const fraction of [0.5, 1, 0]) {
    await figure.locator('.ag-table-scroll').evaluate((el, fraction) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) * fraction
    }, fraction)
    await expect.poll(async () => Math.abs((await footer(figure)).captionRight - geometry.captionRight)).toBeLessThanOrEqual(1)
    const scrolled = await footer(figure)
    expect(scrolled.captionRight).toBeLessThanOrEqual(scrolled.wrapperRight + 1)
    expect(scrolled.footerSpace).toBeCloseTo(geometry.footerSpace, 0)
  }
  expect(await documentState(page)).toEqual(beforeDocument)
  await page.screenshot({ path: testInfo.outputPath('compact-table-footer.png') })
})

test('reserved footer is equally tall and invisible when narrow or expanded tables fit', async ({ page }) => {
  const wide = page.locator("figure[data-role='TABLE']").first()
  const narrow = page.locator("figure[data-role='TABLE']").nth(1)
  await expect.poll(async () => (await footer(wide)).captionVisible).toBe('hidden')
  const expanded = await footer(wide)
  const fitting = await footer(narrow)
  expect(fitting.inside).toBe(true)
  expect(fitting.captionVisible).toBe('hidden')
  expect(fitting.captionText).toBe('')
  expect(fitting.scrollWidth).toBeLessThanOrEqual(fitting.clientWidth + 1)
  expect(Math.abs(fitting.footerSpace - expanded.footerSpace)).toBeLessThanOrEqual(1)
  await wide.hover()
  await wide.locator('.ag-table-toolbar-toggle').click()
  await expect.poll(async () => (await footer(wide)).captionVisible).toBe('visible')
  const overflowing = await footer(wide)
  expect(Math.abs(overflowing.footerSpace - expanded.footerSpace)).toBeLessThanOrEqual(1)
})

test('the selected column drag handle remains reachable over the reserved footer', async ({ page }) => {
  const figure = page.locator("figure[data-role='TABLE']").first()
  await figure.hover()
  await figure.locator('.ag-table-toolbar-toggle').click()
  // Select the second column: its bottom handle can share the caption's
  // horizontal range, so moving the caption must not intercept its input.
  await figure.locator('tbody td').nth(1).click({ position: { x: 80, y: 15 } })
  const handle = figure.locator('.ag-drag-handler.bottom')
  await expect(handle).toBeVisible()
  expect(await handle.evaluate(el => {
    const r = el.getBoundingClientRect()
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.ag-drag-handler.bottom') === el
  })).toBe(true)
})
