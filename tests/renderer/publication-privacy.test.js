// FILE: tests/renderer/publication-privacy.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Guard the public boundary for operational records and legacy preference examples.
//   SCOPE: Reject captured profiles and private operations; validate synthetic paths and exact fixture hashes.
//   DEPENDS: node:crypto, node:fs, node:path, node:url, vitest
//   LINKS: M-005, M-046, V-M-005, V-M-046, C-PRIVATE-OPERATIONS
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   root - public repository root resolved from the test location
//   fixtures - retained public fixture directory
//   collectFixtureFiles - recursively list the public fixture corpus
//   readFixtureManifest - parse unique SHA-256 and byte-size records
// END_MODULE_MAP

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixtures = resolve(root, 'fixtures')

// START_BLOCK_FIXTURE_MANIFEST_HELPERS
function collectFixtureFiles (directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? collectFixtureFiles(path) : [relative(fixtures, path)]
  }).sort()
}

function readFixtureManifest () {
  const records = new Map()
  for (const line of readFileSync(resolve(fixtures, 'fixture-pin.lock'), 'utf8').split('\n')) {
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
//   LAST_CHANGE: v1.1.0 - Also prevent republishing the private owner backlog and table-copy discussion previews.
//   PREVIOUS_CHANGE: v1.0.0 - Guard the owner-approved separation of private operations and captured profiles.
// END_CHANGE_SUMMARY
