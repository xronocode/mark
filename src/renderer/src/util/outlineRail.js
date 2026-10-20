// FILE: src/renderer/src/util/outlineRail.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure helpers for the outline rail — heading extraction, current-heading resolution, visibility gates and visible table intersection.
//   SCOPE: Pure functions only (no DOM, no store access): extractRailHeadings, resolveCurrentHeading, railFitsWithoutOverlap, shouldShowRail, railIntersectsTable.
//   DEPENDS: none.
//   LINKS: .grace/changes/archive/C-40 T-003; C-71-OUTLINE-OCCLUSION; components/editorWithTabs/outlineRail.vue; .grace/graph/runtime.xml M-011 fn-extractRailHeadings and fn-railIntersectsTable; .grace/verification/runtime.xml V-M-011 scenario-54.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   RAIL_MIN_EDITOR_WIDTH - Minimum editor-area width for the rail (approved canvas: hidden below 1000 px).
//   RAIL_MIN_HEADINGS - Minimum visible (h1–h3) headings for the rail to appear.
//   extractRailHeadings - Project listToc into the flat rail item list (h1–h3, document order).
//   resolveCurrentHeading - Map the scrollspy slug (any level) onto the nearest visible rail heading at-or-before it.
//   railFitsWithoutOverlap - Geometry gate: does the fixed rail box clear the centred text column with a gap?
//   shouldShowRail - Combined preference/mode/width/heading-count/fit gate.
//   railIntersectsTable - Strict positive intersection of rail, table, owning scrollport and optional wrapper clip.
//   RAIL_WIDTH - rail box width (px).
//   RAIL_RIGHT_INSET - rail distance from the editor's right edge (px).
//   RAIL_TEXT_GAP - minimum gap between text and rail (px).
//   COLUMN_RIGHT_PADDING_FALLBACK - column right padding when it cannot be measured (px).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-19 v1.1.0: C-71-OUTLINE-OCCLUSION — only a visible table/rail intersection hides the whole outline; edge contact and clipped content do not.
//   - 2026-10-15 v1.0.0: C-40 T-003 — initial extraction with the canvas
//     geometry (170 px rail, 22 px right inset, 10 px gap to the text
//     column; the column's 50 px right padding keeps the measured text
//     edge honest) and the nearest-visible-ancestor current-heading rule
//     (a viewport inside an h4 highlights its closest shown ancestor).
// END_CHANGE_SUMMARY

// Approved canvas (2026-10-15, option A): the rail is hidden when the
// editor area is narrower than 1000 px. Geometry constants mirror the
// canvas rail style — width 170, right inset 22, and a 10 px minimum gap
// between the rail's left edge and the text column's right text edge.
export const RAIL_MIN_EDITOR_WIDTH = 1000
export const RAIL_MIN_HEADINGS = 3
export const RAIL_WIDTH = 170
export const RAIL_RIGHT_INSET = 22
export const RAIL_TEXT_GAP = 10
// #ag-editor-id ships `padding: 20px 50px 100px 50px` (muya default.css);
// used only when the live computed padding cannot be read.
export const COLUMN_RIGHT_PADDING_FALLBACK = 50

// START_BLOCK_RAIL_TABLE_INTERSECTION
export const railIntersectsTable = (rail, table, viewport, clip = viewport) => {
  const rects = [rail, table, viewport, clip]
  if (!rects.every(rect => rect &&
    ['left', 'right', 'top', 'bottom'].every(edge => Number.isFinite(rect[edge])) &&
    rect.right > rect.left && rect.bottom > rect.top)) return false
  return Math.max(...rects.map(rect => rect.left)) < Math.min(...rects.map(rect => rect.right)) &&
    Math.max(...rects.map(rect => rect.top)) < Math.min(...rects.map(rect => rect.bottom))
}
// END_BLOCK_RAIL_TABLE_INTERSECTION

// START_BLOCK_EXTRACT_RAIL_HEADINGS
// The rail lists h1–h3 only (deeper levels are indented within the rail;
// h4–h6 stay reachable through ⌘T Go-to-Heading). listToc arrives in
// document order with { slug, content, lvl } entries; malformed entries
// are dropped rather than crashing the rail.
export const extractRailHeadings = (listToc) => {
  if (!Array.isArray(listToc)) return []
  return listToc
    .filter(
      (h) =>
        h &&
        typeof h.slug === 'string' &&
        h.slug &&
        typeof h.content === 'string' &&
        Number.isInteger(h.lvl) &&
        h.lvl >= 1 &&
        h.lvl <= 3
    )
    .map((h) => ({ slug: h.slug, label: h.content, lvl: h.lvl }))
}
// END_BLOCK_EXTRACT_RAIL_HEADINGS

// START_BLOCK_RESOLVE_CURRENT_HEADING
// The editor scrollspy (editor.vue emitActiveHeading) publishes the slug
// of the heading containing the viewport — any level, including h4–h6 the
// rail does not list. Map it onto the LAST rail heading at-or-before that
// slug in document order, so a viewport inside an h4 subsection keeps its
// visible h2/h3 ancestor highlighted. A null (above the first heading) or
// unknown slug highlights nothing.
export const resolveCurrentHeading = (railHeadings, listToc, activeSlug) => {
  if (!activeSlug || !Array.isArray(railHeadings) || railHeadings.length === 0) {
    return null
  }
  const flat = Array.isArray(listToc) ? listToc : []
  const activeIndex = flat.findIndex((h) => h && h.slug === activeSlug)
  if (activeIndex === -1) return null
  const slugOrder = new Map(flat.map((h, i) => [h && h.slug, i]))
  let current = null
  for (const heading of railHeadings) {
    const order = slugOrder.get(heading.slug)
    if (order !== undefined && order <= activeIndex) {
      current = heading
    } else {
      break
    }
  }
  return current
}
// END_BLOCK_RESOLVE_CURRENT_HEADING

// START_BLOCK_RAIL_FIT
// Geometry gate. The rail is a fixed box pinned to the editor area's
// right inset (canvas: right: 22px, width: 170px). It may render only
// when that box clears the centred text column's text edge — the column
// box's right edge minus its right padding — by at least RAIL_TEXT_GAP.
// With the shipped default column (--editorAreaWidth: 750px, 50px inner
// padding) this means the rail appears from roughly 1070 px of editor
// width and always hides below the approved 1000 px floor; a wide
// editorLineWidth column simply keeps the rail hidden until the margin
// fits it, so text is never overlapped.
export const railFitsWithoutOverlap = (containerWidth, columnRight, columnPaddingRight) => {
  if (!Number.isFinite(containerWidth) || containerWidth < RAIL_MIN_EDITOR_WIDTH) {
    return false
  }
  const railLeft = containerWidth - RAIL_RIGHT_INSET - RAIL_WIDTH
  if (!Number.isFinite(columnRight)) {
    return false
  }
  const padding = Number.isFinite(columnPaddingRight)
    ? columnPaddingRight
    : COLUMN_RIGHT_PADDING_FALLBACK
  const textRight = columnRight - padding
  return railLeft >= textRight + RAIL_TEXT_GAP
}
// END_BLOCK_RAIL_FIT

// Combined gate: persisted preference (default on), plain WYSIWYG surface
// only (not source mode / split view / diff view), enough headings, a wide
// enough editor area, and a fit that clears the text column.
export const shouldShowRail = ({
  preferenceVisible,
  sourceCode,
  splitView,
  diffMode,
  containerWidth,
  columnRight,
  columnPaddingRight,
  headings
}) => {
  if (!preferenceVisible || sourceCode || splitView || diffMode) return false
  if (!Array.isArray(headings) || headings.length < RAIL_MIN_HEADINGS) return false
  return railFitsWithoutOverlap(containerWidth, columnRight, columnPaddingRight)
}
