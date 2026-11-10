# Fitted partial column reset evidence

After adjacent resizing, the partial double-click reset measured one column at its natural width and applied the resulting pixel sum directly. The framed layout funnel was skipped. WebKit reproduced a table width of 823px in a 756px Fit frame (67px overflow), and 1298px in a 1231px Full frame, on both header and body boundaries. Two unit cases also pinned the immediate stored sum of 920px in a 720px frame.

Partial resets now apply the existing selected-mode layout before persistence. The reset column still loses its manual flag, remaining flags survive, Auto retains the existing direct natural-width path, and complete resets keep their existing behavior. No schema, application version, minimum, retry, timeout, skip or coverage threshold changed.

Final verification passed the three literal approved commands: 162 unit cases, renderer build and 176 table/viewer browser cases in Chromium and WebKit, with zero failures and zero retries. Selected final lint returned zero errors and four existing heuristic-confidence warnings outside this scope. The added browser cases exercise border two then border one after sequential drags on header/body surfaces in Fit and Full. Immediate frame/no-scroll and exact Markdown/saved assertions remain required. Tab adoption uses the same saving preference transport and path-aware file stat as the existing persistence suite, asserts that the selected mode was actually saved, and checks restored proportions in the actual frame at the existing 2px tolerance. Unit cases assert fitted pixels and persistence before any observer reconciliation.

Native acceptance of this partial-reset repair remains pending on a fresh separately identified QA artifact. No release is authorized.
