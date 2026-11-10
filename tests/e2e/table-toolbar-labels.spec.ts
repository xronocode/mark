// FILE: tests/e2e/table-toolbar-labels.spec.ts
// VERSION: 2.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce shrinking corner panels when moving between table/diagram buttons and pin cumulative label reveal until whole-panel exit.
//   SCOPE: Real pointer traversal over table, Mermaid and Vega-Lite inline toolbars in Chromium/WebKit; label visibility, nonshrinking button/panel widths, panel anchoring, exit reset and unchanged document state.
//   DEPENDS: @playwright/test, fixtures/tauri-shim, fixtures/helpers, built renderer; existing webkit-tables project includes this table-*.spec.ts file.
//   LINKS: .grace/changes/active/C-TOOLBAR-LABELS; .grace/changes/active/C-PAGE-WIDTH-TABLES T-007 (the table pill's three-button mode segment); .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   CONTENT - wide table, Mermaid and Vega-Lite fixtures with the shared expanding-label panels.
//   documentState - normalized Markdown and saved state, excluding view-only selection.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-10 C-STABILIZE-RICH-BOOT-BASELINES: wait for the
//   initial rich content revision before byte baselines; retain exact
//   Markdown/saved comparisons and all pointer/geometry oracles.
//   LAST_CHANGE: v2.0.0 - 2026-11-05 owner review: the expanding pill
//   labels are RETIRED everywhere (tables AND diagrams) — every button
//   renders icon-only, the names live in tooltips, the pill never
//   auto-sizes. The visited-label walk is replaced by an icon-only pin.
//   PREV: v1.2.0 - 2026-11-05 owner review: the table pill's mode
//   segment renders icon-only (no expanding labels); the visited-label
//   walk covers the label-carrying buttons and the mode buttons pin the
//   no-span/no-grow behaviour.
//   PREV: v1.1.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: the
//   preamble click on the retired two-state width toggle is gone — the
//   table pill now carries the always-visible three-button mode segment
//   (Auto / Fit to page / Full width), so the traversal walks five real
//   buttons with no setup click.
//   PREV: v1.0.0 - 2026-10-20 C-TOOLBAR-LABELS: visited labels remain open through adjacent-button traversal, then reset on leaving the panel.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const CONTENT = `# Toolbar labels

| Description | Additional context | Result |
| --- | --- | --- |
| A deliberately long cell containing ordinary words that should wrap inside the table without changing the page centre. | Another long explanation that makes the natural table wider than the text column while keeping all content readable. | A long result with supporting details and a clear outcome for the table layout regression. |

## Diagram

\`\`\`mermaid
flowchart LR
${Array.from({ length: 13 }, (_, i) => `N${i}[Stage ${i + 1}] --> N${i + 1}[Stage ${i + 2}]`).join('\n')}
\`\`\`

## Chart

\`\`\`vega-lite
{"width":1200,"height":220,"data":{"values":[{"stage":"Draft","hours":4},{"stage":"Review","hours":3},{"stage":"Verify","hours":2}]},"mark":"bar","encoding":{"x":{"field":"stage","type":"nominal"},"y":{"field":"hours","type":"quantitative"}}}
\`\`\`

Paragraph after the panels.
`

const documentState = (page: Page) => page.evaluate(() => {
  const app = document.querySelector('#app') as any
  const file = app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
  return { markdown: file.markdown, isSaved: file.isSaved }
})

for (const role of ['TABLE', 'MERMAID', 'VEGA-LITE']) {
  test(`${role} keeps every action icon-only without growing labels`, async ({ page }) => {
    await installTauriShim(page)
    await page.setViewportSize({ width: 1400, height: 1000 })
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/toolbar-labels.md', CONTENT)
    const figure = page.locator(`figure[data-role='${role}']`).first()
    if (role !== 'TABLE') await expect(figure.locator('.ag-container-preview svg')).toBeVisible()
    await figure.scrollIntoViewIfNeeded()
    await figure.hover()
    // T-007: no setup click — the width toggle is retired; the table pill
    // carries the always-visible three-button mode segment plus Copy and
    // the need-gated expand action (five buttons on a wide table).
    const panel = figure.locator('div.ag-block-toolbar')
    const buttons = panel.locator('button.ag-block-toolbar-btn:visible')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(2)
    // Owner 2026-11-05: every pill button renders ICON-ONLY (the expanding
    // text labels are retired — a visited label turned the clicked button
    // into a wide "big button"). Hovering never reveals a label and never
    // widens the pill; the names live in the title/aria tooltips.
    // Wait for the owned model blocks, without requiring a text revision on import.
    await expect.poll(() => page.evaluate(() => {
      const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
      return file?.blocks?.length ?? 0
    })).toBeGreaterThan(0)
    const beforeDocument = await documentState(page)
    const anchor = await panel.boundingBox()
    const width0 = anchor!.width
    for (let index = 0; index < count; index++) {
      const button = buttons.nth(index)
      await button.hover()
      await expect(button.locator('span.ag-block-toolbar-label')).toHaveCount(0)
      const rect = await panel.boundingBox()
      expect(Math.abs(rect!.width - width0), 'the pill must never auto-size').toBeLessThanOrEqual(1)
      const title = await button.getAttribute('title')
      expect(title, 'every button keeps its tooltip').toBeTruthy()
    }
    await page.mouse.move(10, 10)
    expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(width0 + 1)
    expect(await documentState(page)).toEqual(beforeDocument)
  })
}
