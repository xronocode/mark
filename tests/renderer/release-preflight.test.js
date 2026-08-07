// FILE: tests/renderer/release-preflight.test.js
// VERSION: 1.4.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify exact release metadata/tag consistency, production workflow gates, GitHub prerelease classification, and Homebrew artifact routing for M-046.
//   SCOPE: Pure mismatch tests, current-workspace integration, CLI marker evidence, and static release-workflow assertions.
//   DEPENDS: Vitest, Node.js child_process/fs/path, tools/release-preflight.mjs, .github/workflows/release.yml.
//   LINKS: docs/knowledge-graph.xml M-046; docs/verification-plan.xml V-M-046; docs/requirements.xml UC-032.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   consistentEvidence - Complete v2.1.1-beta version fixture.
//   commandIndex - Locates a required release command for ordering assertions.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-08-07 v1.4.0 - require Homebrew cask URLs to use the staged Tauri DMG filename.
//   PREVIOUS: 2026-08-07 v1.3.0 - require hyphenated SemVer tags to publish as GitHub prereleases.
//   PREVIOUS_E2E: 2026-08-07 v1.2.0 - require a clean-checkout Vite build before Playwright preview.
//   PREVIOUS_UPDATER: 2026-08-07 v1.1.0 - require strict SemVer without a leading v in the updater feed.
//   INITIAL: 2026-08-07 v1.0.0 - add release version, tag, workflow verification, and marker regressions.
// END_CHANGE_SUMMARY

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ReleasePreflightError,
  readVersionEvidence,
  validateVersionEvidence
} from '../../tools/release-preflight.mjs'

const workspaceRoot = resolve(import.meta.dirname, '../..')
const consistentEvidence = {
  packageJson: '2.1.1-beta',
  packageLock: '2.1.1-beta',
  packageLockRoot: '2.1.1-beta',
  cargoWorkspace: '2.1.1-beta',
  cargoLockMark: '2.1.1-beta',
  tauriConfig: '2.1.1-beta'
}

// START_BLOCK_RELEASE_VERSION_TESTS
describe('M-046 release version preflight', () => {
  it('accepts one exact metadata version and matching release tag', () => {
    expect(
      validateVersionEvidence(consistentEvidence, 'v2.1.1-beta')
    ).toEqual({
      version: '2.1.1-beta',
      tag: 'v2.1.1-beta',
      sourceCount: 6
    })
  })

  it('rejects a stale lockfile version with the stable mismatch code', () => {
    expect(() =>
      validateVersionEvidence(
        { ...consistentEvidence, packageLockRoot: '2.0.6-alpha' },
        'v2.1.1-beta'
      )
    ).toThrowError(
      expect.objectContaining({
        name: 'ReleasePreflightError',
        code: 'MT_RELEASE_VERSION_MISMATCH'
      })
    )
  })

  it('rejects a tag that does not exactly match embedded metadata', () => {
    try {
      validateVersionEvidence(consistentEvidence, 'v2.1.0-beta')
      throw new Error('expected tag mismatch')
    } catch (error) {
      expect(error).toBeInstanceOf(ReleasePreflightError)
      expect(error.code).toBe('MT_RELEASE_TAG_MISMATCH')
    }
  })

  it('reads six consistent values from the current workspace', () => {
    expect(readVersionEvidence(workspaceRoot)).toEqual(consistentEvidence)
  })

  it('CLI emits the stable success marker for the target tag', () => {
    const result = spawnSync(
      process.execPath,
      ['tools/release-preflight.mjs', '--tag', 'v2.1.1-beta'],
      { cwd: workspaceRoot, encoding: 'utf8' }
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      '[ReleasePreflight][validateVersions][BLOCK_RELEASE_VERSION_CONSISTENT]'
    )
  })
})
// END_BLOCK_RELEASE_VERSION_TESTS

// START_BLOCK_RELEASE_WORKFLOW_TESTS
describe('production release workflow', () => {
  const workflow = readFileSync(
    resolve(workspaceRoot, '.github/workflows/release.yml'),
    'utf8'
  )
  const commandIndex = (command) => {
    const index = workflow.indexOf(command)
    expect(index, `${command} must exist in release.yml`).toBeGreaterThan(-1)
    return index
  }

  it('runs metadata and complete automated verification before packaging', () => {
    const buildIndex = commandIndex('uses: tauri-apps/tauri-action@v0')
    for (const command of [
      'npm run release:preflight',
      'npm run typecheck:ipc',
      'npm test',
      'npm run build',
      'npm run test:e2e',
      'cargo test --bin mark'
    ]) {
      expect(commandIndex(command)).toBeLessThan(buildIndex)
    }
  })

  it('builds the renderer before Playwright starts vite preview', () => {
    expect(commandIndex('npm run build')).toBeLessThan(
      commandIndex('npm run test:e2e')
    )
    expect(workflow).toContain('timeout-minutes: 15')
  })

  it('verifies signature and Gatekeeper before smoke launch', () => {
    const smokeIndex = commandIndex('- name: smoke launch')
    expect(commandIndex('codesign --verify --deep --strict')).toBeLessThan(
      smokeIndex
    )
    expect(commandIndex('spctl --assess --type execute')).toBeLessThan(
      smokeIndex
    )
  })

  it('writes strict SemVer to the updater feed while keeping v-prefixed release tags', () => {
    expect(workflow).toContain('VER="${TAG#v}"')
    expect(workflow).toContain('"version": "${VER}"')
    expect(workflow).not.toContain('"version": "${TAG}"')
  })

  it('publishes hyphenated SemVer tags as GitHub prereleases on create and rerun', () => {
    expect(workflow).toContain('PRERELEASE=false')
    expect(workflow).toContain('if [[ "$VER" == *-* ]]')
    expect(workflow).toContain('PRERELEASE=true')
    expect(workflow.match(/--prerelease="\$PRERELEASE"/g)).toHaveLength(2)
  })

  it('rejects a Homebrew cask whose URL does not match the staged Tauri DMG', () => {
    expect(workflow).toContain(
      "EXPECTED_DMG_TEMPLATE='Mark_#{version}_aarch64.dmg'"
    )
    expect(workflow).toContain(
      'grep -Fq "$EXPECTED_DMG_TEMPLATE" "$CASK"'
    )
  })
})
// END_BLOCK_RELEASE_WORKFLOW_TESTS
