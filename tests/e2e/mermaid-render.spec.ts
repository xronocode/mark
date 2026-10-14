import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const MERMAID_MD = `# Mermaid Diagrams

## Flowchart

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

## Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello Bob
    Bob-->>Alice: Hi Alice
\`\`\`

Some text after diagrams.
`

// C-34 R2.1: a wide left-to-right flowchain whose natural width far
// exceeds the text column — it must render at natural size (not squeezed
// to width:100%) inside a horizontally scrollable preview container.
const WIDE_FLOWCHART_MD = `# Wide Flowchart

\`\`\`mermaid
graph LR
    N0[Node Zero] --> N1[Node One] --> N2[Node Two] --> N3[Node Three] --> N4[Node Four] --> N5[Node Five] --> N6[Node Six] --> N7[Node Seven] --> N8[Node Eight] --> N9[Node Nine] --> N10[Node Ten] --> N11[Node Eleven] --> N12[Node Twelve] --> N13[Node Thirteen] --> N14[Node Fourteen]
\`\`\`

Some text after.
`

test.describe('mermaid diagram rendering', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  async function bootstrapWithMarkdown(page: any, markdown: string, theme = 'light') {
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

  test('mermaid SVG contains visible styled shapes (not black fill)', async ({ page }) => {
    await bootstrapWithMarkdown(page, MERMAID_MD)

    // Wait for the editor to mount and muya to render.
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // Wait for mermaid to render — look for SVG inside a container preview.
    const mermaidSvg = page.locator('.ag-container-preview svg').first()
    await mermaidSvg.waitFor({ state: 'visible', timeout: 20_000 })

    // The SVG must contain styled elements — check that the style tag
    // exists (either inside SVG or hoisted to parent container).
    const hasStyles = await page.evaluate(() => {
      const preview = document.querySelector('.ag-container-preview')
      if (!preview) return false
      // Style hoisted to parent or still inside SVG — both are valid.
      const parentStyle = preview.querySelector(':scope > style')
      const svgStyle = preview.querySelector('svg > style')
      return !!(parentStyle || svgStyle)
    })
    expect(hasStyles, 'Mermaid SVG styles must be present').toBe(true)

    // Verify shapes are NOT solid black (default fill when styles stripped).
    // Sample a rect inside the SVG and check its computed fill.
    const fillColor = await page.evaluate(() => {
      const rect = document.querySelector('.ag-container-preview svg .node rect, .ag-container-preview svg .node polygon')
      if (!rect) return 'no-rect-found'
      return window.getComputedStyle(rect).fill
    })
    expect(fillColor).not.toBe('rgb(0, 0, 0)')
    expect(fillColor).not.toBe('no-rect-found')

    // Take a screenshot for visual verification.
    await mermaidSvg.screenshot({ path: 'test-results/mermaid-light.png' })
  })

  test('mermaid renders with dark theme colors', async ({ page }) => {
    await bootstrapWithMarkdown(page, MERMAID_MD, 'dark')

    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const mermaidSvg = page.locator('.ag-container-preview svg').first()
    await mermaidSvg.waitFor({ state: 'visible', timeout: 20_000 })

    // Body should have 'dark' class.
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })

    // Styles must be present.
    const hasStyles = await page.evaluate(() => {
      const preview = document.querySelector('.ag-container-preview')
      if (!preview) return false
      return !!(preview.querySelector(':scope > style') || preview.querySelector('svg > style'))
    })
    expect(hasStyles, 'Mermaid SVG styles must be present in dark mode').toBe(true)

    await mermaidSvg.screenshot({ path: 'test-results/mermaid-dark.png' })
  })

  // C-34 R2.1: natural size + horizontal scroll for wide diagrams.
  test('wide flowchart renders at natural size in a horizontally scrollable container', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_FLOWCHART_MD)

    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // The render pipeline adds the ag-mermaid-preview hook class, which
    // scopes the natural-size CSS.
    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('div.ag-mermaid-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })

    const sizing = await page.evaluate(() => {
      const container = document.querySelector('div.ag-container-preview.ag-mermaid-preview') as HTMLElement
      const svg = container.querySelector('svg') as SVGSVGElement
      return {
        overflowX: window.getComputedStyle(container).overflowX,
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth,
        svgWidth: Math.round(svg.getBoundingClientRect().width)
      }
    })

    expect(sizing.overflowX).toBe('auto')
    expect(sizing.svgWidth, 'wide diagram must keep its natural width').toBeGreaterThan(sizing.clientWidth)
    expect(sizing.scrollWidth, 'preview container must scroll horizontally').toBeGreaterThan(sizing.clientWidth)
  })

  // C-34 R2.1: keep-last-good — a syntax error typed after a successful
  // render keeps the last SVG visible and shows the mermaid error text.
  test('syntax error after a good render keeps the SVG and shows the error element', async ({ page }) => {
    await bootstrapWithMarkdown(page, MERMAID_MD)

    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    const goodSvg = page.locator('div.ag-mermaid-preview svg').first()
    await goodSvg.waitFor({ state: 'visible', timeout: 20_000 })

    // A plain click on the preview opens the source for editing.
    await preview.click()

    const codeContent = page.locator('pre[data-role="mermaid"] span.ag-code-content').first()
    await codeContent.waitFor({ state: 'visible', timeout: 10_000 })
    // Click near the top-left so the caret lands on the first code line.
    await codeContent.click({ position: { x: 2, y: 2 } })
    // Break the diagram syntax at the start of the first line.
    await page.keyboard.press('Home')
    await page.keyboard.type('!!! ', { delay: 30 })

    // The pipeline debounces re-renders while typing (~250 ms quiet).
    const errorEl = page.locator('figure.ag-container-block .ag-mermaid-error').first()
    await errorEl.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(errorEl).toContainText(/mermaid|parse|syntax|diagram/i)

    // Keep-last-good: the previous SVG is still on screen next to the error.
    await expect(page.locator('figure.ag-container-block div.ag-container-preview svg').first())
      .toBeVisible()
  })
})
