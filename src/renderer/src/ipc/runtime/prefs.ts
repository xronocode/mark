// MODULE_CONTRACT
//   PURPOSE: M-005 frontend prefs facade. ipc.prefs.get/set/getAll +
//            workspace.set wrappers over typed ipcInvoke.
//   SCOPE:   loose-typed key/value access; renderer holds the schema.
//   DEPENDS: M-013-A contract.
//   LINKS:   .grace/graph/runtime.xml M-013 (PhaseRef Phase-B3) step-1.
//   STATUS:  Phase-B3 step-1 lite shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-1: initial facade.
//   - 2026-11-21 C-SESSION-WRITE-ATOMICITY: add the setMany batch wrapper —
//     the session profile goes to the backend as ONE mt_prefs_set_many
//     transaction (one mutex acquisition + one atomic save + one
//     broadcast). Raw @tauri-apps/api/core invoke per the mt_close_window
//     precedent: extending the typed M-013-A contract
//     (ipc/contract/types.ts) is out of this change's scope.

import { ipcInvoke } from '../contract'
import { invoke as rawInvoke } from '@tauri-apps/api/core'

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

  /**
   * C-SESSION-WRITE-ATOMICITY: apply a batch of prefs as ONE backend
   * transaction (one mutex acquisition + one atomic save + one
   * broadcast), so the persisted session profile is always one complete
   * generation. Raw invoke outside the typed M-013-A contract.
   */
  async setMany(entries: Array<{ key: string; value: unknown }>): Promise<void> {
    await rawInvoke('mt_prefs_set_many', { entries })
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
