// @vitest-environment node
// FILE: tests/site/release.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-64 version-sync release source — latestRelease()
//            against a fake fetch (tag parsing, dmg/exe asset picking,
//            Accept/Authorization headers, null on every failure) and
//            releaseFacts() normalisation (github vs package.json fallback,
//            default names/URLs/MB for missing assets, decimal-MB rounding).
//   SCOPE: site/scripts/release.mjs
//   DEPENDS: Vitest (node env; no network — fetch is faked)
//   LINKS: M-053 SiteBuild; C-64 version sync;
//          tests/site/{landing-content,head}.test.mjs (the consumers)
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   RELEASE_JSON - the fake latest-release payload (v2.5.2; exe, dmg and an ignored .deb)
//   fakeFetch - fake fetch capturing request headers, configurable status/body/throw
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-19 C-64 version sync: first version.]
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { latestRelease, releaseFacts } from '../../site/scripts/release.mjs'

const RELEASE_JSON = {
  tag_name: 'v2.5.2',
  html_url: 'https://github.com/xronocode/mark/releases/tag/v2.5.2',
  assets: [
    { name: 'Mark_2.5.2_x64-setup.exe', browser_download_url: 'https://obj.example/Mark_2.5.2_x64-setup.exe', size: 9_700_000 },
    { name: 'Mark_2.5.2_aarch64.dmg', browser_download_url: 'https://obj.example/Mark_2.5.2_aarch64.dmg', size: 14_800_000 },
    { name: 'Mark_2.5.2_amd64.deb', browser_download_url: 'https://obj.example/Mark_2.5.2_amd64.deb', size: 9_000_000 }
  ]
}

function fakeFetch ({ status = 200, body = RELEASE_JSON, jsonThrows = false, rejects = false } = {}) {
  const calls = []
  const fetchImpl = (url, opts = {}) => {
    calls.push({ url, headers: opts.headers })
    if (rejects) return Promise.reject(new Error('network down'))
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => (jsonThrows ? Promise.reject(new SyntaxError('bad json')) : Promise.resolve(body))
    })
  }
  return { fetchImpl, calls }
}

describe('latestRelease', () => {
  it('strips the leading v from the tag and picks the dmg/exe assets, ignoring the rest', async () => {
    const { fetchImpl } = fakeFetch()
    const rel = await latestRelease({ fetchImpl, token: '' })
    expect(rel.version).toBe('2.5.2')
    expect(rel.tag).toBe('v2.5.2')
    expect(rel.htmlUrl).toBe('https://github.com/xronocode/mark/releases/tag/v2.5.2')
    expect(rel.dmg).toEqual({ name: 'Mark_2.5.2_aarch64.dmg', url: 'https://obj.example/Mark_2.5.2_aarch64.dmg', size: 14_800_000 })
    expect(rel.exe).toEqual({ name: 'Mark_2.5.2_x64-setup.exe', url: 'https://obj.example/Mark_2.5.2_x64-setup.exe', size: 9_700_000 })
  })

  it('calls the releases/latest endpoint with the GitHub JSON accept header', async () => {
    const { fetchImpl, calls } = fakeFetch()
    await latestRelease({ fetchImpl, token: '' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.github.com/repos/xronocode/mark/releases/latest')
    expect(calls[0].headers.Accept).toBe('application/vnd.github+json')
  })

  it('sends Authorization only when a token is given', async () => {
    const anon = fakeFetch()
    await latestRelease({ fetchImpl: anon.fetchImpl, token: '' })
    expect(anon.calls[0].headers.Authorization).toBeUndefined()
    const authed = fakeFetch()
    await latestRelease({ fetchImpl: authed.fetchImpl, token: 'gh_test_token' })
    expect(authed.calls[0].headers.Authorization).toBe('Bearer gh_test_token')
  })

  it('returns null on an HTTP error, a thrown fetch, bad JSON and a tagless body', async () => {
    expect(await latestRelease({ fetchImpl: fakeFetch({ status: 403 }).fetchImpl, token: '' })).toBeNull()
    expect(await latestRelease({ fetchImpl: fakeFetch({ rejects: true }).fetchImpl, token: '' })).toBeNull()
    expect(await latestRelease({ fetchImpl: fakeFetch({ jsonThrows: true }).fetchImpl, token: '' })).toBeNull()
    expect(await latestRelease({ fetchImpl: fakeFetch({ body: { assets: [] } }).fetchImpl, token: '' })).toBeNull()
  })
})

describe('releaseFacts', () => {
  it('normalises a github release: asset names/urls and decimal-MB rounding (14_800_000 -> 15)', () => {
    const rel = {
      version: '2.5.2',
      tag: 'v2.5.2',
      htmlUrl: 'https://github.com/xronocode/mark/releases/tag/v2.5.2',
      dmg: { name: 'Mark_2.5.2_aarch64.dmg', url: 'https://obj.example/Mark_2.5.2_aarch64.dmg', size: 14_800_000 },
      exe: { name: 'Mark_2.5.2_x64-setup.exe', url: 'https://obj.example/Mark_2.5.2_x64-setup.exe', size: 9_700_000 }
    }
    expect(releaseFacts(rel, '0.0.0')).toEqual({
      version: '2.5.2',
      source: 'github',
      dmg: { name: 'Mark_2.5.2_aarch64.dmg', url: 'https://obj.example/Mark_2.5.2_aarch64.dmg', mb: 15 },
      exe: { name: 'Mark_2.5.2_x64-setup.exe', url: 'https://obj.example/Mark_2.5.2_x64-setup.exe', mb: 10 }
    })
  })

  it('falls back to the package version and the verified default facts when the API is unreachable', () => {
    expect(releaseFacts(null, '2.5.2')).toEqual({
      version: '2.5.2',
      source: 'package.json',
      dmg: { name: 'Mark_2.5.2_aarch64.dmg', url: 'https://github.com/xronocode/mark/releases/latest', mb: 15 },
      exe: { name: 'Mark_2.5.2_x64-setup.exe', url: 'https://github.com/xronocode/mark/releases/latest', mb: 10 }
    })
  })

  it('fills a missing asset with the default name at the release version', () => {
    const facts = releaseFacts({ version: '2.5.2', dmg: null, exe: null }, '0.0.0')
    expect(facts.version).toBe('2.5.2')
    expect(facts.source).toBe('github')
    expect(facts.dmg).toEqual({ name: 'Mark_2.5.2_aarch64.dmg', url: 'https://github.com/xronocode/mark/releases/latest', mb: 15 })
    expect(facts.exe).toEqual({ name: 'Mark_2.5.2_x64-setup.exe', url: 'https://github.com/xronocode/mark/releases/latest', mb: 10 })
  })
})
