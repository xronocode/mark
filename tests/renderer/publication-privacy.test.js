// FILE: tests/renderer/publication-privacy.test.js
// VERSION: 1.5.0
// START_MODULE_CONTRACT
//   PURPOSE: Guard the public boundary for operational records, retired current-tree artifacts, private home paths and legacy preference examples.
//   SCOPE: Reject captured profiles, private operations and exact retired paths; preserve authored/release assets; validate synthetic paths and exact fixture hashes.
//   DEPENDS: node:crypto, node:fs, node:os, node:path, node:url, vitest
//   LINKS: M-005, M-046, V-M-005, V-M-046, C-PUBLIC-REPOSITORY-HYGIENE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   root - public repository root resolved from the test location
//   fixtures - retained public fixture directory
//   retiredPublicArtifacts - exact obsolete current-tree paths that must stay absent
//   protectedPublicArtifacts - authored designs and release evidence that must stay present
//   collectFixtureFiles - recursively list the corpus with portable manifest path separators
//   readFixtureManifest - parse unique SHA-256 and size records with LF or CRLF delimiters
// END_MODULE_MAP

import { createHash } from 'node:crypto'
import { userInfo } from 'node:os'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixtures = resolve(root, 'fixtures')
const retiredPublicArtifacts = [
  'Mark-qa-C2-C6.md',
  'Mark-v2.1.2-beta-QA.md',
  'docs/grace-ai-standards-hygiene-methodology.md',
  'docs/archive/F-CASK-PUBLISH-HANDOFF.md',
  'docs/archive/F-UPDATER-WIRE-PLUGIN-handoff.md',
  'assets/screenshots/hero-dark.png',
  'assets/screenshots/themes.png',
  'screenshots/mark-showcase.webp',
  ...Array.from({ length: 8 }, (_, index) => `screenshots/showcase-0${index}-${[
    'rich-markdown',
    'code-highlighting',
    'mermaid-flowchart',
    'math-katex',
    'data-tables',
    'mermaid-sequence',
    'task-management',
    'mixed-showcase'
  ][index]}.png`)
]
const protectedPublicArtifacts = [
  'work/multi-source-workspace-mockup.html',
  'work/multi-source-workspace.html',
  'docs/assets/readme/2.8.1.manifest.json',
  'docs/assets/readme/cover.png'
]

// START_BLOCK_FIXTURE_MANIFEST_HELPERS
function collectFixtureFiles (directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? collectFixtureFiles(path) : [relative(fixtures, path).split(sep).join('/')]
  }).sort()
}

function readFixtureManifest () {
  const records = new Map()
  for (const line of readFileSync(resolve(fixtures, 'fixture-pin.lock'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue
    const match = /^([a-f0-9]{64})\s+(\d+)\s+(.+)$/.exec(line)
    expect(match, 'valid fixture manifest record').not.toBeNull()
    const [, hash, size, path] = match
    expect(records.has(path), 'unique fixture manifest path').toBe(false)
    records.set(path, { hash, size: Number(size) })
  }
  return records
}
// END_BLOCK_FIXTURE_MANIFEST_HELPERS

// START_BLOCK_PUBLICATION_BOUNDARY_SUITE
describe('public operational-record boundary', () => {
  it('keeps submission records and promotion planning outside public source', () => {
    for (const path of [
      '.grace/changes/active/C-59',
      'docs/promotion',
      'docs/backlog.md',
      'prototypes/table-copy'
    ]) {
      expect(existsSync(resolve(root, path)), 'private operational directory').toBe(false)
    }
    for (const path of ['tools/release/asc-api.py', 'tools/release/mas-pkg.sh']) {
      expect(existsSync(resolve(root, path)), 'reusable public release tooling').toBe(true)
    }
  })

  it('keeps exact obsolete artifacts retired without hiding authored or release evidence', () => {
    for (const path of retiredPublicArtifacts) {
      expect(existsSync(resolve(root, path)), `retired public artifact: ${path}`).toBe(false)
    }
    for (const path of protectedPublicArtifacts) {
      expect(existsSync(resolve(root, path)), `protected public artifact: ${path}`).toBe(true)
    }
    const ignores = readFileSync(resolve(root, '.gitignore'), 'utf8').split(/\r?\n/)
    for (const rule of [
      '/assets/screenshots/',
      '/screenshots/',
      '/CLAUDE.md',
      '/.env.local',
      '/Mark-qa-C2-C6.md',
      '/Mark-v2.1.2-beta-QA.md',
      '/docs/archive/F-CASK-PUBLISH-HANDOFF.md',
      '/docs/archive/F-UPDATER-WIRE-PLUGIN-handoff.md',
      '/docs/grace-ai-standards-hygiene-methodology.md'
    ]) {
      expect(ignores, `exact ignore rule: ${rule}`).toContain(rule)
    }
    const finalAudit = readFileSync(resolve(root, 'docs/archive/phase-8-final-audit.md'), 'utf8')
    expect(finalAudit).not.toContain('/Users/' + userInfo().username)
    expect(finalAudit).not.toMatch(/\/(?:Users|home)\/(?!<)[A-Za-z0-9_.-]+\//)
    const readmeShots = readFileSync(resolve(root, 'tests/e2e/readme-shots.spec.ts'), 'utf8')
    expect(readmeShots).not.toContain('/Users/ada')
    expect(readmeShots).toContain('/Users/<fixture>/projects/atlas')
    for (const path of ['.github/workflows/release.yml', 'src-tauri/src/m016_updater.rs']) {
      const content = readFileSync(resolve(root, path), 'utf8')
      expect(content, `retired updater handoff reference: ${path}`)
        .not.toContain('F-UPDATER-WIRE-PLUGIN-handoff.md')
      expect(content, `canonical signing setup reference: ${path}`)
        .toContain('docs/release-trains/README.md#owner-only-github-rollout')
    }
  })

  it('contains only six preference examples with a synthetic home identity', () => {
    const paths = collectFixtureFiles(fixtures).filter(path => !['README.md', 'fixture-pin.lock'].includes(path))
    const expected = ['v0-marktext-userdata', 'v1-userdata-mark-1.0.2'].flatMap(version =>
      ['dataCenter.json', 'preferences.json', 'window-state.json'].map(name => `${version}/migration-relevant/${name}`)
    ).sort()
    expect(paths).toEqual(expected)
    let syntheticPaths = 0
    for (const path of paths) {
      const content = readFileSync(resolve(fixtures, path), 'utf8')
      expect(() => JSON.parse(content)).not.toThrow()
      const homes = [...content.matchAll(/\/(?:Users|home)\/([^/"\s]+)/g)].map(match => match[1])
      expect(homes.every(home => home === '<fixture>'), 'synthetic fixture home paths').toBe(true)
      syntheticPaths += homes.length
    }
    expect(syntheticPaths).toBeGreaterThan(0)
  })

  it('pins the complete retained corpus by SHA-256 and byte size', () => {
    const records = readFixtureManifest()
    const paths = collectFixtureFiles(fixtures).filter(path => !['README.md', 'fixture-pin.lock'].includes(path))
    expect([...records.keys()].sort()).toEqual(paths)
    for (const path of paths) {
      const content = readFileSync(resolve(fixtures, path))
      expect(records.get(path)).toEqual({
        hash: createHash('sha256').update(content).digest('hex'),
        size: content.length
      })
    }
  })
})
// END_BLOCK_PUBLICATION_BOUNDARY_SUITE

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.5.0 - Stop embedding the owner name in the regression; check the live username and any non-placeholder home path instead.
//   PREV: v1.4.1 - Pin the portable synthetic home identity used by README screenshot fixtures.
//   PREVIOUS_CHANGE: v1.4.0 - Pin local-only Claude/environment files, the retired methodology, sanitized live paths and canonical updater-signing references.
//   PREVIOUS_CHANGE: v1.3.0 - Pin the exact obsolete QA, handoff and generated screenshot removals while preserving authored work and release screenshot evidence.
//   PREVIOUS_CHANGE: v1.2.0 - Normalize native separators and parse CRLF manifests; Git attributes preserve exact fixture bytes on Windows.
//   PREVIOUS_CHANGE: v1.1.0 - Also prevent republishing the private owner backlog and table-copy discussion previews.
//   PREVIOUS_CHANGE: v1.0.0 - Guard the owner-approved separation of private operations and captured profiles.
// END_CHANGE_SUMMARY
