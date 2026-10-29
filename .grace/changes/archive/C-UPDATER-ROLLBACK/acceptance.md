# C-UPDATER-ROLLBACK — archive record

- Implemented: merged as `8dc938f3` (PR #120, 2026-10-29, squash of feat/updater-rollback).
- Owner instruction: 2026-10-28 chat order ("A separate worktree? If so, go execute."), recorded in spec R-10 as the approval basis for both the spec and, after its own review gate, the plan.
- Review gates: spec — four corners, two consecutive clean passes (rounds 7-8 of the design-context ReviewLog); plan — four corners, two consecutive clean passes (rounds 3-4 of the plan ReviewLog).
- Implementation gates (worktree, final head e04f53f8): cargo test full 459/459 (rollback filter 19/19); npm test 4932 passed / 0 failed plus the coverage gate (92.08/85.15/87.18/93.32 over thresholds); grace lint --assertions final --run-commands = 0 errors; PR #120 CI fully green (all matrix jobs incl. the macOS packaging smoke after the unused-binding warning fix).
- Site deliverable: mark-site local main (docs branch docs/rollback-guide, cf0d661) — that repository has no remote yet; deploy is a separate owner action.

## Final gate before archival

`grace lint --path . --change C-UPDATER-ROLLBACK --assertions final --run-commands` — 0 errors; the four expected current-lint baseline MustNotContain violations clear with this archival (the change is applied on main).

## Intentionally not verified here

The two-platform manual restore protocol (a real two-version restore on macOS through the menu and the terminal crash path; a Windows polygon restore through the verified installer) is recorded as pending owner-executed evidence in V-M-068 and stays owed after this archival — it observes shipped binaries, not this repository.
