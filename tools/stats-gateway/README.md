# mark-stats-gateway (M-071)

Counting gateway for the update funnel (C-UPDATER-STATS) with one keyed
aggregate-readout route (C-STATS-READOUT): `GET /stats` serves the
aggregate tables and is the gateway's single documented exception to
the redirect-only behavior of its counting routes. Answers on exactly
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
- `GET /stats` — the keyed aggregate readout (C-STATS-READOUT): a
  caller authorized by the `X-Read-Key` header receives the 90-day
  tables as JSON (`{ byDay, fromBreakdown }`). No redirect, no
  datapoint; setup and verification in
  [Readout access](#readout-access).

Everything else on the counting routes — non-GET methods, wrong
parameter sets, unknown platforms, non-strict versions, traversal
input — is a plain 404 with zero datapoints and zero redirects. Every
redirect target is derived from validated inputs; nothing from the
request is ever reflected. The readout route is equally strict: only
the exact pathname (a query string, another method or wrong case 404s
with `Cache-Control: no-store`), a wrong or missing `X-Read-Key` is a
bodyless 401, and upstream trouble is the fixed
`{"error":"stats-upstream"}` 502.

## Deployment (owner-executed)

Deploys are rare and owner-executed (no CI deployment),
authenticated by the narrow deploy token created in
[Readout access](#readout-access) — not a broad OAuth grant:

```sh
cd tools/stats-gateway
export CLOUDFLARE_API_TOKEN=…   # the narrow deploy token (Readout access)
export CLOUDFLARE_ACCOUNT_ID=…  # the account ID from the dashboard account home
npx wrangler deploy
```

`wrangler.toml` carries the route as a Workers custom domain —
`{ pattern = "updates.mark.xronocode.com", custom_domain = true }` —
plus the Analytics Engine binding (`STATS`, dataset
`mark_update_funnel`) and `workers_dev = false` (no second live
hostname). No credentials, tokens or account identifiers live in this
repository; the worker's secrets are set dashboard-side under
[Readout access](#readout-access).

## Privacy

Datapoints: one per valid counting request — the readout route writes
none. Each counted request carries event, day (UTC), OS or platform,
from-version or artifact version. No IP, no user agent, no cookies, no
identifiers; Cloudflare edge metadata (`request.cf`, `CF-IPCountry`,
geo/ASN) is never read — and the readout route reads no request header
beyond `x-read-key`. Analytics Engine retains the data for three
months; no long-term warehouse exists.

## Reading the numbers (`query.mjs`)

`--remote` is the documented reading path — the gateway read key, no
Cloudflare credential, no account id:

```sh
export STATS_READ_KEY=…                       # the gateway read key
node tools/stats-gateway/query.mjs --remote
```

A pasted value still enters interactive shell history — the export
line itself is remembered. The history-free form is `read -s`:

```sh
read -s STATS_READ_KEY && export STATS_READ_KEY
node tools/stats-gateway/query.mjs --remote
```

Direct curl consumers send the same header:

```sh
read -s STATS_READ_KEY && export STATS_READ_KEY
curl -sS -H "X-Read-Key: $STATS_READ_KEY" https://updates.mark.xronocode.com/stats
```

Latency: expect seconds on a cache miss (the worker queries the
Analytics Engine SQL API upstream), instant on a cache hit — the
60-second result cache lives per isolate.

```sh
node tools/stats-gateway/query.mjs --dry   # inlined fixtures, zero network
```

`--live` is the owner-side debug/diagnostic path — a direct Analytics
Engine SQL API call that needs a per-machine account-scoped token
(exactly the per-machine credential shape `--remote` exists to avoid):

```sh
export CF_API_TOKEN=…
export CF_ACCOUNT_ID=…
node tools/stats-gateway/query.mjs --live
```

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

## Readout access

Reading the funnel needs no Cloudflare account credential — only the
gateway read key. This section alone covers creating and rotating the
three worker secrets, creating the narrow deploy token, revoking the
old broad OAuth grant, and verifying the setup end-to-end.

### The three secrets

All three live dashboard-side only (the read key has exactly one more
home — the reading machine's environment for `--remote`, shown in the
examples; that is the explicit exception, not a file). Worker secret
values are not re-viewable after saving: the dashboard shows only
names, so this section states each value's source and never a stored
secret. Set and rotate all three at: **Workers & Pages →
mark-stats-gateway → Settings → Variables and Secrets**. A new or
rotated secret takes effect through the dashboard's apply/confirmation
step — no redeploy is needed; the worker reads the secrets at request
time.

- **`STATS_API_TOKEN`** — a custom API token whose permission is
  `Account | Account Analytics | Read` (the Analytics Engine SQL API's
  documented requirement). If that permission alone is refused with a
  403 at query time, add the second permission third-party tooling
  names alongside it — `Account | Analytics Engine | Read`. The token
  editor may not offer that second permission; in that case the
  documented `Account | Account Analytics | Read` is authoritative.
  (Cloudflare's token docs list some of the same permissions as
  *Write* where the dashboard shows *Edit*; this section uses
  dashboard labels throughout — the gloss is noted once here.)
- **`STATS_ACCOUNT_ID`** — the account's 32-character ID from the
  dashboard account home. The same value is reused as
  `CLOUDFLARE_ACCOUNT_ID` for deploys (see below).
- **`STATS_READ_KEY`** — generated once locally, e.g.
  `openssl rand -hex 32`, and the printed value saved as the secret.
  Rotating it means generating a fresh value, saving it at the same
  path, and updating the reading machines' environment.

### Creating the API tokens

The click-path is **My Profile → API Tokens → Create Token**. The
token string is shown once at creation — miss it and the token must be
recreated. Under **Account Resources**, select **Include → this
account** — for both token flows below.

- **The read token** (becomes `STATS_API_TOKEN`): a Custom Token with
  the permission named in the bullet above.
- **The deploy token** (becomes `CLOUDFLARE_API_TOKEN`): either the
  prebuilt **Edit Cloudflare Workers** template or a minimal Custom
  Token with the single permission `Account | Workers Scripts | Edit`.

The prebuilt template is broader than its name: besides the Workers
Scripts permission it carries Workers KV Storage, Workers Routes
(zone-level), Workers Tail, Workers R2 Storage, Account Settings, User
Details and User Memberships entries (a mix of edit and read; the
dashboard shows the exact list on screen at creation — confirm it
there, since both six- and eight-permission variants of this template
have been shown). The minimal custom token is the narrow alternative.

`CLOUDFLARE_ACCOUNT_ID` accompanies the deploy token in the deploy
command (the Deployment section above): required for the minimal
custom token — an account-scoped token cannot make wrangler's
user-level account-lookup call — and harmless for the prebuilt
template, which happens to carry the lookup permission. Its value is
the dashboard account home's Account ID: the same value you pasted as
`STATS_ACCOUNT_ID`.

### Revoking the broad OAuth grant

The 2026-11-02 deploy authenticated through a broad wrangler OAuth
grant on the deploying machine. After the narrow deploy token exists
and one deploy has succeeded with it, retire the broad grant: run
`npx wrangler logout` on that machine, and use the dashboard-side
revocation path if it is listed (My Profile → API Tokens and its
token-management pages — revoke the OAuth entry there when shown). If
neither path revokes the grant server-side, the residual grant is an
owner action item: revoke it from the dashboard and confirm the local
wrangler config no longer authenticates.

### The three credential families

They exist for different purposes and must not be confused at manual
setup:

- **Reading** — `STATS_READ_KEY`, sent as `X-Read-Key`; unlocks the
  gateway's aggregate tables and nothing else.
- **Deploying** — `CLOUDFLARE_API_TOKEN` with `CLOUDFLARE_ACCOUNT_ID`,
  used only in the `npx wrangler deploy` command.
- **Debugging** — `CF_API_TOKEN` with `CF_ACCOUNT_ID`, the `--live`
  direct SQL path on the owner's machine.

Local runs in the documented flows never place real values in local
files: every example above keeps secrets in environment variables
only, and the wrangler-dev convention paths
(`tools/stats-gateway/.dev.vars`, `tools/stats-gateway/.wrangler/`)
are git-ignored precisely so local experiments can never be staged.

### Verifying end-to-end

From any machine with the read key in the environment:

```sh
read -s STATS_READ_KEY && export STATS_READ_KEY
node tools/stats-gateway/query.mjs --remote
```

The two tables printing confirms all three secrets work together.
Expect the tables after a few seconds on a cache miss — instant on a
hit; the 60-second cache is per isolate. Failure mapping:

- **401** — the read key mismatches (wrong value, a rotation the
  environment missed, or the secret unset).
- **404** — the deployed gateway does not serve `/stats` yet:
  deploy the new worker version first.
- **502** — the upstream refused or was unreachable: wrong
  `STATS_API_TOKEN` / `STATS_ACCOUNT_ID` values, or a read token whose
  permission is insufficient (an upstream 403 surfaces as this 502) —
  exactly where the `Account | Analytics Engine | Read` fallback
  applies.
