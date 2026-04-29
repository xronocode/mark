// MODULE_CONTRACT
//   PURPOSE: M-017 frontend recent-docs facade. add/list/clear over
//            typed ipcInvoke; bounded list (10 items, dedupe-by-path,
//            most-recent-first) is enforced backend-side.
//   SCOPE:   thin wrappers; no per-platform OS integration.
//   DEPENDS: M-013a contract.
//   LINKS:   docs/development-plan.xml Phase-B3 step-8.
//   STATUS:  Phase-B3 step-8 shipped.
//
// CHANGE_SUMMARY:
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
  }
}

export type IpcRecent = typeof ipcRecent
