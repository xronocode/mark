// FILE: tests/tools/stats-gateway-deploy.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove Worker deployment admission rejects dirty, stale, and unchecked candidates.
//   SCOPE: Pure admission tests; never invokes Wrangler or production credentials.
//   DEPENDS: Vitest and tools/stats-gateway/deploy-checked.mjs.
//   LINKS: .grace/verification/features.xml V-M-071.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   preparedFixture - Create and clean an inert locked local CLI fixture.
//   checks - Successful required-check fixtures for one exact candidate.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-09 C-CI-CD-AUDIT-FIXES: guard manual Worker deploy admission.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import { assessCandidate, admissionEnvironment, deployPrepared } from '../../tools/stats-gateway/deploy-checked.mjs'

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const checks = ['status check', 'release/governance', 'release/readiness'].map((name) => ({
  name, conclusion: 'success', app: { slug: 'github-actions' }
}))

describe('gateway deploy candidate admission', () => {
  it('accepts a clean exact main commit with all required successful checks', () => {
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: false, checks })).not.toThrow()
  })

  it('rejects local modifications and untracked files', () => {
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: true, checks })).toThrow('not clean')
  })

  it('rejects a commit other than current remote main', () => {
    expect(() => assessCandidate({ head: 'abc', main: 'def', dirty: false, checks })).toThrow('not the current')
  })

  it.each(['status check', 'release/governance', 'release/readiness'])('rejects failed or missing %s', (name) => {
    const failed = checks.map((check) => check.name === name ? { ...check, conclusion: 'failure' } : check)
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: false, checks: failed })).toThrow(name)
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: false, checks: checks.filter((check) => check.name !== name) })).toThrow(name)
  })

  it('rejects a check from an unexpected app', () => {
    const wrongApp = checks.map((check) => check.name === 'status check' ? { ...check, app: { slug: 'untrusted-app' } } : check)
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: false, checks: wrongApp })).toThrow('status check')
  })
})

// START_BLOCK_PREPARED_DEPLOY_TESTS
function preparedFixture(runTest) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mark-deploy-fixture-')))
  const pkg = join(dir, 'node_modules/wrangler')
  mkdirSync(join(pkg, 'bin'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { wrangler: '4.159.0' } }))
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages: { '': { devDependencies: { wrangler: '4.159.0' } }, 'node_modules/wrangler': { version: '4.159.0', integrity: 'sha512-dummy-fixture' } } }))
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version: '4.159.0', bin: { wrangler: 'bin/wrangler.js' } }))
  writeFileSync(join(pkg, 'bin/wrangler.js'), '// Inert CLI fixture; never executed.')
  try { runTest(dir, pkg) } finally { rmSync(dir, { recursive: true, force: true }) }
}

describe('prepared gateway tool and credential boundary', () => {
  const dummy = { PATH: '/usr/bin:/bin', HOME: '/dummy-home', CLOUDFLARE_API_TOKEN: 'dummy-cloudflare-token', CLOUDFLARE_ACCOUNT_ID: 'dummy-account', GH_TOKEN: 'dummy-github-token', NODE_OPTIONS: '--import=untrusted.mjs' }

  it('passes no Cloudflare credentials or Node injection options to admission subprocesses', () => {
    const env = admissionEnvironment(dummy)
    expect(env.GH_TOKEN).toBe('dummy-github-token')
    expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined()
    expect(env.CLOUDFLARE_ACCOUNT_ID).toBeUndefined()
    expect(env.NODE_OPTIONS).toBeUndefined()
  })

  it('runs only the exact prepared entry and passes deployment credentials only to that process', () => preparedFixture((dir) => {
    const spawn = vi.fn(() => ({ status: 0, stdout: 'Current Version ID: fixture-version', stderr: '' }))
    deployPrepared({ gatewayDir: dir, env: dummy, spawn })
    expect(spawn).toHaveBeenCalledOnce()
    const [binary, args, options] = spawn.mock.calls[0]
    expect(binary).toBe(process.execPath)
    expect(args).toEqual([join(dir, 'node_modules/wrangler/bin/wrangler.js'), 'deploy'])
    expect(options.cwd).toBe(dir)
    expect(options.env.CLOUDFLARE_API_TOKEN).toBe(dummy.CLOUDFLARE_API_TOKEN)
    expect(options.env.CLOUDFLARE_ACCOUNT_ID).toBe(dummy.CLOUDFLARE_ACCOUNT_ID)
    expect(options.env.GH_TOKEN).toBeUndefined()
    expect(options.env.NODE_OPTIONS).toBeUndefined()
    expect(options.env.WRANGLER_SEND_METRICS).toBe('false')
  }))

  it.each(['missing', 'version', 'entry', 'lock', 'escape'])('fails closed for %s tooling without invoking an installer', (mode) => preparedFixture((dir, pkg) => {
    if (mode === 'missing') rmSync(pkg, { recursive: true })
    if (mode === 'entry') rmSync(join(pkg, 'bin/wrangler.js'))
    if (mode === 'version') writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version: '0.0.0', bin: { wrangler: 'bin/wrangler.js' } }))
    if (mode === 'lock') writeFileSync(join(dir, 'package-lock.json'), '{}')
    if (mode === 'escape') writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version: '4.159.0', bin: { wrangler: '../../../package.json' } }))
    const spawn = vi.fn()
    expect(() => deployPrepared({ gatewayDir: dir, env: dummy, spawn })).toThrow()
    expect(spawn).not.toHaveBeenCalled()
  }))

  it('requires explicit deployment credentials instead of falling back to an OAuth session', () => preparedFixture((dir) => {
    const spawn = vi.fn()
    expect(() => deployPrepared({ gatewayDir: dir, env: {}, spawn })).toThrow('credentials')
    expect(spawn).not.toHaveBeenCalled()
  }))

  it('redacts a dummy deployment token from captured tool output', () => preparedFixture((dir) => {
    const spawn = vi.fn(() => ({ status: 1, stdout: dummy.CLOUDFLARE_API_TOKEN, stderr: dummy.CLOUDFLARE_API_TOKEN }))
    const result = deployPrepared({ gatewayDir: dir, env: dummy, spawn })
    expect(result.stdout + result.stderr).not.toContain(dummy.CLOUDFLARE_API_TOKEN)
    expect(result.stdout).toContain('[redacted]')
  }))
})
// END_BLOCK_PREPARED_DEPLOY_TESTS
