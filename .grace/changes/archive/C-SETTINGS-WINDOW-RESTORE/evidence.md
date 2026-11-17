# Settings window restoration evidence

The existing Settings window now attempts unminimize, show and focus in order. Fresh creation and section routing remain unchanged.

1. Backend compatibility: 43 passed, 0 failed. Renderer navigation and Settings shell: 34 passed, 0 failed across three suites.
2. Renderer build passed. Selected final assertions and both command gates passed with 0 errors and four existing heuristic warnings.
3. Five objective macOS native cases passed: ordinary minimized General restoration; Word-notice restoration of minimized, already-visible and app-hidden General to Export; fresh Settings at Export after normal close. Existing-window cases retained one native identity and 640 by 620 dimensions.
4. Five Word outputs contain the fixture marker in document.xml; original Markdown bytes are unchanged. The early fresh-window observation was incomplete until a subsequent real content-readiness check confirmed Export selection.
5. Native controls used real accessibility actions, export dialogs, notification actions and WindowServer visibility. Pixel capture was unavailable; no pixel-rendering verdict is claimed. All task-owned app processes and windows stopped after normal Quit, and app/executable/renderer copies were deleted. Recipes, source/binary hashes and outputs are retained separately.
6. Independent source review: zero actionable standards or spec findings. Broader owner and Windows/Linux native acceptance remain open. No release is authorized.

Specification and plan technical approval, and successful apply/archive, use the explicit autonomous execution delegation recorded for 2026-11-15. This records delegated decisions without attributing a separate personal acceptance verdict to the owner.
