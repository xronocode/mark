// FILE: tests/renderer/muya/quote-auto-pair.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin when a typed quote may open an auto-pair, so a closing quote or apostrophe after a word is never doubled.
//   SCOPE: canOpenQuote from src/muya/lib/contentState/inputCtrl.js (START_BLOCK_QUOTE_AUTO_PAIR).
//   DEPENDS: src/muya/lib/contentState/inputCtrl.js, Vitest.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; tests/e2e/auto-pair-quotes.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   OPENERS - preceding characters after which a quote opens a pair.
//   CLOSERS - preceding characters after which a quote is a closing quote or apostrophe.
// END_MODULE_MAP

import { describe, expect, it } from 'vitest'
import { canOpenQuote } from 'muya/lib/contentState/inputCtrl'

const OPENERS = ['', ' ', '\t', ' ', '(', '[', '{', '<', '«', '„']
const CLOSERS = ['d', 'Z', '7', 'о', 'Ж', 'é', '.', ',', '!', '?', ')', ']', '"', "'", '*', '_']

describe('canOpenQuote', () => {
  for (const ch of OPENERS) {
    it(`opens after ${JSON.stringify(ch)}`, () => expect(canOpenQuote(ch)).toBe(true))
  }
  for (const ch of CLOSERS) {
    it(`does not open after ${JSON.stringify(ch)}`, () => expect(canOpenQuote(ch)).toBe(false))
  }
})
