# Second-round review — C-LARGE-DOC-STAGE-0

Date: 2026-10-27
Reviewed revision: `fix/large-doc-review-docs` @ `a8e241c8` (identical to `spec/large-doc-stage0` @ `29aae406`).

Verdict: **findings — not ready for an approval decision.**

## Blockers

1. **The owner-local path survives in the review record.** `review-2026-10-27.md` quoted the
   folder it was reporting on, which put the private reference back into a retained artifact
   after the design context had been sanitized. Redacted in this revision; the earlier pushed
   branches still carry it in history.
2. **The plan was re-flagged, not re-planned.** It still presumes the old approval: the
   intent summary cites `466d4c57` as an approved spec, a baseline assertion requires
   `<Status>approved</Status>` while the spec is `draft`, the evidence claims baseline
   assertions are "holding", and the review log pins commits that are no longer reachable
   heads.

## Majors

- `mt_save_tabs` survives in the spec summary and in plan T-006; only R-6/R-7 were fixed.
- Plan T-011 still budgets tail completion, which the spec removed as not applicable.
- Plan T-002 still says the bench fixture is ~6 KB; it is 3,992 characters / 4,002 bytes.
- The landing document is named only in the spec: the plan has no `.grace/context` entry in
  its write scope, no task writes it, and T-011 still forks "in scope or a separate bundle".
- `ux-guidelines.xml` owns the performance principle but is a poor home for the
  crash-durability contract and the experimental access model, and it is not "routed".
- The real-app WKWebView tier has no executable gate: no build task, no artifact, no `BLOCK_*`
  names, and `run-bench.mjs` is a browser driver that cannot drive `Mark.app`.
- The command chain still invokes `--project=chromium` for suites the chromium project
  ignores, and never starts the preview server the bench driver needs.
- The byte-policy acceptance demands committed fixtures while the plan records them as
  hash-pinned and materialized on demand.
- The execution branch's history carries the private path in every commit through
  `1c08c6b5`; the sanitization exists only at the head.

## Corrections to the first-round record

- First-round finding 2 (wrong design hash) is unsupported and is withdrawn here: the header
  already cites `be22602f` and labels `7ff72017` as the pre-sanitization design.
- First-round finding 1's "the spec calls itself a draft bundle" is a misreading of the
  pre-approval baseline snapshot; the approval-coverage gap stands on the superseded report
  alone.
- First-round finding 8's "appears nowhere in the tree" is overbroad: the string is in the
  spec and the plan, only not in source.
- First-round finding 3's "is the head" attribution is wrong; the path was present at the
  then-head too, so the conclusion holds.
- The first-round disposition overclaims completion: only R-6/R-7, R-1 and R-9 changed; the
  plan was not corrected.

## What a corrected bundle needs

1. Redact the path here and decide the history treatment for the execution branch.
2. Fix the spec summary, the landing document and its category, the WKWebView
   command/marker/pass definition, the chromium invocation and the byte-policy criterion.
3. Re-plan against the corrected spec: transport name, tail budget, fixture size, landing
   scope and task, real-app task and gate, preview server, byte-policy deviation, and a
   reachable approval commit.
4. Re-review spec **and** plan with two clean passes; this record reviews earlier bytes and
   says so.
