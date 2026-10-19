# Close-report triage — 2026-10-19

This records C-DESKTOP-STABILIZATION T-005. Integration, renderer evidence, native behavior and owner acceptance remain separate. The table below preserves the initial ordinary-flow triage; the tab-close disposition was superseded by the accepted C-TAB-CLOSE-OWNERSHIP follow-up recorded below.

| Report | Refreshed evidence | Disposition |
| --- | --- | --- |
| Fullscreen viewer × needs a second click | Repair `36cfd16c` moves the macOS viewer header below the AppKit titlebar strip. Git ancestry confirms it is already in the published `v2.5.3` tag. The existing first-click/geometry test passes in Chromium and WebKit on the current source. | Already shipped repair; the old handover was stale. A continuing native symptom needs its exact build/source and sequence. Browser evidence does not exercise the real AppKit strip. |
| Closing a tab leaves its content in the editor | Restored alpha/beta fixture: close active beta, verify active alpha, rendered alpha and absence of beta; type into the remaining document and verify its path/Markdown plus the tab list; verify relaunch restores only remaining paths. Both engines pass. The earlier topic worktree contains no implementation. | Not reproduced in the checked flow. Keep the broader report pending until its version/build, source/split/diff/preview mode, saved/dirty state and exact close sequence are available. No speculative runtime change or claim of a data-loss repair. |

Fresh command:

```sh
CI=1 npx playwright test tests/e2e/block-viewer.spec.ts tests/e2e/session-restore.spec.ts --project=chromium --project=webkit-block-viewer --project=webkit-session
```

Result: **42 passed**. Tests use renderer-only Tauri shims and temporary fixture paths; they do not open owner documents or prove native dialogs, watcher races or disk writes. Session/close regressions now run under the dedicated `webkit-session` project in CI.

The installed ordinary application was previously observed as 2.5.0, while the direct-download release is 2.5.3. A local Mark Test product version of 2.5.3 alone does not identify its source or prove that it contains a later integration. No production update, new version, release tag or publishing action is part of this triage.

## Tab-close follow-up accepted into the collecting train

On 2026-10-19, C-TAB-CLOSE-OWNERSHIP demonstrated four deterministic ownership defects despite the passing ordinary close checks above: late events from another/closed tab, writes from an old surface, an incorrect equal-content render shortcut and missed activation recovery. Source `943d57d69f7d3b9bf4f896b814649138470e01ac` repairs those boundaries.

The repaired combined base passes 4617 unit cases, 20 Chromium/WebKit cases and controlled native macOS WKWebView timing checks with synthetic documents. The original native producer sequence remains uncaptured; the native shim check is not full backend integration coverage. See the [sanitized GRACE evidence](../../.grace/changes/active/C-TAB-CLOSE-OWNERSHIP/evidence.json).

The owner reviewed the completed repair and explicitly approved release-train admission on 2026-10-19. Its state is now **queued**, with exact source/artifact identity, accepted scope and remaining gates in the [current train item](2.5.x-next.md#c-tab-close-ownership). This acceptance does not start a release or accept other changes in the same base.
