// FILE: tests/e2e/table-footer.spec.ts
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce the owner's table/counter/scrollbar spacing report and pin a compact constant-height reserved footer.
//   SCOPE: Real Chromium/WebKit caption placement, 2px scrollbar gap, continuous shade paint through the noneditable caption, sticky counter visibility, fitting-table width-control gating including restored Full width, bottom drag-handle hit testing and unchanged Markdown.
//   DEPENDS: @playwright/test, fixtures/tauri-shim, fixtures/helpers, built renderer.
//   LINKS: .grace/changes/active/C-TABLE-FOOTER; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   TABLES - long-cell and narrow fixtures with content after each table.
//   LEGACY_NARROW_LAYOUT - saved Full width choice for the second table's stable ordinal/header identity.
//   footer - actual table, caption and native scrollbar geometry for one figure.
//   documentState - normalized Markdown and saved state for non-editing interactions.
//   shadePaintDelta - screenshot pixels at the same shade x coordinate inside the caption and its lower gap; detects an opaque noneditable caption patch.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-20 C-TABLE-FOOTER owner review: screenshot pixels catch the noneditable caption background lightening the edge shade.
//   PREV: v1.1.0 - 2026-10-20 C-TABLE-FOOTER owner review: no width toggle or stray counter on fitting tables, including a restored Full width choice.
//   PREV: v1.0.0 - 2026-10-20 C-TABLE-FOOTER: counter inside the scroll block above its scrollbar, with compact stable invisible space when fitting.
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

// Historical profile identity for ordinal 1 with the headers A/B.
const LEGACY_NARROW_LAYOUT = {
  version: 1,
  files: {
    '/tmp/mark-e2e/table-footer.md': {
      '1#2:3769c9': { widths: [], manual: [], fullWidth: true }
    }
  }
}

const footer = (figure: Locator) => figure.evaluate(el => {
  const wrapper = el.querySelector('.ag-table-scroll') as HTMLElement
  const table = wrapper.querySelector('table')!
  const caption = el.querySelector('.ag-table-caption') as HTMLElement
  const wr = wrapper.getBoundingClientRect()
  const tr = table.getBoundingClientRect()
  const cr = caption.getBoundingClientRect()
  const textRange = document.createRange()
  textRange.selectNodeContents(caption)
  const nativeBar = wrapper.offsetHeight - wrapper.clientHeight
  return { inside: caption.parentElement === wrapper, tableBottom: tr.bottom,
    captionTop: cr.top, captionBottom: cr.bottom, captionRight: cr.right,
    captionTextRight: textRange.getBoundingClientRect().right,
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

const shadePaintDelta = async (page: Page, geometry: Awaited<ReturnType<typeof footer>>) => {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async ({ png, x, upperY, lowerY }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${png}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixel = (y: number) => Array.from(context.getImageData(Math.floor(x * devicePixelRatio), Math.floor(y * devicePixelRatio), 1, 1).data)
    const upper = pixel(upperY)
    const lower = pixel(lowerY)
    return Math.max(...upper.slice(0, 3).map((value, i) => Math.abs(value - lower[i])))
  }, { png, x: geometry.wrapperRight - 3, upperY: geometry.captionTop + 4, lowerY: geometry.captionBottom + 1 })
}

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
  expect(await shadePaintDelta(page, geometry), 'the caption must not lighten the continuous edge shade').toBeLessThanOrEqual(2)
  // The edge shade is 14px wide; leave another 4px of clear space.
  expect(geometry.wrapperRight - geometry.captionTextRight).toBeGreaterThanOrEqual(17)
  expect(geometry.wrapperRight - geometry.captionTextRight).toBeLessThanOrEqual(19)
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

test('a fitting table has no width toggle while copy as image remains reachable', async ({ page }) => {
  const narrow = page.locator("figure[data-role='TABLE']").nth(1)
  const before = await documentState(page)
  await narrow.hover()
  await expect(narrow.locator('.ag-table-toolbar-toggle')).not.toBeVisible()
  await expect(narrow.locator('.ag-table-toolbar-copy')).toBeVisible()
  await expect(narrow.locator('.ag-table-toolbar-expand')).not.toBeVisible()
  expect((await footer(narrow)).captionText).toBe('')
  expect(await documentState(page)).toEqual(before)
})

test('a restored narrow Full width table has no toggle or stray column counter', async ({ page }) => {
  await page.addInitScript(profile => {
    const w = window as any
    w.__mockInvoke = { ...w.__mockInvoke,
      mt_prefs_get: ({ key }: { key: string }) => key === 'tableLayouts' ? profile : null,
      mt_fs_stat: ({ path }: { path: string }) => ({
        isFile: path === '/tmp/mark-e2e/table-footer.md', isDirectory: false
      }) }
  }, LEGACY_NARROW_LAYOUT)
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/table-footer.md', TABLES)
  const narrow = page.locator("figure[data-role='TABLE']").nth(1)
  await expect(narrow).toHaveClass(/ag-table-full-width/)
  const before = await documentState(page)
  await narrow.hover()
  await expect(narrow.locator('.ag-table-toolbar-toggle')).not.toBeVisible()
  const geometry = await footer(narrow)
  expect(geometry.captionText).toBe('')
  expect(geometry.captionVisible).toBe('hidden')
  expect(await documentState(page)).toEqual(before)
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
