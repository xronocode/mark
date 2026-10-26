# Final spec review — C-LARGE-DOC-STAGE-0

> **Superseded revision.** This report certifies the 2026-10-24 bytes
> (`spec.xml` SHA-256 `33b0a8ad…`, `design-context.xml` `fdcd0aef…`). The
> current files carry `status="approved"` but differ from those bytes, and no
> review of the current revision is recorded in the bundle. The approval
> evidence therefore does not cover the approved text: a fresh two-pass
> four-corner review of the current revision is required before a plan is
> written or approved.

Date: 2026-10-24  
Verdict: **CLEAN — two consecutive clean four-corner passes**

## Reviewed artifacts

- `.grace/changes/active/C-LARGE-DOC-STAGE-0/spec.xml`
  - SHA-256: `33b0a8ad9118aae7904d566a500b279e187efbd815ac1addfedb0bb5118adfa4`
- `.grace/changes/active/C-LARGE-DOC-STAGE-0/design-context.xml`
  - SHA-256: `fdcd0aef79a2a9964b184399f99d0f9523dfa2e8169b0b248760024c2b8c22b3`

The canonical packet hashes still match the two original clean-review pins.

## Review cycle

| Pass | Verdict | Result |
|---|---|---|
| 1 | FINDINGS | Fixed the unpaired `V-M-060` design, incomplete owner gate, skippable required phases, and missing applicable characterization/memory coverage. |
| 2 | FINDINGS | Fixed internal wording drift, made all three evidence tiers mandatory, and made the `M-060` ownership boundary explicit. |
| 3 | CLEAN | Full correctness, security/privacy, UX and performance review; XML and GRACE lifecycle checks passed. |
| 4 | CLEAN | Independent-order recheck of the same bytes against the canonical packet, safety inventory, current repository identity and routing rules. |

## Corrections made

1. **High — GRACE routing integrity:** `V-M-060` could have existed without matching `M-060`. The spec now requires the routed `M-060/V-M-060` pair in the performance graph and verification documents, with explicit dependencies on M-011/M-012.
2. **Medium — decision gate completeness:** the owner gate now includes absolute budgets, same-run ordinary-document regression tolerance, platform/runtime labels, and the later-wave experimental access model.
3. **Medium — measurement truthfulness:** required Chromium and Playwright WebKit `PHASE_TYPING`/`PHASE_SCROLL` runs must produce numeric results. A skipped phase cannot satisfy the gate or replace real WKWebView evidence.
4. **Medium — oracle completeness:** added deterministic seeded mixed sessions, CJK/Pinyin/Hangul/dead-key IME, cut/table/image/link/search operations, controlled export/copy readers, split-view ownership, and explicit current multi-window N/A/trigger handling.
5. **Low — performance completeness:** added observer-overhead control and retained-memory observations after open, edit pauses and tab close, including C-68 and conditional journal retention.
6. **Low — baseline clarity:** the recorded `81 entries / 10 active changes` state is now explicitly the pre-spec capture; adding this bundle explains the current `82 / 11` counts.

## Validation evidence

- XML: valid for `spec.xml` and `design-context.xml`.
- GRACE lifecycle: exactly one `C-LARGE-DOC-STAGE-0` wrapper; root and child status are `draft`; `plan.xml` is absent.
- Anchor availability: no current `M-060` or `V-M-060` anchor exists outside this draft specification.
- Current baseline: branch `train/2.8.1-seal-squash`, HEAD `ea4ddcd7540b2fa0968cad1c55cadd5685b7d5f9`.
- `grace lint --path . --assertions current`: 7 errors / 19 warnings, all pre-existing.
- `grace lint --path . --parallel-preflight`: 24 errors / 19 warnings, pre-existing active-change conflicts.
- No product code, plan, graph or verification current-state artifact was changed by this review.

## Handoff state

The spec is ready for owner review but remains `draft`. The existing parallel-scope conflicts still block plan approval or execution until they are sequenced, narrowed or completed. No approval, plan creation, implementation, commit, push, train admission or release action was performed.
