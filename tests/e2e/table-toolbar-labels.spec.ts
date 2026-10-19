// FILE: tests/e2e/table-toolbar-labels.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce shrinking corner panels when moving between table/diagram buttons and pin cumulative label reveal until whole-panel exit.
//   SCOPE: Real pointer traversal over table, Mermaid and Vega-Lite inline toolbars in Chromium/WebKit; label visibility, nonshrinking button/panel widths, panel anchoring, exit reset and unchanged document state.
//   DEPENDS: @playwright/test, fixtures/tauri-shim, fixtures/helpers, built renderer; existing webkit-tables project includes this table-*.spec.ts file.
//   LINKS: .grace/changes/active/C-TOOLBAR-LABELS; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   CONTENT - wide table, Mermaid and Vega-Lite fixtures with the shared expanding-label panels.
//   documentState - normalized Markdown and saved state, excluding view-only selection.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 C-TOOLBAR-LABELS: visited labels remain open through adjacent-button traversal, then reset on leaving the panel.
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
  test(`${role} keeps visited labels open until leaving the whole panel`, async ({ page }) => {
    await installTauriShim(page)
    await page.setViewportSize({ width: 1400, height: 1000 })
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/toolbar-labels.md', CONTENT)
    const figure = page.locator(`figure[data-role='${role}']`).first()
    if (role !== 'TABLE') await expect(figure.locator('.ag-container-preview svg')).toBeVisible()
    await figure.scrollIntoViewIfNeeded()
    await figure.hover()
    if (role === 'TABLE') await figure.locator('.ag-table-toolbar-toggle').click()
    const panel = figure.locator('div.ag-block-toolbar')
    const buttons = panel.locator('button.ag-block-toolbar-btn:visible')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(2)
    const beforeDocument = await documentState(page)
    const anchor = await panel.boundingBox()
    let previousPanelWidth = anchor!.width
    const visited: { index: number; width: number }[] = []
    for (let index = count - 1; index >= 0; index--) {
      const button = buttons.nth(index)
      await button.hover()
      await expect(button.locator('span')).toBeVisible()
      for (const previous of visited) {
        const earlier = buttons.nth(previous.index)
        await expect(earlier.locator('span')).toBeVisible()
        expect((await earlier.boundingBox())!.width).toBeGreaterThanOrEqual(previous.width - 1)
      }
      const rect = await panel.boundingBox()
      expect(rect!.width).toBeGreaterThanOrEqual(previousPanelWidth - 1)
      expect(Math.abs(rect!.x + rect!.width - anchor!.x - anchor!.width)).toBeLessThanOrEqual(1)
      previousPanelWidth = rect!.width
      visited.push({ index, width: (await button.boundingBox())!.width })
    }
    await page.mouse.move(10, 10)
    for (let index = 0; index < count; index++) await expect(buttons.nth(index).locator('span')).not.toBeVisible()
    expect((await panel.boundingBox())!.width).toBeLessThan(previousPanelWidth)
    expect(await documentState(page)).toEqual(beforeDocument)
  })
}
