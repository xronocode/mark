// FILE: tools/stats-gateway/tables.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-071 mt-stats-gateway. The single shared implementation of
//            the update-funnel readout (C-STATS-READOUT): the pure
//            byDay/fromBreakdown renderer, the 90-day GROUP BY SQL text
//            (the post-C-UPDATER-REVIEW-FIXES index1 form) and the
//            upstream-JSON-to-rows normalization — consumed by the
//            worker's /stats readout route, query.mjs and the tests, so
//            the tables and the query cannot drift between consumers.
//   SCOPE:   pure functions over plain rows; no I/O, no CLI, no network.
//   DEPENDS: none.
//   LINKS:   .grace/graph/features.xml M-071;
//            .grace/verification/features.xml V-M-071;
//            .grace/changes/active/C-STATS-READOUT spec R-3, plan T-002.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SQL_TEXT - The 90-day GROUP BY query (index1 form): shared by the worker route and --live.
//   normalizeRows - Upstream SQL API JSON -> rows; a missing data array yields empty rows.
//   renderTables - Pure renderer: rows -> { byDay, fromBreakdown }.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-03 C-STATS-READOUT T-002: initial shared module (renderer,
//     SQL text and normalization moved out of query.mjs).
// END_CHANGE_SUMMARY

// The canonical query per the SQL API page's own example: SELECT aliases
// the sample columns (index1 is the documented event column) while GROUP
// BY and ORDER BY stay on the raw columns. Day buckets are UTC; the
// dataset retains three months.
export const SQL_TEXT = `SELECT blob1 AS day, index1 AS event, blob2 AS dim, blob3 AS extra, SUM(_sample_interval) AS count
           FROM mark_update_funnel
           WHERE timestamp > NOW() - INTERVAL '90' DAY
           GROUP BY blob1, index1, blob2, blob3
           ORDER BY blob1 DESC`

// The SQL API answers with its rows in the data array; a 2XX answer with
// valid JSON but no data array is an empty dataset, not a failure.
export function normalizeRows(json) {
  return (json?.data ?? []).map((r) => ({
    day: String(r.day),
    event: String(r.event),
    dim: String(r.dim),
    extra: String(r.extra),
    count: Number(r.count)
  }))
}

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
