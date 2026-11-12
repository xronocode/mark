# Export settings implementation evidence

## Implemented behavior

Export options apply immediately in Settings. The navigation order is General, Appearance, Editor, Markdown, Export, Advanced, Experimental; fresh or invalid remembered selections open General. Export notices explicitly open Export.

PDF, HTML and Word commands open Save directly, using an immutable snapshot of remembered options. Reset restores defaults without exporting. Existing appearance storage remains in place; page defaults and an explicit HTML title use separate validated storage. Failed persistence remains visible and retryable.

## Local verification

- tests: 129 passed, 0 failed (nine suites declared by the approved final gate).
- build: green (`npm run typecheck:ipc` and `npm run build`).
- Selected final validation on the integrated PDF-save baseline: three commands passed, zero errors and five existing warnings, including the unrelated overlapping active change.
- Full renderer coverage on the refreshed integration tree: 5936 passed across 421 files, 2 existing skips and 3 todos. Statement/branch/function/line coverage is 92.23/85.66/88.70/93.71 with unchanged thresholds. These are local integration results; final-head hosted verification remains separate.
- e2e: 42/42 passed (Settings and export flows, Chromium/WebKit); 22/22 passed (HTML images, Word and Print); 28/28 passed (save/close characterization). The latter two cohorts retain complete image bytes and canonical HTML oracles after removing obsolete modal expectations.
- Semantic parity checks preserved PDF options, HTML bytes/styles/content and Word geometry/content for the same options.
- Light/dark Settings rendering was inspected at 640 by 620. Earlier isolated native artifacts demonstrated PDF page geometry and notice navigation; those observations do not establish acceptance of a new build.
- Standards and specification reviews found zero remaining findings on the implementation and the two export test adapters.

## Remaining gates

The owner authorized integration and apply/archive while preserving open native/owner/platform acceptance. The authorization remains valid; fresh review, hosted checks and an identified native build must bind to the final refreshed committed candidate before lifecycle completion and integration. Release-train admission remains pending. No version, tag, signing, release dispatch or publication is authorized.

## Current-model export dependency

The refreshed tree integrates the applied and archived C-MUYA-CURRENT-MODEL-EXPORT repair. Both existing HTML export APIs read one current complete-model string rather than a stale change-event cache. The real-Muya focused suites passed 23 tests in the merged tree. Strengthened PDF, HTML and Word browser cases inspect actual output content as well as the selected filename; the complete Export/Settings cohort passed 42 of 42 cases in Chromium and WebKit.

All 882 compared product source paths match the identified earlier acceptance combination byte for byte. That combination passed nine native entry/format routes and fourteen output-content inspections, plus orientation, Settings navigation, Reset, Save cancellation and Print cancellation. This establishes source-bound acceptance evidence and does not relabel a temporary tree as the final committed native artifact.

The minimized-Settings presentation observation also reproduces on unchanged main through both the native Settings menu and its keyboard shortcut. It remains a separately open pre-existing window issue, together with the preserved owner/platform verdicts. No unrelated window repair or C-50 work is included here.

## Theme label range follow-up

The relocated theme loader retained an ambiguous ASCII range in CSS comment labels. Explicit uppercase and lowercase ranges remove the six intervening punctuation characters. Six mounted filename-fallback cases failed before the correction; the complete form-function suite then passed 32 tests, including the existing alphabetic-label case. Verification records this label behavior without claiming CSS sanitization.

The preceding complete candidate, `ffee02501aca931404a063e15b693d93d92ee7a4`, passed all four required hosted contexts. Its browser matrix passed 832 cases; one flaky case passed its existing configured retry, with eight existing skips. This is evidence for that candidate; the follow-up requires fresh checks on its own head.
