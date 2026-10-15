/**
 * rich-markdown-coverage.spec.ts — C-51 T-009 honesty guard.
 *
 * The universal agent prompt (guide.agentPrompt.mac/.generic) tells agents
 * Mark renders a long list of rich-Markdown features. This spec renders a
 * fixture with ONE EXAMPLE OF EVERY FEATURE THE PROMPT NAMES and asserts
 * each actually rendered — so the prompt can never drift ahead of the
 * renderer:
 *
 *   - all 22 Mermaid diagram types (one <svg> per block, no
 *     .ag-mermaid-error anywhere);
 *   - ```vega-lite, ```flowchart (flowchart.js) and ```sequence blocks
 *     (svg present);
 *   - all 5 GitHub callout tags + the 10 further tags the prompt names
 *     (info/todo/success/question/failure/danger/bug/example/quote/
 *     abstract), one with a custom title, one foldable with - and one
 *     with +;
 *   - task list (checked + unchecked), inline + block math (KaTeX),
 *     fenced code with a language, footnote (reference + definition),
 *     YAML front matter (props view), emoji shortcode, aligned table,
 *     link and image.
 *
 * gantt note: a task whose name starts with "Title" parses as the title
 * keyword — the sample below avoids it.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// 1×1 px red dot PNG — no network, no fixture file.
const DOT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// Every mermaid type the prompt names, in prompt order, each a realistic
// minimal sample accepted by the bundled mermaid 11.14.
const MERMAID_SAMPLES: Array<[string, string]> = [
  ['flowchart', 'flowchart LR\n  W[Write] --> R[Read]'],
  ['sequenceDiagram', 'sequenceDiagram\n  A->>B: hi\n  B-->>A: ok'],
  ['classDiagram', 'classDiagram\n  Animal <|-- Dog'],
  ['stateDiagram-v2', 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]'],
  ['erDiagram', 'erDiagram\n  USER ||--o{ POST : writes'],
  ['gantt', 'gantt\n  dateFormat YYYY-MM-DD\n  section Ship\n  Draft :a1, 2026-01-01, 3d\n  Review :after a1, 2d'],
  ['timeline', 'timeline\n  title Story\n  2026 : Start\n  2027 : Grow'],
  ['gitGraph', 'gitGraph\n  commit id: "one"\n  commit id: "two"\n  branch feat\n  commit'],
  ['mindmap', 'mindmap\n  root((Mark))\n    Renders\n    Fast'],
  ['journey', 'journey\n  title Trip\n  section Go\n    Start: 5: Me\n    Finish: 4: Me'],
  [
    'quadrantChart',
    'quadrantChart\n  title Fit\n  x-axis Low --> High\n  y-axis Low --> High\n  quadrant-1 Do\n  quadrant-2 Plan\n  quadrant-3 Skip\n  quadrant-4 Later\n  Task A: [0.7, 0.8]'
  ],
  ['pie', 'pie title Share\n  "Diagrams" : 2\n  "Text" : 1'],
  ['xychart-beta', 'xychart-beta\n  title "Size"\n  x-axis [a, b]\n  bar [3, 5]'],
  ['sankey-beta', 'sankey-beta\n  Mark,Diagrams,10\n  Mark,Text,4\n  Diagrams,Shipped,7'],
  ['block-beta', 'block-beta\n  columns 2\n  A B'],
  ['packet-beta', 'packet-beta\n  0-15: "Source"\n  16-31: "Dest"'],
  ['kanban', 'kanban\n  Ready\n    t1[Write]\n  Done\n    t2[Ship]'],
  ['architecture-beta', 'architecture-beta\n  service db(database)[Store]\n  service app(server)[App]\n  app:R --> L:db'],
  ['radar-beta', 'radar-beta\n  axis s["Speed"], c["Cost"]\n  curve car["Car"]{70, 30}\n  max 100'],
  ['treemap-beta', 'treemap-beta\n"Mark"\n    "Diagrams": 3\n    "Tables": 1'],
  ['requirementDiagram', 'requirementDiagram\n  requirement render {\n    text: the diagram renders\n  }'],
  [
    'C4Context',
    'C4Context\n  title Context\n  Person(u, "User")\n  System(m, "Mark")\n  Rel(u, m, "Edits in")'
  ]
]

const CALLOUT_TAGS = [
  'note', 'tip', 'important', 'warning', 'caution',
  'info', 'todo', 'success', 'question', 'failure',
  'danger', 'bug', 'example', 'quote', 'abstract'
]

function mermaidFixture (): string {
  const blocks = MERMAID_SAMPLES.map(
    ([type, code]) => `## ${type}\n\n\`\`\`mermaid\n${code}\n\`\`\`\n`
  ).join('\n')
  return `# Every mermaid type\n\n${blocks}`
}

function featuresFixture (): string {
  const callouts = [
    '> [!NOTE]\n> Plain note.',
    '> [!TIP]-\n> Folded tip — click the title to open it.',
    '> [!IMPORTANT] Read me first\n> A callout with a custom title.',
    '> [!WARNING]\n> Plain warning.',
    '> [!CAUTION]\n> Plain caution.',
    '> [!info] Info alias\n> Body.',
    '> [!todo] Todo alias\n> Body.',
    '> [!success] Success alias\n> Body.',
    '> [!question] Question alias\n> Body.',
    '> [!failure] Failure alias\n> Body.',
    '> [!danger] Danger alias\n> Body.',
    '> [!bug] Bug alias\n> Body.',
    '> [!example]+ Example alias\n> Expanded fold.',
    '> [!quote] Quote alias\n> Body.',
    '> [!abstract] Abstract alias\n> Body.'
  ].join('\n\n')

  return `---
title: Coverage
---

# Every other feature the prompt names

Charts from data and the quick blocks:

\`\`\`vega-lite
{"data":{"values":[{"kind":"A","count":3},{"kind":"B","count":5}]},"mark":"bar","encoding":{"x":{"field":"kind","type":"nominal"},"y":{"field":"count","type":"quantitative"}}}
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

Callouts — titled, foldable with - and with +:

${callouts}

A task list:

- [x] Write the draft
- [ ] Review it

Math in both shapes — inline $a^2 + b^2 = c^2$ and a block:

$$
\\int_0^1 x^2\\,dx = \\tfrac13
$$

Code with a language:

\`\`\`rust
fn main() {
    println!("rich");
}
\`\`\`

A footnote.[^1]

[^1]: The one and only source.

An emoji :tada: and a [link to Mark](https://example.com/mark).

![dot](${DOT_PNG})

An aligned table:

| Left | Centre | Right |
| :--- | :----: | ----: |
| idea | notes | done |
`
}

async function openCoverageDoc (page: Page, markdown: string): Promise<void> {
  await bootEditor(page)
  await openFileTab(page, '/tmp/c51-t009/coverage.md', markdown)
  await page.locator('.editor-component, .editor-wrapper').first()
    .waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('rich Markdown coverage (C-51 T-009)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('all 22 mermaid types the prompt names render an SVG with no error', async ({ page }) => {
    test.setTimeout(180_000)
    await openCoverageDoc(page, mermaidFixture())

    // One figure per sample — this also proves each fence parsed as mermaid.
    const figures = page.locator('.editor-with-tabs figure[data-role="MERMAID"]')
    await expect(figures).toHaveCount(MERMAID_SAMPLES.length, { timeout: 30_000 })

    // Diagrams render async (lazy chunk + per-block pipeline) — one svg each.
    // Root diagram SVGs only — architecture icons are nested <svg>s.
    const svgs = page.locator('.editor-with-tabs figure[data-role="MERMAID"] div.ag-container-preview svg:not(svg svg)')
    await expect(svgs).toHaveCount(MERMAID_SAMPLES.length, { timeout: 120_000 })

    // Settle, then no block may carry a mermaid error marker.
    await page.waitForTimeout(1_500)
    await expect(page.locator('.editor-with-tabs .ag-mermaid-error')).toHaveCount(0)
    await expect(page.locator('.editor-with-tabs .ag-math-error')).toHaveCount(0)

    await page.screenshot({ path: 'test-results/c51-t009-mermaid-matrix.png', fullPage: true })
  })

  test('every other feature the prompt names renders', async ({ page }) => {
    test.setTimeout(120_000)
    await openCoverageDoc(page, featuresFixture())

    // ── charts from data + the quick blocks: svg per container ──────────
    await expect(page.locator('.editor-with-tabs figure[data-role="VEGA-LITE"] div.ag-container-preview svg'))
      .toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.editor-with-tabs figure[data-role="FLOWCHART"] div.ag-container-preview svg'))
      .toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.editor-with-tabs figure[data-role="SEQUENCE"] div.ag-container-preview svg'))
      .toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.editor-with-tabs .ag-math-error')).toHaveCount(0)

    // ── callouts: 5 GitHub tags + 10 further tags, title, folds ─────────
    const callouts = page.locator('.editor-with-tabs blockquote.ag-callout')
    await expect(callouts).toHaveCount(CALLOUT_TAGS.length, { timeout: 10_000 })
    for (const style of CALLOUT_TAGS) {
      await expect(page.locator(`.editor-with-tabs blockquote.ag-callout-${style}`), style)
        .toHaveCount(1)
    }
    await expect(page.locator('.ag-callout-title-text', { hasText: 'Read me first' })).toBeVisible()

    const folded = page.locator('blockquote.ag-callout-tip')
    await expect(folded).toHaveClass(/ag-callout-foldable/)
    await expect(folded).toHaveClass(/ag-callout-collapsed/)
    const expanded = page.locator('blockquote.ag-callout-example')
    await expect(expanded).toHaveClass(/ag-callout-foldable/)
    await expect(expanded).not.toHaveClass(/ag-callout-collapsed/)

    // ── task list: one checked, one open ───────────────────────────────
    const checkboxes = page.locator('.editor-with-tabs li.ag-task-list-item input.ag-task-list-item-checkbox')
    await expect(checkboxes).toHaveCount(2, { timeout: 10_000 })
    await expect(page.locator('.editor-with-tabs input.ag-task-list-item-checkbox.ag-checkbox-checked'))
      .toHaveCount(1)

    // ── math: KaTeX inline and display ─────────────────────────────────
    await expect(page.locator('.editor-with-tabs span.ag-math .ag-math-render .katex'))
      .toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.editor-with-tabs figure[data-role="MULTIPLEMATH"] .ag-container-preview .katex'))
      .toHaveCount(1, { timeout: 30_000 })

    // ── fenced code with a language ────────────────────────────────────
    const rust = page.locator('.editor-with-tabs pre[data-role="fencecode"].language-rust')
    await expect(rust).toHaveCount(1)
    await expect(rust).toContainText('fn main()')

    // ── footnote: reference + definition ───────────────────────────────
    await expect(page.locator('.editor-with-tabs sup.ag-inline-footnote-identifier')).toHaveCount(1)
    await expect(page.locator('.editor-with-tabs figure[data-role="FOOTNOTE"]')).toHaveCount(1)

    // ── YAML front matter: props view of the metadata ──────────────────
    await expect(page.locator('.editor-with-tabs pre.ag-front-matter')).toHaveCount(1)
    const frontMatterTable = page.locator('.editor-with-tabs .ag-front-matter-table')
    await expect(frontMatterTable).toBeVisible({ timeout: 10_000 })
    await expect(frontMatterTable.locator('.ag-fm-key', { hasText: 'title' })).toBeVisible()

    // ── emoji shortcode resolves to the character ──────────────────────
    await expect(page.locator('.editor-with-tabs span[data-emoji="🎉"]')).toHaveCount(1)

    // ── link ────────────────────────────────────────────────────────────
    const link = page.locator('.editor-with-tabs a.ag-inline-rule[href*="example.com"]')
    await expect(link).toHaveCount(1)
    await expect(link).toHaveText('link to Mark')

    // ── image (data: URI): loads into the success container ────────────
    await expect(page.locator('.editor-with-tabs span.ag-image-success img[src^="data:image/png;base64,"]'))
      .toHaveCount(1, { timeout: 15_000 })

    // ── table alignment: centre and right header cells compute the styles
    const alignments = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll<HTMLElement>('figure[data-role="TABLE"] thead th'))
      return cells.map((cell) => window.getComputedStyle(cell).textAlign)
    })
    expect(alignments).toEqual(['left', 'center', 'right'])

    await page.screenshot({ path: 'test-results/c51-t009-features.png', fullPage: true })
  })

  test('the Guide ships the prompt block and the «What Mark renders» showcase', async ({ page }) => {
    test.setTimeout(120_000)
    await bootEditor(page)

    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'help.guide')
    })

    // The showcase section heading is present after the connect-agent one.
    const showcase = page.locator('.editor-with-tabs h2', { hasText: 'What Mark renders' })
    await expect(showcase).toBeVisible({ timeout: 15_000 })

    // The multi-line mac prompt sits inside a copyable fenced block and
    // still lists the rich-Markdown features.
    const promptBlock = page.locator('.editor-with-tabs pre[data-role="fencecode"]', { hasText: 'open -a Mark' })
    await expect(promptBlock).toBeVisible({ timeout: 15_000 })
    await expect(promptBlock).toContainText('```mermaid')
    await expect(promptBlock).toContainText('your next instruction')

    // Live showcase families render inside the guide itself: the 5 showcase
    // diagrams (flowchart, sequenceDiagram, pie, gantt, mindmap) plus the
    // pre-existing "Try it: a Mermaid diagram" block.
    const guideMermaid = page.locator('.editor-with-tabs figure[data-role="MERMAID"] div.ag-container-preview svg')
    await expect(guideMermaid).toHaveCount(6, { timeout: 60_000 })
    await expect(page.locator('.editor-with-tabs figure[data-role="VEGA-LITE"] div.ag-container-preview svg'))
      .toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.editor-with-tabs figure[data-role="FLOWCHART"] div.ag-container-preview svg'))
      .toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.editor-with-tabs figure[data-role="SEQUENCE"] div.ag-container-preview svg'))
      .toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.editor-with-tabs .ag-mermaid-error')).toHaveCount(0)

    await page.screenshot({ path: 'test-results/c51-t009-guide.png', fullPage: true })
  })
})
