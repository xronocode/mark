// FILE: src/renderer/src/store/project.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The multi-root workspace store — the ordered projectTrees[] set
//            of folder roots with per-root watchers, and the single
//            OPEN_FOLDER(pathname, {mode, origin}) open-mode dispatcher every
//            folder surface routes through (picker, drag-drop, clipboard,
//            Recent, folder-switcher).
//   SCOPE: Root add/close (canonical dedup + nested/parent rejection), the
//          ask-mode chooser and replace dirty-guard pending states resolved
//          by workspaceModeDialog, watch-event translation into the tree
//          model (dot-entry parity with the Rust walk), recent-folders
//          persistence, sidebar context-menu bus handlers, create/rename.
//   DEPENDS: stores/editor (tabs, FORCE_CLOSE_TAB, APPLY_SAVE_OUTCOME),
//          stores/layout, stores/pinned, ipc/runtime (watch/fs/prefs),
//          services/notification, i18n, util/fileSystem, store/treeCtrl.
//   LINKS: .grace/graph/features.xml M-036; .grace/verification/features.xml
//          V-M-036; .grace/changes/active/C-MULTI-SOURCE-WORKSPACE;
//          components/sideBar/workspaceModeDialog.vue;
//          tests/renderer/store/project-workspace.test.ts,
//          project.test.ts, project-coverage.test.js;
//          tests/e2e/multi-root-workspace.spec.ts.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   findOwningRoot - longest contained-prefix root lookup, shared by the result owner label and the tab duplicate suffix
//   displayRootName - pretty sidebar label for a root path (cloud containers map to iCloud Drive / OneDrive)
//   isCloudStoragePath - true under ~/Library/CloudStorage or Mobile Documents (gates the online-files hint)
//   useProjectStore - the Pinia store: OPEN_FOLDER/RESOLVE_* dispatcher, ADD/CLOSE_PROJECT primitives, tree-event coalescer (ENQUEUE/FLUSH_TREE_EVENTS), watcher translation, recents, sidebar bus handlers
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-22 v2.2.0 C-MULTI-SOURCE-WORKSPACE fix wave (cloud
//     follow-up): walk events coalesce (ENQUEUE_TREE_EVENT / FLUSH_TREE_EVENTS
//     — a whole cloud drive froze the webview when ~30k events folded
//     one-by-one); cloud roots get pretty labels (displayRootName) and a
//     once-per-root online-files hint notice.
//   - 2026-10-22 v2.0.0 C-MULTI-SOURCE-WORKSPACE: OPEN_FOLDER dispatcher
//     (add/replace/ask) with the shared chooser + replace dirty-guard
//     replaces the C-52 always-replace OPEN_FOLDER_AS_WORKSPACE; watcher
//     gains dot-entry parity (iCloud placeholder hygiene); findOwningRoot
//     exported for owner labels. v1.1.0 Phase-A6 multi-root substrate and
//     the C-1 per-root watcher disposers are unchanged underneath.
// END_CHANGE_SUMMARY

import { defineStore } from 'pinia'
import { addFile, unlinkFile, addDirectory, unlinkDirectory } from './treeCtrl'
import bus from '../bus'
import { create, paste, rename } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { i18n } from '../i18n'
import { getFileStateFromData } from './help'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'
import { usePinnedStore } from './pinned'
import { ipcWatch, ipcFs, ipcPrefs } from '../ipc/runtime'

// C-51 notes:
//   - 2026-10-16 C-51 T-001: the watcher (create/modify) now adds every
//     file to the tree model with its isMarkdown flag — the same shape
//     as the initial Rust walk — so both event paths agree; the
//     Markdown-only display rule lives in store/treeFilter.js at the
//     render level (treeShowAllFiles preference restores everything).
//   - 2026-10-16 C-51 T-002: SIDEBAR::pin-file bus handler toggles the
//     active tree file in the persisted Pinned list (store/pinned).

// C-52 notes:
//   - 2026-10-16 C-52 T-001: OPEN_FOLDER_AS_WORKSPACE opens a folder as
//     the workspace REPLACING existing roots (user decision D-1) — the
//     clipboard-open resolver and the dropped-folder fix share it.
//   - 2026-10-22 C-MULTI-SOURCE-WORKSPACE: the always-replace C-52 routing
//     is superseded by the OPEN_FOLDER dispatcher (add/replace/ask) —
//     ambiguous surfaces (drop, clipboard, Recent, switcher) now ask, and
//     replace protects dirty tabs under removed roots before closing them.

// C-1 fix: per-root file-watcher disposers. Module-scoped (not in
// reactive state) so Pinia doesn't try to proxy the dispose closures.
// Keyed by canonical root pathname.
const watchDisposers = new Map()

const MAX_RECENT_FOLDERS = 5
const RECENT_FOLDERS_KEY = 'recentFolders'

async function _pushRecentFolder(pathname) {
  try {
    const raw = await ipcPrefs.get(RECENT_FOLDERS_KEY).catch(() => null)
    let list = Array.isArray(raw) ? raw.filter(Boolean) : []
    list = list.filter((p) => p !== pathname)
    list.unshift(pathname)
    if (list.length > MAX_RECENT_FOLDERS) list.length = MAX_RECENT_FOLDERS
    await ipcPrefs.set(RECENT_FOLDERS_KEY, list)
  } catch { /* best-effort */ }
}

// v1.1.0 Phase-A6: multi-root workspace.
// Replaces the legacy single `projectTree` object with `projectTrees: TreeRoot[]`.
// ADD_PROJECT enforces canonical-pathname dedup and nested-rejection; CLOSE_PROJECT
// emits `mt::close-project-root` IPC for main-process unwatch; _processTreeEvent
// dispatches by longest-prefix path-segment match (NOT raw startsWith).

const PENDING_BUCKET_LIMIT = 10000

// Tree-event coalescer tuning (START_BLOCK_TREE_EVENT_COALESCER): flush
// at most every 120 ms while events stream, or immediately once 400
// events pile up. A whole cloud drive (~30k entries) then folds in ~100
// batches instead of 30 000 individual reactive mutations.
const TREE_EVENT_COALESCE_MS = 120
const TREE_EVENT_COALESCE_LIMIT = 400
let treeEventQueue = []
let treeEventFlushTimer = null
// Cloud roots already hinted this session — the online-files notice
// shows once per root, not once per re-add.
const cloudHintShown = new Set()

const SKIP_DIR_SEGMENTS = new Set([
  'node_modules', 'target', 'dist', 'build', '.output', '__pycache__',
  'vendor', 'Pods', '.next', '.nuxt', 'out'
])

function isInsideSkippedDir(pathname) {
  const sep = PATH_SEPARATOR
  const parts = pathname.split(sep)
  for (let i = 1; i < parts.length - 1; i++) {
    if (SKIP_DIR_SEGMENTS.has(parts[i])) return true
  }
  return false
}

// Path-segment-aware containment check. Returns true if `inner` is contained
// inside `outer` (either equal or a child path), false otherwise.
//
//   isPathContained('/foo/bar', '/foo')      === true   (child)
//   isPathContained('/foo', '/foo')          === true   (equal)
//   isPathContained('/foobar', '/foo')       === false  (segment-boundary)
//   isPathContained('/foo/bar/x', '/foo')    === true
//   isPathContained('/other', '/foo')        === false
function isPathContained(inner, outer) {
  if (inner === outer) return true
  if (!inner.startsWith(outer)) return false
  // Char immediately after `outer` MUST be the path separator —
  // otherwise it's a prefix-string collision (e.g., /foo vs /foobar).
  return inner.charAt(outer.length) === PATH_SEPARATOR
}

// Find the root whose pathname is the longest contained prefix of the given
// path. Returns the root object or null. Exported since
// C-MULTI-SOURCE-WORKSPACE: search results and tab labels resolve their
// owning root through it.
export function findOwningRoot(roots, pathname) {
  let winner = null
  let winnerLen = -1
  for (const root of roots) {
    if (isPathContained(pathname, root.pathname) && root.pathname.length > winnerLen) {
      winner = root
      winnerLen = root.pathname.length
    }
  }
  return winner
}

function canonicalizePath(pathname) {
  // Normalize separators + remove redundant '..' segments + trailing slash
  // (except when pathname IS the separator). window.path.normalize handles
  // OS-specific quirks (forward vs back slashes on Windows).
  let p = window.path.normalize(pathname)
  if (p.length > 1 && p.endsWith(PATH_SEPARATOR)) {
    p = p.slice(0, -1)
  }
  return p
}

// START_BLOCK_CLOUD_ROOT_DISPLAY_NAME
// C-MULTI-SOURCE-WORKSPACE fix wave: cloud-storage roots carry machine
// names as their basename («iCloudDrive-iCloudDrive (26-2-26 21:13)»,
// «com~apple~CloudDocs», «OneDrive-Personal») — shown verbatim as the
// sidebar root label they read as garbage (owner acceptance 2026-10-22:
// «название уродское типа ком-эпл-КлаудДаунлоадс»). Map the known
// container patterns to their product names; everything else keeps the
// plain basename.
const CLOUD_ROOT_NAME_PATTERNS = [
  { re: /[\\/]iCloudDrive-[^\\/]+$/, name: 'iCloud Drive' },
  { re: /[\\/]com~apple~CloudDocs$/, name: 'iCloud Drive' },
  { re: /[\\/]OneDrive-[^\\/]+$/, name: 'OneDrive' }
]

export function displayRootName(canonicalPath) {
  for (const p of CLOUD_ROOT_NAME_PATTERNS) {
    if (p.re.test(canonicalPath)) return p.name
  }
  return window.path.basename(canonicalPath)
}

// True when the path sits under a macOS cloud-storage container — used
// to show the online-files hint notice once per added cloud root.
export function isCloudStoragePath(canonicalPath) {
  return (
    /[\\/]Library[\\/]CloudStorage[\\/]/.test(canonicalPath) ||
    /[\\/]Mobile Documents[\\/]/.test(canonicalPath)
  )
}
// END_BLOCK_CLOUD_ROOT_DISPLAY_NAME

export const useProjectStore = defineStore('project', {
  state: () => ({
    activeItem: {},
    createCache: {},
    newFileNameCache: '',
    renameCache: null,
    clipboard: null,
    // Multi-root: array of TreeRoot objects (one per opened folder).
    // Order is insertion order (oldest first).
    projectTrees: [],
    // Per-root buckets of tree events that arrived before the root was loaded.
    // Keyed by future canonical pathname; each bucket is a queue of {type, change}.
    pendingTreeEvents: {},
    // C-MULTI-SOURCE-WORKSPACE: ask-mode dispatcher state.
    // pendingFolderChoice — { pathname, origin } shown by workspaceModeDialog
    // (Add preselected / Replace / Cancel); pendingReplaceConfirm —
    // { pathname, origin, tabIds, dirtyIds } shown when a replace would
    // close roots owning dirty tabs (Save & Close / Don't Save / Cancel).
    pendingFolderChoice: null,
    pendingReplaceConfirm: null
  }),

  actions: {
    // START_BLOCK_TREE_EVENT_COALESCER
    // C-MULTI-SOURCE-WORKSPACE fix wave: walk events arrive one per file.
    // A whole cloud drive = tens of thousands of mt::update-object-tree
    // events; folding each into the tree synchronously meant tens of
    // thousands of reactive mutations + re-renders and the webview froze
    // for minutes (owner acceptance 2026-10-22: adding the OneDrive root
    // «зависает»). Buffer and fold in batches: flush at most every
    // COALESCE_MS, or immediately when COALESCE_LIMIT events pile up, so
    // a giant root lands in ~a hundred folds instead of thirty thousand.
    ENQUEUE_TREE_EVENT(event) {
      if (!event || typeof event !== 'object' || !event.type) return
      treeEventQueue.push(event)
      if (treeEventQueue.length >= TREE_EVENT_COALESCE_LIMIT) {
        this.FLUSH_TREE_EVENTS()
        return
      }
      if (treeEventFlushTimer === null) {
        treeEventFlushTimer = setTimeout(() => {
          treeEventFlushTimer = null
          this.FLUSH_TREE_EVENTS()
        }, TREE_EVENT_COALESCE_MS)
      }
    },

    FLUSH_TREE_EVENTS() {
      if (treeEventFlushTimer !== null) {
        clearTimeout(treeEventFlushTimer)
        treeEventFlushTimer = null
      }
      if (!treeEventQueue.length) return
      const batch = treeEventQueue.splice(0, treeEventQueue.length)
      // eslint-disable-next-line no-console
      console.debug(`[ProjectStore][TreeEvent][BLOCK_TREE_EVENT_BATCH] count=${batch.length}`)
      for (const event of batch) {
        this._processTreeEvent(event.type, event.change)
      }
    },
    // END_BLOCK_TREE_EVENT_COALESCER

    // Append a root tree for the given pathname unless it's already present
    // (canonical equality) or nested inside an existing root. Main process
    // also dedups (V-A6-6 BLOCK_DUPLICATE) — this is defense in depth and the
    // canonical entry-point for tests + non-IPC callers.
    ADD_PROJECT(pathname) {
      const layoutStore = useLayoutStore()
      const canonical = canonicalizePath(pathname)
      let name = displayRootName(canonical)
      if (!name) name = canonical

      // Dedup: exact canonical match.
      if (this.projectTrees.some((r) => r.pathname === canonical)) {
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][ADD_PROJECT][BLOCK_DEDUP] path=${canonical}`)
        // Surface to user instead of silent log; without this,
        // re-clicking Open Folder of an already-open root looked
        // identical to "picker dismissed" — impossible to tell apart.
        notice.notify({
          title: 'Folder already open',
          type: 'info',
          message: `"${canonical}" is already loaded in the sidebar.`
        })
        return
      }
      // Refuse nested inside an existing root (parent direction).
      const enclosing = this.projectTrees.find((r) => isPathContained(canonical, r.pathname) && r.pathname !== canonical)
      if (enclosing) {
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][ADD_PROJECT][BLOCK_NESTED] path=${canonical} parent=${enclosing.pathname}`)
        notice.notify({
          title: 'Folder already inside an open root',
          type: 'warning',
          message: `"${canonical}" is nested under the already-opened folder "${enclosing.pathname}".`
        })
        return
      }
      // Refuse reverse-nested (candidate is parent of an existing root).
      const child = this.projectTrees.find((r) => isPathContained(r.pathname, canonical) && r.pathname !== canonical)
      if (child) {
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][ADD_PROJECT][BLOCK_NESTED] path=${canonical} child=${child.pathname}`)
        notice.notify({
          title: 'Folder contains an already-opened sub-folder',
          type: 'warning',
          message: `"${canonical}" contains the already-opened folder "${child.pathname}". Close the inner folder first.`
        })
        return
      }

      const root = {
        pathname: canonical,
        name,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
      this.projectTrees.push(root)
      _pushRecentFolder(canonical)
      // eslint-disable-next-line no-console
      console.debug(`[ProjectStore][ADD_PROJECT][APPEND] path=${canonical} total=${this.projectTrees.length}`)

      // C-MULTI-SOURCE-WORKSPACE fix wave (owner request 2026-10-22):
      // a cloud-storage root may carry online-only files that the walk
      // cannot show yet (iCloud evicted placeholders are dot-entries and
      // stay hidden; OneDrive online-only files materialize on demand).
      // One hint bubble per cloud root per session — visible honesty
      // instead of a silently shorter tree.
      if (isCloudStoragePath(canonical) && !cloudHintShown.has(canonical)) {
        cloudHintShown.add(canonical)
        notice.notify({
          title: i18n.global.t('workspace.cloudRootHintTitle'),
          type: 'info',
          message: i18n.global.t('workspace.cloudRootHint'),
          time: 8000,
          showConfirm: false
        })
      }

      // Layout: ensure sidebar shows Files when first root is opened.
      const layout = {
        rightColumn: 'files',
        showSideBar: true,
        showTabBar: true
      }
      layoutStore.SET_LAYOUT(layout)
      layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()

      // Drain pending events for this exact root pathname.
      const bucket = this.pendingTreeEvents[canonical]
      if (bucket && bucket.length) {
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][TreeEvent][REPLAY] root=${canonical} count=${bucket.length}`)
        for (const event of bucket) {
          this._processTreeEvent(event.type, event.change)
        }
        delete this.pendingTreeEvents[canonical]
      }

      // C-1 fix: subscribe the file-watcher for this root. Backend
      // emits debounced WatchEvents on mt::watch::event; the handler
      // translates them into tree-update events and open-tab change
      // notifications. Dispose on CLOSE_PROJECT.
      // C-2: manual listener — this is a store-scope subscription (no
      // component to unmount); disposal is owned by CLOSE_PROJECT.
      ipcWatch
        .subscribe(canonical, (event) => this._handleWatchEvent(canonical, event), {
          listener: { manual: true }
        })
        .then((dispose) => {
          watchDisposers.set(canonical, dispose)
          // eslint-disable-next-line no-console
          console.debug(`[ProjectStore][Watcher][SUBSCRIBED] root=${canonical}`)
        })
        .catch((e) => {
          console.error(`[ProjectStore][Watcher][SUBSCRIBE_FAILED] root=${canonical}`, e)
        })
    },

    /**
     * C-1 fix: translate a backend WatchEvent (notify-debouncer-full
     * shape) into v1.2.3-style tree events + open-tab notifications.
     *
     *   WatchEvent { subscriptionId, kind: "create"|"modify"|"remove"
     *                                       |"access"|"other"|"any",
     *                paths: string[] }
     *
     * notify cannot tell file-vs-dir on "remove" (path is gone), so
     * for removes we dispatch BOTH unlink and unlinkDir — treeCtrl's
     * helpers no-op when the path isn't present in either set.
     */
    async _handleWatchEvent(rootPath, event) {
      const { kind, paths } = event || {}
      if (!Array.isArray(paths) || paths.length === 0) return
      const editorStore = useEditorStore()
      for (const path of paths) {
        // Defensive scope check (backend already filters by sandbox).
        if (!isPathContained(path, rootPath)) continue
        if (isInsideSkippedDir(path)) continue
        // C-MULTI-SOURCE-WORKSPACE: dot-prefixed entries never join the
        // tree model — parity with the Rust walk (m_v1_compat.rs skips
        // names starting with "."), which also keeps iCloud eviction
        // placeholders (`.Name.md.icloud`) out of the sidebar. Open-tab
        // notifications still fire so a tab on a hidden file learns about
        // its changes/removal.
        const baseName = window.path.basename(path)
        const hiddenEntry = typeof baseName === 'string' && baseName.startsWith('.')
        if (hiddenEntry) {
          // eslint-disable-next-line no-console
          console.debug(`[ProjectStore][Watcher][BLOCK_HIDDEN_ENTRY] path=${path}`)
        }
        switch (kind) {
          case 'create': {
            if (hiddenEntry) break
            try {
              const stat = await ipcFs.stat(path)
              if (stat.isDirectory) {
                this._processTreeEvent('addDir', { pathname: path })
              } else if (stat.isFile) {
                // C-51 T-001: every file joins the model with its
                // isMarkdown flag — same shape as the initial walk — and
                // the tree view (store/treeFilter.js) applies the
                // Markdown-only rule at render time, so both paths agree.
                this._processTreeEvent('add', {
                  pathname: path,
                  name: window.path.basename(path),
                  isFile: true,
                  isDirectory: false,
                  isMarkdown: !!window.fileUtils?.hasMarkdownExtension(path),
                  birthTime: stat.mtimeMs
                })
                if (this._tabExists(editorStore, path)) {
                  editorStore.APPLY_FILE_CHANGE('add', { pathname: path })
                }
              }
            } catch (e) {
              // stat may race the create event on fast churn; log and
              // drop. Next debouncer tick will catch the steady state.
              console.debug(`[ProjectStore][Watcher][STAT_FAILED] path=${path}`, e)
            }
            break
          }
          case 'modify': {
            // macOS reports both halves of a rename (sidebar rename, `mv`)
            // as Modify(Name) → 'modify', never create/remove: the gone
            // path leaves the tree and the new one joins it. A plain
            // content modify only notifies the open tab (v1.2.3 'change').
            let stat = null
            try {
              stat = await ipcFs.stat(path)
            } catch (e) {
              // IpcError keeps the backend's structured error as `cause`.
              if (e?.cause?.code === 'MT_FS_NOT_FOUND') {
                console.debug(`[ProjectStore][Watcher][BLOCK_RENAME_SOURCE_GONE] path=${path}`)
                if (!hiddenEntry) {
                  this._processTreeEvent('unlink', { pathname: path })
                  this._processTreeEvent('unlinkDir', { pathname: path })
                }
                if (this._tabExists(editorStore, path)) {
                  editorStore.APPLY_FILE_CHANGE('unlink', { pathname: path })
                }
                break
              }
              console.debug(`[ProjectStore][Watcher][STAT_FAILED] path=${path}`, e)
            }
            if (hiddenEntry) {
              // Tree never held it; the open tab (if any) still learns.
              if (this._tabExists(editorStore, path)) {
                editorStore.APPLY_FILE_CHANGE('change', { pathname: path })
              }
              break
            }
            if (stat?.isDirectory) {
              this._processTreeEvent('addDir', { pathname: path })
            } else if (stat?.isFile) {
              // C-51 T-001: all files (not only Markdown) join the model,
              // matching the initial walk; the view filter hides non-
              // Markdown unless treeShowAllFiles is on. addFile dedupes by
              // name, so a content modify is a no-op here.
              this._processTreeEvent('add', {
                pathname: path,
                name: window.path.basename(path),
                isFile: true,
                isDirectory: false,
                isMarkdown: !!window.fileUtils?.hasMarkdownExtension(path),
                birthTime: stat.mtimeMs
              })
            }
            if (this._tabExists(editorStore, path)) {
              editorStore.APPLY_FILE_CHANGE('change', { pathname: path })
            }
            break
          }
          case 'remove': {
            if (!hiddenEntry) {
              this._processTreeEvent('unlink', { pathname: path })
              this._processTreeEvent('unlinkDir', { pathname: path })
            }
            if (this._tabExists(editorStore, path)) {
              editorStore.APPLY_FILE_CHANGE('unlink', { pathname: path })
            }
            break
          }
          // 'access' | 'other' | 'any' — not actionable in v1 semantics.
          default:
            break
        }
      }
    },

    _tabExists(editorStore, path) {
      const tabs = editorStore?.tabs
      if (!Array.isArray(tabs)) return false
      return tabs.some((t) => window.fileUtils?.isSamePathSync?.(t.pathname, path))
    },

    _processTreeEvent(type, change) {
      const editorStore = useEditorStore()
      const targetPath = change?.pathname
      if (!targetPath) {
        return
      }
      const owner = findOwningRoot(this.projectTrees, targetPath)
      if (!owner) {
        // No matching loaded root — try to buffer for a future root that might match.
        // Buffer key is the closest containing pathname we can guess from `change.pathname`'s
        // dirname chain; in practice main only emits events under roots it watches, so this
        // path is rare. Drop with a marker to keep the unbounded-bucket risk capped.
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][TreeEvent][DROPPED_NO_ROOT] type=${type} path=${targetPath}`)
        return
      }
      // eslint-disable-next-line no-console
      console.debug(`[ProjectStore][TreeEvent][ROUTED] root=${owner.pathname} type=${type} path=${targetPath}`)
      switch (type) {
        case 'add': {
          const { pathname, data, isMarkdown } = change
          addFile(owner, change)
          if (isMarkdown && this.newFileNameCache && pathname === this.newFileNameCache) {
            const fileState = getFileStateFromData(data)
            editorStore.UPDATE_CURRENT_FILE(fileState)
            this.newFileNameCache = ''
          }
          break
        }
        case 'unlink':
          unlinkFile(owner, change)
          editorStore.SET_SAVE_STATUS_WHEN_REMOVE(change)
          break
        case 'addDir':
          addDirectory(owner, change)
          break
        case 'unlinkDir':
          unlinkDirectory(owner, change)
          break
        case 'change':
          break
        default:
          // step-8c: process.env.NODE_ENV === 'development' →
          // import.meta.env.DEV (Vite compile-time constant).
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log(`Unknown directory watch type: "${type}"`)
          }
          break
      }
    },

    CHANGE_ACTIVE_ITEM(activeItem) {
      this.activeItem = activeItem
    },

    CHANGE_CLIPBOARD(data) {
      this.clipboard = data
    },

    /**
     * Pick folder via direct invoke. Backend opens native picker and
     * returns Option<String>; on Some we route through OPEN_FOLDER.
     * `mode` follows the dispatcher vocabulary: 'add' (explicit Add
     * Folder…), 'replace' (explicit Replace Workspace…), 'ask' (default —
     * sidebar switcher / welcome: direct add with no roots open, chooser
     * otherwise). On None (user cancelled) silent no-op.
     */
    async ASK_FOR_OPEN_PROJECT(mode = 'ask') {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await invoke('mt_pick_folder')
        if (path) {
          await this.OPEN_FOLDER(path, { mode, origin: 'picker' })
        }
        console.log(`[ipc][pick_folder][BLOCK_INVOKE_OK chosen=${!!path}]`)
      } catch (e) {
        console.error('[ipc][pick_folder][BLOCK_INVOKE_FAILED]', e)
        notice.notify({
          title: 'Open Folder failed',
          type: 'error',
          message: String(e)
        })
      }
    },

    async GET_RECENT_FOLDERS() {
      try {
        const raw = await ipcPrefs.get(RECENT_FOLDERS_KEY)
        return Array.isArray(raw) ? raw.filter(Boolean).slice(0, MAX_RECENT_FOLDERS) : []
      } catch {
        return []
      }
    },

    // C-46 welcome screen: replace the stored recent-folders list in one
    // write (used by "Remove from list" with the filtered array and by the
    // 5s Undo toast with the pre-remove snapshot so exact order returns).
    // Returns the sanitized list that was persisted, or [] on failure.
    async SET_RECENT_FOLDERS(list) {
      const clean = Array.isArray(list)
        ? list.filter((p) => typeof p === 'string' && p).slice(0, MAX_RECENT_FOLDERS)
        : []
      try {
        await ipcPrefs.set(RECENT_FOLDERS_KEY, clean)
        return clean
      } catch {
        return []
      }
    },

    // Add-semantics open used by session restore (the saved root set is
    // restored as-is — never a replace). User-facing Recent-folder rows
    // route through OPEN_FOLDER ask-mode instead (C-MULTI-SOURCE-WORKSPACE).
    async OPEN_RECENT_FOLDER(pathname) {
      await this._openFolderAdd(pathname, 'session-restore')
    },

    // START_BLOCK_OPEN_FOLDER_DISPATCHER
    // C-MULTI-SOURCE-WORKSPACE: the single open-mode API every folder
    // surface routes through (picker, drop, clipboard, Recent, switcher).
    //   mode 'add'     — append (ADD_PROJECT keeps dedup/nested rejection).
    //   mode 'replace' — close foreign roots (dirty-guarded) and open.
    //   mode 'ask'     — add when no roots are open; otherwise park the
    //                    choice in pendingFolderChoice for workspaceModeDialog
    //                    (Add preselected as the safe default).
    async OPEN_FOLDER(pathname, opts = {}) {
      if (typeof pathname !== 'string' || !pathname) return
      const mode = opts.mode || 'ask'
      const origin = opts.origin || 'unknown'
      if (mode === 'ask' && this.projectTrees.length > 0) {
        this.pendingFolderChoice = { pathname, origin }
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][OPEN_FOLDER][BLOCK_CHOOSER_PENDING] origin=${origin} path=${canonicalizePath(pathname)}`)
        return
      }
      const resolved = mode === 'ask' ? 'add' : mode
      if (resolved === 'replace') {
        await this._replaceWorkspace(pathname, origin)
      } else {
        await this._openFolderAdd(pathname, origin)
      }
      console.info(
        `[ProjectStore][OPEN_FOLDER][BLOCK_OPEN_FOLDER_RESOLVED mode=${resolved} origin=${origin} path=${canonicalizePath(pathname)}]`
      )
    },
    // END_BLOCK_OPEN_FOLDER_DISPATCHER

    // START_BLOCK_FOLDER_CHOICE_RESOLUTION
    // workspaceModeDialog calls these. Cancel discards the pending input
    // with zero mutations (corner: roots, tabs and dirty flags untouched).
    async RESOLVE_FOLDER_CHOICE(action) {
      const pending = this.pendingFolderChoice
      this.pendingFolderChoice = null
      if (!pending) return
      if (action === 'cancel') {
        console.info(`[ProjectStore][OPEN_FOLDER][BLOCK_OPEN_FOLDER_CANCELLED] origin=${pending.origin} path=${canonicalizePath(pending.pathname)}`)
        return
      }
      if (action === 'replace') {
        await this._replaceWorkspace(pending.pathname, pending.origin)
        return
      }
      await this._openFolderAdd(pending.pathname, pending.origin)
      console.info(
        `[ProjectStore][OPEN_FOLDER][BLOCK_OPEN_FOLDER_RESOLVED mode=add origin=${pending.origin} path=${canonicalizePath(pending.pathname)}]`
      )
    },

    async RESOLVE_REPLACE_CONFIRM(action) {
      const pending = this.pendingReplaceConfirm
      this.pendingReplaceConfirm = null
      if (!pending) return
      const { pathname, origin } = pending
      if (action === 'cancel') {
        console.info(`[ProjectStore][_replaceWorkspace][BLOCK_WORKSPACE_REPLACE_ABORTED path=${canonicalizePath(pathname)} reason=cancel]`)
        return
      }
      if (action === 'save-close') {
        // Save each dirty tab before anything closes. A failed save aborts
        // the whole replace — dirty work is never discarded by a failure.
        const editorStore = useEditorStore()
        for (const id of pending.dirtyIds) {
          const tab = editorStore.tabs.find((t) => t.id === id)
          if (!tab) continue
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            const outcome = await invoke('mt_response_file_save', {
              id: tab.id,
              filename: tab.filename,
              pathname: tab.pathname,
              markdown: tab.markdown,
              defaultPath: null
            })
            if (outcome) editorStore.APPLY_SAVE_OUTCOME(outcome, tab.contentRevision || 0)
          } catch (e) {
            notice.notify({
              title: i18n.global.t('dialog.saveFailure'),
              message: String(e),
              type: 'error',
              time: 20000,
              showConfirm: false
            })
            console.info(`[ProjectStore][_replaceWorkspace][BLOCK_WORKSPACE_REPLACE_ABORTED path=${canonicalizePath(pathname)} reason=save-failed]`)
            return
          }
        }
      }
      await this._finishReplace(pathname, origin, action === 'save-close' ? pending.dirtyIds.length : 0)
    },
    // END_BLOCK_FOLDER_CHOICE_RESOLUTION

    // START_BLOCK_REPLACE_WORKSPACE
    // Replace machinery. Tab rules (spec): dirty tabs under removed roots
    // get ONE three-action confirm before any mutation (Save & Close /
    // Don't Save / Cancel — Cancel leaves everything untouched); non-dirty
    // tabs under removed roots close silently; tabs not under any root and
    // tabs under the kept root always survive. Target already open as the
    // only root → plain add (ADD_PROJECT's dedup notice covers it).
    async _replaceWorkspace(pathname, origin) {
      const canonical = canonicalizePath(pathname)
      const foreignRoots = this.projectTrees.filter((r) => r.pathname !== canonical)
      if (foreignRoots.length === 0) {
        await this._openFolderAdd(pathname, origin)
        console.info(`[ProjectStore][_replaceWorkspace][BLOCK_WORKSPACE_REPLACED path=${canonical} closed=0 tabsClosed=0 dirtyHandled=0 origin=${origin}]`)
        return
      }
      const editorStore = useEditorStore()
      const foreignTabs = editorStore.tabs.filter(
        (t) => t.pathname && foreignRoots.some((r) => isPathContained(t.pathname, r.pathname))
      )
      const dirtyTabs = foreignTabs.filter((t) => !t.isSaved)
      if (dirtyTabs.length > 0) {
        this.pendingReplaceConfirm = {
          pathname: canonical,
          origin,
          tabIds: foreignTabs.map((t) => t.id),
          dirtyIds: dirtyTabs.map((t) => t.id)
        }
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][_replaceWorkspace][BLOCK_REPLACE_CONFIRM_PENDING] path=${canonical} dirty=${dirtyTabs.length} tabs=${foreignTabs.length}`)
        return
      }
      await this._finishReplace(pathname, origin, 0)
    },

    async _finishReplace(pathname, origin, dirtyHandled) {
      const canonical = canonicalizePath(pathname)
      const foreignRoots = this.projectTrees.filter((r) => r.pathname !== canonical)
      const editorStore = useEditorStore()
      const foreignTabs = editorStore.tabs.filter(
        (t) => t.pathname && foreignRoots.some((r) => isPathContained(t.pathname, r.pathname))
      )
      let tabsClosed = 0
      for (const tab of foreignTabs) {
        editorStore.FORCE_CLOSE_TAB(tab)
        tabsClosed++
      }
      for (const root of foreignRoots) {
        await this.CLOSE_PROJECT(root.pathname)
      }
      await this._openFolderAdd(pathname, origin)
      console.info(
        `[ProjectStore][_replaceWorkspace][BLOCK_WORKSPACE_REPLACED path=${canonical} closed=${foreignRoots.length} tabsClosed=${tabsClosed} dirtyHandled=${dirtyHandled} origin=${origin}]`
      )
    },
    // END_BLOCK_REPLACE_WORKSPACE

    // The shared add+walk flow behind ADD_PROJECT-triggering surfaces.
    async _openFolderAdd(pathname, origin) {
      const before = this.projectTrees.length
      this.ADD_PROJECT(pathname)
      if (this.projectTrees.length > before) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          invoke('mt_walk_project', { path: pathname }).catch((e) => {
            console.error('[ipc][walk_project][BLOCK_INVOKE_FAILED]', e)
          })
        } catch (e) {
          console.error('[ipc][walk_project][BLOCK_IMPORT_FAILED]', e)
        }
      }
    },

    /**
     * Synchronously remove a root + tell main to unwatch (real unwatch
     * since C-2: mt_close_project_root drops the WatchRegistry entries)
     * + drop pending bucket. Idempotent: closing an unknown path is a
     * no-op with a NOOP_NOT_FOUND marker.
     */
    async CLOSE_PROJECT(rootPathname) {
      const canonical = canonicalizePath(rootPathname)
      const idx = this.projectTrees.findIndex((r) => r.pathname === canonical)
      if (idx < 0) {
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][CLOSE_PROJECT][NOOP_NOT_FOUND] path=${canonical}`)
        return
      }
      this.projectTrees.splice(idx, 1)
      delete this.pendingTreeEvents[canonical]
      // eslint-disable-next-line no-console
      console.debug(`[ProjectStore][CLOSE_PROJECT][REMOVE] path=${canonical} remaining=${this.projectTrees.length}`)
      // C-1 fix: tear down the file-watcher subscription. dispose() is
      // idempotent and best-effort; calling on a missing entry is OK.
      const dispose = watchDisposers.get(canonical)
      if (dispose) {
        try {
          dispose()
        } catch (e) {
          console.debug(`[ProjectStore][Watcher][DISPOSE_FAILED] root=${canonical}`, e)
        }
        watchDisposers.delete(canonical)
      }
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('mt_close_project_root', { pathname: canonical })
      } catch (e) {
        console.error('[ipc][close_project_root][BLOCK_INVOKE_FAILED]', e)
        // local state already removed; backend cleanup is best-effort
      }
    },

    LISTEN_FOR_SIDEBAR_CONTEXT_MENU() {
      bus.on('SIDEBAR::show-in-folder', () => {
        const { pathname } = this.activeItem
        window.electron.shell.showItemInFolder(pathname)
      })
      // C-51 T-002: Pin/Unpin from the tree file context menu — toggles
      // the active file in the persisted Pinned sidebar list.
      bus.on('SIDEBAR::pin-file', () => {
        const { pathname } = this.activeItem
        if (!pathname) return
        usePinnedStore().TOGGLE_PIN(pathname)
      })
      bus.on('SIDEBAR::new', (type) => {
        const { pathname, isDirectory } = this.activeItem
        const dirname = isDirectory ? pathname : window.path.dirname(pathname)
        this.createCache = { dirname, type }
        bus.emit('SIDEBAR::show-new-input')
      })
      bus.on('SIDEBAR::remove', () => {
        const { pathname } = this.activeItem
        window.electron.ipcRenderer.invoke('mt::fs-trash-item', pathname).catch((err) => {
          notice.notify({
            title: 'Error while deleting',
            type: 'error',
            message: err.message
          })
        })
      })
      bus.on('SIDEBAR::copy-cut', (type) => {
        const { pathname: src } = this.activeItem
        this.clipboard = { type, src }
      })
      bus.on('SIDEBAR::paste', () => {
        const { clipboard } = this
        const { pathname, isDirectory } = this.activeItem
        const dirname = isDirectory ? pathname : window.path.dirname(pathname)
        if (clipboard && clipboard.src) {
          clipboard.dest = dirname + PATH_SEPARATOR + window.path.basename(clipboard.src)

          if (window.path.normalize(clipboard.src) === window.path.normalize(clipboard.dest)) {
            notice.notify({
              title: 'Paste Forbidden',
              type: 'warning',
              message: 'Source and destination must not be the same.'
            })
            return
          }

          paste(clipboard)
            .then(() => {
              this.clipboard = null
            })
            .catch((err) => {
              notice.notify({
                title: 'Error while pasting',
                type: 'error',
                message: err.message
              })
            })
        }
      })
      bus.on('SIDEBAR::rename', () => {
        const { pathname } = this.activeItem
        this.renameCache = pathname
        bus.emit('SIDEBAR::show-rename-input')
      })
    },

    CREATE_FILE_DIRECTORY(name) {
      const { dirname, type } = this.createCache

      if (type === 'file' && !window.fileUtils.hasMarkdownExtension(name)) {
        name += '.md'
      }

      const fullName = `${dirname}/${name}`

      create(fullName, type)
        .then(() => {
          this.createCache = {}
          if (type === 'file') {
            this.newFileNameCache = fullName
          }
        })
        .catch((err) => {
          notice.notify({
            title: 'Error in Side Bar',
            type: 'error',
            message: err.message
          })
        })
    },

    RENAME_IN_SIDEBAR(name) {
      const editorStore = useEditorStore()
      const src = this.renameCache
      const dirname = window.path.dirname(src)
      const dest = dirname + PATH_SEPARATOR + name
      return rename(src, dest)
        .then(() => {
          editorStore.RENAME_IF_NEEDED({ src, dest })
        })
        .catch((err) => {
          notice.notify({
            title: 'Error in Side Bar',
            type: 'error',
            message: err.message
          })
        })
    },

    async OPEN_SETTING_WINDOW() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('mt_open_setting_window')
      } catch (e) {
        console.error('[ipc][open_setting_window][BLOCK_INVOKE_FAILED]', e)
      }
    }
  },

  getters: {
    // v1.0.x backward-compat shim for code paths that still read a single
    // `projectTree`. Returns the most-recently-added root or null.
    // Will be removed once consumers migrate to projectTrees.
    projectTree(state) {
      return state.projectTrees.length > 0
        ? state.projectTrees[state.projectTrees.length - 1]
        : null
    }
  }
})
