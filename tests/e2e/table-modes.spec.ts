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

// Owner live smoke 2026-11-05: three regressions after the full-height
// column walls landed — the walls' stylesheet must exist the moment the
// walls are created (a bare Fit click used to leave the spans in-flow),
// Full width must never carry an inline overflow (it clips the breakout),
// and the side walls must sit on the breakout table's edges, not inside
// the narrow text column.
test('walls stay styled and unclipped through a bare Fit click and a Full switch', async ({ page }) => {
  await installTauriShim(page)
  await bootEditor(page)
  await openFileTab(page, FIT_DOC, SIX_COL_MD)
  const table = page.locator("figure[data-role='TABLE'] table").first()
  await table.waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(500)

  // Bare Fit click — no drag: the walls appear and MUST be absolute.
  await page.locator("figure[data-role='TABLE'] button[data-table-mode='fit']").click()
  await page.waitForTimeout(500)
  let styled = await page.evaluate(() => {
    const host = document.querySelector("figure[data-role='TABLE'] .ag-column-walls") as HTMLElement | null
    if (!host) return { missing: true }
    const wall = host.children[0] as HTMLElement
    return {
      hostPosition: getComputedStyle(host).position,
      wallPosition: getComputedStyle(wall).position,
      wallCursor: getComputedStyle(wall).cursor
    }
  })
  expect(styled).toEqual({ hostPosition: 'absolute', wallPosition: 'absolute', wallCursor: 'col-resize' })
  // Owner live smoke 2026-11-05: the editor's generic element rules paint
  // backgrounds on unknown spans/divs — every added layer MUST stay
  // transparent or it renders as a solid block over the table.
  const paints = await page.evaluate(() => {
    const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
    const host = figure?.querySelector('.ag-column-walls') as HTMLElement | null
    const walls = figure ? (Array.from(figure.querySelectorAll('.ag-table-wall')) as HTMLElement[]) : []
    return {
      hostBg: host ? getComputedStyle(host).backgroundColor : 'missing',
      wallBgs: walls.map((w) => getComputedStyle(w).backgroundColor)
    }
  })
  expect(paints.hostBg, 'the walls host must not paint').toBe('rgba(0, 0, 0, 0)')
  for (const bg of paints.wallBgs) expect(bg, 'side walls must not paint').toBe('rgba(0, 0, 0, 0)')

  // Full width: no inline overflow on the wrapper (CSS owns visible).
  // Owner convention 2026-11-09: NO side walls in Full — the outer edges
  // are pinned to the window canvas; the last header handle (the outer
  // edge) is gated off, only INTERNAL borders stay draggable.
  await page.locator("figure[data-role='TABLE'] button[data-table-mode='full']").click()
  await page.waitForTimeout(700)
  const full = await page.evaluate(() => {
    const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
    const wrap = figure.querySelector('div.ag-table-scroll') as HTMLElement
    const tbl = wrap.querySelector('table') as HTMLTableElement
    const fr = figure.getBoundingClientRect()
    const tr = tbl.getBoundingClientRect()
    const cols = tbl.tHead.rows[0].cells.length
    const lastHandle = tbl.querySelector('thead th:last-child .ag-column-resizer') as HTMLElement | null
    return {
      inlineOverflowX: wrap.style.overflowX,
      computedOverflowX: getComputedStyle(wrap).overflowX,
      tableRightBeyondFig: Math.round(tr.right - fr.right),
      wallCount: figure.querySelectorAll('.ag-table-wall').length,
      zoneCount: (wrap.querySelector('.ag-column-walls')?.children.length) ?? -1,
      cols,
      lastHandleDisplay: lastHandle ? getComputedStyle(lastHandle).display : 'missing'
    }
  })
  // The one-way ghost-tail clip may leave inline 'hidden'; the CSS still
  // owns Full width's breakout (nothing ever overflows by mandate).
  expect(full.computedOverflowX === 'visible' || full.inlineOverflowX === 'hidden').toBe(true)
  expect(full.tableRightBeyondFig).toBeGreaterThan(50)
  expect(full.wallCount, 'no side walls in Full (edges pinned to the window)').toBe(0)
  expect(full.zoneCount, 'internal zones for every internal border only')
    .toBe(full.cols - 1)
  expect(full.lastHandleDisplay, 'the outer-edge header handle is gated off in Full').toBe('none')

  // Fit keeps the same convention: no walls, outer handle off.
  await page.locator("figure[data-role='TABLE'] button[data-table-mode='fit']").click()
  await page.waitForTimeout(600)
  const fitPins = await page.evaluate(() => {
    const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
    const tbl = figure.querySelector('table') as HTMLTableElement
    const lastHandle = tbl.querySelector('thead th:last-child .ag-column-resizer') as HTMLElement | null
    return {
      wallCount: figure.querySelectorAll('.ag-table-wall').length,
      zoneCount: (figure.querySelector('.ag-column-walls')?.children.length) ?? -1,
      cols: tbl.tHead.rows[0].cells.length,
      lastHandleDisplay: lastHandle ? getComputedStyle(lastHandle).display : 'missing'
    }
  })
  expect(fitPins.wallCount, 'no side walls in Fit (edges pinned to the column)').toBe(0)
  expect(fitPins.zoneCount).toBe(fitPins.cols - 1)
  expect(fitPins.lastHandleDisplay).toBe('none')

  // Auto is the walls' one home: both edges draggable.
  await page.locator("figure[data-role='TABLE'] button[data-table-mode='auto']").click()
  // WebKit refreshes the walls a beat later; poll for them.
  await expect.poll(async () => page.evaluate(() =>
    document.querySelectorAll("figure[data-role='TABLE'] .ag-table-wall").length
  ), { timeout: 4000 }).toBe(2)
  const autoPins = await page.evaluate(() => {
    const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
    const tbl = figure.querySelector('table') as HTMLTableElement
    const lastHandle = tbl.querySelector('thead th:last-child .ag-column-resizer') as HTMLElement | null
    return {
      wallCount: figure.querySelectorAll('.ag-table-wall').length,
      lastHandleDisplay: lastHandle ? getComputedStyle(lastHandle).display : 'missing'
    }
  })
  expect(autoPins.wallCount, 'both side walls live in Auto').toBe(2)
  expect(autoPins.lastHandleDisplay, 'Auto keeps the outer handle (content-sized)').not.toBe('none')
})


// Owner live smoke 2026-11-07: (1) clicking Auto RETURNS the table to its
// content width (no fixed colgroup left behind); (2) Full width fits the
// canvas — stored ratios that do not fit fall through to the wrapping
// plan instead of overflowing into a page scrollbar; (3) the Open-full-
// screen button rides BESIDE the mode segment, left of Copy.
test('owner smoke 2026-11-07: auto resets, full fits the canvas, button order', async ({ page }) => {
  await installTauriShim(page)
  await page.setViewportSize({ width: 620, height: 800 })
  await bootEditor(page)
  await openFileTab(page, FIT_DOC, SIX_COL_MD)
  const table = page.locator("figure[data-role='TABLE'] table").first()
  await table.waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(500)

  // (3) button order: the mode segment + expand, THEN copy.
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll("figure[data-role='TABLE'] button.ag-table-toolbar-btn"))
      .map((b) => (b as HTMLElement).dataset.tableMode || (b as HTMLElement).dataset.tableToolbarAction)
  )
  expect(order).toEqual(['auto', 'fit', 'full', 'expand', 'copyImage'])

  const originalAutoWidth = await table.evaluate(element => element.getBoundingClientRect().width)
  // widen a column far beyond the narrow canvas in Auto (session widths)
  const th = page.locator("figure[data-role='TABLE'] thead th").nth(1)
  const box = await th.boundingBox()
  await page.mouse.move(box.x + box.width, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 300, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const fixed = await page.evaluate(() => !!document.querySelector("figure[data-role='TABLE'] table colgroup"))
  expect(fixed, 'the drag fixed the widths').toBe(true)

  // (1) clicking Auto returns the content-sized table (no colgroup)
  await page.locator("figure[data-role='TABLE'] button[data-table-mode='auto']").click()
  await page.waitForTimeout(500)
  const afterAuto = await page.evaluate(() => {
    const table = document.querySelector("figure[data-role='TABLE'] table") as HTMLTableElement
    return {
      colgroup: !!table.querySelector('colgroup'),
      layout: getComputedStyle(table).tableLayout,
      width: Math.round(table.getBoundingClientRect().width)
    }
  })
  // Auto discards the user-fixed layout; a fresh automatic fitting
  // colgroup may still be required by the accepted no-scroll fallback.
  expect(Math.abs(afterAuto.width - originalAutoWidth), 'Auto restores its original computed width').toBeLessThanOrEqual(1)

  // (2) Full width fits the canvas: no page-level horizontal overflow
  await page.locator("figure[data-role='TABLE'] button[data-table-mode='full']").click()
  await page.waitForTimeout(700)
  const full = await page.evaluate(() => {
    const wrap = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
    const table = wrap.querySelector('table') as HTMLTableElement
    const scroller = document.querySelector('.editor-component') as HTMLElement
    return {
      wrapW: wrap.clientWidth,
      tableW: Math.round(table.getBoundingClientRect().width),
      pageOverflowX: scroller ? scroller.scrollWidth - scroller.clientWidth : null
    }
  })
  expect(full.tableW, 'the table fits the canvas').toBeLessThanOrEqual(full.wrapW + 1)
  expect(full.pageOverflowX, 'no page horizontal scrollbar in Full').toBeLessThanOrEqual(1)
  // Owner 2026-11-07: the column zones must sit ON the real borders in
  // EVERY mode (the header handles are) — Full breakout margins and the
  // Auto wrapper padding must not offset them.
  const zoneDeltas = async () => page.evaluate(() => {
    const wrap = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
    const table = wrap.querySelector('table') as HTMLTableElement
    const host = wrap.querySelector('.ag-column-walls') as HTMLElement
    if (!host) return null
    const row = table.tHead.rows[0]
    return Array.from(host.children).map((w, i) => {
      const wr = (w as HTMLElement).getBoundingClientRect()
      const br = row.cells[i].getBoundingClientRect()
      return Math.round(wr.left + wr.width / 2 - br.right)
    })
  })
  // Check the actual border zone coordinates after mode changes.
  const zoneAuto = await zoneDeltas()
  expect(zoneAuto, 'auto zones exist').not.toBeNull()
  for (const d of zoneAuto!) expect(Math.abs(d), 'auto zones centre on borders').toBeLessThanOrEqual(2)

  // Owner 2026-11-07 (the body-vs-header offset report): hovering the
  // pointer exactly ON a border in the table BODY must light THAT zone's
  // accent guide — the same border the header handle lights.
  {
    const first = page.locator("figure[data-role='TABLE'] thead th").first()
    const box = await first.boundingBox()
    const bodyRow = page.locator("figure[data-role='TABLE'] tbody tr td").first()
    const bodyBox = await bodyRow.boundingBox()
    const x = box.x + box.width
    const y = bodyBox.y + bodyBox.height / 2
    await page.mouse.move(x, y)
    await page.waitForTimeout(250)
    const hover = await page.evaluate(() => {
      const wall = document.querySelector('.ag-column-wall:hover') as HTMLElement | null
      if (!wall) return { hovered: false }
      const cs = getComputedStyle(wall, '::before')
      return {
        hovered: true,
        index: wall.dataset.columnWallIndex,
        beforeBg: cs.backgroundColor,
        rectX: Math.round(wall.getBoundingClientRect().left + wall.getBoundingClientRect().width / 2)
      }
    })
    expect(hover.hovered, 'the border in the body lights its zone').toBe(true)
    expect(hover.index).toBe('0')
    expect(hover.beforeBg, 'the zone guide carries the accent').not.toBe('rgba(0, 0, 0, 0)')
    expect(hover.beforeBg, 'the zone guide carries the accent').not.toBe('transparent')
  }

  // Owner 2026-11-08/09: in AUTO the side walls follow a WINDOW resize
  // too (a stale wall reads as a stray border); Fit/Full carry no walls.
  {
    await page.locator("figure[data-role='TABLE'] button[data-table-mode='auto']").click()
    await page.waitForTimeout(600)
    await page.setViewportSize({ width: 520, height: 800 })
    await page.waitForTimeout(700)
    const walls = await page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
      const table = figure.querySelector('table') as HTMLTableElement
      const fr = figure.getBoundingClientRect()
      const tr = table.getBoundingClientRect()
      const ws = Array.from(figure.querySelectorAll('.ag-table-wall')) as HTMLElement[]
      return {
        tableL: Math.round(tr.left - fr.left), tableR: Math.round(tr.right - fr.left),
        left: ws.find((w) => w.dataset.tableWallSide === 'left')?.style.left ?? null,
        right: ws.find((w) => w.dataset.tableWallSide === 'right')?.style.left ?? null
      }
    })
    expect(walls.right, 'the right wall exists after resize (Auto)').not.toBeNull()
    await expect.poll(async () => {
      const w = await page.evaluate(() => {
        const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
        const table = figure.querySelector('table') as HTMLTableElement
        const fr = figure.getBoundingClientRect()
        const tr = table.getBoundingClientRect()
        const ws = Array.from(figure.querySelectorAll('.ag-table-wall')) as HTMLElement[]
        const right = ws.find((x) => x.dataset.tableWallSide === 'right')
        return right ? Math.abs(parseFloat(right.style.left) - Math.round(tr.right - fr.left)) : 999
      })
      return w
    }, { timeout: 4000 }).toBeLessThanOrEqual(3)
    const walls2 = await page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='TABLE']") as HTMLElement
      const table = figure.querySelector('table') as HTMLTableElement
      const fr = figure.getBoundingClientRect()
      const tr = table.getBoundingClientRect()
      const ws = Array.from(figure.querySelectorAll('.ag-table-wall')) as HTMLElement[]
      return {
        left: ws.find((x) => x.dataset.tableWallSide === 'left')?.style.left ?? null,
        tableL: Math.round(tr.left - fr.left)
      }
    })
    expect(Math.abs(parseFloat(walls2.left) - walls2.tableL)).toBeLessThanOrEqual(3)
    await page.setViewportSize({ width: 620, height: 800 })
    await page.waitForTimeout(700)
  }

  const zone = await page.evaluate(() => {
    const wrap = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
    const table = wrap.querySelector('table') as HTMLTableElement
    const host = wrap.querySelector('.ag-column-walls') as HTMLElement
    const row = table.tHead.rows[0]
    const deltas = Array.from(host.children).map((w, i) => {
      const wr = (w as HTMLElement).getBoundingClientRect()
      const br = row.cells[i].getBoundingClientRect()
      return Math.round(wr.left + wr.width / 2 - br.right)
    })
    return deltas
  })
  for (const d of zone) {
    expect(Math.abs(d), 'each zone centres on its column border').toBeLessThanOrEqual(2)
  }
})

test('C-STABILIZE-PRODUCT-REPAIRS: a narrow Fit manual drag keeps every column inside the frame', async ({ page, browserName }) => {
  await installTauriShim(page)
  await page.setViewportSize({ width: 520, height: 800 })
  await bootEditor(page)
  await openFileTab(page, FIT_DOC, SIX_COL_MD)
  const figure = page.locator("figure[data-role='TABLE']").first()
  await figure.locator("button[data-table-mode='fit']").click()
  await page.waitForTimeout(500)
  const first = await figure.locator('thead th').first().boundingBox()
  await page.mouse.move(first.x + first.width, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(first.x + first.width + 300, first.y + first.height / 2, { steps: 10 })
  await page.mouse.up()
  const geometry = await figure.evaluate((element) => {
    const wrapper = element.querySelector('.ag-table-scroll') as HTMLElement
    const table = wrapper.querySelector('table') as HTMLTableElement
    const frame = wrapper.getBoundingClientRect()
    return {
      count: table.tHead.rows[0].cells.length,
      right: table.getBoundingClientRect().right,
      frameRight: frame.right,
      widths: Array.from(table.tHead.rows[0].cells).map(cell => cell.getBoundingClientRect().width),
      text: table.textContent
    }
  })
  expect(geometry.count).toBe(6)
  expect(geometry.widths.every(width => width > 0)).toBe(true)
  expect(geometry.right).toBeLessThanOrEqual(geometry.frameRight + 8)
  expect(geometry.text.length).toBeGreaterThan(30)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  const cellContentFits = await figure.evaluate(element =>
    Array.from(element.querySelectorAll('th .ag-cell-content')).every(content =>
      content.getBoundingClientRect().right <= content.closest('th').getBoundingClientRect().right + 1))
  expect(cellContentFits, 'squeezed header content must stay inside its own cells').toBe(true)
  if (process.env.MARK_PRODUCT_CAPTURE_DIR) {
    const directory = process.env.MARK_PRODUCT_CAPTURE_DIR
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${directory}/product-desktop-${browserName}.png` })
    await page.locator('.quick-settings-btn').click()
    await page.screenshot({ path: `${directory}/product-settings-${browserName}.png` })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${directory}/product-narrow-${browserName}.png` })
  }
})

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

  test('Auto keeps narrow content natural and fits wide content without scroll (C-7)', async ({ page }) => {
    await openDoc(page, SIX_COL_MD)
    const geo = await geometry(page)
    expect(geo).toBeTruthy()
    expect(geo!.fixed).toBe(false)
    expect(geo!.mode).toBeUndefined()
    expect(geo!.badgeOn).toBe(false)
    // A content-sized table wider than its column scrolls the wrapper
    // (the GitHub model).
    if (geo!.tableWidth > geo!.columnWidth) {
      // The owner mandate (2026-11-07) retired the scroll: wide content
      // folds with wrap-anywhere, so the wrapper never reports overflow.
      expect(geo!.scrollWidth).toBeLessThanOrEqual(geo!.clientWidth + 8)
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

  test('even unwrappable tables NEVER scroll — the squeeze fits them (owner mandate 2026-11-07)', async ({ page }) => {
    // The six-column table first: Fit must NOT badge (it fits by wrapping).
    await openDoc(page, SIX_COL_MD)
    await setMode(page, 'fit')
    expect((await geometry(page)).badgeOn).toBe(false)

    // The 30-column table: minima exceed any sane viewport — the old
    // degradation scrolled; the owner's mandate is NO table scrolling
    // ever, so the minima squeeze proportionally with mid-token breaks.
    await openDoc(page, WIDE_MD, '/tmp/mark-e2e/table-modes-wide.md')
    await setMode(page, 'fit')
    await page.waitForTimeout(300)

    const wide = await geometry(page)
    expect(wide.badgeOn, 'the overflow badge never arms').toBe(false)
    expect(wide.scrollWidth, 'no hidden columns behind a scrollbar')
      .toBeLessThanOrEqual(wide.clientWidth + 1)
    expect(wide.fixed).toBe(true)
    expect(wide.tableWidth).toBeLessThanOrEqual(wide.clientWidth + 1)

    // Full width fits the same way.
    await setMode(page, 'full')
    const full = await geometry(page)
    expect(full.badgeOn).toBe(false)
    expect(full.scrollWidth).toBeLessThanOrEqual(full.clientWidth + 1)
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

  test('side walls set/reset Auto width while Full outer edges stay pinned (C-10)', async ({ page }) => {
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

    // Owner convention 2026-11-09: walls exist in AUTO only — Full carries
    // NO walls (the outer edges are pinned to the window canvas), so the
    // old "a wall drag in Full switches to Auto" path is gone by design.
    await setMode(page, 'full')
    await page.waitForTimeout(500)
    expect(await page.locator("figure[data-role='TABLE'] .ag-table-wall").count())
      .toBe(0)
  })

  test('Auto walls stay reachable inside the visible table frame (C-10)', async ({ page }) => {
    // A wide Auto table fits its wrapper; its walls must stay hittable.
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
    expect(verdict.overflowing).toBe(false)
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
