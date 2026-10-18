// FILE: tests/renderer/muya/diagram-export.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-56 per-block picture exporter (muya utils/diagramExport.js) — standalone-SVG self-containment (zero var(--pele-* survivors, theme panel background rect on/off, natural size from data-natural-width/viewBox, editor chrome and unsafe markup stripped), the 2× PNG rasterizer (canvas draw + PNG bytes), the heading-slug file-name suggestion with the document-name fallback (unicode headings slug to Cyrillic, corner-6), and the exportable-role block resolution (MERMAID/VEGA-LITE only, corner-3/4).
//   SCOPE: src/muya/lib/utils/diagramExport.js against jsdom with injectable tokens/canvas/image doubles (buildStandaloneSvg and rasterizeSvg are dependency-injected the same way the pele pipeline is).
//   DEPENDS: vitest + jsdom; muya/lib/utils/diagramExport; muya diagramTheme buildPeleVariables for the composed variable map.
//   LINKS: .grace/changes/active/C-56 R-1/R-2/R-4, T-001 (corners 1, 4, 6); .grace/verification/runtime.xml V-M-012 scenario-63; e2e twin tests/e2e/diagram-export.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DARK_TOKENS - dark theme token fixture.
//   PREVIEW_WITH_SVG - preview fixture with an svg.
//   makeFakeImage - Image double with decode().
//   makeFigure - figure fixture builder.
//   LIGHT_TOKENS / DARK_TOKENS - readActiveThemeTokens-shaped token sets (the same shape pele-pipeline.test.js pins); DARK exercises the Ink corner-1 colours.
//   makePeleSvg - pele-shaped live SVG double: var(--pele-*) root chain, data-natural-width, 100% width, zoom max-width, donut var fill, plus hostile script/onclick/javascript: probes.
//   makeVegaSvg - vega-shaped double (px width/height + viewBox, no data-natural-width, baked concrete colours).
//   makeEditorDom - editor-root fixture (headings, paragraphs, exportable and non-exportable figures) for nearestHeadingText and block resolution.
//   PNG_BYTES_452x150 - minimal PNG-shaped buffer whose IHDR says 452×150 (2× of the 226×75 rasterize fixture).
//   makeFakeCanvas / makeFakeImage - rasterizer doubles (drawImage spy + instant PNG toBlob; decode-only image).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-56 T-001: first version.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import {
  EXPORTABLE_FIGURE_SELECTOR,
  buildStandaloneSvg,
  diagramExportSvg,
  nearestHeadingText,
  pngIhdrSize,
  rasterizeSvg,
  resolveDiagramExportFigure,
  slugifyName,
  suggestFileName
} from 'muya/lib/utils/diagramExport'
import { buildPeleVariables } from 'muya/lib/parser/render/diagramTheme'

// START_BLOCK_EXPORT_TEST_DOUBLES
const LIGHT_TOKENS = {
  dark: false,
  accent: '#9A6F00',
  bg: '#FBF8F2',
  surface: '#FFFDF8',
  text: '#22252B',
  muted: '#6B655A',
  border: '#D9D0BB',
  line: '#8F8775',
  code: '#F2ECE1',
  font: '-apple-system, system-ui, sans-serif'
}

// Ink-shaped dark tokens (corner-1): the panel is dark, the text light.
// The font is quote-free here; quoted font stacks get a dedicated
// XML-escaping case below.
const DARK_TOKENS = {
  dark: true,
  accent: '#FFCF1A',
  bg: '#17191E',
  surface: '#1F2228',
  text: '#ECE6DA',
  muted: '#A39C8E',
  border: '#3A3E48',
  line: '#8A8F9C',
  code: '#21242B',
  font: 'Georgia, serif'
}

// A pele-shaped rendered SVG as the pipeline leaves it in the live DOM:
// root style carries the --_x:var(--pele-x,fallback) chain, width is 100%
// with the C-49 zoomable max-width, data-natural-width carries the natural
// width; hostile markup probes ride along (script, onclick,
// javascript: href) and must not survive the export.
const makePeleSvg = () => {
  const host = document.createElement('div')
  host.innerHTML = `<svg id="pele-fixture-1" class="pele pele-flowchart" width="100%" height="auto" data-natural-width="700" viewBox="0 0 700 200" style="--_bg:var(--pele-bg,#ffffff);--_fg:var(--pele-fg,#111111);--_font:var(--pele-font,sans-serif);max-width:calc(var(--mark-zoom, 1) * 700px)"><g class="pele-node"><rect style="fill:var(--_bg);stroke:var(--pele-border,#dddddd)"></rect><text style="fill:var(--_fg);font-family:var(--_font)">node</text></g><circle class="pieDonutHole" fill="var(--pele-bg)"></circle><script>alert(1)</script><a href="javascript:alert(2)"><text onclick="alert(3)">label</text></a></svg>`
  return host.querySelector('svg')
}

// A vega-shaped SVG: px width/height + viewBox, colours already concrete
// (the embed bakes the theme config), no pele attributes at all.
const makeVegaSvg = () => {
  const host = document.createElement('div')
  host.innerHTML = `<svg width="400" height="300" viewBox="0 0 400 300"><g class="mark-rect"><path fill="#9a6f00" d="M0 0h40v300z"></path></g><text fill="#22252b" font-family="Helvetica">A</text></svg>`
  return host.querySelector('svg')
}

const makeFigure = (role, inner) => {
  const host = document.createElement('div')
  host.innerHTML = `<figure data-role="${role}" id="fig-${role}">${inner}</figure>`
  return host.querySelector('figure')
}

const PREVIEW_WITH_SVG =
  '<div id="preview-x" class="ag-container-preview ag-pele-preview"><svg viewBox="0 0 100 40" width="100" height="40"><g></g></svg></div>'

const makeEditorDom = () => {
  const host = document.createElement('div')
  host.innerHTML = `<div id="ag-editor-id">
    <h2 id="h-setup">Setup</h2>
    <p id="p-1">text</p>
    <figure data-role="MERMAID" id="fig-m">${PREVIEW_WITH_SVG}</figure>
    <blockquote id="quote"><h3 id="h-quote">Quoted section</h3><p>inside</p></blockquote>
    <figure data-role="MERMAID" id="fig-m2">${PREVIEW_WITH_SVG}</figure>
    <h2 id="h-after">Later heading</h2>
    <figure data-role="VEGA-LITE" id="fig-v">${PREVIEW_WITH_SVG}</figure>
    <figure data-role="FLOWCHART" id="fig-f">${PREVIEW_WITH_SVG}</figure>
    <figure data-role="TABLE" id="fig-t"><table class="ag-paragraph"><tr><td>cell</td></tr></table></figure>
    <figure data-role="MULTIPLEMATH" id="fig-x"><div class="ag-container-preview"><svg viewBox="0 0 10 10"></svg></div></figure>
    <figure data-role="MERMAID" id="fig-empty"><div class="ag-container-preview"></div></figure>
  </div>`
  return host.querySelector('#ag-editor-id')
}
// END_BLOCK_EXPORT_TEST_DOUBLES

// START_BLOCK_STANDALONE_TESTS
describe('C-56 diagramExport.buildStandaloneSvg', () => {
  it('resolves every var(--pele-*) into the dark theme values and paints the panel background rect (corner-1)', () => {
    const vars = buildPeleVariables(DARK_TOKENS)
    const out = buildStandaloneSvg(makePeleSvg(), {
      themeTokens: DARK_TOKENS,
      peleVariables: vars
    })
    expect(out).toBeTruthy()
    expect(out).not.toContain('var(--pele-')
    // The panel background rect is the first child and carries the theme
    // code-panel colour (buildPeleVariables maps --pele-bg ← panel ← code).
    expect(out).toContain('<rect class="ag-export-background"')
    expect(new RegExp(`<rect class="ag-export-background"[^>]*fill="${DARK_TOKENS.code}"`).test(out)).toBe(true)
    // The root --_x chain resolves into concrete dark values…
    expect(out).toContain(`--_fg:${DARK_TOKENS.text}`)
    expect(out).toContain(`--_font:${DARK_TOKENS.font}`)
    // …and the no-fallback donut fill resolves through the same map.
    expect(out).toMatch(new RegExp(`fill="${DARK_TOKENS.code}"`))
  })

  it('XML-escapes resolved values — a quoted font stack cannot break the serialization', () => {
    const QUOTED_FONT = 'Georgia, "Times New Roman", serif'
    const out = buildStandaloneSvg(makePeleSvg(), {
      themeTokens: DARK_TOKENS,
      peleVariables: { ...buildPeleVariables(DARK_TOKENS), '--pele-font': QUOTED_FONT }
    })
    expect(out).toContain('--_font:Georgia, &quot;Times New Roman&quot;, serif')
  })

  it('exports the natural size from data-natural-width and strips the zoom/viewer inline sizing', () => {
    const out = buildStandaloneSvg(makePeleSvg(), { themeTokens: DARK_TOKENS })
    expect(out).toContain('width="700"')
    expect(out).toContain('height="200"')
    expect(out).toContain('viewBox="0 0 700 200"')
    // The C-49 zoomable max-width and the width=100% never travel.
    expect(out).not.toContain('max-width')
    expect(out).not.toContain('--mark-zoom')
    expect(out).not.toContain('width="100%"')
    // Root id dropped (id collision hygiene when embedded), inner ids kept.
    expect(out).not.toContain('pele-fixture-1')
    expect(out).not.toContain('data-natural-width')
  })

  it('declares the theme font on the root when the svg carries none', () => {
    const out = buildStandaloneSvg(makeVegaSvg(), { themeTokens: LIGHT_TOKENS })
    expect(out).toContain(`font-family="${LIGHT_TOKENS.font}"`)
  })

  it('strips script elements, on* handlers and javascript: hrefs', () => {
    const out = buildStandaloneSvg(makePeleSvg(), { themeTokens: LIGHT_TOKENS })
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('alert(')
  })

  it('background: false exports transparent — no background rect (R-1 option)', () => {
    const out = buildStandaloneSvg(makePeleSvg(), {
      themeTokens: LIGHT_TOKENS,
      background: false
    })
    expect(out).not.toContain('ag-export-background')
  })

  it('keeps concrete vega colours and derives the size from the px width + viewBox', () => {
    const out = buildStandaloneSvg(makeVegaSvg(), { themeTokens: LIGHT_TOKENS })
    expect(out).toContain('fill="#9a6f00"')
    expect(out).toContain('width="400"')
    expect(out).toContain('height="300"')
    expect(out).toContain('viewBox="0 0 400 300"')
  })

  it('returns null for an svg with no derivable size (never-rendered block, corner-4)', () => {
    const host = document.createElement('div')
    host.innerHTML = '<svg><g></g></svg>'
    expect(buildStandaloneSvg(host.querySelector('svg'), {
      themeTokens: LIGHT_TOKENS
    })).toBeNull()
    expect(buildStandaloneSvg(null, { themeTokens: LIGHT_TOKENS })).toBeNull()
  })
})
// END_BLOCK_STANDALONE_TESTS

// START_BLOCK_RASTERIZE_TESTS
// Minimal PNG-shaped buffer: IHDR width/height at byte offsets 16..23 say
// 452×150 — exactly 2× the 226×75 fixture below.
const PNG_BYTES_452x150 = (() => {
  const bytes = new Uint8Array(32)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  new DataView(bytes.buffer).setUint32(16, 452)
  new DataView(bytes.buffer).setUint32(20, 150)
  return bytes
})()

const makeFakeCanvas = () => {
  const drawImage = vi.fn()
  return {
    drawImage,
    canvas: {
      getContext: () => ({ drawImage }),
      // Blob-like: rasterizeSvg only awaits blob.arrayBuffer().
      toBlob: (cb) => cb({ arrayBuffer: async () => PNG_BYTES_452x150.buffer })
    }
  }
}

const makeFakeImage = () => ({ src: '', decode: vi.fn(async () => {}) })

describe('C-56 diagramExport.rasterizeSvg', () => {
  const SVG_226x75 =
    '<svg xmlns="http://www.w3.org/2000/svg" width="226" height="75" viewBox="0 0 226 75"><g></g></svg>'

  it('draws the svg at 2× natural size and returns the PNG bytes', async () => {
    const fake = makeFakeCanvas()
    const img = makeFakeImage()
    const result = await rasterizeSvg(SVG_226x75, {
      createCanvas: () => fake.canvas,
      makeImage: () => img
    })
    expect(result.width).toBe(452)
    expect(result.height).toBe(150)
    expect(result.bytes).toEqual(PNG_BYTES_452x150)
    // drawImage stretched the image to the full 2× canvas.
    expect(fake.drawImage).toHaveBeenCalledWith(img, 0, 0, 452, 150)
    // The image source is a self-contained data: URL of the svg.
    expect(img.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
  })

  it('honours an explicit scale', async () => {
    const fake = makeFakeCanvas()
    const result = await rasterizeSvg(SVG_226x75, {
      scale: 1,
      createCanvas: () => fake.canvas,
      makeImage: () => makeFakeImage()
    })
    expect(result.width).toBe(226)
    expect(result.height).toBe(75)
    expect(fake.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 226, 75)
  })

  it('rejects an svg without a root size', async () => {
    await expect(rasterizeSvg('<svg><g></g></svg>', {
      createCanvas: () => makeFakeCanvas().canvas,
      makeImage: () => makeFakeImage()
    })).rejects.toThrow(/no pixel size/)
  })
})

describe('C-56 diagramExport.pngIhdrSize', () => {
  it('reads the IHDR dimensions of a PNG byte stream', () => {
    expect(pngIhdrSize(PNG_BYTES_452x150)).toEqual({ width: 452, height: 150 })
    expect(pngIhdrSize(new Uint8Array([0, 1, 2]))).toBeNull()
    expect(pngIhdrSize(new Uint8Array(32))).toBeNull() // not a PNG signature
  })
})
// END_BLOCK_RASTERIZE_TESTS

// START_BLOCK_FILENAME_TESTS
describe('C-56 diagramExport.suggestFileName / slugifyName', () => {
  it('slugs the nearest heading (corner-6: ascii)', () => {
    expect(suggestFileName({
      headingText: 'How a Release Moves',
      docName: 'notes.md',
      index: 1,
      ext: 'png'
    })).toBe('how-a-release-moves.png')
  })

  it('keeps unicode letters — a Russian heading slugs to a safe non-empty Cyrillic name (corner-6)', () => {
    expect(slugifyName('Как устроен релиз!')).toBe('как-устроен-релиз')
    expect(suggestFileName({
      headingText: 'Как устроен релиз!',
      docName: 'notes.md',
      ext: 'png'
    })).toBe('как-устроен-релиз.png')
  })

  it('falls back to the document name + diagram index when no heading precedes', () => {
    expect(suggestFileName({ headingText: '', docName: 'My Notes.md', index: 2, ext: 'png' }))
      .toBe('my-notes-diagram-2.png')
    expect(suggestFileName({ headingText: '!!!', docName: '', index: 1, ext: 'svg' }))
      .toBe('diagram-1.svg')
  })

  it('collapses separators, caps length and sanitizes the extension', () => {
    expect(slugifyName('  Multiple   Spaces — and _underscores  ')).toBe('multiple-spaces-and-underscores')
    expect(slugifyName('x'.repeat(100))).toHaveLength(64)
    expect(suggestFileName({ headingText: 'Setup', ext: 'p n g' })).toBe('setup.png')
  })
})

describe('C-56 diagramExport.nearestHeadingText', () => {
  it('finds the nearest preceding heading across siblings and containers', () => {
    const root = makeEditorDom()
    const figure = root.querySelector('#fig-m2')
    // The blockquote's h3 sits between fig-m and fig-m2.
    expect(nearestHeadingText(figure)).toBe('Quoted section')
    expect(nearestHeadingText(root.querySelector('#fig-m'))).toBe('Setup')
    expect(nearestHeadingText(root.querySelector('#fig-v'))).toBe('Later heading')
  })

  it('returns null when no heading precedes the block (inside the editor root)', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div id="ag-editor-id"><p>first</p><figure id="f"></figure></div>'
    expect(nearestHeadingText(host.querySelector('#f'))).toBeNull()
    expect(nearestHeadingText(null)).toBeNull()
  })
})
// END_BLOCK_FILENAME_TESTS

// START_BLOCK_RESOLUTION_TESTS
describe('C-56 diagramExport block resolution', () => {
  it('resolves only MERMAID and VEGA-LITE figures (corner-3: no items elsewhere)', () => {
    const root = makeEditorDom()
    expect(resolveDiagramExportFigure(root.querySelector('#fig-m .ag-container-preview'))).toBe(root.querySelector('#fig-m'))
    expect(resolveDiagramExportFigure(root.querySelector('#fig-v'))).toBe(root.querySelector('#fig-v'))
    expect(resolveDiagramExportFigure(root.querySelector('#fig-f'))).toBeNull()
    expect(resolveDiagramExportFigure(root.querySelector('#fig-t'))).toBeNull()
    expect(resolveDiagramExportFigure(root.querySelector('#fig-x'))).toBeNull()
    expect(resolveDiagramExportFigure(root.querySelector('#p-1'))).toBeNull()
    expect(EXPORTABLE_FIGURE_SELECTOR).toContain("MERMAID")
  })

  it('diagramExportSvg returns the rendered svg — preview div, inner target, or figure — and null for never-rendered blocks (corner-4)', () => {
    const root = makeEditorDom()
    const svg = root.querySelector('#fig-m svg')
    expect(diagramExportSvg(root.querySelector('#fig-m'))).toBe(svg)
    // The block viewer dispatches the LIVE preview div as the element.
    expect(diagramExportSvg(root.querySelector('#fig-m .ag-container-preview'))).toBe(svg)
    expect(diagramExportSvg(svg)).toBe(svg)
    // Non-exportable roles never resolve even with svg content.
    expect(diagramExportSvg(root.querySelector('#fig-x'))).toBeNull()
    // A never-rendered exportable block has no svg — the disabled case.
    expect(diagramExportSvg(root.querySelector('#fig-empty'))).toBeNull()
  })
})
// END_BLOCK_RESOLUTION_TESTS
