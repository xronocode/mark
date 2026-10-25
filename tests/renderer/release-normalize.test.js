// FILE: tests/renderer/release-normalize.test.js
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove package.json is the only version authority and Mark's secondary release surfaces normalize through one deterministic, idempotent allowlisted patch.
//   SCOPE: Fully synthetic temporary workspaces (no copy of live release files, so a release never breaks this suite), check/write/idempotence, CRLF ledgers, lifecycle and authority rejections, forbidden override, and the retired Release Please surfaces.
//   DEPENDS: Vitest; Node.js child_process/fs/os/path; tools/release-normalize.mjs.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LOCALES - Ten source/minified locale identifiers.
//   PREVIOUS - Synthetic previous release version.
//   PLANNED - Synthetic planned version the drafts are written for.
//   DATE - Deterministic normalization date.
//   writeFile - Write one fixture file, creating parent directories.
//   writeJson - Stable pretty-JSON fixture writer.
//   draftKey - Locale whatsNew key for one version.
//   synthetic - Build a Collecting workspace whose drafts target PLANNED and whose package carries a chosen version.
//   windowsNewlines - Produce exactly one CRLF sequence per logical line break.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-24 v2.1.0: What's New records the release date (the CHANGELOG heading date) instead of a GitHub release URL; cover insertion, re-targeting and a heading dated by an earlier pass.
//   - 2026-10-24 v2.0.0: C-RELEASE-CONVEYOR — rebuild on synthetic workspaces instead of rewriting copies of the live release files (which broke on every version bump); package.json replaces the Release Please manifest as authority; cover planned and re-targeted versions.
//   - 2026-10-21 v1.5.0: derive the collecting fixture from every terminal candidate state and assert fail-closed normalization on a live Ready train.
//   - 2026-10-20 v1.0.0: add golden 2.6.0-to-2.7.0 propagation, no-write, and idempotence coverage.
// END_CHANGE_SUMMARY

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyReleaseNormalization,
  planReleaseNormalization,
  runReleaseNormalize
} from '../../tools/release-normalize.mjs'

const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
const PREVIOUS = '1.4.0'
const PLANNED = '1.5.0'
const DATE = '2026-10-24'

const writeFile = (root, path, value) => {
  mkdirSync(dirname(resolve(root, path)), { recursive: true })
  writeFileSync(resolve(root, path), value)
}
const writeJson = (root, path, value) => writeFile(root, path, `${JSON.stringify(value, null, 2)}\n`)
const draftKey = (version) => `v${version.replace(/[.-]/g, '_')}`
const windowsNewlines = (source) => source.replace(/\r\n?/g, '\n').replaceAll('\n', '\r\n')

const synthetic = ({ packageVersion = PLANNED, state = 'Collecting' } = {}) => {
  const root = mkdtempSync(resolve(tmpdir(), 'mark-release-normalize-'))
  writeJson(root, 'package.json', { name: 'mark', version: packageVersion })
  writeFile(root, 'Cargo.toml', `[workspace]\nmembers = ["src-tauri"]\n\n[workspace.package]\nversion = "${PREVIOUS}"\nedition = "2021"\n`)
  writeFile(root, 'Cargo.lock', `version = 4\n\n[[package]]\nname = "mark"\nversion = "${PREVIOUS}"\ndependencies = []\n`)
  writeJson(root, 'src-tauri/tauri.conf.json', { productName: 'Mark', version: PREVIOUS })
  writeFile(
    root,
    'tests/renderer/release-preflight.test.js',
    [
      '// VERSION: 1.2.0',
      `//   consistentEvidence - Complete v${PREVIOUS} version fixture.`,
      '// START_CHANGE_SUMMARY',
      '//   LAST_CHANGE: 2026-01-01 v1.2.0 - earlier.',
      '// END_CHANGE_SUMMARY',
      '// START_BLOCK_RELEASE_VERSION_TESTS',
      'const consistentEvidence = {',
      `  packageJson: '${PREVIOUS}',`,
      `  tauriConfig: '${PREVIOUS}'`,
      '}',
      `validateVersionEvidence(consistentEvidence, 'v${PREVIOUS}')`,
      '// END_BLOCK_RELEASE_VERSION_TESTS',
      ''
    ].join('\n')
  )
  writeFile(root, 'README.md', `# Mark\n\n## What's new in ${PLANNED}\n\n- Alpha.\n`)
  writeFile(root, 'docs/release-notes-en-drafts.md', `# Drafts\n\n## v${PLANNED}\n\n- Alpha.\n\n## v${PREVIOUS}\n\n- Old.\n`)
  writeFile(
    root,
    'src/renderer/src/whatsNew/data.js',
    [
      '// START_BLOCK_WHATS_NEW_CONTENT',
      'export const content = {',
      `  '${PLANNED}': [`,
      `    { title: 'whatsNew.${draftKey(PLANNED)}.alpha.title' }`,
      '  ],',
      `  '${PREVIOUS}': []`,
      '}',
      '// END_BLOCK_WHATS_NEW_CONTENT',
      '// START_BLOCK_WHATS_NEW_EXTRAS',
      'export const WHATS_NEW_RELEASE_DATES = {',
      `  '${PREVIOUS}': '2026-01-01'`,
      '}',
      '// END_BLOCK_WHATS_NEW_EXTRAS',
      ''
    ].join('\n')
  )
  writeFile(
    root,
    'CHANGELOG.md',
    `# Changelog\n\n<!-- release-draft:start -->\n\n### Editor\n\n- Alpha.\n\n<!-- release-draft:end -->\n\n## [${PREVIOUS}] - 2026-01-01\n\n- Old.\n`
  )
  for (const locale of LOCALES) {
    const table = { whatsNew: { [draftKey(PLANNED)]: { alpha: { title: `A-${locale}` } } } }
    writeJson(root, `static/locales/${locale}.json`, table)
    writeFile(root, `static/locales/${locale}.min.json`, JSON.stringify(table))
  }
  writeJson(root, 'docs/release-trains/current.json', { schemaVersion: '1.0.0', trainId: '1.5.x-next' })
  writeJson(root, 'docs/release-trains/1.5.x-next.json', {
    schemaVersion: '1.0.0',
    trainId: '1.5.x-next',
    state,
    previousRelease: { tag: `v${PREVIOUS}` },
    computedVersion: PLANNED,
    materials: { screenshotManifest: `docs/assets/readme/${PLANNED}.manifest.json` },
    transitions: [{ state: 'Collecting', date: '2026-10-24' }]
  })
  writeFile(
    root,
    'docs/release-trains/1.5.x-next.md',
    `# 1.5.x-next\n\n| Field | Value |\n|---|---|\n| State | ${state} |\n\n- The checked-in train remains **Collecting**. The planned version is ${PLANNED}.\n`
  )
  return root
}

// START_BLOCK_RELEASE_NORMALIZE_TESTS
describe('release normalization', () => {
  it('keeps package.json as the only version authority with Release Please retired', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    expect(packageJson.devDependencies['release-please']).toBeUndefined()
    expect(packageJson.scripts['release:prepare:dry-run']).toBeUndefined()
    for (const path of [
      'release-please-config.json',
      '.release-please-manifest.json',
      '.github/workflows/release-please.yml'
    ]) {
      expect(existsSync(resolve(path)), path).toBe(false)
    }
  })

  it('propagates the planned version to the secondary surfaces only', () => {
    const plan = planReleaseNormalization(synthetic(), { date: DATE })
    expect(plan).toMatchObject({ version: PLANNED, state: 'planned' })
    expect(plan.changes.map(({ path }) => path)).toEqual([
      'Cargo.toml',
      'Cargo.lock',
      'src-tauri/tauri.conf.json',
      'tests/renderer/release-preflight.test.js',
      'docs/release-trains/1.5.x-next.json',
      'docs/release-trains/1.5.x-next.md',
      'src/renderer/src/whatsNew/data.js',
      'CHANGELOG.md'
    ])
    const after = (path) => plan.changes.find((change) => change.path === path).after
    expect(after('Cargo.toml')).toContain(`version = "${PLANNED}"`)
    expect(after('Cargo.lock')).toContain(`name = "mark"\nversion = "${PLANNED}"`)
    expect(JSON.parse(after('src-tauri/tauri.conf.json')).version).toBe(PLANNED)
    const fixture = after('tests/renderer/release-preflight.test.js')
    expect(fixture).toContain(`packageJson: '${PLANNED}'`)
    expect(fixture).toContain(`validateVersionEvidence(consistentEvidence, 'v${PLANNED}')`)
    expect(fixture).toContain(`Complete v${PLANNED} version fixture.`)
    expect(fixture).toContain(`${DATE} v1.3.0 - advance the normalized positive fixture to v${PLANNED}.`)
    const train = JSON.parse(after('docs/release-trains/1.5.x-next.json'))
    expect(train.state).toBe('Preparing')
    expect(train.transitions.at(-1)).toMatchObject({ state: 'Preparing', actor: 'release-normalize' })
    const ledger = after('docs/release-trains/1.5.x-next.md')
    expect(ledger).toContain('| State | Preparing |')
    expect(ledger).toContain(`The preparation PR set ${PLANNED} with npm version`)
    expect(ledger).not.toContain('remains **Collecting**')
    const changelog = after('CHANGELOG.md')
    expect(changelog).not.toContain('release-draft:start')
    expect(changelog).toContain(`## [${PLANNED}] - ${DATE}\n\n### Editor\n\n- Alpha.`)
    expect(changelog).toContain(`## [${PREVIOUS}] - 2026-01-01`)
    const whatsNew = after('src/renderer/src/whatsNew/data.js')
    expect(whatsNew).toContain(`export const WHATS_NEW_RELEASE_DATES = {\n  '${PLANNED}': '${DATE}',\n  '${PREVIOUS}': '2026-01-01'\n}`)
  })

  it('records the release date in a Windows CRLF checkout of What\'s New and stays idempotent', () => {
    const root = synthetic()
    const path = resolve(root, 'src/renderer/src/whatsNew/data.js')
    writeFileSync(path, windowsNewlines(readFileSync(path, 'utf8')))
    const plan = planReleaseNormalization(root, { date: DATE })
    const whatsNew = plan.changes.find((change) => change.path === 'src/renderer/src/whatsNew/data.js').after
    expect(whatsNew).toContain(`export const WHATS_NEW_RELEASE_DATES = {\r\n  '${PLANNED}': '${DATE}',\r\n`)
    expect(whatsNew.replaceAll('\r\n', '')).not.toContain('\n')
    applyReleaseNormalization(root, plan, { date: DATE })
    expect(planReleaseNormalization(root, { date: DATE }).changes).toEqual([])
  })

  it('keeps the date of a CHANGELOG heading written by an earlier pass', () => {
    const root = synthetic()
    const path = resolve(root, 'CHANGELOG.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace('<!-- release-draft:start -->', `## [${PLANNED}] - 2026-10-20\n\n<!-- release-draft:start -->`))
    const plan = planReleaseNormalization(root, { date: DATE })
    const whatsNew = plan.changes.find((change) => change.path === 'src/renderer/src/whatsNew/data.js').after
    expect(whatsNew).toContain(`'${PLANNED}': '2026-10-20'`)
  })

  it('re-targets every draft surface when the released version differs from the plan', () => {
    const target = '1.4.1'
    const plan = planReleaseNormalization(synthetic({ packageVersion: target }), { date: DATE })
    const paths = plan.changes.map(({ path }) => path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'README.md',
        'docs/release-notes-en-drafts.md',
        'src/renderer/src/whatsNew/data.js',
        ...LOCALES.flatMap((locale) => [`static/locales/${locale}.json`, `static/locales/${locale}.min.json`])
      ])
    )
    const after = (path) => plan.changes.find((change) => change.path === path).after
    expect(after('README.md')).toContain(`## What's new in ${target}`)
    expect(after('docs/release-notes-en-drafts.md')).toContain(`## v${target}`)
    expect(after('docs/release-notes-en-drafts.md')).toContain(`## v${PREVIOUS}`)
    const whatsNew = after('src/renderer/src/whatsNew/data.js')
    expect(whatsNew).toContain(`'${target}': [`)
    expect(whatsNew).toContain(`whatsNew.${draftKey(target)}.alpha.title`)
    expect(whatsNew).toContain(`'${target}': '${DATE}'`)
    expect(whatsNew).not.toContain(`'${PLANNED}': '`)
    const locale = JSON.parse(after('static/locales/fr.json'))
    expect(Object.keys(locale.whatsNew)).toEqual([draftKey(target)])
    expect(after('static/locales/fr.min.json')).toBe(JSON.stringify(locale))
    expect(JSON.parse(after('docs/release-trains/1.5.x-next.json')).computedVersion).toBe(target)
  })

  it('check mode never writes and reports the pending patch', () => {
    const root = synthetic()
    const before = readFileSync(resolve(root, 'Cargo.toml'), 'utf8')
    const result = runReleaseNormalize(root, { date: DATE })
    expect(result.planned).toContain('Cargo.toml')
    expect(readFileSync(resolve(root, 'Cargo.toml'), 'utf8')).toBe(before)
  })

  it('write mode applies once and the second plan is byte-empty', () => {
    const root = synthetic({ packageVersion: '1.4.1' })
    const plan = planReleaseNormalization(root, { date: DATE })
    const result = applyReleaseNormalization(root, plan, { date: DATE })
    expect(result.written).toEqual(plan.changes.map(({ path }) => path))
    expect(planReleaseNormalization(root, { date: DATE }).changes).toEqual([])
  })

  it('preserves Windows CRLF in the prepared human train ledger', () => {
    const root = synthetic()
    const ledgerPath = resolve(root, 'docs/release-trains/1.5.x-next.md')
    writeFileSync(ledgerPath, windowsNewlines(readFileSync(ledgerPath, 'utf8')))
    const plan = planReleaseNormalization(root, { date: DATE })
    const ledger = plan.changes.find(({ path }) => path === 'docs/release-trains/1.5.x-next.md').after
    expect(ledger.replaceAll('\r\n', '')).not.toContain('\n')
    applyReleaseNormalization(root, plan, { date: DATE })
    expect(planReleaseNormalization(root, { date: DATE }).changes).toEqual([])
  })

  it('waits for a version while the package still carries the previous release', () => {
    expect(planReleaseNormalization(synthetic({ packageVersion: PREVIOUS }))).toEqual({
      version: PREVIOUS,
      state: 'awaiting-version',
      changes: []
    })
  })

  it('rejects an invalid package version instead of calculating one', () => {
    expect(() => planReleaseNormalization(synthetic({ packageVersion: 'next' }))).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_NORMALIZE_AUTHORITY_MISMATCH' })
    )
  })

  it('rejects normalization of a frozen train', () => {
    expect(() => planReleaseNormalization(synthetic({ state: 'Frozen' }))).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_NORMALIZE_LIFECYCLE_INVALID' })
    )
  })

  it('forbids an explicit target on the command line', () => {
    let failure
    try {
      execFileSync('node', ['tools/release-normalize.mjs', '--version', '9.9.9'], {
        encoding: 'utf8',
        stdio: 'pipe'
      })
    } catch (error) {
      failure = error
    }
    expect(failure?.status).toBe(1)
    expect(failure?.stderr).toContain('MT_RELEASE_NORMALIZE_OVERRIDE_FORBIDDEN')
  })

  it('plans the live checkout without writing, or refuses a sealed one', () => {
    const before = readFileSync(resolve('package.json'), 'utf8')
    try {
      runReleaseNormalize(process.cwd())
    } catch (error) {
      // From Frozen on the payload is pinned and normalization must refuse.
      expect(error.code).toBe('MT_RELEASE_NORMALIZE_LIFECYCLE_INVALID')
    }
    expect(readFileSync(resolve('package.json'), 'utf8')).toBe(before)
  })
})
// END_BLOCK_RELEASE_NORMALIZE_TESTS
