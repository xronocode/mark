# Acceptance and release trains

Owner instruction recorded on 2026-10-19: a confirmed fix joins a release train; accepting it does not start a release. This protocol governs delivery bookkeeping and release admission. Existing GRACE specs/plans still govern implementation and structural refactors.

Current train: [2.8.x-next](2.8.x-next.md). It opens after v2.8.0 (released 2026-10-23 from [2.7.x-next](2.7.x-next.md)) and carries the FIX-018 PDF-export root-cause patch (the owner's «2.8.1»); no release activity authorized yet. The predecessor [2.5.x-next](2.5.x-next.md) is Released as v2.6.0.

## A fix moves through these stages

| Stage | Required record | Next action |
|---|---|---|
| Reported | Stable item ID, date, symptom, expected behavior and reproduction or missing details | Investigate and scope the repair. |
| Fixed | Source commit(s), affected behavior and remaining limitations | Run the relevant checks. |
| Verified | Automated evidence and the exact test build | Present the fix for owner acceptance. |
| Accepted | Owner, date, tested build, accepted scenarios and explicit confirmation — recorded in the [acceptance registry](../acceptance/README.md) | Queue the accepted scope in the current train. |
| Queued | Train ID plus integration state and remaining release gates | Continue collecting or prepare a candidate. |
| Released | Version/tag/commit, release run and actual channel evidence | Close this delivery record. |

An item can be integrated into main before or after acceptance. Keep **acceptance**, **integration** and **publication** distinct. A local accepted commit may be queued while integration remains pending. Green tests or main ancestry do not count as owner acceptance or delivery to users.

Reuse a C-* ID when one exists. A small repair without a C-* bundle receives a delivery ID such as FIX-001; this records facts and does not retroactively invent an approved GRACE change. Implementation scope continues to follow the project contract rules.

## Record acceptance immediately

When the owner confirms that the active check works:

1. Record the owner/date and precise scenario in the train item; link the source commit and existing verification evidence.
2. Identify the tested artifact by source revision plus binary hash or CI artifact/run. Product version alone is insufficient for a local test build.
3. Move that item to `queued` in the collecting train. If the owner names a different train, use that destination.
4. Update nearby verification/handoff references to point to the acceptance record.

Acceptance covers the scenarios actually reviewed. Testing Shift+Up/Down does not accept unrelated table/export changes in the same binary. A material change to accepted behavior sets the item to `needs-recheck`; preserve the earlier acceptance and its build as history. A rejected or unresolved item stays pending or moves to a later train with the reason recorded.

## The train has its own lifecycle

- **Collecting:** accepted items accumulate. Membership, materials and code may still change. `payloadSha`, live check evidence and candidate digests are unset.
- **Preparing:** Release Please owns the proposed SemVer, primary package version and CHANGELOG in a preparation PR; trusted normalization updates the remaining version surfaces. Preparation never creates a tag or release.
- **Frozen:** the product payload is immutable and every commit since the previous boundary is classified. A following metadata-only seal records `payloadSha`, fresh screenshot review and final evidence; the seal may change only allowlisted release records.
- **Ready:** strict readiness has proved the payload-to-seal delta, owner acceptance, live checks, materials and digests. The train may now present the input-free `release-authorize` deployment. Ready is not itself authorization.
- **Released:** the owner-approved bot tag has passed tag-only signing and the separately approved draft-first publication. Actual GitHub/updater/Homebrew outcomes are appended.
- **Aborted:** the train is permanently retired without publication. Released and Aborted are terminal; continue work under a new immutable train ID.

Any membership, runtime or release-material change after Frozen or Ready returns the train to Collecting and clears payload/check/digest readiness. Preserve historical owner acceptance unless the accepted behavior itself changed; changed behavior becomes `needs-recheck`. Rejection or timeout of an Environment approval fails that attempt but does not automatically move the train to Aborted.

Keep one collecting stabilization train. On completion, retain its record with the released version and start a new file with a distinct train ID. Train IDs, item IDs and file paths remain stable and are never reused; update the Current train link above to select the new train. Record moved/deferred items and destination rather than silently removing their history.

Before freezing, compare the proposed candidate with the previous release. Every user-visible change in that diff must be accounted for. Main or a parent commit may contain an unaccepted feature; resolve it through acceptance or a reviewed adjustment of the release branch. A queue row cannot exclude code that is still present in the candidate.

Required release admission evidence:

- Accepted scenarios and integration commit for each included item; any new behavior change has fresh acceptance.
- Candidate-specific passing CI, relevant local/browser/native checks, and applicable speed/memory/size comparisons. Preserve existing thresholds.
- No known content-loss or release-blocking defect in the included flows.
- Reviewed contents and release materials covering both C-* changes and small FIX-* repairs.
- The owner's explicit instruction to release this train/version. Record it separately from acceptance.

## Automated preparation and publication boundary

`docs/release-trains/<train>.json` is the reproducible authority. GitHub Projects is a public, one-way operational mirror: an outage or missing Project scope is visible drift, not permission to bypass readiness. Conventional PR titles determine SemVer (`fix` patch, `feat` minor, `!`/`BREAKING CHANGE` major); Release Please prepares a PR and never tags or publishes.

Boundary note 2026-10-22 (v2.7.0 cycle): the v2.6.0 tag was re-pointed to `3ad251f7` during its manual draft completion, so successor trains anchor `previousRelease` (commit/bootstrap/tree) and release-please `bootstrap-sha` at that actual tag target. Sealing stays a single metadata-only commit after a fully green payload.

After a Ready seal is merged, `release/promote` derives the tag and seal from the checked-out repository. The `release-authorize` Environment is the explicit owner release instruction. A purpose-specific GitHub App creates one annotated tag at that seal; reruns are no-op only for the same peeled target. The tag workflow rejects another actor, a lightweight/wrong-target tag, stale checks or a non-Ready train before signing. Manual dispatch is always unsigned build-only.

Production signing uses only the tag-restricted `release-signing` Environment. GitHub publication uses the separate `release` Environment as the owner's second confirmation. It creates or resumes a draft, compares every existing asset byte-for-byte, verifies the asset digest inventory, `latest.json` and reviewed notes, and changes `draft=false` only as its final mutation. Automation never clobbers a published asset or retargets/deletes a published tag. With immutable releases enabled, a post-publication text correction uses GitHub's allowed notes-only edit path; binaries and tags require a new release.

## Recovery matrix

| Failure | Required recovery |
|---|---|
| Release-preparation PR fails or is closed | Fix or regenerate the PR. No tag exists; return to Preparing or Collecting. |
| Preparation merges but no seal/tag exists | Reconcile the exact diff, acceptance and materials; create a new metadata-only seal only after the payload is stable. |
| Payload/check/screenshot evidence is stale | Return to Collecting, clear readiness evidence, rebuild the payload and obtain fresh affected acceptance. |
| `release-authorize`, signing or publication approval is rejected/times out | Record the failed attempt and retry the same unchanged seal later; do not mark Aborted automatically. |
| Project sync lacks scope or GitHub Projects is unavailable | Keep the repository manifest authoritative, report non-required mirror drift and retry the one-way sync. |
| GitHub control apply stops part-way | Stop on the first mismatch, retain the external snapshot and append-only journal, then use the owner-local reverse-order rollback or resume after read-back. Never copy Environment secret values. |
| Draft upload/read-back fails | Leave the release as a draft. A rerun may add missing assets or accept identical bytes; differing existing bytes require investigation, never `--clobber`. |
| Tag exists but build/publication fails | Preserve the annotated tag and append the attempt result. Repair by a new payload/version unless the same immutable inputs can be safely rerun. |
| GitHub release succeeds but Homebrew fails | Keep the GitHub/updater channel recorded as released and retry only the cask PR with the published DMG sidecar hash. |

Post-tag attempts and per-channel outcomes are append-only. Accepted, queued, Frozen, Ready, a green workflow, or a reviewed draft never substitutes for release authorization.

### Retry a failed Homebrew handoff

The `publish-cask` job is idempotent: an exact open bot PR is re-verified and scheduled for squash auto-merge behind the tap's required `cask/validate` check; an exact already-merged PR is success after the main-branch version and sidecar hash are read back. A branch without that PR, a mismatched author/title/base, or a closed-unmerged PR fails closed. If GitHub publication succeeded and `publish-cask` is the only failed job, retry it from the same release run while its artifacts are retained (30 days):

```bash
gh run list --repo xronocode/mark --workflow release.yml --limit 10
gh run view <run-id> --repo xronocode/mark --json jobs \
  --jq '.jobs[] | {name, conclusion, databaseId}'
gh run rerun <run-id> --repo xronocode/mark --failed
```

Before rerunning, fix only the external cause (for example the `release-cask` Environment credentials, tap repository permission, or required tap check). Do not delete or recreate the release tag, upload replacement assets, use `--clobber`, or start a new release. The rerun consumes the retained `Mark_<version>_aarch64.dmg.sha256` sidecar and either verifies the exact merged cask, re-arms auto-merge on the exact open PR, or opens it once.

If the workflow artifacts have expired, stop. Downloading a public sidecar and creating a replacement cask-only automation path requires a separately reviewed recovery change; it is not permission to rebuild or republish the released version.

## Owner-only GitHub rollout

Repository files describe the desired controls, but they cannot safely install Apps, copy secret values, or approve their own protections. GitHub Project node IDs recorded in the governance manifest are public GraphQL resource identifiers, not credentials. The owner completes the following once, outside CI, before activating the rulesets.

1. Create or verify the purpose-specific GitHub App installations:
   - release preparation on `xronocode/mark`: Contents write and Pull requests write;
   - release authorization on `xronocode/mark`: Contents write only;
   - cask handoff on `xronocode/homebrew-mark`: Contents write and Pull requests write.
2. Configure release preparation on `xronocode/mark`:
   - repository variable `RELEASE_PREP_APP_ID`;
   - repository secret `RELEASE_PREP_APP_PRIVATE_KEY`.
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
   - `release` intentionally has no secret; it is the second owner approval boundary.
5. Verify Environment policies match `.github/release-governance.json`: `release-authorize` accepts only `main`; `release-signing`, `release`, and `release-cask` accept only `v*` tags; `xronocode` is the required reviewer for `release-authorize` and `release`.
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

Statements such as “works”, “accepted”, “mark for release”, “include in the next patch”, and a request to freeze/review the candidate authorize the corresponding preparation or queue update. They do not authorize version bumps, tags, publishing workflow dispatches, store uploads or tap publication. An explicit release instruction authorizes its stated release scope; do not ask again for steps already authorized by it.

After that instruction, follow the [repository release procedure](../../AGENTS.md#release-cutting-a-new-version). Do not infer a release from a test result. Ordinary integration/CI and local test builds remain separate from publication.

After publication, record GitHub assets, updater `latest.json`, Homebrew version/hash and any other channels included in that release's scope. App Store approval has its own version and external status; do not infer it from a direct-download release. A successful workflow alone is not proof that an update is available to users.

## Keep one small record per item

Use the train file as the delivery ledger; C-* bundles and routed verification retain their own implementation/evidence details. Roadmaps link to it instead of maintaining another acceptance list. Record status changes as short dated events. A new runtime, database, scheduling service or per-click approval flow is unnecessary for this protocol.

Template for an item:

```markdown
### C-... or FIX-...

- Summary / reported / reproduction:
- Source commit(s) / integration state:
- Automated evidence:
- Tested artifact / source revision / artifact hash:
- Owner acceptance date and precise scope:
- Train / state / remaining gates:
- Release note draft:
- History: dated status changes; release authorization and publication stay separate.
```
