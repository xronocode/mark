# Mobile current queue

State: development, not frozen or authorized for publication. Product version and release date: unassigned. Source branch: `mobile/viewer-mvp`. Protocol: [Mobile delivery](README.md).

| Item | State | Next evidence |
|---|---|---|
| WIP preservation and lane split | Preserved locally | Source manifest and private recovery archive; no desktop release workflow delta |
| Rust library/test inventory | Implemented in WIP; review pending | Reconcile all moved tests and run the mobile backend harness |
| Simulator picker flow | Failing saved scenario | Correct fixture/driver/product boundary and rerun exact content/cancel checks |
| Save formats | Failing saved scenario | Resolve native save completion/driver timeout and verify actual output files |
| Warm relaunch | Passes in the refreshed saved report | Repeat against the next recorded mobile candidate |
| Complete simulator matrix | 16/18 in report stamped 2026-10-19T12:00:51.380Z; earlier preserved copy 17/18 | Fresh complete run; retain picker-cancel/save failures and distinguish unit twins/deviations from native scenarios |
| Android and physical devices | Deferred scope | Separate gate and acceptance evidence |
| Version/workflow/publication | Not assigned | Independent version overlay, mobile-only workflow and explicit release instruction |

The desktop 2.5.x train does not include these rows. A new desktop main commit does not change their status.

## Preservation refresh — 2026-10-19

Thirteen source/evidence files changed in the original WIP after the initial copy. The independent copy had no divergent edits on those paths. Preserve both prior versions privately, then synchronize only those untouched copied paths. No runtime or raw simulator evidence is committed by this ledger update.

The report timestamp above is the runner's saved `_meta.startedAt` field, currently written at report completion; it is not a reliable run-start time. Failures: `V-MOB-06 picker-cancel-preserves-doc` and `V-MOB-13 save-file-formats`. The runner declares native-driven checks plus explicit V-MOB-15/17 unit twins and documented driver deviations. Current GRACE lint has one runner MODULE_MAP mismatch and 16 warnings; reconcile within this lane.

Raw captures can contain host paths and screenshots. Keep them local until sanitized and independently reviewed under the mandatory safety gate. Desktop main remains independent of this evidence refresh.
