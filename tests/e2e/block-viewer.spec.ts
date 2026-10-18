// FILE: tests/e2e/block-viewer.spec.ts
// VERSION: 3.3.0
// START_MODULE_CONTRACT
//   PURPOSE: End-to-end pin of the shared fullscreen block viewer (C-34 R2.2 + C-39 T2), the C-51 T-006/T-010 expand affordances (since C-56 T-005: the corner pill on mermaid/vega-lite figures, the standalone glyph on flowchart/sequence/plantuml and tables) and the T-014 polish — overlay open, zoom keys, read-only table clone with sticky header, Cmd+click, Esc close with focus restore; the T-010 need rules (hidden expand actions on small blocks — no Tab stop; wide/tall blocks get them), the C-56 T-005 pill look (variant C: opacity 0 → 1 on figure hover / :focus-within, never the caret; themed surface pill, label reveal, muted → fg hover), the table placement clear of header text and the last-column resize handle, viewport-resize re-evaluation, and light/dark colours; the T-014 cases — fit scales a small diagram UP on open and on Fit with 1:1 restoring natural size, an open viewer follows a paper→ink theme switch (clone re-rendered from the live block, zoom kept), and an edited diagram/math preview sits in flow below the source so the next heading is pushed down, never covered.
//   SCOPE: block-viewer.spec.ts only; diagram and table flows against the built renderer.
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim (same bootstrap as pele-render.spec.ts).
//   LINKS: .grace/changes/active/C-34 T-002; .grace/changes/active/C-39 T2 and T-002; .grace/changes/active/C-51 T-006, T-010 (D-7) and T-014; .grace/changes/active/C-55 (pele engine: ag-pele-preview hook class, g.pele-node shapes, no <style> blocks); .grace/changes/active/C-56 T-005 (corner pill); .grace/verification/runtime.xml V-M-012 scenario-19, scenario-60 and scenario-64; V-M-011 scenario-64.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SMALL_DIAGRAM_MD - one small mermaid flowchart (no expand button; Cmd/Ctrl+click path).
//   WIDE_DIAGRAM_MD - a 14-node graph LR, always scaled to the column (expand button).
//   MEDIUM_DIAGRAM_MD - a 3-node graph LR: unscaled at the default viewport, scaled after narrowing (resize flip).
//   TINY_DIAGRAM_MD - a 2-node graph TD whose natural size is far below the viewer stage (T-014 fit-up case).
//   EDIT_FLOW_MD - a mermaid diagram and a math block, each followed by a heading (T-014 in-flow edit preview).
//   WIDE_TABLE_MD - a 12-column table that overflows the column (expand button; resize-handle drag).
//   MIXED_MD - every viewable block type: small ones keep their expand actions hidden (the mermaid/vega figures still carry the C-56 T-005 pill with Edit/Copy), the wide mermaid/flowchart and the wide/tall tables get the expand affordance, plus fence/paragraph negatives.
//   bootstrapWithMarkdown - tauri-shim + preferences + mt::bootstrap-editor document load (mirrors pele-render.spec.ts); extraPrefs override individual preference defaults.
//   canvasScale - parses the panzoom `scale(s) translate(x,y)` transform of the viewer canvas.
//   nodeFillIn - computed fill of the first pele node shape (g.pele-node rect/polygon) inside a root element (live figure or viewer clone).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v3.3.0 - 2026-10-18 C-56 T-005: every
//   mermaid-figure selector moved from the removed standalone glyph to
//   the corner pill's expand button (figure > div.ag-block-toolbar >
//   button.ag-block-toolbar-expand, label 'Open full screen'); the MIXED
//   coverage counts 15 family buttons (3 per pill figure + 6 standalone)
//   with per-action labels; the small-mermaid case pins the pill's hidden
//   expand while Edit/Copy stay Tab stops; the look test became the
//   variant-C pill look (figure-hover/focus-within reveal, caret-only
//   invisibility, label reveal, theme follow); the Tab walk covers the
//   pill Edit/Copy stops. Table and flowchart paths unchanged.
//   v3.2.0 - 2026-10-17 C-55: the diagram engine is pele —
//   preview hook class renamed (ag-mermaid-preview → ag-pele-preview), the
//   node-fill probe reads pele shapes (g.pele-node rect/polygon resolving
//   --pele-surface), and the clone check flipped from "the hoisted mermaid
//   <style> travelled with the clone" to its pele equivalent (the clone
//   carries an svg.pele root and ZERO <style> blocks — pele emits none).
//   The ```mermaid fixtures stay (pele parses mermaid syntax); figure
//   data-role="MERMAID" is unchanged.
//   PREV: v3.1.1 - 2026-10-17 C-51 T-014 gate round. (1) The
//   in-flow case asserted computed position 'static', but muya's
//   universal .ag-paragraph rule (getSelector adds the class to every
//   block element) keeps position:relative on the preview — relative is
//   still IN FLOW; the bug being pinned was absolute (out of flow,
//   covering). The assertion now checks in-flow (not absolute/fixed)
//   plus STRONGER geometry: the preview top at or below the edited
//   source bottom, and the next heading top at or below the preview
//   bottom (both engines had failed on 'static'). (2) The theme-follow
//   case is unchanged — its chromium failure was the product race fixed
//   in blockViewer v3.1.0 (the mermaid pipeline re-inserts the
//   byte-identical last-good old-theme svg synchronously during the
//   re-render, before the async re-draw lands; the viewer's poll now
//   gates on a changed-content token instead of any content).
//   v3.1.0 - 2026-10-17 C-51 T-014 (live smoke
//   2026-10-16): three new cases. Fit-up — a tiny diagram opens via
//   Cmd/Ctrl+click at scale > 1 (the old fit capped at 1:1), the Fit
//   button keeps it there, 1:1 returns to scale 1 with the drawn size
//   equal to the viewBox natural size. Theme-follow — the viewer is
//   opened on a wide diagram, the preferences store flips paper → ink
//   (the same pref path the title-bar toggle writes; the overlay covers
//   the title bar itself) and the CLONE's mermaid node fill changes to
//   the live re-rendered block's fill with the canvas scale unchanged.
//   Edit-preview in flow — clicking a mermaid preview activates the
//   source and the preview's computed position is static with the next
//   heading's rect fully below the preview's bottom (was: absolute
//   overlay covering it), same for a multiplemath preview. The
//   T-014 cases fail on main (fit caps at 1, the clone keeps the old
//   theme, the preview floats). bootstrapWithMarkdown gained the
//   extraPrefs parameter (existing callers unchanged).
//   v3.0.0 - 2026-10-16 C-51 T-010 (user decision D-7,
//   «показывается даже для малых таблиц и диаграмм… похожа на иконку
//   копировать»): the button appears only where the viewer helps. Small
//   mermaid/table blocks have NO visible button and NO Tab stop (display:
//   none — focus() is a no-op and Tab walks past them); a wide flowchart
//   and wide/tall tables DO get it, hidden at rest (opacity 0), ≥ 0.4 on
//   figure hover, 1 on button hover/focus, ≤ 22 px and inside the figure
//   (diagrams) / in the top-margin band clear of the header text and the
//   last-column resize handle (tables); narrowing the viewport until a
//   diagram scales adds the button; Cmd/Ctrl+click still opens the viewer
//   for a small diagram. The always-open tests moved to wide fixtures;
//   the 30 px/44 px strip/always-visible cases were replaced by the need
//   rules instead of deleted coverage. The C-51 T-008 traffic-lights case
//   is kept (opens via the needed button of the wide diagram).
//   v2.1.0 - 2026-10-16 C-51 T-006 canvas rework: the look
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

const SMALL_DIAGRAM_MD = `# Block Viewer Diagrams

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

// 14 chained nodes: the SVG's natural width is far beyond the text
// column, so it is always scaled to fit (the T-010 need rule).
const WIDE_DIAGRAM_MD = (() => {
  const nodes = Array.from({ length: 14 }, (_, i) => `N${i}[Service number ${i}]`).join(' --> ')
  return `# Wide\n\n\`\`\`mermaid\ngraph LR\n    ${nodes}\n\`\`\`\n`
})()

// Three medium nodes: at the default viewport the diagram keeps its
// natural width (the text column is ~700-750 px); at a 460 px viewport
// the column (~410 px) scales the SVG down and the button appears (the
// resize re-evaluation case). Labels sized so the natural width sits
// comfortably between the two columns.
const MEDIUM_DIAGRAM_MD = `# Resize Flip

\`\`\`mermaid
graph LR
    Ship[Release candidate] --> Beta[Beta test round] --> Day[Public launch day]
\`\`\`

Text after.
`

// C-51 T-014: two tiny nodes — the natural size is far below the viewer
// stage in both engines, so fit MUST scale the diagram UP (the inherited
// fit capped at 1:1 and left the small chart tiny in the huge stage).
const TINY_DIAGRAM_MD = `# Tiny

\`\`\`mermaid
graph TD
    A[Hi] --> B[Ok]
\`\`\`

Text after.
`

// C-51 T-014: a diagram block and a math block, each followed by a
// heading — while the source is edited, the live preview must sit in
// flow BELOW the source so the heading is pushed down, never covered.
const EDIT_FLOW_MD = `# Edit Flow

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

## Next heading

A paragraph between the diagram and the math block.

$$
\\int_0^1 x^2\\,dx = \\tfrac13
$$

## After the math

Closing paragraph.
`

// 12 columns: the C-39 wrapper must scroll horizontally — the table
// overflow need rule — and the last column's resize handle stays
// draggable with the button present.
const WIDE_TABLE_MD = `# Block Viewer Wide Table

${Array.from({ length: 12 }, (_, i) => `| Column number ${i + 1}`).join('')} |
${Array.from({ length: 12 }, () => '| ---').join('')} |
${Array.from({ length: 12 }, (_, i) => `| value ${i + 1}`).join('')} |

Some text after the table.
`

// Every viewable block (C-51 T-006) plus the T-010 need split: the small
// mermaid, sequence, vega-lite, plantuml and the small table stay
// button-less; the wide mermaid, the wide flowchart and the wide/tall
// tables get the button. The plantuml sample renders offline as a broken
// <img> (plantuml.com is unreachable in CI) — presence is still asserted
// on the (hidden) button.
const MIXED_MD = `# Expand Button Coverage

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`

\`\`\`mermaid
graph LR
    ${Array.from({ length: 14 }, (_, i) => `N${i}[Service number ${i}]`).join(' --> ')}
\`\`\`

\`\`\`flowchart
st=>start: Begin the wide flow
w1=>operation: Prepare the first wide step
w2=>operation: Prepare the second wide step
w3=>operation: Prepare the third wide step
w4=>operation: Prepare the fourth wide step
w5=>operation: Prepare the fifth wide step
w6=>operation: Prepare the sixth wide step
w7=>operation: Prepare the seventh wide step
w8=>operation: Prepare the eighth wide step
e=>end: Flow complete
st->w1(right)
w1->w2(right)
w2->w3(right)
w3->w4(right)
w4->w5(right)
w5->w6(right)
w6->w7(right)
w7->w8(right)
w8->e(right)
\`\`\`

\`\`\`sequence
Title: Quick check
A->B: Ping?
B-->A: Pong
\`\`\`

\`\`\`vega-lite
{"data":{"values":[{"kind":"A","count":3},{"kind":"B","count":5}]},"mark":"bar","encoding":{"x":{"field":"kind","type":"nominal"},"y":{"field":"count","type":"quantitative"}}}
\`\`\`

\`\`\`plantuml
@startuml
Alice -> Bob: hello
@enduml
\`\`\`

| Alpha | Beta | Gamma |
| --- | --- | --- |
| one | two | three |
| four | five | six |

${Array.from({ length: 12 }, (_, i) => `| Column number ${i + 1}`).join('')} |
${Array.from({ length: 12 }, () => '| ---').join('')} |
${Array.from({ length: 12 }, (_, i) => `| value ${i + 1}`).join('')} |

| Height | Rows | Below |
| --- | --- | --- |
${Array.from({ length: 30 }, (_, i) => `| row ${i + 1} | value ${i + 1} | end |`).join('\n')}

\`\`\`js
const noButtonHere = true
\`\`\`

Final paragraph.
`

async function bootstrapWithMarkdown (
  page: Page,
  markdown: string,
  theme = 'light',
  // C-51 T-014: per-test preference overrides (spread AFTER the defaults,
  // so e.g. lightModeTheme/darkModeTheme can be pinned without copying
  // the whole pref table).
  extraPrefs: Record<string, unknown> = {}
) {
  await page.addInitScript(({ t, extra }: { t: string; extra: Record<string, unknown> }) => {
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
        sequenceTheme: 'hand',
        ...extra
      })
    }
  }, { t: theme, extra: extraPrefs })

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

// Computed fill of the first pele node shape under a root — the same
// read pele-theme.spec.ts uses, pointed at the viewer CLONE or the
// live figure (C-51 T-014 theme-follow case; pele node cards are
// g.pele-node rect/polygon resolving --pele-surface since C-55).
async function nodeFillIn (page: Page, rootSelector: string): Promise<string> {
  return page.evaluate((sel: string) => {
    const root = document.querySelector(sel)
    if (!root) return 'none'
    const shape = root.querySelector('g.pele-node rect, g.pele-node polygon')
    return shape ? window.getComputedStyle(shape).fill : 'none'
  }, rootSelector)
}

test.describe('block viewer (C-34 R2.2 + C-39 T2)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('diagram: the needed expand button opens the fullscreen viewer; zoom key scales; Esc restores focus', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    // T-010: the wide diagram is scaled to the column, so the figure
    // carries the need class and its expand action is laid out (C-56
    // T-005: the corner pill's third button; opacity 0 at rest — the pill
    // appears on figure hover, display is the need gate).
    const expand = page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand').first()
    await expect(expand).toBeVisible()
    await expect(expand).toHaveAttribute('aria-label', 'Open full screen')
    await expect(expand).toHaveAttribute('title', 'Open full screen')

    // Clicking ⤢ opens the overlay with the cloned SVG (no re-render).
    await expand.click()
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer.locator('.ag-block-viewer-title')).toHaveText('Diagram')
    await expect(viewer.locator('.ag-block-viewer-canvas svg').first()).toBeVisible()
    // The clone carries the pele svg root — and pele emits NO <style>
    // blocks (the mermaid-era WKWebView hoisting travelled with the clone;
    // C-55 removed it by construction).
    const cloneHasPele = await page.evaluate(() => {
      const canvas = document.querySelector('.ag-block-viewer-canvas')
      if (!canvas) return { svg: false, styleBlocks: 1 }
      return {
        svg: !!canvas.querySelector('div.ag-container-preview > svg.pele'),
        styleBlocks: canvas.querySelectorAll('div.ag-container-preview style').length
      }
    })
    expect(cloneHasPele.svg).toBe(true)
    expect(cloneHasPele.styleBlocks).toBe(0)

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

  test('macOS: the viewer title clears the traffic lights; other platforms keep the plain inset (C-51 T-008)', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD)
    await page.locator('div.ag-container-preview.ag-pele-preview').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    const viewer = page.locator('.ag-block-viewer')
    const title = viewer.locator('.ag-block-viewer-title')
    // The overlay title bar puts the window buttons over the top-left
    // ~78 px of the page; the live smoke showed «Diagram» under them.
    const openAs = async (darwin: boolean) => {
      await page.evaluate((d) => {
        const root = document.documentElement
        for (const c of ['platform-darwin', 'platform-win32', 'platform-linux']) root.classList.remove(c)
        root.classList.add(d ? 'platform-darwin' : 'platform-linux')
      }, darwin)
      await page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand').first().click()
      await expect(viewer).toHaveClass(/ag-block-viewer-open/)
      const box = await title.boundingBox()
      await viewer.locator('.ag-block-viewer-close-btn').click()
      await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)
      return box ? box.x : -1
    }
    expect(await openAs(true)).toBeGreaterThanOrEqual(80)
    const plain = await openAs(false)
    expect(plain).toBeGreaterThanOrEqual(0)
    expect(plain).toBeLessThan(40)
  })

  test('Ctrl+wheel inside the viewer zooms the diagram and leaves the editor font size alone', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    const fontBefore = await page.evaluate(() => getComputedStyle(document.querySelector('#ag-editor-id') as HTMLElement).fontSize)

    await page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand').first().click()
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
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD)
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand').first().click()
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
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('div.ag-pele-preview svg').first().waitFor({ state: 'visible', timeout: 20_000 })

    // In the page the wide diagram fits the column (no sideways scroll).
    const inPage = await page.evaluate(() => {
      const c = document.querySelector('div.ag-container-preview.ag-pele-preview') as HTMLElement
      return { client: c.clientWidth, scroll: c.scrollWidth, svg: (c.querySelector('svg') as SVGSVGElement).getBoundingClientRect().width }
    })
    expect(inPage.svg).toBeLessThanOrEqual(inPage.client + 1)
    expect(inPage.scroll).toBeLessThanOrEqual(inPage.client + 1)

    await page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand').first().click()
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

  test('table: the needed expand button opens a read-only clone with a sticky header; zoom and Esc work', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_TABLE_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const table = page.locator('table.ag-paragraph').first()
    await table.waitFor({ state: 'visible', timeout: 15_000 })

    // T-010: the 12-column table overflows its column, so the figure
    // needs the viewer and the button is laid out.
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



  test('Cmd/Ctrl+click on a small diagram still opens the viewer; a plain click opens the source', async ({ page }) => {
    await bootstrapWithMarkdown(page, SMALL_DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    // T-010: the small diagram has NO button — but Cmd/Ctrl+click keeps
    // opening the viewer for every viewable block (D-7 keeps this path).
    const figure = page.locator('figure[data-role="MERMAID"]').first()
    await expect(figure).not.toHaveClass(/ag-expand-needed/)
    await expect(page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand')).toBeHidden()

    // Cmd+click (macOS) / Ctrl+click: fullscreen viewer, no source editing.
    await preview.click({ modifiers: ['Meta'] })
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    // The source block never activates: an inactive mermaid figure still
    // shows its collapsed source line, so check the figure's active state.
    await expect(figure).not.toHaveClass(/ag-active/)
    await page.keyboard.press('Escape')
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)

    // A plain click keeps the existing behaviour: open the source block.
    await preview.click()
    const codeContent = page.locator('pre[data-role="mermaid"] span.ag-code-content').first()
    await codeContent.waitFor({ state: 'visible', timeout: 10_000 })
    await expect(viewer).not.toHaveClass(/ag-block-viewer-open/)
  })

  // START_BLOCK_EXPAND_E2E_COVERAGE
  // C-51 T-010 acceptance criteria: the button appears only where the
  // fullscreen viewer helps — a small mermaid/table has none (and is not
  // a Tab stop), a wide flowchart and wide/tall tables have it; the
  // localized aria-label rides the vnode everywhere; geometry never
  // covers table header text or the last-column resize handle.
  test('need rules: small blocks have no button or Tab stop; wide flowchart and wide/tall tables get it', async ({ page }) => {
    await bootstrapWithMarkdown(page, MIXED_MD, 'paper')
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('figure[data-role="MERMAID"] div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    // The other local renderers draw shortly after; plantuml stays a
    // broken img offline. The flowchart/vega renderers finish async, so
    // their need verdicts are polled with toHaveClass below.
    await page.locator('figure[data-role="VEGA-LITE"] div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('figure[data-role="FLOWCHART"] div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('figure[data-role="SEQUENCE"] div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })

    // The ag-block-expand family VNODE renders on every viewable figure —
    // C-56 T-005: 15 buttons (the two mermaid + vega pill figures carry
    // THREE family buttons each, flowchart/sequence/plantuml and the three
    // tables carry the standalone glyph) — visibility is the need gate.
    await expect(page.locator('.editor-with-tabs button.ag-block-expand')).toHaveCount(15)

    // Exactly the four benefiting figures carry the need class.
    const needs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('figure.ag-expand-needed')).map(f => f.getAttribute('data-role'))
    )
    needs.sort()
    expect(needs).toEqual(['FLOWCHART', 'MERMAID', 'TABLE', 'TABLE'])
    // ...and every family button (hidden ones included) carries its
    // localized label: 'Expand' for the six standalone glyphs, the
    // blockToolbar.* strings for the nine pill buttons.
    const labeled = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button.ag-block-expand')).map((b) => ({
        pill: b.classList.contains('ag-block-toolbar-btn'),
        action: b.classList.contains('ag-block-toolbar-edit')
          ? 'edit'
          : b.classList.contains('ag-block-toolbar-copy')
            ? 'copy'
            : b.classList.contains('ag-block-toolbar-expand')
              ? 'expand'
              : 'standalone',
        label: b.getAttribute('aria-label')
      }))
    )
    expect(labeled).toHaveLength(15)
    const tally: Record<string, number> = {}
    for (const b of labeled) {
      tally[`${b.pill ? 'pill:' : ''}${b.action}`] = (tally[`${b.pill ? 'pill:' : ''}${b.action}`] || 0) + 1
    }
    expect(tally).toEqual({
      standalone: 6,
      'pill:edit': 3,
      'pill:copy': 3,
      'pill:expand': 3
    })
    expect(labeled.filter((b) => b.action === 'standalone').every((b) => b.label === 'Expand')).toBe(true)
    expect(labeled.filter((b) => b.action === 'edit').every((b) => b.label === 'Edit source')).toBe(true)
    expect(labeled.filter((b) => b.action === 'copy').every((b) => b.label === 'Copy as image')).toBe(true)
    expect(labeled.filter((b) => b.action === 'expand').every((b) => b.label === 'Open full screen')).toBe(true)

    // Small table: the standalone glyph is display:none — hidden,
    // unrendered and NOT focusable (focus() is a no-op, so no Tab stop).
    // The small mermaid keeps its pill (Edit/Copy are always reachable),
    // but the pill's expand action is display:none without the need class.
    for (const sel of ["figure[data-role='MERMAID']:not(.ag-expand-needed)", "figure[data-role='TABLE']:not(.ag-expand-needed)"]) {
      const expandSel = sel.includes('MERMAID')
        ? `${sel} div.ag-block-toolbar button.ag-block-toolbar-expand`
        : `${sel} > button.ag-block-expand`
      const state = await page.evaluate((s) => {
        const button = document.querySelector(s) as HTMLElement | null
        if (!button) return null
        button.focus()
        return {
          display: getComputedStyle(button).display,
          offsetParent: button.offsetParent,
          focused: document.activeElement === button
        }
      }, expandSel)
      expect(state).not.toBeNull()
      expect(state!.display).toBe('none')
      expect(state!.offsetParent, `${expandSel} must not be laid out`).toBeNull()
      expect(state!.focused, `${expandSel} must not take focus`).toBe(false)
    }
    // The small mermaid's pill Edit/Copy buttons stay real Tab stops (the
    // pill reveals itself on :focus-within — keyboard users see it).
    const smallPill = await page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='MERMAID']:not(.ag-expand-needed)") as HTMLElement
      const edit = figure.querySelector('button.ag-block-toolbar-edit') as HTMLElement
      edit.focus()
      return { focused: document.activeElement === edit, display: getComputedStyle(edit).display }
    })
    expect(smallPill.focused).toBe(true)
    expect(smallPill.display).toBe('flex')

    // The wide mermaid's corner pill: anchored at the 8 px inset inside
    // the figure's top-right corner, one compact row of three buttons.
    const diagramGeometry = await page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='MERMAID'].ag-expand-needed") as HTMLElement
      const pill = figure.querySelector('div.ag-block-toolbar') as HTMLElement
      const f = figure.getBoundingClientRect()
      const p = pill.getBoundingClientRect()
      return {
        fl: f.left, ft: f.top, fr: f.right, fb: f.bottom,
        pl: p.left, pt: p.top, pr: p.right, pb: p.bottom,
        w: p.width, h: p.height,
        insetTop: p.top - f.top, insetRight: f.right - p.right
      }
    })
    expect(diagramGeometry.w).toBeGreaterThan(60)
    expect(diagramGeometry.w).toBeLessThanOrEqual(170)
    expect(diagramGeometry.h).toBeGreaterThan(16)
    expect(diagramGeometry.h).toBeLessThanOrEqual(36)
    expect(diagramGeometry.pl).toBeGreaterThanOrEqual(diagramGeometry.fl - 1)
    expect(diagramGeometry.pr).toBeLessThanOrEqual(diagramGeometry.fr + 1)
    expect(diagramGeometry.pt).toBeGreaterThanOrEqual(diagramGeometry.ft - 1)
    expect(diagramGeometry.pb).toBeLessThanOrEqual(diagramGeometry.fb + 1)
    expect(diagramGeometry.insetTop).toBeGreaterThanOrEqual(4)
    expect(diagramGeometry.insetTop).toBeLessThanOrEqual(14)
    expect(diagramGeometry.insetRight).toBeGreaterThanOrEqual(4)
    expect(diagramGeometry.insetRight).toBeLessThanOrEqual(14)

    // The wide table's button lives in the band ABOVE the table (clear of
    // the header text and the resize zone by construction) and stays
    // within 24 px of the figure's top-right corner.
    const tableGeometry = await page.evaluate(() => {
      const figures = Array.from(document.querySelectorAll("figure[data-role='TABLE'].ag-expand-needed")) as HTMLElement[]
      const figure = figures[0]
      const button = figure.querySelector('button.ag-block-expand') as HTMLElement
      const table = figure.querySelector('table') as HTMLElement
      const lastTh = figure.querySelector('thead tr th:last-child') as HTMLElement
      const f = figure.getBoundingClientRect()
      const b = button.getBoundingClientRect()
      const t = table.getBoundingClientRect()
      const th = lastTh.getBoundingClientRect()
      const overlaps = (r1: DOMRect, r2: DOMRect) =>
        !(r1.right <= r2.left || r2.right <= r1.left || r1.bottom <= r2.top || r2.bottom <= r1.top)
      return {
        aboveTable: b.bottom - t.top,
        nearTop: f.top - b.top,
        nearRight: f.right - b.right,
        w: b.width,
        h: b.height,
        overlapsLastTh: overlaps(b, th)
      }
    })
    expect(tableGeometry.aboveTable, 'the button must sit fully above the table').toBeLessThanOrEqual(1)
    expect(tableGeometry.nearTop).toBeLessThanOrEqual(24)
    expect(tableGeometry.nearRight).toBeLessThanOrEqual(24)
    expect(tableGeometry.w).toBeLessThanOrEqual(22)
    expect(tableGeometry.h).toBeLessThanOrEqual(22)
    expect(tableGeometry.overlapsLastTh, 'the button must not cover the last header cell').toBe(false)
  })

  // START_BLOCK_TOOLBAR_E2E_LOOK
  // C-56 T-005 (approved mockup variant C): the pill replaces the old
  // 20 px copy-icon square on mermaid/vega-lite figures — opacity 0 → 1
  // on FIGURE hover (150 ms; never the caret), themed surface pill,
  // --pele-muted icons going --pele-fg on the 10% tint, label span
  // revealed by the button's own hover, need-gated third button.
  test('the corner pill look: opacity 0 at rest → 1 on figure hover, themed surface, label reveal, muted → fg hover', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD, 'paper')
    const figure = page.locator('figure[data-role="MERMAID"]').first()
    const expand = page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand').first()
    const edit = page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-edit').first()
    const copy = page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-copy').first()
    await expect(expand).toBeVisible()

    const looks = await page.evaluate(() => {
      const pill = document.querySelector("figure[data-role='MERMAID'] div.ag-block-toolbar") as HTMLElement
      const el = pill.querySelector('button.ag-block-toolbar-expand') as HTMLElement
      const span = el.querySelector('span') as HTMLElement
      const cs = getComputedStyle(pill)
      const btn = getComputedStyle(el)
      const b = pill.getBoundingClientRect()
      const fig = pill.closest('figure')!.getBoundingClientRect()
      return {
        opacity: cs.opacity,
        position: cs.position,
        radius: cs.borderRadius,
        padding: cs.padding,
        borderWidth: cs.borderTopWidth,
        labelDisplay: getComputedStyle(span).display,
        btnColor: btn.color,
        btnRadius: btn.borderRadius,
        width: b.width,
        height: b.height,
        insetTop: b.top - fig.top,
        insetRight: fig.right - b.right
      }
    })
    // The mockup variant-C pill: absolute at the 8 px inset, radius 8,
    // 2 px padding + 1 px border, resting invisible; the label span is
    // hidden until the button's own hover.
    expect(looks.opacity).toBe('0')
    expect(looks.position).toBe('absolute')
    expect(looks.radius).toBe('8px')
    expect(looks.padding).toBe('2px')
    expect(looks.borderWidth).toBe('1px')
    expect(looks.labelDisplay).toBe('none')
    expect(looks.btnColor).not.toBe('')
    expect(looks.insetTop).toBeGreaterThan(4)
    expect(looks.insetTop).toBeLessThanOrEqual(12)
    expect(looks.insetRight).toBeGreaterThan(4)
    expect(looks.insetRight).toBeLessThanOrEqual(12)

    // Solid while the figure is hovered (the 150 ms transition).
    await figure.hover()
    await page.waitForTimeout(300)
    const hoverLooks = await page.evaluate(() =>
      getComputedStyle(document.querySelector("figure[data-role='MERMAID'] div.ag-block-toolbar") as HTMLElement).opacity
    )
    expect(hoverLooks).toBe('1')

    // The caret alone must NOT reveal it: pointer off the figure, click a
    // paragraph (caret lands in the text) — the pill stays invisible.
    await page.mouse.move(1, 1)
    await page.locator('#ag-editor-id p, #ag-editor-id h1').first().click()
    await page.waitForTimeout(300)
    const caretLooks = await page.evaluate(() =>
      getComputedStyle(document.querySelector("figure[data-role='MERMAID'] div.ag-block-toolbar") as HTMLElement).opacity
    )
    expect(caretLooks).toBe('0')

    // The button's own hover: --pele-fg over the 10% fg tint and the
    // localized label slides in next to the icon.
    await edit.hover()
    await page.waitForTimeout(300)
    const ownHover = await page.evaluate(() => {
      const el = document.querySelector('figure[data-role="MERMAID"] button.ag-block-toolbar-edit') as HTMLElement
      const cs = getComputedStyle(el)
      return {
        color: cs.color,
        background: cs.backgroundColor,
        label: getComputedStyle(el.querySelector('span') as HTMLElement).display
      }
    })
    // flex items are blockified: any visible display counts as revealed.
    expect(ownHover.label).not.toBe('none')
    // A tinted hover background resolves to a non-transparent colour.
    expect(ownHover.background).not.toBe('rgba(0, 0, 0, 0)')

    // Theme-following: the ink theme resolves a different button colour.
    const paperColor = ownHover.color
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD, 'ink')
    await page.locator('div.ag-container-preview.ag-pele-preview').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    // The pointer is still where the previous hover left it — move it off
    // the figure so the rest state is measured.
    await page.mouse.move(1, 1)
    await page.waitForTimeout(300)
    const darkLooks = await page.evaluate(() => {
      const pill = document.querySelector("figure[data-role='MERMAID'] div.ag-block-toolbar") as HTMLElement
      const cs = getComputedStyle(pill)
      const btn = getComputedStyle(pill.querySelector('button.ag-block-toolbar-expand') as HTMLElement)
      return { opacity: cs.opacity, color: btn.color }
    })
    expect(darkLooks.opacity).toBe('0')
    expect(darkLooks.color).not.toBe(paperColor)

    // Keyboard focus inside the pill keeps it visible (:focus-within) —
    // Tab users see where the focus landed.
    await copy.focus()
    await page.waitForTimeout(250)
    const focusLooks = await page.evaluate(() =>
      getComputedStyle(document.querySelector("figure[data-role='MERMAID'] div.ag-block-toolbar") as HTMLElement).opacity
    )
    expect(focusLooks).toBe('1')
  })
  // END_BLOCK_TOOLBAR_E2E_LOOK


  test('keyboard: focusing the expand button and pressing Enter opens the viewer; Esc restores the button focus', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD)
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })

    const expand = page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand').first()
    // The need class lands after the async mermaid insert; a display:none
    // button cannot take focus.
    await expect(page.locator('figure[data-role="MERMAID"]').first()).toHaveClass(/ag-expand-needed/)
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

  test('Tab walks the buttons of needing blocks only: the hidden small-block buttons are skipped (keyboard guard)', async ({ page }) => {
    await bootstrapWithMarkdown(page, MIXED_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('figure[data-role="MERMAID"].ag-expand-needed div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('figure[data-role="FLOWCHART"].ag-expand-needed div.ag-container-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })

    // C-56 T-005 Tab landscape: the pill Edit/Copy buttons are Tab stops
    // on EVERY mermaid/vega figure (small ones included — keyboard users
    // must reach the pill), while every hidden expand action (small
    // mermaid/vega pills and the small sequence/plantuml/table standalone
    // glyphs) is display:none and skipped. Walk: wide mermaid's pill
    // expand → flowchart standalone → vega edit → vega copy → wide table.
    // Without the muya keydown guard the editor's tabHandler would
    // preventDefault and trap focus on the first pill button.
    const mermaidButton = page.locator("figure[data-role='MERMAID'].ag-expand-needed div.ag-block-toolbar button.ag-block-toolbar-expand")
    await mermaidButton.focus()
    await expect(mermaidButton).toBeFocused()

    const stopIs = (selector: string) => page.evaluate((s) => {
      const el = document.activeElement as HTMLElement | null
      return !!el && el.matches(s)
    }, selector)

    await page.keyboard.press('Tab')
    await expect.poll(() => stopIs("figure[data-role='FLOWCHART'].ag-expand-needed > button.ag-block-expand"), 'Tab must land on the wide flowchart button').toBe(true)

    // Keyboard focus shows the standalone button at full opacity
    // (:focus-visible) — focus arrived through a real Tab keypress.
    await page.waitForTimeout(300)
    const flowchartOpacity = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el ? getComputedStyle(el).opacity : ''
    })
    expect(flowchartOpacity).toBe('1')

    // The hidden stops between the flowchart and the vega pill (small
    // sequence, plantuml — display:none glyphs) are skipped entirely.
    await page.keyboard.press('Tab')
    await expect.poll(() => stopIs("figure[data-role='VEGA-LITE'] button.ag-block-toolbar-edit"), 'Tab must reach the vega pill Edit').toBe(true)

    // Keyboard focus inside the pill keeps the pill visible (:focus-within).
    await page.waitForTimeout(250)
    const vegaPillOpacity = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      const pill = el && el.closest('div.ag-block-toolbar')
      return pill ? getComputedStyle(pill).opacity : ''
    })
    expect(vegaPillOpacity).toBe('1')

    await page.keyboard.press('Tab')
    await expect.poll(() => stopIs("figure[data-role='VEGA-LITE'] button.ag-block-toolbar-copy"), 'Tab must reach the vega pill Copy').toBe(true)

    // The vega pill's hidden expand action and the small table's hidden
    // glyph are skipped — the next stop is the wide table's glyph.
    await page.keyboard.press('Tab')
    await expect.poll(() => stopIs("figure[data-role='TABLE'].ag-expand-needed > button.ag-block-expand"), 'Tab must skip hidden buttons and reach the wide table').toBe(true)

    // Shift+Tab walks back through the vega pill.
    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => stopIs("figure[data-role='VEGA-LITE'] button.ag-block-toolbar-copy")).toBe(true)
  })

  test('table: the button never covers the header text or the last column resize handle and resizing still works', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_TABLE_MD)
    await page.locator("figure[data-role='TABLE'] table").first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // Geometry: the button lives in the band ABOVE the table (the
    // figure's existing top margin), so it cannot intersect the header
    // text or the LAST column's resize hit zone (C-39 T-002).
    const clear = await page.evaluate(() => {
      const button = document.querySelector("figure[data-role='TABLE'] > button.ag-block-expand") as HTMLElement
      const lastTh = document.querySelector("figure[data-role='TABLE'] thead tr th:last-child") as HTMLElement
      const resizer = lastTh.querySelector('.ag-column-resizer') as HTMLElement
      if (!button || !lastTh) return null
      const b = button.getBoundingClientRect()
      const t = lastTh.getBoundingClientRect()
      const z = resizer ? resizer.getBoundingClientRect() : t
      const overlap = (r2: DOMRect) =>
        !(b.right <= r2.left || r2.right <= b.left || b.bottom <= r2.top || r2.bottom <= b.top)
      return { thOverlap: overlap(t), zoneOverlap: overlap(z), buttonBottom: b.bottom, tableTop: t.top }
    })
    expect(clear).not.toBeNull()
    expect(clear!.thOverlap, 'the button must not intersect the last header cell').toBe(false)
    expect(clear!.zoneOverlap, 'the button must not intersect the resize hit zone').toBe(false)
    expect(clear!.buttonBottom).toBeLessThanOrEqual(clear!.tableTop + 1)

    // Behaviour: drag the LAST column border — the column resizes, the
    // colgroup/fixed layout engages (C-39 T-002 unchanged by the button).
    // The last column of the overflowing table is scrolled out of the
    // clip rect: scroll the wrapper fully right first (outside of
    // Playwright's actionability scrolling, like table-layout.spec.ts).
    await page.evaluate(() => {
      const wrapper = document.querySelector("figure[data-role='TABLE'] div.ag-table-scroll") as HTMLElement
      wrapper.scrollLeft = wrapper.scrollWidth - wrapper.clientWidth
    })
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
    expect(after.widths[11], 'the last column must shrink by ~the drag delta').toBeLessThanOrEqual(widthsBefore[11] - 36)
  })

  test('resizing the viewport re-evaluates: an unscaled diagram becomes scaled and gains the button', async ({ page }) => {
    await bootstrapWithMarkdown(page, MEDIUM_DIAGRAM_MD)
    await page.locator('div.ag-container-preview.ag-pele-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })

    const figure = page.locator('figure[data-role="MERMAID"]').first()
    const before = await page.evaluate(() => {
      const c = document.querySelector('div.ag-container-preview.ag-pele-preview') as HTMLElement
      const svg = c.querySelector('svg') as SVGSVGElement
      return {
        natural: svg.viewBox.baseVal.width,
        rendered: svg.getBoundingClientRect().width,
        client: c.clientWidth,
        vw: window.innerWidth
      }
    })
    expect(before.natural).toBeGreaterThan(200)
    // At the default viewport the medium diagram keeps its natural width:
    // no scaling, no button.
    expect(before.rendered).toBeGreaterThanOrEqual(before.natural - 2)
    await expect(figure).not.toHaveClass(/ag-expand-needed/)
    await expect(page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand')).toBeHidden()

    // Narrow the viewport to 460 px: the text column drops to ~410 px —
    // well below the diagram's natural width — so the SVG scales down,
    // the shared ResizeObserver re-runs the rule and the button appears.
    // (A small step is not enough: the column is capped at
    // --editorAreaWidth 750 px and only shrinks once the viewport does.)
    await page.setViewportSize({ width: 460, height: 720 })

    await expect(figure).toHaveClass(/ag-expand-needed/, { timeout: 5_000 })
    await expect(page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand')).toBeVisible()
    const after = await page.evaluate(() => {
      const svg = document.querySelector('div.ag-container-preview.ag-pele-preview svg') as SVGSVGElement
      return svg.getBoundingClientRect().width
    })
    expect(after).toBeLessThan(before.natural - 2)
  })

  test('screenshots: the corner pill at figure hover, light and dark', async ({ page }, testInfo) => {
    for (const theme of ['paper', 'ink']) {
      await bootstrapWithMarkdown(page, MIXED_MD, theme)
      await page.locator('.editor-component, .editor-wrapper').first()
        .waitFor({ state: 'visible', timeout: 15_000 })
      await page.locator('figure[data-role="MERMAID"].ag-expand-needed div.ag-container-preview svg').first()
        .waitFor({ state: 'visible', timeout: 20_000 })
      // Let the flowchart/sequence/vega renderers finish drawing.
      await page.waitForTimeout(600)
      const pill = page.locator("figure[data-role='MERMAID'].ag-expand-needed div.ag-block-toolbar")
      await pill.scrollIntoViewIfNeeded()
      // Hover the figure so the full-opacity pill shows in the shot.
      await page.locator("figure[data-role='MERMAID'].ag-expand-needed").hover()
      await page.waitForTimeout(300)
      await page.screenshot({ path: testInfo.outputPath(`expand-buttons-${theme}.png`) })
    }
  })
  // END_BLOCK_EXPAND_E2E_COVERAGE

  // START_BLOCK_VIEWER_T014_E2E_COVERAGE
  // C-51 T-014 acceptance criteria: fit scales a small diagram UP (open
  // and Fit; 1:1 restores the natural size), an open viewer follows a
  // theme switch (the clone is refreshed from the re-rendered block,
  // zoom kept), and an edited diagram/math preview sits in flow below
  // the source so the following blocks are pushed down, never covered.
  test('fit scales a small diagram UP on open and on Fit; 1:1 restores the natural size (T-014)', async ({ page }) => {
    await bootstrapWithMarkdown(page, TINY_DIAGRAM_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('div.ag-pele-preview svg').first().waitFor({ state: 'visible', timeout: 20_000 })

    // The tiny diagram has no expand button (T-010 need rule) — the
    // Cmd/Ctrl+click path opens the viewer for every viewable block.
    await preview.click({ modifiers: ['Meta'] })
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await page.waitForTimeout(250) // the open fit + the deferred re-fit (rAF)

    const natural = await page.evaluate(() => {
      const svg = document.querySelector('.ag-block-viewer-canvas svg') as SVGSVGElement
      return { w: svg.viewBox.baseVal.width, h: svg.viewBox.baseVal.height }
    })
    expect(natural.w).toBeGreaterThan(0)

    const openedScale = await canvasScale(page)
    expect(openedScale, 'a small diagram opens fitted UP, not at 1:1').toBeGreaterThan(1.2)

    // The Fit button runs the same maths: still scaled up, same scale.
    await page.locator('.ag-block-viewer-fit').click()
    await page.waitForTimeout(150)
    const fitScale = await canvasScale(page)
    expect(fitScale, 'Fit keeps scaling the small diagram up').toBeGreaterThan(1.2)
    expect(Math.abs(fitScale - openedScale)).toBeLessThan(0.05)

    // 1:1 restores the natural size: scale 1 and the drawn box equals
    // the viewBox size (the clone overrides the inline width from it).
    await page.locator('.ag-block-viewer-actual-size').click()
    await page.waitForTimeout(150)
    expect(await canvasScale(page)).toBe(1)
    const drawn = await page.evaluate(() => {
      const svg = document.querySelector('.ag-block-viewer-canvas svg') as SVGSVGElement
      const r = svg.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    })
    expect(Math.abs(drawn.w - natural.w)).toBeLessThanOrEqual(2)
    expect(Math.abs(drawn.h - natural.h)).toBeLessThanOrEqual(2)
  })

  test('an open viewer follows a paper → ink theme switch: the clone re-renders with the new colours, zoom kept (T-014)', async ({ page }) => {
    // lightModeTheme/darkModeTheme pinned so 'ink' resolves to the dark
    // member; the theme is switched by writing the SAME preference the
    // title-bar toggle writes (the overlay covers the title bar itself).
    await bootstrapWithMarkdown(page, WIDE_DIAGRAM_MD, 'paper', {
      lightModeTheme: 'paper',
      darkModeTheme: 'ink'
    })
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    const preview = page.locator('div.ag-container-preview.ag-pele-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('div.ag-pele-preview svg').first().waitFor({ state: 'visible', timeout: 20_000 })

    await page.locator('figure[data-role="MERMAID"] div.ag-block-toolbar button.ag-block-toolbar-expand').first().click()
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await page.waitForTimeout(250) // fit + deferred re-fit

    const before = await nodeFillIn(page, '.ag-block-viewer-canvas')
    expect(before).not.toBe('none')
    const scaleBefore = await canvasScale(page)

    const wrote = await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      if (!pinia) return false
      pinia.state.value.preferences.theme = 'ink'
      return true
    })
    expect(wrote, 'the preferences store handle must resolve').toBe(true)
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })

    // The mermaid pipeline re-renders (250 ms debounce), the viewer's
    // refresh poll picks the block up, and the CLONE carries the new
    // theme's node fill — equal to the LIVE re-rendered diagram's (both
    // reads happen inside the poll so the comparison is settled state).
    await expect.poll(async () => {
      const clone = await nodeFillIn(page, '.ag-block-viewer-canvas')
      const live = await nodeFillIn(page, 'figure.ag-container-block')
      return clone !== before && clone === live
    }, { timeout: 30_000 }).toBe(true)
    // The refresh keeps zoom: the canvas transform was never touched.
    expect(await canvasScale(page)).toBe(scaleBefore)
  })

  test('editing a diagram or math block pushes the following blocks down instead of covering them (T-014)', async ({ page }) => {
    await bootstrapWithMarkdown(page, EDIT_FLOW_MD)
    await page.locator('.editor-component, .editor-wrapper').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('div.ag-container-preview.ag-pele-preview svg').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    // KaTeX loads lazily; the math preview must exist before it is edited.
    await page.locator("figure[data-role='MULTIPLEMATH'] .ag-container-preview .katex").first()
      .waitFor({ state: 'visible', timeout: 30_000 })

    // Plain click on the preview opens the source block (figure active).
    const figure = page.locator("figure[data-role='MERMAID']").first()
    await page.locator('div.ag-container-preview.ag-pele-preview').first().click()
    await expect(figure).toHaveClass(/ag-active/)
    await expect(figure.locator('pre[data-role="mermaid"] span.ag-code-content').first())
      .toBeVisible()
    // The activation re-queues the diagram: wait for the SVG to be back
    // before measuring, so the preview rect is the settled one.
    await expect(figure.locator('div.ag-container-preview svg').first())
      .toBeVisible({ timeout: 10_000 })

    const diagramGeometry = await page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='MERMAID']") as HTMLElement | null
      const preview = figure?.querySelector('div.ag-container-preview') as HTMLElement | null
      const source = figure?.querySelector('pre') as HTMLElement | null
      const heading = Array.from(document.querySelectorAll('#ag-editor-id h2'))
        .find(h => (h.textContent || '').includes('Next heading')) as HTMLElement | undefined
      if (!figure || !preview || !source || !heading) return null
      return {
        position: getComputedStyle(preview).position,
        sourceBottom: source.getBoundingClientRect().bottom,
        previewTop: preview.getBoundingClientRect().top,
        previewBottom: preview.getBoundingClientRect().bottom,
        headingTop: heading.getBoundingClientRect().top
      }
    })
    expect(diagramGeometry).not.toBeNull()
    // muya's universal .ag-paragraph rule (getSelector puts it on every
    // block element) keeps position:relative on the preview — that is
    // still IN FLOW (space reserved in the normal flow); the float bug
    // was position:absolute, out of flow and covering. Assert in-flow
    // positioning, then the geometry that proves the push-down.
    expect(['absolute', 'fixed'], 'the preview must stay in flow, not float')
      .not.toContain(diagramGeometry!.position)
    expect(
      diagramGeometry!.previewTop,
      'the preview takes its own space below the edited source'
    ).toBeGreaterThanOrEqual(diagramGeometry!.sourceBottom - 1)
    expect(
      diagramGeometry!.headingTop,
      'the next heading sits below the preview bottom (pushed down, not covered)'
    ).toBeGreaterThanOrEqual(diagramGeometry!.previewBottom - 1)

    // The multiplemath preview shares the rule: editing the math source
    // keeps the following heading below the preview too.
    const mathFigure = page.locator("figure[data-role='MULTIPLEMATH']").first()
    await mathFigure.locator('div.ag-container-preview').first().click()
    await expect(mathFigure).toHaveClass(/ag-active/)
    const mathGeometry = await page.evaluate(() => {
      const figure = document.querySelector("figure[data-role='MULTIPLEMATH']") as HTMLElement | null
      const preview = figure?.querySelector('div.ag-container-preview') as HTMLElement | null
      const source = figure?.querySelector('pre') as HTMLElement | null
      const heading = Array.from(document.querySelectorAll('#ag-editor-id h2'))
        .find(h => (h.textContent || '').includes('After the math')) as HTMLElement | undefined
      if (!figure || !preview || !source || !heading) return null
      return {
        position: getComputedStyle(preview).position,
        sourceBottom: source.getBoundingClientRect().bottom,
        previewTop: preview.getBoundingClientRect().top,
        previewBottom: preview.getBoundingClientRect().bottom,
        headingTop: heading.getBoundingClientRect().top
      }
    })
    expect(mathGeometry).not.toBeNull()
    expect(['absolute', 'fixed'], 'the math preview must stay in flow, not float')
      .not.toContain(mathGeometry!.position)
    expect(mathGeometry!.previewTop).toBeGreaterThanOrEqual(mathGeometry!.sourceBottom - 1)
    expect(mathGeometry!.headingTop).toBeGreaterThanOrEqual(mathGeometry!.previewBottom - 1)
  })
  // END_BLOCK_VIEWER_T014_E2E_COVERAGE
})
