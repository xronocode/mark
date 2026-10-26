# Acceptance and release trains

Owner instruction recorded on 2026-10-19: a confirmed fix joins a release train; accepting it does not start a release. This protocol governs delivery bookkeeping and release admission. Existing GRACE specs/plans still govern implementation and structural refactors.

Owner instruction recorded on 2026-10-26: the five train rules below now govern how trains run — collection, admission, dispatch, acceptance and release. Timer-default publication is repealed; publication is manual-only.

Current train: [2.8.2-next](2.8.2-next.md). It opens after v2.8.1 for the 2.8.2 patch; [2.9.x-next](2.9.x-next.md) keeps collecting the 2.9.0 minor and becomes current again once 2.8.2 ships. Tools and workflows find the current train through [`current.json`](current.json) — switching trains means editing that one pointer and this line, nothing in CI.

## The five train rules (owner instruction, 2026-10-26)

These rules govern how trains run — collection, admission, dispatch, acceptance and release. Where older automation text in this file disagrees, the rules win.

1. **The train always waits.** No timer and no automatic publication dispatches a train. The only way a train departs is an explicit owner instruction (“send it”). The timer-default publication after a no-veto window (C-RELEASE-TIMING, commit `da13980e`) is repealed by this protocol; the CI change that removes it lands separately. Publication is manual-only.
2. **Version is negotiated, never defaulted.** A collecting train carries no version — like today's 2.9.x-next, target unassigned. The version is decided in an owner discussion immediately before dispatch; SemVer is one option in that discussion, not an automatic choice, and nothing derives a version from PR titles or commit conventions. The tag follows only after the owner confirms the version.
3. **Admission is explicit and open to any mergeable PR.** Any PR that is mergeable with green CI can be laid into the current collecting train, by anyone — owner, PR author or agent. Admission is a separate `chore(train)` commit recording the PR in the train manifest, exactly like today. A non-mergeable PR is not admitted; it waits.
4. **Every admission carries a testing protocol.** The train-manifest entry for each admitted PR contains a testing protocol: what was run automatically (test suites, e2e, with results), what was verified manually before admission (scenarios, date, build), and what was intentionally not verified and why. An admission without a protocol is invalid.
5. **Before owner approval: build plus a manual acceptance protocol.** After dispatch, once the train PR is green, a real artifact is built with the application identifier following the train scheme — a version shape like `2.9.0-train.N`, agreed during the version discussion. One consolidated manual-acceptance protocol per train is opened alongside the artifact: what to check by hand on that build, with scenarios drawn from the admitted changes and a verdict field per scenario for the owner. Automated-test results are not duplicated there — green CI of the train PR already covers them — so the acceptance protocol contains only manual-check items.

The two documents stay distinct:

| Document | Opens | Contains |
|---|---|---|
| Testing protocol | At admission, inside the train-manifest entry | Automatic evidence before admission (suites, e2e, results) plus manual evidence gathered before admission (scenarios, date, build), and what was intentionally not verified with the reason. |
| Acceptance protocol | Before owner approval, alongside the dispatch build | Manual-only checks on the fresh train build — scenarios drawn from the admitted changes, one verdict field per scenario for the owner. No automated results: green CI of the train PR already covers them. |

## A fix moves through these stages

| Stage | Required record | Next action |
|---|---|---|
| Reported | Stable item ID, date, symptom, expected behavior and reproduction or missing details | Investigate and scope the repair. |
| Fixed | Source commit(s), affected behavior and remaining limitations | Run the relevant checks. |
| Verified | Automated evidence and the exact test build | Feed the evidence into the item's testing protocol. |
| Queued | Train ID, the admission `chore(train)` commit, integration state and the item's testing protocol | Continue collecting; only the owner's instruction dispatches. |
| Accepted | Owner verdicts per scenario in the train's consolidated acceptance protocol on the dispatch build — recorded in the [acceptance registry](../acceptance/README.md) | Await the owner's release instruction. |
| Released | Owner-confirmed version/tag/commit, release run and actual channel evidence | Close this delivery record. |

An item can be integrated into main before or after its admission. Keep **admission**, **acceptance**, **integration** and **publication** distinct. Admission records that a mergeable PR belongs to the train; it is not integration, and it is not owner acceptance. Green tests or main ancestry never count as owner acceptance or delivery to users.

Reuse a C-* ID when one exists. A small repair without a C-* bundle receives a delivery ID such as FIX-001; this records facts and does not retroactively invent an approved GRACE change. Implementation scope continues to follow the project contract rules.

## Admission and its testing protocol

Admission is how a PR joins the current collecting train (rule 3):

1. Any PR that is mergeable with green CI may be admitted — by the owner, the PR author or an agent alike.
2. Admission is a separate `chore(train)` commit that records the PR in the train manifest, exactly like today.
3. The manifest entry must carry a testing protocol (rule 4): what was run automatically (test suites, e2e, with results), what was verified manually before admission (scenarios, date, build), and what was intentionally not verified and why. An admission without a testing protocol is invalid.
4. A non-mergeable PR is not admitted; it waits.

Acceptance is not an admission gate. The owner's verdicts are collected once per train in the consolidated acceptance protocol opened on the dispatch build (rule 5) and mirrored into the [acceptance registry](../acceptance/README.md). When the owner confirms an active check outside a train protocol, record the owner/date and precise scenario, link the source commit and verification evidence, and identify the tested artifact by source revision plus binary hash or CI artifact/run — product version alone is insufficient for a local test build.

Acceptance covers the scenarios actually reviewed. Testing Shift+Up/Down does not accept unrelated table/export changes in the same binary. A material change to accepted behavior sets the item to `needs-recheck`; preserve the earlier acceptance and its build as history. A rejected or unresolved item stays pending or moves to a later train with the reason recorded.

## The train has its own lifecycle

- **Collecting:** admitted PRs accumulate. The train carries no version in this state — like today's 2.9.x-next, target unassigned (rule 2). Membership, materials and code may still change. `payloadSha`, live check evidence and candidate digests are unset.
- **Preparing:** the owner has instructed dispatch and the version discussion has fixed the version. A reviewed preparation (train) PR sets the agreed version with `npm version <x.y.z> --no-git-tag-version` (package.json is the only version authority) and runs `npm run release:normalize -- --write`, which propagates it to Cargo, Tauri, the preflight fixture, the train ledgers, CHANGELOG and the draft materials. Preparation never creates a tag or release; the tag follows only after the owner confirms the version.
- **Frozen:** the product payload is immutable and every commit since the previous boundary is classified. A following metadata-only seal records `payloadSha`, fresh screenshot review and final evidence. The seal span may hold any number of commits (squash or merge) as long as every one touches only release bookkeeping — train ledgers and README screenshot manifests; a bookkeeping correction is one more commit, never a re-freeze.
- **Ready:** strict readiness has proved the payload-to-seal delta, the owner verdicts from the train's acceptance protocol on the dispatch build, live checks, materials and digests. The train may now present the input-free `release-authorize` deployment — the owner's explicit release instruction. Ready is not itself authorization, and nothing departs on a timer. The tag binds to the seal, which only has to stay on main: ordinary work may merge again while the approval waits.
- **Released:** the owner-approved bot tag has passed tag-only signing, and publication ran on the owner's explicit instruction only — manual-only, never a timer default (rule 1). Actual GitHub/updater/Homebrew outcomes are appended.
- **Aborted:** the train is permanently retired without publication. Released and Aborted are terminal; continue work under a new immutable train ID.

Any membership, runtime or release-material change after Frozen or Ready returns the train to Collecting and clears payload/check/digest readiness. Preserve historical owner acceptance unless the accepted behavior itself changed; changed behavior becomes `needs-recheck`. Rejection or timeout of an Environment approval fails that attempt but does not automatically move the train to Aborted.

Keep one collecting stabilization train. On completion, retain its record with the released version and start a new file with a distinct train ID. Train IDs, item IDs and file paths remain stable and are never reused; update the Current train link above to select the new train. Record moved/deferred items and destination rather than silently removing their history.

Before freezing, compare the proposed candidate with the previous release. Every user-visible change in that diff must be accounted for. Main or a parent commit may contain an unaccepted feature; resolve it through acceptance or a reviewed adjustment of the release branch. A queue row cannot exclude code that is still present in the candidate.

Required release admission evidence:

- Each admitted item's testing protocol and integration commit; the consolidated acceptance protocol carries fresh owner verdicts for any behavior change.
- Candidate-specific passing CI, relevant local/browser/native checks, and applicable speed/memory/size comparisons. Preserve existing thresholds.
- No known content-loss or release-blocking defect in the included flows.
- Reviewed contents and release materials covering both C-* changes and small FIX-* repairs.
- The owner-confirmed version from the dispatch discussion, and the owner's explicit instruction to release this train/version. Record the instruction separately from acceptance.

## Automated preparation and publication boundary

`docs/release-trains/<train>.json` is the reproducible authority. GitHub Projects is a public, one-way operational mirror: an outage or missing Project scope is visible drift, not permission to bypass readiness. Conventional PR titles may describe their changes, but they never choose the version: the owner negotiates it immediately before dispatch and the preparation PR applies the agreed version (rule 2). Release-bearing merges are held only while the train is Preparing or Frozen.

Boundary note 2026-10-22 (v2.7.0 cycle): the v2.6.0 tag was re-pointed to `3ad251f7` during its manual draft completion, so successor trains anchor `previousRelease` (commit/bootstrap/tree) at that actual tag target.

Conveyor note 2026-10-24 (C-RELEASE-CONVEYOR): the 2.8.1 cycle needed 15 bookkeeping commits for one fix because the seal had to be exactly one commit over the payload while PRs merged as merge commits, Release Please computed a competing version (2.8.2), and the train ID was hardcoded in 11 CI/tool/test files. The repository now allows squash merges only, the seal span is checked commit by commit instead of counted, package.json is the single version authority, and `current.json` names the train.

After a Ready seal is merged, `release/promote` derives the tag and seal from the checked-out repository. The `release-authorize` Environment is the explicit owner release instruction. A purpose-specific GitHub App creates one annotated tag at that seal; reruns are no-op only for the same peeled target. The tag workflow rejects another actor, a lightweight/wrong-target tag, stale checks or a non-Ready train before signing. Manual dispatch is always unsigned build-only.

Production signing uses only the tag-restricted `release-signing` Environment. Publication is manual-only (rule 1): it begins solely from the owner's explicit instruction — the `release-authorize` approval that created the tag — and no timer or default ever publishes on its own. The timer-default publication after a bounded no-veto window (C-RELEASE-TIMING, commit `da13980e`, 2026-10-24) is repealed by this protocol; the CI change that removes the window lands separately. Once instructed, publication creates or resumes a draft, compares every existing asset byte-for-byte, verifies the asset digest inventory, `latest.json` and reviewed notes, and changes `draft=false` only as its final mutation. Automation never clobbers a published asset or retargets/deletes a published tag. With immutable releases enabled, a post-publication text correction uses GitHub's allowed notes-only edit path; binaries and tags require a new release.

## Recovery matrix

| Failure | Required recovery |
|---|---|
| Release-preparation PR fails or is closed | Fix or regenerate the PR. No tag exists; return to Preparing or Collecting. |
| Preparation merges but no seal/tag exists | Reconcile the exact diff, acceptance and materials; create a new metadata-only seal only after the payload is stable. |
| Payload/check/screenshot evidence is stale | Return to Collecting, clear readiness evidence, rebuild the payload and obtain fresh affected acceptance. |
| `release-authorize` or signing approval is rejected/times out | Record the failed attempt and retry the same unchanged seal later; do not mark Aborted automatically. |
| A publication run is cancelled or fails part-way | Publication never restarts on its own. Artifacts stay retained (30 days); record the stopped attempt and re-run the release later from the same tag on a new owner instruction, or retire the train explicitly. |
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

Statements such as “works”, “accepted”, “mark for release”, “include in the next patch”, and a request to freeze/review the candidate authorize the corresponding preparation or queue update. They do not authorize version bumps, tags, publishing workflow dispatches, store uploads or tap publication. An explicit release instruction authorizes its stated release scope; do not ask again for steps already authorized by it.

After that instruction, follow the [repository release procedure](../release-process.md). Do not infer a release from a test result. Ordinary integration/CI and local test builds remain separate from publication.

After publication, record GitHub assets, updater `latest.json`, Homebrew version/hash and any other channels included in that release's scope. App Store approval has its own version and external status; do not infer it from a direct-download release. A successful workflow alone is not proof that an update is available to users.

## Keep one small record per item

Use the train file as the delivery ledger; C-* bundles and routed verification retain their own implementation/evidence details. Roadmaps link to it instead of maintaining another acceptance list. Record status changes as short dated events. A new runtime, database, scheduling service or per-click approval flow is unnecessary for this protocol.

Template for an item:

```markdown
### C-... or FIX-...

- Summary / reported / reproduction:
- Source commit(s) / integration state:
- Testing protocol (required at admission): automated runs with results; manual checks with scenarios, date and build; intentionally unverified items with reasons.
- Tested artifact / source revision / artifact hash:
- Owner acceptance: verdicts in the train's acceptance protocol — date and precise scope.
- Train / state / remaining gates:
- Release note draft:
- History: dated status changes; the `release-authorize` approval is the release authorization, and publication follows only the owner's explicit instruction — never a timer.
```

## Release pages before v2.8.2

GitHub release pages and `v*` tags before v2.8.2 are retired. In the train ledgers and change bundles, a `vX` reference names the released version and its recorded commit, not a live page. The notes and asset digests of every retired release, and the tags that had no release, were exported on 2026-10-25 to [github-releases-archive.json](../release-notes/github-releases-archive.json); the release history is on the [website changelog](https://mark.xronocode.com/changelog).
