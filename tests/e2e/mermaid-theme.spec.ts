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

async function bootWithThemeAndDoc(page: Page, theme: 'paper' | 'ink', markdown: string) {
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

      test('flowchart uses the theme surface and text colour; series diagrams use the palette', async ({ page }) => {
        await bootWithThemeAndDoc(page, theme, `# Mermaid matrix\n\n${buildAllDiagramsDoc()}\n`)
        await waitForAllDiagrams(page, DIAGRAM_TYPES.length)

        const expectedSurface = await resolveVar(page, '--floatBgColor', 'bg')
        const expectedText = await resolveVar(page, '--editorColor', 'color')

        const flow = await page.evaluate(() => {
          const figure = document.querySelectorAll('figure.ag-container-block')[0]
          const shape = figure.querySelector('.node rect, .node polygon, .node path')
          const label = figure.querySelector('.nodeLabel, .node span.nodeLabel')
          return {
            fill: shape ? window.getComputedStyle(shape).fill : 'none',
            labelFill: label ? window.getComputedStyle(label).fill : 'none',
            labelColor: label ? window.getComputedStyle(label).color : 'none'
          }
        })
        expect(flow.fill).toBe(expectedSurface)
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
