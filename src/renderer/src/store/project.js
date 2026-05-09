import { defineStore } from 'pinia'
import { addFile, unlinkFile, addDirectory, unlinkDirectory } from './treeCtrl'
import bus from '../bus'
import { create, paste, rename } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { getFileStateFromData } from './help'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'
import { ipcWatch, ipcFs } from '../ipc/runtime'

// C-1 fix: per-root file-watcher disposers. Module-scoped (not in
// reactive state) so Pinia doesn't try to proxy the dispose closures.
// Keyed by canonical root pathname.
const watchDisposers = new Map()

// v1.1.0 Phase-A6: multi-root workspace.
// Replaces the legacy single `projectTree` object with `projectTrees: TreeRoot[]`.
// ADD_PROJECT enforces canonical-pathname dedup and nested-rejection; CLOSE_PROJECT
// emits `mt::close-project-root` IPC for main-process unwatch; _processTreeEvent
// dispatches by longest-prefix path-segment match (NOT raw startsWith).

const PENDING_BUCKET_LIMIT = 10000

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
// path. Returns the root object or null.
function findOwningRoot(roots, pathname) {
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
    pendingTreeEvents: {}
  }),

  actions: {
    /**
     * Path B-clean W3: this listener was needed because v1 Electron
     * main emitted mt::open-directory after the picker. Tauri W3 makes
     * mt_pick_folder return the path directly, so ASK_FOR_OPEN_PROJECT
     * calls ADD_PROJECT itself. Kept as no-op for app.vue's existing
     * onMounted invocation; deleted in W6 cleanup wave.
     */
    LISTEN_FOR_LOAD_PROJECT() {
      // no-op
    },

    // Append a root tree for the given pathname unless it's already present
    // (canonical equality) or nested inside an existing root. Main process
    // also dedups (V-A6-6 BLOCK_DUPLICATE) — this is defense in depth and the
    // canonical entry-point for tests + non-IPC callers.
    ADD_PROJECT(pathname) {
      const layoutStore = useLayoutStore()
      const canonical = canonicalizePath(pathname)
      let name = window.path.basename(canonical)
      if (!name) name = canonical

      // Dedup: exact canonical match.
      if (this.projectTrees.some((r) => r.pathname === canonical)) {
        // eslint-disable-next-line no-console
        console.debug(`[ProjectStore][ADD_PROJECT][BLOCK_DEDUP] path=${canonical}`)
        // W3: surface to user instead of silent log; without this,
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
      // eslint-disable-next-line no-console
      console.debug(`[ProjectStore][ADD_PROJECT][APPEND] path=${canonical} total=${this.projectTrees.length}`)

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
      ipcWatch
        .subscribe(canonical, (event) => this._handleWatchEvent(canonical, event))
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
        switch (kind) {
          case 'create': {
            try {
              const stat = await ipcFs.stat(path)
              if (stat.isDirectory) {
                this._processTreeEvent('addDir', { pathname: path })
              } else if (stat.isFile) {
                const isMarkdown = !!window.fileUtils?.hasMarkdownExtension(path)
                if (isMarkdown) {
                  this._processTreeEvent('add', {
                    pathname: path,
                    name: window.path.basename(path),
                    isFile: true,
                    isDirectory: false,
                    isMarkdown: true,
                    birthTime: stat.mtimeMs
                  })
                }
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
            // Tree shape doesn't change on content modify; only open-tab
            // notification matters here (matches v1.2.3 chokidar 'change').
            if (this._tabExists(editorStore, path)) {
              editorStore.APPLY_FILE_CHANGE('change', { pathname: path })
            }
            break
          }
          case 'remove': {
            this._processTreeEvent('unlink', { pathname: path })
            this._processTreeEvent('unlinkDir', { pathname: path })
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

    /**
     * Path B-clean W3: tree-update listener moved to bootstrap-ipc.js
     * (registered ONCE at boot). This action stays as a no-op alias
     * so app.vue's onMounted call doesn't break; deletion comes in W6
     * cleanup wave.
     */
    LISTEN_FOR_UPDATE_PROJECT() {
      // no-op
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
     * Path B-clean W3: pick folder via direct invoke. Backend opens
     * native picker and returns Option<String>; on Some we add the
     * project. On None (user cancelled) silent no-op.
     */
    async ASK_FOR_OPEN_PROJECT() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await invoke('mt_pick_folder')
        if (path) {
          this.ADD_PROJECT(path)
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

    /**
     * Synchronously remove a root + tell main to unwatch (no-op stub
     * until F-WATCH-WIRE-PROJECT) + drop pending bucket. Idempotent:
     * closing an unknown path is a no-op with a NOOP_NOT_FOUND marker.
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
      rename(src, dest).then(() => {
        editorStore.RENAME_IF_NEEDED({ src, dest })
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
