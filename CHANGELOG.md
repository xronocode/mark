# Changelog

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
