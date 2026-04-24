# Environment bootstrap

Everything needed to run **`mark-electron/`** (Phase-A track — modernized Electron path) locally on a fresh machine. Distilled from the actual Phase-A1 session on macOS arm64 (2026-04). Linux should work similarly; Windows is officially best-effort (see `docs/requirements.xml` ResolvedDecisions).

**Note:** `reborn-mark/` (Phase-B track — Tauri rewrite) has its own separate toolchain (Rust 1.75+, Tauri v2, cargo). Recipe will land here once Phase-B1 kicks off.

## Why so specific

Upstream MarkText was last touched in 2022 (`develop@be81e3aa`). It ships with Electron 18 + Node 16 era tooling, which no longer runs on default 2026 macOS (Node 22+ default, Python 3.14 default). The sequence below is the **minimum** set of pinned toolchain bits that got upstream baseline + our 12 PR merges compiling.

## One-time system install

```sh
# 1. Node 18 LTS (Node 16 formula was removed from Homebrew in 2023).
#    Keg-only: NOT symlinked globally; scope via PATH below.
brew install node@18

# 2. Python 3.11 (Python 3.12+ removed distutils, breaking node-gyp for native modules).
brew install python@3.11

# 3. Yarn via corepack, installed into a user-writable shim dir.
mkdir -p ~/.local/bin
corepack enable --install-directory ~/.local/bin yarn
```

## Per-shell env

Add to your shell startup (or source in each terminal before working on `mark-electron/`):

```sh
export PATH="/opt/homebrew/opt/node@18/bin:$HOME/.local/bin:$PATH"
export PYTHON="/opt/homebrew/opt/python@3.11/bin/python3.11"
export npm_config_python="$PYTHON"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1  # skip 150MB chromium download; e2e runs need separate plan
```

Quick check:
```sh
node --version     # v18.20.x
yarn --version     # 1.22.x (via corepack)
$PYTHON --version  # 3.11.x
```

## Clone and install

```sh
# From monorepo root
git clone -b modernize https://github.com/xronocode/mark mark-electron
cd mark-electron
yarn install --non-interactive
# ~30–60 s; triggers electron-rebuild for 3 native modules (ced, fontmanager-redux, keymapping)
# Expect: "✔ Rebuild Complete"
```

## Sanity-check gates (replaces broken upstream test suite)

The upstream `yarn test:specs` and `yarn unit` are both fragile on any modern system (Karma-Electron + esm + network-fetched specs). During Phase-A1 we use this **lint + build** gate instead:

```sh
cd mark-electron
yarn lint                 # ~7 s, should exit 0
yarn run pack             # webpack main + renderer, ~35 s, should exit 0
```

If both green → you can continue with more cherry-picks or Phase-A2 work.

## Known not-working (accepted for Phase-A1)

| Command | Why it fails | Workaround |
|---|---|---|
| `yarn test:specs` | Upstream spec comparison has schema drift between spec.commonmark.org and markedjs fixtures | Skip — accepted fragility |
| `yarn unit` | `karma-electron@0.x` launcher crashes on Electron 16/18+ | Use direct `node -r esm -e '...'` for isolated unit tests |
| `yarn e2e` | Playwright Chromium download times out (blocked in some regions) OR is skipped via PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD | Plan revisit in Phase-A2 after electron-vite |
| `yarn dev` | Electron binary in `node_modules` may be v16 while package.json says ^18 (npm cache quirk) | Delete `~/Library/Caches/electron/*` + re-run `yarn install`; or wait for Phase-A2 electron-vite fix |

## Direct unit tests we do use (bypass Karma)

```sh
cd mark-electron
node -r esm -e "
const { capitalizeAccelerator } = require('./src/common/keybinding/index.js');
console.log(capitalizeAccelerator('ctrl+alt+k'));  // expect 'Ctrl+Alt+k'
"
# similarly for slugger, CLI parser, exceptionHandler EPIPE shim
```

See `SESSION_STATE.md` for the test matrix we ran at end of Phase-A1.

## Network notes for RU / restrictive ISPs

- `raw.githubusercontent.com` is blocked by many RU ISPs. Workarounds already applied to `mark-electron/test/specs/*/run.spec.js` (jsdelivr mirror). See `grace(env)` commit on `modernize` branch.
- `registry.yarnpkg.com`, `api.github.com`, `github.com`, `spec.commonmark.org`, `cdn.jsdelivr.net` all reachable (at time of session).
