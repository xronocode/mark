# Sequencing: C-50 is deferred behind C-PAGE-WIDTH-TABLES

Owner decision 2026-10-27, resolving the order between the two approved,
ready-to-execute changes that both write the theme and `M-011` path.

## Decision

`C-PAGE-WIDTH-TABLES` executes first. `C-50` stays approved but deferred
until that change has merged. Neither change may run beside the other: the
parallel preflight reports a durable-scope overlap on `M-011`, and both write
`.grace/graph/*.xml` and `.grace/verification/*.xml`.

## Why the "C-50 first" assumption does not hold

- The C-50 plan was written on 2026-10-15, before the 17-family theme model,
  before the GitHub family and before the page-width spec; its spec contains
  no reference to the current family set.
- The plan carries no `CornerMatrix` and no `ReviewLog`. The standing
  four-corner gate (engineering protocol, Principle 7, 2026-10-27) requires
  both before approval, so this plan is approved under a retired bar.
- Its `ObservedWriteScope` is unbounded — `src/renderer/src/**`,
  `src-tauri/src/**`, `tests/**` plus the graph and verification globs — which
  is why every parallel preflight reports an overlap involving C-50. In that
  shape it cannot run beside any other change, and it cannot be sequenced by
  narrowing someone else's scope.
- Its five tasks predate the theme resolution path the page-width panel
  depends on (`themeMap` / `themeCssFactories` / the family model). Executing
  C-50 first would force the panel's View tab to be rebuilt afterwards against
  a changed model; executing the panel first lets C-50 extend one shipped grid
  instead of two half-built ones.

## Required before C-50 may execute

A refreshed plan under the current gate: narrowed observed-write scope, a
`CornerMatrix` with verbatim `Expected` lines, two consecutive clean
four-corner passes, and a re-read of the theme model as it stands after
`C-PAGE-WIDTH-TABLES` merges. The approved plan must not be edited in place,
so the refresh lands as a new bundle (or an owner-approved supersession) that
references C-50.

## Dependency to carry into that refresh

The page-width View tab renders the 17 families from the shipped theme CSS and
pins a per-document theme override. When C-50 introduces custom themes, it
must extend that grid and that resolution path rather than fork a second
palette or a second override mechanism.
