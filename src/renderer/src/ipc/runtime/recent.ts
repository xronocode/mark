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
//   - 2026-10-15 C-46: remove(path) → old index (null when absent) and
//     insert(path, index) so the welcome-screen Undo toast can restore
//     the exact previous order.
//   - 2026-04-29 B3-step-8: initial facade.

import { ipcInvoke } from '../contract'

export const ipcRecent = {
  add(path: string): Promise<void> {
    return ipcInvoke('mt::recent::add', { path })
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
