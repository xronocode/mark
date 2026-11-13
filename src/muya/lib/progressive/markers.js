// FILE: src/muya/lib/progressive/markers.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Content-free open-path telemetry marker names for the progressive
//            mount subsystem (C-LARGE-DOC-WAVE-A T-003, R-3). The names are the
//            stable contract between muya and its consumers (bench driver,
//            editor.vue in later tasks); payloads carry ONLY counters and
//            enums — never document text.
//   SCOPE: The three event-name constants and their payload shapes:
//            BLOCK_MOUNT_SERVED      { served: 'progressive' | 'legacy' }
//            BLOCK_SYNC_REGION_DONE  { blocks: Number }
//            BLOCK_TAIL_MOUNT_DONE   { blocks: Number, ms: Number }
//   DEPENDS: none (leaf module — imported by ./index and re-exported through
//            muya/lib/index.js so the names live on muya's public surface).
//   LINKS: .grace/changes/archive/C-LARGE-DOC-WAVE-A (spec R-3; plan T-003);
//          M-063 graph routing lands with T-008; V-M-063 scenarios reference
//          these marker names.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   BLOCK_MOUNT_SERVED - content-free marker: which path served an open (payload { served: 'progressive' | 'legacy' }); dispatched exactly once per served open and the fallback always records 'legacy'.
//   BLOCK_SYNC_REGION_DONE - content-free marker: the synchronous region finished mounting (payload { blocks }).
//   BLOCK_TAIL_MOUNT_DONE - content-free marker: the whole document is mounted (payload { blocks, ms }).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-11-02 - C-LARGE-DOC-WAVE-A T-003: initial
//                 marker-name module (content-free telemetry contract).]
// END_CHANGE_SUMMARY

export const BLOCK_MOUNT_SERVED = 'BLOCK_MOUNT_SERVED'
export const BLOCK_SYNC_REGION_DONE = 'BLOCK_SYNC_REGION_DONE'
export const BLOCK_TAIL_MOUNT_DONE = 'BLOCK_TAIL_MOUNT_DONE'
