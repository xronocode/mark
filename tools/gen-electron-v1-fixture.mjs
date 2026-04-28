#!/usr/bin/env node
// Generate test/fixtures/ipc-channels/electron.v1.json — the frozen
// reference of the mark-electron@v1.2.3 IPC surface that M-013b is
// contractually obligated to emulate.
//
// Phase-B1 step-3 per docs/development-plan.xml. Reframed from the
// original "upstream MarkText commit ab1a3fdc" to mark-electron@v1.2.3
// because v1.2.x's contextBridge hardening is the real M-013 target —
// pre-fork upstream's IPC surface is no longer relevant.
//
// Usage:
//   node tools/gen-electron-v1-fixture.mjs [--electron-path ../mark-electron] [--ref v1.2.3]
//
// Outputs:
//   test/fixtures/ipc-channels/electron.v1.json  — the channel manifest
//   test/fixtures/ipc-channels/UPSTREAM_PIN.lock — provenance metadata

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// ─── parse args ─────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    electronPath: resolve(REPO_ROOT, '../mark-electron'),
    ref: 'v1.2.3'
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--electron-path') opts.electronPath = resolve(args[++i])
    else if (args[i] === '--ref') opts.ref = args[++i]
  }
  return opts
}

// ─── git helpers ────────────────────────────────────────────────
function git(repoPath, ...subArgs) {
  return execFileSync('git', ['-C', repoPath, ...subArgs], { encoding: 'utf8' })
}

function gitGrep(repoPath, ref, pattern, pathSpec) {
  try {
    const out = execFileSync(
      'git',
      ['-C', repoPath, 'grep', '-nE', pattern, ref, '--', pathSpec],
      { encoding: 'utf8' }
    )
    return out.split('\n').filter(Boolean)
  } catch (err) {
    // grep with no matches exits 1 — not an error
    if (err.status === 1) return []
    throw err
  }
}

function gitShow(repoPath, ref, path) {
  return execFileSync('git', ['-C', repoPath, 'show', `${ref}:${path}`], {
    encoding: 'utf8'
  })
}

// ─── extraction ─────────────────────────────────────────────────
//
// Inbound (renderer→main): ipcMain.on/handle/once('channel', ...)
// Outbound (main→renderer): webContents.send('channel', ...)  +
//                           win.webContents.send('channel', ...)
// Renderer-side calls (for cross-check):
//   ipcRenderer.send/invoke/sendSync/once/on('channel', ...)
//
// For the v1.json fixture we focus on the MAIN-process surface (what
// ipcMain knows about) since that's what M-013b emulates. Renderer
// callsites are captured in remote-callsites.v1.json (separate fixture
// in step-5).

function extractInbound(repoPath, ref) {
  const lines = gitGrep(
    repoPath,
    ref,
    "ipcMain\\.(on|handle|once)\\(['\"][^'\"]+['\"]",
    'src/main/**/*.js'
  )
  const channels = new Map()
  for (const line of lines) {
    const m = line.match(/^([^:]+:[^:]+):(\d+):.*ipcMain\.(on|handle|once)\(['"]([^'"]+)['"]/)
    if (!m) continue
    const [, path, lineno, transport, name] = m
    if (!channels.has(name)) {
      channels.set(name, {
        name,
        direction: 'renderer->main',
        transport,
        sites: []
      })
    }
    channels.get(name).sites.push({ path: path.replace(`${ref}:`, ''), line: parseInt(lineno, 10) })
  }
  return [...channels.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function extractOutbound(repoPath, ref) {
  // webContents.send / win.webContents.send / e.sender.send patterns.
  // The arg list shape is `.send('channel', ...arg)` — we grep liberally
  // and tolerate variable receivers.
  const lines = gitGrep(
    repoPath,
    ref,
    "webContents\\.send\\(['\"][^'\"]+['\"]|sender\\.send\\(['\"][^'\"]+['\"]",
    'src/main/**/*.js'
  )
  const channels = new Map()
  for (const line of lines) {
    const m = line.match(/^([^:]+:[^:]+):(\d+):.*\.send\(['"]([^'"]+)['"]/)
    if (!m) continue
    const [, path, lineno, name] = m
    if (!channels.has(name)) {
      channels.set(name, {
        name,
        direction: 'main->renderer',
        transport: 'send',
        sites: []
      })
    }
    channels.get(name).sites.push({ path: path.replace(`${ref}:`, ''), line: parseInt(lineno, 10) })
  }
  return [...channels.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ─── pin-lock: blob-sha256 of every src/main/**/*.js touched ────
// "blob-sha256" semantics: SHA-256 of the file content as it exists at
// `ref`. Different from git's SHA-1 blob hash but gives us a cryptographic
// pin that's audit-friendly and doesn't depend on git's internal hash
// algorithm. Used by V-M-013a to detect drift from the frozen baseline.

function buildPinLock(repoPath, ref, channels) {
  const files = new Set()
  for (const c of channels) {
    for (const site of c.sites) files.add(site.path)
  }
  const pin = {
    schema_version: 1,
    source_repo: 'xronocode/mark',
    source_ref: ref,
    source_commit: git(repoPath, 'rev-parse', ref).trim(),
    generated_at: new Date().toISOString(),
    files: []
  }
  for (const path of [...files].sort()) {
    const content = gitShow(repoPath, ref, path)
    const hash = createHash('sha256').update(content, 'utf8').digest('hex')
    pin.files.push({ path, blob_sha256: hash, bytes: Buffer.byteLength(content, 'utf8') })
  }
  return pin
}

// ─── main ────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs()
  process.stderr.write(`electron-path: ${opts.electronPath}\n`)
  process.stderr.write(`ref: ${opts.ref}\n`)

  const inbound = extractInbound(opts.electronPath, opts.ref)
  const outbound = extractOutbound(opts.electronPath, opts.ref)
  const channels = [...inbound, ...outbound]

  const fixture = {
    schema_version: 1,
    source: {
      repo: 'xronocode/mark',
      ref: opts.ref,
      commit: git(opts.electronPath, 'rev-parse', opts.ref).trim()
    },
    generated_at: new Date().toISOString(),
    counts: {
      inbound: inbound.length,
      outbound: outbound.length,
      total: channels.length
    },
    channels
  }

  const pin = buildPinLock(opts.electronPath, opts.ref, channels)

  const outDir = join(REPO_ROOT, 'test/fixtures/ipc-channels')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'electron.v1.json'), JSON.stringify(fixture, null, 2) + '\n')
  writeFileSync(join(outDir, 'UPSTREAM_PIN.lock'), JSON.stringify(pin, null, 2) + '\n')

  process.stderr.write(`wrote ${channels.length} channels (${inbound.length} inbound, ${outbound.length} outbound)\n`)
  process.stderr.write(`pin-locked ${pin.files.length} source files\n`)
  process.stderr.write(`out: test/fixtures/ipc-channels/electron.v1.json + UPSTREAM_PIN.lock\n`)
}

main()
