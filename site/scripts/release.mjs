// FILE: site/scripts/release.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The one version source for the site — the latest published
//            GitHub release (tag plus the .dmg/.exe assets and their sizes),
//            with the root package.json as the offline fallback.
//   SCOPE: latestRelease() GETs the api.github.com releases/latest endpoint
//          (Accept: application/vnd.github+json, Authorization only when a
//          token is given, 8 s AbortController timeout) and returns
//          { version, tag, htmlUrl, dmg, exe } or null on any network/HTTP/
//          parse failure — it never throws. releaseFacts(rel, pkgVersion)
//          normalises that answer for the page: version, source
//          'github'|'package.json', and per-platform { name, url, mb } with
//          the verified defaults (Mark_<v>_aarch64.dmg 15 MB,
//          Mark_<v>_x64-setup.exe 10 MB, the releases-latest URL) when an
//          asset is missing. mb = Math.round(size / 1_000_000) — decimal MB,
//          the same convention as the landing's "≈ 15 MB" for a 14.8 MB file.
//   DEPENDS: ../.vitepress/landing.mjs (GITHUB_RELEASES fallback URL)
//   LINKS: M-053 SiteBuild; C-64 version sync; site/.vitepress/config.mts and
//          site/scripts/check-dist.mjs (the two resolvers);
//          site/scripts/landing-fill.mjs (fills the landing tokens);
//          tests/site/release.test.mjs
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   latestReleaseUrl - repo -> api.github.com releases/latest endpoint
//   DMG_RE - asset name pattern of the Apple-silicon .dmg
//   EXE_RE - asset name pattern of the Windows x64 setup.exe
//   latestRelease - fetch the latest release -> { version, tag, htmlUrl, dmg, exe } | null
//   releaseFacts - release + package version -> page facts { version, source, dmg, exe }
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-19 C-64 version sync: first version.]
// END_CHANGE_SUMMARY

import { GITHUB_RELEASES } from '../.vitepress/landing.mjs'

const latestReleaseUrl = (repo) => `https://api.github.com/repos/${repo}/releases/latest`
const DMG_RE = /^Mark_.*_aarch64\.dmg$/
const EXE_RE = /^Mark_.*_x64-setup\.exe$/

// START_CONTRACT: latestRelease
//   PURPOSE: The latest published release from the GitHub API — the version
//            the whole site builds against.
//   INPUTS: { fetchImpl: fetch-like function (default globalThis.fetch),
//             token: GitHub token — Authorization: Bearer sent only when set,
//             repo: 'owner/name' (default 'xronocode/mark') }
//   OUTPUTS: { Promise <{ version: tag_name without the leading "v", tag,
//              htmlUrl, dmg: { name, url, size } | null,
//              exe: { name, url, size } | null } | null> }
//   SIDE_EFFECTS: one network request, aborted after 8 s; returns null on
//              every failure path (HTTP >= 400, thrown fetch, bad JSON,
//              missing tag_name) instead of throwing
// END_CONTRACT: latestRelease
export async function latestRelease ({ fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN, repo = 'xronocode/mark' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const headers = { Accept: 'application/vnd.github+json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetchImpl(latestReleaseUrl(repo), { headers, signal: controller.signal })
    if (!res.ok) return null
    const rel = await res.json()
    if (!rel || !rel.tag_name) return null
    const asset = (re) => {
      const a = (rel.assets || []).find((x) => re.test(x?.name || ''))
      return a ? { name: a.name, url: a.browser_download_url, size: a.size } : null
    }
    return {
      version: String(rel.tag_name).replace(/^v/, ''),
      tag: rel.tag_name,
      htmlUrl: rel.html_url,
      dmg: asset(DMG_RE),
      exe: asset(EXE_RE)
    }
  } catch (e) {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// START_CONTRACT: releaseFacts
//   PURPOSE: Normalise a latestRelease() answer (or its absence) into the
//            facts the landing fills: the version, where it came from, and
//            each platform's download name/url/size.
//   INPUTS: { rel: latestRelease() output or null,
//             pkgVersion: the root package.json version (the fallback) }
//   OUTPUTS: { { version: rel?.version ?? pkgVersion,
//                source: 'github' | 'package.json',
//                dmg: { name, url, mb }, exe: { name, url, mb } } — mb is
//                decimal MB rounded from the asset size (14_800_000 -> 15);
//                a missing asset falls back to the verified default name at
//                the resolved version, the releases-latest URL and 15/10 MB }
//   SIDE_EFFECTS: none
// END_CONTRACT: releaseFacts
export function releaseFacts (rel, pkgVersion) {
  const version = rel?.version ?? pkgVersion
  const fact = (a, name, mb) => a
    ? { name: a.name, url: a.url, mb: Math.round(a.size / 1_000_000) }
    : { name, url: GITHUB_RELEASES, mb }
  return {
    version,
    source: rel?.version ? 'github' : 'package.json',
    dmg: fact(rel?.dmg, `Mark_${version}_aarch64.dmg`, 15),
    exe: fact(rel?.exe, `Mark_${version}_x64-setup.exe`, 10)
  }
}
