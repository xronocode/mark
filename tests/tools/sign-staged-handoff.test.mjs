// @vitest-environment node
// FILE: tests/tools/sign-staged-handoff.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Execute the release workflow's staged-handoff shells — both digest verify loops, the Windows stage step and the macOS repackage step — against synthetic staged sets, proving the handoff collision-free and fully receipted instead of trusting text pins alone.
//   SCOPE: The checked-in release.yml parsed with the lockfile yaml package and its steps located by exact name; every file lives in a per-test temp tree; exactly one declared substitution turns the workflow's hardcoded /tmp/release into that per-test root; PATH shims keep signing inert; no network, no real signing, no fixed shared path is ever created, written or removed.
//   DEPENDS: Vitest; yaml (lockfile devDependency); node:child_process/fs/os/path/crypto/url built-ins; bash and (for the repackage case only) a real hdiutil — skipped with an explicit reason where absent.
//   LINKS: .grace/verification/features.xml V-M-046; C-RELEASE-SIGN-STAGED-SET.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   releaseWorkflow - checked-in release.yml read as text and parsed with the yaml package.
//   findStepRun - extracts a step's run: shell text from jobs.build / jobs.sign by exact step name.
//   substituteReleaseRoot - the ONE declared substitution: the literal /tmp/release becomes the per-test release root, failing loudly when a step expected to carry it does not (and when one unexpectedly does).
//   runScript - spawns bash -c over the extracted script text with the workflow's env mapping and an optional PATH shim dir.
//   prepareShims - node-based shasum where the host lacks it; for the repackage case only, xcrun/codesign/spctl stubs that log argv and exit zero (nothing real is signed, notarized or assessed; hdiutil is never shimmed).
//   repoRoot - repository root resolved from this file's location, so the workflow is read independently of the working directory.
//   RELEASE_ROOT_LITERAL - the one fixed path the executed workflow steps hardcode (/tmp/release); the only text the substitution may replace.
//   macVerifyScript - extracted run: shell of the macOS digest-verify step of the sign job.
//   windowsVerifyScript - extracted run: shell of the Windows digest-verify step of the sign job.
//   windowsStageScript - extracted run: shell of the build job's Windows stage step.
//   windowsStagedUploadPath - raw with.path of the Windows staged upload step, read from the parsed YAML.
//   repackageScript - extracted run: shell of the macOS repackage-and-notarize step.
//   hostHasBash - one-time probe: whether bash can be spawned (the shell cases depend on it).
//   hostHasShasum - one-time probe: whether the host has shasum, deciding whether the shim is prepended to PATH.
//   hostHasRealHdiutil - one-time probe: whether a real hdiutil answers, gating the disk-image case.
//   bashSkipReason - explicit reason reported when the shell cases are skipped because bash is absent.
//   hdiutilSkipReason - explicit reason reported when the disk-image case is skipped because hdiutil is absent.
//   describeOutput - exit status plus stdout and stderr of a spawned step, for assertion messages.
//   sha256Hex - hex SHA-256 of a byte buffer (fixtures and shim source).
//   shasumShimSource - source of the node-based shasum PATH shim used where the host lacks shasum.
//   signingShimSource - source of the xcrun/codesign/spctl PATH stubs that only log their argv and exit zero.
//   stagedFilesForUpload - which files the Windows upload step would carry: every file for a wildcard, only the named files for a list.
//   mirrorUpload - copies exactly the files stagedFilesForUpload selects into the per-test staged dir, modelling the artifact handoff.
//   makeTempRoot - creates the per-test temp tree under the OS temp dir; the only directory any test writes to or removes.
//   writeWithReceipt - staged fixture file plus its SHA-256 receipt sidecar.
//   detachQuietly - best-effort hdiutil detach before the finally-block removal of the per-test tree.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-22 C-RELEASE-SIGN-STAGED-SET: execution gate lands FIRST and red by design — on the pre-fix workflow text the stage-then-verify case exits nonzero because latest-platform.json is staged without a receipt, and the repackage case exits nonzero because hdiutil convert refuses the destination the verify step's copy already occupies; the workflow fix flips both green while the pass, missing-receipt and tamper controls stay pinned on both platforms.
// END_CHANGE_SUMMARY

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const releaseWorkflow = parse(readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8'))

// Step lookup by EXACT name; the extracted run: text is executed verbatim —
// the gate never hardcodes a copy of the workflow's shell.
const findStepRun = (jobKey, stepName) => {
  const steps = releaseWorkflow.jobs?.[jobKey]?.steps
  if (!Array.isArray(steps)) throw new Error(`release.yml has no step list for job ${jobKey}`)
  const step = steps.find((candidate) => candidate && candidate.name === stepName)
  if (!step) throw new Error(`release.yml job ${jobKey} has no step named "${stepName}"`)
  if (typeof step.run !== 'string' || step.run.trim() === '')
    throw new Error(`release.yml step "${stepName}" carries no run: shell text`)
  return step.run
}

const macVerifyScript = () => findStepRun('sign', 'verify staged artifact digests')
const windowsVerifyScript = () => findStepRun('sign', 'verify staged artifact digests (windows)')
const windowsStageScript = () => findStepRun('build', 'stage release artifacts (windows)')
const repackageScript = () => findStepRun('sign', 'repackage and notarize the staged DMG')
const windowsStagedUploadPath = () => {
  const steps = releaseWorkflow.jobs?.build?.steps
  const step = steps?.find((candidate) => candidate && candidate.name === 'upload staged unsigned artifacts (windows)')
  if (!step || typeof step.with?.path !== 'string')
    throw new Error('release.yml step "upload staged unsigned artifacts (windows)" declares no path')
  return step.with.path
}

// SUBSTITUTION RULE (pinned): exactly ONE declared substitution is applied to
// extracted script text — the literal /tmp/release becomes the per-test
// release root — so the verify cp and the repackage destination share the
// root exactly as they share /tmp/release in the workflow, and no fixed
// shared path is ever touched. A step expected to carry the literal fails
// loudly when the substitution finds nothing, and a step not expected to
// carry it fails loudly when it appears, so drift cannot hide.
const RELEASE_ROOT_LITERAL = '/tmp/release'
const substituteReleaseRoot = (script, releaseRoot, { expectsLiteral }) => {
  const carries = script.includes(RELEASE_ROOT_LITERAL)
  if (expectsLiteral && !carries)
    throw new Error(
      `the extracted script was expected to carry the literal ${RELEASE_ROOT_LITERAL} but carries none — workflow markup drifted; refusing to substitute`
    )
  if (!expectsLiteral && carries)
    throw new Error(
      `a step not expected to carry the literal ${RELEASE_ROOT_LITERAL} now does — refusing to substitute; map it through its env or extend the declared substitution`
    )
  return carries ? script.split(RELEASE_ROOT_LITERAL).join(releaseRoot) : script
}

// Execution: bash -c over the (substituted) script text verbatim, under an
// env providing what the workflow provides (RUNNER_TEMP/STAGE/RELEASE_DIR/
// TAG plus the APPLE_* names the repackage step references under set -u).
const runScript = ({ script, releaseRoot = null, expectsLiteral = false, env = {}, shimDir = null, cwd = null }) => {
  const text =
    releaseRoot === null ? script : substituteReleaseRoot(script, releaseRoot, { expectsLiteral })
  const childEnv = { ...process.env }
  if (shimDir) childEnv.PATH = `${shimDir}${delimiter}${childEnv.PATH ?? ''}`
  Object.assign(childEnv, env)
  return spawnSync('bash', ['-c', text], { env: childEnv, cwd: cwd ?? undefined, encoding: 'utf8' })
}

const describeOutput = (result) =>
  `exit=${result.status}\n--- stdout ---\n${result.stdout ?? ''}\n--- stderr ---\n${result.stderr ?? ''}`

// Tool availability probes (pure PATH checks / a single quiet probe; no
// signing-adjacent tool is ever executed for real).
const hostHasBash = (() => {
  const probe = spawnSync('bash', ['-c', 'true'], { encoding: 'utf8', timeout: 5000 })
  return !probe.error && probe.status === 0
})()
const hostHasShasum = (() => {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    try {
      if (statSync(join(dir, 'shasum')).isFile()) return true
    } catch {}
  }
  return false
})()
const hostHasRealHdiutil = (() => {
  const probe = spawnSync('hdiutil', ['info', '-quiet'], { encoding: 'utf8', timeout: 15000 })
  return !probe.error && probe.status === 0
})()

// Skip reasons live here because vitest 5.x skipIf carries no note parameter.
const bashSkipReason =
  'skipped: this host has no working bash — the gate executes the extracted workflow shells with bash -c'
const hdiutilSkipReason =
  'skipped: this host has no real hdiutil — the repackage case runs only where hdiutil can create, attach and convert a real disk image (bash must be present too)'

const shasumShimSource = `#!/usr/bin/env node
// PATH shim for hosts without shasum: the -a 256 FILE form the receipt loops
// use, printing "<hex>  <file>" like shasum so awk '{print $1}' reads the hex.
const args = process.argv.slice(2)
const algoIndex = args.indexOf('-a')
const algo = algoIndex === -1 ? 'sha1' : args[algoIndex + 1]
const files = args.filter((arg, index) => index !== algoIndex && index !== algoIndex + 1)
const { createHash } = require('crypto')
const { readFileSync } = require('fs')
for (const file of files) {
  const hex = createHash(algo === '256' ? 'sha256' : algo).update(readFileSync(file)).digest('hex')
  process.stdout.write(hex + '  ' + file + '\\n')
}
`
const signingShimSource = (tool, logFile) => `#!/bin/sh
# PATH shim: nothing may really sign, notarize or assess on this host —
# record the argv and exit zero.
printf '%s\\n' "${tool} $*" >> "${logFile}"
exit 0
`

const prepareShims = (tempRoot, { signingTools = false, logFile = null } = {}) => {
  const shimDir = join(tempRoot, 'shims')
  mkdirSync(shimDir, { recursive: true })
  if (!hostHasShasum) {
    const shim = join(shimDir, 'shasum')
    writeFileSync(shim, shasumShimSource)
    chmodSync(shim, 0o755)
  }
  if (signingTools) {
    for (const tool of ['xcrun', 'codesign', 'spctl']) {
      const shim = join(shimDir, tool)
      writeFileSync(shim, signingShimSource(tool, logFile))
      chmodSync(shim, 0o755)
    }
  }
  return shimDir
}

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex')
const writeWithReceipt = (dir, name, bytes) => {
  writeFileSync(join(dir, name), bytes)
  writeFileSync(join(dir, `${name}.sha256`), `${sha256Hex(bytes)}  ${name}\n`)
}

// Model the artifact handoff faithfully from the WORKFLOW's own upload step:
// the with.path value read from the parsed YAML decides what travels — a
// wildcard carries every file in the staged dir, a list carries only the
// named files. Which files travel is never hardcoded here; that is exactly
// what makes the stage-then-verify case red before the fix and green after.
const stagedFilesForUpload = (runnerTemp, releaseDir, uploadPathRaw) => {
  const patterns = (Array.isArray(uploadPathRaw) ? uploadPathRaw : String(uploadPathRaw).split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
  const carried = []
  for (const file of readdirSync(releaseDir).sort()) {
    const travels = patterns.some((pattern) => {
      const normalized = pattern.split('${{ runner.temp }}').join(runnerTemp).replace(/\\/g, '/')
      if (normalized === '*' || normalized.endsWith('/*')) return true
      const regex = new RegExp(
        `^${normalized.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
      )
      return regex.test(`${releaseDir}/${file}`) || regex.test(file)
    })
    if (travels) carried.push(file)
  }
  return carried
}
const mirrorUpload = (runnerTemp, releaseDir, stagedDir, uploadPathRaw) => {
  mkdirSync(stagedDir, { recursive: true })
  for (const file of stagedFilesForUpload(runnerTemp, releaseDir, uploadPathRaw))
    copyFileSync(join(releaseDir, file), join(stagedDir, file))
  return stagedFilesForUpload(runnerTemp, releaseDir, uploadPathRaw)
}

const makeTempRoot = () => mkdtempSync(join(tmpdir(), 'sign-staged-handoff-'))
const detachQuietly = (mountPoint) => {
  if (!hostHasRealHdiutil || !existsSync(mountPoint)) return
  spawnSync('hdiutil', ['detach', mountPoint], { encoding: 'utf8', timeout: 30000 })
  spawnSync('hdiutil', ['detach', '-force', mountPoint], { encoding: 'utf8', timeout: 30000 })
}

describe('sign staged handoff execution gate (C-RELEASE-SIGN-STAGED-SET)', () => {
  it('extracts the sign-handoff steps from the checked-in release workflow', () => {
    for (const [jobKey, stepName] of [
      ['sign', 'verify staged artifact digests'],
      ['sign', 'verify staged artifact digests (windows)'],
      ['build', 'stage release artifacts (windows)'],
      ['sign', 'repackage and notarize the staged DMG']
    ]) {
      const script = findStepRun(jobKey, stepName)
      expect(script.trim().length, `step "${stepName}" carries no run: text`).toBeGreaterThan(0)
    }
    // The macOS-lane steps carry the one substituted literal; fail fast here
    // on markup drift instead of masking it during execution.
    expect(macVerifyScript()).toContain(RELEASE_ROOT_LITERAL)
    expect(repackageScript()).toContain(RELEASE_ROOT_LITERAL)
  })

  it.skipIf(!hostHasBash)(
    'stages a receipt for every Windows staged file and passes the digest verification',
    () => {
      const tempRoot = makeTempRoot()
      try {
        // Build side: a staged dir holding the exe and the feed fragment.
        const releaseDir = join(tempRoot, 'release')
        mkdirSync(releaseDir, { recursive: true })
        const exeBytes = Buffer.from('synthetic NSIS setup exe bytes for the gate')
        writeFileSync(join(releaseDir, 'Mark_1.2.3_x64-setup.exe'), exeBytes)
        writeFileSync(
          join(releaseDir, 'latest-platform.json'),
          `${JSON.stringify(
            {
              platforms: {
                'windows-x86_64': {
                  signature: 'synthetic updater signature',
                  url: 'https://updates.mark.example/pkg/windows-x86_64/1.2.3'
                }
              }
            },
            null,
            2
          )}\n`
        )

        // The extracted stage step runs over RUNNER_TEMP=tempRoot; the
        // pre-placed exe means the relative find target fallback never runs.
        const stageResult = runScript({
          script: windowsStageScript(),
          env: { RUNNER_TEMP: tempRoot, TAG: 'v1.2.3' },
          cwd: tempRoot
        })
        expect(
          stageResult.status,
          `windows stage step failed:\n${describeOutput(stageResult)}`
        ).toBe(0)

        // Artifact handoff, modeled from the workflow's own upload step.
        const carried = mirrorUpload(tempRoot, releaseDir, join(tempRoot, 'staged'), windowsStagedUploadPath())
        expect(carried, 'the upload must carry the staged exe').toContain('Mark_1.2.3_x64-setup.exe')
        expect(carried, 'the upload must carry the feed fragment').toContain('latest-platform.json')

        // Sign side: the extracted Windows verify loop must accept the set.
        const verifyResult = runScript({
          script: windowsVerifyScript(),
          env: { STAGE: join(tempRoot, 'staged'), RELEASE_DIR: join(tempRoot, 'sign-release') }
        })
        expect(
          verifyResult.status,
          `windows digest verification over the staged set failed (an unreceipted staged file means the stage step or the upload list is broken):\n${describeOutput(verifyResult)}`
        ).toBe(0)
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash)(
    'refuses a staged file without a receipt on both platforms',
    () => {
      const tempRoot = makeTempRoot()
      try {
        const staged = join(tempRoot, 'staged')
        mkdirSync(staged, { recursive: true })
        writeFileSync(join(staged, 'Mark_1.2.3_aarch64.dmg'), Buffer.from('synthetic staged dmg bytes'))
        writeFileSync(join(staged, 'latest-platform.json'), Buffer.from('synthetic feed fragment'))
        // Its dmg receipt is present, so the unreceipted file is the json.
        writeWithReceipt(staged, 'Mark_1.2.3_aarch64.dmg', Buffer.from('synthetic staged dmg bytes'))

        const macResult = runScript({
          script: macVerifyScript(),
          releaseRoot: join(tempRoot, 'release-root'),
          expectsLiteral: true,
          env: { STAGE: staged }
        })
        expect(macResult.status, `macOS verify accepted an unreceipted staged file:\n${describeOutput(macResult)}`).not.toBe(0)
        expect(`${macResult.stdout ?? ''}${macResult.stderr ?? ''}`).toContain('BLOCK_SIGN_DIGEST_MISMATCH')

        const winResult = runScript({
          script: windowsVerifyScript(),
          env: { STAGE: staged, RELEASE_DIR: join(tempRoot, 'win-release') }
        })
        expect(winResult.status, `Windows verify accepted an unreceipted staged file:\n${describeOutput(winResult)}`).not.toBe(0)
        expect(`${winResult.stdout ?? ''}${winResult.stderr ?? ''}`).toContain('BLOCK_SIGN_DIGEST_MISMATCH')

        // Control: the hand-receipted set exits zero on both platforms.
        const control = join(tempRoot, 'staged-control')
        mkdirSync(control, { recursive: true })
        writeWithReceipt(control, 'Mark_1.2.3_aarch64.dmg', Buffer.from('synthetic staged dmg bytes'))
        writeWithReceipt(control, 'latest-platform.json', Buffer.from('synthetic feed fragment'))

        const macControl = runScript({
          script: macVerifyScript(),
          releaseRoot: join(tempRoot, 'release-root-control'),
          expectsLiteral: true,
          env: { STAGE: control }
        })
        expect(macControl.status, `macOS verify refused a fully receipted set:\n${describeOutput(macControl)}`).toBe(0)
        const winControl = runScript({
          script: windowsVerifyScript(),
          env: { STAGE: control, RELEASE_DIR: join(tempRoot, 'win-release-control') }
        })
        expect(winControl.status, `Windows verify refused a fully receipted set:\n${describeOutput(winControl)}`).toBe(0)
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash)('refuses tampered staged bytes on both platforms', () => {
    const tempRoot = makeTempRoot()
    try {
      const staged = join(tempRoot, 'staged')
      mkdirSync(staged, { recursive: true })
      // Receipt the bytes, then flip one byte: the receipt no longer matches.
      writeWithReceipt(staged, 'Mark_1.2.3_aarch64.dmg', Buffer.from('synthetic staged dmg bytes'))
      writeFileSync(join(staged, 'Mark_1.2.3_aarch64.dmg'), Buffer.from('synthetic staged dmg byteX'))

      const macResult = runScript({
        script: macVerifyScript(),
        releaseRoot: join(tempRoot, 'release-root'),
        expectsLiteral: true,
        env: { STAGE: staged }
      })
      expect(macResult.status, `macOS verify accepted tampered staged bytes:\n${describeOutput(macResult)}`).not.toBe(0)
      expect(`${macResult.stdout ?? ''}${macResult.stderr ?? ''}`).toContain('BLOCK_SIGN_DIGEST_MISMATCH')

      const winResult = runScript({
        script: windowsVerifyScript(),
        env: { STAGE: staged, RELEASE_DIR: join(tempRoot, 'win-release') }
      })
      expect(winResult.status, `Windows verify accepted tampered staged bytes:\n${describeOutput(winResult)}`).not.toBe(0)
      expect(`${winResult.stdout ?? ''}${winResult.stderr ?? ''}`).toContain('BLOCK_SIGN_DIGEST_MISMATCH')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  // Gated by vitest skipIf on real hdiutil availability — see
  // hdiutilSkipReason above for the explicit skip reason (runs on the
  // macos-15 lane; skipped on ubuntu/windows where hdiutil is absent).
  // hdiutil imaging arbitration can take several seconds per invocation,
  // so the case carries its own timeout.
  it.skipIf(!hostHasRealHdiutil || !hostHasBash)(
    'replaces the staged DMG instead of converting onto the occupied destination',
    () => {
      const tempRoot = makeTempRoot()
      const mount = join(tempRoot, 'staged-mount')
      try {
        // The staged set the verify step will copy into the shared root.
        const staged = join(tempRoot, 'staged')
        mkdirSync(staged, { recursive: true })
        const stagedDmgBytes = Buffer.from('synthetic unsigned staged dmg bytes')
        writeWithReceipt(staged, 'Mark_1.2.3_aarch64.dmg', stagedDmgBytes)
        writeWithReceipt(staged, 'latest-platform.json', Buffer.from('synthetic feed fragment'))

        // APP_WORK under RUNNER_TEMP per the workflow's work-dir discipline;
        // a tiny REAL read/write image stands in for the re-sign step's
        // staged-rw.dmg, and a minimal Mark.app sits in the work dir.
        const appWork = join(tempRoot, 'sign-work')
        mkdirSync(appWork, { recursive: true })
        const rwDmg = join(appWork, 'staged-rw.dmg')
        const create = spawnSync(
          'hdiutil',
          ['create', '-size', '1m', '-fs', 'HFS+', '-volname', 'MarkStaged', '-ov', rwDmg],
          { encoding: 'utf8', timeout: 60000 }
        )
        expect(create.status, `hdiutil create failed:\n${describeOutput(create)}`).toBe(0)
        mkdirSync(join(appWork, 'Mark.app', 'Contents', 'MacOS'), { recursive: true })
        writeFileSync(
          join(appWork, 'Mark.app', 'Contents', 'Info.plist'),
          '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict/></plist>\n'
        )
        writeFileSync(join(appWork, 'Mark.app', 'Contents', 'MacOS', 'Mark'), '#!/bin/sh\nexit 0\n')
        chmodSync(join(appWork, 'Mark.app', 'Contents', 'MacOS', 'Mark'), 0o755)
        mkdirSync(mount, { recursive: true })

        // PATH shims: xcrun/codesign/spctl record argv and exit zero — nothing
        // real is signed, notarized or assessed; hdiutil is never shimmed.
        const logFile = join(tempRoot, 'signing-shims.log')
        const shimDir = prepareShims(tempRoot, { signingTools: true, logFile })
        // The single declared substitution: the workflow's /tmp/release (the
        // verify copy root AND the repackage destination root) becomes this
        // per-test directory so the destination is occupied exactly as in the
        // real job.
        const releaseRoot = join(tempRoot, 'release')

        // The macOS verify step runs FIRST under the SAME substituted root.
        const verifyResult = runScript({
          script: macVerifyScript(),
          releaseRoot,
          expectsLiteral: true,
          env: { STAGE: staged },
          shimDir
        })
        expect(
          verifyResult.status,
          `macOS verify over the staged set failed before the repackage step:\n${describeOutput(verifyResult)}`
        ).toBe(0)
        const dmgDst = join(releaseRoot, 'Mark_1.2.3_aarch64.dmg')
        expect(
          existsSync(dmgDst),
          'the staged unsigned DMG must occupy the substituted destination after the verify step'
        ).toBe(true)

        // The extracted repackage step runs with TAG=v1.2.3; the APPLE_* names
        // are provided (empty) because the step runs under set -u.
        const repackageResult = runScript({
          script: repackageScript(),
          releaseRoot,
          expectsLiteral: true,
          env: { RUNNER_TEMP: tempRoot, TAG: 'v1.2.3', APPLE_ID: '', APPLE_PASSWORD: '', APPLE_TEAM_ID: '' },
          shimDir,
          cwd: tempRoot
        })
        expect(
          repackageResult.status,
          `repackage step failed (pre-fix, hdiutil convert refuses the destination the verify step's copy already occupies):\n${describeOutput(repackageResult)}`
        ).toBe(0)

        // The destination now holds the freshly converted image, and the shim
        // log shows notarytool submit and stapler staple on the replaced path.
        expect(readFileSync(dmgDst)).not.toEqual(stagedDmgBytes)
        const log = readFileSync(logFile, 'utf8')
        expect(log).toContain(`notarytool submit ${dmgDst}`)
        expect(log).toContain(`stapler staple ${dmgDst}`)
      } finally {
        detachQuietly(mount)
        rmSync(tempRoot, { recursive: true, force: true })
      }
    },
    120000
  )

})
