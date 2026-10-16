// FILE: tests/e2e/block-viewer.spec.ts
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: End-to-end pin of the shared fullscreen block viewer (C-34 R2.2 + C-39 T2) and the C-51 T-006 always-visible expand button — overlay open, zoom keys, read-only table clone with sticky header, Cmd+click, Esc close with focus restore; button presence/aria-label/rest-vs-hover looks on every viewable block type, no content covered, keyboard activation, light/dark colours.
//   SCOPE: block-viewer.spec.ts only; diagram and table flows against the built renderer.
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim (same bootstrap as mermaid-render.spec.ts).
//   LINKS: .grace/changes/active/C-34 T-002; .grace/changes/active/C-39 T2; .grace/changes/active/C-51 T-006; .grace/verification/runtime.xml V-M-012 scenario-19 and scenario-60.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DIAGRAM_MD - markdown fixture with one mermaid flowchart.
//   TABLE_MD - markdown fixture with one GFM table.
//   ALL_BLOCKS_MD - one fixture of every viewable block type (5 diagram kinds + table) plus non-viewable negatives (fence, paragraph).
//   bootstrapWithMarkdown - tauri-shim + preferences + mt::bootstrap-editor document load (mirrors mermaid-render.spec.ts).
//   canvasScale - parses the panzoom `scale(s) translate(x,y)` transform of the viewer canvas.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.1.0 - 2026-10-16 C-51 T-006 canvas rework: the look
//   case pins the approved canvas geometry (30 px square, radius 8, 10 px
//   insets from the figure's top-right, opacity ≥ 0.6 at rest) instead of
//   the interim ghost chip in the top:-22px strip; new cases: Tab moves
//   focus between the buttons natively (the keyboard guard), the table
//   last-column resize handle stays uncovered and still drags, and light/
//   dark screenshots land in testInfo.outputPath.
//   v2.0.0 - 2026-10-16 C-51 T-006: the hover toolbar is gone;
//   every open-the-viewer step clicks the persistent figure >
//   button.ag-block-expand instead, and new cases pin the T-006 acceptance
//   criteria — the button is visible at rest on mermaid, flowchart,
//   sequence, plantuml, vega-lite and table blocks (and only those),
//   carries the localized aria-label, never covers diagram/table content
//   (reserved strip above the block), goes solid on hover, follows the
//   theme (paper vs ink computed colours) and opens the viewer from the
//   keyboard (focus + Enter). All new assertions fail on main (no
//   persistent button exists there).
//   v1.2.0 - 2026-10-15 video review: Ctrl+wheel in the viewer zooms the diagram and no longer changes the editor font size (app.vue font-size handler skips the viewer); the backdrop is opaque so the page does not show through. Both fail without the fix.
//   v1.1.0 - 2026-10-15: a wide diagram fits the column in the page and opens non-empty, fitted and centred in the viewer (failed off-centre in Chromium before the deferred fit).
//   v1.0.1 - 2026-10-15 review: the Cmd+click case checks that the mermaid figure stays inactive (an inactive figure still shows its collapsed source line, so toBeHidden on the pre was wrong).
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

// One of every viewable block (C-51 T-006) plus negatives: a fenced code
// block and a plain paragraph never get the expand button. The plantuml
// sample renders offline as a broken <img> (plantuml.com is unreachable in
// CI) — the BUTTON is renderer-side, so presence/aria are still asserted.
const ALL_BLOCKS_MD = `# Expand Button Coverage

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`

\`\`\`flowchart
st=>start: Start
op=>operation: Write
e=>end: Done
st->op->e
\`\`\`

\`\`\`sequence
Title: Quick check
A->B: Ping?
B-->A: Pong
\`\`\`

\`\`\`plantuml
@startuml
Alice -> Bob: hello
@enduml
\`\`\`

\`\`\`vega-lite
{"data":{"values":[{"kind":"A","count":3},{"kind":"B","count":5}]},"mark":"bar","encoding":{"x":{"field":"kind","type":"nominal"},"y":{"field":"count","type":"quantitative"}}}
\`\`\`

| Alpha | Beta |
| --- | --- |
| one | two |

\`\`\`js
const noButtonHere = true
\`\`\`

Final paragraph.
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

test.describe('block viewer (C-34 R2.2 + C-39 T2)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('diagram: the always-visible expand button opens the fullscreen viewer; zoom key scales; Esc restores focus', async ({ page }) => {
    await bootstrapWithMarkdown(page, DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    // C-51 T-006: the expand button is visible at rest — no hover needed —
    // as a direct child of the diagram figure, with the localized label.
    const expand = page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first()
    await expect(expand).toBeVisible()
    await expect(expand).toHaveAttribute('aria-label', 'Expand')
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

    // Esc closes the viewer and focus returns to what had it at open: the
    // expand button where a click focuses buttons (Chromium), the editor
    // where it does not (WebKit/Safari) — both stay in the document.
    await page.keyboard.press('Escape')
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)
    await expect.poll(() => page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return !!el && (el.classList.contains('editor-component') || el.classList.contains('ag-block-expand'))
    })).toBe(true)
  })

  test('Ctrl+wheel inside the viewer zooms the diagram and leaves the editor font size alone', async ({ page }) => {
    await bootstrapWithMarkdown(page, DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    const fontBefore = await page.evaluate(() => getComputedStyle(document.querySelector('#ag-editor-id') as HTMLElement).fontSize)

    await page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first().click()
    await expect(page.locator('.ag-block-viewer')).toHaveClass(/ag-block-viewer-open/)
    await page.waitForTimeout(250)
    const box = await page.locator('.ag-block-viewer-canvas').boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    const before = await canvasScale(page)
    await page.keyboard.down('Control')
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -60)
    await page.keyboard.up('Control')
    await page.waitForTimeout(150)
    expect(await canvasScale(page)).toBeGreaterThan(before)

    await page.keyboard.press('Escape')
    await expect(page.locator('.ag-block-viewer')).not.toHaveClass(/ag-block-viewer-open/)
    const fontAfter = await page.evaluate(() => getComputedStyle(document.querySelector('#ag-editor-id') as HTMLElement).fontSize)
    expect(fontAfter, 'viewer zoom must not change the editor font size').toBe(fontBefore)
  })

  test('the viewer backdrop is opaque: nothing of the page shows through', async ({ page }) => {
    await bootstrapWithMarkdown(page, DIAGRAM_MD)
    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first().click()
    await expect(page.locator('.ag-block-viewer')).toHaveClass(/ag-block-viewer-open/)
    const alpha = await page.evaluate(() => {
      const bg = getComputedStyle(document.querySelector('.ag-block-viewer-backdrop') as HTMLElement).backgroundColor
      const m = bg.match(/rgba?\(([^)]+)\)/)
      const parts = m ? m[1].split(',').map(s => s.trim()) : []
      return parts.length === 4 ? Number(parts[3]) : 1
    })
    expect(alpha).toBe(1)
  })

  test('a wide diagram fits the column in the page and opens centred and non-empty in the viewer', async ({ page }) => {
    const nodes = Array.from({ length: 14 }, (_, i) => `N${i}[Service number ${i}]`).join(' --> ')
    await bootstrapWithMarkdown(page, `# Wide\n\n\`\`\`mermaid\ngraph LR\n    ${nodes}\n\`\`\`\n`)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('div.ag-mermaid-preview svg').first().waitFor({ state: 'visible', timeout: 20_000 })

    // In the page the wide diagram fits the column (no sideways scroll).
    const inPage = await page.evaluate(() => {
      const c = document.querySelector('div.ag-container-preview.ag-mermaid-preview') as HTMLElement
      return { client: c.clientWidth, scroll: c.scrollWidth, svg: (c.querySelector('svg') as SVGSVGElement).getBoundingClientRect().width }
    })
    expect(inPage.svg).toBeLessThanOrEqual(inPage.client + 1)
    expect(inPage.scroll).toBeLessThanOrEqual(inPage.client + 1)

    await page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first().click()
    await expect(page.locator('.ag-block-viewer')).toHaveClass(/ag-block-viewer-open/)
    await page.waitForTimeout(250) // fit runs again after layout (rAF)

    const inViewer = await page.evaluate(() => {
      const stage = (document.querySelector('.ag-block-viewer-canvas') as HTMLElement).parentElement as HTMLElement
      const svg = document.querySelector('.ag-block-viewer-canvas svg') as SVGSVGElement
      const s = stage.getBoundingClientRect()
      const r = svg.getBoundingClientRect()
      return { stageL: s.left, stageR: s.right, l: r.left, r: r.right, w: r.width, h: r.height, natural: svg.viewBox.baseVal.width }
    })
    // Not blank: the clone has its natural size from the viewBox.
    expect(inViewer.w).toBeGreaterThan(50)
    expect(inViewer.h).toBeGreaterThan(10)
    expect(inViewer.natural).toBeGreaterThan(inPage.client)
    // Fitted and centred: inside the stage, equal margins (±4px).
    expect(inViewer.l).toBeGreaterThanOrEqual(inViewer.stageL - 1)
    expect(inViewer.r).toBeLessThanOrEqual(inViewer.stageR + 1)
    expect(Math.abs((inViewer.l - inViewer.stageL) - (inViewer.stageR - inViewer.r))).toBeLessThanOrEqual(4)
  })

  test('table: the always-visible expand button opens a read-only clone with a sticky header; zoom and Esc work', async ({ page }) => {
    await bootstrapWithMarkdown(page, TABLE_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const table = page.locator('table.ag-paragraph').first()
    await table.waitFor({ state: 'visible', timeout: 15_000 })

    // C-51 T-006: the table figure carries the expand button at rest.
    const expand = page.locator('figure[data-role="TABLE"] > button.ag-block-expand').first()
    await expect(expand).toBeVisible()
    await expect(expand).toHaveAttribute('aria-label', 'Expand')
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
    // Focus returns to what had it at open: the expand button (Chromium
    // focuses clicked buttons) or the editor (WebKit does not).
    await expect.poll(() => page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return !!el && (el.classList.contains('editor-component') || el.classList.contains('ag-block-expand'))
    })).toBe(true)
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

  // START_BLOCK_EXPAND_E2E_COVERAGE
  // C-51 T-006 acceptance criteria: visible at rest on Mermaid, Vega-Lite,
  // flowchart.js, sequence, PlantUML blocks and tables (and nothing else),
  // localized aria-label, reserved corner (never covers content), subtle →
  // solid, theme-following colours, keyboard activation.
  test('every viewable block shows the expand button at rest, labeled, without covering content', async ({ page }) => {
    await bootstrapWithMarkdown(page, ALL_BLOCKS_MD, 'paper')
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('div.ag-container-preview.ag-mermaid-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    // The other local renderers (flowchart, sequence, vega) draw their svg
    // shortly after; plantuml stays a broken img offline.
    await page.locator('figure[data-role="VEGA-LITE"] div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('figure[data-role="FLOWCHART"] div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('figure[data-role="SEQUENCE"] div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })

    // Exactly one button per viewable figure, none anywhere else in the
    // document (fence, paragraph, headings are out of scope).
    await expect(page.locator('.editor-with-tabs button.ag-block-expand')).toHaveCount(6)
    for (const role of ['MERMAID', 'FLOWCHART', 'SEQUENCE', 'PLANTUML', 'VEGA-LITE', 'TABLE']) {
      const button = page.locator(`figure[data-role="${role}"] > button.ag-block-expand`)
      await expect(button).toHaveCount(1)
      await expect(button).toBeVisible()
      await expect(button).toHaveAttribute('aria-label', 'Expand')
    }

    // Reserved corner: the button sits in the strip ABOVE the block, so it
    // never intersects the diagram SVG or the table box (±1px tolerance).
    const geometry = await page.evaluate(() => {
      const read = (role: string) => {
        const figure = document.querySelector(`figure[data-role="${role}"]`)
        const button = figure && figure.querySelector('button.ag-block-expand')
        if (!button) return null
        const b = button.getBoundingClientRect()
        const content = figure.querySelector('div.ag-container-preview svg, table.ag-paragraph')
        const c = content ? content.getBoundingClientRect() : null
        return { bottom: b.bottom, top: c ? c.top : -1 }
      }
      return {
        mermaid: read('MERMAID'),
        flowchart: read('FLOWCHART'),
        sequence: read('SEQUENCE'),
        vega: read('VEGA-LITE'),
        table: read('TABLE')
      }
    })
    for (const [role, g] of Object.entries(geometry)) {
      expect(g, `${role} must resolve button and content boxes`).not.toBeNull()
      expect(g!.bottom, `${role} button must not cover the block content`).toBeLessThanOrEqual(g!.top + 1)
    }
  })

  test('the expand button is subtle at rest and solid on hover, following the theme', async ({ page }) => {
    await bootstrapWithMarkdown(page, DIAGRAM_MD, 'paper')
    const expand = page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first()
    await expect(expand).toBeVisible()

    const looks = await page.evaluate(() => {
      const el = document.querySelector('figure[data-role="MERMAID"] > button.ag-block-expand') as HTMLElement
      const cs = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      const figure = el.closest('figure')!.getBoundingClientRect()
      return {
        opacity: cs.opacity,
        color: cs.color,
        position: cs.position,
        width: b.width,
        height: b.height,
        insetTop: b.top - figure.top,
        insetRight: figure.right - b.right,
        radius: cs.borderRadius
      }
    })
    // Subtle at rest — clearly visible without hover (opacity ≥ 0.6)…
    expect(parseFloat(looks.opacity)).toBeGreaterThanOrEqual(0.6)
    expect(parseFloat(looks.opacity)).toBeLessThan(1)
    // …as the canvas 30 px rounded square, top-right with the ~10 px inset.
    expect(looks.position).toBe('absolute')
    expect(looks.width).toBe(30)
    expect(looks.height).toBe(30)
    expect(Math.abs(looks.insetTop - 10)).toBeLessThanOrEqual(1)
    expect(Math.abs(looks.insetRight - 10)).toBeLessThanOrEqual(1)
    expect(looks.radius).toBe('8px')

    // Solid on hover (the CSS transition takes 150ms).
    await expand.hover()
    await page.waitForTimeout(300)
    const hoverLooks = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('figure[data-role="MERMAID"] > button.ag-block-expand') as HTMLElement)
      return { opacity: cs.opacity, color: cs.color }
    })
    expect(hoverLooks.opacity).toBe('1')

    // Theme-following: the ink theme resolves a different (light) colour.
    await bootstrapWithMarkdown(page, DIAGRAM_MD, 'ink')
    await page.locator('div.ag-container-preview.ag-mermaid-preview').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    const darkLooks = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('figure[data-role="MERMAID"] > button.ag-block-expand') as HTMLElement)
      return { opacity: cs.opacity, color: cs.color }
    })
    expect(parseFloat(darkLooks.opacity)).toBeGreaterThanOrEqual(0.6)
    expect(darkLooks.color).not.toBe(looks.color)
  })

  test('keyboard: focusing the expand button and pressing Enter opens the viewer; Esc restores the button focus', async ({ page }) => {
    await bootstrapWithMarkdown(page, DIAGRAM_MD)
    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    const expand = page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first()
    await expand.focus()
    await expect(expand).toBeFocused()

    // Enter activates the focused button (the muya keydown guard leaves
    // the key to the button instead of inserting a newline).
    await page.keyboard.press('Enter')
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer.locator('.ag-block-viewer-title')).toHaveText('Diagram')

    // Esc closes and restores focus to the button that opened the viewer.
    await page.keyboard.press('Escape')
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)
    await expect(expand).toBeFocused()
  })

  test('Tab reaches the expand buttons: native focus moves between them (keyboard guard)', async ({ page }) => {
    await bootstrapWithMarkdown(page, ALL_BLOCKS_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('figure[data-role="MERMAID"] div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })

    // The buttons are real Tab stops: with focus on the mermaid button,
    // Tab moves to the next expand button in document order (the flowchart
    // figure's). Without the muya keydown guard the editor's tabHandler
    // would preventDefault and trap focus on the first button.
    const mermaidButton = page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first()
    const flowchartButton = page.locator('figure[data-role="FLOWCHART"] > button.ag-block-expand').first()
    await mermaidButton.focus()
    await expect(mermaidButton).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(flowchartButton).toBeFocused()

    // Shift+Tab walks back to the previous button.
    await page.keyboard.press('Shift+Tab')
    await expect(mermaidButton).toBeFocused()
  })

  test('table: the button never covers the last column resize handle and resizing still works', async ({ page }) => {
    await bootstrapWithMarkdown(page, TABLE_MD)
    await page.locator("figure[data-role='TABLE'] table").first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // Geometry: the button lives in the reserved strip above the table, so
    // it cannot intersect the LAST column's resize hit zone (C-39 T-002).
    const clear = await page.evaluate(() => {
      const button = document.querySelector("figure[data-role='TABLE'] > button.ag-block-expand") as HTMLElement
      const lastTh = document.querySelector("figure[data-role='TABLE'] thead tr th:last-child") as HTMLElement
      if (!button || !lastTh) return null
      const b = button.getBoundingClientRect()
      const t = lastTh.getBoundingClientRect()
      const overlap = !(b.right <= t.left || t.right <= b.left || b.bottom <= t.top || t.bottom <= b.top)
      return { overlap, buttonBottom: b.bottom, tableTop: t.top }
    })
    expect(clear).not.toBeNull()
    expect(clear!.overlap, 'the button must not intersect the last header cell').toBe(false)

    // Behaviour: drag the LAST column border — the column resizes, the
    // colgroup/fixed layout engages (C-39 T-002 unchanged by the button).
    const widthsBefore = await page.evaluate(() => {
      const table = document.querySelector("figure[data-role='TABLE'] table") as HTMLTableElement
      return Array.from(table.tHead!.rows[0].cells).map(c => Math.round(c.getBoundingClientRect().width))
    })
    const lastTh = page.locator("figure[data-role='TABLE'] thead th").last()
    const box = await lastTh.boundingBox()
    expect(box).not.toBeNull()
    // The last column's 6 px hit zone sits INSIDE the cell (C-39 T-002): grab it 2 px in.
    const x = box!.x + box!.width - 2
    const y = box!.y + box!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 40, y, { steps: 8 })
    await page.mouse.up()

    const after = await page.evaluate(() => {
      const table = document.querySelector("figure[data-role='TABLE'] table") as HTMLTableElement
      return {
        widths: Array.from(table.tHead!.rows[0].cells).map(c => Math.round(c.getBoundingClientRect().width)),
        fixed: table.classList.contains('ag-column-widths-fixed'),
        colgroup: !!table.querySelector('colgroup')
      }
    })
    expect(after.fixed).toBe(true)
    expect(after.colgroup).toBe(true)
    expect(after.widths[2], 'the last column must shrink by ~the drag delta').toBeLessThanOrEqual(widthsBefore[2] - 36)
  })

  test('screenshots: every expand button at rest, light and dark', async ({ page }, testInfo) => {
    for (const theme of ['paper', 'ink']) {
      await bootstrapWithMarkdown(page, ALL_BLOCKS_MD, theme)
      await page.locator('.editor-component, .editor-wrapper').first()
        .waitFor({ state: 'visible', timeout: 15_000 })
      await page.locator('figure[data-role="MERMAID"] div.ag-container-preview svg').first()
        .waitFor({ state: 'visible', timeout: 20_000 })
      // Let the flowchart/sequence/vega renderers finish drawing.
      await page.waitForTimeout(600)
      const button = page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first()
      await button.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`expand-buttons-${theme}.png`) })
    }
  })
  // END_BLOCK_EXPAND_E2E_COVERAGE
})
