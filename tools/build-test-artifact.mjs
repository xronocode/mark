#!/usr/bin/env node
// FILE: tools/build-test-artifact.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce the isolated Mark Test acceptance artifact procedure — merge-config identity substitution (never tracked-file edits), updater artifacts off, debug bundle, binary digest, optional smoke, registry append — so acceptance artifacts stop depending on session memory.
//   SCOPE: CLI --item <id> [--platform macos|windows] [--smoke] [--dry-run]; builds from the CURRENT worktree head; appends to docs/acceptance/registry.json unless --dry-run.
//   DEPENDS: node:fs/child_process, src-tauri/tauri.conf.json (read), npx tauri build --debug --config <temp merge config>.
//   LINKS: docs/acceptance/README.md; C-ACCEPTANCE-REGISTRY; V-M-046 acceptance scenario.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root path.
//   args - Raw CLI arguments.
//   get - Read the value following one named CLI flag.
//   item - Acceptance item id from --item.
//   platform - Target platform from --platform (default macos).
//   dryRun - Whether --dry-run skips building and recording.
//   smoke - Whether --smoke launches and quits the built app.
//   sha - Current worktree HEAD commit.
//   short - Seven-character HEAD abbreviation used in the bundle identity.
//   slug - Lowercase alphanumeric item id used in the bundle identifier.
//   productName - Isolated "Mark Test <item>" product name.
//   identifier - Isolated bundle identifier.
//   merge - Temporary Tauri merge-config overrides.
//   tmp - Temporary build-config directory.
//   confPath - Path of the temporary merge-config file.
//   bundleDir - Built .app or NSIS artifact directory.
//   binary - macOS app binary path used for the digest.
//   digest - SHA-256 of the built binary.
//   registryPath - Acceptance registry JSON path.
//   registry - Parsed acceptance registry document.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-21 C-ACCEPTANCE-REGISTRY: new.
// END_CHANGE_SUMMARY

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const get = (name) => {
  const i = args.indexOf(name)
  return i > -1 ? args[i + 1] : undefined
}
const item = get('--item')
const platform = get('--platform') ?? 'macos'
const dryRun = args.includes('--dry-run')
const smoke = args.includes('--smoke')

if (!item) {
  console.log(`Usage:
  node tools/build-test-artifact.mjs --item FIX-009 [--platform macos|windows] [--smoke] [--dry-run]

Builds an isolated Mark Test artifact from the CURRENT worktree head:
  - identity: Mark Test <ITEM> / com.xronocode.mark.test.<item-slug>.<short-sha>
  - updater artifacts off, debug bundle (macos: .app, windows: nsis)
  - binary SHA-256 recorded; --smoke launches and quits (macos)
  - appends the artifact to docs/acceptance/registry.json (skipped with --dry-run)`)
  process.exit(0)
}

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
const short = sha.slice(0, 7)
const slug = item.toLowerCase().replace(/[^a-z0-9]+/g, '')
const productName = `Mark Test ${item}`
const identifier = `com.xronocode.mark.test.${slug}.${short}`
const merge = {
  productName,
  identifier,
  bundle: {
    createUpdaterArtifacts: false,
    ...(platform === 'macos' ? { targets: ['app'] } : { targets: ['nsis'] })
  }
}

console.log('[build-test-artifact] source:', sha)
console.log('[build-test-artifact] identity:', identifier)
console.log('[build-test-artifact] merge config:', JSON.stringify(merge))

if (dryRun) {
  console.log('[build-test-artifact] dry run — nothing built, nothing recorded')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'mark-test-conf-'))
const confPath = join(tmp, 'tauri.test.conf.json')
writeFileSync(confPath, JSON.stringify(merge))

try {
  execFileSync('npx', ['tauri', 'build', '--debug', '--config', confPath], {
    cwd: ROOT, stdio: 'inherit'
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

const bundleDir =
  platform === 'macos'
    ? join(ROOT, 'target/debug/bundle/macos', `${productName}.app`)
    : join(ROOT, 'target/debug/bundle/nsis')
const binary = platform === 'macos' ? join(bundleDir, 'Contents/MacOS/mark') : null
if (!binary) {
  console.log('[build-test-artifact] windows: inspect', bundleDir, 'and record the digest manually')
  process.exit(0)
}
const digest = createHash('sha256').update(readFileSync(binary)).digest('hex')

if (smoke) {
  execFileSync('open', [bundleDir])
  const pid = parseInt(execFileSync('pgrep', ['-f', productName], { encoding: 'utf8' }).split('\n')[0], 10)
  execFileSync('sleep', ['5'])
  process.kill(pid, 'SIGTERM')
}

const registryPath = join(ROOT, 'docs/acceptance/registry.json')
const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
registry.artifacts.push({
  id: `mark-test-${slug}-${short}`,
  source: { sha, branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() },
  platform: platform === 'macos' ? 'macos-arm64-debug' : 'windows-x64-debug-nsis',
  bundleIdentity: identifier,
  productName,
  binarySha256: digest,
  productVersion: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version,
  builtAt: new Date().toISOString().slice(0, 10),
  builtBy: 'tools/build-test-artifact.mjs',
  covers: [item],
  location: `target/debug/bundle/${platform === 'macos' ? 'macos' : 'nsis'} (repo build dir; rebuild via the builder)`,
  ...(smoke ? { smoke: 'launch + 5s alive + clean quit' } : {})
})
registry.lastSynced = new Date().toISOString().slice(0, 10)
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
console.log(`[build-test-artifact] recorded mark-test-${slug}-${short} sha256=${digest}`)
