#!/usr/bin/env node
// Generate test/fixtures/ipc-channels/tauri.v2.json — the Tauri-side
// reborn-mark IPC surface, derived from the M-013a typed-invoke
// CommandMap. Source of truth is src/renderer/src/ipc/contract/types.ts.
//
// Phase-B1 step-4 per docs/development-plan.xml. Pairs with electron.v1.json
// (step-3) — the schema-parity checker (V-M-013a, Phase-B2 step-1) compares
// the two fixtures to flag channels v1 has but v2 does not yet implement
// (expected during the port; turns into a coverage report).
//
// Why a static fixture and not a runtime introspection: M-013a's CommandMap
// is a TypeScript type, not a runtime object. We extract by parsing the
// types.ts AST. This is faster than spinning up tsc + a runtime checker
// and gives the schema-parity check a stable artifact to diff against.
//
// Usage: `node tools/gen-tauri-v2-fixture.mjs`
//
// Output: test/fixtures/ipc-channels/tauri.v2.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const TYPES_PATH = resolve(REPO_ROOT, 'src/renderer/src/ipc/contract/types.ts')
const OUT_DIR = resolve(REPO_ROOT, 'test/fixtures/ipc-channels')
const OUT_PATH = resolve(OUT_DIR, 'tauri.v2.json')

// ─── extract command names from CommandName union ──────────────────────
//
// We do a focused regex parse, not a full TS AST walk. The contract
// (types.ts MODULE_CONTRACT) requires CommandName entries to follow
// the pattern `'mt::lowercase_snake_case'` and live in either:
//   1. `export type CommandName = 'mt::a' | 'mt::b' | ...`
//   2. `export interface CommandMap { 'mt::a': {...}; 'mt::b': {...}; ... }`
//
// We extract from CommandMap (richer — includes args/result) and
// cross-check against CommandName.

function extractCommandMap(src) {
  // Find the `export interface CommandMap { ... }` block — match the
  // brace-balanced body starting at the first `{` after the keyword.
  const startMatch = src.match(/export\s+interface\s+CommandMap\s*\{/)
  if (!startMatch) throw new Error('no CommandMap export found in types.ts')
  let i = startMatch.index + startMatch[0].length
  let depth = 1
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
    if (depth === 0) break
    i++
  }
  const body = src.slice(startMatch.index + startMatch[0].length, i)

  // Each entry: `'mt::name': { args: ..., result: ... }`.
  // We only need the names + a structural marker that args/result exist.
  const entries = []
  const re = /['"](mt::[a-z0-9_]+)['"]\s*:\s*\{/g
  let m
  while ((m = re.exec(body))) entries.push(m[1])
  return entries
}

function extractCommandNameUnion(src) {
  const m = src.match(/export\s+type\s+CommandName\s*=\s*([\s\S]*?);/)
  if (!m) throw new Error('no CommandName export found in types.ts')
  const lit = m[1]
  const names = []
  const re = /['"](mt::[a-z0-9_]+)['"]/g
  let n
  while ((n = re.exec(lit))) names.push(n[1])
  return names
}

function extractErrorCodes(src) {
  const m = src.match(/export\s+const\s+IpcErrorCode\s*=\s*\{([\s\S]*?)\}\s+as\s+const/)
  if (!m) throw new Error('no IpcErrorCode export found in types.ts')
  const codes = []
  const re = /[A-Z_]+\s*:\s*['"]([A-Z_]+)['"]/g
  let n
  while ((n = re.exec(m[1]))) codes.push(n[1])
  return codes
}

// ─── main ─────────────────────────────────────────────────────────────
function main() {
  const src = readFileSync(TYPES_PATH, 'utf8')
  const mapEntries = extractCommandMap(src)
  const unionEntries = extractCommandNameUnion(src)
  const errorCodes = extractErrorCodes(src)

  // Cross-check: every union member must have a CommandMap entry, and
  // vice versa. Drift between them is a contract violation that should
  // fail the parity check before downstream tooling runs.
  const onlyUnion = unionEntries.filter((n) => !mapEntries.includes(n))
  const onlyMap = mapEntries.filter((n) => !unionEntries.includes(n))
  if (onlyUnion.length || onlyMap.length) {
    process.stderr.write('CommandName <-> CommandMap drift detected:\n')
    if (onlyUnion.length) process.stderr.write(`  in CommandName but not CommandMap: ${onlyUnion.join(', ')}\n`)
    if (onlyMap.length) process.stderr.write(`  in CommandMap but not CommandName: ${onlyMap.join(', ')}\n`)
    process.exit(1)
  }

  const channels = mapEntries.sort().map((name) => ({
    name,
    direction: 'renderer->main',
    transport: 'invoke',
    layer: 'M-013a',
    has_args: true,
    has_result: true
  }))

  const fixture = {
    schema_version: 1,
    source: {
      module: 'M-013a',
      file: 'src/renderer/src/ipc/contract/types.ts',
      generated_from: 'CommandMap interface'
    },
    generated_at: new Date().toISOString(),
    counts: {
      commands: channels.length,
      error_codes: errorCodes.length
    },
    error_codes: errorCodes.sort(),
    channels
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(fixture, null, 2) + '\n')

  process.stderr.write(`wrote ${channels.length} M-013a command(s)\n`)
  process.stderr.write(`error codes: ${errorCodes.length}\n`)
  process.stderr.write(`out: test/fixtures/ipc-channels/tauri.v2.json\n`)
}

main()
