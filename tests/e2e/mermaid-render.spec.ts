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
})
