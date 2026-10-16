import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'
// The same palette/blend math the app runs at render time (muya is plain
// ESM and touches window/document only inside functions, so importing it
// on the node side is safe).
// Playwright cannot load muya's ESM sources — use the parity-pinned copy.
import { palette, blendHex } from './fixtures/chartPalette'

// C-51 T-005 (R-3): the non-Mermaid rendered content follows the app
// theme — Vega-Lite (config from the theme tokens, same categorical
// palette as Mermaid, user spec config winning), flowchart.js colours,
// js-sequence colours and KaTeX text colour — in paper and ink, plus the
// theme-switch re-render.

const BAR_CHART = JSON.stringify({
  title: 'Words per stage',
  data: {
    values: [
      { stage: 'Drafts', files: 46 },
      { stage: 'Edited', files: 28 },
      { stage: 'Published', files: 16 }
    ]
  },
  mark: { type: 'bar', tooltip: false },
  encoding: {
    x: { field: 'stage', type: 'nominal', axis: { title: 'Stage' } },
    y: { field: 'files', type: 'quantitative', axis: { title: 'Files' } }
  }
})

const LINE_CHART = JSON.stringify({
  data: {
    values: [
      { day: 'Mon', series: 'Words', v: 1200 },
      { day: 'Tue', series: 'Words', v: 1800 },
      { day: 'Wed', series: 'Words', v: 2400 },
      { day: 'Mon', series: 'Notes', v: 600 },
      { day: 'Tue', series: 'Notes', v: 900 },
      { day: 'Wed', series: 'Notes', v: 1200 }
    ]
  },
  mark: { type: 'line', tooltip: false },
  encoding: {
    x: { field: 'day', type: 'nominal' },
    y: { field: 'v', type: 'quantitative' },
    color: { field: 'series', type: 'nominal', legend: { title: 'Series' } }
  }
})

// The user's own spec config must win over the theme config (vega-embed
// merges spec.config over the passed config).
const USER_CONFIG_CHART = JSON.stringify({
  data: { values: [{ k: 'one', n: 3 }, { k: 'two', n: 5 }] },
  mark: { type: 'bar', tooltip: false },
  encoding: {
    x: { field: 'k', type: 'nominal' },
    y: { field: 'n', type: 'quantitative' }
  },
  config: { mark: { color: '#18dec8' } }
})

const FLOWCHART_CODE = `st=>start: Write draft
op=>operation: Agent edits
cond=>condition: Changed?
e=>end: Hand back
st->op->cond
cond(yes)->e
cond(no)->op`

const SEQUENCE_CODE = `Title: Hand a draft over
You->Mark: open notes.md
Mark->>Agent: watch files
Agent-->>Mark: write draft
Note right of Mark: themed note`

const DOC = `# Charts and diagrams

\`\`\`vega-lite
${BAR_CHART}
\`\`\`

\`\`\`vega-lite
${LINE_CHART}
\`\`\`

\`\`\`vega-lite
${USER_CONFIG_CHART}
\`\`\`

\`\`\`flowchart
${FLOWCHART_CODE}
\`\`\`

\`\`\`sequence
${SEQUENCE_CODE}
\`\`\`

Inline math $E = mc^2$ and a block:

$$
\\int_0^1 x^2\\,dx = \\tfrac13
$$
`

const FIG = (role: string) => `figure[data-role="${role}"]`

async function bootWithThemeAndDoc(page: Page, theme: 'paper' | 'ink') {
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
  await openFileTab(page, '/tmp/mark-e2e/content-theme.md', DOC)
}

/** Resolve a CSS variable the way the browser resolves it for an element. */
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

/**
 * Serialize a colour the way THIS browser serializes computed values, so
 * expected colours computed on the node side compare exactly against
 * getComputedStyle reads (fill/stroke/color) in both engines.
 */
async function browserColor(page: Page, colour: string): Promise<string> {
  return page.evaluate((c: string) => {
    const el = document.createElement('div')
    el.style.cssText = `color: ${c}; position: absolute; visibility: hidden;`
    document.body.appendChild(el)
    const value = window.getComputedStyle(el).color
    el.remove()
    return value
  }, colour)
}

/** The theme tokens the app's renderers read, resolved the same way. */
async function readTokens(page: Page) {
  const dark = await page.evaluate(() => document.body.classList.contains('dark'))
  const text = await resolveVar(page, '--editorColor', 'color')
  const bg = await resolveVar(page, '--editorBgColor', 'bg')
  const surface = await resolveVar(page, '--floatBgColor', 'bg')
  // The accent as the app reads it: the root's inline mirror first.
  const accent = await page.evaluate(() => {
    const inline = document.documentElement.style.getPropertyValue('--themeColor')
    const v = inline || window.getComputedStyle(document.documentElement).getPropertyValue('--themeColor')
    return v.trim()
  })
  return {
    dark,
    text,
    bg,
    surface,
    accent,
    // The same derived tokens readActiveThemeTokens computes.
    muted: blendHex(text, bg, 0.65),
    line: blendHex(text, bg, 0.5),
    series: palette(accent, dark ? 0.74 : 0.6, dark ? 0.11 : 0.12)
  }
}

async function waitForDiagrams(page: Page) {
  await expect(page.locator(`${FIG('VEGA-LITE')} div.ag-container-preview svg`)).toHaveCount(3, { timeout: 60_000 })
  await expect(page.locator(`${FIG('FLOWCHART')} div.ag-container-preview svg`)).toHaveCount(1, { timeout: 60_000 })
  await expect(page.locator(`${FIG('SEQUENCE')} div.ag-container-preview svg.sequence`)).toHaveCount(1, { timeout: 60_000 })
  // KaTeX loads lazily — both math shapes must be rendered before the
  // colour assertions.
  await expect(page.locator('.editor-with-tabs span.ag-math .ag-math-render .katex')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.locator(`${FIG('MULTIPLEMATH')} .ag-container-preview .katex`)).toHaveCount(1, { timeout: 60_000 })
  await expect(page.locator('.editor-with-tabs .ag-math-error')).toHaveCount(0)
}

test.describe('rendered content follows the app theme (C-51 T-005)', () => {
  // Three sequential vega embeds + KaTeX per theme + screenshots.
  test.setTimeout(120_000)

  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  for (const theme of ['paper', 'ink'] as const) {
    test.describe(`theme ${theme}`, () => {
      test('vega, flowchart, sequence and math use the theme colours', async ({ page }, testInfo) => {
        await bootWithThemeAndDoc(page, theme)
        await waitForDiagrams(page)

        const tokens = await readTokens(page)
        const figures = page.locator('figure.ag-container-block')

        // ── Vega-Lite: labels = muted/title = text, marks = the palette ────
        // vega tags groups (mark-text role-axis-label), not the text nodes,
        // so the scan below classifies by tag: every <text> fill must be
        // the muted label colour or the text colour (the chart title);
        // mark shapes carry the palette.
        const vega = await page.evaluate(() => {
          const collect = (figure: Element) => {
            const textFills: string[] = []
            const fills: string[] = []
            const strokes: string[] = []
            for (const el of figure.querySelectorAll('svg *')) {
              const cs = window.getComputedStyle(el)
              if (el.tagName.toLowerCase() === 'text') {
                if (cs.fill && cs.fill !== 'none') textFills.push(cs.fill)
              } else {
                if (cs.fill && cs.fill !== 'none') fills.push(cs.fill)
                if (cs.stroke && cs.stroke !== 'none') strokes.push(cs.stroke)
              }
            }
            return { textFills, fills, strokes }
          }
          const all = document.querySelectorAll('figure[data-role="VEGA-LITE"]')
          return [collect(all[0]), collect(all[1]), collect(all[2])]
        })

        const mutedColour = await browserColor(page, tokens.muted)
        const textColour = await browserColor(page, tokens.text)
        const borderColour = await resolveVar(page, '--tableBorderColor', 'bg')
        const series0 = await browserColor(page, tokens.series[0])
        const series1 = await browserColor(page, tokens.series[1])

        // Bar chart (figure 0): labels muted, title in the text colour,
        // bars in palette hue 0, axis domain/grid in the border colour.
        expect(vega[0].fills, `bar fills use palette[0] (${series0})`).toContain(series0)
        expect(vega[0].textFills.length, 'axis labels exist').toBeGreaterThan(0)
        for (const fill of vega[0].textFills) {
          expect([mutedColour, textColour], `text fill ${fill} is a theme colour`).toContain(fill)
        }
        expect(vega[0].textFills).toContain(mutedColour)
        expect(vega[0].textFills).toContain(textColour)
        expect(vega[0].strokes, 'axis domain/grid strokes use the border colour').toContain(borderColour)
        // No vega default palette anywhere (#4c78a8 is Tableau10 hue 0) and
        // no black labels (the vega default label colour is near-black).
        const vegaDefault = await browserColor(page, '#4c78a8')
        const black = await browserColor(page, '#000000')
        for (const chart of vega) {
          expect(chart.fills, 'no vega default #4c78a8').not.toContain(vegaDefault)
        }
        for (const fill of vega[0].textFills) expect(fill).not.toBe(black)

        // Line chart (figure 1): the categorical range colours both series.
        expect(vega[1].strokes, `line series use palette[0] (${series0})`).toContain(series0)
        expect(vega[1].strokes, `line series use palette[1] (${series1})`).toContain(series1)
        for (const fill of vega[1].textFills) {
          expect([mutedColour, textColour]).toContain(fill)
        }

        // User config chart (figure 2): the spec's own config wins.
        const userColour = await browserColor(page, '#18dec8')
        expect(vega[2].fills).toContain(userColour)
        expect(vega[2].fills).not.toContain(series0)

        // ── flowchart.js: connectors, plates and labels from the tokens ────
        const flow = await page.evaluate(() => {
          const figure = document.querySelector('figure[data-role="FLOWCHART"]')
          const strokes: string[] = []
          const fills: string[] = []
          const textFills: string[] = []
          for (const el of figure.querySelectorAll('svg *')) {
            const cs = window.getComputedStyle(el)
            if (cs.stroke && cs.stroke !== 'none') strokes.push(cs.stroke)
            if (el.tagName.toLowerCase() === 'text') {
              if (cs.fill && cs.fill !== 'none') textFills.push(cs.fill)
            } else if (cs.fill && cs.fill !== 'none') {
              fills.push(cs.fill)
            }
          }
          return { strokes, fills, textFills }
        })
        const lineColour = await browserColor(page, tokens.line)
        const surfaceColour = await browserColor(page, tokens.surface)
        expect(flow.strokes, `flowchart connectors use the line colour (${lineColour})`).toContain(lineColour)
        expect(flow.fills, `flowchart shapes use the theme surface (${surfaceColour})`).toContain(surfaceColour)
        for (const fill of flow.textFills) expect(fill).toBe(textColour)

        // ── js-sequence: readable text, themed boxes and connectors ────────
        const seq = await page.evaluate(() => {
          const figure = document.querySelector('figure[data-role="SEQUENCE"]')
          const svg = figure.querySelector('svg.sequence')
          const strokes: string[] = []
          const rectFills: string[] = []
          const textFills: string[] = []
          for (const el of svg.querySelectorAll('text')) {
            textFills.push(window.getComputedStyle(el).fill)
          }
          // Connectors: <line> in the simple theme, unfilled <path> in the
          // default «hand» theme.
          for (const el of svg.querySelectorAll('line, path')) {
            const cs = window.getComputedStyle(el)
            if (el.tagName.toLowerCase() === 'line' || cs.fill === 'none') strokes.push(cs.stroke)
          }
          // Boxes: <rect> in the simple theme, filled <path> in «hand».
          for (const el of svg.querySelectorAll('rect, path')) {
            const fill = window.getComputedStyle(el).fill
            if (el.tagName.toLowerCase() === 'rect' || (fill && fill !== 'none')) rectFills.push(fill)
          }
          return { strokes, rectFills, textFills }
        })
        expect(seq.textFills.length).toBeGreaterThan(0)
        for (const fill of seq.textFills) {
          expect(fill, 'sequence text is the theme text colour (readable on dark)').toBe(textColour)
        }
        expect(seq.strokes, 'sequence connectors use the line colour').toContain(lineColour)
        expect(seq.rectFills, 'sequence boxes use the theme surface').toContain(surfaceColour)
        // The note box gets Mermaid's accent tint pair.
        const noteTint = palette(tokens.accent, tokens.dark ? 0.36 : 0.9, 0.05)[0]
        expect(seq.rectFills).toContain(await browserColor(page, noteTint))

        // ── KaTeX: inline and display math inherit the theme text colour ──
        const inlineMath = await page.evaluate(() => {
          const el = document.querySelector('.editor-with-tabs span.ag-math .ag-math-render .katex')
          return el ? window.getComputedStyle(el).color : 'none'
        })
        const displayMath = await page.evaluate(() => {
          const el = document.querySelector('figure[data-role="MULTIPLEMATH"] .ag-container-preview .katex')
          return el ? window.getComputedStyle(el).color : 'none'
        })
        expect(inlineMath).toBe(textColour)
        expect(displayMath).toBe(textColour)

        // ── evidence screenshots ────────────────────────────────────────────
        await figures.nth(0).screenshot({ path: testInfo.outputPath(`content-theme-${theme}-vega-bar.png`) })
        await figures.nth(1).screenshot({ path: testInfo.outputPath(`content-theme-${theme}-vega-line.png`) })
        await figures.nth(3).screenshot({ path: testInfo.outputPath(`content-theme-${theme}-flowchart.png`) })
        await figures.nth(4).screenshot({ path: testInfo.outputPath(`content-theme-${theme}-sequence.png`) })
        await page.screenshot({ path: testInfo.outputPath(`content-theme-${theme}-page.png`), fullPage: true })
      })
    })
  }

  test('switching paper → ink re-renders vega with the new theme colours', async ({ page }) => {
    // Same pref-write mock the titlebar toggle spec installs.
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
    await bootWithThemeAndDoc(page, 'paper')
    await waitForDiagrams(page)

    const barFillBefore = await page.evaluate(() => {
      const figure = document.querySelector('figure[data-role="VEGA-LITE"]')
      // The bar marks themselves — not the transparent background rect.
      const bars = figure.querySelectorAll('svg .mark-rect path, svg .mark-rect rect')
      for (const bar of bars) {
        const fill = window.getComputedStyle(bar).fill
        if (fill && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)') return fill
      }
      return 'none'
    })
    const labelFillsBefore = await page.evaluate(() => {
      const figure = document.querySelector('figure[data-role="VEGA-LITE"]')
      const seen = new Set<string>()
      for (const text of figure.querySelectorAll('svg text')) {
        const fill = window.getComputedStyle(text).fill
        if (fill && fill !== 'none') seen.add(fill)
      }
      return [...seen].sort().join('|')
    })
    expect(barFillBefore).not.toBe('none')

    await page.locator('.titlebar-nav-btn[title*="Theme"]').first().click()
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })

    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            const figure = document.querySelector('figure[data-role="VEGA-LITE"]')
            // The bar marks themselves — not the transparent background rect.
            const bars = figure.querySelectorAll('svg .mark-rect path, svg .mark-rect rect')
            for (const bar of bars) {
              const fill = window.getComputedStyle(bar).fill
              if (fill && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)') return fill
            }
            return 'none'
          })
        },
        { timeout: 60_000 }
      )
      .not.toBe(barFillBefore)
    // The axis labels re-render muted for the dark theme too.
    const darkTokens = await readTokens(page)
    const darkMuted = await browserColor(page, darkTokens.muted)
    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            const figure = document.querySelector('figure[data-role="VEGA-LITE"]')
            const seen = new Set<string>()
            for (const text of figure.querySelectorAll('svg text')) {
              const fill = window.getComputedStyle(text).fill
              if (fill && fill !== 'none') seen.add(fill)
            }
            return [...seen].sort().join('|')
          })
        },
        { timeout: 30_000 }
      )
      .not.toBe(labelFillsBefore)
    const labelFillsAfter = await page.evaluate(() => {
      const figure = document.querySelector('figure[data-role="VEGA-LITE"]')
      const seen = new Set<string>()
      for (const text of figure.querySelectorAll('svg text')) {
        const fill = window.getComputedStyle(text).fill
        if (fill && fill !== 'none') seen.add(fill)
      }
      return [...seen].sort().join('|')
    })
    expect(labelFillsAfter).toContain(darkMuted)
  })
})
