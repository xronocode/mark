# Second-round review — C-DOC-CHANGE-JOURNAL

Date: 2026-10-27
Reviewed revision: `draft/large-doc-journal-specs` @ `5ab2ea3b`.

Verdict: **findings — the correction is real but incomplete.**

## Blocker

1. **The muya block-key model is still normative in four places, so R-2 contradicts
   itself.** The acceptance criterion still requires "coarse hunks map to the expected
   muya block keys", the summary still promises "coarse muya-block hunks", one
   assumption still treats muya keys as accessible, and the design context still lists
   them as an input. R-2 says the opposite: content-derived anchors, never the
   per-parse `ag-N` counter. A plan would have to choose which sentence to break.

## Majors

- R-2's anchor tuple is not testable: `ordinal` has no defined scope, duplicate heading
  paths collide, and pairing/move handling is undefined. No criterion pins anchor
  stability.
- The 50-record / 8 MiB cap can evict exactly the opened baseline and the pre-reload ring
  that R-5 and the acceptance promise to preserve; the opened slot is documented in the
  shipped code as never evicted.
- The tab-close clear path is missing: `clearSnapshots` (`editor.js:1416`) is a seventh
  call site, and without it the journal keeps full document text after the tab dies. The
  two opened sites are `editor.js:336` (external reload) and `editor.js:1930`
  (open/reopen/session restore), not what R-5 says.
- Stale coordinates remain and the design context was not revised at all: it still cites
  `editor.js:2205-2270` (now export code), `package.json:57` (actual 58) and "two
  editor.js sites" (actual four plus two), and it claims the conflict banner is reachable
  only with liveReload and autoSave off, which is false.
- The system-rewrite trigger has no defined source: the formatter lives in `editor.vue`
  and reaches the store as an ordinary change, `AffectedAreas` omits `editor.vue` and
  `util/markdownFormat.js`, and the hash-skip input contract is undefined.
- The verification command does not run the e2e specs the acceptance requires: `npm test`
  is vitest and never touches `tests/e2e`, and the command hard-codes a suite path the
  spec calls plan-time.

## Minors

- The identity constraint adds a per-record pathname the record shape does not have.
- The staged-delivery rationale is false: R-5 makes the migrated snapshot store a
  consumer in this bundle. Staging itself is consistent with R-2 staying a requirement.
- Two residual untestable promises: "off the critical rendering path" has no scheduling
  observable, and the consumer-UI wording rule remains while this bundle ships no UI.
- The private backlog path survived in the first-round record and is redacted here.

## What a corrected bundle needs

1. Rewrite the criterion, summary, assumption and design context so content-derived
   anchors are the only normative model, and add a source assertion that the diff module
   uses no `ag-` keys.
2. Define the anchor tuple, its scope, collision handling and pairing, with stability
   tests.
3. Decide the cap's interaction with the opened slot and the ring, name the close path,
   and add acceptance that the diff view still sees the pre-reload and opened states
   after the cap is exceeded.
4. Revise the design context, the trigger seam and the command chain.
5. Two clean passes over the resulting revision before approval.
