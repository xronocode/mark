// FILE: tests/e2e/block-viewer.spec.ts
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: End-to-end pin of the shared fullscreen block viewer (C-34 R2.2 + C-39 T2) — hover toolbar, overlay open, zoom keys, read-only table clone with sticky header, Cmd+click, Esc close with focus restore.
//   SCOPE: block-viewer.spec.ts only; diagram and table flows against the built renderer.
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim (same bootstrap as mermaid-render.spec.ts).
//   LINKS: .grace/changes/active/C-34 T-002; .grace/changes/active/C-39 T2; .grace/verification/runtime.xml V-M-012 scenario-19.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DIAGRAM_MD - markdown fixture with one mermaid flowchart.
//   TABLE_MD - markdown fixture with one GFM table.
//   bootstrapWithMarkdown - tauri-shim + preferences + mt::bootstrap-editor document load (mirrors mermaid-render.spec.ts).
//   focusIsEditor - true when document.activeElement is inside the editor (focus-restore check).
//   canvasScale - parses the panzoom `scale(s) translate(x,y)` transform of the viewer canvas.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.1 - 2026-10-15 review: the Cmd+click case checks that the mermaid figure stays inactive (an inactive figure still shows its collapsed source line, so toBeHidden on the pre was wrong).
//   v1.0.0 - 2026-10-15 C-34 R2.2/C-39 T2: first e2e spec for the block viewer (diagram + table: hover toolbar, open, zoom key, Esc focus restore; Cmd+click vs plain click routing).
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const DIAGRAM_MD = `# Block Viewer Diagrams

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

Some text after the diagram.
`

const TABLE_MD = `# Block Viewer Tables

| Alpha | Beta | Gamma |
| --- | --- | --- |
| one | two | three |
| four | five | six |
| seven | eight | nine |

Some text after the table.
`

async function bootstrapWithMarkdown (page: Page, markdown: string, theme = 'light') {
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

// Panzoom composes `scale(s) translate(x px, y px)`; the transform is
// applied inside a requestAnimationFrame, so callers wait a frame first.
async function canvasScale (page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.ag-block-viewer-canvas') as HTMLElement | null
    if (!canvas) return 0
    const match = /scale\(([\d.]+)\)/.exec(canvas.style.transform || '')
    return match ? parseFloat(match[1]) : 1
  })
}

async function focusIsEditor (page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement
    return !!(el && el.classList && el.classList.contains('editor-component'))
  })
}

test.describe('block viewer (C-34 R2.2 + C-39 T2)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('diagram: hover toolbar opens the fullscreen viewer; zoom key scales; Esc restores focus', async ({ page }) => {
    await bootstrapWithMarkdown(page, DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    // Hover the diagram: the expand (⤢) toolbar appears.
    await preview.hover()
    const expand = page.locator('.ag-block-viewer-toolbar .ag-block-viewer-expand')
    await expect(expand).toBeVisible()
    await expect(expand).toHaveAttribute('title', 'Expand')

    // Clicking ⤢ opens the overlay with the cloned SVG (no re-render).
    await expand.click()
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer.locator('.ag-block-viewer-title')).toHaveText('Diagram')
    await expect(viewer.locator('.ag-block-viewer-canvas svg').first()).toBeVisible()
    // The hoisted mermaid <style> travelled with the clone.
    const cloneHasStyle = await page.evaluate(() => {
      const canvas = document.querySelector('.ag-block-viewer-canvas')
      return !!(canvas && canvas.querySelector('div.ag-container-preview > style'))
    })
    expect(cloneHasStyle).toBe(true)

    // A zoom key changes the transform scale.
    await page.waitForTimeout(80) // panzoom applies transforms in a rAF
    const before = await canvasScale(page)
    await page.keyboard.press('=')
    await page.waitForTimeout(80)
    const after = await canvasScale(page)
    expect(after).toBeGreaterThan(before)

    // Esc closes the viewer and focus returns to the editor (the block).
    await page.keyboard.press('Escape')
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)
    expect(await focusIsEditor(page)).toBe(true)
  })

  test('table: hover toolbar opens a read-only clone with a sticky header; zoom and Esc work', async ({ page }) => {
    await bootstrapWithMarkdown(page, TABLE_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const table = page.locator('table.ag-paragraph').first()
    await table.waitFor({ state: 'visible', timeout: 15_000 })

    await table.hover()
    const expand = page.locator('.ag-block-viewer-toolbar .ag-block-viewer-expand')
    await expect(expand).toBeVisible()
    await expand.click()

    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer.locator('.ag-block-viewer-title')).toHaveText('Table')

    // The clone is read-only: no editing affordances inside the overlay.
    const readOnly = await page.evaluate(() => {
      const canvas = document.querySelector('.ag-block-viewer-canvas')
      if (!canvas) return null
      return {
        contenteditable: canvas.querySelectorAll('[contenteditable]').length,
        dragHandlers: canvas.querySelectorAll('.ag-drag-handler').length,
        toolBars: canvas.querySelectorAll('.ag-tool-bar').length,
        stickyHeader: canvas.querySelector('thead th')
          ? window.getComputedStyle(canvas.querySelector('thead th') as HTMLElement).position
          : 'no-thead'
      }
    })
    expect(readOnly).toEqual({
      contenteditable: 0,
      dragHandlers: 0,
      toolBars: 0,
      stickyHeader: 'sticky'
    })

    // A zoom key changes the transform scale; Esc closes and restores focus.
    await page.waitForTimeout(80)
    const before = await canvasScale(page)
    await page.keyboard.press('=')
    await page.waitForTimeout(80)
    const after = await canvasScale(page)
    expect(after).toBeGreaterThan(before)

    await page.keyboard.press('Escape')
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)
    expect(await focusIsEditor(page)).toBe(true)
  })

  test('Cmd/Ctrl+click on a diagram opens the viewer; a plain click opens the source', async ({ page }) => {
    await bootstrapWithMarkdown(page, DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    // Cmd+click (macOS) / Ctrl+click: fullscreen viewer, no source editing.
    await preview.click({ modifiers: ['Meta'] })
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    // The source block never activates: an inactive mermaid figure still
    // shows its collapsed source line, so check the figure's active state.
    await expect(page.locator('figure[data-role="MERMAID"]').first()).not.toHaveClass(/ag-active/)
    await page.keyboard.press('Escape')
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)

    // A plain click keeps the existing behaviour: open the source block.
    await preview.click()
    const codeContent = page.locator('pre[data-role="mermaid"] span.ag-code-content').first()
    await codeContent.waitFor({ state: 'visible', timeout: 10_000 })
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)
  })
})
