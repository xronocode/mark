// FILE: tools/stats-gateway/deploy-checked.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Bind an owner-executed Worker deploy to a clean current-main commit with successful required checks.
//   SCOPE: Read-only local/remote admission, Wrangler invocation, and an owner-local SHA-to-version receipt.
//   DEPENDS: git, gh, the dedicated locked local Wrangler toolchain, .github/release-governance.json; no credentials stored here.
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
//   runtimeEnvironment - Select explicit runtime environment names.
//   admissionEnvironment - Keep Cloudflare credentials out of Git/GitHub subprocesses.
//   deployPrepared - Validate and run the exact local CLI without an acquisition fallback.
//   main - Check admission, deploy, and write a private deployment receipt.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-11 C-SEC-GATEWAY-TOOLS: locked local tool, explicit credential boundary and fail-closed missing tooling.
//   LAST_CHANGE: v1.0.0 - 2026-11-09 C-CI-CD-AUDIT-FIXES: require exact checked main bytes for owner-run Worker deployments.
// END_CHANGE_SUMMARY

import { appendFileSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const gateway = join(root, 'tools/stats-gateway')
const requiredChecks = JSON.parse(readFileSync(join(root, '.github/release-governance.json'), 'utf8'))
  .strictRequiredChecks.map(({ name }) => name)

const run = (file, args) => execFileSync(file, args, { cwd: root, encoding: 'utf8', env: admissionEnvironment(process.env) }).trim()

// START_BLOCK_PREPARED_DEPLOY
function runtimeEnvironment(env) {
  const names = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'SYSTEMROOT',
    'WINDIR', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL',
    'SSL_CERT_FILE', 'SSL_CERT_DIR']
  return Object.fromEntries(names.filter(name => typeof env[name] === 'string').map(name => [name, env[name]]))
}

export function admissionEnvironment(env) {
  const result = runtimeEnvironment(env)
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR', 'SSH_AUTH_SOCK', 'GIT_SSH_COMMAND']) {
    if (typeof env[name] === 'string') result[name] = env[name]
  }
  return result
}

export function deployPrepared({ gatewayDir = gateway, env = process.env, spawn = spawnSync } = {}) {
  if (!env.CLOUDFLARE_API_TOKEN?.trim() || !env.CLOUDFLARE_ACCOUNT_ID?.trim()) {
    throw new Error('Explicit Cloudflare deployment credentials are required.')
  }
  let entry
  try {
    const manifest = JSON.parse(readFileSync(join(gatewayDir, 'package.json'), 'utf8'))
    const lock = JSON.parse(readFileSync(join(gatewayDir, 'package-lock.json'), 'utf8'))
    const expected = manifest.devDependencies?.wrangler
    if (!/^\d+\.\d+\.\d+$/.test(expected ?? '') ||
      lock.packages?.['']?.devDependencies?.wrangler !== expected ||
      lock.packages?.['node_modules/wrangler']?.version !== expected ||
      !lock.packages?.['node_modules/wrangler']?.integrity) throw new Error('Tool lock mismatch.')
    const pkgRoot = realpathSync(join(gatewayDir, 'node_modules/wrangler'))
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
    if (pkg.version !== expected || typeof pkg.bin?.wrangler !== 'string') throw new Error('Installed tool mismatch.')
    entry = realpathSync(resolve(pkgRoot, pkg.bin.wrangler))
    const within = relative(pkgRoot, entry)
    if (isAbsolute(within) || within === '..' || within.startsWith('../') || within.startsWith('..\\') || !statSync(entry).isFile()) {
      throw new Error('Invalid local tool entry.')
    }
  } catch {
    throw new Error('Prepared Wrangler is missing or mismatched; install the reviewed gateway lockfile without credentials first.')
  }
  const childEnv = { ...runtimeEnvironment(env),
    CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1', CI: 'true' }
  const result = spawn(process.execPath, [entry, 'deploy'], { cwd: gatewayDir, encoding: 'utf8', env: childEnv })
  const redact = value => (value ?? '').replaceAll(env.CLOUDFLARE_API_TOKEN, '[redacted]')
  return { ...result, stdout: redact(result.stdout), stderr: redact(result.stderr) }
}
// END_BLOCK_PREPARED_DEPLOY

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

  const result = deployPrepared()
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
