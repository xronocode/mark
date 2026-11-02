# C-UPDATER-STATS — archive record

- Implemented: merged as `01d45767` (PR #165, 2026-11-02, squash of feat/updater-stats).
- Owner instructions: 2026-10-29 ("can you make the detailed plan with the four-corner review and two clean review passes?", spec R-9) and 2026-10-30 ("let's implement it", the plan's approval basis).
- Review gates: spec — four corners, two consecutive clean passes (rounds 5-6 of six; the decisive round-4 catch: `{{target}}` substitutes bare OS names, so /feed validates an OS table distinct from the /pkg platform table). Plan — four corners, two consecutive clean passes (rounds 10-11 of eleven; decisive catches: DAG-position runnability rounds 1-2, the mid-gate M-069/M-070 id collision round 4, governance routing round 6, unapplied-note bookkeeping round 9).
- Implementation gates (worktree, final head f85eb24a after branch updates): targeted suites 31/31; cargo test full 473/473; grace lint --assertions final --run-commands = 0 errors; PR #165 CI fully green on the final head (all matrix jobs incl. the macOS packaging lane and e2e after a date-boundary flake rerun and a label-triggered governance pass via close/reopen); mark-site build + check-dist 22/22 with the R-6 privacy amendment.
- Full npm test locally: 5008 passed, 5 suites timed out under parallel-session load and passed 30/30 solo — CI's runners were the authoritative full-suite gate.

## Post-archive evidence update (2026-11-02)

Deployed and verified live, same day as the merge (owner instruction, translated: "1 — do it"):
`npx wrangler deploy` from tools/stats-gateway/ — first as a zone route,
then (because a zone route provisions no DNS record) switched to a
Workers custom domain, worker version `78a377b3`; wrangler.toml and the
README record the custom-domain shape. Live matrix from this machine
(local NXDOMAIN cache bypassed with --resolve; 1.1.1.1 resolves the host
globally): /feed twice (darwin/2.8.2 and windows/2.9.0) and /pkg twice
(darwin-aarch64/2.8.2, windows-x86_64/2.8.2) — all four answered 302
with the exact GitHub targets, and `wrangler tail` captured all four
BLOCK_STATS_FEED / BLOCK_STATS_PKG markers (the counting path fired);
traversal, a malformed version and an unknown path answered plain 404
with zero markers (zero datapoints). The `query.mjs --live` readout
still awaits an owner-created API token (the deploy used wrangler OAuth,
which is not an API token) — recorded below.

## Intentionally not verified here

The live deployment and the first live funnel numbers are owner-executed and stay owed after this archival, mirroring the C-UPDATER-ROLLBACK pattern: `wrangler deploy` (owner credentials), then one live check and one live pkg fetch appearing in `query.mjs --live` output — the 2026-11-02 live matrix above already proves the requests and the counting markers; only the AE-storage readout via an owner API token remains. Counting itself starts with the first release carrying the new feed manifest and the first released build carrying the new endpoints config.
