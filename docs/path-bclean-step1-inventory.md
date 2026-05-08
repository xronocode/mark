# Path B-clean — Step 1 Inventory

Generated 2026-05-09 from `grep -rn "window\.electron\.ipcRenderer" src/renderer/src`.

## Headline numbers

| Metric | Count |
|---|---|
| Total IPC call sites | **151** |
| Unique `mt::` channels | **106** |
| Files containing IPC calls | **23** |
| `send` calls (fire-and-forget) | 69 |
| `on` listener registrations | 62 |
| `invoke` (already awaited) | 13 |
| `removeListener` / `removeAllListeners` | 6 |
| `once` | 1 |

## Files ranked by IPC density

| File | IPC calls | Wave assignment |
|---|---|---|
| store/editor.js | 58 | W2 + W4 + W5 |
| commands/index.js | 15 | W6 (menu sweep) |
| components/titleBar/index.vue | 13 | W4 (window-state) |
| store/preferences.js | 10 | **W1** |
| store/project.js | 6 | W3 |
| store/layout.js | 6 | W4 |
| store/autoUpdates.js | 6 | new wave **W7-update** |
| store/listenForMain.js | 5 | W5 |
| spellchecker/index.js | 4 | new wave **W8-spell** |
| node/ripgrepSearcher.js | 4 | search (alpha-deferred) |
| i18n/index.js | 4 | W1 (lang is a pref) |
| prefComponents/spellchecker/index.vue | 3 | W8-spell |
| prefComponents/keybindings/index.vue | 3 | W5 (shortcuts) |
| store/notification.js | 2 | W4 (small) |
| store/commandCenter.js | 2 | W6 |
| prefComponents/sideBar/index.vue | 2 | W6 |
| menu-bridge.js | 2 | W6 |
| util/fileSystem.js | 1 | W2 |
| store/tweet.js | 1 | beta (low-pri) |
| store/index.js | 1 | W1 |
| _shims/install-window-globals.js | (the shim itself) | step-6 |

## Channels grouped by domain

### W1 — prefs / user-data / i18n (9 channels, ~14 sites)
`mt::ask-for-user-preference`, `mt::ask-for-user-data`, `mt::set-user-preference`, `mt::set-user-data`, `mt::user-preference`, `mt::get-current-language`, `mt::current-language`, `mt::ask-for-modify-image-folder-path`, `mt::select-default-directory-to-open`

### W2 — file ops / save / open (12 channels, ~25 sites)
`mt::editor-ask-file-save`, `mt::editor-ask-file-save-as`, `mt::response-file-save` (already migrated), `mt::response-file-save-as`, `mt::tab-saved`, `mt::tab-save-failure`, `mt::set-pathname`, `mt::cmd-open-file`, `mt::open-file`, `mt::open-file-by-window-id`, `mt::open-new-tab`, `mt::response-file-move-to`, `mt::save-tabs`

### W3 — project / folder / watcher (7 channels, ~10 sites)
`mt::ask-for-open-project-in-sidebar`, `mt::cmd-open-folder`, `mt::open-directory`, `mt::update-object-tree`, `mt::close-project-root` (UNIMPLEMENTED in Rust), `mt::update-file`

### W4 — window-state / layout / close (24 channels, ~30 sites — biggest wave)
`mt::ask-for-close`, `mt::close-window`, `mt::close-window-confirm`, `mt::cmd-close-window`, `mt::cmd-new-editor-window`, `mt::save-and-close-tabs`, `mt::force-close-tabs-by-id`, `mt::view-layout-changed`, `mt::set-view-layout`, `mt::toggle-view-layout-entry`, `mt::window-active-status`, `mt::window-initialized`, `mt::window-state`, `mt::window-tab-closed`, `mt::window-zoom`, `mt::window-popup-app-menu`, `mt::window-maximize`, `mt::window-maximize-toggle`, `mt::window-unmaximize`, `mt::window-minimize`, `mt::window-enter-full-screen`, `mt::window-leave-full-screen`, `mt::window-fullscreen-toggle`, `mt::window-toggle-always-on-top`, `mt::app-try-quit`, `mt::request-window-content-size`

### W5 — editor events (line ending, tab cycle, screenshot, export, etc) (20 channels, ~35 sites)
`mt::bootstrap-editor`, `mt::editor-close-tab`, `mt::editor-edit-action`, `mt::editor-format-action`, `mt::editor-paragraph-action`, `mt::editor-move-file`, `mt::editor-rename-file`, `mt::tabs-cycle-left/right`, `mt::switch-tab-by-index/file`, `mt::set-line-ending`, `mt::set-file-encoding` (per agent missing in channel list — verify), `mt::set-final-newline` (same), `mt::update-line-ending-menu`, `mt::cm-copy-as-html`, `mt::cm-copy-as-rich`, `mt::cm-paste-as-plain-text`, `mt::cm-insert-paragraph`, `mt::screenshot-captured`, `mt::make-screenshot`, `mt::print-service-clearup`, `mt::export-success`, `mt::response-export`, `mt::show-export-dialog`, `mt::invalidate-image-cache`, `mt::request-keybindings`, `mt::update-sidebar-menu`

### W6 — menu / dispatch (3 channels)
`mt::menu-invoked` (existing), `mt::open-setting-window`, `mt::about-dialog` (TBD)

### W7 — auto-update (separate small wave, 6 sites in store/autoUpdates.js)
`mt::auto-update-error`, `mt::auto-update-available`, `mt::auto-update-progress`, `mt::auto-update-not-available`, `mt::auto-update-downloaded`, install/check triggers

### W8 — spell-checker (separate small wave)
`mt::spellchecker-get-available-dictionaries`, `mt::spellchecker-set-enabled`, `mt::spellchecker-switch-language`, `mt::spelling-show-switch-language`

### Search (deferred per F-SEARCH-DISABLED-FOR-ALPHA)
`mt::search-cancel`, `mt::search-event`

## Key surprises vs original estimate

1. **151 not 30-50** — 3x bigger. Original estimate was off by 100+ sites.
2. **store/editor.js holds 58** — 38% of total. Single-file weight; cannot do W2 wave atomically — must split editor.js by sub-domain (save / close-flow / tabs / encoding / screenshot).
3. **Window-state is the biggest channel domain (24 channels)** — almost a quarter of all unique IPCs. Many are window-management primitives (maximize/full-screen/zoom) that v1 Electron handled natively and Tauri exposes through `Window` Tauri API. Those don't need backend Rust commands at all — they're direct Tauri API calls.
4. **Two new waves emerge**: W7 auto-update + W8 spell-checker. Wasn't in original plan but they're isolated enough to do independently.
5. **`mt::close-project-root` listener UNIMPLEMENTED in Rust** (per W3 swarm finding) — sends from JS go to nowhere; Rust never unsubscribes the watcher. Pre-existing zombie-watcher bug.
6. **i18n/index.js has 4 IPC calls** — language is split between preferences and i18n module. W1 should bundle both.
7. **commands/index.js has 15 IPC sites** — every menu command. W6 will touch this file heavily.
8. **titleBar/index.vue has 13 IPC sites** — most are window-management (maximize/minimize). Direct Tauri Window API replaces them; no backend changes needed for those 13.

## Revised wave count

Original: 6 waves (W1-W6).
Revised: **8 waves** (W1-W8) — added W7-update and W8-spell as independent small waves.

W2 and W4 remain heavyweight (each ~30 sites). W2 may need splitting into W2a (save/load) and W2b (open/new-tab).

## Total effort revision

Original: 3-5 days. With 151 sites instead of 30-50, **realistic estimate now 5-8 working days** focused.

Mitigating factor: ~25 of 151 are window-management calls (maximize, fullscreen, zoom) that map 1:1 to `@tauri-apps/api/window` — find-replace, no backend involvement. So effective complexity is more like 125 sites.
