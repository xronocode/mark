// FILE: src/renderer/src/util/markdownFormat.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure idempotent Format-document normalizer over markdown text (C-17 P0-B), reusing the shared line classifiers.
//   SCOPE: Trailing-whitespace stripping, blank-line structure around headings/lists, setext→ATX conversion, heading-cascade demotion — all outside fenced code and front matter; returns null when nothing changes.
//   DEPENDS: markdownLint.js classifiers (classifyHeadingLine, isListLine, isFenceLine, closesFence, frontMatterEnd, isThematicBreak).
//   LINKS: .grace/changes/active/C-17; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 scenario-30.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   formatMarkdown - Normalizes the document per MD009/MD032/MD003/MD001(fix); idempotent; code contents and front matter verbatim; null when already canonical.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-22 v1.1.0: review-1 hardening — front matter passed through verbatim; fence tracking uses closersFence (char+length+no-info) so nested fences keep their contents intact; after-list blank insertion only before headings/fences (lazy continuations never split); before-list insertion only after paragraph starts/headings/fence closers.
//   - 2026-09-22 v1.0.0: C-17 P0-B — canonicalizing formatter; semantics-preserving (text, links, inline code untouched); shares classifiers with markdownLint.js (R-4).
// END_CHANGE_SUMMARY

import {
  classifyHeadingLine,
  isListLine,
  isFenceLine,
  closesFence,
  frontMatterEnd
} from './markdownLint'

/**
 * Canonicalize a markdown document (C-17 Format document).
 *
 * Outside front matter and fenced code blocks:
 *   - strip trailing whitespace (MD009)
 *   - convert setext headings to ATX (MD003)
 *   - demote heading-level jumps to parent+1 (MD001)
 *   - ensure exactly one blank line before headings and around list
 *     groups where that cannot split a lazy continuation (MD032)
 * Front matter and fenced-code CONTENTS are copied verbatim.
 *
 * @param {string} markdown - full document text (LF line endings)
 * @returns {string|null} the formatted document, or null when the input is
 *   already canonical (lets callers skip history churn).
 */
// START_BLOCK_FORMAT_DOCUMENT
export const formatMarkdown = (markdown) => {
  if (typeof markdown !== 'string' || markdown.length === 0) return null
  const lines = markdown.split('\n')
  const fmEnd = frontMatterEnd(lines)

  // Pass 1: normalize each line outside front matter/code — trailing WS,
  // setext→ATX, cascade demotion.
  const normalized = []
  let fence = null
  let prevHeadingLevel = 0
  for (let i = 0; i < lines.length; i++) {
    if (i <= fmEnd) {
      normalized.push(lines[i]) // front matter — verbatim
      continue
    }
    const line = lines[i]
    const fenceInfo = isFenceLine(line)
    if (fence) {
      if (closesFence(line, fence)) fence = null
      normalized.push(line) // code content — verbatim
      continue
    }
    if (fenceInfo) {
      fence = fenceInfo
      normalized.push(line.replace(/[ \t]+$/, ''))
      continue
    }

    const heading = classifyHeadingLine(lines, i)
    if (heading) {
      if (heading.style === 'setext') i += 1 // consume the underline line
      let level = heading.level
      if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
        level = prevHeadingLevel + 1 // MD001 demotion
      }
      prevHeadingLevel = level
      normalized.push(`${'#'.repeat(level)} ${heading.text}`)
      continue
    }

    normalized.push(line.replace(/[ \t]+$/, ''))
  }

  // Pass 2: blank-line structure around headings and list groups, still
  // opaque to front matter and fences.
  const out = []
  fence = null
  for (let i = 0; i < normalized.length; i++) {
    if (i <= fmEnd) {
      out.push(normalized[i]) // front matter — verbatim
      continue
    }
    const line = normalized[i]
    const fenceInfo = isFenceLine(line)
    if (fence) {
      if (closesFence(line, fence)) fence = null
      out.push(line)
      continue
    }
    if (fenceInfo) {
      fence = fenceInfo
      out.push(line)
      continue
    }

    const heading = classifyHeadingLine(normalized, i)
    const startsList = isListLine(line) && !(i > 0 && isListLine(normalized[i - 1]))

    if (heading || startsList) {
      // One blank line BEFORE a heading (any preceding content) or before a
      // list (only when the preceding line is a heading, a paragraph START,
      // or a closing fence — inserting anywhere else could split a lazy
      // list continuation).
      let before = out.length > 0
      if (before) {
        const last = out[out.length - 1]
        if (last.trim() === '' || isFenceLine(last) !== null) {
          before = false
        } else if (startsList) {
          const prevIsHeading = classifyHeadingLine(normalized, i - 1) !== null
          const prevStartsParagraph =
            i < 2 ||
            normalized[i - 2].trim() === '' ||
            isFenceLine(normalized[i - 2]) !== null ||
            classifyHeadingLine(normalized, i - 2) !== null
          before = prevIsHeading || prevStartsParagraph
        }
      }
      if (before) out.push('')
    }
    out.push(line)

    if (heading && i + 1 < normalized.length) {
      // One blank line AFTER a heading before other content.
      const next = normalized[i + 1]
      if (next.trim() !== '' && isFenceLine(next) === null && !isListLine(next)) out.push('')
    }

    if (startsList) {
      // Flush the whole list group; insert the AFTER blank only before a
      // heading or a fence — running paragraph text after a list may be a
      // lazy continuation and must never be split.
      let j = i
      while (j + 1 < normalized.length && isListLine(normalized[j + 1])) j += 1
      while (i < j) {
        i += 1
        out.push(normalized[i])
      }
      if (i + 1 < normalized.length) {
        const next = normalized[i + 1]
        const nextIsHeading = classifyHeadingLine(normalized, i + 1) !== null
        const nextOpensFence = isFenceLine(next) !== null
        if (next.trim() !== '' && (nextIsHeading || nextOpensFence)) out.push('')
      }
    }
  }

  const result = out.join('\n')
  return result === markdown ? null : result
}
// END_BLOCK_FORMAT_DOCUMENT
