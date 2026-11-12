// FILE: tests/e2e/table-column-resize.spec.ts
// VERSION: 1.5.1
// START_MODULE_CONTRACT
//   PURPOSE: Pin C-39 T-002 session-only table column resize in the built renderer: dragging a header border resizes that column live and only that column, the markdown stays byte-identical with the tab still saved, widths survive re-renders (typing) and tab switches, closing+reopening the file restores auto layout, double-click resets the column, wide Auto drags fit the frame without hiding columns or causing internal/page overflow, and caret placement still works next to a border.
//   SCOPE: muya.tableResize (src/muya/lib/tableResize/index.js) + START_BLOCK_TABLE_COLUMN_WIDTHS / START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE in renderContainerBlock.js + the C-39 T-002 CSS section.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim, ./fixtures/helpers (bootEditor/openFileTab), the built renderer served by `npm run preview`; runs in the chromium project and the webkit-tables project (WKWebView engine).
//   LINKS: .grace/changes/active/C-39 T-002; .grace/verification/runtime.xml V-M-012 scenario-21; unit twin tests/renderer/muya/table-column-resize.test.js; wrapper behaviour tests/e2e/table-layout.spec.ts (C-39 T-001).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE_MD - 3-column fixture with distinct widths and a wide Auto-drag fitting case.
//   PLAIN_MD - plain document used as the second tab.
//   RESIZE_PATH - fake pathname of the table tab.
//   PLAIN_PATH - fake pathname of the second tab.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-12: reserve the sequential-resize fixture canvas before measuring its fixed frame; retain every pointer, byte and 2px geometry oracle.
//   CURRENT: 2026-11-10 C-TABLE-FITTED-RESET: partial Fit/Full reset
//   after adjacent drags fits before persistence and never exposes overflow.
//   CURRENT: 2026-11-10 C-TABLE-SEQUENTIAL-RESIZE: sequential Fit/Full
//   pointer borders preserve two narrow columns, their frame and exact
//   document bytes through tab adoption and a mode round trip.
//   CURRENT: 2026-11-10 C-STABILIZE-RICH-BOOT-BASELINES: wait for the
//   initial rich content revision before byte baselines; retain exact
//   Markdown/saved comparisons and all pointer/geometry oracles.
//   CURRENT: 2026-11-10 C-STABILIZE-AUTO-RESIZE-WRAP: preserve fixed Auto
//   wrapping through render/refit/tab reconciliation; require explicit frame
//   clamp and slack-growth preconditions with settled pointer geometry.
//   LAST_CHANGE: 2026-11-09 C-STABILIZE-PRODUCT-REPAIRS: accepted no-scroll Auto geometry and live body-border coordinates.
//   PREV: v1.4.0 - 2026-11-05 owner-smoke fix pin: widening a
//   column must carry the side walls to the table's new edges (a wall
//   left at the old edge read as an extra accent "fixed border" inside
//   the table; tableResize v3.0.3 repositions the walls on every
//   width-mutating path).
//   PREV: v1.3.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: the
//   overflow case drops the double toggle dance — Auto IS the in-column
//   wrapper-scroll mode now (the C-65 auto-expansion default and the
//   fake-fit pin it switched between are both retired), so a table dragged
//   wider than the column simply stays content-sized in Auto and the
//   wrapper scrolls.
//   PREV: v1.2.0 - 2026-10-20 C-TABLE-FOOTER: explicitly select Fit to page after the default expands a newly widened table; wait for the real scroll owner instead of racing the resize observer.
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
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    // Wait for the owned model blocks, without requiring a text revision on import.
    await expect.poll(() => page.evaluate(() => {
      const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
      return file?.blocks?.length ?? 0
    })).toBeGreaterThan(0)
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
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  }

  for (const mode of ['fit', 'full'] as const) {
    test(`${mode}: sequential fitted borders preserve two narrow columns`, async ({ page }) => {
      const markdown = TABLE_MD.replace('Alpha column', 'UnbreakableFirstColumnTokenForWrapping')
        .replace('Beta column', 'UnbreakableSecondColumnTokenForWrapping')
      await bootEditor(page)
      await openFileTab(page, RESIZE_PATH, markdown)
      await waitForTable(page)
      // Narrow headers can create a vertical scrollbar. Reserve its gutter
      // before measuring: this case tests a fixed frame on a fixed canvas.
      await page.locator('.editor-component:visible').evaluate(el => { (el as HTMLElement).style.overflowY = 'scroll' })
      await waitForTable(page)
      const canvasWidth = await page.locator('.editor-component:visible').evaluate(el => el.clientWidth)
      const figure = page.locator("figure[data-role='TABLE']").first()
      await figure.hover()
      await figure.locator(`button[data-table-mode='${mode}']`).click()
      await expect(figure).toHaveClass(mode === 'fit' ? /ag-table-fit/ : /ag-table-full-width/)
      const before = (await columnWidths(page))!
      const beforeMarkdown = await currentMarkdown(page)
      expect(await currentIsSaved(page)).toBe(true)
      expect(before[0]).toBeGreaterThan(100)
      expect(before[1]).toBeGreaterThan(100)

      await dragBorder(page, 0, 60 - before[0])
      const first = (await columnWidths(page))!
      expect(Math.abs(first[0] - 60)).toBeLessThanOrEqual(2)
      expect(Math.abs(first[2] - before[2]), 'the unrelated third column stays put').toBeLessThanOrEqual(2)
      await dragBorder(page, 1, 60 - first[1])
      const second = (await columnWidths(page))!
      expect(Math.abs(second[0] - 60), 'the first narrow column survives the second drag').toBeLessThanOrEqual(2)
      expect(Math.abs(second[1] - 60)).toBeLessThanOrEqual(2)
      expect(second[2]).toBeGreaterThan(first[2])
      expect(await page.locator('.editor-component:visible').evaluate(el => el.clientWidth), 'the canvas remains fixed').toBe(canvasWidth)
      expect(Math.abs(second.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0)), 'the outside frame is unchanged').toBeLessThanOrEqual(2)

      await openFileTab(page, PLAIN_PATH, PLAIN_MD)
      await page.locator('.tabs-container li', { hasText: 'column-resize.md' }).locator('span').first().click()
      await waitForTable(page)
      await figure.hover()
      await figure.locator(`button[data-table-mode='${mode === 'fit' ? 'full' : 'fit'}']`).click()
      await figure.locator(`button[data-table-mode='${mode}']`).click()
      await expect.poll(async () => {
        const widths = (await columnWidths(page))!
        const frame = await figure.evaluate((el, selectedMode) => {
          const wrapper = el.querySelector('.ag-table-scroll')!
          const style = getComputedStyle(wrapper)
          return (selectedMode === 'fit' ? el.clientWidth : wrapper.clientWidth) -
            parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1
        }, mode)
        const previousTotal = second.reduce((a, b) => a + b, 0)
        const expected = second.map(width => width * frame / previousTotal)
        // A vertical scrollbar can change Full's canvas across tabs. Keep
        // the chosen proportions in the actual frame, with the same 2px
        // per-column tolerance, and reject an underfilled/overflowing box.
        return Math.max(Math.abs(widths.reduce((a, b) => a + b, 0) - frame),
          ...widths.map((width, index) => Math.abs(width - expected[index])))
      }).toBeLessThanOrEqual(2)
      await expect(figure.locator('table')).toHaveClass(/ag-table-wrap-anywhere/)
      const overflow = await figure.locator('.ag-table-scroll').evaluate(el => el.scrollWidth - el.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
      expect(await currentMarkdown(page)).toBe(beforeMarkdown)
      expect(await currentIsSaved(page)).toBe(true)
    })
  }

  for (const mode of ['fit', 'full'] as const) {
    for (const surface of ['header', 'body'] as const) {
      test(`${mode} ${surface}: partial fitted reset stays inside the frame`, async ({ page }) => {
        await page.addInitScript(({ resizePath, plainPath }) => {
          const w = window as any
          // Tab adoption reads preferences and prunes confirmed-missing files.
          // Give this scenario the same saving transport as the persistence suite.
          const backing: Record<string, unknown> = Object.create(null)
          w.__fittedResetPrefs = backing
          w.__mockInvoke.mt_prefs_get = ({ key }: { key: string }) => backing[key] ?? null
          const save = ({ key, value }: { key: string; value: unknown }) => {
            backing[key] = JSON.parse(JSON.stringify(value))
            return null
          }
          w.__mockInvoke.mt_prefs_set = save
          w.__mockInvoke['mt::prefs::set'] = save
          w.__mockInvoke.mt_fs_stat = ({ path }: { path: string }) => {
            const isFile = [resizePath, plainPath].includes(path)
            return { isFile, isDirectory: false, is_file: isFile }
          }
        }, { resizePath: RESIZE_PATH, plainPath: PLAIN_PATH })
        await bootEditor(page)
        await openFileTab(page, RESIZE_PATH, TABLE_MD)
        await waitForTable(page)
        const figure = page.locator("figure[data-role='TABLE']").first()
        await figure.hover()
        await figure.locator(`button[data-table-mode='${mode}']`).click()
        const beforeMarkdown = await currentMarkdown(page)
        const initial = (await columnWidths(page))!
        await dragBorder(page, 0, 60 - initial[0])
        const first = (await columnWidths(page))!
        await dragBorder(page, 1, 60 - first[1])
        const narrow = (await columnWidths(page))!
        expect(Math.abs(narrow[0] - 60)).toBeLessThanOrEqual(2)
        expect(Math.abs(narrow[1] - 60)).toBeLessThanOrEqual(2)

        for (const index of [1, 0]) {
          const cell = figure.locator(surface === 'header' ? 'thead th' : 'tbody tr:first-child td').nth(index)
          const box = (await cell.boundingBox())!
          await page.mouse.dblclick(box.x + box.width, box.y + box.height / 2)
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
          const geometry = await figure.evaluate((el, selectedMode) => {
            const wrapper = el.querySelector('.ag-table-scroll') as HTMLElement
            const table = el.querySelector('table')!
            const style = getComputedStyle(wrapper)
            const frame = (selectedMode === 'fit' ? el.clientWidth : wrapper.clientWidth) -
              parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1
            return { frame, width: table.getBoundingClientRect().width,
              tail: wrapper.scrollWidth - wrapper.clientWidth,
              pageTail: document.documentElement.scrollWidth - document.documentElement.clientWidth }
          }, mode)
          expect(Math.abs(geometry.width - geometry.frame), JSON.stringify(geometry)).toBeLessThanOrEqual(2)
          expect(geometry.tail).toBeLessThanOrEqual(1)
          expect(geometry.pageTail).toBeLessThanOrEqual(1)
          await expect(figure).toHaveClass(mode === 'fit' ? /ag-table-fit/ : /ag-table-full-width/)
          expect(await currentMarkdown(page)).toBe(beforeMarkdown)
          expect(await currentIsSaved(page)).toBe(true)
        }
        const resetWidths = (await columnWidths(page))!
        await expect.poll(() => page.evaluate(path => {
          const entries = (window as any).__fittedResetPrefs.tableLayouts?.files?.[path] || {}
          return (Object.values(entries).find((entry: any) => Array.isArray(entry?.widths)) as any)?.mode
        }, RESIZE_PATH)).toBe(mode)
        await openFileTab(page, PLAIN_PATH, PLAIN_MD)
        await page.locator('.tabs-container li', { hasText: 'column-resize.md' }).locator('span').first().click()
        await waitForTable(page)
        await expect(figure).toHaveClass(mode === 'fit' ? /ag-table-fit/ : /ag-table-full-width/)
        await expect.poll(async () => {
          const adopted = (await columnWidths(page))!
          const frame = await figure.evaluate((el, selectedMode) => {
            const wrapper = el.querySelector('.ag-table-scroll')!
            const style = getComputedStyle(wrapper)
            return (selectedMode === 'fit' ? el.clientWidth : wrapper.clientWidth) -
              parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1
          }, mode)
          const resetTotal = resetWidths.reduce((a, b) => a + b, 0)
          return Math.max(Math.abs(adopted.reduce((a, b) => a + b, 0) - frame),
            ...adopted.map((width, i) => Math.abs(width - resetWidths[i] * frame / resetTotal)))
        }).toBeLessThanOrEqual(2)
        expect(await figure.locator('.ag-table-scroll').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
        expect(await currentMarkdown(page)).toBe(beforeMarkdown)
        expect(await currentIsSaved(page)).toBe(true)
      })
    }
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

    const frame = await page.locator("figure[data-role='TABLE']").first().evaluate(el => {
      const wrapper = el.querySelector('.ag-table-scroll')!
      const padding = getComputedStyle(wrapper)
      return el.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) - 1
    })
    expect(before!.reduce((sum, width) => sum + width, 0) + 120, 'this fixture has real room for un-clamped growth').toBeLessThan(frame)

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

  test('a wide Auto drag preserves wrapped fixed cells through tab reconciliation without scrolling', async ({ page }) => {
    const markdown = TABLE_MD.replace('Beta column', 'UnbreakableBetaColumnToken').replace('Gamma', 'UnbreakableGammaColumnToken')
    await bootEditor(page)
    await openFileTab(page, RESIZE_PATH, markdown)
    await waitForTable(page)
    const beforeMarkdown = await currentMarkdown(page)
    const beforeSaved = await currentIsSaved(page)
    await dragBorder(page, 0, 600)
    const figure = page.locator("figure[data-role='TABLE']").first()
    await expect(figure).not.toHaveClass(/ag-table-full-width/)

    const assertWrappedGeometry = async () => {
      await expect(figure.locator('table')).toHaveClass(/ag-table-wrap-anywhere/)
      const m = await figure.evaluate(el => {
        const wrapper = el.querySelector('.ag-table-scroll') as HTMLElement
        const table = wrapper.querySelector('table')!
        const page = document.querySelector('.editor-component')!
        return { columns: Array.from(table.querySelectorAll('thead th')).map(cell => cell.getBoundingClientRect().width),
          cells: Array.from(table.querySelectorAll('th,td')).map(cell => {
            const rect = cell.getBoundingClientRect()
            const content = cell.querySelector('.ag-cell-content')!
            const cr = content.getBoundingClientRect()
            return { text: cell.textContent, width: rect.width, scrollWidth: content.scrollWidth, clientWidth: content.clientWidth,
              contentInside: cr.left >= rect.left - 1 && cr.right <= rect.right + 1 }
          }), scrollWidth: wrapper.scrollWidth, clientWidth: wrapper.clientWidth,
          pageScrollWidth: page.scrollWidth, pageClientWidth: page.clientWidth }
      })
      expect(m.columns).toHaveLength(3)
      expect(m.columns.slice(1).every(width => Math.abs(width - 48) <= 1)).toBe(true)
      for (const cell of m.cells) {
        expect(cell.width, cell.text || 'cell').toBeGreaterThan(0)
        expect(cell.contentInside, cell.text || 'cell content inside').toBe(true)
        expect(cell.scrollWidth, cell.text || 'no editable content overflow').toBeLessThanOrEqual(cell.clientWidth + 1)
      }
      expect(m.scrollWidth, JSON.stringify(m)).toBeLessThanOrEqual(m.clientWidth + 1)
      expect(m.pageScrollWidth).toBeLessThanOrEqual(m.pageClientWidth + 1)
      expect(await currentMarkdown(page)).toBe(beforeMarkdown)
      expect(await currentIsSaved(page)).toBe(beforeSaved)
    }
    await assertWrappedGeometry()
    const widths = await columnWidths(page)
    // A real tab round-trip re-parses/adopts stored manual widths and runs
    // post-render reconciliation; a one-frame class check cannot pass it.
    await openFileTab(page, PLAIN_PATH, PLAIN_MD)
    await page.locator('.tabs-container li', { hasText: 'column-resize.md' }).click()
    await waitForTable(page)
    await expect.poll(() => columnWidths(page)).toEqual(widths)
    await assertWrappedGeometry()
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

  // Owner 2026-11-05: the column border must be draggable along the WHOLE
  // table height (like the side walls), not only inside the header row.
  test('dragging a border from the table BODY resizes the column (full-height walls)', async ({ page }) => {
    await openResizeTab(page)

    const wallsInfo = () => page.evaluate(() => {
      const wrap = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      const host = wrap?.querySelector('.ag-column-walls')
      const table = wrap?.querySelector('table') as HTMLTableElement | null
      if (!host || !table) return null
      const wrapRect = wrap.getBoundingClientRect()
      return {
        count: host.children.length,
        walls: Array.from(host.children).map((w) => ({
          index: (w as HTMLElement).dataset.columnWallIndex,
          left: (w as HTMLElement).style.left,
          rectH: Math.round((w as HTMLElement).getBoundingClientRect().height)
        })),
        tableH: Math.round(table.getBoundingClientRect().height),
        // First internal border (Alpha|Beta) in viewport coordinates.
        borderX: Math.round(table.tHead.rows[0].cells[0].getBoundingClientRect().right)
      }
    })

    // Zones appear after the first fixed-width application.
    await dragBorder(page, 0, 40)
    let info = await wallsInfo()
    expect(info).not.toBeNull()
    expect(info!.count, 'N-1 full-height walls').toBe(2)
    // Zones cover the actual table height, beyond the header.
    for (const w of info!.walls) {
      expect(w.rectH).toBeGreaterThanOrEqual(info!.tableH - 2)
    }

    // Drag from the body at the Alpha|Beta border.
    const before = await columnWidths(page)
    const cell = page.locator("figure[data-role='TABLE'] tbody tr td").nth(0)
    const box = await cell.boundingBox()
    expect(box).not.toBeNull()
    const bodyMidY = box!.y + box!.height // Second body row, below the header.
    const tableBox = await page.locator("figure[data-role='TABLE'] table").first().boundingBox()
    const thBox = await page.locator("figure[data-role='TABLE'] thead th").nth(0).boundingBox()
    const borderX = thBox!.x + thBox!.width
    const y = Math.min(tableBox!.y + tableBox!.height - 8, bodyMidY + 20)
    await page.mouse.move(borderX, y)
    await page.mouse.down()
    await page.mouse.move(borderX + 60, y, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    const after = await columnWidths(page)
    expect(Math.abs(after![0] - (before![0] + 60)), 'body-level drag must resize the column').toBeLessThanOrEqual(2)

    // Double-clicking the body border fits the column to its content
    // (owner decision 2026-11-05: retain and document this behavior).
    const widened = await columnWidths(page)
    const resetBorder = await page.locator("figure[data-role='TABLE'] thead th").first().boundingBox()
    await page.mouse.dblclick(resetBorder.x + resetBorder.width, y)
    await page.waitForTimeout(300)
    const reset = await columnWidths(page)
    expect(reset).not.toBeNull()
    expect(reset![0]).toBeLessThan(widened![0])
  })

  // Owner smoke 2026-11-05: widening columns left the right side-wall at
  // the OLD table edge — an extra accent "fixed border" inside the table.
  // The walls must ride the table's edges through every width change.
  test('a widened table carries its side walls to the new edges', async ({ page }) => {
    await openResizeTab(page)

    const wallVsEdges = () => page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
      const table = figure?.querySelector('table') as HTMLTableElement | null
      if (!figure || !table) return null
      const fr = figure.getBoundingClientRect()
      const tr = table.getBoundingClientRect()
      const walls = Array.from(figure.querySelectorAll('.ag-table-wall')).map((w) => ({
        side: (w as HTMLElement).dataset.tableWallSide,
        left: parseFloat((w as HTMLElement).style.left)
      }))
      return {
        tableLeft: Math.round(tr.left - fr.left),
        tableRight: Math.round(tr.right - fr.left),
        walls
      }
    })

    // In Auto the walls sit on the content-sized table's edges.
    const before = await wallVsEdges()
    expect(before).not.toBeNull()
    expect(before!.walls.length).toBe(2)

    await dragBorder(page, 1, 120)
    await page.waitForTimeout(300)

    const after = await wallVsEdges()
    expect(after).not.toBeNull()
    const leftWall = after!.walls.find((w) => w.side === 'left')
    const rightWall = after!.walls.find((w) => w.side === 'right')
    expect(leftWall, 'the left wall must exist').toBeTruthy()
    expect(rightWall, 'the right wall must exist').toBeTruthy()
    expect(Math.abs(leftWall!.left - after!.tableLeft),
      'the left wall must sit on the table edge after the drag').toBeLessThanOrEqual(2)
    expect(Math.abs(rightWall!.left - after!.tableRight),
      'the right wall must follow the widened table edge (not stay at the old one)').toBeLessThanOrEqual(2)
  })
})
