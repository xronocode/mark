# Changelog

## v1.2.0 — Renderer hardening track (no user-facing feature changes)

This release contains a long sequence of small, mechanical refactors that
relocate every direct Node-core / `@electron/remote` touchpoint out of the
renderer process. After v1.2.0, the renderer runs under
`contextIsolation: true` + `nodeIntegration: false`, talking to main
exclusively through the preload `contextBridge` (`window.electron`,
`window.fileUtils`, `window.path`, `window.commandExists`, `window.i18nUtils`,
`window.rgPath`) and a small set of `mt::*` IPC handlers.

The user-visible behavior of every existing feature is unchanged.

### Security posture

- `contextIsolation`: `false` → **`true`** for both editor and preferences windows.
- `nodeIntegration`: `true` → **`false`** for both windows. Renderer cannot
  `require()` Node-core modules at runtime.
- `webSecurity`: **remains `false`** for now. Mark loads user-selected images
  and theme CSS via `file://` URLs, which the same-origin policy would block.
  Tightening this is a v1.3 follow-up that will introduce a custom protocol
  handler with an explicit allow-list for the user's project tree and the
  app's themes directory.
- `@electron/remote` dependency dropped entirely. The 3 `remoteEnable` /
  `remoteInitializeServer` calls in main are gone.

### Migration impact for third-party tooling

If anyone built a custom plugin or external integration that depended on
the renderer being able to `require('fs')` / use `@electron/remote` /
read `process.env.X` directly: that path no longer works. Mark v1.x did
not ship any such extension surface, so this only matters for forks
that added their own.

The new contract for any future renderer-side code is:

- Filesystem ops → `window.fileUtils.*` (readFile/writeFile/stat/copy/move/...)
- Path ops → `window.path.*`
- OS detection → `window.electron.process.platform`
- App env → `window.electron.process.env.*` (`MARKTEXT_VERSION_STRING`, etc.)
- Resources path → `window.electron.resourcesPath`
- Tmp dir → `window.electron.tmpDir`
- Native dialogs / menus → `mt::*` IPC handlers (see `src/main/app/windowManager.js`)
- Image upload (picgo / cliScript) → `mt::image-upload-run-command`
- Content / file search (ripgrep) → `mt::search-spawn` + `mt::search-event`

### Bundle / startup

- Renderer bundle: **~38 KB smaller** (~3.30 MB → 3.26 MB) — `@electron/remote`
  client and the renderer-side ripgrep parsing classes drop out.
- No measurable change in cold-start time on M2 macOS.

### Internal — sub-tickets shipped (commit hashes on `v1-on-tkaixiang`)

The cleanup landed as 14 mechanical commits plus one audit-driven follow-up.
Each is independently revertable:

- `9a828ac4` — step-8a: 4 fs imports → `window.fileUtils.*`
- `b152700b` — step-8b: `process.platform` → preload-bridged isOsx/isWindows/isLinux
- `139f11a2` — step-8c: `process.env.NODE_ENV` / `UNSPLASH_ACCESS_KEY` → `import.meta.env.*`
- `32d53228` — step-8d: `process.{resourcesPath,env.APPIMAGE,env.MARKTEXT_RIPGREP_PATH}` → preload bridge
- `89a3909f` — step-8e: `@electron/remote.clipboard` → `window.electron.clipboard`
- `d6806de0` — step-8f: `@electron/remote.getCurrentWindow` → `mt::window-*` IPCs (5 sites + 4 main handlers)
- `c21b4a13` — step-8g: `@electron/remote.Menu`/`MenuItem` → `mt::window-popup-{context,app}-menu` IPCs
- `706a2843` — step-8h: picgo/cliScript exec relocated to `src/main/imageUpload/`
- `b413b7c5` — step-8j: `crypto` / `os.tmpdir` / `Buffer` → Web Crypto / preload `tmpDir` / `Uint8Array`
- `6dbf21e3` — step-8k: `ipcRenderer.sendSync` → `invoke` (`mt::ask-for-image-path`)
- `8a3e89b6` — step-8l: `@hfelix/electron-localshortcut` deep-import + Vite `define` polyfill
- `a2b16c24` — step-8m: `global.marktext` → `window.marktext` (20 sites in 14 files)
- `5fde8745` — step-8i: ripgrep search relocated to `src/main/search/` with streaming IPC
- `f8539737` — step-8z: `contextIsolation: true` flip + `@electron/remote` dep drop
- `99cb11d2` — step-8z follow-up: preload `stat` returns plain object; expose `unlink`

The `99cb11d2` follow-up resolves a blocker surfaced by a code-review pass:
`stat.isFile()` is a method call that does not survive `contextBridge`
structured cloning. The preload's `stat` now returns precomputed booleans.

### Pre-release verification

Functional smoke checklist for v1.2.0 lives in
[`docs/v1.2-smoke-checklist.md`](docs/v1.2-smoke-checklist.md). macOS arm64
only (Intel deferred since v1.0.0).

## v1.1.0 — 2026-04-25

Sidebar/titlebar redesign + multi-root workspace.

### UI

- **Titlebar nav cluster** — four icons (☰ Sidebar / 📂 Files / 📑 TOC / ⚙ Settings) clumped on the left, no gap. Single-click switches sidebar content; clicking 📂 while already on Files (with at least one project loaded) opens the Finder dialog to ADD another root.
- **Sidebar redesign** — removed the legacy 45 px left icon-strip column. Search toolbar (input + `Aa` `\b` `.*` text-label options with extended-tooltip examples) is always visible at the top. Below: search results when a query is active, otherwise the per-root tree or TOC.
- **Per-root tree section** — each opened folder gets its own collapsible section with an independent fold arrow and a small ✕ close-button on hover.
- **Empty-root pseudo-row** — instead of a centered "Create File" button, an empty root now shows a clickable row with a small green M icon (with `+` badge) and an italic "Новый файл" / "New file" label. Mirrors the visual weight of a regular file row.
- **Spacing** — titlebar-to-first-section gap tightened (35 → 11 px); "Open Files" header hidden entirely when there are no open tabs.

### Multi-root workspace

- **Click 📂 ADDS another folder** — when the sidebar is already on Files view with at least one project, the dialog opens for adding a sibling root rather than replacing. First-time use (no projects) still opens the dialog as the bootstrap action. The File → Open Folder menu retains its v1.0 *replace* semantic.
- **Per-root close** — each root section's hover ✕ button removes only that root, unwatches its file-system observer, and emits `mt::close-project-root` to the main process. Other roots stay intact.
- **Nested-root rejection** — opening a folder that's inside an already-opened root (or a parent of an already-opened root) is refused with a notification. Comparison is path-segment aware (`/foo` vs `/foobar` does not collide).
- **Search across all roots** — the in-app folder search now ranges over every opened root in parallel and aggregates matches. Cancel + 100-result soft-limit logic preserved.
- **Tree-event routing** — file-watcher events are dispatched to the owning root by longest-prefix path-segment match; events that arrive before a root is loaded are buffered per future root pathname and replayed on load.

### Translations (10 locales)

- New strings for the close-folder tooltip, new-file pseudo-row, search-option tooltip examples, search empty/searching placeholders.

### Notes

- Persistence of multi-root sessions across app restarts is **not** in v1.1.0; only the most-recently-added root is restored on cold start. Multi-folder `lastOpenedFolders[]` will land in v1.2.
- macOS arm64 only (Intel deferred since v1.0.0).

## v1.0.3 — 2026-04-25

Hotfix on top of v1.0.2.

### Fixed

- **Main process silently exits ~1.5s after launch** — v1.0.1's auto-resize feature added an `mt::request-window-content-size` ipcMain listener; the renderer's bootstrap-editor flow then fired this IPC during initial layout-store hydration, and somewhere in that path the main process would exit cleanly with code 0 (no crash, no error visible in stderr). Reproduced both via `open -a Mark` and via direct binary launch. v1.0.2's lazy-import-of-screen fix did not address this distinct failure mode.

### Removed

- **Auto-resize window on sidebar toggle** (V-A5-2 from v1.0.1) — IPC handler removed entirely from `src/main/app/windowManager.js`. Renderer-side emitter is left in place but main no longer listens (Electron drops unhandled `ipcMain.on` messages silently — safe no-op). The feature will be re-introduced in v1.1.0 with proper sequencing tests after the main-side root cause is understood.
- `autoSnapWindowWidth` preference key remains declared in schema/preference.json but is currently inert. Will be wired again in v1.1.0.

### Notes

- All other v1.0.1/1.0.2 features intact: titlebar sidebar-toggle button, Preferences typography + Language category extraction, Preferences window native macOS traffic-lights, full Mark/xronocode rebrand, About copyright lineage.
- macOS arm64 only.

## v1.0.2 — 2026-04-25

Hotfix on top of v1.0.1.

### Fixed

- **Cold-start crash on file-association launch (TypeError: screen module before app.ready)** — opening a `.md` file from Finder while Mark wasn't running could crash the main process during window creation. The v1.0.1 auto-resize handler had a top-level `import { ..., screen } from 'electron'` which triggers Electron's `screen` getter at module load, before `app.ready`. The `windowStateKeeper` package (called by `EditorWindow.createWindow`) then re-accessed the screen module and threw. Switched to lazy `const { screen } = require('electron')` inside the IPC handler so the getter only fires after the app is ready.

## v1.0.1 — 2026-04-25

Polish release on top of v1.0.0 — driven by feedback after the first install.

### UI

- **Sidebar toggle button in titlebar** — clickable icon next to the macOS traffic-lights (or after the Win/Linux hamburger), driving the same Pinia layout-store action as `Cmd+J`. Active state when the sidebar is visible.
- **Auto-resize window on sidebar toggle and on initial editor load** — window content width snaps to a comfortable editor width plus the sidebar (when visible). Width changes by exactly `sideBarWidth` on toggle; height untouched. Skipped when window is maximized or fullscreen, and when the new preference `autoSnapWindowWidth` is disabled.
- **Preferences typography tightened** — sidebar list-items 18 → 15 px (icons 28 → 22, height 50 → 42); section headings 1.1em → 1.2em / weight 500. Resulting hierarchy: page h4 22 > sidebar h3 20 > section h6 16.8 > sidebar item 15 > form labels 14.
- **Language is now its own Preferences category** — extracted from the General page's "Misc" section into a standalone sidebar entry at the bottom, with a globe icon. Translations added in all 10 locales.
- **Preferences window now uses native macOS traffic-lights** — `titleBarStyle: 'hiddenInset'` instead of the custom right-side close button. Same chrome the editor window uses.

### Branding

- **Mark identity throughout the UI** — replaced stale "MarkText" / "Tkaixiang fork" references in About dialog, titlebar placeholder, crash dialog, CLI banner, exception report header, GitHub uploader commit messages, schema descriptions, and 168 i18n strings across 10 locales.
- **Repo URLs unified to `xronocode/mark`** — Help menu → Releases / Discussions / Report Issue / Source / License; in-app docs links (Markdown reference, Basics, Keybindings, Images, Export themes) now point at our own copy of the docs in `xronocode/mark/blob/electron/docs/`.
- **About dialog credits the full lineage** — `Copyright © Jocs 2017+, tkaixiang 2024+, xronocode 2026+` instead of the original single-author line.

### Fixed

- Sidebar toggle icon vertical alignment nudged 2 px down to match the macOS traffic-light optical centre (cosmetic).

### Notes

- macOS arm64 only (same as v1.0.0). Intel x64 build still pending; tracking in v1.0.2 / v1.1.0.
- Bundle size unchanged within ±5 KB of v1.0.0 (3,292 KB index entry).

## v1.0.0 — 2026-04-25

First release of **Mark** — a downstream fork of
[Tkaixiang/marktext](https://github.com/Tkaixiang/marktext) (which itself
modernizes the unmaintained [marktext/marktext](https://github.com/marktext/marktext)).

### What's new vs upstream tkaixiang baseline

#### Russian localization

Russian (`ru`) added as a first-class UI language: ~1419 translated strings
covering the entire preferences and menu surface. Sidebar typography also
tuned for the longer Russian labels. Russian is positioned right after
English in the language picker.

#### macOS distribution under ad-hoc signing

- Bundle rebranded `marktext` → `Mark` (`com.xronocode.mark`).
- Builds are ad-hoc signed via `codesign --sign -` in an electron-builder
  `afterPack` hook (`scripts/ad-hoc-sign.js`). Apple Silicon Gatekeeper
  accepts the signature; quarantine still needs to be cleared on first
  install (the Homebrew cask handles this in postflight).
- New release workflow with `macos-14` (arm64) and `macos-13` (x64)
  blocking, Linux/Windows non-blocking.
- Homebrew tap published at [xronocode/homebrew-mark](https://github.com/xronocode/homebrew-mark):
  ```sh
  brew tap xronocode/mark
  brew install --cask mark
  ```

#### Cherry-picked upstream fixes (Phase-A2-5)

Three fixes that exist as open PRs against `marktext/marktext` but were not
inherited by `Tkaixiang/marktext`:

- **#4154 — EPIPE crash in main process** — `electron-log`'s console
  transport could throw EPIPE when stdout/stderr was closed mid-write,
  crashing the main process. Silent EPIPE-only filter on
  `process.{stdout,stderr}.on('error')`. Credit: @Wordbe.
- **#4135 — empty heading slug guard** — headings containing only special
  characters produced an empty slug; clicking them in the outline ran
  `querySelector('#')` which threw `SyntaxError` and froze anchor scroll.
  Slugger now falls back to `"heading"` for empty slugs; renderer wraps
  `querySelector` in try/catch; table-drag controllers guard against
  detached tables. Credit: @Bowl42.
- **#4177 — shell.openPath confirmation (CWE-601)** — clicking a markdown
  link that resolved to a local non-markdown file (e.g. an executable)
  silently called `shell.openPath`. Now shows a confirmation dialog before
  any non-markdown `openPath` invocation. Markdown link clicks are
  unchanged. Credit: @Sebastion.

#### Build optimizations

Renderer bundle split into vendor chunks (Vue ecosystem, Element Plus,
CodeMirror, KaTeX, Mermaid, Vega, Cytoscape) via Rollup `manualChunks`.
Index entry chunk reduced from **7.27 MB → ~3.12 MB (-57%)**.

ESLint flat-config global-ignore block fixed: removed ~984k spurious
errors from minified vendor files; lint now produces only real signal.

### Lineage and credits

- **[marktext/marktext](https://github.com/marktext/marktext)** — original
  authors: [@Jocs](https://github.com/Jocs) and the
  [marktext community](https://github.com/marktext/marktext/graphs/contributors).
  Unmaintained for ~3 years.
- **[Tkaixiang/marktext](https://github.com/Tkaixiang/marktext)** — active
  modernization fork by [@tkaixiang](https://github.com/Tkaixiang) and
  contributors. Migrated the stack to electron-vite + Vue 3 + Pinia and
  bumped to Electron 41. Russian localization in this v1.0 sits on top
  of [@hubo1989](https://github.com/hubo1989)'s upstream i18n work that
  added the other 9 languages.
- **[xronocode/mark](https://github.com/xronocode/mark)** (this repo) —
  Russian localization, ad-hoc macOS signing, Homebrew cask distribution.
  Bug fixes back-ported from `marktext/marktext` PRs that did not land in
  the Tkaixiang baseline.

### Install

#### macOS (Apple Silicon and Intel)

```sh
brew tap xronocode/mark
brew install --cask mark
```

#### Windows / Linux

Best-effort builds attached to this release (non-blocking in CI). If they
fail to materialize for v1.0.0, the
[Tkaixiang/marktext releases](https://github.com/Tkaixiang/marktext/releases)
remain a viable source for non-mac platforms — Mark only adds Russian
i18n + mac signing on top of that baseline.

### Known limitations

- Linux/Windows builds are best-effort and may not be present in this
  release. Future releases will harden them.
- Apple notarization is intentionally not done (no $99/year Developer ID).
  Ad-hoc signing + cask postflight `xattr -cr` is sufficient for typical
  user installs but more restrictive enterprise Gatekeeper policies may
  still block the bundle.
- Mermaid is at the version inherited from tkaixiang baseline; further
  Mermaid v11 work and Full WYSIWYG / Read-Only / HTML-paste features
  from upstream PRs are deferred to v1.1.

### What's next

- v1.1: port deferred upstream features (PR-4070 Read-Only, PR-4145 Full
  WYSIWYG, PR-4146 unsaved-prompt fix, PR-4150 HTML paste with images)
  under Vue 3 / Pinia.
- v2.0: Tauri v2 rewrite (`reborn-mark/`) targeting <30 MB footprint.
