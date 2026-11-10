# Sequential fitted-table resize evidence

Fit/Full previously refitted every column except the current one, so the second border drag expanded a previously narrowed first column. Reapplying intrinsic content minima also erased valid manual proportions, and replacing the width-store entry during observer reconciliation disconnected an in-flight gesture.

Internal borders now conserve the adjacent pair from pointer-down geometry. Other columns and the outside frame remain unchanged. Manual ratios permit wrapping at the existing resize minimum; natural automatic fitting retains content minima. Observer reconciliation preserves the entry identity. A plain border press does not activate manual geometry before actual movement. Auto retains its existing single-column growth and bounded overflow fitting.

Five gesture/refit cases failed before the runtime repair. An additional plain-press regression failed before the movement guard. Final verification passed all three literal approved commands: 160 unit cases, the renderer build and 168 table/viewer browser cases in Chromium and WebKit, with zero failures and zero retries. Selected final lint returned zero errors and four existing heuristic-confidence warnings outside this scope. Browser cases use real pointer drags, exact Markdown/saved comparisons, tab adoption, mode round trips and no-scroll checks. Full mode is compared against its actual resolved canvas and retained proportions at the unchanged 2px tolerance, since a vertical scrollbar can change the canvas across tabs. No retry, timeout, skip, coverage threshold or minimum was relaxed.

Native drag acceptance remains pending on a fresh attributed QA build. Application version, release authorization and open user documents are unchanged.
