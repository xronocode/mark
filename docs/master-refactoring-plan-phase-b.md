# Mark 2 Phase-B Master Refactoring Plan

Version: 0.1.0  
Date: 2026-04-25  
Status: iteration-2 revised draft under swarm review  
Scope: Mark 1 Electron main process and Vue renderer compatibility to Mark 2 Tauri v2 + Rust backend.

## Executive Summary

Phase B ports the shipped Electron app to Tauri without rewriting muya and without broad frontend churn. The controlling rule is 95% verbatim frontend: renderer behavior is preserved through `mt-ipc-bridge` and compatibility shims, not by rewriting application UI flows. Rust replaces Electron main-process responsibilities module by module, with a typed app event bus replacing `ipcMain` as the internal event bus.

The existing XML artifacts contain strong late addenda, but the canonical B1-B4 sections are stale. This master plan is the normalized source for Phase-B execution until the XML files are refreshed.

## Non-Negotiable Constraints

- Keep `src/muya/` behavior unchanged except approved bugfixes and measurable compatibility fixes.
- Keep the Vue frontend 95% verbatim. Measure this against the Phase-A6 baseline by tracked renderer file count and non-generated LOC: at least 95% of non-adapter renderer files must have identical AST hashes or only import-path shim changes. Allowed Phase-B frontend write scope is `src/renderer/src/ipc/`, `src/renderer/src/compat/`, bootstrap wiring, and narrowly documented call-site adapters.
- Replace Electron main-process APIs with Rust/Tauri modules behind `mt-ipc-bridge`; do not scatter direct Tauri calls through feature code.
- Promote every required addendum into canonical modules, graph nodes, gates, and verification entries before implementation packets are issued.
- Use `mark` as the cask name. `marktext` references are legacy only and must not appear in Phase-B install or upgrade commands.

## Canonical Phase B Order

### Preflight: Artifact Canonicalization

Deliverables:
- Repair invalid XML in `docs/development-plan.xml`.
- Fold mandatory addenda into canonical `DevelopmentPlan`, `VerificationPlan`, and `KnowledgeGraph`.
- Add canonical `M-021`, `M-013a`, and `M-013b`.
- Replace stale `Gate-Phase-B1..B4` entries with measurable gates.
- Add Phase-A main-process module mappings for every `mark-electron/src/main` owner.
- Split `M-013a mt-ipc-contract` and `M-013b mt-ipc-runtime` into separate graph nodes, contracts, V-M entries, and phase gates.

Gate:
- XML parses.
- Graph has no missing mandatory modules.
- `phase-gate-matrix` includes `B-pre1`, `B-pre2`, `B1`, `B1.5`, `B2`, `B3`, `B3a`, `B4`.
- This is a required preflight, not a numbered Phase-B execution phase.

### Phase-B-pre1: v1.1.0 Fixture Capture

Deliverables:
- Publish/confirm Phase-A6 v1.1.0 cask first.
- Commit `test/fixtures/v1-userdata/com.xronocode.mark/` captured from a real v1.1.0 install with 60+ prefs, GitHub token placeholder, 8+ recents, image-folder state, keybindings, and dataCenter.
- Commit `test/fixtures/v1-userdata/fixture-pin.lock` with SHA256 manifest.

Gate:
- Fixture pin lock exists and hashes every file.

### Phase-B-pre2: Migration Safety Floor and Trace Contract

Deliverables:
- `src-tauri/src/migration_strings.rs` contains pre-window native-dialog strings for 10 locales.
- `sys_locale` detection is wired before WebView creation.
- `M-005` migration stub aborts with `MT_PREFS_V1_RUNNING` when legacy data is present until full B3 migration ships.
- End-to-end `trace_id`, `req_id`, `session_chain_id`, and `BLOCK_*` marker schema is defined for `M-001`, `M-009`, `M-011`, `M-013a`, and `M-013b`.
- Renderer cleanup preflight has zero production-bundle usages of Node core modules or globals: `fs`, `path`, `child_process`, `crypto`, `Buffer`, `os.tmpdir`, `process` escape hatches, `node:*`, and deep `electron` imports.

Gate:
- Native migration dialog screenshots exist for `ru_RU`, `zh_CN`, and `ja_JP`.
- `BLOCK_USER_CONSENT`, `BLOCK_SNAPSHOT_LEGACY`, and `BLOCK_MIGRATION_PREFLIGHT_DONE` fire in order.
- Schema-only trace checks pass and migration-dialog markers are asserted. Runtime trace assertions move to B1, B1.5, and B3 when those surfaces exist.
- Restricted-import and bundle-grep checks pass.

### Phase-B1: Tauri Skeleton and Compatibility Shell

Modules:
- `M-001 mt-tauri-shell`
- `M-013a mt-ipc-contract`
- `M-013b mt-ipc-runtime` skeleton only
- `M-011 mt-renderer` bootstrap adapter
- `M-012 muya` unchanged

Deliverables:
- `src-tauri` app boots with Vue frontend in WebView.
- `mt-ipc-bridge` exposes typed no-op or stubbed compatibility surface for the snapshotted IPC/preload/remote APIs.
- Generate `test/fixtures/ipc-channels/electron.v1.json` via AST plus runtime instrumentation as the first B1 work item.
- Generate `test/fixtures/internal-main-events/electron.v1.json`, `remote-callsites.v1.json`, `sendSync-callsites.v1.json`, `menu-taxonomy.v1.json`, and `preload-surface.v1.json`.
- Rust app event bus and `WindowId` registry exist.
- PDF/export strategy is decided and stubbed as `fn-print_to_pdf(html) -> Vec<u8>` or explicit unsupported fallback with user-visible message.
- B1 performance harness captures Electron baseline and Tauri WebView smoke numbers using a synthetic `include_str!` fixture only; real fs/encoding IPC perf is deferred to B2.
- WebView shell security is configured before first window: block webview attachment, navigation escape, `window.open`, unknown custom protocols, and file URI access outside the approved app origin.
- Remote/preload/dialog/window/menu lifecycle hardening is implemented far enough to block B2: typed dialog outcomes, close lifecycle state machine, stale menu-generation discard, replay/drop policy, and preload parity fixtures.

Gate:
- `cargo test`, `cargo clippy -D warnings`, renderer typecheck.
- `sendSync == 0`, `@electron/remote == 0`, and restricted Node-core renderer bundle checks remain green.
- 5k-line muya fixture renders in WKWebView within 1.5x Electron baseline and p95 keystroke <= 50ms.
- IPC/preload/remote snapshot parity passes against stubs; runtime self-validation emits `BLOCK_VALIDATE_AGAINST_FIXTURE` before first window and fails closed on unknown channels.
- No direct Tauri calls outside bridge/compat/bootstrap allowlist.
- WebView security config parity passes against Electron shell protections.
- Runtime trace assertions pass for bridge/window paths.
- Dialog table tests cover cancel, destroyed parent, late reply discard, and focus return exactly once.
- Close lifecycle trace assertions cover `CLOSE_REQUESTED -> PROMPT_OPEN -> SAVE_FAILED -> CLOSE_CANCELLED` and `FORCE_CLOSE -> WATCHERS_CLEANED -> WINDOW_DESTROYED`, with negative assertions for double prompt and double cleanup.
- Stale menu generation test discards an invoke from generation N after rebuild N+1 with `BLOCK_STALE_MENU_GENERATION`.
- Early lifecycle replay/drop policy is defined and smoke-tested for native menu invoke, app quit, close request, dialog result, and window focus events.

### Phase-B1.5: release-tauri.yml CI Dry Run

Modules:
- `M-001`, release workflow, packaging configuration.

Deliverables:
- `release-tauri.yml` dry-run exists on the working branch.
- Workflow uses path filters, `concurrency.cancel-in-progress: true`, and a manual `workflow_dispatch` switch for B2 development days.
- Workflow is non-blocking except when invoked with `phase=B1.5-gate`.
- `tauri-action` produces an unsigned DMG on macOS runner.
- Ad-hoc `codesign --force --deep --sign -` succeeds without keychain provisioning.
- DMG mount, `/Applications` copy, `xattr -cr`, launch smoke, and bundle size measurement run in CI.
- `toolchain-warnings.json` artifact is published and compared with `docs/ci-warnings-allowlist.md`.

Gate:
- Dry-run DMG launches on macOS arm64.
- `du -sh /Applications/Mark.app` is published; `<30 MB` target is confirmed or formally revised.
- CI warning allowlist exists and has no untriaged warning.

### Phase-B2: Security, Filesystem Core, Watcher, Search

Modules:
- `M-010 mt-security`
- `M-021 mt-fs-core`
- `M-003 mt-fs-watcher`
- `M-004 mt-search`
- `M-002 mt-fs-commands`
- `M-013b` concrete fs/search/watcher bridge
- `M-014 mt-encoding` read/write path integration

Order:
1. `M-010` path, URL, shell, sanitizer, KaTeX, Vega policy.
2. `M-013b` command/event signatures for fs/search/watcher are skeletonized.
3. `M-021`, `M-003`, and `M-004` run in parallel against the skeletonized contracts; `M-003/M-004` use the stable M-021 interface shape and do not call public `M-002`.
4. `M-002` is implemented serially as public IPC commands wrapping `M-021`; internal Rust modules must not call `M-002`.
5. `M-013b` enables concrete fs/search/watcher wiring.

Gate:
- `V-M-010`, `V-M-021`, `V-M-002`, `V-M-003`, `V-M-004`, `V-M-013a`, `V-M-013b`.
- Cross-engine sanitizer B2 corpus count follows the current GO/NO-GO gate: 27 payloads in WKWebView/WebView2/webkit2gtk. If the checked-in fixture contains 30 payloads, all checked-in payloads must pass by B4 and the count must be normalized during artifact sync.
- Atomic-write tests cover crash points at temp-create, temp-write, temp-fsync, metadata-copy, rename, parent-dir-fsync, cleanup failure, ENOSPC, SIGKILL windows, symlink swap, non-regular inode, APFS/ext4/NTFS evidence, permissions, executable bit, macOS xattrs/resource forks, and hardlink behavior.
- Watcher payload parity covers file vs directory modes, markdown load payloads, self-change suppression, ENOSPC once, Linux atomic rename rewatch, per-window cleanup.
- Search first result for 10k-file fixture <= 500ms.
- B2 remeasures muya open/save perf through real `M-002 + M-014` IPC, not the B1 synthetic fixture.

### Phase-B3: Integrations

Modules:
- `M-005 prefs`, `M-006 shortcuts`, `M-007 spell`, `M-008 fonts`, `M-009 menu`, `M-014 encoding`, `M-015 pandoc`, `M-016 updater`, `M-017 recent docs`, `M-018 screenshot`, `M-019 datacenter`, `M-020 cli`.

Order:
1. `M-005`, `M-014`, `M-020`, `M-008` in parallel.
2. `M-019` after `M-005`; `M-017` after `M-021`; `M-015` after `M-010/M-021`.
3. `M-006`, `M-007`, `M-016`, `M-018`.
4. `M-009` last, because menu state depends on prefs, recents, spell, update, window registry, and command taxonomy.

Gate:
- Migration snapshot and rollback pass for four legacy JSON files plus keychain.
- Spell strategy is canonical: WebView native spellcheck where available plus bundled hunspell/nuspell fallback for non-native language coverage; no custom NSSpellChecker FFI unless a later design review reverses this.
- Pandoc handles cancellation, timeout, tab-close race, TeX path, sandbox denial, large stdout limit, and missing helper tools.
- Updater verifies signed feed/assets, rejects downgrade, strips macOS quarantine before install, defers during migration/unsaved-doc guard.
- Secrets never appear in Rust logs, renderer console, panic traces, or native dialog text.
- Updater manifest signature binds `version`, `arch`, `min_os`, `asset_url`, `sha256`, and `cask_sha256`; stale-but-valid feeds expire and replay attempts are rejected.
- Migration rollback includes the case where v2 has launched and the user has modified prefs, recents, or secrets before rollback to `mark@v1`.

### Phase-B3a: Partial Ship Candidate

Deliverables:
- App can open/edit/save/search/export core documents with integrations either implemented or visibly disabled.
- `mark@v1` rollback channel is published and smoke-tested before any `mark@alpha` cask is released.
- Installer/cask alpha channel uses `mark@alpha`; stable remains `mark`.
- User review checkpoint before B4 packaging.

Gate:
- No hidden unsupported command. Every unsupported Electron-era feature shows visible noop or disabled menu item.
- Core workflows pass on macOS arm64. Intel users remain on `mark@v1` for v2.0 and receive a clear error plus rollback instructions; universal binary is deferred to v2.1+.
- Linux/Windows remain best-effort but WebView security corpus runs in CI.
- `brew uninstall mark@alpha && brew install mark` documented and verified.

### Phase-B4: Distribution, Soak, v2.0 Release

Deliverables:
- Tauri release workflow with ad-hoc signing and Homebrew cask update.
- `brew upgrade --cask mark` migrates v1 to v2; `mark@v1` rollback preserves data.
- Footprint target: `< 30 MB`, or a measured budget revision documented during B1.5 if WKWebView/Tauri/native assets make 35-45 MB unavoidable.
- Performance soak: 50k and 100k-line fixtures, Mermaid-heavy, table-heavy, 10 MB single-line.

Gate:
- macOS 14 arm64 is blocking for v2.0; macOS 13 x86_64 is non-blocking unless the architecture decision is revised before B4.
- `du -sh /Applications/Mark.app < 30 MB` or the formally revised B1.5 footprint budget.
- No Gatekeeper quarantine after cask install or updater path.
- Homebrew install, upgrade, rollback, livecheck, SHA mismatch, and cached download scenarios pass on fresh VM.
- Cask lifecycle tests cover `mark`, `mark@alpha`, and `mark@v1` co-install/upgrade/uninstall conflicts, stale app bundles, and architecture resolution.

## Module Mapping From `mark-electron/src/main`

| Legacy owner | Tauri target | Notes |
|---|---|---|
| `index.js`, `app/index.js`, `app/env.js`, `app/paths.js` | M-001, M-020, M-005 | startup, CLI, paths, lifecycle |
| `cli/index.js`, `cli/parser.js` | M-020, M-001 | CLI flags, usage, portable mode, startup handoff |
| `app/accessor.js` | M-001, M-005, M-009, M-013b | dependency injection, command/menu/window/data stores |
| `app/windowManager.js`, `windows/*` | M-001, M-013b | window registry, close state machine, event bus |
| `commands/*`, `menu/actions/*`, `menu/templates/*`, `menu/index.js` | M-009, M-013a, M-013b | M-013a owns command/menu schema taxonomy; M-013b owns runtime native dispatch and per-window menu state |
| `contextMenu/editor/*` | M-009, M-007, M-013b | native context menu and spelling actions |
| `filesystem/*` | M-021, M-002, M-014 | raw bytes, markdown load/save, encoding, atomicity |
| `filesystem/watcher.js` | M-003, M-014, M-011 | event payload parity and markdown reload coupling |
| `preferences/*` | M-005 | four-store migration, schema validation |
| `dataCenter/*` | M-019, M-005, M-021 | ImageBed config, keychain, image folders |
| `keyboard/*` | M-006, M-020 | shortcut parsing, keyboard layout, debug dump shell guard |
| `spellchecker/*` | M-007, M-009 | custom dictionary, language switch, suggestions |
| `utils/pandoc.js` | M-015 | subprocess and PATH policy |
| `utils/index.js` | M-001, M-005 | ids, titles, path helpers, key comparison, log level |
| `utils/imagePathAutoComplement.js` | M-018, M-019, M-021 | image path autocomplete, file scanning |
| `exceptionHandler.js`, `utils/createGitHubIssue.js` | M-001, M-010 | crash handling and guarded external URL |
| `menu/actions/marktext.js` | M-016, M-009 | update state machine and menu dispatch |
| `i18n.js`, `globalSetting.js`, `config.js` | M-001, M-005, M-009 | runtime constants and broadcast language/theme |
| native theme, Dock/JumpList, macOS `open-file` batching in `app/index.js` | M-001, M-009, M-017, M-020 | OS shell lifecycle parity |

## Verification Matrix

| Flow | Modules | Evidence |
|---|---|---|
| `VF-001 WYSIWYG` | M-011, M-012, M-013a, M-013b, M-002, M-021 | open/edit/source-toggle/save, trace chain read-parse-render-write |
| `VF-002 Folder Search` | M-003, M-004, M-013b | 10k files, first result <= 500ms, watcher update <= 500ms |
| `VF-003 Security` | M-010, M-012, M-013b | 27-payload B2 cross-engine corpus, extended fixture by B4, shell prompt before open |
| `VF-004 Homebrew` | release, cask | install, upgrade, rollback, livecheck, xattr, codesign |
| `VF-005 Release` | CI, updater, cask | macOS blocking jobs, artifacts, sha256, cask PR |
| `VF-006 Encoding` | M-014, M-021, M-002 | 28 codecs, BOM, CRLF/mixed, no-edit byte equality |
| `VF-007 Pandoc` | M-015, M-010, M-021 | missing tool, TeX path, timeout, cancel, tab-close race |
| `VF-008 Updater` | M-016 | signed feed, tamper, downgrade, quarantine strip |
| `VF-009 Command/Menu` | M-009, M-013a, M-013b | 128 menu taxonomy, command palette, stale window generation |
| `VF-010 Renderer Cleanup` | M-011, M-013a, M-013b | restricted imports, bundle grep, runtime isolation smoke |
| `VF-011 IME Composition` | M-012, M-011 | six handlers gated by composition lock, CJK runtime traces |
| `VF-012 Table Roundtrip` | M-012 | leading pipe escape, short rows, no `undefined`, byte roundtrip |
| `VF-013 Perf Budget` | M-001, M-011, M-012 | B1 5k smoke, B4 50k/100k soak, long-task trace |
| `VF-014 FS Atomicity` | M-021, M-002 | fd-held validation, fsync ordering, ENOSPC/SIGKILL/FS matrix |
| `VF-015 Trace Contract` | M-001, M-009, M-011, M-013a, M-013b | trace_id, req_id, session_chain_id, BLOCK markers, fanout confirmation |
| `VF-016 Preload/Remote/Dialog Lifecycle` | M-001, M-009, M-013a, M-013b | preload globals, remote shims, typed dialog outcomes, replay/drop policy |

## Risk Table

| Risk | Severity | Mitigation | Gate |
|---|---:|---|---|
| Canonical XML drift | Critical | preflight canonicalization before code | Preflight |
| M-013a/M-013b under-scoped | Critical | IPC/preload/remote fixtures, contract/runtime split, and separate verification entries | B-pre1/B1 |
| Internal `ipcMain` event bus mismatch | Critical | Rust event bus + window registry | B1 |
| Filesystem TOCTOU/data loss | Critical | M-021 fd-held validated paths + atomic writes | B2 |
| Sanitizer mismatch across WebViews | Critical | 27-payload B2 corpus across three engines plus full checked-in corpus by B4 | B2/B4 |
| WKWebView muya perf regression | High | staged perf budgets, memory/leak soak, and Electron baseline | B1/B2/B4 |
| Pref/keychain migration loss | Critical | snapshot, lock, consent, rollback, conflict policy | B3/B4 |
| Spellcheck strategy drift | High | one canonical WebView/hunspell/nuspell strategy | B-pre2/B3 |
| PDF export API gap | High | decide implementation before B1 pass | B1 |
| Updater supply chain | Critical | signed feed/assets, downgrade refusal, key custody | B3/B4 |
| Homebrew cask name drift | High | use `mark`, `mark@v1`, `mark@alpha` only | B4 |
| 95% frontend drift becomes subjective | High | AST hash/LOC diff metric and allowlist | B-pre2/B1 |

## Go/No-Go Checklist For Phase-B1 Gate

- Preflight, B-pre1, and B-pre2 gates are green.
- XML artifacts parse and contain canonical `M-013a`, `M-013b`, `M-021`.
- `mark-electron/src/main` owner mapping exists in graph or the master plan is accepted as temporary canonical input.
- IPC/preload/remote/menu/sendSync fixtures are committed by the first B1 work item and before any bridge stub is accepted.
- PDF strategy is chosen.
- 95% frontend allowed-write scope and AST/LOC metric are explicit.
- Electron baseline performance fixture exists.
- No stale `marktext` cask command remains in Phase-B gates.
- WebView shell security protections are in the B1 gate.
- Trace contract and renderer restricted-import checks pass.

## Implementation Checklist

1. Preflight: repair XML, fold addenda, split `M-013`, add `M-021`, refresh graph/verification.
2. B-pre1: publish v1.1.0 user-data fixture and fixture pin lock.
3. B-pre2: implement migration safety floor, trace contract, and renderer restricted-import preflight.
4. Before each source edit: add MODULE_CONTRACT/MODULE_MAP to touched `mark-electron/src/main` owner or target Rust module.
5. B1: generate legacy IPC/preload/remote/menu/internal-event snapshots, scaffold `src-tauri`, `M-001`, `M-013a`, `M-013b`, configure secure WebView shell, and run synthetic muya perf gate.
6. B1.5: run release-tauri.yml CI dry run, ad-hoc signing smoke, launch smoke, and footprint measurement.
7. B2: implement `M-010`, skeletonize `M-013b` fs/search/watcher signatures, run `M-021`, `M-003`, and `M-004` in parallel against those contracts, then serialize `M-002` and concrete bridge integration.
8. B3: implement integrations in dependency waves; complete migration, updater, spell, menu, pandoc, datacenter gates.
9. B3a: publish and test `mark@v1`, then cut `mark@alpha` with visible alpha warnings and rollback path.
10. B4: complete arm64 v2.0 release, Homebrew upgrade/rollback, updater quarantine, footprint, perf soak, and compliance gates.
