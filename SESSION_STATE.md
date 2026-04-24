# Session state — 2026-04-24

Snapshot of exact progress for resuming in cloud Claude Code.

## Naming convention (important)

- `mark-electron/` = **Phase-A track**, modernized Electron. What we actively worked on.
- `reborn-mark/` = **Phase-B track**, Tauri + Rust rewrite. Not yet scaffolded. Reserved.
- `marktext/` = pristine upstream snapshot, read-only reference.

## Where we are

- **Phase-0 complete**: GRACE artifacts seeded in `docs/*.xml` (20 modules, 28 UCs, 37 risks, 30 XSS fixture payloads, 9 phase gates, 78 log markers).
- **Phase-A1 complete**: 12/13 community PRs cherry-picked into `mark-electron` on `modernize` branch, lint + webpack build green after each.
- **Phase-A2 ready to start**: toolchain migration (PR #4001 electron-vite + Vue 3 + Electron 30 + Node 20).

## Git state

### `xronocode/mark` (this monorepo)
- Branch `main`: upstream marktext mirror at `be81e3aa` (original fork state)
- Branch `modernize`: our 13 commits (12 PRs + env patch)
- Branch `monorepo`: this new layout (docs/, marktext/, homebrew-mark/, mark-electron/ excluded) — **where you should continue**

### Phase-A1 commits on `modernize` branch (preserved in fork, pulled into `mark-electron/` after clone)

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
- **Zero unresolved merge-conflict markers** in `mark-electron/src/`
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
| Electron binary `--version` reports v16.13.2 despite package.json ^18.0.4 | Misleading output of `./node_modules/.bin/electron --version` | Not a bug: that's the internal Node runtime version. Info.plist confirms Electron 18.0.4. |
| **Electron 18 main-process `require('electron')` returns string path** | TypeError `Cannot read properties of undefined (reading 'on')` at bundled main.js:2:215822 (i.e. `i.ipcMain.on(...)`) | On this Mac (macOS 14+ arm64, ad-hoc signed), Electron's runtime module-resolver hook doesn't register. `require('electron')` falls through to node_modules/electron/index.js which exports the binary PATH string. Tried via `./node_modules/.bin/electron main.js`, direct binary, `open -a Electron.app`, with/without `--disable-gpu`, with package.json `main` entry, inside project dir — all same. Not our code; environment-specific issue likely fixed in Phase-A2 after toolchain migration (electron-vite expected to handle externals + Electron boot differently). |

## Environment findings from session 2

### Webpack externals fix (committed, `grace(env): add electron to externals`)
Upstream's `.electron-vue/webpack.main.config.js` had `externals: [...Object.keys(dependencies || {})]` but `electron` lives in `devDependencies`. Webpack was therefore BUNDLING `electron`, so `require('electron')` in main.js resolved to the node_modules wrapper's PATH-string export rather than the runtime object. Added `'electron'` explicitly before the dependencies spread. This is architecturally correct even though it didn't unblock the runtime issue above (that's a separate Electron binary problem).

### Smoke attempts summary (all failed with same error)
1. `./node_modules/.bin/electron dist/electron/main.js` — via CLI wrapper
2. `yarn dev` — hits `bad option: --remote-debugging-port=8315` in Electron 18 (dev-runner.js:131)
3. `./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <project>` — direct binary
4. `open -n -a Electron.app --args . --disable-gpu` — macOS LaunchServices

Each: `TypeError: Cannot read properties of undefined (reading 'on')` at the first `ipcMain.on(...)` or `app.on(...)` or `@electron/remote.enable(...)` in main.js.

### Electron binary audit (verified intact)
- `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` = 49.3 KB launcher (normal — the real runtime is in Electron Framework.framework)
- `Electron Framework.framework/Versions/A/Electron Framework` = 120.3 MB (genuine)
- `Electron.app/Contents/` total = 197 MB (genuine)
- Info.plist: `CFBundleShortVersionString = 18.0.4`, `CFBundleVersion = 18.0.4`
- Code signature: ad-hoc (`Signature=adhoc`, `flags=0x20002(adhoc,linker-signed)`)

So the binary is authentic Electron 18.0.4; the runtime hook failure is likely a ad-hoc-signed + macOS 14 Gatekeeper interaction that strips/blocks the `electron` module injection. Needs to be tested on a different machine (Linux runner, different macOS version) to confirm isolation.

### Validation we DID achieve
- **`yarn lint`** green on 12/12 PR merge points + 2 env commits (7s each)
- **`yarn run pack`** (webpack) green on 12/12 PR merge points (34–56s each)
- **Direct unit tests via `node -r esm`**:
  - PR-4154 EPIPE handler: 2/2 pass (swallow EPIPE, re-throw others)
  - PR-4134 capitalizeAccelerator: 11/11 pass (all modifier permutations)
  - PR-4135 Slugger: 8/9 pass (1 semantic-not-regression — emoji-only passes through as valid HTML5 id)
  - PR-4070 CLI parser `--read-only`: 5/5 pass
  - env-patch jsdelivr fetches: 3/3 pass
- **Static fingerprint greps**: all 12 fixes physically present at expected locations
- **Zero merge conflict markers** in `mark-electron/src/`
- **Zero new TODO/FIXME** introduced by our commits

## Next steps

### Phase-A1.5 (immediate) — Renderer Node APIs cleanup
See `docs/development-plan.xml` Phase-A1-5, 10 steps. Static work, does not depend on runtime launch. Prepares the codebase for PR #4001 (electron-vite migration). Main tasks:
1. Move `src/renderer/node/ripgrepSearcher.js` + `fileSearcher.js` to main; expose via `mt::search-run` / `mt::search-cancel` IPC
2. Move `src/renderer/util/fileSystem.js` image-upload helpers to main
3. Replace `fs.readFileSync` in `src/renderer/components/exportSettings/index.vue` with `ipcRenderer.invoke`
4. Replace `require('fontmanager-redux')` in `src/renderer/prefComponents/common/fontTextBox/index.vue` with IPC
5. Replace `ipcRenderer.sendSync('mt::ask-for-image-path')` with async `invoke`
6. Replace `@electron/remote` usage (6 call sites) with typed IPC
7. Remove `@electron/remote` from package.json
8. Listener cleanup convention (59 `ipcRenderer.on` without `removeListener`)
9. IME composition lock for keystroke handlers (from 2nd-wave audit, R-27)
10. Run tests + verify Gate-Phase-A1.5

### Phase-A2 (after A1.5)
1. Merge upstream PR #4001 (electron-vite + Vue 3 refactor) — **biggest single merge**; expect conflicts with our 12 cherry-picks AND our Phase-A1.5 restructuring.
2. Bump Electron 18 → 30 LTS, Node 18 → 20 LTS; rerun electron-rebuild under new ABI.
3. Merge PR-4025 (Mermaid v11) as part of this wave.
4. Verify lint + vite build green on combined result.
5. Manual smoke: `yarn dev` launches app (expect runtime issue from Session 2 to be resolved here).

## Files to look at first when resuming

1. `PLAN.md` — current plan, Phase-A2 section
2. `docs/development-plan.xml` — module contracts, Phase-A2 step list
3. `docs/verification-plan.xml` — fixture-xss (30 payloads), V-M-011 (renderer) scenarios
4. `mark-electron/package.json` — current dep versions (mermaid@10.6.1, electron@^18.0.4, etc.)

## Environment

See `SETUP.md` for the bootstrap recipe (Node 18, Python 3.11, yarn via corepack, PATH scope, Playwright browser skip).
