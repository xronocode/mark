// FILE: src/renderer/src/util/structuredText.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Turn rendered Markdown HTML into plain text that keeps the document structure (C-32 Copy as Structured Text).
//   SCOPE: Pure DOM walk over sanitized marked output: blank-line block separation (front matter skipped), "- "/"N. " list markers with nested indentation, task boxes, "text (url)" links, image alt/src, "> " quotes, " | " table cells, verbatim code, hr. No clipboard or editor access.
//   DEPENDS: DOMParser (browser/jsdom).
//   LINKS: .grace/changes/active/C-32; editor.vue handleCopyAsStructuredText; C-12 handleCopyAsPlainText (same render pipeline).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   htmlToStructuredText - sanitized HTML string → structure-preserving plain text.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-32: initial structured-text renderer (review: code keeps its first-line indent, raw-HTML source whitespace normalized, www autolinks and linked images not doubled, loose list items keep blank lines, front matter skipped).
// END_CHANGE_SUMMARY

const HR_TEXT = '———'

// marked emits the first row; the rest only come from raw HTML blocks and
// are kept so those containers still break into separate blocks.
const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE', 'HR',
  'DIV', 'FIGURE', 'SECTION', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD', 'ARTICLE', 'HEADER',
  'FOOTER', 'ASIDE', 'NAV', 'MAIN'
])

const isBlock = (node) => node.nodeType === 1 && BLOCK_TAGS.has(node.tagName)
const isListTag = (tag) => tag === 'UL' || tag === 'OL'

// START_BLOCK_STRUCTURED_TEXT_INLINE
// Lines of one paragraph: trim each line and drop empty ones — whitespace
// from HTML source formatting (raw HTML blocks) must not survive, and a
// paragraph cannot hold a blank line anyway.
const normalizeInline = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')

const stripScheme = (href) => href.replace(/^(?:https?:\/\/|mailto:)/i, '')

const linkText = (el) => {
  const label = inlineText(el, true).trim()
  const href = (el.getAttribute('href') || '').trim()
  if (el.classList.contains('footnote-ref')) return `[${label}]`
  if (!href || href.startsWith('#')) return label
  if (!label) return href
  if (label === href || stripScheme(label) === stripScheme(href)) return label
  return `${label} (${href})`
}

// A linked image shows only its alt: the link target replaces its src.
const imageText = (el, inLink) => {
  const alt = (el.getAttribute('alt') || '').trim()
  const src = (el.getAttribute('src') || '').trim()
  if (inLink || !src || src.startsWith('data:')) return alt
  return alt ? `${alt} (${src})` : src
}

function inlineText(node, inLink = false) {
  let out = ''
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out += child.nodeValue
      continue
    }
    if (child.nodeType !== 1) continue
    switch (child.tagName) {
      case 'BR':
        out += '\n'
        break
      case 'A':
        if (!child.classList.contains('footnote-back')) out += linkText(child)
        break
      case 'IMG':
        out += imageText(child, inLink)
        break
      case 'INPUT':
      case 'SCRIPT':
      case 'STYLE':
        break
      default:
        out += isBlock(child) ? renderBlocks(child).join('\n') : inlineText(child, inLink)
    }
  }
  return out
}
// END_BLOCK_STRUCTURED_TEXT_INLINE

// START_BLOCK_STRUCTURED_TEXT_BLOCKS
const indentLines = (text, firstPrefix, restPrefix) =>
  text
    .split('\n')
    .map((line, i) => (i === 0 ? firstPrefix : line ? restPrefix : '') + line)
    .join('\n')

const quoteLines = (text) =>
  text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')

function renderList(list) {
  const ordered = list.tagName === 'OL'
  const start = Number.parseInt(list.getAttribute('start'), 10)
  let n = Number.isFinite(start) ? start : 1
  const items = []
  let loose = false
  for (const li of list.children) {
    if (li.tagName !== 'LI') continue
    const marker = ordered ? `${n++}. ` : '- '
    const box = li.querySelector(':scope > input[type="checkbox"], :scope > p:first-child > input[type="checkbox"]')
    const task = box ? (box.hasAttribute('checked') ? '[x] ' : '[ ] ') : ''
    // A nested list hugs its parent line; other blocks of one item
    // (paragraphs, code, quotes) are separated by a blank line, and such
    // a multi-block item makes the whole list loose. Paragraph wrappers
    // alone do not: marked wraps tight items in <p> too.
    const parts = renderBlockParts(li)
    const blockCount = parts.filter((p) => !isListTag(p.tag)).length
    if (blockCount > 1) loose = true
    let body = ''
    for (const { text, tag } of parts) {
      if (body) body += isListTag(tag) ? '\n' : '\n\n'
      body += text
    }
    items.push(indentLines(task + body, marker, ' '.repeat(marker.length)))
  }
  return items.join(loose ? '\n\n' : '\n')
}

function renderTable(table) {
  const rows = []
  for (const tr of table.querySelectorAll('tr')) {
    const cells = [...tr.children]
      .filter((c) => c.tagName === 'TH' || c.tagName === 'TD')
      .map((c) => inlineText(c).replace(/\s*\n\s*/g, ' ').trim())
    if (cells.length) rows.push(cells.join(' | '))
  }
  return rows.join('\n')
}

function renderBlock(el) {
  switch (el.tagName) {
    case 'P':
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
    case 'DT':
    case 'SUMMARY':
      return normalizeInline(inlineText(el))
    case 'PRE':
      // Front matter is metadata, not document text.
      if (el.classList.contains('front-matter')) return ''
      return el.textContent.replace(/\s+$/, '')
    case 'BLOCKQUOTE':
      return quoteLines(renderBlocks(el).join('\n\n'))
    case 'UL':
    case 'OL':
      return renderList(el)
    case 'TABLE':
      return renderTable(el)
    case 'HR':
      return HR_TEXT
    default:
      return renderBlocks(el).join('\n\n')
  }
}

// Consecutive inline nodes form one anonymous paragraph (tight list items
// carry their text this way, next to a nested list). Parts keep their tag
// so a list can decide how to join an item's blocks.
function renderBlockParts(container) {
  const blocks = []
  let inline = null
  const flush = () => {
    if (inline === null) return
    const text = normalizeInline(inlineText(inline))
    if (text) blocks.push({ text, tag: null })
    inline = null
  }
  for (const child of container.childNodes) {
    if (isBlock(child)) {
      flush()
      const text = renderBlock(child)
      if (text) blocks.push({ text, tag: child.tagName })
    } else {
      if (inline === null) inline = container.ownerDocument.createElement('span')
      inline.appendChild(child.cloneNode(true))
    }
  }
  flush()
  return blocks
}

const renderBlocks = (container) => renderBlockParts(container).map((b) => b.text)
// END_BLOCK_STRUCTURED_TEXT_BLOCKS

// START_CONTRACT: htmlToStructuredText
//   PURPOSE: Render sanitized Markdown HTML as plain text that keeps paragraphs, list markers, link targets, quotes and table rows.
//   INPUTS: { html: string - sanitized marked output }
//   OUTPUTS: { string - structured plain text, blocks separated by one blank line; leading code indentation kept }
//   SIDE_EFFECTS: none
//   LINKS: C-32
// END_CONTRACT: htmlToStructuredText
export function htmlToStructuredText(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return renderBlocks(doc.body)
    .join('\n\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '')
}
