// MODULE_CONTRACT
//   PURPOSE: M-017 frontend recent-docs facade. add/list/clear plus the
//            C-46 welcome screen remove/insert-at pair over typed
//            ipcInvoke; bounded list (10 items, dedupe-by-path,
//            most-recent-first) is enforced backend-side.
//   SCOPE:   thin wrappers; no per-platform OS integration.
//   DEPENDS: M-013-A contract.
//   LINKS:   docs/development-plan.xml Phase-B3 step-8;
//            .grace/changes/archive/C-46 (welcome screen remove + undo).
//
// CHANGE_SUMMARY:
//   - 2026-11-23 C-RECENTS-SERIALIZE: add serializes behind ONE
//     module-local chained-promise queue (addQueue, the
//     serializedStoreMutation shape of util/filePositionStore.js owned
//     module-locally) — each mt::recent::add invoke completes before
//     the next begins, per-caller results and errors propagate
//     unchanged to each caller, and a rejection fails only its own
//     caller while the queue tail swallows it to stay alive and keep
//     serializing; list/clear/remove/insert stay unqueued and
//     byte-identical. (No VERSION line exists in this file — recorded
//     fact.)
//   - 2026-10-15 C-46: remove(path) → old index (null when absent) and
//     insert(path, index) so the welcome-screen Undo toast can restore
//     the exact previous order.
//   - 2026-04-29 B3-step-8: initial facade.

import { ipcInvoke } from '../contract'

// C-RECENTS-SERIALIZE: one queue for every add — save-all and
// reopen-all burst concurrent adds at the backend, where overlapping
// read-modify-writes used to erase each other's insert; the facade
// owns the discipline so the fire-and-forget call sites stay
// byte-identical. Chained promises preserve per-caller results while
// composing the writes; the tail swallows rejections to stay alive.
let addQueue: Promise<unknown> = Promise.resolve()
const serializeAdd = <T>(run: () => Promise<T>): Promise<T> => {
  const next = addQueue.then(run, run)
  addQueue = next.then(
    () => {},
    () => {}
  )
  return next
}

export const ipcRecent = {
  add(path: string): Promise<void> {
    return serializeAdd(() => ipcInvoke('mt::recent::add', { path }))
  },
  list(): Promise<string[]> {
    return ipcInvoke('mt::recent::list', {})
  },
  clear(): Promise<void> {
    return ipcInvoke('mt::recent::clear', {})
  },
  remove(path: string): Promise<number | null> {
    return ipcInvoke('mt::recent::remove', { path })
  },
  insert(path: string, index: number): Promise<void> {
    return ipcInvoke('mt::recent::insert', { path, index })
  }
}

export type IpcRecent = typeof ipcRecent
