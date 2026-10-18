<template>
  <div class="sidebar-sections">
    <!-- START_BLOCK_SECTION_RECENT -->
    <section
      v-if="recentRows.length > 0"
      class="sidebar-section"
      data-section="recent"
    >
      <div class="section-title" @click.stop="toggleSection('recent')">
        <chrome-icon
          name="chevron-right"
          :size="12"
          class="icon-arrow"
          :class="{ fold: !openSections.recent }"
          aria-hidden="true"
        ></chrome-icon>
        <span class="default-cursor text-overflow">{{ t('sideBar.tree.recentFiles') }}</span>
        <!-- C-67: clear the whole Recent list, like «Close all» on Opened files. -->
        <button
          type="button"
          class="section-action"
          :title="t('sideBar.tree.clearRecent')"
          :aria-label="t('sideBar.tree.clearRecent')"
          @click.stop="clearRecent"
        >
          <chrome-icon name="broom" :size="14" aria-hidden="true"></chrome-icon>
        </button>
      </div>
      <div v-show="openSections.recent" class="section-list">
        <div
          v-for="row in recentRows"
          :key="row.path"
          class="section-file"
          :class="{ missing: row.missing, current: isCurrent(row.path) }"
          :title="row.path"
          @click="openPath(row)"
        >
          <span class="section-file-name">{{ row.name }}</span>
          <button
            class="section-remove"
            :title="t('sideBar.tree.remove')"
            @click.stop="removeRecent(row)"
          >
            <chrome-icon name="close" :size="10" aria-hidden="true"></chrome-icon>
          </button>
        </div>
      </div>
    </section>
    <!-- END_BLOCK_SECTION_RECENT -->

    <!-- START_BLOCK_SECTION_PINNED -->
    <section
      v-if="pinnedRows.length > 0"
      class="sidebar-section"
      data-section="pinned"
    >
      <div class="section-title" @click.stop="toggleSection('pinned')">
        <chrome-icon
          name="chevron-right"
          :size="12"
          class="icon-arrow"
          :class="{ fold: !openSections.pinned }"
          aria-hidden="true"
        ></chrome-icon>
        <span class="default-cursor text-overflow">{{ t('sideBar.tree.pinnedFiles') }}</span>
      </div>
      <div v-show="openSections.pinned" class="section-list">
        <div
          v-for="(row, index) in pinnedRows"
          :key="row.path"
          class="section-file"
          :class="{ missing: row.missing, current: isCurrent(row.path) }"
          :title="row.path"
          draggable="true"
          @click="openPath(row)"
          @dragstart="onDragStart(index, $event)"
          @dragover.prevent
          @drop="onDrop(index)"
        >
          <span class="section-file-name">{{ row.name }}</span>
          <button
            class="section-remove"
            :title="row.missing ? t('sideBar.tree.remove') : t('sideBar.tree.unpin')"
            @click.stop="unpinRow(row)"
          >
            <chrome-icon name="close" :size="10" aria-hidden="true"></chrome-icon>
          </button>
        </div>
      </div>
    </section>
    <!-- END_BLOCK_SECTION_PINNED -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/sideBar/fileSections.vue
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: The two collapsible sidebar sections above the folder tree (C-51 T-002) — Recent (existing recent-files list, newest first, up to 10) and Pinned (persisted pinnedFiles list, drag to reorder); rows open the file through the existing open path, missing files render greyed with a Remove action, and section collapsed state persists.
//   SCOPE: recent list load/refresh/remove, pinned list render/unpin/drag-reorder, per-path missing detection via ipcFs.stat, collapse persistence via ipcPrefs.
//   DEPENDS: vue, pinia, store/editor (GET_RECENT_FILES, tabs, currentFile), store/pinned, ipc/runtime (ipcFs, ipcPrefs, ipcRecent), ../icons/chromeIcons.js, vue-i18n.
//   LINKS: .grace/changes/active/C-51 T-002/T-013; .grace/changes/active/C-67; .canvas/MacOS.dc.html (Recent/Pinned); .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   openSections - collapse state per section (true = expanded); defaults true, hydrated from ipcPrefs on mount.
//   toggleSection - flip one section + persist `sideBar<Name>Collapsed` (true = collapsed).
//   recentRows - {path, name, missing} rows from editor GET_RECENT_FILES capped at 10, newest first.
//   reloadRecent - re-query + re-stat the recent list (mount and current-file changes).
//   removeRecent - drop one row: ipcRecent.remove then local splice (matches the welcome-screen semantics).
//   clearRecent - C-67 header broom: ipcRecent.clear then empty the local rows (warns, never throws, on a backend failure).
//   pinnedRows - computed rows from the pinned store + the pinnedMissing stat set.
//   statPinned / statPaths - mark rows whose ipcFs.stat reports MT_FS_NOT_FOUND (same detection as the welcome screen).
//   openPath - existing open path: select the open tab or send mt::open-file; missing rows do nothing.
//   isCurrent - the row's path is the editor's current file (soft pill).
//   onDragStart / onDrop - HTML5 drag reorder inside Pinned → pinned store MOVE_PINNED.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-19 C-67: «Clear Recent» broom in the Recent header.
//   v1.2.0 - 2026-10-17 C-51 T-013: file rows lose the
//   leading file-type icon and bold — the name starts on the shared text
//   grid (--sideBarRowInset + the folder icon slot, aligning with folder
//   names and tree file rows), every row is regular weight, and the
//   current file in Recent/Pinned is marked by accent text only.
//   v1.1.0 - 2026-10-16 C-51 T-011: the section-header
//   chevron starts at the shared --sideBarRowInset (12px) instead of
//   touching the sidebar's left edge; the Pinned section itself stays
//   hidden while empty exactly as before (user correction).
//   v1.0.0 - 2026-10-16 C-51 T-002: initial component —
//   Recent + Pinned sections above the tree, hidden while empty, rows on
//   the shared 32px grid, missing files greyed with a hover Remove,
//   collapse state persisted through ipcPrefs.
// END_CHANGE_SUMMARY
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { usePinnedStore } from '@/store/pinned'
import { ipcFs, ipcPrefs, ipcRecent } from '../../ipc/runtime'
import { ChromeIcon } from '../icons/chromeIcons.js'

const MAX_RECENT_ROWS = 10

// Collapsed-state persistence keys (true = collapsed). Absent key means
// expanded — the default for a fresh profile.
const COLLAPSE_KEYS = Object.freeze({
  recent: 'sideBarRecentCollapsed',
  pinned: 'sideBarPinnedCollapsed'
})

const { t } = useI18n()
const editorStore = useEditorStore()
const pinnedStore = usePinnedStore()

const { currentFile, tabs } = storeToRefs(editorStore)

const openSections = ref({ recent: true, pinned: true })
const recentRows = ref([])
const pinnedMissing = ref(new Set())
const dragFrom = ref(-1)

// START_BLOCK_MISSING_DETECTION
// Same convention as the C-46 welcome screen: ipcInvoke maps the backend
// rejection to an IpcError whose cause.code is MT_FS_NOT_FOUND (message
// serializes as "[object Object]"); the plain-message regex covers
// non-structured rejections.
const MISSING_CODE = 'MT_FS_NOT_FOUND'
const MISSING_RE = /MT_FS_NOT_FOUND|No such file/i
const isMissingPathError = (e) => {
  if (e?.cause?.code === MISSING_CODE || e?.code === MISSING_CODE) return true
  const msg = String(e?.cause?.message || e?.message || e || '')
  return MISSING_RE.test(msg)
}

const statPaths = async (paths) => {
  const results = await Promise.all(
    paths.map((p) =>
      ipcFs.stat(p).then(() => false).catch((e) => isMissingPathError(e))
    )
  )
  const missing = new Set()
  paths.forEach((p, i) => {
    if (results[i]) missing.add(p)
  })
  return missing
}
// END_BLOCK_MISSING_DETECTION

// START_BLOCK_SECTION_STATE
const toggleSection = (key) => {
  const next = !openSections.value[key]
  openSections.value = { ...openSections.value, [key]: next }
  ipcPrefs.set(COLLAPSE_KEYS[key], next === false).catch(() => {})
}

const basenameOf = (p) => {
  try {
    return window.path.basename(p)
  } catch {
    return p
  }
}

const isCurrent = (path) => {
  const current = currentFile.value?.pathname
  if (!current) return false
  if (window.fileUtils?.isSamePathSync) {
    return !!window.fileUtils.isSamePathSync(current, path)
  }
  return current === path
}
// END_BLOCK_SECTION_STATE

// START_BLOCK_OPEN_PATH
// The existing open path (same as treeFile.vue): select the already-open
// tab, otherwise ask main to open the file. Missing rows are inert.
const openPath = (row) => {
  if (!row || row.missing) return
  const openedTab = tabs.value.find((f) =>
    window.fileUtils?.isSamePathSync?.(f.pathname, row.path)
  )
  if (openedTab) {
    if (currentFile.value.pathname !== openedTab.pathname) {
      editorStore.UPDATE_CURRENT_FILE(openedTab)
    }
  } else {
    window.electron.ipcRenderer.send('mt::open-file', row.path, {})
  }
}
// END_BLOCK_OPEN_PATH

// START_BLOCK_RECENT_LIST
const reloadRecent = async () => {
  try {
    const list = await editorStore.GET_RECENT_FILES()
    const paths = (Array.isArray(list) ? list : []).filter(Boolean).slice(0, MAX_RECENT_ROWS)
    const missing = await statPaths(paths)
    recentRows.value = paths.map((p) => ({
      path: p,
      name: basenameOf(p),
      missing: missing.has(p)
    }))
  } catch {
    recentRows.value = []
  }
}

const removeRecent = async (row) => {
  try {
    await ipcRecent.remove(row.path)
  } catch {
    // keep going — the local row still drops; backend list retries never
  }
  recentRows.value = recentRows.value.filter((r) => r.path !== row.path)
}

// C-67: header broom — empty the shared recent list (the home screen reads
// the same list). The local rows drop even if the backend call fails.
const clearRecent = async () => {
  try {
    await ipcRecent.clear()
  } catch (e) {
    console.warn('[SideBar][clearRecent][BLOCK_RECENT_CLEARED] persisted=false', e)
  }
  recentRows.value = []
}
// END_BLOCK_RECENT_LIST

// START_BLOCK_PINNED_LIST
const pinnedRows = computed(() =>
  pinnedStore.pinnedFiles.map((p) => ({
    path: p,
    name: basenameOf(p),
    missing: pinnedMissing.value.has(p)
  }))
)

const statPinned = async () => {
  pinnedMissing.value = await statPaths(pinnedStore.pinnedFiles)
}

const unpinRow = (row) => {
  pinnedStore.UNPIN_FILE(row.path)
}

// Re-stat when the pinned list changes (pin/unpin from any context menu
// or another window's broadcast) so missing markers stay honest.
watch(
  () => pinnedStore.pinnedFiles,
  () => {
    statPinned()
  },
  { deep: true }
)

// Refresh the recent list when the editor opens/switches files — the
// backend reorders mt_recent on every open.
watch(
  () => currentFile.value?.pathname,
  () => {
    reloadRecent()
  }
)
// END_BLOCK_PINNED_LIST

// START_BLOCK_DRAG_REORDER
// Drag to reorder within Pinned only. The dragged index lives in a ref
// (dataTransfer text is unreliable across engines); drop above/below the
// midpoint is not needed — each row is a drop target that inserts at its
// own index.
const onDragStart = (index, event) => {
  dragFrom.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    try {
      event.dataTransfer.setData('text/plain', String(index))
    } catch {
      /* some engines restrict setData — the ref index is the source of truth */
    }
  }
}

const onDrop = (index) => {
  const from = dragFrom.value
  dragFrom.value = -1
  if (from < 0 || from === index) return
  pinnedStore.MOVE_PINNED({ from, to: index })
}
// END_BLOCK_DRAG_REORDER

onMounted(async () => {
  await pinnedStore.LOAD_PINNED_FILES()
  const [recentCollapsed, pinnedCollapsed] = await Promise.all([
    ipcPrefs.get(COLLAPSE_KEYS.recent).catch(() => null),
    ipcPrefs.get(COLLAPSE_KEYS.pinned).catch(() => null)
  ])
  openSections.value = {
    recent: recentCollapsed !== true,
    pinned: pinnedCollapsed !== true
  }
  await Promise.all([reloadRecent(), statPinned()])
})
</script>

<style scoped>
.sidebar-sections {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--sideBarColor);
}

.sidebar-section {
  display: flex;
  flex-direction: column;
}

.section-title {
  height: 28px;
  padding-right: 15px;
  /* C-51 T-011: the disclosure chevron starts at the shared row inset —
     not flush with the sidebar's left edge (user smoke 2026-10-16). */
  padding-left: var(--sideBarRowInset, 12px);
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--sideBarTextColor);
  user-select: none;
}

.section-title > span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* C-67: header action (Recent › Clear), revealed on header hover like the
   Opened files «Save all / Close all» icons. */
.section-title > .section-action {
  display: none;
  align-items: center;
  margin-left: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sideBarColor);
  cursor: pointer;
}
.section-title:hover > .section-action,
.section-title > .section-action:focus-visible {
  display: flex;
}
.section-title > .section-action:hover {
  color: var(--highlightThemeColor);
}

.icon-arrow {
  margin-right: 5px;
  transition: all 0.25s ease-out;
  transform: rotate(90deg);
  color: var(--sideBarTextColor);
}

.icon-arrow.fold {
  transform: rotate(0);
}

.default-cursor {
  cursor: pointer;
}

.section-file {
  display: flex;
  position: relative;
  align-items: center;
  height: 32px;
  box-sizing: border-box;
  padding-right: 10px;
  /* C-51 T-013: the file-type icon is gone; names start on the shared
     text grid (--sideBarRowInset + the folder icon slot) like the tree
     file rows, aligning with folder names. */
  padding-left: calc(var(--sideBarRowInset, 12px) + 20px);
  /* C-51 T-013: one regular weight for every row in every section. */
  font-weight: 400;
  cursor: default;
  user-select: none;
}

.section-file:hover {
  background: var(--sideBarItemHoverBgColor);
}

.section-file.current > .section-file-name {
  /* C-51 T-013: the current file is marked by accent text only — the pill
     lives in the tree; Recent/Pinned never bold a row (user smoke). */
  color: var(--chromeAccent);
}

.section-file.missing {
  opacity: 0.5;
}

.section-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-remove {
  all: unset;
  display: none;
  cursor: pointer;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  border-radius: 4px;
  color: var(--sideBarIconColor);
  align-items: center;
  justify-content: center;
}

.section-remove svg {
  pointer-events: none;
}

.section-file:hover > .section-remove {
  display: inline-flex;
}

.section-remove:hover {
  color: var(--highlightThemeColor);
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
}
</style>
