// MODULE_CONTRACT
//   PURPOSE: M-013b frontend facade for filesystem commands. Thin
//            ergonomic wrappers over typed ipcInvoke that mirror v1.2.3's
//            window.fileUtils.* API surface so renderer code from
//            mark-electron transfers without rewrites (variant-(a)
//            port decision).
//   SCOPE:   read / write / stat / readdir / unlink. Watcher → watch.ts;
//            search → search.ts.
//   DEPENDS: M-013a contract (ipcInvoke + types).
//   LINKS:   docs/development-plan.xml Phase-B2 step-5;
//            v1.2.3 src/preload/index.js fileUtilsAPI for the API
//            shape M-013b emulates.
//   STATUS:  Phase-B2 step-5 shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-5: initial facade.

import { ipcInvoke, type FsStat } from '../contract'

export const ipcFs = {
  /** Read a UTF-8 file. v1 equivalent: window.fileUtils.readFile(path, 'utf8'). */
  read(path: string): Promise<string> {
    return ipcInvoke('mt::fs::read', { path })
  },

  /** Write a UTF-8 string to a file. Creates parents if missing. */
  write(path: string, content: string): Promise<void> {
    return ipcInvoke('mt::fs::write', { path, content })
  },

  /**
   * Plain JSON-cloneable file stats. Mirrors v1.2.3's contextBridge
   * shape: { size, mode, mtimeMs, isFile, isDirectory, isSymbolicLink }.
   * Symlinks themselves report isSymbolicLink (NOT their target).
   */
  stat(path: string): Promise<FsStat> {
    return ipcInvoke('mt::fs::stat', { path })
  },

  /** List directory entry NAMES (not full paths). Sorted. */
  readdir(path: string): Promise<string[]> {
    return ipcInvoke('mt::fs::readdir', { path })
  },

  /** Delete a file. Refuses directories. */
  unlink(path: string): Promise<void> {
    return ipcInvoke('mt::fs::unlink', { path })
  }
}

export type IpcFs = typeof ipcFs
