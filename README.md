# mark — project monorepo

Private working monorepo for the Mark editor — reviving the abandoned [MarkText](https://github.com/marktext/marktext) via a **two-track strategy**:

| Track | Goal | Stack | Output |
|---|---|---|---|
| **Phase-A modernization** (`mark-electron/`) | Fast stabilized release built on the existing Electron codebase | Electron 30 + Vue 3 + electron-vite (after PR #4001 merges) | v1.0, early value delivery |
| **Phase-B reborn** (`reborn-mark/`) | Full slim rewrite on a new stack, keeping only the muya WYSIWYG engine | Tauri v2 + Rust backend + Vue 3 in system WebView | v2.0, ~15 MB install, ad-hoc signed |

Two tracks, one monorepo, two working copies.

## Layout

```
.
├── mark-electron/                # PHASE-A track. Fork of marktext/marktext with 12 community
│                                  # PRs merged; webpack + Electron 18 today, electron-vite + Vue 3
│                                  # + Electron 30 after Phase-A2 (PR #4001 merge).
│                                  # SEPARATE GIT — clone branch `modernize` of this repo here.
│                                  # This is the "legacy path modernized" — ships as v1.0 first.
│
├── reborn-mark/                  # PHASE-B track. Tauri v2 + Rust rewrite. THE real reborn.
│                                  # Currently empty; scaffolded via `cargo tauri init` during
│                                  # Phase-B1 (after Phase-A ships). Will live on branch `reborn`.
│
├── marktext/                     # Pristine upstream snapshot (marktext/marktext @ develop@be81e3aa,
│                                  # no .git). Read-only reference for studying legacy code.
│
├── homebrew-mark/                # Tap staging (Casks/mark.rb). Spins out at Phase-A3.
│
├── docs/                         # GRACE planning artifacts (shared across both tracks).
│   ├── requirements.xml          #   UC-001..UC-028
│   ├── technology.xml            #   Both Phase-A and Phase-B stack decisions
│   ├── development-plan.xml      #   Modules M-001..M-020, phases, data flows
│   ├── verification-plan.xml     #   V-M entries, fixtures (30 XSS payloads), 78 log markers
│   ├── knowledge-graph.xml       #   Module graph + CrossLinks
│   └── operational-packets.xml   #   Packet templates
│
├── AGENTS.md                     # GRACE engineering protocol
├── SETUP.md                      # Bootstrap recipe for a fresh machine
├── SESSION_STATE.md              # Exactly where we are — cloud resume pointer
├── PLAN.md                       # High-level plan
├── marktext-port-context.md      # Original kickoff context
└── .gitignore                    # Excludes both mark-electron/ and reborn-mark/
```

## Quick start (fresh machine or cloud Claude Code)

```sh
# 1. Clone the monorepo (lands on branch `monorepo` by default).
git clone https://github.com/xronocode/mark
cd mark

# 2. Clone the Phase-A working copy (the Electron fork with our 12 PRs).
git clone -b modernize https://github.com/xronocode/mark mark-electron

# 3. (Later, during Phase-B) — clone the Phase-B working copy.
# git clone -b reborn https://github.com/xronocode/mark reborn-mark

# 4. Set up toolchain. See SETUP.md for full detail.

# 5. Resume where we stopped.
cat SESSION_STATE.md
```

## Status (2026-04-24)

**Phase-A** (`mark-electron/`):
- ✅ Phase-0 — GRACE artifacts seeded, fork repo configured
- ✅ Phase-A1 — Baseline stabilization, 12 of 13 community PRs cherry-picked onto branch `modernize`
- ⏳ Phase-A1.5 — Renderer Node-APIs cleanup (pre-requisite for PR #4001)
- ⏳ Phase-A2 — Toolchain migration (PR #4001 electron-vite + Vue 3 + Electron 30)
- ⏳ Phase-A3 — macOS distribution (ad-hoc signing + Homebrew tap)
- ⏳ Phase-A4 — v1.0 release

**Phase-B** (`reborn-mark/`):
- ⏳ Phase-B1 — Tauri skeleton, muya mounted in WebView
- ⏳ Phase-B2 — Filesystem, search, security modules
- ⏳ Phase-B3 — Integrations (prefs, shortcuts, spell, fonts, menu, encoding, pandoc, updater, recent-docs, screenshot, datacenter, cli)
- ⏳ Phase-B4 — v2.0 release via same Homebrew cask (users upgrade seamlessly)

See `PLAN.md` for full detail, `SESSION_STATE.md` for resume pointer.
