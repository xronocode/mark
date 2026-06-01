# Phase B6 + B7 — GRACE Verification Report

**Date:** 2026-06-01 (updated from 2026-05-24)
**Branch:** main
**Scope:** B6 (M-031 diff-view), B7 (M-032 live-reload, M-033 cli-preview/watch/diff), deferred feature wiring

---

## Executive Summary

All modules are functionally complete. Since the initial 2026-05-24 report:
- `--watch` and `--diff` CLI flags fully wired (commit `35e49133`)
- Save-all, PDF export, line endings, listener leak fix shipped (commit `582b59ba`)
- Test coverage gap closed: vitest 2680→2758 (+78), cargo 426→445 (+19)
- B6 step-4 (--diff CLI flag) promoted from deferred to done
- Gates promoted from conditional-pass to PASS

**Gate result: PASS**

---

## Module Verdicts

### B6: M-031 diff-view — PASS

**Commits:** `ad02c263` (core), `4f042ee9` (E2E tests), gap-close (Cmd+D, .before, per-tab), `35e49133` (--diff CLI flag)

#### What works
- **diffView.vue** — CodeMirror MergeView with inline diff rendering
- **Dynamic imports** — merge addon + diff-match-patch loaded lazily
- **Git baseline** — `mt_diff_baseline` in m031_diff.rs: `git show HEAD:{rel_path}`
- **.before file baseline** — `{path}.before` checked first, priority over git
- **Theme support** — `getTheme()` maps to railscasts/one-dark/default
- **Cmd+D shortcut** — wired via native menu accelerator + command palette
- **View menu item** — "Diff Mode" under View menu with CmdOrCtrl+D
- **Per-tab diffMode** — each tab carries its own `diffMode` in defaultFileState
- **Toggle** — `view.diff-mode` toggles `currentFile.diffMode` (per-tab)
- **Integration** — app.vue derives diffMode from `currentFile.diffMode`
- **--diff CLI flag** — `mark --diff file.md` sets tab.diffMode=true via PendingOpens.diff_mode → emit_open_new_tab_ext → bootstrap-ipc.js
- **Watch reactivity** — markdown changes sync to MergeView; pathname change refetches baseline
- **Error handling** — untitled tab shows "No file path — save first" message
- **BLOCK markers** — BLOCK_DIFF_BASELINE, BLOCK_DIFF_BASELINE_OK,
  BLOCK_DIFF_TOGGLED, BLOCK_DIFF_RENDERED (4 of 12)
- **Tests:** 4 cargo tests (m031_diff.rs incl. before_file_takes_priority),
  4+ vitest (diff-view.test.js), 5 Playwright E2E

#### Remaining deferred items
- Side-by-side mode (inline only for now)
- Auto-detect `.before` on file open (basename presence check)
- SecurityCtx sandbox validation for baseline path
- 8/12 BLOCK markers remaining (diagnostics, not user-facing)

---

### B7: M-032 live-reload — PASS

**Implementation:** editor.js + preferences.js

#### What works
- **Latent bug fixed** — APPLY_FILE_CHANGE: async `ipcFs.read` fallback when
  `change.data` is undefined (project.js sends only `{pathname}`)
- **Cursor preservation** — loadChange saves cursor/scrollTop/muyaIndexCursor
  before Object.assign, restores after
- **liveReload preference** — default `true` in preferences.js; gates auto-reload
  for clean tabs
- **Hash-skip** — `if (markdown === tab.markdown) return` prevents redundant reload
- **100ms settle delay** — `setTimeout(async () => { ... }, 100)` before read
- **Watcher integration** — project.js watcher fires APPLY_FILE_CHANGE on modify events
- **watchMode gate** — `tab.watchMode` in APPLY_FILE_CHANGE bypasses dirty check +
  liveReload pref, always auto-reloads (for --watch CLI flag)
- **Per-file watch** — `_subscribeFileWatch(pathname)` handles single-file watching
  without project root via parent-directory ipcWatch subscription
- **BLOCK marker** — BLOCK_READ_FAILED on ipcFs.read error
- **Tests:** 15 dedicated tests in `live-reload.test.js` covering cursor preservation,
  async read path, hash-skip, liveReload pref, dirty tab behavior, previewMode integration

#### Remaining deferred items
- 3/4 BLOCK markers missing (BLOCK_LIVE_RELOAD, BLOCK_RELOAD_SKIPPED, BLOCK_RELOAD_CONFLICT)
- Playwright E2E tests for live-reload scenario

---

### B7: M-033 cli-preview + watch + diff — PASS

**Implementation:** m020_cli.rs, main.rs, m_v1_compat.rs, bootstrap-ipc.js, editor.js

#### What works
- **CLI flags** — `--preview`, `--watch` (`-w`), `--diff` in CliArgs (m020_cli.rs)
- **PendingOpens threading** — `preview_mode`, `watch_mode`, `diff_mode` AtomicBool
  fields seeded from cli flags in setup hook, consumed by `mt_drain_pending_opens`
- **emit_open_new_tab_ext** — extended emit function passes preview_mode, watch_mode,
  diff_mode to JSON payload. Legacy `emit_open_new_tab` delegates with false/false.
- **Renderer** — contenteditable=false for preview tabs; click exits preview via
  `EXIT_PREVIEW_MODE`; watchMode auto-reloads; diffMode opens diff view
- **bootstrap-ipc.js** — mt::open-new-tab handler sets tab.watchMode and tab.diffMode
  after tab creation
- **Live-reload integration** — preview and watchMode tabs bypass dirty check
- **CLI tests** — 10 cargo tests (4 preview + 6 watch/diff: watch_flag, watch_short_form,
  watch_default_false, diff_flag, diff_default_false, watch_and_diff_combined)
- **Renderer tests** — 12 dedicated tests in `preview-mode.test.js`

---

### Deferred Features (commit `582b59ba`) — PASS

#### What works
- **Save All** — `file.save-all` command + "Save All" menu item + `LISTEN_FOR_SAVE_ALL` bus listener → `ASK_FOR_SAVE_ALL(false)`
- **PDF Export** — `_EXPORT_PDF()` method: `invoke('mt_pandoc_status')` availability check + `invoke('mt_pandoc_export')` conversion. Null-guard on status response.
- **Line Ending Menu** — LF/CRLF CheckMenuItems in File → Line Ending submenu. `mt_update_line_ending_menu` Tauri command for runtime checked-state sync. `file.line-ending-lf` and `file.line-ending-crlf` commands.
- **Listener Leak Fix** — `on()` and `once()` in install-window-globals.js now return sync unsubscribe functions. `removeListener`/`removeAllListeners` remain no-op stubs.
- **Panic Test Race Fix** — `synth_panic_lock()` mutex in m001_panic.rs prevents test-level race conditions.

---

## Cross-Module Contracts

| Contract | Status |
|----------|--------|
| diff baseline from git (M-031 → git) | ✓ git show HEAD:{path} |
| diff baseline from .before file (M-031) | ✓ {path}.before priority over git |
| diffView per-tab state (M-031 → M-011) | ✓ currentFile.diffMode |
| --diff CLI → tab.diffMode (M-033 → M-031) | ✓ PendingOpens → emit_open_new_tab_ext → bootstrap-ipc |
| Cmd+D shortcut (M-031 → menu bridge) | ✓ native accelerator + command |
| CodeMirror theme sync (M-031 → M-011 config) | ✓ getTheme() reads current theme |
| live-reload watcher → editor (M-032 → M-003) | ✓ project.js fires APPLY_FILE_CHANGE |
| per-file watch without project (M-032) | ✓ _subscribeFileWatch parent-dir ipcWatch |
| cursor preservation across reload (M-032) | ✓ save/restore in loadChange |
| watchMode auto-reload gate (M-032) | ✓ tab.watchMode bypasses dirty+pref check |
| preview flag CLI → PendingOpens → renderer (M-033) | ✓ AtomicBool threading |
| watch flag CLI → PendingOpens → renderer (M-033) | ✓ AtomicBool threading |
| diff flag CLI → PendingOpens → renderer (M-033) | ✓ AtomicBool threading |
| preview + live-reload integration (M-033 → M-032) | ✓ previewMode bypasses dirty check |
| save-all command → editor store (deferred) | ✓ bus.emit → LISTEN_FOR_SAVE_ALL |
| PDF export → pandoc bridge (deferred → M-015) | ✓ invoke mt_pandoc_status/export |
| line ending menu sync (deferred → M-009) | ✓ mt_update_line_ending_menu invoke |
| IPC listener cleanup (deferred → shim) | ✓ on()/once() return unsubscribe |

---

## Test Results

- **vitest:** 2758 pass / 0 fail
- **cargo test m031:** 4 pass
- **cargo test m020:** 21 pass (includes preview + watch + diff flag tests)
- **cargo test full:** 445 pass
- **build:** success
- **coverage thresholds:** met (branches 84.45%, functions 83.36%, lines 91.87%)

---

## Gate Decision

**PASS** — all B6/B7 features plus deferred items functional and tested:
- Inline diff view via Cmd+D or command palette ✓ (M-031)
- Git + .before file baseline resolution ✓ (M-031)
- Per-tab diff state ✓ (M-031)
- --diff CLI flag opens diff view on launch ✓ (M-031/M-033)
- View menu item with accelerator ✓ (M-031)
- Live-reload on external file change ✓ (M-032)
- Cursor/scroll preserved across reload ✓ (M-032)
- watchMode auto-reload bypasses prefs ✓ (M-032)
- Per-file watcher for single-file opens ✓ (M-032)
- CLI --preview opens read-only tab ✓ (M-033)
- CLI --watch auto-reloads on change ✓ (M-033)
- CLI --diff opens diff view ✓ (M-033)
- Preview tabs auto-reload on external change ✓ (M-033)
- Save All command + menu ✓
- PDF export via pandoc ✓
- Line ending LF/CRLF menu ✓
- IPC listener leak fix ✓

Deferred (not blocking):
- Side-by-side diff mode (M-031)
- Auto-detect .before on file open (M-031)
- Remaining BLOCK markers (diagnostics only)
- Playwright E2E for live-reload
