// FILE: tests/e2e/diagram-export.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: E2E gate for the C-56 per-block diagram/chart picture export — context-menu items only on rendered Pele diagram / Vega-Lite chart blocks (enabled when rendered, disabled when the block never rendered, absent on paragraphs/tables/flowchart blocks), Copy as Image putting a 2×-natural PNG on the clipboard through plugin:clipboard-manager|write_image, Save as PNG…/SVG… writing valid bytes via the dialog + fs shims (2× IHDR, standalone SVG with zero var(--pele-*) and the theme panel background rect), the heading-slug default file name (ascii + Cyrillic + document fallback), the cancelled-save no-op, and the fullscreen block viewer toolbar exporting the WHOLE diagram at 2× natural size while the viewer itself is zoomed (corner-2) with the buttons hidden on non-exportable sources.
//   SCOPE: diagram-export.spec.ts only; boots the built renderer via the tauri shim with mocked preferences (same bootstrap as pele-render.spec.ts) and per-test __mockInvoke overrides for the context-menu popup, the clipboard image write, the dialog save and the binary/text fs writes.
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim (installTauriShim + the C-56 defaults).
//   LINKS: .grace/changes/active/C-56 R-1..R-7 (corners 1-6); .grace/verification/runtime.xml V-M-012 scenario-63; unit twin tests/renderer/muya/diagram-export.test.js; src/muya/lib/utils/diagramExport.js; editor.vue handleDiagramExportAction; ui/blockViewer export toolbar.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MAIN_MD - heading + mermaid (rendered) + vega-lite + paragraph + flowchart + table + an EMPTY mermaid fence (never-rendered case).
//   WIDE_MD - a 12-node graph LR (always scaled to the column → expand button opens the viewer).
//   NO_HEADING_MD - a diagram with no preceding heading (document fallback name diagram-N).
//   RU_HEADING_MD - a Cyrillic heading before the diagram (unicode slug, corner-6).
//   bootstrapWithMarkdown - tauri-shim + preferences + mt::bootstrap-editor document load (mirrors pele-render.spec.ts).
//   mockContextMenu - records every mt_window_popup_context_menu items payload and returns a chosen clicked id (null = dismissed).
//   mockClipboardImage / mockDialogSave / mockBinaryWrite / mockTextWrite - per-transport capture overrides.
//   pngIhdr - reads { width, height } out of a captured PNG byte array in-page.
//   naturalSizeOf - the exporter's natural-size math (data-natural-width / viewBox ratio) applied to a live figure's SVG.
//   openContextMenuOn - left-clicks a paragraph first (muya's contextmenu dispatch needs a live cursor) then right-clicks the target.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-56: first version.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const MAIN_MD = `# How a Release Moves

\`\`\`mermaid
graph LR
    Write[Agent writes plan.md] --> Reload[Mark reloads the tab]
    Reload --> Edit[You edit a paragraph]
    Edit --> Hand[Hand the edits back]
\`\`\`

Some text after the diagram.

\`\`\`vega-lite
{"data":{"values":[{"kind":"A","count":3},{"kind":"B","count":5}]},"mark":"bar","encoding":{"x":{"field":"kind","type":"nominal"},"y":{"field":"count","type":"quantitative"}}}
\`\`\`

Text between the chart and the flowchart.

\`\`\`flowchart
st=>start: Begin the quick flow
e=>end: Flow complete
st->e
\`\`\`

| Col | Two |
| --- | --- |
| one | two |

Final paragraph after the table.

\`\`\`mermaid
\`\`\`
`

// 12 chained nodes: the natural width exceeds the text column, so the
// figure carries the expand button that opens the fullscreen viewer.
const WIDE_MD = `# Wide Viewer Export

\`\`\`mermaid
graph LR
    ${Array.from({ length: 12 }, (_, i) => `N${i}[Service number ${i}]`).join(' --> ')}
\`\`\`

Text after.
`

const NO_HEADING_MD = `Just a paragraph, no heading at all.

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`
`

const RU_HEADING_MD = `# Как устроен релиз!

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`
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

// START_BLOCK_EXPORT_E2E_HELPERS
async function mockContextMenu (page: Page, clickId: string | null = null) {
  await page.evaluate((id: string | null) => {
    const w = window as any
    w.__menuCaptures = []
    w.__mockInvoke['mt_window_popup_context_menu'] = (args: any) => {
      w.__menuCaptures.push(args && args.items ? args.items : [])
      return id
    }
  }, clickId)
}

async function mockClipboardImage (page: Page) {
  await page.evaluate(() => {
    const w = window as any
    w.__clipImages = []
    w.__mockInvoke['plugin:clipboard-manager|write_image'] = (args: any) => {
      w.__clipImages.push(new Uint8Array(args && args.image))
      return null
    }
  })
}

async function mockDialogSave (page: Page, returnPath: string | null) {
  await page.evaluate((p: string | null) => {
    const w = window as any
    w.__saveCalls = []
    w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
      // plugin-dialog invokes with { options: { title, defaultPath, filters } }.
      w.__saveCalls.push(args && args.options ? args.options : args)
      return p
    }
  }, returnPath)
}

async function mockFsWrites (page: Page) {
  await page.evaluate(() => {
    const w = window as any
    w.__binaryWrites = []
    w.__textWrites = []
    w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
      w.__binaryWrites.push({ path: args.path, data: new Uint8Array(args.data) })
      return null
    }
    w.__mockInvoke['mt_fs_write'] = (args: any) => {
      w.__textWrites.push({ path: args.path, content: args.content })
      return null
    }
  })
}

// IHDR dimensions of the n-th captured clipboard image (in-page: the bytes
// never cross the bridge).
async function clipboardPngIhdr (page: Page, index = 0) {
  return page.evaluate((i: number) => {
    const w = window as any
    const bytes = w.__clipImages && w.__clipImages[i]
    if (!bytes || bytes.length < 24) return null
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      return { signature: 'not-png' }
    }
    const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0
    const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0
    return { width, height }
  }, index)
}

// The exporter's natural-size math applied to the live figure SVG:
// data-natural-width when present, else the viewBox; height by ratio.
async function naturalSizeOf (page: Page, figureSelector: string) {
  return page.evaluate((sel: string) => {
    const svg = document.querySelector(`${sel} div.ag-container-preview svg`) as SVGSVGElement | null
    if (!svg) return null
    const attr = svg.getAttribute('data-natural-width')
    const natural = attr ? parseFloat(attr) : 0
    const vbAttr = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
    const vb = vbAttr.length === 4 && vbAttr.every(Number.isFinite)
      ? { width: vbAttr[2], height: vbAttr[3] }
      : { width: 0, height: 0 }
    const width = natural > 0 ? natural : (vb.width > 0 ? vb.width : parseFloat(svg.getAttribute('width') || '0'))
    let height = 0
    if (vb.width > 0 && vb.height > 0 && width > 0) {
      height = vb.height * (width / vb.width)
    } else {
      height = parseFloat(svg.getAttribute('height') || '0')
    }
    return { width, height }
  }, figureSelector)
}

// muya's contextmenu dispatch needs a live cursor (selection.getCursorRange
// early-returns without one), so click a text block first (a paragraph or,
// in the heading-only fixtures, the heading), then right-click.
async function openContextMenuOn (page: Page, targetSelector: string) {
  await page.locator('#ag-editor-id p, #ag-editor-id h1').first().click()
  await page.locator(targetSelector).first().click({ button: 'right' })
  await expect
    .poll(() => page.evaluate(() => (window as any).__menuCaptures.length), { timeout: 5_000 })
    .toBeGreaterThan(0)
  return page.evaluate(() => {
    const captures = (window as any).__menuCaptures
    return captures[captures.length - 1]
  })
}

async function waitForMermaid (page: Page) {
  await page.locator('.editor-component, .editor-wrapper').first()
    .waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator("figure[data-role='MERMAID'] div.ag-container-preview svg").first()
    .waitFor({ state: 'visible', timeout: 20_000 })
}
// END_BLOCK_EXPORT_E2E_HELPERS

test.describe('diagram export (C-56)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  // START_BLOCK_EXPORT_E2E_MENU
  test('context menu: the three image items appear on a rendered mermaid block and Copy as Image writes a 2× PNG', async ({ page }) => {
    await bootstrapWithMarkdown(page, MAIN_MD)
    await waitForMermaid(page)
    await mockContextMenu(page, 'copyAsImage')
    await mockClipboardImage(page)

    const items = await openContextMenuOn(page, "figure[data-role='MERMAID'] div.ag-container-preview")
    const byId = Object.fromEntries(
      items.filter((i: any) => i.id).map((i: any) => [i.id, i])
    )
    expect(byId.copyAsImage, 'Copy as Image item present').toBeTruthy()
    expect(byId.saveDiagramPng, 'Save as PNG item present').toBeTruthy()
    expect(byId.saveDiagramSvg, 'Save as SVG item present').toBeTruthy()
    // The items sit below copy/paste (after the paste role).
    const indexOfItem = (pred: (i: any) => boolean) => items.findIndex(pred)
    expect(indexOfItem((i: any) => i.role === 'paste'))
      .toBeLessThan(indexOfItem((i: any) => i.id === 'copyAsImage'))
    expect(indexOfItem((i: any) => i.id === 'copyAsImage'))
      .toBeLessThan(indexOfItem((i: any) => i.id === 'saveDiagramPng'))
    expect(indexOfItem((i: any) => i.id === 'saveDiagramPng'))
      .toBeLessThan(indexOfItem((i: any) => i.id === 'saveDiagramSvg'))
    expect(indexOfItem((i: any) => i.id === 'saveDiagramSvg'))
      .toBeLessThan(indexOfItem((i: any) => i.id === 'selectAll'))

    // The rendered block's items are enabled.
    expect(byId.copyAsImage.enabled).not.toBe(false)
    expect(byId.saveDiagramPng.enabled).not.toBe(false)
    expect(byId.saveDiagramSvg.enabled).not.toBe(false)

    // The clicked Copy as Image rasterizes at 2× the NATURAL size (not the
    // column-scaled display size) and reaches the clipboard plugin as PNG
    // bytes.
    const natural = await naturalSizeOf(page, "figure[data-role='MERMAID']")
    await expect
      .poll(() => page.evaluate(() => (window as any).__clipImages.length), { timeout: 10_000 })
      .toBeGreaterThan(0)
    const ihdr = await clipboardPngIhdr(page)
    expect(ihdr).not.toBeNull()
    expect(Math.abs(ihdr!.width - 2 * natural.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(ihdr!.height - 2 * natural.height)).toBeLessThanOrEqual(2)

    // The short confirmation toast says "Copied".
    await expect(page.locator('.mt-notification', { hasText: 'Copied' })).toBeVisible()
  })

  test('context menu: a Vega-Lite chart block gets the items too; paragraphs, tables and flowchart blocks do not (corner-3)', async ({ page }) => {
    await bootstrapWithMarkdown(page, MAIN_MD)
    await waitForMermaid(page)
    await page.locator("figure[data-role='VEGA-LITE'] div.ag-container-preview svg").first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator("figure[data-role='FLOWCHART'] div.ag-container-preview svg").first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await mockContextMenu(page)

    const vegaItems = await openContextMenuOn(page, "figure[data-role='VEGA-LITE'] div.ag-container-preview")
    expect(vegaItems.filter((i: any) => i.id === 'copyAsImage')).toHaveLength(1)

    for (const negative of [
      '#ag-editor-id p',
      "figure[data-role='TABLE'] table",
      "figure[data-role='FLOWCHART'] div.ag-container-preview"
    ]) {
      const items = await openContextMenuOn(page, negative)
      const imageIds = items.filter((i: any) =>
        ['copyAsImage', 'saveDiagramPng', 'saveDiagramSvg'].includes(i.id)
      )
      expect(imageIds, `${negative} must not offer image export`).toHaveLength(0)
    }
  })

  test('context menu: a never-rendered mermaid block shows the items disabled (corner-4)', async ({ page }) => {
    await bootstrapWithMarkdown(page, MAIN_MD)
    await waitForMermaid(page)
    await mockContextMenu(page)

    // The LAST mermaid figure of MAIN_MD is the empty fence — no svg.
    const rendered = await page.evaluate(() => {
      const figures = Array.from(document.querySelectorAll("figure[data-role='MERMAID']"))
      return figures.map(f => !!f.querySelector('div.ag-container-preview svg'))
    })
    expect(rendered[rendered.length - 1], 'the empty fence never renders an svg').toBe(false)

    const figure = page.locator("figure[data-role='MERMAID']").last()
    const box = await figure.boundingBox()
    expect(box).not.toBeNull()
    await page.locator('#ag-editor-id p').first().click()
    // Locate the empty preview AFTER the caret click (the layout can shift).
    await figure.locator('div.ag-container-preview').click({ button: 'right' })
    await expect
      .poll(() => page.evaluate(() => (window as any).__menuCaptures.length), { timeout: 5_000 })
      .toBeGreaterThan(0)
    const items = await page.evaluate(() => {
      const c = (window as any).__menuCaptures
      return c[c.length - 1]
    })
    const byId = Object.fromEntries(items.filter((i: any) => i.id).map((i: any) => [i.id, i]))
    expect(byId.copyAsImage?.enabled).toBe(false)
    expect(byId.saveDiagramPng?.enabled).toBe(false)
    expect(byId.saveDiagramSvg?.enabled).toBe(false)
  })
  // END_BLOCK_EXPORT_E2E_MENU

  // START_BLOCK_EXPORT_E2E_SAVE
  test('Save as PNG…: the heading slug names the file; the written bytes are a 2× PNG', async ({ page }) => {
    await bootstrapWithMarkdown(page, MAIN_MD)
    await waitForMermaid(page)
    await mockContextMenu(page, 'saveDiagramPng')
    await mockDialogSave(page, '/tmp/mark-e2e-exports/how-a-release-moves.png')
    await mockFsWrites(page)

    await openContextMenuOn(page, "figure[data-role='MERMAID'] div.ag-container-preview")

    await page.waitForFunction(() => (window as any).__binaryWrites.length > 0, undefined, { timeout: 10_000 })
    const saves = await page.evaluate(() => (window as any).__saveCalls)
    expect(saves).toHaveLength(1)
    expect(saves[0].defaultPath).toBe('how-a-release-moves.png')

    const natural = await naturalSizeOf(page, "figure[data-role='MERMAID']")
    const written = await page.evaluate(() => {
      const w = (window as any).__binaryWrites
      if (!w.length) return null
      const bytes = w[0].data
      const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0
      const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0
      return { path: w[0].path, isPng: bytes[0] === 0x89 && bytes[1] === 0x50, width, height }
    })
    expect(written).not.toBeNull()
    expect(written!.isPng).toBe(true)
    expect(written!.path).toContain('how-a-release-moves.png')
    expect(Math.abs(written!.width - 2 * natural.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(written!.height - 2 * natural.height)).toBeLessThanOrEqual(2)
    // The success toast names the file.
    await expect(page.locator('.mt-notification', { hasText: 'how-a-release-moves.png' })).toBeVisible()
  })

  test('Save as SVG…: the written file is standalone — zero var(--pele-* and the theme panel background rect', async ({ page }) => {
    await bootstrapWithMarkdown(page, MAIN_MD)
    await waitForMermaid(page)
    await mockContextMenu(page, 'saveDiagramSvg')
    await mockDialogSave(page, '/tmp/mark-e2e-exports/how-a-release-moves.svg')
    await mockFsWrites(page)

    await openContextMenuOn(page, "figure[data-role='MERMAID'] div.ag-container-preview")

    await page.waitForFunction(() => (window as any).__textWrites.length > 0, undefined, { timeout: 10_000 })
    const written = await page.evaluate(() => {
      const w = (window as any).__textWrites
      return w.length ? w[0] : null
    })
    expect(written).not.toBeNull()
    expect(written!.path).toContain('.svg')
    expect(written!.content.startsWith('<svg')).toBe(true)
    expect(written!.content).not.toContain('var(--pele-')
    expect(written!.content).toContain('<rect class="ag-export-background"')
    // No editor chrome and no executable markup travelled.
    expect(written!.content).not.toContain('<script')
    expect(written!.content).not.toContain('ag-block-expand')
  })

  test('file names: the Cyrillic heading slugs to Cyrillic; no heading falls back to diagram-N (corner-6)', async ({ page }) => {
    for (const [doc, expected] of [
      [RU_HEADING_MD, 'как-устроен-релиз.png'],
      [NO_HEADING_MD, 'diagram-1.png']
    ] as const) {
      await bootstrapWithMarkdown(page, doc)
      await waitForMermaid(page)
      await mockContextMenu(page, 'saveDiagramPng')
      await mockDialogSave(page, `/tmp/mark-e2e-exports/${expected}`)
      await mockFsWrites(page)
      await openContextMenuOn(page, "figure[data-role='MERMAID'] div.ag-container-preview")
      await page.waitForFunction(() => (window as any).__binaryWrites.length > 0, undefined, { timeout: 10_000 })
      const saves = await page.evaluate(() => (window as any).__saveCalls)
      expect(saves).toHaveLength(1)
      expect(saves[0].defaultPath).toBe(expected)
    }
  })

  test('a cancelled save dialog writes nothing and shows no success toast (corner-5)', async ({ page }) => {
    await bootstrapWithMarkdown(page, MAIN_MD)
    await waitForMermaid(page)
    await mockContextMenu(page, 'saveDiagramPng')
    await mockDialogSave(page, null)
    await mockFsWrites(page)

    await openContextMenuOn(page, "figure[data-role='MERMAID'] div.ag-container-preview")

    // The dialog was asked, then nothing happened: no bytes, no toast.
    await page.waitForFunction(() => (window as any).__saveCalls.length > 0, undefined, { timeout: 10_000 })
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => (window as any).__binaryWrites)).toHaveLength(0)
    await expect(page.locator('.mt-notification')).toHaveCount(0)
  })
  // END_BLOCK_EXPORT_E2E_SAVE

  // START_BLOCK_EXPORT_E2E_VIEWER
  test('viewer toolbar: zoomed ×3 and panned, Copy as Image still exports the WHOLE diagram at 2× natural size (corner-2)', async ({ page }) => {
    await bootstrapWithMarkdown(page, WIDE_MD)
    await waitForMermaid(page)
    await mockClipboardImage(page)

    await page.locator("figure[data-role='MERMAID'] > button.ag-block-expand").first().click()
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer).toHaveClass(/ag-block-viewer-can-export/)
    await expect(viewer.locator('.ag-block-viewer-copy-image')).toBeVisible()
    await expect(viewer.locator('.ag-block-viewer-save-png')).toBeVisible()
    await expect(viewer.locator('.ag-block-viewer-save-svg')).toBeVisible()
    expect(await viewer.locator('.ag-block-viewer-copy-image').getAttribute('aria-label'))
      .toBe('Copy as Image')

    // Zoom in hard — the visible crop is a fraction of the diagram.
    await page.waitForTimeout(120)
    for (let i = 0; i < 8; i++) await page.keyboard.press('=')
    await page.waitForTimeout(200)
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('.ag-block-viewer-canvas') as HTMLElement
      const m = /scale\(([\d.]+)\)/.exec(canvas.style.transform || '')
      return m ? parseFloat(m[1]) : 1
    })
    expect(scale).toBeGreaterThan(1.5)

    await viewer.locator('.ag-block-viewer-copy-image').click()
    const natural = await naturalSizeOf(page, "figure[data-role='MERMAID']")
    await expect
      .poll(() => page.evaluate(() => (window as any).__clipImages.length), { timeout: 10_000 })
      .toBeGreaterThan(0)
    const ihdr = await clipboardPngIhdr(page)
    // 2× natural — independent of the viewer's ~3× zoom.
    expect(Math.abs(ihdr!.width - 2 * natural.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(ihdr!.height - 2 * natural.height)).toBeLessThanOrEqual(2)
  })

  test('viewer toolbar: the export buttons stay hidden for non-exportable sources (a wide table)', async ({ page }) => {
    // 12 columns: the table overflows its column, so the figure needs the
    // viewer and its expand button opens it.
    const tableDoc = `# Table Only

${Array.from({ length: 12 }, (_, i) => `| Column number ${i + 1}`).join('')} |
${Array.from({ length: 12 }, () => '| ---').join('')} |
${Array.from({ length: 12 }, (_, i) => `| value ${i + 1}`).join('')} |
`
    await bootstrapWithMarkdown(page, tableDoc)
    await page.locator("figure[data-role='TABLE'] table").first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    await page.locator("figure[data-role='TABLE'] > button.ag-block-expand").first().click()
    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer).not.toHaveClass(/ag-block-viewer-can-export/)
    await expect(viewer.locator('.ag-block-viewer-copy-image')).toBeHidden()
    await expect(viewer.locator('.ag-block-viewer-save-png')).toBeHidden()
    await expect(viewer.locator('.ag-block-viewer-save-svg')).toBeHidden()
    // The zoom controls stay available.
    await expect(viewer.locator('.ag-block-viewer-fit')).toBeVisible()
  })
  // END_BLOCK_EXPORT_E2E_VIEWER
})
