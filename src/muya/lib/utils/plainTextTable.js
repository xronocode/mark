// FILE: src/muya/lib/utils/plainTextTable.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Detect terminal-rendered plain-text tables (box-drawing borders or rule-aligned columns) and convert them to GFM pipe tables for smart paste, preserving surrounding context lines.
//   SCOPE: Pure text analysis and conversion only; no DOM, no clipboard access, no side effects. Returns null for anything that is not confidently a table so ordinary text, code and existing GFM tables pass through untouched.
//   DEPENDS: none (pure function module).
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; docs/acceptance/registry.json C-PASTE-ASCII-TABLES.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   plainTextTableToMarkdown - Entry point: return the full converted text for a detected plain-text table (boxed region or rule-aligned block, surrounding context preserved), else null. Internally: isBorderLine/looksLikeGfmTable gate detection, splitBoxedRow/findBoxedBlock locate the │-bordered region with its frame swallowed, alignedColumnSpans/findAlignedBlock locate a rule row with its header/body lines, sliceBySpans/escapeCell/rowsToGfm build the GFM rows, replaceBlock splices the table into the original text.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-11-17 C-PASTE-ASCII-TABLES: context-preserving rewrite — the boxed region is the contiguous span of │-carrying lines (border separators allowed inside, prose outside preserved); the aligned case reads its rule row before border filtering; both return the whole text with only the table span replaced.
//   PREV: v1.0.0 - 2026-11-17 C-PASTE-ASCII-TABLES: initial converter (boxed + rule-aligned, null declines).
// END_CHANGE_SUMMARY

const BOX_BORDER_CHARS = new Set('─━┄┈═╌╍-=┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬╭╮╯╰╶╷╸╹╺╻╼╽╾╿+|│┃┆┇┊┋')

const isBorderLine = (line) => {
  if (!line.trim()) return false
  for (const ch of line) {
    if (ch !== ' ' && !BOX_BORDER_CHARS.has(ch)) return false
  }
  return true
}

const looksLikeGfmTable = (lines) => {
  // A GFM table needs a header row with pipes and a delimiter row like
  // | --- | --- |. If the clipboard already carries that shape, the
  // Markdown parser handles it natively — converting again would only
  // escape the existing pipes.
  for (let i = 0; i + 1 < lines.length; i++) {
    const header = lines[i]
    const delimiter = lines[i + 1]
    if (header.includes('|') && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(delimiter)) {
      return true
    }
  }
  return false
}

const splitBoxedRow = (line) =>
  line
    .split('│')
    .slice(1, -1)
    .map((cell) => cell.trim())

const alignedColumnSpans = (line) => {
  // Rule rows look like "─── ─────── ──" or "----+-----+--": runs of
  // horizontal runes, at least two, separated by junction characters or
  // spaces.
  const spans = []
  const re = /[─━┄┈═╌╍\-=]{2,}/g
  let match
  while ((match = re.exec(line))) {
    spans.push([match.index, match.index + match[0].length])
  }
  return spans.length >= 2 ? spans : null
}

const sliceBySpans = (line, spans) =>
  spans.map(([start, end]) => line.slice(start, end).trim())

const escapeCell = (cell) =>
  cell.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

const rowsToGfm = (rows) => {
  const width = rows[0].length
  // Ragged rows pad with empty cells; overlong rows are clipped so a
  // stray glyph cannot add phantom columns.
  const normalized = rows.map((row) => {
    const cells = row.slice(0, width).map(escapeCell)
    while (cells.length < width) cells.push('')
    return cells
  })
  const lines = normalized.map((cells) => `| ${cells.join(' | ')} |`)
  lines.splice(1, 0, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`)
  return lines.join('\n')
}

const replaceBlock = (lines, start, end, table) => {
  const before = lines.slice(0, start).filter((line) => line.trim().length > 0)
  const after = lines.slice(end).filter((line) => line.trim().length > 0)
  const parts = []
  if (before.length) parts.push(before.join('\n'), '')
  parts.push(table)
  if (after.length) parts.push('', after.join('\n'))
  return parts.join('\n')
}

const findBoxedBlock = (lines) => {
  const boxed = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('│')) boxed.push(i)
  }
  if (boxed.length < 2) return null
  // The boxed region must be contiguous: between the first and last
  // │-carrying line only border-only separator lines are allowed.
  for (let i = boxed[0]; i <= boxed[boxed.length - 1]; i++) {
    if (!lines[i].includes('│') && !isBorderLine(lines[i])) return null
  }
  // Swallow the surrounding border-only frame lines (┌…┐ top, └…┘
  // bottom) so they do not leak into the preserved context as art.
  let start = boxed[0]
  while (start - 1 >= 0 && isBorderLine(lines[start - 1])) start--
  let end = boxed[boxed.length - 1] + 1
  while (end < lines.length && isBorderLine(lines[end])) end++
  const rows = boxed.map((i) => splitBoxedRow(lines[i]))
  if (!rows.every((row) => row.length >= 2)) return null
  return { start, end, rows }
}

const findAlignedBlock = (lines) => {
  for (let r = 1; r + 1 < lines.length; r++) {
    const spans = alignedColumnSpans(lines[r])
    if (!spans || !isBorderLine(lines[r])) continue
    // Header lines directly above the rule, body lines directly below;
    // a blank or border line ends each side's run.
    let start = r
    while (start - 1 >= 0 && lines[start - 1].trim() && !isBorderLine(lines[start - 1])) start--
    let end = r + 1
    while (end < lines.length && lines[end].trim() && !isBorderLine(lines[end])) end++
    if (r - start < 1 || end - (r + 1) < 1) continue
    const rows = [...lines.slice(start, r), ...lines.slice(r + 1, end)].map((line) =>
      sliceBySpans(line, spans)
    )
    if (rows.length >= 2 && rows.every((row) => row.some((cell) => cell.length > 0))) {
      return { start, end, rows }
    }
  }
  return null
}

export const plainTextTableToMarkdown = (rawText) => {
  if (typeof rawText !== 'string' || rawText.length < 5) return null
  const lines = rawText.replace(/\r/g, '').split('\n')
  if (looksLikeGfmTable(lines)) return null

  const boxed = findBoxedBlock(lines)
  if (boxed) {
    return replaceBlock(lines, boxed.start, boxed.end, rowsToGfm(boxed.rows))
  }

  const aligned = findAlignedBlock(lines)
  if (aligned) {
    return replaceBlock(lines, aligned.start, aligned.end, rowsToGfm(aligned.rows))
  }

  return null
}
