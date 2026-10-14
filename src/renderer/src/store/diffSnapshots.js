// FILE: src/renderer/src/store/diffSnapshots.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: In-memory per-tab ring of pre-reload markdown snapshots so the diff view can show what an external save changed without a .before sidecar or git (C-43).
//   SCOPE: recordSnapshot (dedupe + 5-per-tab cap), latestSnapshot, snapshotCount, clearSnapshots, and a test-only reset. No disk writes, no IPC.
//   DEPENDS: none (plain module state).
//   LINKS: .grace/changes/active/C-43/spec.xml R-1/R-4; .grace/verification/runtime.xml V-M-011 scenario-39; consumed by store/editor.js APPLY_FILE_CHANGE paths and editorWithTabs/diffView.vue.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SNAPSHOT_LIMIT - max snapshots kept per tab (oldest dropped beyond it).
//   recordSnapshot - append { markdown, takenAt } to the tab's ring; no-op when the markdown equals the newest snapshot; caps the ring at SNAPSHOT_LIMIT.
//   latestSnapshot - shallow copy of the newest { markdown, takenAt } of the tab, or null.
//   snapshotCount - current ring size for the tab (0 when unknown).
//   clearSnapshots - drop the whole ring for one tab (tab close).
//   __resetDiffSnapshots - test-only: drop every ring.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 1.0.0 - 2026-10-15 C-43 S1: initial snapshot ring. Live reload's apply paths record the tab's pre-reload markdown; the ring follows the tab id through a sidebar rename and dies with the tab.
// END_CHANGE_SUMMARY

// C-43: snapshots are keyed by tab id, never by pathname — a sidebar
// rename (C-4 RENAME_IF_NEEDED) keeps the tab id, so the history follows
// the tab, while closing the tab drops it (R-4). Memory is bounded by
// SNAPSHOT_LIMIT per open tab; nothing is persisted to disk.
const snapshotsByTab = new Map()

export const SNAPSHOT_LIMIT = 5

// START_BLOCK_RECORD_SNAPSHOT
export function recordSnapshot(tabId, markdown, now = Date.now()) {
  if (!tabId || typeof markdown !== 'string') return
  let ring = snapshotsByTab.get(tabId)
  if (!ring) {
    ring = []
    snapshotsByTab.set(tabId, ring)
  }
  // Recording the content the tab already had just before the previous
  // reload would duplicate the newest snapshot — nothing changed.
  const newest = ring[ring.length - 1]
  if (newest && newest.markdown === markdown) return
  ring.push({ markdown, takenAt: now })
  if (ring.length > SNAPSHOT_LIMIT) {
    ring.splice(0, ring.length - SNAPSHOT_LIMIT)
  }
  console.debug(
    `[DiffSnapshots][record][BLOCK_SNAPSHOT_RECORDED tab=${tabId} size=${ring.length}]`
  )
}
// END_BLOCK_RECORD_SNAPSHOT

export function latestSnapshot(tabId) {
  const ring = snapshotsByTab.get(tabId)
  if (!ring || ring.length === 0) return null
  return { ...ring[ring.length - 1] }
}

export function snapshotCount(tabId) {
  return snapshotsByTab.get(tabId)?.length ?? 0
}

export function clearSnapshots(tabId) {
  snapshotsByTab.delete(tabId)
}

export function __resetDiffSnapshots() {
  snapshotsByTab.clear()
}
