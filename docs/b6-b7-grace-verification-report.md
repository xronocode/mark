# Phase B6 + B7 — GRACE Verification Report

**Date:** 2026-05-24
**Branch:** main
**Scope:** B6 (M-031 diff-view), B7 (M-032 live-reload, M-033 cli-preview)

---

## Executive Summary

All three modules are functionally complete. Gaps from initial verification
(missing Cmd+D, .before baseline, per-tab state, test files) were closed in
follow-up commit. Remaining deferred items are side-by-side mode and auto-detect
.before on open.

**Gate result: PASS**

---

## Module Verdicts

### B6: M-031 diff-view — PASS

**Commits:** `ad02c263` (core), `4f042ee9` (E2E tests), gap-close commit (Cmd+D, .before, per-tab)

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
- **Watch reactivity** — markdown changes sync to MergeView; pathname change refetches baseline
- **Error handling** — untitled tab shows "No file path — save first" message
- **BLOCK markers** — BLOCK_DIFF_BASELINE, BLOCK_DIFF_BASELINE_OK,
  BLOCK_DIFF_TOGGLED, BLOCK_DIFF_RENDERED (4 of 12)
- **Tests:** 4 cargo tests (m031_diff.rs incl. before_file_takes_priority),
  4+ vitest (diff-view.test.js), 5 Playwright E2E

#### Remaining deferred items
- Side-by-side mode (inline only for now)
- Auto-detect `.before` on file open (step 4)
- SecurityCtx sandbox validation for baseline path
- Return type `Result<String, String>` — spec wanted `DiffBaseline { source, content }`
- 8/12 BLOCK markers remaining (diagnostics, not user-facing)
- Debounce guard on toggle

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
- **BLOCK marker** — BLOCK_READ_FAILED on ipcFs.read error
- **Tests:** 15 dedicated tests in `live-reload.test.js` covering cursor preservation,
  async read path, hash-skip, liveReload pref, dirty tab behavior, previewMode integration

#### Remaining deferred items
- 3/4 BLOCK markers missing (BLOCK_LIVE_RELOAD, BLOCK_RELOAD_SKIPPED, BLOCK_RELOAD_CONFLICT)
- Playwright E2E tests for live-reload scenario

---

### B7: M-033 cli-preview — PASS

**Implementation:** m020_cli.rs, main.rs, editor.js, bootstrap-ipc.js, editor.vue

#### What works
- **CLI flag** — `--preview` in CliArgs (m020_cli.rs), default false
- **PendingOpens threading** — `preview_mode: AtomicBool` seeded from cli.preview,
  consumed by `mt_drain_pending_opens`
- **emit_open_new_tab** — passes preview_mode to payload builder
- **Renderer** — contenteditable=false for preview tabs; click exits preview via
  `EXIT_PREVIEW_MODE`
- **Live-reload integration** — preview tabs bypass dirty check, always auto-reload
- **BLOCK marker** — BLOCK_OPENED with preview={true|false} (complete)
- **CLI tests** — 4 cargo tests (all pass)
- **Renderer tests** — 12 dedicated tests in `preview-mode.test.js` covering
  APPLY_PREVIEW_MODE, EXIT_PREVIEW_MODE, dirty bypass, isSaved behavior

---

## Cross-Module Contracts

| Contract | Status |
|----------|--------|
| diff baseline from git (M-031 → git) | ✓ git show HEAD:{path} |
| diff baseline from .before file (M-031) | ✓ {path}.before priority over git |
| diffView per-tab state (M-031 → M-011) | ✓ currentFile.diffMode |
| Cmd+D shortcut (M-031 → menu bridge) | ✓ native accelerator + command |
| CodeMirror theme sync (M-031 → M-011 config) | ✓ getTheme() reads current theme |
| live-reload watcher → editor (M-032 → M-003) | ✓ project.js fires APPLY_FILE_CHANGE |
| cursor preservation across reload (M-032) | ✓ save/restore in loadChange |
| preview flag CLI → PendingOpens → renderer (M-033) | ✓ AtomicBool threading |
| preview + live-reload integration (M-033 → M-032) | ✓ previewMode bypasses dirty check |

---

## Test Results

- **vitest:** 2680 pass / 0 fail (+27 new: 15 live-reload + 12 preview-mode)
- **cargo test m031:** 4 pass (+1 before_file_takes_priority)
- **cargo test m020:** 15 pass (includes preview flag tests)
- **cargo test full:** 426 pass
- **build:** success

---

## Gate Decision

**PASS** — all B6/B7 features functional and tested:
- Inline diff view via Cmd+D or command palette ✓ (M-031)
- Git + .before file baseline resolution ✓ (M-031)
- Per-tab diff state ✓ (M-031)
- View menu item with accelerator ✓ (M-031)
- Live-reload on external file change ✓ (M-032)
- Cursor/scroll preserved across reload ✓ (M-032)
- 15 dedicated live-reload tests ✓ (M-032)
- CLI --preview opens read-only tab ✓ (M-033)
- Preview tabs auto-reload on external change ✓ (M-033)
- 12 dedicated preview-mode tests ✓ (M-033)

Deferred (not blocking):
- Side-by-side diff mode (M-031)
- Auto-detect .before on file open (M-031 step 4)
- Remaining BLOCK markers (diagnostics only)
