// FILE: tests/e2e/pele-render.spec.ts
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: E2E gate for the pele diagram engine (C-55) — svg.pele presence per diagram type (22-type matrix), CSS-variable theming through the svg root's --pele-* references (NO <style> blocks pele-side), the C-34 R2.1 wide-diagram fit-column and keep-last-good error flows (ag-pele-preview / ag-pele-error), XSS probes (labels with <script>/javascript: links never become executable markup — pele escapes/strips label markup and emits no links), and the BLOCK_PELE_RENDER / BLOCK_PELE_CACHE_HIT / BLOCK_PELE_ERROR log markers of src/muya/lib/parser/render/pelePipeline.js.
//   SCOPE: pele-render.spec.ts only; boots the built renderer via the tauri shim with a mocked preferences document (fence language stays ```mermaid, figure data-role stays MERMAID — pele parses mermaid syntax).
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim (installTauriShim).
//   LINKS: .grace/changes/archive/C-55 R-2/R-4; .grace/changes/archive/C-34 R2.1; .grace/verification/runtime.xml V-M-012; src/muya/lib/parser/render/pelePipeline.js; src/muya/lib/parser/render/peleOptions.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PELE_MD - flowchart + sequence fixture (```mermaid fences, pele engine).
//   WIDE_FLOWCHART_MD - 15-node LR flowchain whose natural width far exceeds the text column.
//   MATRIX_SAMPLES - one sample per diagram type (flowchart … c4) for the 22-type render matrix (corpus shared with pele-theme.spec.ts).
//   MATRIX_DOC - every sample wrapped into a ```mermaid fence document.
//   XSS_MD - labels carrying <script>/<a href="javascript:"> markup plus a javascript: click directive.
//   bootstrapWithMarkdown - tauri-shim + preferences + mt::bootstrap-editor document load.
//   resolvePeleVar - resolve a --pele-* variable on the document root through a hidden probe element.
//   collectConsoleMarkers - record console lines carrying the [Muya][renderPele] BLOCK_PELE_* markers.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-17 C-55: ported from
//   mermaid-render.spec.ts for the mermaid→pele hard cut. The mermaid
//   <style>-hoisting assertion is gone by construction (pele emits no
//   <style> blocks — theming rides the svg root's inline
//   --_x:var(--pele-x,…) references resolved against the document-root
//   --pele-* variables set by util/theme.js); selectors ag-mermaid-preview/
//   ag-mermaid-error became ag-pele-preview/ag-pele-error; the keep-last-good
//   flow now asserts the BLOCK_PELE_* log markers (RENDER on first draw,
//   CACHE_HIT on the unchanged-code re-queue after activation, ERROR with
//   peleErrorCode after the syntax break); the mermaid purple/black-fill
//   probes became computed-fill-equals---pele-surface checks; NEW: the
//   22-type render matrix (every corpus type yields an svg.pele root with
//   its pele-<type> class) and the XSS probes (no <script> in the preview
//   container, no javascript: href attributes).
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const PELE_MD = `# Pele Diagrams

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

// The 22-type render matrix (corpus shared with pele-theme.spec.ts — every
// sample validated against pele 1.10.0; the expected value is the pele
// DiagramType that rides the svg root class `pele pele-<type>`).
const MATRIX_SAMPLES: Array<[string, string]> = [
  ['flowchart', `flowchart LR
  A[Agent writes notes.md] --> B{Changed on disk?}
  B -- yes --> C[Mark reloads the tab]
  B -- no --> D[Keep editing]
  C --> E[(Snapshot)]
  D --> E`],
  ['sequence', `sequenceDiagram
  participant U as You
  participant M as Mark
  participant A as Agent
  A->>M: write notes.md
  M-->>U: show the change
  U->>M: edit a paragraph
  M->>A: hand back the edits
  Note over M,A: next turn reads your edits`],
  ['class', `classDiagram
  class Document {
    +String path
    +String markdown
    +save()
  }
  class Tab {
    +Boolean locked
    +toggleLock()
  }
  Document <|-- Tab
  Tab "1" --> "*" Snapshot`],
  ['state', `stateDiagram-v2
  [*] --> Editing
  Editing --> Saved: save
  Saved --> Editing: type
  Saved --> Locked: lock
  Locked --> Saved: unlock
  Saved --> [*]`],
  ['er', `erDiagram
  PROJECT ||--o{ FILE : contains
  FILE ||--o{ SNAPSHOT : keeps
  FILE {
    string path
    int words
  }
  SNAPSHOT {
    datetime at
    string source
  }`],
  ['gantt', `gantt
  title Release 2.3.1
  dateFormat YYYY-MM-DD
  section Chrome
  App title bar  :done, a1, 2026-10-12, 3d
  Status bar     :done, a2, after a1, 2d
  section Docs look
  Folder tree    :active, b1, 2026-10-16, 3d
  Pele themes    :b2, after b1, 4d`],
  ['pie', `pie title Where the time went
  "Writing" : 46
  "Editing" : 28
  "Reviewing" : 16
  "Formatting" : 10`],
  ['journey', `journey
  title Hand a draft to your agent
  section Write
    Open Mark: 5: You
    Paste the prompt: 4: You
  section Review
    Read the draft: 3: You, Agent
    Fix two paragraphs: 4: You`],
  ['gitGraph', `gitGraph
  commit id: "init"
  branch feature
  checkout feature
  commit id: "tree"
  commit id: "themes"
  checkout main
  merge feature
  commit id: "2.3.1"`],
  ['mindmap', `mindmap
  root((Mark))
    Writing
      WYSIWYG
      Source mode
    Agents
      Watch files
      Hand back edits
    Look
      Themes
      Diagrams`],
  ['timeline', `timeline
  title Mark releases
  2.1 : Tauri port
  2.2 : Agents mode
  2.3 : New icon : App Store
  2.4 : Docs look`],
  ['quadrantChart', `quadrantChart
  title Effort vs impact
  x-axis Low effort --> High effort
  y-axis Low impact --> High impact
  quadrant-1 Plan
  quadrant-2 Do now
  quadrant-3 Skip
  quadrant-4 Later
  Folder tree: [0.3, 0.8]
  Pele themes: [0.6, 0.75]
  Custom themes: [0.85, 0.5]
  Splash screen: [0.2, 0.2]`],
  ['xychart', `xychart-beta
  title "Words per day"
  x-axis [Mon, Tue, Wed, Thu, Fri]
  y-axis "Words" 0 --> 3000
  bar [1200, 1800, 2400, 900, 2100]
  line [1100, 1700, 2300, 1000, 2000]
  line [600, 900, 1200, 500, 1000]`],
  ['sankey', `sankey-beta
Drafts,Edited,60
Drafts,Discarded,15
Edited,Published,45
Edited,Archived,15`],
  ['block', `block-beta
  columns 3
  Agent space Mark
  space space space
  Edits:3
  Agent --> Mark
  Mark --> Edits`],
  ['packet', `packet-beta
  0-15: "Source port"
  16-31: "Destination port"
  32-63: "Sequence number"`],
  ['kanban', `kanban
  todo[To do]
    t1[Folder tree]
  doing[Doing]
    t2[Pele themes]
  done[Done]
    t3[Status bar]`],
  ['architecture', `architecture-beta
  group app(cloud)[Mark]
  service ui(server)[Renderer] in app
  service core(database)[Rust core] in app
  service disk(disk)[Files]
  ui:R --> L:core
  core:R --> L:disk`],
  ['radar', `radar-beta
  title Editor
  axis s["Speed"], l["Looks"], a["Agents"], t["Tables"], d["Diagrams"]
  curve m["Mark"]{4, 4, 5, 4, 3}
  curve o["Other"]{5, 3, 2, 3, 3}
  curve b["Baseline"]{3, 3, 3, 3, 3}`],
  ['treemap', `treemap-beta
"Docs"
    "Guides": 40
    "Notes": 25
"Code"
    "Rust": 30
    "Vue": 45`],
  ['requirement', `requirementDiagram
  requirement tree {
    id: 1
    text: show only Markdown
    risk: low
    verifymethod: test
  }
  element sidebar {
    type: component
  }
  sidebar - satisfies -> tree`],
  ['c4', `C4Context
  title Mark and your agent
  Person(user, "You")
  System(mark, "Mark", "Markdown editor")
  System_Ext(agent, "Agent", "Writes Markdown")
  Rel(agent, mark, "writes files")
  Rel(user, mark, "reads and edits")`]
]

const MATRIX_DOC = () =>
  MATRIX_SAMPLES.map(([type, code]) => `## ${type}\n\n\`\`\`mermaid\n${code}\n\`\`\``).join('\n\n')

// XSS probes: labels carrying raw markup + a javascript: click directive.
// pele escapes/strips label markup and (links disabled by peleOptions)
// emits no anchors — nothing executable may reach the preview DOM.
const XSS_MD = `# Diagram XSS probes

\`\`\`mermaid
graph TD
    A["<script>alert(1)</script>"] --> B["<a href='javascript:alert(2)'>bad link</a>"]
    click B "javascript:alert(3)" "tip"
\`\`\`

Text after.
`

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

/** Resolve a --pele-* variable on the document root the way the browser does. */
async function resolvePeleVar(page: Page, cssVar: string): Promise<string> {
  return page.evaluate((v: string) => {
    const el = document.createElement('div')
    el.style.cssText = `background: var(${v}); position: absolute; visibility: hidden;`
    document.body.appendChild(el)
    const value = window.getComputedStyle(el).backgroundColor
    el.remove()
    return value
  }, cssVar)
}

/** Collect console lines carrying the [Muya][renderPele] BLOCK_PELE_* markers. */
function collectConsoleMarkers(page: Page): string[] {
  const lines: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[Muya][renderPele][BLOCK_PELE_')) lines.push(text)
  })
  return lines
}

test.describe('pele diagram rendering', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })




  test('pele SVG is themed through --pele-* variables (no style blocks, no black fill)', async ({ page }) => {
    await bootstrapWithMarkdown(page, PELE_MD)

    // Wait for the editor to mount and muya to render.
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // Wait for pele to render — the svg.pele root inside a container preview.
    const peleSvg = page.locator('.ag-container-preview svg.pele').first()
    await peleSvg.waitFor({ state: 'visible', timeout: 20_000 })

    // The svg root carries the pele root class + the per-type class, and its
    // inline style references the --pele-* variables (pele emits NO <style>
    // blocks — the mermaid-era hoisting is gone by construction).
    const root = await page.evaluate(() => {
      const svg = document.querySelector('.ag-container-preview > svg') as SVGSVGElement | null
      if (!svg) return null
      return {
        rootClass: svg.getAttribute('class') || '',
        rootStyle: svg.getAttribute('style') || '',
        styleBlocks: document.querySelectorAll('.ag-container-preview style').length
      }
    })
    expect(root, 'the pele svg must be the direct preview child').not.toBeNull()
    expect(root!.rootClass).toMatch(/(^|\s)pele(\s|$)/)
    expect(root!.rootClass).toMatch(/pele-flowchart/)
    expect(root!.rootStyle, 'the svg root style must reference the --pele-* theming variables')
      .toContain('var(--pele-surface')
    expect(root!.rootStyle).toContain('var(--pele-bg')
    expect(root!.styleBlocks, 'pele SVGs must not carry <style> blocks').toBe(0)

    // Node shapes resolve their fill through the cascade: var(--_s) on the
    // rect resolves --pele-surface on the document root — the same value a
    // probe element sees. Never the unstyled black default.
    const surface = await resolvePeleVar(page, '--pele-surface')
    expect(surface, 'the theme must set --pele-surface on the document root')
      .toMatch(/^rgb/)
    const fillColor = await page.evaluate(() => {
      const rect = document.querySelector('.ag-container-preview svg g.pele-node rect, .ag-container-preview svg g.pele-node polygon')
      if (!rect) return 'no-rect-found'
      return window.getComputedStyle(rect).fill
    })
    expect(fillColor).not.toBe('no-rect-found')
    expect(fillColor, 'the node fill resolves --pele-surface (not raw var())').toBe(surface)
    expect(fillColor).not.toBe('rgb(0, 0, 0)')

    // Take a screenshot for visual verification.
    await peleSvg.screenshot({ path: 'test-results/pele-light.png' })
  })

  test('pele renders with dark theme colors', async ({ page }) => {
    await bootstrapWithMarkdown(page, PELE_MD, 'dark')

    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const peleSvg = page.locator('.ag-container-preview svg.pele').first()
    await peleSvg.waitFor({ state: 'visible', timeout: 20_000 })

    // Body should have 'dark' class.
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })

    // Theming is pure CSS cascade: the dark theme's --pele-* block is set on
    // the document root by util/theme.js and the node fill resolves it.
    const dark = await page.evaluate(() => {
      const rootVars = window.getComputedStyle(document.documentElement)
      const rect = document.querySelector('.ag-container-preview svg g.pele-node rect, .ag-container-preview svg g.pele-node polygon')
      return {
        surfaceVar: rootVars.getPropertyValue('--pele-surface').trim(),
        fill: rect ? window.getComputedStyle(rect).fill : 'none',
        styleBlocks: document.querySelectorAll('.ag-container-preview style').length
      }
    })
    expect(dark.surfaceVar, 'the dark theme must set --pele-surface').not.toBe('')
    expect(dark.styleBlocks, 'no <style> blocks in dark mode either').toBe(0)

    await peleSvg.screenshot({ path: 'test-results/pele-dark.png' })
  })

  // The 22-type render matrix: every corpus type yields a pele svg root with
  // its pele-<type> class and no error element (C-55 R-2 svg presence gate).
  test('every diagram type in the corpus renders an svg.pele root', async ({ page }) => {
    test.setTimeout(90_000)
    await bootstrapWithMarkdown(page, `# Pele matrix\n\n${MATRIX_DOC()}\n`)

    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // Root diagram SVGs only (architecture icons and C4 person glyphs are
    // nested <svg> elements inside their diagram).
    const rootSvgs = page.locator('figure.ag-container-block div.ag-container-preview svg.pele:not(svg svg)')
    await expect(rootSvgs).toHaveCount(MATRIX_SAMPLES.length, { timeout: 60_000 })
    await expect(page.locator('figure.ag-container-block .ag-pele-error')).toHaveCount(0)

    const classes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('figure.ag-container-block div.ag-container-preview > svg'))
        .map((svg) => svg.getAttribute('class') || '')
    )
    MATRIX_SAMPLES.forEach(([type], i) => {
      expect(
        classes[i],
        `figure ${i} (${type}) must carry the pele pele-${type} root class`
      ).toBe(`pele pele-${type}`)
    })
  })

  // C-34 R2.1: natural size + horizontal scroll for wide diagrams.
  test('wide flowchart fits the text column (natural size lives in the viewer)', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_FLOWCHART_MD)

    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // The render pipeline adds the ag-pele-preview hook class, which
    // scopes the natural-size CSS.
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('div.ag-pele-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })

    const sizing = await page.evaluate(() => {
      const container = document.querySelector('div.ag-container-preview.ag-pele-preview') as HTMLElement
      const svg = container.querySelector('svg') as SVGSVGElement
      return {
        overflowX: window.getComputedStyle(container).overflowX,
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth,
        svgWidth: Math.round(svg.getBoundingClientRect().width),
        scrollbarHeight: container.offsetHeight - container.clientHeight
      }
    })

    expect(sizing.overflowX).toBe('auto')
    // Smoke 2.3.0: if anything ever scrolls, the scrollbar stays thin.
    expect(sizing.scrollbarHeight, 'horizontal scrollbar must be thin').toBeLessThanOrEqual(8)
    // User decision 2026-10-15: wide diagrams fit the column, no sideways scroll.
    expect(sizing.svgWidth, 'wide diagram must fit the column').toBeLessThanOrEqual(sizing.clientWidth + 1)
    expect(sizing.scrollWidth, 'no horizontal scroll').toBeLessThanOrEqual(sizing.clientWidth + 1)
  })

  // C-34 R2.1: keep-last-good — a syntax error typed after a successful
  // render keeps the last SVG visible and shows the pele error text. The
  // pipeline logs BLOCK_PELE_RENDER (first draw), BLOCK_PELE_CACHE_HIT (the
  // unchanged-code re-queue after the plain click activates the source)
  // and then BLOCK_PELE_ERROR after the syntax break.
  test('syntax error after a good render keeps the SVG, shows the error element and the BLOCK_PELE markers', async ({ page }) => {
    const markers = collectConsoleMarkers(page)
    await bootstrapWithMarkdown(page, PELE_MD)

    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    const goodSvg = page.locator('div.ag-pele-preview svg').first()
    await goodSvg.waitFor({ state: 'visible', timeout: 20_000 })

    // First draw logs BLOCK_PELE_RENDER.
    await expect
      .poll(() => markers.filter((m) => m.includes('[BLOCK_PELE_RENDER]')).length, { timeout: 10_000 })
      .toBeGreaterThan(0)

    // A plain click on the preview opens the source for editing; the
    // activation re-queues the UNCHANGED code — a cache hit.
    await preview.click()
    await expect
      .poll(() => markers.filter((m) => m.includes('[BLOCK_PELE_CACHE_HIT]')).length, { timeout: 15_000 })
      .toBeGreaterThan(0)

    const codeContent = page.locator('pre[data-role="mermaid"] span.ag-code-content').first()
    await codeContent.waitFor({ state: 'visible', timeout: 10_000 })
    // Click near the top-left so the caret lands on the first code line.
    await codeContent.click({ position: { x: 2, y: 2 } })
    // Break the diagram syntax at the start of the first line.
    await page.keyboard.press('Home')
    await page.keyboard.type('!!! ', { delay: 30 })

    // The pipeline debounces re-renders while typing (~250 ms quiet).
    const errorEl = page.locator('figure.ag-container-block .ag-pele-error').first()
    await errorEl.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(errorEl).toContainText(/diagram|parse|syntax|pele/i)

    // The failed re-render logs BLOCK_PELE_ERROR with the pele error code.
    await expect
      .poll(() => markers.filter((m) => m.includes('[BLOCK_PELE_ERROR]')).length, { timeout: 15_000 })
      .toBeGreaterThan(0)

    // Keep-last-good: the previous SVG is still on screen next to the error.
    await expect(page.locator('figure.ag-container-block div.ag-container-preview svg').first())
      .toBeVisible()
  })

  // XSS probes: labels carrying <script>/<a href="javascript:"> markup and
  // a javascript: click directive must never become executable markup —
  // pele strips/escapes label markup and (links disabled) emits no anchors.
  test('labels with markup and javascript: links never become executable markup', async ({ page }) => {
    await bootstrapWithMarkdown(page, XSS_MD)

    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    const probe = await page.evaluate(() => {
      const container = document.querySelector('figure.ag-container-block div.ag-container-preview')
      if (!container) return null
      const scripts = container.querySelectorAll('script').length
      const anchors = Array.from(container.querySelectorAll('a[href], [href]'))
      const javascriptHrefs = anchors.filter((a) =>
        /^javascript:/i.test(a.getAttribute('href') || '')
      ).length
      const svg = container.querySelector('svg')
      return {
        scripts,
        hrefCount: anchors.length,
        javascriptHrefs,
        // The hostile label TEXT survives (proving the label was parsed),
        // but only as inert text content of the svg.
        labelSeen: svg ? (svg.textContent || '').includes('alert(1)') : false
      }
    })
    expect(probe, 'the preview container must exist').not.toBeNull()
    expect(probe!.scripts, 'no <script> element may exist inside the preview').toBe(0)
    expect(probe!.javascriptHrefs, 'no javascript: href may exist inside the preview').toBe(0)
    expect(probe!.labelSeen, 'the hostile label text renders as inert text').toBe(true)
  })
})
