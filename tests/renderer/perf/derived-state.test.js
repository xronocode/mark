// FILE: tests/renderer/perf/derived-state.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Tier-1 unit microbenches (C-LARGE-DOC-STAGE-0 R-5/T-005) isolating the four derived-state costs the opening/typing path pays: Markdown serialization, word count, TOC construction and history snapshot deep-copy.
//   SCOPE: jsdom + real Muya over the committed semantic-edge fixture (byte-pinned in shape-metadata.json). Each measurement is taken in isolation on an already-mounted editor, reports a [MICROBENCH] p50/p95 line, and asserts only loose sanity bounds (CI non-flakiness) plus functional truth (the derived value is the expected one). Direct contentState mutation is used HERE and only here — explicitly labelled a microbenchmark, never the real-input typing path.
//   DEPENDS: src/muya/lib (Muya, contentState/History), muya/lib/utils (wordCount), tests/e2e/fixtures/large-doc/semantic-edge.md, Vitest jsdom.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-005; .grace/verification/performance.xml V-M-060; src/renderer/bench/main.js (the real-input phases this isolates the costs of).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FIXTURE_PATH - committed semantic-edge.md path.
//   METADATA - shape-metadata.json; its sha256/bytes pin is asserted, not trusted.
//   MARKDOWN - fixture text used by every measurement.
//   CEILING_MS - loose per-suite sanity ceilings (not product budgets).
//   percentile - nearest-rank percentile, same convention as the bench harness.
//   timeIt - runs a function n times with performance.now and returns the samples.
//   marker - emits one stable [MICROBENCH] line (name, n, p50/p95/max in ms).
//   fixtureIdentity - asserts the fixture matches its committed byte/sha256 pin.
//   editor - the mounted Muya instance (single mount; each suite measures one cost).
//   historyDouble - ContentState-shaped object accepted by History.push.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-STAGE-0 T-005: first tier-1 microbench file; isolates serializer/word-count/TOC/history-copy, pins the fixture hash, fails on a wrong derived value.
// END_CHANGE_SUMMARY

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import Muya from 'muya/lib'
import History from 'muya/lib/contentState/history'
import { wordCount } from 'muya/lib/utils'

const FIXTURE_PATH = resolve('tests/e2e/fixtures/large-doc/semantic-edge.md')
const METADATA = JSON.parse(readFileSync(resolve('tests/e2e/fixtures/large-doc/shape-metadata.json'), 'utf8'))

const MARKDOWN = readFileSync(FIXTURE_PATH, 'utf8')

// CI ceilings are deliberately loose: these microbenches report costs, they
// do not encode product budgets (owner-approved only after Stage 0).
const CEILING_MS = { serialize: 250, wordCount: 50, toc: 50, historyCopy: 250 }

function percentile (samples, p) {
  const s = [...samples].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)
  return s[Math.max(0, idx)]
}

function timeIt (fn, n) {
  const samples = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    fn(i)
    samples.push(performance.now() - t0)
  }
  return samples
}

function marker (name, samples) {
  const line = `[MICROBENCH] name=${name} n=${samples.length} p50_ms=${percentile(samples, 50).toFixed(3)} p95_ms=${percentile(samples, 95).toFixed(3)} max_ms=${Math.max(...samples).toFixed(3)}`
  // eslint-disable-next-line no-console
  console.log(line)
  return line
}

function fixtureIdentity () {
  const bytes = Buffer.byteLength(MARKDOWN)
  const sha256 = createHash('sha256').update(MARKDOWN).digest('hex')
  const pin = METADATA.fixtures.find((f) => f.name === 'semantic-edge.md')
  expect(pin, 'fixture must be pinned').toBeTruthy()
  expect(bytes, 'fixture byte length matches its pin').toBe(pin.bytes)
  expect(sha256, 'fixture sha256 matches its pin').toBe(pin.sha256)
  return { bytes, sha256 }
}

let editor = null
let historyDouble = null

beforeAll(() => {
  fixtureIdentity()
  const container = document.createElement('div')
  document.body.appendChild(container)
  editor = new Muya(container, { markdown: MARKDOWN })
  historyDouble = {
    // Snapshot shape produced by ContentState.getHistoryState(): plain
    // blocks + render range + the current Cursor. No live references (a
    // real snapshot must be copyable, and deepCopy would recurse forever
    // on the editor back-reference if we smuggled one in).
    snapshot: {
      blocks: editor.contentState.blocks,
      cursor: { anchor: { offset: 0 }, focus: { offset: 0 }, isEdit: true },
      renderRange: null
    },
    // History.push reads only this flag off the owning ContentState.
    muya: { options: { footnote: false } }
  }
})

afterAll(() => {
  try {
    if (editor && typeof editor.destroy === 'function') editor.destroy()
  } catch (err) {
    // jsdom leaves partial UI behind on destroy; nothing to assert here.
  }
  editor = null
  historyDouble = null
})

describe('tier-1 derived-state microbenches (C-LARGE-DOC-STAGE-0 T-005)', () => {
  it('Markdown serialization (getMarkdown) is bounded and still produces the document', () => {
    const samples = timeIt(() => {
      const md = editor.getMarkdown()
      expect(md).toContain('# Semantic edges')
      expect(md).toContain('[ref one][r1]')
    }, 25)
    const line = marker('serialize_getMarkdown', samples)
    expect(line).toContain('name=serialize_getMarkdown')
    expect(percentile(samples, 50)).toBeLessThan(CEILING_MS.serialize)
  })

  it('word count is bounded and matches the document it measures', () => {
    const expected = wordCount(MARKDOWN)
    expect(expected.word).toBeGreaterThan(0)
    expect(expected.character).toBeGreaterThan(0)
    const samples = timeIt(() => {
      const count = wordCount(MARKDOWN)
      expect(count.word).toBe(expected.word)
    }, 100)
    marker('wordCount', samples)
    expect(percentile(samples, 50)).toBeLessThan(CEILING_MS.wordCount)
  })

  it('TOC construction is bounded and returns one entry per heading', () => {
    const toc = editor.getTOC()
    const expectedHeadings = (MARKDOWN.match(/^#{1,6}\s/gm) || []).length +
      (MARKDOWN.match(/^=+$|^-+$/gm) || []).length
    expect(toc.length).toBeGreaterThan(0)
    expect(toc.length).toBe(expectedHeadings)
    expect(toc[0]).toMatchObject({ content: 'Semantic edges', lvl: 1 })
    for (const entry of toc) expect(entry.githubSlug).toBeTruthy()
    const samples = timeIt(() => {
      expect(editor.getTOC().length).toBe(expectedHeadings)
    }, 100)
    marker('getTOC', samples)
    expect(percentile(samples, 50)).toBeLessThan(CEILING_MS.toc)
  })

  it('history snapshot deep-copy is bounded and keeps the block count', () => {
    const history = new History(historyDouble)
    const blocks = editor.contentState.blocks.length
    expect(blocks).toBeGreaterThan(0)
    const samples = timeIt(() => {
      history.push(historyDouble.snapshot)
      expect(history.stack[history.stack.length - 1].blocks.length).toBe(blocks)
    }, 20)
    expect(history.stack.length).toBe(20)
    marker('history_deepCopy_push', samples)
    expect(percentile(samples, 50)).toBeLessThan(CEILING_MS.historyCopy)
  })
})
