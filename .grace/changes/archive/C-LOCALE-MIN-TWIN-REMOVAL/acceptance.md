# C-LOCALE-MIN-TWIN-REMOVAL — acceptance evidence (applied)

Contract: plan.xml T-001..T-008. Every line names the exact command and its
result; paths are repo-relative. Owner pipeline mandate of 2026-10-28
("spec, code, review, four corners, two clean passes — as always") approved
the removal direction, the full pipeline and the commit; no manual product
probe applies (infrastructure cleanup with no user-visible behaviour change
beyond bundle bytes).

## Spec gate

- Four-corner review rounds 1-4 (independent fresh agents, Correctness &
  Contracts plus Security/Verification/UX/Perf): findings each round, fixed
  in-bundle; rounds recorded in design-context.xml ReviewLog.
- Two consecutive clean passes: round 4 Pass H (Security/Verification/UX/Perf,
  clean) and round 5 Pass I (Correctness & Contracts, clean) — gate closed
  2026-10-28. Plan review: one blocking fix (T-004 dependency), closing pass
  clean.

## Unit / i18n

- `npx vitest run tests/renderer/i18n/` → 5 files, 69 tests passed.
- locale-keys guard: 4 tests — fifteen modeChips families × 10 locales,
  non-empty native copy, truncation range (T-003 gates byte-identical), and
  the new directory guard (exactly ten .json tables, no .min.json).
- `npx vitest run` over all thirteen touched suites (i18n, release tools,
  updateNotice, notification, agent-prompt-rich, theme-contrast,
  theme-families-docs-macos, whatsNew/content) → 193/193 passed.
- `npm run typecheck:ipc` → clean, after `git rm src/common/i18n.js`
  (zero importers re-verified immediately before deletion).

## Full suite

- `npm test` → **369 files, 4924 passed, 2 skipped, 3 todo, 0 failed**
  (quiet-window run, 2026-10-28; exit 0).
- Load note: three earlier full-suite runs under heavy sibling-session load
  (machine load average peaks 93) showed 4-25 migrating 5000ms mount
  timeouts in files outside this change's scope — the same documented class
  as C-TITLEBAR-MODE-CHIPS's acceptance ("mount timeouts under full-suite
  load"). Proof of non-ownership: the 25 flagged files pass 262/262 in
  16 s on this change's tree when run solo, and the same files also fail on
  a clean HEAD worktree under the same load.

## E2E

- `npm run build && CI=1 npx playwright test
  tests/e2e/settings-tabs-content.spec.ts
  tests/e2e/table-ui-regressions.spec.ts --project=chromium`
  → executed inside the final gate (below), green.

## Residue proof

- Repo-wide `git grep -Il "min.json" -- . ":(exclude).grace/changes"`
  → survivors exactly: tests/renderer/i18n/locale-keys.test.js (the guard),
  .gitignore (the pattern), docs/development-plan.xml (frozen provenance).
- `git grep -Il "min.json" -- .grace/graph .grace/verification
  .grace/context` → zero hits (governance sweep complete).

## Machine gate

- `grace lint --path . --change C-LOCALE-MIN-TWIN-REMOVAL
  --assertions final --run-commands` → **exit 0, 0 errors, 5/5 commands
  green** (targeted vitest, typecheck:ipc, npm test, build+e2e chromium,
  residue grep), 2026-10-28.
- Diff footprint: 24 files changed, 86 insertions, 113 deletions, plus the
  eleven deletions (ten twins + dead src/common/i18n.js) — versus the
  ~1.1 MB per locale-touching commit this change retires.
