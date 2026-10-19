// FILE: tests/e2e/table-column-resize.spec.ts
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin C-39 T-002 session-only table column resize in the built renderer: dragging a header border resizes that column live and only that column, the markdown stays byte-identical with the tab still saved, widths survive re-renders (typing) and tab switches, closing+reopening the file restores auto layout, double-click resets the column, a table dragged wider than the text column scrolls in the C-39 T-001 wrapper without page overflow, and caret placement still works next to a border.
//   SCOPE: muya.tableResize (src/muya/lib/tableResize/index.js) + START_BLOCK_TABLE_COLUMN_WIDTHS / START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE in renderContainerBlock.js + the C-39 T-002 CSS section.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim, ./fixtures/helpers (bootEditor/openFileTab), the built renderer served by `npm run preview`; runs in the chromium project and the webkit-tables project (WKWebView engine).
//   LINKS: .grace/changes/active/C-39 T-002; .grace/verification/runtime.xml V-M-012 scenario-21; unit twin tests/renderer/muya/table-column-resize.test.js; wrapper behaviour tests/e2e/table-layout.spec.ts (C-39 T-001).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE_MD - 3-column table fixture with distinct column widths; the overflow case explicitly selects Fit to page after widening.
//   PLAIN_MD - plain document used as the second tab.
//   RESIZE_PATH - fake pathname of the table tab.
//   PLAIN_PATH - fake pathname of the second tab.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-20 C-TABLE-FOOTER: explicitly select Fit to page after the default expands a newly widened table; wait for the real scroll owner instead of racing the resize observer.
//   PREV: v1.1.0 - 2026-10-15 C-39 T-002: boot through the shared fixtures/helpers (bootEditor + openFileTab) instead of a private prefs bootstrap; every test starts from a file tab so isSaved/filename-based tab selection are deterministic. All eight behaviours above: every test except the caret case fails without the T-002 change (no handles / no colgroup / no session store); the caret case guards the regression the hit zone could cause.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const RESIZE_PATH = '/tmp/mark-e2e/column-resize.md'
const PLAIN_PATH = '/tmp/mark-e2e/plain.md'

const TABLE_MD = `# Column Resize

| Alpha column | Beta column | Gamma |
| --- | --- | --- |
| one | two | three |
| four | five | six |

Text after the table.
`

const PLAIN_MD = `# Other Tab

Just text.
`

test.describe('table column resize (C-39 T-002)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  async function waitForTable(page: Page) {
    const wrapper = page.locator("figure[data-role='TABLE'] div.ag-table-scroll").first()
    await wrapper.waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator("figure[data-role='TABLE'] table").first()
      .waitFor({ state: 'visible', timeout: 10_000 })
    return wrapper
  }

  // bootEditor leaves one untitled blank tab; the table arrives as a file
  // tab so its isSaved/filename behave like a real document.
  async function openResizeTab(page: Page) {
    await bootEditor(page)
    await openFileTab(page, RESIZE_PATH, TABLE_MD)
    await waitForTable(page)
  }

  const columnWidths = (page: Page) => page.evaluate(() => {
    const table = document.querySelector("figure[data-role='TABLE'] table") as HTMLTableElement | null
    if (!table || !table.tHead || !table.tHead.rows[0]) return null
    return Array.from(table.tHead.rows[0].cells).map(
      (c) => Math.round(c.getBoundingClientRect().width)
    )
  })

  const tableState = (page: Page) => page.evaluate(() => {
    const table = document.querySelector("figure[data-role='TABLE'] table") as HTMLTableElement | null
    if (!table) return null
    return {
      fixed: table.classList.contains('ag-column-widths-fixed'),
      colgroup: !!table.querySelector('colgroup'),
      colWidths: Array.from(table.querySelectorAll('colgroup col')).map((c) => c.style.width),
      styleWidth: table.style.width,
      layout: window.getComputedStyle(table).tableLayout
    }
  })

  const currentMarkdown = (page: Page) => page.evaluate(() => {
    const el = document.querySelector('#app') as any
    return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.markdown ?? ''
  })

  const currentIsSaved = (page: Page) => page.evaluate(() => {
    const el = document.querySelector('#app') as any
    return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.isSaved
  })

  // Drag the border at the RIGHT edge of header column `index` by `delta` px.
  async function dragBorder(page: Page, index: number, delta: number) {
    const th = page.locator("figure[data-role='TABLE'] thead th").nth(index)
    const box = await th.boundingBox()
    expect(box).not.toBeNull()
    const x = box!.x + box!.width
    const y = box!.y + box!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + delta, y, { steps: 10 })
    await page.mouse.up()
  }

  test('dragging a border resizes that column live; the others are unchanged', async ({ page }) => {
    await openResizeTab(page)

    // The handles are invisible at rest: a painted background covered the
    // header's top border at every column boundary (review 2026-10-16).
    const handleBgs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ag-column-resizer')).map((e) => getComputedStyle(e).backgroundColor)
    )
    expect(handleBgs.length).toBeGreaterThan(0)
    for (const bg of handleBgs) expect(bg).toBe('rgba(0, 0, 0, 0)')

    const before = await columnWidths(page)
    expect(before).not.toBeNull()
    expect(before!.length).toBe(3)

    await dragBorder(page, 0, 120)

    const after = await columnWidths(page)
    expect(after).not.toBeNull()
    expect(Math.abs(after![0] - (before![0] + 120)), 'the dragged column must grow by ~the drag delta').toBeLessThanOrEqual(2)
    expect(Math.abs(after![1] - before![1]), 'the next column must keep its width').toBeLessThanOrEqual(2)
    expect(Math.abs(after![2] - before![2]), 'the last column must keep its width').toBeLessThanOrEqual(2)

    const state = await tableState(page)
    expect(state!.fixed).toBe(true)
    expect(state!.colgroup).toBe(true)
    expect(state!.layout).toBe('fixed')
  })

  test('a resize keeps the markdown byte-identical and the tab saved', async ({ page }) => {
    await openResizeTab(page)

    const markdownBefore = await currentMarkdown(page)
    expect(markdownBefore).toContain('| Alpha column | Beta column | Gamma |')
    expect(await currentIsSaved(page)).toBe(true)

    await dragBorder(page, 1, -30)
    await dragBorder(page, 0, 90)

    expect(await currentMarkdown(page), 'widths must never reach the markdown').toBe(markdownBefore)
    expect(await currentIsSaved(page), 'a resize must not mark the tab dirty').toBe(true)
  })

  test('typing in a cell after a resize keeps the session width (re-render survived)', async ({ page }) => {
    await openResizeTab(page)

    await dragBorder(page, 0, 120)
    const stateAfterDrag = await tableState(page)
    expect(stateAfterDrag!.fixed).toBe(true)
    const widthsAfterDrag = await columnWidths(page)

    // Edit a body cell of ANOTHER column — partial re-render of the table.
    const cell = page.locator("figure[data-role='TABLE'] tbody tr td").nth(2)
    const box = await cell.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + 15, box!.y + box!.height / 2)
    await page.keyboard.type('hello')

    const cellText = await page.evaluate(() => {
      const td = document.querySelector("figure[data-role='TABLE'] tbody tr td:nth-child(3)") as HTMLElement | null
      return td ? td.textContent : null
    })
    expect(cellText, 'typing must land inside the clicked cell').toContain('hello')

    const state = await tableState(page)
    expect(state!.fixed, 'the re-render must re-apply the session widths').toBe(true)
    expect(state!.colWidths).toEqual(stateAfterDrag!.colWidths)

    const widths = await columnWidths(page)
    expect(Math.abs(widths![0] - widthsAfterDrag![0]), 'the resized column must keep its width across the re-render').toBeLessThanOrEqual(2)
    expect(await currentMarkdown(page)).toContain('hello')
  })

  test('double-click on a border resets the column to auto', async ({ page }) => {
    await openResizeTab(page)

    const natural = await columnWidths(page)
    await dragBorder(page, 0, 100)
    const dragged = await columnWidths(page)
    expect(dragged![0] - natural![0]).toBeGreaterThanOrEqual(98)

    const th = page.locator("figure[data-role='TABLE'] thead th").nth(0)
    const box = await th.boundingBox()
    await page.mouse.dblclick(box!.x + box!.width, box!.y + box!.height / 2)

    const after = await columnWidths(page)
    expect(Math.abs(after![0] - natural![0]), 'the column must be back at its auto width').toBeLessThanOrEqual(2)

    const state = await tableState(page)
    expect(state!.fixed, 'the table must be back to auto layout').toBe(false)
    expect(state!.colgroup).toBe(false)
  })

  test('widths survive switching to another tab and back', async ({ page }) => {
    await openResizeTab(page)

    await dragBorder(page, 0, 120)
    const resized = await tableState(page)
    expect(resized!.fixed).toBe(true)
    expect(resized!.colWidths.length).toBe(3)

    await openFileTab(page, PLAIN_PATH, PLAIN_MD)
    await page.locator('.editor-component p').first().waitFor({ state: 'visible', timeout: 10_000 })
    expect(await page.locator('figure[data-role=\'TABLE\']').count()).toBe(0)

    // back to the table tab (click its filename in the tab bar)
    await page.locator('.tabs-container li', { hasText: 'column-resize.md' }).locator('span').first().click()
    await waitForTable(page)

    const state = await tableState(page)
    expect(state!.fixed, 'the session widths must survive the tab switch').toBe(true)
    expect(state!.colWidths).toEqual(resized!.colWidths)
  })

  test('closing and reopening the file restores auto layout', async ({ page }) => {
    await openResizeTab(page)

    await dragBorder(page, 0, 120)
    expect((await tableState(page))!.fixed).toBe(true)

    // close the file tab (saved file → direct close, no prompt); the boot
    // tab list may be empty afterwards (welcome screen) — count down by one.
    const before = await page.locator('.tabs-container li').count()
    await page.locator('.tabs-container li.active .close-icon').first().click()
    await page.waitForFunction(
      (n) => document.querySelectorAll('.tabs-container li').length === n - 1,
      before,
      { timeout: 10_000 }
    )

    // reopen the same file: fresh parse → fresh table keys → auto layout
    await openFileTab(page, RESIZE_PATH, TABLE_MD)
    await waitForTable(page)

    const state = await tableState(page)
    expect(state!.fixed, 'a reopened file must start from auto layout').toBe(false)
    expect(state!.colgroup).toBe(false)
  })

  test('a table dragged wider than the text column scrolls in the wrapper, not the page', async ({ page }) => {
    await openResizeTab(page)

    await dragBorder(page, 0, 600)
    const figure = page.locator("figure[data-role='TABLE']").first()
    await figure.hover()
    const toggle = figure.locator('.ag-table-toolbar-toggle')
    await toggle.click()
    if (await figure.evaluate(el => el.classList.contains('ag-table-full-width'))) await toggle.click()
    await expect(figure).not.toHaveClass(/ag-table-full-width/)

    const m = await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      const editorScroller = document.querySelector('.editor-component') as HTMLElement
      return {
        scrollWidth: wrapper.scrollWidth,
        clientWidth: wrapper.clientWidth,
        pageScrollWidth: editorScroller.scrollWidth,
        pageClientWidth: editorScroller.clientWidth
      }
    })
    expect(m.scrollWidth, 'the widened table must overflow the wrapper').toBeGreaterThan(m.clientWidth + 100)
    expect(m.pageScrollWidth, 'the page must not gain horizontal overflow').toBeLessThanOrEqual(m.pageClientWidth + 1)
  })

  test('clicking inside a cell 10 px left of a border still places the caret in that cell', async ({ page }) => {
    await openResizeTab(page)

    // First resize so the borders sit exactly on the stored widths, then
    // click in the header cell of column 2, 10px left of its right border.
    await dragBorder(page, 1, 60)
    const th = page.locator("figure[data-role='TABLE'] thead th").nth(1)
    const box = await th.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + box!.width - 10, box!.y + box!.height / 2)
    await page.keyboard.type('Q')

    const headerText = await page.evaluate(() => {
      const th = document.querySelectorAll("figure[data-role='TABLE'] thead th")[1] as HTMLElement | null
      return th ? th.textContent : null
    })
    expect(headerText, 'the caret must land in the cell left of the border').toContain('Q')
  })
})
