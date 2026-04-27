import { defineStore } from 'pinia'
import { addFile, unlinkFile, addDirectory, unlinkDirectory } from './treeCtrl'
import bus from '../bus'
import { create, paste, rename } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { getFileStateFromData } from './help'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'

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
    LISTEN_FOR_LOAD_PROJECT() {
      window.electron.ipcRenderer.on('mt::open-directory', (e, pathname) => {
        this.ADD_PROJECT(pathname)
      })
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
    },

    LISTEN_FOR_UPDATE_PROJECT() {
      window.electron.ipcRenderer.on('mt::update-object-tree', (e, { type, change }) => {
        this._processTreeEvent(type, change)
      })
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

    // Open Folder dialog → main process resolves user pick → emits
    // mt::open-directory back to renderer (handled by LISTEN_FOR_LOAD_PROJECT).
    // We don't append synchronously here because main owns the canonical path
    // (resolves symlinks etc.) and the watcher subscription.
    ASK_FOR_OPEN_PROJECT() {
      window.electron.ipcRenderer.send('mt::ask-for-open-project-in-sidebar')
    },

    // Synchronously remove a root + tell main to unwatch + drop pending bucket.
    // Idempotent: closing an unknown path is a no-op with a NOOP_NOT_FOUND marker.
    CLOSE_PROJECT(rootPathname) {
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
      window.electron.ipcRenderer.send('mt::close-project-root', canonical)
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

    OPEN_SETTING_WINDOW() {
      window.electron.ipcRenderer.send('mt::open-setting-window')
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
