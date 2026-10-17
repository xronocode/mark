// FILE: tests/e2e/zoom.spec.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: End-to-end pin of the C-49 unified zoom — ⌘+ scales p / td / code / KaTeX AND the pele diagram SVG (width + labels, still inside the column; C-55 renamed the hook class ag-mermaid-preview → ag-pele-preview, the zoom mechanism itself is unchanged), ⌘0 restores the Settings base size, the transient pill appears, and Ctrl+wheel inside the fullscreen block viewer never changes the editor font size.
//   SCOPE: zoom.spec.ts only; keyboard/wheel zoom against the built renderer (tauri-shim bootstrap, same as block-viewer.spec.ts).
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim.
//   LINKS: .grace/changes/active/C-49 R-1/R-2/R-5/R-6; .grace/verification/runtime.xml V-M-011 scenario-41.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ZOOM_MD - markdown fixture: paragraph, table, code fence, math block, ```mermaid flowchart (rendered by pele since C-55).
//   DIAGRAM_MD - markdown fixture with one ```mermaid flowchart (pele engine; viewer case).
//   bootstrapWithMarkdown - tauri-shim + preferences (fontSize 16, baseFontSize 16) + mt::bootstrap-editor document load.
//   measure - page.evaluate snapshot of computed font sizes, SVG width/label and column width.
//   editorFontSizePx - computed fontSize of #ag-editor-id (viewer isolation check).
//   ZoomMetrics - measured font sizes and Mermaid width shape.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-17 C-55: the diagram engine is pele —
//   selectors renamed (ag-mermaid-preview → ag-pele-preview; the node-shape
//   probe g.node rect/polygon/circle → g.pele-node rect/polygon/circle).
//   The ```mermaid fixtures stay (pele parses mermaid syntax) and the
//   --mark-zoom zoom mechanism is unchanged.
//   v1.0.1 - 2026-10-17 C-51 T-010: the viewer opens through
//   Cmd/Ctrl+click — small diagrams have no visible expand button (D-7).
//   v1.0.0 - 2026-10-15 C-49 T-001: initial spec. The
//   diagram/indicator cases fail without the C-49 changes (mermaid SVGs kept
//   a fixed max-width and no pill existed); ⌘0 would reset to a hard 16
//   instead of the persisted base.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const ZOOM_MD = `# Zoom fixture

A paragraph with **bold** text to scale.

| Alpha | Beta | Gamma |
| --- | --- | --- |
| one | two | three |

\`\`\`js
const code = 'block'
\`\`\`

$$
E = mc^2
$$

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`
`

const DIAGRAM_MD = `# Viewer zoom isolation

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`
`

async function bootstrapWithMarkdown (page: Page, markdown: string) {
  await page.addInitScript((md: string) => {
    ;(window as any).__mockInvoke = {
      ...(window as any).__mockInvoke,
      mt_prefs_get_all: () => ({
        theme: 'paper',
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
        baseFontSize: 16,
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
  }, markdown)

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

interface ZoomMetrics {
  p: number
  td: number
  code: number
  katex: number
  svgWidth: number
  svgNatural: number
  svgMaxWidth: string
  column: number
  labelWidth: number
}

const measure = (page: Page): Promise<ZoomMetrics> =>
  page.evaluate(() => {
    const editor = document.querySelector('#ag-editor-id') as HTMLElement
    const px = (el: Element | null) =>
      el ? parseFloat(getComputedStyle(el as HTMLElement).fontSize) : 0
    const preview = document.querySelector(
      'div.ag-container-preview.ag-pele-preview'
    ) as HTMLElement | null
    const svg = preview ? (preview.querySelector('svg') as SVGSVGElement | null) : null
    const label = svg
      ? (svg.querySelector('g.pele-node rect, g.pele-node polygon, g.pele-node circle') as HTMLElement | null)
      : null
    return {
      p: px(editor.querySelector('p')),
      td: px(editor.querySelector('td')),
      code: px(editor.querySelector('span.ag-code-content')),
      katex: px(editor.querySelector('.katex')),
      svgWidth: svg ? svg.getBoundingClientRect().width : 0,
      svgNatural: svg ? parseFloat(svg.getAttribute('data-natural-width') || '0') : 0,
      svgMaxWidth: svg ? (svg.style.maxWidth || '') : '',
      column: preview ? preview.clientWidth : 0,
      labelWidth: label ? label.getBoundingClientRect().width : 0
    }
  })

const editorFontSizePx = (page: Page): Promise<string> =>
  page.evaluate(() =>
    getComputedStyle(document.querySelector('#ag-editor-id') as HTMLElement).fontSize
  )

test.describe('unified zoom (C-49)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('⌘+ ×4 scales text, table, code, KaTeX and the pele diagram (still inside the column)', async ({ page }) => {
    await bootstrapWithMarkdown(page, ZOOM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('.katex').first().waitFor({ state: 'visible', timeout: 20_000 })

    const before = await measure(page)
    expect(before.p).toBe(16)
    expect(before.td).toBeGreaterThan(0)
    expect(before.code).toBeGreaterThan(0)
    expect(before.katex).toBeGreaterThan(0)
    expect(before.svgWidth).toBeGreaterThan(50)
    expect(before.svgNatural).toBeGreaterThan(50)
    // The pipeline rewrote the inline max-width into the --mark-zoom calc.
    expect(before.svgMaxWidth).toMatch(/calc\(var\(--mark-zoom, 1\) \* [\d.]+px\)/)

    for (let i = 0; i < 4; i++) await page.keyboard.press('Meta+=')
    await expect(page.locator('.zoom-indicator')).toHaveText('125 %')

    const after = await measure(page)
    // Text and tables scale with the editor font size.
    expect(after.p).toBe(20)
    expect(after.td).toBe(20)
    // Code (codeFontSize / 16 em in the common style) and KaTeX (em-based)
    // scale by the same 20/16 ratio from their own bases.
    expect(after.code / before.code).toBeCloseTo(1.25, 2)
    expect(after.katex / before.katex).toBeCloseTo(1.25, 1)
    // The diagram grows with the zoom but never past the text column:
    // width:100% + max-width calc(var(--mark-zoom) × natural).
    expect(after.svgWidth).toBeGreaterThanOrEqual(before.svgWidth)
    const expectedSvgWidth = Math.min(after.column, before.svgNatural * 1.25)
    expect(Math.abs(after.svgWidth - expectedSvgWidth)).toBeLessThanOrEqual(1)
    // Node shapes (and their labels) scale with the viewBox — the whole SVG scales uniformly.
    expect(after.labelWidth).toBeGreaterThan(before.labelWidth + 2)
    expect(after.labelWidth / before.labelWidth).toBeCloseTo(after.svgWidth / before.svgWidth, 1)
    // Wide or not, the diagram still fits the text column.
    expect(after.svgWidth).toBeLessThanOrEqual(after.column + 1)
  })

  test('⌘0 returns to the Settings base size and the diagram follows back', async ({ page }) => {
    await bootstrapWithMarkdown(page, ZOOM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    const before = await measure(page)
    for (let i = 0; i < 4; i++) await page.keyboard.press('Meta+=')
    await expect(page.locator('.zoom-indicator')).toHaveText('125 %')
    const zoomed = await measure(page)
    expect(zoomed.p).toBe(20)

    await page.keyboard.press('Meta+0')
    await expect(page.locator('.zoom-indicator')).toHaveText('100 %')

    const restored = await measure(page)
    expect(restored.p).toBe(before.p)
    expect(restored.svgWidth).toBeCloseTo(before.svgWidth, 0)
  })

  test('the transient pill appears on zoom and hides after ~1 s', async ({ page }) => {
    await bootstrapWithMarkdown(page, ZOOM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    await expect(page.locator('.zoom-indicator')).toHaveCount(0)
    await page.keyboard.press('Meta+=')
    const pill = page.locator('.zoom-indicator')
    await expect(pill).toBeVisible()
    await expect(pill).toHaveText('106 %') // round(17 / 16 × 100)
    await expect(pill).toHaveAttribute('aria-live', 'polite')

    await expect(pill).toHaveCount(0, { timeout: 5_000 })
  })

  test('Ctrl+wheel over the editor also zooms (pinch path)', async ({ page }) => {
    await bootstrapWithMarkdown(page, ZOOM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const before = await measure(page)

    await page.keyboard.down('Control')
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -60)
    await page.keyboard.up('Control')

    const after = await measure(page)
    expect(after.p).toBeGreaterThan(before.p)
  })

  test('Ctrl+wheel inside the fullscreen block viewer leaves the editor font size alone (R-6)', async ({ page }) => {
    await bootstrapWithMarkdown(page, DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    const fontBefore = await editorFontSizePx(page)

    // C-51 T-010 (D-7): a small diagram has no visible expand button —
    // Cmd/Ctrl+click on the preview opens the viewer for any block.
    await preview.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] })
    await expect(page.locator('.ag-block-viewer')).toHaveClass(/ag-block-viewer-open/)
    await page.waitForTimeout(250)

    const box = await page.locator('.ag-block-viewer-canvas').boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.keyboard.down('Control')
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -60)
    await page.keyboard.up('Control')
    await page.waitForTimeout(150)

    await page.keyboard.press('Escape')
    await expect(page.locator('.ag-block-viewer')).not.toHaveClass(/ag-block-viewer-open/)
    const fontAfter = await editorFontSizePx(page)
    expect(fontAfter, 'viewer zoom must not change the editor font size').toBe(fontBefore)
  })
})
