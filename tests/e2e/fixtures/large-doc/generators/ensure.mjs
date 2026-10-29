// FILE: tests/e2e/fixtures/large-doc/generators/ensure.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: On-demand corpus materialization for suites — guarantee every fixture (committed and materialized) exists with the pinned bytes before a test run touches it.
//   SCOPE: verify-or-build only: if a fixture is missing or its sha256 drifts from shape-metadata.json, rebuild the corpus in place; export ensureCorpus() for programmatic use.
//   DEPENDS: node:fs/promises, node:crypto, node:path, ./build-corpus.mjs.
//   LINKS: [tests/e2e/perf characterization suites] [regen.mjs determinism gate]
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   sha256 - hex digest helper.
//   corpusDir - fixture corpus directory.
//   ensureCorpus - materializes byte-policy files the commit gate excludes, verifying every sha256 pin.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-10-27 - C-LARGE-DOC-STAGE-0 T-002: suite-side materializer for gate-excluded byte-policy fixtures.]
// END_CHANGE_SUMMARY

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { main as buildCorpus } from './build-corpus.mjs'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const corpusDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function ensureCorpus () {
  const metaPath = path.join(corpusDir, 'shape-metadata.json')
  let meta
  try {
    meta = JSON.parse(await readFile(metaPath, 'utf8'))
  } catch {
    await buildCorpus(corpusDir, {})
    meta = JSON.parse(await readFile(metaPath, 'utf8'))
  }
  for (const fixture of meta.fixtures) {
    try {
      const buf = await readFile(path.join(corpusDir, fixture.name))
      if (sha256(buf) === fixture.sha256) continue
    } catch { /* missing */ }
    await buildCorpus(corpusDir, {})
    return corpusDir
  }
  return corpusDir
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = await ensureCorpus()
  console.log(`[corpus][ensure] fixtures ready under ${dir}`)
}
