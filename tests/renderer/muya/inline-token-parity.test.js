// FILE: tests/renderer/muya/inline-token-parity.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin muya's inline tokenizer output byte for byte so the sticky conversion of inline rules (C-24, after C-30 did the block rules) cannot change what gets parsed.
//   SCOPE: tokenizer() over every non-empty paragraph of the lexer-corpus fixtures plus an inline stress corpus, under three option sets; goldens captured on the pre-change tokenizer.
//   DEPENDS: src/muya/lib/parser (tokenizer), Vitest, node:fs, node:crypto.
//   LINKS: .grace/changes/archive/C-24; .grace/changes/archive/C-30; src/muya/lib/parser/rules.js START_BLOCK_STICKY_INLINE_RULES.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CORPUS - fixtures/lexer-corpus markdown inputs.
//   GOLDEN - fixtures/lexer-corpus/golden/inline-tokens.sha256.json.
//   STRESS - inline constructs the corpus lacks (escapes, sup/sub, footnote refs, autolinks, html, math).
//   VARIANTS - tokenizer option sets.
//   UPDATE - UPDATE_INLINE_GOLDENS=1 writes the golden and then fails, so an update never passes.
//   digest - sha256 of the serialised tokens (parent links dropped).
//   paragraphs - every non-empty paragraph of the corpus plus STRESS.
//   LOOKBEHIND_RULES - the rules with a lookbehind that JavaScriptCore scanned past ^ (must be sticky).
// END_MODULE_MAP

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { tokenizer } from 'muya/lib/parser'
import { beginRules, inlineExtensionRules, inlineRules } from 'muya/lib/parser/rules'

const CORPUS = resolve(__dirname, 'fixtures/lexer-corpus')
const GOLDEN = join(CORPUS, 'golden', 'inline-tokens.sha256.json')
const UPDATE = process.env.UPDATE_INLINE_GOLDENS === '1'

const STRESS = [
  'Escapes \\*not em\\* and \\[not link\\] and \\^ and \\~.',
  'Sup 2^10^ and sub H~2~O, escaped 2^2\\^ and a~b\\~c~.',
  'Footnote ref[^1], named[^note-2], escaped \\[^x], broken [^ space].',
  'Auto <https://example.com> and <me@example.com>, bare www.example.com/a and https://x.io/b?c=d.',
  'Inline <span class="x">html</span> and <!-- comment --> and <br/>.',
  'Math $a^2 + b^2$ and $$ not inline $$ and price $5.',
  '**strong *nested em* end** and ~~del **in** del~~ and `code **not**`.',
  '![img](a.png "t") [link](b.md#h) [ref][id] ![refimg][id2] :smile: &copy; &amp;',
  'Trailing  \nhard break and soft\nbreak.',
  '[!NOTE] marker-looking text in a normal paragraph.',
  // C-COMMONMARK-EMPHASIS: the theft class (owner report 2026-10-26 plus
  // the upstream marktext#2086 probes) — pins the delimiter-stack pairing.
  'Хозяйке на заметку: **Zero-shot **— модель получает только инструкцию. **One-shot** — инструкцию и один готовый пример.',
  '**a **b** c** and *a *b* c* and ***both***.',
  'x **b **— c **d** e'
]

const VARIANTS = {
  all: { footnote: true, superSubScript: true, math: true, disableHtml: false },
  plain: { footnote: false, superSubScript: false, math: false, disableHtml: false },
  noHtml: { footnote: true, superSubScript: true, math: true, disableHtml: true }
}

const digest = (tokens) => createHash('sha256').update(JSON.stringify(tokens, (k, v) => (k === 'parent' ? undefined : v))).digest('hex')

function paragraphs () {
  const files = readdirSync(CORPUS).filter(f => f.endsWith('.md')).sort()
  const out = []
  for (const f of files) {
    for (const block of readFileSync(join(CORPUS, f), 'utf8').split(/\n{2,}/)) {
      if (block.trim()) out.push(block.trim())
    }
  }
  return out.concat(STRESS)
}

const LOOKBEHIND_RULES = ['footnote_identifier', 'superscript', 'subscript']

describe('inline tokenizer parity (C-24)', () => {
  it('lookbehind rules and every ^-anchored inline rule are sticky', () => {
    for (const key of LOOKBEHIND_RULES) expect(inlineExtensionRules[key].sticky, key).toBe(true)
    for (const table of [beginRules, inlineRules, inlineExtensionRules]) {
      for (const [key, rule] of Object.entries(table)) {
        if (rule.source.startsWith('^') && !rule.global && !rule.multiline) expect(rule.sticky, key).toBe(true)
      }
    }
    // header is not ^-anchored at the start of its source and stays as written.
    expect(beginRules.header.sticky).toBe(false)
  })

  it('every corpus paragraph tokenizes identically to the golden under every variant', () => {
    const actual = {}
    for (const [name, options] of Object.entries(VARIANTS)) {
      actual[name] = paragraphs().map(text => digest(tokenizer(text, { hasBeginRules: true, options })))
    }
    if (UPDATE) {
      writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n')
      throw new Error(`golden written: ${GOLDEN}. UPDATE runs never pass; rerun without UPDATE_INLINE_GOLDENS`)
    }
    expect(actual).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')))
  })
})
