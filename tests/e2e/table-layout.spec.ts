// FILE: tests/e2e/table-layout.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin C-39 T-001 default table rendering in the built renderer: wide tables scroll inside the text column with edge-shadow backgrounds, narrow tables keep content width, long URLs are capped at ~40ch, and editing works after horizontal scrolling.
//   SCOPE: The div.ag-table-scroll wrapper (renderContainerBlock START_BLOCK_TABLE_SCROLL_WRAPPER) and the C-39 CSS section in src/muya/lib/assets/styles/index.css.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim, the built renderer served by `npm run preview`.
//   LINKS: .grace/changes/active/C-39 T-001; .grace/verification/runtime.xml V-M-012 scenario-18; unit structure twin tests/renderer/muya/table-scroll-wrapper.test.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   bootstrapWithMarkdown - boots the editor with a markdown document (mermaid-render.spec.ts setup).
//   WIDE_15COL_MD / NARROW_2X2_MD / LONG_URL_MD / EDIT_AFTER_SCROLL_MD - table fixtures.
//   measureTable - editor/wrapper/table geometry + computed wrap/shadow styles from the live DOM.
//   waitForTable - waits for the ag-table-scroll wrapper to mount.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-39 T-001: scroll-vs-overflow, column containment, no page-level horizontal scroll, narrow content width, 40ch URL cap, caret lands in a scrolled-to cell; all except the narrow-table case fail without the wrapper + C-39 CSS.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

// 15 columns with multi-word content: natural (max-content) width is far
// beyond the ~650px text column, so the wrapper must scroll.
const wideHeader = Array.from({ length: 15 }, (_, i) => `Column ${String(i + 1).padStart(2, '0')}`).join(' | ')
const wideRow = (tag: string) => Array.from({ length: 15 }, (_, i) => `${tag} payload ${i + 1}`).join(' | ')
const WIDE_15COL_MD = `# Wide Table

| ${wideHeader} |
| ${Array.from({ length: 15 }, () => '---').join(' | ')} |
| ${wideRow('alpha')} |
| ${wideRow('beta')} |

Text after the table.
`

const NARROW_2X2_MD = `# Narrow Table

| A | B |
| --- | --- |
| one | two |

Text after the table.
`

const LONG_URL = 'https://example.com/auction/items/' + '0'.repeat(200 - 'https://example.com/auction/items/'.length)
const LONG_URL_MD = `# Long URL Table

| Link |
| --- |
| ${LONG_URL} |

Text after the table.
`

const EDIT_AFTER_SCROLL_MD = `# Edit After Scroll

| ${wideHeader} |
| ${Array.from({ length: 15 }, () => '---').join(' | ')} |
| ${wideRow('cell')} |

Text after the table.
`

test.describe('table layout (C-39 T-001)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  async function bootstrapWithMarkdown(page: Page, markdown: string, theme = 'light') {
    await page.addInitScript((t: string) => {
      ;(window as any).__mockInvoke = {
        ...(window as any).__mockInvoke,
        mt_prefs_get_all: () => ({
          theme: t,
          autoSave: false,
          autoSaveDelay: 5000,
          titleBarStyle: 'custom',
          openFilesInNewWindow: false,
          openFolderInNewWindow: false,
          hideScrollbar: false,
          sideBarVisibility: false,
          tabBarVisibility: false,
          sourceCodeModeEnabled: false,
          searchExclusions: [],
          searchMaxFileSize: '',
          searchIncludeHidden: false,
          searchNoIgnore: false,
          searchFollowSymlinks: false,
          watcherUsePolling: false,
          spellcheckerEnabled: false,
          spellcheckerNoUnderline: false,
          spellcheckerLanguage: 'en-US',
          language: 'en',
          endOfLine: 'default',
          textDirection: 'ltr',
          codeFontSize: '14px',
          codeFontFamily: 'DejaVu Sans Mono',
          editorFontFamily: 'Open Sans',
          fontSize: 16,
          editorLineWidth: '',
          listIndentation: 1,
          frontmatterType: '-',
          followSystemTheme: false,
          lightModeTheme: 'light',
          darkModeTheme: 'dark',
          customCss: '',
          bulletListMarker: '-',
          orderListDelimiter: '.',
          preferLooseListItem: true,
          tabSize: 4,
          lineHeight: 1.6,
          fontWeight: 'normal',
          trimUnnecessaryCodeBlockEmptyLines: false,
          sequenceTheme: 'hand'
        })
      }
    }, theme)

    await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')

    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
      return false
    }, undefined, { timeout: 15_000 })

    await page.evaluate((md: string) => {
      ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
        addBlankTab: false,
        markdownList: [md],
        lineEnding: 'lf',
        sideBarVisibility: false,
        tabBarVisibility: false,
        sourceCodeModeEnabled: false
      })
    }, markdown)
  }

  async function waitForTable(page: Page) {
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const wrapper = page.locator("figure[data-role='TABLE'] div.ag-table-scroll").first()
    await wrapper.waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator("figure[data-role='TABLE'] table").first()
      .waitFor({ state: 'visible', timeout: 10_000 })
    return wrapper
  }

  const measureTable = (page: Page) => page.evaluate(() => {
    const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement | null
    const table = document.querySelector("figure[data-role='TABLE'] table") as HTMLElement | null
    const editor = document.querySelector('#ag-editor-id') as HTMLElement | null
    const editorScroller = document.querySelector('.editor-component') as HTMLElement | null
    if (!wrapper || !table || !editor || !editorScroller) return null
    const editorStyle = window.getComputedStyle(editor)
    const editorRect = editor.getBoundingClientRect()
    return {
      overflowX: window.getComputedStyle(wrapper).overflowX,
      backgroundAttachment: window.getComputedStyle(wrapper).backgroundAttachment,
      clientWidth: wrapper.clientWidth,
      scrollWidth: wrapper.scrollWidth,
      wrapperRight: wrapper.getBoundingClientRect().right,
      tableWidth: table.getBoundingClientRect().width,
      tableRight: table.getBoundingClientRect().right,
      // The text column is the editor content box (editor padding is 50px).
      columnRight: editorRect.right - parseFloat(editorStyle.paddingRight || '0'),
      columnWidth: editor.clientWidth - parseFloat(editorStyle.paddingLeft || '0') - parseFloat(editorStyle.paddingRight || '0'),
      pageScrollWidth: editorScroller.scrollWidth,
      pageClientWidth: editorScroller.clientWidth
    }
  })

  test('a 15-column table scrolls horizontally inside the text column', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_15COL_MD)
    await waitForTable(page)

    const m = await measureTable(page)
    expect(m).not.toBeNull()

    // The wrapper is the scroll container.
    expect(m!.overflowX).toBe('auto')
    // The natural table width exceeds the wrapper viewport.
    expect(m!.scrollWidth, 'wide table must overflow its scroll wrapper').toBeGreaterThan(m!.clientWidth)
    // ... but the visible surface stays inside the text column.
    expect(m!.wrapperRight, 'wrapper right edge must not exceed the editor column').toBeLessThanOrEqual(m!.columnRight + 1)
    // No horizontal scrollbar at the page level (pre-C-39 the table
    // overflowed the editor column visibly).
    expect(m!.pageScrollWidth).toBeLessThanOrEqual(m!.pageClientWidth + 1)
    // Edge shadows: two covers track the content (local), two shadows are
    // pinned to the scrollport — pure CSS, no listeners.
    expect(m!.backgroundAttachment).toBe('local, local, scroll, scroll')
    // The horizontal scrollbar stays thin (WebKit draws a 15px classic bar
    // without the ::-webkit-scrollbar height rule).
    const scrollbar = await page.evaluate(() => {
      const w = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      return w.offsetHeight - w.clientHeight
    })
    expect(scrollbar, 'horizontal scrollbar must be thin').toBeLessThanOrEqual(8)
  })

  test('a 2x2 table keeps content width and does not scroll', async ({ page }) => {
    await bootstrapWithMarkdown(page, NARROW_2X2_MD)
    await waitForTable(page)

    const m = await measureTable(page)
    expect(m).not.toBeNull()

    expect(m!.tableWidth, 'narrow table must keep its content width').toBeLessThan(m!.columnWidth - 200)
    expect(Math.abs(m!.scrollWidth - m!.clientWidth)).toBeLessThanOrEqual(1)
  })

  test('a 200-character URL cell is capped at ~40ch and wraps', async ({ page }) => {
    await bootstrapWithMarkdown(page, LONG_URL_MD)
    await waitForTable(page)

    const info = await page.evaluate(() => {
      const td = document.querySelector("figure[data-role='TABLE'] tbody td") as HTMLElement | null
      if (!td) return null
      // Measure 40ch in the very font of the cell.
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:40ch'
      td.appendChild(probe)
      const cap = probe.getBoundingClientRect().width
      probe.remove()
      return {
        wrap: window.getComputedStyle(td).overflowWrap,
        width: td.getBoundingClientRect().width,
        cap,
        height: td.getBoundingClientRect().height,
        lineHeight: window.getComputedStyle(td).lineHeight
      }
    })
    expect(info).not.toBeNull()

    expect(info!.wrap).toBe('anywhere')
    // 26px cell padding (6px 13px) + rounding allowance; the URL itself is
    // ~200ch, so anything near the cap proves the wrap kicked in.
    expect(info!.width).toBeLessThanOrEqual(info!.cap + 30)
    const lh = parseFloat(info!.lineHeight)
    const linePx = Number.isFinite(lh) && lh > 0 ? lh : 20
    expect(info!.height / linePx, 'the URL must wrap onto several lines').toBeGreaterThan(1.5)

    const m = await measureTable(page)
    expect(m!.tableRight).toBeLessThanOrEqual(m!.columnRight + 1)
  })

  test('clicking a cell after scrolling right places the caret in that cell', async ({ page }) => {
    await bootstrapWithMarkdown(page, EDIT_AFTER_SCROLL_MD)
    await waitForTable(page)

    // Scroll the wrapper fully to the right, outside of Playwright's
    // actionability scrolling (mouse.click at coordinates never scrolls).
    await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      wrapper.scrollLeft = wrapper.scrollWidth - wrapper.clientWidth
    })

    const lastCell = page.locator("figure[data-role='TABLE'] tbody tr td:last-child").first()
    const box = await lastCell.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + 10, box!.y + box!.height / 2)

    await page.keyboard.type('Z')

    const cellText = await page.evaluate(() => {
      const td = document.querySelector("figure[data-role='TABLE'] tbody tr td:last-child") as HTMLElement | null
      return td ? td.textContent : null
    })
    expect(cellText, 'typing must land inside the scrolled-to cell').toContain('Z')
  })

  test('typing in a scrolled table keeps the horizontal scroll position', async ({ page }) => {
    await bootstrapWithMarkdown(page, EDIT_AFTER_SCROLL_MD)
    await waitForTable(page)

    // Scroll so a middle column is in view, then edit a cell in that column.
    const before = await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      const cell = document.querySelector("figure[data-role='TABLE'] tbody tr td:nth-child(8)") as HTMLElement
      wrapper.scrollLeft = cell.offsetLeft - 40
      return wrapper.scrollLeft
    })
    expect(before).toBeGreaterThan(100)

    const cell = page.locator("figure[data-role='TABLE'] tbody tr td:nth-child(8)").first()
    const box = await cell.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + 10, box!.y + box!.height / 2)
    await page.keyboard.type('abc')

    const after = await page.evaluate(() =>
      (document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement).scrollLeft
    )
    expect(Math.abs(after - before), 'the table must not jump back to its first column while typing').toBeLessThan(20)
  })
})
