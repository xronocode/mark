# Path B-clean — Full-Integrity Audit Report

**Date:** 2026-05-09
**Scope:** Post-completion audit of all 9 commits (d49c1202..ba9fca32) eliminating the Electron IPC compat layer in `reborn-mark` (Tauri 2 port).
**Mode:** grace-reviewer `full-integrity`
**Verdict:** **CONDITIONAL GO** for Phase 2 swarm verification. 1 Critical, 4 Major, 6 Minor. The Critical is small and isolated; Majors are cleanup, not correctness.

**Phase 2 swarm outcome (2026-05-09):**
- C-1 fixed in `88246d95` / reapplied as `6f4c3b4f`
- M-1 closed in `89c73f0e` (37 listeners deleted)
- M-2 closed-clean — audit was wrong: emit lives in `m001_save_close.rs:409` (not `m_v1_compat.rs`), and a listener IS registered (`editor.js#LISTEN_FOR_CLOSE` via `app.vue` mount). No regression, no dead code.
- M-3 closed in `014218fb` (5 orphan commands removed, 91 LOC)
- M-4 closed-clean — audit was wrong: all 30 `[v1_compat]` occurrences are inside `m_v1_compat.rs` itself; no leaks.
- Followup created: `F-DEV-MODE-WHITE-SCREEN` — dev-mode webview renders blank, blocks in-loop renderer smoke. Resolution at Phase 3.

Net audit accuracy: 2 actual cleanups + 2 false positives. Future audit passes should grep emit sites and listener registrations BEFORE flagging "dead" or "orphan".

---

## Commits reviewed

| Hash | Wave | Title |
|---|---|---|
| d49c1202 | M-001 fix | IPC payload wrapping + per-tab close dialog |
| f1c332b0 | post-smoke | Cluster of 5 UX fixes |
| 9ca40861 | W1 | Prefs broadcast via mt_prefs_set |
| 51a65d4d | W3 | pick_folder + close-project-root |
| 5ecb2107 | W4 | Window-state direct Tauri Window API + mt_app_quit |
| c42b501c | W7+W8 | autoUpdates dead-code purge + spellchecker direct invoke |
| fa6b3971 | review | Apply M-3 + M-7 from full-integrity audit |
| 83e6f0a9 | W2a | Save flow returns SavedTabState |
| 591d95c6 | W2b | Editor-event listeners → bootstrap-ipc |
| 3107fa4f | W5 | Editor events → bootstrap-ipc |
| ba9fca32 | W6 | listenForMain + layout + commandCenter + notification |

---

## Critical (block test phase)

### C-1 — File watcher channel mismatch + zero subscribers (silent feature regression)

- `src/renderer/src/bootstrap-ipc.js:233` listens on `mt::update-file`.
- Backend (`src-tauri/src/m013b/watch.rs:46`) emits on `mt::watch::event`.
- Even if channels matched: `ipcWatch.subscribe()` (`src/renderer/src/ipc/runtime/watch.ts:50`) has **zero callers** outside the runtime barrel — no code ever invokes `mt::watch::subscribe`, so the backend never starts watching anyway.
- **Impact:** External file edits don't reload tabs. v1.2.3 had this via chokidar→main→ipc. Tauri port lost it during shim era; Path B-clean did not surface the gap.
- **Fix path:** Wire `ipcWatch.subscribe(folderRoot, handler)` in `project.js#ADD_PROJECT` after canonical pathname is appended; dispose in `CLOSE_PROJECT`. Handler translates `WatchEvent` → `_processTreeEvent` (sidebar) + `editorStore.APPLY_FILE_CHANGE` (open-tab notify). Drop dead `mt::update-file` listener in bootstrap-ipc.js.

---

## Major (must fix before sign-off)

### M-1 — 39/47 boot-time listeners in `bootstrap-ipc.js` are dead

Of 47 `listen()` calls, only 8 channels are emitted by the backend:

```
mt::bootstrap-editor       mt::tab-save-failure
mt::current-language       mt::tab-saved
mt::force-close-tabs-by-id mt::update-object-tree
mt::open-new-tab           mt::user-preference
```

(Plus `mt::menu-invoked` which goes through `install-menu-bridge.js`, not bootstrap-ipc.) The other 39 are leftovers from v1.2.3's main-process menu/edit/window-event broadcasts. Two sub-buckets:

- **(a) menu-driven actions** (`mt::editor-*`, `mt::cm-*`, `mt::tabs-cycle-*`, `mt::show-*`, `mt::set-line-ending`, `mt::editor-ask-file-save*`, `mt::editor-close-tab`, `mt::editor-format-action`, `mt::editor-paragraph-action`, `mt::editor-edit-action`, `mt::editor-move-file`, `mt::editor-rename-file`, `mt::new-untitled-tab`, `mt::switch-tab-by-*`, `mt::toggle-view-*`, `mt::spelling-*`): in Tauri these flow through `mt::menu-invoked` → `install-menu-bridge.js`, not direct emits. Listeners are dead-by-design.
- **(b) features never wired** (`mt::screenshot-captured`, `mt::print-service-clearup`, `mt::invalidate-image-cache`, `mt::about-dialog`, `mt::pandoc-not-exists`, `mt::window-zoom`, `mt::window-active-status`, `mt::keybindings-response`, `mt::set-pathname`, `mt::set-view-layout`, `mt::language-changed`, `mt::execute-command-by-id`, `mt::show-notification`, `mt::export-success`): no Rust emitter exists.

**Fix path:** Delete buckets (a) and (b). Re-add only when corresponding feature is implemented (per F-* followups in development-plan.xml). Each removal needs a one-line justification commit.

### M-2 — `mt::ask-for-close` emit has no listener

Backend `m_v1_compat.rs` emits `mt::ask-for-close` but bootstrap-ipc.js doesn't listen. Either (a) close-flow now uses the SavedTabState return path and this emit is dead, or (b) close-prompt regression. Phase 2 swarm to confirm by tracing `app.emit("mt::ask-for-close")` callsite.

### M-3 — 5 orphan `m_v1_compat` commands

Registered in `main.rs#invoke_handler` but no JS caller exists:

- `mt_get_current_language` (superseded by event-driven `mt::current-language` + i18n.js direct hookup)
- `mt_ask_for_user_preference` (superseded by `mt_prefs_get_all` in W1)
- `mt_ask_for_user_data` (legacy; data lives in prefs now)
- `mt_window_state` (superseded by direct Tauri Window API in W4)
- `mt_ask_for_open_project_in_sidebar` (deferred F-OPEN-PROJECT-SIDEBAR)

**Fix path:** Delete from `main.rs#invoke_handler` + remove command bodies in `m_v1_compat.rs`. Net: ~150 lines compat-surface reduction.

### M-4 — Logging prefix discipline drift

Backend uses both `[v1_compat]` and `[m_*]` prefixes. Per audit goal #6: `[v1_compat]` should be confined to `m_v1_compat.rs` only. Spot-check shows two leaks (Phase 2 swarm to enumerate). Cleanup is mechanical.

---

## Minor

- **N-1** — `mt::set-pathname` listener in bootstrap-ipc.js has no current emitter (W2a moved save-path acks to `SavedTabState` return). Kept as fallback per W2a commit msg; flag as deferred-cleanup not bug.
- **N-2** — `requestWindowResize` in `store/layout.js:13-36` imports `LogicalSize` and computes `targetWidth` but never calls `setSize` — log-only stub. Doc comment accurate. `void LogicalSize` and `void size` are noise.
- **N-3** — `LISTEN_FOR_VIEW` (preferences.js:203), `listenForNotification` (notification.js:13) are no-op aliases preserved for `app.vue` `onMounted`. W6 commit said "deletion comes in W6 cleanup wave" — that wave shipped without removing them.
- **N-4** — `store/layout.js:99,109` still uses `window.electron.ipcRenderer.send('mt::view-layout-changed', ...)` — comment notes intentional (m_v1_compat backend command still works). After M-3 cleanup this needs migration to canonical command or removal.
- **N-5** — `store/commandCenter.js:32-34` refers to "2 IPC listeners (mt::keybindings-response, mt::execute-command-by-id) moved to bootstrap-ipc.js." Both fall under M-1 bucket (b). Listener+APPLY_KEYBINDINGS path is fully dead.
- **N-6** — All Path B-clean wave annotations in source comments (`Path B-clean W1`, `W2a`, etc.) are useful during the wave; rot-prone going forward. Phase 8 sign-off should strip these to keep code self-describing.

---

## Drift surfaces (architectural)

1. **Two transport idioms coexist.** Some IPC paths use the typed `ipc.runtime/*` facade (`ipcWatch`, `ipcSearch`, `ipcFs`); most stores still call `invoke()` directly. Either commit to the facade everywhere or treat it as documented exception. Currently it's neither — exists but unused outside test scaffolding.
2. **`app.vue` still calls vestigial `LISTEN_FOR_*` / `listenFor*` actions** that are no-ops post-W6. Either delete the calls (and the actions) or restore the action bodies. Half-state increases reader confusion.
3. **`window.electron.ipcRenderer` shim still present** for layout.js's view-layout broadcasts. Goal of Path B was elimination; this is the last shim site. After M-3 disassembly it should go.

---

## Goal-by-goal evidence summary

| # | Goal | Status |
|---|---|---|
| 1 | 58 IPC sites classified | most legitimate-legacy, ~12 will fold after M-3, 0 drift-from-pattern |
| 2 | 47 listeners → 8 active, 39 dead | M-1 |
| 3 | APPLY_*/SHOW_*/EXECUTE_* invoked? | all 12 actions reached; APPLY_KEYBINDINGS path dead due to N-5 |
| 4 | m_v1_compat 18 commands enumerated | 5 orphans → M-3 |
| 5 | invoke_handler entries justified | all reachable except M-3 set |
| 6 | log prefix hygiene | M-4 |
| 7 | mt_prefs_set broadcast coverage | clean — single canonical path SET_SINGLE_PREFERENCE → mt_prefs_set; M-3 from prior audit holds |
| 8 | Boot ordering | verified: install-window-globals → bootstrapRenderer → installMenuBridge → mount → setupIpcListeners → ASK_FOR_USER_PREFERENCE — listeners up before first invoke triggers a broadcast |
| 9 | Cargo deps | rfd + tauri-plugin-dialog coexist intentionally (rfd for sync pick_file, plugin for async save_file). Tokio sync feature scoped to plugin bridge. Clean. |
| 10 | Store boundary hygiene | clean — no store imports bootstrap-ipc.js; one-way dep |

---

## Phase 2 swarm batches (recommended)

| Batch | Issue | Agents | Notes |
|---|---|---|---|
| 1 | C-1 watcher fix | 1 | Single agent; project.js subscribe + handler + bootstrap-ipc.js cleanup |
| 2 | M-1 bucket (a) menu-driven dead listeners | 6-8 parallel | Partition by domain: editor-* / cm-* / tabs-* / show-* / spelling-* / view-* |
| 3 | M-1 bucket (b) never-wired listeners | 1 | 14 channels, mostly trivial deletions |
| 4 | M-2 mt::ask-for-close trace | 1 | Investigate before deletion |
| 5 | M-3 orphan command disassembly | 1 | Coordinated edit to m_v1_compat.rs + main.rs |
| 6 | M-4 log prefix cleanup | 1 | Mechanical |
| 7 | N-3 / N-6 final cleanup | 1 | After (1)-(6) settle |

C-1 (Batch 1) does **not** block Phase 3 (vitest infra setup). Recommend running them in parallel.
