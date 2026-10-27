// FILE: tests/renderer/diff-coverage.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the changed-line coverage gate — LCOV merging, unified-diff added lines, scope and exclusion classification, the threshold verdict, the unmeasured-new rule, the report and the command-line contract.
//   SCOPE: tools/diff-coverage.mjs pure functions plus main() with an injected git/filesystem io; no real repository, no coverage run.
//   DEPENDS: vitest, tools/diff-coverage.mjs.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046 scenario-34.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LCOV - Two-file LCOV record where every instrumented line is executed.
//   LCOV_WITH_MISS - The same record with one editor line never executed.
//   ONLY_EDITOR - Coverage map without the new file, to exercise the unmeasured-new rule.
//   DIFF - Two-file unified diff (one modified, one new), the shared fixture.
//   fakeIo - Build an injected io for runGate/main from canned diff and LCOV text.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-27 v1.0.0 C-DIFF-COVERAGE-GATE: initial suite.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  DEFAULT_EXCLUDES,
  DEFAULT_SCOPE,
  DEFAULT_THRESHOLD,
  DiffCoverageError,
  evaluate,
  formatReport,
  isExcluded,
  isInScope,
  main,
  normalizePath,
  parseArgs,
  parseLcov,
  parseUnifiedDiff,
  runGate
} from '../../tools/diff-coverage.mjs'

// ─── fixtures ─────────────────────────────────────────────────────────
const LCOV = [
  'TN:',
  'SF:src/renderer/src/store/editor.js',
  'DA:10,3',
  'DA:11,1',
  'DA:12,1',
  'LF:3',
  'LH:3',
  'end_of_record',
  'SF:src/renderer/src/util/fresh.js',
  'DA:1,1',
  'DA:2,1',
  'LF:2',
  'LH:2',
  'end_of_record',
  ''
].join('\n')

// The same record with one line of editor.js never executed: the shape a real
// regression takes (the line exists, the suite does not reach it).
const LCOV_WITH_MISS = LCOV.replace('DA:11,1', 'DA:11,0')
const ONLY_EDITOR = () =>
  new Map([['src/renderer/src/store/editor.js', parseLcov(LCOV).get('src/renderer/src/store/editor.js')]])

const DIFF = [
  'diff --git a/src/renderer/src/store/editor.js b/src/renderer/src/store/editor.js',
  'index 1111111..2222222 100644',
  '--- a/src/renderer/src/store/editor.js',
  '+++ b/src/renderer/src/store/editor.js',
  '@@ -8,0 +10,2 @@',
  '@@ -40,0 +50 @@',
  'diff --git a/src/renderer/src/util/fresh.js b/src/renderer/src/util/fresh.js',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/src/renderer/src/util/fresh.js',
  '@@ -0,0 +1,2 @@',
  ''
].join('\n')

const fakeIo = ({ diff = DIFF, lcov = LCOV, git = {} } = {}) => ({
  git: (args) => {
    for (const [prefix, value] of Object.entries(git)) {
      if (args.join(' ').startsWith(prefix)) return value
    }
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n'
    if (args[0] === 'merge-base') return 'abc123def456\n'
    if (args[0] === 'diff') return diff
    if (args[0] === 'rev-parse' && args[1] === '--verify') return 'main\n'
    throw new Error(`unexpected git call: ${args.join(' ')}`)
  },
  read: (path) => {
    if (path.endsWith('lcov.info')) return lcov
    throw new Error(`unexpected read: ${path}`)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── parsing ─────────────────────────────────────────────────────────
describe('tooling/diff-coverage — parseLcov', () => {
  it('indexes lines per file with their hit counts', () => {
    const coverage = parseLcov(LCOV)
    expect([...coverage.keys()]).toEqual([
      'src/renderer/src/store/editor.js',
      'src/renderer/src/util/fresh.js'
    ])
    expect(coverage.get('src/renderer/src/store/editor.js').get(10)).toBe(3)
    expect(coverage.get('src/renderer/src/store/editor.js').get(11)).toBe(1)
  })

  it('sums hits of duplicate records for the same file', () => {
    const merged = parseLcov(`${LCOV}\nSF:src/renderer/src/store/editor.js\nDA:11,2\nend_of_record\n`)
    expect(merged.get('src/renderer/src/store/editor.js').get(11)).toBe(3)
  })

  it('normalizes absolute and Windows paths against the repository root', () => {
    const coverage = parseLcov(
      'SF:C:\\repo\\src\\renderer\\src\\a.js\nDA:5,1\nend_of_record\nSF:/repo/src/renderer/src/b.js\nDA:6,1\nend_of_record\n',
      '/repo'
    )
    expect([...coverage.keys()]).toEqual(['C:/repo/src/renderer/src/a.js', 'src/renderer/src/b.js'])
  })

  it('ignores malformed DA records instead of inventing lines', () => {
    const coverage = parseLcov('SF:src/a.js\nDA:not-a-line,1\nDA:7,NaN\nDA:8,1\nend_of_record\n')
    expect([...coverage.get('src/a.js').keys()]).toEqual([8])
  })
})

describe('tooling/diff-coverage — normalizePath', () => {
  it('strips the repository root, ./ and backslashes', () => {
    expect(normalizePath('/repo/src/a.js', '/repo')).toBe('src/a.js')
    expect(normalizePath('./src/a.js')).toBe('src/a.js')
    expect(normalizePath('src\\muya\\lib\\index.js')).toBe('src/muya/lib/index.js')
  })
})

describe('tooling/diff-coverage — parseUnifiedDiff', () => {
  it('collects added lines of a modified file and flags a created file', () => {
    const diff = parseUnifiedDiff(DIFF)
    expect([...diff.get('src/renderer/src/store/editor.js').added].sort((a, b) => a - b)).toEqual([
      10, 11, 50
    ])
    expect(diff.get('src/renderer/src/store/editor.js').created).toBe(false)
    expect(diff.get('src/renderer/src/util/fresh.js').created).toBe(true)
    expect([...diff.get('src/renderer/src/util/fresh.js').added]).toEqual([1, 2])
  })

  it('ignores deleted files and paths outside the diff body', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/src/gone.js b/src/gone.js',
        'deleted file mode 100644',
        '--- a/src/gone.js',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        ''
      ].join('\n')
    )
    expect(diff.size).toBe(0)
  })

  it('unquotes paths with spaces and strips the b/ prefix', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git "a/src/renderer/src/my file.js" "b/src/renderer/src/my file.js"',
        '--- "a/src/renderer/src/my file.js"',
        '+++ "b/src/renderer/src/my file.js"',
        '@@ -0,0 +3,2 @@',
        ''
      ].join('\n')
    )
    expect(diff.get('src/renderer/src/my file.js').added).toEqual(new Set([3, 4]))
  })
})

// ─── classification ──────────────────────────────────────────────────
describe('tooling/diff-coverage — scope and exclusions', () => {
  it('matches only real scope boundaries', () => {
    expect(isInScope('src/muya/lib/index.js')).toBe(true)
    expect(isInScope('src/muya2/lib/index.js')).toBe(false)
    expect(isInScope('src/renderer/src/store/editor.js', DEFAULT_SCOPE)).toBe(true)
    expect(isInScope('tools/diff-coverage.mjs')).toBe(false)
  })

  it('applies the coverage exclusions from vitest.config.ts', () => {
    expect(isExcluded('src/renderer/src/_shims/electron-log.js')).toBe(true)
    expect(isExcluded('src/renderer/src/main.js')).toBe(true)
    expect(isExcluded('src/renderer/src/store/editor.js')).toBe(false)
    expect(DEFAULT_EXCLUDES).toHaveLength(3)
  })
})

// ─── scoring ─────────────────────────────────────────────────────────
describe('tooling/diff-coverage — evaluate', () => {
  const base = () => ({
    diff: parseUnifiedDiff(DIFF),
    coverage: parseLcov(LCOV)
  })

  it('passes when every added executable line is executed', () => {
    const result = evaluate(base())
    expect(result.ok).toBe(true)
    expect(result.totals).toMatchObject({ files: 2, exec: 4, hit: 4 })
    expect(result.totals.pct).toBe(100)
    expect(result.threshold).toBe(100)
  })

  it('names the uncovered lines of a failing file', () => {
    const result = evaluate({
      diff: parseUnifiedDiff(DIFF),
      coverage: parseLcov(LCOV_WITH_MISS),
      threshold: 100
    })
    const editor = result.rows.find((row) => row.path.endsWith('editor.js'))
    expect(result.ok).toBe(false)
    expect(result.belowThreshold).toBe(true)
    expect(editor.uncovered).toEqual([[11, 11]])
    expect(result.totals).toMatchObject({ files: 2, exec: 4, hit: 3 })
    expect(result.totals.pct).toBe(75)
  })

  it('honours a lower threshold', () => {
    const result = evaluate({
      diff: parseUnifiedDiff(DIFF),
      coverage: parseLcov(LCOV_WITH_MISS),
      threshold: 60
    })
    expect(result.ok).toBe(true)
    expect(result.belowThreshold).toBe(false)
  })

  it('treats a comment-only change as no executable lines and passes', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/src/renderer/src/store/editor.js b/src/renderer/src/store/editor.js',
        '--- a/src/renderer/src/store/editor.js',
        '+++ b/src/renderer/src/store/editor.js',
        '@@ -1,0 +99,3 @@',
        ''
      ].join('\n')
    )
    const result = evaluate({ diff, coverage: parseLcov(LCOV) })
    expect(result.ok).toBe(true)
    expect(result.rows[0].kind).toBe('no-lines')
    expect(result.totals.exec).toBe(0)
  })

  it('reports out-of-scope, excluded and non-instrumented rows without scoring them', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/tools/x.mjs b/tools/x.mjs',
        '--- a/tools/x.mjs',
        '+++ b/tools/x.mjs',
        '@@ -0,0 +1,2 @@',
        'diff --git a/src/renderer/src/main.js b/src/renderer/src/main.js',
        '--- a/src/renderer/src/main.js',
        '+++ b/src/renderer/src/main.js',
        '@@ -0,0 +7,2 @@',
        'diff --git a/src/renderer/src/assets/theme.css b/src/renderer/src/assets/theme.css',
        '--- a/src/renderer/src/assets/theme.css',
        '+++ b/src/renderer/src/assets/theme.css',
        '@@ -0,0 +1 @@',
        ''
      ].join('\n')
    )
    const result = evaluate({ diff, coverage: new Map() })
    expect(result.rows.map((row) => row.kind)).toEqual(['asset', 'excluded', 'outside'])
    expect(result.ok).toBe(true)
    expect(result.totals.exec).toBe(0)
  })

  it('fails on a new gated file the coverage run never instrumented', () => {
    const result = evaluate({
      diff: parseUnifiedDiff(DIFF),
      coverage: ONLY_EDITOR(),
      threshold: 0
    })
    expect(result.ok).toBe(false)
    expect(result.unmeasuredNew).toEqual(['src/renderer/src/util/fresh.js'])
    expect(result.rows.find((row) => row.path.endsWith('fresh.js')).kind).toBe('unmeasured-new')
  })

  it('downgrades the unmeasured-new failure when explicitly allowed', () => {
    const result = evaluate({
      diff: parseUnifiedDiff(DIFF),
      coverage: ONLY_EDITOR(),
      threshold: 100,
      allowUnmeasuredNew: true
    })
    expect(result.unmeasuredNew).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.totals).toMatchObject({ files: 1, exec: 2, hit: 2 })
  })
})

// ─── report ──────────────────────────────────────────────────────────
describe('tooling/diff-coverage — formatReport', () => {
  it('prints the table, the uncovered ranges and the pass marker', () => {
    const report = formatReport({
      ...evaluate({ diff: new Map(), coverage: new Map() }),
      base: 'main',
      head: 'HEAD',
      mergeBase: 'abc123def456'
    })
    expect(report).toContain('range: main..HEAD (merge base abc123def456)')
    expect(report).toContain('[DiffCoverage][gate][BLOCK_DIFF_COVERAGE_PASS')
    expect(report).toContain('hit=0 total=0')
  })

  it('prints a miss marker with the counts and the uncovered line', () => {
    const result = evaluate({ diff: parseUnifiedDiff(DIFF), coverage: parseLcov(LCOV_WITH_MISS) })
    const report = formatReport(result)
    expect(report).toContain('src/renderer/src/store/editor.js')
    expect(report).toContain('uncovered src/renderer/src/store/editor.js: 11')
    expect(report).toContain('BLOCK_DIFF_COVERAGE_MISS hit=3 total=4 pct=75.00 threshold=100')
  })

  it('collapses out-of-scope rows unless verbose', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/docs/a.md b/docs/a.md',
        '--- a/docs/a.md',
        '+++ b/docs/a.md',
        '@@ -0,0 +1 @@',
        ''
      ].join('\n')
    )
    const result = evaluate({ diff, coverage: new Map() })
    expect(formatReport(result)).toContain('also changed, not scored: 1 out of scope')
    expect(formatReport(result, { verbose: true })).toContain('docs/a.md')
  })
})

// ─── command line ────────────────────────────────────────────────────
describe('tooling/diff-coverage — parseArgs', () => {
  it('applies the documented defaults', () => {
    const options = parseArgs([])
    expect(options).toMatchObject({
      base: '',
      head: 'HEAD',
      lcov: ['coverage/lcov.info'],
      scope: DEFAULT_SCOPE,
      exclude: [],
      threshold: DEFAULT_THRESHOLD,
      mergeBase: true,
      reportOnly: false
    })
  })

  it('accepts repeated and inline values', () => {
    const options = parseArgs([
      '--base=v2.8.1',
      '--lcov',
      'a.info',
      '--lcov',
      'b.info',
      '--scope',
      'src/muya',
      '--scope',
      'tools',
      '--exclude',
      'tools/**',
      '--threshold',
      '80'
    ])
    expect(options.base).toBe('v2.8.1')
    expect(options.lcov).toEqual(['a.info', 'b.info'])
    expect(options.scope).toEqual(['src/muya', 'tools'])
    expect(options.exclude).toEqual(['tools/**'])
    expect(options.threshold).toBe(80)
  })

  it('switches the comparison modes', () => {
    const options = parseArgs(['--worktree', '--no-merge-base'])
    expect(options.head).toBe('WORKTREE')
    expect(options.mergeBase).toBe(false)
  })

  it('rejects an invalid threshold and unknown arguments', () => {
    expect(() => parseArgs(['--threshold', '101'])).toThrow(DiffCoverageError)
    expect(() => parseArgs(['--threshold', 'abc'])).toThrow(/between 0 and 100/)
    expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/)
    expect(() => parseArgs(['--base'])).toThrow(/requires a value/)
  })
})

describe('tooling/diff-coverage — main', () => {
  const silenceStderr = () => vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

  it('passes at the default threshold when everything changed is covered', () => {
    const write = vi.fn()
    const code = main(['--base', 'main', '--lcov', 'coverage/lcov.info'], fakeIo(), write)
    expect(code).toBe(0)
    expect(write.mock.calls[0][0]).toContain('BLOCK_DIFF_COVERAGE_PASS')
  })

  it('fails when a changed line is uncovered, and report-only still exits 0', () => {
    const failing = vi.fn()
    const io = fakeIo({ lcov: LCOV_WITH_MISS })
    expect(main(['--base', 'main', '--lcov', 'coverage/lcov.info'], io, failing)).toBe(1)
    expect(failing.mock.calls[0][0]).toContain('BLOCK_DIFF_COVERAGE_MISS')

    const reportOnly = vi.fn()
    expect(
      main(
        ['--base', 'main', '--lcov', 'coverage/lcov.info', '--report-only'],
        fakeIo({ lcov: LCOV_WITH_MISS }),
        reportOnly
      )
    ).toBe(0)
  })

  it('skips when the base is an all-zero ref (branch creation push)', () => {
    const write = vi.fn()
    const io = { ...fakeIo(), git: (args) => (args[0] === 'rev-parse' ? '/repo\n' : '') }
    const code = main(['--base', '0'.repeat(40)], io, write)
    expect(code).toBe(0)
    expect(write.mock.calls[0][0]).toContain('BLOCK_DIFF_COVERAGE_SKIP reason=empty-base')
  })

  it('exits 2 when the LCOV record is missing', () => {
    silenceStderr()
    const io = {
      git: (args) => (args[0] === 'merge-base' ? 'abc\n' : args[0] === 'rev-parse' ? '/repo\n' : ''),
      read: () => {
        throw new Error('ENOENT')
      }
    }
    expect(main(['--base', 'main'], io, vi.fn())).toBe(2)
  })

  it('exits 2 on an unresolvable base instead of passing silently', () => {
    silenceStderr()
    const io = {
      git: (args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n'
        throw new Error('fatal: bad revision')
      },
      read: () => LCOV
    }
    expect(main(['--base', 'nope'], io, vi.fn())).toBe(2)
  })

  it('prints usage and exits 0 for --help', () => {
    const write = vi.fn()
    expect(main(['--help'], fakeIo(), write)).toBe(0)
    expect(write.mock.calls[0][0]).toContain('Usage: node tools/diff-coverage.mjs')
  })
})

describe('tooling/diff-coverage — runGate', () => {
  it('returns the resolved range and the scored rows', () => {
    const result = runGate(
      { ...parseArgs(['--base', 'main', '--lcov', 'coverage/lcov.info']), head: 'HEAD' },
      fakeIo()
    )
    expect(result.repo).toBe('/repo')
    expect(result.mergeBase).toBe('abc123def456')
    expect(result.ok).toBe(true)
    expect(result.totals.exec).toBe(4)
  })

  it('marks the worktree mode in the returned head', () => {
    const result = runGate(
      { ...parseArgs(['--base', 'main', '--lcov', 'coverage/lcov.info', '--worktree']) },
      fakeIo()
    )
    expect(result.head).toBe('WORKTREE')
  })
})
