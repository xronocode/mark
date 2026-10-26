// FILE: tests/e2e/fixtures/large-doc/generators/lib.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Deterministic fixture-generation library for the C-LARGE-DOC-STAGE-0 corpus — seeded PRNG, shape builders, byte-policy encoders and the shape-metadata collector.
//   SCOPE: pure functions only; no filesystem writes (callers pass a writer); no network; no timestamps or random sources beyond the seeded xorshift PRNG.
//   DEPENDS: node:buffer, node:fs/promises (writers are injected).
//   LINKS: [GD-PERFORMANCE graph/performance.xml M-060 (pending T-010 routing)] [tests/e2e/fixtures/large-doc/generators/regen.mjs]
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeRng(seed) - seeded xorshift32 PRNG returning () => float in [0,1); identical seeds produce identical sequences.
//   pick(rng, arr) / pickWeighted - deterministic selection helpers.
//   enSentence(rng) / ruSentence(rng) / mixedParagraph(rng) - stable multilingual text builders (fixed word pools, no clock, no locale casing).
//   heading / list / table / codeBlock / quote builders - section templates parameterized by index for cross-run stability.
//   ENCODERS - byte-policy encoders: latin1 (native), koi8r, cp1251, utf16le, utf16be, shiftJisSample, gb2312Sample (precomputed pinned samples).
//   SHAPES - shape descriptors consumed by build-corpus.mjs; every fixture records bytes/sections/class/encoding into shape-metadata.json.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-10-27 - C-LARGE-DOC-STAGE-0 T-002: initial corpus library (R-1).]
// END_CHANGE_SUMMARY

// START_BLOCK_PRNG
export function makeRng (seed = 0x9e3779b9) {
  let s = seed >>> 0
  if (s === 0) s = 0x9e3779b9
  return function rng () {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 0x100000000
  }
}
// END_BLOCK_PRNG

export function pick (rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

// START_BLOCK_TEXT_POOLS
// Fixed pools only: determinism across machines and Node versions. Keep every
// character inside the union covered by ENCODERS below or generation throws.
const EN_WORDS = ['document', 'editor', 'section', 'render', 'measure', 'baseline', 'typing', 'scroll', 'fixture', 'oracle', 'snapshot', 'mark', 'buffer', 'layout', 'paint']
const RU_WORDS = ['документ', 'редактор', 'раздел', 'отрисовка', 'замер', 'базовая', 'печать', 'прокрутка', 'фикстура', 'оракул', 'снимок', 'метка', 'буфер', 'верстка', 'краска']
const EN_TAIL = ['stays measurable', 'freezes behavior', 'records the fact', 'pins the invariant', 'keeps bytes identical', 'labels the tier']
const RU_TAIL = ['остаётся измеримой', 'фиксирует поведение', 'записывает факт', 'закрепляет инвариант', 'держит байты идентичными', 'метит уровень']

export function enSentence (rng) {
  const a = pick(rng, EN_WORDS); const b = pick(rng, EN_WORDS); const c = pick(rng, EN_WORDS)
  return `${a} ${b} ${c} ${pick(rng, EN_TAIL)}.`
}

export function ruSentence (rng) {
  const a = pick(rng, RU_WORDS); const b = pick(rng, RU_WORDS); const c = pick(rng, RU_WORDS)
  return `${a} ${b} ${c} ${pick(rng, RU_TAIL)}.`
}

export function mixedParagraph (rng, sentences = 6) {
  const out = []
  for (let i = 0; i < sentences; i++) out.push(i % 2 === 0 ? enSentence(rng) : ruSentence(rng))
  return out.join(' ')
}
// END_BLOCK_TEXT_POOLS

// START_BLOCK_SECTION_BUILDERS
export function heading (i) {
  return `## Section ${i}: measured corridor`
}

export function bodyBlock (rng, i, paragraphs = 3) {
  const out = [heading(i)]
  for (let p = 0; p < paragraphs; p++) out.push(mixedParagraph(rng))
  return out.join('\n\n')
}

export function tableRows (count, startAt = 1) {
  const rows = ['| id | metric | value | note |', '| --- | --- | --- | --- |']
  for (let r = startAt; r < startAt + count; r++) {
    rows.push(`| ${r} | metric-${r % 97} | ${(r * 37) % 1000}ms | row note ${r % 13} |`)
  }
  return rows.join('\n')
}

export function codeBlock (lines, lang = 'js') {
  const body = []
  for (let i = 0; i < lines; i++) body.push(`const sample${i} = ${i * 31 + 7}; // deterministic line ${i}`)
  return '```' + lang + '\n' + body.join('\n') + '\n```'
}

export function nestedList (depth, breadth = 3) {
  const out = []
  for (let d = 0; d < depth; d++) {
    out.push('  '.repeat(d) + `- level ${d} item`)
    if (d % 2 === 1) out.push('  '.repeat(d + 1) + `- nested filler ${d}`)
    for (let b = 0; b < breadth - 1; b++) out.push('  '.repeat(d) + `- level ${d} filler ${b}`)
  }
  return out.join('\n')
}

export function nestedQuote (depth) {
  let s = 'quoted line with measured words.'
  for (let d = 0; d < depth; d++) s = '> ' + s
  return s
}
// END_BLOCK_SECTION_BUILDERS

// START_BLOCK_ENCODERS
// Byte-policy corpus (R-1). latin1 and UTF-16 use Node-native paths; koi8-r and
// cp-1251 are 256-entry single-byte tables restricted to the corpus pools;
// Shift-JIS and GB2312 fixtures are PRECOMPUTED pinned samples (byte arrays
// below are the fixed encodings of SAMPLE_SHIFT_JIS / SAMPLE_GB2312 text) —
// documented as such so regeneration never depends on an external iconv.
// KOI8-R lowercase layout is homoglyph-ordered, NOT sequential — this exact
// 32-byte table (U+0430..U+044F) was dumped from Python's koi8-r codec and
// verified byte-for-byte (2026-10-27); uppercase = lowercase + 0x20.
const KOI8_R_LOWER = [0xC1, 0xC2, 0xD7, 0xC7, 0xC4, 0xC5, 0xD6, 0xDA, 0xC9, 0xCA, 0xCB, 0xCC, 0xCD, 0xCE, 0xCF, 0xD0, 0xD2, 0xD3, 0xD4, 0xD5, 0xC6, 0xC8, 0xC3, 0xDE, 0xDB, 0xDD, 0xDF, 0xD9, 0xD8, 0xDC, 0xC0, 0xD1]
const CP1251_EXTRA = { 0x00A9: 0xA9, 0x00AB: 0xAB, 0x00BB: 0xBB, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x00B7: 0xB7, 0x2026: 0x85, 0x2116: 0xB9, 0x0401: 0xA8, 0x0451: 0xB8 }

function koi8Byte (code) {
  if (code < 0x20) return code // control chars (\n) map identically
  if (code >= 0x20 && code < 0x7F) return code
  if (code >= 0x0430 && code <= 0x044F) return KOI8_R_LOWER[code - 0x0430]
  if (code >= 0x0410 && code <= 0x042F) return KOI8_R_LOWER[code - 0x0410] + 0x20
  if (code === 0x00A9) return 0xBF
  if (code === 0x00B7) return 0x9E
  throw new Error(`koi8-r: unmappable U+${code.toString(16)} — extend the sample pool or the table`)
}

function cp1251Byte (code) {
  if (code < 0x20) return code // control chars (\n) map identically
  if (code >= 0x20 && code < 0x7F) return code
  if (code >= 0x0410 && code <= 0x044F) return 0xC0 + (code - 0x0410)
  if (Object.prototype.hasOwnProperty.call(CP1251_EXTRA, code)) return CP1251_EXTRA[code]
  throw new Error(`cp1251: unmappable U+${code.toString(16)} — extend the sample pool or the table`)
}

export const SAMPLE_RU = 'документ редактор раздел отрисовка замер базовая печать прокрутка фикстура оракул снимок метка'
export const SAMPLE_EN = 'document editor section render measure baseline typing scroll fixture oracle snapshot marker'
export const SAMPLE_SHIFT_JIS_TEXT = 'ドキュメント 編集者 測定 基準線'
export const SAMPLE_SHIFT_JIS_BYTES = Buffer.from([0x83, 0x68, 0x83, 0x4A, 0x83, 0x85, 0x83, 0x81, 0x83, 0x93, 0x83, 0x67, 0x20, 0x95, 0x52, 0x8F, 0x57, 0x8E, 0x52, 0x20, 0x91, 0xAA, 0x92, 0xE8, 0x20, 0x8A, 0xEE, 0x8F, 0x80, 0x90, 0xFC])
export const SAMPLE_GB2312_TEXT = '文档 编辑 测量 基线'
export const SAMPLE_GB2312_BYTES = Buffer.from([0xCE, 0xC4, 0xB5, 0xB5, 0x20, 0xB1, 0xE0, 0xBC, 0xAD, 0x20, 0xB2, 0xE2, 0xC1, 0xBF, 0x20, 0xBB, 0xF9, 0xCF, 0xDF])

export const ENCODERS = {
  utf8: (s) => Buffer.from(s, 'utf8'),
  utf8bom: (s) => Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(s, 'utf8')]),
  utf16le: (s) => Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(s, 'utf16le')]),
  utf16be (s) {
    const le = Buffer.from(s, 'utf16le')
    const be = Buffer.alloc(le.length)
    for (let i = 0; i < le.length; i += 2) { be[i] = le[i + 1]; be[i + 1] = le[i] }
    return Buffer.concat([Buffer.from([0xFE, 0xFF]), be])
  },
  latin1: (s) => Buffer.from(s, 'latin1'),
  koi8r (s) {
    const out = Buffer.alloc(Buffer.byteLength(s, 'utf8'))
    let p = 0
    for (const ch of s) { const b = koi8Byte(ch.codePointAt(0)); out[p++] = b }
    return out.subarray(0, p)
  },
  cp1251 (s) {
    const out = Buffer.alloc(Buffer.byteLength(s, 'utf8'))
    let p = 0
    for (const ch of s) { const b = cp1251Byte(ch.codePointAt(0)); out[p++] = b }
    return out.subarray(0, p)
  }
}
// END_BLOCK_ENCODERS

export const NL = {
  lf: (s) => s,
  crlf (s) { return s.replace(/\n/g, '\r\n') },
  mixed (s) { return s.split('\n').map((l, i) => (i % 2 === 0 ? l + '\r' : l)).join('\n') },
  noFinal (s) { return s.replace(/\n$/, '') }
}
