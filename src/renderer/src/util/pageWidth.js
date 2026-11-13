// FILE: src/renderer/src/util/pageWidth.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-002 (M-061) the width resolution pipeline and canvas model — resolves the effective document width as document > theme > global, names the active source, converts between ch/px/% with the 10% preset snap, computes canvas = window − sidebar and the rendered column/box = min(setting, canvas − indent) with the 400px floor, and applies the result as one inline custom property so themes can never win the cascade.
//   SCOPE: Pure resolution/conversion/clamp maths plus one narrow DOM writer. Everything that decides a number is a pure function over plain objects (unit-pinnable); nothing here reads or writes the per-document store (util/pageWidthStore.js owns persistence) and nothing here mutates a stored or passed-in setting — clamping is a RENDER-time projection only (corner C-2: a clamped document keeps its stored value and restores it when the canvas grows). The writer (applyEditorWidth) sets exactly one inline custom property on the editor root — no content re-render, no muya involvement — and records the last applied value so util/theme.js addThemeStyle can re-apply it after every theme switch (review finding F1: themes re-declare --editorAreaWidth in their own stylesheets, so only an inline value written after theme application holds; both orders theme→width and width→theme must end on the effective value). clearAppliedEditorWidth (T-003) removes that inline property and forgets the recorded value — the hand-off writer when the panel leaves the pipeline tier for the legacy global tier (theme.js setEditorWidth), so exactly one writer ever owns the variable. F-WINDOW-AUTO-RESIZE integration point: the dormant window auto-fit (store/layout.js requestWindowResize) must compute target = sidebarPart + effective box via computeAutoResizeTargetWidth when it is revived — never the hardcoded 820 again (spec R-3).
//   DEPENDS: DOM document (writer only, jsdom-safe); no store, no IPC, no muya import — the module graph stays leaf-pure so every rule is unit-pinnable.
//   LINKS: .grace/changes/archive/C-PAGE-WIDTH-TABLES (plan T-002/T-003, corners C-1/C-2/C-3/C-4, review findings F1/F2/F6); util/pageWidthStore.js (the document tier's persistence); util/theme.js addThemeStyle (calls reapplyLastEditorWidth after theme application) and setEditorWidth (the legacy global-tier writer this module hands off to); components/titleBar/quickSettings (the panel consuming the pipeline); store/layout.js EDITOR_IDEAL_CONTENT_WIDTH (the hardcoded 820 this module's computeAutoResizeTargetWidth replaces when F-WINDOW-AUTO-RESIZE revives); src/muya/themes/default.css #ag-editor-id (max-width var(--editorAreaWidth), min-width 400px, 20/50/100/50 padding — the indent and floor constants below mirror that CSS); assets/styles/index.css (the calc(100px + 768px) global default).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   UNIT_PRESETS - per-unit preset values (ch 60/80/110, px 600/750/900, % 60/80/100 — spec R-6).
//   UNIT_BOUNDS - per-unit stepper bounds (ch 40-130, px 340-1100, % 40-100 — the mock-verified ranges).
//   DEFAULT_GLOBAL_WIDTH - the shipped global default ({ value: 768, unit: 'px' }; assets/styles/index.css and all 34 themes carry calc(100px + 768px)).
//   FULL_WINDOW_WIDTH - the Full window preset sentinel ({ value: 100, unit: '%' }) — in the locked R-3 canvas model (canvas = window − sidebar) a 100% column IS the full window canvas and follows the sidebar live; both persistence grammars (editorLineWidth strings, pageWidths entries) hold it without a fourth unit.
//   isFullWindowWidth - pure: true when the width IS the Full window sentinel ({100,'%'}).
//   EDITOR_INDENT_PX - the editor box's horizontal padding (50 + 50) — the "100px" offset in the shipped calc(100px + value) form.
//   MIN_RENDERED_BOX_PX - the rendered box floor (400px — muya #ag-editor-id min-width).
//   CH_TO_PX - the ch→px conversion basis (9.375 = 750/80, the shipped 80ch ≈ 750px identity; ch measures follow the live font in CSS, this basis is only for unit conversion and layout arithmetic).
//   PRESET_SNAP_RATIO - a converted value within 10% of a preset snaps to it (spec R-6).
//   WIDTH_SOURCES - the named precedence tiers ('document', 'theme', 'global').
//   sanitizeWidth - pure: coerce a raw width ({ value, unit }) into a valid width or null (finite positive integer value, one of the three units).
//   parseWidth - pure: parse the raw preference string form ('768px' / '80ch' / '95%', the Appearance Line width grammar) into a width or null; width objects pass through sanitizeWidth.
//   resolveWidth - pure: document > theme > global precedence over width-or-null candidates, returning { value, unit, source } with the active source named; an empty/invalid global falls to DEFAULT_GLOBAL_WIDTH (still source 'global').
//   widthToPixels - pure: a width's content-column px for the given canvas (px as-is, ch via CH_TO_PX, % of the canvas); null when the canvas is required but missing.
//   computeCanvasWidth - pure: canvas = window − sidebar (0 when the sidebar part would exceed the window; the sidebar contributes only while visible).
//   computeRenderedBox - pure: the render-time projection — column = max(floor−indent, min(settingPx, canvas − indent)), box = column + indent (the --editorAreaWidth value); never mutates the input width, returns { boxPx, columnPx, clamped, floored } (corner C-2).
//   convertWidth - pure: convert a value between ch/px/% (ch via CH_TO_PX, % against the given canvas), then snap to a preset within PRESET_SNAP_RATIO; returns { value, unit, snapped } or null when a canvas-dependent conversion gets no canvas.
//   snapToPreset - pure: the 10% snap — |value − preset| ≤ preset × 0.1 adopts the preset ({ value, snapped }).
//   nearestPreset - pure: the closest preset of the unit (ties resolve to the lower preset) — the nearest-preset anchor mark for non-preset values.
//   isPresetValue - pure: exact preset match (panel checkmarks/anchor suppression).
//   clampUnitValue - pure: clamp a value into the unit's bounds (stepper input guard; never used on the persistence path).
//   resolveEffectiveWidth - pure: resolveWidth + widthToPixels + computeRenderedBox in one call — { value, unit, source, settingPx, columnPx, boxPx, clamped, floored } or null.
//   computeAutoResizeTargetWidth - pure: the F-WINDOW-AUTO-RESIZE integration point — target = sidebarPart + effective box px (replaces store/layout.js's hardcoded EDITOR_IDEAL_CONTENT_WIDTH 820 when the feature revives).
//   applyEditorWidth - DOM writer: set the effective box as the inline custom property --editorAreaWidth on the editor root (documentElement), record it as last applied, return the applied summary; writes exactly one style property (no content re-render — the % relayout path, corner C-3).
//   clearAppliedEditorWidth - DOM writer (T-003): remove the inline --editorAreaWidth custom property and forget the last applied value (the panel's hand-off to the legacy global-tier writer); true when a value was actually cleared.
//   reapplyLastEditorWidth - DOM writer: re-set the last applied width (called by theme.js addThemeStyle after a theme switch re-declared the variable); false when nothing was applied yet.
//   getLastAppliedEditorWidth - the last applied { boxPx, source } (diagnostics/tests).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-003 (M-061):
//   panel-wave additions — clearAppliedEditorWidth() (the hand-off to the
//   legacy global-tier writer: remove the inline custom property and
//   forget the recorded value so exactly one writer owns the variable)
//   and FULL_WINDOW_WIDTH ({100,'%'}, the R-3 canvas-model sentinel the
//   Page tab's Full window preset persists as). The T-002 resolution,
//   conversion and writer behaviour is unchanged.
//   PREV: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-002 (M-061): new
//   module. The resolution pipeline behind the per-document width:
//   document > theme > global with the active source named; ch/px/%
//   conversion with the 10% preset snap and the nearest-preset anchor;
//   canvas = window − sidebar; the rendered column is
//   min(setting, canvas − indent) with the 400px floor, always centred by
//   the shipped margin rule — and the stored value never mutates on
//   clamping (separate stored vs rendered, review finding F2). The single
//   writer applies the effective value as an inline custom property so it
//   beats every theme stylesheet regardless of order (F1), and theme.js
//   re-applies it after each theme application. The percent unit
//   is the adaptive mode: a canvas change (sidebar show/hide/drag) needs
//   only one more writer call on the same pure pipeline — the custom
//   property is the only thing that changes, never the content (C-3, F6).
// END_CHANGE_SUMMARY

// Shipped presets and bounds (spec R-6; the mock-verified ranges).
export const UNIT_PRESETS = Object.freeze({
  ch: [60, 80, 110],
  px: [600, 750, 900],
  '%': [60, 80, 100]
})

export const UNIT_BOUNDS = Object.freeze({
  ch: [40, 130],
  px: [340, 1100],
  '%': [40, 100]
})

// The shipped default: --editorAreaWidth: calc(100px + 768px) in
// assets/styles/index.css and in every one of the 34 themes. The plan's
// prose "750px" citations drifted — 768px is the locked value (pinned by
// tests/renderer/util/editor-width-default.test.js).
export const DEFAULT_GLOBAL_WIDTH = Object.freeze({ value: 768, unit: 'px' })

// The Full window preset (spec R-6 "always plus Full window"): in the
// locked R-3 canvas model (canvas = window − sidebar, one rule for text
// and tables) a 100% column IS the whole window canvas — it follows the
// sidebar live and centres with zero side margins. Persisted as the
// ordinary {100,'%'} entry so both grammars (editorLineWidth '100%',
// pageWidths { value: 100, unit: '%' }) hold it without a fourth unit.
export const FULL_WINDOW_WIDTH = Object.freeze({ value: 100, unit: '%' })

export const isFullWindowWidth = (width) => {
  const clean = sanitizeWidth(width)
  return !!clean && clean.value === FULL_WINDOW_WIDTH.value && clean.unit === FULL_WINDOW_WIDTH.unit
}

// #ag-editor-id padding: 20px 50px 100px 50px — the horizontal indent is
// 100px, the same "100px" the shipped calc(100px + value) form adds to
// carry the border-box. The column the user sets is the value; the box
// the CSS clamps is value + indent.
export const EDITOR_INDENT_PX = 100

// muya #ag-editor-id min-width: 400px — the existing floor the rendered
// box never crosses, even on a canvas smaller than that.
export const MIN_RENDERED_BOX_PX = 400

// The ch→px basis for unit conversion and layout arithmetic: 750px / 80ch
// — the shipped identity that makes 80ch, 750px and (on the reference
// canvas) 80% the same column. Live ch measuring stays CSS's job; this
// constant only keeps conversions stable across canvases.
export const CH_TO_PX = 9.375

// A converted value within 10% of a preset snaps to it (spec R-6).
export const PRESET_SNAP_RATIO = 0.1

export const WIDTH_SOURCES = Object.freeze({
  DOCUMENT: 'document',
  THEME: 'theme',
  GLOBAL: 'global'
})

const WIDTH_UNITS = ['ch', 'px', '%']

// The raw-preference grammar shared with theme.js setEditorWidth:
// an integer followed by one of the three units.
const PREF_WIDTH_REGEX = /^([0-9]+)(ch|px|%)$/

// START_BLOCK_RESOLUTION
// Pure resolution maths — no DOM, no IO, no side effects.
export const sanitizeWidth = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { value, unit } = raw
  if (!Number.isFinite(value) || value <= 0) return null
  if (!WIDTH_UNITS.includes(unit)) return null
  return { value: Math.round(value), unit }
}

export const parseWidth = (raw) => {
  if (raw && typeof raw === 'object') return sanitizeWidth(raw)
  if (typeof raw !== 'string') return null
  const m = PREF_WIDTH_REGEX.exec(raw.trim())
  if (!m) return null
  return sanitizeWidth({ value: Number(m[1]), unit: m[2] })
}

// Corner C-1: the candidates are checked in strict document > theme >
// global order; the winner's tier is named so the panel/inspector can
// surface it. A null/invalid tier is skipped; an empty global preference
// still resolves with source 'global' onto the shipped default — the
// default IS the global tier's answer, not a fourth tier.
export const resolveWidth = ({ document: documentWidth, theme: themeWidth, global: globalWidth } = {}) => {
  const documentMatch = sanitizeWidth(documentWidth)
  if (documentMatch) return { ...documentMatch, source: WIDTH_SOURCES.DOCUMENT }
  const themeMatch = sanitizeWidth(themeWidth)
  if (themeMatch) return { ...themeMatch, source: WIDTH_SOURCES.THEME }
  const globalMatch = sanitizeWidth(globalWidth) || DEFAULT_GLOBAL_WIDTH
  return { ...globalMatch, source: WIDTH_SOURCES.GLOBAL }
}

export const widthToPixels = (width, canvasWidth) => {
  const clean = sanitizeWidth(width)
  if (!clean) return null
  if (clean.unit === 'px') return clean.value
  if (clean.unit === 'ch') return clean.value * CH_TO_PX
  // % of the live canvas — the adaptive mode; no canvas, no answer.
  if (!Number.isFinite(canvasWidth) || canvasWidth < 0) return null
  return (clean.value / 100) * canvasWidth
}

export const computeCanvasWidth = (windowWidth, { sidebarVisible = false, sidebarWidth = 0 } = {}) => {
  if (!Number.isFinite(windowWidth) || windowWidth < 0) return 0
  const sidebarPart = sidebarVisible && Number.isFinite(sidebarWidth) && sidebarWidth > 0
    ? sidebarWidth
    : 0
  return Math.max(0, windowWidth - sidebarPart)
}

// Corner C-2 in one function: the SETTING goes in, the RENDER comes out,
// and nothing writes anywhere. column = the content column px; box = the
// --editorAreaWidth value (column + indent, the calc(100px + value)
// semantics). The floor mirrors muya's box min-width: 400px. clamped says
// the canvas — not the setting — decided the width; floored says the
// floor did. The caller re-resolves on every canvas change; the stored
// value is never consulted for writes here.
export const computeRenderedBox = (width, canvasWidth) => {
  const settingPx = widthToPixels(width, canvasWidth)
  if (settingPx === null) return null
  const maxColumn = canvasWidth - EDITOR_INDENT_PX
  const rawColumn = Math.min(settingPx, maxColumn)
  const minColumn = MIN_RENDERED_BOX_PX - EDITOR_INDENT_PX
  const columnPx = Math.max(minColumn, rawColumn)
  const boxPx = columnPx + EDITOR_INDENT_PX
  return {
    boxPx,
    columnPx,
    clamped: columnPx < settingPx,
    floored: minColumn > rawColumn
  }
}
// END_BLOCK_RESOLUTION

// START_BLOCK_CONVERSION
// Unit conversion with the 10% preset snap (spec R-6 / corner C-5).
export const snapToPreset = (value, unit) => {
  const presets = UNIT_PRESETS[unit] || []
  for (const preset of presets) {
    if (Math.abs(value - preset) <= preset * PRESET_SNAP_RATIO) {
      return { value: preset, snapped: true }
    }
  }
  return { value, snapped: false }
}

export const nearestPreset = (unit, value) => {
  const presets = UNIT_PRESETS[unit] || []
  let best = null
  for (const preset of presets) {
    if (best === null || Math.abs(preset - value) < Math.abs(best - value)) {
      best = preset
    }
  }
  return best
}

export const isPresetValue = (unit, value) => {
  const presets = UNIT_PRESETS[unit] || []
  return presets.includes(value)
}

export const clampUnitValue = (unit, value) => {
  const bounds = UNIT_BOUNDS[unit]
  if (!bounds || !Number.isFinite(value)) return value
  return Math.min(bounds[1], Math.max(bounds[0], value))
}

// ch⇄px ride CH_TO_PX; anything touching % rides the live canvas and
// returns null when the caller cannot provide one. The result snaps to a
// preset within 10% of the preset (80ch → 750px; 750px → 80% on the
// reference canvas). Values are integers — the stepper's grammar.
export const convertWidth = (value, fromUnit, toUnit, canvasWidth) => {
  if (!WIDTH_UNITS.includes(fromUnit) || !WIDTH_UNITS.includes(toUnit)) return null
  if (!Number.isFinite(value) || value <= 0) return null
  const asPixels = (v, unit) => {
    if (unit === 'px') return v
    if (unit === 'ch') return v * CH_TO_PX
    if (!Number.isFinite(canvasWidth) || canvasWidth < 0) return null
    return (v / 100) * canvasWidth
  }
  const pixels = asPixels(value, fromUnit)
  if (pixels === null) return null
  let converted
  if (toUnit === 'px') converted = pixels
  else if (toUnit === 'ch') converted = pixels / CH_TO_PX
  else {
    if (!Number.isFinite(canvasWidth) || canvasWidth < 0) return null
    converted = (pixels / canvasWidth) * 100
  }
  const rounded = Math.round(converted)
  const { value: snappedValue, snapped } = snapToPreset(rounded, toUnit)
  return { value: snappedValue, unit: toUnit, snapped }
}
// END_BLOCK_CONVERSION

// START_BLOCK_EFFECTIVE
// The one-call resolution: name the tier, project it onto the current
// canvas, hand the writer its box. Null only when the canvas cannot host
// a %-width answer (the host always knows its canvas; pure callers pass
// it explicitly).
export const resolveEffectiveWidth = (candidates, canvasWidth) => {
  const resolved = resolveWidth(candidates)
  const rendered = computeRenderedBox(resolved, canvasWidth)
  if (!rendered) return null
  const settingPx = widthToPixels(resolved, canvasWidth)
  return {
    value: resolved.value,
    unit: resolved.unit,
    source: resolved.source,
    settingPx,
    boxPx: rendered.boxPx,
    columnPx: rendered.columnPx,
    clamped: rendered.clamped,
    floored: rendered.floored
  }
}

// The recorded F-WINDOW-AUTO-RESIZE dependency (spec R-3): when the
// dormant window auto-fit revives, its target is the sidebar plus the
// EFFECTIVE page width — never the hardcoded EDITOR_IDEAL_CONTENT_WIDTH
// 820 again. Kept pure here so the future wiring cannot re-hardcode it.
export const computeAutoResizeTargetWidth = (effectiveBoxPx, { sidebarVisible = false, sidebarWidth = 0 } = {}) => {
  const box = Number.isFinite(effectiveBoxPx) ? effectiveBoxPx : 0
  const sidebarPart = sidebarVisible && Number.isFinite(sidebarWidth) && sidebarWidth > 0
    ? sidebarWidth
    : 0
  return sidebarPart + box
}
// END_BLOCK_EFFECTIVE

// START_BLOCK_WRITER
// The single writer (review finding F1): the effective value lands as an
// INLINE custom property on the editor root, which beats every theme
// stylesheet regardless of order — and util/theme.js addThemeStyle calls
// reapplyLastEditorWidth() at the end of every theme application, so
// theme→width and width→theme both settle on the effective value. The
// writer touches exactly one style property: a sidebar show/hide/drag
// re-run (corner C-3) is one property write per frame, never a content
// re-render.
let lastAppliedEditorWidth = null

export const applyEditorWidth = (effective, { doc = document } = {}) => {
  const box = effective && Number.isFinite(effective.boxPx) ? effective.boxPx : null
  if (box === null || !doc || !doc.documentElement) return null
  const applied = {
    boxPx: Math.round(box),
    source: effective.source || null
  }
  doc.documentElement.style.setProperty('--editorAreaWidth', `${applied.boxPx}px`)
  lastAppliedEditorWidth = applied
  return applied
}

export const reapplyLastEditorWidth = ({ doc = document } = {}) => {
  if (!lastAppliedEditorWidth || !doc || !doc.documentElement) return false
  doc.documentElement.style.setProperty('--editorAreaWidth', `${lastAppliedEditorWidth.boxPx}px`)
  return true
}

// The pipeline's hand-off (T-003): when the panel leaves this module's
// tier for the legacy global one (theme.js setEditorWidth re-declaring
// the variable from the raw preference), the inline property written here
// must GO — an inline value would out-rank the style element forever and
// the global setting would look dead. Removes the custom property and
// forgets the recorded value; true when something was actually cleared.
export const clearAppliedEditorWidth = ({ doc = document } = {}) => {
  const hadValue = !!lastAppliedEditorWidth
  lastAppliedEditorWidth = null
  if (!doc || !doc.documentElement) return hadValue
  const hadProperty = doc.documentElement.style.getPropertyValue('--editorAreaWidth') !== ''
  doc.documentElement.style.removeProperty('--editorAreaWidth')
  return hadValue || hadProperty
}

export const getLastAppliedEditorWidth = () => lastAppliedEditorWidth
// END_BLOCK_WRITER
