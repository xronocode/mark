// @vitest-environment node
// FILE: tests/tools/draft-asset-inventory.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Execute the release workflow's asset-inventory shell against a
//   synthetic release-stage tree and pin the publish step's emission
//   contract, proving the draft receives exactly the named immutable
//   inventory (the digest manifest is publication bookkeeping, not release
//   content, so it must not ship as a draft asset) and that an empty asset
//   fails closed at the inventory gate and at the emission point — instead
//   of trusting workflow text pins alone (integration f-006: the publish
//   step uploaded every file sitting in the asset dir, so the bookkeeping
//   manifest rode into the draft as an extra asset, and nothing anywhere
//   refused a zero-byte asset).
//   SCOPE: The checked-in release.yml parsed with the lockfile yaml package
//   and its steps located by exact name; two declared substitutions turn the
//   workflow's fixed /tmp/release-stage and /tmp/release-assets into
//   per-test roots; every fixture lives in a per-test temp tree; no network,
//   no gh calls, no repository mutation outside the temp tree.
//   DEPENDS: Vitest; yaml (lockfile devDependency); node:child_process/fs/os/
//   path/url built-ins; bash (Git Bash resolved explicitly on Windows) and
//   sha256sum, skipped with an explicit reason where absent.
//   LINKS: .github/workflows/release.yml prepare-publication + publish;
//   C-RELEASE-SIGN-STAGED-SET execution-gate precedent.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   releaseWorkflow - checked-in release.yml read as text and parsed with the yaml package.
//   findStepRun - extracts a step's run: shell text by exact name.
//   inventoryScript - the "assemble exact asset inventory" run text (executed verbatim).
//   reconcileScript - the publish "reconcile and verify draft or exact public release" run text (structurally pinned).
//   sealScript - the "seal publication bundle" run text (structurally pinned).
//   resolveBash - the gate's bash: Git Bash resolved explicitly on Windows (the release-github-controls precedent), plain bash elsewhere.
//   posixPath - converts per-test roots to POSIX-flavored drive paths (C:/...) so backslashes never ride verbatim shell text.
//   FIXED_ROOTS - the declared substitution literals (/tmp/release-stage, /tmp/release-assets), each required to appear in the executed step.
//   substituteFixedRoots - the two declared substitutions (/tmp/release-stage, /tmp/release-assets become per-test roots), failing loudly on drift.
//   makeStageFixture - a synthetic release-stage tree holding the signed macOS set (and optionally the Windows set) with a composed latest.json.
//   runInventory - spawns the resolved bash (--noprofile --norc -c) over the substituted inventory text under TAG/WINDOWS_RELEASE.
//   assetNames - sorted file names of one directory.
//   repoRoot - repository root resolved from this file's location.
//   hostHasBash - one-time probe gating the shell cases.
//   hostHasSha256sum - one-time probe gating the shell cases (the inventory hashes its assets).
//   bashSkipReason - explicit reason reported when the shell cases are skipped.
//   sha256sumSkipReason - explicit reason reported when sha256sum is absent.
//   makeTempRoot - the per-test temp tree under the OS temp dir; the only directory any test writes to or removes.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-26 integration f-006: execution gate lands FIRST and red by
//   design — on the pre-fix workflow text the inventory writes
//   release-assets.sha256 INSIDE the asset dir (so the publish upload loop
//   ships it as an extra draft asset and the exact-inventory listing check
//   sees 10 files where the named inventory is 9), and no empty-asset gate
//   exists anywhere, so the fail-closed case exits zero; the workflow fix
//   relocates the manifest beside the body, gates every asset non-empty at
//   the inventory and at the emission point, and flips the gate green.
//   - 2026-11-26 guard-warn-wave: the gate runs on windows-latest — the
//   resolved bash is Git Bash (the release-github-controls precedent) and
//   the two per-test roots cross into the verbatim step text as
//   POSIX-flavored drive paths (C:/...), because bash eats backslash temp
//   paths as escapes in the unquoted find/assignment words (find:
//   'C:Users...': No such file or directory).
// END_CHANGE_SUMMARY

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const releaseWorkflow = parse(readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8'))

const findStepRun = (jobKey, stepName) => {
  const steps = releaseWorkflow.jobs?.[jobKey]?.steps
  if (!Array.isArray(steps)) throw new Error(`release.yml has no step list for job ${jobKey}`)
  const step = steps.find((candidate) => candidate && candidate.name === stepName)
  if (!step || typeof step.run !== 'string' || step.run.trim() === '')
    throw new Error(`release.yml ${jobKey} has no run: text for step "${stepName}"`)
  return step.run
}

const inventoryScript = () => findStepRun('prepare-publication', 'assemble exact asset inventory')
const reconcileScript = () => findStepRun('publish', 'reconcile and verify draft or exact public release')
const sealScript = () => findStepRun('prepare-publication', 'seal publication bundle')

// WINDOWS EXEC PATH (the release-github-controls precedent): the gate
// resolves Git Bash explicitly on Windows so it never lands on a WSL bash
// that cannot address C:/ fixture paths; absent Git Bash, the probe below
// reports the honest skip.
const resolveBash = () =>
  process.platform === 'win32'
    ? resolve(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe')
    : 'bash'
// Backslash temp paths cannot ride verbatim shell text: bash eats them as
// escapes in the unquoted find/assignment words (find: 'C:Users...' — no
// such file), so per-test roots cross into the step as POSIX-flavored
// drive paths (C:/...), valid on Git Bash and POSIX alike.
const posixPath = (value) => value.split(sep).join('/')

// SUBSTITUTION RULE (pinned): the two fixed roots the inventory hardcodes
// become per-test roots. A missing literal fails loudly (markup drift) and
// so does an unexpected one.
const FIXED_ROOTS = ['/tmp/release-stage', '/tmp/release-assets']
const substituteFixedRoots = (script, replacements) => {
  let text = script
  for (const literal of FIXED_ROOTS) {
    const carries = text.includes(literal)
    if (!carries)
      throw new Error(`the step was expected to carry ${literal} but carries none — workflow markup drifted`)
    if (replacements[literal]) text = text.split(literal).join(posixPath(replacements[literal]))
  }
  return text
}

const hostHasBash = (() => {
  const probe = spawnSync(resolveBash(), ['-c', 'true'], { encoding: 'utf8', timeout: 5000 })
  return !probe.error && probe.status === 0
})()
const hostHasSha256sum = (() => {
  const probe = spawnSync('sha256sum', [import.meta.filename ?? '/dev/null'], { encoding: 'utf8' })
  return !probe.error && probe.status !== null
})()
const bashSkipReason =
  'skipped: this host has no working bash — the gate executes the extracted workflow shell with bash -c'
const sha256sumSkipReason =
  'skipped: this host has no sha256sum — the inventory step hashes every asset'

const makeTempRoot = () => mkdtempSync(join(tmpdir(), 'draft-asset-inventory-'))

// A synthetic release-stage tree exactly as prepare-publication's earlier
// steps build it: one artifact dir per platform holding the signed set plus
// the composed latest.json (the fragments were already merged and removed).
const makeStageFixture = (tempRoot, { windows = false, emptyLatest = false } = {}) => {
  const stage = join(tempRoot, 'release-stage')
  const ver = '1.2.3'
  const macDir = join(stage, 'mark-macos-arm64-release')
  mkdirSync(macDir, { recursive: true })
  const files = {
    'Mark_1.2.3_aarch64.dmg': 'synthetic signed dmg bytes',
    'Mark_1.2.3_aarch64.dmg.sha256': 'd'.repeat(64),
    'Mark_1.2.3_aarch64.dmg.bundle': '{"synthetic":"cosign bundle"}',
    'Mark_1.2.3_aarch64.app.tar.gz': 'synthetic updater archive',
    'Mark_1.2.3_sbom-node.cdx.json': '{"sbom":"node"}',
    'Mark_1.2.3_sbom-rust.cdx.json': '{"sbom":"rust"}',
    'NOTICES-node.md': 'node notices',
    'NOTICES-rust.md': 'rust notices',
    'latest.json': emptyLatest
      ? ''
      : JSON.stringify({ version: ver, notes: 'n', pub_date: '2026-11-26T00:00:00Z', platforms: { 'darwin-aarch64': { signature: 'sig', url: 'https://updates.mark.example/pkg/darwin-aarch64/1.2.3' } } }, null, 2)
  }
  for (const [name, content] of Object.entries(files)) writeFileSync(join(macDir, name), content)
  if (windows) {
    const winDir = join(stage, 'mark-windows-x64-release')
    mkdirSync(winDir, { recursive: true })
    for (const [name, content] of Object.entries({
      'Mark_1.2.3_x64-setup.exe': 'synthetic nsis bytes',
      'Mark_1.2.3_x64-setup.exe.sha256': 'e'.repeat(64),
      'Mark_1.2.3_x64-setup.exe.bundle': '{"synthetic":"cosign bundle win"}'
    }))
      writeFileSync(join(winDir, name), content)
  }
  return stage
}

const runInventory = ({ script, tempRoot, stage, assets, windowsRelease }) =>
  spawnSync(resolveBash(), ['--noprofile', '--norc', '-c', script], {
    encoding: 'utf8',
    cwd: tempRoot,
    env: {
      ...process.env,
      TAG: 'v1.2.3',
      // The workflow maps vars.WINDOWS_RELEASE — an unset variable arrives
      // as the empty string, and the step runs under set -u.
      WINDOWS_RELEASE: windowsRelease ? 'true' : '',
      PATH: `${process.env.PATH ?? ''}`
    }
  })

const assetNames = (dir) => readdirSync(dir).sort()

describe('draft asset inventory execution gate (integration f-006)', () => {
  it.skipIf(!hostHasBash || !hostHasSha256sum)(
    'assembles exactly the named inventory with the manifest outside the asset dir',
    { timeout: 60000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const stage = makeStageFixture(tempRoot, { windows: false })
        const assets = join(tempRoot, 'release-assets')
        const script = substituteFixedRoots(inventoryScript(), {
          '/tmp/release-stage': stage,
          '/tmp/release-assets': assets
        })
        const result = runInventory({ script, tempRoot, stage, assets, windowsRelease: false })
        expect(
          result.status,
          `inventory step failed:\nexit=${result.status}\n--- stdout ---\n${result.stdout ?? ''}\n--- stderr ---\n${result.stderr ?? ''}`
        ).toBe(0)

        // The asset dir holds exactly the named inventory — the digest
        // manifest is bookkeeping and must not ride into the draft as an
        // extra asset (pre-fix it sat inside the dir and shipped).
        expect(assetNames(assets)).toEqual([
          'Mark_1.2.3_aarch64.app.tar.gz',
          'Mark_1.2.3_aarch64.dmg',
          'Mark_1.2.3_aarch64.dmg.bundle',
          'Mark_1.2.3_aarch64.dmg.sha256',
          'Mark_1.2.3_sbom-node.cdx.json',
          'Mark_1.2.3_sbom-rust.cdx.json',
          'NOTICES-node.md',
          'NOTICES-rust.md',
          'latest.json'
        ])
        // The manifest exists beside the asset dir and hashes exactly those
        // nine names.
        const manifest = readFileSync(`${assets}.sha256`, 'utf8')
        const manifestNames = manifest
          .trim()
          .split('\n')
          .map((line) => line.split(/\s+/)[1])
          .sort()
        expect(manifestNames).toEqual(assetNames(assets))
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash || !hostHasSha256sum)(
    'carries the windows set only when the repo variable admits it',
    { timeout: 60000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const stage = makeStageFixture(tempRoot, { windows: true })
        const assets = join(tempRoot, 'release-assets')
        const script = substituteFixedRoots(inventoryScript(), {
          '/tmp/release-stage': stage,
          '/tmp/release-assets': assets
        })
        const admitted = runInventory({ script, tempRoot, stage, assets, windowsRelease: true })
        expect(admitted.status, `windows-admitted inventory failed:\n${admitted.stderr ?? ''}`).toBe(0)
        expect(assetNames(assets)).toContain('Mark_1.2.3_x64-setup.exe')

        // Without the variable the windows dir is not part of the workflow's
        // staging (constrain staged platforms removes it upstream) — a stage
        // without it must still assemble cleanly.
        const stageMacOnly = makeStageFixture(join(tempRoot, 'mac-only'), { windows: false })
        const assetsMacOnly = join(tempRoot, 'mac-only-assets')
        const scriptMacOnly = substituteFixedRoots(inventoryScript(), {
          '/tmp/release-stage': stageMacOnly,
          '/tmp/release-assets': assetsMacOnly
        })
        const macOnly = runInventory({ script: scriptMacOnly, tempRoot, stage: stageMacOnly, assets: assetsMacOnly, windowsRelease: false })
        expect(macOnly.status, `mac-only inventory failed:\n${macOnly.stderr ?? ''}`).toBe(0)
        expect(assetNames(assetsMacOnly)).not.toContain('Mark_1.2.3_x64-setup.exe')
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash || !hostHasSha256sum)(
    'fails closed on an empty inventory asset instead of shipping it',
    { timeout: 60000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const stage = makeStageFixture(tempRoot, { windows: false, emptyLatest: true })
        const assets = join(tempRoot, 'release-assets')
        const script = substituteFixedRoots(inventoryScript(), {
          '/tmp/release-stage': stage,
          '/tmp/release-assets': assets
        })
        const result = runInventory({ script, tempRoot, stage, assets, windowsRelease: false })
        expect(
          result.status,
          `the inventory accepted a zero-byte asset (pre-fix it shipped):\nexit=${result.status}\n--- stdout ---\n${result.stdout ?? ''}\n--- stderr ---\n${result.stderr ?? ''}`
        ).not.toBe(0)
        expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain('empty')
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it('pins the emission-point fail-closed gate and the relocated manifest consumption', () => {
    // The publish upload loop must refuse an empty asset before any draft
    // mutation (the emission point the finding names).
    const reconcile = reconcileScript()
    expect(reconcile).toContain('-s "$FILE"')
    expect(reconcile).toContain('BLOCK_RELEASE_EMPTY_ASSET')
    // The manifest is consumed from its relocated place (beside the body),
    // never from inside the asset dir.
    expect(reconcile).toContain('sha256sum -c "${ASSETS}.sha256"')
    expect(reconcile).not.toContain('sha256sum -c release-assets.sha256')
    // The seal hashes the relocated manifest explicitly.
    expect(sealScript()).toContain('release-assets.sha256')
  })
})
