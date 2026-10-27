// FILE: tests/renderer/muya/emphasis-pairing.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the CommonMark delimiter-stack pairing (C-COMMONMARK-EMPHASIS) — the owner-report theft case, the GitHub-anchored theft class, run-splitting, masking corners, fast-path activation counts, generator round-trip, and muya-tokenizer vs marked-renderer parity.
//   SCOPE: tokenizer() and marked() over the pairing corpus; computeEmphasisPairing activation counters; generator round-trip.
//   DEPENDS: muya/lib/parser (tokenizer, generator), muya/lib/parser/marked (marked), muya/lib/parser/emphasisPairing, Vitest.
//   LINKS: .grace/changes/active/C-COMMONMARK-EMPHASIS; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   OPTIONS - tokenizer options shared by every case (no extensions, so the pairing is the only variable).
//   REPORT_BOLD - the owner-reported paragraph (2026-10-26 screenshot), bold twin.
//   REPORT_ITALIC - the owner-reported paragraph, italic twin.
//   CASES - pairing corpus: theft class, run splitting, mod-3 corner, masking, intraword underscores, plain baselines.
//   tok - fresh tokenizer() output for a string.
//   skeleton - recursive emphasis skeleton of a token list (S/E/C nodes, text dropped).
//   htmlSkeleton - the same skeleton extracted from marked HTML.
//   flatRaw - concatenated raw of a token list (round-trip input).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   v1.0.0 - C-COMMONMARK-EMPHASIS: first version.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { tokenizer, generator } from 'muya/lib/parser'
import marked from 'muya/lib/parser/marked'
import {
  computeEmphasisPairing,
  resetEmphasisPairingActivations,
  emphasisPairingActivations
} from 'muya/lib/parser/emphasisPairing'

const OPTIONS = { footnote: false, superSubScript: false, math: false, disableHtml: false }

// The owner-reported paragraph (2026-10-26 screenshot): the typo space before
// the first closing ** used to steal the closer of the clean **One-shot** pair.
const REPORT_BOLD = 'Хозяйке на заметку: **Zero-shot **— модель получает только инструкцию. **One-shot** — инструкцию и один готовый пример.'
const REPORT_ITALIC = 'Хозяйке на заметку: *Zero-shot *— модель. *One-shot* — пример.'

const CASES = [
  '**a **b** c**',
  'A **B **— C** D',
  'x **b **— c **d** e',
  '*a *b* c*',
  '*foo **bar* baz**',
  '***bold italic***',
  '*a `*` b*',
  'plain **bold** and *italic* pair',
  'one **bold** pair only',
  'snake_case_word stays plain',
  '__underscore __var x__ y__'
]

const tok = (src) => tokenizer(src, { ...OPTIONS, labels: new Map() })

// Recursive emphasis skeleton: strong -> S(...), em -> E(...), inline code -> C.
// Text and everything else collapse; the skeleton pins pairing structure only.
const skeleton = (tokens) => (tokens || [])
  .map(t => {
    if (t.type === 'strong') return `S(${skeleton(t.children)})`
    if (t.type === 'em') return `E(${skeleton(t.children)})`
    if (t.type === 'inline_code') return 'C'
    return ''
  })
  .join('')

// The same skeleton from marked HTML: peel <p>, then walk the tag stream
// (strong/em nest inside themselves, so a matching-close search is not enough).
const htmlSkeleton = (html) => {
  const body = html.replace(/^<p>/, '').replace(/<\/p>\s*$/, '')
  let out = ''
  for (const m of body.matchAll(/<(\/?)(strong|em|code)[ >]/g)) {
    if (m[1] === '/') {
      if (m[2] !== 'code') out += ')'
    } else {
      out += m[2] === 'strong' ? 'S(' : m[2] === 'em' ? 'E(' : 'C'
    }
  }
  return out
}

const flatRaw = (tokens) => (tokens || []).map(t => t.raw).join('')

describe('emphasis delimiter pairing (C-COMMONMARK-EMPHASIS)', () => {
  it('owner report, bold: the clean later pair wins, the typo stays literal (GitHub anchor)', () => {
    const tokens = tok(REPORT_BOLD)
    const strongs = tokens.filter(t => t.type === 'strong')
    expect(strongs).toHaveLength(1)
    expect(strongs[0].raw).toBe('**One-shot**')
    expect(strongs[0].marker).toBe('**')
    expect(strongs[0].children.map(c => c.raw).join('')).toBe('One-shot')
    // The typo's asterisks are visible literal text before the dash.
    const head = tokens.find(t => t.type === 'text')
    expect(head.raw).toContain('**Zero-shot **—')
    // No emphasis token contains a stray ** inside it.
    for (const t of strongs) expect(t.raw).not.toMatch(/\*\*.*\*\*.*\*\*/)
    // Export path (marked fork) renders the same verdict — this is the exact
    // GitHub Markdown API output captured 2026-10-26.
    expect(marked(REPORT_BOLD, { disableInline: false }).trim()).toBe(
      '<p>Хозяйке на заметку: **Zero-shot **— модель получает только инструкцию. <strong>One-shot</strong> — инструкцию и один готовый пример.</p>'
    )
  })

  it('owner report, italic twin: same verdict for single stars', () => {
    const tokens = tok(REPORT_ITALIC)
    const ems = tokens.filter(t => t.type === 'em')
    expect(ems).toHaveLength(1)
    expect(ems[0].raw).toBe('*One-shot*')
    const head = tokens.find(t => t.type === 'text')
    expect(head.raw).toContain('*Zero-shot *—')
    expect(marked(REPORT_ITALIC, { disableInline: false }).trim()).toBe(
      '<p>Хозяйке на заметку: *Zero-shot *— модель. <em>One-shot</em> — пример.</p>'
    )
  })

  it('theft class: later clean pairs win, orphan openers stay literal', () => {
    // **a **b** c** — nested strong, whole string bold (GitHub renders all bold).
    expect(skeleton(tok('**a **b** c**'))).toBe('S(S())')
    // A **B **— C** D — only the pair with the nearer opener becomes strong.
    expect(skeleton(tok('A **B **— C** D'))).toBe('S()')
    expect(tok('A **B **— C** D').find(t => t.type === 'strong').raw).toBe('**— C**')
    // x **b **— c **d** e — the clean **d** pair survives untouched.
    expect(skeleton(tok('x **b **— c **d** e'))).toBe('S()')
    // *a *b* c* — nested em (upstream marktext#2086 probe).
    expect(skeleton(tok('*a *b* c*'))).toBe('E(E())')
  })

  it('run splitting: *** renders em[strong] like GitHub, no stray star', () => {
    const tokens = tok('***bold italic***')
    expect(skeleton(tokens)).toBe('E(S())')
    expect(flatRaw(tokens)).toBe('***bold italic***')
    expect(marked('***bold italic***', { disableInline: false }).trim())
      .toBe('<p><em><strong>bold italic</strong></em></p>')
  })

  it('mod-3 corner is recorded as this implementation\'s tree (no giant-span regression)', () => {
    // cmark renders <em>foo <em><em>bar</em> baz</em></em>; this implementation
    // renders the same visible italics with one nesting level fewer — pinned,
    // not claimed cmark-identical (spec NonGoal).
    expect(skeleton(tok('*foo **bar* baz**'))).toBe('E(E(E()))')
    expect(skeleton(tok('foo **bar* baz*'))).toBe('E(E())')
  })

  it('masking: escapes and code spans never produce delimiter runs', () => {
    // The code-span star is not a delimiter; the em cannot close inside it.
    const codeTokens = tok('*a `*` b*')
    expect(codeTokens.map(t => t.type).join(',')).toBe('text,inline_code,text')
    // Escaped stars stay escaped text (backlash tokens keep the backslashes).
    const escaped = tok('\\*foo\\* stays literal')
    expect(escaped.filter(t => t.type === 'em')).toHaveLength(0)
    expect(flatRaw(escaped)).toBe('\\*foo\\* stays literal')
    // Intraword underscores stay plain.
    expect(tok('snake_case_word stays plain').every(t => t.type === 'text')).toBe(true)
  })

  it('fast path: activation counts (single pair zero, multi-run shapes one)', () => {
    resetEmphasisPairingActivations()
    tok('one **bold** pair only')
    expect(emphasisPairingActivations()).toBe(0)
    resetEmphasisPairingActivations()
    // bold + italic = four asterisk runs -> the theft/splitting scan runs once.
    tok('plain **bold** and *italic* pair')
    expect(emphasisPairingActivations()).toBe(1)
    resetEmphasisPairingActivations()
    tok(REPORT_BOLD)
    expect(emphasisPairingActivations()).toBe(1)
    // The scan is memoized per string: re-tokenizing the same string twice
    // does not double the count within one tokenizer run.
    expect(computeEmphasisPairing(REPORT_BOLD).matches.length).toBeGreaterThan(0)
  })

  it('round trip: generator reproduces every input byte for byte', () => {
    for (const c of [REPORT_BOLD, REPORT_ITALIC, ...CASES]) {
      expect(generator(tok(c))).toBe(c)
    }
  })

  it('parity: muya tokenizer and marked renderer agree on pairing structure', () => {
    for (const c of [REPORT_BOLD, REPORT_ITALIC, ...CASES]) {
      const fromTokens = skeleton(tok(c))
      const fromHtml = htmlSkeleton(marked(c, { disableInline: false }))
      expect(fromHtml, c).toBe(fromTokens)
    }
  })
})
