// FILE: tests/renderer/perf/component-cost.microbench.test.js
// VERSION: 1.0.0
// @vitest-environment jsdom
// START_MODULE_CONTRACT
//   PURPOSE: C-LARGE-DOC-STAGE-0 T-005 tier-1 unit microbenchmarks — isolate the per-edit derived-work costs (Markdown serialization via ExportMarkdown.generate, cursor-marker serialization primitive, muya wordCount, TOC scan, history deepCopy of a representative snapshot) plus the markdownToState parse cost, on corpus fixtures.
//   SCOPE: measures and REPORTS via [MICROBENCH] markers; asserts only correctness shapes and finiteness — NO absolute budgets (budgets are owner decisions after Stage 0; CI ceilings live in the e2e tier and are loose).
//   DEPENDS: muya/lib/utils (wordCount, deepCopy), muya/lib/utils/exportMarkdown, muya/lib/utils/importMarkdown (markdownToState mixin), muya/lib/contentState/tocCtrl, muya/lib/selection (getCursorPositionWithinMarkedText), corpus fixtures via node:fs.
//   LINKS: .grace/graph/performance.xml M-060 (pending T-010 routing); .grace/verification/performance.xml V-M-060; src/renderer/bench (tier-2/3 vehicle); R-4/R-5 of the approved spec.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   percentile - sorted-array percentile helper used by bench().
//   bench - warmup + N-sample timing; logs [MICROBENCH] label n=… p50_ms=… p95_ms=… mean_ms=…; returns stats (finite).
//   corpusDir - resolved path of the committed large-doc corpus.
//   fixture - reads one corpus fixture, returning {name, text, bytes}.
//   makeStateBuilder - real ContentState on a minimal muya stub (all controller mixins self-apply at module load).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-10-27 - C-LARGE-DOC-STAGE-0 T-005: initial tier-1 component-cost microbenches (R-5 tier 1, R-4 component timings).]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

import { wordCount, deepCopy } from 'muya/lib/utils'
import ExportMarkdown from 'muya/lib/utils/exportMarkdown'
import ContentState from 'muya/lib/contentState'
import { getCursorPositionWithinMarkedText } from 'muya/lib/selection/dom'

const corpusDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/large-doc')

function fixture (name) {
  const text = readFileSync(path.join(corpusDir, name), 'utf8')
  return { name, text, bytes: Buffer.byteLength(text) }
}

function percentile (arr, p) {
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)
  return s[Math.max(0, idx)]
}

function bench (label, fn, { samples = 20, warmup = 2, correctness } = {}) {
  for (let i = 0; i < warmup; i++) fn(i)
  const times = []
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now()
    fn(i)
    times.push(performance.now() - t0)
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  const line = `[MICROBENCH] ${label} n=${times.length} p50_ms=${percentile(times, 50).toFixed(2)} p95_ms=${percentile(times, 95).toFixed(2)} mean_ms=${mean.toFixed(2)} max_ms=${Math.max(...times).toFixed(2)}`
  // eslint-disable-next-line no-console
  console.log(line)
  if (correctness) correctness()
  return { p50: percentile(times, 50), mean }
}

function makeStateBuilder () {
  // The real ContentState (all controller mixins self-apply at module load —
  // contentState/index.js applies prototypes.forEach(ctrl => ctrl(ContentState)))
  // on a minimal muya stub; jsdom supplies the DOM the constructor touches.
  const muya = {
    container: document.createElement('div'),
    eventCenter: { emit: () => {} },
    options: { bulletListMarker: '-' }
  }
  return new ContentState(muya, { bulletListMarker: '-' })
}

describe('C-LARGE-DOC-STAGE-0 T-005 — tier-1 component-cost microbenches', () => {
  it('isolates the derived-work costs on corpus fixtures (report, no budgets)', { timeout: 240_000 }, () => {
    const mixed = fixture('mixed-100k.md')
    const edge = fixture('semantic-edge.md')
    const big = fixture('size-1mb.md')
    const cs = makeStateBuilder()

    // Parse cost (markdown → block tree) — the input side of every edit.
    const mixedBlocks = bench(`markdownToState mixed-100k bytes=${mixed.bytes}`, () => cs.markdownToState(mixed.text), {
      samples: 10,
      correctness: () => expect(Array.isArray(cs.markdownToState(mixed.text))).toBe(true)
    })
    expect(mixedBlocks.p50).toBeGreaterThan(0)

    const edgeBlocksArr = cs.markdownToState(edge.text)
    bench('markdownToState semantic-edge', () => cs.markdownToState(edge.text), { samples: 10 })
    const bigBlocksArr = (() => {
      // Scale row: parse once for the serialization/copy benches below.
      return cs.markdownToState(big.text)
    })()

    // Markdown serialization (the export path every edit's derived work pays).
    const serializerMixed = () => {
      const blocks = cs.markdownToState(mixed.text)
      return new ExportMarkdown(blocks).generate()
    }
    const mixedMdOut = bench('markdown-serialization ExportMarkdown.generate mixed-100k', serializerMixed, {
      samples: 10,
      correctness: () => {
        const out = serializerMixed()
        expect(typeof out).toBe('string')
        expect(out.toLowerCase()).toContain('section')
      }
    })
    expect(mixedMdOut.p50).toBeGreaterThan(0)

    bench('markdown-serialization size-1mb', () => new ExportMarkdown(bigBlocksArr).generate(), { samples: 5 })

    // Word count (muya tokenizer — same one the app's stats use).
    const wc = bench('word-count mixed-100k', () => wordCount(mixed.text), {
      samples: 20,
      correctness: () => {
        const r = wordCount(mixed.text)
        expect(r.word).toBeGreaterThan(100)
      }
    })
    expect(wc.p50).toBeGreaterThan(0)

    // TOC scan (heading extraction over the block tree).
    const tocState = makeStateBuilder()
    tocState.blocks = edgeBlocksArr
    const toc = bench('toc-scan semantic-edge', () => tocState.getTOC(), {
      samples: 20,
      correctness: () => {
        const t = tocState.getTOC()
        expect(t.length).toBeGreaterThan(0)
        expect(t[0]).toHaveProperty('lvl')
      }
    })
    expect(toc.p50).toBeGreaterThan(0)

    // History deep-copy — the exact snapshot shape history.js re-copies
    // per undo step ({ blocks, cursor, renderRange, footnote }).
    const snapshot = { blocks: edgeBlocksArr, cursor: null, renderRange: null, footnote: false }
    const dc = bench('history-deepCopy snapshot(semantic-edge blocks)', () => deepCopy(snapshot), {
      samples: 10,
      correctness: () => {
        const copy = deepCopy(snapshot)
        expect(copy.blocks.length).toBe(snapshot.blocks.length)
      }
    })
    expect(dc.p50).toBeGreaterThan(0)

    // Cursor-marker serialization primitive (selection module, pure helper).
    const marked = 'some **bold** and *em* text with `code` spans'
    const cur = bench('cursor-marker getCursorPositionWithinMarkedText', () => getCursorPositionWithinMarkedText(marked, marked.length - 3), {
      samples: 200,
      correctness: () => {
        const r = getCursorPositionWithinMarkedText(marked, 4)
        expect(r).toBeTruthy()
      }
    })
    expect(cur.p50).toBeGreaterThan(0)

    // Scale row sanity: 1 MB parse produced a real tree.
    expect(Array.isArray(bigBlocksArr)).toBe(true)
    expect(bigBlocksArr.length).toBeGreaterThan(100)
  })
})
