// FILE: tests/e2e/table-toolbar.spec.ts
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-65 T-002 table toolbar and the T-004 Full width mode in the built renderer — the pill appears ABOVE the table on hover (and on keyboard focus within the figure), its right edge on the text-column edge, hidden while the caret is inside the table, the standalone glyph gone, the Open-full-screen action need-gated; Full width lays the table out from the editor's left edge with the editor scrolling horizontally while the toolbar and caption stay on the column edge, and Fit to page returns the wrapper scroll.
//   SCOPE: renderTableToolbar.js + renderContainerBlock START_BLOCK_TABLE_TOOLBAR_AND_CAPTION, the C-65 CSS section of src/muya/lib/assets/styles/index.css, and the TableResize toggle/geometry/cue paths.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim, ./fixtures/helpers (bootEditor/openFileTab), the built renderer served by `npm run preview`; runs in the chromium project and the webkit-tables project.
//   LINKS: .grace/changes/active/C-65 T-002/T-004; .grace/verification/runtime.xml V-M-012 scenario-66; unit twins tests/renderer/muya/table-cue.test.js + table-layout-persistence.test.js; persistence e2e table-width-persistence.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   wideHeader/wideRow/WIDE_18COL_MD - an 18-column fixture wider than the window in Full width mode.
//   NARROW_MD - a 2x2 fixture (the no-need / no-cue corner).
//   DOC_PATH - test helper (DOC_PATH).
//   WIDE_18COL_MD - test helper (WIDE_18COL_MD).
//   wideHeader - test helper (wideHeader).
//   wideRow - test helper (wideRow).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.1 - 2026-10-19 orchestrator review: fixed against real runs (async polls, reload-safe fakes, selectors).
//   v1.0.0 - 2026-10-18 C-65: new — every case fails without
//   the toolbar vnode/CSS (no pill), the need gate pin fails if the expand
//   button loses the family gate, and the full-width cases fail without
//   the breakout (no editor scrollbar) or the cue («all N columns»).
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC_PATH = '/tmp/mark-e2e/table-toolbar.md'

const wideHeader = Array.from({ length: 18 }, (_, i) => `Column ${String(i + 1).padStart(2, '0')}`).join(' | ')
const wideRow = (tag: string) => Array.from({ length: 18 }, (_, i) => `${tag} payload ${i + 1}`).join(' | ')
const WIDE_18COL_MD = `# Wide Table

| ${wideHeader} |
| ${Array.from({ length: 18 }, () => '---').join(' | ')} |
| ${wideRow('alpha')} |
| ${wideRow('beta')} |

Text after the table.
`

const NARROW_MD = `# Narrow Table

| A | B |
| --- | --- |
| one | two |

Text after the table.
`

test.describe('table toolbar + full width (C-65 T-002/T-004)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  async function openDoc(page: Page, markdown: string) {
    await bootEditor(page)
    await openFileTab(page, DOC_PATH, markdown)
    const wrapper = page.locator("figure[data-role='TABLE'] div.ag-table-scroll").first()
    await wrapper.waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator("figure[data-role='TABLE'] table").first()
      .waitFor({ state: 'visible', timeout: 10_000 })
    return wrapper
  }

  // Geometry of the first table figure: toolbar box vs the table and the
  // column edge, the caption box, the editor scroller overflow.
  const geometry = (page: Page) => page.evaluate(() => {
    const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
    const toolbar = figure.querySelector('div.ag-block-toolbar.ag-table-toolbar') as HTMLElement | null
    const wrapper = figure.querySelector('div.ag-table-scroll') as HTMLElement
    const table = figure.querySelector('table') as HTMLElement
    const caption = figure.querySelector('div.ag-table-caption') as HTMLElement
    const editor = document.querySelector('#ag-editor-id') as HTMLElement
    const scroller = document.querySelector('.editor-component') as HTMLElement
    if (!figure || !toolbar || !wrapper || !table || !caption || !editor || !scroller) return null
    const editorStyle = window.getComputedStyle(editor)
    const editorRect = editor.getBoundingClientRect()
    const toolbarRect = toolbar.getBoundingClientRect()
    const tableRect = table.getBoundingClientRect()
    return {
      columnRight: editorRect.right - parseFloat(editorStyle.paddingRight || '0'),
      scrollerLeft: scroller.getBoundingClientRect().left,
      toolbarRight: toolbarRect.right,
      toolbarBottom: toolbarRect.bottom,
      toolbarTop: toolbarRect.top,
      tableTop: tableRect.top,
      tableLeft: tableRect.left,
      captionRight: caption.getBoundingClientRect().right,
      captionText: caption.textContent || '',
      scrollerScrollWidth: scroller.scrollWidth,
      scrollerClientWidth: scroller.clientWidth,
      wrapperScrollWidth: wrapper.scrollWidth,
      wrapperClientWidth: wrapper.clientWidth,
      figureFullWidth: figure.classList.contains('ag-table-full-width'),
      computedOverflowX: window.getComputedStyle(wrapper).overflowX
    }
  })

  const toolbarState = (page: Page) => page.evaluate(() => {
    const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
    const toolbar = figure.querySelector('div.ag-block-toolbar.ag-table-toolbar') as HTMLElement
    const toggle = toolbar.querySelector('button.ag-table-toolbar-toggle') as HTMLElement
    const expand = toolbar.querySelector('button.ag-block-toolbar-expand') as HTMLElement
    return {
      opacity: window.getComputedStyle(toolbar).opacity,
      display: window.getComputedStyle(toolbar).display,
      figureActive: figure.classList.contains('ag-active'),
      toggleLabel: (toggle.querySelector('span.ag-block-toolbar-label') as HTMLElement).textContent,
      toggleTitle: toggle.title,
      toggleActive: toggle.classList.contains('ag-table-toolbar-active'),
      expandDisplay: window.getComputedStyle(expand).display
    }
  })

  test('the toolbar sits above the table with its right edge on the text-column edge, revealed on hover', async ({ page }) => {
    await openDoc(page, WIDE_18COL_MD)

    // Rest: invisible (hover-revealed, never a permanent fixture).
    const rest = await toolbarState(page)
    expect(rest.opacity).toBe('0')
    // The need gate keeps the expand action on wide tables…
    expect(rest.expandDisplay).not.toBe('none')
    expect(rest.toggleLabel).toBe('Full width')
    expect(rest.toggleActive).toBe(false)

    // Hover over the table reveals the pill.
    await page.locator("figure[data-role='TABLE'] table").first().hover()
    // The reveal is a 150 ms opacity transition — poll, never sample once.
    await expect.poll(async () => (await toolbarState(page)).opacity).toBe('1')
    const hovered = await toolbarState(page)

    // Placement: ABOVE the table (never over its middle), right edge on
    // the column edge (±1px).
    const g = await geometry(page)
    expect(g!.toolbarBottom).toBeLessThanOrEqual(g!.tableTop + 2)
    expect(g!.toolbarTop).toBeLessThan(g!.tableTop)
    expect(Math.abs(g!.toolbarRight - g!.columnRight)).toBeLessThanOrEqual(1)
    // The caption shares the same edge anchor.
    expect(Math.abs(g!.captionRight - g!.columnRight)).toBeLessThanOrEqual(1)

    // Keyboard focus within the figure reveals it too (focus-within).
    await page.evaluate(() => {
      document.querySelector("figure[data-role='TABLE'] button.ag-table-toolbar-toggle")!.focus()
    })
    const focused = await toolbarState(page)
    expect(focused.opacity).toBe('1')
  })

  test('a narrow table: no cue, the expand action stays need-gated, the toggle still works', async ({ page }) => {
    await openDoc(page, NARROW_MD)

    const rest = await toolbarState(page)
    expect(rest.expandDisplay).toBe('none')
    expect(rest.toggleLabel).toBe('Full width')
    const g = await geometry(page)
    expect(g!.captionText).toBe('')
  })

  test('the caret inside the table hides the toolbar (ag-active)', async ({ page }) => {
    await openDoc(page, WIDE_18COL_MD)

    const cell = page.locator("figure[data-role='TABLE'] tbody tr td").first()
    const box = await cell.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + 10, box!.y + box!.height / 2)

    // ag-active hides the pill outright (display:none), like diagrams.
    await expect.poll(async () => {
      const st = await toolbarState(page)
      return { active: st.figureActive, hidden: st.display === 'none' || st.opacity === '0' }
    }).toEqual({ active: true, hidden: true })
  })

  test('Full width: natural width from the editor\'s left edge, the editor scrolls, the cue reads «all N columns»', async ({ page }) => {
    await openDoc(page, WIDE_18COL_MD)

    // Hover the table and click the toggle.
    const tableBox = await page.locator("figure[data-role='TABLE'] table").first().boundingBox()
    expect(tableBox).not.toBeNull()
    await page.mouse.move(tableBox!.x + tableBox!.width / 2, tableBox!.y + tableBox!.height / 2)
    const toggleBox = await page.locator("figure[data-role='TABLE'] button.ag-table-toolbar-toggle").boundingBox()
    expect(toggleBox).not.toBeNull()
    await page.mouse.click(toggleBox!.x + toggleBox!.width / 2, toggleBox!.y + toggleBox!.height / 2)

    const g = await geometry(page)
    expect(g!.figureFullWidth).toBe(true)
    // The table starts at the editor area's left edge…
    expect(Math.abs(g!.tableLeft - g!.scrollerLeft)).toBeLessThanOrEqual(2)
    // …and is wider than the window: the EDITOR scroller owns the scrollbar.
    expect(g!.scrollerScrollWidth).toBeGreaterThan(g!.scrollerClientWidth + 100)
    expect(g!.computedOverflowX).toBe('visible')
    // The toolbar and the caption stay on the text-column edge.
    expect(Math.abs(g!.toolbarRight - g!.columnRight)).toBeLessThanOrEqual(1)
    expect(Math.abs(g!.captionRight - g!.columnRight)).toBeLessThanOrEqual(1)
    // The caption reads «all N columns» and no shade is painted.
    expect(g!.captionText).toBe('all 18 columns')
    const shades = await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      return {
        left: wrapper.classList.contains('ag-table-cue-left'),
        right: wrapper.classList.contains('ag-table-cue-right')
      }
    })
    expect(shades.left).toBe(false)
    expect(shades.right).toBe(false)

    // The button flipped to the active «Fit to page» state.
    const state = await toolbarState(page)
    expect(state.toggleLabel).toBe('Fit to page')
    expect(state.toggleTitle).toBe('Fit to page')
    expect(state.toggleActive).toBe(true)

    // Scrolling the editor right reveals the last columns (the window
    // scrolls horizontally — corner-8).
    const revealed = await page.evaluate(() => {
      const scroller = document.querySelector('.editor-component') as HTMLElement
      scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth
      const last = document.querySelector("figure[data-role='TABLE'] thead th:last-child") as HTMLElement
      const scrollerRect = scroller.getBoundingClientRect()
      const lastRect = last.getBoundingClientRect()
      return { scrollLeft: scroller.scrollLeft, lastRight: lastRect.right, scrollerRight: scrollerRect.right }
    })
    expect(revealed.scrollLeft).toBeGreaterThan(100)
    expect(Math.abs(revealed.lastRight - revealed.scrollerRight)).toBeLessThanOrEqual(400)
  })

  test('Fit to page returns the wrapper scroll and the range caption', async ({ page }) => {
    await openDoc(page, WIDE_18COL_MD)

    const tableBox = await page.locator("figure[data-role='TABLE'] table").first().boundingBox()
    await page.mouse.move(tableBox!.x + tableBox!.width / 2, tableBox!.y + tableBox!.height / 2)
    const toggle = page.locator("figure[data-role='TABLE'] button.ag-table-toolbar-toggle")
    const toggleBox = await toggle.boundingBox()
    await page.mouse.click(toggleBox!.x + toggleBox!.width / 2, toggleBox!.y + toggleBox!.height / 2)
    expect((await geometry(page))!.figureFullWidth).toBe(true)

    // Fit back.
    const toggleBox2 = await toggle.boundingBox()
    await page.mouse.move(toggleBox2!.x + toggleBox2!.width / 2, toggleBox2!.y + toggleBox2!.height / 2)
    await page.mouse.click(toggleBox2!.x + toggleBox2!.width / 2, toggleBox2!.y + toggleBox2!.height / 2)

    const g = await geometry(page)
    expect(g!.figureFullWidth).toBe(false)
    expect(g!.computedOverflowX).toBe('auto')
    expect(g!.wrapperScrollWidth).toBeGreaterThan(g!.wrapperClientWidth)
    expect(g!.scrollerScrollWidth).toBeLessThanOrEqual(g!.scrollerClientWidth + 1)
    expect(g!.captionText).toMatch(/^columns 1–\d+ of 18$/)
    const state = await toolbarState(page)
    expect(state.toggleLabel).toBe('Full width')
    expect(state.toggleActive).toBe(false)
  })

  test('Open full screen opens the shared block viewer', async ({ page }) => {
    await openDoc(page, WIDE_18COL_MD)

    const tableBox = await page.locator("figure[data-role='TABLE'] table").first().boundingBox()
    await page.mouse.move(tableBox!.x + tableBox!.width / 2, tableBox!.y + tableBox!.height / 2)
    const expand = page.locator("figure[data-role='TABLE'] button.ag-table-toolbar-expand")
    const expandBox = await expand.boundingBox()
    expect(expandBox).not.toBeNull()
    await page.mouse.click(expandBox!.x + expandBox!.width / 2, expandBox!.y + expandBox!.height / 2)

    await page.locator('.ag-block-viewer.ag-block-viewer-open').waitFor({ state: 'visible', timeout: 5_000 })
    const title = await page.evaluate(() =>
      (document.querySelector('.ag-block-viewer-title') as HTMLElement).textContent
    )
    expect(title).toBe('Table')
    await page.keyboard.press('Escape')
    await page.locator('.ag-block-viewer.ag-block-viewer-open').waitFor({ state: 'hidden', timeout: 5_000 })
  })
})
