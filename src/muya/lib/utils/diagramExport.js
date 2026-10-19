// FILE: src/muya/lib/utils/diagramExport.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Per-block diagram/chart picture export (C-56) — turn a rendered Pele diagram (```mermaid) or Vega-Lite chart (```vega-lite) SVG into a self-contained standalone SVG string (all --pele-* variables resolved from the live theme, theme font declared, theme code-panel background rect, natural size from data-natural-width/viewBox — never the zoomed or viewer-scaled size) and rasterize it to a 2× Retina PNG on a canvas; plus the save-file name suggestion (nearest preceding heading slug, document-name fallback) and, since T-006, the embedded-image copy helpers (source classification local/remote/data:, data-URL decode, PNG magic check, image-bytes → natural-size canvas PNG).
//   SCOPE: pure DOM/string transforms plus canvas rasterizers; SVG sanitization for export (no <script>, no on* handlers, no javascript: hrefs, no editor chrome); block resolution limited to the C-56 exportable roles (MERMAID, VEGA-LITE); injectable theme tokens/variables, canvas, image and object-URL factories for tests. No clipboard, dialog, fetch or fs I/O — the editor host (editor.vue) owns the transports.
//   DEPENDS: ./../parser/render/diagramTheme (readActiveThemeTokens, buildPeleVariables — pure token math), ./../parser/render/pelePipeline (PELE_NATURAL_WIDTH_ATTR constant only), ./../config (CLASS_OR_ID).
//   LINKS: .grace/changes/active/C-56 R-1/R-2/R-4 (spec), T-001/T-006 (plan); .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-63 and scenario-65; consumers: src/renderer/src/components/editorWithTabs/editor.vue (context menu + muya-diagram-export/muya-image-copy events), muya ui/blockViewer (toolbar dispatch), muya ui/imageToolbar (Copy image button dispatch).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EXPORTABLE_FIGURE_SELECTOR - CSS selector of the C-56 exportable block figures ("figure[data-role='MERMAID'], figure[data-role='VEGA-LITE']" — flowchart/sequence/plantuml are a follow-up non-goal).
//   resolveDiagramExportFigure - element → the exportable figure ancestor or null (role-gated, both directions of the closest walk).
//   diagramExportSvg - anything inside an EXPORTABLE figure (target, the figure, or the LIVE preview div) → the rendered SVG of its preview div; null for non-exportable roles and never-rendered blocks (strict role gate — math/html previews never resolve).
//   nearestHeadingText - element → textContent of the nearest PRECEDING heading in document order (walks previous siblings and ancestors; stops at the editor root).
//   slugifyName - free text → filesystem-safe slug (unicode letters kept — Russian headings slug to Cyrillic; whitespace→'-'; anything not letter/number/hyphen dropped; 64-char cap).
//   suggestFileName - { headingText, docName, index, ext, noun } → "heading-slug.png" or "<doc>-diagram-N.png" / "<doc>-table-N.png" fallback.
//   buildStandaloneSvg - live SVG element → self-contained SVG string: var(--pele-*) references replaced with the resolved theme values, natural width/height/viewBox, root inline sizing stripped, background rect of the theme panel colour (default) or none (transparent), theme font declared when the root carries none, script/handler/javascript:-href free. null when no size can be derived.
//   rasterizeSvg - standalone SVG string → { bytes, width, height } PNG at scale× natural size (default 2×) drawn through an <img> onto a canvas; createCanvas/makeImage injectable for tests.
//   pngIhdrSize - PNG bytes → { width, height } read from the IHDR header (big-endian u32 at bytes 16..23); null for non-PNG or short input — shared by the e2e 2×-natural assertions.
//   resolveImageCopySource - raw Markdown image src (+ the document path) → { kind: 'local', path } | { kind: 'remote', url } | { kind: 'data', bytes, mime } | null: absolute/relative/file:///asset:// (Tauri convertFileSrc) forms are local OS paths resolved against the document directory, http(s) is remote, data: decodes inline; blob: and empty srcs never resolve (C-56 T-006).
//   decodeDataUrl - data: URL → { bytes: Uint8Array, mime } (base64 or percent-encoded payload); null for malformed input.
//   isPngBytes - bytes → true iff the 8-byte PNG signature leads the buffer (the pass-through gate — the claimed mime/extension never decides).
//   imageBytesToPng - image bytes → { bytes, width, height } PNG drawn on a canvas at the image's NATURAL size (JPEG/WebP/GIF/SVG/other re-encode); createCanvas/makeImage/makeObjectUrl injectable for tests.
//   imageCopyPngBytes - the transport's single call: PNG bytes pass through untouched (with their IHDR size), everything else is re-encoded through imageBytesToPng.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-19 C-70: suggestFileName takes noun
//   ('diagram' | 'table') for the <doc>-<noun>-N fallback.
//   v1.1.0 - 2026-10-18 C-56 T-006: embedded-image copy
//   helpers — resolveImageCopySource/decodeDataUrl/isPngBytes/
//   imageBytesToPng/imageCopyPngBytes — and the img load/decode wait
//   extracted into the shared waitDecodedImage (rasterizeSvg keeps the
//   src-before-decode ordering the orchestrator review pinned; only the
//   load-failure message text generalized).
//   v1.0.1 - 2026-10-18 C-56 T-005 grace-lint pass: markup
//   only, no behavior change — pngIhdrSize added to the MODULE_MAP and the
//   buildStandaloneSvg / rasterizeSvg START_CONTRACT blocks moved OUT of
//   (before) START_BLOCK_STANDALONE_SVG / START_BLOCK_EXPORT_RASTERIZE so
//   contracts never overlap blocks.
//   v1.0.0 - 2026-10-18 C-56: first version. buildStandaloneSvg
//   resolves the C-55 CSS-variable theming into concrete colours at export
//   time (the same buildPeleVariables(readActiveThemeTokens()) block
//   util/theme.js sets on the document root), so the exported picture looks
//   like the editor in any theme — a raw SVG copied out of the DOM would
//   render uncoloured anywhere outside Mark. Natural size comes from the
//   pele pipeline's data-natural-width (viewBox attribute as the fallback —
//   string-parsed, jsdom-safe), so neither the C-49 editor zoom
//   (--mark-zoom max-width) nor the fullscreen viewer's pan/zoom clone
//   sizing leaks into the export. rasterizeSvg draws the self-contained
//   data: SVG onto a canvas at 2× (Retina) — a self-contained SVG does not
//   taint the canvas in WKWebView/WebView2. suggestFileName slugs the
//   nearest preceding heading (unicode kept) and falls back to
//   <doc>-diagram-N.
// END_CHANGE_SUMMARY

import { readActiveThemeTokens, buildPeleVariables } from '../parser/render/diagramTheme'
import { PELE_NATURAL_WIDTH_ATTR } from '../parser/render/pelePipeline'
import { CLASS_OR_ID } from '../config'

// START_BLOCK_EXPORTABLE_ROLES
// C-56 scope: Pele diagrams (```mermaid → figure[data-role='MERMAID']) and
// Vega-Lite charts. flowchart.js / js-sequence / PlantUML blocks are an
// explicit follow-up non-goal — their figures never resolve here, so no
// entry point ever offers image export on them (corner-3).
export const EXPORTABLE_FIGURE_SELECTOR =
  "figure[data-role='MERMAID'], figure[data-role='VEGA-LITE']"

export const resolveDiagramExportFigure = (el) => {
  if (!el || el.nodeType !== 1 || typeof el.closest !== 'function') return null
  try {
    return el.closest(EXPORTABLE_FIGURE_SELECTOR)
  } catch (_) {
    return null
  }
}

// The live rendered SVG of an exportable block. Accepts anything inside
// the block (the context-menu target), the figure itself, or the preview
// div (the block viewer dispatches the LIVE preview as the element —
// closest() also walks detached ancestor chains, so a re-render-detached
// preview still resolves through its figure). The ROLE GATE is strict:
// without an exportable figure ancestor nothing resolves — a math or html
// preview passed directly must not be mistaken for a diagram (it is also
// a div.ag-container-preview with an svg inside). The keep-last-good
// stale SVG (error state) exports too; a block that never rendered yields
// null so the callers disable the actions (corner-4).
export const diagramExportSvg = (el) => {
  if (!el || el.nodeType !== 1 || typeof el.querySelector !== 'function') return null
  const figure = resolveDiagramExportFigure(el)
  if (!figure) return null
  const isPreview = el.classList && el.classList.contains(CLASS_OR_ID.AG_CONTAINER_PREVIEW)
  const preview = isPreview
    ? el
    : figure.querySelector(`div.${CLASS_OR_ID.AG_CONTAINER_PREVIEW}`)
  return preview ? preview.querySelector('svg') : null
}
// END_BLOCK_EXPORTABLE_ROLES

// START_BLOCK_EXPORT_HEADING_SLUG
// Unicode-aware, filesystem-safe slug: NFC → lowercase → whitespace and
// underscores become '-', everything that is not a letter/number/hyphen
// drops (the \p{L}\p{N} classes KEEP Cyrillic/CJK letters — corner-6 wants
// a non-empty safe name, not a transliteration), runs collapse, 64-char
// cap. Empty in → empty out (the caller falls back to the document name).
export const slugifyName = (text) => {
  if (typeof text !== 'string') return ''
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/^-+|-+$/g, '')
}

/**
 * Default file name of a diagram export — the slugified nearest preceding
 * heading ("How a release moves" → how-a-release-moves.png), falling back
 * to the document name + "-diagram-N" (Untitled → diagram-N).
 *
 * @param {object} [options]
 * @param {string} [options.headingText] nearest preceding heading text (may be null/empty)
 * @param {string} [options.docName] document file name (extension stripped)
 * @param {number} [options.index=1] 1-based index of the diagram among the exportable blocks
 * @param {string} [options.ext='png'] file extension (sanitized)
 * @param {string} [options.noun='diagram'] fallback noun: 'diagram' or 'table' (C-70)
 * @returns {string}
 */
export const suggestFileName = ({
  headingText = '',
  docName = '',
  index = 1,
  ext = 'png',
  noun = 'diagram'
} = {}) => {
  const safeExt = String(ext).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  const heading = slugifyName(headingText)
  if (heading) return `${heading}.${safeExt}`
  const doc = slugifyName(String(docName || '').replace(/\.[^.]+$/, ''))
  const n = Number.isFinite(index) && index > 0 ? Math.floor(index) : 1
  // C-70: tables fall back to <doc>-table-N.
  const what = noun === 'table' ? 'table' : 'diagram'
  return doc ? `${doc}-${what}-${n}.${safeExt}` : `${what}-${n}.${safeExt}`
}

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'

// Nearest heading ABOVE the element in document order: walk previous
// siblings (self-or-descendant headings, last one wins — the closest to the
// element), then up to the ancestor's own previous siblings. Stops at the
// editor root (#ag-editor-id) so document chrome never leaks in.
export const nearestHeadingText = (el) => {
  if (!el || el.nodeType !== 1 || typeof el.closest !== 'function') return null
  const editorRoot = el.closest(`#${CLASS_OR_ID.AG_EDITOR_ID}`)
  const lastHeadingIn = (node) => {
    if (!node || node.nodeType !== 1 || typeof node.querySelectorAll !== 'function') {
      return null
    }
    if (node.matches && node.matches(HEADING_SELECTOR)) return node
    const inner = node.querySelectorAll(HEADING_SELECTOR)
    return inner && inner.length ? inner[inner.length - 1] : null
  }
  let node = el
  while (node && node.nodeType === 1) {
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      const found = lastHeadingIn(sibling)
      if (found) return found.textContent || ''
    }
    if (node === editorRoot) break
    node = node.parentElement
  }
  return null
}
// END_BLOCK_EXPORT_HEADING_SLUG

// START_CONTRACT: buildStandaloneSvg
//   PURPOSE: Clone a live rendered diagram/chart SVG into a self-contained SVG string that renders identically outside Mark (C-56 R-1).
//   INPUTS: { svgEl: SVGElement - the live rendered SVG (from the preview div; a keep-last-good stale SVG is fine), options: { background: boolean = true - theme code-panel rect; transparent when false, themeTokens: object = readActiveThemeTokens(), peleVariables: Record<string,string> = buildPeleVariables(themeTokens) } }
//   OUTPUTS: { string | null - serialized SVG with resolved colours, natural width/height/viewBox, background rect and theme font; null when no size can be derived (never-rendered block) }
//   SIDE_EFFECTS: none — the live element is never mutated (cloneNode).
//   LINKS: muya parser/render/diagramTheme buildPeleVariables; pelePipeline data-natural-width; consumers editor.vue + ui/blockViewer.
// END_CONTRACT: buildStandaloneSvg
// START_BLOCK_STANDALONE_SVG
const SVG_NS = 'http://www.w3.org/2000/svg'

const round2 = (n) => Math.round(n * 100) / 100
const numAttr = (n) => String(round2(n))

// viewBox read from the ATTRIBUTE (string-parsed) — svg.viewBox.baseVal is
// live-geometry API jsdom does not implement, and the attribute is the
// source of truth the pipeline/viewer use anyway.
const parseViewBox = (el) => {
  const raw = el && el.getAttribute ? el.getAttribute('viewBox') : null
  if (!raw) return null
  const parts = String(raw).trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
}

const parsePx = (value) => {
  if (!value) return 0
  const match = /^([\d.]+)\s*(?:px)?$/i.exec(String(value).trim())
  if (!match) return 0
  const n = Number.parseFloat(match[1])
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Resolved values are RAW (from the live variable map — a font stack may
// carry quotes), while the surrounding text is already serialized: escape
// before insertion or a quoted font name would terminate the attribute
// early and produce invalid XML.
const escapeXmlValue = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

// Every var(--pele-*) reference becomes the resolved theme value; unknown
// variables keep their fallback when one is baked in (pele roots carry
// light fallbacks — those are serialized text already and go back
// verbatim). The donut-hole fill (var(--pele-bg) with no fallback)
// resolves through the same map. Fallbacks are flat colour literals in
// pele's output, so a no-nested-parens fallback capture is sufficient.
const replaceVars = (svgString, vars) =>
  svgString.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?)\s*)?\)/g,
    (match, name, fallback) => {
      if (vars && vars[name] !== undefined) return escapeXmlValue(vars[name])
      if (fallback !== undefined && fallback !== '') return fallback
      return match
    }
  )

export const buildStandaloneSvg = (svgEl, {
  background = true,
  themeTokens = null,
  peleVariables = null
} = {}) => {
  if (!svgEl || typeof svgEl.cloneNode !== 'function' || typeof svgEl.getAttribute !== 'function') {
    return null
  }
  const tokens = themeTokens || readActiveThemeTokens()
  const vars = peleVariables || buildPeleVariables(tokens)

  // START_BLOCK_EXPORT_NATURAL_SIZE
  // Natural size, never the displayed size: data-natural-width (pele
  // pipeline, first render + cache hit + keep-last-good), else the viewBox
  // width, else a px width attribute. Height follows the viewBox ratio so
  // a data-natural-width block gets the proportional height; the C-49
  // --mark-zoom max-width and the viewer clone's inline sizing live on the
  // ROOT STYLE/width attribute and are stripped below, so zoom/pan can
  // never leak into the export (corner-2).
  const viewBox = parseViewBox(svgEl)
  const naturalWidth = parsePx(svgEl.getAttribute(PELE_NATURAL_WIDTH_ATTR))
  let width = naturalWidth ||
    (viewBox && viewBox.width > 0 ? viewBox.width : 0) ||
    parsePx(svgEl.getAttribute('width'))
  let height = 0
  if (viewBox && viewBox.width > 0 && viewBox.height > 0 && width > 0) {
    height = viewBox.height * (width / viewBox.width)
  } else {
    height = parsePx(svgEl.getAttribute('height'))
  }
  if (!(width > 0) || !(height > 0)) {
    const rect = typeof svgEl.getBoundingClientRect === 'function'
      ? svgEl.getBoundingClientRect()
      : null
    if (rect && rect.width > 0 && rect.height > 0) {
      width = rect.width
      height = rect.height
    }
  }
  if (!(width > 0) || !(height > 0)) {
    return null
  }
  // END_BLOCK_EXPORT_NATURAL_SIZE

  const clone = svgEl.cloneNode(true)

  // START_BLOCK_EXPORT_SANITIZE
  // Export safety + chrome strip on the CLONE: no <script>, no on*
  // handlers, no javascript: hrefs (constraint), no pele error overlay.
  // The preview's expand button and selection outline live OUTSIDE the svg
  // (figure children), so cloning the svg alone already excludes them.
  for (const el of clone.querySelectorAll('script, .ag-pele-error')) {
    el.remove()
  }
  for (const el of clone.querySelectorAll('*')) {
    if (!el.attributes) continue
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
      } else if (
        (name === 'href' || name === 'xlink:href') &&
        /^\s*javascript:/i.test(attr.value)
      ) {
        el.removeAttribute(attr.name)
      }
    }
  }
  // END_BLOCK_EXPORT_SANITIZE

  // Root id would collide with the live svg when the export is embedded
  // next to a copy of the document; inner ids (markers, clip paths) stay —
  // url(#…) references inside the SVG keep resolving.
  clone.removeAttribute('id')
  clone.removeAttribute(PELE_NATURAL_WIDTH_ATTR)
  clone.setAttribute('width', numAttr(width))
  clone.setAttribute('height', numAttr(height))
  if (viewBox) {
    // Keep the original viewBox (non-zero min-x/min-y included).
    clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`)
  } else {
    clone.setAttribute('viewBox', `0 0 ${numAttr(width)} ${numAttr(height)}`)
  }
  // Root inline sizing strip, at the ATTRIBUTE level: the CSSOM round-trip
  // (style.width = '' …) is unreliable in jsdom (custom properties can be
  // dropped from cssText), and the --_x chain must survive verbatim for
  // the var() resolution below. Filtering declarations from the raw
  // attribute string is deterministic everywhere.
  const rawStyle = clone.getAttribute('style')
  if (rawStyle) {
    const cleaned = rawStyle
      .split(';')
      .filter((decl) => !/^\s*(width|height|max-width|min-width)\s*:/i.test(decl))
      .join(';')
    if (cleaned) {
      clone.setAttribute('style', cleaned)
    } else {
      clone.removeAttribute('style')
    }
  }
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', SVG_NS)
  }
  // R-1 "the theme font declared": pele font references ride
  // var(--pele-font) and resolve below; Vega bakes concrete font families
  // per text element. A root-level default covers everything else.
  const rootStyle = clone.getAttribute('style') || ''
  if (!clone.getAttribute('font-family') && !/font-family/.test(rootStyle)) {
    clone.setAttribute('font-family', tokens.font)
  }

  // Theme code-panel background behind the content (default); the
  // transparent option (background: false) skips the rect — the exported
  // SVG then composites over whatever it is pasted onto.
  if (background !== false) {
    const rect = (typeof document !== 'undefined' && document.createElementNS)
      ? document.createElementNS(SVG_NS, 'rect')
      : null
    if (rect) {
      rect.setAttribute('class', 'ag-export-background')
      rect.setAttribute('x', viewBox ? String(viewBox.x) : '0')
      rect.setAttribute('y', viewBox ? String(viewBox.y) : '0')
      rect.setAttribute(
        'width',
        viewBox && viewBox.width > 0 ? String(viewBox.width) : numAttr(width)
      )
      rect.setAttribute(
        'height',
        viewBox && viewBox.height > 0 ? String(viewBox.height) : numAttr(height)
      )
      rect.setAttribute('fill', vars['--pele-bg'])
      clone.insertBefore(rect, clone.firstChild)
    }
  }

  let out = new XMLSerializer().serializeToString(clone)
  out = replaceVars(out, vars)
  return out
}
// END_BLOCK_STANDALONE_SVG

// START_CONTRACT: rasterizeSvg
//   PURPOSE: Rasterize the standalone SVG string to PNG bytes at scale× natural size (default 2× Retina) on a canvas (C-56 R-2).
//   INPUTS: { svgString: string - buildStandaloneSvg output (must carry width/height), options: { scale: number = 2, createCanvas: (w, h) => HTMLCanvasElement, makeImage: () => HTMLImageElement } }
//   OUTPUTS: { Promise<{ bytes: Uint8Array, width: number, height: number }> - encoded PNG } — rejects on load/encode failure.
//   SIDE_EFFECTS: none outside the throwaway canvas/img; the SVG is a self-contained data: URL, so the canvas is not tainted in WKWebView/WebView2.
//   LINKS: buildStandaloneSvg; editor.vue copyImage (clipboard writeImage) + savePng (fs writeBinary).
// END_CONTRACT: rasterizeSvg
// START_BLOCK_EXPORT_RASTERIZE
// PNG size header of an encoded PNG — bytes 16..23 after the 8-byte
// signature + 4-byte length + "IHDR" (big-endian u32 width/height). Used by
// tests/e2e to assert the 2× Retina contract on the bytes that actually
// reached the clipboard/fs mock.
export const pngIhdrSize = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const readSvgRootSize = (svgString) => {
  const root = /<svg\b[^>]*>/.exec(String(svgString || ''))
  if (!root) return null
  const width = parsePx(/(?:^|\s)width="([\d.]+)"/.exec(root[0])?.[1])
  const height = parsePx(/(?:^|\s)height="([\d.]+)"/.exec(root[0])?.[1])
  if (width > 0 && height > 0) return { width, height }
  return null
}

// START_BLOCK_IMAGE_WAIT_DECODE
// src first, then wait: decode() called before src rejects in
// Chromium/WebKit; images without decode() fall back to onload/onerror.
// Shared by rasterizeSvg (data: SVG) and imageBytesToPng (object-URL
// bitmap) so the orchestrator-pinned ordering lives in exactly one place.
const waitDecodedImage = (img, src) => {
  const loaded = typeof img.decode === 'function'
    ? null
    : new Promise((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('the image failed to load'))
    })
  img.src = src
  return loaded || img.decode()
}
// END_BLOCK_IMAGE_WAIT_DECODE

export const rasterizeSvg = async (svgString, {
  scale = 2,
  createCanvas = null,
  makeImage = null
} = {}) => {
  const size = readSvgRootSize(svgString)
  if (!size) {
    throw new Error('rasterizeSvg: the SVG root carries no pixel size')
  }
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
  const width = Math.max(1, Math.round(size.width * factor))
  const height = Math.max(1, Math.round(size.height * factor))
  const canvasFactory = createCanvas || ((w, h) => {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    return canvas
  })
  const imageFactory = makeImage || (() => new Image())
  const img = imageFactory()
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`
  await waitDecodedImage(img, dataUrl)
  const canvas = canvasFactory(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('rasterizeSvg: no 2d context')
  }
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('rasterizeSvg: PNG encoding failed'))),
        'image/png'
      )
    } catch (err) {
      reject(err)
    }
  })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { bytes, width, height }
}
// END_BLOCK_EXPORT_RASTERIZE

// START_CONTRACT: resolveImageCopySource
//   PURPOSE: C-56 T-006 — classify the raw Markdown src of an embedded ![](…) image for the clipboard picture copy: which transport reads the bytes and from where.
//   INPUTS: { rawSrc: string - token.attrs.src straight from the Markdown, options: { docPath: string = '' - the document file path; relative srcs resolve against its directory } }
//   OUTPUTS: { { kind: 'local', path } | { kind: 'remote', url } | { kind: 'data', bytes: Uint8Array, mime } | null - null when nothing can read the source (empty src, blob:, malformed data:, relative src without a saved document) }
//   SIDE_EFFECTS: none — pure string/bytes math (data-URL base64 decodes inline).
//   LINKS: muya utils/index.js getImageInfo (the render-side twin that resolves display srcs); editor.vue handleImageCopyAction; unit twins tests/renderer/muya/image-copy.test.js.
// END_CONTRACT: resolveImageCopySource
// START_BLOCK_IMAGE_COPY_SOURCE
// T-006 source forms, mirroring how the render pipeline itself resolves
// display srcs (utils getImageInfo → file:// + __markImageLoader):
//   data:…            → inline bytes (decodeDataUrl)
//   http(s)://…       → remote fetch (the host transport owns fetch)
//   file:///…         → OS path (decodeURIComponent, exactly like
//                       loadImageAsync's bridge branch)
//   asset://localhost/<encodeURIComponent(path)> (or bare asset://…)
//                       → OS path — the Tauri convertFileSrc form
//   /abs, C:\…, \\…   → OS path as-is
//   everything else   → relative to the document directory; no saved
//                       document → null (nothing can resolve it)
// blob: srcs never appear in Markdown (they are display-only object URLs
// created at render time) and never resolve.
const safeDecodePath = (p) => {
  try {
    return decodeURIComponent(p)
  } catch (_) {
    return p
  }
}

const WIN_ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/\/)/

// POSIX-style segment normalization (Windows separators are folded to '/'
// first): '.' drops, '..' pops, duplicates collapse. Enough for the
// document-directory joins T-006 needs; no symlink semantics required.
const normalizePathParts = (p) => {
  const absolute = p.startsWith('/')
  const out = []
  for (const part of p.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') {
        out.pop()
      } else if (!absolute) {
        out.push('..')
      }
      continue
    }
    out.push(part)
  }
  const joined = out.join('/')
  return absolute ? `/${joined}` : (joined || '.')
}

const dirnameOf = (p) => {
  const norm = String(p || '').replace(/\\/g, '/')
  const cut = norm.lastIndexOf('/')
  if (cut < 0) return ''
  return norm.slice(0, cut)
}

export const decodeDataUrl = (src) => {
  if (typeof src !== 'string' || !/^data:/i.test(src)) return null
  const comma = src.indexOf(',')
  if (comma < 0) return null
  const header = src.slice(5, comma).split(';')
  const mime = (header[0] || '').trim().toLowerCase() || 'application/octet-stream'
  const isBase64 = header.slice(1).some((p) => p.trim().toLowerCase() === 'base64')
  try {
    if (isBase64) {
      const bin = atob(src.slice(comma + 1).replace(/\s+/g, ''))
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i)
      }
      return { bytes, mime }
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(src.slice(comma + 1))), mime }
  } catch (_) {
    return null
  }
}

export const resolveImageCopySource = (rawSrc, { docPath = '' } = {}) => {
  const src = typeof rawSrc === 'string' ? rawSrc.trim() : ''
  if (!src) return null
  if (/^data:/i.test(src)) {
    const decoded = decodeDataUrl(src)
    return decoded ? { kind: 'data', ...decoded } : null
  }
  if (/^https?:/i.test(src)) {
    return { kind: 'remote', url: src }
  }
  if (/^file:\/\//i.test(src)) {
    // The __markImageLoader bridge decodes exactly this way.
    // file:///C:/x on Windows → C:/x (drop the slash before a drive letter).
    const path = decodeURIComponent(src.replace(/^file:\/\//i, ''))
    return { kind: 'local', path: path.replace(/^\/([A-Za-z]:[\\/])/, '$1') }
  }
  if (/^asset:\/\//i.test(src)) {
    const withoutScheme = src.replace(/^asset:\/\//i, '')
    const payload = /^localhost\//i.test(withoutScheme)
      ? withoutScheme.replace(/^localhost\//i, '')
      : withoutScheme
    const path = safeDecodePath(payload)
    return path ? { kind: 'local', path } : null
  }
  if (/^blob:/i.test(src)) {
    return null
  }
  if (WIN_ABSOLUTE_PATH.test(src) || src.startsWith('/')) {
    return { kind: 'local', path: safeDecodePath(src) }
  }
  // Relative to the document. An unsaved tab has no directory — nothing
  // can resolve the source (the failure notice path).
  const dir = dirnameOf(docPath)
  if (!dir) return null
  const joined = normalizePathParts(`${dir}/${safeDecodePath(src).replace(/\\/g, '/')}`)
  return { kind: 'local', path: joined }
}
// END_BLOCK_IMAGE_COPY_SOURCE

// START_CONTRACT: imageBytesToPng
//   PURPOSE: C-56 T-006 — re-encode non-PNG image bytes (JPEG/WebP/GIF/SVG/other) as PNG by drawing them on a canvas at the image's natural size.
//   INPUTS: { bytes: Uint8Array, options: { mime: string - object-URL content type hint, createCanvas: (w, h) => HTMLCanvasElement, makeImage: () => HTMLImageElement, makeObjectUrl: (bytes, mime) => string } }
//   OUTPUTS: { Promise<{ bytes: Uint8Array, width: number, height: number }> - encoded PNG at natural size } — rejects on load/size/encode failure (the host maps that to the failure notice).
//   SIDE_EFFECTS: none outside the throwaway object URL (revoked in finally when the default factory created it), img and canvas; object-URL/blob sources never taint the canvas.
//   LINKS: imageCopyPngBytes (the pass-through gate); rasterizeSvg (the SVG-string twin); editor.vue handleImageCopyAction.
// END_CONTRACT: imageBytesToPng
// START_BLOCK_IMAGE_COPY_PNG
export const isPngBytes = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return false
  return (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  )
}

export const imageBytesToPng = async (bytes, {
  mime = 'image/png',
  createCanvas = null,
  makeImage = null,
  makeObjectUrl = null
} = {}) => {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error('imageBytesToPng: no image bytes')
  }
  const urlFactory = makeObjectUrl ||
    ((b, m) => URL.createObjectURL(new Blob([b], { type: m || 'application/octet-stream' })))
  const url = urlFactory(bytes, mime)
  try {
    const imageFactory = makeImage || (() => new Image())
    const img = imageFactory()
    await waitDecodedImage(img, url)
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    // An SVG without intrinsic dimensions reports no natural size — there
    // is nothing meaningful to rasterize (the failure notice path).
    if (!(width > 0) || !(height > 0)) {
      throw new Error('imageBytesToPng: the image carries no natural size')
    }
    const canvasFactory = createCanvas || ((w, h) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      return canvas
    })
    const canvas = canvasFactory(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('imageBytesToPng: no 2d context')
    }
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('imageBytesToPng: PNG encoding failed'))),
          'image/png'
        )
      } catch (err) {
        reject(err)
      }
    })
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width,
      height
    }
  } finally {
    if (!makeObjectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url)
    }
  }
}

// The transport's single entry: a real PNG passes through untouched (its
// bytes are exactly what the clipboard should carry — no re-encode
// quality loss), everything else is re-encoded as PNG at natural size.
export const imageCopyPngBytes = (bytes, options = {}) => {
  if (isPngBytes(bytes)) {
    return Promise.resolve({ bytes, ...(pngIhdrSize(bytes) || {}) })
  }
  return imageBytesToPng(bytes, options)
}
// END_BLOCK_IMAGE_COPY_PNG
