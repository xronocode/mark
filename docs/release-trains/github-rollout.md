# GitHub rollout and operator controls

One-time owner setup for the release pipeline: GitHub Apps, Environments,
secrets, rulesets, the public Project mirror, activation and rollback. This
runbook accompanies the [acceptance and release train protocol](README.md).
It configures the pipeline only and never authorizes a release.

## Owner-only GitHub rollout

Repository files describe the desired controls, but they cannot safely install Apps, copy secret values, or approve their own protections. GitHub Project node IDs recorded in the governance manifest are public GraphQL resource identifiers, not credentials. The owner completes the following once, outside CI, before activating the rulesets.

1. Create or verify the purpose-specific GitHub App installations:
   - release authorization on `xronocode/mark`: Contents write only;
   - cask handoff on `xronocode/homebrew-mark`: Contents write and Pull requests write.
2. Retired 2026-10-24 (C-RELEASE-CONVEYOR): the Release Please preparation App is no longer used. Uninstall it and delete the repository variable `RELEASE_PREP_APP_ID` and secret `RELEASE_PREP_APP_PRIVATE_KEY`; nothing reads them.
3. Run the staged controls apply with a fresh absolute journal path outside the repository. This creates the four Environments, enables immutable releases, sets default workflow permissions to read, and creates both rulesets with enforcement still disabled:

   ```bash
   npm run release:github-controls -- \
     --apply \
     --confirm-owner xronocode \
     --journal <absolute-path-outside-repo>/mark-release-controls-stage.ndjson
   ```

4. Populate Environment secrets manually; never copy them into the repository or journal:
   - `release-authorize`: `RELEASE_BOT_APP_ID`, `RELEASE_BOT_PRIVATE_KEY`;
   - `release-signing`: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`;
   - `release-cask`: `CASK_BOT_APP_ID`, `CASK_BOT_PRIVATE_KEY`;
   - `release` (restored as the synchronous publication gate; see C-RELEASE-MANUAL-PUBLISH): the legacy Environment kept its required reviewer and `v*` tag policy — confirm `xronocode` is still the required reviewer; do NOT delete it. The C-RELEASE-TIMING `release-notify` Environment and its `TG_NOTIFY_TOKEN`/`TG_NOTIFY_CHAT` secrets become obsolete with the repeal — one-time cleanup (GitHub UI; the REST API cannot delete environments): delete `release-notify` after the repealing change lands. Do not set `RELEASE_VETO_MINUTES`; the no-veto window it configured is repealed.
5. Verify Environment policies match `.github/release-governance.json`: `release-authorize` accepts only `main`; `release`, `release-signing`, and `release-cask` accept only `v*` tags; `xronocode` is the required reviewer for `release-authorize` (the tag, the first explicit release instruction) and for `release` (publication, the final owner approval before the release goes live) — publication is manual-only on the owner's instruction (the C-RELEASE-TIMING no-veto window is repealed).
6. Bootstrap the public Project mirror with a local token that can manage the owner's Projects v2, then commit the recorded Project number/node ID through the normal safety gate:

   ```bash
   PROJECT_MIRROR_AUTH=<owner-local-project-credential> \
     npm run release:project-sync -- \
       --apply --record-identity --confirm-owner=xronocode
   ```

   After the identity is recorded, add `PROJECT_MIRROR_AUTH` as the repository secret used only by the non-required `release/project-mirror` job. A Project outage remains visible drift and never weakens repository readiness.
7. Merge the automation through normal review and let `main` produce exactly one successful `GitHub Actions` check for each canary name: `status check`, `release/governance`, and `release/readiness`.
8. Run read-only confirmation, then activate the rulesets with a different fresh journal path:

   ```bash
   npm run release:github-controls -- --check
   npm run release:github-controls -- \
     --activate \
     --confirm-owner xronocode \
     --journal <absolute-path-outside-repo>/mark-release-controls-activate.ndjson
   npm run release:github-controls -- --check-active
   ```

   The first check proves the deliberately disabled staging state. The final
   `--check-active` proves both managed rulesets were actually mutated to and
   read back as `active`; it must never accept the staged disabled state.
9. In `xronocode/homebrew-mark`, enable repository auto-merge and activate the source-controlled `homebrew-mark-main-protection` ruleset only after the `cask/validate` canary succeeds. The ruleset requires a pull request plus the strict GitHub Actions check; it blocks force-push and deletion. The release App schedules, but cannot bypass, that required check.

Activation fails if a forbidden signing/App secret remains at repository scope, an Environment secret name is missing, staged controls drift, or any exact canary check is absent, duplicated, or not successful. Each apply/activate journal has a mode-`0600` snapshot beside it. Preserve both until rollout is accepted; rollback is owner-local and exact:

```bash
npm run release:github-controls -- \
  --rollback \
  --confirm-owner xronocode \
  --journal <the-corresponding-absolute-journal-path>
```

These actions configure the pipeline only. They do not freeze a train, approve an Environment deployment, create a tag, publish a release, or open a cask PR.
