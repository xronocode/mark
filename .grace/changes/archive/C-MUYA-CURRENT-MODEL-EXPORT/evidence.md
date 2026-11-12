# Current-model HTML export evidence

## Behavior

The two existing Muya HTML export methods obtain one complete-model string through `getMarkdown()` at call entry. The existing `ExportHtml` conversion, options and signatures remain in place. Export does not assign the change-event cache or change import, history, cursor or dirty-state behavior.

The matching specification and sequential execution plan were explicitly approved on 2026-11-12; their approved bodies remain unchanged.

## Verification

- Failing-first real-Muya suite on the unchanged runtime: 6 failed, 2 passed. The failures identify previous-document output after a render-only import, a later model change during conversion, and content absent from the mounted DOM.
- Focused suite after the two-method repair: 23 passed, 0 failed across the new current-model suite and existing fence-length and Markdown round-trip suites. The eight new cases cover both public APIs, ordinary output, current complete-model ownership, asynchronous string capture and read-only cache/change/history/cursor invariants.
- Selected final validation passed all three declared commands: 23 focused tests, IPC typing and renderer build; zero errors and four existing heuristic warnings.
- The current main Muya source and the source in Export #233 have the same pre-fix content. Native inactive-tab PDF evidence and six strengthened Chromium/WebKit PDF/HTML/Word cases independently reproduced the wrong-buffer defect on the preceding Export candidate; those are failing baseline evidence, not passing results for this repair.
- Independent review of implementation commit `040bb5ed15d30c94651f8719cb2e05574166e2ca`: Standards 0 findings; Spec 0 findings. Normal commit and push safety gates passed without an override.
- An isolated native application built from that clean implementation commit exported the inactive tab to PDF with the selected document marker present and the previous active document marker absent. The generated file's text was inspected independently. The application was closed normally and its app bundle, standalone executable and matching executable copy were removed.
- A temporary combined acceptance tree used Export `170ce81c641bc296a7ee481b957f76a7367a8d75`, the exact Muya source from the implementation commit, and the strengthened Export content tests. All six PDF/HTML/Word selected-content cases passed in Chromium and WebKit. This establishes integration behavior on the identified source combination; it is not hosted verification of a committed combined head.
- The complete combined Export/Settings browser acceptance set passed 42 of 42 cases in Chromium and WebKit, including remembered settings, orientation correction, success-notice navigation and Save cancellation.
- Fixture teardown removes the actual editor container created by Muya, as well as destroying the instance and removing the original fixture node; Muya replaces the original node during construction. Export behavior and the eight regression cases are unchanged.
- Exact candidate `473023bc741498be6c6fd8ba1d2840dd6705acf0`: all four live required contexts passed. Full hosted browser checks passed 811 cases with eight existing skips and no flaky cases. Renderer unit/coverage passed 5864/5868/5864 tests on Linux/macOS/Windows; backend passed 557/600/542 tests, each with one existing ignored test. Native QuickLook, CI build, governance, readiness and the committed-range security scan passed.
- Combined native acceptance completed the nine inactive-tab/File/document-popover PDF/HTML/Word entry routes. All fourteen inspected output files contain the selected fixture marker and exclude the preceding buffer. PDF and Word landscape, fresh and visible-existing Settings notice navigation, section/options persistence, Reset, Save cancellation and native Print cancellation passed. All owned applications and executable copies were removed after normal Quit.

## Remaining gates

The owner explicitly authorized this bundle's apply/archive and integration on 2026-11-12 after the passing final and four required hosted contexts. Owner/platform acceptance remains pending. The separate Export lifecycle approval is preserved with its stated owner/platform acceptance boundary. The native/browser combination above is source-bound acceptance evidence, not a hosted check for the final refreshed Export head.

Additional native observation outside the two-method Muya repair: a minimized existing Settings window receives the Export route but remains minimized; the visible-existing-window control passes. This presentation case remains open for separate disposition. Swift CodeQL on the exact candidate was cancelled before any step because GitHub did not allocate a hosted macOS arm64 runner; supported workflow/job reruns were unavailable. All other CodeQL languages passed. Live main rules have no code-scanning rule and require only the four passing contexts stated above; no security configuration or gate was changed.

No version, tag, signing, dispatch or publication is authorized. Completed native test applications and their executable copies have been shut down and deleted; source, recipes, digests and failing outputs remain as evidence.

## Lifecycle

Applied and archived on 2026-11-12 with the approved specification and plan bodies unchanged. The owner explicitly preserved the additional minimized-Settings observation, owner/platform verdicts and the hosted-capacity Swift cancellation as open points. Integration and collecting-train bookkeeping are subsequent delivery steps; no release is authorized.
