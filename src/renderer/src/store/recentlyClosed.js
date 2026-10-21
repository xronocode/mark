// FILE: src/renderer/src/store/recentlyClosed.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pinia store for the FIX-009 current-run "Recently closed"
//            tab history — a bounded, session-scoped (memory-only) list
//            of restorable saved-file tabs closed since this window
//            started, powering the tab-strip recovery button, the
//            welcome-screen recovery block and the ⇧⌘T chord.
//   SCOPE: RECORD_CLOSE (dedup-by-pathname to the newest close, bound
//          25), CONSUME on any open arrival, REOPEN_ONE / REOPEN_NEWEST /
//          REOPEN_ALL (deterministic strip order, active-tab metadata,
//          missing files dropped with a notice), CLEAR.
//   DEPENDS: pinia, ipc/runtime (ipcFs), services/notification,
//            i18n, bus-free (opening goes through the mt::open-file IPC
//            path exactly like every other open surface).
//   LINKS: store/editor.js FORCE_CLOSE_TAB (record funnel) and
//          bootstrap-ipc.js mt::open-new-tab (consume funnel);
//          components/editorWithTabs/tabs.vue (the popover renders inline — teleported past the strip clip; no separate popover module);
//          components/recent/index.vue; commands/index.js
//          file.reopen-closed-tab; .grace/changes/active/
//          C-FIX-009-RECENTLY-CLOSED; .grace/graph/runtime.xml M-011;
//          .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   RECENTLY_CLOSED_MAX - bound of retained entries (25).
//   useRecentlyClosedStore - Pinia store factory (state/getters/actions below).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-21 C-FIX-009-RECENTLY-CLOSED: initial
//     store. Memory-only by design — "clear it on the next cold launch"
//     holds by construction; nothing here persists.
// END_CHANGE_SUMMARY

import { defineStore } from 'pinia'
import { ipcFs } from '../ipc/runtime'
import notice from '../services/notification'
import i18n from '../i18n'

// Owner decision (2.5.x-next, FIX-009): the list is bounded. 25 keeps a
// long closing run recoverable while every operation stays trivially
// cheap and the popover scrolls.
export const RECENTLY_CLOSED_MAX = 25

// Entry shape: { pathname, filename, stripIndex, wasActive, root, closedAt }
// - stripIndex: the closed tab's position in the strip at close time —
//   REOPEN_ALL reopens in ascending order so the strip comes back the
//   way it was, regardless of the order the tabs were closed in.
// - wasActive: the tab was the selected one at close time; the newest
//   such entry becomes the active tab after Reopen all.
// - root: workspace root pathname the file sat under ('' when none) —
//   display metadata only; a removed root never blocks reopening.
const makeEntry = (input) => ({
  pathname: String(input.pathname || ''),
  filename: String(input.filename || ''),
  stripIndex: Number.isFinite(input.stripIndex) ? input.stripIndex : 0,
  wasActive: !!input.wasActive,
  root: String(input.root || ''),
  closedAt: Number.isFinite(input.closedAt) ? input.closedAt : Date.now()
})

export const useRecentlyClosedStore = defineStore('recentlyClosed', {
  state: () => ({
    // Newest close first (index 0 = ⇧⌘T's next candidate).
    entries: []
  }),

  getters: {
    count: (state) => state.entries.length,
    isEmpty: (state) => state.entries.length === 0,
    newest: (state) => state.entries[0] || null
  },

  actions: {
    // START_BLOCK_RECORD_CLOSE
    // Dedup rule (owner): a repeatedly closed pathname keeps only its
    // NEWEST entry — the older close is replaced, not stacked. Newest
    // stays at the head so ⇧⌘T and the popover always lead with the
    // most recent close.
    RECORD_CLOSE(input) {
      const entry = makeEntry(input)
      if (!entry.pathname) return
      this.entries = [entry, ...this.entries.filter((e) => e.pathname !== entry.pathname)]
        .slice(0, RECENTLY_CLOSED_MAX)
    },
    // END_BLOCK_RECORD_CLOSE

    // Any open path (popover, ⇧⌘T, Reopen all, Recent files, dialog,
    // drag-drop, clipboard) lands in mt::open-new-tab; consuming there
    // makes the entry vanish from every surface reactively.
    CONSUME(pathname) {
      if (!pathname) return
      this.entries = this.entries.filter((e) => e.pathname !== pathname)
    },

    CLEAR() {
      this.entries = []
    },

    // START_BLOCK_REOPEN_ONE
    // Missing-file handling: stat first; a gone file drops its entry
    // with a localized notice naming it and reports false — never a
    // silent no-op. The entry is consumed only after a successful open
    // request, so a failed invoke keeps it recoverable.
    async REOPEN_ONE(entry) {
      if (!entry?.pathname) return false
      let exists = false
      try {
        const stat = await ipcFs.stat(entry.pathname)
        exists = !!(stat && stat.isFile)
      } catch {
        exists = false
      }
      if (!exists) {
        this.CONSUME(entry.pathname)
        notice.notify({
          title: i18n.global.t('recent.recentlyClosed.title'),
          message: i18n.global.t('recent.recentlyClosed.missingNotice', { name: entry.filename || entry.pathname }),
          type: 'warning',
          time: 6000,
          showConfirm: false
        })
        console.info(
          // Basename only in markers — the repo logging convention keeps
          // full paths out of the console (bootstrap-ipc's
          // BLOCK_NEW_TAB_RECEIVED does the same).
          `[RecentlyClosed][REOPEN_ONE][BLOCK_REOPEN_MISSING] file=${entry.filename || entry.pathname.split('/').pop()}`
        )
        return false
      }
      try {
        await window.electron.ipcRenderer.invoke('mt::open-file', entry.pathname, {})
      } catch (e) {
        console.warn('[RecentlyClosed][REOPEN_ONE][BLOCK_REOPEN_FAILED]', e)
        return false
      }
      this.CONSUME(entry.pathname)
      return true
    },
    // END_BLOCK_REOPEN_ONE

    REOPEN_NEWEST() {
      if (this.isEmpty) return Promise.resolve(false)
      return this.REOPEN_ONE(this.newest)
    },

    // START_BLOCK_REOPEN_ALL
    // Deterministic order (owner): reopen in ascending recorded strip
    // order. After every file lands, the newest entry that was the
    // active tab at its close time is re-selected through the bus
    // ('mt::recently-closed-select' → store/editor waits for the tab
    // and selects it, same shape as RESTORE_SESSION's active handling);
    // the bus keeps this store free of an editor-store import cycle.
    // Missing files drop with one combined notice and the rest still
    // reopen.
    async REOPEN_ALL() {
      if (this.isEmpty) return { reopened: 0, missing: 0 }
      const ordered = [...this.entries].sort((a, b) => a.stripIndex - b.stripIndex)
      // A successful stat is not enough: only isFile===true entries are
      // openable documents (a directory would pass a bare stat).
      const stats = await Promise.all(
        ordered.map((e) => ipcFs.stat(e.pathname).then((st) => !!(st && st.isFile)).catch(() => false))
      )
      const live = ordered.filter((_, i) => stats[i])
      const missingEntries = ordered.filter((_, i) => !stats[i])
      const missing = missingEntries.length
      // Missing files are dropped up front: a path that is gone has
      // nothing left to recover, so it must not linger in the list.
      for (const entry of missingEntries) this.CONSUME(entry.pathname)
      let reopenedCount = 0
      let lastSuccess = null
      let activeSuccess = null
      for (const entry of live) {
        try {
          await window.electron.ipcRenderer.invoke('mt::open-file', entry.pathname, {})
        } catch (e) {
          console.warn('[RecentlyClosed][REOPEN_ALL][BLOCK_REOPEN_FAILED]', e)
          continue
        }
        reopenedCount++
        lastSuccess = entry
        // The rightmost was-active entry among SUCCESSES wins (the
        // ascending strip-order loop overwrites, keeping the highest
        // strip index): the selection request must never name a tab
        // that failed to open (review wave 2). Deterministic fallback:
        // the last successfully reopened entry.
        if (entry.wasActive) activeSuccess = entry
        this.CONSUME(entry.pathname)
      }
      const activeTarget = activeSuccess || lastSuccess
      if (activeTarget) {
        const { default: bus } = await import('../bus')
        bus.emit('mt::recently-closed-select', { pathname: activeTarget.pathname })
      }
      if (missing > 0) {
        notice.notify({
          title: i18n.global.t('recent.recentlyClosed.title'),
          message: i18n.global.t('recent.recentlyClosed.someMissingNotice', { count: missing }),
          type: 'warning',
          time: 6000,
          showConfirm: false
        })
      }
      console.info(
        `[RecentlyClosed][REOPEN_ALL][BLOCK_REOPEN_ALL] reopened=${reopenedCount} missing=${missing}` +
          (activeTarget ? ` active=${activeTarget.filename || activeTarget.pathname.split('/').pop()}` : '')
      )
      return { reopened: reopenedCount, missing, active: activeTarget?.pathname || null }
    }
    // END_BLOCK_REOPEN_ALL
  }
})
