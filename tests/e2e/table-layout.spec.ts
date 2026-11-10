// FILE: tests/e2e/table-layout.spec.ts
// VERSION: 1.12.1
// START_MODULE_CONTRACT
//   PURPOSE: Pin C-39 T-001 default table rendering in the built renderer (wide tables fit every column without internal scrolling, narrow tables keep content width, long URLs wrap, fitted cells remain editable), the absence of obsolete clipped-column cues, and the real-pointer Full width/Fit transition, sibling viewer availability, reverse action, and persistence across sidebar visibility changes.
//   SCOPE: The div.ag-table-scroll wrapper (renderContainerBlock START_BLOCK_TABLE_SCROLL_WRAPPER), the C-39 CSS section and the C-65 cue section of src/muya/lib/assets/styles/index.css, lib/tableResize/tableCue.js, C-TABLE-FIT-PERSISTENCE's pointer/sidebar/reopen boundary, and C-TABLE-NATIVE-TOOLBAR-DELIVERY's sidebar-hidden/sidebar-visible action matrix.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim, the built renderer served by `npm run preview`.
//   LINKS: .grace/changes/active/C-39 T-001; .grace/changes/active/C-65 T-003; .grace/verification/runtime.xml V-M-012 scenario-18 and scenario-66; unit structure twin tests/renderer/muya/table-scroll-wrapper.test.js + table-cue.test.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   wideHeader - builds the header row of the 15-column fixture.
//   wideRow - builds one body row of the 15-column fixture.
//   WIDE_15COL_MD - 15-column fixture with a reserved counter/scrollbar footer inside the scroll block.
//   NARROW_2X2_MD - 2x2 table fixture.
//   LONG_URL - a 200-character URL.
//   LONG_URL_MD - table fixture with LONG_URL in a body cell.
//   EDIT_AFTER_SCROLL_MD - wide table used for fitted-cell editing.
//   C-TABLE-FIT-PERSISTENCE/C-TABLE-NATIVE-TOOLBAR-DELIVERY scenario - real pointer activation, sibling viewer reveal, reverse action, live sidebar on/off, persisted fit payload and reopen.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-10 C-STABILIZE-RICH-BOOT-BASELINES: wait for the
//   initial rich content revision before byte baselines; retain exact
//   Markdown/saved comparisons and all pointer/geometry oracles.
//   CURRENT: 2026-11-10 C-STABILIZE-TABLE-E2E: verify accepted no-scroll
//   fitting/icon-only controls together with natural-size viewer access, real
//   pointer/keyboard interactions and preserved document/dirty semantics.
//   LAST_CHANGE: 1.12.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: the mode default and the fit-persistence case move to the honest three-mode model (T-007): Auto is the in-column wrapper-scroll mode, the toolbar carries the three-button segment, and the stored choice persists as the schema-v2 mode field.
//   LAST_CHANGE: v1.11.0 - 2026-10-20 C-TABLE-NATIVE-TOOLBAR-DELIVERY:
//   reproduce the native stale-adoption path by persisting Full width,
//   reopening so that entry is adopted, and only then clicking Fit; the
//   old persist() immediately re-adopted Full width and failed this step.
//   PREV: v1.10.0 - 2026-10-20 C-TABLE-NATIVE-TOOLBAR-DELIVERY:
//   the real-pointer matrix now opens and closes the sibling table viewer,
//   proving that the shared action route serves both toolbar actions.
//   PREV: v1.9.0 - 2026-10-20 C-TABLE-NATIVE-TOOLBAR-DELIVERY:
//   sidebar-hidden and sidebar-visible native parity now includes the
//   sibling viewer reveal plus Full width → Fit → Full width → Fit actions.
//   PREV: v1.8.0 - 2026-10-20 C-TABLE-FIT-PERSISTENCE native
//   follow-up: use a real pointer click and keep the Full width action
//   visible and state-stable while the sidebar opens/closes and after reopen.
//   PREV: v1.7.0 - 2026-10-20 C-TABLE-FIT-PERSISTENCE: Full
//   width → Fit to page flips the mode and label in the same tick, saves
//   the fit flag through the host prefs path, and survives reopening the
//   document (path-aware stat mock: the file exists, no `.before`
//   sidecar).
//   PREV: v1.6.0 - 2026-10-20 C-TABLE-FOOTER: counter remains inside its wrapper and fitting tables retain an invisible footer.
//   v1.5.0 - 2026-10-19 Full width is the default for wide tables: the C-39 wrapper-scroll cases first choose «Fit to page» (fitToPage); a new case pins the default itself.
//   v1.4.1 - 2026-10-19 orchestrator review: fixed against real runs (async polls, reload-safe fakes, selectors).
//   v1.4.0 - 2026-10-18 C-65 T-003: the shade pins moved from
//   the C-39 cover-gradient backgrounds (backgroundAttachment) to the
//   class-gated cue (ag-table-cue-left/right), and the caption joined the
//   pin: «columns 1–N of 15» at the start, a live range in the middle,
//   none for a table that fits; the caption is right-aligned on the
//   text-column edge.
//   v1.3.0 - 2026-10-18 fix: the wide table's scroll container ends above the next block (the 30 px negative bottom margin painted the scrollbar over the following heading).
//   v1.2.0 - 2026-10-15 C-39: narrow tables are centred in the text column (equal side gaps; fails with 0px left gap without margin-inline:auto).
//   v1.1.0 - 2026-10-15 C-39 review: typing in a scrolled table keeps the horizontal scroll (fails at 559px without render/index.js START_BLOCK_TABLE_SCROLL_KEEP); the scrollbar under a wide table stays thin (fails at 17px in WebKit without the ::-webkit-scrollbar rule).
//   v1.0.0 - 2026-10-15 C-39 T-001: scroll-vs-overflow, column containment, no page-level horizontal scroll, narrow content width, 40ch URL cap, caret lands in a scrolled-to cell; all except the narrow-table case fail without the wrapper + C-39 CSS.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { openFileTab } from './fixtures/helpers'

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

  // Auto retains content sizing for narrow tables and fits wide content.
  async function stayInAuto(page: Page) {
    await page.evaluate(() => {
      for (const button of document.querySelectorAll(
        "figure[data-role='TABLE'] button.ag-table-toolbar-mode[data-table-mode='auto']"
      )) {
        if (!(button as HTMLElement).classList.contains('ag-table-toolbar-active')) {
          (button as HTMLElement).click()
        }
      }
    })
    await page.waitForTimeout(300)
  }

  async function expectAllColumnsVisible(page: Page, columns: number) {
    const geometry = await page.locator("figure[data-role='TABLE'] div.ag-table-scroll").first().evaluate(el => {
      const bounds = el.getBoundingClientRect()
      const table = el.querySelector('table')!
      return { columns: table.querySelectorAll('thead th').length,
        cells: Array.from(table.querySelectorAll('th,td')).map(cell => {
          const r = cell.getBoundingClientRect()
          return { text: cell.textContent, width: r.width, inside: r.left >= bounds.left - 1 && r.right <= bounds.right + 1 }
        }) }
    })
    expect(geometry.columns).toBe(columns)
    expect(geometry.cells.length).toBeGreaterThanOrEqual(columns * 2)
    for (const cell of geometry.cells) {
      expect(cell.width, cell.text || 'cell width').toBeGreaterThan(0)
      expect(cell.inside, cell.text || 'cell visible').toBe(true)
    }
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

  // C-65 T-003: one wrapper's cue state — caption text + visibility, the
  // shade side classes, and the scroll geometry that drives them.
  const cueState = (page: Page) => page.evaluate(() => {
    const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement | null
    const wrapper = figure?.querySelector('div.ag-table-scroll') as HTMLElement | null
    const caption = figure?.querySelector('div.ag-table-caption') as HTMLElement | null
    if (!figure || !wrapper || !caption) return null
    const editor = document.querySelector('#ag-editor-id') as HTMLElement
    const editorStyle = window.getComputedStyle(editor)
    const editorRect = editor.getBoundingClientRect()
    const capRect = caption.getBoundingClientRect()
    return {
      scrollWidth: wrapper.scrollWidth,
      clientWidth: wrapper.clientWidth,
      captionText: caption.textContent || '',
      captionOn: caption.classList.contains('ag-table-caption-on'),
      captionDisplay: window.getComputedStyle(caption).display,
      captionVisibility: window.getComputedStyle(caption).visibility,
      captionInside: caption.parentElement === wrapper,
      captionRight: capRect.right,
      wrapperRight: wrapper.getBoundingClientRect().right,
      captionBottomVsWrapper: wrapper.getBoundingClientRect().bottom - capRect.bottom,
      shadeLeft: wrapper.classList.contains('ag-table-cue-left'),
      shadeRight: wrapper.classList.contains('ag-table-cue-right'),
      columnRight: editorRect.right - parseFloat(editorStyle.paddingRight || '0')
    }
  })

  test('Auto fits wide tables without scrolling and retains narrow content sizing', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_15COL_MD)
    await waitForTable(page)
    const wide = await measureTable(page)
    expect(wide!.overflowX).toBe('hidden')
    expect(wide!.scrollWidth).toBeLessThanOrEqual(wide!.clientWidth + 1)
    expect(wide!.tableRight).toBeLessThanOrEqual(wide!.wrapperRight + 1)
    await expect(page.locator("button.ag-table-toolbar-mode[data-table-mode='auto']")).toHaveClass(/ag-table-toolbar-active/)
    await expectAllColumnsVisible(page, 15)

    await bootstrapWithMarkdown(page, NARROW_2X2_MD)
    await waitForTable(page)
    const narrow = await measureTable(page)
    expect(narrow!.overflowX).toBe('hidden')
    expect(narrow!.scrollWidth).toBeLessThanOrEqual(narrow!.clientWidth + 1)
    expect(narrow!.tableWidth).toBeLessThan(narrow!.columnWidth - 200)
    await expectAllColumnsVisible(page, 2)
  })

  test('the mode segment flips immediately and the choice survives reopen (C-TABLE-FIT-PERSISTENCE, T-007)', async ({ page }) => {
    await page.addInitScript(() => {
      const backing = Object.create(null)
      const w = window as any
      w.__mockInvoke = {
        ...(w.__mockInvoke || {}),
        // The stat mock is path-aware so the document exists but no
        // `.before` diff sidecar does.
        mt_fs_stat: (args: any) => ({
          isFile: args?.path === '/tmp/mark-e2e/fit-persist.md',
          isDirectory: false
        }),
        mt_prefs_get: (args: any) => (args && args.key in backing ? backing[args.key] : null),
        mt_prefs_set: (args: any) => {
          backing[args.key] = args.value
          if (args.key === 'tableLayouts') w.__lastTableLayouts = args.value
          return null
        }
      }
    })
    await bootstrapWithMarkdown(page, '')
    await openFileTab(page, '/tmp/mark-e2e/fit-persist.md', WIDE_15COL_MD)
    await waitForTable(page)

    const figure = page.locator("figure[data-role='TABLE']").first()
    const fitButton = figure.locator("button.ag-table-toolbar-mode[data-table-mode='fit']")
    const fullButton = figure.locator("button.ag-table-toolbar-mode[data-table-mode='full']")
    const autoButton = figure.locator("button.ag-table-toolbar-mode[data-table-mode='auto']")
    const viewerButton = figure.locator('button.ag-table-toolbar-expand')

    // The wide table opens in Auto (content-sized) — no fake-fit default.
    await expect(autoButton).toHaveClass(/ag-table-toolbar-active/)
    await expect(figure).not.toHaveClass(/ag-table-full-width/)

    // The viewer action keeps working from the pill.
    await expect(viewerButton).toBeVisible()
    await viewerButton.hover()
    await viewerButton.click()
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer.locator('.ag-block-viewer-title')).toHaveText('Table')
    await viewer.locator('.ag-block-viewer-close-btn').click()
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)

    // Fit page: the class leaves Auto and the segment flips in the same
    // tick (no re-render lag).
    await fitButton.click()
    await expect(fitButton).toHaveClass(/ag-table-toolbar-active/)
    await expect(figure).not.toHaveClass(/ag-table-full-width/)

    // Sidebar show: the fit choice stays; the segment keeps its actions.
    const sidebarToggle = page.locator('.titlebar-nav-btn[title="Toggle Sidebar"]')
    await sidebarToggle.click()
    await expect(page.locator('.side-bar')).toBeVisible()
    await expect(figure).not.toHaveClass(/ag-table-full-width/)
    await expect(fitButton).toHaveClass(/ag-table-toolbar-active/)

    // Full width, saved, then reopened: the stale-adoption regression —
    // persist() must never re-adopt the pre-action snapshot mid-click.
    await fullButton.click()
    await expect(figure).toHaveClass(/ag-table-full-width/)

    const savedFull = await page.evaluate(() => {
      const store = (window as any).__lastTableLayouts
      const entries = store?.files?.['/tmp/mark-e2e/fit-persist.md'] || {}
      return Object.values(entries).filter((e: any) => e && e.mode === 'full').length
    })
    expect(savedFull).toBeGreaterThanOrEqual(1)

    await openFileTab(page, '/tmp/mark-e2e/fit-persist.md', WIDE_15COL_MD)
    await waitForTable(page)
    await expect(figure).toHaveClass(/ag-table-full-width/)
    await expect(fullButton).toHaveClass(/ag-table-toolbar-active/)

    // Back to Fit: one click, persisted as the v2 mode (never the legacy
    // fit/fullWidth booleans).
    await fitButton.click()
    await expect(figure).not.toHaveClass(/ag-table-full-width/)

    const saved = await page.evaluate(() => {
      const store = (window as any).__lastTableLayouts
      const entries = store?.files?.['/tmp/mark-e2e/fit-persist.md'] || {}
      const values = Object.values(entries) as any[]
      return {
        fits: values.filter((e) => e && e.mode === 'fit').length,
        legacyFlags: values.some((e) => e && (e.fit === true || e.fullWidth === true))
      }
    })
    expect(saved.fits).toBeGreaterThanOrEqual(1)
    expect(saved.legacyFlags).toBe(false)

    // Reopen (the tab dedupes and re-runs the load hook): the table must
    // NOT return to Full width — the stored mode is Fit.
    await openFileTab(page, '/tmp/mark-e2e/fit-persist.md', WIDE_15COL_MD)
    await waitForTable(page)
    await expect(figure).not.toHaveClass(/ag-table-full-width/)
    await expect(fitButton).toHaveClass(/ag-table-toolbar-active/)

    await sidebarToggle.click()
    await expect(page.locator('.side-bar')).not.toBeVisible()
    await expect(figure).not.toHaveClass(/ag-table-full-width/)
  })

  test('all 15 columns remain visible without internal or page horizontal scrolling', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_15COL_MD)
    await waitForTable(page)
    await stayInAuto(page)
    await expectAllColumnsVisible(page, 15)
    // Wait for the owned model blocks, without requiring a text revision on import.
    await expect.poll(() => page.evaluate(() => {
      const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
      return file?.blocks?.length ?? 0
    })).toBeGreaterThan(0)
    const before = await page.evaluate(() => {
      const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
      return { markdown: file.markdown, isSaved: file.isSaved }
    })
    const wrapper = page.locator("figure[data-role='TABLE'] div.ag-table-scroll").first()
    await wrapper.hover()
    await page.mouse.wheel(600, 0)
    const m = await measureTable(page)
    expect(m!.overflowX).toBe('hidden')
    expect(m!.scrollWidth).toBeLessThanOrEqual(m!.clientWidth + 1)
    expect(m!.pageScrollWidth).toBeLessThanOrEqual(m!.pageClientWidth + 1)
    expect(m!.wrapperRight).toBeLessThanOrEqual(m!.columnRight + 1)
    expect(await wrapper.evaluate(el => el.scrollLeft)).toBe(0)
    await expectAllColumnsVisible(page, 15)
    expect(await page.evaluate(() => {
      const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
      return { markdown: file.markdown, isSaved: file.isSaved }
    })).toEqual(before)
    const overlap = await wrapper.evaluate(el => {
      const next = el.closest('figure')!.nextElementSibling
      return next ? el.getBoundingClientRect().bottom - next.getBoundingClientRect().top : -1
    })
    expect(overlap, 'table footer stays clear of the next block').toBeLessThanOrEqual(0)
  })

  test('no clipped-column cue or hidden cells across Auto, Fit and Full transitions', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_15COL_MD)
    await waitForTable(page)
    for (const mode of ['auto', 'fit', 'full', 'auto']) {
      await page.locator(`button.ag-table-toolbar-mode[data-table-mode='${mode}']`).click()
      await expectAllColumnsVisible(page, 15)
      const cue = await cueState(page)
      expect(cue!.captionVisibility).toBe('hidden')
      expect(cue!.captionText).toBe('')
      expect(cue!.shadeLeft).toBe(false)
      expect(cue!.shadeRight).toBe(false)
      expect(cue!.scrollWidth).toBeLessThanOrEqual(cue!.clientWidth + 1)
      await expect(page.locator('button.ag-block-toolbar-expand').first()).toBeVisible()
    }
  })

  test('a 2x2 table keeps content width, shows no cue, and does not scroll', async ({ page }) => {
    await bootstrapWithMarkdown(page, NARROW_2X2_MD)
    await waitForTable(page)

    const m = await measureTable(page)
    expect(m).not.toBeNull()

    expect(m!.tableWidth, 'narrow table must keep its content width').toBeLessThan(m!.columnWidth - 200)
    expect(Math.abs(m!.scrollWidth - m!.clientWidth)).toBeLessThanOrEqual(1)
    // C-65: a table that fits has neither shade nor caption.
    const cue = await cueState(page)
    expect(cue!.captionOn).toBe(false)
    expect(cue!.captionDisplay).toBe('block')
    expect(cue!.captionVisibility).toBe('hidden')
    expect(cue!.captionText).toBe('')
    expect(cue!.shadeLeft).toBe(false)
    expect(cue!.shadeRight).toBe(false)
    // Narrow tables are centred in the text column, like diagrams.
    const gaps = await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      const table = wrapper.querySelector('table') as HTMLElement
      const w = wrapper.getBoundingClientRect()
      const t = table.getBoundingClientRect()
      return { left: t.left - w.left - parseFloat(getComputedStyle(wrapper).paddingLeft), right: w.right - t.right }
    })
    expect(gaps.left, 'narrow table must not hug the left edge').toBeGreaterThan(50)
    expect(Math.abs(gaps.left - gaps.right), 'narrow table must be centred').toBeLessThanOrEqual(2)
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

  test('the last fitted column is directly reachable for pointer editing', async ({ page }) => {
    await bootstrapWithMarkdown(page, EDIT_AFTER_SCROLL_MD)
    await waitForTable(page)
    await stayInAuto(page)

    await expectAllColumnsVisible(page, 15)

    const lastCell = page.locator("figure[data-role='TABLE'] tbody tr td:last-child").first()
    const box = await lastCell.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + 10, box!.y + box!.height / 2)

    await page.keyboard.type('Z')

    const cellText = await page.evaluate(() => {
      const td = document.querySelector("figure[data-role='TABLE'] tbody tr td:last-child") as HTMLElement | null
      return td ? td.textContent : null
    })
    expect(cellText, 'typing must land inside the last fitted cell').toContain('Z')
  })

  test('typing in a fitted middle column retains every column and never starts horizontal scrolling', async ({ page }) => {
    await bootstrapWithMarkdown(page, EDIT_AFTER_SCROLL_MD)
    await waitForTable(page)
    await stayInAuto(page)
    await expectAllColumnsVisible(page, 15)
    const cell = page.locator("figure[data-role='TABLE'] tbody tr td:nth-child(8)").first()
    await cell.click({ position: { x: 10, y: 10 } })
    await page.keyboard.type('abc')
    await expect(cell).toContainText('abc')
    await expectAllColumnsVisible(page, 15)
    expect(await page.locator('.ag-table-scroll').first().evaluate(el => el.scrollLeft)).toBe(0)
    expect(await page.evaluate(() => {
      const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
      return { markdown: file.markdown, isSaved: file.isSaved }
    })).toEqual({ markdown: expect.stringContaining('abc'), isSaved: false })
  })
})
