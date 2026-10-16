// FILE: tests/e2e/mermaid-theme.spec.ts
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: E2E gate for C-51 T-003/T-004/T-012 — Mermaid follows the active app theme: the 22-diagram-type × light/dark render matrix (no errors, no default purple/Trebuchet, readable gantt/packet labels, palette-coloured series diagrams, %%{init}%% user overrides win, paper → ink re-render) and the T-012 node-contrast gate that measures the COMPUTED node colours of a flowchart (with subgraph), a sequence diagram and a state diagram in ink, docs-dark and macos-dark against the diagram panel.
//   SCOPE: booting the editor with a mocked theme preference and a generated document; resolving theme CSS variables the way the browser does; computing WCAG contrast and Oklab ΔL in the spec (the twin of mermaidTheme.wcagContrast); measuring computed node rect fill/stroke, the VISIBLE label ink (the sequence actor's foreignObject div color, or the SVG tspan fill for SVG-only labels — `text.actor > tspan` carries actorTextColor while the <text> itself carries the box fill), cluster fill, edge strokes and only the RENDERED arrowheads (marker defs referenced by marker-end/marker-start; unused defs are unpainted black); per-theme evidence screenshots.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim (installTauriShim), ./fixtures/helpers (bootEditor, openFileTab).
//   LINKS: .grace/changes/active/C-51 T-003/T-004/T-012; .grace/verification/runtime.xml V-M-012 (mermaid theme scenarios); the unit twins tests/renderer/muya/mermaid-theme.test.js and mermaid-node-contrast.test.js; src/muya/lib/parser/render/mermaidTheme.js (buildMermaidThemeConfig).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DIAGRAM_SAMPLES - one sample per diagram type (flowchart … c4) for the 22-type matrix.
//   DIAGRAM_TYPES - the type keys in sample order (matrix length).
//   SAMPLE_BY_TYPE - type key → sample code (used by the theme-switch case).
//   buildAllDiagramsDoc - wrap every sample into a mermaid fence document.
//   FIGURE - selector of a container-block figure.
//   PREVIEW_SVG - selector of the root diagram SVG (nested <svg> excluded).
//   INDEX_BY_TYPE - type key → figure index in the matrix document.
//   bootWithThemeAndDoc - install the theme pref mock, boot the editor, open the doc tab.
//   resolveVar - resolve a CSS variable through a hidden probe element the way the browser does.
//   waitForAllDiagrams - wait for N rendered diagram SVGs and no mermaid error.
//   parseRgb - computed colour string → [r, g, b] (null when unparsable).
//   contrast - two computed colours → WCAG 2.x contrast ratio.
//   oklabLightness - computed colour → Oklab lightness (ΔL half of the fill rule).
//   fillDistinctFromPanel - the T-012 fill rule: WCAG ≥ 1.25 OR OKLCH ΔL ≥ 0.06.
//   NodeContrastMeasurement - shape of one figure's measured colours.
//   measureFigureContrast - computed panel/shape fill/stroke/visible-label-ink/cluster/edges/rendered-arrowhead colours of the i-th figure.
//   NODE_CONTRAST_DOC - flowchart + subgraph, sequence and state document for the T-012 gate.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.1.0 - 2026-10-16 C-51 T-012 (orchestrator gate fix):
//   measureFigureContrast reads the label INK the engine actually paints.
//   Sequence actor labels render through foreignObject (textPlacement
//   default "fo"): the VISIBLE ink is div.actor-box's computed color, while
//   the `<text class="actor">` beside it is only a hidden <switch> fallback
//   whose own fill is the `.actor` BOX colour — the old read of that
//   <text> compared the box against itself («label vs fill received 1»);
//   the div wins in document order, SVG-only labels fall back to the first
//   <tspan> (`text.actor > tspan` carries actorTextColor; the <text> never
//   does). And the arrowhead gate now measures only the marker defs
//   REFERENCED by a marker-end/marker-start (Mermaid ships unused defs —
//   sequence -filled-head/-solidTop/BottomArrowHead — that no stylesheet
//   paints, default black), asserting at least one rendered arrowhead per
//   figure. No product code changed: the unit twin pins
//   actorTextColor/noteTextColor = the derived node text.
//   v2.0.0 - 2026-10-16 C-51 T-012: the flowchart-node pin now
//   asserts the node fill/border DERIVED against the code-block panel
//   (fill ≥ 1.25:1, border ≥ 3:1, label = theme text) instead of the raw
//   --floatBgColor surface, and the new "node contrast (C-51 T-012)"
//   describe renders a flowchart (with a subgraph), a sequence diagram and
//   a state diagram in ink, docs-dark and macos-dark, measuring the
//   computed node rect/polygon fill/stroke, label, edges and arrowheads
//   against the panel's computed background (screenshots per theme via
//   test.info().outputPath). Runs in chromium and webkit-mermaid-theme.
//   v1.0.0 - 2026-10-16 C-51 T-003/T-004: the 22-type × light/dark matrix.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// C-51 T-003/T-004: Mermaid follows the app theme — the 22-type × light/dark
// matrix from the accepted lab. One sample per diagram type (taken from the
// round-2/3 lab samples; the gantt task «Title bar» is renamed «App title
// bar» because Mermaid's gantt lexer eats ANY line starting with the
// case-insensitive `title` keyword as the diagram title — the suggested
// «Title strip» would collide the same way; radar and xychart carry one
// extra series so the "≥ 3 distinct palette colours" assertion sees three
// series colours).

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
  await openFileTab(page, '/tmp/mark-e2e/mermaid-matrix.md', markdown)
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

async function waitForAllDiagrams(page: Page, count: number) {
  await expect(page.locator(PREVIEW_SVG)).toHaveCount(count, { timeout: 60_000 })
  await expect(page.locator(`${FIGURE} .ag-mermaid-error`)).toHaveCount(0)
}

// START_BLOCK_T012_HELPERS
// C-51 T-012: compute WCAG contrast ratios between COMPUTED colours in the
// spec — the twin of mermaidTheme.wcagContrast, applied to what the engine
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

/** Computed node colours of the i-th diagram figure, measured in the page. */
async function measureFigureContrast(page: Page, figureIndex: number): Promise<NodeContrastMeasurement> {
  return page.evaluate((idx: number) => {
    const figure = document.querySelectorAll('figure.ag-container-block')[idx]
    const svg = figure && figure.querySelector('div.ag-container-preview > svg')
    if (!svg) {
      return { panel: null, fill: null, stroke: null, label: null, clusterFill: null, edges: [], markers: [] }
    }
    const computed = (el: Element | null, prop: 'fill' | 'stroke' | 'color' | 'backgroundColor') =>
      el ? window.getComputedStyle(el)[prop] : null
    const parseable = (v: string | null) => (v && /rgba?\(/.test(v) ? v : null)
    // flowchart nodes, sequence actor boxes, state boxes — Mermaid derives
    // all of them from primaryColor/primaryBorderColor (mainBkg/nodeBorder).
    const shape = svg.querySelector(
      'g.node rect, g.node polygon, rect.actor, g.statediagram-state rect'
    )
    // Node label colour — the element that actually paints the ink. HTML
    // labels inside <foreignObject> paint through `color` (a span/div's
    // computed `fill` is not its ink); SVG <text> paints through `fill`, and
    // Mermaid puts some SVG glyph ink on the TSPAN, not the <text>: the
    // sequence stylesheet fills `text.actor > tspan` (actorTextColor) while
    // the `<text class="actor">` itself carries the `.actor` BOX fill.
    // Sequence actors (textPlacement "fo") render the foreignObject div and
    // keep that <text> only as a hidden <switch> fallback — the div comes
    // first in document order, so the selector measures the VISIBLE ink and
    // only falls back to the tspan for SVG-only labels (reading the <text>
    // itself once compared the box against itself: the exact 1:1 this gate
    // failed on).
    const labelEl = svg.querySelector(
      'div.actor.actor-box, .nodeLabel, text.actor, g.statediagram-state text'
    )
    let label: string | null = null
    if (labelEl) {
      const tag = labelEl.tagName.toLowerCase()
      if (tag === 'text' || tag === 'tspan') {
        const inkEl = labelEl.querySelector('tspan') ?? labelEl
        label = parseable(computed(inkEl, 'fill'))
      } else {
        label = parseable(computed(labelEl, 'color'))
      }
    }
    const cluster = svg.querySelector('g.cluster rect, .cluster rect, g.cluster polygon')
    // Arrowheads the diagram actually renders: the <marker> defs referenced
    // by a marker-end/marker-start attribute. Mermaid also ships unused defs
    // (sequence -filled-head / -solidTopArrowHead / -solidBottomArrowHead)
    // that no stylesheet paints — default black, invisible inside <defs> —
    // which must not enter the gate.
    const usedMarkers = new Set<Element>()
    for (const el of svg.querySelectorAll('[marker-end],[marker-start]')) {
      for (const ref of [el.getAttribute('marker-end'), el.getAttribute('marker-start')]) {
        const id = ref && /#([^)'"]+)/.exec(ref)
        const marker = id ? document.getElementById(id[1]) : null
        if (marker) usedMarkers.add(marker)
      }
    }
    return {
      panel: parseable(computed(svg, 'backgroundColor')),
      fill: parseable(computed(shape, 'fill')),
      stroke: parseable(computed(shape, 'stroke')),
      label,
      clusterFill: parseable(computed(cluster, 'fill')),
      edges: [...svg.querySelectorAll('path.flowchart-link, .messageLine0, .messageLine1, path.transition, line.transition')]
        .map((el) => window.getComputedStyle(el).stroke)
        .filter((v) => v && v !== 'none' && /rgba?\(/.test(v)),
      markers: [...usedMarkers]
        .flatMap((marker) => [...marker.querySelectorAll('path, circle')])
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

test.describe('mermaid follows the app theme (C-51 T-003/T-004)', () => {
  // 22 sequential mermaid renders per theme + screenshots need headroom.
  test.setTimeout(120_000)

  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  for (const theme of ['paper', 'ink'] as const) {
    test.describe(`theme ${theme}`, () => {
      test.setTimeout(150_000)

      test('all 22 diagram types render themed without errors or default colours', async ({ page }) => {
        await bootWithThemeAndDoc(page, theme, `# Mermaid matrix\n\n${buildAllDiagramsDoc()}\n`)
        await waitForAllDiagrams(page, DIAGRAM_TYPES.length)

        // No Mermaid default purple (#ECECFF / #9370DB) in any computed
        // fill/stroke, and no Trebuchet anywhere (the mermaid default font).
        const scan = await page.evaluate(() => {
          const bad = new Set(['rgb(236, 236, 255)', 'rgb(147, 112, 219)'])
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
        expect(scan.trebuchet, 'no Trebuchet font in any mermaid element').toBe(0)

        // Per-type screenshots for the evidence pack.
        const figures = page.locator(FIGURE)
        for (let i = 0; i < DIAGRAM_TYPES.length; i++) {
          await figures
            .nth(i)
            .screenshot({ path: `test-results/mermaid-themes/${theme}-${DIAGRAM_TYPES[i]}.png` })
        }
      })

      test('flowchart nodes are derived from the theme with panel contrast; series diagrams use the palette', async ({ page }) => {
        await bootWithThemeAndDoc(page, theme, `# Mermaid matrix\n\n${buildAllDiagramsDoc()}\n`)
        await waitForAllDiagrams(page, DIAGRAM_TYPES.length)

        const expectedSurface = await resolveVar(page, '--floatBgColor', 'bg')
        const expectedText = await resolveVar(page, '--editorColor', 'color')
        const expectedPanel = await resolveVar(page, '--codeBlockBgColor', 'bg')

        const flow = await page.evaluate(() => {
          const figure = document.querySelectorAll('figure.ag-container-block')[0]
          const shape = figure.querySelector('.node rect, .node polygon, .node path')
          const label = figure.querySelector('.nodeLabel, .node span.nodeLabel')
          return {
            fill: shape ? window.getComputedStyle(shape).fill : 'none',
            stroke: shape ? window.getComputedStyle(shape).stroke : 'none',
            labelFill: label ? window.getComputedStyle(label).fill : 'none',
            labelColor: label ? window.getComputedStyle(label).color : 'none'
          }
        })
        // C-51 T-012: node shapes sit on the code-block panel — the fill is
        // derived to separate from THAT panel (the raw surface never did:
        // 1.15:1 in paper, ~1:1 in the dark themes where floatBg == codeBg)
        // and the border reaches WCAG 1.4.11 there.
        expect(flow.fill).not.toBe(expectedSurface)
        expect(flow.fill).not.toBe(expectedPanel)
        expect(fillDistinctFromPanel(flow.fill, expectedPanel), `${theme} fill vs panel`).toBe(true)
        expect(contrast(flow.stroke, expectedPanel)).toBeGreaterThanOrEqual(3)
        expect([flow.labelFill, flow.labelColor]).toContain(expectedText)

        // pie / radar / xychart draw ≥ 3 distinct palette colours.
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
                await resolveVar(page, '--editorBgColor', 'bg'),
                await resolveVar(page, '--floatBgColor', 'bg'),
                await resolveVar(page, '--editorColor', 'color'),
                await resolveVar(page, '--tableBorderColor', 'bg'),
                await resolveVar(page, '--codeBlockBgColor', 'bg')
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
        await bootWithThemeAndDoc(page, theme, `# Mermaid matrix\n\n${buildAllDiagramsDoc()}\n`)
        await waitForAllDiagrams(page, DIAGRAM_TYPES.length)

        for (const type of ['gantt', 'packet']) {
          const heights = await page.evaluate((idx: number) => {
            const figure = document.querySelectorAll('figure.ag-container-block')[idx]
            return [...figure.querySelectorAll('svg text')].map((t) =>
              Math.round(t.getBoundingClientRect().height * 10) / 10
            )
          }, INDEX_BY_TYPE[type])
          expect(heights.length, `${type} has text labels`).toBeGreaterThan(0)
          expect(Math.max(...heights), `${type} largest label ≥ 11 px`).toBeGreaterThanOrEqual(11)
          expect(
            heights.filter((h) => h >= 11).length,
            `${type} keeps at least 3 labels ≥ 11 px`
          ).toBeGreaterThanOrEqual(3)
        }
      })
    })
  }

  test('switching paper → ink re-renders the diagrams with the new theme', async ({ page }) => {
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

    const fillBefore = await page.evaluate(() => {
      const shape = document.querySelector('figure.ag-container-block .node rect, figure.ag-container-block .node polygon, figure.ag-container-block .node path')
      return shape ? window.getComputedStyle(shape).fill : 'none'
    })
    expect(fillBefore).not.toBe('none')

    await page.locator('.titlebar-nav-btn[title*="Theme"]').first().click()
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })

    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            const shape = document.querySelector('figure.ag-container-block .node rect, figure.ag-container-block .node polygon, figure.ag-container-block .node path')
            return shape ? window.getComputedStyle(shape).fill : 'none'
          })
        },
        { timeout: 30_000 }
      )
      .not.toBe(fillBefore)
  })

  test('a user %%{init}%% directive still wins over the theme config', async ({ page }) => {
    await bootWithThemeAndDoc(
      page,
      'paper',
      // Mermaid 11.14 applies directive themeVariables only together with an
      // explicit theme (a bare themeVariables directive is ignored even on a
      // plain base theme) — the supported user override form is pinned here.
      `# Init override\n\n\`\`\`mermaid\n%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#123456"}}}%%\nflowchart TD\n    A[Custom fill] --> B[Also custom]\n\`\`\`\n`
    )
    await waitForAllDiagrams(page, 1)

    const colours = await page.evaluate(() => {
      const figure = document.querySelector('figure.ag-container-block')
      const shape = figure.querySelector('.node rect, .node polygon, .node path')
      const label = figure.querySelector('.nodeLabel, .node span.nodeLabel')
      return {
        fill: window.getComputedStyle(shape).fill,
        labelColor: label ? window.getComputedStyle(label).color : 'none'
      }
    })
    // The directive fill wins…
    expect(colours.fill).toBe('rgb(18, 52, 86)')
    // …while the rest of the theme config still applies (merged, not replaced).
    const expectedText = await resolveVar(page, '--editorColor', 'color')
    expect(colours.labelColor).toBe(expectedText)
  })
})

// C-51 T-012 (user 2026-10-16: «в темной теме у мермейд явно проблемы с
// контрастностью блоков»): node shapes sit on the code-block PANEL — in Ink
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
        // the node fill (clusterBkg is the midway derivation).
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
