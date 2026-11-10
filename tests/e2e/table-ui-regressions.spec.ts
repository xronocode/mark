// FILE: tests/e2e/table-ui-regressions.spec.ts
// VERSION: 1.4.1
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce wide-table centering, viewer zoom reachability and localized tooltip layout regressions reported on 2026-10-19.
//   SCOPE: Chromium/WebKit full-editor table geometry, scroll-driven whole-outline occlusion/restoration, late outline visibility, click-driven viewer zoom and ten-locale image labels.
//   DEPENDS: @playwright/test, fixtures/tauri-shim, fixtures/helpers, static/locales.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   MEDIUM_TABLE - natural-width table wider than the text column but narrower than a large editor viewport.
//   LONG_CELL_TABLE - long prose cells fitting the editor while exceeding the outline-reduced width.
//   locales - ten shipped translation dictionaries.
//   tableGeometry - actual table center and full owning editor client bounds.
//   documentState - current normalized Markdown and saved flag for scroll-only mutation checks.
//   chooseFullWidth - evaluate-click helper: explicitly chooses the honest Full width mode through the toolbar segment (T-007 — nothing auto-expands anymore).
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-10 C-STABILIZE-RICH-BOOT-BASELINES: wait for the
//   initial rich content revision before byte baselines; retain exact
//   Markdown/saved comparisons and all pointer/geometry oracles.
//   CURRENT: 2026-11-10 C-STABILIZE-TABLE-E2E: verify accepted no-scroll
//   fitting/icon-only controls together with natural-size viewer access, real
//   pointer/keyboard interactions and preserved document/dirty semantics.
//   LAST_CHANGE: v1.4.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: the
//   expanded-state cases choose Full width explicitly through the mode
//   segment (nothing auto-expands in the honest model), and the
//   outline-occlusion flip walks Auto (in-column wrapper scroll, rail
//   visible) ↔ Full width (the editor scrolls, the rail hides) instead of
//   clicking the retired two-state toggle.
//   PREV: v1.3.0 - Pin the owner's scroll-driven whole-outline intersection rule without hover, page shift or content changes.
//   PREV: v1.2.0 - Reproduce the remaining long-cell centering fault against editor bounds independently of outline placement.
//   PREV: v1.1.0 - Reproduce late owned-outline visibility and preserve viewport-centered geometry without a window resize.
//   PREV: v1.0.0 - 2026-10-19: user-reported table and tooltip regressions, verified in both rendering engines.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const MEDIUM_TABLE = `# Table alignment

| First column | Second column | Third column | Fourth column | Fifth column | Sixth column |
| --- | --- | --- | --- | --- | --- |
| alpha payload | beta payload | gamma payload | delta payload | epsilon payload | zeta payload |

Text after the table.

## Second section

Some text.

## Third section

More text.
`
const locales = readdirSync(resolve('static/locales')).filter(f => f.endsWith('.json'))
  .map(f => ({ name: f, data: JSON.parse(readFileSync(resolve('static/locales', f), 'utf8')) }))

const LONG_CELL_TABLE = `# Long-cell table

| Description | Additional context | Result |
| --- | --- | --- |
| This is a deliberately long cell containing several ordinary words that should wrap inside the table without changing the page centre. | Another long explanation that makes the natural table wider than the text column while keeping all content readable. | A long result with supporting details and a clear outcome for the table layout regression. |

## Second section

Paragraph after the table.

## Third section

More supporting text.
`

const tableGeometry = (page: Page) => page.evaluate(() => {
  const table = document.querySelector("figure[data-role='TABLE'] table")!
  const scroller = document.querySelector('.editor-component') as HTMLElement
  const tr = table.getBoundingClientRect()
  const sr = scroller.getBoundingClientRect()
  const viewportRight = sr.left + scroller.clientWidth
  const right = viewportRight
  return { tableLeft: tr.left, tableWidth: tr.width, center: (tr.left + tr.right) / 2,
    availableLeft: sr.left, availableRight: right, centerExpected: (sr.left + right) / 2,
    scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth }
})

const documentState = (page: Page) => page.evaluate(() => {
  const app = document.querySelector('#app') as any
  const file = app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
  return { markdown: file.markdown, isSaved: file.isSaved }
})

test.beforeEach(async ({ page }) => { await installTauriShim(page) })

// T-007: the expanded state is the honest Full width mode — nothing
// auto-expands anymore, so the mode is chosen explicitly through the
// toolbar segment (the same evaluate-click the canon mode suites use).
const chooseFullWidth = (page: Page) => page.evaluate(() => {
  const button = document.querySelector("figure[data-role='TABLE'] button.ag-table-toolbar-mode[data-table-mode='full']") as HTMLElement | null
  if (button) button.click()
})

test('long-cell table centers in the full editor while the outline remains overlaid', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/long-cell-center.md', LONG_CELL_TABLE)
  // The outline retains its independent box even when an intersecting table hides it.
  expect(await page.locator('.outline-rail').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(0)
  await chooseFullWidth(page)
  await expect(page.locator("figure[data-role='TABLE']")).toHaveClass(/ag-table-full-width/)
  // T-007: the honest distribution fills the window canvas up to its 24 px
  // side gutters (a fitting table is capped at exactly available − 48;
  // a degrading one stays inside the canvas too — never beyond it).
  await expect.poll(async () => {
    const g = await tableGeometry(page)
    return g.tableWidth <= g.clientWidth - 46
      ? Math.abs(g.center - g.centerExpected)
      : Number.POSITIVE_INFINITY
  }).toBeLessThanOrEqual(2)
  await expect(page.locator('.outline-rail')).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('long-cell-centered.png') })
  // The width-mode flip now walks the segment: Auto keeps the table in its
  // column (wrapper scroll, no page overflow → the rail shows); Full width
  // scrolls the editor over the rail (hidden).
  const figure = page.locator("figure[data-role='TABLE']")
  await figure.hover()
  await page.evaluate(() => {
    (document.querySelector("figure[data-role='TABLE'] button.ag-table-toolbar-mode[data-table-mode='auto']") as HTMLElement).click()
  })
  await expect(page.locator('.outline-rail')).toBeVisible()
  await page.evaluate(() => {
    (document.querySelector("figure[data-role='TABLE'] button.ag-table-toolbar-mode[data-table-mode='full']") as HTMLElement).click()
  })
  await expect(page.locator("figure[data-role='TABLE']")).toHaveClass(/ag-table-full-width/)
  await expect(page.locator('.outline-rail')).toBeHidden()
})

test('table intersection hides the whole outline during scrolling without hover or page shift', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await bootEditor(page)
  const markdown = `# Scroll intersection\n\n${'Introductory paragraph.\n\n'.repeat(30)}${LONG_CELL_TABLE}\n${'Trailing paragraph.\n\n'.repeat(40)}`
  await openFileTab(page, '/tmp/mark-e2e/table-outline-intersection.md', markdown)
  // The intersection premise needs the expanded canvas-filling table
  // (T-007: chosen explicitly through the segment — nothing auto-expands).
  await chooseFullWidth(page)
  await expect(page.locator("figure[data-role='TABLE']")).toHaveClass(/ag-table-full-width/)
  // A visible table/fonts frame can precede initial store serialization.
  await expect.poll(() => page.evaluate(() => {
    const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
    return file?.contentRevision ?? 0
  })).toBeGreaterThan(0)
  const beforeDocument = await documentState(page)
  expect(beforeDocument.isSaved).toBe(true)
  const rail = page.locator('.outline-rail')
  await expect(rail).toBeVisible()
  await page.mouse.move(5, 5)
  const before = await rail.evaluate(el => el.getBoundingClientRect().toJSON())
  // Scroll the table into the rail with the pointer outside the editor.
  await page.locator("figure[data-role='TABLE'] table").evaluate(table => {
    const scroller = table.closest('.editor-component')!
    scroller.scrollTop += table.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 80
  })
  await expect(rail).toBeHidden()
  expect(await rail.evaluate(el => el.getBoundingClientRect().toJSON())).toEqual(before)
  await expect(rail).toHaveAttribute('inert', '')
  await expect(rail).toHaveAttribute('aria-hidden', 'true')
  const overlapping = await page.locator("figure[data-role='TABLE'] table").boundingBox()
  await page.mouse.move(overlapping!.x + 20, overlapping!.y + 20)
  await expect(rail).toBeHidden()
  expect(await page.locator("figure[data-role='TABLE'] table").boundingBox()).toEqual(overlapping)
  await page.screenshot({ path: testInfo.outputPath('outline-hidden-at-intersection.png') })
  // Continue until the table is fully clipped above the scrollport.
  await page.locator("figure[data-role='TABLE'] table").evaluate(table => {
    const scroller = table.closest('.editor-component')!
    scroller.scrollTop += table.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + 10
  })
  await expect(rail).toBeVisible()
  expect(await rail.evaluate(el => el.getBoundingClientRect().toJSON())).toEqual(before)
  await expect(rail).not.toHaveAttribute('inert', '')
  await expect(rail).not.toHaveAttribute('aria-hidden', 'true')
  expect(await documentState(page)).toEqual(beforeDocument)
})

for (const sidebar of [false, true]) test(`expanded table stays centered after resize with sidebar ${sidebar}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await bootEditor(page, { sideBarVisibility: sidebar })
  await openFileTab(page, '/tmp/mark-e2e/table-center.md', MEDIUM_TABLE)
  await chooseFullWidth(page)
  await expect(page.locator("figure[data-role='TABLE']")).toHaveClass(/ag-table-full-width/)
  // T-007: the honest distribution caps a fitting table at the canvas
  // gutters (available − 48); it must never spill beyond them. The resize
  // is re-announced because headless Chromium occasionally coalesces the
  // window resize event away (the rendering frame it rides on never
  // runs); a real windowed resize always delivers it, and the funnel the
  // event drives (refit → distribution → centering) is what this case
  // pins.
  for (const width of [1600, 1400, 1800]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await expect.poll(async () => {
      const g = await tableGeometry(page)
      return g.tableWidth <= g.availableRight - g.availableLeft - 46
        ? Math.abs(g.center - g.centerExpected)
        : Number.POSITIVE_INFINITY
    }).toBeLessThanOrEqual(2)
  }
  await page.screenshot({ path: testInfo.outputPath('table-centered.png') })
})

test('late outline visibility keeps an expanded table centered without a window resize', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/table-late-outline.md', MEDIUM_TABLE)
  // T-007: the expanded state is the honest Full width mode, chosen
  // explicitly. Its canvas-filling table occludes the rail from the start
  // (the old case could keep the rail visible next to a natural-width
  // expanded table — the honest distribution spans the whole canvas).
  await chooseFullWidth(page)
  await expect(page.locator("figure[data-role='TABLE']")).toHaveClass(/ag-table-full-width/)
  const rail = page.locator('.outline-rail')
  await expect(rail).toBeHidden()
  await page.evaluate(() => document.fonts.ready)
  // Settle the existing 300ms startup resize throttle before changing only the rail.
  await page.waitForTimeout(400)
  await expect.poll(async () => {
    const g = await tableGeometry(page)
    return Math.abs(g.center - g.centerExpected)
  }).toBeLessThanOrEqual(2)
  // Late rail commands fire while the table occludes the rail: occlusion
  // wins every time and the centering never shifts (the honest
  // distribution runs once per frame change, never per rail event).
  for (const visible of [true, false]) {
    await page.evaluate(() => (window as any).__bus.emit('cmd::execute', 'view.outline'))
    await expect(rail).toBeHidden()
    await expect.poll(async () => {
      const g = await tableGeometry(page)
      return Math.abs(g.center - g.centerExpected)
    }).toBeLessThanOrEqual(2)
  }
})

test('table viewer zoom buttons remain visible, operable and fitted on a narrow window', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 600, height: 700 })
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/table-zoom.md', MEDIUM_TABLE)
  const before = await documentState(page)
  const figure = page.locator("figure[data-role='TABLE']").first()
  await figure.hover()
  await figure.locator('button.ag-block-toolbar-expand').click()
  const viewer = page.locator('.ag-block-viewer-open')
  await expect(viewer).toBeVisible()
  const scale = () => viewer.locator('.ag-block-viewer-canvas').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)
  await expect.poll(scale).toBeGreaterThan(0)
  for (const selector of ['.ag-block-viewer-zoom-in', '.ag-block-viewer-zoom-out', '.ag-block-viewer-fit']) {
    const button = viewer.locator(selector)
    await expect(button).toBeInViewport({ ratio: 1 })
    await expect(button).toHaveAccessibleName(/.+/)
  }
  await expect(viewer.locator('.ag-block-viewer-zoom-in svg')).toBeVisible()
  await expect(viewer.locator('.ag-block-viewer-zoom-out svg')).toBeVisible()
  // Wait until both initial fitting passes have settled by selecting 1:1.
  await viewer.locator('.ag-block-viewer-actual-size').click()
  await expect.poll(scale).toBeCloseTo(1, 2)
  const natural = await viewer.locator('.ag-block-viewer-canvas table').evaluate(el => ({ width: el.getBoundingClientRect().width, text: el.textContent }))
  const fitted = await figure.locator('table').evaluate(el => ({ width: el.getBoundingClientRect().width, text: el.textContent }))
  expect(natural.width).toBeGreaterThan(fitted.width + 2)
  expect(natural.text).toBe(fitted.text)
  expect(await documentState(page)).toEqual(before)

  await viewer.locator('.ag-block-viewer-zoom-in').click()
  await expect.poll(scale).toBeGreaterThan(1.1)
  await viewer.locator('.ag-block-viewer-zoom-out').click()
  await expect.poll(scale).toBeCloseTo(1, 2)
  await viewer.locator('.ag-block-viewer-fit').click()
  await expect.poll(scale).toBeLessThan(1)
  await page.screenshot({ path: testInfo.outputPath('viewer-zoom.png') })
})

test('image toolbar tooltips fit all shipped labels on one readable line', async ({ page }) => {
  await bootEditor(page)
  const labels = locales.flatMap(({ name, data }) => Object.values(data.editor.image.toolbar).map(text => ({ name, text: String(text) })))
  for (const label of labels) {
    await page.evaluate(text => {
      document.querySelector('#tooltip-layout-fixture')?.remove()
      const host = document.createElement('div')
      host.id = 'tooltip-layout-fixture'
      host.className = 'ag-image-toolbar'
      host.style.cssText = 'position:fixed;left:50%;top:200px;z-index:100002'
      host.innerHTML = '<ul><li class="item"><div class="tooltip"></div></li></ul>'
      host.querySelector('.tooltip')!.textContent = text
      document.body.appendChild(host)
    }, label.text)
    await page.locator('#tooltip-layout-fixture li').hover()
    const layout = await page.locator('#tooltip-layout-fixture .tooltip').evaluate(el => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const box = el.getBoundingClientRect()
      const text = range.getBoundingClientRect()
      return { lines: range.getClientRects().length, textTop: text.top, textBottom: text.bottom, top: box.top, bottom: box.bottom,
        left: box.left, right: box.right, viewport: innerWidth }
    })
    expect(layout.lines, `${label.name}: ${label.text}`).toBe(1)
    expect(layout.textTop, label.text).toBeGreaterThanOrEqual(layout.top)
    expect(layout.textBottom, label.text).toBeLessThanOrEqual(layout.bottom)
    expect(layout.left).toBeGreaterThanOrEqual(0)
    expect(layout.right).toBeLessThanOrEqual(layout.viewport)
  }
})

test('general and Element Plus tooltips keep short labels readable and wrap long content within the viewport', async ({ page }) => {
  await bootEditor(page)
  const labels = locales.flatMap(({ data }) => Object.values(data.editor.image.toolbar).map(String))
  for (const className of ['ag-tooltip active', 'el-popper is-tooltip is-dark']) {
    const results = await page.evaluate(({ className, labels }) => labels.map(text => {
      const tip = document.createElement('div')
      tip.className = className
      tip.textContent = text
      document.body.appendChild(tip)
      const range = document.createRange()
      range.selectNodeContents(tip)
      const rects = Array.from(range.getClientRects())
      const rect = tip.getBoundingClientRect()
      tip.remove()
      return { text, lineCount: new Set(rects.map(r => r.top)).size, fits: rect.width < innerWidth }
    }), { className, labels })
    for (const result of results) {
      expect(result.lineCount, `${className}: ${result.text}`).toBe(1)
      expect(result.fits).toBe(true)
    }
  }
  const long = await page.evaluate(() => {
    const tip = document.createElement('div')
    tip.className = 'ag-tooltip active'
    tip.textContent = 'long-word-'.repeat(100)
    document.body.appendChild(tip)
    const range = document.createRange()
    range.selectNodeContents(tip)
    return { width: tip.getBoundingClientRect().width, viewport: innerWidth,
      lines: range.getClientRects().length, height: tip.clientHeight, scrollHeight: tip.scrollHeight }
  })
  expect(long.width).toBeLessThanOrEqual(long.viewport - 16)
  expect(long.lines).toBeGreaterThan(1)
  expect(long.scrollHeight).toBeLessThanOrEqual(long.height)
})

test('real image toolbar hover wires label positioning and shows a readable label for every action', async ({ page }) => {
  await bootEditor(page)
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="green"/></svg>'
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  await openFileTab(page, '/tmp/mark-e2e/tooltip-image.md', `# Image tools\n\n![Example](${src})\n`)
  const image = page.locator('span.ag-inline-image img').first()
  await expect(image).toBeVisible()
  await image.click()
  const toolbar = page.locator('.ag-float-container.ag-image-toolbar').first()
  await expect(toolbar).toBeVisible()
  for (const item of await toolbar.locator('li.item').all()) {
    await item.hover()
    const tip = item.locator('.tooltip')
    await expect(tip).toBeVisible()
    const geometry = await tip.evaluate(el => {
      const rect = el.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(el)
      return { left: rect.left, right: rect.right, viewport: innerWidth,
        lines: range.getClientRects().length, shift: (el as HTMLElement).style.getPropertyValue('--tooltip-shift-x') }
    })
    expect(geometry.shift).not.toBe('')
    expect(geometry.lines).toBe(1)
    expect(geometry.left).toBeGreaterThanOrEqual(8)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport - 8)
  }
})
