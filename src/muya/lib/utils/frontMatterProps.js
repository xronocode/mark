// FILE: src/muya/lib/utils/frontMatterProps.js
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Read flat YAML front matter into display rows for the read-only properties view.
//   SCOPE: Dependency-free parse of the subset agents write: `key: scalar`, quoted scalars, inline lists, block lists, comments. Anything outside that subset returns null so the caller keeps the plain YAML block. Never serialises: the file text is the only source of truth.
//   DEPENDS: none.
//   LINKS: .grace/changes/active/C-24 R-8; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   parseFrontMatterProps - YAML text -> [{ key, value: string | string[] }] or null when not flat/parseable.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.1 - C-24 review-1: `key: #c` is empty; one-pass unescape; block-list items must share one indent; trailing comma in inline lists.
//   v1.0.0 - C-24: flat YAML subset for the front matter properties view.
// END_CHANGE_SUMMARY

// START_BLOCK_FRONT_MATTER_PROPS
const KEY_REG = /^([A-Za-z_][\w .-]*?)[ \t]*:(?:[ \t]+(.*?))?[ \t]*$/
const LIST_ITEM_REG = /^([ \t]+)-[ \t]+(.*?)[ \t]*$/
// Plain scalars that start a construct this reader does not model.
const UNSUPPORTED_START = /^(?:[|>]|[&*!{]|\[.*[^\]]$)/

const unquote = (raw) => {
  if (raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"') {
    // One pass, so `\\n` stays a backslash + n and `\n` becomes a newline.
    return raw.slice(1, -1).replace(/\\(["\\n])/g, (_, c) => (c === 'n' ? '\n' : c))
  }
  if (raw.length >= 2 && raw[0] === "'" && raw[raw.length - 1] === "'") {
    return raw.slice(1, -1).replace(/''/g, "'")
  }
  return null
}

// A scalar: quoted (comments inside quotes are text) or plain (` #` starts a comment).
const scalar = (raw) => {
  const quoted = unquote(raw)
  if (quoted !== null) return quoted
  if (/^["']/.test(raw)) return undefined
  return raw.replace(/[ \t]+#.*$/, '')
}

// `[a, "b, c", 'd']` -> ['a', 'b, c', 'd']; undefined when unbalanced or nested.
const inlineList = (raw) => {
  const body = raw.slice(1, -1)
  const items = []
  let cur = ''
  let quote = null
  for (const ch of body) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      return undefined
    } else if (ch === ',') {
      items.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (quote) return undefined
  // YAML allows one trailing comma: `[a, b, ]` is two items.
  if (cur.trim()) items.push(cur.trim())
  const values = items.map(scalar)
  return values.includes(undefined) ? undefined : values
}

export const parseFrontMatterProps = (text) => {
  if (typeof text !== 'string' || !text.trim()) return null
  const rows = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || /^[ \t]*#/.test(line)) continue
    const m = KEY_REG.exec(line)
    if (!m || /^[ \t]/.test(line)) return null
    const key = m[1]
    // `key: #c` is an empty value plus a comment.
    const raw = /^#/.test(m[2] || '') ? '' : (m[2] || '').replace(/^(?!["'])(.*?)[ \t]+#.*$/, '$1')
    if (!raw) {
      // `key:` followed by `  - item` lines is a block list; any other
      // indented line means a nested map, which this reader does not model.
      const items = []
      let indent = null
      while (i + 1 < lines.length && (LIST_ITEM_REG.test(lines[i + 1]) || /^[ \t]*#/.test(lines[i + 1]) || !lines[i + 1].trim())) {
        i++
        const item = LIST_ITEM_REG.exec(lines[i])
        if (!item) continue
        // Items must share one indent; a deeper `- b` is not a sibling in YAML.
        if (indent === null) indent = item[1]
        else if (item[1] !== indent) return null
        const v = scalar(item[2])
        // `- name: a` is a list of maps, outside the flat subset.
        if (v === undefined || UNSUPPORTED_START.test(item[2]) || (!/^["']/.test(item[2]) && /:([ \t]|$)/.test(item[2]))) return null
        items.push(v)
      }
      if (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) return null
      rows.push({ key, value: items.length ? items : '' })
      continue
    }
    if (raw[0] === '[' && raw[raw.length - 1] === ']') {
      const list = inlineList(raw)
      if (list === undefined) return null
      rows.push({ key, value: list })
      continue
    }
    if (UNSUPPORTED_START.test(raw)) return null
    const v = scalar(raw)
    if (v === undefined) return null
    rows.push({ key, value: v })
  }
  return rows.length ? rows : null
}
// END_BLOCK_FRONT_MATTER_PROPS
