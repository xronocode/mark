// FILE: src/muya/lib/utils/diagramAppearance.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Read/write per-diagram appearance metadata and apply safe author/fixed palettes to Pele previews and exports.
//   SCOPE: Header-only namespaced comment edits; bounded YAML/init color extraction; four-mode resolution; local CSS variables and displayed inline-color normalization.
//   DEPENDS: yaml.parseDocument; DOM CSSStyleDeclaration for application only.
//   LINKS: .grace/changes/archive/C-62 R-1 through R-5; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   APPEARANCE_MODES - valid persisted modes in menu order.
//   readDiagramAppearance - safe requested/effective mode, author palette and header editability.
//   writeDiagramAppearance - replace only the header metadata comment; preserve every other source byte.
//   stripDiagramAppearance - remove header mode comments for a palette-independent raw SVG cache.
//   applyDiagramAppearance - set/remove local color overrides on a preview/export wrapper and normalize displayed forced-mode colors.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-62: shared safe appearance policy and portable, comment-preserving mode metadata.
// END_CHANGE_SUMMARY

import { parseDocument } from 'yaml'

export const APPEARANCE_MODES = Object.freeze(['auto', 'custom', 'light', 'dark'])
const MAX_CONFIG_LENGTH = 16384
const MODE_LINE = /^[\t ]*%%[\t ]*mark:appearance[\t ]+([^\r\n]*?)[\t ]*%%[\t ]*(?:\r?\n|$)/gm
const HEX = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i
const COLOR_KEYS = {
  '--pele-bg': ['background'],
  '--pele-fg': ['primaryTextColor', 'textColor', 'actorTextColor', 'nodeTextColor', 'classText'],
  '--pele-surface': ['mainBkg', 'primaryColor', 'actorBkg'],
  '--pele-surface-alt': ['clusterBkg', 'secondaryColor', 'altBackground'],
  '--pele-border': ['nodeBorder', 'primaryBorderColor', 'actorBorder', 'clusterBorder'],
  '--pele-line': ['lineColor', 'signalColor', 'defaultLinkColor'],
  '--pele-muted': ['labelTextColor'],
  '--pele-accent': ['tertiaryColor']
}
const LIGHT = {
  '--pele-bg': '#fffdf8', '--pele-fg': '#29313b', '--pele-muted': '#4f5e73',
  '--pele-line': '#64748b', '--pele-surface': '#e8edf6', '--pele-surface-alt': '#f0f3f8',
  '--pele-border': '#71829b', '--pele-accent': '#2563eb',
  '--pele-series-1': '#426da9', '--pele-series-2': '#a65018', '--pele-series-3': '#287452',
  '--pele-series-4': '#b33f55', '--pele-series-5': '#6d55a0', '--pele-series-6': '#836900',
  '--pele-series-7': '#237381', '--pele-series-8': '#946335'
}
const DARK = {
  '--pele-bg': '#1b2230', '--pele-fg': '#e5ecf7', '--pele-muted': '#c0ccdf',
  '--pele-line': '#99acc9', '--pele-surface': '#303d55', '--pele-surface-alt': '#253047',
  '--pele-border': '#91a4c2', '--pele-accent': '#a9c7ff',
  '--pele-series-1': '#a9c7ff', '--pele-series-2': '#ffbc82', '--pele-series-3': '#88d5ae',
  '--pele-series-4': '#ffa5b7', '--pele-series-5': '#cfb3ff', '--pele-series-6': '#e8cd7f',
  '--pele-series-7': '#84d4e4', '--pele-series-8': '#d9b18b'
}
const MANAGED_VARIABLES = Object.keys(LIGHT)

const safeConfig = (text) => {
  if (!text || text.length > MAX_CONFIG_LENGTH) return {}
  try {
    const doc = parseDocument(text, { uniqueKeys: true, customTags: [], logLevel: 'silent' })
    if (doc.errors.length || doc.warnings.length) return {}
    const value = doc.toJS({ maxAliasCount: 10 })
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}

// Only leading comments are metadata. A lookalike inside a label/body is text.
const sourceHeader = (code) => {
  const front = /^(?:\uFEFF)?---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*(?:\r?\n|$)/.exec(code)
  const frontLength = front ? front[0].length : 0
  let end = frontLength
  let directive = false
  for (const line of code.slice(frontLength).match(/[^\n]*\n|[^\n]+$/g) || []) {
    const trimmed = line.trim()
    if (!directive && trimmed && !trimmed.startsWith('%%')) break
    if (trimmed.startsWith('%%{')) directive = true
    if (directive && /\}%%\s*$/.test(line)) directive = false
    end += line.length
  }
  return { front, frontLength, end, text: code.slice(0, end) }
}

// START_BLOCK_DIAGRAM_APPEARANCE_POLICY
export const readDiagramAppearance = (code = '', override) => {
  const header = sourceHeader(code)
  const comments = [...header.text.matchAll(MODE_LINE)]
  const stored = comments.length ? comments[comments.length - 1][1].trim() : 'auto'
  const requested = APPEARANCE_MODES.includes(override) ? override : APPEARANCE_MODES.includes(stored) ? stored : 'auto'
  let config = {}
  for (const match of header.text.matchAll(/%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?)\}%%/g)) {
    const next = safeConfig(match[1])
    config = { ...config, ...next, themeVariables: { ...config.themeVariables, ...next.themeVariables } }
  }
  // Frontmatter is the most explicit author config; it wins over old init directives.
  const yaml = header.front ? safeConfig(header.front[1]) : {}
  const frontConfig = yaml.config && typeof yaml.config === 'object' ? yaml.config : {}
  config = { ...config, ...frontConfig, themeVariables: { ...config.themeVariables, ...frontConfig.themeVariables } }
  const variables = config.themeVariables || {}
  const palette = {}
  for (const [target, keys] of Object.entries(COLOR_KEYS)) {
    const key = keys.find(key => typeof variables[key] === 'string' && HEX.test(variables[key]))
    if (key) palette[target] = variables[key]
  }
  for (let i = 1; i <= 8; i++) {
    const key = [`pie${i}`, `cScale${i - 1}`, `git${i - 1}`].find(key => typeof variables[key] === 'string' && HEX.test(variables[key]))
    if (key) palette[`--pele-series-${i}`] = variables[key]
  }
  const inline = /(?:^|;)[\t ]*(?:classDef|style|linkStyle)\s+[^\r\n]*(?:fill|stroke|color)\s*:/m.test(code.slice(header.end))
  const hasCustom = Object.keys(palette).length > 0 || inline
  const mode = requested === 'custom' && !hasCustom ? 'auto' : requested
  const darkCustom = variables.darkMode === true || config.theme === 'dark'
  return { mode, requested, hasCustom, palette, darkCustom, header }
}

export const stripDiagramAppearance = (code) => {
  const header = sourceHeader(code)
  return header.text.replace(MODE_LINE, '') + code.slice(header.end)
}

export const writeDiagramAppearance = (code, mode) => {
  if (!APPEARANCE_MODES.includes(mode)) throw new Error('Unknown diagram appearance')
  const current = readDiagramAppearance(code)
  const matches = [...current.header.text.matchAll(MODE_LINE)]
  if (current.requested === mode && matches.length <= 1 && (mode !== 'auto' || !matches.length)) return code
  const newline = code.includes('\r\n') ? '\r\n' : '\n'
  const clean = stripDiagramAppearance(code)
  if (mode === 'auto') return clean
  const header = sourceHeader(clean)
  const prefix = clean.slice(0, header.frontLength)
  const separator = prefix && !prefix.endsWith('\n') ? newline : ''
  return prefix + separator + `%% mark:appearance ${mode} %%` + newline + clean.slice(header.frontLength)
}

export const applyDiagramAppearance = (target, code, override) => {
  const appearance = readDiagramAppearance(code, override)
  for (const variable of MANAGED_VARIABLES) target.style.removeProperty(variable)
  target.style.removeProperty('background-color')
  const svg = target.querySelector('svg')
  svg?.style.removeProperty('background-color')
  const { mode } = appearance
  target.dataset.diagramAppearance = mode
  if (mode !== 'auto') {
    const base = mode === 'dark' || (mode === 'custom' && appearance.darkCustom) ? DARK : LIGHT
    for (const [key, value] of Object.entries({ ...base, ...(mode === 'custom' ? appearance.palette : {}) })) target.style.setProperty(key, value)
    // The editor gives SVGs an opaque code-block surface. Override the
    // SVG itself so the local background is visible, while the control
    // strip keeps the document's own chrome colors.
    if (svg) svg.style.backgroundColor = 'var(--pele-bg)'
  }
  if (mode === 'light' || mode === 'dark') {
    // Pele puts author classDef/style colors in inline style declarations,
    // above its normal presentation attributes. Drop only those paint overrides
    // from the DISPLAYED SVG; the raw cached SVG and Markdown stay untouched.
    for (const element of target.querySelectorAll('svg [style]')) {
      for (const property of ['fill', 'stroke', 'color']) {
        const value = element.style.getPropertyValue(property)
        if (value && !/^(?:none|transparent|inherit|currentcolor)$/i.test(value) && !value.includes('var(')) element.style.removeProperty(property)
      }
    }
  }
  return appearance
}
// END_BLOCK_DIAGRAM_APPEARANCE_POLICY
