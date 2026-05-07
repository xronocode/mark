# F-CASK-PUBLISH-HANDOFF — xronocode-release-bot setup

**Phase:** B4 step-15
**Status:** awaiting user setup of GitHub App + secrets

## What

When `git tag v2.0.0 && git push fork v2.0.0` triggers the release
pipeline, the `publish-cask` job opens a PR against
`xronocode/homebrew-mark` bumping `Casks/mark.rb` to the new version
+ SHA-256.

The PR is opened by **`xronocode-release-bot`** — a GitHub App you
own that has narrow permissions (write to ONE specific repo) and
short-lived installation tokens (revoke just by uninstalling the App).

This document is your handoff: 3 manual steps, ~15 minutes.

## Why a GitHub App and not a PAT?

- **Scope:** App tokens are limited to specific repos you install on.
  PATs default to your entire account; a leak compromises everything.
- **Short-lived:** App tokens expire in 1 hour. PATs live until you
  revoke (often forgotten in `~/.gitconfig` for years).
- **Audit trail:** App actions show as `xronocode-release-bot[bot]`
  in the PR list. PAT actions show as you, mixed with hand-authored
  commits.
- **Rotation cost:** Rotating a PAT means updating every repo that
  used it. Rotating an App private key means generating a new one in
  the App settings UI.

## Setup steps

### Step 1 — create the GitHub App (5 min)

1. Open <https://github.com/settings/apps/new>
2. **GitHub App name:** `xronocode-release-bot`
3. **Homepage URL:** `https://github.com/xronocode/mark`
4. **Webhook:** uncheck **Active**
5. **Permissions** (Repository permissions only):
   - Contents: **Read and write**
   - Pull requests: **Read and write**
   - Metadata: **Read-only** (auto-set)
6. **Where can this GitHub App be installed?:** Only on this account
7. Click **Create GitHub App**

You land on the App settings page. Note down the **App ID** (top
of the page).

### Step 2 — install on the tap repo (2 min)

1. On the App page, left sidebar → **Install App**
2. Click **Install** next to your `xronocode` user/org
3. Choose **Only select repositories** → pick `homebrew-mark`
4. Click **Install**

### Step 3 — generate private key + add secrets to mark repo (5 min)

1. Back to the App page → **General**
2. Scroll to **Private keys** → **Generate a private key**
3. A `.pem` file downloads. Don't commit it; treat as a credential.
4. Open <https://github.com/xronocode/mark/settings/secrets/actions>
5. **New repository secret:**
   - Name: `RELEASE_BOT_APP_ID`
   - Value: the App ID from Step 1
6. **New repository secret:**
   - Name: `RELEASE_BOT_PRIVATE_KEY`
   - Value: paste the entire contents of the `.pem` file (including
     `-----BEGIN RSA PRIVATE KEY-----` / `-----END RSA PRIVATE KEY-----`
     lines)

### Step 4 — environment-protection on `release` (3 min)

The `publish-cask` workflow job declares `environment: release`. The
environment requires manual approval before the cask PR is opened —
this is a deliberate brake so you can review the DMG + provenance
artifacts in the GitHub Release before the cask bump goes public.

1. Open <https://github.com/xronocode/mark/settings/environments>
2. Click **New environment** → name it `release`
3. **Required reviewers:** add yourself (or whoever should approve)
4. Click **Save protection rules**

## Verification — first run

Once Steps 1–4 are done, the next `git tag v* && git push fork v*`
will:

1. Build + sign + attest + cosign-sign the DMG (no user action).
2. Create the GitHub Release on `xronocode/mark` (no user action).
3. **Pause** at the `publish-cask` job awaiting your environment
   approval (you get an email + GitHub notification).
4. After you approve: mint App installation token, clone tap, edit
   `Casks/mark.rb`, push branch, open PR.
5. You merge the PR after `brew install --cask --no-quarantine
   ./Casks/mark.rb` validates locally.

## Skip-mode (until App is created)

If the secrets are missing, the `publish-cask` job emits a `::warning`
and exits successfully. The rest of the release still publishes. This
lets you ship the first alpha cuts manually (edit `Casks/mark.rb` by
hand) while you set up the App on a comfortable schedule.

## Rotation / revocation

- **Rotate the private key:** App settings → **Generate a private
  key** → update `RELEASE_BOT_PRIVATE_KEY` secret. Old key works
  until you delete it from the App settings.
- **Revoke entirely:** App settings → **Advanced** → **Delete app**.
  All issued tokens immediately invalidate.

## Troubleshooting

- `::error: gh: not authenticated` — App token wasn't minted; check
  `RELEASE_BOT_APP_ID` matches the App.
- `::error: 403 ...permission` — App is installed but doesn't have
  Contents:write or Pull requests:write. Re-edit permissions in App
  settings; reinstall on the tap repo.
- `Bot creates PR but Author shows as "github-actions[bot]"` —
  `actions/create-github-app-token@v2` step misconfigured; verify
  `app-id` + `private-key` inputs.
