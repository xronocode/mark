// FILE: tools/diff-coverage.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Fail a payload whose changed executable lines are not executed by the test suite, replacing after-the-fact hand audits with one deterministic command.
//   SCOPE: Parse one or more LCOV records plus the unified diff between a merge base and the head, score the added executable lines inside an explicit scope, print a per-file table with the uncovered line numbers, and exit non-zero below the threshold; read-only, no network, no repository mutation.
//   DEPENDS: Node.js fs, path, url and child_process standard-library modules; git; the LCOV record written by the vitest coverage run.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046; .grace/changes/archive/C-DIFF-COVERAGE-GATE; CONTRIBUTING.md.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DEFAULT_SCOPE - Gated source roots used when --scope is absent.
//   DEFAULT_EXCLUDES - Coverage exclusions mirrored from vitest.config.ts.
//   DEFAULT_LCOV - Default LCOV path written by `npm run test:coverage`.
//   DEFAULT_THRESHOLD - Default changed-line threshold in percent.
//   CODE_EXTENSIONS - Extensions that must be measured; other new assets are reported, not failed.
//   DiffCoverageError - Stable coded usage or environment error (MT_DIFF_COVERAGE_*).
//   normalizePath - Repository-relative POSIX path for LCOV and diff rows.
//   globToRegExp - Minimal ** and * glob matcher for exclusion patterns.
//   isInScope - True when a path lives under one of the gated roots.
//   isExcluded - True when a path matches one of the coverage exclusions.
//   parseLcov - Merge LCOV records into path -> line -> hit count.
//   unquoteDiffPath - Git's C-quoted diff path reader.
//   parseUnifiedDiff - Collect added line numbers and creation flags per path.
//   toRanges - Collapse line numbers into display ranges.
//   isCode - True when the extension can be instrumented by the coverage run.
//   evaluate - Classify every changed file and score the gated ones.
//   markSuffix - One-word classification note for a report row.
//   QUIET_KINDS - Row kinds collapsed into the summary unless --verbose.
//   formatReport - Human-readable table plus the pass or miss marker.
//   parseArgs - Parse the command line into gate options.
//   defaultIo - Real git and filesystem access used when none is injected.
//   EMPTY_REF - All-zero revision (branch creation) that has no base to compare.
//   pickBase - First existing main-line ref used when --base is absent.
//   runGate - Resolve the range, read both inputs and evaluate the gate.
//   USAGE - Command help text.
//   main - Command-line entry point returning the process exit code.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-27 v1.0.0 C-DIFF-COVERAGE-GATE: initial gate — the audit of
//     v2.8.1 (79.7% of changed executable lines) and v2.8.2 (86.0%) showed
//     that nothing enforced the number a release inherits; this command makes
//     it a pull-request gate.
// END_CHANGE_SUMMARY
//
// Usage:
//   node tools/diff-coverage.mjs [--base <ref>] [--head <ref>]
//     [--lcov <path>]... [--scope <dir>]... [--exclude <glob>]...
//     [--threshold <pct>] [--allow-unmeasured-new] [--no-merge-base]
//     [--report-only] [--verbose] [--json]
//
// Exit codes: 0 pass, 1 gate miss, 2 usage or environment error.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_SCOPE = ['src/renderer/src', 'src/muya']

// Mirrors coverage.exclude in vitest.config.ts: these files are deliberately
// outside the measured surface, so a change to them is reported as excluded
// instead of being scored as a miss.
export const DEFAULT_EXCLUDES = [
  'src/renderer/src/_shims/**',
  'src/renderer/src/main.js',
  'src/renderer/src/codeMirror/loadmode.js'
]

export const DEFAULT_LCOV = 'coverage/lcov.info'
export const DEFAULT_THRESHOLD = 100

// Only executable sources can be measured by the coverage run. A new stylesheet,
// image or JSON fixture inside the scope is reported as an asset, never as a
// missing measurement.
export const CODE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue']

export class DiffCoverageError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'DiffCoverageError'
    this.code = code
  }
}

// ─── paths ────────────────────────────────────────────────────────────
export const normalizePath = (value, root = '') => {
  let path = String(value || '').trim().replace(/\\/g, '/')
  if (root) {
    const normalizedRoot = String(root).replace(/\\/g, '/').replace(/\/+$/, '')
    if (normalizedRoot && path.startsWith(normalizedRoot + '/')) {
      path = path.slice(normalizedRoot.length + 1)
    } else if (normalizedRoot && path === normalizedRoot) {
      path = ''
    }
  }
  path = path.replace(/^\.\//, '')
  return path
}

const globToRegExp = (pattern) => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

export const isInScope = (path, scope = DEFAULT_SCOPE) =>
  scope.some((root) => {
    const normalized = String(root).replace(/\\/g, '/').replace(/\/+$/, '')
    return path === normalized || path.startsWith(normalized + '/')
  })

export const isExcluded = (path, excludes = DEFAULT_EXCLUDES) =>
  excludes.some((pattern) => globToRegExp(pattern).test(path))

// ─── parsing ──────────────────────────────────────────────────────────
// START_BLOCK_DIFF_COVERAGE_PARSE
export const parseLcov = (text, root = '') => {
  const coverage = new Map()
  let current = null
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('SF:')) {
      current = normalizePath(line.slice(3), root)
      if (!coverage.has(current)) coverage.set(current, new Map())
      continue
    }
    if (line.startsWith('DA:')) {
      if (!current) continue
      const [lineNumber, hits] = line.slice(3).split(',')
      const number = Number(lineNumber)
      const count = Number(hits)
      if (!Number.isFinite(number) || !Number.isFinite(count)) continue
      const record = coverage.get(current)
      record.set(number, (record.get(number) || 0) + count)
      continue
    }
    if (line === 'end_of_record') current = null
  }
  return coverage
}

const unquoteDiffPath = (value) => {
  const trimmed = value.trim()
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) return trimmed
  return trimmed
    .slice(1, -1)
    .replace(/\\(["\\])/g, '$1')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
}

export const parseUnifiedDiff = (text) => {
  const files = new Map()
  let currentPath = null
  let pendingCreated = false
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('--- ')) {
      pendingCreated = line.slice(4).trim() === '/dev/null'
      continue
    }
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim()
      if (raw === '/dev/null') {
        currentPath = null
        pendingCreated = false
        continue
      }
      currentPath = normalizePath(unquoteDiffPath(raw).replace(/^b\//, ''))
      if (!files.has(currentPath)) {
        files.set(currentPath, { added: new Set(), created: pendingCreated })
      } else if (pendingCreated) {
        files.get(currentPath).created = true
      }
      pendingCreated = false
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (hunk && currentPath) {
      const start = Number(hunk[1])
      const count = hunk[2] === undefined ? 1 : Number(hunk[2])
      const record = files.get(currentPath)
      for (let i = 0; i < count; i++) record.added.add(start + i)
    }
  }
  return files
}
// END_BLOCK_DIFF_COVERAGE_PARSE

// ─── scoring ──────────────────────────────────────────────────────────
// START_BLOCK_DIFF_COVERAGE_SCORE
const toRanges = (lines) => {
  const sorted = [...lines].sort((a, b) => a - b)
  const ranges = []
  for (const line of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && line === last[1] + 1) last[1] = line
    else ranges.push([line, line])
  }
  return ranges
}

const isCode = (path) => CODE_EXTENSIONS.some((extension) => path.endsWith(extension))

export const evaluate = ({
  diff,
  coverage,
  scope = DEFAULT_SCOPE,
  excludes = DEFAULT_EXCLUDES,
  threshold = DEFAULT_THRESHOLD,
  allowUnmeasuredNew = false
} = {}) => {
  const rows = []
  const unmeasuredNew = []
  const totals = { files: 0, exec: 0, hit: 0 }

  for (const [path, info] of [...diff.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const added = info.added
    if (!isInScope(path, scope)) {
      rows.push({ path, kind: 'outside', exec: 0, hit: 0, uncovered: [] })
      continue
    }
    if (isExcluded(path, excludes)) {
      rows.push({ path, kind: 'excluded', exec: 0, hit: 0, uncovered: [] })
      continue
    }
    if (!isCode(path)) {
      rows.push({ path, kind: 'asset', exec: 0, hit: 0, uncovered: [] })
      continue
    }
    if (added.size === 0) {
      rows.push({ path, kind: 'no-lines', exec: 0, hit: 0, uncovered: [] })
      continue
    }
    const record = coverage.get(path)
    if (!record) {
      if (info.created && !allowUnmeasuredNew) unmeasuredNew.push(path)
      rows.push({
        path,
        kind: info.created ? 'unmeasured-new' : 'unmeasured',
        exec: 0,
        hit: 0,
        uncovered: []
      })
      continue
    }
    let exec = 0
    let hit = 0
    const uncovered = []
    for (const line of added) {
      if (!record.has(line)) continue
      exec++
      if (record.get(line) > 0) hit++
      else uncovered.push(line)
    }
    if (exec === 0) {
      rows.push({ path, kind: 'no-lines', exec: 0, hit: 0, uncovered: [] })
      continue
    }
    totals.files++
    totals.exec += exec
    totals.hit += hit
    rows.push({
      path,
      kind: 'scored',
      exec,
      hit,
      pct: (100 * hit) / exec,
      uncovered: toRanges(uncovered)
    })
  }

  const pct = totals.exec === 0 ? 100 : (100 * totals.hit) / totals.exec
  const belowThreshold = totals.exec > 0 && totals.hit * 100 < threshold * totals.exec
  const ok = unmeasuredNew.length === 0 && !belowThreshold

  return {
    ok,
    threshold,
    scope,
    excludes,
    rows,
    totals: { ...totals, pct, uncovered: totals.exec - totals.hit },
    unmeasuredNew,
    belowThreshold
  }
}
// END_BLOCK_DIFF_COVERAGE_SCORE

// ─── report ───────────────────────────────────────────────────────────
// START_BLOCK_DIFF_COVERAGE_REPORT
const markSuffix = (row) => {
  if (row.kind === 'outside') return 'out of scope'
  if (row.kind === 'excluded') return 'excluded from coverage'
  if (row.kind === 'asset') return 'not instrumented (asset)'
  if (row.kind === 'no-lines') return 'no executable changed lines'
  if (row.kind === 'unmeasured') return 'not measured by LCOV'
  if (row.kind === 'unmeasured-new') return 'MT_DIFF_COVERAGE_UNMEASURED: new file absent from LCOV'
  return ''
}

const QUIET_KINDS = new Set(['outside', 'excluded', 'asset'])

export const formatReport = (result, { verbose = false } = {}) => {
  const lines = []
  if (result.base) {
    const head = result.head === 'WORKTREE' ? 'working tree' : result.head
    lines.push(`range: ${result.base}..${head} (merge base ${String(result.mergeBase || '').slice(0, 12)})`)
  }
  const header = ['changed file', 'exec', 'hit', 'coverage']
  lines.push(
    header[0].padEnd(66) + header[1].padStart(6) + header[2].padStart(6) + '  ' + header[3]
  )
  const hidden = { outside: 0, excluded: 0, asset: 0 }
  for (const row of result.rows) {
    if (!verbose && QUIET_KINDS.has(row.kind)) {
      hidden[row.kind]++
      continue
    }
    const pct = row.kind === 'scored' ? `${row.pct.toFixed(1)}%` : '—'
    lines.push(
      row.path.padEnd(66) +
        String(row.exec).padStart(6) +
        String(row.hit).padStart(6) +
        '  ' +
        pct.padEnd(7) +
        markSuffix(row)
    )
  }
  if (!verbose) {
    const parts = []
    if (hidden.outside) parts.push(`${hidden.outside} out of scope`)
    if (hidden.excluded) parts.push(`${hidden.excluded} excluded`)
    if (hidden.asset) parts.push(`${hidden.asset} not instrumented`)
    if (parts.length > 0) {
      lines.push(`also changed, not scored: ${parts.join(', ')} — rerun with --verbose to list`)
    }
  }
  for (const row of result.rows) {
    if (row.kind !== 'scored' || row.uncovered.length === 0) continue
    const ranges = row.uncovered.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ')
    lines.push(`  uncovered ${row.path}: ${ranges}`)
  }
  const { totals } = result
  lines.push(
    `changed files: ${result.rows.length}; scored: ${totals.files}; ` +
      `executable changed lines: ${totals.exec}; executed: ${totals.hit}; ` +
      `changed-line coverage: ${totals.pct.toFixed(2)}% (threshold ${result.threshold}%)`
  )
  const fields =
    `hit=${totals.hit} total=${totals.exec} pct=${totals.pct.toFixed(2)} threshold=${result.threshold}`
  if (result.unmeasuredNew.length > 0) {
    lines.push(`[DiffCoverage][gate][BLOCK_DIFF_COVERAGE_UNMEASURED files=${result.unmeasuredNew.length}] ${result.unmeasuredNew.join(', ')}`)
  }
  lines.push(
    result.ok
      ? `[DiffCoverage][gate][BLOCK_DIFF_COVERAGE_PASS ${fields}]`
      : `[DiffCoverage][gate][BLOCK_DIFF_COVERAGE_MISS ${fields} files=${totals.files}]`
  )
  return lines.join('\n')
}
// END_BLOCK_DIFF_COVERAGE_REPORT

// ─── command line ─────────────────────────────────────────────────────
export const parseArgs = (argv = []) => {
  const options = {
    base: '',
    head: 'HEAD',
    lcov: [],
    scope: [],
    exclude: [],
    threshold: DEFAULT_THRESHOLD,
    allowUnmeasuredNew: false,
    reportOnly: false,
    json: false,
    verbose: false,
    mergeBase: true,
    help: false
  }
  const valueOf = (flag, index) => {
    const inline = argv[index].indexOf('=')
    if (inline !== -1) return { value: argv[index].slice(inline + 1), next: index }
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) {
      throw new DiffCoverageError('MT_DIFF_COVERAGE_ARGS', `${flag} requires a value`)
    }
    return { value: next, next: index + 1 }
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const flag = arg.split('=')[0]
    switch (flag) {
      case '--base': {
        const { value, next } = valueOf(flag, i)
        options.base = value
        i = next
        break
      }
      case '--head': {
        const { value, next } = valueOf(flag, i)
        options.head = value
        i = next
        break
      }
      case '--lcov': {
        const { value, next } = valueOf(flag, i)
        options.lcov.push(value)
        i = next
        break
      }
      case '--scope': {
        const { value, next } = valueOf(flag, i)
        options.scope.push(value)
        i = next
        break
      }
      case '--exclude': {
        const { value, next } = valueOf(flag, i)
        options.exclude.push(value)
        i = next
        break
      }
      case '--threshold': {
        const { value, next } = valueOf(flag, i)
        const threshold = Number(value)
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
          throw new DiffCoverageError(
            'MT_DIFF_COVERAGE_ARGS',
            `--threshold must be a number between 0 and 100, got "${value}"`
          )
        }
        options.threshold = threshold
        i = next
        break
      }
      case '--allow-unmeasured-new':
        options.allowUnmeasuredNew = true
        break
      case '--report-only':
        options.reportOnly = true
        break
      case '--json':
        options.json = true
        break
      case '--worktree':
        options.head = 'WORKTREE'
        break
      case '--verbose':
        options.verbose = true
        break
      case '--no-merge-base':
        options.mergeBase = false
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new DiffCoverageError('MT_DIFF_COVERAGE_ARGS', `unknown argument "${arg}"`)
    }
  }
  if (options.lcov.length === 0) options.lcov.push(DEFAULT_LCOV)
  if (options.scope.length === 0) options.scope.push(...DEFAULT_SCOPE)
  return options
}

const defaultIo = {
  git: (args, cwd) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'pipe']
    }),
  read: (path) => readFileSync(path, 'utf8')
}

const EMPTY_REF = /^0+$/

// Default comparison ref when --base is absent: the first main-line ref this
// checkout actually has. The CI step always passes an explicit base sha, so this
// fallback only serves local runs (and repositories whose remote is not
// literally named "origin").
const pickBase = (io, repo) => {
  for (const candidate of ['origin/main', 'fork/main', 'upstream/main', 'main']) {
    try {
      io.git(['rev-parse', '--verify', candidate + '^{commit}'], repo)
      return candidate
    } catch {
      // try the next candidate
    }
  }
  throw new DiffCoverageError(
    'MT_DIFF_COVERAGE_BASE',
    'no main-line ref found (tried origin/main, fork/main, upstream/main, main) — pass --base <ref>'
  )
}

export const runGate = (options, io = defaultIo) => {
  const repo = io.git(['rev-parse', '--show-toplevel']).trim()
  const worktree = options.head === 'WORKTREE'
  const head = worktree ? 'HEAD' : options.head || 'HEAD'
  const base = options.base || pickBase(io, repo)

  if (EMPTY_REF.test(base)) {
    return { skipped: true, reason: 'empty-base', base, head, repo }
  }

  let mergeBase
  if (options.mergeBase === false) {
    try {
      mergeBase = io.git(['rev-parse', base + '^{commit}'], repo).trim()
    } catch (error) {
      throw new DiffCoverageError(
        'MT_DIFF_COVERAGE_BASE',
        `cannot resolve base "${base}": ${error.message.split('\n')[0]}`
      )
    }
  } else {
    try {
      mergeBase = io.git(['merge-base', base, head], repo).trim()
    } catch {
      try {
        mergeBase = io.git(['rev-parse', base + '^{commit}'], repo).trim()
      } catch (error) {
        throw new DiffCoverageError(
          'MT_DIFF_COVERAGE_BASE',
          `cannot resolve base "${base}" against "${head}": ${error.message.split('\n')[0]}`
        )
      }
    }
  }

  let diffText = ''
  try {
    diffText = io.git(
      [
        'diff',
        '-U0',
        '--no-color',
        '--no-ext-diff',
        '--find-renames',
        mergeBase,
        ...(worktree ? [] : [head])
      ],
      repo
    )
  } catch (error) {
    throw new DiffCoverageError(
      'MT_DIFF_COVERAGE_DIFF',
      `git diff ${mergeBase}${worktree ? '' : '..' + head} failed: ${error.message.split('\n')[0]}`
    )
  }

  const coverage = new Map()
  for (const lcovPath of options.lcov) {
    let text
    try {
      text = io.read(resolve(repo, lcovPath))
    } catch {
      throw new DiffCoverageError(
        'MT_DIFF_COVERAGE_LCOV',
        `cannot read LCOV "${lcovPath}" — run the coverage suite first (npm run test:coverage)`
      )
    }
    for (const [path, record] of parseLcov(text, repo)) {
      const merged = coverage.get(path)
      if (!merged) {
        coverage.set(path, record)
        continue
      }
      for (const [line, hits] of record) merged.set(line, (merged.get(line) || 0) + hits)
    }
  }

  const result = evaluate({
    diff: parseUnifiedDiff(diffText),
    coverage,
    scope: options.scope,
    excludes: [...DEFAULT_EXCLUDES, ...options.exclude],
    threshold: options.threshold,
    allowUnmeasuredNew: options.allowUnmeasuredNew
  })

  return { ...result, repo, base, head: worktree ? 'WORKTREE' : head, mergeBase }
}

const USAGE = `Usage: node tools/diff-coverage.mjs [options]

  --base <ref>            revision to compare against (default origin/main; a pull-request base sha works)
  --head <ref>            revision under test (default HEAD)
  --lcov <path>           LCOV record to read; repeatable (default ${DEFAULT_LCOV})
  --scope <dir>           gated source root; repeatable (default ${DEFAULT_SCOPE.join(', ')})
  --exclude <glob>        additional coverage exclusion; repeatable
  --threshold <pct>       required changed-line coverage (default ${DEFAULT_THRESHOLD})
  --allow-unmeasured-new  do not fail on a new gated file that LCOV never instrumented
  --no-merge-base         compare the base commit itself (release-to-release audit) instead of the merge base
  --worktree              score uncommitted tracked changes against the base (use git add -N for new files)
  --report-only           print the report without failing
  --verbose               list every out-of-scope, excluded and not-instrumented file
  --json                  print the machine-readable result
`

export const main = (argv = process.argv.slice(2), io = defaultIo, write = console.log) => {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    if (error instanceof DiffCoverageError) {
      process.stderr.write(`[DiffCoverage][args][${error.code}] ${error.message}\n${USAGE}`)
      return 2
    }
    throw error
  }
  if (options.help) {
    write(USAGE)
    return 0
  }

  let result
  try {
    result = runGate(options, io)
  } catch (error) {
    if (error instanceof DiffCoverageError) {
      process.stderr.write(`[DiffCoverage][gate][${error.code}] ${error.message}\n`)
      return 2
    }
    throw error
  }

  if (result.skipped) {
    const line = `[DiffCoverage][gate][BLOCK_DIFF_COVERAGE_SKIP reason=${result.reason} base=${result.base} head=${result.head}]`
    write(options.json ? JSON.stringify({ ok: true, skipped: true, ...result }, null, 2) : line)
    return 0
  }

  if (options.json) {
    write(JSON.stringify(result, null, 2))
  } else {
    write(formatReport(result, { verbose: options.verbose }))
  }
  if (options.reportOnly) return 0
  return result.ok ? 0 : 1
}

const invokedPath = () => {
  if (!process.argv[1]) return ''
  try {
    return pathToFileURL(resolve(process.argv[1])).href
  } catch {
    return ''
  }
}

if (invokedPath() === import.meta.url) {
  process.exitCode = main()
}
