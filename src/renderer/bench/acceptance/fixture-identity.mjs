#!/usr/bin/env node
// FILE: src/renderer/bench/acceptance/fixture-identity.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Print the exact identity (bytes + sha256) of a Stage 0 fixture for the real-app acceptance tier, and the matching content-free BLOCK_FIXTURE marker line the owner pastes into a capture.
//   SCOPE: Reads one fixture file inside this repository, hashes its raw bytes, prints a human line and — with --json — a machine envelope. Refuses paths outside the repository (private absolute paths never enter evidence).
//   DEPENDS: node:fs, node:crypto, node:path, node:url; tests/e2e/fixtures/large-doc/shape-metadata.json (the corpus pin, cross-checked when the fixture is a corpus member).
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-005 (R-5 tier 3); src/renderer/bench/acceptance/README.md.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   REPO_ROOT - this checkout's root (resolved from this file).
//   parseArgs - --fixture, --fixture-id, --json.
//   main - resolves the fixture inside the repo, hashes bytes, cross-checks the committed corpus pin, prints identity + BLOCK_FIXTURE line.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-STAGE-0 T-005: initial identity tool for tier-3 captures.
// END_CHANGE_SUMMARY

import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function parseArgs (argv) {
  const out = { json: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--fixture') out.fixture = argv[++i]
    else if (arg === '--fixture-id') out.fixtureId = argv[++i]
    else if (arg === '--json') out.json = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return out
}

function usage () {
  return [
    'usage: node src/renderer/bench/acceptance/fixture-identity.mjs \\',
    '         --fixture <repository-relative path> [--fixture-id <opaque id>] [--json]'
  ].join('\n')
}

function main () {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return 0
  }
  if (!args.fixture) {
    console.error(usage())
    return 2
  }
  if (path.isAbsolute(args.fixture)) {
    console.error('refused: --fixture must be repository-relative (no private absolute paths in evidence)')
    return 2
  }
  const absolute = path.resolve(REPO_ROOT, args.fixture)
  const relative = path.relative(REPO_ROOT, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    console.error('refused: --fixture resolves outside this repository')
    return 2
  }
  const stat = statSync(absolute)
  if (!stat.isFile()) {
    console.error('refused: --fixture must be a regular file')
    return 2
  }

  const bytes = stat.size
  const sha256 = createHash('sha256').update(readFileSync(absolute)).digest('hex')
  const fixtureId = args.fixtureId || path.basename(absolute)

  // Cross-check the committed corpus pin when this file is a corpus member.
  let pin = null
  try {
    const metadata = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'tests/e2e/fixtures/large-doc/shape-metadata.json'), 'utf8')
    )
    const corpusPrefix = 'tests/e2e/fixtures/large-doc/'
    const pinName = relative.split(path.sep).join('/').startsWith(corpusPrefix)
      ? relative.split(path.sep).join('/').slice(corpusPrefix.length)
      : null
    pin = pinName ? metadata.fixtures.find((f) => f.name === pinName) || null : null
  } catch (err) {
    pin = null
  }
  let pinStatus = 'not-a-corpus-member'
  if (pin) {
    pinStatus = pin.bytes === bytes && pin.sha256 === sha256 ? 'matches-committed-pin' : 'MISMATCH'
  }
  if (pinStatus === 'MISMATCH') {
    console.error(`refused: ${relative} does not match its committed corpus pin (bytes=${bytes} sha256=${sha256})`)
    return 1
  }

  const identity = {
    fixture: { id: fixtureId, path: relative, bytes, sha256 },
    pin: pinStatus
  }
  const marker = `[BLOCK_FIXTURE id=${fixtureId} bytes=${bytes} sha256=${sha256}]`

  if (args.json) {
    console.log(JSON.stringify({ ...identity, marker }, null, 2))
  } else {
    console.log(`fixture: ${relative}`)
    console.log(`id:      ${fixtureId}`)
    console.log(`bytes:   ${bytes}`)
    console.log(`sha256:  ${sha256}`)
    console.log(`pin:     ${pinStatus}`)
    console.log('')
    console.log('marker line for the capture:')
    console.log(marker)
  }
  return 0
}

process.exitCode = main()
