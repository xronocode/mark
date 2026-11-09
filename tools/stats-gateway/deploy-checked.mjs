// FILE: tools/stats-gateway/deploy-checked.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Bind an owner-executed Worker deploy to a clean current-main commit with successful required checks.
//   SCOPE: Read-only local/remote admission, Wrangler invocation, and an owner-local SHA-to-version receipt.
//   DEPENDS: git, gh, npx wrangler 4.159.0, .github/release-governance.json; no production credentials stored here.
//   LINKS: .grace/graph/features.xml M-071; .grace/verification/features.xml V-M-071.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   root - Resolve the repository root from this script's stable path.
//   gateway - Resolve the Wrangler project directory.
//   requiredChecks - Names of the source-controlled strict main checks.
//   run - Execute one external command and return its stdout.
//   assessCandidate - Reject a dirty, stale, or unchecked candidate.
//   main - Check admission, deploy, and write a private deployment receipt.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-09 C-CI-CD-AUDIT-FIXES: require exact checked main bytes for owner-run Worker deployments.
// END_CHANGE_SUMMARY

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const gateway = join(root, 'tools/stats-gateway')
const requiredChecks = JSON.parse(readFileSync(join(root, '.github/release-governance.json'), 'utf8'))
  .strictRequiredChecks.map(({ name }) => name)

const run = (file, args) => execFileSync(file, args, { cwd: root, encoding: 'utf8' }).trim()

// START_CONTRACT: assessCandidate
//   PURPOSE: Fail closed unless the exact clean local commit is current main and all required GitHub Actions checks succeeded.
// END_CONTRACT: assessCandidate
export function assessCandidate({ head, main, dirty, checks, required = requiredChecks }) {
  if (dirty) throw new Error('Working tree is not clean; commit or remove local changes before deployment.')
  if (head !== main) throw new Error('HEAD is not the current remote main commit.')
  for (const name of required) {
    const matches = checks.filter((check) => check.name === name && check.app?.slug === 'github-actions')
    if (matches.length === 0 || matches.some((check) => check.conclusion !== 'success')) {
      throw new Error(`Required check is not successful for ${head}: ${name}`)
    }
  }
}

// START_CONTRACT: main
//   PURPOSE: Verify exact bytes, deploy from this repository, and preserve the resulting Worker version privately.
// END_CONTRACT: main
function main() {
  const checkOnly = process.argv.slice(2).join(' ') === '--check-only'
  if (process.argv.length > 2 && !checkOnly) throw new Error('Usage: node tools/stats-gateway/deploy-checked.mjs [--check-only]')

  const head = run('git', ['rev-parse', 'HEAD'])
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=all']) !== ''
  const remote = run('git', ['ls-remote', '--exit-code', 'fork', 'refs/heads/main'])
  const mainSha = remote.split(/\s+/)[0]
  const response = JSON.parse(run('gh', ['api', `repos/xronocode/mark/commits/${head}/check-runs?filter=latest&per_page=100`]))
  if (response.total_count > response.check_runs.length) throw new Error('Check-run response is incomplete.')
  assessCandidate({ head, main: mainSha, dirty, checks: response.check_runs })
  const mainBeforeDeploy = run('git', ['ls-remote', '--exit-code', 'fork', 'refs/heads/main']).split(/\s+/)[0]
  assessCandidate({
    head: run('git', ['rev-parse', 'HEAD']),
    main: mainBeforeDeploy,
    dirty: run('git', ['status', '--porcelain', '--untracked-files=all']) !== '',
    checks: response.check_runs
  })
  process.stdout.write(`Verified gateway deploy candidate: ${head}\n`)
  if (checkOnly) return

  const result = spawnSync('npx', ['--yes', 'wrangler@4.159.0', 'deploy'], { cwd: gateway, encoding: 'utf8' })
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Wrangler deploy failed with status ${result.status}.`)
  if (run('git', ['rev-parse', 'HEAD']) !== head || run('git', ['status', '--porcelain', '--untracked-files=all']) !== '') {
    throw new Error('Working tree changed during deployment; inspect the Worker version before recording its source SHA.')
  }

  const version = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.match(/Current Version ID:\s*([A-Za-z0-9-]+)/i)?.[1]
  if (!version) throw new Error('Worker deploy returned no version ID; record the deployed version manually before another deploy.')
  const receipt = join(homedir(), '.local/state/mark/stats-gateway-deployments.jsonl')
  mkdirSync(dirname(receipt), { recursive: true, mode: 0o700 })
  appendFileSync(receipt, `${JSON.stringify({ deployedAt: new Date().toISOString(), sha: head, workerVersion: version })}\n`, { mode: 0o600 })
  process.stdout.write(`Recorded Worker version ${version} for ${head} in ${receipt}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
