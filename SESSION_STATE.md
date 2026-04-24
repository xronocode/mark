# Session state — 2026-04-24

Snapshot of exact progress for resuming in cloud Claude Code.

## Where we are

- **Phase-0 complete**: GRACE artifacts seeded in `docs/*.xml` (20 modules, 28 UCs, 37 risks, 30 XSS fixture payloads, 9 phase gates, 78 log markers).
- **Phase-A1 complete**: 12/13 community PRs cherry-picked into `reborn-mark` on `modernize` branch, lint + webpack build green after each.
- **Phase-A2 ready to start**: toolchain migration (PR #4001 electron-vite + Vue 3 + Electron 30 + Node 20).

## Git state

### `xronocode/mark` (this monorepo)
- Branch `main`: upstream marktext mirror at `be81e3aa` (original fork state)
- Branch `modernize`: our 13 commits (12 PRs + env patch)
- Branch `monorepo`: this new layout (docs/, marktext/, homebrew-mark/, reborn-mark/ excluded) — **where you should continue**

### Phase-A1 commits on `modernize` branch (preserved in fork, pulled into `reborn-mark/` after clone)

```
5dc06078 grace(PR-4145) Full WYSIWYG mode + live system theme + raw-markdown toggle toolbar
2fc2eabf grace(PR-4150) paste HTML with images — copy remote images to local filesystem
0ef4272c grace(PR-4070) Always Read-Only mode — CLI flag + preference
2b6410a9 grace(PR-4157) resolve Mermaid rendering issues in macOS packaged build
a6a967c6 grace(PR-3621) fix CVE-2023-2318 XSS in pasteCtrl link fallback
ef950bdc grace(PR-4177) add user confirmation before shell.openPath for non-markdown targets
afdd3edd grace(PR-4146) avoid false unsaved prompt when closing file opened from search
bee3fcc4 grace(PR-4152) preserve scroll position on external file change
5d1df9a6 grace(PR-4134) capitalize accelerator modifiers to fix custom keybindings
8e20b1a8 grace(PR-4093) prevent white flash when opening windows in dark mode
eb217e1a grace(PR-4135) prevent querySelector crash on empty heading slugs
39cfd266 grace(env)     mirror CommonMark/GFM spec fetchers via jsdelivr
1432f109 grace(PR-4154) suppress EPIPE crash in main process exception handler
be81e3aa (upstream develop baseline)
```

## Deferred work

### PR-4025 (Mermaid v10→v11) — deferred to Phase-A2
Upstream PR expanded into a composite (14 commits) that also bumps Electron 18→41. We keep it out of Phase-A1; merge as part of Phase-A2 toolchain migration.

### 8 CI/tooling commits from PR-4093 — deferred to Phase-A3
Touch `.github/workflows/build.yml` and `.electron-vue/thirdPartyChecker.js`. Will rebuild CI pipeline from scratch during Phase-A3 distribution setup.

## Validation evidence

All 12 merged PRs passed:
- **Lint green** after every cherry-pick (`yarn lint`, ~7 s)
- **Webpack build green** after every cherry-pick (`yarn run pack`, ~35 s)
- **Zero unresolved merge-conflict markers** in `reborn-mark/src/`
- **Zero new TODO/FIXME** introduced by our commits
- **All fingerprint greps** found the claimed fixes physically present in code

Direct behavioral tests via `node -r esm`:
- **PR-4154** (EPIPE): 2/2 — EPIPE swallowed, other errors re-thrown
- **PR-4134** (capitalizeAccelerator): 11/11 — modifiers case-normalized, keys preserved
- **PR-4135** (Slugger): 8/9 — empty/punctuation → 'heading' fallback; emoji passes through (valid HTML5 id, not a regression)
- **PR-4070** (CLI parser): 5/5 — `--read-only`, `--safe`, `--debug` parsed correctly
- **env-patch** (jsdelivr fetches): 3/3 — CommonMark 0.30 spec (652 examples), marked v4.0.0 CM + GFM fixtures reachable

## Known upstream issues we chose NOT to fix

| Issue | Symptom | Why not fixed |
|---|---|---|
| PR-3621 functional flaw | `sanitize(title, ...)` where `title===null` in else branch (should be `sanitize(text, ...)`) | CVE still closed (null can't XSS); is an upstream author bug, not ours. Log in Phase-A2 |
| Upstream `test:specs` schema drift | `TypeError: Cannot read properties of undefined (reading 'shouldFail')` | Pre-existing — runner expects parallel arrays to stay in sync, they don't |
| `karma-electron` crash on Electron 16/18+ | `TypeError: Cannot read properties of undefined (reading 'on')` at electron-launcher.js:34 | Will be replaced by Vite/Vitest in Phase-A2 after PR #4001 |
| Electron binary v16 vs package.json ^18 | `./node_modules/.bin/electron --version → v16.13.2` | Cache quirk; manual fix: `rm -rf ~/Library/Caches/electron && yarn install` |

## Next steps (Phase-A2)

1. Merge `modernize` with upstream PR #4001 (electron-vite + Vue 3 refactor) — **biggest single merge**; expect significant conflicts with our 12 cherry-picks.
2. Bump Electron 18 → 30 LTS, Node 18 → 20 LTS; rerun electron-rebuild for native modules under new ABI.
3. Merge PR-4025 (Mermaid v11) as part of this wave.
4. Verify lint + webpack (now Vite) build green on the combined result.
5. Manual smoke: `yarn dev` launches app, UI works.

## Files to look at first when resuming

1. `PLAN.md` — current plan, Phase-A2 section
2. `docs/development-plan.xml` — module contracts, Phase-A2 step list
3. `docs/verification-plan.xml` — fixture-xss (30 payloads), V-M-011 (renderer) scenarios
4. `reborn-mark/package.json` — current dep versions (mermaid@10.6.1, electron@^18.0.4, etc.)

## Environment

See `SETUP.md` for the bootstrap recipe (Node 18, Python 3.11, yarn via corepack, PATH scope, Playwright browser skip).
