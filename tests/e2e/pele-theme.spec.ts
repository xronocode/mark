// FILE: tests/e2e/pele-theme.spec.ts
// VERSION: 3.0.0
// START_MODULE_CONTRACT
//   PURPOSE: E2E gate for C-51 T-003/T-004/T-012 on the pele engine (C-55) — pele diagrams follow the active app theme through the --pele-* CSS variables: the 22-diagram-type × light/dark render matrix (no errors, no pele fallback colours, readable gantt/packet labels, palette-coloured series diagrams, classDef user overrides win, paper → ink recolors through the cascade with ZERO pele re-renders) and the T-012 node-contrast gate that measures the COMPUTED node colours of a flowchart (with subgraph), a sequence diagram and a state diagram in ink, docs-dark and macos-dark against the diagram panel.
//   SCOPE: booting the editor with a mocked theme preference and a generated document; resolving --pele-* theme CSS variables the way the browser does; computing WCAG contrast and Oklab ΔL in the spec (the twin of diagramTheme.wcagContrast); measuring computed pele node rect fill/stroke (g.pele-node rect/polygon), label ink (text.pele-label computed fill — pele SVG text paints through fill and resolves --pele-fg), cluster fill (g.pele-cluster rect → --pele-surface-alt), edge strokes (g.pele-edge path, stroke resolves --pele-line) and arrowheads (path.pele-marker — pele paints markers as real paths, not defs); the BLOCK_PELE_RENDER / BLOCK_PELE_CACHE_HIT log markers of pelePipeline.js; per-theme evidence screenshots.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim (installTauriShim), ./fixtures/helpers (bootEditor, openFileTab).
//   LINKS: .grace/changes/archive/C-55 R-2/R-3 (CSS-variable theming, zero re-renders) and its ExpectedEvidence "theme switch recolors without re-render (DOM svg unchanged)"; .grace/changes/active/C-51 T-003/T-004/T-012; .grace/verification/runtime.xml V-M-012 (pele theme scenarios); the unit twins tests/renderer/muya/pele-pipeline.test.js, diagram-theme.test.js and pele-node-contrast.test.js; src/muya/lib/parser/render/diagramTheme.js (buildPeleVariables); src/muya/lib/parser/render/pelePipeline.js. Runs in chromium and webkit-pele-theme.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DIAGRAM_SAMPLES - one sample per diagram type (flowchart … c4) for the 22-type matrix.
//   DIAGRAM_TYPES - the type keys in sample order (matrix length).
//   SAMPLE_BY_TYPE - type key → sample code (used by the theme-switch case).
//   buildAllDiagramsDoc - wrap every sample into a mermaid fence document (fence language and figure data-role stay mermaid — pele parses mermaid syntax).
//   FIGURE - selector of a container-block figure.
//   PREVIEW_SVG - selector of the root diagram SVG (nested <svg> excluded).
//   INDEX_BY_TYPE - type key → figure index in the matrix document.
//   bootWithThemeAndDoc - install the theme pref mock, boot the editor, open the doc tab.
//   resolveVar - resolve a CSS variable through a hidden probe element the way the browser does.
//   waitForAllDiagrams - wait for N rendered diagram SVGs and no pele error.
//   collectPeleMarkers - record console lines carrying the [Muya][renderPele] BLOCK_PELE_* markers.
//   parseRgb - computed colour string → [r, g, b] (null when unparsable).
//   contrast - two computed colours → WCAG 2.x contrast ratio.
//   oklabLightness - computed colour → Oklab lightness (ΔL half of the fill rule).
//   fillDistinctFromPanel - the T-012 fill rule: WCAG ≥ 1.25 OR OKLCH ΔL ≥ 0.06.
//   NodeContrastMeasurement - shape of one figure's measured colours.
//   measureFigureContrast - computed panel/shape fill/stroke/label-ink/cluster/edges/arrowhead colours of the i-th figure (pele selectors).
//   NODE_CONTRAST_DOC - flowchart + subgraph, sequence and state document for the T-012 gate.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v3.0.0 - 2026-10-17 C-55: ported from
//   mermaid-theme.spec.ts for the mermaid→pele hard cut. Theming left the
//   render: colours resolve through the --pele-* CSS variables
//   (buildPeleVariables → util/theme.js sets them on the document root), so
//   the paper → ink case now pins the C-55 contract instead of a re-render:
//   the computed node fill changes through the cascade, the root
//   --pele-surface variable changes, the BLOCK_PELE_RENDER marker does NOT
//   fire again (zero pele re-renders — only BLOCK_PELE_CACHE_HIT) and the
//   svg markup stays byte-identical (class/style/viewBox/data-natural-width)
//   while exactly one svg remains. The mermaid-specific measurements were
//   re-pointed at pele's SVG shapes: g.pele-node rect/polygon fill/stroke
//   (var(--_s)/var(--_b)), text.pele-label fill (pele SVG text paints via
//   fill — the mermaid foreignObject/tspan label-ink dance is gone),
//   g.pele-cluster rect (--pele-surface-alt) and path.pele-marker arrowheads
//   (real painted paths, not marker defs — the used-marker bookkeeping is
//   gone). The default-purple/Trebuchet scan became a pele-fallback scan
//   (#5b7bd5 accent / #f3f3f3 surface / #8a8a8a border must never leak —
//   the live --pele-* block always wins the cascade), the surface/panel/text
//   expectations resolve --pele-surface/--pele-bg/--pele-fg, and the
//   %%{init}%% override case became the pele equivalent: a classDef with
//   inline colours beats the theme variables while the unstyled nodes stay
//   themed. The 22-type corpus is unchanged (validated against pele 1.6.0).
//   PREV: v2.2.0 - 2026-10-17 C-54 R-1: Paper's flowchart fill is
//   the surface (a white card lighter than the panel); dark themes keep
//   the T-012 distinct-fill pins.
//   v2.1.0/v2.0.0 - 2026-10-16 C-51 T-012: label-ink and rendered-
//   arrowhead measurement fixes (mermaid-era selectors).
//   v1.0.0 - 2026-10-16 C-51 T-003/T-004: the 22-type × light/dark matrix.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// C-51 T-003/T-004 + C-55: pele follows the app theme — the 22-type ×
// light/dark matrix from the accepted lab (corpus unchanged, every sample
// validated against pele 1.6.0; the gantt task «Title bar» is renamed
// «App title bar» because the gantt lexer eats ANY line starting with the
// case-insensitive `title` keyword as the diagram title; radar and xychart
// carry one extra series so the "≥ 3 distinct palette colours" assertion
// sees three series colours).

const DIAGRAM_SAMPLES: Array<[string, string]> = [
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
  Mermaid themes :b2, after b1, 4d`],
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
  ['gitgraph', `gitGraph
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
  ['quadrant', `quadrantChart
  title Effort vs impact
  x-axis Low effort --> High effort
  y-axis Low impact --> High impact
  quadrant-1 Plan
  quadrant-2 Do now
  quadrant-3 Skip
  quadrant-4 Later
  Folder tree: [0.3, 0.8]
  Mermaid themes: [0.6, 0.75]
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
    t2[Mermaid themes]
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

const DIAGRAM_TYPES = DIAGRAM_SAMPLES.map(([type]) => type)
const SAMPLE_BY_TYPE = Object.fromEntries(DIAGRAM_SAMPLES)

const buildAllDiagramsDoc = () =>
  DIAGRAM_SAMPLES.map(([type, code]) => `## ${type}\n\n\`\`\`mermaid\n${code}\n\`\`\``).join('\n\n')

const FIGURE = 'figure.ag-container-block'
// Root diagram SVGs only: architecture icons and C4 person glyphs are
// nested <svg> elements inside their diagram.
const PREVIEW_SVG = 'figure.ag-container-block div.ag-container-preview svg:not(svg svg)'

const INDEX_BY_TYPE: Record<string, number> = {}
DIAGRAM_TYPES.forEach((type, i) => {
  INDEX_BY_TYPE[type] = i
})

async function bootWithThemeAndDoc(page: Page, theme: string, markdown: string) {
  if (theme !== 'paper') {
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
          lightModeTheme: 'paper',
          darkModeTheme: 'ink',
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
  }
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/pele-matrix.md', markdown)
}

/**
 * Resolve a CSS variable the way the browser resolves it for a real
 * element, so comparisons against computed SVG colours are exact.
 */
async function resolveVar(page: Page, cssVar: string, kind: 'bg' | 'color'): Promise<string> {
  return page.evaluate(({ v, k }: { v: string; k: 'bg' | 'color' }) => {
    const el = document.createElement('div')
    el.style.cssText = `${k === 'bg' ? 'background' : 'color'}: var(${v}); position: absolute; visibility: hidden;`
    document.body.appendChild(el)
    const cs = window.getComputedStyle(el)
    const value = k === 'bg' ? cs.backgroundColor : cs.color
    el.remove()
    return value
  }, { v: cssVar, k: kind })
}

/** Collect console lines carrying the [Muya][renderPele] BLOCK_PELE_* markers. */
function collectPeleMarkers(page: Page): string[] {
  const lines: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[Muya][renderPele][BLOCK_PELE_')) lines.push(text)
  })
  return lines
}

async function waitForAllDiagrams(page: Page, count: number) {
  await expect(page.locator(PREVIEW_SVG)).toHaveCount(count, { timeout: 60_000 })
  await expect(page.locator(`${FIGURE} .ag-pele-error`)).toHaveCount(0)
}

// START_BLOCK_T012_HELPERS
// C-51 T-012: compute WCAG contrast ratios between COMPUTED colours in the
// spec — the twin of diagramTheme.wcagContrast, applied to what pele
// actually painted (node rect fill/stroke, label, edges, arrowheads) against
// the diagram panel (the SVG's --codeBlockBgColor background).
function parseRgb(value: string | null): [number, number, number] | null {
  if (!value) return null
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function contrast(a: string | null, b: string | null): number {
  const ca = parseRgb(a)
  const cb = parseRgb(b)
  if (!ca || !cb) return 1
  const lum = ([r, g, b]: [number, number, number]) => {
    const ch = (v: number) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
  }
  const la = lum(ca)
  const lb = lum(cb)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// Oklab lightness of a computed colour — the ΔL half of the T-012 fill rule
// (near-white/near-black greys compress in WCAG luminance; the module accepts
// either gate, so the spec asserts the same disjunction).
function oklabLightness(value: string | null): number | null {
  const c = parseRgb(value)
  if (!c) return null
  const lin = (v: number) => {
    const x = v / 255
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  const r = lin(c[0])
  const g = lin(c[1])
  const b = lin(c[2])
  const l = Math.cbrt(0.4122214708 * r + 0.536301541 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

/** The T-012 fill rule: WCAG ≥ 1.25 OR OKLCH ΔL ≥ 0.06 against the panel. */
function fillDistinctFromPanel(fill: string | null, panel: string | null): boolean {
  const lf = oklabLightness(fill)
  const lp = oklabLightness(panel)
  if (lf === null || lp === null) return false
  return contrast(fill, panel) >= 1.25 || Math.abs(lf - lp) >= 0.06
}

interface NodeContrastMeasurement {
  panel: string | null
  fill: string | null
  stroke: string | null
  label: string | null
  clusterFill: string | null
  edges: string[]
  markers: string[]
}

/** Computed node colours of the i-th diagram figure, measured in the page (pele selectors). */
async function measureFigureContrast(page: Page, figureIndex: number): Promise<NodeContrastMeasurement> {
  return page.evaluate((idx: number) => {
    const figure = document.querySelectorAll('figure.ag-container-block')[idx]
    const svg = figure && figure.querySelector('div.ag-container-preview > svg')
    if (!svg) {
      return { panel: null, fill: null, stroke: null, label: null, clusterFill: null, edges: [], markers: [] }
    }
    const computed = (el: Element | null, prop: 'fill' | 'stroke') =>
      el ? window.getComputedStyle(el)[prop] : null
    const parseable = (v: string | null) => (v && /rgba?\(/.test(v) ? v : null)
    // pele node cards: g.pele-node rect/polygon (fill resolves var(--_s) →
    // --pele-surface, stroke var(--_b) → --pele-border). The state start/end
    // dots are circles without a border, so they stay out of the shape read.
    const shape = svg.querySelector('g.pele-node rect, g.pele-node polygon')
    // Node label ink: pele paints SVG <text class="pele-label"> through FILL
    // (inherited from the svg root's var(--_fg) → --pele-fg).
    const labelEl = svg.querySelector('g.pele-node text.pele-label')
    // Clusters/subgraph bands: g.pele-cluster rect (fill resolves
    // var(--_a) → --pele-surface-alt).
    const cluster = svg.querySelector('g.pele-cluster rect')
    // Arrowheads: pele paints them as real path.pele-marker elements
    // (fill var(--_l) → --pele-line), never as unused marker defs.
    return {
      panel: parseable(window.getComputedStyle(svg).backgroundColor),
      fill: parseable(computed(shape, 'fill')),
      stroke: parseable(computed(shape, 'stroke')),
      label: parseable(computed(labelEl, 'fill')),
      clusterFill: parseable(computed(cluster, 'fill')),
      edges: [...svg.querySelectorAll('g.pele-edge > path:not(.pele-marker)')]
        .map((el) => window.getComputedStyle(el).stroke)
        .filter((v) => v && v !== 'none' && /rgba?\(/.test(v)),
      markers: [...svg.querySelectorAll('path.pele-marker')]
        .map((el) => window.getComputedStyle(el).fill)
        .filter((v) => v && v !== 'none' && /rgba?\(/.test(v))
    }
  }, figureIndex)
}

// One flowchart WITH a subgraph (cluster), a sequence diagram (actors +
// notes) and a state diagram — the three families the T-012 gate measures.
const NODE_CONTRAST_DOC = `# Node contrast

\`\`\`mermaid
flowchart LR
  subgraph sg[Sync]
    A[Agent writes notes.md] --> B{Changed on disk?}
  end
  B -- yes --> C[Mark reloads the tab]
  B -- no --> D[Keep editing]
\`\`\`

\`\`\`mermaid
sequenceDiagram
  participant U as You
  participant M as Mark
  U->>M: edit a paragraph
  M-->>U: show the change
  Note over M: next turn reads your edits
\`\`\`

\`\`\`mermaid
stateDiagram-v2
  [*] --> Editing
  Editing --> Saved: save
  Saved --> Editing: type
  Saved --> [*]
\`\`\`
`
// END_BLOCK_T012_HELPERS

test.describe('pele follows the app theme (C-51 T-003/T-004, C-55)', () => {
  // 22 sequential pele renders per theme + screenshots need headroom.
  test.setTimeout(120_000)

  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  for (const theme of ['paper', 'ink'] as const) {
    test.describe(`theme ${theme}`, () => {
      test.setTimeout(150_000)

      test('all 22 diagram types render themed without errors or fallback colours', async ({ page }) => {
        await bootWithThemeAndDoc(page, theme, `# Pele matrix\n\n${buildAllDiagramsDoc()}\n`)
        await waitForAllDiagrams(page, DIAGRAM_TYPES.length)

        // No pele built-in fallback colour in any computed fill/stroke
        // (#5b7bd5 accent / #f3f3f3 surface / #8a8a8a border from the
        // var(--_x, fallback) defaults), and no Trebuchet anywhere (the
        // mermaid default font). The live --pele-* block on the document
        // root must win the cascade for every element.
        const scan = await page.evaluate(() => {
          const bad = new Set(['rgb(91, 123, 213)', 'rgb(243, 243, 243)', 'rgb(138, 138, 138)'])
          const offenders: string[] = []
          let trebuchet = 0
          for (const svg of document.querySelectorAll('.ag-container-preview svg')) {
            for (const el of svg.querySelectorAll('*')) {
              const cs = window.getComputedStyle(el)
              if (bad.has(cs.fill) || bad.has(cs.stroke)) {
                offenders.push(`${el.tagName}:${cs.fill || cs.stroke}`)
              }
              if (/trebuchet/i.test(cs.fontFamily || '')) trebuchet++
            }
          }
          return { offenders, trebuchet }
        })
        expect(scan.offenders).toEqual([])
        expect(scan.trebuchet, 'no Trebuchet font in any pele element').toBe(0)

        // Per-type screenshots for the evidence pack.
        const figures = page.locator(FIGURE)
        for (let i = 0; i < DIAGRAM_TYPES.length; i++) {
          await figures
            .nth(i)
            .screenshot({ path: `test-results/pele-themes/${theme}-${DIAGRAM_TYPES[i]}.png` })
        }
      })

      test('flowchart nodes are derived from the theme with panel contrast; series diagrams use the palette', async ({ page }) => {
        await bootWithThemeAndDoc(page, theme, `# Pele matrix\n\n${buildAllDiagramsDoc()}\n`)
        await waitForAllDiagrams(page, DIAGRAM_TYPES.length)

        // The pele variables ARE the derivation (buildPeleVariables):
        // --pele-surface the node card fill, --pele-fg the ink, --pele-bg
        // the code-block panel the SVG sits on.
        const expectedSurface = await resolveVar(page, '--pele-surface', 'bg')
        const expectedText = await resolveVar(page, '--pele-fg', 'color')
        const expectedPanel = await resolveVar(page, '--pele-bg', 'bg')

        const flow = await page.evaluate(() => {
          const figure = document.querySelectorAll('figure.ag-container-block')[0]
          const shape = figure.querySelector('g.pele-node rect, g.pele-node polygon')
          const label = figure.querySelector('g.pele-node text.pele-label')
          return {
            fill: shape ? window.getComputedStyle(shape).fill : 'none',
            stroke: shape ? window.getComputedStyle(shape).stroke : 'none',
            labelFill: label ? window.getComputedStyle(label).fill : 'none'
          }
        })
        // C-51 T-012 / C-54 R-1: node shapes sit on the code-block panel —
        // paper draws the surface as a light card (the theme's own float
        // surface, ΔL ≥ 0.015 above the panel); ink keeps the derived
        // distinct lift.
        if (theme === 'paper') {
          // Paper pins of the buildPeleVariables mapping: the panel is the
          // theme's code-block background, the ink its editor text, and the
          // node card its float surface (light-card rule).
          expect(expectedPanel, 'paper: --pele-bg is the code-block panel')
            .toBe(await resolveVar(page, '--codeBlockBgColor', 'bg'))
          expect(expectedText, 'paper: --pele-fg is the editor text')
            .toBe(await resolveVar(page, '--editorColor', 'color'))
          const expectedFloatSurface = await resolveVar(page, '--floatBgColor', 'bg')
          expect(expectedSurface, 'paper: --pele-surface is the theme surface (light card)')
            .toBe(expectedFloatSurface)
          expect(flow.fill).toBe(expectedSurface)
          expect((oklabLightness(flow.fill) ?? 0) - (oklabLightness(expectedPanel) ?? 1)).toBeGreaterThanOrEqual(0.015)
        } else {
          expect(fillDistinctFromPanel(flow.fill, expectedPanel), `${theme} fill vs panel`).toBe(true)
          expect(flow.fill).not.toBe(expectedPanel)
        }
        expect(contrast(flow.stroke, expectedPanel)).toBeGreaterThanOrEqual(3)
        expect(flow.labelFill).toBe(expectedText)

        // pie / radar / xychart draw ≥ 3 distinct palette colours. The
        // neutrals are every resolved non-series --pele-* variable.
        for (const type of ['pie', 'xychart', 'radar']) {
          const colours = await page.evaluate(
            ({ idx, neutrals }: { idx: number; neutrals: string[] }) => {
              const neutral = new Set(neutrals)
              const seen = new Set<string>()
              const figure = document.querySelectorAll('figure.ag-container-block')[idx]
              for (const el of figure.querySelectorAll('svg *')) {
                const cs = window.getComputedStyle(el)
                for (const c of [cs.fill, cs.stroke]) {
                  if (c && c !== 'none' && !neutral.has(c)) seen.add(c)
                }
              }
              return [...seen]
            },
            {
              idx: INDEX_BY_TYPE[type],
              neutrals: [
                'rgb(0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(17, 17, 17)', 'rgba(0, 0, 0, 0)',
                await resolveVar(page, '--pele-bg', 'bg'),
                await resolveVar(page, '--pele-fg', 'color'),
                await resolveVar(page, '--pele-muted', 'color'),
                await resolveVar(page, '--pele-line', 'color'),
                await resolveVar(page, '--pele-surface', 'bg'),
                await resolveVar(page, '--pele-surface-alt', 'bg'),
                await resolveVar(page, '--pele-border', 'color')
              ]
            }
          )
          expect(
            colours.length,
            `${type} must use at least 3 distinct palette colours (got ${colours.join(', ')})`
          ).toBeGreaterThanOrEqual(3)
        }
      })

      test('gantt and packet labels render at readable sizes (≥ 11 px)', async ({ page }) => {
        await bootWithThemeAndDoc(page, theme, `# Pele matrix\n\n${buildAllDiagramsDoc()}\n`)
        await waitForAllDiagrams(page, DIAGRAM_TYPES.length)

        for (const type of ['gantt', 'packet']) {
          // C-55: pele puts font-size on <g> groups; the honest readability
          // metric is the COMPUTED font-size of each text (a tight glyph
          // rect measures ~0.75 em and under-reports digits-only labels).
          const sizes = await page.evaluate((idx: number) => {
            const figure = document.querySelectorAll('figure.ag-container-block')[idx]
            return [...figure.querySelectorAll('svg text')].map((t) =>
              Math.round(parseFloat(getComputedStyle(t).fontSize) * 10) / 10
            )
          }, INDEX_BY_TYPE[type])
          expect(sizes.length, `${type} has text labels`).toBeGreaterThan(0)
          expect(Math.max(...sizes), `${type} largest label ≥ 11 px`).toBeGreaterThanOrEqual(11)
          expect(
            sizes.filter((h) => h >= 11).length,
            `${type} keeps at least 3 labels ≥ 11 px`
          ).toBeGreaterThanOrEqual(3)
        }
      })
    })
  }

  // C-55 R-3: a theme switch recolors every diagram through the --pele-*
  // CSS variables with ZERO pele re-renders — the code-only SVG cache hits,
  // the markup stays byte-identical (DOM svg unchanged) and only the
  // cascade recolors the computed node fill.
  test('switching paper → ink recolors through the --pele-* variables without a pele re-render', async ({ page }) => {
    const markers = collectPeleMarkers(page)
    // Same pref-write mock the titlebar toggle spec installs.
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
    await bootWithThemeAndDoc(
      page,
      'paper',
      `# Theme switch\n\n\`\`\`mermaid\n${SAMPLE_BY_TYPE.flowchart}\n\`\`\`\n`
    )
    await waitForAllDiagrams(page, 1)

    // Settle the first pele render, then snapshot the markers and the svg.
    await expect
      .poll(() => markers.filter((m) => m.includes('[BLOCK_PELE_RENDER]')).length, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1)
    const rendersBefore = markers.filter((m) => m.includes('[BLOCK_PELE_RENDER]')).length
    const hitsBefore = markers.filter((m) => m.includes('[BLOCK_PELE_CACHE_HIT]')).length

    const before = await page.evaluate(() => {
      const svg = document.querySelector('figure.ag-container-block div.ag-container-preview > svg') as SVGSVGElement
      const shape = svg.querySelector('g.pele-node rect, g.pele-node polygon')
      return {
        rootClass: svg.getAttribute('class'),
        rootStyle: svg.getAttribute('style'),
        viewBox: svg.getAttribute('viewBox'),
        natural: svg.getAttribute('data-natural-width'),
        fill: shape ? window.getComputedStyle(shape).fill : 'none',
        surfaceVar: window.getComputedStyle(document.documentElement).getPropertyValue('--pele-surface').trim()
      }
    })
    expect(before.fill).not.toBe('none')

    await page.locator('.titlebar-nav-btn[title*="Theme"]').first().click()
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })

    // The recolor: the document root's --pele-surface changes and the
    // computed node fill follows through the cascade — no re-render needed.
    await expect
      .poll(() => page.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue('--pele-surface').trim()
      ), { timeout: 30_000 })
      .not.toBe(before.surfaceVar)
    await expect
      .poll(() => page.evaluate(() => {
        const shape = document.querySelector('figure.ag-container-block g.pele-node rect, figure.ag-container-block g.pele-node polygon')
        return shape ? window.getComputedStyle(shape).fill : 'none'
      }), { timeout: 30_000 })
      .not.toBe(before.fill)

    // Zero pele re-renders: the re-queue drains as a pure CACHE HIT.
    await expect
      .poll(() => markers.filter((m) => m.includes('[BLOCK_PELE_CACHE_HIT]')).length, { timeout: 30_000 })
      .toBeGreaterThan(hitsBefore)
    expect(
      markers.filter((m) => m.includes('[BLOCK_PELE_RENDER]')).length,
      'a theme switch must not re-render pele diagrams'
    ).toBe(rendersBefore)

    // DOM svg unchanged: the cache-hit insert is byte-identical markup —
    // same root class, same --pele-* var references, same geometry — and
    // exactly one svg remains in the preview.
    const after = await page.evaluate(() => {
      const preview = document.querySelector('figure.ag-container-block div.ag-container-preview')
      const svg = preview ? preview.querySelector(':scope > svg') as SVGSVGElement : null
      return {
        count: preview ? preview.querySelectorAll(':scope > svg').length : 0,
        rootClass: svg ? svg.getAttribute('class') : null,
        rootStyle: svg ? svg.getAttribute('style') : null,
        viewBox: svg ? svg.getAttribute('viewBox') : null,
        natural: svg ? svg.getAttribute('data-natural-width') : null
      }
    })
    expect(after.count).toBe(1)
    expect(after.rootClass).toBe(before.rootClass)
    expect(after.rootStyle).toBe(before.rootStyle)
    expect(after.viewBox).toBe(before.viewBox)
    expect(after.natural).toBe(before.natural)
  })

  // pele ignores the mermaid %%{init}%% directive (theming is exclusively
  // the --pele-* variables); the supported user override is a classDef with
  // inline colours, which pele applies as inline styles that beat the
  // theme variables while the unstyled nodes stay themed.
  test('a user classDef override still wins over the theme variables', async ({ page }) => {
    await bootWithThemeAndDoc(
      page,
      'paper',
      `# ClassDef override\n\n\`\`\`mermaid\nflowchart TD\n    classDef custom fill:#123456,stroke:#123456,color:#fff\n    A[Custom fill]:::custom --> B[Still themed]\n\`\`\`\n`
    )
    await waitForAllDiagrams(page, 1)

    const colours = await page.evaluate(() => {
      const figure = document.querySelector('figure.ag-container-block')
      const custom = figure && figure.querySelector('g.pele-node[data-id="A"] rect, g.pele-node[data-id="A"] polygon')
      const customLabel = figure && figure.querySelector('g.pele-node[data-id="A"] text.pele-label')
      const themed = figure && figure.querySelector('g.pele-node[data-id="B"] rect, g.pele-node[data-id="B"] polygon')
      return {
        fill: custom ? window.getComputedStyle(custom).fill : 'none',
        labelFill: customLabel ? window.getComputedStyle(customLabel).fill : 'none',
        themedFill: themed ? window.getComputedStyle(themed).fill : 'none'
      }
    })
    // The classDef fill and label ink win over the theme variables…
    expect(colours.fill).toBe('rgb(18, 52, 86)')
    expect(colours.labelFill).toBe('rgb(255, 255, 255)')
    // …while the rest of the diagram still resolves the theme variables.
    const expectedSurface = await resolveVar(page, '--pele-surface', 'bg')
    expect(colours.themedFill).toBe(expectedSurface)
  })
})

// C-51 T-012 (user 2026-10-16: "in the dark theme mermaid clearly has
// block contrast problems"): node shapes sit on the code-block PANEL — in Ink
// the old fill (--floatBgColor) was 1.03:1 and the border (--tableBorderColor)
// 1.2:1 against it. The three dark themes the user saw render a flowchart
// (with a subgraph/cluster), a sequence diagram (actors + notes) and a state
// diagram, and the COMPUTED node rect/polygon fill/stroke, label, edges and
// arrowheads are measured against the panel's computed background.
test.describe('node contrast (C-51 T-012)', () => {
  test.setTimeout(90_000)

  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  for (const theme of ['ink', 'docs-dark', 'macos-dark'] as const) {
    test.describe(`theme ${theme}`, () => {
      test('flowchart, sequence and state nodes separate from the panel', async ({ page }) => {
        await bootWithThemeAndDoc(page, theme, NODE_CONTRAST_DOC)
        await waitForAllDiagrams(page, 3)

        const kinds = ['flowchart', 'sequence', 'state'] as const
        for (let i = 0; i < kinds.length; i++) {
          const kind = kinds[i]
          const m = await measureFigureContrast(page, i)
          const where = `${theme}/${kind}`

          expect(m.panel, `${where}: panel colour resolved`).toBeTruthy()
          expect(m.fill, `${where}: node shape resolved`).toBeTruthy()
          expect(m.stroke, `${where}: node stroke resolved`).toBeTruthy()
          expect(m.label, `${where}: label colour resolved`).toBeTruthy()

          // Node fill distinguishable from the panel — the T-012 rule is
          // WCAG ≥ 1.25 OR OKLCH ΔL ≥ 0.06 (the derived dark lifts land at
          // 1.38–1.44:1, well clear of either gate).
          expect(fillDistinctFromPanel(m.fill, m.panel), `${where} fill vs panel`).toBe(true)
          // Node border ≥ 3:1 against the panel (WCAG 1.4.11 non-text).
          expect(contrast(m.stroke, m.panel), `${where} border vs panel`).toBeGreaterThanOrEqual(3)
          // Node text ≥ 4.5:1 against the node fill (WCAG AA).
          expect(contrast(m.label, m.fill), `${where} label vs fill`).toBeGreaterThanOrEqual(4.5)
          // Edges and arrowheads ≥ 3:1 against the panel.
          expect(m.edges.length, `${where}: edges resolved`).toBeGreaterThan(0)
          for (const stroke of m.edges) {
            expect(contrast(stroke, m.panel), `${where} edge vs panel`).toBeGreaterThanOrEqual(3)
          }
          expect(m.markers.length, `${where}: rendered arrowheads resolved`).toBeGreaterThan(0)
          for (const markerFill of m.markers) {
            expect(contrast(markerFill, m.panel), `${where} arrowhead vs panel`).toBeGreaterThanOrEqual(3)
          }
        }

        // The flowchart's subgraph: its fill differs from the panel AND from
        // the node fill (--pele-surface-alt is the midway derivation).
        const flow = await measureFigureContrast(page, 0)
        expect(flow.clusterFill, `${theme}: cluster shape resolved`).toBeTruthy()
        expect(flow.clusterFill!).not.toBe(flow.panel)
        expect(flow.clusterFill!).not.toBe(flow.fill)

        // Evidence screenshot per theme.
        await page.screenshot({
          path: test.info().outputPath(`t012-node-contrast-${theme}.png`),
          fullPage: true
        })
      })
    })
  }
})
