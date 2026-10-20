// FILE: tests/e2e/table-layout.spec.ts
// VERSION: 1.11.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin C-39 T-001 default table rendering in the built renderer (wide tables scroll inside the text column, narrow tables keep content width, long URLs are capped at ~40ch, editing works after horizontal scrolling), the C-65 T-003 overflow cue of the same wrapper, and the real-pointer Full width/Fit transition, sibling viewer availability, reverse action, and persistence across sidebar visibility changes.
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
//   EDIT_AFTER_SCROLL_MD - wide table used for the editing-after-scroll cases.
//   C-TABLE-FIT-PERSISTENCE/C-TABLE-NATIVE-TOOLBAR-DELIVERY scenario - real pointer activation, sibling viewer reveal, reverse action, live sidebar on/off, persisted fit payload and reopen.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
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

  // C-65 2026-10-19: a wide table opens in Full width; the C-39 cases pin
  // the in-column wrapper scroll, i.e. the «Fit to page» mode — choose it.
  async function fitToPage(page: Page) {
    await page.waitForFunction(() =>
      !!document.querySelector("figure[data-role='TABLE'].ag-table-full-width")
    , undefined, { timeout: 5_000 })
    await page.evaluate(() => {
      for (const figure of document.querySelectorAll("figure[data-role='TABLE'].ag-table-full-width")) {
        (figure.querySelector('button.ag-table-toolbar-toggle') as HTMLElement).click()
      }
    })
    await page.waitForFunction(() =>
      !document.querySelector("figure[data-role='TABLE'].ag-table-full-width")
    , undefined, { timeout: 5_000 })
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

  test('a wide table opens in Full width by default; a narrow one stays in the column (C-65)', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_15COL_MD)
    await waitForTable(page)
    await page.waitForFunction(() =>
      !!document.querySelector("figure[data-role='TABLE'].ag-table-full-width")
    , undefined, { timeout: 5_000 })
    const wide = await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      const toggle = document.querySelector("figure[data-role='TABLE'] button.ag-table-toolbar-toggle") as HTMLElement
      return { overflowX: window.getComputedStyle(wrapper).overflowX, label: toggle.title }
    })
    expect(wide.overflowX).toBe('visible')
    expect(wide.label).toBe('Fit to page')

    await bootstrapWithMarkdown(page, NARROW_2X2_MD)
    await waitForTable(page)
    await page.waitForTimeout(300)
    const narrowFull = await page.evaluate(() =>
      !!document.querySelector("figure[data-role='TABLE'].ag-table-full-width")
    )
    expect(narrowFull).toBe(false)
  })

  // C-TABLE-FIT-PERSISTENCE (2026-10-20): the native owner review showed
  // an explicit «Fit to page» choice not surviving — the host sanitizer
  // dropped muya's fit flag, so a wide table reverted to Full width after
  // reload. The transition must flip the mode and the label immediately,
  // and the choice must persist through save → reopen (in-memory prefs
  // backing stands in for the profile).
  test('Full width → Fit to page flips mode and label immediately and survives reopen (C-TABLE-FIT-PERSISTENCE)', async ({ page }) => {
    await page.addInitScript(() => {
      const backing = Object.create(null)
      const w = window as any
      w.__mockInvoke = {
        ...(w.__mockInvoke || {}),
        // The load path prunes entries whose file no longer exists, and
        // open-new-tab auto-diffs a file with a `.before` sidecar — the
        // stat mock is path-aware so the document exists but no sidecar
        // does.
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
    await page.waitForFunction(() =>
      !!document.querySelector("figure[data-role='TABLE'].ag-table-full-width")
    , undefined, { timeout: 5_000 })

    // The transition: click the «Fit to page» toggle — the class leaves and
    // the label flips to «Full width» in the same tick (no re-render lag).
    const figure = page.locator("figure[data-role='TABLE']").first()
    const widthToggle = figure.locator('button.ag-table-toolbar-toggle')
    const viewerButton = figure.locator('button.ag-table-toolbar-expand')
    await expect(widthToggle).toHaveAttribute('title', 'Fit to page')
    await expect(viewerButton).toBeVisible()
    await viewerButton.hover()
    await expect(viewerButton.locator('span.ag-block-toolbar-label')).toBeVisible()
    await viewerButton.click()
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer.locator('.ag-block-viewer-title')).toHaveText('Table')
    await viewer.locator('.ag-block-viewer-close-btn').click()
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)
    await widthToggle.click()
    const afterClick = await figure.evaluate((node) => {
      const toggle = node.querySelector('button.ag-table-toolbar-toggle') as HTMLElement
      return {
        full: node.classList.contains('ag-table-full-width'),
        label: toggle.title
      }
    })
    expect(afterClick.full).toBe(false)
    expect(afterClick.label).toBe('Full width')

    // The owner found the native failure while changing sidebar state.
    // Keep the fitted mode and its reverse action available when the
    // editor viewport shrinks, and persist/reopen from that geometry.
    const sidebarToggle = page.locator('.titlebar-nav-btn[title="Toggle Sidebar"]')
    await sidebarToggle.click()
    await expect(page.locator('.side-bar')).toBeVisible()
    await expect(figure).not.toHaveClass(/ag-table-full-width/)
    await expect(widthToggle).toBeVisible()
    await expect(widthToggle).toHaveAttribute('title', 'Full width')
    await expect(viewerButton).toBeVisible()

    // Reverse while the sidebar is visible, then REOPEN with the saved
    // Full width entry before selecting Fit. That adopted entry is the
    // exact native regression: persist() used to re-adopt its stale value
    // during the Fit click and instantly restore Full width.
    await widthToggle.click()
    await expect(figure).toHaveClass(/ag-table-full-width/)
    await expect(widthToggle).toHaveAttribute('title', 'Fit to page')

    const savedFullWidth = await page.evaluate(() => {
      const store = (window as any).__lastTableLayouts
      const entries = store?.files?.['/tmp/mark-e2e/fit-persist.md'] || {}
      return Object.values(entries).filter((e: any) => e && e.fullWidth === true).length
    })
    expect(savedFullWidth).toBeGreaterThanOrEqual(1)

    await openFileTab(page, '/tmp/mark-e2e/fit-persist.md', WIDE_15COL_MD)
    await waitForTable(page)
    await expect(figure).toHaveClass(/ag-table-full-width/)
    await expect(widthToggle).toHaveAttribute('title', 'Fit to page')

    await widthToggle.click()
    await expect(figure).not.toHaveClass(/ag-table-full-width/)
    await expect(widthToggle).toHaveAttribute('title', 'Full width')

    // The choice was saved with the fit flag (the host sanitizer keeps it).
    const saved = await page.evaluate(() => {
      const store = (window as any).__lastTableLayouts
      const entries = store?.files?.['/tmp/mark-e2e/fit-persist.md'] || {}
      const fits = Object.values(entries).filter((e: any) => e && e.fit === true)
      return { fitCount: fits.length }
    })
    expect(saved.fitCount).toBeGreaterThanOrEqual(1)

    // Reopen the document: open-new-tab dedupes to the existing tab and
    // re-activates it, which reruns the C-65 load hook
    // (applyStoredTableLayouts) — the wide table must NOT return to Full
    // width; the label stays «Full width».
    await openFileTab(page, '/tmp/mark-e2e/fit-persist.md', WIDE_15COL_MD)
    await waitForTable(page)
    const reopened = await page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
      const toggle = figure.querySelector('button.ag-table-toolbar-toggle') as HTMLElement
      return {
        full: figure.classList.contains('ag-table-full-width'),
        label: toggle ? toggle.title : null
      }
    })
    expect(reopened.full).toBe(false)
    expect(reopened.label).toBe('Full width')

    await sidebarToggle.click()
    await expect(page.locator('.side-bar')).not.toBeVisible()
    await expect(figure).not.toHaveClass(/ag-table-full-width/)
    await expect(widthToggle).toBeVisible()
    await expect(widthToggle).toHaveAttribute('title', 'Full width')
    await expect(viewerButton).toBeVisible()
  })

  test('a 15-column table scrolls horizontally inside the text column', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_15COL_MD)
    await waitForTable(page)
    await fitToPage(page)

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
    // C-65: at the start the right side hides columns — the class-gated
    // shade shows there, never on the resting left side.
    const cue = await cueState(page)
    expect(cue!.shadeRight).toBe(true)
    expect(cue!.shadeLeft).toBe(false)
    // The horizontal scrollbar stays thin (WebKit draws a 15px classic bar
    // without the ::-webkit-scrollbar height rule).
    const scrollbar = await page.evaluate(() => {
      const w = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      return w.offsetHeight - w.clientHeight
    })
    expect(scrollbar, 'horizontal scrollbar must be thin').toBeLessThanOrEqual(8)
    // The scroll container (and so its scrollbar) ends above the next
    // block: a negative bottom margin used to paint the bar 30 px below the
    // table, over the following heading (2026-10-18).
    const overlap = await page.evaluate(() => {
      const w = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      const next = w.closest('figure')!.nextElementSibling as HTMLElement | null
      return next ? w.getBoundingClientRect().bottom - next.getBoundingClientRect().top : -1
    })
    expect(overlap, 'table scrollbar must not reach into the next block').toBeLessThanOrEqual(0)
  })

  test('the C-65 cue: caption below the table on the column edge, live on scroll', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_15COL_MD)
    await waitForTable(page)
    await fitToPage(page)

    // Start: columns 1..N visible from the first column, only the right
    // side hides columns.
    const start = await cueState(page)
    expect(start!.captionOn).toBe(true)
    expect(start!.captionDisplay).toBe('block')
    expect(start!.captionText).toMatch(/^columns 1–\d+ of 15$/)
    expect(start!.shadeLeft).toBe(false)
    expect(start!.shadeRight).toBe(true)
    // The caption is inside the wrapper, above its scrollbar zone.
    expect(start!.captionInside).toBe(true)
    expect(start!.captionBottomVsWrapper).toBeGreaterThanOrEqual(0)
    expect(Math.abs(start!.captionRight - start!.wrapperRight)).toBeLessThanOrEqual(1)

    // Scroll to the middle: both sides hide columns, the range moves.
    await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      wrapper.scrollLeft = (wrapper.scrollWidth - wrapper.clientWidth) / 2
    })
    // The scroll event (and so the cue sync) lands a frame later — poll.
    await expect.poll(async () => (await cueState(page))!.shadeLeft).toBe(true)
    const middle = await cueState(page)
    expect(middle!.shadeLeft).toBe(true)
    expect(middle!.shadeRight).toBe(true)
    const middleRange = /^columns (\d+)–(\d+) of 15$/.exec(middle!.captionText)
    expect(middleRange, `caption must read «columns X–Y of 15»: "${middle!.captionText}"`).toBeTruthy()
    expect(parseInt(middleRange![1], 10)).toBeGreaterThan(1)
    expect(parseInt(middleRange![2], 10)).toBeLessThan(15)
    expect(middle!.captionText).not.toBe(start!.captionText)

    // Scroll to the end: only the left side hides columns, the range ends
    // at the last column.
    await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      wrapper.scrollLeft = wrapper.scrollWidth - wrapper.clientWidth
    })
    await expect.poll(async () => (await cueState(page))!.shadeRight).toBe(false)
    const end = await cueState(page)
    expect(end!.shadeLeft).toBe(true)
    expect(end!.shadeRight).toBe(false)
    const endRange = /^columns (\d+)–(\d+) of 15$/.exec(end!.captionText)
    expect(endRange, `caption must read «columns X–Y of 15»: "${end!.captionText}"`).toBeTruthy()
    expect(parseInt(endRange![1], 10)).toBeGreaterThan(1)
    expect(parseInt(endRange![2], 10)).toBe(15)
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

  test('clicking a cell after scrolling right places the caret in that cell', async ({ page }) => {
    await bootstrapWithMarkdown(page, EDIT_AFTER_SCROLL_MD)
    await waitForTable(page)
    await fitToPage(page)

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
    await fitToPage(page)

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
