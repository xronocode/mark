# CUA e2e acceptance on the Windows polygon

Owner instruction 2026-10-30: the train acceptance protocol (train rule 5) is executed as
CUA-driven e2e runs on the Windows polygon with screenshot verification, plus the owner's
per-case verdict files. This document defines how. It extends — does not replace — the
[acceptance registry](README.md) and the [train protocol](../release-trains/README.md).

## Venue and transports

The polygon is `laptop-kari` (SSH alias `kari`, Tailscale, Windows 10 22H2, Chinese OS
locale, RDP enabled as the manual fallback). Everything below was proven live by the
2026-10-30 pilot unless marked otherwise.

| Transport | Use |
|---|---|
| SSH (`kari`) | all machine control: files, builds, registry, scheduled tasks |
| cua-driver 0.37 (daemon task `cua-driver-serve`) | native chrome: titlebar, menus, native dialogs, window lifecycle; screenshots |
| CDP (WebView2 `--remote-debugging-port=9222` via a launch wrapper, `ssh -L` tunnel, WebSocket `Runtime.evaluate`) | all editor content: DOM reads, clicks, text input |

**Two-rail rule (pilot finding, 2026-10-30).** UIA cannot write into the WebView content:
`type_text` is a silent no-op and `set_value` is rejected (no ValuePattern). Native input
into the webview is therefore always CDP; UIA stays authoritative for the native chrome.
cua `call` invocations are stateless — element tokens live only inside one `run_script`.

## Verification standard

Every claim closes with at least two of three evidence kinds:

1. **UIA tree** — window semantics (buttons, status, native texts);
2. **DOM fact** (CDP) — content text, classes, styles, geometry;
3. **Pixel measurement** (PIL on the Mac) — before/after diff bbox, ink analysis, theme
   color profile.

A narrated "looks right" is never evidence (owner rule, 2026-10-20). Screenshots are
captured per step via `--screenshot-out-file`, fetched with `scp`, measured, and archived
with the case.

## Preflight (before every run)

1. Polygon online, GUI session present (`query user` shows the console session Active);
   cua task running. Autologon was enabled 2026-10-30 (owner-approved) so a reboot
   restores the GUI session unattended.
2. D: free space; the installed build's update channel must not self-update during a run
   (train builds are compiled with updater artifacts off).
3. App language set to English (the OS locale is Chinese; locale coverage is its own
   scenario, base runs are EN).
4. Train build: NSIS from main on the polygon (`tauri build` with updater artifacts off),
   SHA-256 recorded, version `2.9.0-train.N` (or the agreed dispatch-build shape).
5. Install per-user silently, launch via cua `launch_app` (SSH-spawned children die with
   the session — never launch the app from SSH directly).

## Scenario matrix (train 2.9.x-next)

Scenarios come from the ledger's "intentionally unverified" fields. Order = risk to UX.

| # | Item | Polygon scenario | Rail | Evidence |
|---|---|---|---|---|
| 1 | C-UPDATER-ROLLBACK | V-M-068 Windows half: snapshot → update → Help › Roll Back → version check; crash path `mark --rollback --yes` from a terminal | UIA + terminal | transcript with every `BLOCK_ROLLBACK_*` marker and exactly one `MARK_ROLLBACK` line; version before/after; screenshots |
| 2 | FIX-020 | table → Ctrl+A in a cell → switch tab → Shift+arrows → Ctrl+X | CDP | clipboard content proven by pasting back into the DOM; before/after pixel diff; live table selection still pinned |
| 3 | C-COMMONMARK-EMPHASIS | the owner-report Zero-shot/One-shot paragraph, `***` nesting, the theft class — editor and export | CDP | exact token HTML; export output byte-compared to the suite's reference; screenshots |
| 4 | C-FILE-POSITION-MEMORY | three tabs, scroll to middle, app restart, file rename | UIA + CDP | scrollTop/caret before/after from the DOM; active tab; screenshots |
| 5 | C-TITLEBAR-MODE-CHIPS | mode chips on the Windows titlebar (diff > split > source), Standard as the full reset, narrow window | UIA | state screenshots + pixel measurement of chip positions/ink; aria-labels from the tree |
| 6 | C-NOTIFICATION-SYSTEM | stack of five → three cards + overflow chip, sticky error, Esc closes the topmost, copy-on-select | CDP | card/overflow pixel checks, timer behavior, screenshots |
| 7 | C-GITHUB-THEME | switch github / github-dark, code contrast | UIA + CDP | theme color profile by pixels vs the Primer palette (as the unit gate) |
| 8 | DEPS-PELE-1-10 | diagram with `Value x₂` (sub), `List<T>`, CJK wrapping; sequence corpus | CDP | SVG/DOM fact of the subscript tspan; pixels; render without errors |
| 9 | C-NATIVE-DOCX-RTF-EXPORT | export a document with footnotes/equations/tables; the produced `.docx` is handed to the owner, opened in Word **on the owner's Mac** (owner decision 2026-10-30: the polygon has no Word) | UIA + file | OOXML structure assertions in miniature; the Word check lands in the owner's case file |
| 10 | C-LOCALE-MIN-TWIN-REMOVAL (operational) | smoke: ten locales load, switch RU/EN/ZH | CDP | loaded chunks; strings in the DOM |
| 11 | C-SAFETY-REVIEW-LANES (operational) | not applicable (developer tooling) | — | recorded `notApplicable` per registry rules |
| 12 | C-GRAPH-RUNTIME-PATHS (operational) | not applicable (bookkeeping) | — | — |

## Run process (per item)

1. **Setup** — clean app start (CDP wrapper where content access is needed), fixed
   fixture document.
2. **Act** — per the scenario's rail; each step is one `run_script` bundle or one CDP
   script, so observation and action share state.
3. **Capture** — UIA snapshot + screenshot before/after each meaningful step.
4. **Verify** — two of three evidence kinds; pixel measurement is mandatory for visual
   claims.
5. **Record** — `D:\polygon\acceptance-<train>\<item-id>\<NN>-<slug>.png` plus a JSON
   action log and a pass/fail verdict with the reason.
6. **Hand over** — copy evidence to the Mac; write one Markdown file per case at
   `~/Downloads/mark-acceptance/<train>/<item-id>/<NN>-<slug>.md` (steps, expected
   result, evidence with numbers, checkbox, verdict line) and open it in Mark.
7. **Owner verdicts** — ticks and notes in Mark, transcribed into `registry.json` and
   the train ledger by the same session.

## Constraints and standing decisions

- **Windows 10 22H2 only** — Win11 surfaces (mica et al.) are not covered; noted in the
  registry, acceptable for 2.9.
- **docx verification happens on the owner's Mac** (owner decision 2026-10-30).
- **Autologon is enabled** (owner decision 2026-10-30) so overnight runs survive reboots.
- **CDP instance ≠ production instance**: scenarios 1 (rollback) and any updater surface
  run on a clean launch without the CDP wrapper.
- Cyrillic input goes through `insertText` / `dispatchKeyEvent` (Unicode-safe, no IME
  dependence).

## Pilot evidence (2026-10-30, kari, Mark 2.5.3)

Full loop proven: SSH → cua daemon → `launch_app` → UIA snapshot → screenshot → scp →
PIL verification (Ink theme 70% background, 0.8% update-banner accent); CDP lane proven
to the end — a recent-file DOM click opened a document and `execCommand insertText`
typed into its live heading (`exec=true`), with a full-editor pixel diff. UIA's
content-write dead end is documented above. Typed text never reached disk (no autosave);
the polygon repository carries no pilot changes.

Artifacts: `~/Downloads/mark-acceptance/2.9.x-next-pilot/` (screenshots + CDP scripts)
and `D:\polygon\pilot-0*.png` on the polygon.
