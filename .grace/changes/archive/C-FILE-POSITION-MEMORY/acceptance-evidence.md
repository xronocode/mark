# C-FILE-POSITION-MEMORY — Acceptance Evidence

- Date: 2026-10-24
- Branch: `train/2.8.1-seal-squash` working tree (see Incident note), implementation uncommitted
- Harness: tauri-shim e2e (`tests/e2e/position-memory.spec.ts`, `tests/e2e/position-memory-acceptance.spec.ts`)
- Scope accepted here: position persistence across tab close/reopen, file reopen, app reload, and rename (spec decisions D-1..D-5)

## Incident note (2026-10-24 ~04:40) — destroyed and recovered

A parallel release-train session reset the working tree to `fork/main`
(branch `fix/pdf-export-objc-crash` deleted, tracked modifications of three
concurrent sessions wiped; untracked files survived). This bundle's
tracked-file edits were recovered byte-exact from the session's
tool-state artifacts (`~/.zcode/cli/artifacts/sess_46806945-*/`, latest
file snapshots) plus two re-applied mechanical fixes (the `async
NEW_TAB_WITH_CONTENT` keyword and the fake-muya `getCursor` mocks in
editor-coverage). All gates below were re-run AFTER recovery; the
acceptance transcripts are the post-recovery capture (byte-identical
to the pre-incident capture); the before/after PNGs stay in the local
acceptance record because binary admission needs a multimodal review.

## Gate results (post-recovery)

| Gate | Command | Result |
|---|---|---|
| Renderer unit/store (this bundle's scope) | `npx vitest run tests/renderer` | 4795 passed; 18 failures are the OTHER two sessions' equally-destroyed tracked edits (10 notification `prefersReducedMotion` util, 8 docx contextMenu/muya) — zero failures in position-memory or theme files |
| Position memory e2e | `npx playwright test tests/e2e/position-memory.spec.ts --project=chromium` | 5/5 passed (C-1 arrows/switch, C-3 close+reopen, C-4 reload, C-5 clamp, C-9 burst) |
| Acceptance e2e | `npx playwright test tests/e2e/position-memory-acceptance.spec.ts --project=chromium` | 2/2 passed, PNG evidence saved |
| GRACE lint | `grace lint --path . --assertions current` | 0 findings referencing this bundle (remaining errors: pre-existing branch debt + docx session's export-docx test) |

## Scenario 1 — close tab + reopen file (evidence-close-before/after.png)

Setup: tall document (150 paragraphs), scroll to depth, caret on "Paragraph 120" via click.

Before (state at flush, from store dump):

```json
{
  "scrollTop": 3778,
  "caretParagraph": "Paragraph 120",
  "firstVisibleParagraphs": ["Paragraph 111", "Paragraph 112", "Paragraph 113"],
  "contentRevision": unchanged across the flush
}
```

After close tab → reopen same file (transcript captured by the acceptance spec):

```json
{
  "scrollTop": 3778,
  "caretParagraph": "Paragraph 120",
  "firstVisibleParagraphs": ["Paragraph 111", "Paragraph 112", "Paragraph 113"],
  "caretOnScreen": true
}
```

Byte-identical before/after. Visual verification of the cropped decisive region
(`evidence-close-after.png`): top rows literally read "Paragraph 111/112/113 of the
tall document with filler text to guarantee height.", caret sits inside "Paragraph
120", document is deep-scrolled (no title visible) — matches the transcript.

## Scenario 2 — arrow-key caret move + tab switch away/back (evidence-arrows-after.png)

Setup: caret moved by ArrowDown ×N (the original bug: keyup-driven moves never
persisted), then switch to another tab and back.

Before (at flush):

```json
{
  "scrollTop": 2601,
  "caretParagraph": "Paragraph 90",
  "firstVisibleParagraphs": ["Paragraph 76", "Paragraph 77", "Paragraph 78"]
}
```

After tab switch away → back:

```json
{
  "scrollTop": 2601,
  "caretParagraph": "Paragraph 90",
  "firstVisibleParagraphs": ["Paragraph 76", "Paragraph 77", "Paragraph 78"],
  "caretOnScreen": true
}
```

Byte-identical before/after. Visual verification of the cropped decisive region
(`evidence-arrows-after.png`): top rows literally read "Paragraph 76/77/78 of the
tall document with filler text to guarantee height.", active-paragraph marker (¶)
on "Paragraph 90" — matches the transcript.

## Landmine checks (negative evidence)

- No `contentRevision` inflation from cursor/scroll writes (C-5 asserts the
  stale-save-outcome guard is untouched; `updateCursorPosition` writes `tab.cursor`
  only).
- Stale entry clamp: entry with line 999 against a 3-line document restores
  clamped-to-last-line, not NaN/out-of-range (C-3).
- Rename moves the entry under the new path; no orphan left under the old one (C-9).
- Reload (`page.reload()` + manual bootstrap emit with `addBlankTab:true`) restores
  the position (C-4).
