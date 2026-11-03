// FILE: tools/stats-gateway/query.mjs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: M-071 mt-stats-gateway. Owner-run reporting for the update
//            funnel counters (C-UPDATER-STATS): prints the day × event ×
//            OS/platform table and the from-version breakdown.
//            Remote mode (C-STATS-READOUT) reads STATS_READ_KEY and
//            prints the keyed gateway /stats tables — the documented
//            reading path, no Cloudflare credential needed; live mode
//            reads CF_API_TOKEN and CF_ACCOUNT_ID from the environment
//            and queries the Analytics Engine SQL API (the debug
//            path); dry mode runs on inlined fixtures with zero network
//            (CI validates the output shape).
//   SCOPE:   read-only aggregate reporting; never attempts to reconstruct
//            anything finer than counts.
//   DEPENDS: tables.mjs (renderTables, SQL_TEXT, normalizeRows — the
//            shared module); nothing else at import (live mode uses
//            global fetch + CF_API_TOKEN with CF_ACCOUNT_ID; remote
//            mode uses global fetch + STATS_READ_KEY).
//   LINKS:   .grace/graph/features.xml M-071;
//            .grace/verification/features.xml V-M-071;
//            .grace/changes/active/C-STATS-READOUT spec R-5, plan
//            T-004 — the bundle path moves under
//            .grace/changes/archive/ when the change archives;
//            README.md for the readings (success, downloads-vs-clicks)
//            and their limits.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DRY_FIXTURES - Inlined aggregate rows (no fixture files) shaping dry mode.
//   REMOTE_STATS_URL - The public gateway /stats endpoint --remote reads.
//   GATEWAY_UPSTREAM_BODY - The gateway's one fixed non-empty error body --remote may echo.
//   printTables - Format and print the day table and the from-breakdown.
//   runDry - Print the fixture tables (zero network).
//   runLive - Query the AE SQL API with CF_API_TOKEN and CF_ACCOUNT_ID; print the same shape.
//   runRemote - GET the keyed gateway /stats with X-Read-Key (STATS_READ_KEY); print the same tables.
//   isMain - Main guard (import.meta.url check) keeping the argv mode dispatch import-safe.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-30 C-UPDATER-STATS T-003: initial query tool.
//   - 2026-11-03 v1.1.0 C-UPDATER-REVIEW-FIXES: live SQL selects
//     index1 AS event, rows are read from the SQL API data array, and
//     CF_ACCOUNT_ID is validated up front with a named error; LINKS
//     rerouted to the features verification.
//   - 2026-11-03 v1.2.0 C-STATS-READOUT T-004: the renderer, the SQL
//     text and the normalization are imported from the shared
//     tables.mjs (the local copies are gone); a --remote mode reads
//     STATS_READ_KEY and prints the keyed gateway /stats tables; the
//     CLI dispatch moved behind a main guard, so importing the module
//     executes nothing; PURPOSE/DEPENDS/MODULE_MAP/LINKS amended per
//     R-8.
// END_CHANGE_SUMMARY

import { pathToFileURL } from 'node:url'

import { SQL_TEXT, normalizeRows, renderTables } from './tables.mjs'

// Inlined dry fixtures — a plausible three-day funnel. Kept inside the
// script by design (the plan pins "no fixture files" so the write scope
// stays exact).
const DRY_FIXTURES = [
  { day: '2026-11-02', event: 'check', dim: 'darwin', extra: '2.8.2', count: 41 },
  { day: '2026-11-02', event: 'check', dim: 'windows', extra: '2.8.2', count: 7 },
  { day: '2026-11-02', event: 'pkg', dim: 'darwin-aarch64', extra: '2.9.0', count: 12 },
  { day: '2026-11-02', event: 'pkg', dim: 'windows-x86_64', extra: '2.9.0', count: 2 },
  { day: '2026-11-03', event: 'check', dim: 'darwin', extra: '2.8.2', count: 35 },
  { day: '2026-11-03', event: 'check', dim: 'darwin', extra: '2.9.0', count: 9 },
  { day: '2026-11-03', event: 'pkg', dim: 'darwin-aarch64', extra: '2.9.0', count: 8 },
  { day: '2026-11-04', event: 'check', dim: 'darwin', extra: '2.9.0', count: 15 },
  { day: '2026-11-04', event: 'check', dim: 'windows', extra: '2.9.0', count: 3 }
]

const printTables = (t) => {
  console.log('day         | checks darwin | checks win | pkg darwin | pkg win')
  console.log('------------+---------------+------------+------------+--------')
  for (const c of t.byDay) {
    console.log(
      `${c.day} | ${String(c.checkDarwin).padStart(13)} | ${String(c.checkWindows).padStart(10)} | ${String(c.pkgDarwin).padStart(10)} | ${String(c.pkgWindows).padStart(7)}`
    )
  }
  console.log('')
  console.log('from-version breakdown (checks):')
  for (const f of t.fromBreakdown) {
    console.log(`  from=${f.from}  darwin=${f.darwin}  windows=${f.windows}`)
  }
}

export async function runDry() {
  printTables(renderTables(DRY_FIXTURES))
  console.log('')
  console.log('(dry mode — inlined fixtures; see README for the readings and their limits)')
}

export async function runLive() {
  const token = process.env.CF_API_TOKEN
  if (!token) {
    console.error('CF_API_TOKEN is required for live mode (read-only Analytics Engine scope).')
    process.exit(1)
  }
  const accountId = process.env.CF_ACCOUNT_ID
  if (!accountId) {
    console.error(
      'CF_ACCOUNT_ID is required for live mode (the SQL API path is /accounts/<CF_ACCOUNT_ID>/analytics_engine/sql).'
    )
    process.exit(1)
  }
  // The SQL API POST carries the shared SQL_TEXT (tables.mjs): the
  // canonical 90-day GROUP BY query, byte-identical to the worker's
  // /stats route — the two consumers cannot drift.
  const res = await fetch('https://api.cloudflare.com/client/v4/accounts/' +
    accountId + '/analytics_engine/sql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: SQL_TEXT
  })
  if (!res.ok) {
    console.error(`Analytics Engine query failed: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  // The SQL API answers with its rows in the data array; the shared
  // normalization (tables.mjs) maps them. The renderer only shapes the
  // named check/pkg events; count what it drops so the live smoke
  // distinguishes no-traffic from unnamed pre-fix data.
  const rows = normalizeRows(await res.json())
  const known = new Set(['check', 'pkg'])
  const dropped = rows.filter((r) => !known.has(r.event)).length
  printTables(renderTables(rows))
  console.log('')
  console.log(`unnamed-event rows dropped: ${dropped} (events other than check/pkg — pre-fix data?)`)
}

// --remote (C-STATS-READOUT): the documented reading path — the public
// gateway URL (never an account credential) and the shared read key.
const REMOTE_STATS_URL = 'https://updates.mark.xronocode.com/stats'

// The gateway's one fixed non-empty error body (worker.mjs's
// statsUpstream). A non-2XX body is echoed only when it is exactly
// this; anything else — a platform error page, HTML, an unexpected
// longer body — is withheld: never-echo-more.
const GATEWAY_UPSTREAM_BODY = '{"error":"stats-upstream"}'

export async function runRemote() {
  const readKey = process.env.STATS_READ_KEY
  if (typeof readKey !== 'string' || readKey.length === 0) {
    console.error(
      'STATS_READ_KEY is required for remote mode (the gateway read key — see the README Readout access section).'
    )
    process.exit(1)
  }
  let res
  try {
    res = await fetch(REMOTE_STATS_URL, { headers: { 'X-Read-Key': readKey } })
  } catch (_) {
    // Transport rejection: a fixed nonzero exit whose default output
    // carries no secret material and no response fragments.
    console.error('stats gateway unreachable (transport error).')
    process.exit(1)
  }
  if (!res.ok) {
    let body = null
    try {
      body = await res.text()
    } catch (_) {
      body = null
    }
    console.error(`stats gateway answered ${res.status}.`)
    if (body === GATEWAY_UPSTREAM_BODY) {
      console.error(body)
    } else {
      console.error('(non-fixed response body withheld)')
    }
    process.exit(1)
  }
  let json
  try {
    json = await res.json()
  } catch (_) {
    // A 2XX answer that is not valid JSON: the fixed error, never a
    // body fragment.
    console.error('stats gateway returned a 2XX body that is not valid JSON.')
    process.exit(1)
  }
  // The gateway answers with the rendered tables ({ byDay, fromBreakdown
  // } — the renderTables shape), not the raw SQL rows; a valid-JSON body
  // of any other shape is the fixed error too.
  if (
    json === null ||
    typeof json !== 'object' ||
    !Array.isArray(json.byDay) ||
    !Array.isArray(json.fromBreakdown)
  ) {
    console.error('stats gateway returned a 2XX body that is not the stats tables.')
    process.exit(1)
  }
  printTables(json)
}

// The CLI dispatch sits behind the main guard: importing query.mjs (as
// a tool or a test would) executes nothing — the switch runs only when
// the module is the Node entry.
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const mode = process.argv[2] ?? '--dry'
  if (mode === '--dry') {
    await runDry()
  } else if (mode === '--live') {
    await runLive()
  } else if (mode === '--remote') {
    await runRemote()
  } else {
    console.error('usage: node tools/stats-gateway/query.mjs [--dry|--live|--remote]')
    process.exit(1)
  }
}
