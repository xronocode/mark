// FILE: tests/tools/stats-gateway-fetch-preload.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-071 stats-gateway test double for the live-format
//            subprocess runs (C-UPDATER-REVIEW-FIXES T-009): loaded via
//            `node --import` ahead of tools/stats-gateway/query.mjs
//            --live, it replaces globalThis.fetch so the Analytics Engine
//            SQL API is never contacted. Serves the canned SQL response
//            carried in STATS_GATEWAY_FETCH_PAYLOAD (a JSON array used as
//            the response's data array) and appends one JSON line per
//            intercepted call to the file named by
//            STATS_GATEWAY_FETCH_LOG, so the suite can assert the
//            substitute actually received the call. Loaded only by an
//            explicit --import from tests/tools/stats-gateway.test.mjs;
//            no shipped code imports it.
//   SCOPE:   process-global fetch replacement inside the subprocess only;
//            a missing payload makes every call answer HTTP 500, a
//            missing log path only skips the record.
//   DEPENDS: node:fs (appendFileSync for the call log); the global
//            Response constructor.
//   LINKS:   tests/tools/stats-gateway.test.mjs (the only consumer);
//            .grace/verification/features.xml V-M-071.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   fetchReplacement - The globalThis.fetch double: records the call, serves the payload.
//   logCall - Append one JSON call record line to STATS_GATEWAY_FETCH_LOG.
//   payload - The parsed STATS_GATEWAY_FETCH_PAYLOAD (null when absent/invalid).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-03 C-UPDATER-REVIEW-FIXES T-009: fetch test double for the
//     live-format subprocess tests.
// END_CHANGE_SUMMARY

import { appendFileSync } from 'node:fs'

// The canned SQL-API response body: the suite passes a JSON array that
// becomes the response's data array. Absent or unparsable -> null, and
// the double answers 500 so a misconfigured run fails loudly instead of
// returning empty tables.
let payload = null
try {
  payload = JSON.parse(process.env.STATS_GATEWAY_FETCH_PAYLOAD ?? 'null')
} catch {
  payload = null
}

const logCall = (record) => {
  const logPath = process.env.STATS_GATEWAY_FETCH_LOG
  if (!logPath) return
  appendFileSync(logPath, JSON.stringify(record) + '\n')
}

// The substitution itself: recording precedes answering, so the suite's
// after-the-fact assertion sees every call the process attempted —
// including one that would otherwise have gone to the real API.
const fetchReplacement = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url)
  logCall({
    url,
    method: init.method ?? 'GET',
    authorization: init.headers?.Authorization ?? null
  })
  if (payload === null) {
    return new Response(JSON.stringify({ error: 'no payload configured' }), {
      status: 500
    })
  }
  return new Response(JSON.stringify({ meta: [], data: payload }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
globalThis.fetch = fetchReplacement
