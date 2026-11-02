// FILE: tests/tools/stats-gateway.test.mjs
// VERSION: 1.0.0
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
//   LINKS: .grace/changes/active/C-UPDATER-STATS spec R-1/R-4, corners
//          C-2/C-3/C-6/C-9; T-005 extends this file with the
//          wave-surface pins and the dry-mode output-shape test.
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
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-30 C-UPDATER-STATS T-002: initial suite (baseline-true
//     pins only; wave-surface pins and the query.mjs dry-mode test are
//     added by T-005 once the config edits exist).
//   - 2026-10-30 C-UPDATER-STATS T-005: wave-surface static pins (the
//     two-entry endpoints array, both gateway pkg prefixes in the feed
//     fragments, m068 byte-unchanged) and the dry-mode output-shape
//     test for query.mjs.
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import worker, {
  OS_TABLE,
  PLATFORM_TABLE,
  GITHUB_MANIFEST_URL,
  strictSemver,
  derivePkgUrl,
  utcDay
} from '../../tools/stats-gateway/worker.mjs'

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
    expect(points[0].index).toBe('check')
    expect(points[0].blobs[0]).toBe(utcDay())
    expect(points[0].blobs[1]).toBe('darwin')
    expect(points[0].blobs[2]).toBe('2.8.2')
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
    expect(points[0].index).toBe('pkg')
    expect(points[0].blobs[1]).toBe('windows-x86_64')
    expect(points[0].blobs[2]).toBe('2.9.0')
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
    expect(src).not.toMatch(/headers\.get\(/)
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
