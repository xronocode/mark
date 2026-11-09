// FILE: src/renderer/src/util/splitCommands.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Apply focused source-pane commands and search without a second document model.
//   SCOPE: Pure Markdown edits, position conversion and explicit command coverage.
//   DEPENDS: none.
//   LINKS: C-STABILIZE-SPLIT-DUAL-EDIT R-4; M-011, M-009.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   SPLIT_COMMAND_MATRIX - Exact command ids and source/rich routing policy.
//   applySourceCommand - Single replace-range edit and resulting selection, or an inapplicable reason.
//   sourceSearch - Case, word and regexp matches in source positions.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Complete focused-source commands for the recovery implementation.
// END_CHANGE_SUMMARY

export const SPLIT_COMMAND_MATRIX = {
  'edit.select-all': 'selection', 'edit.undo': 'history', 'edit.redo': 'history',
  'edit.duplicate': 'selection', 'edit.create-paragraph': 'selection', 'edit.delete-paragraph': 'selection',
  'edit.find': 'search', 'edit.find-next': 'search', 'edit.find-previous': 'search', 'edit.replace': 'search',
  'edit.screenshot': 'selection', 'edit.find-in-folder': 'workspace', 'edit.go-to-heading': 'document', 'edit.format-document': 'document',
  'edit.copy-as-html': 'selection', 'edit.copy-as-plain-text': 'selection',
  'edit.copy-as-structured-text': 'selection', 'edit.copy-as-markdown': 'selection',
  'paragraph.heading-1': 'selection', 'paragraph.heading-2': 'selection', 'paragraph.heading-3': 'selection',
  'paragraph.heading-4': 'selection', 'paragraph.heading-5': 'selection', 'paragraph.heading-6': 'selection',
  'paragraph.upgrade-heading': 'selection', 'paragraph.degrade-heading': 'selection', 'paragraph.table': 'selection',
  'paragraph.code-fence': 'selection', 'paragraph.quote-block': 'selection', 'paragraph.math-formula': 'selection',
  'paragraph.html-block': 'selection', 'paragraph.order-list': 'selection', 'paragraph.bullet-list': 'selection',
  'paragraph.task-list': 'selection', 'paragraph.loose-list-item': 'selection', 'paragraph.paragraph': 'selection',
  'paragraph.reset-paragraph': 'selection', 'paragraph.horizontal-line': 'selection', 'paragraph.front-matter': 'document',
  'format.strong': 'selection', 'format.emphasis': 'selection', 'format.underline': 'selection',
  'format.highlight': 'selection', 'format.superscript': 'selection', 'format.subscript': 'selection',
  'format.inline-code': 'selection', 'format.inline-math': 'selection', 'format.strike': 'selection',
  'format.hyperlink': 'selection', 'format.image': 'selection', 'format.clear-format': 'selection'
}

const indexAt = (text, pos) => {
  const lines = text.split('\n')
  const line = Math.max(0, Math.min(lines.length - 1, pos.line))
  return lines.slice(0, line).reduce((n, s) => n + s.length + 1, 0) + Math.max(0, Math.min(lines[line].length, pos.ch))
}
const positionAt = (text, index) => {
  const prefix = text.slice(0, index).split('\n')
  return { line: prefix.length - 1, ch: prefix.at(-1).length }
}
const inline = {
  strong: ['**', '**'], em: ['*', '*'], u: ['<u>', '</u>'], mark: ['==', '=='],
  sup: ['^', '^'], sub: ['~', '~'], inline_code: ['`', '`'], inline_math: ['$', '$'], del: ['~~', '~~'],
  link: ['[', '](https://)'], image: ['![', '](image.png)']
}

export const applySourceCommand = (markdown, selection, command, payload) => {
  let anchor = indexAt(markdown, selection.anchor)
  let head = indexAt(markdown, selection.head)
  let from = Math.min(anchor, head)
  let to = Math.max(anchor, head)
  let text = markdown.slice(from, to)
  const result = (replacement, start = 0, end = replacement.length) => ({ from, to, text: replacement, anchor: from + (anchor > head ? end : start), head: from + (anchor > head ? start : end) })
  if (command === 'insert') return result(String(payload), String(payload).length, String(payload).length)
  if (command === 'format') {
    if (payload === 'clear') {
      return result(text.replace(/(\*\*|__|~~|==|`|\*|_|\$|\^|~)/g, '').replace(/<\/?(?:u|sup|sub|mark)>/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'))
    }
    const pair = inline[payload]
    if (!pair) return { reason: `This formatting command is unavailable in Markdown source: ${payload}.` }
    if (markdown.slice(from - pair[0].length, from) === pair[0] && markdown.slice(to, to + pair[1].length) === pair[1]) {
      from -= pair[0].length; to += pair[1].length
      return result(text)
    }
    if (text.startsWith(pair[0]) && text.endsWith(pair[1]) && text.length >= pair[0].length + pair[1].length) return result(text.slice(pair[0].length, -pair[1].length))
    return result(pair[0] + text + pair[1], pair[0].length, pair[0].length + text.length)
  }
  // Paragraph operations affect complete selected lines. A selection ending at
  // column zero excludes that next line, matching the rich block selection.
  const first = Math.min(selection.anchor.line, selection.head.line)
  let last = Math.max(selection.anchor.line, selection.head.line)
  const end = anchor > head ? selection.anchor : selection.head
  if (last > first && end.ch === 0) last--
  const lines = markdown.split('\n')
  from = indexAt(markdown, { line: first, ch: 0 })
  to = indexAt(markdown, { line: last, ch: lines[last].length })
  text = markdown.slice(from, to)
  const plain = text.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/gm, '')
  if (command === 'duplicate') { from = to; return result('\n' + text, 1, text.length + 1) }
  if (command === 'createParagraph' || command === 'insertParagraph') {
    if (payload !== 'before') from = to
    else to = from
    to = from
    return result('\n\n', 2, 2)
  }
  if (command === 'deleteParagraph') { if (to < markdown.length) to++; return result('', 0, 0) }
  if (command === 'table') {
    const rows = Math.max(2, Math.min(100, Number(payload.rows) || 4))
    const columns = Math.max(1, Math.min(50, Number(payload.columns) || 3))
    const row = '| ' + Array(columns).fill(' ').join(' | ') + ' |'
    const separator = '| ' + Array(columns).fill('---').join(' | ') + ' |'
    return result([row, separator, ...Array(rows - 1).fill(row)].join('\n') + '\n', 2, 2)
  }
  if (command !== 'paragraph') return { reason: `This command is unavailable in Markdown source: ${command}.` }
  if (/^heading [1-6]$/.test(payload)) return result('#'.repeat(Number(payload.at(-1))) + ' ' + plain)
  switch (payload) {
    case 'upgrade heading':
    case 'degrade heading': {
      const current = /^(#{1,6})\s/.exec(text)?.[1].length || 0
      const level = Math.max(1, Math.min(6, current + (payload.startsWith('upgrade') ? -1 : 1)))
      return result('#'.repeat(level) + ' ' + plain)
    }
    case 'paragraph':
    case 'reset-to-paragraph': return result(plain.replace(/^```[^\n]*\n([\s\S]*?)\n```$/, '$1'))
    case 'pre': return result('```\n' + text + '\n```', 4, 4 + text.length)
    case 'mathblock': return result('$$\n' + text + '\n$$', 3, 3 + text.length)
    case 'html': return result('<div>\n' + text + '\n</div>', 6, 6 + text.length)
    case 'blockquote': return result(plain.split('\n').map(line => '> ' + line).join('\n'))
    case 'ol-bullet': return result(plain.split('\n').map((line, index) => `${index + 1}. ${line}`).join('\n'))
    case 'ul-bullet': return result(plain.split('\n').map(line => '* ' + line).join('\n'))
    case 'ul-task': return result(plain.split('\n').map(line => '* [ ] ' + line).join('\n'))
    case 'loose-list-item':
      if (!/^\s*(?:[-+*]|\d+[.)])\s/m.test(text)) return { reason: 'Loose list item requires a selected Markdown list item.' }
      return result(text.replace(/\n(?=\s*(?:[-+*]|\d+[.)])\s)/g, '\n\n'))
    case 'hr': return result(text + '\n\n---\n')
    case 'front-matter': from = to = 0; return result('---\n' + (text || 'title: ') + '\n---\n\n', 4, 4 + (text || 'title: ').length)
    default: return { reason: `This paragraph command is unavailable in Markdown source: ${payload}.` }
  }
}

export const sourceSearch = (markdown, value, options = {}) => {
  const matches = []
  if (!value) return { value, matches, index: -1 }
  let pattern = options.isRegexp ? value : value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (options.isWholeWord) pattern = `\\b(?:${pattern})\\b`
  let regexp
  try { regexp = new RegExp(pattern, options.isCaseSensitive ? 'g' : 'gi') } catch { return { value, matches, index: -1 } }
  for (const match of markdown.matchAll(regexp)) {
    matches.push({ start: positionAt(markdown, match.index), end: positionAt(markdown, match.index + match[0].length) })
  }
  return { value, matches, index: matches.length ? 0 : -1 }
}
