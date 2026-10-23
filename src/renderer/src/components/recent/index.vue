<template>
  <div class="welcome-screen" :class="{ 'drop-active': dragOver }">
    <div class="welcome-content">
      <div class="brand">
        <img class="brand-icon" :src="brandLogo" alt="" draggable="false" />
        <span class="brand-name">Mark</span>
      </div>
      <div class="tagline">
        {{ t('recent.taglineLead') }}
        <span class="tagline-highlight">{{ t('recent.taglineHighlight') }}</span>
        {{ t('recent.taglineTail') }}
      </div>

      <div class="welcome-actions">
        <button type="button" class="action-button primary" @click="openFile">
          {{ t('recent.openFile') }}<kbd class="action-kbd">{{ shortcutOpenFile }}</kbd>
        </button>
        <button type="button" class="action-button secondary" @click="openFolder">
          {{ t('recent.openFolder') }}<kbd class="action-kbd">{{ shortcutOpenFolder }}</kbd>
        </button>
        <button type="button" class="action-button ghost" @click="newFile">
          <span class="action-plus" aria-hidden="true">＋</span>{{ t('recent.newButton') }}<kbd class="action-kbd">{{ shortcutNew }}</kbd>
        </button>
      </div>

      <!-- C-FIX-009-RECENTLY-CLOSED: current-run recovery. Shown only
           when the last tab closed in THIS run — the cold-start
           "Last session" row below is a different mechanism and is
           never offered from live mid-run state. -->
      <div v-if="showRecentlyClosed" class="welcome-section">
        <h2 class="section-title">{{ t('recent.recentlyClosed.title') }}</h2>
        <ul class="recent-list">
          <li class="recent-item">
            <button type="button" class="row-button row-recovery" @click="reopenNewestClosed">
              <span class="row-icon" aria-hidden="true">↺</span>
              <span class="row-main">
                <span class="row-name">{{ t('recent.recentlyClosed.reopenClosedTab') }}</span>
                <span class="row-path">{{ newestClosedLabel }}</span>
              </span>
              <span class="row-time"><kbd class="action-kbd">{{ shortcutReopen }}</kbd></span>
            </button>
          </li>
          <li
            v-for="entry in olderClosedEntries"
            :key="entry.pathname"
            class="recent-item"
          >
            <div
              class="row-button"
              role="button"
              tabindex="0"
              :title="entry.pathname"
              @click="reopenClosedEntry(entry)"
              @keydown.enter.prevent="reopenClosedEntry(entry)"
            >
              <span class="row-icon" aria-hidden="true">▤</span>
              <span class="row-main">
                <span class="row-name">{{ entry.filename }}</span>
                <span class="row-path">{{ entry.root ? tilde(entry.root) : tilde(dirname(entry.pathname)) }}</span>
              </span>
            </div>
          </li>
        </ul>
        <button
          v-if="recentlyClosedCount > 1"
          type="button"
          class="chip-button accent reopen-all-chip"
          @click="reopenAllClosed"
        >
          {{ t('recent.recentlyClosed.reopenAll', { count: recentlyClosedCount }) }}
        </button>
      </div>

      <div class="welcome-section">
        <h2 class="section-title">{{ t('recent.recentFiles') }}</h2>
        <ul class="recent-list">
          <!-- C-FIX-009-SESSION-COLD-START: the row reflects the
               boot-time snapshot held by the editor store (offered only
               when this launch skipped auto-restore) — never the live
               autosaved preference, which legitimately empties mid-run. -->
          <li v-if="coldStartSessionTabs.length" class="recent-item">
            <button type="button" class="row-button row-session" @click="restoreSession">
              <span class="row-icon" aria-hidden="true">↺</span>
              <span class="row-main">
                <span class="row-name">{{
                  t('recent.lastSessionWithCount', { count: coldStartSessionTabs.length })
                }}</span>
                <span class="row-path">{{ sessionSummary }}</span>
              </span>
            </button>
          </li>
          <li
            v-for="file in recentFiles"
            :key="file.path"
            class="recent-item"
            @contextmenu.prevent="openRowContextMenu($event, file, 'file')"
          >
            <div
              class="row-button"
              role="button"
              tabindex="0"
              @click="openRecentFile(file)"
              @keydown.enter.prevent="openRecentFile(file)"
              @keydown.space.prevent="openRecentFile(file)"
            >
              <span class="row-icon" aria-hidden="true">▤</span>
              <span class="row-main">
                <span class="row-name">{{ file.name }}</span>
                <span class="row-path">{{ file.dir }}</span>
              </span>
              <span v-if="file.time" class="row-time">{{ file.time }}</span>
            </div>
            <button
              type="button"
              class="row-remove"
              :title="t('recent.removeTooltip')"
              @click.stop="removeRecentFile(file)"
            >
              {{ t('recent.remove') }}
            </button>
          </li>
          <li v-if="!recentFiles.length && !coldStartSessionTabs.length" class="no-recent">
            {{ t('recent.noRecentFiles') }}
          </li>
        </ul>
      </div>

      <div v-if="recentFolders.length" class="welcome-section">
        <h2 class="section-title">{{ t('recent.recentFolders') }}</h2>
        <ul class="recent-list">
          <li
            v-for="folder in recentFolders"
            :key="folder.path"
            class="recent-item"
            @contextmenu.prevent="openRowContextMenu($event, folder, 'folder')"
          >
            <div
              class="row-button"
              role="button"
              tabindex="0"
              @click="openRecentFolder(folder)"
              @keydown.enter.prevent="openRecentFolder(folder)"
              @keydown.space.prevent="openRecentFolder(folder)"
            >
              <span class="row-icon" aria-hidden="true">▭</span>
              <span class="row-main">
                <span class="row-name">{{ folder.name }}</span>
                <span class="row-path">{{ folder.dir }}</span>
              </span>
              <span v-if="folder.time" class="row-time">{{ folder.time }}</span>
            </div>
            <button
              type="button"
              class="row-remove"
              :title="t('recent.removeTooltip')"
              @click.stop="removeRecentFolder(folder)"
            >
              {{ t('recent.remove') }}
            </button>
          </li>
        </ul>
      </div>

      <div class="agent-row">
        <p class="agent-text">
          <b>{{ t('recent.connectTitle') }}</b>
          {{ t('recent.connectText') }}
        </p>
        <button type="button" class="chip-button accent" @click="copyAgentPrompt">
          {{ t('recent.copyPrompt') }}
        </button>
        <button type="button" class="chip-button" @click="openAgentGuide">
          {{ t('recent.howItWorks') }}
        </button>
      </div>

      <div class="welcome-footer">
        <button type="button" class="footer-link" @click="openGuide">
          {{ t('recent.guide') }}
        </button>
        <template v-if="whatsNewVisible">
          <span class="footer-dot">·</span>
          <button type="button" class="footer-link" @click="openWhatsNew">
            {{ t('recent.whatsNewIn', { version: whatsNewVersion }) }}
          </button>
        </template>
      </div>
    </div>

    <div v-if="dragOver" class="drop-overlay" aria-hidden="true"></div>

    <div v-if="toast" class="undo-toast" role="status">
      <span class="toast-message">{{ t('recent.removedToast', { name: toast.name }) }}</span>
      <button type="button" class="toast-undo" @click="undoRemove">
        {{ t('recent.undo') }}
      </button>
    </div>
  </div>
</template>

<script setup>
// MODULE_CONTRACT
//   PURPOSE: C-46 welcome screen shown by pages/app.vue when no file is
//            open — brand header + tagline, open/new actions with
//            platform shortcut hints, last session row, M-017 recent
//            files and project-store recent folders with remove/undo,
//            the C-40 "Connect your agent" row and the Guide footer.
//            C-52: plain ⌘V/Ctrl+V opens the clipboard (folder →
//            workspace, .md → tab) while no document is open.
//   SCOPE:   presentation + list hydration only; persistence goes through
//            editorStore / projectStore / ipcRecent; opening files and
//            folders reuses the existing IPC actions; the paste gesture
//            delegates to util/clipboardOpen (no routing here).
//   DEPENDS: store/editor (incl. coldStartSession), store/project,
//            store/recentlyClosed, services/notification, ipc/runtime
//            (ipcRecent, ipcFs, ipcPrefs), util/pathDisplay, util/relativeTime,
//            util/agentPrompt, util/clipboardPath (isEditableTarget),
//            util/clipboardOpen (dynamic, on ⌘V), util (isOsx,
//            isWindows), i18n, bus ('mt::native-drag' from
//            _shims/install-window-globals.js).
//   LINKS:   .grace/changes/archive/C-46 (approved mockups boards 1-2);
//            .grace/verification/runtime.xml V-M-011 scenario-47;
//            .grace/changes/archive/C-52 (welcome ⌘V, R-2);
//            C-40 R-1a (agent prompt + 'mt::open-guide' section).
//   ROLE:    RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   (component) - top-level locals: recentFiles, recentFolders, toast, dragOver, whatsNew
//   coldStartSessionTabs - FIX-009: the frozen boot-time cold-start offer tabs driving the "Last session" row (never the live autosaved preference).
//   restoreSession - FIX-009: restores the FROZEN offer payload (RESTORE_SESSION { from }); an empty result raises the localized notice.
//   showRecentlyClosed / recentlyClosedCount / recentlyClosedEntries - FIX-009 current-run recovery block gates and data (store/recentlyClosed).
//   reopenNewestClosed / reopenClosedEntry / reopenAllClosed - FIX-009 recovery actions delegating to the store.
//   isMissingPathError - stat rejection → "path is gone" (IpcError cause.code, message fallback)
//   onNativeDrag - welcome drop-zone highlight driven by the native drag-drop bridge
//   onPasteKeyDown - C-52 plain ⌘V/Ctrl+V → util/clipboardOpen resolver (ignored in text inputs; editor paste untouched)
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.2.1 - 2026-10-22 FIX-009 acceptance follow-up: the
//     tab count moved INTO the row title (recent.lastSessionWithCount,
//     «Last session (N)»), replacing the separate plural label on the
//     right; the now-unused filesCountLabel plural helper and its row
//     slot are gone (the recent.filesCount.* locale keys stay for
//     potential reuse). Owner request from the 2026-10-22 acceptance
//     protocol, section 6 item 5.
//   v2.2.0 - 2026-10-21 C-FIX-009: the "Last session" row
//     reflects the editor store's boot-time cold-start snapshot (offered
//     only when this launch skipped auto-restore) instead of the
//     mount-time capture that went stale after the session autosave
//     emptied it — a restore that opens nothing now raises a notice
//     instead of silently no-op'ing; a current-run recovery block
//     (reopen newest / older entries / Reopen all) appears when this
//     run closed its last tab.
//   v2.1.4 - 2026-10-19 the brand mark contrasts with the
//     theme: light ¶ on dark themes, dark ¶ on light themes.
//   v2.1.3 - 2026-10-18 fix: row layout — .row-button gained
//     box-sizing:border-box (width:100% plus padding overflowed the column
//     by 20 px), and «Remove from list» is a quiet button centred on the
//     row in the time column's place instead of a bordered chip pinned to
//     the bottom edge over the path line.
//   v2.1.2 - 2026-10-18 fix: the brand mark was still the
//     pre-C-33 round «M» logo.png; it is now the ¶ app icon, light or dark
//     by the effective theme (logo.png / logo-dark.png, full-bleed, from assets/icon).
//   v2.1.1 - 2026-10-18 fix: safe vertical centering — the
//     welcome screen centred its content with align-items:center inside an
//     overflow-y:auto flex box, so a list taller than the window clipped the
//     top (brand + tagline) beyond reach of the scrollbar; the content now
//     centres with margin-block:auto, which collapses to 0 on overflow.
//   v2.1.0 - 2026-10-16 C-52 T-001: plain ⌘V/Ctrl+V opens
//     the clipboard through util/clipboardOpen while the welcome screen
//     (no document open) is mounted — folder → workspace (replace),
//     .md → tab; ⌥⌘V stays the File-menu accelerator and a focused text
//     control keeps its native paste (listener removed on unmount, so a
//     document's paste is untouched — D-3).
//   v2.0.2 - 2026-10-15 C-46 review round 2: folder
//     remove/undo rewrote only the ≤3 visible rows and wiped stored folders
//     4–5 and hidden missing ones — now edits and restores the full stored
//     list; missing-file detection reads the IpcError cause.code
//     MT_FS_NOT_FOUND (the mapped message is "[object Object]"); the drop
//     highlight follows the native webview drag bridge ('mt::native-drag')
//     and the dead HTML5 onDrop → 'mt::window::drop' path is gone (drops
//     open through the bridge); Windows paths split on both separators;
//     "N files" uses plural categories (recent.filesCount.one/few/many/
//     other); keyboard-opened context menu anchors at the row; Linux shows
//     "Show in folder"; Undo of a remove that M-017 did not have (null
//     index) inserts nothing.
//   v2.0.1 - 2026-10-15 C-46 review: removing a recent folder
//     persisted the pre-remove snapshot (folder came back after restart);
//     the What's-new footer reads C-48's ISO lastUpdateAt + running
//     version and reopens the C-48 sheet (was Number(ISO) → NaN, and an
//     mt::open-guide section that does not exist); agent prompt from the
//     C-40 module getAgentPrompt(t).
//   v2.0.0 - 2026-10-15 C-46: redesigned to the approved
//     mockup — brand header + tagline, Open File/Folder + New with
//     platform shortcut hints, "Last session · N files" as the first
//     Recent row, up to 5 recent files / 3 recent folders with relative
//     mtime, hover "Remove from list" (tooltip: file stays on disk),
//     right-click Open / Show in Finder|Explorer / Copy path / Remove,
//     5s Undo toast restoring exact order (mt_recent_remove/insert),
//     missing paths drop off silently, "Connect your agent" copy-prompt
//     row, Guide footer (What's-new link gated by the lastUpdateAt
//     preference, hidden until C-48 ships it) and a text-free drop-zone
//     highlight while dragging.
// END_CHANGE_SUMMARY

import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { useRecentlyClosedStore } from '@/store/recentlyClosed'
import notice from '@/services/notification'
import { ipcRecent, ipcFs, ipcPrefs } from '@/ipc/runtime'
import { isOsx, isWindows } from '@/util'
import { isEditableTarget } from '@/util/editableTarget'
import { shortenMiddle, pathBasename, pathDirname } from '@/util/pathDisplay'
import { formatRelativeTime } from '@/util/relativeTime'
import { getAgentPrompt } from '@/util/agentPrompt'
import { getRunningVersion, LAST_UPDATE_AT_KEY } from '@/whatsNew/gate'
import { t } from '../../i18n'
import bus from '@/bus'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences.js'
import { isDarkTheme } from '@/config'
import logoUrl from '@/assets/images/logo.png'
import logoDarkUrl from '@/assets/images/logo-dark.png'

const MAX_RECENT_FILES_SHOWN = 5
const MAX_RECENT_FOLDERS_SHOWN = 3
const TOAST_MS = 5000
const WHATS_NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
// Sent by the backend when a stat'd path no longer exists (m013b
// error.rs MT_FS_NOT_FOUND / io NotFound message). Anything else
// (degraded IPC, permissions) keeps the row without a timestamp.
const MISSING_CODE = 'MT_FS_NOT_FOUND'
const MISSING_RE = /MT_FS_NOT_FOUND|No such file/i

const editorStore = useEditorStore()
const projectStore = useProjectStore()
const recentlyClosedStore = useRecentlyClosedStore()
// The brand mark contrasts with the effective theme: the light (paper) ¶
// icon on dark themes, the dark (ink) one on light themes — a same-tone
// icon blended into the background (user review 2026-10-19).
const { theme } = storeToRefs(usePreferencesStore())
const brandLogo = computed(() => (isDarkTheme(theme.value) ? logoUrl : logoDarkUrl))

const recentFiles = ref([])
const recentFolders = ref([])
const toast = ref(null)
const dragOver = ref(false)
const whatsNew = ref(null)
let _homeDir = ''
let _toastTimer = null

// Platform shortcut glyphs for the three header actions.
const shortcutOpenFile = isOsx ? '⌘O' : 'Ctrl+O'
const shortcutOpenFolder = isOsx ? '⇧⌘O' : 'Ctrl+Shift+O'
const shortcutNew = isOsx ? '⌘N' : 'Ctrl+N'
const shortcutReopen = isOsx ? '⇧⌘T' : 'Ctrl+Shift+T'

const basename = pathBasename
const dirname = pathDirname

const tilde = (dir) => {
  if (_homeDir && dir.startsWith(_homeDir)) return '~' + dir.substring(_homeDir.length)
  return dir
}

// START_BLOCK_MAKE_ROW
// Build one recent row: file/folder name, middle-shortened parent path
// (~ for home) and the localized relative mtime ('' when unknown).
const makeRow = (path, stat) => ({
  path,
  name: basename(path),
  dir: shortenMiddle(tilde(dirname(path)), 32),
  time: stat ? formatRelativeTime(stat.mtimeMs, Date.now(), t) : ''
})
// END_BLOCK_MAKE_ROW

// START_BLOCK_HYDRATE_LISTS
// ipcInvoke maps a Tauri rejection to an IpcError whose `cause` is the
// backend's structured error ({ code, message }) and whose message is
// "[object Object]" — so the code is the signal (same convention as
// store/project.js); the message match stays as a fallback for plain
// string rejections.
const isMissingPathError = (e) => {
  if (e?.cause?.code === MISSING_CODE || e?.code === MISSING_CODE) return true
  const msg = String(e?.cause?.message || e?.message || e || '')
  return MISSING_RE.test(msg)
}

// stat every candidate in parallel; rows whose stat reports the path
// is gone drop off silently, other stat failures keep the row without a
// timestamp (degraded environments must not wipe the recent list).
const statRows = async (paths, max) => {
  const stats = await Promise.all(
    paths.map((p) => ipcFs.stat(p).catch((e) => (isMissingPathError(e) ? 'missing' : null)))
  )
  return paths
    .map((path, i) => ({ path, stat: stats[i] }))
    .filter((x) => x.stat !== 'missing')
    .slice(0, max)
    .map((x) => makeRow(x.path, x.stat))
}

const hydrateFiles = async (paths) => {
  recentFiles.value = await statRows(paths, MAX_RECENT_FILES_SHOWN)
}

const hydrateFolders = async (paths) => {
  recentFolders.value = await statRows(paths, MAX_RECENT_FOLDERS_SHOWN)
}
// END_BLOCK_HYDRATE_LISTS

// START_BLOCK_WHATS_NEW_GATE
// The What's-new footer link is visible only within 7 days after an
// update, keyed on C-48's 'lastUpdateAt' preference (an ISO timestamp
// written by whatsNew/gate.js when an upgrade is detected; a numeric
// epoch is accepted too). The link reopens the C-48 sheet.
const checkWhatsNew = async () => {
  try {
    const raw = await ipcPrefs.get(LAST_UPDATE_AT_KEY)
    const ts = typeof raw === 'number' ? raw : Date.parse(raw)
    if (!Number.isFinite(ts) || ts <= 0) return
    if (Date.now() - ts > WHATS_NEW_WINDOW_MS) return
    const version = getRunningVersion()
    if (!version || version === '0.0.0') return
    whatsNew.value = { version }
  } catch {
    // preference absent → link hidden
  }
}
// END_BLOCK_WHATS_NEW_GATE

onMounted(async () => {
  try {
    const { homeDir } = await import('@tauri-apps/api/path')
    _homeDir = (await homeDir()).replace(/\/+$/, '')
  } catch { /* dev/test fallback */ }
  const [recent, folders] = await Promise.all([
    editorStore.GET_RECENT_FILES(),
    projectStore.GET_RECENT_FOLDERS()
  ])
  await Promise.all([
    hydrateFiles((recent || []).slice(0, 10)),
    // The store keeps ≤5 folders; stat them all so a missing one does
    // not hide a live 4th/5th folder from the three visible rows.
    hydrateFolders(folders || [])
  ])
  checkWhatsNew()
})

bus.on('mt::native-drag', onNativeDrag)

// ── paste opens the clipboard folder/file (C-52 R-2) ──────────────

// START_BLOCK_PASTE_OPEN
// Plain ⌘V / Ctrl+V on the welcome screen (which is also up for the
// empty-sidebar state — no document open) opens the clipboard through
// the same resolver as File › Open from Clipboard. Only this screen
// owns the gesture: ⌘V inside a document is muya's paste and stays
// untouched (user decision D-3), so the listener lives exactly as long
// as this component. Variants are filtered out: ⌥⌘V is the menu
// accelerator, Shift/Alt combos belong to the editor, and a target
// inside a text control keeps its native paste.
const onPasteKeyDown = (event) => {
  if (!(event.metaKey || event.ctrlKey)) return
  if (event.altKey || event.shiftKey) return
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''
  if (key !== 'v') return
  if (isEditableTarget(event.target)) return
  event.preventDefault()
  import('@/util/clipboardOpen')
    .then(({ openFromClipboard }) => openFromClipboard())
    .catch((e) => {
      console.error('[Recent][onPasteKeyDown][BLOCK_PASTE_OPEN_FAILED]', e)
    })
}
window.addEventListener('keydown', onPasteKeyDown)

onBeforeUnmount(() => {
  if (_toastTimer) clearTimeout(_toastTimer)
  bus.off('mt::native-drag', onNativeDrag)
  window.removeEventListener('keydown', onPasteKeyDown)
})

// First three file names of the offered cold-start snapshot
// ("a.md, b.md, c.md, …"). C-FIX-009-SESSION-COLD-START: sourced from
// the editor store's boot-time snapshot, never from the live autosaved
// preference.
const coldStartSessionTabs = computed(() => editorStore.coldStartSession?.tabs || [])
const sessionSummary = computed(() => {
  const names = coldStartSessionTabs.value.slice(0, 3).map(basename)
  const suffix = coldStartSessionTabs.value.length > 3 ? ', …' : ''
  return names.join(', ') + suffix
})

// ── C-FIX-009-RECENTLY-CLOSED: current-run recovery on the welcome ──

// START_BLOCK_RECENTLY_CLOSED_RECOVERY
// The block appears only when this run closed its last tab — the
// cold-start snapshot row above is a separate mechanism. All actions
// delegate to the store so the strip button, ⇧⌘T, the popover and this
// block behave identically.
const recentlyClosedCount = computed(() => recentlyClosedStore.count)
const recentlyClosedEntries = computed(() => recentlyClosedStore.entries)
const showRecentlyClosed = computed(
  () => (editorStore.tabs || []).length === 0 && recentlyClosedCount.value > 0
)
const newestClosedLabel = computed(() => {
  const entry = recentlyClosedStore.newest
  if (!entry) return ''
  return entry.root ? tilde(entry.root) : tilde(dirname(entry.pathname))
})
// The primary row already leads with the newest; show up to three
// older entries as plain rows.
const olderClosedEntries = computed(() => recentlyClosedEntries.value.slice(1, 4))

const reopenNewestClosed = () => recentlyClosedStore.REOPEN_NEWEST()
const reopenClosedEntry = (entry) => recentlyClosedStore.REOPEN_ONE(entry)
const reopenAllClosed = () => recentlyClosedStore.REOPEN_ALL()
// END_BLOCK_RECENTLY_CLOSED_RECOVERY

const whatsNewVisible = computed(() => !!whatsNew.value)
const whatsNewVersion = computed(() => whatsNew.value?.version || '')

// ── open / new actions (existing app actions) ─────────────────────

const newFile = () => editorStore.NEW_UNTITLED_TAB({})

const openFile = () => {
  window.electron.ipcRenderer.send('mt::cmd-open-file')
}

const openFolder = () => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const openRecentFile = (entry) => {
  window.electron.ipcRenderer.send('mt::open-file', entry.path, {})
}

const openRecentFolder = (entry) => {
  // C-MULTI-SOURCE-WORKSPACE: ambiguous input — with roots open the
  // shared Add-or-Replace chooser decides (Add preselected); the session
  // restore path keeps the add-only OPEN_RECENT_FOLDER action.
  void projectStore.OPEN_FOLDER(entry.path, { mode: 'ask', origin: 'recent' })
}

// START_BLOCK_RESTORE_SESSION
// C-FIX-009-SESSION-COLD-START: the explicit cold-start action must
// never silently no-op — RESTORE_SESSION reports what it did, and a
// restore that opened nothing (snapshot empty at click time or every
// path gone) raises a visible notice.
const restoreSession = async () => {
  // Restore the FROZEN offer payload, never the live autosaved
  // preferences (review wave 2: the session autosave may have rewritten
  // them since boot; the click must reopen exactly what the row shows).
  const result = await editorStore.RESTORE_SESSION({
    from: editorStore.coldStartSession
  })
  if (result && result.folders + result.tabs === 0) {
    notice.notify({
      title: t('recent.lastSession'),
      message: t('recent.lastSessionEmpty'),
      type: 'warning',
      time: 6000,
      showConfirm: false
    })
  }
}
// END_BLOCK_RESTORE_SESSION

// ── remove + 5s undo toast ────────────────────────────────────────

// START_BLOCK_SHOW_TOAST
const showToast = (payload) => {
  if (_toastTimer) clearTimeout(_toastTimer)
  toast.value = payload
  _toastTimer = setTimeout(() => {
    toast.value = null
    _toastTimer = null
  }, TOAST_MS)
}
// END_BLOCK_SHOW_TOAST

// START_BLOCK_REMOVE_RECENT
// Removing only edits the recent list — the file/folder stays on disk.
// The M-017 remove command returns the persisted old index (null when
// the path was not stored); the undo insert puts the entry back exactly
// there so the order is restored, and skips the insert when nothing was
// removed from storage.
const removeRecentFile = async (entry) => {
  const index = recentFiles.value.findIndex((f) => f.path === entry.path)
  if (index < 0) return
  const snapshot = [...recentFiles.value]
  recentFiles.value.splice(index, 1)
  let persistedIndex = null
  try {
    const removedAt = await ipcRecent.remove(entry.path)
    if (typeof removedAt === 'number') persistedIndex = removedAt
  } catch (e) {
    console.warn('[Recent][removeRecentFile][BLOCK_RECENT_REMOVED] persisted=false', e)
  }
  showToast({
    kind: 'file',
    name: entry.name,
    path: entry.path,
    index: persistedIndex,
    snapshot
  })
}

// Folders: the store keeps up to 5 while the screen shows ≤3 live ones,
// so the edit works on the FULL stored list — dropping only this path —
// and the full stored list is the Undo snapshot.
const removeRecentFolder = async (entry) => {
  const index = recentFolders.value.findIndex((f) => f.path === entry.path)
  if (index < 0) return
  const snapshot = [...recentFolders.value]
  recentFolders.value.splice(index, 1)
  let storedSnapshot = null
  try {
    const stored = await projectStore.GET_RECENT_FOLDERS()
    storedSnapshot = Array.isArray(stored) ? [...stored] : []
    await projectStore.SET_RECENT_FOLDERS(storedSnapshot.filter((p) => p !== entry.path))
  } catch (e) {
    console.warn('[Recent][removeRecentFolder][BLOCK_RECENT_REMOVED] persisted=false', e)
  }
  showToast({
    kind: 'folder',
    name: entry.name,
    path: entry.path,
    index,
    snapshot,
    storedSnapshot
  })
}

const undoRemove = async () => {
  const entry = toast.value
  if (!entry) return
  if (_toastTimer) clearTimeout(_toastTimer)
  toast.value = null
  if (entry.kind === 'file') {
    recentFiles.value = entry.snapshot
    if (typeof entry.index !== 'number') return
    try {
      await ipcRecent.insert(entry.path, entry.index)
    } catch (e) {
      console.warn('[Recent][undoRemove][BLOCK_RECENT_UNDONE] persisted=false', e)
    }
  } else {
    recentFolders.value = entry.snapshot
    if (!entry.storedSnapshot) return
    try {
      await projectStore.SET_RECENT_FOLDERS(entry.storedSnapshot)
    } catch (e) {
      console.warn('[Recent][undoRemove][BLOCK_RECENT_UNDONE] persisted=false', e)
    }
  }
}
// END_BLOCK_REMOVE_RECENT

// ── native right-click menu (menu key / Shift+F10 fire contextmenu) ──

// START_BLOCK_ROW_CONTEXT_MENU
// Shift+F10 / the Menu key fire contextmenu with clientX/Y = 0; anchor
// the menu at the row's bottom-left instead of the window corner.
const contextMenuPoint = (event) => {
  const x = Number.isFinite(event?.clientX) ? event.clientX : 0
  const y = Number.isFinite(event?.clientY) ? event.clientY : 0
  if (x !== 0 || y !== 0) return { x, y }
  const rect = event?.currentTarget?.getBoundingClientRect?.()
  if (!rect) return { x, y }
  return { x: Math.round(rect.left + 12), y: Math.round(rect.bottom) }
}

const showInFolderLabel = () => {
  if (isOsx) return t('recent.showInFinder')
  if (isWindows) return t('recent.showInExplorer')
  return t('recent.showInFolder')
}

const openRowContextMenu = async (event, entry, kind) => {
  const items = [
    { label: t('recent.open'), id: 'open' },
    { label: showInFolderLabel(), id: 'showInFolder' },
    { label: t('recent.copyPath'), id: 'copyPath' },
    { type: 'separator' },
    { label: t('recent.remove'), id: 'removeFromList' }
  ]
  let clickedId = null
  try {
    clickedId = await window.electron.ipcRenderer.invoke(
      'mt::window-popup-context-menu',
      { items, ...contextMenuPoint(event) }
    )
  } catch (e) {
    console.warn('[Recent][openRowContextMenu][BLOCK_ROW_CONTEXT_MENU] failed', e)
    return
  }
  if (clickedId === 'open') {
    if (kind === 'file') openRecentFile(entry)
    else openRecentFolder(entry)
  } else if (clickedId === 'showInFolder') {
    window.electron.shell.showItemInFolder(entry.path)
  } else if (clickedId === 'copyPath') {
    window.electron.clipboard.writeText(entry.path)
  } else if (clickedId === 'removeFromList') {
    if (kind === 'file') removeRecentFile(entry)
    else removeRecentFolder(entry)
  }
}
// END_BLOCK_ROW_CONTEXT_MENU

// ── connect your agent + footer ───────────────────────────────────

const copyAgentPrompt = async () => {
  try {
    await window.electron.clipboard.writeText(getAgentPrompt(t))
    console.info('[Recent][copyAgentPrompt][BLOCK_AGENT_PROMPT_COPIED]')
  } catch (e) {
    console.warn('[Recent][copyAgentPrompt][BLOCK_AGENT_PROMPT_COPIED] failed', e)
  }
}

// C-40 owns the Guide; until its handler exists the events are simply
// unheard (same contract both sides will use).
const openAgentGuide = () => {
  bus.emit('mt::open-guide', { section: 'connect-agent' })
}

const openGuide = () => {
  bus.emit('mt::open-guide', {})
}

const openWhatsNew = () => {
  bus.emit('whatsNewDialog')
}

// ── drop zone: highlight only while dragging, no hint text ────────

// START_BLOCK_DROP_ZONE
// A Tauri webview never hands the renderer an OS path for an HTML5 file
// drag, so drops are opened by the native drag-drop bridge in
// _shims/install-window-globals.js (fs.read → 'mt::open-new-tab'). The
// bridge mirrors each phase on the bus as 'mt::native-drag'; this
// screen only lights up its drop zone from it.
function onNativeDrag(event) {
  const type = event?.type
  if (type === 'enter') {
    dragOver.value = Array.isArray(event.paths) && event.paths.length > 0
  } else if (type === 'leave' || type === 'drop') {
    dragOver.value = false
  }
}
// END_BLOCK_DROP_ZONE
</script>

<style scoped>
.welcome-screen {
  background: var(--editorBgColor);
  flex: 1;
  display: flex;
  justify-content: center;
  overflow-y: auto;
  user-select: none;
  zoom: var(--content-zoom, 1);
  position: relative;
}

.welcome-content {
  /* Safe vertical centering: auto margins centre the content when it fits
     and collapse to 0 when it does not, so the brand row never ends up
     above the scrollable area (align-items:center clipped it). */
  margin-block: auto;
  max-width: 520px;
  width: 100%;
  padding: 32px 32px 40px;
  display: grid;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.brand-icon {
  width: 42px;
  height: 42px;
  border-radius: 9px;
}

.brand-name {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--editorColor);
}

.tagline {
  text-align: center;
  color: var(--editorColor60, var(--editorColor50));
  font-size: 16px;
  margin-top: -6px;
}

.tagline-highlight {
  position: relative;
  z-index: 0;
  color: var(--editorColor);
  font-weight: 600;
}

.tagline-highlight::before {
  content: '';
  position: absolute;
  z-index: -1;
  left: -0.1em;
  right: -0.12em;
  bottom: 0.02em;
  height: 0.7em;
  background: var(--highlightColor);
  transform: skew(-10deg) rotate(-1.4deg);
  border-radius: 0.08em 0.18em 0.1em 0.2em;
}

.welcome-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.action-button {
  height: 30px;
  padding: 0 12px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
}

.action-button.primary {
  background: var(--buttonPrimaryBgColor, var(--themeColor));
  color: var(--buttonPrimaryFontColor, #fff);
  border: none;
}
.action-button.primary:hover {
  background: var(--buttonPrimaryBgColorHover, var(--themeColor));
}

.action-button.secondary {
  border: 1px solid var(--tableBorderColor, var(--editorColor10));
  background: var(--floatBgColor, var(--editorBgColor));
  color: var(--editorColor);
}
.action-button.secondary:hover {
  border-color: var(--themeColor);
}

.action-button.ghost {
  border: 1px dashed color-mix(in srgb, var(--editorColor) 30%, transparent);
  background: transparent;
  color: var(--editorColor);
}
.action-button.ghost:hover {
  border-color: var(--themeColor);
}

.action-kbd {
  font-family: 'DejaVu Sans Mono', ui-monospace, Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.55;
}

.action-plus {
  font-weight: 600;
}

.welcome-section {
  display: grid;
  gap: 4px;
  margin-top: 6px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--editorColor50, var(--editorColor60));
  margin: 0 0 4px;
}
.section-title::before,
.section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--tableBorderColor, var(--editorColor10));
}

.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.recent-item {
  position: relative;
  border-radius: 8px;
}

.row-button {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 2px 10px;
  align-items: baseline;
  box-sizing: border-box;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--editorColor);
  text-align: left;
  cursor: pointer;
}
.recent-item:hover .row-button,
.recent-item:focus-within .row-button {
  background: var(--inputBgColor, var(--sideBarItemHoverBgColor));
}
.row-button:focus-visible {
  outline: 2px solid var(--focusColor, var(--themeColor));
  outline-offset: -2px;
}

.row-icon {
  grid-row: span 2;
  align-self: center;
  color: var(--editorColor60, var(--editorColor50));
  font-size: 14px;
}

.row-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.row-name {
  font-weight: 500;
  font-size: 14.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-path {
  font-size: 12px;
  color: var(--editorColor60, var(--editorColor50));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-time {
  font-size: 12px;
  color: var(--editorColor50, var(--editorColor60));
  white-space: nowrap;
  padding-left: 10px;
}

.row-remove {
  /* Takes the time column's place on hover / keyboard focus, centred on
     the row; the hidden time keeps the grid from reflowing. */
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  z-index: 1;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  color: var(--editorColor60, var(--editorColor50));
  padding: 5px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  white-space: nowrap;
  cursor: pointer;
  visibility: hidden;
}
.recent-item:hover .row-remove,
.recent-item:focus-within .row-remove {
  visibility: visible;
}
.recent-item:hover .row-time,
.recent-item:focus-within .row-time {
  visibility: hidden;
}
.row-remove:hover {
  color: var(--editorColor);
  background: color-mix(in srgb, var(--editorColor) 10%, transparent);
}
.row-remove:focus-visible {
  outline: 2px solid var(--focusColor, var(--themeColor));
  outline-offset: -2px;
}

.no-recent {
  font-size: 13px;
  color: var(--editorColor50, var(--editorColor60));
  margin: 0;
  padding: 6px 10px;
}

.agent-row {
  margin-top: 6px;
  border: 1px dashed var(--tableBorderColor, var(--editorColor10));
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13.5px;
}

/* C-FIX-009-RECENTLY-CLOSED: the welcome recovery block's trailing
   Reopen-all chip, centred under the rows. */
.reopen-all-chip {
  display: block;
  margin: 8px auto 0;
}

.agent-text {
  margin: 0;
  flex: 1;
  color: var(--editorColor60, var(--editorColor50));
}
.agent-text b {
  color: var(--editorColor);
  font-weight: 600;
}

.chip-button {
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  padding: 6px 9px;
  border-radius: 6px;
  border: none;
  background: var(--itemBgColor, var(--editorColor10));
  color: var(--editorColor);
  white-space: nowrap;
  cursor: pointer;
}
.chip-button:hover {
  color: var(--themeColor);
}
.chip-button.accent {
  background: var(--themeColor);
  color: var(--buttonPrimaryFontColor, #fff);
}
.chip-button.accent:hover {
  background: var(--buttonPrimaryBgColorHover, var(--themeColor));
  color: var(--buttonPrimaryFontColor, #fff);
}

.welcome-footer {
  text-align: center;
  color: var(--editorColor50, var(--editorColor60));
  font-size: 12.5px;
}

.footer-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 12.5px;
  color: inherit;
  cursor: pointer;
}
.footer-link:hover {
  color: var(--themeColor);
}

.footer-dot {
  margin: 0 6px;
  color: var(--editorColor40, var(--editorColor50));
}

.drop-overlay {
  position: absolute;
  inset: 10px;
  border: 2px dashed var(--themeColor);
  border-radius: 12px;
  background: var(--themeColor10);
  pointer-events: none;
  z-index: 2;
}

.welcome-screen.drop-active {
  background: var(--editorBgColor);
}

.undo-toast {
  position: absolute;
  left: 50%;
  bottom: 36px;
  transform: translateX(-50%);
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 9px;
  background: var(--floatBgColor, var(--editorBgColor));
  color: var(--floatFontColor, var(--editorColor));
  border: 1px solid var(--tableBorderColor, var(--editorColor10));
  box-shadow: 0 10px 24px -10px var(--floatShadow, rgba(0, 0, 0, 0.4));
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  z-index: 3;
}

.toast-undo {
  background: none;
  border: none;
  padding: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--themeColor);
  cursor: pointer;
}
.toast-undo:hover {
  text-decoration: underline;
}
</style>
