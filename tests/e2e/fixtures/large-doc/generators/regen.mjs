// FILE: tests/e2e/fixtures/large-doc/generators/regen.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Determinism gate for the C-LARGE-DOC-STAGE-0 corpus — regenerate every fixture into .regen-tmp, byte-compare the committed copies and sha256-verify the materialized (non-UTF-8, gate-admission-excluded) ones against their metadata pins.
//   SCOPE: --check compares and exits 0 (identical) / 1 (drift, listing offenders); without --check it regenerates the corpus in place (materializing the byte-policy fixtures for local runs).
//   DEPENDS: node:fs/promises, node:crypto, node:path, ./build-corpus.mjs.
//   LINKS: [approved plan C-LARGE-DOC-STAGE-0 MustPassCommand] [V-M-060 pending T-010 routing]
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   main() - --check: build into .regen-tmp, verify committed bytes + materialized sha256 pins, clean up, print [corpus][regen]; no flag: rebuild in place.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.1.0 - 2026-10-27 - C-LARGE-DOC-STAGE-0 T-002: non-UTF-8 byte-policy fixtures become hash-pinned materialized artifacts (owner gate fail-closes on non-UTF-8 payloads); committed set stays pure UTF-8.]
// END_CHANGE_SUMMARY

import { mkdir, rm, readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { main as buildCorpus } from './build-corpus.mjs'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const here = path.dirname(fileURLToPath(import.meta.url))
const corpusDir = path.resolve(here, '..')
const tmp = path.join(corpusDir, '.regen-tmp')
const check = process.argv.includes('--check')

if (!check) {
  const n = (await buildCorpus(corpusDir, {})).length
  console.log(`[corpus][regen] ${n} fixtures regenerated in place`)
  process.exit(0)
}

await rm(tmp, { recursive: true, force: true })
await mkdir(tmp, { recursive: true })
await buildCorpus(tmp, {})

const meta = JSON.parse(await readFile(path.join(tmp, 'shape-metadata.json'), 'utf8'))
const materialized = new Set(meta.fixtures.filter(f => f.storage === 'materialized').map(f => f.name))

async function walk (dir, base = '') {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.regen-tmp' || entry.name === 'generators') continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...await walk(path.join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out.sort()
}

const offenders = []
const committed = new Set((await walk(corpusDir)).filter(rel => !materialized.has(rel)))
let pinned = 0
for (const fixture of meta.fixtures) {
  if (fixture.name === 'shape-metadata.json') continue
  const gen = await readFile(path.join(tmp, fixture.name))
  if (sha256(gen) !== fixture.sha256) offenders.push(`pin-mismatch(generated): ${fixture.name}`)
  if (fixture.storage === 'committed') {
    committed.delete(fixture.name)
    const disk = await readFile(path.join(corpusDir, fixture.name))
    if (!disk.equals(gen)) offenders.push(`differ: ${fixture.name}`)
  } else {
    pinned++
    try {
      const disk = await readFile(path.join(corpusDir, fixture.name))
      if (sha256(disk) !== fixture.sha256) offenders.push(`differ(materialized): ${fixture.name}`)
    } catch { /* absent locally is fine — materialized on demand */ }
  }
}
committed.delete('shape-metadata.json')
const missing = [...committed]
const metaDisk = await readFile(path.join(corpusDir, 'shape-metadata.json'))
const metaGen = await readFile(path.join(tmp, 'shape-metadata.json'))
if (!metaDisk.equals(metaGen)) offenders.push('differ: shape-metadata.json')
await rm(tmp, { recursive: true, force: true })

if (offenders.length || missing.length) {
  console.log(`[corpus][regen] DRIFT — ${offenders.length} offenders, ${missing.length} committed-but-not-generated`)
  for (const o of offenders) console.log(`  ${o}`)
  for (const m of missing) console.log(`  extra committed: ${m}`)
  process.exit(1)
}
console.log(`[corpus][regen] ${meta.fixtures.length - 1 - pinned} committed fixtures byte-identical + ${pinned} materialized sha256-pins verified — deterministic`)
process.exit(0)
