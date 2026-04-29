// MODULE_CONTRACT
//   PURPOSE: M-005 frontend prefs facade. ipc.prefs.get/set/getAll +
//            workspace.set wrappers over typed ipcInvoke.
//   SCOPE:   loose-typed key/value access; renderer holds the schema.
//   DEPENDS: M-013a contract.
//   LINKS:   docs/development-plan.xml Phase-B3 step-1.
//   STATUS:  Phase-B3 step-1 lite shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-1: initial facade.

import { ipcInvoke } from '../contract'

export const ipcPrefs = {
  /** Read a single pref. Returns null if key is absent. */
  async get<T = unknown>(key: string): Promise<T | null> {
    const v = await ipcInvoke('mt::prefs::get', { key })
    return v as T | null
  },

  /** Write a single pref. Persists synchronously to disk (atomic). */
  set(key: string, value: unknown): Promise<void> {
    return ipcInvoke('mt::prefs::set', { key, value })
  },

  /** Snapshot all prefs as an object. Useful for renderer bootstrap. */
  getAll(): Promise<Record<string, unknown>> {
    return ipcInvoke('mt::prefs::get_all', {})
  }
}

export const ipcWorkspace = {
  /**
   * Open a workspace folder. Backend validates path, updates the
   * SecurityCtx sandbox, and persists workspaceRoot to prefs. Subsequent
   * fs/search/watcher commands operate within this sandbox.
   */
  set(path: string): Promise<void> {
    return ipcInvoke('mt::workspace::set', { path })
  }
}

export type IpcPrefs = typeof ipcPrefs
export type IpcWorkspace = typeof ipcWorkspace
