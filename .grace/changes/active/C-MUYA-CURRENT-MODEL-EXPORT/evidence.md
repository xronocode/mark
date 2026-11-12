# Current-model HTML export evidence

## Behavior

The two existing Muya HTML export methods obtain one complete-model string through `getMarkdown()` at call entry. The existing `ExportHtml` conversion, options and signatures remain in place. Export does not assign the change-event cache or change import, history, cursor or dirty-state behavior.

The matching specification and sequential execution plan were explicitly approved on 2026-11-12; their approved bodies remain unchanged.

## Verification

- Failing-first real-Muya suite on the unchanged runtime: 6 failed, 2 passed. The failures identify previous-document output after a render-only import, a later model change during conversion, and content absent from the mounted DOM.
- Focused suite after the two-method repair: 23 passed, 0 failed across the new current-model suite and existing fence-length and Markdown round-trip suites. The eight new cases cover both public APIs, ordinary output, current complete-model ownership, asynchronous string capture and read-only cache/change/history/cursor invariants.
- Selected final validation passed all three declared commands: 23 focused tests, IPC typing and renderer build; zero errors and four existing heuristic warnings.
- The current main Muya source and the source in Export #233 have the same pre-fix content. Native inactive-tab PDF evidence and six strengthened Chromium/WebKit PDF/HTML/Word cases independently reproduced the wrong-buffer defect on the preceding Export candidate; those are failing baseline evidence, not passing results for this repair.

## Remaining gates

Independent standards/spec review, exact-candidate hosted checks and combined Export browser/native content verification remain pending. Owner acceptance and this bundle's apply/archive are pending. The separate Export lifecycle approval is preserved with its stated owner/platform acceptance boundary.

No version, tag, signing, dispatch or publication is authorized. Completed native test applications and their executable copies have been shut down and deleted; source, recipes, digests and failing outputs remain as evidence.
