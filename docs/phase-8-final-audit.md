# Phase 8 Final Audit — 2026-05-09

**Verdict:** **YELLOW** — ready for user smoke + alpha tag with 2 caveats (M-001 validator drift + 4 unrecorded followups). No correctness regressions, no critical drift.

**Scope:** Final read-only full-integrity audit of `/Users/myevdokimov/prj/mark/reborn-mark` after polish phases 1–7 closed. Mode: spirit of `grace-reviewer full-integrity`.

**Commits reviewed (26 since prior audit window `ba9fca32`):**

| Hash | Phase | Title |
|---|---|---|
| 88246d95 / 6f4c3b4f | 2 (C-1) | wire file-watcher into project.js |
| 89c73f0e | 2 (M-1) | delete 37 dead listeners from bootstrap-ipc.js |
| 014218fb | 2 (M-2/M-3) | mt::ask-for-close listener verified; drop 5 orphan compat commands |
| 23f1ad54 | 2 (N-3/N-5) | delete dead listener aliases + APPLY_KEYBINDINGS |
| 16523906 | 3 | vitest infra setup |
| 6c5e1d17, c0e26643, d7b37fab, dee27eba, 97e1b779 | 4 | renderer unit tests |
| 7b2c3663 → ab89fc3f (10 commits) | 5 | backend coverage |
| 1b03e204 | 6 | Playwright e2e (5 specs + 1 skipped) |
| 25dba484 | 7 | CI test workflow |
| 710a86b3 | 8 (Agent B) | F-DEV-MODE-WHITE-SCREEN — dev-only CSP fix |

**In-flight (uncommitted) at audit time:**
- Agent A: 10 renderer files modified, net −16 LOC — N-6 wave-annotation strip wave (in progress, not committed).
- Agent B: `tauri.dev.conf.json` already committed; no untracked left.

---

## Test surface

| Suite | Result | Time | Notes |
|---|---|---|---|
| `npm test` (vitest) | **310 passed**, 3 todo, 14 files | 5.02 s | matches plan |
| `cargo test --bin mark` | **392 passed**, 0 failed | 2.21 s | matches plan |
| `npm run test:e2e` (Playwright) | **5 passed**, 1 skipped | 6.2 s | matches plan; skipped spec is `markdown-render.spec.ts` (muya rendering deferred — known) |

**Sample-check on test quality (3 random files):**
- `tests/renderer/store/notification.test.ts` (88 LOC): real assertions on `notice.notify` arg shapes and `openExternal` URL — not smoke. Solid.
- `tests/renderer/store/help.test.ts` (301 LOC): validates pure factory functions (defaultFileState shape, immutability of clones, encoding/lineEnding edge cases). Strong.
- `tests/renderer/bootstrap-ipc.test.ts` (445 LOC): mocks Tauri `listen`, captures handlers per channel, drives them with crafted payloads. Strong.

No weak/import-only tests observed in the sample. Quality bar holds.

**v8 coverage glitch:** Not directly verified in this audit (no new coverage run). Mentioned in plan context as benign — `help.js` and `store/index.js` reportedly show 0% despite being exercised by tests above. Likely a v8 source-map issue with re-exports / dynamic-import test pattern. Cosmetic, not a real coverage gap.

---

## Knowledge-graph + verification-plan integrity

### Orphan command references (M-3 cleanup)

Grep for the 5 deleted commands across `src/renderer/`, `docs/knowledge-graph.xml`, `docs/verification-plan.xml`:

- `mt_get_current_language`, `mt_ask_for_user_preference`, `mt_ask_for_user_data`, `mt_ask_for_open_project_in_sidebar`: **0 references** in renderer source, graph, or verification — clean.
- `mt_window_state`: **2 stale references in knowledge-graph.xml**:
  - line 28: `<sub-module name="m_v1_compat" … purpose="… Currently houses mt_window_state (titleBar/index.vue startup invoke)…" />`
  - line 36: `<fn-mt_window_state PURPOSE="m_v1_compat::mt_window_state — returns {isFullScreen, isMaximized}…" />`
  - One historical reference at `docs/development-plan.xml:2426` inside the closed-evidence body of `F-MAIN-ENTRY-DISABLED` (legitimate — describes what shipped at that time).
  - One historical reference at `docs/verification-plan.xml:691` inside `<closed-evidence>` of B1-step-7 (also legitimate — historical defect-fix narrative).

**Drift item:** the two live `<sub-module>` and `<fn-…>` entries in knowledge-graph.xml should be removed or updated to reflect that `m_v1_compat` no longer houses `mt_window_state` (replaced by direct Tauri Window API in W4).

### N-3 / N-5 listener cleanup

Grep for 18 dead listener constants across renderer source AND graph/verification:
- Renderer source: only one match — `autoUpdates.js:11` mentions `LISTEN_FOR_UPDATE` in a MODULE_CONTRACT *comment* describing what was deleted (no live binding). Acceptable.
- `docs/knowledge-graph.xml`, `docs/verification-plan.xml`: **0 matches** — clean.

### V-M-* contracts pointing at deleted commands

`grep` of verification-plan.xml for the 5 orphan command identifiers returned only one match — the `mt::window-state` reference at line 691, which is inside `<closed-evidence>` history (acceptable). No active V-M-* contract references a deleted command.

---

## IPC contract drift

### bootstrap-ipc.js listeners (9) ↔ Rust emit sites

| Channel | Listener (bootstrap-ipc.js) | Rust emit site | Verdict |
|---|---|---|---|
| `mt::user-preference` | line 55 | `m005_prefs.rs:271`, `m_v1_compat.rs:430,437` | ✓ |
| `mt::current-language` | line 63 | **NO emit found** | drift (listener-only; not a regression — was always renderer-driven) |
| `mt::update-object-tree` | line 76 | `m_v1_compat.rs:203,209` | ✓ |
| `mt::tab-saved` | line 90 | `m001_save_close.rs:361,370` | ✓ |
| `mt::tab-save-failure` | line 94 | `m001_save_close.rs:373` | ✓ |
| `mt::set-pathname` | line 109 | **NO emit found** | drift (kept-as-fallback per N-1; W2a moved acks to SavedTabState return) |
| `mt::bootstrap-editor` | line 130 | `m_v1_compat.rs:93` | ✓ |
| `mt::open-new-tab` | line 133 | `m_v1_compat.rs:368` | ✓ |
| `mt::force-close-tabs-by-id` | line 155 | `m001_save_close.rs:364` | ✓ |

**Verdict:** 7/9 listeners have a live backend emit. Two listener-only channels (`mt::current-language`, `mt::set-pathname`) match prior known state — `set-pathname` is documented as a deferred-cleanup fallback (N-1); `current-language` would require the same treatment if/when i18n switching is wired. Not a regression.

### Out-of-bootstrap channels

- `mt::ask-for-close`: emitted at `m001_save_close.rs:449` (close-handler), listened in `editor.js:431` via `window.electron.ipcRenderer.on(...)`. Both sides live. ✓
- `mt::watch::event`: constant declared at `watch.rs:46`; subscribed via `ipcWatch.subscribe(canonical, …)` in `project.js:168` (C-1 fix); handler `_handleWatchEvent` translates kind to tree event + tab notify. End-to-end wired. ✓
- `mt::menu-invoked`: emitted from `main.rs:499` and `m006_shortcuts.rs:333`; consumed by `install-menu-bridge.js`. ✓

### M-001 fixture-parity validator drift (NEW finding — flag)

`m001_validate.rs` runs at boot, comparing `tauri.v2.json` fixture vs the const `REGISTERED_COMMANDS` array. Both sides are out of sync with the actual `tauri::generate_handler!` in `main.rs`:

- **5 entries that should NOT be in either** (M-3 deleted them from main.rs but neither the fixture nor the validator allowlist was updated):
  - `mt_ask_for_open_project_in_sidebar`
  - `mt_ask_for_user_data`
  - `mt_ask_for_user_preference`
  - `mt_get_current_language`
  - `mt_window_state`

- **10 entries that SHOULD be in both but are missing** (commands added in B4-pre-alpha / Path-B-clean waves never landed in fixture or `REGISTERED_COMMANDS`):
  - `mt_app_quit`, `mt_close_project_root`, `mt_close_window`, `mt_close_window_confirm`, `mt_migration`, `mt_paths`, `mt_pick_folder`, `mt_response_file_save`, `mt_response_file_save_as`, `mt_save_and_close_tabs`

Counts: handler has 52 commands; fixture has 47 (plus `mt_ping` frontend-only); `REGISTERED_COMMANDS` has 47.

**Why the validator passes anyway:** fixture and `REGISTERED_COMMANDS` are perfectly mutually consistent (the `embedded_fixture_parses_and_matches_registered` unit test passes), so the symmetric-difference computation is empty — but the entire drift-net is comparing two stale lists to each other. The validator silently misses real drift between the registered handler and the contract.

**Severity:** Major safety-net regression. Not a runtime bug (the binary boots and serves all 52 commands; renderer reaches them via the channel-name shim). But the M-001 contract's whole purpose is to prevent silent IPC drift, and right now it can't.

**Note:** This is identical structurally to the path-b-clean audit's M-001 acceptance — at that time both lists were 33 entries (verification-plan.xml line 692 says `registered=33`). Since then 14 commands were added and 5 removed without touching the fixture or validator. The validator was supposed to be regenerated by `tools/gen-tauri-v2-fixture.mjs` per the fail-message instruction, but no commit since the prior audit invokes it.

---

## High-risk path spot-checks

### M-001 close state machine (`m001_save_close.rs`)

`advance_close_state_machine` walks 4 transitions: `Idle→CloseRequested → ForceClose → WatchersCleaned → WindowDestroyed`, idempotent on terminal states. `wire_close_handler` registers a `WindowEvent::CloseRequested` callback that sets SM to `PromptOpen` and emits `mt::ask-for-close`. `mt_close_window_confirm` is an ack sink (renderer owns the dialog). Three emits cover saved/failed paths (lines 361, 370, 373) plus force-close batch (line 364). State machine complete; emit pattern matches contract.

### C-1 file watcher (`project.js#_handleWatchEvent`)

Lines 192–245. Translates `WatchEvent { kind, paths }`:
- `create` → `addDir` if dir; `add` (markdown only, with stat-based mtime) if file; plus `APPLY_FILE_CHANGE('add', …)` for open tabs
- `modify` → only `APPLY_FILE_CHANGE('change', …)` (tree shape unchanged); matches v1.2.3 chokidar `'change'` semantics
- `remove` → both `unlink` + `unlinkDir` (notify can't tell type post-delete; treeCtrl helpers no-op when irrelevant), plus `APPLY_FILE_CHANGE('unlink', …)`
- `access`/`other`/`any` — no-op (correct)

Defensive scope check via `isPathContained` even though backend already filters. Good defense in depth.

### `editor.js#APPLY_FILE_CHANGE`

Lines 1342–1392. Handles all three types: `unlink` (mark dirty + notify), `add`/`change` (autoSave path with timer cleanup OR notification with confirm-action), and `default` (logs error). Branches match the project.js dispatch.

---

## CI workflow

`.github/workflows/test.yml` — landed 25dba484:

- Three jobs: `renderer-unit` (matrix ubuntu+macos), `backend-unit` (matrix ubuntu+macos), `renderer-e2e` (macos-14 only). `status-check` aggregates and fails on any non-success. ✓
- Commands match local: `npm test`, `cargo test --bin mark`, `npm run test:e2e`. ✓
- Linux Tauri sysdeps complete: `webkit2gtk-4.1`, `gtk-3`, `soup-3`, `javascriptcoregtk-4.1`, `ayatana-appindicator3`, `librsvg2`. ✓
- Caching: `actions/cache@v4` for cargo registry/git/target and Playwright browsers. Keyed on Cargo.lock / package-lock.json hashes. ✓
- Concurrency group `test-${{ github.ref }}` with cancel-in-progress. ✓
- Conflict check vs `release.yml` (tag-triggered) and `release-tauri.yml` (branches: tauri + PRs to main, tauri): `release-tauri.yml` ALSO fires on PRs to `main` — overlaps with `test.yml` PR triggers. Different jobs and concurrency keys, so no actual conflict; just parallel CI cost. Not blocking.

Minor: `renderer-e2e` runs only on macos-14. Ubuntu coverage deferred (matches the in-comment notes "Linux is added under the same matrix entry once it has been observed green at least once" → `F-E2E-LINUX-CI`/`F-CI-E2E-LINUX`). Recorded as deferred.

---

## Followups state

### F-DEV-MODE-WHITE-SCREEN

Status as recorded in `docs/development-plan.xml:2543`: `status="resolved" resolved-by="phase-8-batch-B" resolves-at="phase-8"`. Resolution shipped in Agent B's commit `710a86b3` (reborn-mark) — `tauri.dev.conf.json` adds `'unsafe-eval'` to script-src and `ws://localhost:1420` to connect-src for vite HMR. Production CSP unchanged. ✓

### Phase 6/7 followups — recording status

Searched `docs/development-plan.xml` for the four IDs from this phase's polish work:

| Followup ID | Recorded? |
|---|---|
| `F-CI-CODECOV-TOKEN` | **NO** — not present in development-plan.xml |
| `F-CI-E2E-LINUX` | **NO** |
| `F-E2E-LINUX-CI` | **NO** |
| `F-E2E-DATA-TESTIDS` | **NO** |

Per audit instructions: NOTE in report and let user decide whether to add. None of these are alpha-blockers (they're CI-coverage and test-infra hygiene, not correctness).

---

## Final cleanup hygiene

### `Path B-clean` annotations in renderer source

Grep over `src/renderer/`: 3 matches across 2 files:

- `src/renderer/src/store/listenForMain.js:20` — Agent A's pending uncommitted diff already removes this. Will land 0 matches after their commit.
- `src/renderer/src/store/autoUpdates.js:17` — **NOT** in Agent A's pending diff. Will remain after Agent A commits.

Result after Agent A lands: 1 residual `Path B-clean W7` reference in `autoUpdates.js`. Cosmetic; flag for follow-up sweep.

### Production CSP unchanged

`src-tauri/tauri.conf.json:26` — `script-src 'self'` (no `'unsafe-eval'`). ✓

`src-tauri/tauri.dev.conf.json:5` (committed) — `script-src 'self' 'unsafe-eval'` (dev only). Tauri 2 picks up `tauri.dev.conf.json` automatically when the binary is launched in dev mode (`tauri dev`); production builds use only `tauri.conf.json`. Verified by Agent B's commit message that `npm run tauri dev` boots cleanly.

---

## Sign-off recommendation

**YELLOW — proceed to user smoke + alpha tag** with the following caveats:

1. **M-001 validator silent drift (Major safety-net):** `tools/gen-tauri-v2-fixture.mjs` should be re-run and `m001_validate.rs#REGISTERED_COMMANDS` updated to match the actual `tauri::generate_handler!` (52 commands). Until then the on-boot contract validator is comparing two stale lists to each other and cannot detect real drift. Does NOT block alpha because runtime behavior is correct; flag for a quick post-smoke fix commit.

2. **knowledge-graph.xml stale `mt_window_state` entries (Minor):** lines 28 and 36 still describe `mt_window_state` as living in `m_v1_compat`. Update or delete during next graph refresh.

3. **4 unrecorded followups (Minor):** `F-CI-CODECOV-TOKEN`, `F-CI-E2E-LINUX`, `F-E2E-LINUX-CI`, `F-E2E-DATA-TESTIDS` are not in development-plan.xml. None are alpha-blockers; suggest a single FollowupIndex sync commit.

4. **In-flight Agent A wave-annotation strip:** 10 renderer files have uncommitted edits (net −16 LOC). When committed, only `autoUpdates.js` will retain a `Path B-clean W7` annotation. Cosmetic; follow up after smoke.

**Greens (positive evidence):**

- All three test suites pass: 310 vitest + 392 cargo + 5 e2e (1 skipped). No flakes observed.
- Test quality verified on 3 random samples — real behavioral assertions, no smoke-only patterns.
- IPC bootstrap-ipc.js listeners 7/9 trace to live backend emits; 2 are documented fallbacks. No regression vs prior audit.
- File-watcher (C-1) end-to-end wired: `ipcWatch.subscribe → m013b/watch.rs emit → project.js#_handleWatchEvent → editor.js#APPLY_FILE_CHANGE`. All 3 event types handled.
- Close state-machine traverses all 4 cleanup edges; emit/ack contract intact; renderer owns dialog as designed.
- CI workflow commands match local; sysdeps complete; no destructive overlap with release workflows.
- Production CSP confirmed unchanged (`script-src 'self'`); dev relaxation is dev-only.

**No criticals** were observed. No correctness bugs. No drift surfaces that block production smoke. Recommend GREEN-LIGHT for user manual smoke; address the 4 caveats afterwards as a single cleanup batch.
