# Mark QA: the latest C-2…C-6 bugs

Build: the test build from this session — `target/release/bundle/macos/Mark.app` (or the DMG next to it; built 2026-09-16 after both reviews). Check an item after verifying it. If something breaks, write next to it what exactly happened.

Change status as of this document:

| Change | What it is | Status |
|---|---|---|
| C-2 | Live-reload of external file changes (watcher subscription fan-out) | implemented, committed (437a76f5) |
| C-3 | "Copy as HTML" — rich clipboard for pasting into email | implemented in the working tree, not committed |
| C-4 | Renaming an open file from the sidebar | **planned, NOT implemented** — the scenario below currently fails, this is expected |
| C-5 | Flaky pinch-zoom test (timing) | investigation, test infrastructure — does not affect manual QA |
| C-6 | Tab bar auto-scroll to the active tab | implemented in this session |

---

## C-6. The active tab is always visible (new fix)

Setup: open 8–10 files so the tab bar overflows and starts scrolling with the mouse wheel. Narrow the window if the tabs still fit.

- [ ] **Scenario 1 — Ctrl+Tab cycling.** Scroll the bar to the start. Hold Ctrl+Tab and cycle tabs until the active one goes past the right edge. Expected: the bar auto-scrolls on its own, the active tab (with highlight and blue underline) is always fully visible; when switching to a left tab the bar scrolls back left.
- [ ] **Scenario 2 — Ctrl+Shift+Tab.** Same in reverse — the bar follows the active tab to the left.
- [ ] **Scenario 3 — sidebar click.** Scroll the tab bar to the left. In the sidebar file tree click a file whose tab is currently beyond the right edge. Expected: the tab becomes active AND the bar scrolls to it.
- [ ] **Scenario 4 — search.** Open project search, click a result from a file whose tab is off-screen — same expectation as scenario 3.
- [ ] **Scenario 5 — closing neighbors.** Activate a tab beyond the right edge, close it with the × (or middle-click). Expected: activation moves to the neighboring tab, the bar keeps it visible.
- [ ] **Scenario 6 — manual scrolling is not broken.** Scroll the bar manually with the mouse wheel/trackpad without switching tabs. Expected: scrolling works as before, no jumps.
- [ ] **Scenario 7 — no jump on a visible tab.** Click tabs that are already visible. Expected: the bar does not twitch, scroll position does not change.
- [ ] **Scenario 8 — drag reorder.** Drag the active tab to the very end of the bar. Expected: after the drop the bar scrolls to it.
- [ ] **Scenario 9 — session restore.** Narrow the window, open many files, activate the last tab (it is off-screen), fully quit and reopen Mark. Expected: after startup the bar is already scrolled to the active tab.
- [ ] **Scenario 10 — hidden tab bar.** Hide the tab bar (View → Toggle Tab Bar or equivalent), scroll nothing, show it again. Expected: the bar comes back already scrolled to the active tab; the active one is visible immediately.

## C-2. External file changes are visible in all tabs

Setup: open 2–3 files from one folder (the first one before opening the project folder in the sidebar, the rest after), so there are several watch subscriptions.

- [ ] **Scenario 1 — the second file is live too.** Open file A, then file B (important: exactly second and later). Make a change in B from outside Mark (e.g. `echo "edit" >> B.md` in Terminal). Expected: tab B updates on its own (or a reload prompt appears if the tab is dirty) — not only the first opened file.
- [ ] **Scenario 2 — both tabs, same path.** If the same file is open in two tabs — an external edit updates both.
- [ ] **Scenario 3 — no leaks.** Churn opening/closing files and folders for a minute; the console (`npm run tauri:dev` stderr) shows no repeating watch-channel errors, memory does not visibly grow.

## C-3. Copy as HTML (Cmd+Shift+C)

- [x] **Scenario 1 — selection into an email.** Open a document with a heading, a list, and bold text. Select a fragment, press Cmd+Shift+C (or menu Edit → Copy as HTML, or right-click in the editor). Paste into an email draft (Mail/Gmail). Expected: formatting is preserved (heading stays a heading, list stays a list, bold stays bold), not raw Markdown.
- [x] **Scenario 2 — without a selection.** Clear the selection, Cmd+Shift+C, paste into an email. Expected: the whole document is pasted with formatting.
- [ ] **Scenario 3 — into a plain-text editor.** Repeat the paste into Notes/TextEdit (plain text). Expected: the Markdown source is pasted, without HTML tags.

> Confirmed by the user 2026-09-17: "HTML copies and pastes into email — good" (scenarios 1–2, via the C-11 right-click menu).

## C-4. Renaming an open file from the sidebar (NOT IMPLEMENTED YET)

- [ ] **Scenario (verify after implementation).** Open a file, rename it in the sidebar (context menu → Rename). Expected after the fix: the tab changes name and path, external edits of the new path keep live-reloading, no console errors. Until C-4 is implemented there will be a TypeError here and the tab keeps the old name — this is a known state, do not log it as a new bug.

## C-5. Pinch-zoom (manual regression check)

- [ ] **Scenario — gesture zoom.** In the editor, do a pinch gesture (trackpad) several times in a row, including slow gestures below the activation threshold. Expected: zoom changes smoothly, small gestures do not jerk the zoom, the editor does not flicker or lose focus. (Known C-5 issue — a rare flake in the automated test on slow machines, not in app behavior.)

## General regression after the build

- [ ] All tabs close; `Cmd+N` creates new ones; tab dragging works.
- [ ] `npm test` on this build's sources — 100% green.

---

## Automated run results, C-7/C-8/C-9 batch (CUA, 2026-09-16)

Run against the rebuilt `target/release/bundle/macos/Mark.app` (after both reviews). Screenshots: /tmp/mark-qa-shots/f1–f7*.png.

| Scenario | Result | Evidence |
|---|---|---|
| C-7 resize → auto-scroll | **PASS** | 600px window, active qa6 at the right edge; enabling the sidebar narrowed the bar by ~220px — qa6 stayed active and fully visible WITHOUT an activation change (f6); a direct set_window_frame below 600 is impossible (app minWidth), so the trigger is the sidebar |
| C-8 tab cycle (menu) | **PASS** | Window → Select Next Tab ×4: activation went qa1→qa6, the bar auto-scrolled right by itself (qa1–qa4 beyond the left edge, qa6 highlighted, content "File 6") (f4); the menu→bridge→command→bus→store dispatch chain confirmed in stderr |
| C-8 physical Ctrl+Tab | **Manual check** | CUA cannot synthesize ⌃⇥ to the menu-equivalent (the event does not reach the menu — a synthesis limitation, not an app one). Press Ctrl+Tab by hand: the tab should switch; if not, file a bug |
| C-9 title bar 600px (minimum) | **PASS** | the path clips on the left down to "mark-qa-c6 › watch.md", the name is fully visible, no overlap with either nav buttons or the word counter (f1) |
| C-9 title bar 1200px | **PASS** | full path "private › tmp › mark-qa-c6 › qa6.md" centered, as before (f7) |
| C-9 double-click on empty title bar | **source-pin** | the gesture moved to the whole bar with a guard for interactive zones; jsdom does not intercept the tauri window of an SFC — pinned with a source-pin test |

Batch gates: full suite 222 files / **3029 passed / 0 failed**; `cargo test --bin mark -- m009_menu` 10/10; `grace lint` 0 errors; review pass 1 — changes-requested (blocker: 2 Rust menu tests) → fixed; pass 2 — **VERDICT green**.

---

## Automated run results (CUA, 2026-09-16)

The agent drove the freshly built `target/release/bundle/macos/Mark.app` via cua-driver (a separate instance, 10 files in /tmp/mark-qa-c6, 480–600px window; the user's instances untouched). Evidence screenshots: /tmp/mark-qa-shots/s0–s19.png.

| Scenario | Result | Evidence |
|---|---|---|
| C-6 launch/restore (9) | **PASS** | after startup the bar is already at the active last tab (qa1 beyond the left edge, watch.md highlighted on the right); repeated after a restart (s14) |
| C-6 sidebar activation (3) | **PASS** | clicking watch.md in "Opened files" with the bar at the left edge → the bar auto-scrolled, watch is visible and highlighted (s6) |
| C-6 hidden bar (10) | **PASS** | Toggle Tab Bar off→on → the active tab is fully visible again (s8) |
| C-6 close-active (5) | **PASS** | closing the active watch with × → the rich neighbor is active, visible, the bar does not twitch (s12) |
| C-6 manual scroll (6) | **PASS** | the wheel moves the bar, no auto-snap back, the active tab stays where it was left (s4) |
| C-6 drag reorder (8) | **SOFT PASS** | the reorder happened (qa1 moved to the end), the active rich tab stayed visible and highlighted; the exact drop point was shifted by drag-autoscroll (s13b) |
| C-6 Ctrl+Tab cycle (1–2) | **N/A — no binding** | the tabs.cycleForward/Backward commands exist, but the key is not bound in this port — cycling cannot be activated. Worth binding (e.g. Ctrl+Tab / Ctrl+Shift+Tab) as a separate task |
| C-6 no-jump on visible (7) | **PASS** (indirect) | clicks on visible tabs/sidebar did not move the bar without need |
| C-2 live-reload (1) | **PASS** | `echo >> watch.md` from outside → the line "External edit v2" appeared in the open tab on its own; the watcher subscription was about the 10th in a row (s7) |
| C-3 Copy as HTML (1–2) | **PASS** | Edit → Copy as HTML (no selection) → the clipboard holds public.html + utf8-plain-text simultaneously; HTML content = the rendered `<h1>Watched file</h1>…` with the external edit v2 (whole-document fallback works) |
| C-4 rename | **SKIPPED** | the sidebar's web context menu is not addressable via AX, a pixel attempt hit the wrong item; the status is known anyway — RENAME_IF_NEEDED is not implemented (C-4 planned-only) |
| C-5 pinch-zoom | **N/A** | a hardware gesture cannot be automated via CUA; behavior not verified |

Notes from the run (outside C-6 scope, backlog candidates):

1. **Window resize does not trigger auto-scroll**: when narrowing the window, the active tab can stay off-screen until the next activation change (noticed on the 720→480px transition). Fixable with a ResizeObserver on the container — a small separate task.
2. **No keyboard binding for tab cycling** (see table) — the commands exist, there is no accelerator.
3. CUA specifics: WKWebView drops background aux-clicks (middle-click tab close was verified via the ×) — does not affect a live user.
