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

Review records use `approve` or `changes-requested`; one historical pass carries `two-actionable`, meaning the review produced two actionable findings. Owner verdicts use `accepted` or `rejected`.

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
| FIX-010 | reviewed | — | accepted 2026-10-21 |
| FIX-012 | reviewed | — | accepted 2026-10-21 |
| FIX-015 | reviewed | — | accepted 2026-10-21 |
| FIX-016 | reviewed | — | accepted 2026-10-21 |
| DEPS-FOLLOW-REDIRECTS | reviewed | — | accepted 2026-10-21 |
| FIX-013 | owner-verdict | Tooling-only change with no product behavior; acceptance evidence is the suite result (Node 25 polygon green without env overrides; Node 22 byte-identical args). Owner may accept by review. | accepted 2026-10-22 |
| FIX-014 | owner-verdict | Windows artifact required; polygon (kari) offline 2026-10-21 (ping 100% loss). Owner options: (a) polygon online -> NSIS from the branch via the standard procedure; (b) accept on the pixel-measured amendment-5 crops of polygon rebuild 8 already reviewed. | accepted 2026-10-22 |
| FIX-009 | owner-verdict | mark-test-fix009-7057d645 | 7 scenarios offered to the owner (3 cold-start incl. the P1 frozen-restore case, 4 current-run recovery); per-item verdicts pending. |
| C-SELF-CONTAINED-HTML-EXPORT | reviewed | No isolated test artifact was built: the owner accepted on the in-session automated evidence (unit/component/e2e matrix above); a live manual export on macOS was not performed by the owner. | accepted 2026-10-22 |
| C-MULTI-SOURCE-WORKSPACE | owner-verdict | mark-test-msw-ab3367c2 | pending |
| FIX-019 | queued | mark-test-fix019-52443b1 | accepted 2026-10-25 |
