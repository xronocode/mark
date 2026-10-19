# Mobile current queue

State: development, not frozen or authorized for publication. Product version and release date: unassigned. Source branch: `mobile/viewer-mvp`. Protocol: [Mobile delivery](README.md).

| Item | State | Next evidence |
|---|---|---|
| WIP preservation and lane split | Preserved locally | Source manifest and private recovery archive; no desktop release workflow delta |
| Rust library/test inventory | Implemented in WIP; review pending | Reconcile all moved tests and run the mobile backend harness |
| Simulator picker flow | Failing saved scenario | Correct fixture/driver/product boundary and rerun exact content/cancel checks |
| Save formats | Failing saved scenario | Resolve native save completion/driver timeout and verify actual output files |
| Warm relaunch | Failing saved scenario | Recover driver session and verify retained document state |
| Complete simulator matrix | 15/18 in last saved report | Fresh complete run; distinguish unit twins and native scenarios |
| Android and physical devices | Deferred scope | Separate gate and acceptance evidence |
| Version/workflow/publication | Not assigned | Independent version overlay, mobile-only workflow and explicit release instruction |

The desktop 2.5.x train does not include these rows. A new desktop main commit does not change their status.
