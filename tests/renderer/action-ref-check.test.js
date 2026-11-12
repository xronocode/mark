// FILE: tests/renderer/action-ref-check.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove privileged action references resolve through bounded read-only metadata checks.
//   SCOPE: Offline YAML, identity/input/runtime validation, hostile HTTP bodies, shared deadlines, coalescing and inert CLI integration.
//   DEPENDS: Vitest, yaml, Node filesystem/process built-ins, actual action-ref-check exports; injected fetch only.
//   LINKS: M-046; V-M-046; C-RELEASE-ACTION-REFERENCES.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   SHA_A - First dummy immutable commit.
//   SHA_B - Second dummy immutable commit.
//   TOKEN - Dummy credential that must never appear in diagnostics.
//   roots - Owned temporary fixture roots.
//   workflow - Serialize a tiny ordinary step workflow.
//   refs - Collect fixture uses through the real parser.
//   json - Construct a real bounded-response fixture.
//   metadata - Construct exact-commit base64 action metadata.
//   api - Inject a deterministic GitHub-shaped transport.
//   workspace - Create only the three privileged workflow fixtures.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-RELEASE-ACTION-REFERENCES: offline failure-first transport and metadata boundaries.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectActionRefs, validateActionRefs, runActionRefCheck } from '../../tools/action-ref-check.mjs'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const TOKEN = 'dummy-action-token-never-print'
const roots = []
const workflow = steps => stringify({ jobs: { build: { steps } } })
const refs = steps => collectActionRefs({ '.github/workflows/release.yml': workflow(steps) })
const json = (value, options) => new Response(JSON.stringify(value), options)
const metadata = (value = { runs: { using: 'node24', main: 'dist/index.js' } }) => json({ encoding: 'base64', content: Buffer.from(stringify(value)).toString('base64') })
const api = (overrides = {}) => vi.fn(async (url, options) => {
  const parsed = new URL(url)
  expect(parsed.origin).toBe('https://api.github.com')
  expect(options.redirect).toBe('error')
  expect(options.signal).toBeInstanceOf(AbortSignal)
  if (parsed.pathname.includes('/git/commits/')) return overrides.commit?.(parsed, options) ?? json({ sha: parsed.pathname.split('/').at(-1) })
  return overrides.action?.(parsed, options) ?? metadata()
})
const workspace = steps => {
  const root = mkdtempSync(join(tmpdir(), 'mark-action-ref-'))
  roots.push(root)
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  for (const name of ['release.yml', 'promote-release.yml', 'release-governance.yml']) writeFileSync(join(root, '.github/workflows', name), workflow(steps))
  return root
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('privileged workflow action collection', () => {
  it('retains workflow/job/step identities, subdirectories, local actions and input names', () => {
    const found = refs([{ id: 'root', uses: `owner/repo@${SHA_A}`, with: { target: 'dummy value' } }, { uses: `owner/repo/path/to-action@${SHA_B}` }, { uses: './.github/actions/local' }])
    expect(found).toHaveLength(3)
    expect(found[0]).toMatchObject({ workflow: '.github/workflows/release.yml', job: 'build', step: 'root', uses: `owner/repo@${SHA_A}`, inputs: ['target'] })
    expect(found[1].uses).toBe(`owner/repo/path/to-action@${SHA_B}`)
    expect(found[2].uses).toBe('./.github/actions/local')
  })

  it.each(['owner/repo@v4', 'owner/repo@' + 'a'.repeat(39), 'owner/repo@${{ inputs.ref }}', 'owner/../repo@' + SHA_A, '../outside', './actions/../outside', './actions//broken', 'docker://alpine:latest', 'https://evil.invalid/action@' + SHA_A])('refuses unsafe or unsupported uses before transport: %s', uses => {
    expect(() => refs([{ uses }])).toThrow(/ACTION_REF_/)
  })

  it('rejects malformed YAML, duplicate keys, excessive aliases and oversized source', () => {
    for (const source of ['jobs: [', 'jobs: {}\njobs: {}', `base: &a [one, two]\nexpanded: [${Array(101).fill('*a').join(',')}]\njobs: {}`, ' '.repeat(1048577)]) {
      expect(() => collectActionRefs({ 'fixture.yml': source })).toThrow(/ACTION_REF_/)
    }
  })

  it.each([null, 14, true])('rejects non-string uses (%s)', uses => {
    expect(() => refs([{ uses }])).toThrow(/ACTION_REF_/)
  })

  it('rejects reusable job-level workflows explicitly', () => {
    expect(() => collectActionRefs({ 'fixture.yml': `jobs:\n  reusable:\n    uses: owner/repo/.github/workflows/build.yml@${SHA_A}\n` })).toThrow(/ACTION_REF_/)
  })

  it('rejects malformed jobs/steps/with rather than silently dropping them', () => {
    for (const source of ['jobs: []', 'jobs: {build: {steps: wrong}}', workflow([{ uses: `owner/repo@${SHA_A}`, with: 'wrong' }])]) {
      expect(() => collectActionRefs({ 'fixture.yml': source })).toThrow(/ACTION_REF_/)
    }
  })
})

describe('commit and metadata validation', () => {
  it.each(['fce9c6108b31ea247710505d3aaaa893ee6768d4', '0'.repeat(40)])('fails a missing 40-hex commit despite valid pin shape: %s', sha => {
    const fetchImpl = api({ commit: () => json({ message: 'not found' }, { status: 422 }) })
    return expect(validateActionRefs(refs([{ uses: `tauri-apps/tauri-action@${sha}` }]), { fetchImpl })).rejects.toThrow(/ACTION_REF_/)
  })

  it('coalesces commit and root/subdirectory metadata while checking every input use', async () => {
    const fetchImpl = api({ action: () => metadata({ inputs: { target: { required: true }, optional: { required: true, default: '' } }, runs: { using: 'node24', main: 'index.js' } }) })
    const found = refs([{ uses: `owner/repo@${SHA_A}`, with: { target: 'a' } }, { uses: `owner/repo@${SHA_A}`, with: { target: 'b' } }, { uses: `owner/repo/sub@${SHA_A}`, with: { target: 'c' } }])
    expect(await validateActionRefs(found, { fetchImpl, token: TOKEN })).toEqual({ references: 3, uniqueCommits: 1, uniqueActions: 2 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    for (const [url, options] of fetchImpl.mock.calls) {
      expect(url).not.toContain(TOKEN)
      expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`)
      if (url.includes('/contents/')) expect(new URL(url).searchParams.get('ref')).toBe(SHA_A)
    }
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/contents/sub/action.yml'))).toBe(true)
  })

  it('never fetches a safe local action', async () => {
    const fetchImpl = api()
    expect(await validateActionRefs(refs([{ uses: './.github/actions/check' }]), { fetchImpl })).toEqual({ references: 1, uniqueCommits: 0, uniqueActions: 0 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('revalidates caller-supplied refs before any request', async () => {
    const fetchImpl = api()
    await expect(validateActionRefs([{ uses: `owner/repo@${SHA_A}` }, { uses: 'owner/repo@main' }], { fetchImpl })).rejects.toThrow(/ACTION_REF_/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('requires returned commit identity to equal the requested SHA', async () => {
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl: api({ commit: () => json({ sha: SHA_B }) }) })).rejects.toThrow(/ACTION_REF_/)
  })

  it('uses action.yaml only after an action.yml 404', async () => {
    const fetchImpl = api({ action: url => url.pathname.endsWith('action.yml') ? json({}, { status: 404 }) : metadata() })
    await validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl })
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes('/contents/')).map(([url]) => new URL(url).pathname)).toEqual(['/repos/owner/repo/contents/action.yml', '/repos/owner/repo/contents/action.yaml'])
  })

  it('fails when both metadata files are missing', async () => {
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl: api({ action: () => json({}, { status: 404 }) }) })).rejects.toThrow(/ACTION_REF_/)
  })

  it.each([401, 403, 429, 500, 503])('fails closed for HTTP %s without leaking token or body', async status => {
    const fetchImpl = api({ action: () => json({ message: TOKEN, private: 'arbitrary-private-response' }, { status }) })
    const error = await validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl, token: TOKEN }).catch(e => e)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toMatch(/^ACTION_REF_[A-Z_]+$/)
    expect(String(error)).not.toContain(TOKEN)
    expect(String(error)).not.toContain('arbitrary-private-response')
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes('/contents/'))).toHaveLength(1)
  })

  it('rejects redirects and cross-host response identities without following them', async () => {
    for (const response of [json({}, { status: 302, headers: { location: 'https://evil.invalid/' } }), Object.defineProperty(metadata(), 'url', { value: 'https://evil.invalid/action.yml' })]) {
      const fetchImpl = api({ action: () => response })
      await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl, token: TOKEN })).rejects.toThrow(/ACTION_REF_/)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    }
  })

  it.each([
    { runs: { using: 'node20', main: 'index.js' } },
    { runs: { using: 'node24', main: 'dist/index.js' } },
    { runs: { using: 'composite', steps: [{ run: 'echo dummy', shell: 'bash' }] } },
    { runs: { using: 'composite', steps: [{ uses: `owner/nested@${SHA_A}` }] } },
    { runs: { using: 'docker', image: 'Dockerfile' } }
  ])('validates supported runtime metadata without executing it: %j', async action => {
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl: api({ action: () => metadata(action) }) })).resolves.toMatchObject({ uniqueActions: 1 })
  })

  it.each([{}, { runs: { using: 'node12', main: 'index.js' } }, { runs: { using: 'node24' } }, { runs: { using: 'docker' } }, { runs: { using: 'composite', steps: [] } }, { runs: { using: 'composite', steps: [{ run: 'echo missing shell' }] } }, { runs: { using: 'composite', steps: [{ uses: 'owner/repo', run: 'echo both', shell: 'bash' }] } }, { inputs: { value: { default: {} } }, runs: { using: 'node24', main: 'index.js' } }])('rejects missing or unsupported runtime entry shape: %j', async action => {
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl: api({ action: () => metadata(action) }) })).rejects.toThrow(/ACTION_REF_/)
  })

  it('checks duplicate uses independently for unknown and missing required inputs', async () => {
    const action = { inputs: { target: { required: true } }, runs: { using: 'node24', main: 'index.js' } }
    for (const second of [{ target: 'ok', unknown: TOKEN }, {}]) {
      const fetchImpl = api({ action: () => metadata(action) })
      const error = await validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}`, with: { target: 'ok' } }, { uses: `owner/repo@${SHA_A}`, with: second }]), { fetchImpl }).catch(e => e)
      expect(error.message).toMatch(/^ACTION_REF_[A-Z_]+$/)
      expect(error.message).not.toContain(TOKEN)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    }
  })

  it.each([
    () => new Response('{broken'),
    () => json({ encoding: 'utf-8', content: 'not base64' }),
    () => json({ encoding: 'base64', content: '%%%=' }),
    () => json({ encoding: 'base64', content: Buffer.from([255, 254]).toString('base64') }),
    () => json({ encoding: 'base64', content: Buffer.from('runs: [').toString('base64') }),
    () => json({ encoding: 'base64', content: Buffer.from('runs: {}\nruns: {}').toString('base64') })
  ])('rejects malformed JSON, encoding, UTF8 or metadata YAML (%#)', async response => {
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl: api({ action: response }) })).rejects.toThrow(/ACTION_REF_/)
  })

  it('bounds declared and streamed bodies independently', async () => {
    for (const response of [new Response('small', { headers: { 'content-length': '9999999' } }), new Response('x'.repeat(257))]) {
      await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl: api({ action: () => response }), maxResponseBytes: 256 })).rejects.toThrow(/ACTION_REF_/)
    }
  })

  it.each(['headers', 'body', 'cancel'])('the total deadline includes a stalled %s operation that ignores abort', async leg => {
    const hanging = () => new Promise(() => {})
    const response = () => new Response(new ReadableStream({ start() {}, cancel: leg === 'cancel' ? hanging : undefined }))
    const fetchImpl = api({ action: leg === 'headers' ? hanging : response })
    const start = Date.now()
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl, timeoutMs: 25 })).rejects.toThrow(/ACTION_REF_.*DEADLINE/)
    expect(Date.now() - start).toBeLessThan(1500)
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('uses one deadline across commit and metadata requests, not a new budget per response', async () => {
    const fetchImpl = api({
      commit: async url => { await new Promise(resolve => setTimeout(resolve, 30)); return json({ sha: url.pathname.split('/').at(-1) }) },
      action: async () => { await new Promise(resolve => setTimeout(resolve, 30)); return metadata() }
    })
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl, timeoutMs: 45 })).rejects.toThrow(/ACTION_REF_.*DEADLINE/)
  })

  it('never reflects a thrown transport error containing a token or response payload', async () => {
    const error = await validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl: async () => { throw Error(`${TOKEN} private-payload`) }, token: TOKEN }).catch(e => e)
    expect(error.message).toMatch(/^ACTION_REF_[A-Z_]+$/)
    expect(String(error)).not.toContain(TOKEN)
    expect(String(error)).not.toContain('private-payload')
  })

  it('rejects metadata alias expansion and inherited-property input names', async () => {
    const yaml = `a: &a [one, two]\nb: [${Array(101).fill('*a').join(',')}]\nruns: {using: node24, main: index.js}\n`
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}` }]), { fetchImpl: api({ action: () => json({ encoding: 'base64', content: Buffer.from(yaml).toString('base64') }) }) })).rejects.toThrow(/ACTION_REF_/)
    await expect(validateActionRefs(refs([{ uses: `owner/repo@${SHA_A}`, with: { toString: 'unknown' } }]), { fetchImpl: api() })).rejects.toThrow(/ACTION_REF_/)
  })

  it('bounds in-flight requests and coalesces only within one invocation', async () => {
    let inFlight = 0, peak = 0
    const fetchImpl = api({ commit: async url => {
      peak = Math.max(peak, ++inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight--
      return json({ sha: url.pathname.split('/').at(-1) })
    } })
    const found = refs(Array.from({ length: 8 }, (_, i) => ({ uses: `owner/repo${i}@${SHA_A}` })))
    await validateActionRefs(found, { fetchImpl, concurrency: 3 })
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
    const previous = fetchImpl.mock.calls.length
    await validateActionRefs(found, { fetchImpl })
    expect(fetchImpl.mock.calls.length).toBe(previous * 2)
  })
})

describe('literal workspace and CLI integration', () => {
  it('reads only the three declared workflows and validates their uses', async () => {
    const root = workspace([{ uses: `owner/repo@${SHA_A}` }])
    writeFileSync(join(root, '.github/workflows/unrelated.yml'), 'not valid yaml [')
    expect(await runActionRefCheck(root, { fetchImpl: api() })).toEqual({ references: 3, uniqueCommits: 1, uniqueActions: 1 })
  })

  it('refuses a missing or oversized workflow before networking', async () => {
    const root = workspace([]), fetchImpl = api()
    writeFileSync(join(root, '.github/workflows/release.yml'), ' '.repeat(1048577))
    await expect(runActionRefCheck(root, { fetchImpl })).rejects.toThrow(/ACTION_REF_/)
    expect(fetchImpl).not.toHaveBeenCalled()
    rmSync(join(root, '.github/workflows/release.yml'))
    await expect(runActionRefCheck(root, { fetchImpl })).rejects.toThrow(/ACTION_REF_/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([false, true])('the real CLI prints success only after a completely valid inert batch (failure=%s)', failure => {
    const root = workspace([{ uses: `owner/repo@${SHA_A}` }])
    const preload = join(root, 'inert-fetch.mjs')
    writeFileSync(preload, `globalThis.fetch=async url=>{const u=new URL(url);if(u.origin!=='https://api.github.com')throw Error('unexpected host');if(u.pathname.includes('/git/commits/'))return new Response(JSON.stringify(${failure ? '{message:"dummy-private-response"}' : '{sha:u.pathname.split("/").at(-1)}'}),{status:${failure ? 404 : 200}});return new Response(JSON.stringify({encoding:'base64',content:Buffer.from('runs:\\n  using: node24\\n  main: index.js\\n').toString('base64')}))}`)
    const result = spawnSync(process.execPath, ['--import', preload, resolve('tools/action-ref-check.mjs')], { cwd: root, env: { PATH: process.env.PATH, GITHUB_TOKEN: TOKEN }, encoding: 'utf8', timeout: 5000 })
    expect(result.status).toBe(failure ? 1 : 0)
    expect(result.stdout.includes('BLOCK_ACTION_REFERENCES_CONFIRMED')).toBe(!failure)
    expect(result.stderr).not.toContain(TOKEN)
    expect(result.stderr).not.toContain('dummy-private-response')
  })
})
