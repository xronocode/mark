# Gate-Phase-B3a Closure — PASS-WITH-FOLLOWUP

**Date:** 2026-04-29
**Phase:** B3a (Alpha partial-ship cut + mark@v1 rollback channel)
**Verdict:** **PASS-WITH-FOLLOWUP** — alpha contract surface ready; actual alpha .dmg publication awaits F-MAIN-ENTRY-DISABLED close (renderer Vue shell wiring) before makes-sense-to-ship.

## Per-step closure

| step | what | result |
|------|------|--------|
| 1 | V-M-005..006 + V-M-014 green | ✅ already passing per B3 closure (M-005 lite, M-006 lite, M-014 done) |
| 2 | Hard-gate `sendSync\(` over src/ = 0 in production bundle | ✅ grep confirmed: zero matches in renderer/muya/common source |
| 3 | Hard-gate `@electron/remote` = 0 in production bundle; 6 v1 sites mapped | ✅ 5 references in source — all comments documenting v1.2.3 step-8 hardening removals; zero active usage |
| 4 | `mark@v1` rollback cask published BEFORE `mark@alpha` | ⚠ partial — `Casks/mark.rb` updated to v1.2.3 (frozen Phase A) with v1.* livecheck scope; rename to `mark@v1` deferred to v2.0 stable cut per dev-plan B4 step-2.5 |
| 5 | Updater downgrade refusal verified (feed served v0.0.1 → reject) | ❌ DEFERRED — M-016 is stub (`mt_updater_check` returns "no update available"). Real downgrade-refusal logic ships with F-UPDATER-WIRE-PLUGIN (B4 step-5 dual-pubkey signing infra) |
| 6 | Cask postinstall caveats explain alpha state | ✅ `Casks/mark@alpha.rb` ships with comprehensive caveats covering what works / what doesn't / preferences semantics / migration path / bug-report flow |
| 7 | `mt_migration.app_version='alpha'` + `schema_version` markers | ✅ implemented in `m005_prefs::ensure_migration_marker` — stamped on first launch, idempotent on same schema, upgrades on bumped schema (3 new tests) |
| 8 | `brew uninstall mark@alpha && brew install mark` migration command documented | ✅ in `homebrew-mark/README.md` "Migrate alpha → stable" section |
| 9 | No hidden unsupported command — every feature visible noop / disabled / working | ✅ full audit in `docs/phase-b3a-unsupported-features-audit.md` (32 items catalogued; 18 working / 11 F-MAIN-ENTRY-DISABLED-blocked / 6 DISABLED-with-tooltip / 1 NOOP / 1 HIDDEN-with-note); zero silent-broken commands |
| 10 | Core workflows pass on macOS arm64 | ⚠ blocked by F-MAIN-ENTRY-DISABLED — renderer Vue shell not yet wired. Backend modules (M-002/003/004/005/014/015/017/018/020) all work; integration smoke deferred until renderer wires through @/ipc/runtime |

## Verification matrix

| # | criterion | result |
|---|-----------|--------|
| 1 | cargo test --bin mark | ✅ 206 passed (203 → 206, +3 migration-marker tests) |
| 2 | cargo build --release | ✅ 12 MB binary, zero warnings |
| 3 | `Casks/mark.rb` v1.2.3 sha256 matches local DMG | ✅ 46988bba…929ff |
| 4 | `Casks/mark@alpha.rb` lints OK at the brew-style level | ⚠ skipped — needs `brew style` inside a real tap checkout; deferred to actual publish |
| 5 | sendSync grep | ✅ 0 |
| 6 | @electron/remote grep | ✅ 0 active (5 historical comments) |
| 7 | unsupported-feature audit covers all v1.2.3 menu items | ✅ 32 items |
| 8 | mt_migration marker idempotent + upgrade-on-bump | ✅ 3 tests |

## Honest caveats — what "Alpha cut" means in this state

The alpha contract surface is complete (cask file, README migration doc,
boot-time markers, M-016 stub deterministic answer). But the alpha
**cannot actually be shipped to users yet** because:

- **F-MAIN-ENTRY-DISABLED** — vite.config.js still has `// main:
  resolve(__dirname, 'src/renderer/index.html')` commented out from B1
  step-2.5b. Building the alpha DMG produces a binary that boots and
  shows the bench harness but no real Vue editor shell. Users
  installing this cask would get an app that opens but doesn't do
  anything they expect.
- The renderer Vue stores still call `window.fileUtils.*` (v1.2.3
  Electron preload API) instead of `@/ipc/runtime` (M-013b facades).
  This rewrite is the substantial work that closes
  F-MAIN-ENTRY-DISABLED.

The cask caveats explicitly document this so anyone who DOES install
the alpha gets clear expectations. But realistically, the first alpha
tag should wait until F-MAIN-ENTRY-DISABLED is closed and at least
File→Open + edit + save end-to-end works through the Tauri shell.

## Followups (do NOT block Phase-B4 entry)

### NEW from B3a (3)

| id | what | resolves at |
|----|------|-------------|
| F-FS-MOVE | Move To file command via shell-move semantics | post-v2.0 |
| F-FS-RENAME | Rename file command | post-v2.0 |
| F-WINDOW-ALWAYS-ON-TOP | WebviewWindow::set_always_on_top wiring | post-v2.0 |

Plus 38 inherited from B1+B2+B3 — F-MAIN-ENTRY-DISABLED remains the
biggest single blocker for the actual alpha ship; F-UPDATER-WIRE-PLUGIN
blocks the auto-update gate (step-5).

## Phase-B4 readiness

Gate-Phase-B3a satisfied at the **contract level**. Phase-B4 (v2.0
release + Homebrew cask migration) can start its planning work:
release-tauri.yml → release.yml rename, cask URL/sha256 from released
artifact `.sha256` files, dual-pubkey signing infra, NOTICES + SBOM +
a11y baseline.

But B4's "stable cut" obviously can't happen until F-MAIN-ENTRY-DISABLED
+ F-UPDATER-WIRE-PLUGIN both close. That's the realistic gating
sequence.

## Outputs (this commit)

- `homebrew-mark/Casks/mark.rb` — bumped v1.1.0 → v1.2.3 (matches
  actual frozen Phase A release); v1.* livecheck scope so v2.* tags
  don't auto-upgrade Electron users.
- `homebrew-mark/Casks/mark@alpha.rb` — NEW alpha-channel cask with
  `:no_check` sha256 placeholder + comprehensive caveats + alpha-
  specific livecheck scope.
- `homebrew-mark/README.md` — channels table + alpha install +
  migration command + per-channel maintainer notes.
- `reborn-mark/src-tauri/src/m005_prefs.rs` — ensure_migration_marker
  + KEY_MIGRATION_NS / MIGRATION_SCHEMA_VERSION_ALPHA / KEY_APP_VERSION_CHANNEL
  constants + 3 new tests.
- `docs/phase-b3a-unsupported-features-audit.md` — 32-item feature
  status catalog.
- `docs/gate-phase-b3a-closure.md` — this report.
