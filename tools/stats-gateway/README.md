# mark-stats-gateway (M-071)

Redirect-only counting gateway for the update funnel (C-UPDATER-STATS).
Answers on exactly one host: `updates.mark.xronocode.com`, provisioned
as a Workers custom domain (Cloudflare manages its DNS record and
certificate automatically; the xronocode.com zone lives in Cloudflare
per C-22). Deployed 2026-11-02, worker version `78a377b3`.

## Routes

- `/feed?from={{current_version}}&os={{target}}` — counts one **check**
  (day / OS / from-version; the values Tauri's placeholders substitute)
  and 302-redirects to the GitHub `latest.json` manifest.
- `/pkg/{platform}/{version}` — counts one **pkg** fetch (an
  Update-button click) and 302-redirects to the deterministic GitHub
  release asset (`darwin-aarch64` → the `.app.tar.gz`, `windows-x86_64`
  → the `x64-setup.exe`).

Everything else — non-GET methods, wrong parameter sets, unknown
platforms, non-strict versions, traversal input — is a plain 404 with
zero datapoints and zero redirects. Every redirect target is derived
from validated inputs; nothing from the request is ever reflected.

## Deployment (owner-executed)

```sh
cd tools/stats-gateway
npx wrangler deploy        # requires the owner's Cloudflare credentials
```

`wrangler.toml` carries the route (`updates.mark.xronocode.com/*`,
`zone_name = "xronocode.com"`), the Analytics Engine binding
(`STATS`, dataset `mark_update_funnel`) and `workers_dev = false`
(no second live hostname). No credentials, tokens or account
identifiers live in this repository.

## Privacy

One aggregate datapoint per valid request: event, day (UTC), OS or
platform, from-version or artifact version. No IP, no user agent, no
cookies, no identifiers; Cloudflare edge metadata (`request.cf`,
`CF-IPCountry`, geo/ASN) is never read. Analytics Engine retains the
data for three months; no long-term warehouse exists.

## Reading the numbers (`query.mjs`)

```sh
node tools/stats-gateway/query.mjs --dry    # inlined fixtures, zero network
CF_API_TOKEN=… CF_ACCOUNT_ID=… node tools/stats-gateway/query.mjs --live
```

- **Update clicks** = `pkg` events, measured exactly (updater artifact
  fetches resolve through `/pkg`; website and Homebrew downloads keep
  their direct GitHub links).
- **Plain downloads** stay GitHub-counter-derived: roughly the GitHub
  asset total minus the `pkg` counts — noisy, no history. The gateway
  answers the clicks half exactly and the downloads half only as that
  derived approximation.
- **Update successes** = the appearance of `from={N}` among later checks
  after N shipped. Honest limits: a user who updates and never launches
  again is invisible; a fresh site install of N also reports `from=N` —
  the `pkg` and site counters separate the populations.
- Day buckets are **UTC**; the retention window is **three months**;
  queries outside the window return nothing.
