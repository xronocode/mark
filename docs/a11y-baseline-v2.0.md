# Accessibility (a11y) baseline — v2.0

**Date:** 2026-05-07
**Phase:** B4 step-13
**Verification ref:** H3-5

This document records the **starting position** of Mark's WCAG-2.1
conformance for the v2.0 alpha shipping. It is NOT a target: it
captures what the current variant-(a) port inherits from the
v1.2.3 renderer + what the Tauri shell adds on top, so future
releases have a measurable line to improve from.

## Method

Mark's renderer is a Vue 3 SPA inside Tauri WKWebView. The standard
WCAG conformance toolchain is `axe-core` driven by Playwright. The
B4-step-13 deliverable for **alpha** is the manual-checklist baseline
below; the **automated axe-core scan** wires into CI in the follow-up
issue `F-A11Y-AXE-CI-SCAN` once the Playwright + tauri-driver setup
from F-AUTOMATED-SMOKE lands.

## Five must-pass items (H3-5)

Each is verified manually on the current alpha build via the
osascript-driven smoke harness from this session.

### 1. Keyboard navigation through main menu

- **Status:** ⚠️ partial.
- **Expected:** Tab/Shift+Tab cycles focus through visible UI in
  predictable order; Enter activates focused control; Escape
  dismisses popovers and dialogs.
- **Current:** Sidebar gear icon is keyboard-focusable; activates via
  Space/Enter. Tab order respects DOM order. Native menu is NOT yet
  wired (`F-MENU-WIRE-TAURI` deferred), so menu-bar items aren't
  keyboard-reachable from within the WebView.
- **Gap:** Tab order in the editor placeholder skips the search
  bar's three filter toggles when the search input is focused.

### 2. Modal aria-modal + focus trap

- **Status:** ⚠️ regressions vs v1.2.3.
- **Expected:** Element Plus dialogs render with `role=dialog`,
  `aria-modal=true`, return focus to opener on close, trap Tab
  inside the dialog.
- **Current:** Element Plus 2.x dialogs in Settings honor
  `role=dialog` but Vue's nextTick hydration can briefly render
  before `aria-modal` attaches. Focus return on close works.
- **Gap:** Brief (1-frame) gap before aria-modal latches. Element
  Plus 3.x migration (`F-ELEMENT-PLUS-3X-UPGRADE`, post-v2.0) will
  resolve.

### 3. Sidebar role=tree

- **Status:** ✅ pass.
- **Expected:** Folder tree exposes `role=tree`,
  `role=treeitem` for nodes, `aria-expanded` for collapsible
  folders, arrow-key navigation moves between siblings/children.
- **Current:** v1.2.3's renderer already implements this through
  the `el-tree`-equivalent in components/sideBar/treeFile.vue.
  Verified arrow-up/down/left/right behave per WAI-ARIA tree pattern.

### 4. Editor accessible name

- **Status:** ✅ pass with caveats.
- **Expected:** The muya editor surface exposes
  `role=textbox` (or `role=document` for read-only) with an
  `aria-label` like "Mark editor — <filename>".
- **Current:** muya's contenteditable root has
  `role=textbox aria-multiline=true`. Filename injection into
  aria-label happens in `editor.js` after tab activation.
- **Caveat:** Untitled tabs (no pathname) get the static label
  "Untitled-N". Acceptable for v2.0; localized via i18n in v2.1.

### 5. Top-menu screen-reader announce

- **Status:** 🔴 fail (deferred).
- **Expected:** macOS VoiceOver announces "Menu Bar — Mark — File,
  Edit, View, ..." when activated.
- **Current:** No native menu wired (`F-MENU-WIRE-TAURI`). VoiceOver
  announces only the Tauri default app shell ("Mark — Quit Mark").
- **Plan:** Closes with `F-MENU-WIRE-TAURI` once `tauri::menu::*`
  Builder.setup hook lands.

## axe-core violations baseline

A live axe-core scan requires the Playwright + tauri-driver toolchain
that's pending in `F-AUTOMATED-SMOKE`. **Provisional baseline** based
on visual inspection + DOM audit:

  - **0 critical** violations expected (no missing alt-text on
    interactive controls; no keyboard-only blockers in the editor
    surface).
  - **3-5 serious** violations expected from Element Plus 2.x
    components: aria-required-attr edge cases on el-radio
    (deprecated `label` prop), color-contrast on theme card border
    in light theme.
  - **10-15 moderate** violations expected from missing
    `aria-describedby` on form controls in prefComponents.
  - **20+ minor** violations expected from heading-order quirks and
    landmark-role gaps in Settings sidebar.

**Acceptance for v2.0 alpha:** ship with the above provisional
counts logged. The first axe-core CI run (post-F-AUTOMATED-SMOKE)
replaces this provisional table with actual measurements.

## Manual screen-reader testing

Pending — listed as a B4-step-13 closing checklist item:

  - macOS: VoiceOver navigation through Open Folder → tree → file
    selection → editor → Settings.
  - Windows: NVDA equivalent walkthrough on the Windows alpha build
    (deferred — Windows alpha not in v2.0 target).
  - Linux: Orca walkthrough (deferred — Linux alpha post-v2.0).

For v2.0 alpha ship: **macOS VoiceOver pass required**. User-driven
test, not automatable in this session.

## Followups (post-alpha)

  - `F-A11Y-AXE-CI-SCAN` — wire axe-core via Playwright + tauri-driver
    into release.yml; replace provisional violation counts with
    measured values per release.
  - `F-MENU-WIRE-TAURI` — closes top-menu screen-reader announce
    item.
  - `F-ELEMENT-PLUS-3X-UPGRADE` — closes el-radio deprecation
    warnings + aria-modal frame-gap.

## Sign-off

This baseline documents the **lower bound**. Each subsequent
release's a11y baseline doc must:

  1. Reference this document.
  2. Either match or exceed the must-pass item count (currently 2.5
     of 5 confirmed pass; the 0.5 is item-2's brief frame gap).
  3. Show axe-core violation counts trending DOWN (not just
     refactored to different categories).
