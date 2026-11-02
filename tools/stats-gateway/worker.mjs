// FILE: tools/stats-gateway/worker.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-071 mt-stats-gateway. Redirect-only counting gateway for
//            the update funnel (C-UPDATER-STATS): /feed counts a check
//            (day/os/from — the values Tauri's {{current_version}} and
//            {{target}} placeholders substitute) and 302s to the GitHub
//            manifest; /pkg/{platform}/{version} counts an updater
//            artifact fetch and 302s to the deterministic GitHub asset.
//            One aggregate Analytics Engine datapoint per valid request
//            via waitUntil — no IP, no user agent, no identifiers, and
//            Cloudflare edge metadata (request.cf, CF-IPCountry) is
//            never read.
//   SCOPE:   GET-only, exactly-the-expected-parameters routes with strict
//            validation (os against {darwin, windows}; platform against
//            {darwin-aarch64, windows-x86_64}; version against strict
//            x.y.z). Every redirect Location is derived from validated
//            inputs — never reflected — so the gateway is not an open
//            redirector. Unknown input is a plain 404 with zero
//            datapoints. No route ever returns a body it made.
//   DEPENDS: none (Workers runtime fetch/waitUntil; env.STATS binding).
//   LINKS:   .grace/graph/runtime.xml M-071; .grace/verification/
//            runtime.xml V-M-071; .grace/changes/active/C-UPDATER-STATS
//            spec R-1..R-5, corners C-1..C-7.
//   STATUS:  C-UPDATER-STATS T-001. Deployed owner-side via wrangler
//            (updates.mark.xronocode.com/*, workers_dev disabled) — see
//            README.md.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   OS_TABLE - The values the {{target}} placeholder substitutes (bare OS names).
//   PLATFORM_TABLE - Platform key -> deterministic GitHub asset name ({{ver}} substituted).
//   GITHUB_MANIFEST_URL - The redirect target for /feed.
//   strictSemver - Strict x.y.z validation (digits only, exactly three parts).
//   utcDay - UTC YYYY-MM-DD bucket for the datapoint day blob.
//   derivePkgUrl - platform + strict-semver version -> GitHub asset URL.
//   handleFeed - /feed: validate from/os, count check, redirect.
//   handlePkg - /pkg/{platform}/{version}: validate, count pkg, redirect.
//   count - Fire one datapoint through waitUntil, swallowing failures.
//   seeOther - 302 response constructor.
//   notFound - 404 response constructor.
//   GITHUB_RELEASE_BASE - Constant prefix for derived asset URLs.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-30 C-UPDATER-STATS T-001: initial gateway worker.
// END_CHANGE_SUMMARY

// The values the {{target}} placeholder substitutes per the Tauri v2
// updater docs: the BARE operating-system name — NOT the OS-ARCH
// platform key used in the manifest's platforms map. Validating /feed
// against the platform table would 404 every legitimate check.
export const OS_TABLE = new Set(['darwin', 'windows']);

// Platform keys (the manifest's platforms-map form) -> the deterministic
// GitHub release asset each /pkg route redirects to. Mark_${ver} naming
// is produced by .github/workflows/release.yml for every release.
export const PLATFORM_TABLE = {
  'darwin-aarch64': (ver) => `Mark_${ver}_aarch64.app.tar.gz`,
  'windows-x86_64': (ver) => `Mark_${ver}_x64-setup.exe`
};

export const GITHUB_MANIFEST_URL =
  'https://github.com/xronocode/mark/releases/latest/download/latest.json';

const GITHUB_RELEASE_BASE = 'https://github.com/xronocode/mark/releases/download';

export function strictSemver(v) {
  if (typeof v !== 'string') return false;
  const parts = v.split('.');
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0 && /^[0-9]+$/.test(p));
}

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function derivePkgUrl(platform, version) {
  const asset = PLATFORM_TABLE[platform];
  if (!asset || !strictSemver(version)) return null;
  return `${GITHUB_RELEASE_BASE}/v${version}/${asset(version)}`;
}

function count(ctx, env, index, blobs) {
  if (!env || !env.STATS || typeof env.STATS.writeDataPoint !== 'function') {
    return; // best-effort by contract: no binding, no counting
  }
  try {
    ctx.waitUntil(
      Promise.resolve(
        env.STATS.writeDataPoint({
          index,
          blobs: [blobs.day, blobs.a, blobs.b],
          doubles: []
        })
      ).catch(() => {})
    );
  } catch (_) {
    // waitUntil/write failures must never affect the response.
  }
}

const seeOther = (url) =>
  new Response(null, { status: 302, headers: { Location: url } });

const notFound = () => new Response(null, { status: 404 });

// /feed — GET only, exactly the from and os parameters, os from the
// {{target}} OS table, from strict semver. Anything else 404s without a
// datapoint, so scanner traffic can never pollute the daily counts.
export function handleFeed(url, ctx, env, day) {
  const params = url.searchParams;
  if (
    params.size !== 2 ||
    !params.has('from') ||
    !params.has('os') ||
    !strictSemver(params.get('from')) ||
    !OS_TABLE.has(params.get('os'))
  ) {
    return notFound();
  }
  count(ctx, env, 'check', {
    day,
    a: params.get('os'),
    b: params.get('from')
  });
  console.log(
    `[StatsGateway][feed][BLOCK_STATS_FEED os=${params.get('os')} from=${params.get('from')}]`
  );
  return seeOther(GITHUB_MANIFEST_URL);
}

// /pkg/{platform}/{version} — GET only, no query parameters, platform
// from the platform table, version strict semver. The Location is always
// the derived GitHub asset URL; nothing from the request is reflected.
export function handlePkg(url, ctx, env, day) {
  if (url.searchParams.size !== 0) return notFound();
  // Exact shape: /pkg/{platform}/{version} and nothing else — a trailing
  // slash makes the match fail, so no lenient normalization exists.
  const match = /^\/pkg\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (!match) return notFound();
  const [, platform, version] = match;
  const target = derivePkgUrl(platform, version);
  if (!target) return notFound();
  count(ctx, env, 'pkg', { day, a: platform, b: version });
  console.log(`[StatsGateway][pkg][BLOCK_STATS_PKG platform=${platform} version=${version}]`);
  return seeOther(target);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return notFound();
    let url;
    try {
      url = new URL(request.url);
    } catch (_) {
      return notFound();
    }
    const day = utcDay();
    // Exact, case-sensitive route matching: URL.pathname keeps its
    // original case and percent-encoding, so /PKG, trailing slashes and
    // encoded traversal all fall through to the 404 below.
    if (url.pathname === '/feed') return handleFeed(url, ctx, env, day);
    if (url.pathname.startsWith('/pkg/')) return handlePkg(url, ctx, env, day);
    return notFound();
  }
};
