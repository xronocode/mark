# Acceptance registry — the ordered record of artifacts, reviews and owner verdicts

This registry is the **evidence trail** behind the [release trains](../release-trains/README.md).
The train remains the admission authority; this document answers, for every delivery
item of `2.6.x-next` onward: **what was built, what was reviewed, when the owner
accepted or rejected it, and why anything went back for rework.**

- Machine authority: [registry.json](registry.json) — validated by `node tools/acceptance-registry.mjs --check`,
  which also runs inside the standard test matrix (`tests/renderer/acceptance-registry.test.js`).
- Pre-2.6.0 acceptance history is frozen prose in the Released `2.5.x-next` record; the registry starts at `2.6.x-next`.

## Lifecycle (one vocabulary with the trains)

| State | Meaning | Recorded by |
|---|---|---|
| `reported` | Symptom with a stable item id | any agent |
| `repaired` | Source commits exist | implementing agent |
| `reviewed` | A named review pass with its verdict (independent technical review, owner review, or another recorded reviewer) — one event per pass | reviewer |
| `artifact-offered` | An isolated test artifact + one Markdown case file per acceptance case is in the owner's hands (see Artifact requirements), or an explicit `notApplicable` / `blocked` reason stands in | agent |
| `owner-verdict` | The owner's dated verdict: `accepted` with exact scenarios, or `rejected` with the reason and the rework destination | owner (transcribed verbatim-scoped by the agent, same session) |
| `queued` | Recorded in the collecting train's manifest (`items.userFacing` with acceptance evidence) | agent |

Rules:

- **Never inferred.** A missing verdict is `pending`, never an implied acceptance. Acceptance covers the
  listed scenarios only (train rule: per-item, no acceptance by implication).
- **Rejections keep their reason.** A `rejected` event records why and where the rework went; the item
  returns to `repaired` on the next wave, with history intact.
- **Artifacts are reproducible.** Each registry artifact carries source sha, isolated bundle identity,
  binary digest and build recipe; `tools/build-test-artifact.mjs` rebuilds equivalents. Wiped build
  directories never erase evidence.
- **Append-only.** Corrections append a superseding event; history is never edited.
- **Two-way consistency with the train** is enforced: an accepted item must be admitted in the train,
  and every train-pending repaired item must have an offer or a documented blocker (`notApplicable` / `blocked`).

## Artifact requirements

Isolated identity (never the owner's installed Mark), updater artifacts off, debug build,
binary SHA-256, launch/quit smoke, and a Markdown case file per acceptance case handed to
the owner. Tooling-only items may record `notApplicable` with their evidence instead of an
artifact.

### One Markdown file per acceptance case (owner instruction 2026-10-22)

Never hand the owner one long combined checklist. Every acceptance case gets its **own**
Markdown artifact, opened in Mark (the owner ticks and annotates in Mark itself; live
reload picks the verdict up):

- Location: `~/Downloads/mark-acceptance/<item-id>/<NN>-<case-slug>.md` — one folder per
  item, one file per case (`NN` = the case order, e.g. `01-cold-start-restore.md`).
- Each file carries: the item id and case number, the exact steps to perform, the
  expected result in verbatim form, a checkbox, and an outcome line
  (`принято` / `доработка` / `принято-с-замечаниями`) with room for the owner's note.
- The registry's `owner-verdict.scenarios` mirror the per-case files one to one; verdicts
  are transcribed by the same session that offered the cases.

## Survey (generated from registry.json — `node tools/acceptance-registry.mjs --survey`)

| Item | State | Artifact | Verdict / Why pending |
|---|---|---|---|
| FIX-010 | queued | — (review-accepted) | accepted 2026-10-21, PR 16 review |
| FIX-012 | queued | — (review-accepted) | accepted 2026-10-21, PR 16 review |
| FIX-015 | queued | — (review-accepted) | accepted 2026-10-21, PR 16 review |
| FIX-016 | queued | — (review-accepted) | accepted 2026-10-21, PR 16 review |
| DEPS-FOLLOW-REDIRECTS | queued | — (review-accepted) | accepted 2026-10-21, PR 18 review; merged |
| FIX-013 | artifact-offered | notApplicable (tooling) | owner may accept by review — suite evidence on record |
| FIX-014 | artifact-offered | blocked: polygon offline | owner options recorded: polygon rebuild, or accept on reviewed amendment-5 crops |
| FIX-009 | artifact-offered | mark-test-fix009-7057d645 | 7-scenario checklist offered 2026-10-21; per-item verdicts pending |
