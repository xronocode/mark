// FILE: tests/renderer/muya/lexer-token-parity.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the muya block lexer's token output byte-for-byte across option variants, so rule-level performance work (C-30 sticky anchored rules) cannot change what gets parsed.
//   SCOPE: Lexer.lex over the lexer-corpus fixtures and two deterministic generated large documents, compared against goldens captured on the pre-C-30 lexer.
//   DEPENDS: src/muya/lib/parser/marked (Lexer), Vitest, node:fs, node:crypto.
//   LINKS: .grace/changes/active/C-30; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 — guards START_BLOCK_STICKY_ANCHORED_RULES in src/muya/lib/parser/marked/blockRules.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CORPUS - fixtures/lexer-corpus directory of markdown inputs.
//   GOLDEN - fixtures/lexer-corpus/golden directory of captured outputs.
//   VARIANTS - lexer option sets: gfm default, importMarkdown-style (footnote/gitlab/superSub, disableInline), pedantic, gfm off.
//   lexTokens - runs a fresh Lexer and serialises tokens + links + footnotes with footnoteIds renumbered by appearance.
//   generateSections - deterministic large document in the shape of the C-30 bench (headings, prose, a fence every 25 sections).
//   generateBlockMix - deterministic large document repeating tables, lists, quotes and hrs (the five hot rules).
//   sha - sha256 hex of a serialised token stream (used for the large generated documents).
//   UPDATE - UPDATE_LEXER_GOLDENS=1 rewrites goldens and then fails on purpose, so an update can never report green; only run it on the pre-change lexer or after an intended parse change.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - C-30 review-2: UPDATE runs write then throw (cannot mask a regression); corpus gains nptable cases.
//   v1.0.0 - C-30: goldens captured on the unmodified lexer (commit cafa8f1a) before the sticky block-rule conversion.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { Lexer } from 'muya/lib/parser/marked'

const CORPUS = resolve(__dirname, 'fixtures/lexer-corpus')
const GOLDEN = join(CORPUS, 'golden')
const UPDATE = process.env.UPDATE_LEXER_GOLDENS === '1'

const VARIANTS = {
  gfm: {},
  importMarkdown: { disableInline: true, footnote: true, isGitlabCompatibilityEnabled: true, superSubScript: true },
  pedantic: { pedantic: true },
  noGfm: { gfm: false }
}

function lexTokens (markdown, opts) {
  const tokens = new Lexer(opts).lex(markdown)
  const ids = new Map()
  const normalised = JSON.parse(JSON.stringify(tokens), (key, value) => {
    if (key === 'footnoteId') {
      if (!ids.has(value)) ids.set(value, ids.size + 1)
      return ids.get(value)
    }
    return value
  })
  return JSON.stringify({ tokens: normalised, links: tokens.links, footnotes: Object.keys(tokens.footnotes || {}) }, null, 1)
}

function generateSections (n) {
  const words = 'lorem ipsum dolor sit amet markdown editor native swift rust tauri webkit'.split(' ')
  const out = []
  let seed = 7
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed }
  for (let s = 0; s < n; s++) {
    out.push(`## Section ${s}\n`)
    for (let p = 0; p < 3; p++) {
      const line = []
      for (let w = 0; w < 60; w++) line.push(words[next() % words.length])
      out.push(line.join(' ') + '\n')
    }
    if (s % 25 === 0) out.push('```js\nconst x = ' + s + ';\nconsole.log(x)\n```\n')
  }
  return out.join('\n')
}

function generateBlockMix (n) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(`### Block ${i}`)
    out.push('| a | b |\n| - | - |\n| ' + i + ' | x |')
    out.push('a | b\n--- | ---\n' + i + ' | y')
    out.push('- item ' + i + '\n  - nested\n1. ordered')
    out.push('> quote ' + i + '\n> > nested')
    out.push(i % 2 ? '---' : '* * *')
    out.push('Plain paragraph ' + i + ' with *emphasis*.')
  }
  return out.join('\n\n') + '\n'
}

const sha = (text) => createHash('sha256').update(text).digest('hex')

describe('lexer token parity (C-30)', () => {
  const files = readdirSync(CORPUS).filter(f => f.endsWith('.md')).sort()

  it('has a non-trivial corpus', () => {
    expect(files.length).toBeGreaterThanOrEqual(9)
  })

  for (const file of files) {
    it(`${file} matches its golden for every option variant`, () => {
      const markdown = readFileSync(join(CORPUS, file), 'utf8')
      const actual = {}
      for (const [name, opts] of Object.entries(VARIANTS)) actual[name] = lexTokens(markdown, opts)
      const goldenPath = join(GOLDEN, file.replace(/\.md$/, '.json'))
      if (UPDATE) {
        mkdirSync(GOLDEN, { recursive: true })
        writeFileSync(goldenPath, JSON.stringify(actual, null, 1) + '\n')
        throw new Error(`golden written: ${goldenPath}. UPDATE runs never pass; rerun without UPDATE_LEXER_GOLDENS and review the diff`)
      }
      expect(existsSync(goldenPath), `missing golden ${goldenPath}; run with UPDATE_LEXER_GOLDENS=1 on the pre-change lexer`).toBe(true)
      const expected = JSON.parse(readFileSync(goldenPath, 'utf8'))
      for (const name of Object.keys(VARIANTS)) expect(actual[name], `${file} / ${name}`).toBe(expected[name])
    })
  }

  it('generated large documents hash to their goldens', () => {
    const docs = { sections500: generateSections(500), blockMix300: generateBlockMix(300) }
    const actual = {}
    for (const [doc, markdown] of Object.entries(docs)) {
      for (const [name, opts] of Object.entries(VARIANTS)) actual[`${doc}/${name}`] = sha(lexTokens(markdown, opts))
    }
    const goldenPath = join(GOLDEN, 'generated.sha256.json')
    if (UPDATE) {
      mkdirSync(GOLDEN, { recursive: true })
      writeFileSync(goldenPath, JSON.stringify(actual, null, 1) + '\n')
      throw new Error(`golden written: ${goldenPath}. UPDATE runs never pass; rerun without UPDATE_LEXER_GOLDENS and review the diff`)
    }
    expect(existsSync(goldenPath), 'missing generated golden').toBe(true)
    expect(actual).toEqual(JSON.parse(readFileSync(goldenPath, 'utf8')))
  })
})
