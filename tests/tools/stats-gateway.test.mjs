// FILE: tests/tools/stats-gateway.test.mjs
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the M-071 gateway worker's contract (C-UPDATER-STATS):
//            the full derivation table (both platforms -> exact GitHub
//            Locations), the os-table vs platform-table separation, the
//            404-with-zero-datapoints classes (non-GET, missing/extra/
//            garbage parameters, unknown platform, non-strict version,
//            traversal, trailing slashes, wrong case), the zero-reflected
//            Location guarantee (open-redirect guard), the datapoint
//            shape, best-effort counting (binding failures change no
//            response), and two baseline-true source scans (worker.mjs
//            never reads Cloudflare edge metadata; src/renderer adds no
//            new egress/analytics beyond the named allowlist).
//   SCOPE: worker.mjs pure surface via direct import + source scans;
//            no network, no Workers runtime.
//   DEPENDS: vitest, node:fs (source scans — house precedent
//            tests/renderer/commands/updater.test.js).
//   LINKS: .grace/changes/archive/C-UPDATER-STATS spec R-1/R-4, corners
//          C-2/C-3/C-6/C-9;
//          .grace/changes/active/C-STATS-READOUT plan T-005 — the
//          readout route is this change's documented exception, and the
//          bundle path moves under .grace/changes/archive/ when the
//          change archives.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeEnv - Fixture AE binding recording writeDataPoint calls.
//   makeCtx - Fixture ctx capturing waitUntil promises.
//   call - Invoke the worker fetch for a method+URL string.
//   writePoint - Await the captured datapoint promises and return them.
//   ROOT - Repository root resolved from the test file location.
//   recorded - Fixture sink collecting writeDataPoint calls.
//   waiting - Fixture sink collecting waitUntil promises.
//   readSource - Read a repo file for the source scans.
//   freshWorker - vi.resetModules + dynamic re-import: a cold-cache worker isolate for the readout pins (the static import above stays untouched for the counting pins).
//   READOUT_ROWS - The canonical upstream rows fixture for the readout.
//   READ_KEY - Obviously-fake non-hex read key fixture (this file is inside the secrets shape scan itself).
//   UPSTREAM_TOKEN - Obviously-fake non-hex upstream token fixture.
//   UPSTREAM_ACCOUNT - Obviously-fake non-hex upstream account fixture.
//   readoutEnv - The readout fixture env: the recorded STATS binding plus the three readout secrets (overridable per case).
//   statsCall - Invoke the worker fetch for /stats (key/method/url overridable; key === null sends no header).
//   upstreamOk - Counting fetch stub serving the SQL API rows payload.
//   expectFixed401 - Bodyless-401 assertion (no-store + leak guard).
//   expectFixed502 - Fixed-502 body assertion (no-store + leak guard).
//   stripLineComments - Full-line // comment stripper for the scans.
//   drainDatapoints - Await and clear the shared recorded datapoint sink.
//   DASH_KEY - Obviously-fake non-hex dashboard ingest key fixture (C-STATS-DASH-PUSH).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-03 v1.3.0 C-STATS-DASH-PUSH T-002: the dashboard push pins
//     (event shape and key header per route, off-by-absence, swallow-on-
//     failure, no push for malformed input).
//   - 2026-10-30 C-UPDATER-STATS T-002: initial suite (baseline-true
//     pins only; wave-surface pins and the query.mjs dry-mode test are
//     added by T-005 once the config edits exist).
//   - 2026-10-30 C-UPDATER-STATS T-005: wave-surface static pins (the
//     two-entry endpoints array, both gateway pkg prefixes in the feed
//     fragments, m068 byte-unchanged) and the dry-mode output-shape
//     test for query.mjs.
//   - 2026-11-03 v1.1.0 C-UPDATER-REVIEW-FIXES: the datapoint mock
//     asserts the exact written object (indexes: [index]), and new
//     live-format subprocess tests drive query.mjs via the fetch
//     preload; LINKS names the archived stats bundle.
//   - 2026-11-03 v1.2.0 C-STATS-READOUT T-005: the readout pin set —
//     auth fail-closed with zero upstream calls on every denial
//     (including a wrong key against a warm cache), the 200 body
//     through tables.mjs, the exact SQL/secrets-only upstream
//     construction, the 502 mapping (non-2XX, network, fake-timer
//     abort, unparseable JSON) with the leak guard, the empty-data
//     case, the 60 s cache behavior (vi.resetModules + dynamic
//     re-import reset; failed attempts never cached), zero datapoints
//     and no CORS headers on every /stats path, the route-shape 404s,
//     the --remote stub tests, the no-logging marker-slice scan and
//     the archive-stable secrets shape scan.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import worker, {
  OS_TABLE,
  PLATFORM_TABLE,
  GITHUB_MANIFEST_URL,
  strictSemver,
  derivePkgUrl,
  utcDay
} from '../../tools/stats-gateway/worker.mjs'
import { renderTables, SQL_TEXT } from '../../tools/stats-gateway/tables.mjs'
// Importing query.mjs executes nothing (the T-004 main guard) — the
// --remote stub tests below call runRemote directly.
import { runRemote } from '../../tools/stats-gateway/query.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const readSource = (rel) => readFileSync(resolve(ROOT, rel), 'utf8')

const makeEnv = (fail = false) => ({
  STATS: {
    writeDataPoint: fail
      ? () => {
          throw new Error('binding unavailable')
        }
      : (dp) => recorded.push(dp)
  }
})
let recorded = []
const waiting = []
const makeCtx = () => ({ waitUntil: (p) => waiting.push(p) })
const call = (method, url, env = makeEnv(), ctx = makeCtx()) =>
  worker.fetch(new Request(url, { method }), env, ctx)
const writePoint = async () => {
  await Promise.all(waiting.splice(0))
  return recorded.splice(0)
}

describe('tools/stats-gateway — derivation table (C-UPDATER-STATS T-002)', () => {
  it('maps both platforms to the exact deterministic GitHub asset URLs', () => {
    expect(derivePkgUrl('darwin-aarch64', '2.9.0')).toBe(
      'https://github.com/xronocode/mark/releases/download/v2.9.0/Mark_2.9.0_aarch64.app.tar.gz'
    )
    expect(derivePkgUrl('windows-x86_64', '2.8.2')).toBe(
      'https://github.com/xronocode/mark/releases/download/v2.8.2/Mark_2.8.2_x64-setup.exe'
    )
  })

  it('rejects unknown platforms and non-strict versions with null', () => {
    expect(derivePkgUrl('darwin-x86_64', '2.9.0')).toBeNull()
    expect(derivePkgUrl('linux-aarch64', '2.9.0')).toBeNull()
    expect(derivePkgUrl('windows-x86_64', '2.9')).toBeNull()
    expect(derivePkgUrl('windows-x86_64', '2.9.0-beta')).toBeNull()
    expect(derivePkgUrl('windows-x86_64', '2.9.0.1')).toBeNull()
  })

  it('keeps the OS table ({{target}} values) strictly apart from the platform table', () => {
    expect([...OS_TABLE].sort()).toEqual(['darwin', 'windows'])
    expect(Object.keys(PLATFORM_TABLE).sort()).toEqual(['darwin-aarch64', 'windows-x86_64'])
    expect(OS_TABLE.has('darwin-aarch64')).toBe(false)
    expect(PLATFORM_TABLE['darwin']).toBeUndefined()
  })
})

describe('tools/stats-gateway — /feed (check counting)', () => {
  it('counts exactly one check datapoint and redirects to the GitHub manifest', async () => {
    const res = await call('GET', 'https://updates.mark.xronocode.com/feed?from=2.8.2&os=darwin')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(GITHUB_MANIFEST_URL)
    const points = await writePoint()
    expect(points).toHaveLength(1)
    // The exact Analytics Engine wire shape: indexes is the sample-column
    // array, not a singular index field.
    expect(points[0]).toEqual({
      indexes: ['check'],
      blobs: [utcDay(), 'darwin', '2.8.2'],
      doubles: []
    })
  })

  it('accepts windows as an OS value (the {{target}} substitution)', async () => {
    const res = await call('GET', 'https://updates.mark.xronocode.com/feed?from=2.9.0&os=windows')
    expect(res.status).toBe(302)
    expect(await writePoint()).toHaveLength(1)
  })

  it('404s without a datapoint for every malformed class', async () => {
    const bad = [
      'https://updates.mark.xronocode.com/feed',
      'https://updates.mark.xronocode.com/feed?from=2.8.2',
      'https://updates.mark.xronocode.com/feed?os=darwin',
      'https://updates.mark.xronocode.com/feed?from=2.8.2&os=darwin&arch=aarch64',
      'https://updates.mark.xronocode.com/feed?from=2.8.2&os=linux',
      'https://updates.mark.xronocode.com/feed?from=2.8.2&os=darwin-aarch64',
      'https://updates.mark.xronocode.com/feed?from=2.8&os=darwin',
      'https://updates.mark.xronocode.com/feed?from=latest&os=darwin',
      'https://updates.mark.xronocode.com/feed?from=2.8.2&os=Darwin',
      'https://updates.mark.xronocode.com/feed/',
      'https://updates.mark.xronocode.com/FEED?from=2.8.2&os=darwin',
      'https://updates.mark.xronocode.com/evilelsewhere'
    ]
    for (const url of bad) {
      const res = await call('GET', url)
      expect(res.status, url).toBe(404)
      expect(res.headers.get('Location'), url).toBeNull()
    }
    expect(await writePoint()).toHaveLength(0)
  })

  it('404s non-GET methods without a datapoint', async () => {
    for (const method of ['POST', 'HEAD', 'OPTIONS', 'PUT']) {
      const res = await call(method, 'https://updates.mark.xronocode.com/feed?from=2.8.2&os=darwin')
      expect(res.status, method).toBe(404)
    }
    expect(await writePoint()).toHaveLength(0)
  })
})

describe('tools/stats-gateway — /pkg (artifact counting)', () => {
  it('counts exactly one pkg datapoint and redirects to the derived asset', async () => {
    const res = await call('GET', 'https://updates.mark.xronocode.com/pkg/windows-x86_64/2.9.0')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(
      'https://github.com/xronocode/mark/releases/download/v2.9.0/Mark_2.9.0_x64-setup.exe'
    )
    const points = await writePoint()
    expect(points).toHaveLength(1)
    expect(points[0]).toEqual({
      indexes: ['pkg'],
      blobs: [utcDay(), 'windows-x86_64', '2.9.0'],
      doubles: []
    })
  })

  it('404s traversal, unknown platforms, non-strict versions, queries, case and slash variants', async () => {
    const bad = [
      'https://updates.mark.xronocode.com/pkg/windows-x86_64/../../evil',
      'https://updates.mark.xronocode.com/pkg/unknown/1.0.0',
      'https://updates.mark.xronocode.com/pkg/windows-x86_64/2.9',
      'https://updates.mark.xronocode.com/pkg/windows-x86_64/latest',
      'https://updates.mark.xronocode.com/pkg/WINDOWS-X86_64/2.9.0',
      'https://updates.mark.xronocode.com/pkg/windows-x86_64/2.9.0/',
      'https://updates.mark.xronocode.com/pkg/windows-x86_64/2.9.0?x=1',
      'https://updates.mark.xronocode.com/pkg/windows-x86_64/2.9.0/extra'
    ]
    for (const url of bad) {
      const res = await call('GET', url)
      expect(res.status, url).toBe(404)
      expect(res.headers.get('Location'), url).toBeNull()
    }
    expect(await writePoint()).toHaveLength(0)
  })
})

describe('tools/stats-gateway — open-redirect guard', () => {
  it('never reflects request input into any Location header', async () => {
    const probes = [
      'https://updates.mark.xronocode.com/feed?from=2.8.2&os=darwin',
      'https://updates.mark.xronocode.com/feed?from=2.8.2&os=windows',
      'https://updates.mark.xronocode.com/pkg/darwin-aarch64/2.9.0',
      'https://updates.mark.xronocode.com/pkg/windows-x86_64/2.8.2'
    ]
    for (const url of probes) {
      const res = await call('GET', url)
      const loc = res.headers.get('Location')
      expect(loc, url).toMatch(/^https:\/\/github\.com\/xronocode\/mark\//)
      expect(loc, url).not.toContain('updates.mark.xronocode.com')
    }
  })

  it('contains no Location-building from unvalidated input (source scan)', () => {
    // Strip comment lines first: the contract header DOCUMENTS the
    // guarantee ("request.cf is never read") and must not self-trip.
    const src = readSource('tools/stats-gateway/worker.mjs')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(src).not.toContain('request.cf')
    expect(src).not.toContain('CF-IPCountry')
    expect(src).not.toContain('user-agent')
    // C-STATS-READOUT R-8: the single sanctioned allowlist — the readout
    // branch's x-read-key read. The exact expression is removed before
    // the ban matches; any other headers.get( use stays banned.
    expect(src.replaceAll("request.headers.get('x-read-key')", '')).not.toMatch(
      /headers\.get\(/
    )
  })
})

describe('tools/stats-gateway — best-effort counting (corner C-6)', () => {
  it('an absent binding changes no response', async () => {
    const res = await call(
      'GET',
      'https://updates.mark.xronocode.com/feed?from=2.8.2&os=darwin',
      {},
      makeCtx()
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(GITHUB_MANIFEST_URL)
  })

  it('an erroring binding changes no response', async () => {
    const res = await call(
      'GET',
      'https://updates.mark.xronocode.com/pkg/darwin-aarch64/2.9.0',
      makeEnv(true),
      makeCtx()
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('Mark_2.9.0_aarch64.app.tar.gz')
  })
})

// C-STATS-DASH-PUSH: the owner's dashboard intake. Obviously-fake
// non-hex key fixture (this file is inside the secrets shape scan).
const DASH_KEY = 'fake-dash-ingest-key'

describe('tools/stats-gateway — dashboard push (C-STATS-DASH-PUSH)', () => {
  const DASH_URL = 'https://dash.xronocode.com/api/v1/collect'

  // A counting fetch stub recording only the dashboard calls; the AE
  // write is a binding call, not a fetch, so every fetch is a push.
  const dashRecorder = () => {
    const calls = []
    const impl = async (input, init) => {
      calls.push({ input: String(input), init })
      return new Response('{"accepted":1}', { status: 202 })
    }
    return { impl, calls }
  }

  const withFetchStub = async (impl, run) => {
    const original = globalThis.fetch
    globalThis.fetch = impl
    try {
      return await run()
    } finally {
      globalThis.fetch = original
    }
  }

  const dashEnv = (over = {}) => ({ STATS: { writeDataPoint: (dp) => recorded.push(dp) }, DASH_COLLECT_KEY: DASH_KEY, ...over })

  it('a valid /feed pushes exactly one mark.update_check event with the key header', async () => {
    const rec = dashRecorder()
    const res = await withFetchStub(rec.impl, () =>
      call('GET', 'https://updates.mark.xronocode.com/feed?from=2.8.2&os=darwin', dashEnv(), makeCtx())
    )
    await Promise.allSettled(waiting.splice(0))
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(GITHUB_MANIFEST_URL)
    expect(rec.calls.length).toBe(1)
    expect(rec.calls[0].input).toBe(DASH_URL)
    expect(rec.calls[0].init.headers['x-collect-key']).toBe(DASH_KEY)
    expect(rec.calls[0].init.headers['content-type']).toBe('application/json')
    const body = JSON.parse(rec.calls[0].init.body)
    expect(body.events.length).toBe(1)
    const [event] = body.events
    expect(event.name).toBe('mark.update_check')
    expect(event.session).toBe('gateway')
    expect(event.props).toEqual({ os: 'darwin', from: '2.8.2' })
    expect(event.ts).toEqual(expect.any(Number))
    expect(Number.isInteger(event.ts)).toBe(true)
    expect(Math.abs(event.ts - Date.now())).toBeLessThan(60000)
    expect(event.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })

  it('a valid /pkg pushes exactly one mark.update_pkg event with platform/version props', async () => {
    const rec = dashRecorder()
    const res = await withFetchStub(rec.impl, () =>
      call('GET', 'https://updates.mark.xronocode.com/pkg/windows-x86_64/2.9.0', dashEnv(), makeCtx())
    )
    await Promise.allSettled(waiting.splice(0))
    expect(res.status).toBe(302)
    expect(rec.calls.length).toBe(1)
    const [event] = JSON.parse(rec.calls[0].init.body).events
    expect(event.name).toBe('mark.update_pkg')
    expect(event.props).toEqual({ platform: 'windows-x86_64', version: '2.9.0' })
  })

  it('an unset or empty DASH_COLLECT_KEY performs zero dashboard fetches while the AE write still happens', async () => {
    for (const env of [dashEnv({ DASH_COLLECT_KEY: undefined }), dashEnv({ DASH_COLLECT_KEY: '' })]) {
      const rec = dashRecorder()
      recorded.splice(0)
      const res = await withFetchStub(rec.impl, () =>
        call('GET', 'https://updates.mark.xronocode.com/feed?from=2.8.2&os=windows', env, makeCtx())
      )
      await Promise.allSettled(waiting.splice(0))
      expect(res.status).toBe(302)
      expect(rec.calls.length, 'no dashboard fetch without the key').toBe(0)
      expect(recorded.length, 'the AE write still happened').toBe(1)
    }
  })

  it('a rejecting or non-2XX dashboard changes nothing: byte-identical 302, no logs, no retry', async () => {
    const outcomes = [
      async () => {
        throw new Error('network down')
      },
      async () => new Response('nope', { status: 500 })
    ]
    for (const impl of outcomes) {
      const res = await withFetchStub(impl, () =>
        call('GET', 'https://updates.mark.xronocode.com/pkg/darwin-aarch64/2.9.0', dashEnv(), makeCtx())
      )
      await Promise.allSettled(waiting.splice(0))
      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toContain('Mark_2.9.0_aarch64.app.tar.gz')
    }
  })

  it('malformed input still pushes nothing: the push fires only for counted events', async () => {
    const rec = dashRecorder()
    const res = await withFetchStub(rec.impl, () =>
      call('GET', 'https://updates.mark.xronocode.com/feed?from=not-semver&os=darwin', dashEnv(), makeCtx())
    )
    await Promise.allSettled(waiting.splice(0))
    expect(res.status).toBe(404)
    expect(rec.calls.length).toBe(0)
    const res2 = await withFetchStub(rec.impl, () =>
      call('GET', 'https://updates.mark.xronocode.com/pkg/linux-aarch64/2.9.0', dashEnv(), makeCtx())
    )
    await Promise.allSettled(waiting.splice(0))
    expect(res2.status).toBe(404)
    expect(rec.calls.length, 'malformed /pkg pushes nothing either').toBe(0)
  })

  it('the pushDash function body contains no console token and aborts at 10 seconds', () => {
    const raw = readSource('tools/stats-gateway/worker.mjs')
    const begin = raw.indexOf('function pushDash')
    const end = raw.indexOf('\n}', begin)
    expect(begin).toBeGreaterThan(-1)
    const slice = stripLineComments(raw.slice(begin, end))
    expect(slice).not.toMatch(/\bconsole\b/)
    expect(slice).toContain('AbortSignal.timeout(10000)')
  })
})

describe('tools/stats-gateway — renderer egress delta scan (baseline-true)', () => {
  it('src/renderer adds no network-egress or analytics API beyond the named allowlist', async () => {
    const allowed = [
      // C-56 remote image-copy fetch + blob fetches (editor.vue) — the
      // named pre-existing allowlist from the plan.
      'src/renderer/src/components/editorWithTabs/editor.vue',
      // The dormant, globally-registered axios client (zero call sites).
      'src/renderer/src/axios/index.js',
      // The remaining blob-URL fetches / fetch stubs of the "blob-URL
      // fetches" category the plan names (a window fetch shim and the
      // locale loader's commented-out legacy fetch).
      'src/renderer/src/_shims/install-window-globals.js',
      'src/renderer/src/i18n/localeLoader.js'
    ]
    // Walk src/renderer/src collecting files that initiate traffic or
    // reference analytics APIs, then subtract the allowlist.
    const { execSync } = await import('node:child_process')
    const out = execSync(
      `grep -rl -E "fetch\\\\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|gtag|plausible|umami|analytics" src/renderer/src --include=*.js --include=*.ts --include=*.vue || true`,
      { cwd: ROOT }
    )
      .toString()
      .split('\n')
      .filter((l) => l.length > 0)
    const offenders = out.filter((f) => !allowed.includes(f))
    expect(offenders, `unexpected egress/analytics references: ${offenders.join(', ')}`).toEqual([])
  })
});

describe('tools/stats-gateway — wave-surface static pins (C-UPDATER-STATS T-005)', () => {
  it('tauri.conf.json ships the two-entry endpoints array (gateway first, GitHub fallback)', () => {
    const cfg = JSON.parse(readSource('src-tauri/tauri.conf.json'))
    expect(cfg.plugins.updater.endpoints).toEqual([
      'https://updates.mark.xronocode.com/feed?from={{current_version}}&os={{target}}',
      'https://github.com/xronocode/mark/releases/latest/download/latest.json'
    ])
    // The pubkey and installMode stay byte-anchored to the pre-wave values.
    expect(cfg.plugins.updater.pubkey).toMatch(/^dW50cnVzdGVkIGNvbW1lbnQ6/)
    expect(cfg.plugins.updater.windows.installMode).toBe('passive')
  })

  it('release.yml feed fragments point both platforms at the gateway pkg routes', () => {
    const wf = readSource('.github/workflows/release.yml')
    expect(wf).toContain('"url": "https://updates.mark.xronocode.com/pkg/darwin-aarch64/${VER}"')
    expect(wf).toContain('"url": "https://updates.mark.xronocode.com/pkg/windows-x86_64/${VER}"')
    // The signature fields still ship (the trust anchor is unchanged).
    expect(wf).toContain('.sig')
  })

  it('m068 windows_release_base stays byte-unchanged (restore traffic never touches the gateway)', () => {
    const src = readSource('src-tauri/src/m068_rollback.rs')
    expect(src).toContain(
      'https://github.com/xronocode/mark/releases/download/v{version}'
    )
  })
})

describe('tools/stats-gateway — query.mjs dry-mode output shape (T-005)', () => {
  it('renders the day x event x OS/platform table and the from-breakdown from fixtures', async () => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const run = promisify(execFile)
    const { stdout } = await run('node', ['tools/stats-gateway/query.mjs', '--dry'], { cwd: ROOT })
    expect(stdout).toContain('day')
    expect(stdout).toContain('checks darwin')
    expect(stdout).toContain('from-version breakdown (checks):')
    expect(stdout).toContain('from=2.9.0')
    expect(stdout).toContain('(dry mode')
    // The tables carry fixture rows, proving the renderer shapes data.
    expect(stdout).toMatch(/2026-11-\d{2} \|/)
  })
})

describe('tools/stats-gateway — query.mjs live format (C-UPDATER-REVIEW-FIXES T-009)', () => {
  // The fetch test double, loaded ahead of query.mjs via node --import.
  const preloadHref = pathToFileURL(
    resolve(ROOT, 'tests/tools/stats-gateway-fetch-preload.mjs')
  ).href
  // Explicit dummy credentials: the child never inherits real
  // CF_API_TOKEN/CF_ACCOUNT_ID values, so a silently failed fetch
  // substitution would carry a dummy token — never the owner's.
  const dummyEnv = () => ({
    ...process.env,
    CF_API_TOKEN: 'dummy-token',
    CF_ACCOUNT_ID: 'dummy-account-id'
  })
  const runLiveQuery = async ({ env, payload, log }) => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const run = promisify(execFile)
    const { stdout, stderr } = await run(
      'node',
      ['--import', preloadHref, 'tools/stats-gateway/query.mjs', '--live'],
      {
        cwd: ROOT,
        env: {
          ...env,
          STATS_GATEWAY_FETCH_PAYLOAD:
            payload === undefined ? 'null' : JSON.stringify(payload),
          STATS_GATEWAY_FETCH_LOG: log
        }
      }
    )
    return { stdout, stderr, log }
  }

  it('drives --live through the substituted fetch and prints both tables from a one-row data payload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sgw-live-'))
    try {
      const { stdout, log } = await runLiveQuery({
        env: dummyEnv(),
        log: join(dir, 'calls.jsonl'),
        payload: [{ day: '2026-11-02', event: 'check', dim: 'darwin', extra: '2.8.2', count: 41 }]
      })
      // Both tables print from the one-row payload.
      expect(stdout).toContain('checks darwin')
      expect(stdout).toContain('2026-11-02 |')
      expect(stdout).toContain('from-version breakdown (checks):')
      expect(stdout).toContain('from=2.8.2')
      // The substitute actually received the call: the SQL API URL with
      // the dummy account id and the dummy bearer token. A silently
      // failed substitution leaves the log empty and fails here; a stray
      // request would be a harmless read-only call with a dummy token.
      const calls = readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({
        url: 'https://api.cloudflare.com/client/v4/accounts/dummy-account-id/analytics_engine/sql',
        method: 'POST',
        authorization: 'Bearer dummy-token'
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails with the named CF_ACCOUNT_ID error when the account id is missing', async () => {
    const env = dummyEnv()
    delete env.CF_ACCOUNT_ID
    const dir = mkdtempSync(join(tmpdir(), 'sgw-live-'))
    let failure
    try {
      await runLiveQuery({ env, log: join(dir, 'calls.jsonl') })
    } catch (err) {
      failure = err
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    expect(failure, '--live must exit non-zero without CF_ACCOUNT_ID').toBeDefined()
    expect(failure.code).toBe(1)
    expect(failure.stderr).toContain('CF_ACCOUNT_ID')
    expect(failure.stdout).toBe('')
  })

  it('prints the dropped-unnamed-rows counter line for a payload carrying an unnamed event', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sgw-live-'))
    try {
      const { stdout } = await runLiveQuery({
        env: dummyEnv(),
        log: join(dir, 'calls.jsonl'),
        payload: [
          { day: '2026-11-02', event: 'check', dim: 'darwin', extra: '2.8.2', count: 41 },
          { day: '2026-11-02', event: 'legacy-pre-fix', dim: 'windows', extra: '2.8.2', count: 7 }
        ]
      })
      expect(stdout).toContain('unnamed-event rows dropped: 1')
      // The named row still prints in both tables.
      expect(stdout).toContain('2026-11-02 |')
      expect(stdout).toContain('from=2.8.2')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// C-STATS-READOUT T-005 — the /stats readout pin set. Every case that must
// not inherit cache state runs on its own isolate via freshWorker
// (vi.resetModules + dynamic re-import); the static top-level worker import
// above stays untouched for the counting pins. Fixtures are obviously-fake
// non-hex (this very file sits inside the secrets shape scan below).
// ---------------------------------------------------------------------------

const READOUT_ROWS = [
  { day: '2026-11-02', event: 'check', dim: 'darwin', extra: '2.8.2', count: 41 },
  { day: '2026-11-02', event: 'check', dim: 'windows', extra: '2.8.2', count: 7 },
  { day: '2026-11-02', event: 'pkg', dim: 'darwin-aarch64', extra: '2.9.0', count: 12 },
  { day: '2026-11-02', event: 'pkg', dim: 'windows-x86_64', extra: '2.9.0', count: 2 },
  { day: '2026-11-03', event: 'check', dim: 'darwin', extra: '2.9.0', count: 15 }
]

const READ_KEY = 'test-read-key-fake'
const UPSTREAM_TOKEN = 'fake-upstream-token'
const UPSTREAM_ACCOUNT = 'fake-account-id'

const freshWorker = async () => {
  vi.resetModules()
  return (await import('../../tools/stats-gateway/worker.mjs')).default
}

const readoutEnv = (over = {}) => ({
  STATS: { writeDataPoint: (dp) => recorded.push(dp) },
  STATS_READ_KEY: READ_KEY,
  STATS_API_TOKEN: UPSTREAM_TOKEN,
  STATS_ACCOUNT_ID: UPSTREAM_ACCOUNT,
  ...over
})

// Invoke the worker fetch against /stats; key === null sends no
// x-read-key header at all (omitting key sends the fixture key).
const statsCall = (
  worker,
  env,
  { key = READ_KEY, method = 'GET', url = 'https://updates.mark.xronocode.com/stats' } = {}
) =>
  worker.fetch(
    new Request(url, { method, headers: key === null ? {} : { 'x-read-key': key } }),
    env,
    makeCtx()
  )

// A counting upstream stub serving the SQL API rows payload.
const upstreamOk = (rows) => {
  const calls = { count: 0 }
  const impl = async () => {
    calls.count += 1
    return new Response(JSON.stringify({ meta: [], data: rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return { impl, calls }
}

// Bodyless-401: no body, no-store, and nothing secret anywhere.
const expectFixed401 = async (res, label = '401') => {
  expect(res.status, label).toBe(401)
  expect(res.headers.get('cache-control'), label).toBe('no-store')
  const text = await res.text()
  expect(text, label).toBe('')
  expect(text, label).not.toContain(UPSTREAM_TOKEN)
  expect(text, label).not.toContain(UPSTREAM_ACCOUNT)
}

// The fixed 502: exact body, application/json + no-store, and the leak
// guard — no upstream text, no token, no account id in the response.
const expectFixed502 = async (res, { upstreamText = '', label = '502' } = {}) => {
  expect(res.status, label).toBe(502)
  expect(res.headers.get('content-type'), label).toBe('application/json')
  expect(res.headers.get('cache-control'), label).toBe('no-store')
  const text = await res.text()
  expect(text, label).toBe('{"error":"stats-upstream"}')
  if (upstreamText) expect(text, label).not.toContain(upstreamText)
  expect(text, label).not.toContain(UPSTREAM_TOKEN)
  expect(text, label).not.toContain(UPSTREAM_ACCOUNT)
}

// Full-line // comment stripper shared by the source scans.
const stripLineComments = (text) =>
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

// Fixture hygiene: earlier counting pins may leave recorded datapoints in
// the shared sinks, so a zero-datapoint assertion for /stats drains first
// and then asserts nothing NEW was written.
const drainDatapoints = () => {
  recorded.splice(0)
  waiting.splice(0)
}

describe('tools/stats-gateway — /stats auth fail-closed (C-STATS-READOUT)', () => {
  // Every denial: the bodyless 401 (no-store) with ZERO upstream calls,
  // on a cold-cache isolate. The unset/empty-secret cases double as the
  // auth-before-secret-gate order pin (401, never the 502 gate).
  const denialCase = async ({ env = readoutEnv(), key = READ_KEY, label }) => {
    const worker = await freshWorker()
    const { impl, calls } = upstreamOk(READOUT_ROWS)
    vi.stubGlobal('fetch', impl)
    try {
      await expectFixed401(await statsCall(worker, env, { key }), label)
      expect(calls.count, `${label}: denial costs zero subrequests`).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it('a missing x-read-key header is a bodyless 401 with zero upstream calls', async () => {
    await denialCase({ key: null, label: 'missing key' })
  })

  it('a wrong key is a bodyless 401 with zero upstream calls', async () => {
    await denialCase({ key: 'not-the-read-key', label: 'wrong key' })
  })

  it('a wrong-LENGTH key is a bodyless 401 with zero upstream calls (pre-hash form: degenerates to wrong-key)', async () => {
    await denialCase({
      key: 'not-the-read-key-but-much-longer-than-the-secret',
      label: 'wrong-length key'
    })
  })

  it('an unset STATS_READ_KEY secret fails closed to the bodyless 401 (never the 502 gate)', async () => {
    await denialCase({ env: readoutEnv({ STATS_READ_KEY: undefined }), label: 'unset secret' })
  })

  it('an empty-string STATS_READ_KEY secret fails closed to the bodyless 401', async () => {
    await denialCase({ env: readoutEnv({ STATS_READ_KEY: '' }), label: 'empty secret' })
  })
})

describe('tools/stats-gateway — /stats authorized readout (C-STATS-READOUT)', () => {
  it('answers 200 application/json no-store with exactly the renderTables body through tables.mjs', async () => {
    const worker = await freshWorker()
    drainDatapoints()
    const { impl, calls } = upstreamOk(READOUT_ROWS)
    vi.stubGlobal('fetch', impl)
    try {
      const res = await statsCall(worker, readoutEnv())
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/json')
      expect(res.headers.get('cache-control')).toBe('no-store')
      const text = await res.text()
      expect(JSON.parse(text)).toEqual(renderTables(READOUT_ROWS))
      expect(text).not.toContain(UPSTREAM_TOKEN)
      expect(text).not.toContain(UPSTREAM_ACCOUNT)
      // One upstream call on the cold cache.
      expect(calls.count).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
    // The readout route writes no datapoint.
    expect(await writePoint()).toHaveLength(0)
  })

  it('builds the upstream call from the secrets alone and posts the exact shared SQL_TEXT', async () => {
    const worker = await freshWorker()
    const seen = []
    vi.stubGlobal('fetch', async (url, init = {}) => {
      seen.push({ url: String(url), init })
      return new Response(JSON.stringify({ meta: [], data: READOUT_ROWS }), { status: 200 })
    })
    try {
      expect((await statsCall(worker, readoutEnv())).status).toBe(200)
    } finally {
      vi.unstubAllGlobals()
    }
    expect(seen).toHaveLength(1)
    // Secrets-only construction: the account id lives exactly in the URL
    // path, the token exactly in the bearer header — nothing else enters.
    expect(seen[0].url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/fake-account-id/analytics_engine/sql'
    )
    expect(seen[0].init.method).toBe('POST')
    expect(seen[0].init.headers.Authorization).toBe('Bearer fake-upstream-token')
    // The exact SQL: the shared 90-day GROUP BY constant from tables.mjs.
    expect(seen[0].init.body).toBe(SQL_TEXT)
    expect(SQL_TEXT).toContain("INTERVAL '90' DAY")
    expect(SQL_TEXT).toContain('GROUP BY blob1, index1, blob2, blob3')
    expect(SQL_TEXT).toContain('ORDER BY blob1 DESC')
    expect(SQL_TEXT).toContain('index1 AS event')
  })
})

describe('tools/stats-gateway — /stats upstream failure mapping (C-STATS-READOUT)', () => {
  const upstreamLeakBody = 'upstream-leak-page: partial rows and credentials inside'

  it('maps a non-2XX upstream answer to the fixed 502 with no upstream text', async () => {
    const worker = await freshWorker()
    vi.stubGlobal('fetch', async () => new Response(upstreamLeakBody, { status: 500 }))
    try {
      await expectFixed502(await statsCall(worker, readoutEnv()), {
        upstreamText: upstreamLeakBody,
        label: 'non-2XX'
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('maps a network rejection to the fixed 502', async () => {
    const worker = await freshWorker()
    vi.stubGlobal('fetch', async () => {
      throw new Error('network unreachable')
    })
    try {
      await expectFixed502(await statsCall(worker, readoutEnv()), {
        upstreamText: 'network unreachable',
        label: 'network'
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('maps an injected 10 s upstream abort to the fixed 502 (fake timers — no real wait)', async () => {
    vi.useFakeTimers()
    try {
      const worker = await freshWorker()
      let seenSignal = null
      // The stub honors the AbortSignal it receives and rejects on the
      // abort event — the real fetch contract.
      const slowUpstream = (_url, init = {}) =>
        new Promise((_resolve, reject) => {
          seenSignal = init.signal
          seenSignal.addEventListener('abort', () =>
            reject(new Error('The operation was aborted'))
          )
        })
      vi.stubGlobal('fetch', slowUpstream)
      const pending = statsCall(worker, readoutEnv())
      // The pre-hash digest is native async (not timer-driven); flush
      // microtasks until the upstream call has been reached.
      for (let i = 0; i < 100 && seenSignal === null; i += 1) {
        await vi.advanceTimersByTimeAsync(1)
      }
      expect(seenSignal, 'the stubbed upstream must have been reached').not.toBeNull()
      // The seam: the setTimeout-driven controller.abort fires at 10 s.
      await vi.advanceTimersByTimeAsync(10000)
      await expectFixed502(await pending, { label: 'abort' })
      expect(seenSignal.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('maps an unparseable 2XX JSON body to the fixed 502', async () => {
    const worker = await freshWorker()
    const garbage = '<html>not json at all</html>'
    vi.stubGlobal('fetch', async () => new Response(garbage, { status: 200 }))
    try {
      await expectFixed502(await statsCall(worker, readoutEnv()), {
        upstreamText: garbage,
        label: 'unparseable'
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('tools/stats-gateway — /stats empty dataset (C-STATS-READOUT)', () => {
  it('maps a 2XX valid-JSON answer without a data array to 200 with empty tables', async () => {
    const worker = await freshWorker()
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ meta: [] }), { status: 200 }))
    try {
      const res = await statsCall(worker, readoutEnv())
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ byDay: [], fromBreakdown: [] })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('tools/stats-gateway — /stats cache behavior (C-STATS-READOUT)', () => {
  it('serves a second authorized request inside the 60 s window with zero additional upstream fetches', async () => {
    const worker = await freshWorker()
    const { impl, calls } = upstreamOk(READOUT_ROWS)
    vi.stubGlobal('fetch', impl)
    try {
      expect((await statsCall(worker, readoutEnv())).status).toBe(200)
      expect((await statsCall(worker, readoutEnv())).status).toBe(200)
      expect(calls.count).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not cache a failed upstream attempt — the next request retries', async () => {
    const worker = await freshWorker()
    const calls = { count: 0 }
    const flaky = async () => {
      calls.count += 1
      if (calls.count === 1) return new Response('upstream-leak-page', { status: 503 })
      return new Response(JSON.stringify({ meta: [], data: READOUT_ROWS }), { status: 200 })
    }
    vi.stubGlobal('fetch', flaky)
    try {
      const first = await statsCall(worker, readoutEnv())
      expect(first.status).toBe(502)
      expect(await first.text()).toBe('{"error":"stats-upstream"}')
      const second = await statsCall(worker, readoutEnv())
      expect(second.status).toBe(200)
      expect(calls.count, 'the failed attempt must have been retried').toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a wrong key against a warm cache still returns the bodyless 401 — never a cached 200', async () => {
    const worker = await freshWorker()
    const { impl, calls } = upstreamOk(READOUT_ROWS)
    vi.stubGlobal('fetch', impl)
    try {
      expect((await statsCall(worker, readoutEnv())).status).toBe(200)
      expect(calls.count).toBe(1)
      await expectFixed401(
        await statsCall(worker, readoutEnv(), { key: 'not-the-read-key' }),
        'warm-cache denial'
      )
      expect(calls.count, 'denial costs zero subrequests').toBe(1)
      // The cache survives the denial untouched for the authorized reader.
      expect((await statsCall(worker, readoutEnv())).status).toBe(200)
      expect(calls.count).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('absent or empty upstream secrets yield the fixed 502 even with a warm cache', async () => {
    const worker = await freshWorker()
    const { impl, calls } = upstreamOk(READOUT_ROWS)
    vi.stubGlobal('fetch', impl)
    try {
      expect((await statsCall(worker, readoutEnv())).status).toBe(200)
      const cases = [
        ['absent token', readoutEnv({ STATS_API_TOKEN: undefined })],
        ['empty token', readoutEnv({ STATS_API_TOKEN: '' })],
        ['absent account id', readoutEnv({ STATS_ACCOUNT_ID: undefined })],
        ['empty account id', readoutEnv({ STATS_ACCOUNT_ID: '' })]
      ]
      for (const [label, env] of cases) {
        await expectFixed502(await statsCall(worker, env), { label })
      }
      expect(calls.count, 'the secret gate never fetches').toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('tools/stats-gateway — /stats datapoints, route shape, CORS (C-STATS-READOUT)', () => {
  it('writes zero datapoints on every /stats path', async () => {
    const worker = await freshWorker()
    drainDatapoints()
    vi.stubGlobal('fetch', upstreamOk(READOUT_ROWS).impl)
    try {
      expect((await statsCall(worker, readoutEnv())).status).toBe(200)
      expect(await writePoint()).toHaveLength(0)
      expect((await statsCall(worker, readoutEnv(), { key: 'not-the-read-key' })).status).toBe(401)
      expect(await writePoint()).toHaveLength(0)
      expect((await statsCall(worker, readoutEnv({ STATS_API_TOKEN: undefined }))).status).toBe(
        502
      )
      expect(await writePoint()).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
    }
    for (const [method, url] of [
      ['GET', 'https://updates.mark.xronocode.com/stats?x=1'],
      ['GET', 'https://updates.mark.xronocode.com/stats/'],
      ['GET', 'https://updates.mark.xronocode.com/STATS'],
      ['POST', 'https://updates.mark.xronocode.com/stats']
    ]) {
      expect((await call(method, url)).status, url).toBe(404)
      expect(await writePoint(), url).toHaveLength(0)
    }
  })

  it('404s the route-shape edges and adds no-store only to handler-made responses', async () => {
    // Handler-made: the query-rejection 404 inside the readout handler.
    const queried = await call('GET', 'https://updates.mark.xronocode.com/stats?x=1')
    expect(queried.status).toBe(404)
    expect(queried.headers.get('cache-control')).toBe('no-store')
    expect(await queried.text()).toBe('')
    // Shared-constructor 404s stay bare — the shared notFound constructor
    // is untouched, so no Cache-Control at all.
    for (const [method, url, label] of [
      ['GET', 'https://updates.mark.xronocode.com/stats/', 'trailing slash'],
      ['GET', 'https://updates.mark.xronocode.com/STATS', 'wrong case'],
      ['POST', 'https://updates.mark.xronocode.com/stats', 'non-GET']
    ]) {
      const res = await call(method, url)
      expect(res.status, label).toBe(404)
      expect(res.headers.get('cache-control'), label).toBeNull()
    }
  })

  it('sets no Access-Control-* headers on any readout response', async () => {
    const noCors = (res, label) => {
      for (const name of [...res.headers.keys()]) {
        expect(name.toLowerCase().startsWith('access-control-'), `${label}: ${name}`).toBe(false)
      }
    }
    const worker = await freshWorker()
    vi.stubGlobal('fetch', upstreamOk(READOUT_ROWS).impl)
    try {
      noCors(await statsCall(worker, readoutEnv()), '200')
      noCors(await statsCall(worker, readoutEnv(), { key: 'not-the-read-key' }), '401')
      noCors(await statsCall(worker, readoutEnv({ STATS_API_TOKEN: undefined })), '502')
    } finally {
      vi.unstubAllGlobals()
    }
    noCors(await call('GET', 'https://updates.mark.xronocode.com/stats?x=1'), '404-query')
  })
})

describe('tools/stats-gateway — query.mjs --remote stub tests (C-STATS-READOUT)', () => {
  // In-process harness: runRemote exits via process.exit, so the harness
  // replaces exit with a recorder (the sentinel carries the code), captures
  // console output and restores every stub afterwards.
  class RemoteExit extends Error {}

  const runRemoteStubbed = async ({ readKey, fetchImpl }) => {
    const prev = {
      key: process.env.STATS_READ_KEY,
      fetch: globalThis.fetch,
      exit: process.exit,
      log: console.log,
      error: console.error
    }
    const outs = []
    const errs = []
    let exitCode = null
    if (readKey === undefined) delete process.env.STATS_READ_KEY
    else process.env.STATS_READ_KEY = readKey
    globalThis.fetch = fetchImpl
    process.exit = (code) => {
      exitCode = code
      throw new RemoteExit(`exit ${code}`)
    }
    console.log = (...a) => outs.push(a.map(String).join(' '))
    console.error = (...a) => errs.push(a.map(String).join(' '))
    try {
      await runRemote()
      return { exitCode, outs, errs }
    } catch (err) {
      if (err instanceof RemoteExit) return { exitCode, outs, errs }
      throw err
    } finally {
      if (prev.key === undefined) delete process.env.STATS_READ_KEY
      else process.env.STATS_READ_KEY = prev.key
      globalThis.fetch = prev.fetch
      process.exit = prev.exit
      console.log = prev.log
      console.error = prev.error
    }
  }

  it('GETs the gateway /stats with X-Read-Key and prints the tables', async () => {
    const seen = []
    const { exitCode, outs, errs } = await runRemoteStubbed({
      readKey: READ_KEY,
      fetchImpl: async (url, init = {}) => {
        seen.push({ url: String(url), headers: init.headers ?? {} })
        return new Response(JSON.stringify(renderTables(READOUT_ROWS)), { status: 200 })
      }
    })
    expect(exitCode).toBeNull()
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe('https://updates.mark.xronocode.com/stats')
    expect(seen[0].headers['X-Read-Key']).toBe(READ_KEY)
    const printed = outs.join('\n')
    expect(printed).toContain('checks darwin')
    expect(printed).toContain('from-version breakdown (checks):')
    expect(printed).toContain('from=2.9.0')
    expect(errs).toEqual([])
  })

  it('fails with the named STATS_READ_KEY error when the key is missing', async () => {
    const { exitCode, errs, outs } = await runRemoteStubbed({
      readKey: undefined,
      fetchImpl: async () => {
        throw new Error('fetch must not be called without a key')
      }
    })
    expect(exitCode).toBe(1)
    expect(errs.join('\n')).toContain('STATS_READ_KEY')
    expect(outs).toEqual([])
  })

  it('fails with the same named error for an empty-string key', async () => {
    const { exitCode, errs, outs } = await runRemoteStubbed({
      readKey: '',
      fetchImpl: async () => {
        throw new Error('fetch must not be called without a key')
      }
    })
    expect(exitCode).toBe(1)
    expect(errs.join('\n')).toContain('STATS_READ_KEY')
    expect(outs).toEqual([])
  })

  it('withholds a non-fixed non-2XX body (never-echo-more)', async () => {
    const leaky = '<html>gateway exploded: partial rows and secrets inside</html>'
    const { exitCode, errs } = await runRemoteStubbed({
      readKey: READ_KEY,
      fetchImpl: async () => new Response(leaky, { status: 503 })
    })
    expect(exitCode).toBe(1)
    const joined = errs.join('\n')
    expect(joined).toContain('503')
    expect(joined).toContain('withheld')
    expect(joined).not.toContain('gateway exploded')
    expect(joined).not.toContain('<html>')
  })

  it('fails with the fixed error on a 2XX body that is not valid JSON', async () => {
    const bad = 'not-json-at-all {'
    const { exitCode, errs } = await runRemoteStubbed({
      readKey: READ_KEY,
      fetchImpl: async () => new Response(bad, { status: 200 })
    })
    expect(exitCode).toBe(1)
    const joined = errs.join('\n')
    expect(joined).toContain('not valid JSON')
    expect(joined).not.toContain('not-json-at-all')
  })
})

describe('tools/stats-gateway — readout source scans (C-STATS-READOUT)', () => {
  it('the readout branch slice carries no console token (markers located in raw source; comments stripped only inside)', () => {
    // Comment-stripping the raw source first would erase the delimiters
    // themselves — locate the begin/end markers in the RAW source, then
    // strip comments only inside the slice.
    const raw = readSource('tools/stats-gateway/worker.mjs')
    const begin = raw.indexOf('// --- C-STATS-READOUT readout branch ---')
    const end = raw.indexOf('// --- end readout branch ---')
    expect(begin, 'begin marker present in the raw source').toBeGreaterThan(-1)
    expect(end, 'end marker present after the begin marker').toBeGreaterThan(begin)
    const code = stripLineComments(raw.slice(begin, end))
    // The marker decision is zero: the readout branch logs nothing.
    expect(code).not.toMatch(/\bconsole\b/)
  })

  it('tables.mjs carries no console token either (companion assertion)', () => {
    expect(stripLineComments(readSource('tools/stats-gateway/tables.mjs'))).not.toMatch(
      /\bconsole\b/
    )
  })
})

describe('tools/stats-gateway — secrets shape scan (C-STATS-READOUT)', () => {
  // Name-only, value-shape bans: no hex blob of either canonical length
  // and no 40-plus separator-free alnum run anywhere in a touched file.
  const BANS = [
    ['32-hex', /\b[0-9a-fA-F]{32}\b/],
    ['64-hex', /\b[0-9a-fA-F]{64}\b/],
    ['40-plus separator-free alnum', /\b[0-9a-zA-Z]{40,}\b/]
  ]

  const walkFiles = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      return entry.name === 'node_modules' ? [] : entry.isDirectory() ? walkFiles(full) : [full]
    })

  const xmlEntry = (text, tag) => {
    const begin = text.indexOf(`<${tag}>`)
    const end = text.indexOf(`</${tag}>`)
    expect(begin, `${tag} entry present`).toBeGreaterThan(-1)
    expect(end, `${tag} entry closed`).toBeGreaterThan(begin)
    return text.slice(begin, end)
  }

  it('every touched file and the (active or archived) change bundle carry no secret-shaped material', () => {
    const sources = []
    // The touched gateway files (tracked sources — the wrangler local-dev
    // convention files T-001 gitignored, .dev.vars and .wrangler/, are
    // local-only by design and never touched by this change, so dotfiles
    // are skipped).
    for (const abs of walkFiles(join(ROOT, 'tools/stats-gateway'))) {
      if (abs.includes('/.')) continue
      let text = readFileSync(abs, 'utf8')
      if (abs === join(ROOT, 'tools/stats-gateway/package-lock.json')) {
        const lock = JSON.parse(text)
        for (const [name, entry] of Object.entries(lock.packages)) {
          if (!name) continue
          expect(entry.integrity, name).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/)
          // Public npm digests are package metadata, not credential candidates.
          // All other fields still pass through the unchanged secret scan.
          entry.integrity = '<public-package-integrity>'
        }
        text = JSON.stringify(lock)
      }
      sources.push([abs, text])
    }
    sources.push([
      'tests/tools/stats-gateway.test.mjs',
      readSource('tests/tools/stats-gateway.test.mjs')
    ])
    sources.push(['.gitignore', readSource('.gitignore')])
    // The graph/verification entries in their state at this task's DAG
    // position (the final-state re-sweep belongs to T-008).
    sources.push([
      '.grace/graph/features.xml#M-071',
      xmlEntry(readSource('.grace/graph/features.xml'), 'M-071')
    ])
    sources.push([
      '.grace/verification/features.xml#V-M-071',
      xmlEntry(readSource('.grace/verification/features.xml'), 'V-M-071')
    ])
    // The archive-stable bundle resolution: whichever of the two possible
    // locations exists — correct both before and after archiving.
    const activeBundle = join(ROOT, '.grace/changes/active/C-STATS-READOUT')
    const archiveBundle = join(ROOT, '.grace/changes/archive/C-STATS-READOUT')
    const bundle = existsSync(activeBundle)
      ? activeBundle
      : existsSync(archiveBundle)
        ? archiveBundle
        : null
    expect(bundle, 'the C-STATS-READOUT bundle must exist under active/ or archive/').not.toBeNull()
    for (const abs of walkFiles(bundle)) sources.push([abs, readFileSync(abs, 'utf8')])

    const offenders = []
    for (const [path, text] of sources) {
      const stripped = stripLineComments(text)
      for (const [name, re] of BANS) {
        if (re.test(stripped)) offenders.push(`${path}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
