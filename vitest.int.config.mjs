// FILE: vitest.int.config.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Keep historical C-71 verification commands portable through the canonical Vitest config.
//   SCOPE: Configuration re-export only; dependencies are installed within each worktree.
//   DEPENDS: vitest.config.ts.
//   LINKS: .grace/graph/features.xml M-046; C-DESKTOP-STABILIZATION T-003.
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
// START_MODULE_MAP
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 1.0.0 - 2026-10-19: replace the private worktree-only entry with a portable canonical config alias.
// END_CHANGE_SUMMARY
import config from './vitest.config.ts'
export default config
