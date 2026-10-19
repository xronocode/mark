# Mobile delivery protocol

The owner required mobile to be independent of desktop commits and releases on 2026-10-19. This lane uses `mobile/*` branches and a dedicated worktree. Desktop `main`, its release train, its six synchronized version fields, its `v*` tags, Homebrew and Mac App Store workflows are not mobile delivery state.

## Independent cadence

- Mobile keeps its own acceptance ledger, version choice, candidate commit, CI/test run and release decision. A desktop release neither starts nor blocks a mobile release; a mobile release neither bumps nor publishes desktop.
- Reserve `mobile/v*` for future mobile release tags and mobile-only workflow triggers. Do not use desktop `v*` tags or modify desktop publication workflows to deliver mobile. No mobile publication is authorized by the current preservation/protocol task.
- Before the first mobile release, define a mobile version overlay and artifact identity independent of desktop package/Cargo/Tauri versions. The inherited version on the current simulator WIP is historical build metadata, not the assigned mobile product version.
- Shared editor/backend source can be synchronized only as an explicit, tested source-integration task. Do not merge desktop release bookkeeping, store metadata or a release train automatically into this branch. Mobile changes reach desktop only through a separate reviewed shared-code task, never a wholesale mobile merge.
- The common commit/push safety hooks apply to both lanes. Every mobile commit and push requires the same exact-payload scan, two serial local-model reviews and identity recheck. GPU inference remains one engine and one loaded model. Shared safety tooling is infrastructure, not product-release coupling.

## Current preservation state

Branch: `mobile/viewer-mvp`. Runtime-equivalent public base: `1b331b78` (the original WIP followed two later documentation/comment-only commits). The existing mobile source/config/test layers were copied to this worktree; the original working directory and private recovery archives were retained. Desktop release/test workflow modifications and C-59 store material were not imported into this working delta.

Current mobile work is not declared complete. The latest saved simulator report has 15 passing and 3 failing scenarios: picker cancellation lookup, save outcome timeout and warm-relaunch driver connection. Two scenarios use unit twins rather than separate full simulator e2e. The runner's module map also needs reconciliation. These findings belong to mobile's own queue and do not block an unrelated desktop commit/release.

The dedicated mobile test workflow must be scoped to mobile branches/tags before a mobile candidate is published. Keep the backend library-split inventory check in the mobile test harness; do not depend on the desktop release workflow to test mobile. Generated simulator assets, signing material, driver logs and private raw evidence are not automatically publishable source files.

## Mobile task sequence

1. Preserve and inventory the current WIP; separate source from generated/private artifacts.
2. Review the Rust library split and reconcile moved backend tests by identity.
3. Resolve picker/save/relaunch failures, distinguishing product behavior from driver failures; retain precise cancellation/error outcomes.
4. Run the complete named simulator scenario set on a recorded artifact, with the remaining Android/device scope stated explicitly.
5. Record mobile-only owner acceptance and candidate checks in the ledger.
6. Assign and publish a mobile version only after a separate explicit release instruction.

Each task gets its own reviewed commit/integration within the mobile lane. Desktop task completion, version numbers or acceptance are never substitutes for these records.
