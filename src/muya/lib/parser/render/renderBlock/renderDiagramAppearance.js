// FILE: src/muya/lib/parser/render/renderBlock/renderDiagramAppearance.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Shared four-mode appearance button and translated copy for inline diagrams and the fullscreen viewer.
//   SCOPE: Snabbdom/DOM factories, fixed SVG glyph data and attribute-only button state updates.
//   DEPENDS: snabbdom.h, utils/diagramAppearance.
//   LINKS: .grace/changes/archive/C-62; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   APPEARANCE_BUTTON_SELECTOR - selector shared by event and keyboard routing.
//   appearanceText - translated appearance copy with English fallback.
//   createAppearanceButton - DOM factory for the viewer header.
//   updateAppearanceButton - update state/labels without replacing vnode-owned children.
//   default - inline diagram appearance button vnode.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-62: shared native-button affordance and four appearance icons.
// END_CHANGE_SUMMARY
import { h } from '../snabbdom'
import { APPEARANCE_MODES, readDiagramAppearance } from '../../../utils/diagramAppearance'

export const APPEARANCE_BUTTON_SELECTOR = 'button.ag-diagram-appearance'
const COPY = {
  label: 'Diagram appearance', auto: 'Auto', custom: 'Custom', light: 'Light', dark: 'Dark',
  autoDescription: 'Follow document theme', customDescription: 'Palette from Markdown',
  lightDescription: 'Always light', darkDescription: 'Always dark', noCustomPalette: 'No palette in Markdown',
  viewOnly: 'For this view only'
}
const GLYPHS = {
  auto: [['circle', { cx: 8, cy: 8, r: 5.5 }], ['path', { d: 'M8 2.5a5.5 5.5 0 0 1 0 11Z', fill: 'currentColor', stroke: 'none' }]],
  light: [['circle', { cx: 8, cy: 8, r: 3 }], ['path', { d: 'M8 1v1M8 14v1M1 8h1M14 8h1M3 3l.8.8M12.2 12.2l.8.8M3 13l.8-.8M12.2 3.8l.8-.8' }]],
  dark: [['path', { d: 'M13.3 10A5.7 5.7 0 0 1 6 2.7 5.7 5.7 0 1 0 13.3 10Z' }]],
  custom: [['path', { d: 'M8 2a6 6 0 1 0 0 12h1a1.6 1.6 0 0 0 1-2.8c-.6-.5-.3-1.2.4-1.2H12a2 2 0 0 0 2-2 6 6 0 0 0-6-6Z' }], ['circle', { cx: 5, cy: 6, r: .55, fill: 'currentColor' }], ['circle', { cx: 8, cy: 4.7, r: .55, fill: 'currentColor' }], ['circle', { cx: 11, cy: 6, r: .55, fill: 'currentColor' }]],
  chevron: [['path', { d: 'm4.5 6.5 3.5 3 3.5-3' }]]
}
const svgAttrs = { viewBox: '0 0 16 16', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }
export const appearanceText = (t, key) => {
  const full = `diagramAppearance.${key}`
  const value = typeof t === 'function' ? t(full) : null
  return value && value !== full ? value : COPY[key] || key
}
const label = (t, mode) => `${appearanceText(t, 'label')}: ${appearanceText(t, mode)}`
const iconVNode = mode => h('svg', { attrs: { ...svgAttrs, 'data-appearance-icon': mode } }, GLYPHS[mode].map(([tag, attrs]) => h(tag, { attrs })))

export const updateAppearanceButton = (button, t, mode) => {
  button.dataset.appearanceMode = mode
  button.title = label(t, mode)
  button.setAttribute('aria-label', label(t, mode))
}
export const createAppearanceButton = (t) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ag-diagram-appearance'
  button.setAttribute('aria-haspopup', 'menu')
  button.setAttribute('aria-expanded', 'false')
  for (const mode of [...APPEARANCE_MODES, 'chevron']) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    for (const [name, value] of Object.entries({ ...svgAttrs, 'data-appearance-icon': mode })) svg.setAttribute(name, value)
    for (const [tag, attrs] of GLYPHS[mode]) {
      const child = document.createElementNS(svg.namespaceURI, tag)
      for (const [name, value] of Object.entries(attrs)) child.setAttribute(name, value)
      svg.appendChild(child)
    }
    button.appendChild(svg)
  }
  updateAppearanceButton(button, t, 'auto')
  return button
}
export default (t, code) => {
  const { mode } = readDiagramAppearance(code)
  return h(APPEARANCE_BUTTON_SELECTOR, {
    attrs: { type: 'button', title: label(t, mode), 'aria-label': label(t, mode), 'aria-haspopup': 'menu', 'aria-expanded': 'false', contenteditable: 'false', tabindex: '0' },
    dataset: { appearanceMode: mode }
  }, [...APPEARANCE_MODES, 'chevron'].map(iconVNode))
}
