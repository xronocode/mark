# Acceptance registry — the ordered record of artifacts, reviews and owner verdicts

This registry is the **evidence trail** behind the [release trains](../release-trains/README.md).
The train remains the admission authority; this document answers, for every delivery
item of `2.6.x-next` onward: **what was built, what was reviewed, when the owner
accepted or rejected it, and why anything went back for rework.**

- Machine authority: [registry.json](registry.json) — validated by `node tools/acceptance-registry.mjs --check`,
  which also runs inside the standard test matrix (`tests/renderer/acceptance-registry.test.js`).
- Pre-2.6.0 acceptance history is frozen prose in the Released `2.5.x-next` record; the registry starts at `2.6.x-next`.
- From 2.9.x-next, train acceptance runs include CUA e2e on the Windows polygon:
  [CUA e2e acceptance on the Windows polygon](cua-e2e-windows-polygon.md) (owner instruction 2026-10-30).

## Lifecycle (one vocabulary with the trains)

| State | Meaning | Recorded by |
|---|---|---|
| `reported` | Symptom with a stable item id | any agent |
| `repaired` | Source commits exist | implementing agent |
| `reviewed` | A named review pass with its verdict (independent technical review, owner review, or another recorded reviewer) — one event per pass | reviewer |
| `artifact-offered` | An isolated test artifact + one Markdown case file per acceptance case is in the owner's hands (see Artifact requirements), or an explicit `notApplicable` / `blocked` reason stands in | agent |
| `owner-verdict` | The owner's dated verdict: `accepted` with exact scenarios, or `rejected` with the reason and the rework destination | owner (transcribed verbatim-scoped by the agent, same session) |
| `queued` | Recorded in the collecting train's manifest (`items.userFacing` with acceptance evidence) | agent |

Review records use `approve` or `changes-requested`; one historical pass carries `two-actionable`, meaning the review produced two actionable findings. Owner verdicts use `accepted` or `rejected`.

Rules:

- **Never inferred.** A missing verdict is `pending`, never an implied acceptance. Acceptance covers the
  listed scenarios only (train rule: per-item, no acceptance by implication).
- **Rejections keep their reason.** A `rejected` event records why and where the rework went; the item
  returns to `repaired` on the next wave, with history intact.
- **Artifacts are reproducible.** Each registry artifact carries source sha, isolated bundle identity,
  binary digest and build recipe; `tools/build-test-artifact.mjs` rebuilds equivalents. Wiped build
  directories never erase evidence.
- **Append-only.** Corrections append a superseding event; history is never edited.
- **Two-way consistency with the train** is enforced: an accepted item must be admitted in the train,
  and every train-pending repaired item must have an offer or a documented blocker (`notApplicable` / `blocked`).

## Artifact requirements

Isolated identity (never the owner's installed Mark), updater artifacts off, debug build,
binary SHA-256, launch/quit smoke, and a Markdown case file per acceptance case handed to
the owner. Tooling-only items may record `notApplicable` with their evidence instead of an
artifact.

### One Markdown file per acceptance case (owner instruction 2026-10-22)

Never hand the owner one long combined checklist. Every acceptance case gets its **own**
Markdown artifact, opened in Mark (the owner ticks and annotates in Mark itself; live
reload picks the verdict up):

- Location: `~/Downloads/mark-acceptance/<item-id>/<NN>-<case-slug>.md` — one folder per
  item, one file per case (`NN` = the case order, e.g. `01-cold-start-restore.md`).
- Each file carries: the item id and case number, the exact steps to perform, the
  expected result in verbatim form, a checkbox, and an outcome line
  (`принято` / `доработка` / `принято-с-замечаниями`) with room for the owner's note.
- The registry's `owner-verdict.scenarios` mirror the per-case files one to one; verdicts
  are transcribed by the same session that offered the cases.

## Prepared local build tool

Prepare dependencies explicitly from the reviewed lockfile with `npm ci` before a real
QA build. The builder does not acquire a missing tool. It checks the manifest and root
lock declaration, locked CLI version and SHA-512 integrity metadata, installed package
name/version and the contained regular JavaScript entry. It then invokes that entry
through the current Node executable. Missing or inconsistent tooling fails with
`MT_QA_LOCAL_TOOL_INVALID` before configuration, build or registry writes. Comparing
metadata does not verify every installed file against the package tarball digest.

Help and `--dry-run` remain available without installed dependencies. The existing
isolated identity, updater-artifacts-off configuration, platform targets, binary digest,
optional smoke and registry recipe are preserved. A successful build records an
artifact; it never supplies an owner acceptance verdict.

Only these exact environment names reach the unsigned build child:

- Runtime: `PATH`, `HOME`, `USERPROFILE`, `USER`, `LOGNAME`, `TMPDIR`, `TMP`, `TEMP`,
  `LANG`, `LC_ALL`, `LC_CTYPE`, `SystemRoot`, `WINDIR`, `COMSPEC`, `PATHEXT`,
  `SystemDrive`, `LOCALAPPDATA`, `APPDATA`.
- Native toolchain: `CARGO_HOME`, `RUSTUP_HOME`, `RUSTUP_TOOLCHAIN`, `DEVELOPER_DIR`,
  `SDKROOT`, `MACOSX_DEPLOYMENT_TARGET`, `CC`, `CXX`, `AR`, `CFLAGS`, `CXXFLAGS`,
  `CPPFLAGS`, `LDFLAGS`, `LIB`, `INCLUDE`, `LIBPATH`, `WindowsSdkDir`,
  `WindowsSDKVersion`, `UniversalCRTSdkDir`, `UCRTVersion`, `VCToolsInstallDir`,
  `VCINSTALLDIR`, `VSINSTALLDIR`.

Windows names are matched case-insensitively and emitted once. Unrelated cloud,
GitHub, Apple signing and updater credentials, `NODE_OPTIONS`, registry tokens and
wrapper variables are not forwarded. This minimizes inherited environment for prepared
trusted tooling; it is not a filesystem sandbox or a signed-release security boundary.

## Manual CI installer handoff

The `release.yml` manual lane builds unsigned, updater-disabled macOS arm64 DMG and
Windows x64 NSIS packages under a unique QA application name and bundle identifier.
Production tag publishing and signing are separate. A workflow run or package never
supplies an owner acceptance verdict.

Before dispatching, record the owner's explicit request for a concrete active,
unfinished test and permission to dispatch the exact candidate. The required
`qa_test_case` input is a safe case ID such as `CI-F002`; entering it does not create
that request or grant authorization. This repository change authorizes no dispatch
and asserts no current installer-retention request.

Each platform artifact is named
`mark-qa-<platform>-<actual-checkout-SHA>-<run-ID>-<attempt>` and contains only its
installer and `qa-manifest.json`. The manifest binds the actual checkout and candidate
head separately, source/run/attempt/platform, isolated identity, configuration digest,
installer filename, byte length and SHA-256, and unfinished test. Missing, empty,
ambiguous or linked package outputs fail collection. The upload receipt records the
remote artifact ID and ZIP SHA-256 separately from the installer's SHA-256. Evidence
uploads contain manifests, logs and cleanup results, never packaged applications.

Download only the exact recorded artifact ID. Verify the downloaded ZIP against its
upload digest, then verify the contained installer bytes and length against the
manifest before launch. Record the exact installed path, source, bundle identity,
binary digest and owned process IDs. Use an isolated test profile, normal Quit and
finally cleanup; verify processes and windows stopped, then remove the task's local
app, installer and duplicate executable copies. Keep the recipe, identities, digests
and results as evidence, with deleted binaries marked unavailable.

The remote installer exists only for that separately requested unfinished test, with
a maximum one-day expiry. When the test finishes or is cancelled, delete its exact
remote artifact ID and verify absence; expiry is a fallback, not a reason to retain a
completed test. Preserve lifecycle evidence. A later test requires a fresh reviewed
candidate and build. Record any failed cleanup with exact remaining paths and PIDs.

Ordinary `release-tauri.yml` PR/push/manual dry runs complete their install/startup
smoke on the ephemeral runner. They install an exclusive, run-specific QA app rather
than the owner's production app, request normal Quit for the exact bundle/executable
and PID, verify process/window shutdown and remove all completed binary copies in
finally cleanup. They upload lifecycle metadata and warning logs only. The original
size threshold, warning allowlist and installed-app launch gate still apply. Pure
fixture tests do not establish native-runner success or actual installer delivery;
those require exact-candidate CI and a separately authorized two-platform handoff.

## Survey (generated from registry.json — `node tools/acceptance-registry.mjs --survey`)

| Item | State | Artifact | Verdict / Why pending |
|---|---|---|---|
| FIX-010 | reviewed | — | accepted 2026-10-21 |
| FIX-012 | reviewed | — | accepted 2026-10-21 |
| FIX-015 | reviewed | — | accepted 2026-10-21 |
| FIX-016 | reviewed | — | accepted 2026-10-21 |
| DEPS-FOLLOW-REDIRECTS | reviewed | — | accepted 2026-10-21 |
| FIX-013 | owner-verdict | Tooling-only change with no product behavior; acceptance evidence is the suite result (Node 25 polygon green without env overrides; Node 22 byte-identical args). Owner may accept by review. | accepted 2026-10-22 |
| FIX-014 | owner-verdict | Windows artifact required; polygon (the Windows test laptop) offline 2026-10-21 (ping 100% loss). Owner options: (a) polygon online -> NSIS from the branch via the standard procedure; (b) accept on the pixel-measured amendment-5 crops of polygon rebuild 8 already reviewed. | accepted 2026-10-22 |
| FIX-009 | owner-verdict | mark-test-fix009-7057d645 | 7 scenarios offered to the owner (3 cold-start incl. the P1 frozen-restore case, 4 current-run recovery); per-item verdicts pending. |
| C-SELF-CONTAINED-HTML-EXPORT | reviewed | No isolated test artifact was built: the owner accepted on the in-session automated evidence (unit/component/e2e matrix above); a live manual export on macOS was not performed by the owner. | accepted 2026-10-22 |
| C-MULTI-SOURCE-WORKSPACE | owner-verdict | mark-test-msw-ab3367c2 | pending |
| FIX-019 | queued | mark-test-fix019-52443b1 | accepted 2026-10-25 |
| FIX-021 | queued | — | pending |
| M-046-LANE-TRAINS | queued | — | pending |
| MACOS-15-RUNNERS | queued | — | pending |
| td-1 | queued | — | pending |
| C-TABLE-SEQUENTIAL-RESIZE | queued | mark-table-fix-827b138 | accepted 2026-11-10 |
| C-TABLE-FITTED-RESET | queued | mark-viewer-test-3d54d2b | accepted 2026-11-10 |
| C-VIEWER-WINDOW-DRAG | queued | mark-viewer-test-3d54d2b | accepted 2026-11-10 |
| C-HOSTED-VALIDATION-RECOVERY | owner-verdict | mark-clipboard-test-18a06b37 | accepted 2026-11-10 |
| C-SAVE-CLOSE-DATA-SAFETY | queued | mark-save-close-fa25b309 | accepted 2026-11-10 |
| C-MD-LINK-TABS | queued | mark-links-94db8add | accepted 2026-11-10 |
| FIX-EMOJI-TIMESTAMPS | queued | mark-timestamps-debfe25d | accepted 2026-11-10 |
