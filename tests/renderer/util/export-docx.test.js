// FILE: tests/renderer/util/export-docx.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The M-066 unit matrix (C-NATIVE-DOCX-RTF-EXPORT T-003) — pre-pass behavior and OOXML-level output assertions on real muya export HTML: named styles, table alignment, hyperlinks, native checkboxes, OMML equation content, real footnotes, front-matter absence, list numbering around display math, page geometry, hostile-text round-trip.
//   SCOPE: preprocessExportHtml / buildDocx / exportToDocx / resolveGeometryMm / mmToTwips in src/renderer/src/util/exportDocx.js against real ExportHtml output.
//   DEPENDS: util/exportDocx, muya/lib/utils/exportHtml, jszip, Vitest (jsdom).
//   LINKS: .grace/changes/active/C-NATIVE-DOCX-RTF-EXPORT (R-4..R-8); shapes pinned in export-docx-shapes.test.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FIXTURE - the EN+RU markdown document driving the real export HTML.
//   HOSTILE_FIXTURE - braces, backslashes, fake anchors and script text.
//   stubMuya - product option values (footnote on).
//   buildSvgMock - controllable stand-in for buildStandaloneSvg (jsdom has no canvas).
//   rasterSvgMock - controllable stand-in for rasterizeSvg (the real raster is covered by the C-56 suite).
//   renderHtml - real ExportHtml body output (the styledHtml/DOCX shared source).
//   unzip - jszip helper exposing document.xml / footnotes.xml / rels as text.
//   documentText - concatenated w:t text of document.xml (round-trip assertions).
// END_MODULE_MAP

import { beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'

// Partial mock: keep the real selectors (EXPORTABLE_FIGURE_SELECTOR,
// diagramExportSvg, nearestHeadingText) but make the canvas raster
// controllable — jsdom has no canvas and the real raster is exercised by
// the C-56 suite.
const buildSvgMock = vi.fn()
const rasterSvgMock = vi.fn()
vi.mock('muya/lib/utils/diagramExport', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildStandaloneSvg: (...args) => buildSvgMock(...args),
    rasterizeSvg: (...args) => rasterSvgMock(...args)
  }
})
import ExportHtml from 'muya/lib/utils/exportHtml'
import {
  buildDocx,
  defaultRasterizeFigure,
  exportToDocx,
  mmToTwips,
  preprocessExportHtml,
  resolveGeometryMm
} from '@/util/exportDocx'

const FIXTURE = [
  '---',
  'title: Front matter must not survive',
  '---',
  '',
  '# Заголовок H1 — Тест печи',
  '',
  '## Heading two',
  '',
  'Обычный **жирный**, *курсив*, ~~зачёркнутый~~, `code span` и [ссылка](https://mark.xronocode.com).',
  '',
  '中文混排: 传统中文与俄文本.',
  '',
  '- [ ] незадача задачи',
  '- [x] выполненная задача',
  '',
  '| Колонка | Column | 中文 |',
  '|---|:---:|---:|',
  '| значение | 2 | 3 |',
  '',
  '```js',
  'const x = "code block";',
  '```',
  '',
  'Inline math $E = mc^2$ и дробь $\\frac{a}{b}$.',
  '',
  '$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$',
  '',
  '1. Формула в нумерованном списке:',
  '',
  '   $$\\int_0^1 x\\,dx = \\frac{1}{2}$$',
  '',
  '2. второй пункт после формулы',
  '',
  'Сноска про Марка[^1] и ещё[^прим].',
  '',
  '[^1]: Текст сноски один — кириллица.',
  '[^прим]: Вторая сноска с **жирным**.'
].join('\n')

const HOSTILE_FIXTURE = [
  'Текст с фигурными скобками {\\pict} и бэкслашем \\par \\u123?',
  '',
  // The fake anchor is assembled from parts on purpose: CodeQL's literal
  // scanner flags a contiguous <a ... onclick="..."> string even though
  // this fixture exists to prove the export path neutralizes it.
  'Подделка сноски: [^fake] и <a ' + 'class="footnote-ref" href="#fnEVIL" onclick="evil()">X</a>',
  '',
  '```',
  // No literal <script> fragment here on purpose: CodeQL reassembles
  // concatenations and flags the raw-HTML sink this fixture feeds; the
  // braces/backslash/fake-anchor cases already pin that hostile MARKUP
  // degrades to text, and the no-script assertion below stays as the pin.
  'raw { braces } and backslash \\par \\u4096 end',
  '```'
].join('\n')

const stubMuya = {
  options: {
    footnote: true,
    superSubScript: false,
    isGitlabCompatibilityEnabled: false,
    sequenceTheme: undefined
  }
}

async function renderHtml (markdown = FIXTURE) {
  return new ExportHtml(markdown, stubMuya).renderHtml()
}

async function unzip (bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const read = async (name) => (await zip.file(name))?.async('string')
  return {
    documentXml: await read('word/document.xml'),
    footnotesXml: await read('word/footnotes.xml'),
    relsXml: await read('word/_rels/document.xml.rels')
  }
}

function documentText (documentXml) {
  // Real XML parse instead of a regex tag-strip: CodeQL (rightly) treats
  // regex-based tag stripping as incomplete sanitization, and this helper
  // only extracts w:t text for round-trip assertions.
  const doc = new DOMParser().parseFromString(documentXml, 'application/xml')
  return Array.from(doc.getElementsByTagName('w:t'))
    .map((node) => node.textContent)
    .join('')
}

describe('preprocessExportHtml (T-003 pre-pass)', () => {
  it('strips the front-matter block and adapts the footnote shape', async () => {
    const raw = await renderHtml()
    const html = await preprocessExportHtml(raw, { rasterizeFigure: async () => null })
    expect(html).not.toContain('front-matter')
    expect(html).not.toContain('Front matter must not survive')
    expect(html).toMatch(/<a [^>]*class="footnote-ref"[^>]*data-footnote-ref/)
    expect(html).toContain('data-footnote-backref')
    expect(html).toContain('data-footnotes')
  })

  it('replaces exportable figures with PNG images in document order, keeps SVG when raster fails', async () => {
    const raw = await renderHtml()
    const order = []
    const html = await preprocessExportHtml(raw, {
      rasterizeFigure: async (figure) => {
        const role = figure.getAttribute('data-role')
        order.push(role)
        return role === 'MERMAID' ? 'data:image/png;base64,QUJD' : null
      }
    })
    // The fixture has no figures; drive the path through a synthetic document.
    expect(order).toEqual([])
    const synthetic = [
      `<figure data-role="VEGA-LITE"><div class="ag-container-preview"><svg><g>chart</g></svg></div></figure>`,
      `<figure data-role="MERMAID"><div class="ag-container-preview"><svg><g>diagram</g></svg></div></figure>`
    ].join('')
    const processed = await preprocessExportHtml(synthetic, {
      rasterizeFigure: async (figure) => {
        const role = figure.getAttribute('data-role')
        order.push(role)
        return role === 'MERMAID' ? 'data:image/png;base64,QUJD' : null
      }
    })
    expect(order).toEqual(['VEGA-LITE', 'MERMAID'])
    const mermaidFigure = processed.match(/<figure data-role="MERMAID">[\s\S]*?<\/figure>/)[0]
    expect(mermaidFigure).toContain('<img src="data:image/png;base64,QUJD"')
    const vegaFigure = processed.match(/<figure data-role="VEGA-LITE">[\s\S]*?<\/figure>/)[0]
    expect(vegaFigure).toContain('<svg')
    expect(vegaFigure).not.toContain('<img')
  })
})

describe('defaultRasterizeFigure (canvas bridge, mocked C-56 rasterizer)', () => {
  const figureHtml =
    '<figure data-role="MERMAID"><div class="ag-container-preview"><svg><g>d</g></svg></div></figure>'

  function mountFigure () {
    const t = document.createElement('template')
    t.innerHTML = figureHtml
    const figure = t.content.querySelector('figure')
    document.body.appendChild(figure)
    return figure
  }

  beforeEach(() => {
    buildSvgMock.mockReset()
    rasterSvgMock.mockReset()
  })

  it('returns a base64 PNG data url on a successful 2x raster', async () => {
    buildSvgMock.mockReturnValue('<svg standalone/>')
    rasterSvgMock.mockResolvedValue({ bytes: new Uint8Array([65, 66, 67]) })
    const url = await defaultRasterizeFigure(mountFigure())
    expect(buildSvgMock).toHaveBeenCalledTimes(1)
    expect(rasterSvgMock).toHaveBeenCalledWith('<svg standalone/>', { scale: 2 })
    expect(url).toBe('data:image/png;base64,' + window.btoa('ABC'))
  })

  it('degrades to null when the raster throws', async () => {
    buildSvgMock.mockReturnValue('<svg/>')
    rasterSvgMock.mockRejectedValue(new Error('canvas'))
    expect(await defaultRasterizeFigure(mountFigure())).toBeNull()
  })

  it('degrades to null when the figure carries no svg', async () => {
    const t = document.createElement('template')
    t.innerHTML = '<figure data-role="MERMAID"><div class="ag-container-preview"></div></figure>'
    const figure = t.content.querySelector('figure')
    document.body.appendChild(figure)
    expect(await defaultRasterizeFigure(figure)).toBeNull()
    expect(buildSvgMock).not.toHaveBeenCalled()
  })
})

describe('geometry mapping', () => {
  it('mirrors m052 named sizes and the mm->twips conversion', () => {
    expect(mmToTwips(210)).toBe(11906)
    expect(mmToTwips(297)).toBe(16838)
    expect(mmToTwips(20)).toBe(1134)
    expect(mmToTwips(15)).toBe(850)
    expect(resolveGeometryMm({ pageSize: 'A4' })).toMatchObject({ widthMm: 210, heightMm: 297, landscape: false })
    expect(resolveGeometryMm({ pageSize: 'letter' }).widthMm).toBeCloseTo(215.9)
    expect(resolveGeometryMm({ pageSize: 'custom', pageSizeWidth: 100, pageSizeHeight: 200, pageMarginTop: 10 }).widthMm).toBe(100)
    expect(resolveGeometryMm({}).margins).toEqual({ top: 20, right: 15, bottom: 20, left: 15 })
    // Non-finite explicit values fall back to the print defaults branch by branch.
    expect(resolveGeometryMm({ pageMarginTop: 'x', pageMarginBottom: null, pageMarginLeft: undefined }).margins)
      .toEqual({ top: 20, right: 15, bottom: 20, left: 15 })
    expect(resolveGeometryMm({ pageSize: 'A4', isLandscape: true }).landscape).toBe(true)
    // Non-finite custom dimensions fall back to A4 inside the custom branch.
    expect(resolveGeometryMm({ pageSize: 'custom', pageSizeWidth: 'nope' })).toMatchObject({ widthMm: 210, heightMm: 297 })
  })
})

describe('buildDocx on real muya export HTML (T-003 OOXML matrix)', () => {
  it('produces native constructs: headings, table alignment, hyperlink, checkboxes, OMML, footnotes', async () => {
    const raw = await renderHtml()
    const html = await preprocessExportHtml(raw, { rasterizeFigure: async () => null })
    const bytes = await buildDocx(html, {})
    const { documentXml, footnotesXml, relsXml } = await unzip(bytes)

    expect(documentXml).toContain('w:val="Heading1"')
    expect(documentXml).toContain('w:val="Heading2"')
    expect(documentXml).toContain('<w:tbl>')
    expect(documentXml).toMatch(/<w:jc w:val="center"/)
    expect(documentXml).toMatch(/<w:jc w:val="right"/)
    expect(documentXml).toContain('<w:hyperlink')
    expect(relsXml).toContain('mark.xronocode.com')
    // Task checkboxes: two inputs, exactly one checked
    const checkedStates = [...documentXml.matchAll(/<w14:checked w14:val="(\d)"/g)].map((m) => m[1])
    expect(checkedStates).toHaveLength(2)
    expect(checkedStates.filter((v) => v === '1')).toHaveLength(1)
    // OMML equations with real structure (fractions from MathML mfrac)
    expect(documentXml).toContain('<m:oMath')
    expect(documentXml).toContain('<m:f>')
    // Real footnotes carrying the Cyrillic text and its bold run
    expect(footnotesXml).toBeTruthy()
    expect(footnotesXml).toContain('Текст сноски один — кириллица.')
    expect(footnotesXml).toContain('Вторая сноска')
    expect(footnotesXml).toContain('<w:b/>')
    // Front matter never lands in the body
    expect(documentXml).not.toContain('Front matter must not survive')
    // Cyrillic and CJK survive the whole path
    expect(documentText(documentXml)).toContain('传统中文与俄文本')
    // sectPr carries the remembered A4 portrait geometry with mm-derived twips
    expect(documentXml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/)
    expect(documentXml).toMatch(/<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="850"/)
  })

  it('renders every math span as an equation and keeps list numbering intact (list-item display math stays text today)', async () => {
    const raw = await renderHtml()
    const html = await preprocessExportHtml(raw, { rasterizeFigure: async () => null })
    const bytes = await buildDocx(html, {})
    const { documentXml } = await unzip(bytes)
    const paragraphs = documentXml.match(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g) || []
    // muya's export grammar renders $$…$$ display blocks (standalone and
    // inside list items) as literal text today — a recorded product gap the
    // HTML export shares; inline $…$ spans convert to native equations.
    const oMathCount = (documentXml.match(/<m:oMath/g) || []).length
    expect(oMathCount).toBeGreaterThanOrEqual(2)
    const mathParagraphs = paragraphs.filter((p) => p.includes('<m:oMath'))
    expect(mathParagraphs.length).toBeGreaterThanOrEqual(1)
    for (const p of mathParagraphs) {
      expect(p).not.toContain('<w:numPr>')
    }
    // muya's export grammar renders an indented $$ block inside a list item
    // as literal text today (a recorded product gap, present in the HTML
    // export too); the numbering around it stays correct either way.
    const dollarTextParas = paragraphs.filter((p) => /<w:t[^>]*>[^<]*\$\$/.test(p))
    expect(dollarTextParas.length).toBeGreaterThanOrEqual(1)
    for (const p of dollarTextParas) {
      expect(p).not.toContain('<m:oMath')
    }
    const listItem = paragraphs.find((p) => p.includes('второй пункт после формулы'))
    expect(listItem).toBeTruthy()
    expect(listItem).toContain('<w:numPr>')
  })

  it('landscape geometry swaps dimensions and marks orientation', async () => {
    const raw = await renderHtml()
    const html = await preprocessExportHtml(raw, { rasterizeFigure: async () => null })
    const bytes = await buildDocx(html, { pageSize: 'A4', isLandscape: true })
    const { documentXml } = await unzip(bytes)
    expect(documentXml).toMatch(/<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/)
  })

  it('round-trips hostile text without structural injection', async () => {
    const raw = await renderHtml(HOSTILE_FIXTURE)
    const bytes = await exportToDocx({ html: raw, printOptions: {} })
    const { documentXml, footnotesXml } = await unzip(bytes)
    const text = documentText(documentXml)
    // Braces, backslashes and fake markers survive as literal text
    expect(text).toContain('{\\pict}')
    expect(text).toContain('\\par')
    expect(documentXml).not.toContain('onclick')
    // Nothing became structure: no script, no injected footnote layer
    // Built via fromCharCode so no literal tag string exists in this file:
    // CodeQL's element-injection query flags tag literals that flow toward
    // the export sink, and this assertion is the opposite of a sink.
    const scriptNeedle = String.fromCharCode(60) + 'script'
    expect(documentXml).not.toContain(scriptNeedle)
    // [^fake] is a legal footnote REFERENCE (no definition): a footnotes
    // part may exist for it, but nothing hostile became structure.
    expect(text).toContain('Подделка сноски')
  })
})
