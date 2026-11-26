// @vitest-environment node
// FILE: tests/tools/cask-branch-recovery.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Execute the release workflow's cask-bump handoff shell against
//   a synthetic Homebrew tap (a throwaway bare origin plus a PATH shim for
//   gh), proving a republish completes end-to-end when a previous run died
//   after pushing the cask branch but before opening its PR (cicd f-009:
//   pre-fix the run hard-failed on "cask branch exists without the exact
//   PR" and `gh run rerun --failed` could never finish the handoff) —
//   instead of trusting workflow text pins alone.
//   SCOPE: The checked-in release.yml parsed with the lockfile yaml package
//   and its publish-cask "open cask bump PR" step located by exact name;
//   two declared substitutions turn the workflow's fixed /tmp/tap and
//   /tmp/release-stage into per-test roots; the gh shim only dispatches the
//   recorded API calls to the fixture; every fixture lives in a per-test
//   temp tree; no network, no GitHub mutation outside the fixture.
//   DEPENDS: Vitest; yaml (lockfile devDependency); node:child_process/fs/os/
//   path/url built-ins; bash and git, skipped with an explicit reason where
//   absent.
//   LINKS: .github/workflows/release.yml publish-cask; C-RELEASE-CASK-SIGNED-DIGEST.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   releaseWorkflowText - release.yml read as text (parsed beside it).
//   releaseWorkflow - checked-in release.yml read as text and parsed with the yaml package.
//   caskSteps - the publish-cask job's step list from the parsed workflow.
//   caskStep - the publish-cask "open cask bump PR" step (its run text is executed verbatim).
//   caskStepRun - the publish-cask "open cask bump PR" step's run text (executed verbatim).
//   FIXED_ROOTS - the declared substitutions: the step's fixed /tmp/tap and /tmp/release-stage become per-test roots, failing loudly on drift.
//   substituteFixedRoots - the two declared substitutions (/tmp/tap, /tmp/release-stage become per-test roots), failing loudly when a step expected to carry them does not and when a step not expected to does.
//   makeTapFixture - one bare tap origin (Casks/mark.rb seeded) plus its clone target; returns { origin, tapDir }.
//   plantOrphanBranch - pushes bump/<cask>-<ver> straight to the bare origin without a PR — the exact orphan a killed run leaves.
//   writeGhShim - the PATH shim that answers the step's gh calls from fixture files and records pr create/merge.
//   runCaskStep - spawns bash -c over the substituted step text with the workflow's env mapping and the shim dir on PATH.
//   sha256File - hex SHA-256 of a fixture file (the step coherence-checks the sidecar against it).
//   repoRoot - repository root resolved from this file's location.
//   hostHasBash - one-time probe gating the shell cases.
//   hostHasGit - one-time probe gating the git fixtures.
//   gitSync - spawnSync git helper that fails the test loudly on a nonzero status.
//   bashSkipReason - explicit reason reported when the shell cases are skipped.
//   gitSkipReason - explicit reason reported when the git fixtures are skipped.
//   makeTempRoot - the per-test temp tree under the OS temp dir; the only directory any test writes to or removes.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-26 cicd f-009: execution gate lands FIRST and red by design —
//   on the pre-fix workflow text the orphan-branch case exits nonzero with
//   "::error::cask branch exists without the exact PR" and `gh pr create` is
//   never recorded; the workflow fix deletes the PR-less bot branch (no PR
//   in any state carries that head — `--state all` already proved it) and
//   falls through to the fresh create, so the idempotent rerun documented in
//   the job comment completes the handoff end-to-end and flips the gate
//   green while the fresh-branch and already-open controls stay pinned.
// END_CHANGE_SUMMARY

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const releaseWorkflowText = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8')
const releaseWorkflow = parse(releaseWorkflowText)

const caskSteps = releaseWorkflow.jobs?.['publish-cask']?.steps
if (!Array.isArray(caskSteps)) throw new Error('release.yml has no publish-cask step list')
const caskStep = caskSteps.find((candidate) => candidate && candidate.name === 'open cask bump PR')
if (!caskStep || typeof caskStep.run !== 'string' || caskStep.run.trim() === '')
  throw new Error('release.yml publish-cask has no "open cask bump PR" run: shell text')
const caskStepRun = () => caskStep.run

// SUBSTITUTION RULE (pinned): the two fixed roots the step hardcodes — its
// tap clone /tmp/tap and its artifact stage /tmp/release-stage — become
// per-test roots. A missing literal fails loudly (markup drift) and so does
// an unexpected one, so drift cannot hide.
const FIXED_ROOTS = [
  { literal: '/tmp/tap', expects: true },
  { literal: '/tmp/release-stage', expects: true }
]
const substituteFixedRoots = (script, replacements) => {
  let text = script
  for (const { literal, expects } of FIXED_ROOTS) {
    const carries = text.includes(literal)
    if (expects && !carries)
      throw new Error(`the step was expected to carry ${literal} but carries none — workflow markup drifted`)
    if (!expects && carries)
      throw new Error(`the step unexpectedly carries ${literal} — extend the declared substitution`)
    if (carries && replacements[literal]) text = text.split(literal).join(replacements[literal])
  }
  return text
}

const hostHasBash = (() => {
  const probe = spawnSync('bash', ['-c', 'true'], { encoding: 'utf8', timeout: 5000 })
  return !probe.error && probe.status === 0
})()
const hostHasGit = (() => {
  const probe = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 5000 })
  return !probe.error && probe.status === 0
})()
const bashSkipReason =
  'skipped: this host has no working bash — the gate executes the extracted workflow shell with bash -c'
const gitSkipReason = 'skipped: this host has no git — the fixtures are real throwaway git repos'

const makeTempRoot = () => mkdtempSync(join(tmpdir(), 'cask-branch-recovery-'))

const gitSync = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed (${result.status}):\n${result.stderr ?? ''}`)
  return result.stdout
}

const sha256File = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

// One bare tap origin with the cask the step mutates, cloned fresh per test.
const makeTapFixture = (tempRoot, version) => {
  const origin = join(tempRoot, 'tap-origin.git')
  const seed = join(tempRoot, 'tap-seed')
  gitSync(['init', '--bare', '--initial-branch', 'main', origin])
  gitSync(['clone', origin, seed])
  gitSync(['config', 'user.email', 'owner@example.com'], seed)
  gitSync(['config', 'user.name', 'owner'], seed)
  mkdirSync(join(seed, 'Casks'), { recursive: true })
  writeFileSync(
    join(seed, 'Casks', 'mark.rb'),
    `cask "mark" do\n  version "${version}"\n  sha256 "0000000000000000000000000000000000000000000000000000000000000000"\n  url "https://example.com/Mark_#{version}_aarch64.dmg"\nend\n`
  )
  gitSync(['add', 'Casks/mark.rb'], seed)
  gitSync(['commit', '-m', 'seed cask'], seed)
  gitSync(['push', 'origin', 'main'], seed)
  return { origin, tapDir: join(tempRoot, 'tap') }
}

// The exact orphan a killed run leaves: the bump branch exists on the tap
// origin while no PR in any state carries that head.
const plantOrphanBranch = (tempRoot, origin, branch) => {
  const work = join(tempRoot, 'orphan-seed')
  gitSync(['clone', origin, work])
  gitSync(['config', 'user.email', 'owner@example.com'], work)
  gitSync(['config', 'user.name', 'owner'], work)
  gitSync(['checkout', '-b', branch], work)
  writeFileSync(join(work, 'orphan.txt'), 'pushed before the PR step died\n')
  gitSync(['add', 'orphan.txt'], work)
  gitSync(['commit', '-m', 'orphan bump'], work)
  gitSync(['push', 'origin', branch], work)
}

// The gh PATH shim: dispatch the step's recorded API calls to fixture files,
// record pr create/merge, never touch the network.
const writeGhShim = (tempRoot, { origin, prListJson, prTitle, prBranch }) => {
  const shimDir = join(tempRoot, 'shims')
  mkdirSync(shimDir, { recursive: true })
  writeFileSync(join(tempRoot, 'pr-list.json'), prListJson)
  writeFileSync(join(tempRoot, 'pr-open.json'), JSON.stringify({
    number: 7,
    title: prTitle,
    headRefName: prBranch,
    baseRefName: 'main',
    state: 'OPEN',
    isDraft: false,
    author: { login: 'app/xronocode-cask-bot' }
  }))
  writeFileSync(
    join(shimDir, 'gh'),
    `#!/bin/sh
# gh shim: answer the cask step's calls from the fixture, record mutations.
LOG="${tempRoot}/gh-calls.log"
case "$1 $2" in
  "auth setup-git")
    exit 0 ;;
  "repo clone")
    git clone "${origin}" "$4" --depth 1 >>"$LOG" 2>&1
    exit $? ;;
  "pr list")
    cat "${tempRoot}/pr-list.json"
    exit 0 ;;
  "pr create")
    echo "pr create $*" >> "$LOG"
    echo "https://github.com/xronocode/homebrew-mark/pull/7"
    exit 0 ;;
  "pr view")
    if printf '%s' "\$*" | grep -q -- '--jq'; then
      echo 7
    else
      cat "${tempRoot}/pr-open.json"
    fi
    exit 0 ;;
  "pr merge")
    echo "pr merge $*" >> "$LOG"
    exit 0 ;;
  *)
    echo "gh shim: unhandled call: $*" >&2
    exit 64 ;;
esac
`
  )
  chmodSync(join(shimDir, 'gh'), 0o755)
  return shimDir
}

const runCaskStep = ({ script, tempRoot, shimDir, tag, releaseStage }) =>
  spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    cwd: tempRoot,
    env: {
      ...process.env,
      GH_TOKEN: 'shim-token',
      TAG: tag,
      PATH: `${shimDir}${delimiter}${process.env.PATH ?? ''}`
    }
  })

describe('cask branch recovery execution gate (cicd f-009)', () => {
  it.skipIf(!hostHasBash || !hostHasGit)(
    'completes the bump when a previous run left the branch without a PR',
    { timeout: 60000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const tapDir = join(tempRoot, 'tap')
        const releaseStage = join(tempRoot, 'release-stage')
        // The step reads the signed set through the artifact's own
        // mark-macos-arm64-release subdirectory (C-RELEASE-CASK-SIGNED-DIGEST).
        const releaseFiles = join(releaseStage, 'mark-macos-arm64-release')
        mkdirSync(releaseFiles, { recursive: true })
        // The signed macOS set the step reads its cask digest from.
        const dmgBytes = Buffer.from('synthetic signed dmg bytes for the cask gate')
        writeFileSync(join(releaseFiles, 'Mark_1.2.3_aarch64.dmg'), dmgBytes)
        writeFileSync(
          join(releaseFiles, 'Mark_1.2.3_aarch64.dmg.sha256'),
          `${sha256File(join(releaseFiles, 'Mark_1.2.3_aarch64.dmg'))}\n`
        )
        const { origin, tapDir: cloneTarget } = makeTapFixture(tempRoot, '1.2.2')
        expect(cloneTarget).toBe(tapDir)
        plantOrphanBranch(tempRoot, origin, 'bump/mark-1.2.3')

        const shimDir = writeGhShim(tempRoot, {
          origin,
          prListJson: '[]',
          prTitle: 'Bump mark to 1.2.3',
          prBranch: 'bump/mark-1.2.3'
        })
        const script = substituteFixedRoots(caskStepRun(), {
          '/tmp/tap': tapDir,
          '/tmp/release-stage': releaseStage
        })
        const result = runCaskStep({ script, tempRoot, shimDir, tag: 'v1.2.3', releaseStage })
        expect(
          result.status,
          `the cask handoff must complete over an orphan branch (pre-fix: "::error::cask branch exists without the exact PR" aborts the rerun):\nexit=${result.status}\n--- stdout ---\n${result.stdout ?? ''}\n--- stderr ---\n${result.stderr ?? ''}`
        ).toBe(0)

        // The handoff finished: the PR was created for the bump branch and
        // the required-check-gated auto-merge was scheduled.
        const log = readFileSync(join(tempRoot, 'gh-calls.log'), 'utf8')
        expect(log).toContain('pr create')
        expect(log).toContain('--head bump/mark-1.2.3')
        expect(log).toContain('pr merge 7')
        // The orphan branch was recovered (replaced by the fresh push), not
        // left behind as a second dead end.
        const heads = gitSync(['ls-remote', '--heads', origin])
        expect(heads).toContain('bump/mark-1.2.3')
        const cask = gitSync(
          ['show', 'bump/mark-1.2.3:Casks/mark.rb'],
          origin
        )
        expect(cask).toContain('version "1.2.3"')
        expect(cask).toContain(sha256File(join(releaseFiles, 'Mark_1.2.3_aarch64.dmg')))
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash || !hostHasGit)(
    'keeps the fresh-branch create path intact (control)',
    { timeout: 60000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const tapDir = join(tempRoot, 'tap')
        const releaseStage = join(tempRoot, 'release-stage')
        // The step reads the signed set through the artifact's own
        // mark-macos-arm64-release subdirectory (C-RELEASE-CASK-SIGNED-DIGEST).
        const releaseFiles = join(releaseStage, 'mark-macos-arm64-release')
        mkdirSync(releaseFiles, { recursive: true })
        writeFileSync(join(releaseFiles, 'Mark_1.2.3_aarch64.dmg'), Buffer.from('synthetic signed dmg bytes'))
        writeFileSync(
          join(releaseFiles, 'Mark_1.2.3_aarch64.dmg.sha256'),
          `${sha256File(join(releaseFiles, 'Mark_1.2.3_aarch64.dmg'))}\n`
        )
        const { origin } = makeTapFixture(tempRoot, '1.2.2')

        const shimDir = writeGhShim(tempRoot, {
          origin,
          prListJson: '[]',
          prTitle: 'Bump mark to 1.2.3',
          prBranch: 'bump/mark-1.2.3'
        })
        const script = substituteFixedRoots(caskStepRun(), {
          '/tmp/tap': tapDir,
          '/tmp/release-stage': releaseStage
        })
        const result = runCaskStep({ script, tempRoot, shimDir, tag: 'v1.2.3', releaseStage })
        expect(
          result.status,
          `the fresh cask handoff must keep working:\nexit=${result.status}\n--- stdout ---\n${result.stdout ?? ''}\n--- stderr ---\n${result.stderr ?? ''}`
        ).toBe(0)
        const log = readFileSync(join(tempRoot, 'gh-calls.log'), 'utf8')
        expect(log).toContain('pr create')
        expect(log).toContain('pr merge 7')
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash || !hostHasGit)(
    'keeps the already-open exact-PR idempotent path intact (control)',
    { timeout: 60000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const tapDir = join(tempRoot, 'tap')
        const releaseStage = join(tempRoot, 'release-stage')
        // The step reads the signed set through the artifact's own
        // mark-macos-arm64-release subdirectory (C-RELEASE-CASK-SIGNED-DIGEST).
        const releaseFiles = join(releaseStage, 'mark-macos-arm64-release')
        mkdirSync(releaseFiles, { recursive: true })
        writeFileSync(join(releaseFiles, 'Mark_1.2.3_aarch64.dmg'), Buffer.from('synthetic signed dmg bytes'))
        writeFileSync(
          join(releaseFiles, 'Mark_1.2.3_aarch64.dmg.sha256'),
          `${sha256File(join(releaseFiles, 'Mark_1.2.3_aarch64.dmg'))}\n`
        )
        const { origin } = makeTapFixture(tempRoot, '1.2.2')

        const shimDir = writeGhShim(tempRoot, {
          origin,
          prListJson: JSON.stringify([
            {
              number: 7,
              title: 'Bump mark to 1.2.3',
              headRefName: 'bump/mark-1.2.3',
              baseRefName: 'main',
              state: 'OPEN',
              isDraft: false,
              author: { login: 'app/xronocode-cask-bot' }
            }
          ]),
          prTitle: 'Bump mark to 1.2.3',
          prBranch: 'bump/mark-1.2.3'
        })
        const script = substituteFixedRoots(caskStepRun(), {
          '/tmp/tap': tapDir,
          '/tmp/release-stage': releaseStage
        })
        const result = runCaskStep({ script, tempRoot, shimDir, tag: 'v1.2.3', releaseStage })
        expect(
          result.status,
          `the idempotent already-open path must keep working:\nexit=${result.status}\n--- stdout ---\n${result.stdout ?? ''}\n--- stderr ---\n${result.stderr ?? ''}`
        ).toBe(0)
        const log = readFileSync(join(tempRoot, 'gh-calls.log'), 'utf8')
        expect(log).not.toContain('pr create')
        expect(log).toContain('pr merge 7')
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )
})
