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

The owner authorized integration and apply/archive with an explicit exception for the remaining native matrix and owner/platform acceptance. The corrected current-model source has source-bound native content evidence, and the final committed candidate has fresh review, hosted checks and an identified native build. The additional final-package replay remains unverified under that exception; it is not a condition silently added to the owner's authorization. Fresh final command validation precedes lifecycle apply, followed by current-state integrity/status and required checks on the archive commit before integration. Release-train admission remains pending. No version, tag, signing, release dispatch or publication is authorized.

## Refreshed committed candidate

Candidate `451a5f2601655922fd2b124707d51408cc3032b9` descends from the accepted current-model repair in main. Its tree is identical to reviewed `38be2918ae6f857f393fb27d4874d19f4fab4b66`; Standards and Spec have zero remaining findings. Normal commit and push safety checks passed without overrides.

- e2e: 42/42 passed (fresh local Export/Settings cohort on the committed candidate).
- e2e: 832 passed, 1 flaky, 8 existing skips (complete hosted Chromium/WebKit matrix on the same candidate).
- Hosted renderer: 5932 passed on Linux and Windows; 5936 on macOS. Each run passed 421 files and unchanged coverage thresholds, with existing platform skips and three todos.
- Hosted backend: 557 passed on Linux, 542 on Windows and 600 on macOS; each has one existing ignored case.
- Build, QuickLook and all four required contexts passed. Four CodeQL language analyses passed; Swift did not start because hosted macOS capacity was unavailable and remains explicitly open.

The external-delete characterization passed its existing configured retry and remains an open instability also observed on the core dependency. An earlier Source-to-Split typed-marker failure remains under investigation: the same case passed three local repeats on both main and this candidate, all eleven stream cases passed thirty-three local runs, and the current complete hosted matrix passed. These results do not establish either observation's root cause.

## Current-model export dependency

The refreshed tree integrates the applied and archived C-MUYA-CURRENT-MODEL-EXPORT repair. Both existing HTML export APIs read one current complete-model string rather than a stale change-event cache. The real-Muya focused suites passed 23 tests in the merged tree. Strengthened PDF, HTML and Word browser cases inspect actual output content as well as the selected filename; the complete Export/Settings cohort passed 42 of 42 cases in Chromium and WebKit.

All 882 compared product source paths match the identified earlier acceptance combination byte for byte. That combination passed nine native entry/format routes and fourteen output-content inspections, plus orientation, Settings navigation, Reset, Save cancellation and Print cancellation. This establishes source-bound acceptance evidence and does not relabel a temporary tree as the final committed native artifact.

All 740 built renderer files in the identified final candidate also match the native-tested combination byte for byte, and the backend print source is identical. The final isolated artifact was built successfully from the clean committed candidate. Its product/bundle identity and asset-directory path differ; no binary-byte or final-package execution equivalence is claimed. Its pending replay and owner/platform verdicts stay open under the owner's explicit exception. The previously discovered wrong-buffer defect itself is corrected and is not waived.

The minimized-Settings presentation observation also reproduces on unchanged main through both the native Settings menu and its keyboard shortcut. It remains a separately open pre-existing window issue, together with the preserved owner/platform verdicts. No unrelated window repair or C-50 work is included here.

## Theme label range follow-up

The relocated theme loader retained an ambiguous ASCII range in CSS comment labels. Explicit uppercase and lowercase ranges remove the six intervening punctuation characters. Six mounted filename-fallback cases failed before the correction; the complete form-function suite then passed 32 tests, including the existing alphabetic-label case. Verification records this label behavior without claiming CSS sanitization.

The preceding complete candidate, `ffee02501aca931404a063e15b693d93d92ee7a4`, passed all four required hosted contexts. Its browser matrix passed 832 cases; one flaky case passed its existing configured retry, with eight existing skips. This is evidence for that candidate; the follow-up requires fresh checks on its own head.
