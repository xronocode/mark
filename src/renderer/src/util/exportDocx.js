// FILE: src/renderer/src/util/exportDocx.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-066 — turn the styled export HTML into a .docx buffer: a data-only pre-pass (strip pre.front-matter, adapt muya's footnote markup to the shape docx/html recognizes, replace exportable figures with rasterized PNG images), then a lazy docx/docx-html conversion in named Word styles with the remembered print geometry.
//   SCOPE: resolveGeometryMm / mmToTwips (pure mapping, mirrors m052_print.rs), preprocessExportHtml (pure DOM transform + injectable figure rasterizer), defaultRasterizeFigure (canvas via diagramExport), buildDocx (lazy import, sync conversion), exportToDocx (composition).
//   DEPENDS: DOM (jsdom in tests); muya/lib/utils/diagramExport (EXPORTABLE_FIGURE_SELECTOR, diagramExportSvg, buildStandaloneSvg, rasterizeSvg, nearestHeadingText — main-bundle muya code); docx + docx/html via dynamic import ONLY (check-export-chunk guard pins this).
//   LINKS: .grace/graph/features.xml M-066; .grace/verification/features.xml V-M-066; .grace/changes/active/C-NATIVE-DOCX-RTF-EXPORT (R-3, R-4, R-5); util/exportImages.js M-065 runs BEFORE this, in the caller.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   resolveGeometryMm - print options -> { widthMm, heightMm, landscape, margins }.
//   mmToTwips - millimetres -> OOXML twips (1440/inch).
//   preprocessExportHtml - DOM pre-pass: front-matter strip, footnote shape adaptation, figure->PNG.
//   defaultRasterizeFigure - figure element -> PNG data URL (2x, C-56 machinery) or null.
//   buildDocx - preprocessed HTML + print options -> .docx bytes (lazy docx import inside).
//   exportToDocx - composition used by the store export branch.
// END_MODULE_MAP

import {
  EXPORTABLE_FIGURE_SELECTOR,
  diagramExportSvg,
  buildStandaloneSvg,
  rasterizeSvg,
  nearestHeadingText
} from 'muya/lib/utils/diagramExport'

// START_BLOCK_GEOMETRY_MM
// Mirrors m052_print.rs named_page_size_mm (portrait); "custom" (and a
// missing name) uses the explicit pair, falling back to A4.
const NAMED_SIZE_MM = Object.freeze({
  a3: [297.0, 420.0],
  a4: [210.0, 297.0],
  a5: [148.0, 210.0],
  legal: [215.9, 355.6],
  letter: [215.9, 279.4],
  tabloid: [279.4, 431.8]
})

export function resolveGeometryMm (printOptions = {}) {
  const named = NAMED_SIZE_MM[String(printOptions.pageSize || '').trim().toLowerCase()]
  let widthMm
  let heightMm
  if (named) {
    ;[widthMm, heightMm] = named
  } else {
    widthMm = Number.isFinite(printOptions.pageSizeWidth) ? printOptions.pageSizeWidth : 210.0
    heightMm = Number.isFinite(printOptions.pageSizeHeight) ? printOptions.pageSizeHeight : 297.0
  }
  const margins = {
    top: Number.isFinite(printOptions.pageMarginTop) ? printOptions.pageMarginTop : 20.0,
    right: Number.isFinite(printOptions.pageMarginRight) ? printOptions.pageMarginRight : 15.0,
    bottom: Number.isFinite(printOptions.pageMarginBottom) ? printOptions.pageMarginBottom : 20.0,
    left: Number.isFinite(printOptions.pageMarginLeft) ? printOptions.pageMarginLeft : 15.0
  }
  return { widthMm, heightMm, landscape: printOptions.isLandscape === true, margins }
}

export function mmToTwips (mm) {
  return Math.round((mm * 1440) / 25.4)
}
// END_BLOCK_GEOMETRY_MM

// START_BLOCK_PREPASS
// Data-only transforms on muya's own export HTML (nothing here re-parses
// markdown and nothing touches the generator):
// 1. pre.front-matter is authoring metadata — removed from the body.
// 2. muya renders footnotes with class/role attributes; docx/html recognizes
//    the remark-rehype data-* shape (bake-off verified), so the adaptation
//    only adds data attributes — ids, hrefs and backlinks already exist.
// 3. Exportable figures (pele / vega-lite) become rasterized 2x PNG images
//    in document order; a figure that fails to raster keeps its SVG markup
//    (graceful degradation, counted by the caller if ever needed).
export async function preprocessExportHtml (html, { rasterizeFigure = defaultRasterizeFigure } = {}) {
  const template = document.createElement('template')
  template.innerHTML = html

  for (const el of template.content.querySelectorAll('pre.front-matter')) {
    el.remove()
  }

  for (const el of template.content.querySelectorAll('a.footnote-ref')) {
    el.setAttribute('data-footnote-ref', '')
  }
  for (const el of template.content.querySelectorAll('a.footnote-back')) {
    el.setAttribute('data-footnote-backref', '')
  }
  for (const el of template.content.querySelectorAll('section.footnotes')) {
    el.setAttribute('data-footnotes', '')
  }

  for (const figure of template.content.querySelectorAll(EXPORTABLE_FIGURE_SELECTOR)) {
    const dataUrl = await rasterizeFigure(figure)
    if (!dataUrl) continue
    const img = document.createElement('img')
    img.setAttribute('src', dataUrl)
    img.setAttribute('alt', nearestHeadingText(figure) || 'figure')
    figure.replaceChildren(img)
  }

  return template.innerHTML
}
// END_BLOCK_PREPASS

export async function defaultRasterizeFigure (figure) {
  const svg = diagramExportSvg(figure)
  if (!svg) return null
  try {
    const standalone = buildStandaloneSvg(svg, {})
    const { bytes } = await rasterizeSvg(standalone, { scale: 2 })
    let binary = ''
    for (const byte of new Uint8Array(bytes)) {
      binary += String.fromCharCode(byte)
    }
    return `data:image/png;base64,${window.btoa(binary)}`
  } catch (_) {
    return null
  }
}

// START_BLOCK_BUILD_DOCX
// The docx libraries load ONLY here, behind a dynamic import, so the entry
// chunk never carries them and the check-export-chunk guard holds. The
// importer writes in the document's own named styles (Heading 1-6, List
// Paragraph, Hyperlink) by default; geometry rides sectPr from the same
// remembered print options the PDF and print paths use.
export async function buildDocx (preprocessedHtml, printOptions = {}) {
  const [{ Document, Packer }, { htmlToContent }] = await Promise.all([
    import('docx'),
    import('docx/html')
  ])

  const children = htmlToContent(preprocessedHtml)
  const { widthMm, heightMm, landscape, margins } = resolveGeometryMm(printOptions)
  const wTwips = mmToTwips(widthMm)
  const hTwips = mmToTwips(heightMm)

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          // Portrait millimetre inputs + the orientation flag: the docx
          // library performs the landscape swap itself (verified: passing
          // pre-swapped dimensions makes it swap back).
          size: landscape
            ? { width: wTwips, height: hTwips, orientation: 'landscape' }
            : { width: wTwips, height: hTwips },
          margin: {
            top: mmToTwips(margins.top),
            right: mmToTwips(margins.right),
            bottom: mmToTwips(margins.bottom),
            left: mmToTwips(margins.left)
          }
        }
      },
      children
    }]
  })

  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}
// END_BLOCK_BUILD_DOCX

export async function exportToDocx ({ html, printOptions }) {
  const preprocessed = await preprocessExportHtml(html)
  return buildDocx(preprocessed, printOptions)
}
