// FILE: src/muya/lib/parser/render/contentTheme.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Theme the non-Mermaid rendered content (C-51 T-005 / R-3) — build the Vega-Lite embed config, the flowchart.js drawSVG options and the js-sequence drawSVG options from the active app theme's tokens (readActiveThemeTokens from mermaidTheme.js), and re-colour the js-sequence SVG after drawing.
//   SCOPE: pure config/option builders over the theme-token shape plus a lazy DOM post-pass over a drawn js-sequence SVG (svg.sequence) — no renderer loading, no caching, no markdown mutation (theming is render-time only).
//   DEPENDS: ./mermaidTheme (chartPalette, palette — the SAME categorical palette Mermaid uses).
//   LINKS: .grace/changes/active/C-51 T-005 (R-3); .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-23; consumers: parser/render/index.js renderDiagram, utils/exportHtml.js renderDiagram.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   buildVegaThemeConfig - theme tokens → Vega-Lite config (transparent background, theme font, axis/legend/title/header colours from text/muted/border, mark default colour + range.category = chartPalette) passed as embed opts.config — the user's own spec.config wins (vega-embed merges spec.config over opts.config, sub-objects wholesale).
//   buildFlowchartThemeOptions - theme tokens → flowchart.js drawSVG options (line-color, element-color, fill, font-color, font-family).
//   buildSequenceThemeOptions - theme tokens + the sequenceTheme preference → js-sequence drawSVG options ('simple' gets the theme font; 'hand' keeps its hand-drawn danielbd font).
//   applySequenceTheme - post-pass over a drawn svg.sequence (editor container or export container) repainting text/lines/boxes/notes/markers with the theme tokens — js-sequence-diagrams hard-codes #000 strokes and #fff fills and offers no colour options.
//   applySequenceThemeWhenDrawn - repaint now and while the async «hand» theme finishes drawing (bounded MutationObserver).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-005: first version. Vega-Lite
//   gets a token-built config (the named latimes/dark themes are gone),
//   flowchart.js gets token colours + the theme font, js-sequence keeps
//   the hand/simple preference with the simple theme on the app font and
//   both themes re-coloured via applySequenceTheme; KaTeX needs no code —
//   it inherits the text colour (no hard-coded colour in katex.css or the
//   muya math styles, pinned in the e2e).
// END_CHANGE_SUMMARY

import { chartPalette, palette } from './mermaidTheme'

// START_BLOCK_CONTENT_VEGA_CONFIG
// Vega-Lite defaults that fight the app theme: background 'white', mark
// colour #4c78a8 (Tableau10), rule/text marks 'black', Helvetica labels.
// The config below replaces them with the theme tokens; the categorical
// range is the SAME palette Mermaid uses (chartPalette — the theme's
// --chartPalette when present, else the OKLCH palette from the accent).
// background stays null (transparent) so the block's own
// --codeBlockBgColor panel (assets/styles/index.css) shows through — the
// same panel every other diagram sits on. Passed as embed opts.config:
// vega-embed hands it to vega-lite compile as `mergeConfig(opt.config,
// inputSpec.config)` — the user's own spec.config wins (sub-objects
// replace wholesale), exactly the %%{init}%%-style precedence Mermaid has.
export const buildVegaThemeConfig = (t) => {
  const series = chartPalette(t)
  return {
    background: null,
    font: t.font,
    mark: { color: series[0] },
    text: { color: t.text },
    rule: { color: t.line },
    axis: {
      domainColor: t.border,
      tickColor: t.border,
      gridColor: t.border,
      labelColor: t.muted,
      titleColor: t.muted
    },
    legend: {
      labelColor: t.muted,
      titleColor: t.muted
    },
    title: {
      color: t.text,
      subtitleColor: t.muted
    },
    header: {
      labelColor: t.text,
      titleColor: t.text
    },
    range: {
      category: series
    }
  }
}
// END_BLOCK_CONTENT_VEGA_CONFIG

// START_BLOCK_CONTENT_FLOWCHART_OPTIONS
// flowchart.js drawSVG options — only colours and the font; layout stays
// the library default. line-color drives the connectors AND the Raphael
// block arrowheads (they inherit the line's stroke), element-color the
// shape strokes, fill the shape plates, font-color every label (the
// yes/no branch labels included — 'yes-text'/'no-text' are label STRINGS
// in flowchart.js, not colours).
export const buildFlowchartThemeOptions = (t) => ({
  'line-color': t.line,
  'element-color': t.border,
  'fill': t.surface,
  'font-color': t.text,
  'font-family': t.font
})
// END_BLOCK_CONTENT_FLOWCHART_OPTIONS

// START_BLOCK_CONTENT_SEQUENCE_OPTIONS
// js-sequence drawSVG options. The hand/simple preference (a muya option,
// default 'hand') is passed through untouched — only 'simple' gets the
// theme font: 'hand' is the hand-DRAWN look and its danielbd font is the
// point of it. An unset preference is left unset so the library default
// ('hand') keeps applying, exactly as before C-51.
export const buildSequenceThemeOptions = (t, sequenceTheme) => {
  const options = {}
  if (sequenceTheme) {
    options.theme = sequenceTheme
  }
  if (sequenceTheme === 'simple') {
    options['font-family'] = t.font
  }
  return options
}
// END_BLOCK_CONTENT_SEQUENCE_OPTIONS

// START_BLOCK_CONTENT_SEQUENCE_REPAINT
// js-sequence-diagrams hard-codes its colours: LINE = stroke #000,
// RECT = stroke #000 / fill #fff, text has no fill (black), and the snap
// themes expose no colour options. Repaint the drawn SVG instead —
// render-time only, the diagram source never changes:
//   - text → the theme text colour (readable on dark themes);
//   - connectors (line elements; fill="none" paths) → the line token;
//   - boxes (rect elements; filled paths) → surface plate + border
//     stroke (hand-theme boxes are wobbly paths, distinguished from
//     lifelines by their non-"none" fill attribute);
//   - notes → an accent tint pair (pre-T-012 this matched Mermaid's
//     noteBkgColor/noteBorderColor; since C-51 T-012 Mermaid's own notes
//     follow the node fill/border derived against the code-block panel);
//   - arrowhead markers (in <marker>) → the line colour.
export const applySequenceTheme = (container, t) => {
  if (!container || typeof container.querySelectorAll !== 'function') {
    return
  }
  const svg = container.querySelector('svg.sequence')
  if (!svg) {
    return
  }
  // js-sequence's own accent tint pair for notes (Mermaid's notes follow
  // the T-012 node colours derived against the code-block panel).
  // js-sequence paints through inline styles / its stylesheet, which beat
  // presentation attributes — write the inline style too (review 2026-10-16:
  // the text stayed black although the attribute was set).
  const paint = (el, prop, value) => {
    el.setAttribute(prop, value)
    el.style.setProperty(prop, value)
  }
  const noteFill = palette(t.accent, t.dark ? 0.36 : 0.9, 0.05)[0]
  const noteStroke = palette(t.accent, t.dark ? 0.5 : 0.76, t.dark ? 0.07 : 0.08)[0]

  const boxColours = (box) => {
    if (box.closest('g.note')) {
      paint(box, 'fill', noteFill)
      paint(box, 'stroke', noteStroke)
    } else {
      paint(box, 'fill', t.surface)
      paint(box, 'stroke', t.border)
    }
  }

  for (const text of svg.querySelectorAll('text')) {
    paint(text, 'fill', t.text)
  }
  for (const line of svg.querySelectorAll('line')) {
    paint(line, 'stroke', t.line)
  }
  for (const rect of svg.querySelectorAll('rect')) {
    boxColours(rect)
  }
  for (const path of svg.querySelectorAll('path')) {
    if (path.closest('marker')) {
      paint(path, 'fill', t.line)
      paint(path, 'stroke', t.line)
    } else if (path.closest('g.note')) {
      boxColours(path)
    } else if (path.getAttribute('fill') === 'none') {
      paint(path, 'stroke', t.line)
    } else {
      boxColours(path)
    }
  }
}

// js-sequence's «hand» theme draws only after its web font loads, so the
// SVG can appear after drawSVG returns (review 2026-10-16: text stayed
// black). Repaint now and again whenever the container's SVG changes, for
// a bounded time; the observer disconnects itself.
// One live observer per container: a re-render (theme switch) must retire
// the previous one, or it would repaint the new SVG with the old tokens.
const sequenceObservers = new WeakMap()

export const applySequenceThemeWhenDrawn = (container, t, timeoutMs = 4000) => {
  if (container && sequenceObservers.has(container)) {
    sequenceObservers.get(container).disconnect()
    sequenceObservers.delete(container)
  }
  applySequenceTheme(container, t)
  if (!container || typeof MutationObserver === 'undefined') {
    return
  }
  let painting = false
  const observer = new MutationObserver(() => {
    if (painting) return
    painting = true
    try {
      applySequenceTheme(container, t)
    } finally {
      painting = false
    }
  })
  observer.observe(container, { childList: true, subtree: true })
  sequenceObservers.set(container, observer)
  setTimeout(() => {
    observer.disconnect()
    if (sequenceObservers.get(container) === observer) sequenceObservers.delete(container)
  }, timeoutMs)
}
// END_BLOCK_CONTENT_SEQUENCE_REPAINT
