import equal from 'deep-equal'
import { invoke as invokeDocumentCommand } from '@tauri-apps/api/core'
import bus from '../bus'
import { ipcFs, ipcWatch, ipcRecent, ipcPrefs } from '../ipc/runtime'
import { hasKeys, getUniqueId } from '../util'
import listToTree from '../util/listToTree'
import {
  createDocumentState,
  getOptionsFromState,
  getSingleFileState,
  getBlankFileState
} from './help'
import notice from '../services/notification'
import { documentOwner, captureDocumentSnapshot, inspectDocumentComposition } from '../util/documentSnapshot'
import { createDocumentOperations } from '../util/documentOperations'
import { recomputeDocumentSaved, applyDocumentFormat, captureFormatChoice, captureRestoredFormat, captureSessionFormats, captureDocumentFormat } from '../util/documentFormat'
import { ipcDocumentSave } from '../ipc/runtime/documentSave'
import { useRecentlyClosedStore } from './recentlyClosed'
import {
  FileEncodingCommand,
  LineEndingCommand,
  QuickOpenCommand,
  TrailingNewlineCommand
} from '../commands'
import { defineStore } from 'pinia'
import { watch } from 'vue'
import { usePreferencesStore } from './preferences'
import { useProjectStore } from './project'
import { useLayoutStore } from './layout'
import { useMainStore } from '.'
import { i18n } from '../i18n'
import { recordSnapshot, recordOpenedSnapshot, clearSnapshots } from './diffSnapshots'
import {
  loadGuideMarkdown,
  getGuideSectionHeadingText,
  GUIDE_SECTION_CONNECT_AGENT
} from '../util/guideDoc'
import { syncViewMenuChecks } from '../util/menuChecks'
import { moveTableLayoutsEntry } from '../util/tableLayoutStore'
import { movePageWidthEntry } from '../util/pageWidthStore'
import {
  loadFilePosition,
  saveFilePosition,
  moveFilePositionsEntry,
  clampEntryToMarkdown
} from '../util/filePositionStore'
import { askUnsavedClose } from '../components/editorWithTabs/unsavedCloseDialog'
import { getRememberedExportPageOptions } from '../util/exportPageDefaults'
import { openExportSettings } from '../util/exportSettingsNavigation'
import { createExternalReloadController, SETTLE_DELAY_MS } from '../util/externalReload'

const formatErrorKeys = Object.freeze({
  MT_ENC_UNKNOWN: 'unknown', MT_ENC_UNSUPPORTED: 'unsupported', MT_ENC_INVALID_POLICY: 'invalidPolicy',
  MT_ENC_UNREPRESENTABLE: 'unrepresentable', MT_ENC_MIXED_EOL: 'mixed'
})
const documentCoordinators = new WeakMap()
const autoSaveTimers = new Map()
const fileWatchDisposers = new Map()
const liveReloadGenerations = new Map()
// C-4: pathname → expiry (ms) of the watcher echo of our own sidebar rename.
// After the tabs moved the watcher reports the new path — as 'create' or, on
// macOS (FSEvents rename = notify Modify(Name)), as 'modify' → 'change', and
// possibly more than once. With liveReload on any of them would re-read the
// disk over unsaved edits, so every add/change inside the window is the echo.
const renameEchoUntil = new Map()
const RENAME_ECHO_WINDOW_MS = 2000

// C-SESSION-WRITE-ATOMICITY: owner-confirmable proposal — the quit /
// window-close prepareCommit races the session profile write against
// this bound (consistent with the 400 ms autosave debounce and typical
// prefs write latency). The save can delay the close at most this long,
// never block it forever; on timeout the close proceeds honestly while
// the single-transaction backend keeps the previous complete generation
// on disk. An owner-amended value replaces the constant without
// changing the mechanism.
const SESSION_COMMIT_TIMEOUT_MS = 2000

// C-EXTERNAL-RELOAD-OPERATION: one owner for reload admission, the 100ms
// settle + disk read with liveness revalidation, and the replacement
// commit (util/externalReload). Every external effect is injected; all
// bindings are call-time arrows, so module evaluation never touches
// `window` and vitest module mocks keep applying.
const externalReload = createExternalReloadController({
  read: (p) => ipcFs.read(p),
  schedule: (fn) => setTimeout(fn, SETTLE_DELAY_MS),
  log: console,
  bus,
  isSamePath: (a, b) => window.fileUtils.isSamePathSync(a, b),
  buildSingleFileState: getSingleFileState,
  recordPreReloadSnapshot: recordSnapshot,
  recordOpenedSnapshot,
  notify: (payload) => notice.notify(payload),
  t: (key, params) => i18n.global.t(key, params)
})

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_EXPORT_DOCUMENT_PIN
// C-EXPORT-DOCUMENT-PIN: store-side pre-write verification for a pinned
// export run. assertExportPinCurrent re-proves the pinned identity
// before any dialog opens and again after the save dialog resolves and
// before any write or print invocation: the pinned owner must still own
// the active surface (documentOwner token match plus currentFile.id
// equality), the pinned contentRevision must be current, and the pinned
// pathname must equal the active pathname (closing the rename window —
// RENAME keeps id/token/revision but moves the path). Disk predicate
// (HASH-OVER-BYTES decision, review minor 1): a stat signature divergence
// may refuse early, but an unchanged stat NEVER waives the digest compare
// — SHA-256 over the on-disk bytes read through the binary bridge
// (ipc.fs.read_binary) via crypto.subtle.digest('SHA-256') — so a
// same-size same-mtime rewrite cannot pass. Refusals raise exactly one
// localized notice under the
// editor.export namespace plus the count-only BLOCK_EXPORT_PIN_MISMATCH
// marker; cancel in the save dialog returns before verification and
// stays silent (corner-2).
// ──────────────────────────────────────────────────────────────────────
const exportPinStatSignature = (stat) => `${stat?.size ?? ''}:${stat?.mtimeMs ?? stat?.mtime_ms ?? ''}`

const exportPinDigestHex = async (bytes) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const notifyExportPinDiskChanged = (exportPin) => {
  notice.notify({
    title: i18n.global.t('editor.export.pinDiskChangedTitle'),
    message: i18n.global.t('editor.export.pinDiskChangedMessage', {
      name: window.path.basename(exportPin.pathname || '')
    }),
    type: 'error'
  })
  // Count-only marker — never document or path text (console-privacy).
  // eslint-disable-next-line no-console
  console.debug('[export][pin][BLOCK_EXPORT_PIN_MISMATCH class=disk]')
}
// END_BLOCK_EXPORT_DOCUMENT_PIN

// START_BLOCK_LAST_PRINT_OPTIONS
// C-EXPORT-SETTINGS-SECTION: appearance keeps the existing C-61 schema.
// Read persisted choices at each operation so a separate Settings window's
// changes reach this realm. Failed writes remain available in this realm and
// return false to Settings; they do not claim cross-window durability.
const PRINT_OPTIONS_STORAGE_KEY = 'mark-last-print-options'
const DEFAULT_PRINT_OPTIONS = () => ({
  theme: null,
  pageMarginTop: 20,
  pageMarginRight: 15,
  pageMarginBottom: 20,
  pageMarginLeft: 15,
  autoNumberingHeadings: false,
  showFrontMatter: false,
  tocTitle: '',
  tocIncludeTopHeading: true
})

const loadLastPrintOptions = () => {
  let raw
  try {
    raw = window.localStorage.getItem(PRINT_OPTIONS_STORAGE_KEY)
  } catch {
    return undefined
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

// Module-scoped so Pinia never proxies it (same convention as
// autoSaveTimers / _bootPhase above).
let _lastPrintOptions = loadLastPrintOptions()
let hasUnpersistedAppearance = false

const copyExportAppearance = (options) => {
  const {
    // Retain the original REMEMBER_EXPORT_OPTIONS filter exactly.
    // eslint-disable-next-line no-unused-vars
    type, pageSize, pageSizeWidth, pageSizeHeight, isLandscape, htmlTitle, content,
    ...appearance
  } = options
  for (const key of ['header', 'footer']) {
    if (appearance[key] && typeof appearance[key] === 'object') appearance[key] = { ...appearance[key] }
  }
  return appearance
}

export const getRememberedExportAppearance = () => {
  const persisted = loadLastPrintOptions()
  if (!hasUnpersistedAppearance && persisted !== undefined) _lastPrintOptions = persisted
  return { ...DEFAULT_PRINT_OPTIONS(), ...copyExportAppearance(_lastPrintOptions || {}) }
}

// The appearance schema is scalar except for the two header/footer records.
// Copy and freeze those records as well as the complete bus payload.
const captureExportOptions = (options) => {
  const captured = { ...options }
  for (const key of ['header', 'footer']) {
    if (captured[key] && typeof captured[key] === 'object') captured[key] = Object.freeze({ ...captured[key] })
  }
  return Object.freeze(captured)
}

const getExportOperationOptions = (type) => {
  const { htmlTitle, ...pageOptions } = getRememberedExportPageOptions()
  const options = { ...getRememberedExportAppearance(), ...pageOptions, type }
  if (type === 'styledHtml') options.htmlTitle = htmlTitle
  return captureExportOptions(options)
}
// END_BLOCK_LAST_PRINT_OPTIONS

let _bootPhase = true
export const __resetBootPhase = () => { _bootPhase = true }

// C-69: stores whose session autosave watcher is running (one per store).
const sessionAutosaveStores = new WeakSet()

export const useEditorStore = defineStore('editor', {
  state: () => ({
    currentFile: {},
    liveDocument: null,
    findVisible: false,
    documentWindowClosing: false,
    tabs: [],
    tabIdToIndex: {},
    listToc: [], // Used for equal check and for searching for the correct github-slug to jump to
    toc: [],
    // C-FIX-009-SESSION-COLD-START: the boot-time restorable snapshot
    // offered on the welcome screen when this launch skipped auto-restore
    // (restoreSessionOnLaunch off). Null otherwise; never updated from
    // the live autosaved preference afterwards.
    coldStartSession: null
  }),

  actions: {
    updateTabIdToIndex() {
      this.tabIdToIndex = this.tabs.reduce((map, tab, index) => {
        map[tab.id] = index
        return map
      }, {})
    },

    /**
     * Copies the specified heading's github-slug to the clipboard.
     * @param {string} id The heading-id to copy.
     */
    copyGithubSlug(key) {
      const item = this.listToc.find((i) => i.slug === key)

      if (item) {
        window.electron.clipboard.writeText(`#${item.githubSlug}`)
        notice.notify({
          title: i18n.global.t('store.editor.anchorLinkCopied'),
          type: 'primary',
          time: 2000
        })
      } else {
        console.warn(i18n.global.t('store.editor.tocItemNotFound', { key }))
      }
    },

    /**
     * Update scroll position for the currentFile
     */
    updateScrollPosition(id, scrollTop) {
      if (!(id in this.tabIdToIndex)) {
        console.warn('updateScrollPosition: Cannot find tab index for id:', id)
        return
      }

      this.tabs[this.tabIdToIndex[id]].scrollTop = scrollTop
    },

    // START_BLOCK_POSITION_CURSOR_WRITE
    // C-FILE-POSITION-MEMORY (spec A, D-1): write ONLY the block-key cursor
    // of a tab. This is the arrow-key fix — pure keyboard navigation must
    // reach the tab state exactly like clicks and edits do. It deliberately
    // bypasses LISTEN_FOR_CONTENT_CHANGE without serializing the model.
    // The content handler also advances the complete document revision only
    // for real committed text changes (corner C-2).
    updateCursorPosition(id, cursor) {
      if (!cursor || !(id in this.tabIdToIndex)) return
      const tab = this.tabs[this.tabIdToIndex[id]]
      if (tab && cursor.anchor && cursor.focus) {
        tab.cursor = cursor
      }
    },

    // Review wave №5: the durable line/ch cursor refresh for the tab the
    // editor is currently rendering — written by the synchronous
    // mt::collect-position bus round-trip right before a close/quit flush
    // so pure arrow-key navigation (which never fires muya 'change') still
    // persists its caret. Same contentRevision guarantees as
    // updateCursorPosition above.
    updateMuyaIndexCursor(id, muyaIndexCursor) {
      if (!muyaIndexCursor || !(id in this.tabIdToIndex)) return
      const tab = this.tabs[this.tabIdToIndex[id]]
      if (tab && muyaIndexCursor.anchor && muyaIndexCursor.focus) {
        tab.muyaIndexCursor = muyaIndexCursor
      }
    },
    // END_BLOCK_POSITION_CURSOR_WRITE

    // START_BLOCK_POSITION_FLUSH
    // C-FILE-POSITION-MEMORY (spec D-2/D-3): the disk write boundary for
    // one file's reading position. The active tab's editor.vue debounce
    // calls SAVE_ACTIVE_FILE_POSITION with a freshly computed
    // muyaIndexCursor (one ExportMarkdown run per flush — never per event);
    // close and quit flushes call it with the stored value via
    // _flushFilePositionForTab. muyaIndexCursor === false is a SENTINEL:
    // the caller computed the cursor and it FAILED — the stale stored value
    // must not silently impersonate a fresh one.
    async SAVE_ACTIVE_FILE_POSITION({ id, muyaIndexCursor }) {
      const tab = this.tabs.find(t => t.id === id)
      if (!tab || !tab.pathname) return
      // Straight pass-through: a fresh cursor object from the debounce, the
      // false sentinel (computation failed — scroll-only entry), or
      // undefined (collect from the live editor via the bus).
      await this._flushFilePositionForTab(tab, muyaIndexCursor)
    },

    async _flushFilePositionForTab(tab, muyaIndexCursor = undefined) {
      if (!tab || !tab.pathname) return
      // №5 review wave: for the tab the editor is CURRENTLY rendering, ask
      // the editor for a fresh cursor first — muya refreshes
      // tab.muyaIndexCursor only on click/edit 'change' events, so pure
      // arrow-key navigation closed inside the debounce window would
      // otherwise persist the last click's cursor. The bus round-trip is
      // synchronous (mitt emit); with no mounted listener (tests, background
      // tabs) the stored value stands.
      if (muyaIndexCursor === undefined) {
        bus.emit('mt::collect-position', { id: tab.id })
      }
      let cursor = muyaIndexCursor === undefined ? (tab.muyaIndexCursor || null) : muyaIndexCursor
      if (cursor === false) cursor = null
      const entry = {
        scrollTop: typeof tab.scrollTop === 'number' && tab.scrollTop > 0 ? tab.scrollTop : 0,
        muyaIndexCursor: cursor && cursor.anchor && cursor.focus ? cursor : null
      }
      try {
        await saveFilePosition(tab.pathname, entry)
      } catch (e) {
        console.warn(`[editor][position][BLOCK_POSITION_FLUSH_FAILED] ${e}`)
      }
    },
    // END_BLOCK_POSITION_FLUSH

    /**
     * Push a tab specific notification on stack that never disappears.
     */
    pushTabNotification(data) {
      const defaultAction = () => {}
      const { tabId, msg } = data
      const action = data.action || defaultAction
      const showConfirm = data.showConfirm || false
      const style = data.style || 'info'
      // Whether only one notification should exist.
      const exclusiveType = data.exclusiveType || ''

      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) {
        console.error(i18n.global.t('store.editor.tabNotFound'))
        return
      }

      const { notifications } = tab

      // Remove the old notification if only one should exist.
      if (exclusiveType) {
        const index = notifications.findIndex((n) => n.exclusiveType === exclusiveType)
        if (index >= 0) {
          // Reorder current notification
          notifications.splice(index, 1)
        }
      }

      // Push new notification on stack.
      notifications.push({
        msg,
        showConfirm,
        style,
        exclusiveType,
        action
      })
    },

    loadChange(change) {
      // C-EXTERNAL-RELOAD-OPERATION: thin adapter. The replacement
      // boundary (same-path lookup, fresh state, metadata restoration,
      // snapshots, announcement) lives in util/externalReload; the
      // signature and the missing-tab error text stay intact for the
      // non-reload callers of this action.
      return externalReload.applyLoadedChange({ change, store: this })
    },

    FORMAT_LINK_CLICK({ data, dirname }) {
      // Check if the link starts with a #, that is a local anchor link.

      if (data.href.length > 0 && data.href[0] === '#') {
        const anchorSlug = data.href.substring(1)
        if (!anchorSlug) return

        // Find the block with the anchor slug from the TOC
        for (const item of this.listToc) {
          if (item.githubSlug === anchorSlug) {
            // Scroll to the corresponding element that matches this github-slug
            bus.emit('scroll-to-header', item.slug)
            return
          }
        }

        return
      }

      window.electron.ipcRenderer.send('mt::format-link-click', { data, dirname })
    },

    async ASK_FOR_IMAGE_AUTO_PATH(src) {
      const results = await this.ASK_FOR_FILE_PATH(src, {
        exts: [
          'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'tif', 'avif'
        ]
      })
      // Byte-identical image flavor: files carry the image icon.
      return results.map((r) =>
        r.iconClass === 'icon-file' ? { ...r, iconClass: 'icon-image' } : r
      )
    },

    // C-20: generalized relative-path autocomplete (the image flavor above
    // delegates here). Reads the directory implied by the typed dir-part
    // (relative to the current document), filters by prefix and extension
    // set; directories are always offered (for browsing into subpaths).
    async ASK_FOR_FILE_PATH(src, { exts = [], includeDirs = true } = {}) {
      const { pathname } = this.currentFile
      if (!pathname || !src) return []

      const extSet = new Set(exts.map((e) => e.toLowerCase()))

      try {
        const fileDir = window.path.dirname(pathname)
        const pathSep = window.path.sep || '/'
        const lastSep = Math.max(src.lastIndexOf('/'), src.lastIndexOf('\\'))
        const dirPart = lastSep >= 0 ? src.substring(0, lastSep + 1) : ''
        const prefix = lastSep >= 0
          ? src.substring(lastSep + 1).toLowerCase()
          : src.toLowerCase()

        const resolvedDir = window.path.resolve(fileDir, dirPart || '.')
        // C-20 security review: the typed dir-part resolves anywhere the
        // user types (absolute paths, ..-escapes). Restrict the browse to
        // the current document's subtree — the spec constraint.
        if (resolvedDir !== fileDir && !resolvedDir.startsWith(fileDir + pathSep)) {
          return []
        }
        const names = await window.fileUtils.readdir(resolvedDir)
        const filtered = names
          .filter((n) => n.toLowerCase().startsWith(prefix))
          .slice(0, 50)

        const results = await Promise.all(
          filtered.map(async (name) => {
            try {
              const full = window.path.join(resolvedDir, name)
              const s = await window.fileUtils.stat(full)
              if (s.isDirectory || s.is_directory) {
                return includeDirs ? { text: name + '/', iconClass: 'icon-folder' } : null
              }
              const ext = (name.split('.').pop() || '').toLowerCase()
              if (extSet.size === 0 || extSet.has(ext)) {
                return { text: name, iconClass: 'icon-file' }
              }
              return null
            } catch {
              return null
            }
          })
        )
        return results.filter(Boolean)
      } catch {
        return []
      }
    },

    SEARCH(value) {
      this.currentFile.searchMatches = JSON.parse(JSON.stringify(value)) // deep clone to trigger state changes
    },

    SHOW_IMAGE_DELETION_URL(deletionUrl) {
      // C-NOTIFICATION-SYSTEM T-004: the legacy showConfirm promise chain
      // (resolve = copy URL) becomes a plain copy shortcut action — a
      // one-click button, no answer owed (corner C-7).
      notice.notify({
        title: i18n.global.t('store.editor.imageDeletionUrlTitle'),
        message: i18n.global.t('store.editor.imageDeletionUrlMessage', { url: deletionUrl }),
        severity: 'info',
        source: 'file',
        time: 20000,
        actions: [
          {
            kind: 'copy',
            payload: deletionUrl
          }
        ]
      })
    },

    // We need to update line endings menu when changing tabs.
    async UPDATE_LINE_ENDING_MENU() {
      const { lineEnding } = this.currentFile
      if (lineEnding) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('mt_update_line_ending_menu', { lineEnding })
        } catch {
          // menu update is best-effort
        }
      }
    },

    /**
     * invoke returns SavedTabState directly. Backend writes the file
     * and returns {id,pathname,filename,isSaved}. Renderer applies
     * state via APPLY_SAVE_OUTCOME — no listener race for the per-tab
     * save ack.
     */
    // START_BLOCK_DOCUMENT_OPERATIONS
    _documentOperations() {
      if (!documentCoordinators.has(this)) {
        const coordinator = createDocumentOperations({
          getTabs: () => this.tabs,
          capture: owner => captureDocumentSnapshot(this, owner),
          inspectComposition: inspectDocumentComposition,
          chooseTarget: request => ipcDocumentSave.chooseTarget(request),
          writeSnapshot: request => ipcDocumentSave.writeSnapshot(request),
          defaultPath: () => getRootFolderFromState(useProjectStore()),
          samePath: (a,b) => window.fileUtils.isSamePathSync(a,b),
          confirm: ({kind,snapshots}) => askUnsavedClose({
            filename: snapshots.map(s => s.filename || s.sourcePath).join(', '),
            named: snapshots.every(s => !!s.sourcePath), kind,
            filenames: snapshots.map(s => s.sourcePath || s.filename)
          }),
          notify: (outcome, request) => this._notifyDocumentOperation(outcome, request),
          prepareCommit: request => ['quit','window-close'].includes(request.kind)
            ? this._boundedSessionCommit()
            : Promise.all(request.owners.map(owner => {
              const tab=this.tabs.find(t=>t.id===owner.id && t.documentToken===owner.documentToken)
              return tab ? this._flushFilePositionForTab(tab) : null
            })),
          onSaved: (tab, current) => {
            if (tab.id === this.currentFile.id) window.DIRNAME = window.path.dirname(tab.pathname)
            if (current) bus.emit('file-saved', {id:tab.id,pathname:tab.pathname})
            void ipcRecent.add(tab.pathname).catch(() => {})
          }
        })
        documentCoordinators.set(this,coordinator)
      }
      return documentCoordinators.get(this)
    },

    _notifyDocumentOperation(outcome, request) {
      const owners = request?.owners || outcome.affectedOwners
      const names = owners.map(owner => this.tabs.find(t => t.id===owner.id && t.documentToken===owner.documentToken))
        .filter(Boolean).map(tab => tab.pathname || tab.filename).join(', ')
      const reason = ['composing','busy','collision','changed','new-dirty','stale','unavailable'].includes(outcome.reason) ? outcome.reason : 'failed'
      const t = (key, values) => i18n.global.t(`documentOperations.${key}`, values)
      const retry = async () => {
        if (!owners.every(owner => this.tabs.some(tab => tab.id===owner.id && tab.documentToken===owner.documentToken))) {
          notice.notify({source:'file',severity:'info',message:t('stale',{names}),dedupKey:'document-operation-stale-retry'})
          return
        }
        if (request?.kind === 'save') return this._documentOperations().save(owners[0],{saveAs:request.saveAs})
        return this.REQUEST_DOCUMENT_OPERATION({...request,owners,decision:'save',confirmedSnapshots:undefined})
      }
      notice.notify({source:'file',severity:outcome.status==='failed'?'error':'info',title:t('title'),
        message:formatErrorKeys[outcome.reason] ? i18n.global.t(`fileFormat.errors.${formatErrorKeys[outcome.reason]}`) : t(reason,{names}),dedupKey:`document-operation-${reason}-${owners.map(o=>o.documentToken).join('-')}`,
        actions:[{label:t(request?.kind==='save'||request?.kind==='save-all'?'retrySave':'retryClose'),handler:retry}]})
    },

    REQUEST_DOCUMENT_OPERATION(request) {
      const owners=request.owners || this.tabs.map(documentOwner)
      return this._documentOperations().run({...request,owners})
    },

    FILE_SAVE() {
      if (!this.currentFile.id) return Promise.resolve({status:'completed',affectedOwners:[]})
      return this._documentOperations().save(documentOwner(this.currentFile))
    },

    // Uncorrelated compatibility events have no authority over live content.
    APPLY_SAVE_OUTCOME() { return false },
    // END_BLOCK_DOCUMENT_OPERATIONS

    /**
     * IPC listener moved to bootstrap-ipc.js; bus subscription stays
     * inline.
     */
    LISTEN_FOR_SAVE() {
      bus.on('mt::editor-ask-file-save', () => {
        this.FILE_SAVE()
      })
    },

    FILE_SAVE_AS() {
      if (!this.currentFile.id) return Promise.resolve({status:'completed',affectedOwners:[]})
      return this._documentOperations().save(documentOwner(this.currentFile),{saveAs:true})
    },

    /**
     * IPC listener moved to bootstrap-ipc.js; bus subscription stays
     * inline.
     */
    LISTEN_FOR_SAVE_AS() {
      bus.on('mt::editor-ask-file-save-as', () => {
        this.FILE_SAVE_AS()
      })
    },

    LISTEN_FOR_SAVE_ALL() {
      bus.on('mt::editor-ask-file-save-all', () => {
        this.ASK_FOR_SAVE_ALL(false)
      })
    },

    // START_BLOCK_QUIT_APP
    // C-MULTI-SOURCE-WORKSPACE fix wave: app-level quit with the SAME
    // dirty-tab guard the window close uses (Save & Quit / Don't Save /
    // stay). Routes: File→Quit + the app-menu Quit item (⌘Q) and the
    // command palette's file.quit. Before this action existed, quit went
    // straight to mt_app_quit — mt_app_quit marks the exit approved and
    // app.exit(0) never consults the window close lifecycle, so unsaved
    // tabs were dropped silently (owner acceptance probe 2026-10-22:
    // instant exit, zero lifecycle markers).
    QUIT_APP() {
      return this.REQUEST_DOCUMENT_OPERATION({kind:'quit',commit:() => this._commitDocumentWindow('mt_app_quit')})
    },

    async _commitDocumentWindow(command) {
      if (this._opensInFlight > 0) throw new Error('Document opens are still pending')
      this.documentWindowClosing = true
      const savedLocks=this.tabs.map(tab=>({tab,locked:tab.locked}))
      // Only the already-approved destruction handoff locks input; disk I/O is complete.
      savedLocks.forEach(({tab})=>{tab.locked=true})
      // C-SURFACE-OWNERSHIP: the committed window close deactivates the
      // live binding through the one path — harmless when no active
      // binding exists.
      this._deactivateLiveDocument(this.liveDocument)
      try {
        return await invokeDocumentCommand(command)
      } catch (error) {
        this.documentWindowClosing = false
        savedLocks.forEach(({tab,locked})=>{tab.locked=locked})
        throw error
      }
    },

    /**
     * C-SESSION-WRITE-ATOMICITY: the quit/window-close session write is
     * bounded — it races a fixed SESSION_COMMIT_TIMEOUT_MS timer so the
     * save can delay the close at most two seconds, never forever.
     * Write settled before the timer: the close proceeds with the
     * write's outcome — a rejection is surfaced through the
     * BLOCK_SESSION_WRITE_FAILED marker and still completes the close.
     * Timer won: the BLOCK_SESSION_COMMIT_TIMEOUT marker is logged, the
     * timer is cleaned up, and the close proceeds while the in-flight
     * write settles in the background, where the single-transaction
     * backend keeps the previous complete generation on disk. Always
     * resolves (never rejects); the marker fields carry no query text,
     * document contents or absolute user paths. Non-close kinds keep the
     * exact current prepareCommit behavior (per-owner flushes, unbounded).
     */
    async _boundedSessionCommit() {
      const write = this._saveSessionState().then(
        () => true,
        (error) => {
          console.warn(`[Session][close][BLOCK_SESSION_WRITE_FAILED reason=${String(error?.message || error)}]`)
          return false
        }
      )
      let fireBound
      const bound = new Promise((resolve) => {
        fireBound = () => {
          console.warn(`[Session][close][BLOCK_SESSION_COMMIT_TIMEOUT bound=${SESSION_COMMIT_TIMEOUT_MS}ms]`)
          resolve(false)
        }
      })
      const timer = setTimeout(fireBound, SESSION_COMMIT_TIMEOUT_MS)
      try {
        await Promise.race([write, bound])
      } finally {
        clearTimeout(timer)
      }
    },

    // END_BLOCK_QUIT_APP

    /**
     * Public action — invoked by bootstrap-ipc.js mt::tab-saved
     * listener for cross-window batch-save. Same logic as the inline
     * v1 listener body had.
     */
    APPLY_TAB_SAVED() { return false },

    /**
     * Public action — invoked by bootstrap-ipc.js mt::tab-save-failure
     * listener for cross-window batch-save errors. Surfaces user-
     * visible toast + dirties the tab.
     */
    APPLY_TAB_SAVE_FAILURE(tabId, msg) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) {
        notice.notify({
          title: i18n.global.t('dialog.saveFailure'),
          message: msg,
          type: 'error',
          time: 20000
        })
        return
      }
      tab.isSaved = false
      this.pushTabNotification({
        tabId,
        msg: i18n.global.t('store.editor.errorWhileSaving', { msg }),
        style: 'crit'
      })
    },

    // START_BLOCK_SESSION_RESTORE
    // C-SESSION-DURABILITY: this block's restore hygiene — the live
    // path reads the four-key profile as ONE batched mt_prefs_get_many
    // request, all folder/file existence checks run as ONE concurrent
    // stat pass BEFORE the first open, and the per-tab format lookup is
    // an O(1) Map.get keyed by pathname (behavior-preserving by the
    // captureSessionFormats pathname dedup). The write path (batched
    // setMany), the bounded close and the frozen-payload restore shape
    // are unchanged.
    // C-69: the session snapshot — tab paths in order (untitled skipped),
    // the active tab and the open project roots. Written on window close
    // and, debounced, on every change once the boot restore finished
    // (START_SESSION_AUTOSAVE), so a quit or a crash keeps the last state.
    _sessionSnapshot() {
      const projectStore = useProjectStore()
      const tabs = this.tabs.map((t) => t.pathname).filter(Boolean)
      const active = (this.currentFile && this.currentFile.pathname) || null
      const folders = (projectStore.projectTrees || []).map((r) => r.pathname).filter(Boolean)
      const formats = this.tabs.filter(tab => tab.pathname).flatMap(tab => {
        try { return [{ pathname: tab.pathname, ...captureFormatChoice(tab) }] } catch { return [] }
      })
      return { tabs, active, folders, formats }
    },

    async _saveSessionState() {
      const { tabs, active, folders, formats } = this._sessionSnapshot()
      // C-SESSION-WRITE-ATOMICITY: the four lastSession* keys go as ONE
      // batched transaction (mt_prefs_set_many — one backend mutex
      // acquisition, one atomic save, one broadcast), so the on-disk
      // profile is always one complete generation, never a torn mix of
      // two. The batch rejection is no longer swallowed: it is captured,
      // the per-tab position flushes below still run afterwards in the
      // current order regardless of the batch outcome (C-FILE-POSITION-
      // MEMORY corner C-7), and the error is rethrown to the caller.
      let batchError = null
      try {
        await ipcPrefs.setMany([
          { key: 'lastSessionTabs', value: tabs },
          { key: 'lastSessionActive', value: active },
          { key: 'lastSessionFolders', value: folders },
          { key: 'lastSessionFormats', value: formats }
        ])
      } catch (error) {
        batchError = error
      }
      // C-FILE-POSITION-MEMORY (corner C-7): the quit/save-session flush —
      // every open file's position lands on disk with the session paths, so
      // a relaunch restores both the tabs and the reading positions.
      await Promise.allSettled(tabs.map((p) => {
        const tab = this.tabs.find((t) => t.pathname === p)
        return tab ? this._flushFilePositionForTab(tab) : null
      }))
      if (batchError) throw batchError
    },

    START_SESSION_AUTOSAVE() {
      if (sessionAutosaveStores.has(this)) return
      sessionAutosaveStores.add(this)
      let timer = null
      watch(
        () => JSON.stringify(this._sessionSnapshot()),
        () => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            // C-SESSION-WRITE-ATOMICITY: an autosave failure surfaces
            // through the console marker instead of an unhandled
            // rejection or silence.
            this._saveSessionState().catch((error) => {
              console.warn(`[Session][prefs][BLOCK_SESSION_WRITE_FAILED reason=${String(error?.message || error)}]`)
            })
          }, 400)
        }
      )
    },

    // The boot entry (APPLY_BOOTSTRAP_EDITOR): a cold launch without files
    // to open restores the saved session unless the user switched it off;
    // the autosave starts only afterwards so an empty boot never
    // overwrites the saved session.
    async BOOT_SESSION({ restore } = {}) {
      try {
        if (restore) {
          const preferencesStore = usePreferencesStore()
          let enabled = preferencesStore.restoreSessionOnLaunch
          if (enabled === undefined) {
            enabled = await ipcPrefs.get('restoreSessionOnLaunch').catch(() => undefined)
          }
          if (enabled !== false) {
            await this.RESTORE_SESSION()
          } else {
            // C-FIX-009-SESSION-COLD-START: restore was skipped by the
            // preference — freeze the COMPLETE restorable payload once
            // for the welcome screen's explicit cold-start action: tabs,
            // the active pathname and the workspace roots. The frozen
            // offer is what the row shows AND what an explicit restore
            // reopens (review wave 2: the live autosaved preferences can
            // legitimately change mid-run, so the click path must not
            // reread them); never refreshed afterwards.
            // C-SESSION-DURABILITY: the cold-start capture shares the same
            // ONE-request read as the live restore — the four-key profile
            // travels in one mt_prefs_get_many batch (absent keys as
            // null; a total-transport failure degrades to the all-absent
            // shape exactly as before).
            const readBatch = ((await ipcPrefs.getMany([
              'lastSessionFolders',
              'lastSessionTabs',
              'lastSessionActive',
              'lastSessionFormats'
            ]).catch(() => null)) || {})
            const readList = (key) => {
              const value = readBatch[key]
              return Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x) : []
            }
            const tabs = readList('lastSessionTabs')
            const folders = readList('lastSessionFolders')
            const activeRaw = readBatch.lastSessionActive
            const formatsRaw = readBatch.lastSessionFormats
            const active = typeof activeRaw === 'string' && activeRaw ? activeRaw : null
            const { formats, rejected } = captureSessionFormats(formatsRaw, tabs)
            if (rejected) this._notifyFormatError('MT_ENC_INVALID_POLICY')
            if (tabs.length) this.coldStartSession = { tabs, folders, active, formats }
          }
        }
      } finally {
        this.START_SESSION_AUTOSAVE()
      }
    },

    // Folders first (OPEN_RECENT_FOLDER), then the files through the
    // normal open path (mt::open-file: encoding, line endings, watcher) in
    // the saved order, then the saved active tab. Missing paths are
    // skipped. Also the welcome screen «Last session» action.
    async RESTORE_SESSION({ from: rawFrom } = {}) {
      const projectStore = useProjectStore()
      // Hardened shape check: a malformed frozen
      // payload falls back to the live-preference path instead of
      // throwing mid-restore.
      const from = rawFrom && Array.isArray(rawFrom.tabs) ? rawFrom : null
      // `from` restores a frozen payload (the cold-start offer) instead
      // of rereading the live autosaved preferences — the session
      // autosave legitimately rewrites them during the run, and the
      // offer must reopen exactly what it advertises. The automatic
      // startup path passes nothing and reads the preferences as before.
      // C-SESSION-DURABILITY: the live path reads the four-key profile as
      // ONE batched request — the mt_prefs_get_many read mirror of the
      // write batch (one backend mutex acquisition, absent keys as null,
      // strictly read-only). A getMany rejection degrades to the
      // all-absent shape (tabs/folders empty lists, active/formats null)
      // — identical to today's total-transport-failure behavior. The
      // frozen-payload path (`from`) keeps reading NO preferences.
      const readBatch = from
        ? {}
        : ((await ipcPrefs.getMany([
            'lastSessionFolders',
            'lastSessionTabs',
            'lastSessionActive',
            'lastSessionFormats'
          ]).catch(() => null)) || {})
      const readList = (key) => {
        if (from) {
          if (key === 'lastSessionTabs') return [...from.tabs]
          if (key === 'lastSessionFolders') return [...(from.folders || [])]
          return []
        }
        const value = readBatch[key]
        return Array.isArray(value) ? value.filter((p) => typeof p === 'string' && p) : []
      }
      const exists = async (path, kind) => {
        try {
          const stat = await ipcFs.stat(path)
          return kind === 'dir' ? !!stat.isDirectory : !!stat.isFile
        } catch {
          return false
        }
      }
      const folders = readList('lastSessionFolders')
      const paths = readList('lastSessionTabs')
      const active = from ? (from.active || null) : (readBatch.lastSessionActive ?? null)
      const rawFormats = from ? from.formats : (readBatch.lastSessionFormats ?? null)
      const { formats, rejected } = captureSessionFormats(rawFormats, paths)
      // C-SESSION-DURABILITY: the per-tab format lookup is a Map keyed
      // by pathname (O(1) instead of the linear find inside the open
      // loop). Behavior-preserving: captureSessionFormats dedups by
      // pathname — documentFormat.js throws MT_ENC_INVALID_POLICY on a
      // duplicate pathname within the allowed set and adds a path to the
      // seen set only after a successful capture — so the list holds at
      // most one record per allowed pathname, and the Map answers
      // identically to the previous linear lookup for every input the list can contain
      // (records for paths outside the session's path list are rejected
      // upstream and never enter it).
      const formatsByPath = new Map(formats.map((record) => [record.pathname, record]))
      if (rejected) this._notifyFormatError('MT_ENC_INVALID_POLICY')
      let skipped = 0
      let restoredFolders = 0
      let restoredTabs = 0
      // C-MULTI-SOURCE-WORKSPACE: unavailable roots degrade VISIBLY — the
      // notice lists them, they stay in prefs (so they return when the
      // drive/iCloud account comes back), and the remaining roots, tabs
      // and the active tab still restore.
      const skippedFolders = []
      // C-SESSION-DURABILITY: ONE concurrent stat pass BEFORE the first
      // open — the folder candidates exclude already-open roots exactly
      // as today, and the per-path verdict semantics are the unchanged
      // exists helper (isDirectory for folders, isFile for files, any
      // rejection to false, via the ipcFs.stat transport). The loops
      // below consume the precomputed verdicts with the identical skip
      // counting, visible degradation notice, open order and active-tab
      // handling.
      const folderCandidates = folders.filter(
        (folder) => !projectStore.projectTrees.some((r) => r.pathname === folder)
      )
      const [folderVerdicts, fileVerdicts] = await Promise.all([
        Promise.all(folderCandidates.map((folder) => exists(folder, 'dir'))),
        Promise.all(paths.map((p) => exists(p, 'file')))
      ])
      const dirAlive = new Map(folderCandidates.map((folder, i) => [folder, folderVerdicts[i]]))
      const fileAlive = new Map(paths.map((p, i) => [p, fileVerdicts[i]]))
      for (const folder of folders) {
        if (projectStore.projectTrees.some((r) => r.pathname === folder)) continue
        if (!dirAlive.get(folder)) {
          skipped++
          skippedFolders.push(folder)
          continue
        }
        await projectStore.OPEN_RECENT_FOLDER(folder)
        restoredFolders++
      }
      for (const p of paths) {
        if (!fileAlive.get(p)) { skipped++; continue }
        try {
          const record = formatsByPath.get(p)
          const options = record ? { restoredFormat: captureRestoredFormat(record) } : {}
          await window.electron.ipcRenderer.invoke('mt::open-file', p, options)
          restoredTabs++
        } catch (e) {
          skipped++
          notice.notify({
            title: i18n.global.t('workspace.fileOpenFailedTitle'),
            message: String(e),
            type: 'error',
            time: 20000
          })
        }
      }
      if (typeof active === 'string' && active) {
        // mt::open-file answers with an mt::open-new-tab event; wait for
        // the tab to land before selecting it. C-FILE-POSITION-MEMORY:
        // opens are async, so ALSO drain the in-flight counter first —
        // the invoke above resolves before the arrival handler finishes,
        // and a landing UPDATE_CURRENT_FILE from the last opened tab
        // would otherwise steal the selection right after it (the review
        // wave's session-restore active-tab race).
        for (let i = 0; i < 80; i++) {
          const tab = this.tabs.find((t) => t.pathname === active)
          if (tab && (this._opensInFlight || 0) === 0) {
            if (this.currentFile !== tab) this.UPDATE_CURRENT_FILE(tab)
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }
      const result = { folders: restoredFolders, tabs: restoredTabs, skipped }
      // C-FIX-009-SESSION-COLD-START: a successful explicit restore
      // consumes the welcome offer so the row cannot advertise a
      // snapshot that is already open.
      if (result.folders + result.tabs > 0) this.coldStartSession = null
      console.debug(
        `[EditorStore][bootSession][BLOCK_SESSION_RESTORED] folders=${restoredFolders} tabs=${restoredTabs} skipped=${skipped}`
      )
      // C-MULTI-SOURCE-WORKSPACE: unavailable roots degrade VISIBLY —
      // the honest notice lists them (copy promises nothing about them
      // staying in the session).
      if (skippedFolders.length > 0) {
        notice.notify({
          title: i18n.global.t('workspace.restoreSkippedFoldersTitle'),
          message: i18n.global.t('workspace.restoreSkippedFolders', {
            paths: skippedFolders.join(', ')
          }),
          type: 'warning',
          time: 10000
        })
      }
      return result
    },
    // END_BLOCK_SESSION_RESTORE

    async GET_RECENT_FILES() {
      try {
        return await ipcRecent.list()
      } catch {
        return []
      }
    },

    async GET_SESSION_PATHS() {
      try {
        const paths = await ipcPrefs.get('lastSessionTabs')
        if (Array.isArray(paths)) return paths.filter(Boolean)
        return []
      } catch {
        return []
      }
    },

    LISTEN_FOR_CLOSE() {
      window.electron.ipcRenderer.on('mt::ask-for-close', () => this.REQUEST_DOCUMENT_OPERATION({
        kind:'window-close',commit:() => this._commitDocumentWindow('mt_close_window')
      }))
    },

    ASK_FOR_SAVE_ALL(closeTabs) {
      return this.REQUEST_DOCUMENT_OPERATION({kind:closeTabs?'close-all':'save-all',
        commit:owners => this._commitDocumentTabs(owners)})
    },

    async MOVE_FILE_TO() {
      if (this.tabs.some(tab=>this._documentOperations().isBusy(documentOwner(tab)))) {
        this._notifyDocumentOperation({status:'blocked',reason:'busy',affectedOwners:this.tabs.map(documentOwner)},{kind:'save',owners:[documentOwner(this.currentFile)]})
        return
      }
      const { id, pathname } = this.currentFile
      if (!id) return
      if (!pathname) {
        await this.FILE_SAVE_AS()
        return
      }
      const releasePath=this._documentOperations().reservePathChange([documentOwner(this.currentFile)])
      if(!releasePath) return
      try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const destDir = await open({ directory: true, multiple: false })
      if (!destDir) return

      const filename = window.path.basename(pathname)
      const newPathname = window.path.join(destDir, filename)
      try {
        await window.fileUtils.move(pathname, newPathname)
        // The rename flows (RENAME / RENAME_IF_NEEDED) move the same
        // per-file state — the move-to flow must not leave it parked on
        // the old directory.
        moveTableLayoutsEntry(pathname, newPathname).catch(e =>
          console.warn(`[editor][rename][BLOCK_TABLE_LAYOUTS_MOVE_FAILED] ${e}`)
        )
        // C-FILE-POSITION-MEMORY: the remembered position follows the move.
        moveFilePositionsEntry(pathname, newPathname).catch(e =>
          console.warn(`[editor][rename][BLOCK_POSITION_MOVE_FAILED] ${e}`)
        )
        // C-PAGE-WIDTH-TABLES: the remembered page width — and the pinned
        // per-document theme inside the same entry — follows the move.
        movePageWidthEntry(pathname, newPathname).catch(e =>
          console.warn(`[editor][rename][BLOCK_PAGE_WIDTH_MOVE_FAILED] ${e}`)
        )
        const moved=this.tabs.find(tab=>tab.id===id && tab.pathname===pathname)
        if(moved) { moved.pathname=newPathname; moved.filename=filename }
        if(this.currentFile.id===id && moved) window.DIRNAME=window.path.dirname(newPathname)
      } catch (e) {
        notice.notify({
          title: 'Move failed',
          type: 'error',
          message: String(e)
        })
      }
      } finally { releasePath() }
    },

    LISTEN_FOR_MOVE_TO() {
      // IPC listener lives in bootstrap-ipc.js; bus subscription only.
      bus.on('mt::editor-move-file', () => {
        this.MOVE_FILE_TO()
      })
    },

    /**
     * IPC listener moved to bootstrap-ipc.js; bus subscription stays.
     */
    LISTEN_FOR_RENAME() {
      bus.on('mt::editor-rename-file', () => {
        this.RESPONSE_FOR_RENAME()
      })
    },

    /**
     * Untitled file → save-as flow; existing file → bus.emit('rename')
     * so the title-bar inline-rename UI takes over.
     */
    async RESPONSE_FOR_RENAME() {
      const { id, pathname } = this.currentFile
      if (!id) return
      if (!pathname) {
        await this.FILE_SAVE_AS()
      } else {
        bus.emit('rename')
      }
    },

    async RENAME(newFilename) {
      if (this.tabs.some(tab=>this._documentOperations().isBusy(documentOwner(tab)))) {
        this._notifyDocumentOperation({status:'blocked',reason:'busy',affectedOwners:this.tabs.map(documentOwner)},{kind:'save',owners:[documentOwner(this.currentFile)]})
        return
      }
      const { id, pathname, filename } = this.currentFile
      if (typeof filename !== 'string' || filename === newFilename) return
      const newPathname = window.path.join(window.path.dirname(pathname), newFilename)
      const releasePath=this._documentOperations().reservePathChange([documentOwner(this.currentFile)])
      if(!releasePath) return
      try {
        await window.fileUtils.move(pathname, newPathname)
        // C-65 R-2: the stored table layouts follow the rename (the
        // sidebar rename path moves them in RENAME_IF_NEEDED).
        moveTableLayoutsEntry(pathname, newPathname).catch(e =>
          console.warn(`[editor][rename][BLOCK_TABLE_LAYOUTS_MOVE_FAILED] ${e}`)
        )
        // C-FILE-POSITION-MEMORY: the remembered position follows the rename.
        moveFilePositionsEntry(pathname, newPathname).catch(e =>
          console.warn(`[editor][rename][BLOCK_POSITION_MOVE_FAILED] ${e}`)
        )
        // C-PAGE-WIDTH-TABLES: the remembered page width — and the pinned
        // per-document theme inside the same entry — follows the rename.
        movePageWidthEntry(pathname, newPathname).catch(e =>
          console.warn(`[editor][rename][BLOCK_PAGE_WIDTH_MOVE_FAILED] ${e}`)
        )
        const renamed=this.tabs.find(tab=>tab.id===id && tab.pathname===pathname)
        if (renamed) { renamed.pathname=newPathname; renamed.filename=newFilename }
        if (this.currentFile.id===id && renamed) window.DIRNAME=window.path.dirname(newPathname)
      } catch (e) {
        notice.notify({
          title: 'Rename failed',
          type: 'error',
          message: String(e)
        })
      }
      finally { releasePath() }
    },

    UPDATE_CURRENT_FILE(currentFile) {
      if (this.documentWindowClosing) return false
      const oldCurrentFile = this.currentFile
      if (!oldCurrentFile.id || oldCurrentFile.id !== currentFile.id) {
        if (oldCurrentFile.splitSession?.unified) bus.emit('split:before-tab-change')
        const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor, contentReloaded } =
          currentFile
        window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
        this.currentFile = currentFile

        if (!this.tabs.some((file) => file.id === currentFile.id)) {
          this.tabs.push(currentFile)
          if (!_bootPhase) this.updateTabIdToIndex()
        }

        if (!_bootPhase) {
          bus.emit('file-changed', {
            id,
            markdown,
            cursor,
            muyaIndexCursor,
            renderCursor: true,
            history,
            scrollTop,
            // Forward a live-reload stamp so activating a background-reloaded
            // tab clamps the stale offset (C-2 follow-up), then consume it.
            contentReloaded: !!contentReloaded,
            blocks
          })
          if (contentReloaded) currentFile.contentReloaded = false
        }
      }

      if (!_bootPhase) this.UPDATE_LINE_ENDING_MENU()
    },

    END_BOOT_PHASE() {
      if (!_bootPhase) return
      _bootPhase = false
      // eslint-disable-next-line no-console
      console.log(`[boot][editor][BLOCK_BOOT_PHASE_ENDED tabs=${this.tabs.length}]`)
      this.updateTabIdToIndex()
      this.UPDATE_LINE_ENDING_MENU()
    },

    // This events are only used during window creation.
    LISTEN_FOR_BOOTSTRAP_WINDOW() {
      const preferencesStore = usePreferencesStore()
      const layoutStore = useLayoutStore()
      const projectStore = useProjectStore()
      const mainStore = useMainStore()

      // Delay load runtime commands and initialize commands.
      setTimeout(() => {
        bus.emit('cmd::register-command', new FileEncodingCommand(this))
        bus.emit(
          'cmd::register-command',
          new QuickOpenCommand({
            editor: this,
            preferences: preferencesStore,
            project: projectStore
          })
        )
        bus.emit('cmd::register-command', new LineEndingCommand(this))
        bus.emit('cmd::register-command', new TrailingNewlineCommand(this))

        setTimeout(() => {
          window.electron.ipcRenderer.send('mt::request-keybindings')
          bus.emit('cmd::sort-commands')
        }, 100)
      }, 400)

      // mt::bootstrap-editor listener lives in bootstrap-ipc.js —
      // it calls APPLY_BOOTSTRAP_EDITOR below.
    },

    /**
     * Applies the boot-time editor configuration blast (sidebar/tabbar
     * visibility, source-code mode, initial tabs). Called from the
     * bootstrap-ipc.js mt::bootstrap-editor listener. Idempotent
     * enough to be re-played by tests.
     */
    APPLY_BOOTSTRAP_EDITOR(config) {
      const {
        addBlankTab,
        markdownList,
        lineEnding,
        sideBarVisibility,
        tabBarVisibility,
        sourceCodeModeEnabled
      } = config || {}

      const mainStore = useMainStore()
      const preferencesStore = usePreferencesStore()
      const layoutStore = useLayoutStore()

      window.electron.ipcRenderer.send('mt::window-initialized')
      mainStore.SET_INITIALIZED()
      preferencesStore.SET_USER_PREFERENCE({ endOfLine: lineEnding })
      layoutStore.SET_LAYOUT({
        rightColumn: 'files',
        showSideBar: !!sideBarVisibility,
        showTabBar: !!tabBarVisibility
      })
      layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
      // C-40 T-005: preferences hydrated in app.vue onMounted (before
      // the ~500 ms bootstrap-editor round-trip) and the layout settled
      // just above — push the effective state of the four native
      // View-menu check items once. Best-effort (failures warn inside
      // util/menuChecks); the app.vue watchers cover every later change.
      void syncViewMenuChecks()
      layoutStore.REQUEST_INITIAL_WINDOW_RESIZE()
      preferencesStore.SET_MODE({
        type: 'sourceCode',
        checked: !!sourceCodeModeEnabled
      })

      // C-69: a cold launch without files reopens the last session (the
      // welcome screen shows when nothing came back).
      void this.BOOT_SESSION({ restore: !!addBlankTab })
      if (addBlankTab) {
        // Welcome screen shows when no tabs are open — skip blank tab
      } else if (Array.isArray(markdownList) && markdownList.length) {
        let isFirst = true
        for (const markdown of markdownList) {
          this.NEW_UNTITLED_TAB({ markdown, selected: isFirst })
          isFirst = false
        }
      }
    },

    /**
     * open-new-tab + new-untitled-tab IPC listeners live in
     * bootstrap-ipc.js. Bus subscription kept inline since it doesn't
     * cross IPC. Action stays as a no-op alias for app.vue.
     */
    LISTEN_FOR_NEW_TAB() {
      bus.on('mt::new-untitled-tab', ({ selected = true, markdown = '' }) => {
        this.NEW_UNTITLED_TAB({ markdown, selected })
      })
    },

    /**
     * C-40 G-3: bus entry point for opening the Mark Guide (Help › Mark
     * Guide menu, help.guide command palette entry, welcome screen link).
     * The payload may carry a { section } key (GUIDE_SECTION_CONNECT_AGENT)
     * to scroll the guide to after opening.
     */
    LISTEN_FOR_OPEN_GUIDE() {
      bus.on('mt::open-guide', async (payload = {}) => {
        // eslint-disable-next-line no-console
        console.log(`[editor][guide][BLOCK_GUIDE_REQUESTED section=${payload?.section || 'top'}]`)
        try {
          const locale = i18n.global.locale?.value || 'en'
          const markdown = await loadGuideMarkdown(locale)
          await this.OPEN_GUIDE_TAB({ markdown, section: payload?.section })
        } catch (e) {
          console.warn('[editor][guide][BLOCK_GUIDE_LOAD_FAILED]', e)
        }
      })
    },

    CLOSE_TAB(file = null) {
      const target=file || this.currentFile
      if (!target?.id) return Promise.resolve({status:'completed',affectedOwners:[]})
      return this.REQUEST_DOCUMENT_OPERATION({kind:'close',owners:[documentOwner(target)],
        commit:owners=>this._commitDocumentTabs(owners)})
    },

    _commitDocumentTabs(owners) {
      // Remove inactive owners first so a dying batch never renders an intermediate owner.
      const tabs=owners.map(owner=>this.tabs.find(t=>t.id===owner.id && t.documentToken===owner.documentToken)).filter(Boolean)
      tabs.sort((a,b)=>Number(a.id===this.currentFile.id)-Number(b.id===this.currentFile.id))
      tabs.forEach(tab=>this.FORCE_CLOSE_TAB(tab))
    },

    /**
     * close-tab / tab-cycle / switch-tab IPC listeners live in
     * bootstrap-ipc.js. Bus subscriptions kept inline since they
     * don't cross IPC.
     */
    LISTEN_FOR_CLOSE_TAB() {
      bus.on('mt::editor-close-tab', () => {
        this.CLOSE_TAB()
      })
    },

    LISTEN_FOR_TAB_CYCLE() {
      bus.on('mt::tabs-cycle-left', () => {
        this.CYCLE_TABS(false)
      })
      bus.on('mt::tabs-cycle-right', () => {
        this.CYCLE_TABS(true)
      })
    },

    // C-FIX-009-RECENTLY-CLOSED: File › Reopen Closed Tab (Shift+Cmd/Ctrl+T)
    // reopens the newest closed entry; an empty history is a quiet no-op
    // (the chord is never stolen from the editor). The Reopen-all active
    // selection arrives on the same channel family.
    LISTEN_FOR_REOPEN_CLOSED() {
      bus.on('mt::editor-reopen-closed-tab', () => {
        void useRecentlyClosedStore().REOPEN_NEWEST()
      })
      bus.on('mt::recently-closed-select', async ({ pathname } = {}) => {
        if (typeof pathname !== 'string' || !pathname) return
        // Same wait shape as RESTORE_SESSION's active-tab selection.
        for (let i = 0; i < 40; i++) {
          const tab = this.tabs.find((t) => t.pathname === pathname)
          if (tab) {
            if (this.currentFile !== tab) this.UPDATE_CURRENT_FILE(tab)
            return
          }
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      })
    },

    FORCE_CLOSE_TAB(file) {
      const { tabs, currentFile } = this
      const index = tabs.findIndex((t) => t.id === file.id)
      if (index > -1) {
        // C-FILE-POSITION-MEMORY (corner C-7): flush the reading position
        // BEFORE the splice — an instant close right after a scroll must
        // persist the final offset, not wait for the 1.5 s debounce.
        void this._flushFilePositionForTab(file)
        // C-FIX-009-RECENTLY-CLOSED: record BEFORE the splice so
        // stripIndex is the tab's original position. Only saved-file
        // tabs (pathname) are recoverable — untitled drafts stay outside
        // by owner decision.
        if (file.pathname) {
          const projectStore = useProjectStore()
          const root =
            (projectStore.projectTrees || []).find((r) => file.pathname.startsWith(r.pathname))
              ?.pathname || ''
          useRecentlyClosedStore().RECORD_CLOSE({
            pathname: file.pathname,
            filename: file.filename,
            stripIndex: index,
            wasActive: file.id === currentFile.id,
            root,
            closedAt: Date.now(),
            ...(() => { try { return { restoredFormat: captureFormatChoice(file) } } catch { return {} } })()
          })
        }
        tabs.splice(index, 1)
        this.updateTabIdToIndex()
        // C-SURFACE-OWNERSHIP: closing a streamed tab kills its active
        // binding synchronously with the splice — no dangling binding
        // survives pointing at the dead tabId until the lazy PATCH heal.
        if (this.liveDocument?.active && this.liveDocument.tabId === file.id) {
          this._deactivateLiveDocument(this.liveDocument)
        }
      }

      if (file.id && autoSaveTimers.has(file.id)) {
        const timer = autoSaveTimers.get(file.id)
        clearTimeout(timer)
        autoSaveTimers.delete(file.id)
      }

      // C-43: the snapshot ring is tab-scoped — it dies with the tab
      // (re-opening the file starts a fresh history).
      if (file.id) {
        clearSnapshots(file.id)
      }

      if (file.pathname) {
        this._unsubscribeFileWatch(file.pathname)
      }

      this.updateTabIdToIndex() // Update before sending it out to prevent stale mappings.

      if (file.id === currentFile.id) {
        const fileState = this.tabs[index] || this.tabs[index - 1] || this.tabs[0] || {}
        this.currentFile = fileState
        if (typeof fileState.markdown === 'string') {
          const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor, contentReloaded } =
            fileState
          window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
          bus.emit('file-changed', {
            id,
            markdown,
            cursor,
            muyaIndexCursor,
            renderCursor: true,
            history,
            scrollTop,
            // Forward a live-reload stamp so the fallback activation clamps
            // the stale offset (C-2 follow-up), then consume it.
            contentReloaded: !!contentReloaded,
            blocks
          })
          if (contentReloaded) fileState.contentReloaded = false
        } else {
          window.DIRNAME = ''
        }
      }

      if (this.tabs.length === 0) {
        this.listToc = []
        this.toc = []
      }

      const { pathname } = file
      if (pathname) {
        window.electron.ipcRenderer.send('mt::window-tab-closed', pathname)
      }
    },

    CLOSE_UNSAVED_TAB(file) { return this.CLOSE_TAB(file) },

    CLOSE_OTHER_TABS(file) {
      return this.REQUEST_DOCUMENT_OPERATION({kind:'close-others',owners:this.tabs.filter(t=>t.id!==file.id).map(documentOwner),
        commit:owners=>this._commitDocumentTabs(owners)})
    },

    CLOSE_SAVED_TABS() {
      return this.REQUEST_DOCUMENT_OPERATION({kind:'close-all',owners:this.tabs.filter(t=>t.isSaved).map(documentOwner),
        commit:owners=>this._commitDocumentTabs(owners)})
    },

    CLOSE_ALL_TABS() {
      return this.REQUEST_DOCUMENT_OPERATION({kind:'close-all',commit:owners=>this._commitDocumentTabs(owners)})
    },

    CLOSE_TABS(tabIdList) {
      if (!tabIdList || tabIdList.length === 0) return

      let tabIndex = 0
      tabIdList.forEach((id) => {
        const index = this.tabs.findIndex((f) => f.id === id)
        if (index === -1) return

        const { pathname } = this.tabs[index]

        if (pathname) {
          window.electron.ipcRenderer.send('mt::window-tab-closed', pathname)
        }

        // C-FILE-POSITION-MEMORY: flush the remembered position before the
        // tab dies — this id-list path (mt::close-tabs, save-and-close
        // flows) is a close boundary exactly like FORCE_CLOSE_TAB.
        void this._flushFilePositionForTab(this.tabs[index])

        this.tabs.splice(index, 1)
        if (this.currentFile.id === id) {
          this.currentFile = {}
          window.DIRNAME = ''
          if (tabIdList.length === 1) {
            tabIndex = index
          }
        }
      })

      this.updateTabIdToIndex() // Update before sending it out to prevent stale mappings.

      if (!this.currentFile.id && this.tabs.length > 0) {
        this.currentFile = this.tabs[tabIndex] || this.tabs[tabIndex - 1] || this.tabs[0] || {}
        if (typeof this.currentFile.markdown === 'string') {
          const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor, contentReloaded } =
            this.currentFile
          window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
          bus.emit('file-changed', {
            id,
            markdown,
            cursor,
            muyaIndexCursor,
            renderCursor: true,
            history,
            scrollTop,
            // Forward a live-reload stamp so the fallback activation clamps
            // the stale offset (C-2 follow-up), then consume it.
            contentReloaded: !!contentReloaded,
            blocks
          })
          if (contentReloaded) this.currentFile.contentReloaded = false
        }
      }

      if (this.tabs.length === 0) {
        this.listToc = []
        this.toc = []
      }
    },

    EXCHANGE_TABS_BY_ID(tabIDs) {
      const { fromId, toId } = tabIDs
      const { tabs } = this
      const moveItem = (arr, from, to) => {
        if (from === to) return true
        const len = arr.length
        const item = arr.splice(from, 1)
        if (item.length === 0) return false

        arr.splice(to, 0, item[0])
        return arr.length === len
      }

      const fromIndex = tabs.findIndex((t) => t.id === fromId)
      if (fromIndex === -1) return

      if (!toId) {
        moveItem(tabs, fromIndex, tabs.length - 1)
      } else {
        const toIndex = tabs.findIndex((t) => t.id === toId)
        if (toIndex === -1) return
        const realToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
        moveItem(tabs, fromIndex, realToIndex)
      }
      this.updateTabIdToIndex()
    },

    RENAME_FILE(file) {
      this.UPDATE_CURRENT_FILE(file)
      bus.emit('rename')
    },

    // C-4: the file at `src` was renamed on disk (sidebar rename). Every
    // tab of that file follows to `dest` and its per-file watcher moves
    // with it. No bus 'rename' here — that channel opens the rename dialog.
    RENAME_IF_NEEDED({ src, dest }) {
      this.tabs.forEach(tab=> { if(this._documentOperations().isBusy(documentOwner(tab))) this._documentOperations().invalidate(documentOwner(tab)) })
      const moved = this.tabs.filter((t) => window.fileUtils.isSamePathSync(t.pathname, src))
      if (moved.length === 0) return
      const oldPathname = moved[0].pathname
      const filename = window.path.basename(dest)
      for (const tab of moved) {
        tab.pathname = dest
        tab.filename = filename
      }
      if (moved.some((t) => t.id === this.currentFile.id)) {
        window.DIRNAME = window.path.dirname(dest)
      }
      // No tab is left on the old path, so this drops its watcher and its
      // live-reload generation; the new path gets a fresh subscription.
      renameEchoUntil.set(dest, Date.now() + RENAME_ECHO_WINDOW_MS)
      this._unsubscribeFileWatch(oldPathname)
      this._subscribeFileWatch(dest)
      // C-65 R-2: the sidebar rename moves the stored table layouts with
      // the file (the title-bar rename does it in RENAME).
      moveTableLayoutsEntry(src, dest).catch(e =>
        console.warn(`[editor][rename][BLOCK_TABLE_LAYOUTS_MOVE_FAILED] ${e}`)
      )
      // C-FILE-POSITION-MEMORY: the remembered position follows the rename.
      moveFilePositionsEntry(src, dest).catch(e =>
        console.warn(`[editor][rename][BLOCK_POSITION_MOVE_FAILED] ${e}`)
      )
      // C-PAGE-WIDTH-TABLES: the remembered page width — and the pinned
      // per-document theme inside the same entry — follows the rename.
      movePageWidthEntry(src, dest).catch(e =>
        console.warn(`[editor][rename][BLOCK_PAGE_WIDTH_MOVE_FAILED] ${e}`)
      )
      console.debug(`[editor][rename][BLOCK_TABS_FOLLOWED tabs=${moved.length}]`)
    },

    // Direction is a boolean where false is left and true right.
    CYCLE_TABS(direction) {
      const { tabs, currentFile } = this
      if (tabs.length <= 1) {
        return
      }

      const currentIndex = tabs.findIndex((t) => t.id === currentFile.id)
      if (currentIndex === -1) {
        console.error('CYCLE_TABS: Cannot find current tab index.')
        return
      }

      let nextTabIndex = 0
      if (!direction) {
        // Switch tab to the left.
        nextTabIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1
      } else {
        // Switch tab to the right.
        nextTabIndex = (currentIndex + 1) % tabs.length
      }

      const nextTab = tabs[nextTabIndex]
      if (!nextTab || !nextTab.id) {
        console.error(`CYCLE_TABS: Cannot find next tab (index="${nextTabIndex}").`)
        return
      }

      this.UPDATE_CURRENT_FILE(nextTab)
    },

    SWITCH_TAB_BY_FILEPATH(filePath) {
      const { tabs } = this

      if (!filePath) {
        console.warn('Invalid file path:', filePath)
        return
      }

      const nextTabIndex = tabs.findIndex((t) => t.pathname === filePath)
      if (nextTabIndex === -1) {
        console.error('Cannot find tab with pathname:', filePath)
        return
      }
      this.UPDATE_CURRENT_FILE(tabs[nextTabIndex])
    },

    SWITCH_TAB_BY_INDEX(nextTabIndex) {
      const { tabs, currentFile } = this
      if (nextTabIndex < 0 || nextTabIndex >= tabs.length) {
        console.warn('Invalid tab index:', nextTabIndex)
        return
      }

      const currentIndex = tabs.findIndex((t) => t.id === currentFile.id)
      if (currentIndex === -1) {
        console.error('Cannot find current tab index.')
        return
      }

      const nextTab = tabs[nextTabIndex]
      if (!nextTab || !nextTab.id) {
        console.error(`Cannot find tab by index="${nextTabIndex}".`)
        return
      }
      this.UPDATE_CURRENT_FILE(nextTab)
    },

    /**
     * Create a new untitled tab optional from a markdown string.
     *
     * @param {*} _ The store context - not used.
     * @param {{markdown?: string, selected?: boolean}} obj Optional markdown string
     * and whether the tab should become the selected tab (true if not set).
     */
    NEW_UNTITLED_TAB({ markdown: markdownString, selected }) {
      if (this.documentWindowClosing) return false
      if (selected == null) {
        selected = true
      }


      const preferencesStore = usePreferencesStore()
      const { defaultEncoding, endOfLine } = preferencesStore
      let fileState
      try { fileState = getBlankFileState(this.tabs, defaultEncoding, endOfLine, markdownString) }
      catch (error) { this._notifyFormatError(error.message); return false }
      this.SHOW_TAB_VIEW(false)

      if (selected) {
        const { id, markdown } = fileState
        this.UPDATE_CURRENT_FILE(fileState)
        bus.emit('file-loaded', { id, markdown })
      } else {
        this.tabs.push(fileState)
        this.updateTabIdToIndex()
      }
    },

    // C-SURFACE-OWNERSHIP: the one live-document closure path. Every
    // closure entry that ends an active binding deactivates it here —
    // FORCE_CLOSE_TAB (synchronously with the tab splice) and
    // _commitDocumentWindow (on the committed window close) eagerly;
    // CLOSE_LIVE_DOCUMENT on the stream end. Count-only marker carrying
    // tab and session identifiers only — never document content or user
    // paths (console-privacy).
    _deactivateLiveDocument(binding) {
      if (!binding?.active) return
      binding.active = false
      // eslint-disable-next-line no-console
      console.debug(`[editor][live][BLOCK_LIVE_BINDING_DEACTIVATED tab=${binding.tabId} session=${binding.sessionId}]`)
    },

    // START_BLOCK_LIVE_DOCUMENT_OWNERSHIP
    OPEN_LIVE_DOCUMENT({ sessionId, sessionEpoch, markdown, title }) {
      if (this.documentWindowClosing || typeof sessionId !== 'string' || !sessionId ||
        !Number.isSafeInteger(sessionEpoch) || sessionEpoch <= 0 || typeof markdown !== 'string') return null
      const previous = this.liveDocument
      if (previous && sessionEpoch <= previous.sessionEpoch) return null
      let tab = previous?.active && previous.sessionId === sessionId
        ? this.tabs.find(tab => tab.id === previous.tabId) : null
      if (!tab) {
        const { defaultEncoding, endOfLine } = usePreferencesStore()
        try { tab = getBlankFileState(this.tabs, defaultEncoding, endOfLine, '') }
        catch (error) { this._notifyFormatError(error.message); return null }
        tab.requiresExplicitSave = true
        this.tabs.push(tab)
        this.updateTabIdToIndex()
        // Keep the Pinia-owned reference, not the unproxied factory object.
        tab = this.tabs.find(candidate => candidate.id === tab.id)
      }
      this.liveDocument = { sessionId, sessionEpoch, tabId: tab.id, revision: 0, active: true }
      tab.liveTitle = typeof title === 'string' ? title : ''
      this.PATCH_LIVE_DOCUMENT({ sessionId, sessionEpoch, revision: 1, markdown })
      // A resync updates its tab without stealing focus from another document.
      if (!previous?.active || previous.tabId !== tab.id) {
        this.SHOW_TAB_VIEW(false)
        this.UPDATE_CURRENT_FILE(tab)
      }
      return tab.id
    },

    PATCH_LIVE_DOCUMENT({ sessionId, sessionEpoch, revision, markdown }) {
      const binding = this.liveDocument
      if (!binding?.active || binding.sessionId !== sessionId || binding.sessionEpoch !== sessionEpoch ||
        !Number.isSafeInteger(revision) || revision <= binding.revision || typeof markdown !== 'string') return false
      const tab = this.tabs.find(tab => tab.id === binding.tabId)
      if (!tab) { binding.active = false; return false }
      binding.revision = revision
      if (markdown !== tab.markdown) tab.contentRevision = (tab.contentRevision || 0) + 1
      tab.markdown = markdown
      tab.blocks = undefined
      tab.cursor = null
      tab.muyaIndexCursor = null
      tab.history = { stack: [], index: -1 }
      delete tab.splitSession
      tab.contentReloaded = true
      recomputeDocumentSaved(tab)
      // No content-change/autosave path: streamed bytes belong only to this tab.
      if (this.currentFile.id === tab.id) {
        bus.emit('file-changed', { id: tab.id, markdown, history: tab.history,
          cursor: null, muyaIndexCursor: null, contentReloaded: true, renderCursor: false })
        tab.contentReloaded = false
      }
      return true
    },

    CLOSE_LIVE_DOCUMENT({ sessionId, sessionEpoch }) {
      const binding = this.liveDocument
      if (!binding?.active || binding.sessionId !== sessionId || binding.sessionEpoch !== sessionEpoch) return false
      // C-SURFACE-OWNERSHIP: binding-only stream-end volume through the one
      // path — the streamed tab remains as a requiresExplicitSave document.
      this._deactivateLiveDocument(binding)
      return true
    },
    // END_BLOCK_LIVE_DOCUMENT_OWNERSHIP

    /**
     * C-40 G-3: open (or focus) the Mark Guide as a temporary untitled
     * tab. The guide is a pathname-less untitled tab, so nothing is ever
     * written to disk unless the user chooses Save As. Reopening focuses
     * the existing guide tab instead of making another one, and never
     * overwrites the user's edits in the living document.
     *
     * @param {*} _ The store context - not used.
     * @param {{markdown?: string, section?: string}} obj The localized
     * guide markdown (loaded from the bundled guide docs when omitted) and
     * an optional section key to scroll to after opening.
     */
    async OPEN_GUIDE_TAB({ markdown, section } = {}) {
      // START_BLOCK_GUIDE_TAB_REUSE
      // A guide the user saved under a real path is their document now
      // (C-40 review): only a still-pathless guide tab is reused.
      const existing = this.tabs.find((t) => t.isGuide && !t.pathname)
      if (existing) {
        this.UPDATE_CURRENT_FILE(existing)
      } else {
      // END_BLOCK_GUIDE_TAB_REUSE
        // START_BLOCK_GUIDE_TAB_CREATE
        let guideMarkdown = markdown
        if (typeof guideMarkdown !== 'string' || !guideMarkdown) {
          guideMarkdown = await loadGuideMarkdown(i18n.global.locale?.value || 'en')
        }
        this.SHOW_TAB_VIEW(false)

        const preferencesStore = usePreferencesStore()
        const { defaultEncoding, endOfLine } = preferencesStore
        let fileState
        try { fileState = getBlankFileState(this.tabs, defaultEncoding, endOfLine, guideMarkdown) }
        catch (error) { this._notifyFormatError(error.message); return false }
        this.SHOW_TAB_VIEW(false)
        fileState.filename = i18n.global.t('guide.tabTitle')
        fileState.isGuide = true

        const { id, markdown: loadedMarkdown } = fileState
        this.UPDATE_CURRENT_FILE(fileState)
        bus.emit('file-loaded', { id, markdown: loadedMarkdown })
        // eslint-disable-next-line no-console
        console.log(`[editor][guide][BLOCK_GUIDE_TAB_OPENED id=${id} locale=${i18n.global.locale?.value || 'en'}]`)
      // END_BLOCK_GUIDE_TAB_CREATE
      }

      // START_BLOCK_GUIDE_SCROLL_TO_SECTION
      // Optional deep link: scroll the freshly active guide tab to a
      // section heading. WYSIWYG headings carry id=<muya block key>, so
      // the heading text is matched against listToc (populated by muya's
      // change event shortly after file-loaded — hence the 300 ms delay);
      // an edited-away heading or a not-yet-built TOC quietly skips the
      // jump instead of emitting a dead anchor.
      if (section === GUIDE_SECTION_CONNECT_AGENT) {
        // The heading text comes from the pristine localized guide, never
        // from the user's edited copy: if the user deleted that heading,
        // listToc has no match and the jump is skipped (C-40 review).
        const source =
          typeof markdown === 'string' && markdown
            ? markdown
            : await loadGuideMarkdown(i18n.global.locale?.value || 'en')
        const headingText = getGuideSectionHeadingText(source, section)
        if (headingText) {
          setTimeout(() => {
            const item = (this.listToc || []).find(
              (i) => i.lvl === 2 && i.content === headingText
            )
            if (item) {
              bus.emit('scroll-to-header', item.slug)
              // eslint-disable-next-line no-console
              console.log(
                `[editor][guide][BLOCK_GUIDE_SCROLL_TO_SECTION heading=${headingText} slug=${item.slug}]`
              )
            }
          }, 300)
        }
      }
      // END_BLOCK_GUIDE_SCROLL_TO_SECTION
    },

    /**
     * Create a new tab from the given markdown document.
     *
     * @param {*} _ The store context - not used.
     * @param {{markdownDocument: IMarkdownDocumentRaw, selected?: boolean}} obj The markdown document
     * and optional whether the tab should become the selected tab (true if not set).
     */
    async NEW_TAB_WITH_CONTENT({ markdownDocument, options = {}, selected }) {
      if (this.documentWindowClosing) return false
      if (!markdownDocument) {
        console.warn('Cannot create a file tab without a markdown document!')
        this.NEW_UNTITLED_TAB({})
        return
      }

      if (typeof selected === 'undefined') {
        selected = true
      }

      // C-FILE-POSITION-MEMORY: opens are async; RESTORE_SESSION drains
      // this counter before selecting the restored active tab so a late
      // landing UPDATE_CURRENT_FILE cannot steal the selection.
      this._opensInFlight = (this._opensInFlight || 0) + 1
      try {
        const { pathname, markdown } = markdownDocument

        // START_BLOCK_POSITION_RESTORE
        // C-FILE-POSITION-MEMORY (spec D-4): every disk-open funnel — manual
        // open, recently-closed reopen, session restore at relaunch — passes
        // here, so the remembered position is applied to the tab state before
        // it is selected/pushed and flows through the existing activation
        // machinery (setMarkdown's muyaIndexCursor branch + scrollToCords).
        // The clamp keeps a stale entry inside the freshly loaded markdown
        // (corner C-5); the parallel file-loaded render cannot stomp it —
        // setMarkdownToEditor's identical-markdown early return skips the
        // cursor (corner C-4). Block-key cursors are session-scoped and never
        // persisted; muyaIndexCursor (line/ch) is the durable representation.
        // The await runs BEFORE any tab surgery: closing a saved blank tab
        // and activating the new one must stay in one synchronous run, or
        // Vue flushes a tab-less editor state between them and unmounts the
        // whole editor column (the review wave's boot-remount regression).
        let restored = null
        if (pathname) {
          try {
            const entry = await loadFilePosition(pathname)
            restored = entry ? clampEntryToMarkdown(entry, markdown) : null
          } catch (e) {
            console.warn(`[editor][position][BLOCK_POSITION_RESTORE_FAILED] ${e}`)
            restored = null
          }
        }
        // END_BLOCK_POSITION_RESTORE
        if (this.documentWindowClosing) return false

        const { currentFile, tabs } = this
        // Checked AFTER the await on purpose: two rapid arrivals for one
        // pathname (double-click, Finder burst) must not both push a tab —
        // the second open sees the first one's tab and just focuses it.
        const existingTab = tabs.find((t) => window.fileUtils.isSamePathSync(t.pathname, pathname))
        if (existingTab) {
          this.UPDATE_CURRENT_FILE(existingTab)
          return
        }

        let keepTabBarState = false
        if (currentFile) {
          const { isSaved, pathname, isGuide } = currentFile
          // Never auto-close the guide: an agent opening a file while the
          // user reads "Connect your agent" must not make it vanish.
          if (isSaved && !pathname && !isGuide) {
            keepTabBarState = true
            this.FORCE_CLOSE_TAB(currentFile)
          }
        }

        if (!keepTabBarState) {
          this.SHOW_TAB_VIEW(false)
        }

        const { isMixedLineEndings } = markdownDocument
        // Establish the current disk checkpoint before applying any restored choice.
        // Old session metadata can request a policy, never prove current disk bytes.
        const { restoredFormat, encoding, lineEnding, trimTrailingNewline, adjustLineEndingOnSave, isMixedLineEndings: ignoredMixed, ...viewOptions } = options
        const docState = createDocumentState({ ...markdownDocument, ...viewOptions })
        try {
          if (restoredFormat !== undefined) {
            const choice = captureRestoredFormat(restoredFormat)
            applyDocumentFormat(docState, choice.format)
            docState.requiresExplicitSave = choice.dirty
            recomputeDocumentSaved(docState)
          } else if (encoding !== undefined || lineEnding !== undefined || trimTrailingNewline !== undefined) {
            const choice = captureDocumentFormat({ ...docState, ...(encoding !== undefined ? { encoding } : {}),
              ...(lineEnding !== undefined ? { lineEnding, isMixedLineEndings: lineEnding === 'mixed' } : {}),
              ...(trimTrailingNewline !== undefined ? { trimTrailingNewline } : {}) })
            applyDocumentFormat(docState, choice)
          }
        } catch (error) { this._notifyFormatError(String(error.message)) }
        const { id, cursor } = docState

        if (restored) {
          if (restored.scrollTop > 0) docState.scrollTop = restored.scrollTop
          if (restored.muyaIndexCursor) docState.muyaIndexCursor = restored.muyaIndexCursor
        }

        // START_BLOCK_RECORD_OPENED_SNAPSHOT_LOAD
        // C-68 R-1: every disk load (open, reopen, session restore — they all
        // funnel through here) keeps one «opened» baseline so ⌘D can always
        // show what changed since the load. Untitled tabs have no pathname;
        // focusing an already-open file returned early above, so the original
        // opened time survives re-focuses.
        if (pathname) {
          recordOpenedSnapshot(id, markdown)
        }
        // END_BLOCK_RECORD_OPENED_SNAPSHOT_LOAD

        if (selected) {
          this.UPDATE_CURRENT_FILE(docState)
          if (!_bootPhase) bus.emit('file-loaded', { id, markdown, cursor })
          // FIX-002: phase-2 mark — the tab state exists and the load event
          // is out; the remaining leg to first paint lives in editor.vue.
          if (typeof window !== 'undefined' && typeof window.__openFileArrivalAt === 'number') {
            // eslint-disable-next-line no-console
            console.log(
              `[editor][open-file][BLOCK_OPEN_TAB_CREATED since_arrival_ms=${Math.round(performance.now() - window.__openFileArrivalAt)} id=${id}]`
            )
          }
        } else {
          if (!_bootPhase) this.updateTabIdToIndex()
          this.tabs.push(docState)
        }

        if (isMixedLineEndings) {
          this.pushTabNotification({
            tabId: id,
            msg: i18n.global.t('fileFormat.errors.mixed')
          })
        }

        if (pathname) {
          this._subscribeFileWatch(pathname)
          ipcRecent.add(pathname).catch(() => {})
        }
      } finally {
        this._opensInFlight = Math.max(0, (this._opensInFlight || 0) - 1)
      }
    },

    SHOW_TAB_VIEW(always) {
      const { tabs } = this
      const layoutStore = useLayoutStore()
      if (always || tabs.length === 1) {
        layoutStore.SET_LAYOUT({ showTabBar: true })
        layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
      }
    },

    SET_SAVE_STATUS_WHEN_REMOVE({ pathname }) {
      this.tabs.forEach((f) => {
        if (f.pathname === pathname) {
          f.isSaved = false
        }
      })
    },

    // A render-only split follow refreshes the parsed outline without a
    // content event, dirty revision, word-count pass or autosave echo.
    UPDATE_SPLIT_OUTLINE({ id, toc }) {
      if (id === this.currentFile.id && toc && !equal(toc, this.listToc)) {
        this.listToc = toc
        this.toc = listToTree(toc)
      }
    },

    // Content change from realtime preview editor and source code editor
    // There is a chance that this event is fired AFTER the tab is switched.
    LISTEN_FOR_CONTENT_CHANGE({
      id,
      markdown,
      wordCount,
      cursor,
      muyaIndexCursor,
      history,
      toc,
      blocks
    }) {
      const preferencesStore = usePreferencesStore()
      const { autoSave } = preferencesStore
      if (!id) {
        throw new Error('Listen for document change but id was not set!')
      } else if (this.tabs.length === 0) {
        return
      } else if (!(id in this.tabIdToIndex)) {
        // This only happens when the sourceCode tries to write a stale id via prepareTabSwitch() but the tab
        // has already been closed. In this case we can safely ignore the update.
        return
      }

      const tab = this.tabs[this.tabIdToIndex[id]]

      const { filename, pathname, markdown: oldMarkdown } = tab
      const changed = markdown !== oldMarkdown
      const emptyImport = oldMarkdown === '' && markdown === '\n'
      tab.markdown = markdown
      if (changed && !emptyImport) tab.contentRevision = (tab.contentRevision || 0) + 1

      // Only update TOC if it's the current file.
      // FIX-003 (2026-10-20): this sync must run BEFORE the empty-document
      // early return below — switching to a fresh untitled document emits
      // exactly that shape (markdown "\n", toc []), and the early return
      // used to swallow the TOC reset, leaving the outline of the
      // previously displayed (possibly closed) file on the right rail.
      if (id === this.currentFile.id && toc && !equal(toc, this.listToc)) {
        this.listToc = toc
        this.toc = listToTree(toc)
      }

      if (emptyImport) {
        if (tab.isSaved && !tab.requiresExplicitSave && tab.savedMarkdown === '') tab.savedMarkdown = markdown
        return
      }

      if (wordCount) tab.wordCount = wordCount
      if (cursor) tab.cursor = cursor
      if (muyaIndexCursor) tab.muyaIndexCursor = muyaIndexCursor
      if (history) tab.history = history
      if (blocks) tab.blocks = blocks

      recomputeDocumentSaved(tab)
      if (changed && !tab.isSaved && pathname && autoSave && !tab.requiresExplicitSave) {
        this.HANDLE_AUTO_SAVE({ id, filename, pathname, markdown, revision: tab.contentRevision, options: getOptionsFromState(tab) })
      }
    },

    HANDLE_AUTO_SAVE({ id, filename, pathname, markdown, options, revision: requestedRevision }) {
      if (!id || !pathname) {
        throw new Error('HANDLE_AUTO_SAVE: Invalid tab.')
      }

      const preferencesStore = usePreferencesStore()
      const projectStore = useProjectStore()
      const { autoSaveDelay } = preferencesStore

      if (autoSaveTimers.has(id)) {
        const timer = autoSaveTimers.get(id)
        clearTimeout(timer)
        autoSaveTimers.delete(id)
      }

      const timer = setTimeout(async () => {
        autoSaveTimers.delete(id)

        // START_BLOCK_AUTO_SAVE_DISABLED_AT_FIRE
        // The preference can change while this callback is debounced. Read
        // the live store again so disabling Auto Save also cancels work that
        // was already queued, without preventing a later save after re-enable.
        const currentPreferencesStore = usePreferencesStore()
        if (!currentPreferencesStore.autoSave) {
          return
        }
        // END_BLOCK_AUTO_SAVE_DISABLED_AT_FIRE

        const tab = this.tabs.find((t) => t.id === id)
        if (tab && !tab.isSaved && !tab.requiresExplicitSave) {
          if (!tab.pathname) return
          const owner=documentOwner(tab)
          if (this._documentOperations().isBusy(owner)) {
            this.HANDLE_AUTO_SAVE({id,pathname:tab.pathname})
            return
          }
          await this._documentOperations().save(owner)

        }
      }, autoSaveDelay)
      autoSaveTimers.set(id, timer)
    },

    SELECTION_CHANGE(changes) {
      const { start, end } = changes
      // Selection can prefill a closed Find bar. Once it is open, selection
      // belongs to editing/copying and must not trigger a new search render.
      if (!this.findVisible && start.key === end.key && start.offset !== end.offset && start.block.text) {
        const value = start.block.text.substring(start.offset, end.offset)
        this.currentFile.searchMatches = {
          matches: [],
          index: -1,
          value
        }
      }

      const { windowId } = window.marktext.env
      window.electron.ipcRenderer.send(
        'mt::editor-selection-changed',
        windowId,
        createApplicationMenuState(changes)
      )
    },

    SELECTION_FORMATS(formats) {
      const { windowId } = window.marktext.env
      window.electron.ipcRenderer.send(
        'mt::update-format-menu',
        windowId,
        createSelectionFormatState(formats)
      )
    },

    async EXPORT({ type, content, pageOptions, exportPin }) {
      if (!hasKeys(this.currentFile)) return

      // C-EXPORT-DOCUMENT-PIN: a pinned run refuses before any UI when the
      // pinned document no longer owns the active surface; the same
      // verification re-runs after the save dialog resolves and before any
      // write (post-dialog guard below / in the legs).
      if (exportPin && !(await this.assertExportPinCurrent(exportPin))) return

      if (type === 'pdf') {
        // C-61 R-2: the print container rendered by handleExport stays in
        // the DOM while the save dialog is up; the caller clears it when
        // this resolves (saved, cancelled, or notified failure).
        await this._EXPORT_PDF(pageOptions, exportPin)
        return
      }

      // C-NATIVE-DOCX-RTF-EXPORT R-1: modal-less Word export — the save
      // dialog is the first and only UI; geometry comes from the
      // captured options supplied by the renderer pipeline.
      if (type === 'docx') {
        await this._EXPORT_DOCX(content, pageOptions, exportPin)
        return
      }

      let title = ''
      if (exportPin) {
        // C-EXPORT-DOCUMENT-PIN: the pinned first-heading fallback; no live
        // currentFile re-read in a pinned run.
        title = exportPin.firstHeading || ''
      } else {
        const { listToc } = this
        if (listToc && listToc.length > 0) {
          let headerRef = listToc[0]
          const len = Math.min(listToc.length, 6)
          for (let i = 1; i < len; ++i) {
            if (headerRef.lvl === 1) break
            const header = listToc[i]
            if (headerRef.lvl > header.lvl) {
              headerRef = header
            }
          }
          title = headerRef.content
        }
      }

      const filename = exportPin ? exportPin.filename : this.currentFile.filename
      const defaultName = filename
        ? filename.replace(/\.md$/i, '.html')
        : (title || 'export') + '.html'

      const { save } = await import('@tauri-apps/plugin-dialog')
      const filePath = await save({
        title: 'Export HTML',
        defaultPath: defaultName,
        filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
      })
      if (!filePath) return

      // C-EXPORT-DOCUMENT-PIN: post-dialog guard — verify before any write.
      if (exportPin && !(await this.assertExportPinCurrent(exportPin))) return

      try {
        await ipcFs.write(filePath, content)
        this.APPLY_EXPORT_SUCCESS(filePath)
      } catch (e) {
        notice.notify({
          title: i18n.global.t('editor.export.failed', { type: 'HTML' }),
          type: 'error',
          message: String(e)
        })
      }
    },

    // C-EXPORT-DOCUMENT-PIN: true when the pinned document still owns the
    // active surface and the pinned on-disk bytes are unchanged; refuses
    // with exactly one localized notice otherwise (see the block comment).
    async assertExportPinCurrent(exportPin) {
      if (!exportPin) return true
      const currentTab = this.tabs.find((tab) => tab.id === exportPin.owner?.id) || null
      const currentOwner = currentTab ? documentOwner(currentTab) : null
      const surfaceMatch =
        this.currentFile?.id === exportPin.owner?.id &&
        !!currentOwner &&
        currentOwner.documentToken === exportPin.owner.documentToken
      const revisionMatch =
        !!currentTab && (currentTab.contentRevision || 0) === exportPin.contentRevision
      const pathnameMatch = (this.currentFile?.pathname || null) === exportPin.pathname
      if (!(surfaceMatch && revisionMatch && pathnameMatch)) {
        notice.notify({
          title: i18n.global.t('editor.export.pinMismatchTitle'),
          message: i18n.global.t('editor.export.pinMismatchMessage'),
          type: 'error'
        })
        // Count-only marker — never document or path text (console-privacy).
        // eslint-disable-next-line no-console
        console.debug('[export][pin][BLOCK_EXPORT_PIN_MISMATCH class=identity]')
        return false
      }
      if (exportPin.pathname && exportPin.baselineDigest) {
        // Cheap stat short-circuit: divergence may refuse early. An
        // unchanged stat never waives the digest compare below.
        if (exportPin.baselineStat) {
          try {
            const stat = await window.fileUtils.stat(exportPin.pathname)
            if (exportPinStatSignature(stat) !== exportPin.baselineStat) {
              notifyExportPinDiskChanged(exportPin)
              return false
            }
          } catch {
            // stat unavailable — the digest compare decides.
          }
        }
        try {
          const raw = await ipcFs.readBinary(exportPin.pathname)
          const digest = await exportPinDigestHex(raw instanceof Uint8Array ? raw : new Uint8Array(raw))
          if (digest !== exportPin.baselineDigest) {
            notifyExportPinDiskChanged(exportPin)
            return false
          }
        } catch {
          // The pinned file became unreadable between consent and write —
          // the honest disk-change refusal.
          notifyExportPinDiskChanged(exportPin)
          return false
        }
      }
      return true
    },

    // C-NATIVE-DOCX-RTF-EXPORT R-1/R-3: Export to Word = native save dialog
    // → lazy renderer-side conversion (M-066 exportDocx) → binary write
    // through the same facade the C-56 picture export uses. No settings
    // dialog ever mounts (modal-less owner decision 2026-10-23); geometry
    // and appearance use the operation captured before Save, and the
    // success card carries a quiet "Export settings" action beside the
    // reveal shortcut (C-NOTIFICATION-SYSTEM actions API).
    async _EXPORT_DOCX(content, pageOptions, exportPin) {
      // Capture before the first await, including compatibility callers that
      // enter EXPORT directly rather than through the bus dispatcher.
      const printOptions = pageOptions
        ? captureExportOptions(pageOptions)
        : getExportOperationOptions('docx')
      // C-EXPORT-DOCUMENT-PIN: the pinned name pieces in a pinned run; the
      // pin-absent path keeps today's live reads.
      const filename = exportPin ? exportPin.filename : this.currentFile.filename
      const firstHeading = exportPin
        ? exportPin.firstHeading
        : (this.listToc || []).find((h) => h && h.content)
      const headingText = typeof firstHeading === 'string' ? firstHeading : firstHeading?.content
      const fallbackName = String(headingText || 'export')
        .replace(/[\\/:*?"<>|#]+/g, '')
        .trim()
      const defaultName = filename
        ? filename.replace(/\.md$/i, '.docx')
        : (fallbackName || 'export') + '.docx'

      const { save } = await import('@tauri-apps/plugin-dialog')
      const filePath = await save({
        title: i18n.global.t('exportSettings.docxTitle'),
        defaultPath: defaultName,
        filters: [{ name: 'Word', extensions: ['docx'] }]
      })
      if (!filePath) return

      // C-EXPORT-DOCUMENT-PIN: post-dialog guard — verify before the write.
      if (exportPin && !(await this.assertExportPinCurrent(exportPin))) return

      try {
        const { exportToDocx } = await import('../util/exportDocx')
        let plantumlFallbacks = 0
        const bytes = await exportToDocx({
          html: content,
          printOptions,
          // Count only — no diagram text crosses this boundary.
          onPlantumlFallback: () => { plantumlFallbacks += 1 }
        })
        await window.fileUtils.writeFile(filePath, bytes, 'binary')
        // The consented download failed for some diagrams: the Word output
        // carries their pinned-source placeholders instead of a silent
        // drop — surface it.
        if (plantumlFallbacks > 0) {
          notice.notify({
            title: i18n.global.t('editor.export.plantumlFallbackTitle'),
            message: i18n.global.t('editor.export.plantumlFallbackMessage', { count: plantumlFallbacks }),
            type: 'warning',
            source: 'export'
          })
        }
        this.APPLY_EXPORT_SUCCESS(filePath)
      } catch (e) {
        notice.notify({
          title: i18n.global.t('editor.export.failed', { type: 'Word' }),
          type: 'error',
          source: 'export',
          message: String(e)
        })
      }
    },

    // C-61 R-2: Export to PDF = native save dialog → silent mt_export_pdf
    // write (WKWebView print-to-file on macOS, WebView2 PrintToPdf on
    // Windows) — no print panel. Cancel in the save dialog writes nothing
    // and shows no notice (corner-2); the caller clears the print
    // container when this resolves. The styled print container is already
    // in the DOM (handleExport).
    async _EXPORT_PDF(pageOptions, exportPin) {
      const { invoke } = await import('@tauri-apps/api/core')
      const { save } = await import('@tauri-apps/plugin-dialog')
      const filePath = await save({
        title: i18n.global.t('exportSettings.pdfTitle'),
        defaultPath: this._pdfDefaultName(exportPin),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (!filePath) return

      // C-EXPORT-DOCUMENT-PIN: post-dialog guard — verify before the print
      // invocation.
      if (exportPin && !(await this.assertExportPinCurrent(exportPin))) return

      try {
        await invoke('mt_export_pdf', { path: filePath, pageOptions })
        this.APPLY_EXPORT_SUCCESS(filePath)
      } catch (e) {
        notice.notify({
          title: i18n.global.t('editor.export.failed', { type: 'PDF' }),
          type: 'error',
          message: String(e)
        })
      }
    },

    // C-61 corner-4: default save name = the document's own name; an
    // untitled tab falls back to its first heading, else "Untitled".
    // C-EXPORT-DOCUMENT-PIN: with a pin the name comes from the pinned
    // pieces only, never from live currentFile/listToc reads.
    _pdfDefaultName(exportPin) {
      if (exportPin) {
        if (exportPin.pathname && exportPin.filename) {
          return exportPin.filename.replace(/\.md$/i, '.pdf')
        }
        const pinnedSafe = String(exportPin.firstHeading || '')
          .replace(/[\\/:*?"<>|#]+/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        return `${pinnedSafe || 'Untitled'}.pdf`
      }
      const { filename, pathname } = this.currentFile
      if (pathname && filename) return filename.replace(/\.md$/i, '.pdf')
      const firstHeading = (this.listToc || []).find((h) => h && h.content)
      const safe = String(firstHeading ? firstHeading.content : '')
        .replace(/[\\/:*?"<>|#]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      return `${safe || 'Untitled'}.pdf`
    },

    // Appearance remains separate from the explicit future-export page defaults.
    REMEMBER_EXPORT_OPTIONS(options) {
      if (!options || typeof options !== 'object' || Array.isArray(options)) return false
      _lastPrintOptions = copyExportAppearance(options)
      try {
        window.localStorage.setItem(
          PRINT_OPTIONS_STORAGE_KEY,
          JSON.stringify(_lastPrintOptions)
        )
        hasUnpersistedAppearance = false
        return true
      } catch {
        hasUnpersistedAppearance = true
        return false
      }
    },

    // C-61 R-1: ⌘P goes straight to the print panel. The print container
    // is rendered from the remembered options (defaults on first use) via
    // the same bus 'export' pipeline as file exports; editor.vue
    // invokes mt_print_webview and clears the container when the panel
    // closes.
    PRINT_DOCUMENT() {
      if (!hasKeys(this.currentFile)) return
      const options = captureExportOptions(getRememberedExportAppearance())
      // eslint-disable-next-line no-console
      console.log('[editor][print][BLOCK_PRINT_REQUESTED]')
      bus.emit('export', { ...options, type: 'print' })
    },

    // Capture one complete operation; later settings changes affect the next one.
    EXPORT_DOCUMENT(type) {
      if (!hasKeys(this.currentFile) || !['pdf', 'styledHtml', 'docx'].includes(type)) return
      bus.emit('export', getExportOperationOptions(type))
    },

    EXPORT_DOCX_DOCUMENT() {
      return this.EXPORT_DOCUMENT('docx')
    },

    APPLY_EXPORT_SUCCESS(filePath) {
      if (!filePath) return
      // C-NOTIFICATION-SYSTEM T-004: the legacy showConfirm promise chain
      // (resolve = reveal in Finder) becomes a plain reveal shortcut.
      notice.notify({
        title: i18n.global.t('store.editor.exportSuccessTitle'),
        message: i18n.global.t('store.editor.exportSuccessMessage', {
          name: window.path.basename(filePath)
        }),
        severity: 'success',
        source: 'export',
        actions: [
          {
            kind: 'reveal',
            payload: () => {
              return window.electron.shell.showItemInFolder(filePath)
            }
          },
          {
            label: i18n.global.t('editor.export.settingsAction'),
            style: 'quiet',
            handler: openExportSettings
          }
        ]
      })
    },

    _notifyFileOpenError(code) {
      const key = code === 'MT_ENC_LOSSY' ? 'lossyRead' : code === 'MT_ENC_UNSUPPORTED' ? 'unsupported' : 'readFailed'
      notice.notify({ source:'file',severity:'error', title:i18n.global.t('workspace.fileOpenFailedTitle'),
        message:i18n.global.t(`fileFormat.errors.${key}`) })
    },

    _notifyFormatError(code) {
      notice.notify({ source:'file', severity:code === 'composing' ? 'info' : 'error',
        title:i18n.global.t('fileFormat.title'), message:i18n.global.t(`fileFormat.errors.${formatErrorKeys[code] || code}`) })
    },

    CAN_CHANGE_DOCUMENT_FORMAT() {
      const tab = this.currentFile
      if (!tab?.id || this.documentWindowClosing) return false
      if (inspectDocumentComposition([documentOwner(tab)]).composingOwners.length) {
        this._notifyFormatError('composing')
        return false
      }
      return true
    },

    APPLY_DOCUMENT_FORMAT(patch) {
      if (!this.CAN_CHANGE_DOCUMENT_FORMAT()) return false
      const tab = this.currentFile
      try {
        if (!applyDocumentFormat(tab, patch)) return false
        console.debug(`[editor][format][BLOCK_FORMAT_CHANGED] revision=${tab.contentRevision} codec=${tab.encoding.encoding} bom=${tab.encoding.isBom} eol=${tab.lineEnding} final=${tab.trimTrailingNewline}`)
        this.UPDATE_LINE_ENDING_MENU()
        if (tab.pathname && !tab.isSaved && !tab.requiresExplicitSave && usePreferencesStore().autoSave) {
          this.HANDLE_AUTO_SAVE({ id:tab.id, pathname:tab.pathname })
        }
        return true
      } catch (error) {
        this._notifyFormatError(error.message)
        return false
      }
    },

    SET_LINE_ENDING(lineEnding) { return this.APPLY_DOCUMENT_FORMAT({ lineEnding }) },
    SET_FILE_ENCODING(choice) {
      const policy = typeof choice === 'string' ? { encoding:choice, isBom:false } : choice
      return this.APPLY_DOCUMENT_FORMAT({ encoding:policy?.encoding, isBom:policy?.isBom })
    },
    SET_FINAL_NEWLINE(finalNewline) { return this.APPLY_DOCUMENT_FORMAT({ finalNewline }) },

    LINTEN_FOR_SET_LINE_ENDING() {
      bus.on('mt::set-line-ending', lineEnding => this.SET_LINE_ENDING(lineEnding))
    },
    LINTEN_FOR_SET_ENCODING() {
      bus.on('mt::set-file-encoding', encoding => this.SET_FILE_ENCODING(encoding))
    },
    LINTEN_FOR_SET_FINAL_NEWLINE() {
      bus.on('mt::set-final-newline', value => this.SET_FINAL_NEWLINE(value))
    },

    APPLY_FILE_CHANGE(type, change) {
      const preferencesStore = usePreferencesStore()
      const { tabs } = this
      const { pathname } = change || {}
      if (!pathname) return
      const tab = tabs.find((t) => window.fileUtils.isSamePathSync(t.pathname, pathname))
      if (!tab) {
        console.error(`APPLY_FILE_CHANGE: Cannot find tab for path "${pathname}".`)
        return
      }
      const { id, isSaved, filename } = tab
      const until = type === 'unlink' ? undefined : renameEchoUntil.get(tab.pathname)
      if (until !== undefined) {
        if (Date.now() <= until) {
          console.debug(`[editor][rename][BLOCK_RENAME_ECHO_IGNORED path=${filename} type=${type}]`)
          return
        }
        renameEchoUntil.delete(tab.pathname)
      }
      const generation = (liveReloadGenerations.get(pathname) || 0) + 1
      liveReloadGenerations.set(pathname, generation)
      // A generation can be reused after close/reopen; also bind the
      // original tab object and path so an old read cannot target its successor.
      const isCurrentReload = () => liveReloadGenerations.get(pathname) === generation &&
        this.tabs.includes(tab) && tab.pathname === pathname
      const reloadMarkdown = tab.markdown
      const reloadRevision = tab.contentRevision || 0
      const localContentChanged = () => tab.markdown !== reloadMarkdown ||
        (tab.contentRevision || 0) !== reloadRevision
      switch (type) {
        case 'unlink':
          tab.isSaved = false
          this.pushTabNotification({
            tabId: id,
            msg: i18n.global.t('store.editor.fileRemovedOnDisk', { name: filename }),
            style: 'warn',
            showConfirm: false,
            exclusiveType: 'file_changed'
          })
          break
        case 'add':
        case 'change': {
          // C-STABILIZE-DIRTY-RELOAD: preferences and read-only/watch
          // flags select clean-tab reload behavior; none authorizes losing
          // unsaved edits. Dirty tabs use the existing explicit conflict choice.
          // C-EXTERNAL-RELOAD-OPERATION: reload admission, the settle/read
          // revalidation and the replacement commit are delegated to
          // util/externalReload (one owner, injected effects); the store
          // keeps the identity lookup, generation bookkeeping, echo
          // suppression and the autoSave-timer policy boundary.
          const { autoSave, liveReload } = preferencesStore
          const readOnlyReload = tab.previewMode
          const flagsGrantReload = autoSave || liveReload || readOnlyReload || tab.watchMode
          if (flagsGrantReload) {
            if (autoSaveTimers.has(id)) {
              clearTimeout(autoSaveTimers.get(id))
              autoSaveTimers.delete(id)
            }
          }
          // The attempt binds one dispatch: generation, exact path, the
          // dispatch-time filename for byte-exact log markers, the
          // isCurrentReload closure and the localContentChanged closure.
          // 'automatic' is granted only when the saved tab passed the flag
          // gate; every other dispatch is the explicit-confirmation kind
          // (the values mirror RELOAD_PERMISSIONS in util/externalReload,
          // and the owner never re-reads preferences).
          const attempt = {
            generation,
            pathname,
            filename,
            permission: flagsGrantReload && isSaved ? 'automatic' : 'confirmed',
            isLive: isCurrentReload,
            localContentChanged
          }
          return externalReload.handleFileChange({ type, change, tab, store: this, attempt })
        }
        default:
          console.error(`APPLY_FILE_CHANGE: Invalid type "${type}"`)
      }
    },

    _subscribeFileWatch(pathname) {
      if (fileWatchDisposers.has(pathname)) return
      try {
        const projectStore = useProjectStore()
        const trees = projectStore.projectTrees || []
        if (trees.some((r) =>
          pathname.startsWith(r.pathname + window.path.sep) || pathname === r.pathname
        )) {
          return
        }
      } catch {
        // project store not initialized yet — proceed with per-file watch
      }
      if (!window.path || typeof ipcWatch?.subscribe !== 'function') return
      const dir = window.path.dirname(pathname)
      const basename = window.path.basename(pathname)
      // C-2: synchronous pending marker — guards double-subscribe for one
      // pathname (the .has() check above races the async set below) and
      // records close-while-pending so the resolve path can unwind.
      const pending = { closed: false, dispose: null }
      fileWatchDisposers.set(pathname, pending)
      ipcWatch
        .subscribe(dir, (event) => {
          const { kind, paths } = event || {}
          if (!Array.isArray(paths)) return
          for (const p of paths) {
            if (window.path.basename(p) !== basename) continue
            if (kind === 'modify') {
              this.APPLY_FILE_CHANGE('change', { pathname })
            } else if (kind === 'remove') {
              this.APPLY_FILE_CHANGE('unlink', { pathname })
            }
          }
        }, { recursive: false, listener: { manual: true } })
        .then((dispose) => {
          if (pending.closed) {
            // Tab closed while the subscription was being established —
            // unwind immediately instead of leaking a live watcher.
            dispose()
            return
          }
          pending.dispose = dispose
        })
        .catch((e) => {
          // Drop the marker so a later re-open of the same file can retry.
          if (fileWatchDisposers.get(pathname) === pending) {
            fileWatchDisposers.delete(pathname)
          }
          console.error(`[editor][file-watch][SUBSCRIBE_FAILED] path=${pathname}`, e)
        })
    },

    _unsubscribeFileWatch(pathname) {
      const otherTabsWithSamePath = this.tabs.some(
        (t) => t.pathname === pathname
      )
      if (otherTabsWithSamePath) return
      // C-2: last tab for this pathname is gone — its reload generation
      // is unreachable now, drop it to keep the map bounded. This must
      // NOT depend on a watcher entry existing: files inside project
      // trees have no per-file watch (the root watcher covers them).
      liveReloadGenerations.delete(pathname)
      const entry = fileWatchDisposers.get(pathname)
      if (!entry) return
      fileWatchDisposers.delete(pathname)
      // Entry is always the pending marker object; when the subscription
      // already resolved it carries the real dispose, otherwise the flag
      // makes the resolve path unwind instead of storing a dead watcher.
      entry.closed = true
      if (typeof entry.dispose === 'function') entry.dispose()
    },

    ASK_FOR_IMAGE_PATH() {
      // step-8k: sendSync → invoke. Returns Promise<string>; muya's
      // ImagePathPicker plugin awaits the picker result, so the async
      // semantics propagate cleanly through editor.vue:imagePathPicker.
      return window.electron.ipcRenderer.invoke('mt::ask-for-image-path')
    },

    EDIT_ZOOM(zoomFactor) {
      const preferencesStore = usePreferencesStore()
      zoomFactor = Number.parseFloat(zoomFactor.toFixed(3))
      const { zoom } = preferencesStore
      if (zoom !== zoomFactor) {
        preferencesStore.SET_SINGLE_PREFERENCE({ type: 'zoom', value: zoomFactor })
      }
      document.documentElement.style.setProperty('--content-zoom', zoomFactor)
    },

    LISTEN_WINDOW_ZOOM() {
      // IPC listener lives in bootstrap-ipc.js; bus subscription only.
      bus.on('mt::window-zoom', (zoomFactor) => {
        this.EDIT_ZOOM(zoomFactor)
      })
    },

    // M-022 mt-preview-mode: per-tab preview state. When entered the
    // editor surface goes contenteditable=false + caret-color:transparent
    // and the sidebar collapses for a clean read-only view. Exit via
    // mousedown on editor body, Cmd+\\ toggle, or tab close. The
    // previewMode flag lives on the tab itself (multi-tab support per
    // V-M-022 S-02). Sidebar visibility is snapshotted on entry and
    // restored per the `previewModeOnFinderOpen` pref on exit.
    APPLY_PREVIEW_MODE(tabId, on) {
      if (!tabId) return
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) return
      // Routing helper: APPLY(false) is conventional EXIT.
      if (!on) {
        this.EXIT_PREVIEW_MODE(tabId, 'cmd-toggle')
        return
      }
      // I-01 idempotency: re-apply when already in preview is a no-op.
      if (tab.previewMode) return
      const preferencesStore = usePreferencesStore()
      // S-04 gate: when pref is disabled the apply is a silent no-op
      // (no log markers, no sidebar churn). Bootstrap-ipc gates this
      // externally too, but we double-gate here so direct callers
      // (tests, future hot-key handlers) honour the user preference.
      if (!preferencesStore.previewModeOnFinderOpen) return
      const layoutStore = useLayoutStore()
      // Snapshot prior sidebar state on the tab so EXIT can restore it.
      tab._previewSideBarSnapshot = !!layoutStore.showSideBar
      tab.previewMode = true
      // Collapse sidebar for the minimal preview view. Use direct
      // state assignment (not SET_LAYOUT) to avoid persisting the
      // transient hide as the user's saved sideBarVisibility pref.
      layoutStore.showSideBar = false
      // eslint-disable-next-line no-console
      console.debug(
        `[editor][preview][BLOCK_ENTERED tab=${tabId} file=${tab.pathname || ''}]`
      )
    },

    EXIT_PREVIEW_MODE(tabId, reason) {
      if (!tabId) return
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) return
      // I-02 idempotency: exit on non-preview tab is a silent no-op.
      if (!tab.previewMode) return
      tab.previewMode = false
      const preferencesStore = usePreferencesStore()
      const layoutStore = useLayoutStore()
      // T-01 / T-02: pref true (default) → keep sidebar hidden after
      // preview exit (treat preview-mode opens as minimal-view sessions).
      // pref false → restore prior snapshot.
      let restoredVisibility
      if (preferencesStore.previewModeOnFinderOpen) {
        restoredVisibility = false
      } else {
        restoredVisibility = !!tab._previewSideBarSnapshot
      }
      layoutStore.showSideBar = restoredVisibility
      delete tab._previewSideBarSnapshot
      // eslint-disable-next-line no-console
      console.debug(
        `[editor][preview][BLOCK_EXITED tab=${tabId} reason=${reason || 'click'}]`
      )
      // eslint-disable-next-line no-console
      console.debug(
        `[editor][preview][BLOCK_SIDEBAR_RESTORED visibility=${restoredVisibility}]`
      )
    },

    // START_BLOCK_TOGGLE_LOCK_DOCUMENT
    // C-40 T-004: View › Lock Document / palette / tab context menu.
    // Lock is the existing per-tab read-only surface (tab.previewMode,
    // M-022) made explicit and sticky: the click-to-exit and Cmd+\ exit
    // gestures are suppressed while tab.locked (editor.vue), so only the
    // toggle itself unlocks. Lock semantics deliberately differ from the
    // Finder-open path: it bypasses the previewModeOnFinderOpen gate (an
    // explicit user action, not a Finder default) and never collapses
    // the sidebar (a lock is not a reading session); when the lock was
    // what entered preview, unlocking leaves the sidebar untouched too.
    // Live reload keeps applying while locked (APPLY_FILE_CHANGE treats
    // previewMode tabs as always-reload).
    TOGGLE_LOCK_DOCUMENT(tabId = null) {
      const tab = tabId
        ? this.tabs.find((t) => t.id === tabId)
        : this.currentFile
      if (!tab || !tab.id) return
      if (tab.locked) {
        // Unlock: editing is restored through the same
        // previewMode → isReadOnlySurface watcher that Finder preview
        // exit uses (it re-enables contenteditable and restores the
        // caret).
        tab.locked = false
        if (tab._lockEnteredPreview) {
          delete tab._lockEnteredPreview
          tab.previewMode = false
        } else if (tab.previewMode) {
          this.EXIT_PREVIEW_MODE(tab.id, 'lock-toggle')
        }
        // eslint-disable-next-line no-console
        console.debug(`[editor][lock][BLOCK_LOCK_TOGGLED tab=${tab.id} locked=false]`)
        return
      }
      tab.locked = true
      if (!tab.previewMode) {
        tab.previewMode = true
        tab._lockEnteredPreview = true
      }
      // eslint-disable-next-line no-console
      console.debug(`[editor][lock][BLOCK_LOCK_TOGGLED tab=${tab.id} locked=true]`)
    }
    // END_BLOCK_TOGGLE_LOCK_DOCUMENT
  }
})

// ----------------------------------------------------------------------------
// START_MODULE_CONTRACT
//   PURPOSE: Pinia state and actions for open documents, persistence, autosave, and filesystem reloads.
//   SCOPE: Session-incarnation-owned live tabs with one closure volume (C-SURFACE-OWNERSHIP): FORCE_CLOSE_TAB and _commitDocumentWindow deactivate a matching active binding eagerly through the one _deactivateLiveDocument path, CLOSE_LIVE_DOCUMENT deactivates the binding only and the streamed tab remains as a requiresExplicitSave document, and the lazy PATCH heal stays as defense-in-depth; complete text/format checkpoints, composition-first format actions, immutable correlated saves and explicit-retry autosave guard; current export appearance/page snapshots and pre-Save Word options with independent native print geometry; transient Find visibility and selection-prefill ownership; tab lifecycle, content revisions, save outcomes, watcher coordination with dirty-buffer protection across async reloads, per-tab diff baselines (recording only — resolution lives in diffView.vue), the FIX-009 cold-start session offer, and the FORCE_CLOSE_TAB record hook into the recently-closed history.
//   DEPENDS: ipc runtime, Pinia, editor/project/preferences/recentlyClosed stores, renderer bus, store/diffSnapshots, util/externalReload, documentFormat/documentSnapshot/documentOperations, util/exportPageDefaults, util/exportSettingsNavigation.
//   LINKS: .grace/graph/features.xml M-032; .grace/verification/features.xml V-M-032; .grace/graph/runtime.xml M-011 and M-052; .grace/changes/archive/C-EXTERNAL-RELOAD-OPERATION (one reload admission owner); .grace/changes/archive/C-FIX-016-AUTOSAVE-DISABLE-RACE; .grace/changes/archive/C-68 (opened baseline), .grace/changes/archive/C-43 (pre-reload ring); .grace/changes/archive/C-61 (PDF export + print); components/editorWithTabs/unsavedCloseDialog.js (FIX-011 CLOSE_UNSAVED_TAB confirm); .grace/changes/archive/C-FIX-009-SESSION-COLD-START and C-FIX-009-RECENTLY-CLOSED; util/pageWidthStore.js (C-PAGE-WIDTH-TABLES — RENAME/RENAME_IF_NEEDED also move the file's pageWidths entry); .grace/changes/archive/C-RENDER-REVIEW-FIXES (honest async notification actions).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   useEditorStore - Pinia store: complete text/format state and guarded actions, transient Find visibility, tabs, content revisions, save/autosave, external reload admission delegated to util/externalReload (thin adapters), immutable EXPORT_DOCUMENT snapshots and captured Word options, PRINT_DOCUMENT and REMEMBER_EXPORT_OPTIONS; RENAME/RENAME_IF_NEEDED move stored table layouts, file positions and page widths to the new path.
//   __resetBootPhase - test hook that re-arms the boot-phase guard.
//   getRememberedExportAppearance - Fresh guarded appearance view with defensive header/footer copies; retains reported same-realm failed writes.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   2026-11-24 C-SURFACE-OWNERSHIP: one live-document closure volume —
//   the store-internal _deactivateLiveDocument path flips the binding
//   inactive and logs the count-only [editor][live][BLOCK_LIVE_BINDING_DEACTIVATED]
//   marker carrying tab and session identifiers only; FORCE_CLOSE_TAB
//   deactivates a matching active binding synchronously with the tab
//   splice (closing the dangling-binding window that survived until the
//   lazy PATCH heal) and _commitDocumentWindow deactivates through the
//   same path on the committed window close; CLOSE_LIVE_DOCUMENT keeps
//   its documented binding-only stream-end shape (the streamed tab
//   remains as a requiresExplicitSave document) routed through the same
//   path; the lazy PATCH heal stays as defense-in-depth and the six
//   documentWindowClosing guard sites are untouched. The one behavior
//   delta is silent, store-private, marker-only. The surface-ownership
//   predicate collapse of this change lives in editor.vue's own
//   CHANGE_SUMMARY entry.
//   EXPORT: 2026-11-23 C-EXPORT-DOCUMENT-PIN: additive optional exportPin through EXPORT/_EXPORT_DOCX/_EXPORT_PDF — assertExportPinCurrent refuses before any dialog when the pinned document no longer owns the active surface (owner token + currentFile.id + contentRevision + pathname equality, closing the rename window for free) and re-verifies after each save dialog resolves and before any write or mt_export_pdf invocation; the disk predicate is HASH-OVER-BYTES (SHA-256 over the ipcFs.readBinary bytes via crypto.subtle.digest with a stat short-circuit that may refuse early and NEVER waives the digest compare — a same-size same-mtime rewrite cannot pass); refusals raise exactly one localized editor.export.pinMismatch / pinDiskChanged notice (four new keys in all ten locales) plus the count-only [export][pin][BLOCK_EXPORT_PIN_MISMATCH class=identity|disk] marker; pin-absent callers keep today's path and live default-name reads byte-identical, pinned runs derive names from the pinned pieces (including the pdf default name); cancel in the save dialog returns before verification and stays silent (corner-2).
//   - 2026-11-23 C-SESSION-DURABILITY: the restore read hygiene — the
//     live RESTORE_SESSION and the BOOT_SESSION cold-start capture read
//     the four-key profile as ONE batched ipcPrefs.getMany request
//     (strictly read-only backend batch), all folder/file existence
//     checks run as ONE concurrent stat pass BEFORE the first open, and
//     the per-tab format lookup is an O(1) Map.get keyed by pathname
//     (behavior-preserving by the captureSessionFormats pathname dedup).
//     The frozen-payload restore, the write path, the bounded close and
//     GET_SESSION_PATHS are unchanged.
//   - 2026-11-21 C-DOCS-SYNC: C-EXTERNAL-RELOAD-OPERATION link repointed to .grace/changes/archive/ (the change archived); no behavior change.
//   EXPORT: 2026-11-20 C-EXTERNAL-RELOAD-OPERATION: one util/externalReload owner for reload admission, settle/read and the replacement commit; APPLY_FILE_CHANGE and loadChange stay compatible thin adapters.
//   CURRENT: 2026-11-12 C-EXPORT-SETTINGS-SECTION: snapshot current appearance/page defaults before export and preserve them across Word Save; print retains native-panel geometry.
//   LAST_CHANGE: 2026-11-11 C-SEC-STREAM-TABS: route live updates through explicit session/tab store ownership and tombstone closed streams.
// END_CHANGE_SUMMARY
//
// CHANGE_SUMMARY:
//   - 2026-11-20 C-EXTERNAL-RELOAD-OPERATION: the four duplicated
//     APPLY_FILE_CHANGE apply paths (ready data, watcher disk read and
//     both conflict-confirm branches) converge on one owner —
//     util/externalReload — holding the permission-aware admission
//     (automatic equal-text skip preserved, confirmed equal-text
//     replacement preserved), the single 100ms settle + disk read with
//     generation/tab/path liveness revalidation, and one replacement
//     manifest plus synchronous commit (pre-reload snapshot for admitted
//     unequal replacements only, opened snapshot, history surgery, stale
//     blocks drop, mixed-ending notice, contentReloaded stamp,
//     current-tab file-changed announce). loadChange and
//     APPLY_FILE_CHANGE remain thin adapters with identical signatures,
//     error texts, notification exclusivity and autoSave-timer policy;
//     observable behavior unchanged.
//   - 2026-11-10 C-FIND-SELECTION-CLIPBOARD: a shared transient Find
//     visibility flag keeps editing selections from replacing an active
//     query; selected-text prefill remains available while Find is closed.
//   - 2026-11-10 C-HOSTED-VALIDATION-RECOVERY: collapsed selections retain
//     the active Find query/matches; nonempty selections still prefill it
//     and all selection changes continue synchronizing native menu state.
//   - 2026-11-09 C-STABILIZE-DIRTY-RELOAD: automatic reload requires a
//     clean tab regardless of liveReload/preview/watch flags; recheck local
//     content, revision, generation and tab ownership across delayed reads.
//     A confirmed reload cannot discard edits made after its confirmation.
//   - 2026-11-09 C-STABILIZE-SPLIT-DUAL-EDIT: flush the outgoing unified tab before activation, clear unified history/carets on disk reload, and refresh parsed split outlines without dirty or autosave echoes.
//   - 2026-11-03 C-PAGE-WIDTH-TABLES (host wiring wave): RENAME and
//     RENAME_IF_NEEDED also move the file's pageWidths entry through
//     util/pageWidthStore.movePageWidthEntry (fire-and-forget with the
//     BLOCK_PAGE_WIDTH_MOVE_FAILED marker, mirroring the table-layout and
//     file-position moves), so a document's remembered width and its
//     pinned per-document theme travel with renames from both the
//     title-bar card and the sidebar.
//   - 2026-10-26 C-FILE-POSITION-MEMORY review wave: NEW_TAB_WITH_CONTENT
//     awaits the position restore BEFORE any tab surgery (closing a saved
//     blank tab and activating the new one stay in one synchronous run —
//     the old order let Vue flush a tab-less editor state and remount the
//     whole editor column), re-checks the existing tab after the await
//     (rapid double-open of one path can no longer push a duplicate tab),
//     and counts in-flight opens so RESTORE_SESSION drains them before
//     selecting the restored active tab (a landing UPDATE_CURRENT_FILE
//     from the last opened tab can no longer steal the selection).
//     _flushFilePositionForTab collects a fresh cursor from the live
//     editor via the synchronous mt::collect-position bus round-trip
//     (updateMuyaIndexCursor) — pure arrow-key navigation closed inside
//     the debounce window persists its caret, not the last click's;
//     SAVE_ACTIVE_FILE_POSITION treats muyaIndexCursor===false as the
//     computation-failed sentinel (scroll-only entry, never a stale
//     cursor impersonating a fresh one); CLOSE_TABS flushes positions
//     like every other close boundary.
//   - 2026-10-24 C-PUBLIC-REPOSITORY-HYGIENE: remove workstation-specific
//     review attribution from the cold-start shape-guard comment; behavior is
//     unchanged.
//   - 2026-10-21 FIX-009 (C-FIX-009-SESSION-COLD-START +
//     C-FIX-009-RECENTLY-CLOSED): BOOT_SESSION records the boot-time
//     cold-start offer (coldStartSession) when the restore preference
//     is off and a non-empty snapshot exists; RESTORE_SESSION returns
//     { folders, tabs, skipped } and a successful restore consumes the
//     offer. FORCE_CLOSE_TAB records pathname tabs into the
//     recently-closed history (strip position + active flag + root)
//     before the splice; LISTEN_FOR_REOPEN_CLOSED wires the
//     file.reopen-closed-tab chord and the Reopen-all active-tab
//     selection.
//   - 2026-10-20 FIX-016 (C-FIX-016-AUTOSAVE-DISABLE-RACE):
//     HANDLE_AUTO_SAVE re-checks the live Auto Save preference when its
//     debounce fires, so disabling the setting cancels already queued writes
//     while a later edit can save normally after the setting is re-enabled.
//   - 2026-10-20 FIX-011 (C-FIX-011-UNTITLED-CLOSE-ACTIONS):
//     CLOSE_UNSAVED_TAB uses the three-action unsavedCloseDialog —
//     default Save & Close, separate non-default Discard, visible Cancel
//     (Escape/close glyph are Cancel). Untitled Save & Close runs the
//     mt_response_file_save_as transport for the closing tab's own
//     identity and closes only on a truthy outcome; a cancelled or failed
//     Save As keeps the tab open (the failure path keeps the notice).
//     The named-file path (mt::save-and-close-tabs) is unchanged.
//   - 2026-10-19 C-68 T-001: opened baselines. NEW_TAB_WITH_CONTENT (open,
//     reopen, session restore — every disk-load funnel) and loadChange
//     (external reload) record the content they land into the per-tab
//     «opened» slot of store/diffSnapshots.js; FORCE_CLOSE_TAB already
//     cleared it with the ring (clearSnapshots drops both). Untitled tabs
//     never record; focusing an already-open file keeps the original slot.
//   - 2026-10-18 C-65 R-2: RENAME (title-bar card › Rename…) and
//     RENAME_IF_NEEDED (the sidebar rename) move the file's stored table
//     layouts to the new path through util/tableLayoutStore
//     (moveTableLayoutsEntry, fire-and-forget with the
//     BLOCK_TABLE_LAYOUTS_MOVE_FAILED warn); a Finder move never passes
//     through here and its orphaned entry is pruned on the next load.
//   - 2026-10-15 C-40 T-004: TOGGLE_LOCK_DOCUMENT — the per-tab read-only
//     lock over the M-022 previewMode surface (View › Lock Document,
//     palette, tab context menu). Lock bypasses the previewModeOnFinderOpen
//     gate and the sidebar collapse (explicit action, not a Finder
//     session); the click/Cmd+\ preview-exit gestures are suppressed while
//     tab.locked (editor.vue); unlocking restores editing through the same
//     isReadOnlySurface watcher and, when preview pre-existed the lock,
//     the EXIT_PREVIEW_MODE sidebar semantics.
//   - 2026-10-15 C-40 review: a guide saved under a real path is no longer
//     reused as the guide; NEW_TAB_WITH_CONTENT never auto-closes the
//     guide tab; the section deep link takes its heading from the pristine
//     localized guide (a heading the user deleted skips the jump instead
//     of landing on the next section); LISTEN_FOR_OPEN_GUIDE catches load
//     failures (BLOCK_GUIDE_LOAD_FAILED).
//   - 2026-10-15 C-40 G-3/R-1a: OPEN_GUIDE_TAB + LISTEN_FOR_OPEN_GUIDE
//     ('mt::open-guide' bus event) open the localized Mark Guide as a
//     temporary untitled tab (pathname-less, isGuide flag, guide.tabTitle
//     filename). Reopening focuses the existing guide tab and never
//     overwrites user edits; { section: GUIDE_SECTION_CONNECT_AGENT }
//     scrolls to the first `## ` heading by matching its text in listToc
//     and emitting scroll-to-header with the muya block key (WYSIWYG
//     heading ids are block keys, not github slugs).
//     Guide markdown ships per locale via util/guideDoc.js import.meta.glob;
//     the agent prompt itself lives in util/agentPrompt.js (single source).
//   - 2026-10-15 C-43 S1: every APPLY_FILE_CHANGE apply path (legacy data,
//     watcher disk-read, and both confirm branches of the dirty-tab
//     conflict prompt) records the tab's pre-reload markdown into the
//     per-tab snapshot ring (store/diffSnapshots.js) before loadChange —
//     only for saved-path tabs and only when the content actually differs;
//     FORCE_CLOSE_TAB clears the ring. The user's own edits and saves never
//     record. Snapshots are keyed by tab id, so a C-4 sidebar rename keeps
//     them; diffView prefers the latest snapshot over .before/git.
//   - 2026-10-13 C-4: RENAME_IF_NEEDED — tabs of a sidebar-renamed file follow
//     to the new path (pathname, filename, DIRNAME) and the per-file watcher
//     moves with them; the call site in project.js no longer throws. The
//     watcher's 'add' echo for the new path is ignored for 2 s, so a renamed
//     dirty tab is not reloaded from disk over its unsaved edits.
//   - 2026-10-13 C-4 live smoke: on macOS the rename echo arrives as
//     'modify' → 'change', not 'add', and the guard let it through — a dirty
//     renamed tab lost its edits with liveReload on. Every add/change echo
//     inside the 2 s window is now ignored (not only the first).
//   - 2026-09-24 C-20: ASK_FOR_FILE_PATH generalizes the autocomplete
//     (dir-part/prefix/50-cap, extension set, directories always);
//     ASK_FOR_IMAGE_AUTO_PATH delegates byte-identically. The editor.vue
//     imagePathAutoComplete wrapper that produced "undefined" items is
//     fixed to a passthrough in the same change.
//   - 2026-09-21 C-2 follow-up: loadChange stamps tab.contentReloaded and
//     emits it with file-changed so the editor clamps the preserved pre-edit
//     scrollTop into the reloaded document's range (blank-until-scroll on
//     externally shortened files); UPDATE_CURRENT_FILE and the CLOSE-tab
//     fallbacks forward the stamp for background-reloaded tabs and consume
//     it after the emit; loadChange also drops the stale muya `blocks` the
//     Object.assign kept — tab activation renders tab.blocks when present
//     (muya setMarkdown blocks-branch), which resurrected the pre-edit
//     document over the reloaded content; the store emits the raw offset
//     unchanged — the editor clamps and syncs the tab's saved value back.
//   - 2026-09-16 C-2: _subscribeFileWatch pending-marker protocol (no double
//     subscribe, close-while-pending unwinds); _unsubscribeFileWatch drops
//     liveReloadGenerations for the last tab of a pathname (independent of
//     watcher entry); conflict-prompt confirm reads from disk with the
//     generation guard instead of crashing on missing change.data.
//   - 2026-05-20 B7-M-032: fix APPLY_FILE_CHANGE async read path (latent bug:
//     project.js sends {pathname} without data); fix loadChange cursor/scrollTop
//     preservation; add liveReload preference integration + hash-skip.
//   - 2026-08-10 v2.1.7: reject stale save outcomes and out-of-order live-reload reads by revision/generation.
// ----------------------------------------------------------------------------

/**
 * Return the opened root folder or an empty string.
 *
 * @param {object} projectStore The project store instance.
 */
const getRootFolderFromState = (projectStore) => {
  const openedFolder = projectStore.projectTree
  if (openedFolder) {
    return openedFolder.pathname
  }
  return ''
}

/**
 * Creates a object that contains the application menu state.
 *
 * @param {*} selection The selection.
 * @returns A object that represents the application menu state.
 */
const createApplicationMenuState = ({ start, end, affiliation }) => {
  const state = {
    isDisabled: false,
    // Whether multiple lines are selected.
    isMultiline: start.key !== end.key,
    // List information - a list must be selected.
    isLooseListItem: false,
    isTaskList: false,
    // Whether the selection is code block like (math, html or code block).
    isCodeFences: false,
    // Whether a code block line is selected.
    isCodeContent: false,
    // Whether the selection contains a table.
    isTable: false,
    // Contains keys about the selection type(s) (string, boolean) like "ul: true".
    affiliation: {}
  }
  const { isMultiline } = state

  // Get code block information from selection.
  if (
    (start.block.functionType === 'cellContent' && end.block.functionType === 'cellContent') ||
    (start.type === 'span' && start.block.functionType === 'codeContent') ||
    (end.type === 'span' && end.block.functionType === 'codeContent')
  ) {
    // A code block like block is selected (code, math, ...).
    state.isCodeFences = true

    // A code block line is selected.
    if (start.block.functionType === 'codeContent' || end.block.functionType === 'codeContent') {
      state.isCodeContent = true
    }
  }

  // Query list information.
  if (affiliation.length >= 1 && /ul|ol/.test(affiliation[0].type)) {
    const listBlock = affiliation[0]
    state.affiliation[listBlock.type] = true
    state.isLooseListItem = listBlock.children[0].isLooseListItem
    state.isTaskList = listBlock.listType === 'task'
  } else if (affiliation.length >= 3 && affiliation[1].type === 'li') {
    const listItem = affiliation[1]
    const listType = listItem.listItemType === 'order' ? 'ol' : 'ul'
    state.affiliation[listType] = true
    state.isLooseListItem = listItem.isLooseListItem
    state.isTaskList = listItem.listItemType === 'task'
  }

  // Search with block depth 3 (e.g. "ul -> li -> p" where p is the actually paragraph inside the list (item)).
  for (const b of affiliation.slice(0, 3)) {
    if (b.type === 'pre' && b.functionType) {
      if (/frontmatter|html|multiplemath|code$/.test(b.functionType)) {
        state.isCodeFences = true
        state.affiliation[b.functionType] = true
      }
      break
    } else if (b.type === 'figure' && b.functionType) {
      if (b.functionType === 'table') {
        state.isTable = true
        state.isDisabled = true
      }
      break
    } else if (isMultiline && /^h{1,6}$/.test(b.type)) {
      // Multiple block elements are selected.
      state.affiliation = {}
      break
    } else {
      if (!state.affiliation[b.type]) {
        state.affiliation[b.type] = true
      }
    }
  }

  // Clean up
  if (Object.getOwnPropertyNames(state.affiliation).length >= 2 && state.affiliation.p) {
    delete state.affiliation.p
  }
  if ((state.affiliation.ul || state.affiliation.ol) && state.affiliation.li) {
    delete state.affiliation.li
  }
  return state
}

/**
 * Creates a object that contains the formats selection state.
 *
 * @param {*} formats The selection formats.
 * @returns A object that represents the formats menu state.
 */
const createSelectionFormatState = (formats) => {
  const state = {}
  for (const item of formats) {
    state[item.type] = true
  }
  return state
}
