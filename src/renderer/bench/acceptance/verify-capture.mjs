#!/usr/bin/env node
// FILE: src/renderer/bench/acceptance/verify-capture.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Validate a tier-3 (real-app WKWebView) acceptance capture before the owner reviews it: label honesty, exact fixture identity, marker grammar, content-free markers, and a commit that exists in this repository.
//   SCOPE: Reads one capture JSON (never committed — it lives under .mark-local/) plus the fixture it names, re-hashes the fixture bytes, checks the recorded commit with git, and rejects unfilled placeholders, browser-tier labels, private absolute paths, unknown/extra marker keys, non-numeric metrics and a missing required phase. It does not measure anything and never claims native measurements itself.
//   DEPENDS: node:fs, node:crypto, node:path, node:child_process (git cat-file), tests/e2e/fixtures/large-doc/shape-metadata.json.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-005 (R-5 tier 3); src/renderer/bench/acceptance/README.md.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   REPO_ROOT - this checkout's root.
//   ALLOWED_ENGINE_LABELS - native-only labels; a browser/Playwright label is a lie for this tier.
//   MARKERS - required marker to allowed keys (content-free proof: unknown keys are rejected).
//   NUMERIC_KEYS - marker keys that must be finite numbers.
//   PLACEHOLDER - unfilled template marker.
//   PRIVATE_ROOTS - absolute-path roots rejected wherever they appear in a capture.
//   failures - accumulated violation count driving the exit status.
//   check - records one PASS/FAIL line.
//   fail - records one unconditional FAIL line.
//   parseArgs - --capture, --fixture, --help.
//   usage - prints the CLI usage text.
//   finish - prints the verdict and returns the process exit code.
//   main - parses, validates capture shape, fixture bytes/hash, commit existence and marker grammar.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-STAGE-0 T-005: first capture verifier for the owner-run real-app tier.
// END_CHANGE_SUMMARY

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const ALLOWED_ENGINE_LABELS = ['native-wkwebview', 'tauri-artifact']
const MARKERS = {
  BLOCK_FIXTURE: ['id', 'bytes', 'sha256'],
  BLOCK_OPEN: ['first_content_ms', 'time_to_input_ms'],
  BLOCK_TYPING: ['n', 'p50_ms', 'p95_ms', 'truth', 'typed_landed'],
  BLOCK_SCROLL: ['frames', 'frame_p95_ms', 'jank_frames'],
  BLOCK_CLOSE: ['ms'],
  BLOCK_DONE: ['status']
}
const NUMERIC_KEYS = new Set([
  'bytes',
  'first_content_ms',
  'time_to_input_ms',
  'n',
  'p50_ms',
  'p95_ms',
  'frames',
  'frame_p95_ms',
  'jank_frames',
  'ms'
])
const PLACEHOLDER = /<[^>]*>/
const PRIVATE_ROOTS = [/^\/home\//, /^[A-Za-z]:[\\/]/, ['/', 'Users', '/'].join('')]

let failures = 0

function check (ok, label, detail) {
  if (ok) {
    console.log(`PASS ${label}`)
  } else {
    failures++
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function fail (label, detail) {
  check(false, label, detail)
}

function parseArgs (argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--capture') out.capture = argv[++i]
    else if (arg === '--fixture') out.fixture = argv[++i]
    else if (arg === '--help' || arg === '-h') out.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return out
}

function usage () {
  return [
    'usage: node src/renderer/bench/acceptance/verify-capture.mjs --capture <json> [--fixture <repository-relative path>]'
  ].join('\n')
}

function main () {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return 0
  }
  if (!args.capture) {
    console.error(usage())
    return 2
  }

  let raw
  try {
    raw = readFileSync(args.capture, 'utf8')
  } catch (err) {
    console.error(`cannot read capture: ${err.message}`)
    return 2
  }

  check(!PLACEHOLDER.test(raw), 'no unfilled template placeholders')
  check(!PRIVATE_ROOTS.some((re) => typeof re === 'string' ? raw.includes(re) : re.test(raw)), 'no private absolute paths in the capture')

  let capture
  try {
    capture = JSON.parse(raw)
  } catch (err) {
    console.error(`capture is not valid JSON: ${err.message}`)
    return 1
  }

  check(capture.tier === 'real-app', 'tier is real-app', `got ${JSON.stringify(capture.tier)}`)

  const label = capture.engineLabel
  check(
    typeof label === 'string' && ALLOWED_ENGINE_LABELS.includes(label),
    'engine label is native (never Playwright/browser evidence)',
    `got ${JSON.stringify(label)}`
  )

  // Fixture: repository-relative path, real file, exact bytes + hash.
  const fixturePath = args.fixture || (capture.fixture && capture.fixture.path)
  if (typeof fixturePath !== 'string' || !fixturePath) {
    fail('capture names a fixture path')
  } else if (path.isAbsolute(fixturePath)) {
    fail('fixture path is repository-relative', `got an absolute path`)
  } else {
    const absolute = path.resolve(REPO_ROOT, fixturePath)
    const relative = path.relative(REPO_ROOT, absolute)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      fail('fixture stays inside this repository')
    } else if (!existsSync(absolute)) {
      fail('fixture file exists', fixturePath)
    } else {
      const bytes = readFileSync(absolute)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      check(capture.fixture.bytes === bytes.length, 'fixture byte length matches the file', `${capture.fixture.bytes} vs ${bytes.length}`)
      check(capture.fixture.sha256 === sha256, 'fixture sha256 matches the file', `${capture.fixture.sha256} vs ${sha256}`)
    }
  }

  // Commit must exist in this repository — a capture cannot point at a phantom build.
  const commit = capture.artifactCommit
  if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit)) {
    fail('artifactCommit is a hex commit id', `got ${JSON.stringify(commit)}`)
  } else {
    let exists = true
    try {
      execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: REPO_ROOT, stdio: 'ignore' })
    } catch (err) {
      exists = false
    }
    check(exists, 'artifactCommit exists in this repository', commit)
  }

  // Markers: required, known, content-free, numeric where they must be.
  const markers = capture.markers
  if (!Array.isArray(markers)) {
    fail('markers is an array of {name, values}')
    return finish()
  }
  const byName = new Map()
  for (const marker of markers) {
    if (!marker || typeof marker !== 'object' || typeof marker.name !== 'string') {
      fail('every marker has a name')
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(MARKERS, marker.name)) {
      fail(`marker ${marker.name} is a known BLOCK_* marker`)
      continue
    }
    if (byName.has(marker.name)) {
      fail(`marker ${marker.name} appears once`)
      continue
    }
    byName.set(marker.name, marker.values || {})
  }

  for (const [name, allowedKeys] of Object.entries(MARKERS)) {
    const values = byName.get(name)
    if (!values) {
      fail(`required marker ${name} is present`)
      continue
    }
    const extra = Object.keys(values).filter((key) => !allowedKeys.includes(key))
    check(extra.length === 0, `${name} carries only content-free keys`, `extra: ${extra.join(', ')}`)
    const missing = allowedKeys.filter((key) => !(key in values))
    check(missing.length === 0, `${name} carries every required key`, `missing: ${missing.join(', ')}`)
    for (const [key, value] of Object.entries(values)) {
      if (!NUMERIC_KEYS.has(key)) continue
      check(typeof value === 'number' && Number.isFinite(value), `${name}.${key} is a finite number`, JSON.stringify(value))
    }
  }

  const done = byName.get('BLOCK_DONE')
  check(Boolean(done) && done.status === 'ok', 'BLOCK_DONE.status is ok', JSON.stringify(done && done.status))
  const typing = byName.get('BLOCK_TYPING')
  check(Boolean(typing) && typing.truth === 'ok', 'BLOCK_TYPING.truth is ok', JSON.stringify(typing && typing.truth))
  check(Boolean(typing) && typing.typed_landed === true, 'BLOCK_TYPING.typed_landed is true (the typed character is in the measured block)', JSON.stringify(typing && typing.typed_landed))

  return finish()
}

function finish () {
  if (failures) {
    console.log(`\nVERDICT: FAIL (${failures} violation${failures === 1 ? '' : 's'}) — do not use as evidence`)
    return 1
  }
  console.log('\nVERDICT: PASS — capture is structurally valid; owner review is still required before it counts as evidence')
  return 0
}

process.exitCode = main()
