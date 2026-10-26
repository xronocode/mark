# Fourth-round review — C-DOC-CHANGE-JOURNAL

Date: 2026-10-27
Target: the design pass at `b9d36470` (record classes, two-phase anchors, pinned lexer).

Verdict: **findings — five blockers. Not approvable, and not fixable by wording.**

The design pass closed the round-3 blockers as written, but a correctness pass over ten
data-integrity scenarios found that the record algebra, the heading half of the alignment,
the block match key and the ordering protocol each still need a decision.

## Blockers

1. **The record algebra is not closed.** One external landing produces three or four
   records — an opened record for the open, the ring checkpoint, the opened landing and a
   separate batch record — while the acceptance asks for exactly two. The shipped
   opened-baseline suite forces the opened record on reload, so the model cannot satisfy
   the acceptance as written. One canonical representation has to be chosen and R-1, R-4,
   R-5 and the acceptance updated together.
2. **The heading half of the alignment is wrong.** Matching headings by parent scope and
   sibling index with the text excluded is ordinal identity: inserting a section heading
   makes the next old heading look renamed, and its children redistribute under a false
   rename. It has to be content-first (LCS/Myers over parent, level and normalised text)
   with an explicit substitution pass for genuine renames and ordinal only for identical
   duplicates. The question "are re-anchored children hunks or just re-keyed?" is also
   unanswered.
3. **The block match key is undefined.** Checked state, heading depth, list start and
   marker, table header/align/cells are token metadata, not "normalised block text": a
   checkbox tick, a heading-level change, a list renumber or a table row edit can normalise
   equal and be reported as unchanged. The key has to be defined per block type as a
   canonical serialization of every user-editable field.
4. **The ordering protocol is not airtight.** A typing-pause timer is armed at edit time and
   appended at fire time, never flushed or cancelled on a buffer-replacing trigger or a
   close; the external batch record is appended at batch close, after records for newer
   states. Append order therefore stops equalling state order, and a timer firing after
   `FORCE_CLOSE_TAB` can re-create a closed tab's text after `clearSnapshots`. A boundary
   protocol is needed: capture at change time, flush synchronously before any reload or
   system rewrite, reserve the batch sequence at first landing, drop a pause record equal to
   the newest record, cancel the timer in `clearSnapshots`.
5. **The external trigger still has no bound seam.** The only safe binding point is after
   the generation guard and the hash comparison, immediately before `loadChange`. Until the
   spec says "no landing, no record" normatively and binds the trigger there, hash-skip, a
   declined conflict banner, a rename echo and Mark's own save can each fabricate an
   external record — and the shipped suites only count ring snapshots, so they cannot see it.

## Majors

- The acceptance "after more than 50 in-app pauses snapshotCount stays 5" cannot pass:
  pauses are event-class, so the ring stays at whatever the reload checkpoints left.
- `actor.kind` per trigger and class is undefined: a ring checkpoint is a state, not a
  change, and neither `user` nor `external` is always right for it.
- The lexer does not yield one token per anchor: blockquote and list are start/end groups,
  list items arrive as structural tokens, and the table token has no text field.
- The system-rewrite trigger still has no seam; `editor.vue` and the formatter are outside
  the write scope.
- The pinned lexer options have no values, and the footnote block type is missing from the
  vocabulary.
- `__resetDiffSnapshots` must clear the journal, and `recordSnapshot` must keep its explicit
  third `now` argument.
- The two-tabs-on-one-file case is unexercised, and delivery is single-tab by design.
- The 8 MiB figure is a cap over evictable records, not a bound on total memory.
- The verification command still omits `open-file-timing`, the only command behind V-M-025.

## What holds

The ring/opened/event split, the rule that pauses are never ring, ring-only dedupe, the
synchronous append at the `recordSnapshot` sites, the projection shapes and exports, tab-id
identity with `pathnameAtWrite`, clearing through `clearSnapshots` from both close paths, the
accurate call-site inventory, the live-defect reading, `Diff_Timeout` 0, and the
content-first matching *inside* a scope all hold against the code.

## Consequence

The bundle stays `draft`. Four decisions remain before another wording pass is worth doing:
the landing representation, the heading alignment, the per-type block serialization, and the
boundary protocol. Until those are settled, each review round will keep finding the same
class of defect one level deeper.
