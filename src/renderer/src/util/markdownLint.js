// FILE: src/renderer/src/util/markdownLint.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure markdownlint-subset validator over document text lines (C-17 P0-A) plus the line classifiers shared with the formatter.
//   SCOPE: Stateless rule evaluation (MD001/003/009/025/032/040) and line classification helpers; no DOM, no store, no side effects.
//   DEPENDS: none (pure).
//   LINKS: .grace/changes/active/C-17; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 scenario-30.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   lintMarkdown - Runs the rule subset over markdown text; returns [{rule, line, excerpt, message}] sorted by line.
//   classifyHeadingLine - ATX/setext heading classifier used by lint rules and the formatter.
//   isListLine - Ordered/unordered list-item classifier (thematic breaks excluded).
//   isFenceLine - Fence opener/closer classifier with marker char, raw length, and info string.
//   closesFence - Valid-closer check: same marker char, length ≥ opener, no info string.
//   frontMatterEnd - Index of the closing front-matter delimiter line, or -1 when the document has none.
//   isThematicBreak - Recognizes *** / ___ / --- separator lines (any spacing).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-22 v1.1.0: review-1 hardening — front matter treated as opaque (blocker fix); setext candidacy excludes blockquotes and thematic breaks; fence closers must match the opener char, be at least as long, and carry no info string; MD032 list rule exempts fence-adjacent and lazy-continuation lines; hasAtx computed fence-aware; thematic-break shapes excluded from isListLine.
//   - 2026-09-22 v1.0.0: C-17 P0-A — MD001/003/009/025/032/040 over text lines; fenced-code contents ignored by every rule; classifiers shared with markdownFormat.js (R-4).
// END_CHANGE_SUMMARY

const ATX_HEADING_REG = /^(#{1,6})\s+(.*\S)\s*$/
const SETEXT_UNDERLINE_REG = /^(={3,}|-{3,})\s*$/
const LIST_LINE_REG = /^(\s*)([-*+]|\d{1,9}[.)])\s+/
const FENCE_REG = /^(\s{0,3})(`{3,}|~{3,})(.*)$/
const TRAILING_WS_REG = /[ \t]+$/
const THEMATIC_BREAK_REG = /^ {0,3}((\*[ \t]*){3,}|(_[ \t]*){3,}|(-[ \t]*){3,})$/

// START_BLOCK_LINT_RULES
/**
 * Front matter: muya exports `---\nkey: value\n---\n` blocks at the very
 * start of the document (exportMarkdown front-matter pass). Everything up
 * to and including the closing delimiter is opaque to every rule.
 */
export const frontMatterEnd = (lines) => {
  if (lines.length === 0 || lines[0].trim() !== '---') return -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return i
  }
  return -1
}

export const isThematicBreak = (line) => THEMATIC_BREAK_REG.test(line)

/**
 * Classify a line as a heading.
 * Returns { level, text, style: 'atx'|'setext' } or null. Setext requires
 * the NEXT line to be an =/- underline under a plain paragraph line:
 * blockquotes, thematic breaks, ATX headings, list items, fences, and
 * front-matter delimiters never qualify as setext text.
 */
export const classifyHeadingLine = (lines, i) => {
  const line = lines[i]
  const atx = ATX_HEADING_REG.exec(line)
  if (atx) {
    return { level: atx[1].length, text: atx[2], style: 'atx' }
  }
  if (i + 1 < lines.length && lines[i].trim() !== '') {
    const underline = SETEXT_UNDERLINE_REG.exec(lines[i + 1])
    if (underline) {
      const prev = lines[i]
      if (
        !ATX_HEADING_REG.test(prev) &&
        !LIST_LINE_REG.test(prev) &&
        !FENCE_REG.test(prev) &&
        !prev.trim().startsWith('>') &&
        !isThematicBreak(prev)
      ) {
        const level = underline[1][0] === '=' ? 1 : 2
        return { level, text: prev.trim(), style: 'setext' }
      }
    }
  }
  return null
}

export const isListLine = (line) => LIST_LINE_REG.test(line) && !isThematicBreak(line)

/**
 * Fence classifier: returns { marker, length, info } for a fence-shaped
 * line, else null. `marker` is the opening char, `length` the raw run
 * length (closers must be >= the opener's length and carry no info).
 */
export const isFenceLine = (line) => {
  const m = FENCE_REG.exec(line)
  if (!m) return null
  return { marker: m[2][0], length: m[2].length, info: m[3].trim() }
}

/** True when `line` validly CLOSES a fence opened with `opener`. */
export const closesFence = (line, opener) => {
  const f = isFenceLine(line)
  return !!f && f.marker === opener.marker && f.length >= opener.length && f.info === ''
}
// END_BLOCK_LINT_RULES

const excerptOf = (line) => {
  const t = line.trim()
  return t.length > 60 ? `${t.slice(0, 57)}…` : t
}

/**
 * Run the C-17 rule subset over markdown text.
 *
 * @param {string} markdown - full document text (LF line endings)
 * @returns {Array<{rule: string, line: number, excerpt: string, message: string}>}
 *   `line` is 1-based; sorted by line then rule id.
 */
export const lintMarkdown = (markdown) => {
  if (typeof markdown !== 'string' || markdown.length === 0) return []
  const lines = markdown.split('\n')
  const issues = []
  const add = (rule, line, message) =>
    issues.push({ rule, line, excerpt: excerptOf(lines[line - 1] ?? ''), message })

  const fmEnd = frontMatterEnd(lines)

  // Fence-aware pre-pass: does the document (outside code/front matter)
  // contain any ATX heading? MD003 only fires on style MIXES.
  let hasAtx = false
  {
    let fence = null
    for (let i = 0; i < lines.length; i++) {
      if (i <= fmEnd) continue
      const line = lines[i]
      const f = isFenceLine(line)
      if (fence) {
        if (closesFence(line, fence)) fence = null
        continue
      }
      if (f) {
        fence = f
        continue
      }
      if (ATX_HEADING_REG.test(line)) {
        hasAtx = true
        break
      }
    }
  }

  let fence = null
  let prevHeadingLevel = 0
  let h1Count = 0

  for (let i = 0; i < lines.length; i++) {
    if (i <= fmEnd) continue // front matter is opaque
    const line = lines[i]
    const fenceInfo = isFenceLine(line)
    if (fence) {
      if (closesFence(line, fence)) fence = null
      // Fenced-code CONTENTS are ignored by every rule.
      continue
    }
    if (fenceInfo) {
      if (!fenceInfo.info) {
        add('md040', i + 1, 'Fenced code blocks must have a language specified')
      }
      fence = fenceInfo
      continue
    }

    // MD009 — trailing whitespace (outside code).
    if (TRAILING_WS_REG.test(line)) {
      add('md009', i + 1, 'Lines must not end with trailing whitespace')
    }

    const heading = classifyHeadingLine(lines, i)
    if (heading) {
      // MD003 — when the document mixes styles, the setext ones are flagged.
      if (heading.style === 'setext' && hasAtx) {
        add('md003', i + 1, 'Headings should use a consistent style (ATX expected)')
      }
      // MD025 — only one top-level heading.
      if (heading.level === 1) {
        h1Count += 1
        if (h1Count > 1) {
          add('md025', i + 1, 'Multiple top-level headings detected — only one H1 allowed')
        }
      }
      // MD001 — heading levels may only increment by one.
      if (prevHeadingLevel > 0 && heading.level > prevHeadingLevel + 1) {
        add('md001', i + 1, `Heading levels can only increment by one (h${prevHeadingLevel} → h${heading.level})`)
      }
      prevHeadingLevel = heading.level
      // MD032 — headings need a blank line before (doc start and a closing
      // fence read as separated already).
      if (i > 0) {
        const prev = lines[i - 1]
        const prevIsBlank = prev.trim() === ''
        const prevClosesFenceLine = isFenceLine(prev) !== null && i - 1 > fmEnd
        if (!prevIsBlank && !prevClosesFenceLine) {
          add('md032', i + 1, 'Headings must be surrounded by blank lines')
        }
      }
      continue
    }

    // MD032 — lists need a blank line before. Deliberately conservative to
    // avoid lazy-continuation false positives: a list is only flagged when
    // the previous line is a heading or a paragraph START (the line before
    // it is blank, a heading, or structural) — not when it directly follows
    // running paragraph text that may be a lazy list continuation.
    if (isListLine(line) && i > 0 && i - 1 > fmEnd) {
      const prev = lines[i - 1]
      if (prev.trim() !== '' && !isListLine(prev) && isFenceLine(prev) === null) {
        const prev2 = i > 1 ? lines[i - 2] : ''
        const prevIsHeading = classifyHeadingLine(lines, i - 1) !== null
        const prevStartsParagraph =
          prev2.trim() === '' || isFenceLine(prev2) !== null || classifyHeadingLine(lines, i - 2) !== null
        if (prevIsHeading || prevStartsParagraph) {
          add('md032', i + 1, 'Lists must be surrounded by blank lines')
        }
      }
    }
  }

  return issues.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
}
