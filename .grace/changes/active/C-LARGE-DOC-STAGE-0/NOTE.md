# Status note — this copy is a preservation snapshot

The authoritative `C-LARGE-DOC-STAGE-0` bundle does not live on this branch. It lives
on the local-only branch `spec/large-doc-stage0` (tip `06230ff0`, worktree
`~/prj/mark-wt/large-doc-stage0`), which carries:

- the approved plan `f91378df` (2026-10-27, CornerMatrix with twelve corners,
  T-001..T-012, four-corner review recorded as two clean passes);
- the implementation of T-002..T-004 (deterministic fixture corpus and generators,
  real typing/scroll phases through the input pipeline, responsiveness meters).

Nothing on that branch is pushed: it is the only copy of the plan and of those four
implementation commits.

This branch holds the two files recovered from the pre-cleanup snapshot of the stale
2026-10-24 checkout, plus `final-review.md`. Treat it as an archived snapshot and do
not edit it.

## Known divergence

The `design-context.xml` in this copy was sanitized: the approved bytes
(`7ff72017…`, commit `466d4c57`) cite an owner-local research packet by a
home-relative path; the copy here (`be22602f…`) names the packet by description
instead, so the published payload carries no private path. The design context is
non-normative, and `spec.xml` here is byte-identical to the approved `27df1bd6…`.

Whichever copy becomes canonical must carry that sanitization explicitly, together
with a record of when and why it was applied.
