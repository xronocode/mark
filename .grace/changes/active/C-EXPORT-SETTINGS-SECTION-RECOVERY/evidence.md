# Export settings implementation evidence

## Implemented behavior

Export options apply immediately in Settings. The navigation order is General, Appearance, Editor, Markdown, Export, Advanced, Experimental; fresh or invalid remembered selections open General. Export notices explicitly open Export.

PDF, HTML and Word commands open Save directly, using an immutable snapshot of remembered options. Reset restores defaults without exporting. Existing appearance storage remains in place; page defaults and an explicit HTML title use separate validated storage. Failed persistence remains visible and retryable.

## Local verification

- tests: 123 passed, 0 failed (nine suites declared by the approved final gate).
- build: green (`npm run typecheck:ipc` and `npm run build`).
- Selected final validation on the integrated PDF-save baseline: three commands passed, zero errors and five existing warnings, including the unrelated overlapping active change.
- Full renderer coverage on the matching feature renderer source: 5823 passed, 2 existing skips, 3 todos. Statement/branch/function/line coverage was 92.23/85.66/88.70/93.71 with unchanged thresholds. This predates baseline integration and is not a new-head hosted total.
- e2e: 42/42 passed (Settings and export flows, Chromium/WebKit); 22/22 passed (HTML images, Word and Print); 28/28 passed (save/close characterization). The latter two cohorts retain complete image bytes and canonical HTML oracles after removing obsolete modal expectations.
- Semantic parity checks preserved PDF options, HTML bytes/styles/content and Word geometry/content for the same options.
- Light/dark Settings rendering was inspected at 640 by 620. Earlier isolated native artifacts demonstrated PDF page geometry and notice navigation; those observations do not establish acceptance of a new build.
- Standards and specification reviews found zero remaining findings on the implementation and the two export test adapters.

## Remaining gates

Fresh checks and an identified native build must bind to the final committed candidate. Owner native acceptance, apply/archive and release-train admission remain pending. No version, tag, signing, release dispatch or publication is authorized.

## Theme label range follow-up

The relocated theme loader retained an ambiguous ASCII range in CSS comment labels. Explicit uppercase and lowercase ranges remove the six intervening punctuation characters. Six mounted filename-fallback cases failed before the correction; the complete form-function suite then passed 32 tests, including the existing alphabetic-label case. Verification records this label behavior without claiming CSS sanitization.

The preceding complete candidate, `ffee02501aca931404a063e15b693d93d92ee7a4`, passed all four required hosted contexts. Its browser matrix passed 832 cases; one flaky case passed its existing configured retry, with eight existing skips. This is evidence for that candidate; the follow-up requires fresh checks on its own head.
