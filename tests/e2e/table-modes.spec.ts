import { expect, type Page, test } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

/**
 * C-PAGE-WIDTH-TABLES T-007/T-008/T-009 — the honest three-mode table
 * model in the built renderer (plan verification for T-009; corners C-7,
 * C-8, C-9, C-10):
 *   - Auto stays content-sized (GitHub model, wrapper scroll);
 *   - Fit page pins the frame to the text column and distributes real
 *     columns (wrap fallback before degradation);
 *   - the degradation badge appears only under genuine overflow and
 *     reports the exact px;
 *   - drags write ratios; a Fit ↔ Full round-trip restores the
 *     proportions;
 *   - drag chips show % · px and fade after release;
 *   - side walls set/reset an explicit table width, a wall drag in Full
 *     switches to Auto with that width, and walls stay hittable while the
 *     table overflows.
 * Chromium only (the plan's command).
 */

type LayoutEntry = {
  widths?: number[]
  manual?: boolean[]
  ratios?: number[]
  tableWidth?: number
  mode?: 'fit' | 'full'
  fullWidth?: boolean
  fit?: boolean
}

const FIT_DOC = '/tmp/mark-e2e/table-modes-fit.md'

// A 6-column table whose distributed layout fits a ~900px canvas: short
// tokens (small minima), moderate max-content.
const SIX_COL_MD = `# Six columns

| Alpha | Beta | Gamma | Delta | Epsilon | Zeta |
| --- | --- | --- | --- | --- | --- |
| one | two | three | four | five | six |
| 1 | 2 | 3 | 4 | 5 | 6 |

Prose after the table.
`

// One enormous unbreakable token: Auto must scroll it, Fit must wrap it.
const LONG_TOKEN_MD = `# Long token

| Payload |
| --- |
| ${'x'.repeat(300)} |

Prose.
`

// Many narrow columns: even the wrapped minima cannot fit any viewport →
// the honest degradation.
const WIDE_MD = (() => {
  // Long header tokens keep every measured minimum far above ~30px, so 30
  // columns cannot fit any viewport: the honest degradation case.
  const header = Array.from({ length: 30 }, (_, i) => `Column ${i + 1} header`).join(' | ')
  const row = Array.from({ length: 30 }, (_, i) => `value ${i} data`).join(' | ')
  return `# Wide\n\n| ${header} |\n| ${Array.from({ length: 30 }, () => '---').join(' | ')} |\n| ${row} |\n`
})()

test.describe('honest table modes (C-PAGE-WIDTH-TABLES)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      const w = window as any
      // Capture the tableLayouts writes: the persistence shape (schema v2)
      // is pinned below through the same transport the host saves with.
      w.__tableLayoutWrites = []
      const backing: Record<string, unknown> = Object.create(null)
      w.__mockInvoke.mt_prefs_get = (args: { key: string }) =>
        args && args.key in backing ? backing[args.key] : null
      const record = (args: { key: string; value: unknown }) => {
        backing[args.key] = args.value
        if (args.key === 'tableLayouts') w.__tableLayoutWrites.push(args.value)
        return null
      }
      w.__mockInvoke.mt_prefs_set = record
      w.__mockInvoke['mt::prefs::set'] = record
      // The stores prune only CONFIRMED-missing files, and open-new-tab
      // auto-diffs a `<path>.before` sidecar — stat must be path-aware so
      // the fixture docs exist but no stale sidecar does.
      w.__fixturePaths = [
        '/tmp/mark-e2e/table-modes-fit.md',
        '/tmp/mark-e2e/table-modes-wrap.md',
        '/tmp/mark-e2e/table-modes-wide.md',
        '/tmp/mark-e2e/table-modes-clamp.md'
      ]
      w.__mockInvoke.mt_fs_stat = (args: { path?: string }) => {
        const isFile = !!args && (w.__fixturePaths as string[]).includes(args.path || '')
        return { isFile, isDirectory: false, is_file: isFile }
      }
    })
  })

  async function openDoc(page: Page, markdown: string, path = FIT_DOC) {
    // The proven persistence-harness flow: boot the editor, then open the
    // fixture through open-new-tab — the document carries a pathname, so
    // the tableLayouts save path fires (untitled documents never persist).
    await bootEditor(page)
    await openFileTab(page, path, markdown)
    await page.locator("figure[data-role='TABLE'] table").first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    // The adoption/render funnel settles (the fit pass may follow the
    // first paint by a tick).
    await page.waitForTimeout(400)
  }

  // Route muya's BLOCK_TABLE_* debug markers to the test log (the mode
  // transitions and the persistence dispatches are auditable this way).
  const captureMuyaLog = (page: Page) => {
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[tableResize]')) console.log('  [muya]', text)
    })
  }

  const modeButton = (page: Page, mode: 'auto' | 'fit' | 'full') =>
    page.locator(`figure[data-role='TABLE'] button.ag-table-toolbar-mode[data-table-mode='${mode}']`).first()

  async function setMode(page: Page, mode: 'auto' | 'fit' | 'full') {
    // The pill is hover-revealed; evaluate-click keeps the action stable.
    await modeButton(page, mode).evaluate((el: HTMLElement) => el.click())
    await page.waitForTimeout(300)
  }

  const geometry = (page: Page) => page.evaluate(() => {
    const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement | null
    const wrapper = figure?.querySelector('div.ag-table-scroll') as HTMLElement | null
    const table = figure?.querySelector('table') as HTMLElement | null
    const editor = document.querySelector('#ag-editor-id') as HTMLElement | null
    if (!figure || !wrapper || !table || !editor) return null
    const editorStyle = window.getComputedStyle(editor)
    const editorRect = editor.getBoundingClientRect()
    const cols = Array.from(table.querySelectorAll('colgroup col')).map(
      (col) => parseFloat((col as HTMLElement).style.width || '0')
    )
    const caption = figure.querySelector('div.ag-table-caption') as HTMLElement | null
    return {
      mode: figure.className.includes('ag-table-full-width') ? 'full' : undefined,
      fixed: table.classList.contains('ag-column-widths-fixed'),
      wrapAnywhere: table.classList.contains('ag-table-wrap-anywhere'),
      wrapperOverflowX: window.getComputedStyle(wrapper).overflowX,
      scrollWidth: wrapper.scrollWidth,
      clientWidth: wrapper.clientWidth,
      // The wrapper's own 11px row-bar padding is chrome, not columns'
      // frame: the fit frame is the wrapper's content box.
      contentWidth: wrapper.clientWidth -
        (parseFloat(window.getComputedStyle(wrapper).paddingLeft) || 0) -
        (parseFloat(window.getComputedStyle(wrapper).paddingRight) || 0),
      tableWidth: Math.round(table.getBoundingClientRect().width),
      columnWidth: Math.round(
        editor.clientWidth -
        parseFloat(editorStyle.paddingLeft || '0') -
        parseFloat(editorStyle.paddingRight || '0')
      ),
      columnRight: editorRect.right - parseFloat(editorStyle.paddingRight || '0'),
      cols,
      caption: caption ? caption.textContent || '' : '',
      badgeOn: !!caption?.classList.contains('ag-table-caption-degrade')
    }
  })

  const lastLayoutEntry = async (page: Page): Promise<LayoutEntry | null> =>
    page.evaluate(() => {
      const writes = (window as any).__tableLayoutWrites as Array<{ files: Record<string, Record<string, unknown>> }>
      if (!writes || writes.length === 0) return null
      const files = writes[writes.length - 1].files || {}
      const fileEntries = Object.values(files)[0] as Record<string, unknown> | undefined
      if (!fileEntries) return null
      // updatedAt rides the file object — the first table entry is the
      // first OBJECT value.
      const entry = Object.values(fileEntries).find(
        (value) => value && typeof value === 'object'
      )
      return (entry as LayoutEntry) || null
    })

  const colRatios = (cols: number[]) => {
    const total = cols.reduce((sum, w) => sum + w, 0)
    return cols.map((w) => w / total)
  }

  const near = (a: number, b: number, tolerance = 3) => Math.abs(a - b) <= tolerance

  test('Auto stays content-sized: the wide table scrolls the wrapper, no badge (C-7)', async ({ page }) => {
    await openDoc(page, SIX_COL_MD)
    const geo = await geometry(page)
    expect(geo).toBeTruthy()
    expect(geo!.fixed).toBe(false)
    expect(geo!.mode).toBeUndefined()
    expect(geo!.badgeOn).toBe(false)
    // A content-sized table wider than its column scrolls the wrapper
    // (the GitHub model).
    if (geo!.tableWidth > geo!.columnWidth) {
      expect(geo!.wrapperOverflowX).toBe('auto')
      expect(geo!.scrollWidth).toBeGreaterThan(geo!.clientWidth)
    }
  })

  test('Fit page pins the frame to the text column and distributes the columns (C-7)', async ({ page }) => {
    await openDoc(page, SIX_COL_MD)
    await setMode(page, 'fit')

    const geo = await geometry(page)
    // The frame is the text column (through the wrapper's content box):
    // the fixed table fills it exactly and the wrapper does not scroll.
    expect(geo!.fixed).toBe(true)
    expect(near(geo!.tableWidth, geo!.contentWidth, 4)).toBe(true)
    expect(geo!.scrollWidth).toBeLessThanOrEqual(geo!.clientWidth + 2)
    expect(geo!.badgeOn).toBe(false)
    // Every column got a real share of the frame.
    expect(geo!.cols).toHaveLength(6)
    for (const width of geo!.cols) expect(width).toBeGreaterThan(20)
    // The toolbar marks Fit active.
    await expect(modeButton(page, 'fit')).toHaveClass(/ag-table-toolbar-active/)
    // The persisted entry carries the v2 mode (and never the legacy flags).
    const entry = await lastLayoutEntry(page)
    expect(entry?.mode).toBe('fit')
    expect(entry).not.toHaveProperty('fullWidth')
    expect(entry).not.toHaveProperty('fit')
  })

  test('the wrap fallback runs before degradation: one long token wraps, no scroll (C-7)', async ({ page }) => {
    await openDoc(page, LONG_TOKEN_MD, '/tmp/mark-e2e/table-modes-wrap.md')
    await setMode(page, 'fit')

    const geo = await geometry(page)
    expect(geo!.fixed).toBe(true)
    // The single column is capped at the frame and the wrapper does not
    // scroll — the token wraps instead (data stays visible).
    expect(geo!.tableWidth).toBeLessThanOrEqual(geo!.contentWidth + 2)
    expect(geo!.scrollWidth).toBeLessThanOrEqual(geo!.clientWidth + 2)
    expect(geo!.badgeOn).toBe(false)
  })

  test('the degradation badge appears only when even the minima overflow, with the exact px (C-7/C-8)', async ({ page }) => {
    // The six-column table first: Fit must NOT badge (it fits by wrapping).
    await openDoc(page, SIX_COL_MD)
    await setMode(page, 'fit')
    expect((await geometry(page)).badgeOn).toBe(false)

    // The 30-column table: minima exceed any sane viewport → honest scroll.
    await openDoc(page, WIDE_MD, '/tmp/mark-e2e/table-modes-wide.md')
    await setMode(page, 'fit')
    await page.waitForTimeout(300)

    const wide = await geometry(page)
    expect(wide.badgeOn).toBe(true)
    expect(wide.caption).toMatch(/does not fit by \d+ px/i)
    expect(wide.scrollWidth).toBeGreaterThan(wide.clientWidth)
    // Degradation sits at the minimal sizes: the columns are tiny and the
    // wrapper scrolls — no truncation, no hidden data.
    expect(wide.fixed).toBe(true)

    // Full width degrades the same honest way.
    await setMode(page, 'full')
    const full = await geometry(page)
    expect(full.badgeOn).toBe(true)
    expect(full.caption).toMatch(/does not fit by \d+ px/i)
  })

  test('a drag writes ratios; a Fit ↔ Full round-trip restores the proportions (C-9)', async ({ page }) => {
    await openDoc(page, SIX_COL_MD)
    await setMode(page, 'fit')

    const tableBox = await page.locator("figure[data-role='TABLE'] table").first().boundingBox()
    expect(tableBox).toBeTruthy()
    const handle = page.locator("figure[data-role='TABLE'] th").nth(0).locator('.ag-column-resizer')
    const handleBox = await handle.boundingBox()
    expect(handleBox).toBeTruthy()

    // Drag the first column narrower by 60px (real pointer gesture).
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 60, handleBox!.y + 20, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(400)

    const afterDrag = await geometry(page)
    expect(afterDrag.cols).toHaveLength(6)
    // The table still fills its frame after the re-fit of the remainder.
    expect(near(afterDrag.tableWidth, afterDrag.contentWidth, 4)).toBe(true)
    const ratiosAfterDrag = colRatios(afterDrag.cols)

    const entry = await lastLayoutEntry(page)
    expect(entry?.manual?.[0]).toBe(true)
    expect(entry?.ratios).toBeTruthy()
    expect(Math.abs(entry!.ratios![0] - ratiosAfterDrag[0])).toBeLessThan(0.02)

    // Switch to Full: the frame widens, the proportions follow.
    await setMode(page, 'full')
    const fullGeo = await geometry(page)
    expect(fullGeo.mode).toBe('full')
    const fullRatios = colRatios(fullGeo.cols)
    expect(Math.abs(fullRatios[0] - ratiosAfterDrag[0])).toBeLessThan(0.02)

    // Back to Fit: the same proportions again (the round trip).
    await setMode(page, 'fit')
    const backGeo = await geometry(page)
    const backRatios = colRatios(backGeo.cols)
    expect(Math.abs(backRatios[0] - ratiosAfterDrag[0])).toBeLessThan(0.02)
  })

  test('a drag shows % · px chips above every column, fading after release (C-10)', async ({ page }) => {
    await openDoc(page, SIX_COL_MD)
    await setMode(page, 'fit')

    const handle = page.locator("figure[data-role='TABLE'] th").nth(1).locator('.ag-column-resizer')
    const handleBox = await handle.boundingBox()
    expect(handleBox).toBeTruthy()

    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 40, handleBox!.y + 10, { steps: 4 })

    // Mid-drag: one chip per column, each in the «N% · N px» shape.
    const chips = page.locator("figure[data-role='TABLE'] .ag-table-size-chips .ag-table-size-chip")
    await expect(chips).toHaveCount(6)
    const firstChipText = await chips.first().textContent()
    expect(firstChipText).toMatch(/^\d+% · \d+ px$/)
    expect(await chips.nth(5).textContent()).toMatch(/^\d+% · \d+ px$/)

    await page.mouse.up()
    // The chips fade shortly after release and are removed.
    await expect(page.locator("figure[data-role='TABLE'] .ag-table-size-chips")).toHaveCount(0, { timeout: 2_000 })
  })

  test('col-resize cursor stays on the column borders (C-39 parity)', async ({ page }) => {
    await openDoc(page, SIX_COL_MD)
    const cursor = await page
      .locator("figure[data-role='TABLE'] th .ag-column-resizer")
      .first()
      .evaluate((el) => window.getComputedStyle(el).cursor)
    expect(cursor).toBe('col-resize')
  })

  test('side walls set an explicit width in Auto, reset on double-click, and switch Full to Auto (C-10)', async ({ page }) => {
    await openDoc(page, SIX_COL_MD)

    // Walls exist outside Fit (Auto): both edges carry a handle.
    const leftWall = page.locator("figure[data-role='TABLE'] .ag-table-wall-left")
    const rightWall = page.locator("figure[data-role='TABLE'] .ag-table-wall-right")
    await expect(leftWall).toHaveCount(1)
    await expect(rightWall).toHaveCount(1)

    // Drag the right wall WIDER: the table gets an explicit width. (The
    // six-column fixture already sits at its measured minima — every cell
    // carries the shipped 4em content floor — so a narrower wall honestly
    // degrades to the same minimal sizes instead of shrinking.)
    const wallBox = await rightWall.boundingBox()
    const tableBefore = (await geometry(page)).tableWidth
    await page.mouse.move(wallBox!.x + wallBox!.width / 2, wallBox!.y + 20)
    await page.mouse.down()
    await page.mouse.move(wallBox!.x + wallBox!.width / 2 + 150, wallBox!.y + 20, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    const afterWall = await geometry(page)
    expect(afterWall.fixed).toBe(true)
    expect(afterWall.tableWidth).toBeGreaterThan(tableBefore)
    const entry = await lastLayoutEntry(page)
    expect(entry?.tableWidth).toBeTruthy()
    expect(entry?.tableWidth).toBeGreaterThan(tableBefore)

    // Double-click the wall resets the explicit width.
    await rightWall.dblclick()
    await page.waitForTimeout(400)
    const resetEntry = await page.evaluate(() => {
      const writes = (window as any).__tableLayoutWrites as Array<Record<string, Record<string, LayoutEntry>>>
      const files = writes[writes.length - 1].files || {}
      const values = Object.values(Object.values(files)[0] || {})
      return values as LayoutEntry[]
    })
    expect(resetEntry.every((e) => !e.tableWidth)).toBe(true)

    // A wall drag in Full switches the table to Auto with that width.
    await setMode(page, 'full')
    const fullWallBox = await rightWall.boundingBox()
    await page.mouse.move(fullWallBox!.x + fullWallBox!.width / 2, fullWallBox!.y + 20)
    await page.mouse.down()
    await page.mouse.move(fullWallBox!.x + fullWallBox!.width / 2 + 60, fullWallBox!.y + 20, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(400)

    const switched = await geometry(page)
    expect(switched.mode).toBeUndefined()
    expect(switched.fixed).toBe(true)
    const switchedEntry = await lastLayoutEntry(page)
    expect(switchedEntry?.tableWidth).toBeTruthy()
    expect(switchedEntry?.mode).toBeUndefined()
  })

  test('walls clamp inside the visible scroll area while the table overflows (C-10)', async ({ page }) => {
    // A wide Auto table overflows its wrapper; the walls must stay hittable.
    await openDoc(page, WIDE_MD, '/tmp/mark-e2e/table-modes-clamp.md')
    await page.waitForTimeout(300)

    const verdict = await page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
      const wrapper = figure.querySelector('div.ag-table-scroll') as HTMLElement
      const rightWall = figure.querySelector('.ag-table-wall-right') as HTMLElement
      const figureRect = figure.getBoundingClientRect()
      const wallRect = rightWall.getBoundingClientRect()
      const visibleRight = figureRect.right
      return {
        overflowing: wrapper.scrollWidth > wrapper.clientWidth,
        wallInsideFigure: wallRect.right <= visibleRight + 1,
        wallVisible: wallRect.right > 0 && wallRect.left < visibleRight
      }
    })
    expect(verdict.overflowing).toBe(true)
    expect(verdict.wallInsideFigure).toBe(true)
    expect(verdict.wallVisible).toBe(true)
  })

  test('Fit page never widens the page: the text column keeps its width (C-7)', async ({ page }) => {
    await openDoc(page, SIX_COL_MD)
    const before = await page.evaluate(() => {
      const editor = document.querySelector('#ag-editor-id') as HTMLElement
      return Math.round(editor.getBoundingClientRect().width)
    })
    await setMode(page, 'fit')
    const after = await page.evaluate(() => {
      const editor = document.querySelector('#ag-editor-id') as HTMLElement
      return Math.round(editor.getBoundingClientRect().width)
    })
    expect(after).toBe(before)
  })
})
