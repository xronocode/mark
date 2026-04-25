# Changelog

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
