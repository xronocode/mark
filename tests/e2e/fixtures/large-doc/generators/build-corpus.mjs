// FILE: tests/e2e/fixtures/large-doc/generators/build-corpus.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Build the C-LARGE-DOC-STAGE-0 fixture corpus (R-1 shapes) into a target directory, emitting shape-metadata.json beside the fixtures.
//   SCOPE: writes every corpus fixture deterministically; the optional 10 MB diagnostic is opt-in via --with-10m and is never committed.
//   DEPENDS: node:fs/promises, node:path, ./lib.mjs.
//   LINKS: [tests/e2e/fixtures/large-doc/generators/regen.mjs] [M-060 pending T-010 routing]
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   main(outDir, opts) - builds all shapes; returns the metadata array; identical inputs produce identical bytes.
//   buildShapes(rng) - pure shape-content builders keyed by fixture name (no IO).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-10-27 - C-LARGE-DOC-STAGE-0 T-002: initial corpus builder (R-1).]
// END_CHANGE_SUMMARY

import { mkdir, writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

import { makeRng, mixedParagraph, bodyBlock, tableRows, codeBlock, nestedList, nestedQuote, ENCODERS, NL, SAMPLE_RU, SAMPLE_EN, SAMPLE_SHIFT_JIS_TEXT, SAMPLE_SHIFT_JIS_BYTES, SAMPLE_GB2312_TEXT, SAMPLE_GB2312_BYTES, enSentence, ruSentence } from './lib.mjs'

// START_BLOCK_SHAPES
// Pure content builders: same seed -> same bytes. Names mixed-100k.md and
// size-1mb.md are pinned by the approved plan (T-002/T-003/T-004 commands).
function growTo (parts, targetBytes, rng, sectionCounter) {
  let size = 0
  for (const p of parts) size += Buffer.byteLength(p, 'utf8')
  let i = sectionCounter.start
  while (size < targetBytes) {
    const block = bodyBlock(rng, i++, 3)
    parts.push(block)
    size += Buffer.byteLength(block, 'utf8')
  }
  return i
}

export function buildShapes () {
  const rng = makeRng(0xC0FFEE)
  const shapes = new Map()

  // ~100 KB mixed markdown (pinned name: mixed-100k.md)
  {
    const parts = ['# Mixed corpus — 100 KB', '']
    const end = growTo(parts, 100 * 1024, rng, { start: 1 })
    parts.push('', tableRows(40, end), '', codeBlock(60))
    shapes.set('mixed-100k.md', { content: parts.join('\n') + '\n', class: 'ordinary', encoding: 'utf8' })
  }

  // ~1 MB size scale (pinned name: size-1mb.md)
  {
    const parts = ['# Size scale — 1 MB', '']
    const end = growTo(parts, 1024 * 1024, rng, { start: 1 })
    parts.push('', tableRows(200, end))
    shapes.set('size-1mb.md', { content: parts.join('\n') + '\n', class: 'size-scale', encoding: 'utf8' })
  }

  // 1.7 MB / ~9000 sections (the accepted backlog reference shape): compact
  // sections (heading + 2-3 short sentences) so BOTH targets land together.
  {
    const parts = ['# Size scale — 1.7 MB / 9000 sections', '']
    let size = 0
    let sections = 0
    let i = 1
    const section = () => {
      const sentences = (i % 4 === 0) ? 4 : 2
      const block = `## Section ${i}: measured corridor\n\n${mixedParagraph(rng, sentences)}`
      i++
      sections++
      size += Buffer.byteLength(block, 'utf8')
      return block
    }
    while (!(size >= 1.7 * 1024 * 1024 && sections >= 9000)) parts.push(section())
    shapes.set('size-1_7mb-9000sections.md', { content: parts.join('\n\n') + '\n', class: 'size-scale', encoding: 'utf8' })
  }

  // Pathological structure
  {
    const rows = []
    for (let i = 0; i < 6000; i++) rows.push(`- list item ${i} with ${i % 7 === 0 ? 'nested' : 'plain'} payload`)
    shapes.set('giant-list.md', { content: '# Giant list\n\n' + rows.join('\n') + '\n', class: 'pathological', encoding: 'utf8' })
  }
  shapes.set('table-1000rows.md', { content: '# 1000-row table\n\n' + tableRows(1000) + '\n', class: 'pathological', encoding: 'utf8' })
  {
    const para = []
    for (let i = 0; i < 3000; i++) para.push(enSentence(rng))
    shapes.set('giant-paragraph.md', { content: '# Giant paragraph\n\n' + para.join(' ') + '\n', class: 'pathological', encoding: 'utf8' })
  }
  shapes.set('giant-code-block.md', { content: '# Giant code block\n\n' + codeBlock(5000) + '\n', class: 'pathological', encoding: 'utf8' })
  shapes.set('nested-deep.md', { content: '# Deep nesting\n\n' + nestedList(40) + '\n\n' + nestedQuote(30) + '\n', class: 'pathological', encoding: 'utf8' })

  // Expensive leaves: math/image/diagram-heavy; image assets are local SVGs
  // (assets/local-*.svg, committed beside the corpus); runs must disable network.
  {
    const parts = ['# Expensive leaves', '']
    for (let i = 0; i < 120; i++) {
      parts.push(`## Math block ${i}`, '', '$$\n\\int_{0}^{\\infty} e^{-x^${(i % 5) + 2}} dx = \\frac{1}{${(i % 5) + 2}}\\Gamma\\left(\\frac{1}{${(i % 5) + 2}}\\right)\n$$', '')
      parts.push(`![local asset ${i}](assets/local-${i % 4}.svg)`, '')
      parts.push('```mermaid\ngraph TD\n  A[open] --> B{measured}\n  B -->|yes| C[paint]\n  B -->|no| D[defer]\n```', '')
    }
    shapes.set('expensive-leaves.md', { content: parts.join('\n') + '\n', class: 'expensive-leaves', encoding: 'utf8' })
  }

  // Semantic edge corpus (link refs, footnotes, setext, fences, tasks, tables, RU/EN)
  {
    const parts = [
      '# Semantic edges',
      '',
      'Setext Heading One', '=================',
      '',
      'Setext Heading Two', '-----------------',
      '',
      'A link reference [ref one][r1] and an undefined-looking [r2].',
      '',
      '[r1]: https://example.invalid/ref1 "Ref One"',
      '',
      'A footnote marker[^fn1] and another[^fn2].',
      '',
      '[^fn1]: The first footnote with ' + SAMPLE_RU.split(' ')[0] + '.',
      '[^fn2]: The second footnote — keep bytes identical.',
      '',
      '- [ ] task open', '- [x] task done', '- [ ] task third',
      '',
      tableRows(12, 100),
      '',
      '~~~',
      'fenced with tilde and ' + SAMPLE_EN.split(' ')[0],
      '~~~',
      '',
      '> quote with ' + SAMPLE_RU.split(' ')[1],
      '',
      mixedParagraph(rng, 4)
    ]
    shapes.set('semantic-edge.md', { content: parts.join('\n') + '\n', class: 'semantic-edge', encoding: 'utf8' })
  }
  return shapes
}
// END_BLOCK_SHAPES

// START_BLOCK_BYTE_POLICY
function bytePolicyEntries () {
  const base = `# Byte policy sample\n\n${SAMPLE_EN}\n\n${SAMPLE_RU}\n\ntail line for endings.\n`
  const jp = `# Shift-JIS pinned sample\n\n${SAMPLE_SHIFT_JIS_TEXT}\n`
  const gb = `# GB2312 pinned sample\n\n${SAMPLE_GB2312_TEXT}\n`
  return [
    { name: 'byte-policy/utf8.md', buf: ENCODERS.utf8(base), encoding: 'utf8', note: 'baseline' },
    { name: 'byte-policy/utf8-bom.md', buf: ENCODERS.utf8bom(base), encoding: 'utf8-bom', note: 'BOM' },
    { name: 'byte-policy/utf8-crlf.md', buf: ENCODERS.utf8(NL.crlf(base)), encoding: 'utf8-crlf', note: 'CRLF' },
    { name: 'byte-policy/utf8-mixed-eol.md', buf: ENCODERS.utf8(NL.mixed(base)), encoding: 'utf8-mixed-eol', note: 'mixed LF/CRLF' },
    { name: 'byte-policy/utf8-no-final-newline.md', buf: ENCODERS.utf8(NL.noFinal(base)), encoding: 'utf8-no-final-newline', note: 'no final newline' },
    { name: 'byte-policy/utf16le-bom.md', buf: ENCODERS.utf16le(base), encoding: 'utf16le-bom', note: 'UTF-16 LE + BOM' },
    { name: 'byte-policy/utf16be-bom.md', buf: ENCODERS.utf16be(base), encoding: 'utf16be-bom', note: 'UTF-16 BE + BOM' },
    { name: 'byte-policy/latin1.md', buf: ENCODERS.latin1(`# Latin-1 sample\n\n${SAMPLE_EN}\n caf\xE9 na\xEFve \xE9\xE8\xFC\n`), encoding: 'latin1', note: 'single-byte' },
    { name: 'byte-policy/koi8-r.md', buf: ENCODERS.koi8r(`# KOI8-R sample\n\n${SAMPLE_RU}\n`), encoding: 'koi8-r', note: 'single-byte Cyrillic' },
    { name: 'byte-policy/cp1251.md', buf: ENCODERS.cp1251(`# CP1251 sample\n\n${SAMPLE_RU}\n`), encoding: 'cp1251', note: 'single-byte Cyrillic' },
    { name: 'byte-policy/shift-jis.md', buf: SAMPLE_SHIFT_JIS_BYTES, encoding: 'shift-jis', note: 'precomputed pinned sample (no iconv dependency)' },
    { name: 'byte-policy/gb2312.md', buf: SAMPLE_GB2312_BYTES, encoding: 'gb2312', note: 'precomputed pinned sample (no iconv dependency)' }
  ]
}
// END_BLOCK_BYTE_POLICY

// START_BLOCK_MAIN
export async function main (outDir, opts = {}) {
  const shapes = buildShapes()
  const metadata = []
  await mkdir(path.join(outDir, 'byte-policy'), { recursive: true })
  await mkdir(path.join(outDir, 'assets'), { recursive: true })

  for (const [name, shape] of shapes) {
    const buf = Buffer.from(shape.content, 'utf8')
    await writeFile(path.join(outDir, name), buf)
    metadata.push({ name, bytes: buf.length, sha256: sha256(buf), storage: 'committed', class: shape.class, encoding: shape.encoding, sections: (shape.content.match(/^## /gm) || []).length })
  }

  for (const entry of bytePolicyEntries()) {
    await writeFile(path.join(outDir, entry.name), entry.buf)
    // The owner commit gate fail-closes on non-UTF-8 / NUL payloads, so those
    // fixtures are NOT committed: generators (pure ASCII) + this sha256 pin
    // materialize them byte-identically on demand (see ensure.mjs).
    const committed = entry.encoding.startsWith('utf8')
    metadata.push({ name: entry.name, bytes: entry.buf.length, sha256: sha256(entry.buf), storage: committed ? 'committed' : 'materialized', class: 'byte-policy', encoding: entry.encoding, note: entry.note })
  }

  // Local image assets for expensive-leaves.md — four tiny deterministic SVGs.
  for (let i = 0; i < 4; i++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="hsl(${i * 90}, 40%, 80%)"/><text x="8" y="34" font-family="monospace" font-size="14">local-${i}</text></svg>\n`
    await writeFile(path.join(outDir, 'assets', `local-${i}.svg`), svg, 'utf8')
    metadata.push({ name: `assets/local-${i}.svg`, bytes: Buffer.byteLength(svg), sha256: sha256(Buffer.from(svg)), storage: 'committed', class: 'asset', encoding: 'utf8' })
  }

  if (opts.with10m) {
    const parts = ['# Optional 10 MB diagnostic (local only — never committed)', '']
    const end = growTo(parts, 10 * 1024 * 1024, makeRng(0x10BEEF), { start: 1 })
    await writeFile(path.join(outDir, 'diagnostic-10mb.md'), Buffer.from(parts.join('\n') + '\n', 'utf8'))
    metadata.push({ name: 'diagnostic-10mb.md', bytes: 10 * 1024 * 1024, class: 'diagnostic', encoding: 'utf8', note: `sections end ${end}; optional local run only` })
  }

  const meta = {
    generatedBy: 'generators/build-corpus.mjs',
    deterministic: true,
    seedNote: 'xorshift32 fixed seeds inside lib.mjs/build-corpus.mjs',
    references: [
      { name: 'src/renderer/bench/fixture.js', class: 'ordinary', note: 'existing ~6 KB bench fixture owned by the bench harness; referenced by the corpus, not duplicated' }
    ],
    runConditions: { expensiveLeaves: 'network disabled; image assets resolve to the committed assets/ directory' },
    fixtures: metadata
  }
  await writeFile(path.join(outDir, 'shape-metadata.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8')
  return metadata
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] || path.resolve(new URL('.', import.meta.url).pathname, '..')
  const with10m = process.argv.includes('--with-10m')
  await rm(path.join(outDir, '.regen-tmp'), { recursive: true, force: true })
  const metadata = await main(outDir, { with10m })
  console.log(`[corpus] ${metadata.length} fixtures written to ${outDir}`)
}
// END_BLOCK_MAIN
