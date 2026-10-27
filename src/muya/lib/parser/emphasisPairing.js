// FILE: src/muya/lib/parser/emphasisPairing.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: CommonMark delimiter-stack pairing for strong/em — the authority on which delimiter run a closer belongs to, so an orphan opener can no longer steal the closer of a later clean pair (C-COMMONMARK-EMPHASIS).
//   SCOPE: Scan * / _ delimiter runs with CommonMark flanking classification; mask escaped runs and runs inside code spans; run the process-emphasis algorithm (closers left-to-right, nearest eligible opener, odd-match rule, consumption from the content side of each run); fast-path exit when no character has three or more runs; position lookups used by both emphasis dispatch gates; a test-only activation counter.
//   DEPENDS: ./utils (PUNCTUATION_REG).
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; .grace/changes/active/C-COMMONMARK-EMPHASIS; src/muya/lib/parser/index.js START_BLOCK_EMPHASIS_PAIRING_GATE; src/muya/lib/parser/marked/inlineLexer.js START_BLOCK_EMPHASIS_PAIRING_GATE.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   computeEmphasisPairing - src string -> null (no theft shape; callers keep legacy behavior) | { matches, matchForSpan, matchForOpenerStart } for one string.
//   resetEmphasisPairingActivations - test hook: zero the activation counter.
//   emphasisPairingActivations - test hook: read the activation counter (fast-path exits are not counted).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   v1.0.0 - C-COMMONMARK-EMPHASIS: first version. The muya tokenizer and the
//   marked fork paired the first opener with the first flanking-valid closer
//   (regex scan), so with three or more runs of one character an orphan opener
//   swallowed the sentence and stole a later clean pair's closer (owner report
//   2026-10-26: «**Zero-shot **— … **One-shot**» rendered as one giant bold
//   span). This module decides pairing the CommonMark way; the two dispatch
//   gates consult it. Runs inside begin-rule-consumed prefixes (for example a
//   reference definition title) join the scan, but gate lookups only ever
//   select matches at or after the dispatch position, so they never produce a
//   span the dispatcher cannot emit.
// END_CHANGE_SUMMARY

import { PUNCTUATION_REG } from './utils'

// One delimiter character at a time; BOF/EOF (undefined) count as whitespace
// per CommonMark's flanking definition.
const isWs = ch => ch === undefined || ch === '\n' || /^\s/.test(ch)
const isPunct = ch => ch !== undefined && PUNCTUATION_REG.test(ch)

const DELIMITER_RUN_REG = /(\*+|_+)/g

// Test-only counter of full pairing computations (the fast path does not count).
let EMPHASIS_PAIRING_ACTIVATIONS = 0
export const resetEmphasisPairingActivations = () => { EMPHASIS_PAIRING_ACTIVATIONS = 0 }
export const emphasisPairingActivations = () => EMPHASIS_PAIRING_ACTIVATIONS

// START_BLOCK_PAIR_SCAN_CODE_SPANS
// A backtick run followed by an equal-length backtick run is a code span; the
// characters inside one are not delimiter material (GitHub anchor: *a `*` b*
// renders em containing code, the inner star never pairs). Approximation of
// the CommonMark code-span rule, used only for masking.
// END_BLOCK_PAIR_SCAN_CODE_SPANS
const scanCodeSpanRanges = (src) => {
  const ranges = []
  const { length } = src
  let i = 0
  while (i < length) {
    if (src[i] !== '`') {
      i++
      continue
    }
    const start = i
    while (i < length && src[i] === '`') i++
    const ticks = i - start
    let j = i
    let closeEnd = -1
    while (j < length) {
      if (src[j] === '`') {
        const runStart = j
        while (j < length && src[j] === '`') j++
        if (j - runStart === ticks) {
          closeEnd = j
          break
        }
      } else {
        j++
      }
    }
    if (closeEnd > -1) {
      ranges.push([start, closeEnd])
      i = closeEnd
    }
  }
  return ranges
}

// START_BLOCK_PAIR_SCAN_DELIMITER_RUNS
// Maximal * / _ runs with CommonMark 0.31 flanking classification. Escaped
// runs (odd backslashes before them) and runs intersecting a code span are
// dropped: those characters belong to tighter constructs.
// END_BLOCK_PAIR_SCAN_DELIMITER_RUNS
const scanDelimiterRuns = (src, maskedRanges) => {
  const runs = []
  DELIMITER_RUN_REG.lastIndex = 0
  let m
  while ((m = DELIMITER_RUN_REG.exec(src))) {
    const start = m.index
    const end = start + m[0].length
    let bs = start - 1
    let backslashes = 0
    while (bs >= 0 && src[bs] === '\\') {
      backslashes++
      bs--
    }
    if (backslashes % 2 === 1) continue
    if (maskedRanges.some(([a, b]) => start < b && end > a)) continue
    const char = m[0].charAt(0)
    const before = start > 0 ? src.charAt(start - 1) : undefined
    const after = end < src.length ? src.charAt(end) : undefined
    const beforeIsWs = isWs(before)
    const afterIsWs = isWs(after)
    const beforeIsPunct = isPunct(before)
    const afterIsPunct = isPunct(after)
    const leftFlanking = !afterIsWs && (!afterIsPunct || beforeIsWs || beforeIsPunct)
    const rightFlanking = !beforeIsWs && (!beforeIsPunct || afterIsWs || afterIsPunct)
    const canOpen = char === '*'
      ? leftFlanking
      : leftFlanking && (!rightFlanking || beforeIsPunct)
    const canClose = char === '*'
      ? rightFlanking
      : rightFlanking && (!leftFlanking || afterIsPunct)
    runs.push({ char, start, end, origLen: end - start, canOpen, canClose })
  }
  return runs
}

// START_BLOCK_PAIR_PROCESS_EMPHASIS
// CommonMark 0.31 process-emphasis over the run list: closers left to right,
// each closer takes the nearest eligible opener of the same character (the
// odd-match / multiple-of-3 rule follows the commonmark.js formulation and
// only skips, never removes, ineligible openers), a match consumes delimiters
// from the content side of each run (opener tail, closer head), leftovers stay
// reusable, and openers sitting between a matched pair are dropped from the
// stack. Matches come out in processing order (inner before outer).
// END_BLOCK_PAIR_PROCESS_EMPHASIS
const processEmphasis = (runs) => {
  const matches = []
  const stack = []
  for (const run of runs) {
    while (run.start < run.end && run.canClose) {
      let opener = null
      for (let i = stack.length - 1; i >= 0; i--) {
        const d = stack[i]
        if (d.char !== run.char || d.start >= d.end || !d.canOpen) continue
        const oddMatch = (run.canOpen || d.canClose) &&
          run.origLen % 3 !== 0 &&
          (d.origLen + run.origLen) % 3 === 0
        if (!oddMatch) {
          opener = d
          break
        }
      }
      if (!opener) break
      const use = opener.end - opener.start >= 2 && run.end - run.start >= 2 ? 2 : 1
      matches.push({
        openerSegStart: opener.end - use,
        openerSegEnd: opener.end,
        closerSegStart: run.start,
        closerSegEnd: run.start + use,
        type: use === 2 ? 'strong' : 'em'
      })
      opener.end -= use
      run.start += use
      stack.length = stack.indexOf(opener) + 1
    }
    if (run.start < run.end && run.canOpen) stack.push(run)
  }
  return matches
}

// START_BLOCK_PAIR_COMPUTE
// Entry point. Returns null when no character carries the theft shape
// (fewer than three usable runs, or no opener/closer combination at all) —
// callers then keep byte-identical legacy behavior at zero cost. Otherwise
// runs the full pass once (counted) and returns the match list plus the two
// lookups the dispatch gates need.
// END_BLOCK_PAIR_COMPUTE
export const computeEmphasisPairing = (src) => {
  if (!src || (src.indexOf('*') === -1 && src.indexOf('_') === -1)) return null
  const runs = scanDelimiterRuns(src, scanCodeSpanRanges(src))
  const byChar = new Map()
  for (const run of runs) {
    const bucket = byChar.get(run.char) || { count: 0, openers: 0, closers: 0, maxLen: 0 }
    bucket.count++
    if (run.canOpen) bucket.openers++
    if (run.canClose) bucket.closers++
    if (run.origLen > bucket.maxLen) bucket.maxLen = run.origLen
    byChar.set(run.char, bucket)
  }
  // Fast path: the pairing can only disagree with the legacy regex pairing on
  // the theft shape (three or more usable runs of one character) or the
  // run-splitting shape (a run of three or more delimiters). Anything else
  // returns null and both dispatch gates keep byte-identical legacy behavior.
  let active = false
  for (const bucket of byChar.values()) {
    if ((bucket.count >= 3 || bucket.maxLen >= 3) && bucket.openers > 0 && bucket.closers > 0) {
      active = true
      break
    }
  }
  if (!active) return null

  EMPHASIS_PAIRING_ACTIVATIONS++
  const matches = processEmphasis(runs)
  return {
    matches,
    // True when the regex match [start, end) with this marker length is
    // exactly a stack-paired span (full run alignment, both edges).
    matchForSpan: (start, end, markerLen) => matches.some(mt =>
      mt.openerSegStart === start &&
      mt.closerSegEnd === end &&
      mt.openerSegEnd - mt.openerSegStart === markerLen &&
      mt.closerSegEnd - mt.closerSegStart === markerLen
    ),
    // The stack-paired match whose opener segment starts at pos, if any.
    matchForOpenerStart: (pos) => matches.find(mt => mt.openerSegStart === pos) || null
  }
}
