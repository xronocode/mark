#!/usr/bin/env node
/**
 * MODULE_CONTRACT
 *   PURPOSE: Build-time guard for M-024 perf-splash CSP integrity. Reads
 *            src/renderer/index.html, extracts every inline <script>
 *            element, computes its SHA-256, and verifies that each hash
 *            is present in the CSP `script-src` directive of
 *            src-tauri/tauri.conf.json. Exits non-zero on drift.
 *   SCOPE:   Inline <script>...</script> elements in index.html only.
 *            External scripts (`<script src=...>`) are skipped — they
 *            are subject to `'self'`, not hash-allowlisting.
 *   DEPENDS: Node ≥18 crypto/subtle and node:fs/node:path stdlib.
 *   LINKS:   docs/verification-plan.xml V-M-024 (numeric thresholds +
 *            CSP-hash check); commit edada97 dev-CSP fix history.
 *
 * USAGE:    node scripts/verify-csp-script-hash.mjs
 *           Exit code 0 = all good; 1 = at least one inline script
 *           missing from CSP allowlist (or extra hash present, etc.).
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

const indexPath = resolve(repoRoot, 'src/renderer/index.html')
const confPath = resolve(repoRoot, 'src-tauri/tauri.conf.json')

const html = readFileSync(indexPath, 'utf8')
const conf = JSON.parse(readFileSync(confPath, 'utf8'))

const csp = conf?.app?.security?.csp
if (!csp || typeof csp !== 'string') {
  console.error('[verify-csp-script-hash] tauri.conf.json: app.security.csp missing or not a string')
  process.exit(1)
}

// Extract `script-src` directive contents (up to next `;`).
const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/)
if (!scriptSrcMatch) {
  console.error('[verify-csp-script-hash] CSP has no script-src directive')
  process.exit(1)
}
const scriptSrc = scriptSrcMatch[1]

// Extract every inline <script>...</script> block (no `src` attr).
const inlineScripts = []
const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
let m
while ((m = scriptRe.exec(html)) !== null) {
  const attrs = m[1] || ''
  const body = m[2] || ''
  if (/\bsrc\s*=/.test(attrs)) continue
  inlineScripts.push(body)
}

if (inlineScripts.length === 0) {
  console.error('[verify-csp-script-hash] index.html has zero inline scripts — M-024 contract requires at least 3')
  process.exit(1)
}

const hashes = inlineScripts.map((body) => {
  const h = createHash('sha256').update(body, 'utf8').digest('base64')
  return { body, hash: `sha256-${h}` }
})

const cspHashes = Array.from(scriptSrc.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)).map((x) =>
  x[0].slice(1, -1)
)

let missing = 0
for (const { hash } of hashes) {
  if (!cspHashes.includes(hash)) {
    console.error(`[verify-csp-script-hash] inline-script hash NOT in CSP: '${hash}'`)
    missing++
  }
}
let extra = 0
for (const cspHash of cspHashes) {
  if (!hashes.some((h) => h.hash === cspHash)) {
    console.warn(`[verify-csp-script-hash] CSP hash has no matching inline script (stale?): '${cspHash}'`)
    extra++
  }
}

if (missing > 0) {
  console.error(`[verify-csp-script-hash] FAIL — ${missing} inline-script hash(es) missing from CSP`)
  console.error('[verify-csp-script-hash] expected hashes:')
  for (const { hash } of hashes) console.error(`  '${hash}'`)
  process.exit(1)
}

console.log(
  `[verify-csp-script-hash] OK — ${hashes.length} inline script(s) hashed and present in CSP` +
    (extra ? ` (${extra} extra/stale CSP hash(es) — review)` : '')
)
process.exit(0)
