# F-UPDATER-WIRE-PLUGIN — ed25519 keypair setup

**Phase:** B4 step-5/6
**Status:** awaiting user-side keypair generation + 2 secrets

## What

Mark's in-app "Check for Updates" menu hits the URL configured at
`tauri.conf.json` `plugins.updater.endpoints[0]`:

    https://github.com/xronocode/mark/releases/latest/download/latest.json

The CI release pipeline generates `latest.json` per release with an
**ed25519 signature** of the `.app.tar.gz` updater bundle. The plugin
**verifies that signature against the public key embedded in the
binary** before downloading anything.

That verify-before-download model means a compromised release server
can't push a malicious update to users — the attacker would need the
**private key** to forge a valid signature.

## Threat model

| Attacker capability | Mitigated by |
|---|---|
| Replaces DMG on GitHub Releases (e.g. compromised maintainer GH token) | Signature mismatch → plugin refuses install |
| MitMs the latest.json fetch | TLS pinning to github.com + signature still required on the bundle |
| Compromises CI runner mid-build | SLSA-3 attestation diverges; users can detect via `gh attestation verify` |
| Steals the **private signing key** | 🔴 NOT MITIGATED — they can sign arbitrary updates |

→ The private key is the keystone. Treat it like a code-signing cert.

## Setup steps

### Step 1 — generate the keypair (1 min, on your machine)

The `tauri` CLI's signer command produces an encrypted PEM-format
keypair. Run **once**, **on your machine**, **NOT in CI**:

```sh
# Pick a strong password and remember it. You'll add it as a GH secret.
mkdir -p ~/.tauri
npx --yes @tauri-apps/cli signer generate -w ~/.tauri/mark.key
```

Output:

- `~/.tauri/mark.key` — encrypted **private** key. **Never commit;
  never leave on a shared drive.**
- `~/.tauri/mark.key.pub` — **public** key. Safe to commit; gets
  embedded in the binary at build time.

Backup `~/.tauri/mark.key` to a password manager / hardware token.
Losing it means you can't issue updates anymore until users reinstall
with a new pubkey baked in.

### Step 2 — embed the public key in tauri.conf.json (1 min)

Open `~/.tauri/mark.key.pub`, copy the entire contents (it's one
long base64 string, no headers).

Open `src-tauri/tauri.conf.json`, find:

```json
"pubkey": "PLACEHOLDER_REPLACE_BEFORE_FIRST_RELEASE",
```

Replace `PLACEHOLDER_REPLACE_BEFORE_FIRST_RELEASE` with the contents
of `mark.key.pub`. Commit.

### Step 3 — add CI secrets (3 min)

Open <https://github.com/xronocode/mark/settings/secrets/actions>

**Two new repository secrets:**

1. Name: `TAURI_SIGNING_PRIVATE_KEY`
   Value: paste the **entire contents** of `~/.tauri/mark.key`
   (it's base64-encoded ciphertext; copy the file as-is).

2. Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   Value: the password you chose in Step 1.

CI's `tauri-action` reads these envs and passes them to
`tauri build --signer` → produces `Mark.app.tar.gz.sig` alongside the
DMG → release.yml's `build updater feed (latest.json)` step embeds
the .sig into latest.json.

### Step 4 — verify on next release

After Steps 1–3, the next `git tag v* && git push fork v*` run
should:

- Produce `Mark_<ver>_aarch64.app.tar.gz` + `latest.json` in the
  release assets (alongside the DMG that Homebrew installs).
- Embed the `pubkey` from `tauri.conf.json` in the released binary.
- Subsequent releases: existing v2.0.0 users hit
  `Cmd+Shift+U` (or "Check for Updates" menu, when wired) →
  plugin GETs latest.json → verifies sig with embedded pubkey →
  if valid + version newer, downloads + installs in place.

Verify locally:

```sh
# Inside an installed Mark.app:
ls /Applications/Mark.app/Contents/MacOS/mark
otool -l /Applications/Mark.app/Contents/MacOS/mark | grep -A1 'segname __TEXT'
# Won't show the pubkey directly (it's a string baked into Rust),
# but the binary will refuse to apply an update signed with a
# different key. Test: stage a deliberately-mis-signed latest.json
# locally, point the binary at it, expect the plugin to reject.
```

## Skip-mode (until keypair provisioned)

If `TAURI_SIGNING_PRIVATE_KEY` is missing, `tauri-action` builds an
**unsigned** bundle. The `build updater feed (latest.json)` step
detects the missing `.sig` file, emits a `::warning`, and skips
generating `latest.json`. The release still publishes; users on
that build can't auto-update via the in-app menu but
`brew upgrade --cask mark` still works.

## Rotation

Currently a **single-key** scheme. The full-fat plan in development-
plan.xml B4 step-5 calls for a **dual-pubkey rotation**:

```
[pub_key_current, pub_key_next, pub_key_rescue]
```

Where:

- `pub_key_current` validates today's signed updates
- `pub_key_next` validates tomorrow's (after a planned rotation)
- `pub_key_rescue` is cold-stored, 5y rotation, unlocks recovery if
  current+next compromise

Implementation deferred to **post-v2.0** (`F-UPDATER-DUAL-PUBKEY`).
Single-key is acceptable for alpha because:

1. Brew is the primary upgrade path; in-app updater is convenience.
2. Compromise blast radius: alpha audience is small + opt-in.
3. Rotation cost in v2.x is one cask bump (force users to reinstall
   the new pubkey-baked binary).

## Verifying a release update flow

Once provisioned, do a **dry-run release** before announcing:

1. `git tag v0.0.2-test && git push fork v0.0.2-test`
2. CI builds + signs + publishes.
3. On a test machine running Mark v0.0.1, click "Check for Updates".
4. Plugin should fetch latest.json, verify, prompt for download.
5. Approve → installs → relaunch with v0.0.2-test.
6. Delete the test tag + release after verification.

## Troubleshooting

- `error: failed to verify signature` — wrong `pubkey` in
  tauri.conf.json. Either you didn't update Step 2, or the binary
  was built before the update.
- `tauri-action: TAURI_SIGNING_PRIVATE_KEY env var not set` — secret
  missing from repo settings. Check Step 3 spelling exactly.
- `No update available` even though latest tag is newer — plugin
  caches `latest.json` for 1h by default. Restart the app or wait.
