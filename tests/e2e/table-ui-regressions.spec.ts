// FILE: tests/e2e/table-ui-regressions.spec.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce wide-table centering, viewer zoom reachability and localized tooltip layout regressions reported on 2026-10-19.
//   SCOPE: Chromium/WebKit viewport geometry and late outline visibility, click-driven viewer zoom and ten-locale image labels.
//   DEPENDS: @playwright/test, fixtures/tauri-shim, fixtures/helpers, static/locales.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   MEDIUM_TABLE - natural-width table wider than the text column but narrower than a large editor viewport.
//   locales - ten shipped translation dictionaries, excluding generated minified copies.
//   tableGeometry - actual table center and available editor bounds.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Reproduce late owned-outline visibility and preserve viewport-centered geometry without a window resize.
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
const locales = readdirSync(resolve('static/locales')).filter(f => f.endsWith('.json') && !f.endsWith('.min.json'))
  .map(f => ({ name: f, data: JSON.parse(readFileSync(resolve('static/locales', f), 'utf8')) }))

const tableGeometry = (page: Page) => page.evaluate(() => {
  const table = document.querySelector("figure[data-role='TABLE'] table")!
  const scroller = document.querySelector('.editor-component') as HTMLElement
  const overlay = document.querySelector('[data-editor-overlay-right]')
  const tr = table.getBoundingClientRect()
  const sr = scroller.getBoundingClientRect()
  const or = overlay?.getBoundingClientRect()
  const viewportRight = sr.left + scroller.clientWidth
  const right = or && or.width > 0 && or.left > sr.left && or.left < viewportRight ? or.left - 24 : viewportRight
  return { tableLeft: tr.left, tableWidth: tr.width, center: (tr.left + tr.right) / 2,
    availableLeft: sr.left, availableRight: right, centerExpected: (sr.left + right) / 2,
    scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth }
})

test.beforeEach(async ({ page }) => { await installTauriShim(page) })

for (const sidebar of [false, true]) test(`expanded table stays centered after resize with sidebar ${sidebar}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await bootEditor(page, { sideBarVisibility: sidebar })
  await openFileTab(page, '/tmp/mark-e2e/table-center.md', MEDIUM_TABLE)
  await expect(page.locator("figure[data-role='TABLE']")).toHaveClass(/ag-table-full-width/)
  for (const width of [1600, 1400, 1800]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(async () => {
      const g = await tableGeometry(page)
      expect(g.tableWidth).toBeLessThan(g.availableRight - g.availableLeft - 48)
      return Math.abs(g.center - g.centerExpected)
    }).toBeLessThanOrEqual(2)
  }
  await page.screenshot({ path: testInfo.outputPath('table-centered.png') })
})

test('late outline visibility keeps an expanded table centered without a window resize', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/table-late-outline.md', MEDIUM_TABLE)
  await expect(page.locator("figure[data-role='TABLE']")).toHaveClass(/ag-table-full-width/)
  const rail = page.locator('.outline-rail')
  await expect(rail).toBeVisible()
  await page.evaluate(() => (window as any).__bus.emit('cmd::execute', 'view.outline'))
  await expect(rail).toBeHidden()
  await page.evaluate(() => document.fonts.ready)
  // Settle the existing 300ms startup resize throttle before changing only the rail.
  await page.waitForTimeout(400)
  await expect.poll(async () => {
    const g = await tableGeometry(page)
    return Math.abs(g.center - g.centerExpected)
  }).toBeLessThanOrEqual(2)
  for (const visible of [true, false]) {
    await page.evaluate(() => (window as any).__bus.emit('cmd::execute', 'view.outline'))
    if (visible) await expect(rail).toBeVisible()
    else await expect(rail).toBeHidden()
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
