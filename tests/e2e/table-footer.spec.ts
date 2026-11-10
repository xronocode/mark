// FILE: tests/e2e/table-footer.spec.ts
// VERSION: 1.4.1
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce the owner's table/counter/scrollbar spacing report and pin a compact constant-height reserved footer.
//   SCOPE: Real Chromium/WebKit caption placement, 2px scrollbar gap, continuous shade paint through the noneditable caption, sticky counter visibility, fitting-table width-control gating including restored Full width, bottom drag-handle hit testing and unchanged Markdown.
//   DEPENDS: @playwright/test, fixtures/tauri-shim, fixtures/helpers, built renderer.
//   LINKS: .grace/changes/active/C-TABLE-FOOTER; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   TABLES - long-cell and narrow fixtures with content after each table.
//   LEGACY_NARROW_LAYOUT - saved Full width choice for the second table's stable ordinal/header identity.
//   footer - actual table, caption and native scrollbar geometry for one figure.
//   documentState - normalized Markdown and saved state for non-editing interactions.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-10 C-STABILIZE-RICH-BOOT-BASELINES: wait for the
//   initial rich content revision before byte baselines; retain exact
//   Markdown/saved comparisons and all pointer/geometry oracles.
//   CURRENT: 2026-11-10 C-STABILIZE-TABLE-E2E: verify accepted no-scroll
//   fitting/icon-only controls together with natural-size viewer access, real
//   pointer/keyboard interactions and preserved document/dirty semantics.
//   LAST_CHANGE: 1.4.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: the two
//   toggle-based pins move to the honest model — a fitting table keeps
//   Copy, has no expand action and carries the always-available mode
//   segment on Auto (the need-gated toggle is retired), and the restored
//   legacy fullWidth entry pins the migrated v2 mode on the segment.
//   LAST_CHANGE: 1.3.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: the width-mode preamble moves from the retired fake-fit toggle to the T-007 mode segment (Full width chosen explicitly; Auto carries the in-column overflow state).
//   LAST_CHANGE: v1.2.0 - 2026-10-20 C-TABLE-FOOTER owner review: screenshot pixels catch the noneditable caption background lightening the edge shade.
//   PREV: v1.1.0 - 2026-10-20 C-TABLE-FOOTER owner review: no width toggle or stray counter on fitting tables, including a restored Full width choice.
//   PREV: v1.0.0 - 2026-10-20 C-TABLE-FOOTER: counter inside the scroll block above its scrollbar, with compact stable invisible space when fitting.
// END_CHANGE_SUMMARY

import { test, expect, type Page, type Locator } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const TABLES = `# Compact footer

| Description | Additional context | Result |
| --- | --- | --- |
| A deliberately long cell containing ordinary words that should wrap inside the table without changing the page centre. | Another long explanation that makes the natural table wider than the text column while keeping all content readable. | A long result with supporting details and a clear outcome for the table layout regression. |

Paragraph after the wide table.

| A | B |
| --- | --- |
| one | two |

Paragraph after the narrow table.
`

// Historical profile identity for ordinal 1 with the headers A/B.
const LEGACY_NARROW_LAYOUT = {
  version: 1,
  files: {
    '/tmp/mark-e2e/table-footer.md': {
      '1#2:3769c9': { widths: [], manual: [], fullWidth: true }
    }
  }
}

const footer = (figure: Locator) => figure.evaluate(el => {
  const wrapper = el.querySelector('.ag-table-scroll') as HTMLElement
  const table = wrapper.querySelector('table')!
  const caption = el.querySelector('.ag-table-caption') as HTMLElement
  const wr = wrapper.getBoundingClientRect()
  const tr = table.getBoundingClientRect()
  const cr = caption.getBoundingClientRect()
  const textRange = document.createRange()
  textRange.selectNodeContents(caption)
  const nativeBar = wrapper.offsetHeight - wrapper.clientHeight
  return { inside: caption.parentElement === wrapper, tableBottom: tr.bottom,
    captionTop: cr.top, captionBottom: cr.bottom, captionRight: cr.right,
    captionTextRight: textRange.getBoundingClientRect().right,
    wrapperLeft: wr.left, wrapperRight: wr.right, scrollWidth: wrapper.scrollWidth,
    clientWidth: wrapper.clientWidth, footerSpace: wr.bottom - tr.bottom,
    scrollbarTop: wr.bottom - Math.max(6, nativeBar),
    captionVisible: getComputedStyle(caption).visibility,
    captionText: caption.textContent || '' }
})

const documentState = (page: Page) => page.evaluate(() => {
  const app = document.querySelector('#app') as any
  const file = app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
  return { markdown: file.markdown, isSaved: file.isSaved }
})

test.beforeEach(async ({ page }) => {
  await installTauriShim(page)
  await page.setViewportSize({ width: 1400, height: 900 })
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/table-footer.md', TABLES)
})

test('reserved footer stays compact and clear when fitted tables no longer need a scrolling counter', async ({ page }, testInfo) => {
  const figure = page.locator("figure[data-role='TABLE']").first()
  // Wait for the owned model blocks, without requiring a text revision on import.
  await expect.poll(() => page.evaluate(() => {
    const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
    return file?.blocks?.length ?? 0
  })).toBeGreaterThan(0)
  const beforeDocument = await documentState(page)
  const geometry = await footer(figure)
  expect(geometry.inside).toBe(true)
  expect(Math.abs(geometry.captionTop - geometry.tableBottom)).toBeLessThanOrEqual(1)
  expect(geometry.scrollbarTop - geometry.captionBottom).toBeGreaterThanOrEqual(1)
  expect(geometry.scrollbarTop - geometry.captionBottom).toBeLessThanOrEqual(3)
  expect(geometry.footerSpace).toBeGreaterThanOrEqual(26)
  expect(geometry.footerSpace).toBeLessThanOrEqual(30)
  expect(geometry.captionVisible).toBe('hidden')
  expect(geometry.captionText).toBe('')
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
  // A real horizontal gesture cannot hide columns or move the footer.
  await figure.locator('.ag-table-scroll').hover()
  await page.mouse.wheel(500, 0)
  const after = await footer(figure)
  expect(after.captionRight).toBeCloseTo(geometry.captionRight, 0)
  expect(after.footerSpace).toBeCloseTo(geometry.footerSpace, 0)
  expect(await figure.locator('.ag-table-scroll').evaluate(el => el.scrollLeft)).toBe(0)
  const cells = await figure.locator('th,td').evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect()
    const wr = el.closest('.ag-table-scroll')!.getBoundingClientRect()
    return { text: el.textContent, visible: r.width > 0 && r.left >= wr.left - 1 && r.right <= wr.right + 1 }
  }))
  expect(cells).toHaveLength(6)
  expect(cells.every(cell => !!cell.text && cell.visible)).toBe(true)
  expect(await documentState(page)).toEqual(beforeDocument)
  await page.screenshot({ path: testInfo.outputPath('compact-table-footer.png') })
})

test('reserved footer is equally tall and invisible across Auto, Fit, Full and narrow tables', async ({ page }) => {
  const wide = page.locator("figure[data-role='TABLE']").first()
  const narrow = page.locator("figure[data-role='TABLE']").nth(1)
  const before = await documentState(page)
  const fitting = await footer(narrow)
  expect(fitting.inside).toBe(true)
  expect(fitting.captionVisible).toBe('hidden')
  expect(fitting.captionText).toBe('')
  for (const mode of ['auto', 'fit', 'full', 'auto']) {
    await wide.locator(`button.ag-table-toolbar-mode[data-table-mode='${mode}']`).click()
    const fitted = await footer(wide)
    expect(fitted.captionVisible).toBe('hidden')
    expect(fitted.captionText).toBe('')
    expect(fitted.scrollWidth).toBeLessThanOrEqual(fitted.clientWidth + 1)
    expect(Math.abs(fitting.footerSpace - fitted.footerSpace)).toBeLessThanOrEqual(1)
    await expect(wide.locator('.ag-table-toolbar-expand')).toBeVisible()
  }
  expect(await documentState(page)).toEqual(before)
})

test('a fitting table keeps copy reachable, no expand action, and its always-available mode segment on Auto', async ({ page }) => {
  const narrow = page.locator("figure[data-role='TABLE']").nth(1)
  const before = await documentState(page)
  await narrow.hover()
  await expect(narrow.locator('.ag-table-toolbar-copy')).toBeVisible()
  await expect(narrow.locator('.ag-table-toolbar-expand')).not.toBeVisible()
  // T-007: the width control is the three-button mode segment now —
  // present on every table (R-8: Auto is one click from any mode), not a
  // need-gated toggle; a fitting table sits on Auto and shows no cue.
  const modes = narrow.locator('button.ag-table-toolbar-mode')
  await expect(modes).toHaveCount(3)
  await expect(narrow.locator("button.ag-table-toolbar-mode[data-table-mode='auto']")).toHaveClass(/ag-table-toolbar-active/)
  expect((await footer(narrow)).captionText).toBe('')
  expect(await documentState(page)).toEqual(before)
})

test('a restored narrow legacy-fullWidth table sits on the full mode with no stray column counter', async ({ page }) => {
  await page.addInitScript(profile => {
    const w = window as any
    w.__mockInvoke = { ...w.__mockInvoke,
      mt_prefs_get: ({ key }: { key: string }) => key === 'tableLayouts' ? profile : null,
      mt_fs_stat: ({ path }: { path: string }) => ({
        isFile: path === '/tmp/mark-e2e/table-footer.md', isDirectory: false
      }) }
  }, LEGACY_NARROW_LAYOUT)
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/table-footer.md', TABLES)
  const narrow = page.locator("figure[data-role='TABLE']").nth(1)
  await expect(narrow).toHaveClass(/ag-table-full-width/)
  // The legacy fullWidth boolean migrates one-way to the v2 mode: the
  // segment marks Full width active on the restored narrow table.
  await expect(narrow.locator("button.ag-table-toolbar-mode[data-table-mode='full']")).toHaveClass(/ag-table-toolbar-active/)
  const before = await documentState(page)
  const geometry = await footer(narrow)
  expect(geometry.captionText).toBe('')
  expect(geometry.captionVisible).toBe('hidden')
  expect(await documentState(page)).toEqual(before)
})

test('the selected column drag handle remains reachable over the reserved footer', async ({ page }) => {
  const figure = page.locator("figure[data-role='TABLE']").first()
  await figure.hover()
  await figure.locator("button.ag-table-toolbar-mode[data-table-mode='full']").click()
  // Select the second column: its bottom handle can share the caption's
  // horizontal range, so moving the caption must not intercept its input.
  await figure.locator('tbody td').nth(1).click({ position: { x: 80, y: 15 } })
  const handle = figure.locator('.ag-drag-handler.bottom')
  await expect(handle).toBeVisible()
  expect(await handle.evaluate(el => {
    const r = el.getBoundingClientRect()
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.ag-drag-handler.bottom') === el
  })).toBe(true)
})
