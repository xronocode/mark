# mark-stats-gateway (M-071)

Counting gateway for the update funnel (C-UPDATER-STATS): every
counted event is also pushed best-effort to the owner's analytics
dashboard (C-STATS-DASH-PUSH), and the keyed `GET /stats` readout
route (C-STATS-READOUT) exists but stays dormant — see
[Where the numbers go](#where-the-numbers-go). Answers on exactly
one host: `updates.mark.xronocode.com`, provisioned as a Workers
custom domain (Cloudflare manages its DNS record and certificate
automatically; the xronocode.com zone lives in Cloudflare per C-22).
Deployed 2026-11-02 (worker version `78a377b3`); the readout route
ships with the next owner-side deploy.

## Routes

- `/feed?from={{current_version}}&os={{target}}` — counts one **check**
  (day / OS / from-version; the values Tauri's placeholders substitute)
  and 302-redirects to the GitHub `latest.json` manifest.
- `/pkg/{platform}/{version}` — counts one **pkg** fetch (an
  Update-button click) and 302-redirects to the deterministic GitHub
  release asset (`darwin-aarch64` → the `.app.tar.gz`, `windows-x86_64`
  → the `x64-setup.exe`).
- `GET /stats` — the keyed readout route (C-STATS-READOUT), currently
  dormant: it answers 401 without a key and the fixed 502 for
  authorized reads, because no Cloudflare API token backs it (see
  [Where the numbers go](#where-the-numbers-go)). No redirect, no
  datapoint.

Everything else on the counting routes — non-GET methods, wrong
parameter sets, unknown platforms, non-strict versions, traversal
input — is a plain 404 with zero datapoints and zero redirects. Every
redirect target is derived from validated inputs; nothing from the
request is ever reflected. The readout route is equally strict: only
the exact pathname (a query string, another method or wrong case 404s —
the query-string 404 carries `Cache-Control: no-store`, the shared
router 404s stay bare), a wrong or missing `X-Read-Key` is a
bodyless 401, and upstream trouble is the fixed
`{"error":"stats-upstream"}` 502.

## Deployment (owner-executed)

Deploys are rare and owner-executed (no CI deployment),
authenticated by the narrow deploy token (see
[Where the numbers go](#where-the-numbers-go)) — not a broad OAuth grant:

```sh
cd tools/stats-gateway
export CLOUDFLARE_API_TOKEN=…   # the narrow deploy token
export CLOUDFLARE_ACCOUNT_ID=…  # the account ID from the dashboard account home
npx wrangler deploy
```

`wrangler.toml` carries the route as a Workers custom domain —
`{ pattern = "updates.mark.xronocode.com", custom_domain = true }` —
plus the Analytics Engine binding (`STATS`, dataset
`mark_update_funnel`) and `workers_dev = false` (no second live
hostname). No credentials, tokens or account identifiers live in this
repository; the worker's secrets are set dashboard-side under
[Where the numbers go](#where-the-numbers-go).

## Privacy

Datapoints: one per valid counting request — the readout route writes
none. Each counted request carries event, day (UTC), OS or platform,
from-version or artifact version. No IP, no user agent, no cookies, no
identifiers; Cloudflare edge metadata (`request.cf`, `CF-IPCountry`,
geo/ASN) is never read — and the readout route reads no request header
beyond `x-read-key`. Analytics Engine retains the data for three
months; no long-term warehouse exists.

## Reading the numbers

The reading surface is the owner's own dashboard: the
[dashboard push](#where-the-numbers-go) delivers every event there,
so the numbers are read where every other site's numbers are read —
no per-machine credential of any kind.

`query.mjs` stays for the dormant `/stats` route and local fixtures:

```sh
node tools/stats-gateway/query.mjs --dry   # inlined fixtures, zero network
```

`--remote` would read the dormant `/stats` route with the gateway
read key (`STATS_READ_KEY`, sent as `X-Read-Key`; no Cloudflare
credential) — while the route stays dormant it prints the gateway's
fixed 502 notice and exits nonzero. `--live` is the owner-side debug
path that calls the Analytics Engine SQL API directly and needs a
per-machine account-scoped token (`CF_API_TOKEN` with
`CF_ACCOUNT_ID`) — exactly the per-machine credential shape this
gateway's story deliberately avoids; it exists only for emergencies.
A pasted value still enters interactive shell history — the
history-free form is `read -s KEY && export KEY`.

Readings and their honest limits:

- **Update clicks** = `pkg` events, measured exactly (updater artifact
  fetches resolve through `/pkg`; website and Homebrew downloads keep
  their direct GitHub links).
- **Plain downloads** — the downloads-vs-clicks approximation — stay
  GitHub-counter-derived: roughly the GitHub asset total minus the
  `pkg` counts; noisy, no history. The gateway answers the clicks half
  exactly and the downloads half only as that derived approximation.
- **Update successes** = the appearance of `from={N}` among later
  checks after N shipped. Honest limits: a user who updates and never
  launches again is invisible; a fresh site install of N also reports
  `from=N` — the `pkg` and site counters separate the populations.
- Day buckets are **UTC**; the retention window is **three months**;
  queries outside the window return nothing.

## Where the numbers go

Two sinks, one decision. Every counted event (a check on `/feed`, an
updater fetch on `/pkg`) is written twice, both best-effort through
`waitUntil` — neither can ever change a response:

1. **The owner's analytics dashboard (live)** — one event is pushed to
   `https://dash.xronocode.com/api/v1/collect` with the site ingest
   key, exactly like every other site the dashboard already collects.
2. **Workers Analytics Engine (raw storage)** — the aggregate datapoint
   written since C-UPDATER-STATS; three months of history, no
   identifiers, same as before.

### Dashboard push (live)

The push carries the same aggregate dimensions the storage write
already keeps — the event kind, the OS or platform, the version — and
nothing else: no IP, no user agent, no identifiers, no
request-derived metadata. The `session` field is the fixed string
`gateway` (the dashboard's schema requires a session; it carries no
identity).

Setup is one key, issued by the dashboard itself — the same
«Выдать ключ» flow every other site uses:

1. In the dashboard (you log in with Google), create a site for the
   gateway and issue its ingest key (the value is shown once — copy it).
2. **Workers & Pages → mark-stats-gateway → Settings → Variables and
   Secrets** → add the secret `DASH_COLLECT_KEY` with that value, and
   apply. No redeploy is needed: the worker reads the key at request
   time, and the push starts with the next counted event.
3. Rotation = a new key in the dashboard, then the same secret edit.

An unset or empty `DASH_COLLECT_KEY` disables the push completely —
zero dashboard requests, counting unchanged. Failures on the
dashboard side (outage, rejected batch) are swallowed silently; the
dashboard's own `(site, id)` dedup makes retries unnecessary, so
there are none.

Verify: open the dashboard, open the gateway's site, and the first
`mark.update_check` / `mark.update_pkg` events appear within minutes
of any update check.

### The `/stats` readout (dormant)

The keyed `GET /stats` route (C-STATS-READOUT) still exists and still
answers: **401** without a key, **404** before the route's version is
deployed, and the fixed **502** for authorized reads — because reading
Analytics Engine requires a Cloudflare account API token, and per the
owner's decision (2026-11-03) **no Cloudflare API token is used
anywhere in this gateway's story** — the dashboard push replaced the
need for one. The `STATS_READ_KEY` and `STATS_ACCOUNT_ID` secrets stay
set (they are harmless); reviving the readout would be its own future
change, documented here only so the route's behavior is not a mystery.

### Deploying the worker (narrow token, no broad OAuth)

Deploys are rare and owner-executed:

```sh
export CLOUDFLARE_API_TOKEN=…   # narrow deploy token, not a broad OAuth grant
export CLOUDFLARE_ACCOUNT_ID=…  # the account ID from the dashboard account home
cd tools/stats-gateway && npx wrangler deploy
```

The deploy token: **My Profile → API Tokens → Create Token** — either
the prebuilt **Edit Cloudflare Workers** template or a minimal Custom
Token with the single permission `Account | Workers Scripts | Edit`
(the minimal token requires the accompanying account id; the template
does not). The token string is shown once at creation — miss it and
the token must be recreated. The broad wrangler OAuth grant from the
2026-11-02 deploy was already retired with `npx wrangler logout`; if
a future deploy ever authenticates broadly again, retire it the same
way and use the dashboard-side revocation path if it is listed.

The three credential families, so they are not confused at setup:

- **The dashboard push** — `DASH_COLLECT_KEY`, the dashboard's own
  site key; unlocks nothing else anywhere.
- **Deploying** — `CLOUDFLARE_API_TOKEN` with `CLOUDFLARE_ACCOUNT_ID`,
  used only in the deploy command above.
- **Debugging** — `CF_API_TOKEN` with `CF_ACCOUNT_ID`, the `--live`
  direct SQL path on the owner's machine.

Local runs in the documented flows never place real values in local
files: every example keeps secrets in environment variables only (a
pasted value still enters interactive shell history — use
`read -s KEY && export KEY` where that matters), and the wrangler-dev
convention paths (`tools/stats-gateway/.dev.vars`,
`tools/stats-gateway/.wrangler/`) are git-ignored precisely so local
experiments can never be staged.
