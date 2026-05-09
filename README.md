# Mark

> Native-feel, lightweight, security-first Markdown editor for macOS.
> Built on **Tauri 2 + Rust + Vue 3**.

[![Tests](https://github.com/xronocode/mark/actions/workflows/test.yml/badge.svg)](https://github.com/xronocode/mark/actions/workflows/test.yml)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Platform](https://img.shields.io/badge/platform-macOS%20arm64%20%7C%20x86__64-lightgrey)
![Binary](https://img.shields.io/badge/binary-~25%20MB-brightgreen)

Mark is a from-scratch rewrite of [Mark Text](https://github.com/marktext/marktext) on the **Tauri 2** stack. It keeps the WYSIWYG editing experience of the original and replaces the 200 MB Electron shell with a native WKWebView + Rust binary that boots in under a second, sandboxes filesystem access by design, and ships ad-hoc-signed (no $99/year Apple Developer account required for personal use).

> ⚠️ **This is an alpha.** It's good enough for daily-driver writing on macOS Apple Silicon — that's how it's developed — but it has known gaps (see [Status](#status)). For a stable Electron-engine alternative right now, install [`mark` (Phase A)](#electron-stable-channel) instead.

---

## Why Mark

| | Mark (Tauri) | Mark Text / Electron forks |
|---|---|---|
| **App size on disk** | ~25 MB | 200–300 MB |
| **Cold start** | < 1 s | 3–6 s |
| **Memory at idle** | ~80 MB | ~250 MB |
| **Engine** | Native WKWebView (system) | Bundled Chromium |
| **Backend** | Rust (notify, grep-searcher, font-kit) | Node.js |
| **Code-signing** | Ad-hoc; no Apple Developer ID needed | Same |
| **macOS Apple Silicon** | Native arm64 binary | Native arm64 (Phase A) |
| **CSP posture** | Strict `script-src 'self'` in production | Permissive |
| **Auto-update** | tauri-plugin-updater (ed25519-signed) | electron-builder updater |

Numbers from the v0.0.1 debug build on macOS 15.4 Apple Silicon. Release builds (LTO + strip) shave a few more MB.

---

## Status

**v0.0.1-alpha** — usable for routine markdown writing, not yet a drop-in replacement for the Electron build.

| Feature | Status |
|---|---|
| WYSIWYG markdown editing (muya engine) | ✅ shipped |
| Save / Save As / Open file | ✅ |
| Multi-tab editing | ✅ |
| Open Folder / sidebar tree | ✅ |
| **External-edit live reload** (file-watcher) | ✅ shipped, Phase 2 audit |
| **Cross-window preference broadcast** (Settings ↔ Editor) | ✅ |
| Theme switching (light / dark / sepia + custom CSS) | ✅ |
| Native macOS menu + Cmd+Q | ✅ |
| Global shortcut (Cmd+Shift+M) | ✅ |
| **Dirty-tab close prompt** (Cmd+W on unsaved) | ✅ |
| Mermaid v11 / KaTeX / Vega diagrams | ✅ |
| Spell-check via NSSpellChecker | ✅ |
| Migration from Mark Text v1.2.x preferences | ✅ |
| Auto-update via Homebrew | ✅ |
| Find in file (Cmd+F) | ⚠ deferred to beta |
| Find in folder (ripgrep) | ⚠ deferred to beta |
| Print to PDF via Pandoc | ⚠ requires Pandoc on PATH |
| Linux / Windows builds | ❌ macOS-only at alpha |
| Plugin marketplace | ❌ out of scope |

See [`docs/development-plan.xml`](https://github.com/xronocode/mark/blob/main/docs/development-plan.xml) for the full followup index (currently 55 active items bucketed alpha / beta / RC / post-1.0).

---

## Install

### Tauri alpha (this branch)

```sh
brew tap xronocode/mark
brew install --cask mark@alpha
```

The cask is ad-hoc signed. The postflight script clears `com.apple.quarantine` so Gatekeeper accepts the local signature without prompting. No `sudo xattr` dance.

### Electron stable channel

If you want a battle-tested daily driver right now, install the Electron-engine Phase A build instead:

```sh
brew tap xronocode/mark
brew install --cask mark
```

Both casks coexist (`Mark.app` + `Mark Alpha.app`) so you can run them side-by-side and migrate when the alpha hits feature parity.

When v2.0 stable ships, the `mark` cask rolls forward to the Tauri engine and `mark@v1` becomes a 12-month maintenance channel for users who can't migrate yet.

---

## Architecture

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

The Vue frontend is ported from Mark Text v1.2.3 (muya engine has zero Electron coupling — verified via `grep require\(\'electron\'\)` returning 0 hits in `src/muya/`). The IPC layer between Vue and Rust is fully typed: every renderer→backend call goes through `M-013a CommandMap` which is schema-validated against the `tauri::generate_handler!` list at boot.

---

## Quality

This isn't a weekend port. The codebase has been polished in 8 phases of sign-off work:

| Surface | Coverage |
|---|---|
| Renderer unit tests | **310** tests, 8/10 stores at 100% line coverage |
| Backend unit tests | **392** tests, 80.88% workspace line coverage (85.22% excl. runtime-bound modules) |
| End-to-end (Playwright) | 5 specs against built renderer |
| CI matrix | macOS-14 + ubuntu-latest, on push & PR |
| Audit passes | grace-reviewer full-integrity, twice |

702 unit tests + 5 e2e + CI gate. See [`.github/workflows/test.yml`](https://github.com/xronocode/mark/blob/main/.github/workflows/test.yml).

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

If `tauri dev` shows a blank window, see the diagnostic note in `tauri.dev.conf.json` — Vue 3 dev mode requires `'unsafe-eval'` in CSP for runtime template compilation, and that's gated to dev only.

### Test

```sh
npm test                # vitest (renderer)
cd src-tauri && cargo test --bin mark   # rust unit tests
npm run test:e2e        # Playwright against built renderer
```

---

## Heritage

Mark stands on three repos worth of upstream:

1. **[marktext/marktext](https://github.com/marktext/marktext)** (2017–2023) — original Electron Mark Text by [@Jocs](https://github.com/Jocs). WYSIWYG markdown engine (muya), themes, the entire UX paradigm. Abandoned in 2023.
2. **[Tkaixiang/marktext](https://github.com/Tkaixiang/marktext)** (2023–) — community fork that picked up critical security and crash fixes (CVE-2023-2318, EPIPE crash, dark-mode flash, Mermaid v11 upgrade, full-WYSIWYG mode). The **Phase A Electron stable** in this repo is downstream of Tkaixiang.
3. **This repo (xronocode/mark)** — Phase A Electron 41 modernization (shipped as v1.2.3) + Phase B Tauri 2 rewrite (this branch).

The Phase A Electron build is feature-complete and frozen at v1.2.3 — it gets security fixes only. Phase B (Tauri) is where active development happens; when it reaches stable, the `mark` cask rolls forward.

Both phases live in this repo on separate branches:

| Branch | Engine | Status | Cask |
|---|---|---|---|
| `main` (this) | Tauri 2 + Rust + Vue 3 | **alpha** | `mark@alpha` |
| `electron` | Electron 41 + Vue 2 | stable, security-only | `mark` |
| `v1-on-tkaixiang` | upstream tracker | follows Tkaixiang | — |

---

## Contributing

Pull requests welcome. The project follows the **GRACE** (Graph-RAG Anchored Code Engineering) methodology — every module has a `MODULE_CONTRACT` header documenting its purpose, scope, dependencies, and verification reference. The `docs/` directory carries the development plan, knowledge graph, and verification matrix as XML artifacts that humans and agents both read.

If you're submitting a fix, the path of least friction:

1. Fork → branch from `main`.
2. Run `npm test && cd src-tauri && cargo test --bin mark` locally.
3. Open a PR — the GitHub Actions matrix gates merge on macOS + Linux.

For larger changes, please open an issue first; the codebase has a fairly opinionated layout (see Architecture above).

---

## License

[MIT](LICENSE), inherited from upstream Mark Text.

---

## Maintainer

[@xronocode](https://github.com/xronocode) ([myevdokimov@obank.kg](mailto:myevdokimov@obank.kg))
