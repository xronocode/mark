# Security Findings Validation and Remediation Plan

> **For agentic workers:** This is a proposed plan, not an approved GRACE change. Execute only after its requirements and task scopes have been captured in approved active GRACE specs and plans. The approved GRACE artifacts govern implementation and verification.

**Goal:** Correct the Markdown file-opening boundary and isolate live documents by enabled extension, session and tab; make gateway deployment tooling reproducible before it receives credentials.

**Architecture:** Keep validation at the backend opening and session mutation boundaries. Route live updates through the owning tab's store state, with explicit session identity on backend events. Install deployment tools from a dedicated lockfile in a credential-free preparation step and invoke the prepared CLI directly.

**Tech Stack:** Rust, Tauri, Axum/Tokio, Vue/Pinia, Muya, Node/npm, Vitest, Playwright, Cloudflare Wrangler, GRACE 4.

**Spec:** The user-supplied F-001–F-005 report and the source-validated requirements below. There is no approved active GRACE spec for this work yet.

**Reviewed:** 2026-11-11; `d14be7c5e37a80b8a4ac7d9d271928d9de5b4749`; initially clean Git worktree.

## Validation result

Four application defects have direct source support. F-002 establishes a deployment-tool acquisition risk; the stronger claim about a changing, exploitable published dependency graph remains unverified. All five deserve remediation, but these evidence levels should remain distinct.

| Finding | Source verdict | Consequence established by the source | Priority |
|---|---|---|---|
| F-001 | Confirmed opening-policy defect; Windows execution not reproduced | A sibling `.exe`, `.com`, `.bat` or `.cmd` can pass the application's extension check and reach the system opener after a link gesture | First; high impact if Windows launches the supplied file |
| F-002 | Acquisition and credential inheritance confirmed; dependency-graph exploitability needs validation | Deployment invokes remotely obtainable tooling without a repository-owned locked graph, while inheriting the owner's environment | Complete before the next gateway deploy |
| F-003 | Confirmed authorization defect | A retained token can authorize streaming after the registry marks its extension disabled | Second wave, with F-005 |
| F-004 | Confirmed document-ownership defect | A live patch can replace another selected tab's rendered buffer and clear its editor history | Second wave; protect document integrity |
| F-005 | Confirmed session-ownership defect | A second paired extension can learn the active session ID and replace its owner and content | Second wave, with F-003 |

The report's high/medium priorities are reasonable engineering triage, subject to its stated runtime limitations. Its `58/100` arithmetic is correct under the supplied formula, but that formula is a custom score, not CVSS or a measured probability of compromise. Do not publish the score as independently revalidated while F-002's stronger interpretation remains unresolved.

### F-001: executable files reach the external opener

`DANGEROUS_SHELL_OPEN_EXTENSIONS` at `src-tauri/src/m010_security.rs:64` omits the four named Windows extensions. `check_shell_open_extension` at line 363 performs a case-insensitive membership check, so those omissions pass. `validate_link_click_target` at `src-tauri/src/m_v1_compat.rs:947` checks both the requested and resolved names, then classifies a non-Markdown target as `Local`. The production dispatch at line 1015 calls `opener().open_path` without an application confirmation.

The directory fence constrains where the supplied program must reside; it does not prevent execution within that directory. Windows delivery is configured by `src-tauri/tauri.windows.conf.json` with an NSIS target. Microsoft documents that the Windows shell can launch executable files through its opening mechanism, supporting the proposed impact, but this review did not exercise the Tauri-to-Windows path. See [Microsoft's shell launch documentation](https://learn.microsoft.com/en-us/windows/win32/shell/launch).

Keep the conditions explicit: a user must activate the link, its companion file must exist, and Windows policy or security software may intervene. This is not execution merely from opening Markdown.

### F-002: separate the demonstrated mechanism from the threat scenario

`tools/stats-gateway/deploy-checked.mjs:74` executes `npx --yes wrangler@4.159.0 deploy`. No explicit `env` is supplied, so the process inherits the wrapper's environment. The documented command sequence in `tools/stats-gateway/README.md:189` exports Cloudflare credentials before running that wrapper. The root manifest and lockfile do not contain Wrangler; the gateway has no separate package manifest or lockfile.

The fixed top-level version is a useful control. It does not provide this repository with a reviewed dependency closure. npm documents that a missing requested package can be installed into its cache before execution. See [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec/).

The published Wrangler package, its dependency ranges, any published shrinkwrap or bundled dependencies, and the owner's npm/cache policy were not inspected successfully. An attempted read of the version's registry metadata was unavailable through the browsing tool. Therefore this review does not independently establish that `wrangler@4.159.0` currently resolves different transitive versions, that malicious lifecycle code exists, or that a token has leaked. Record those as validation gaps, not observed compromise. Do not treat the absence of an age filter as a separate vulnerability.

### F-003: disabling does not gate streaming

`mt_ext_disable` at `src-tauri/src/m045_ext/mod.rs:108` disables the registry entry before attempting credential deletion. `disable_surfaces_revoke_failure` at `src-tauri/src/m045_ext/tests.rs:1109` explicitly models a persistent secret surviving deletion and remaining valid. This test was read, not executed.

`handle_doc_open` at `src-tauri/src/m045_ext/live_server.rs:538` validates the supplied extension's secret directly. `validate_bearer` at line 380 obtains the current session's extension ID and checks only its secret; patch, close and heartbeat call this helper. None of those stream checks consults the registry's enabled state. Existing `authenticate_incoming` and `ExtRegistry::get_manifest` already demonstrate the enabled-state policy for the other incoming data routes.

The failed-delete precondition is required. Successful token removal blocks subsequent token validation, but the registry disable must also be sufficient on its own.

### F-004: the missing identity spans backend events and store updates

`src/renderer/src/components/liveViewer/index.vue:35` opens an untitled tab without retaining its identity. Its patch handler at line 48 emits `file-loaded` with only Markdown. `setMarkdownToEditor` at `src/renderer/src/components/editorWithTabs/editor.vue:2873` rejects a different ID only when one is provided; accepted content clears history and replaces the rendered buffer.

The gap starts earlier: `src-tauri/src/m045_ext/live_bridge.rs:111` emits patch content, section and revision, but no session ID. Both LiveViewer test files currently expect the anonymous bus route. `NEW_UNTITLED_TAB` at `src/renderer/src/store/editor.js:1562` creates the tab but does not return its ID on success.

Adding only `id` to the emitted bus payload would stop an unrelated selected tab from rendering that event, but would not update the background stream tab's stored Markdown. A complete fix must own both storage and rendering. The report correctly avoids claiming immediate disk overwrite: source-preservation logic and save policy complicate that separate outcome.

### F-005: session ID is incorrectly treated as ownership

`decide_open` at `src-tauri/src/m045_ext/live_server.rs:335` takes only an incoming session ID. The open handler authenticates the requesting extension, discloses `existing_session_id` on conflict, and replaces the entire session on an ID match, including `extension_id`. A second valid paired identity can therefore perform the two-step disclosure/replacement described in the report.

The existing resynchronization test at `src-tauri/src/m045_ext/tests.rs:677` tests only the session-ID predicate. It does not use two authenticated owners. The repair must deny cross-owner replacement even if the attacker already knows the exact session ID; hiding the ID alone is insufficient.

## Other report claims and scope

- Nine commits exist between `781fd825` and the reviewed HEAD. A direct path diff shows no changes in `live_server.rs`, `liveViewer/index.vue`, `deploy-checked.mjs` or `m010_security.rs`; `m_v1_compat.rs` did change. This supports the claim that F-002–F-005 and the extension-list omission predate the latest revision. The historical audit's conclusions themselves were supplied by the user and were not independently recovered.
- No requests were sent to the Mark/pages sites or deployed gateway during this review. The supplied site observations remain attributed to that report. Checking two homepages cannot establish the absence of vulnerabilities elsewhere.
- No full secret scan, dependency/CVE audit, broad protection re-audit, application run or test execution was performed. The work was a focused source review of the five claims plus remediation planning. Source facts are not test-pass evidence.
- Official npm and Microsoft documentation was consulted for tool and platform semantics. No dependency was installed, package code executed, credential accessed, or production deployment performed.

## Global constraints

- Repository artifacts remain in English. Frozen migration documents and archived change bundles remain unchanged.
- Preserve the document-directory fence and validation of both requested and canonical names. Markdown still opens inside the invoking document window.
- Use dummy credentials, fake opener sinks and isolated test fixtures. Never launch a supplied executable as a regression test.
- Preserve legitimate same-owner stream recovery, deterministic sections, duplicate handling and heartbeat behavior.
- A local file tab's Markdown, history, path, dirty state and saved bytes must not be modified by another tab's live stream.
- Retain exact-main deployment admission, successful-check requirements and private deployment receipts. Runtime Worker routes remain unchanged.
- No version bump, tag, publication, Worker deploy or release admission is included in this plan.

## Approaches and proposed decisions

These are recommendations for review, not choices already approved by the owner.

| Area | Alternatives | Proposed decision and tradeoff |
|---|---|---|
| Local links | Extend the executable denylist; or permit only enumerated external document types | Immediately block the named Windows execution types and common related launch types. Prefer an additional Markdown-link-specific allowlist to close the wider category; that changes behavior for unlisted attachments and needs explicit scope in the spec. No executable-confirmation UX is needed to fix the defect. |
| Streaming backend | Add disconnected endpoint checks; or centralize authorization and serialize ownership transitions | Use a shared mutation boundary for stream operations and disable, with credential I/O outside it. More plumbing, but it makes revocation and ownership rules consistent. |
| Streaming frontend | Add a tab ID to `file-loaded`; or make session/tab state a store responsibility | Use store-owned session-to-tab bindings and typed events. This also preserves background content and rejects delayed events after tab closure or session replacement. |
| Deploy tools | Add Wrangler to the root toolchain; or give the gateway a dedicated manifest and lockfile | Use a dedicated gateway toolchain, so desktop dependency installation need not carry deployment-only tooling. Keep `4.159.0` initially; dependency upgrades are separate reviewed changes. |

## Review focus

1. Windows case variants, trailing dots/spaces, alternate-stream syntax and file aliases must not bypass the opening policy. Unsupported ambiguous names should fail closed.
2. A request paused during credential validation must not mutate a session after its extension is disabled or the session owner changes.
3. A delayed patch or close from an older session incarnation must not alter a newer stream tab, even when the external session ID is reused.
4. A background or closed stream tab must never redirect content, history changes, dirty-state changes or a save into the selected local document.
5. A missing or mismatched local deployment tool must cause an error before any package acquisition or credential-bearing fallback.

## Implementation units

Use four independently reviewable changes: local-link policy, backend stream authorization, frontend stream ownership, and deployment tooling. Backend event identity is an additive prerequisite for the frontend unit. The deployment unit can be prepared independently and must land before another gateway deployment.

### Task 0: establish GRACE scopes and the verification baseline

**Files:** proposed active bundles under `.grace/changes/active/`; routed `.grace/graph/{runtime,features}.xml` and `.grace/verification/{runtime,features}.xml` when implementation starts.

**Interfaces:** the approved specs must carry the invariants, attachment-policy choice, session event schema and task acceptance matrix in this document. Suggested change IDs: `C-SEC-LINK-OPEN`, `C-SEC-STREAM-AUTH`, `C-SEC-STREAM-TABS`, `C-SEC-GATEWAY-TOOLS`.

- [ ] Capture the four proposed units as draft specs/plans, obtain their required approvals and declare disjoint ownership except for the explicit backend-to-frontend event dependency.
- [ ] Resolve existing integrity failures without modifying another worktree's work: determine the correct lint exclusion for nested worktrees, and reconcile the stale `C-STATS-READOUT` active reference with its actual lifecycle records. Do not fabricate an approved spec to satisfy lint.
- [ ] Run `grace lint --path . --assertions current` and record the clean implementation baseline before changing governed modules.

**Observed baseline:** `grace lint --path . --assertions current` exited 1 with 4 errors and 12 warnings. Three errors are module-map mismatches inside an ignored nested local worktree (`history.js`, `history-external-commit.test.js`, `split-dual-edit.test.js`). The fourth is the missing `.grace/changes/active/C-STATS-READOUT/spec.xml`. `grace status --path . --with modules --json` reported the same 4 integrity errors and unavailable module health. These predate this documentation-only change.

### Task 1: close Windows executable opening from Markdown — F-001

**Files:** modify `src-tauri/src/m010_security.rs`, `src-tauri/src/m_v1_compat.rs` and their inline tests; update M-010, the link-dispatch owner M-013-B and their routed verification records.

**Interfaces:** retain `check_shell_open_extension(&Path) -> Result<(), SecurityError>` and the existing `validate_link_click_target` / `dispatch_link_click_with` test seams. If the allowlist is approved, introduce `check_markdown_external_target(&Path) -> Result<(), SecurityError>` after internal Markdown classification and before `LinkClickTarget::Local` is returned.

- [ ] Add failing table-driven tests for `.exe`, `.com`, `.bat`, `.cmd`, case variants, sibling aliases, and requested-name/resolved-name disagreement. Also cover `.msi`, `.msp`, `.scr`, `.pif`, `.cpl`, `.hta`, `.ps1`, `.vbs`, `.vbe`, `.js`, `.jse`, `.wsf`, `.wsh`, `.reg`, `.inf` and `.appref-ms` in the policy matrix. This list is a regression set, not a claim of exhaustive executable types.
- [ ] On Windows fixtures, test ambiguous trailing-dot/space and alternate-stream names. Refuse ambiguous spellings rather than normalize them into an accepted executable. Keep existing path/device-prefix regressions.
- [ ] Extend the denylist and update its stale Windows-deferred comment. If approved, add the link-specific external allowlist: `pdf`, `txt`, `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `ico`, `tif`, `tiff`, `avif`; deny unlisted external types. Markdown recognition remains the existing internal route. The allowlist describes allowed product behavior, not a guarantee that external viewers have no bugs.
- [ ] In production-shaped dispatch tests, use fake document/web/local sinks. For every denied target assert zero sink calls. For `.md`, allowed image/PDF targets and HTTPS, assert exactly the intended sink runs. Existing read-error/no-fallback behavior must remain intact.
- [ ] Run the focused commands below, first against the added tests before the fix, then after it. Expected: the unsafe cases fail before and pass afterward, with no real opener invocation.

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml --bin mark m010_security
cargo test --locked --manifest-path src-tauri/Cargo.toml --bin mark link_click
```

**Acceptance:** no denied requested or resolved path reaches any opener; allowed attachments and internal document routing still work. The cross-platform fake-sink suite and Windows filename fixtures pass.

### Task 2: enforce enabled identity and session ownership — F-003, F-005

**Files:** modify `src-tauri/src/m045_ext/{mod,live_server,live_bridge,tests}.rs`; add only the necessary registry authorization helper in `registry.rs`; wire shared state in `src-tauri/src/main.rs`; update M-045 and affected bootstrap ownership/verification records.

**Interfaces:** change the pure decision helper to `decide_open(existing: Option<&LiveSession>, incoming_session_id: &str, incoming_extension_id: &str) -> OpenDecision`. Add a distinct foreign-owner conflict variant, with no session ID in its response. Manage the server's existing `Arc<LiveServerState>` through Tauri state so disable can close the session even when keyring deletion fails. Keep the App Store build without a listener.

- [ ] Extend handler-level mock-runtime fixtures to register two enabled extensions with distinct valid dummy tokens. Assert that owner B receives a generic 409 for both a different ID and owner A's exact ID; response bodies contain no A session ID, and session state/events remain unchanged. Assert A's legitimate resync still works.
- [ ] Extend failed-delete fixtures to open a stream, disable its owner with deletion failure, then call open/patch/close/heartbeat with the retained token. Assert denial, inactive session, no patch emission and one lifecycle close for the owner's active session. Disabling B must not close A's session. Keep all three existing incoming-data route checks.
- [ ] Gate stream access on a registered, enabled identity and its token. Keep blocking keyring work off the async executor and outside registry/session locks. At mutation time, recheck enabled identity and the exact session ownership under a consistent synchronization policy shared with disable. Lock ordering must be documented; a registry snapshot taken only before credential I/O is insufficient.
- [ ] Make disable fence authorization and deactivate its session before reporting credential failure. Denial paths must not modify content, revision or heartbeat. Lifecycle close is permitted to inform the renderer that disable ended its stream.
- [ ] Add deterministic barriers to pause token validation, disable or replace the session, and resume the stale request. Assert zero stale mutation/events. Exercise patch, close and heartbeat, not just open. This is a regression guard for the new synchronization design, not a sixth audited finding.
- [ ] Add `session_id` and a backend-assigned monotonic `session_epoch` to every live event, including patch and close. Increment the epoch on accepted open/resync; serialize event ordering with session transitions. Preserve the external HTTP request format. Capture event identity from the state being mutated, never a later lookup of the current session.
- [ ] Run `cargo test --locked --manifest-path src-tauri/Cargo.toml --bin mark m045_ext`. Expected: new authorization/ownership/race tests and existing recovery, sections and heartbeat tests all pass.

**Acceptance:** disabled identities cannot use any stream route despite retained credentials; foreign identities cannot disclose or replace an active session; stale authenticated requests cannot affect a replacement; same-owner recovery remains functional.

### Task 3: make live documents own their tabs — F-004

**Files:** modify `src/renderer/src/components/liveViewer/index.vue` and `src/renderer/src/store/editor.js`; adapt `src/renderer/src/components/editorWithTabs/editor.vue` and `src/renderer/src/components/editorWithTabs/sourceCode.vue` only where needed to consume owned content updates; update both `tests/renderer/components/liveViewer.test.js` and `tests/renderer/components/liveViewer/index.test.js`; add `tests/renderer/store/live-stream-ownership.test.js` and `tests/e2e/live-stream-ownership.spec.ts`; extend `playwright.config.ts`, `.github/workflows/test.yml`, existing editor integration tests and M-011/M-012/M-045 verification records.

**Interfaces:** introduce store actions `OPEN_LIVE_DOCUMENT({ sessionId, sessionEpoch, title, markdown }): string | null`, `PATCH_LIVE_DOCUMENT({ sessionId, sessionEpoch, revision, markdown }): boolean`, and `CLOSE_LIVE_DOCUMENT({ sessionId, sessionEpoch }): boolean`. Store bindings must include the created tab ID and session epoch. LiveViewer translates the typed backend events from Task 2 into these actions and must not emit anonymous `file-loaded` patches.

- [ ] Add a two-tab regression: open stream A, select local B with existing text/history, patch A. Assert B's rendered text, raw source, history, dirty state and path remain unchanged; A's stored text advances and appears when A is selected again.
- [ ] Store the new tab identity at creation rather than reading whichever tab is current after an asynchronous callback. Apply content only through the bound tab. Invalidate only that tab's stale render caches/history as needed, using the existing document ownership and saved-state rules. Never reuse another tab when the bound tab is missing.
- [ ] Cover rich, source and split modes; background updates; duplicate revisions; same-owner resync; out-of-order epochs; late patch/close after replacement; tab closure; and another open window. A same-session resync updates its existing live tab and advances the epoch. A closed binding must reject further patches for that incarnation and must not recreate a tab on a patch. Reopening requires an explicit later open event.
- [ ] Keep streamed content unsaved until the user explicitly chooses a destination. A stream update must not become a write to another local file. Test local B's bytes using a fake filesystem/save sink with autosave both off and on, including a pending save and a subsequent ordinary user edit.
- [ ] Replace tests that assert anonymous bus emission with assertions on owned store state and renderer effects. Keep the editor's stale-ID protection; the global compatibility behavior for unrelated event producers need not change.
- [ ] Add a browser integration test that uses a fixture event source and fake save sink, and checks both actual panes and stored tab state across switch/close/update. Add a `webkit-live-stream` project with `testMatch: 'live-stream-ownership.spec.ts'` and `browserName: 'webkit'`; existing WebKit projects have narrow matchers that would omit the new file. Include that project in the appropriate required CI test job. Chromium already discovers the proposed filename.
- [ ] Run the focused Vitest suites and the browser regression. Expected: B is unchanged at every event boundary, A shows the latest owned content, and no save is routed to B.

```sh
node node_modules/vitest/vitest.mjs run tests/renderer/components/liveViewer.test.js tests/renderer/components/liveViewer/index.test.js tests/renderer/store/live-stream-ownership.test.js tests/renderer/components/editor.test.js
npm run build
node node_modules/@playwright/test/cli.js test tests/e2e/live-stream-ownership.spec.ts --project chromium --project webkit-live-stream
```

**Acceptance:** tab switching or closure cannot redirect stream updates; background content remains available; delayed events do not cross session incarnations; local document history and saved bytes remain intact in all three editing modes.

### Task 4: prepare locked deployment tooling before credentials — F-002

**Files:** create `tools/stats-gateway/package.json` and `package-lock.json`; modify `tools/stats-gateway/deploy-checked.mjs`, `README.md`, `tests/tools/stats-gateway-deploy.test.mjs` and `.github/dependabot.yml`; extend the existing CI dependency-install/check job for the dedicated toolchain; update M-071 and relevant CI verification records.

**Interfaces:** declare exact `devDependencies.wrangler = "4.159.0"` in the gateway manifest. Resolve its installed CLI entry from that package's manifest under the gateway's `node_modules`, verify its expected version, and invoke it with `process.execPath` and the explicit entry path. Expose a small injectable deployment runner for tests; retain `assessCandidate` behavior and receipts. Do not use `npx`, global PATH lookup or automatic installation as fallbacks.

- [ ] Inspect the chosen published tool's dependency metadata/shrinkwrap and record the result before making a stronger claim about its previous graph. Generate and review a dedicated lockfile with resolved versions and integrity for registry packages; include platform-specific optional dependencies. Do this in a preparation environment without Cloudflare or unrelated credentials.
- [ ] Install the reviewed graph with `npm ci --ignore-scripts --no-audit --no-fund` in `tools/stats-gateway`. Smoke-test the prepared CLI without credentials. If a package genuinely requires an install script, document and permit only that exact reviewed step during preparation; never turn scripts on globally during deployment. npm documents the frozen-install behavior in [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/).
- [ ] Make missing package, version mismatch or absent CLI entry fail closed before deployment. Keep Git/gh preflight subprocess environments free of Cloudflare credentials; pass an explicit minimal environment containing the deploy credentials only to the prepared Wrangler process. Preserve required OS/runtime variables and use a fixture credential store for tests.
- [ ] Add subprocess-boundary tests using fake executables/runner capture. Assert zero installer calls; exact local CLI/version; missing-tool refusal; dummy token absent from admission subprocesses and present only in the deployment subprocess; no secret output; and unchanged exact-main/check/receipt refusal paths.
- [ ] Document prepare → verify → provide narrow credentials → deploy. Make Dependabot cover the nested manifest. Treat dependency freshness/quarantine as an update-time policy; choose a concrete supported policy during implementation if desired, without presenting an unspecified npm flag as a fix.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/tools/stats-gateway-deploy.test.mjs tests/tools/stats-gateway.test.mjs`. Expected: acquisition and credential-boundary tests pass, as do existing admission and Worker behavior tests. Do not execute a real deployment.

**Acceptance:** the complete selected tool graph is reviewed and locked; credential-bearing execution has no package-acquisition path; missing tooling fails; existing source-admission guarantees remain intact.

### Task 5: prove and hand off each implementation unit

- [ ] Run each unit's regressions red before its fix and green afterward in an isolated execution environment. For security reproduction, use no external network, an allowlisted environment with scratch-local home/caches, read-only source/toolchain except scratch, and explicit CPU/memory/process/disk/file-size/time limits. Prepare dependencies separately without secrets; offline tests must not fetch them.
- [ ] Update the affected module contracts, maps, change summaries, graph entries, verification commands/scenarios and assertion evidence. Scope new assertions to observed behavior, not an untested success claim.
- [ ] Run selected target assertions during implementation, then final assertions with commands before archiving, and current-state integrity/status afterward, using each actual approved change ID:

```sh
grace lint --path . --assertions current
grace lint --path . --change C-<ID> --assertions target
grace lint --path . --change C-<ID> --assertions final --run-commands
# Archive only after the final gate and the required lifecycle updates.
grace lint --path . --assertions current
grace status --path . --with modules --json
```

- [ ] Run the repository-required test/build checks appropriate to the changed units and the exact-candidate safety checks in `docs/commit-push-safety.md` before any later commit/push. Keep each implementation unit independently reviewable; do not bundle a release or deploy into a fix.
- [ ] Report source-fixed, regression-verified, owner-accepted and released states separately. Preserve any unperformed Windows/runtime validation as an explicit gap.

## Planning handoff before implementation

This document delivers the requested focused validation and proposed repair plan. No product code, dependency manifest, GRACE lifecycle record, test or release artifact was changed. No finding is marked fixed. Product regression tests and builds remain unexecuted; the two GRACE metadata commands above are the only repository verification commands run during this review.

## Implementation update

The owner subsequently authorized implementation. The four repair units and a supporting lockfile-scan verification unit are now implemented. Final verification and lifecycle state are recorded in [the implementation results](2026-11-11-security-fixes-results.md). The original source-validation discussion above describes the pre-fix revision.
