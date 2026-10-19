// FILE: src/renderer/src/store/diffSnapshots.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: In-memory per-tab diff baselines — the C-43 ring of pre-reload snapshots plus the C-68 «opened» slot holding the last content loaded from disk — so ⌘D always has something to compare without a .before sidecar or git.
//   SCOPE: recordSnapshot (dedupe + 5-per-tab cap), recordOpenedSnapshot (single replaceable slot), latestSnapshot, openedSnapshot, snapshotCount, clearSnapshots (drops ring + slot), and a test-only reset. No disk writes, no IPC.
//   DEPENDS: none (plain module state).
//   LINKS: .grace/changes/archive/C-43/spec.xml R-1/R-4; .grace/changes/active/C-68/spec.xml R-1/R-2; .grace/verification/runtime.xml V-M-011 scenario-39/scenario-67; consumed by store/editor.js load paths (NEW_TAB_WITH_CONTENT, loadChange, APPLY_FILE_CHANGE) and editorWithTabs/diffView.vue.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SNAPSHOT_LIMIT - max ring snapshots kept per tab (oldest dropped beyond it); the opened slot is not counted and never evicted.
//   recordSnapshot - append { markdown, takenAt } to the tab's ring; no-op when the markdown equals the newest snapshot; caps the ring at SNAPSHOT_LIMIT.
//   recordOpenedSnapshot - set or replace the tab's single «opened» snapshot { markdown, takenAt, kind: 'opened' } (every disk load).
//   latestSnapshot - shallow copy of the newest { markdown, takenAt } of the tab's ring, or null.
//   openedSnapshot - shallow copy of the tab's «opened» snapshot, or null.
//   snapshotCount - current ring size for the tab (0 when unknown).
//   clearSnapshots - drop the ring AND the opened slot for one tab (tab close).
//   __resetDiffSnapshots - test-only: drop every ring and opened slot.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 1.1.0 - 2026-10-19 C-68 T-001: opened baseline slot. Every disk load (NEW_TAB_WITH_CONTENT for open/reopen/session restore, loadChange for external reloads) records the content it lands; diffView falls back to it after the external-change ring and the backend baseline. Slot and ring live in separate maps — neither evicts the other; both die with the tab.
//   1.0.0 - 2026-10-15 C-43 S1: initial snapshot ring. Live reload's apply paths record the tab's pre-reload markdown; the ring follows the tab id through a sidebar rename and dies with the tab.
// END_CHANGE_SUMMARY

// C-43: snapshots are keyed by tab id, never by pathname — a sidebar
// rename (C-4 RENAME_IF_NEEDED) keeps the tab id, so the history follows
// the tab, while closing the tab drops it (R-4). Memory is bounded by
// SNAPSHOT_LIMIT per open tab; nothing is persisted to disk.
const snapshotsByTab = new Map()

// C-68: the «opened» slot lives in its own map so the external-change
// ring can never evict it (and vice versa); both die with the tab through
// clearSnapshots. One entry per tab — every disk load replaces it, so it
// always mirrors «the content this tab last loaded from disk».
const openedByTab = new Map()

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

// START_BLOCK_RECORD_OPENED_SNAPSHOT
// C-68 R-1: the opened baseline. Unlike the ring there is exactly one
// slot per tab — a reload that lands the same content simply refreshes
// it (the slot answers «since the file was last loaded», not «since the
// content first appeared»).
export function recordOpenedSnapshot(tabId, markdown, now = Date.now()) {
  if (!tabId || typeof markdown !== 'string') return
  openedByTab.set(tabId, { markdown, takenAt: now, kind: 'opened' })
  console.debug(
    `[DiffSnapshots][recordOpened][BLOCK_OPENED_SNAPSHOT_RECORDED tab=${tabId}]`
  )
}
// END_BLOCK_RECORD_OPENED_SNAPSHOT

export function openedSnapshot(tabId) {
  const snap = openedByTab.get(tabId)
  return snap ? { ...snap } : null
}

export function snapshotCount(tabId) {
  return snapshotsByTab.get(tabId)?.length ?? 0
}

export function clearSnapshots(tabId) {
  snapshotsByTab.delete(tabId)
  openedByTab.delete(tabId)
}

export function __resetDiffSnapshots() {
  snapshotsByTab.clear()
  openedByTab.clear()
}
