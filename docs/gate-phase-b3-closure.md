# Gate-Phase-B3 Closure — PASS-WITH-FOLLOWUP

**Date:** 2026-04-29
**Phase:** B3 (Integrations — 12 modules: prefs / encoding / cli /
shortcuts / spell / fonts / datacenter / recent / pandoc / updater /
screenshot / menu)
**Verdict:** **PASS-WITH-FOLLOWUP**

## Verification matrix

| # | criterion | result |
|---|-----------|--------|
| 1 | cargo test --bin mark | ✅ 203 passed |
| 2 | cargo build --release | ✅ 12 MB binary, zero warnings |
| 3 | tsc --noEmit (M-013a + M-013b runtime + integrations) | ✅ clean |
| 4 | IPC fixture parity (33 commands ↔ REGISTERED_COMMANDS) | ✅ embedded_fixture green |
| 5 | Per-module tests (B3): | ✅ 65 new tests across 11 modules |

## Per-module test counts (B3)

| module | tests | scope |
|---|---|---|
| m005_prefs | 9 | lite — store + workspace; full migration deferred |
| m006_shortcuts | 11 | parser + persistence; platform binding deferred |
| m007_spell | 3 | lite — config surface |
| m008_fonts | 4 | font-kit enumeration |
| m009_menu | 5 | skeleton — taxonomy + dispatcher; native menu deferred |
| m014_encoding | 11 | chardet + encoding_rs full |
| m015_pandoc | 1 | shell-out + PATH augmentation |
| m016_updater | 1 | stub — real impl in B4 |
| m017_recent | 8 | full — CRUD + cap + dedupe |
| m018_screenshot | 1 (+1 cfg(macos)) | macOS shell-out full |
| m020_cli | 11 | clap parser full |

## Step-by-step closure

| step | module | what | scope |
|------|--------|------|-------|
| 1 | M-005 | mt-prefs lite | store + workspace_set + restore |
| 2 | M-014 | mt-encoding | chardet + encoding_rs (real) |
| 3 | M-020 | mt-cli-flags | clap derive (real) |
| 4 | M-006 | mt-shortcuts lite | parser + persistence (real); platform binding deferred |
| 5 | M-007 | mt-spell lite | config surface; WebView native used |
| 6 | M-008 | mt-fonts | font-kit enumeration (real) |
| 7 | M-019 | mt-datacenter lite | keyring CRUD; image-uploader deferred |
| 8 | M-017 | mt-recent-docs | CRUD + cap + dedupe (real) |
| 9 | M-015 | mt-pandoc-bridge | shell-out + PATH aug (real) |
| 10 | M-016 | mt-updater stub | "no update available"; real impl in B4 |
| 11 | M-018 | mt-screenshot | macOS screencapture (real); other platforms in v2.1+ |
| 12 | M-009 | mt-menu skeleton | taxonomy + dispatcher; native menu deferred |
| 13 | gate | verification | this report |

Cargo test trajectory (B3): 138 (B2 close) → **203 passing** (+65 in B3).

## Module surface delivered

**Backend (Rust):** 11 new modules under `src-tauri/src/`:
- `m005_prefs.rs` (385 LOC) — atomic JSON store + workspace_set
- `m006_shortcuts.rs` (~330 LOC) — accelerator parser
- `m007_spell.rs` (~95 LOC) — config surface
- `m008_fonts.rs` (~85 LOC) — font-kit enumeration
- `m009_menu.rs` (~290 LOC) — taxonomy skeleton
- `m014_encoding.rs` (235 LOC) — chardet + encoding_rs
- `m015_pandoc.rs` (~150 LOC) — shell-out + PATH aug
- `m016_updater.rs` (~60 LOC) — stub
- `m017_recent.rs` (~165 LOC) — recent-docs CRUD
- `m018_screenshot.rs` (~100 LOC) — macOS screencapture
- `m019_datacenter.rs` (~70 LOC) — keyring CRUD
- `m020_cli.rs` (162 LOC) — clap parser

Plus integration into `main.rs` (boot order extended), `m001_validate.rs`
(REGISTERED_COMMANDS extended to 33 commands), wire-format Rust ↔ TS
parity preserved.

**Frontend (TS):** 4 new facade files under `src/renderer/src/ipc/runtime/`:
- `prefs.ts` (44 LOC) — ipcPrefs + ipcWorkspace
- `fonts.ts` (21 LOC) — ipcFonts.list
- `recent.ts` (28 LOC) — ipcRecent.{add, list, clear}
- `integrations.ts` (102 LOC) — 7 facades: ipcShortcut, ipcSpell,
  ipcMenu, ipcPandoc, ipcUpdater, ipcScreenshot, ipcSecret
- `index.ts` extended with 7 new ipc.* namespace keys

`tauri.v2.json` fixture: **33 commands** total (B1: 11 → B3: 33).

**Crates added:**
- `chardet = "0.2"` (M-014)
- `encoding_rs = "0.8"` (M-014)
- `clap = "4"` with derive (M-020)
- `font-kit = "0.14"` (M-008)
- `keyring = "3"` (M-019)

## Followups (do NOT block Phase-B3a entry)

### NEW from B3 (15)

| id | module | what |
|----|--------|------|
| F-PREFS-MIGRATE-V1 | M-005 | full 4-store legacy migration (preferences + dataCenter + keybindings + recent-docs + keychain rename); lockfile / corrupt-legacy / schema-drift / write-failure rollback / idempotency / type coercion / absolute-path hygiene edge cases |
| F-FS-DETECT-META-INLINE | M-014 | surface DecodedFile.label + bytes_replaced to renderer alongside text |
| F-ENCODING-MANUAL-PICK | M-014 | user override dropdown when detection guesses wrong |
| F-ENCODING-WRITE-PRESERVE | M-014 | write back in detected encoding instead of always UTF-8 |
| F-MULTI-WINDOW | M-020 | --new-window flag wiring; M-001 currently single-window |
| F-CLI-OPEN-FILES | M-020 | dispatch positional FILE args to renderer (needs M-009 menu command bus) |
| F-SHORTCUT-PLATFORM-BIND | M-006 | tauri-plugin-global-shortcut wiring + capability config |
| F-SPELL-HUNSPELL-EMBED | M-007 | Linux bundled-dict path |
| F-MENU-WIRE-TAURI | M-009 | native OS menu via tauri::menu::* in Builder.setup |
| F-PANDOC-PROGRESS | M-015 | progress events for long exports |
| F-UPDATER-WIRE-PLUGIN | M-016 | tauri-plugin-updater + dual-pubkey ed25519 signing infra |
| F-SCREENSHOT-CROSS-PLATFORM | M-018 | Windows + Linux equivalents (v2.1+) |
| F-DC-MIGRATE-V1-KEYCHAIN | M-019 | rename "marktext" → "com.xronocode.mark" service entries |
| F-DC-IMAGE-UPLOAD | M-019 | PicGo / aliyun / qiniu / smms runtimes |
| F-FONTS-FILTER-MONOSPACE | M-008 | editor font picker filter via Canvas measurement |

Plus 23 followups inherited from B1+B2 (F-PERF-1/2/3, F-MAIN-ENTRY-DISABLED,
F-MT-UNSUPPORTED-MAPPING, F-LIFECYCLE-WIRE, F-MENU-GEN-WIRE, F-REPLAY-POLICY-WIRE,
F-MUYA-INTERACTIVITY, F-FS-ATOMIC-WRITE, F-FS-MACOS-TCC, F-WATCH-* ×6,
F-SEARCH-* ×8) — none block B3a entry.

## Gate decision

**PASS-WITH-FOLLOWUP.** All 5 verification criteria green. The 15 new
followups are quality-of-finish items: most are deferred-by-design lite
scopes (M-005 lite, M-006 lite, M-007 lite, M-009 skeleton, M-016 stub,
M-019 lite) that explicitly document the deferred sub-projects. Real impls
shipped: M-014, M-015, M-017, M-018, M-020 + M-008. Phase-B3 unlocks the
end-to-end app workflow: workspace persistence (M-005), file-open with
encoding detection (M-014 + M-002 from B2), search (M-004), watch (M-003),
prefs (M-005), recent docs (M-017), font picker (M-008), CLI (M-020).

The 2 biggest deferrals are F-PREFS-MIGRATE-V1 (4-store legacy migration,
substantial sub-project) and F-MENU-WIRE-TAURI (native OS menu wiring,
needs Builder.setup AppHandle access). Both are explicitly Phase-B3a /
Phase-B4 work per the dev-plan.

## Phase-B3a readiness

Gate-Phase-B3 satisfied. Phase-B3a (Alpha partial-ship cut + mark@v1
rollback channel) unblocked. The shipped modules cover enough of the v1.2.3
feature surface that an alpha .dmg can ship to early users with the
documented "Alpha — read-only legacy preferences; no auto-update" cask
caveats per dev-plan B3a step-6.
