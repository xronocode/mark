# mark — project monorepo

Private working monorepo for the Mark editor — a lightweight, revived fork of the abandoned [MarkText](https://github.com/marktext/marktext) Markdown editor.

## Layout

```
.
├── reborn-mark/                  # The new codebase (fork of marktext; 12 community PRs merged).
│                                  # Tracked as a separate git working copy — see SETUP.md.
│                                  # Will eventually be the public-facing project.
├── marktext/                     # Pristine upstream snapshot (marktext/marktext @ develop@be81e3aa).
│                                  # Read-only reference for studying legacy code.
├── homebrew-mark/                # Tap staging area (Casks/mark.rb). Becomes public repo at Phase-A3.
├── docs/                         # GRACE planning artifacts (XML).
│   ├── requirements.xml          #   UseCases UC-001..UC-028
│   ├── technology.xml            #   Stack decisions
│   ├── development-plan.xml      #   Modules M-001..M-020, phases, data flows
│   ├── verification-plan.xml     #   V-M entries, fixtures (30 XSS payloads), log markers
│   ├── knowledge-graph.xml       #   Module graph + CrossLinks
│   └── operational-packets.xml   #   Packet templates
├── AGENTS.md                     # GRACE engineering protocol for this project
├── SETUP.md                      # Step-by-step bootstrap for a fresh machine
├── SESSION_STATE.md              # Exactly where we are; cloud-resume pointer
├── PLAN.md                       # High-level plan (mirror of ~/.claude/plans)
├── marktext-port-context.md      # Original kickoff context
└── .gitignore                    # Excludes reborn-mark/ (separate working copy)
```

## Quick start (fresh machine or cloud Claude Code)

```sh
# 1. Clone the monorepo (this repo).
git clone https://github.com/xronocode/mark
cd mark

# 2. Inside the monorepo, clone the fork working-copy at the right branch.
git clone -b modernize https://github.com/xronocode/mark reborn-mark

# 3. Set up toolchain (Node 18 + Python 3.11 + yarn via corepack).
#    Full details in SETUP.md.

# 4. Resume.
cat SESSION_STATE.md
```

## Status (2026-04-24)

- **Phase-0:** ✅ GRACE artifacts seeded, fork repo configured
- **Phase-A1:** ✅ Baseline stabilization — 12 of 13 community PRs cherry-picked onto `reborn-mark` on branch `modernize`; lint + webpack build green after each
- **Phase-A2:** pending — toolchain migration (PR #4001 electron-vite + Vue 3 + Electron 30 + Node 20)
- **Phase-A3:** pending — macOS distribution (ad-hoc signing + Homebrew tap)
- **Phase-B:** pending — Tauri v2 port

See `PLAN.md` for detail.
