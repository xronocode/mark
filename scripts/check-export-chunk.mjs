// FILE: scripts/check-export-chunk.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Guard the lazy DOCX export chunk (C-NATIVE-DOCX-RTF-EXPORT): the entry chunk must carry no docx code and the docx dynamic chunk must stay within the gzip budget.
//   SCOPE: reads the built renderer output (src/renderer/dist), no writes, exit code is the verdict.
//   DEPENDS: node:fs, node:zlib (stdlib only).
//   LINKS: .grace/changes/active/C-NATIVE-DOCX-RTF-EXPORT (R-7, T-001/T-006); package.json script check:export-chunk.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DIST - the built renderer output directory scanned for JS assets.
//   DOCX_MARKER - the library-unique string whose presence marks a docx chunk.
//   BUDGET_BYTES - the gzip budget for any chunk carrying docx code.
//   listJsFiles - recursive .js collector over the dist tree.
//   entrySrcs - script srcs of dist/index.html.
//   entryFiles - the srcs resolved to dist-relative files.
//   html - the parsed index.html used to find entry chunks.
//   jsFiles - every built JS file.
//   failed - the violation flag; the exit code is its value.
// END_MODULE_MAP

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, relative } from 'node:path'

const DIST = 'src/renderer/dist'
const BUDGET_BYTES = 300 * 1024
// A string that only exists inside the docx/docx-html library code, never in
// Mark's own sources: the importer's own function name.
const DOCX_MARKER = 'htmlToContent'

function listJsFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listJsFiles(p))
    else if (p.endsWith('.js')) out.push(p)
  }
  return out
}

const jsFiles = listJsFiles(DIST)
if (jsFiles.length === 0) {
  console.error('[check-export-chunk] no built JS found under ' + DIST + ' — run `npm run build` first')
  process.exit(2)
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const entrySrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
const entryFiles = entrySrcs.map((s) => join(DIST, s.replace(/^.*?dist\//, '')))

let failed = false
for (const f of jsFiles) {
  const code = readFileSync(f, 'utf8')
  const hasDocx = code.includes(DOCX_MARKER)
  const isEntry = entryFiles.some((e) => relative('.', e) === relative('.', f))
  if (isEntry && hasDocx) {
    console.error(`[check-export-chunk] FAIL entry chunk contains docx code: ${f}`)
    failed = true
  }
  if (hasDocx) {
    const gz = gzipSync(Buffer.from(code)).length
    const ok = gz <= BUDGET_BYTES
    console.log(`[check-export-chunk] docx chunk ${f}: ${gz} bytes gzip (budget ${BUDGET_BYTES}) ${ok ? 'OK' : 'FAIL'}`)
    if (!ok) failed = true
  }
}
if (!failed) console.log(`[check-export-chunk] BLOCK_EXPORT_CHUNK_GUARD_OK files=${jsFiles.length} entry=${entryFiles.length}`)
process.exit(failed ? 1 : 0)
