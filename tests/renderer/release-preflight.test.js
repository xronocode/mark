// FILE: tests/renderer/release-preflight.test.js
// VERSION: 2.19.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify exact release metadata/tag consistency, unprivileged candidate packaging, production workflow gates, updater-feed release classification, and Homebrew artifact routing for M-046.
//   SCOPE: Pure mismatch tests, current-workspace integration, CLI marker evidence, and static dry-run/production workflow assertions.
//   DEPENDS: Vitest, Node.js child_process/fs/path, tools/release-preflight.mjs, .github/workflows/release-tauri.yml, .github/workflows/release.yml.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046; .grace/context/requirements.xml UC-032.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   consistentEvidence - Complete v2.6.1 version fixture.
//   workspaceRoot - GRACE 4 synchronized symbol
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-10-22 v2.20.0 - advance the release fixture to v2.6.1.
//   PREV: 2026-10-20 v2.19.0 - advance the Release Please-derived positive fixture to v2.6.0.
//   PREV: 2026-10-21 v2.18.0 - require the unprivileged Tauri dry-run to disable updater artifacts while production packaging retains updater signing.
//   PREV: 2026-10-20 v2.17.0 - follow the deterministic prepare/publication split and assert direct normal-release publication without a mutable prerelease flag.
//   PREV: 2026-10-20 v2.16.0 - bind packaging to strict
//   readiness/materials, pin the production action, and keep manual
//   dispatch unsigned and publication-ineligible.
//   PREV: 2026-10-19 v2.15.0 - advance the release fixture to
//   v2.5.3 (C-69 session restore, C-65 wide tables, C-66 daily update
//   check, C-67 Clear Recent).
//   PREV: 2026-10-18 v2.14.0 - advance the release fixture to
//   v2.5.2 (title-bar double click, popover outside click, home rows,
//   popover actions; 2.5.1 is taken by the App Store build number).
//   PREV: 2026-10-18 v2.13.0 - advance the release fixture to
//   v2.5.0 (C-56 diagram pictures + corner pill, C-61 direct print/PDF,
//   C-62 per-diagram look, C-60 live footnotes, C-58 site gallery).
//   PREV: 2026-10-18 v2.12.0 - advance the release fixture to
//   the stable v2.4.0 tag (C-55; beta suffix dropped before the
//   Product Hunt launch).
//   PREV: 2026-10-18 v2.11.0 - advance the release fixture to
//   v2.4.0-beta (C-55 pele diagram engine, C-54 light node cards).
//   PREV: 2026-10-17 v2.10.0 - advance the release fixture to v2.3.1 (C-51 docs look, C-52 open folder from clipboard).
//   PREVIOUS: 2026-10-15 v2.9.0 - C-23: advance the release fixture to the first non-beta release v2.3.0.
//   PREVIOUS_LATEST: 2026-09-28 v2.8.0 - C-15 T-W3: strict-SemVer feed assertion follows the fragment-merge compose step (jq --arg ver) instead of the removed inline heredoc; pin the WINDOWS_RELEASE staging gate and the windows-x64 matrix lane.
//   PREVIOUS_LATEST: 2026-09-24 v2.7.0 - advance the release fixture to the link-autocomplete + dead-link-validation release v2.2.0-beta (C-20, C-21).
//   PREVIOUS_LATEST: 2026-09-24 v2.6.0 - advance the release fixture to the native-print + heading-navigation release v2.2.0-beta (C-18, C-19).
//   PREVIOUS_LATEST: 2026-09-22 v2.5.0 - advance the release fixture to the smart-paste + markdown-hygiene release v2.2.0-beta (C-16, C-17).
//   PREVIOUS_LATEST: 2026-09-21 v2.4.0 - advance the release fixture to the live-reload-scroll/mas/e2e-gates release v2.2.0-beta (C-2 R-9, C-15 T-M1..T-M5, P0 proposals).
//   PREVIOUS_LATEST: 2026-09-17 v2.3.0 - advance the release fixture to the context-menu/plain-copy/migration-retirement release v2.1.11-beta (C-10, C-11, C-12, C-13).
//   PREVIOUS_LATEST: 2026-09-16 v2.2.0 - advance the release fixture to the tabs/titlebar/clipboard batch v2.1.10-beta (C-3, C-6, C-7, C-8, C-9).
//   PREVIOUS_LATEST: 2026-08-18 v2.1.0 - advance the release fixture to live-doc v2 fix v2.1.9-beta.
//   PREVIOUS_OLDER: 2026-08-10 v2.0.0 - advance the release fixture to the async-race hotfix v2.1.7-beta.
//   PREVIOUS_CASK: 2026-08-07 v1.4.0 - require Homebrew cask URLs to use the staged Tauri DMG filename.
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
  packageJson: '2.6.1',
  packageLock: '2.6.1',
  packageLockRoot: '2.6.1',
  cargoWorkspace: '2.6.1',
  cargoLockMark: '2.6.1',
  tauriConfig: '2.6.1'
}

// START_BLOCK_RELEASE_VERSION_TESTS
describe('M-046 release version preflight', () => {
  it('accepts one exact metadata version and matching release tag', () => {
    expect(
      validateVersionEvidence(consistentEvidence, 'v2.6.1')
    ).toEqual({
      version: '2.6.1',
      tag: 'v2.6.1',
      sourceCount: 6
    })
  })

  it('rejects a stale lockfile version with the stable mismatch code', () => {
    expect(() =>
      validateVersionEvidence(
        { ...consistentEvidence, packageLockRoot: '2.0.6-alpha' },
        'v2.6.1'
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
      ['tools/release-preflight.mjs', '--tag', 'v2.6.1'],
      { cwd: workspaceRoot, encoding: 'utf8' }
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      '[ReleasePreflight][validateVersions][BLOCK_RELEASE_VERSION_CONSISTENT]'
    )
  })
})
// END_BLOCK_RELEASE_VERSION_TESTS

// START_BLOCK_RELEASE_DRY_RUN_WORKFLOW_TESTS
describe('unprivileged Tauri release dry-run workflow', () => {
  const dryRunWorkflow = readFileSync(
    resolve(workspaceRoot, '.github/workflows/release-tauri.yml'),
    'utf8'
  )

  it('builds app and DMG candidates without requesting updater signatures', () => {
    const buildStep = dryRunWorkflow.match(
      /- name: tauri build[\s\S]*?(?=\n      # ── ad-hoc signing)/
    )?.[0]

    expect(buildStep).toBeDefined()
    expect(buildStep).not.toContain('\n        env:')
    expect(dryRunWorkflow).toContain('uses: tauri-apps/tauri-action@')
    expect(dryRunWorkflow).toContain(
      `--config '{"bundle":{"createUpdaterArtifacts":false}}'`
    )
    expect(dryRunWorkflow).toContain("DMG=$(find target -name '*.dmg'")
  })
})
// END_BLOCK_RELEASE_DRY_RUN_WORKFLOW_TESTS

// START_BLOCK_RELEASE_WORKFLOW_TESTS
describe('production release workflow', () => {
  const workflow = readFileSync(
    resolve(workspaceRoot, '.github/workflows/release.yml'),
    'utf8'
  )
  const tauriConfig = JSON.parse(
    readFileSync(resolve(workspaceRoot, 'src-tauri/tauri.conf.json'), 'utf8')
  )
  const commandIndex = (command) => {
    const index = workflow.indexOf(command)
    expect(index, `${command} must exist in release.yml`).toBeGreaterThan(-1)
    return index
  }

  it('runs metadata and complete automated verification before packaging', () => {
    const buildIndex = commandIndex('uses: tauri-apps/tauri-action@')
    for (const command of [
      'npm run release:readiness --',
      'npm run release:materials',
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
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true)
    expect(workflow).toContain('VER="${TAG#v}"')
    // C-15 T-W3: the feed is composed in the publish job by merging
    // per-platform latest-platform.json fragments — strict SemVer enters
    // via jq --arg ver "$VER" (never the raw v-tag).
    expect(workflow).toContain('--arg ver "$VER"')
    expect(workflow).toContain('{version:$ver,')
    expect(workflow).not.toContain('"version": "${TAG}"')
    expect(workflow).not.toContain('{version:$tag,')
  })

  it('publishes beta tags as normal releases so the /latest updater feed advances', () => {
    expect(tauriConfig.plugins.updater.endpoints).toEqual([
      'https://github.com/xronocode/mark/releases/latest/download/latest.json'
    ])
    expect(workflow).toContain('--draft=false --prerelease=false')
    expect(workflow).not.toContain('if [[ "$VER" == *-* ]]')
    expect(workflow).not.toContain('PRERELEASE=true')
    expect(workflow).not.toContain('--prerelease="$PRERELEASE"')
    expect(workflow).toContain('publish verified draft as final mutation')
  })

  it('rejects a Homebrew cask whose URL does not match the staged Tauri DMG', () => {
    expect(workflow).toContain(
      "EXPECTED_DMG_TEMPLATE='Mark_#{version}_aarch64.dmg'"
    )
    expect(workflow).toContain(
      'grep -Fq "$EXPECTED_DMG_TEMPLATE" "$CASK"'
    )
  })

  it('stages Windows assets behind the WINDOWS_RELEASE repo variable (C-15 T-W3)', () => {
    expect(workflow).toContain('name: windows-x64')
    expect(workflow).toContain('x86_64-pc-windows-msvc')
    expect(workflow).toContain('vars.WINDOWS_RELEASE')
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'")
    expect(workflow).toContain('name: unsigned QA build')
    expect(workflow).toContain('environment: release-signing')
    expect(workflow).toContain('environment: release')
  })
})
// END_BLOCK_RELEASE_WORKFLOW_TESTS
