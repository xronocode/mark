# Third-round review — C-DOC-CHANGE-JOURNAL

Date: 2026-10-27
Target: the corrective pass that replaced the muya-key model with content-derived anchors.

Verdict: **findings — three blockers. The revision is not approvable.**

The corrective pass closed the wording defects of round 2. This round found that the
underlying data model is still short of what the shipped diff view needs, and that the
anchor contract contradicts itself in the everyday case.

## Blockers

1. **No record class, so the trigger enum cannot represent the two states the migration
   promises to preserve.** R-1 declares three triggers and no record class, while the
   shipped code keeps two structures with different lifetimes: a five-entry ring of
   pre-reload states and a replaceable opened baseline that is never evicted. One external
   reload produces two different states — the pre-write buffer recorded before `loadChange`
   and the post-write disk content recorded inside it — and an open produces an opened
   state with no trigger at all. Under R-1 the pre-write buffer is neither an in-app pause
   nor an external batch nor a system rewrite. A `snapshotClass` field (ring | opened) and
   a fourth trigger are missing, and the acceptance already relies on both classes without
   declaring them.
2. **Ring membership and the migration's append timing can drop the pre-reload state or
   silently change the diff view.** The shipped module dedupes only against the newest ring
   entry and keeps its timestamp; `diffView` prefers the ring over the backend and over the
   opened baseline. If in-app pauses become ring-class records, the opened-baseline e2e
   flips to a snapshot header; if `recordSnapshot` dedupes against the newest record of any
   class, an open followed by an external write suppresses the pre-reload record and the
   diff can become empty while the unsaved text — the only copy — is no longer in the ring.
   The spec must state that `recordSnapshot` appends synchronously at the call site, that
   dedupe is scoped to ring-class records, and that in-app pauses are not ring-class.
3. **The anchor stability rules contradict each other in the ordinary case.** The spec
   promises both "an insertion elsewhere leaves unrelated anchors unchanged" and "a changed
   block keeps its anchor", while defining the ordinal as the occurrence of a block type
   under a heading path. Inserting a paragraph mid-document renumbers every later paragraph
   of that type, so unchanged blocks change anchors and are then reported as moves. A
   renamed heading cannot keep its identity (the heading path is the heading's own text)
   while its unchanged children are reported as re-anchored. The rule needs two-phase
   alignment: headings by parent path and sibling index, blocks inside a matched scope
   content-first with the ordinal used only to break ties among identical texts.

## Majors

- The block tokenizer is misidentified: `src/muya/lib/parser/index.js` is the inline
  tokenizer, while the headless block lexer is `src/muya/lib/parser/marked/lexer.js` with
  its options; the anchor module must pin the lexer and its options and import no DOM or
  contentState code.
- Feeding the external trigger from raw watcher events invents external changes that never
  landed: hash-skip, rename echo, a declined conflict banner and Mark's own save each
  produce no content change and must produce no record.
- The tab-close inventory is still wrong: `CLOSE_TABS` removes tabs without calling
  `clearSnapshots`, so the journal keeps full document text for tabs whose ids are gone.
- The memory bound is not a bound: with the opened record and five ring states exempt, the
  50-record acceptance fails at 51 retained records, and the 8 MiB floor can exceed the cap
  before a single evictable record exists.
- The verification command omits the specs the migration most endangers: the C-43 ring e2e
  and the diff-view e2e are not run, and the unit leg silently drops `tests/site`.
- The system-rewrite trigger has no seam: the formatter reaches the store as an ordinary
  change, so it is recorded as a user edit, and `editor.vue` is not in the write scope.
- A pending typing-pause timer can append a stale in-app record after an external record,
  so append order stops equalling state order.

## Minors

- `diff-match-patch` determinism needs its timeout pinned, or the determinism promise drops.
- "O(1) append" conflicts with per-record line counting, and the byte unit is undefined.
- `Date.now` timestamps are not monotonic; ordering must come from an append sequence.
- The preserved-surface list is incomplete: `SNAPSHOT_LIMIT`, `snapshotCount` and
  `__resetDiffSnapshots` are used by the suites, the projections must keep their exact
  shapes, and R-5's marker wording needs to be exact: `BLOCK_SNAPSHOT_BEFORE_RELOAD_DATA`
  and `BLOCK_SNAPSHOT_BEFORE_RELOAD_DISK` are two distinct markers (`editor.js:2499`),
  not branches of one — the markers themselves exist, the sentence describing them does
  not match the code.

## Sound

The call-site inventory (four `recordSnapshot`, two `recordOpenedSnapshot`, one
`clearSnapshots`), the corrected live-defect reading, tab-id identity with
`pathnameAtWrite`, the decision to derive anchors from markdown instead of `ag-N` ids, the
kind-level attribution shape, the two-part batch policy, the "no diff in the hot path"
rule, and the UI-free scope all hold against the code.

## Consequence

The bundle stays `draft`. The next step is a design decision, not another wording pass:
record classes and triggers, ring membership and dedupe, and the two-phase anchor
alignment. Those three decide the spec, and the spec then decides the plan.

## Addendum from the second round-3 reviewer

An independent third-round pass converged on the same three blockers and added:

- The call-site sentence is still miscounted: R-5 says "all six ... plus one
  clearSnapshots", while the inventory is seven (four `recordSnapshot`, two
  `recordOpenedSnapshot`, one `clearSnapshots`), and `AffectedAreas` lists only the six
  recording sites.
- The spec's `Problem` and `Assumption` still cite the rotted `editor.js:2205-2270`
  range for the reload branch; the gate is 2458/2463 in `APPLY_FILE_CHANGE` (2416-2573,
  conflict at 2516). Only the summary and the design context were corrected.
- The design context's inventory parenthetical names the ring markers
  (`BLOCK_SNAPSHOT_BEFORE_RELOAD_DATA / _DISK`) where it should name the opened markers
  (`RECORD_OPENED_SNAPSHOT_RELOAD`, `_LOAD`) and the ring separately.
- The repair fork is recorded both as decided (2026-10-23) and as still open, and the
  next-step sentence skips the re-approval gate.
- The capability claims still need their preconditions: a pinned diff-match-patch timeout,
  a defined byte unit and stats computation, and ordering by append sequence rather than
  `Date.now`.

Both passes agree the round-2 muya-key blocker is genuinely closed and that the design
context, the call-site inventory and the e2e command are materially better. Neither
approves the revision.

## Design pass applied 2026-10-27

The three design decisions the round-3 passes asked for are now in the spec:

1. **Record model.** ChangeRecord carries `snapshotClass` (`ring` | `opened` | `event`) and a
   monotonic `sequence` as the ordering key, with two new triggers — `pre-reload checkpoint`
   (class ring, appended synchronously at the `recordSnapshot` call site) and `disk-load`
   (class opened, written when a file lands in a tab). In-app pauses are `event`, never
   ring. `recordSnapshot` dedupes only inside the ring class, so an open followed by an
   external write keeps the pre-write buffer as `latestSnapshot`.
2. **Anchor alignment.** Two-phase: headings by parent scope and sibling index with the
   heading's own text excluded from its identity; blocks inside a matched scope content-first
   (LCS/Myers over normalised text) with the ordinal only as a tie-break among identical
   texts. The invariants are restated as consequences of that algorithm.
3. **Block source.** The headless block lexer `src/muya/lib/parser/marked/lexer.js` with its
   shipped options pinned, a fixed blockType vocabulary, top-level granularity, and front
   matter as its own scope.

Plus: the cap now counts evictable records only with an explicit total ceiling; `clearSnapshots`
is required from `CLOSE_TABS` as well; the verification command runs `npm test` and the whole
`tests/e2e/diff-*.spec.ts` set; `Diff_Timeout` is pinned to 0; stats carry UTF-8 bytes; the
preserved export surface and projection shapes are named; the spec's Problem and Assumption
lost the rotted line range; the repair fork is recorded as decided rather than open, and the
re-approval gate sits before grace-plan.

A fourth review round is required on this revision.
