// FILE: tools/stats-gateway/worker.mjs
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: M-071 mt-stats-gateway. Redirect-only counting routes plus
//            one keyed aggregate-readout JSON route (the documented
//            exception) for the update funnel (C-UPDATER-STATS): /feed
//            counts a check (day/os/from — the values Tauri's
//            {{current_version}} and {{target}} placeholders substitute)
//            and 302s to the GitHub manifest; every counted event is
//            additionally pushed best-effort to the owner's own
//            analytics dashboard (C-STATS-DASH-PUSH);
//            /pkg/{platform}/{version} counts an updater artifact fetch
//            and 302s to the deterministic GitHub asset; the keyed
//            GET /stats route answers an X-Read-Key-authorized reader
//            with the 90-day aggregate tables from Analytics Engine.
//            One aggregate Analytics Engine datapoint per valid counting
//            request — the readout route writes none — via waitUntil:
//            no IP, no user agent, no identifiers, and Cloudflare edge
//            metadata (request.cf, CF-IPCountry) is never read.
//   SCOPE:   GET-only, exactly-the-expected-parameters routes with strict
//            validation (os against {darwin, windows}; platform against
//            {darwin-aarch64, windows-x86_64}; version against strict
//            x.y.z). Every redirect Location is derived from validated
//            inputs — never reflected — so the gateway is not an open
//            redirector. Unknown input on the counting routes is a plain
//            404 with zero datapoints. No counting route ever returns a
//            body it made; the readout route returns only its JSON
//            tables and the fixed 502 body. Beside the AE write, every
//            counted event is additionally pushed best-effort to the
//            owner's analytics dashboard (C-STATS-DASH-PUSH) — off
//            without DASH_COLLECT_KEY, failures swallowed, responses
//            unchanged.
//   DEPENDS: tables.mjs (the shared renderer, SQL text and
//            normalization); Workers runtime fetch/waitUntil; env
//            bindings (STATS; the readout secrets STATS_READ_KEY,
//            STATS_API_TOKEN, STATS_ACCOUNT_ID; the dashboard push
//            secret DASH_COLLECT_KEY).
//   LINKS:   .grace/graph/features.xml M-071;
//            .grace/verification/features.xml V-M-071;
//            .grace/changes/archive/C-UPDATER-STATS spec R-1..R-5,
//            corners C-1..C-7;
//            .grace/changes/active/C-STATS-READOUT spec R-1..R-4,
//            R-7/R-8, plan T-003 — the readout route is this change's
//            documented exception, and the bundle path moves under
//            .grace/changes/archive/ when the change archives;
//            .grace/changes/active/C-STATS-DASH-PUSH — the dashboard
//            push beside the AE write.
//   STATUS:  C-UPDATER-STATS T-001. Deployed owner-side via wrangler to
//            the custom domain updates.mark.xronocode.com (workers_dev
//            disabled) — see README.md.
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
//   DASH_COLLECT_URL - The owner's analytics dashboard intake endpoint.
//   pushDash - Fire one dashboard event through waitUntil, swallowing failures (off without DASH_COLLECT_KEY).
//   seeOther - 302 response constructor.
//   notFound - 404 response constructor.
//   GITHUB_RELEASE_BASE - Constant prefix for derived asset URLs.
//   READOUT_CACHE_MS - The readout cache window (60 seconds).
//   readoutCache - Module-scope cache of mapped rows only, opened on landed success, consulted by /stats alone.
//   statsNotFound - The handler-made /stats 404 (no-store) for a query-carrying request; the shared notFound stays byte-identical.
//   statsUnauthorized - The bodyless 401 (no-store).
//   statsUpstream - The fixed 502 {"error":"stats-upstream"} constructor.
//   statsOk - The 200 JSON tables constructor (no-store).
//   digestHex - SHA-256 of a string as lowercase hex (Node/Workers portable).
//   readoutAuthorized - The x-read-key gate: SHA-256 pre-hash both sides, constant-time digest compare; the whole step is wrapped, every error path fails closed.
//   handleStats - The keyed GET /stats readout: route shape, auth, upstream-secret gate, 60 s cache, one SQL API fetch with the 10 s abort; writes no datapoint, logs nothing.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-30 C-UPDATER-STATS T-001: initial gateway worker.
//   - 2026-11-03 v1.3.0 C-STATS-DASH-PUSH: every counted event is also
//     pushed best-effort to the owner's dashboard (mark.update_check /
//     mark.update_pkg with os/from/platform/version props); off without
//     the DASH_COLLECT_KEY secret; responses byte-unchanged.
//   - 2026-11-03 v1.1.0 C-UPDATER-REVIEW-FIXES: count() writes the
//     documented datapoint shape — indexes: [index], blobs, doubles —
//     instead of the invalid singular index field; LINKS rerouted to
//     the features graph/verification and the archived stats bundle.
//   - 2026-11-03 v1.2.0 C-STATS-READOUT T-003: the keyed GET /stats
//     readout branch — the documented redirect-only exception (fixed
//     check order, pre-hash x-read-key auth, upstream-secret gate,
//     60-second mapped-rows cache, one SQL API fetch with the 10 s
//     abort); PURPOSE/SCOPE/DEPENDS/STATUS/LINKS amended per R-8.
// END_CHANGE_SUMMARY

import { SQL_TEXT, normalizeRows, renderTables } from './tables.mjs';

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
          indexes: [index],
          blobs: [blobs.day, blobs.a, blobs.b],
          doubles: []
        })
      ).catch(() => {})
    );
  } catch (_) {
    // waitUntil/write failures must never affect the response.
  }
}

// C-STATS-DASH-PUSH: the owner's own analytics dashboard intake. One
// best-effort event per counted request, alongside the AE write — an
// absent DASH_COLLECT_KEY disables the push entirely; failures are
// swallowed and never change a response. Same aggregate dimensions the
// AE write already stores; nothing request-derived is relayed.
const DASH_COLLECT_URL = 'https://dash.xronocode.com/api/v1/collect';

function pushDash(ctx, env, name, props) {
  const key = env && env.DASH_COLLECT_KEY;
  if (!key) return;
  try {
    ctx.waitUntil(
      fetch(DASH_COLLECT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-collect-key': key },
        body: JSON.stringify({
          events: [
            {
              id: crypto.randomUUID(),
              name,
              ts: Date.now(),
              session: 'gateway',
              props
            }
          ]
        }),
        // Bounded like the /stats upstream read: a hung dashboard
        // connection must not outlive the platform's waitUntil cap.
        signal: AbortSignal.timeout(10000)
      })
        .then((res) => res.body && res.body.cancel && res.body.cancel())
        .catch(() => {})
    );
  } catch (_) {
    // The push must never affect the response.
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
  pushDash(ctx, env, 'mark.update_check', {
    os: params.get('os'),
    from: params.get('from')
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
  pushDash(ctx, env, 'mark.update_pkg', { platform, version });
  console.log(`[StatsGateway][pkg][BLOCK_STATS_PKG platform=${platform} version=${version}]`);
  return seeOther(target);
}

// --- C-STATS-READOUT readout branch ---
// The keyed /stats readout (C-STATS-READOUT): the single deliberate
// exception to the redirect-only gateway. The check order is fixed:
// route shape, auth (denial costs zero subrequests), the upstream
// secrets' presence (regardless of cache state), the 60-second cache,
// then one upstream SQL fetch. The branch writes zero datapoints on
// every path, logs nothing, sets no CORS headers, and judges the
// upstream answer by res.ok and JSON parsing alone — no upstream
// response-header reads.
const READOUT_CACHE_MS = 60000;
const readoutCache = { at: 0, rows: null };

// Handler-made responses. The shared notFound constructor stays
// byte-identical (R-7); the query-rejection 404 is its own local.
const statsNotFound = () =>
  new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

const statsUnauthorized = () =>
  new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });

const statsUpstream = () =>
  new Response(JSON.stringify({ error: 'stats-upstream' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

const statsOk = (tables) =>
  new Response(JSON.stringify(tables), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

// SHA-256 of a string as lowercase hex — the portable pre-hash form:
// identical code in Node tests and the Workers runtime, and equal-length
// digests, so no length-mismatch throw exists downstream.
const digestHex = (value) =>
  crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(value))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));

// The ENTIRE auth step — header read, both digests and the comparison —
// is wrapped: any error path (including a thrown digest) fails closed to
// the same bodyless 401, never a platform error page. An unset or empty
// secret fails closed before any hashing.
const readoutAuthorized = async (request, env) => {
  try {
    const secret = env?.STATS_READ_KEY;
    if (typeof secret !== 'string' || secret.length === 0) return false;
    const provided = request.headers.get('x-read-key');
    if (typeof provided !== 'string' || provided.length === 0) return false;
    const [secretHex, providedHex] = await Promise.all([
      digestHex(secret),
      digestHex(provided)
    ]);
    let diff = 0;
    for (let i = 0; i < secretHex.length; i += 1) {
      diff |= secretHex.charCodeAt(i) ^ providedHex.charCodeAt(i);
    }
    return diff === 0;
  } catch (_) {
    return false;
  }
};

// GET /stats — the keyed aggregate readout.
const handleStats = async (request, url, env) => {
  // Route shape first: pathname equality cannot see the query string,
  // so any parameter is this handler-made 404 (the /pkg precedent).
  if (url.searchParams.size !== 0) return statsNotFound();
  // Auth before any cache consultation or upstream work — a denial can
  // never serve a cached 200.
  if (!(await readoutAuthorized(request, env))) return statsUnauthorized();
  // Upstream-secret presence, regardless of cache state.
  const token = env?.STATS_API_TOKEN;
  const accountId = env?.STATS_ACCOUNT_ID;
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    typeof accountId !== 'string' ||
    accountId.length === 0
  ) {
    return statsUpstream();
  }
  // The 60-second module-scope cache: mapped rows only, consulted after
  // auth and the secret gate.
  if (readoutCache.rows && Date.now() - readoutCache.at < READOUT_CACHE_MS) {
    return statsOk(renderTables(readoutCache.rows));
  }
  let rows;
  try {
    // One upstream fetch, aborted at 10 seconds via a setTimeout-driven
    // controller — the fake-timer-advanceable seam (AbortSignal.timeout
    // is not). Judged by res.ok and JSON parsing alone.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
          body: SQL_TEXT,
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return statsUpstream();
    // The SQL API answers with its rows in the data array; a 2XX answer
    // with valid JSON but no data array is an empty dataset, not a
    // failure. Any mapping surprise maps to the same fixed 502.
    rows = normalizeRows(await res.json());
  } catch (_) {
    // Network error, abort timeout, unparseable body — the same fixed
    // 502; a failed attempt is never cached.
    return statsUpstream();
  }
  // The window opens when the successful answer has landed.
  readoutCache.at = Date.now();
  readoutCache.rows = rows;
  return statsOk(renderTables(rows));
};
// --- end readout branch ---

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
    if (url.pathname === '/stats') return handleStats(request, url, env);
    return notFound();
  }
};
