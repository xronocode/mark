<template>
  <div
    class="welcome-screen"
    :class="{ 'drop-active': dragOver }"
    @dragenter="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="welcome-content">
      <div class="brand">
        <img class="brand-icon" :src="logoUrl" alt="" draggable="false" />
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

      <div class="welcome-section">
        <h2 class="section-title">{{ t('recent.recentFiles') }}</h2>
        <ul class="recent-list">
          <li v-if="sessionPaths.length" class="recent-item">
            <button type="button" class="row-button row-session" @click="restoreSession">
              <span class="row-icon" aria-hidden="true">↺</span>
              <span class="row-main">
                <span class="row-name">{{ t('recent.lastSession') }}</span>
                <span class="row-path">{{ sessionSummary }}</span>
              </span>
              <span class="row-time">{{
                t('recent.filesCount', { count: sessionPaths.length })
              }}</span>
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
          <li v-if="!recentFiles.length && !sessionPaths.length" class="no-recent">
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
//   SCOPE:   presentation + list hydration only; persistence goes through
//            editorStore / projectStore / ipcRecent; opening files and
//            folders reuses the existing IPC actions.
//   DEPENDS: store/editor, store/project, ipc/runtime (ipcRecent,
//            ipcFs, ipcPrefs), util/pathDisplay, util/relativeTime,
//            util/agentPrompt, util (isOsx, isWindows), i18n, bus.
//   LINKS:   .grace/changes/active/C-46 (approved mockups boards 1-2);
//            .grace/verification/runtime.xml V-M-011 scenario-47;
//            C-40 R-1a (agent prompt + 'mt::open-guide' section).
//   ROLE:    RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   (component) - top-level locals: recentFiles, recentFolders, sessionPaths, toast, dragOver, whatsNew
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.1 - 2026-10-15 C-46 review: removing a recent folder
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
import { ipcRecent, ipcFs, ipcPrefs } from '@/ipc/runtime'
import { isOsx, isWindows } from '@/util'
import { shortenMiddle } from '@/util/pathDisplay'
import { formatRelativeTime } from '@/util/relativeTime'
import { getAgentPrompt } from '@/util/agentPrompt'
import { getRunningVersion, LAST_UPDATE_AT_KEY } from '@/whatsNew/gate'
import { t } from '../../i18n'
import bus from '@/bus'
import logoUrl from '@/assets/images/logo.png'

const MAX_RECENT_FILES_SHOWN = 5
const MAX_RECENT_FOLDERS_SHOWN = 3
const TOAST_MS = 5000
const WHATS_NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
// Sent by the backend when a stat'd path no longer exists (m013b
// error.rs MT_FS_NOT_FOUND / io NotFound message). Anything else
// (degraded IPC, permissions) keeps the row without a timestamp.
const MISSING_RE = /MT_FS_NOT_FOUND|No such file/i

const editorStore = useEditorStore()
const projectStore = useProjectStore()

const recentFiles = ref([])
const recentFolders = ref([])
const sessionPaths = ref([])
const toast = ref(null)
const dragOver = ref(false)
const whatsNew = ref(null)
let _homeDir = ''
let _toastTimer = null
let _dragDepth = 0

// Platform shortcut glyphs for the three header actions.
const shortcutOpenFile = isOsx ? '⌘O' : 'Ctrl+O'
const shortcutOpenFolder = isOsx ? '⇧⌘O' : 'Ctrl+Shift+O'
const shortcutNew = isOsx ? '⌘N' : 'Ctrl+N'

const basename = (p) => {
  if (!p) return ''
  const parts = p.split('/')
  return parts[parts.length - 1] || p
}

const dirname = (p) => {
  if (!p) return ''
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  return p.substring(0, idx)
}

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
// stat every candidate in parallel; rows whose stat fails with
// MT_FS_NOT_FOUND / "No such file" drop off silently, other stat
// failures keep the row without a timestamp (degraded environments
// must not wipe the recent list).
const hydrateFiles = async (paths) => {
  const stats = await Promise.all(
    paths.map((p) =>
      ipcFs.stat(p).catch((e) => {
        const msg = String((e && e.message) || e || '')
        return MISSING_RE.test(msg) ? 'missing' : null
      })
    )
  )
  recentFiles.value = paths
    .map((path, i) => ({ path, stat: stats[i] }))
    .filter((x) => x.stat !== 'missing')
    .slice(0, MAX_RECENT_FILES_SHOWN)
    .map((x) => makeRow(x.path, x.stat))
}

const hydrateFolders = async (paths) => {
  const stats = await Promise.all(
    paths.map((p) =>
      ipcFs.stat(p).catch((e) => {
        const msg = String((e && e.message) || e || '')
        return MISSING_RE.test(msg) ? 'missing' : null
      })
    )
  )
  recentFolders.value = paths
    .map((path, i) => ({ path, stat: stats[i] }))
    .filter((x) => x.stat !== 'missing')
    .slice(0, MAX_RECENT_FOLDERS_SHOWN)
    .map((x) => makeRow(x.path, x.stat))
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
  const [recent, session, folders] = await Promise.all([
    editorStore.GET_RECENT_FILES(),
    editorStore.GET_SESSION_PATHS(),
    projectStore.GET_RECENT_FOLDERS()
  ])
  sessionPaths.value = session || []
  await Promise.all([
    hydrateFiles((recent || []).slice(0, 10)),
    hydrateFolders((folders || []).slice(0, MAX_RECENT_FOLDERS_SHOWN))
  ])
  checkWhatsNew()
})

onBeforeUnmount(() => {
  if (_toastTimer) clearTimeout(_toastTimer)
})

// First three file names of the last session ("a.md, b.md, c.md, …").
const sessionSummary = computed(() => {
  const names = sessionPaths.value.slice(0, 3).map(basename)
  const suffix = sessionPaths.value.length > 3 ? ', …' : ''
  return names.join(', ') + suffix
})

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
  projectStore.OPEN_RECENT_FOLDER(entry.path)
}

const restoreSession = () => {
  editorStore.RESTORE_SESSION()
}

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
// The M-017 remove command returns the persisted old index; the undo
// insert puts the entry back exactly there so the order is restored.
const removeRecentFile = async (entry) => {
  const index = recentFiles.value.findIndex((f) => f.path === entry.path)
  if (index < 0) return
  const snapshot = [...recentFiles.value]
  recentFiles.value.splice(index, 1)
  let persistedIndex = index
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

const removeRecentFolder = async (entry) => {
  const index = recentFolders.value.findIndex((f) => f.path === entry.path)
  if (index < 0) return
  const snapshot = [...recentFolders.value]
  recentFolders.value.splice(index, 1)
  try {
    // Persist the list WITHOUT the removed folder; the snapshot is only
    // for Undo.
    await projectStore.SET_RECENT_FOLDERS(recentFolders.value.map((f) => f.path))
  } catch (e) {
    console.warn('[Recent][removeRecentFolder][BLOCK_RECENT_REMOVED] persisted=false', e)
  }
  showToast({
    kind: 'folder',
    name: entry.name,
    path: entry.path,
    index,
    snapshot
  })
}

const undoRemove = async () => {
  const entry = toast.value
  if (!entry) return
  if (_toastTimer) clearTimeout(_toastTimer)
  toast.value = null
  if (entry.kind === 'file') {
    recentFiles.value = entry.snapshot
    try {
      await ipcRecent.insert(entry.path, entry.index)
    } catch (e) {
      console.warn('[Recent][undoRemove][BLOCK_RECENT_UNDONE] persisted=false', e)
    }
  } else {
    recentFolders.value = entry.snapshot
    try {
      await projectStore.SET_RECENT_FOLDERS(entry.snapshot.map((f) => f.path))
    } catch (e) {
      console.warn('[Recent][undoRemove][BLOCK_RECENT_UNDONE] persisted=false', e)
    }
  }
}
// END_BLOCK_REMOVE_RECENT

// ── native right-click menu (menu key / Shift+F10 fire contextmenu) ──

// START_BLOCK_ROW_CONTEXT_MENU
const openRowContextMenu = async (event, entry, kind) => {
  const items = [
    { label: t('recent.open'), id: 'open' },
    {
      label: isWindows ? t('recent.showInExplorer') : t('recent.showInFinder'),
      id: 'showInFolder'
    },
    { label: t('recent.copyPath'), id: 'copyPath' },
    { type: 'separator' },
    { label: t('recent.remove'), id: 'removeFromList' }
  ]
  let clickedId = null
  try {
    clickedId = await window.electron.ipcRenderer.invoke(
      'mt::window-popup-context-menu',
      {
        items,
        x: Number.isFinite(event?.clientX) ? event.clientX : 0,
        y: Number.isFinite(event?.clientY) ? event.clientY : 0
      }
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
// Reuses the app.vue drop pipeline: dropped files travel through the
// same 'mt::window::drop' channel as the import dialog (app.vue skips
// the dialog itself while the welcome screen is up).
const onDragEnter = (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return
  _dragDepth += 1
  dragOver.value = true
}

const onDragOver = (event) => {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

const onDragLeave = () => {
  _dragDepth = Math.max(0, _dragDepth - 1)
  if (_dragDepth === 0) dragOver.value = false
}

const onDrop = (event) => {
  _dragDepth = 0
  dragOver.value = false
  const fileList = []
  const transfer = event.dataTransfer
  if (!transfer) return
  if (transfer.files && transfer.files.length > 0) {
    for (const file of transfer.files) {
      fileList.push(window.electron.webUtils.getPathForFile(file))
    }
  } else if (transfer.items) {
    for (const file of transfer.items) {
      if (file.kind === 'file') {
        fileList.push(window.electron.webUtils.getPathForFile(file.getAsFile()))
      }
    }
  }
  window.electron.ipcRenderer.send('mt::window::drop', fileList)
}
// END_BLOCK_DROP_ZONE
</script>

<style scoped>
.welcome-screen {
  background: var(--editorBgColor);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  user-select: none;
  zoom: var(--content-zoom, 1);
  position: relative;
}

.welcome-content {
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
  position: absolute;
  right: 10px;
  bottom: 6px;
  z-index: 1;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1;
  color: var(--editorColor);
  padding: 4px 7px;
  border-radius: 6px;
  border: 1px solid var(--tableBorderColor, var(--editorColor10));
  background: var(--floatBgColor, var(--editorBgColor));
  white-space: nowrap;
  cursor: pointer;
  visibility: hidden;
}
.recent-item:hover .row-remove,
.recent-item:focus-within .row-remove {
  visibility: visible;
}
.row-remove:hover {
  border-color: var(--themeColor);
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
