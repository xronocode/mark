// FILE: tests/renderer/release-normalize.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove Release Please is the only version authority and Mark's secondary release surfaces normalize through one deterministic, idempotent allowlisted patch.
//   SCOPE: Temporary-workspace golden patch, check/write/idempotence, forbidden override, and package/manifest mismatch regressions.
//   DEPENDS: Vitest; Node.js fs/os/path; tools/release-normalize.mjs.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   BOOTSTRAP_SHA - Pinned v2.5.3 release boundary used for version-surface fixtures.
//   COPY_PATHS - Repository files copied into the normalization fixture.
//   VERSION_BASELINE_PATHS - Versioned surfaces restored from the pinned bootstrap tree.
//   LOCALES - Ten source/minified locale identifiers.
//   git - Run a read-only git identity query.
//   gitFile - Read one fixture file from a pinned git tree.
//   writeJson - Stable pretty-JSON fixture writer.
//   restoreChangelogDraft - Reconstruct the curated draft markers after Release Please promotion.
//   copyFixture - Build a pre-normalization 2.5.4 draft plus generated 2.6.0 Release Please fixture.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-21 v1.2.0: make golden fixtures and checkout assertions valid in both collecting main and prepared release-PR states.
//   - 2026-10-20 v1.1.0: prove structural draft-only updates, curated CHANGELOG promotion, history preservation, and last-release boundary retirement.
//   - 2026-10-20 v1.0.0: add golden 2.5.4-to-2.6.0 propagation, no-write, and idempotence coverage.
// END_CHANGE_SUMMARY

import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyReleaseNormalization,
  planReleaseNormalization,
  runReleaseNormalize
} from '../../tools/release-normalize.mjs'

const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
const BOOTSTRAP_SHA = '0ed3351ec30aa7b9d9c166bdb4133149e4dd88e6'
const VERSION_BASELINE_PATHS = [
  'Cargo.toml',
  'Cargo.lock',
  'src-tauri/tauri.conf.json',
  'tests/renderer/release-preflight.test.js'
]
const COPY_PATHS = [
  'Cargo.toml',
  'Cargo.lock',
  'src-tauri/tauri.conf.json',
  'tests/renderer/release-preflight.test.js',
  'CHANGELOG.md',
  'README.md',
  'docs/release-notes-en-drafts.md',
  'release-please-config.json',
  'src/renderer/src/whatsNew/data.js',
  ...LOCALES.flatMap((locale) => [
    `static/locales/${locale}.json`,
    `static/locales/${locale}.min.json`
  ])
]

const git = (...args) =>
  execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim()
const gitFile = (ref, path) =>
  execFileSync('git', ['show', `${ref}:${path}`], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
const restoreChangelogDraft = (source, version) => {
  if (source.includes('<!-- release-draft:start -->')) return source
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = new RegExp(
    `^## \\[${escaped}\\][^\\n]*\\n+([\\s\\S]*?)(?=^## \\[)`,
    'm'
  )
  const match = section.exec(source)
  if (!match) throw new Error(`Cannot restore CHANGELOG draft for ${version}`)
  return source.replace(
    match[0],
    `<!-- release-draft:start -->\n\n${match[1].trim()}\n\n<!-- release-draft:end -->\n\n`
  )
}

const copyFixture = () => {
  const root = mkdtempSync(resolve(tmpdir(), 'mark-release-normalize-'))
  for (const path of COPY_PATHS) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    copyFileSync(resolve(path), resolve(root, path))
  }
  for (const path of VERSION_BASELINE_PATHS) {
    writeFileSync(resolve(root, path), gitFile(BOOTSTRAP_SHA, path))
  }
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  packageJson.version = '2.6.0'
  writeJson(resolve(root, 'package.json'), packageJson)
  writeJson(resolve(root, '.release-please-manifest.json'), { '.': '2.6.0' })

  const train = JSON.parse(
    readFileSync(resolve('docs/release-trains/2.5.x-next.json'), 'utf8')
  )
  train.state = 'Collecting'
  train.transitions = train.transitions.filter(({ state }) => state !== 'Preparing')
  train.computedVersion = '2.5.4'
  train.materials.screenshotManifest = 'docs/assets/readme/2.5.4.manifest.json'
  mkdirSync(resolve(root, 'docs/release-trains'), { recursive: true })
  writeJson(resolve(root, 'docs/release-trains/2.5.x-next.json'), train)

  writeFileSync(
    resolve(root, 'README.md'),
    readFileSync(resolve(root, 'README.md'), 'utf8')
      .replace("## What's new in 2.6.0", "## What's new in 2.5.4")
  )
  writeFileSync(
    resolve(root, 'docs/release-notes-en-drafts.md'),
    readFileSync(resolve(root, 'docs/release-notes-en-drafts.md'), 'utf8')
      .replace('## v2.6.0', '## v2.5.4')
  )
  writeFileSync(
    resolve(root, 'src/renderer/src/whatsNew/data.js'),
    readFileSync(resolve(root, 'src/renderer/src/whatsNew/data.js'), 'utf8')
      .replace("  '2.6.0': [", "  '2.5.4': [")
      .replaceAll('whatsNew.v2_6_0.', 'whatsNew.v2_5_4.')
      .replace(
        "  '2.6.0': 'https://github.com/xronocode/mark/releases/tag/v2.6.0'",
        "  '2.5.4': 'https://github.com/xronocode/mark/releases/tag/v2.5.4'"
      )
  )
  for (const locale of LOCALES) {
    const sourcePath = resolve(root, `static/locales/${locale}.json`)
    const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
    source.whatsNew.v2_5_4 = source.whatsNew.v2_6_0
    delete source.whatsNew.v2_6_0
    writeJson(sourcePath, source)
    writeFileSync(resolve(root, `static/locales/${locale}.min.json`), JSON.stringify(source))
  }
  const changelogPath = resolve(root, 'CHANGELOG.md')
  writeFileSync(
    changelogPath,
    restoreChangelogDraft(readFileSync(changelogPath, 'utf8'), '2.6.0').replace(
      '<!-- #region releases -->',
      '<!-- #region releases -->\n## [2.6.0] - 2026-10-20\n\nGenerated placeholder.\n'
    )
  )
  const releasePleasePath = resolve(root, 'release-please-config.json')
  const releasePlease = JSON.parse(readFileSync(releasePleasePath, 'utf8'))
  releasePlease['last-release-sha'] = BOOTSTRAP_SHA
  writeJson(releasePleasePath, releasePlease)
  const screenshots = JSON.parse(
    readFileSync(resolve('docs/assets/readme/2.6.0.manifest.json'), 'utf8')
  )
  screenshots.releaseVersion = '2.5.4'
  mkdirSync(resolve(root, 'docs/assets/readme'), { recursive: true })
  writeJson(resolve(root, 'docs/assets/readme/2.5.4.manifest.json'), screenshots)
  return root
}

// START_BLOCK_RELEASE_NORMALIZE_TESTS
describe('release normalization', () => {
  it('pins Release Please 17.11.2 as the sole Conventional SemVer and CHANGELOG authority', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    const config = JSON.parse(
      readFileSync(resolve('release-please-config.json'), 'utf8')
    )
    const manifest = JSON.parse(
      readFileSync(resolve('.release-please-manifest.json'), 'utf8')
    )
    expect(packageJson.devDependencies['release-please']).toBe('17.11.2')
    expect(manifest).toEqual({ '.': packageJson.version })
    expect(config['bootstrap-sha']).toBe(
      BOOTSTRAP_SHA
    )
    if ('last-release-sha' in config) {
      expect(config['last-release-sha']).toBe(config['bootstrap-sha'])
    }
    expect(config['skip-github-release']).toBe(true)
    expect(config.packages['.']['skip-github-release']).toBe(true)
    expect(JSON.stringify(config)).not.toContain('release-as')
  })

  it('proves the divergent v2.5.3 bootstrap tree and current feat history compute the next minor 2.6.0', () => {
    const boundary = '0ed3351ec30aa7b9d9c166bdb4133149e4dd88e6'
    const tagged = 'acad9988220c9a1a6d28ea4e94b69d69d774f805'
    expect(git('merge-base', '--is-ancestor', boundary, 'HEAD')).toBe('')
    expect(git('rev-parse', `${boundary}^{tree}`)).toBe(
      git('rev-parse', `${tagged}^{tree}`)
    )
    const subjects = git('log', '--format=%s', `${boundary}..HEAD`).split('\n')
    expect(subjects.some((subject) => /^feat(?:\([^)]*\))?!?:/.test(subject))).toBe(true)
    const [major, minor] = '2.5.3'.split('.').map(Number)
    expect(`${major}.${minor + 1}.0`).toBe('2.6.0')
  })

  it('plans the exact allowlisted 2.6.0 propagation without touching package authority or release history', () => {
    const root = copyFixture()
    const plan = planReleaseNormalization(root, { date: '2026-10-20' })
    expect(plan.version).toBe('2.6.0')
    expect(plan.changes.map(({ path }) => path)).toEqual([
      'Cargo.toml',
      'Cargo.lock',
      'src-tauri/tauri.conf.json',
      'tests/renderer/release-preflight.test.js',
      'docs/release-trains/2.5.x-next.json',
      'README.md',
      'docs/release-notes-en-drafts.md',
      'src/renderer/src/whatsNew/data.js',
      'CHANGELOG.md',
      'release-please-config.json',
      ...LOCALES.flatMap((locale) => [
        `static/locales/${locale}.json`,
        `static/locales/${locale}.min.json`
      ]),
      'docs/assets/readme/2.6.0.manifest.json'
    ])
    expect(plan.changes.map(({ path }) => path)).not.toContain('package.json')
    expect(plan.changes.find(({ path }) => path === 'Cargo.toml').after).toContain(
      'version = "2.6.0"'
    )
    const fixturePatch = plan.changes.find(
      ({ path }) => path === 'tests/renderer/release-preflight.test.js'
    ).after
    expect(fixturePatch).toContain("packageJson: '2.6.0'")
    expect(fixturePatch).toContain("'v2.6.0'")
    expect(fixturePatch).toContain('Complete v2.6.0 version fixture.')
    expect(fixturePatch).toContain('2026-10-20 v2.16.0')
    expect(fixturePatch).toContain("validateVersionEvidence(consistentEvidence, 'v2.1.0-beta')")
    const normalizedChangelog = plan.changes.find(({ path }) => path === 'CHANGELOG.md').after
    expect(normalizedChangelog.match(/^## \[2\.6\.0\]/gm)).toHaveLength(1)
    expect(normalizedChangelog).not.toContain('release-draft:start')
    expect(normalizedChangelog).toContain('Tables can leave Mark as pictures')
    expect(normalizedChangelog).not.toContain('Generated placeholder.')
    expect(normalizedChangelog).toContain('## [2.5.3] - 2026-10-19')
    const normalizedConfig = JSON.parse(
      plan.changes.find(({ path }) => path === 'release-please-config.json').after
    )
    expect(normalizedConfig).not.toHaveProperty('last-release-sha')
    expect(normalizedConfig['bootstrap-sha']).toBe(
      '0ed3351ec30aa7b9d9c166bdb4133149e4dd88e6'
    )
    const normalizedTrain = JSON.parse(
      plan.changes.find(({ path }) => path === 'docs/release-trains/2.5.x-next.json').after
    )
    expect(normalizedTrain.state).toBe('Preparing')
    expect(normalizedTrain.transitions.at(-1)).toMatchObject({
      state: 'Preparing',
      actor: 'mark-release-prep[bot]'
    })
  })

  it('check mode never writes and can report the pending patch', () => {
    const root = copyFixture()
    const before = readFileSync(resolve(root, 'Cargo.toml'), 'utf8')
    const result = runReleaseNormalize(root, { date: '2026-10-20' })
    expect(result.planned).toContain('Cargo.toml')
    expect(readFileSync(resolve(root, 'Cargo.toml'), 'utf8')).toBe(before)
  })

  it('write mode applies once and the second plan is byte-empty', () => {
    const root = copyFixture()
    const plan = planReleaseNormalization(root, { date: '2026-10-20' })
    const result = applyReleaseNormalization(root, plan, { date: '2026-10-20' })
    expect(result.written).toEqual(plan.changes.map(({ path }) => path))
    expect(planReleaseNormalization(root, { date: '2026-10-20' }).changes).toEqual([])
  })

  it('rejects package/manifest disagreement instead of calculating a target', () => {
    const root = copyFixture()
    writeJson(resolve(root, '.release-please-manifest.json'), { '.': '2.6.1' })
    expect(() => planReleaseNormalization(root)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_NORMALIZE_AUTHORITY_MISMATCH' })
    )
  })

  it('derives the current checkout from Release Please authority without writing', () => {
    const packageVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
    const trainPath = resolve('docs/release-trains/2.5.x-next.json')
    const trainBefore = readFileSync(trainPath, 'utf8')
    const previousVersion = JSON.parse(trainBefore).previousRelease.tag.replace(/^v/, '')
    const plan = planReleaseNormalization(process.cwd())
    expect(plan.version).toBe(packageVersion)
    expect(plan.state).toBe(
      packageVersion === previousVersion ? 'awaiting-release-please' : 'planned'
    )
    if (packageVersion === previousVersion) expect(plan.changes).toEqual([])
    expect(readFileSync(trainPath, 'utf8')).toBe(trainBefore)
  })
})
// END_BLOCK_RELEASE_NORMALIZE_TESTS
