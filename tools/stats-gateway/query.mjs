// FILE: tools/stats-gateway/query.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: M-071 mt-stats-gateway. Owner-run reporting for the update
//            funnel counters (C-UPDATER-STATS): prints the day × event ×
//            OS/platform table and the from-version breakdown from
//            Workers Analytics Engine. Dry mode runs on inlined fixtures
//            with zero network (CI validates the output shape); live
//            mode reads CF_API_TOKEN and CF_ACCOUNT_ID from the
//            environment and queries the Analytics Engine SQL API.
//   SCOPE:   read-only aggregate reporting; never attempts to reconstruct
//            anything finer than counts.
//   DEPENDS: none at import (live mode uses global fetch + CF_API_TOKEN).
//   LINKS:   .grace/verification/features.xml V-M-071; README.md for the
//            readings (success, downloads-vs-clicks) and their limits.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DRY_FIXTURES - Inlined aggregate rows (no fixture files) shaping dry mode.
//   renderTables - Pure renderer: rows -> the printed tables (tested).
//   runDry - Print the fixture tables (zero network).
//   runLive - Query the AE SQL API with CF_API_TOKEN and print the same shape.
//   printTables - Format and print the day table and the from-breakdown.
//   mode - argv mode switch (--dry default, --live).
//   renderTables - Pure renderer: rows -> the printed tables (tested).
//   runDry - Print the fixture tables (zero network).
//   runLive - Query the AE SQL API with CF_API_TOKEN and print the same shape.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-30 C-UPDATER-STATS T-003: initial query tool.
//   - 2026-11-03 v1.1.0 C-UPDATER-REVIEW-FIXES: live SQL selects
//     index1 AS event, rows are read from the SQL API data array, and
//     CF_ACCOUNT_ID is validated up front with a named error; LINKS
//     rerouted to the features verification.
// END_CHANGE_SUMMARY

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

export function renderTables(rows) {
  const days = [...new Set(rows.map((r) => r.day))].sort()
  const byDay = days
    .map((day) => {
      const dayRows = rows.filter((r) => r.day === day)
      const cell = (event, dim) =>
        dayRows
          .filter((r) => r.event === event && r.dim === dim)
          .reduce((sum, r) => sum + r.count, 0)
      return {
        day,
        checkDarwin: cell('check', 'darwin'),
        checkWindows: cell('check', 'windows'),
        pkgDarwin: cell('pkg', 'darwin-aarch64'),
        pkgWindows: cell('pkg', 'windows-x86_64')
      }
    })
    .filter((c) => c.checkDarwin + c.checkWindows + c.pkgDarwin + c.pkgWindows > 0)

  const froms = [...new Set(rows.filter((r) => r.event === 'check').map((r) => r.extra))]
  const fromBreakdown = froms
    .map((from) => ({
      from,
      darwin: rows
        .filter((r) => r.event === 'check' && r.extra === from && r.dim === 'darwin')
        .reduce((s, r) => s + r.count, 0),
      windows: rows
        .filter((r) => r.event === 'check' && r.extra === from && r.dim === 'windows')
        .reduce((s, r) => s + r.count, 0)
    }))
    .sort((a, b) => b.darwin + b.windows - (a.darwin + a.windows))

  return { byDay, fromBreakdown }
}

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
  // Analytics Engine SQL API; the dataset matches wrangler.toml. Day
  // buckets are UTC; the API retains three months. The SELECT aliases the
  // sample columns (index1 is the documented event column) while GROUP BY
  // and ORDER BY stay on the raw columns — the canonical form of the SQL
  // API page's own example.
  const res = await fetch('https://api.cloudflare.com/client/v4/accounts/' +
    accountId + '/analytics_engine/sql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: `SELECT blob1 AS day, index1 AS event, blob2 AS dim, blob3 AS extra, SUM(_sample_interval) AS count
           FROM mark_update_funnel
           WHERE timestamp > NOW() - INTERVAL '90' DAY
           GROUP BY blob1, index1, blob2, blob3
           ORDER BY blob1 DESC`
  })
  if (!res.ok) {
    console.error(`Analytics Engine query failed: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  const json = await res.json()
  // The SQL API answers with its rows in the data array.
  const rows = (json.data ?? []).map((r) => ({
    day: String(r.day),
    event: String(r.event),
    dim: String(r.dim),
    extra: String(r.extra),
    count: Number(r.count)
  }))
  // The renderer only shapes the named check/pkg events; count what it
  // drops so the live smoke distinguishes no-traffic from unnamed
  // pre-fix data.
  const known = new Set(['check', 'pkg'])
  const dropped = rows.filter((r) => !known.has(r.event)).length
  printTables(renderTables(rows))
  console.log('')
  console.log(`unnamed-event rows dropped: ${dropped} (events other than check/pkg — pre-fix data?)`)
}

const mode = process.argv[2] ?? '--dry'
if (mode === '--dry') {
  await runDry()
} else if (mode === '--live') {
  await runLive()
} else {
  console.error('usage: node tools/stats-gateway/query.mjs [--dry|--live]')
  process.exit(1)
}
