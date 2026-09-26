// FILE: src/renderer/src/util/linkCheck.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure dead-link checker for markdown documents (C-21) — missing relative file/image destinations and unresolvable in-document anchors.
//   SCOPE: Line-oriented destination extraction with markdownLint classifiers (code/front-matter immunity), github-slug anchor validation, injected statFn for file existence; no DOM, no store.
//   DEPENDS: markdownLint classifiers; muya generateGithubSlug.
//   LINKS: .grace/changes/active/C-21; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 scenario-33.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   checkMarkdownLinks - Async check: returns [{rule, line, excerpt, message}] for dead file/image/anchor destinations.
//   extractDestinations - Line-oriented destination scanner shared by tests (returns [{kind, dest, line}]).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-24 v1.0.0: C-21 — deadlink-file/image (subtree-clamped stat, per-run cache) + deadlink-anchor (github-slug vs document headings); URL/data/mailto/absolute skips; code+front-matter immune.
// END_CHANGE_SUMMARY

import { classifyHeadingLine, isFenceLine, closesFence, frontMatterEnd } from './markdownLint'
import { generateGithubSlug } from 'muya/lib/utils/url'

// Inline link/image destinations: [text](dest "title") / ![alt](dest).
// Dest group excludes whitespace and parens — conservative, deliberately
// unmatched (unchecked, not flagged): CommonMark angle destinations
// [a](<b c.md>) and single-quoted titles [a](b 't').
const INLINE_DEST_REG = /(!?)\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g
const EXTERNAL_REG = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const ANCHOR_REG = /^#(.+)$/

// GitHub-style slug that PRESERVES unicode letters (muya's
// generateGithubSlug strips [^\w\s-] ASCII-only — Cyrillic/CJK headings
// slug to '' and their anchors would always flag dead).
const decodeSafe = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const githubSlugUnicode = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const excerptOf = (line) => {
  const t = line.trim()
  return t.length > 60 ? `${t.slice(0, 57)}…` : t
}

/**
 * Scan markdown lines for inline link/image destinations.
 * Fenced-code contents and front matter are skipped (same classifiers as
 * the C-17 lint). Returns [{ kind: 'link'|'image', dest, line }] with
 * 1-based lines.
 */
export const extractDestinations = (markdown) => {
  if (typeof markdown !== 'string' || markdown.length === 0) return []
  const lines = markdown.split('\n')
  const fmEnd = frontMatterEnd(lines)
  const out = []
  let fence = null

  for (let i = 0; i < lines.length; i++) {
    if (i <= fmEnd) continue
    const line = lines[i]
    const fenceInfo = isFenceLine(line)
    if (fence) {
      if (closesFence(line, fence)) fence = null
      continue
    }
    if (fenceInfo) {
      fence = fenceInfo
      continue
    }
    // Multi-line links are out of scope; scan the line.
    for (const m of line.matchAll(INLINE_DEST_REG)) {
      out.push({ kind: m[1] === '!' ? 'image' : 'link', dest: m[3], line: i + 1 })
      // A linked image [![alt](i.png)](l.md): rescan the captured text so
      // the inner image destination is also checked.
      for (const inner of (m[2] || '').matchAll(INLINE_DEST_REG)) {
        out.push({ kind: inner[1] === '!' ? 'image' : 'link', dest: inner[3], line: i + 1 })
      }
    }
  }
  return out
}

/**
 * Validate inline destinations.
 *
 * @param {string} markdown - full document text (LF endings)
 * @param {object} options
 * @param {null | ((path: string) => Promise<boolean>)} options.statFn - existence probe resolved against the DOCUMENT's directory; null/undefined disables file checks (untitled tabs).
 * @param {string} [options.fileDir] - document directory used to clamp relative resolution.
 * @returns {Promise<Array<{rule, line, excerpt, message}>>}
 */
// START_BLOCK_DEADLINK_CHECK
export const checkMarkdownLinks = async (markdown, { statFn = null, fileDir = '' } = {}) => {
  if (typeof markdown !== 'string' || markdown.length === 0) return []
  const lines = markdown.split('\n')
  const fmEnd = frontMatterEnd(lines)
  const destinations = extractDestinations(markdown)

  // In-document anchor slugs (github-style, from the document's headings),
  // collected with the SAME front-matter/fence immunity as destinations,
  // and duplicated headings register GitHub's -1/-2 suffixes.
  const anchorSlugs = new Set()
  const slugCounts = new Map()
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    if (i <= fmEnd) continue
    const line = lines[i]
    const fenceInfo = isFenceLine(line)
    if (fence) {
      if (closesFence(line, fence)) fence = null
      continue
    }
    if (fenceInfo) {
      fence = fenceInfo
      continue
    }
    const heading = classifyHeadingLine(lines, i)
    if (heading) {
      const slug = githubSlugUnicode(heading.text)
      const n = (slugCounts.get(slug) || 0) + 1
      slugCounts.set(slug, n)
      anchorSlugs.add(slug)
      if (n > 1) anchorSlugs.add(`${slug}-${n - 1}`)
      // Muya's ASCII-only slugs also resolve (self-consistency with the
      // app's own copy-heading-link).
      anchorSlugs.add(generateGithubSlug(heading.text))
    }
  }

  const issues = []
  const statCache = new Map()
  const exists = async (dest) => {
    if (statCache.has(dest)) return statCache.get(dest)
    const p = statFn(fileDir ? `${fileDir}/${dest}`.replace(/\/+$/, '') : dest)
    const result = await Promise.resolve(p).catch(() => false)
    statCache.set(dest, result === true)
    return statCache.get(dest)
  }

  for (const { kind, dest, line } of destinations) {
    const anchor = ANCHOR_REG.exec(dest)
    if (anchor) {
      const anchorSlug = githubSlugUnicode(anchor[1])
      if (!anchorSlugs.has(anchorSlug) && !anchorSlugs.has(anchor[1].toLowerCase())) {
        issues.push({
          rule: 'deadlink-anchor',
          line,
          excerpt: excerptOf(lines[line - 1] ?? ''),
          message: 'Anchor does not match any heading in this document'
        })
      }
      continue
    }
    if (EXTERNAL_REG.test(dest) || dest.startsWith('/') || dest.startsWith('<')) continue
    if (typeof statFn !== 'function') continue

    // Strip a cross-file anchor for existence: file.md#slug → file.md.
    // Probe the RAW path — decoding here would turn %2e%2e into live
    // traversal; the backend stat treats the encoded form as a literal
    // filename (fail-safe). Only decode for display/lookup AFTER the
    // traversal guards pass.
    const rawPathPart = dest.split('#')[0]
    if (!rawPathPart) continue
    // Subtree clamp (same contract as ASK_FOR_FILE_PATH). NOTE: the
    // backend sandbox is '/' until M-005 B3, so this renderer check is
    // the effective traversal guard for document-derived paths.
    if (fileDir && (rawPathPart.includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(rawPathPart))) continue
    // Space-encoded names (%20) probe the decoded form — safe post-guard.
    const pathPart = rawPathPart.includes('%20') ? decodeSafe(rawPathPart) : rawPathPart

    if (!(await exists(pathPart))) {
      issues.push({
        rule: kind === 'image' ? 'deadlink-image' : 'deadlink-file',
        line,
        excerpt: excerptOf(lines[line - 1] ?? ''),
        message: 'Linked file does not exist'
      })
    }
  }

  return issues.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
}
// END_BLOCK_DEADLINK_CHECK
