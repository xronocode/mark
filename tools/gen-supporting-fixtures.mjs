#!/usr/bin/env node
// Phase-B1 step-5: generate the 5 supporting v1.2.3 fixtures.
// Each captures a different aspect of the v1 surface that M-013b /
// M-009 / M-005 must understand to faithfully port:
//
//   1. internal-main-events.electron.v1.json — internal main-process
//      event bus (`emit('name', ...)`) — distinct from IPC channels
//      because it doesn't cross the renderer boundary.
//   2. remote-callsites.v1.json — @electron/remote usage. v1.2.3 removed
//      it; this fixture records the historical comment locations as
//      audit evidence + a count: 0 (active callsites) marker.
//   3. sendSync-callsites.v1.json — ipcRenderer.sendSync uses. Tauri
//      cannot do synchronous IPC; any surviving callsite must be
//      converted to async OR have a Tauri-side workaround documented.
//   4. menu-taxonomy.v1.json — top-level menu structure parsed from
//      src/main/menu/templates/*.js. Source of truth for M-009 mt-menu.
//   5. preload-surface.v1.json — contextBridge.exposeInMainWorld surface.
//      Each `window.X` becomes a M-013b emulation target.
//
// Reproducibility: re-run any time v1.2.3 source is reaudited; outputs
// are deterministic (sorted, no timestamps in deep structures).

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(REPO_ROOT, 'test/fixtures/ipc-channels')
const ELECTRON_PATH = resolve(REPO_ROOT, '../mark-electron')
const REF = 'v1.2.3'

function gitGrep(pattern, ...pathSpecs) {
  // Multiple path specs as separate args — git grep does NOT split a
  // space-separated single string into globs. POSIX ERE has no `\s`;
  // use `[[:space:]]+` or literal spaces in patterns. Use `:(glob)...`
  // syntax for wildcard pathspecs.
  try {
    return execFileSync(
      'git',
      ['-C', ELECTRON_PATH, 'grep', '-nE', pattern, REF, '--', ...pathSpecs],
      { encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
  } catch (err) {
    if (err.status === 1) return []
    throw err
  }
}

function gitShow(path) {
  return execFileSync(
    'git',
    ['-C', ELECTRON_PATH, 'show', `${REF}:${path}`],
    { encoding: 'utf8' }
  )
}

function gitRevParse() {
  return execFileSync('git', ['-C', ELECTRON_PATH, 'rev-parse', REF], {
    encoding: 'utf8'
  }).trim()
}

const SOURCE_META = {
  repo: 'xronocode/mark',
  ref: REF,
  commit: gitRevParse()
}

// ─── 1. internal-main-events ───────────────────────────────────────────
function buildInternalMainEvents() {
  // Match `.emit('name', ...)` calls inside src/main/. We intentionally
  // do NOT include event listeners (.on / .once) because the listener
  // side is high-noise (every Electron API has dozens). The emit set is
  // the authoritative event-name space.
  const lines = gitGrep("\\.emit\\(['\"][a-zA-Z][a-zA-Z0-9_:.-]*['\"]", ':(glob)src/main/**/*.js')
  const events = new Map()
  for (const line of lines) {
    const m = line.match(/^[^:]+:([^:]+):(\d+):.*\.emit\(['"]([^'"]+)['"]/)
    if (!m) continue
    const [, path, lineno, name] = m
    if (!events.has(name)) events.set(name, { name, sites: [] })
    events.get(name).sites.push({ path, line: parseInt(lineno, 10) })
  }
  return {
    schema_version: 1,
    source: SOURCE_META,
    purpose: 'Internal main-process event bus. NOT IPC — events that stay inside main and never cross the renderer boundary. Captures emit() callsites only; listener callsites omitted as high-noise.',
    counts: { events: events.size },
    events: [...events.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}

// ─── 2. remote-callsites ───────────────────────────────────────────────
function buildRemoteCallsites() {
  // Match any reference to @electron/remote — module import, require(),
  // or comment that mentions it. Categorize each as `active` (real usage)
  // or `historical` (comment-only — usually a // step-8X note documenting
  // the removal).
  const lines = gitGrep(
    "@electron/remote",
    ':(glob)src/renderer/**/*.js',
    ':(glob)src/renderer/**/*.vue',
    ':(glob)src/preload/**/*.js'
  )
  const callsites = []
  for (const line of lines) {
    const m = line.match(/^[^:]+:([^:]+):(\d+):(.*)$/)
    if (!m) continue
    const [, path, lineno, source] = m
    const trimmed = source.trim()
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('*')
    callsites.push({
      path,
      line: parseInt(lineno, 10),
      kind: isComment ? 'historical' : 'active',
      excerpt: trimmed.slice(0, 160)
    })
  }
  callsites.sort((a, b) => (a.path + a.line).localeCompare(b.path + b.line))
  const active = callsites.filter((c) => c.kind === 'active')
  return {
    schema_version: 1,
    source: SOURCE_META,
    purpose: '@electron/remote usage audit. v1.2.3 removed all active usage during the step-8 hardening track; surviving references are in comments documenting the removals. Active count MUST stay at 0 — any non-zero is a regression that breaks the contextIsolation:true guarantee.',
    counts: {
      total: callsites.length,
      active: active.length,
      historical: callsites.length - active.length
    },
    invariant: 'counts.active === 0',
    callsites
  }
}

// ─── 3. sendSync-callsites ─────────────────────────────────────────────
function buildSendSyncCallsites() {
  // Synchronous IPC. Tauri 2 has no equivalent — any callsite must be
  // converted to async OR replaced with a build-time substitution.
  const lines = gitGrep(
    "ipcRenderer\\.sendSync\\(",
    ':(glob)src/**/*.js',
    ':(glob)src/**/*.vue'
  )
  const callsites = []
  for (const line of lines) {
    const m = line.match(/^[^:]+:([^:]+):(\d+):(.*)$/)
    if (!m) continue
    const [, path, lineno, source] = m
    callsites.push({
      path,
      line: parseInt(lineno, 10),
      excerpt: source.trim().slice(0, 160)
    })
  }
  callsites.sort((a, b) => (a.path + a.line).localeCompare(b.path + b.line))
  return {
    schema_version: 1,
    source: SOURCE_META,
    purpose: 'ipcRenderer.sendSync callsites. Tauri has no synchronous-invoke equivalent; every active callsite must be converted to ipcRenderer.invoke (async) before Phase-B3a alpha cut. v1.2.3 audit established 0 active callsites.',
    counts: { total: callsites.length },
    invariant: 'counts.total === 0',
    callsites
  }
}

// ─── 4. menu-taxonomy ──────────────────────────────────────────────────
function buildMenuTaxonomy() {
  // Top-level menu templates live in src/main/menu/templates/*.js.
  // Each exports a function returning { label, submenu: [...] }. We
  // walk the source files and record their top-level names; deep parse
  // is deferred to Phase-B3 step-12 (M-009 mt-menu) — the structural
  // import graph is what matters for the v1 audit.
  const templates = []
  const lines = gitGrep('export[[:space:]]+default', ':(glob)src/main/menu/templates/*.js')
  for (const line of lines) {
    const m = line.match(/^[^:]+:([^:]+):(\d+):/)
    if (!m) continue
    const path = m[1]
    const filename = path.split('/').pop().replace('.js', '')
    templates.push({ path, name: filename, line: parseInt(m[2], 10) })
  }
  templates.sort((a, b) => a.path.localeCompare(b.path))
  // Action files are side-effect modules (ipcMain.on(...) at top level
  // — no `export default`). Enumerate via git ls-tree and treat the
  // file's existence as its contribution. Deep handler walking is
  // M-009 implementation work.
  const actionLines = execFileSync(
    'git',
    ['-C', ELECTRON_PATH, 'ls-tree', '--name-only', REF, 'src/main/menu/actions/'],
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter((l) => l.endsWith('.js'))
  const actions = actionLines
    .map((path) => ({ path, name: path.split('/').pop().replace('.js', '') }))
    .sort((a, b) => a.path.localeCompare(b.path))
  return {
    schema_version: 1,
    source: SOURCE_META,
    purpose: 'v1.2.3 native menu structural map. Lists template files (top-level menus: File, Edit, Format, Paragraph, Theme, View, Window, Help, MarkText, prefEdit) + action files (handlers). Deep label/accelerator parsing deferred to M-009 implementation in Phase-B3 step-12.',
    counts: { templates: templates.length, actions: actions.length },
    templates,
    actions
  }
}

// ─── 5. preload-surface ────────────────────────────────────────────────
function buildPreloadSurface() {
  // contextBridge.exposeInMainWorld('name', value) — each entry is a
  // window.name surface that M-013b must emulate. Read the file once
  // for context-aware extraction (the call shape is multi-line in
  // some cases).
  const src = gitShow('src/preload/index.js')
  const lines = src.split('\n')
  const surfaces = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/contextBridge\.exposeInMainWorld\(\s*['"]([^'"]+)['"]/)
    if (m) surfaces.push({ name: m[1], window_path: `window.${m[1]}`, line: i + 1 })
  }
  surfaces.sort((a, b) => a.name.localeCompare(b.name))
  return {
    schema_version: 1,
    source: { ...SOURCE_META, file: 'src/preload/index.js' },
    purpose: 'v1.2.3 preload contextBridge surface. Each entry is a window.* property the renderer can use; M-013b must emulate the same API surface so renderer code transfers without changes (variant-(a) port decision).',
    counts: { surfaces: surfaces.length },
    surfaces
  }
}

// ─── pin-lock helper (subset across all 5 fixtures) ──────────────────
function pinLockFor(allFiles) {
  const pin = {
    schema_version: 1,
    source_repo: SOURCE_META.repo,
    source_ref: SOURCE_META.ref,
    source_commit: SOURCE_META.commit,
    files: []
  }
  for (const path of [...new Set(allFiles)].sort()) {
    const content = gitShow(path)
    pin.files.push({
      path,
      blob_sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
      bytes: Buffer.byteLength(content, 'utf8')
    })
  }
  return pin
}

// ─── main ────────────────────────────────────────────────────────────
function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const fixtures = [
    ['internal-main-events.electron.v1.json', buildInternalMainEvents()],
    ['remote-callsites.v1.json', buildRemoteCallsites()],
    ['sendSync-callsites.v1.json', buildSendSyncCallsites()],
    ['menu-taxonomy.v1.json', buildMenuTaxonomy()],
    ['preload-surface.v1.json', buildPreloadSurface()]
  ]

  // Collect every source file referenced — extends UPSTREAM_PIN.lock.
  const allFiles = new Set()
  for (const [, fx] of fixtures) {
    const collect = (obj) => {
      if (!obj || typeof obj !== 'object') return
      for (const v of Object.values(obj)) {
        if (Array.isArray(v)) v.forEach(collect)
        else if (typeof v === 'object') collect(v)
        else if (
          typeof v === 'string' &&
          (v.startsWith('src/') || v.endsWith('.js') || v.endsWith('.vue'))
        ) {
          if (v.includes('/')) allFiles.add(v)
        }
      }
    }
    collect(fx)
  }

  for (const [name, fixture] of fixtures) {
    const out = resolve(OUT_DIR, name)
    writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n')
    process.stderr.write(`wrote ${name}: ${JSON.stringify(fixture.counts)}\n`)
  }

  // Extend the pin-lock with these files (merge with step-3's, which
  // covered ipc-channels source. Read existing, union, rewrite.)
  const pinPath = resolve(OUT_DIR, 'UPSTREAM_PIN.lock')
  let existing
  try {
    existing = JSON.parse(readFileSync(pinPath, 'utf8'))
  } catch {
    existing = { schema_version: 1, source_commit: SOURCE_META.commit, files: [] }
  }
  const seen = new Set(existing.files.map((f) => f.path))
  for (const path of allFiles) {
    if (seen.has(path)) continue
    try {
      const content = gitShow(path)
      existing.files.push({
        path,
        blob_sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
        bytes: Buffer.byteLength(content, 'utf8')
      })
      seen.add(path)
    } catch {
      // file may not exist if we extracted it from a string that wasn't
      // really a path — skip silently
    }
  }
  existing.files.sort((a, b) => a.path.localeCompare(b.path))
  writeFileSync(pinPath, JSON.stringify(existing, null, 2) + '\n')
  process.stderr.write(`pin-lock extended: ${existing.files.length} files total\n`)
}

main()
