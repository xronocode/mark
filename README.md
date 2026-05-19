# Mark

[![Tests](https://github.com/xronocode/mark/actions/workflows/test.yml/badge.svg)](https://github.com/xronocode/mark/actions/workflows/test.yml)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Platform](https://img.shields.io/badge/platform-macOS%20arm64-lightgrey)
![App Size](https://img.shields.io/badge/app_size-11%20MB-brightgreen)
![RAM](https://img.shields.io/badge/RAM_idle-61%20MB-brightgreen)

**The WYSIWYG Markdown editor that Mark Text should have become.**
**11 MB on disk. 61 MB RAM. Native macOS. Open source.**

<p align="left">
  <a href="https://ko-fi.com/xronocode" target="_blank" title="If Mark saves you a 200 MB Electron install — buy the maintainer a coffee">
    <img height="36" src="https://storage.ko-fi.com/cdn/kofi3.png?v=3" alt="Buy Me a Coffee at ko-fi.com" />
  </a>
</p>

![Mark editor showing demo markdown with WYSIWYG rendering — dark theme](assets/screenshots/hero-dark.png)

[Mark Text](https://github.com/marktext/marktext) was the best free WYSIWYG Markdown editor. Then it was abandoned in 2023, and 54k GitHub stars went silent. The community forks patched security holes but stayed on the same 200 MB Electron base.

Mark is the rewrite that picks up where Mark Text left off — same WYSIWYG engine (muya), same UX paradigm, but rebuilt from scratch on **Tauri 2 + Rust + WKWebView**. No Chromium. No Node.js. No 6-second cold starts.

```sh
brew tap xronocode/mark && brew install --cask mark@alpha
```

---

## Mark vs. the alternatives

| | **Mark** | Mark Text | Typora | Obsidian | iA Writer |
|---|:---:|:---:|:---:|:---:|:---:|
| WYSIWYG (inline, not split-pane) | **Yes** | Yes | Yes | No | Partial |
| App size on disk | **11 MB** | 200 MB | 100 MB | 300 MB | 30 MB |
| RAM at idle | **61 MB** | 400 MB | 200 MB | 250 MB | 50 MB |
| Open source | **MIT** | MIT (abandoned) | No | No | No |
| Price | **Free** | Free | $14.99 | Free / $50yr | $49.99 |
| Native macOS feel | **Yes** (WKWebView) | No (Chromium) | No (Chromium) | No (Chromium) | Yes (AppKit) |
| Mermaid / KaTeX / Vega | **Yes** | Yes | Mermaid+KaTeX | Via plugins | No |
| 33 built-in themes | **Yes** | 6 themes | CSS themes | CSS themes | 3 themes |
| Active development | **Yes** | Abandoned 2023 | Slow | Active | Active |

Mark occupies a gap no one else fills: **open-source + native performance + true inline WYSIWYG**.

---

## Why Mark?

- **11 MB, not 200 MB.** Tauri 2 uses the system WebView. No bundled Chromium, no bundled Node.js. The DMG is 5.4 MB.
- **61 MB RAM, not 400 MB.** One process, not five. Your battery will thank you.
- **Native macOS.** System WKWebView, native menu bar, NSSpellChecker, ad-hoc code signing (no $99/year Apple Developer account).
- **33 themes out of the box.** Gruvbox, Catppuccin, Nord, Tokyo Night, Dracula, Solarized, Rose Pine, Ayu, and more. Live cross-window sync between Editor and Settings.
- **Open and honest.** MIT licensed. Alpha is alpha — the [feature matrix](#status) is front-and-center, not buried. What works has 792 tests; what doesn't is tracked with a target milestone.
- **Yours.** No telemetry, no cloud, no plugin marketplace pulling code from strangers. Files are files.

### Themes

![Mark Preferences — Theme picker](assets/screenshots/themes.png)

> **This is an alpha.** Daily-driver-quality for routine writing on Apple Silicon (that's how it's developed), but it has known gaps. For a battle-tested Electron alternative right now, install [`mark` (Electron channel)](#electron-stable-channel) instead.

---

## How it works

```
┌──────────────────────────────────────────────────────┐
│  Vue 3 + Pinia + Element Plus + muya WYSIWYG engine  │   <-  src/renderer/
├──────────────────────────────────────────────────────┤
│  M-013a typed IPC contract (32 commands)             │
│  ipc.runtime: invoke / listen wrappers, type-checked │
├──────────────────────────────────────────────────────┤
│              Tauri 2 webview + IPC bridge            │
├──────────────────────────────────────────────────────┤
│  Rust backend (src-tauri/src/)                       │
│  ├─ m001  panic, save/close state machine, validate  │
│  ├─ m005  prefs (tauri-plugin-store + migration)     │
│  ├─ m006  global shortcuts                           │
│  ├─ m007  spellchecker (NSSpellChecker)              │
│  ├─ m008  font enumeration (font-kit)                │
│  ├─ m009  native menu                                │
│  ├─ m010  path sandbox + URL whitelist               │
│  ├─ m013b fs / search / watcher (notify-debouncer)   │
│  ├─ m015  pandoc bridge                              │
│  ├─ m016  auto-updater (ed25519)                     │
│  ├─ m017  recent docs                                │
│  ├─ m018  screenshot (macOS screencapture)           │
│  └─ m019  keychain (datacenter)                      │
└──────────────────────────────────────────────────────┘
```

The Vue frontend is ported from Mark Text v1.2.3; the muya engine has zero Electron coupling (verified — `grep -r 'require..electron' src/muya/` returns 0 hits). The IPC layer between Vue and Rust is fully typed: every renderer→backend call goes through `M-013a CommandMap` which is schema-validated against the `tauri::generate_handler!` list at boot. Drift between frontend and backend trips a startup dialog instead of a confusing runtime error.

Backend libraries doing the actual work: [`notify`](https://crates.io/crates/notify) + [`notify-debouncer-full`](https://crates.io/crates/notify-debouncer-full) for file-watching, [`grep-searcher`](https://crates.io/crates/grep-searcher) (in-process — no ripgrep shell-out) for folder search, [`font-kit`](https://crates.io/crates/font-kit) for system font enumeration, [`tauri-plugin-store`](https://crates.io/crates/tauri-plugin-store) for prefs persistence, [`tauri-plugin-updater`](https://crates.io/crates/tauri-plugin-updater) for ed25519-signed auto-update.

---

## Status

**v2.0.0-alpha.6** — usable as a daily driver for routine markdown writing on macOS Apple Silicon.

| Feature | Status |
|---|---|
| WYSIWYG markdown editing (muya engine) | **Working** |
| Save / Save As / Open file | **Working** |
| Multi-tab editing | **Working** |
| Open Folder / sidebar tree | **Working** |
| External-edit live reload (file-watcher) | **Working** |
| Cross-window preference broadcast | **Working** |
| 33 themes + custom CSS | **Working** |
| Native macOS menu + keyboard shortcuts | **Working** |
| Dirty-tab close prompt (Save/Discard/Cancel) | **Working** |
| Mermaid v11 / KaTeX / Vega diagrams | **Working** |
| Spell-check via NSSpellChecker | **Working** |
| Preview mode on Finder open | **Working** |
| Set as default .md handler | **Working** |
| Auto-update via Homebrew cask | **Working** |
| Find in file (Cmd+F) | Beta |
| Find in folder (ripgrep) | Beta |
| Print to PDF via Pandoc | Requires Pandoc |
| Linux / Windows builds | macOS-only at alpha |

Full roadmap with 55+ tracked items lives in [`docs/development-plan.xml`](https://github.com/xronocode/mark/blob/main/docs/development-plan.xml).

---

## Install

### Tauri alpha (recommended)

```sh
brew tap xronocode/mark
brew install --cask mark@alpha
```

Ad-hoc signed. The cask postflight clears `com.apple.quarantine` so Gatekeeper accepts the local signature without prompting. No `sudo xattr` dance needed.

### Electron stable channel

Battle-tested Electron build (frozen at v1.2.3, security fixes only):

```sh
brew tap xronocode/mark
brew install --cask mark
```

Both casks coexist (`Mark.app` + `Mark Alpha.app`). When v2.0 stable ships, the `mark` cask rolls forward to Tauri and `mark@v1` becomes a 12-month maintenance channel.

---

## Quality

This isn't a weekend port. 10 phases of sign-off work, every module contract-tested:

| Surface | Coverage |
|---|---|
| Renderer (vitest) | **374 tests** |
| Backend (cargo test) | **418 tests** |
| End-to-end (Playwright) | 5 specs against built renderer |
| CI matrix | macOS-14 + ubuntu-latest, on push & PR |
| Code review | smart-review 5-agent audit (excellence + failure-hunt + simplify) |

**792 unit tests** + 5 e2e + CI gate. See [`.github/workflows/test.yml`](https://github.com/xronocode/mark/blob/main/.github/workflows/test.yml).

---

## Build from source

Requirements:

- Rust **1.79+** (`rustup install stable`)
- Node **20 LTS**
- Xcode Command Line Tools (`xcode-select --install`) — for `safaridriver`, code-signing, and the Tauri webview shim

```sh
git clone https://github.com/xronocode/mark.git
cd mark
npm ci
npm run tauri build --debug      # → target/debug/bundle/macos/Mark.app
# or
npm run tauri build              # release: ~22 MB binary, LTO + strip
```

For a fast inner loop:

```sh
npm run tauri dev                # watches src/renderer + src-tauri
```

If `tauri dev` shows a blank window, see `src-tauri/tauri.dev.conf.json` — Vue 3 dev mode requires `'unsafe-eval'` in CSP for runtime template compilation, and that override is gated to dev only.

### Test

```sh
npm test                         # vitest (renderer)
cd src-tauri && cargo test --bin mark   # rust unit tests
npm run test:e2e                 # Playwright against built renderer
```

---

## Heritage

Mark is the spiritual successor to [Mark Text](https://github.com/marktext/marktext) (54k+ stars, abandoned 2023). Built on the shoulders of:

1. **[marktext/marktext](https://github.com/marktext/marktext)** — the original Electron Mark Text by [@Jocs](https://github.com/Jocs). The muya WYSIWYG engine, themes, and the entire UX paradigm. Abandoned in 2023.
2. **[Tkaixiang/marktext](https://github.com/Tkaixiang/marktext)** — community fork with critical security and crash fixes (CVE-2023-2318, Mermaid v11). Our Electron stable channel is downstream of Tkaixiang.
3. **This repo** — Phase A: Electron 41 modernization (shipped v1.2.3) + Phase B: Tauri 2 rewrite (this branch, active development).

| Branch | Engine | Status | Cask |
|---|---|---|---|
| `main` (this) | Tauri 2 + Rust + Vue 3 | **alpha** | `mark@alpha` |
| `electron` | Electron 41 + Vue 2 | frozen, security-only | `mark` |

---

## Contributing

Pull requests welcome. The project follows the **GRACE** (Graph-RAG Anchored Code Engineering) methodology — every module has a `MODULE_CONTRACT` header documenting its purpose, scope, dependencies, and verification reference. The `docs/` directory carries the development plan, knowledge graph, and verification matrix as XML artifacts that humans and agents both read.

Path of least friction:

1. Fork → branch from `main`.
2. Run `npm test && cd src-tauri && cargo test --bin mark` locally.
3. Open a PR — the GitHub Actions matrix gates merge on macOS + Linux.

For larger changes, please open an issue first; the codebase has a fairly opinionated layout (see [How it works](#how-it-works)).

---

## Support the project

Mark is built on personal time. If it saves you from a 200 MB Electron install or 6-second cold starts, consider buying me a coffee — it goes directly into more polish phases like the one this repo just went through.

<p align="left">
  <a href="https://ko-fi.com/xronocode" target="_blank">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Buy Me a Coffee at ko-fi.com" />
  </a>
</p>

Other ways to help: ⭐ star the repo, file issues with concrete repros, or send a PR fixing something on the [followup list](https://github.com/xronocode/mark/blob/main/docs/development-plan.xml).

---

## License

[MIT](LICENSE), inherited from upstream Mark Text.

## Maintainer

[@xronocode](https://github.com/xronocode) · [Ko-fi](https://ko-fi.com/xronocode)
