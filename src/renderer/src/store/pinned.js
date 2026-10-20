// FILE: src/renderer/src/store/pinned.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pinia store for the Pinned sidebar section (C-51 T-002) — a persisted, user-ordered list of absolute file paths pinned from the tree or tab context menu.
//   SCOPE: pinnedFiles state, isPinned getter, LOAD_PINNED_FILES hydration, PIN_FILE / UNPIN_FILE / TOGGLE_PIN mutations, MOVE_PINNED drag reorder; persistence through ipcPrefs key `pinnedFiles`.
//   DEPENDS: pinia, ipc/runtime (ipcPrefs).
//   LINKS: components/sideBar/fileSections.vue; contextMenu/sideBar + contextMenu/tabs (pin/unpin items); store/project.js SIDEBAR::pin-file; .grace/changes/archive/C-51 T-002; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PINNED_FILES_KEY - the ipcPrefs persistence key ('pinnedFiles').
//   usePinnedStore - Pinia store factory (state/getters/actions below).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-002: initial store. New pins
//   append at the end of the list (drag to reorder); paths are stored
//   verbatim (absolute, as pinned) and sanitized on load.
// END_CHANGE_SUMMARY

import { defineStore } from 'pinia'
import { ipcPrefs } from '../ipc/runtime'

export const PINNED_FILES_KEY = 'pinnedFiles'

// Stored shape: string[] of absolute paths. Anything else (older/corrupt
// data) collapses to an empty list; duplicates drop while keeping the
// first occurrence so a pinned path never renders twice.
const sanitizePinnedList = (raw) => {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry) continue
    if (seen.has(entry)) continue
    seen.add(entry)
    out.push(entry)
  }
  return out
}

export const usePinnedStore = defineStore('pinned', {
  state: () => ({
    pinnedFiles: []
  }),

  getters: {
    isPinned: (state) => (pathname) =>
      typeof pathname === 'string' && state.pinnedFiles.includes(pathname)
  },

  actions: {
    async LOAD_PINNED_FILES() {
      try {
        const raw = await ipcPrefs.get(PINNED_FILES_KEY)
        this.pinnedFiles = sanitizePinnedList(raw)
      } catch (e) {
        // Absent key / degraded IPC → keep current state (empty on boot).
        console.debug('[PinnedStore][LOAD_PINNED_FILES][BLOCK_LOAD_FAILED]', e)
      }
      return this.pinnedFiles
    },

    async _persist() {
      try {
        await ipcPrefs.set(PINNED_FILES_KEY, [...this.pinnedFiles])
      } catch (e) {
        // In-memory state already mutated; persistence retries on the
        // next pin/unpin/reorder.
        console.error('[PinnedStore][_persist][BLOCK_PERSIST_FAILED]', e)
      }
    },

    async PIN_FILE(pathname) {
      if (typeof pathname !== 'string' || !pathname) return false
      if (this.pinnedFiles.includes(pathname)) return false
      this.pinnedFiles.push(pathname)
      await this._persist()
      console.debug(
        `[PinnedStore][PIN_FILE][BLOCK_PINNED path=${pathname} total=${this.pinnedFiles.length}]`
      )
      return true
    },

    async UNPIN_FILE(pathname) {
      const idx = this.pinnedFiles.indexOf(pathname)
      if (idx === -1) return false
      this.pinnedFiles.splice(idx, 1)
      await this._persist()
      console.debug(
        `[PinnedStore][UNPIN_FILE][BLOCK_UNPINNED path=${pathname} total=${this.pinnedFiles.length}]`
      )
      return true
    },

    async TOGGLE_PIN(pathname) {
      if (this.pinnedFiles.includes(pathname)) {
        return !(await this.UNPIN_FILE(pathname))
      }
      await this.PIN_FILE(pathname)
      return true
    },

    // Drag-to-reorder inside the Pinned section: move the entry at `from`
    // to `to` (both indices into the current list). Out-of-range or
    // same-position calls are no-ops.
    async MOVE_PINNED({ from, to }) {
      const list = this.pinnedFiles
      if (
        !Number.isInteger(from) || !Number.isInteger(to) ||
        from < 0 || to < 0 || from >= list.length || to >= list.length ||
        from === to
      ) {
        return false
      }
      const [moved] = list.splice(from, 1)
      list.splice(to, 0, moved)
      await this._persist()
      console.debug(`[PinnedStore][MOVE_PINNED][BLOCK_REORDERED from=${from} to=${to}]`)
      return true
    }
  }
})
