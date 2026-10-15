<template>
  <div class="tree-view">
    <div class="title">
      <!-- Placeholder -->
    </div>

    <!-- C-51 T-002: Recent + Pinned collapsible sections above the tree
         (canvas MacOS). Hidden while their lists are empty. -->
    <file-sections></file-sections>

    <!-- Opened tabs — hidden when there are no open tabs (user feedback). -->
    <div v-if="tabs && tabs.length > 0" class="opened-files">
      <div class="title">
        <chrome-icon
          name="chevron-right"
          :size="12"
          class="icon-arrow"
          :class="{ fold: !showOpenedFiles }"
          aria-hidden="true"
          @click.stop="toggleOpenedFiles()"
        ></chrome-icon>
        <span class="default-cursor text-overflow" @click.stop="toggleOpenedFiles()">{{
          t('sideBar.tree.openedFiles')
        }}</span>
        <a href="javascript:;" :title="t('sideBar.tree.saveAll')" @click.stop="saveAll(false)">
          <chrome-icon name="save-all" :size="14" aria-hidden="true"></chrome-icon>
        </a>
        <a href="javascript:;" :title="t('sideBar.tree.closeAll')" @click.stop="saveAll(true)">
          <chrome-icon name="close-all" :size="14" aria-hidden="true"></chrome-icon>
        </a>
      </div>
      <div v-show="showOpenedFiles" class="opened-files-list">
        <transition-group name="list">
          <opened-file v-for="tab of tabs" :key="tab.id" :file="tab"></opened-file>
        </transition-group>
      </div>
    </div>

    <!-- v1.1.0 Phase-A6: multi-root rendering — one section per opened folder.
         C-51 T-001: the root header doubles as the folder-switcher row
         (canvas Main): name + chevron-down open the existing folder picker;
         the left chevron still toggles collapse. -->
    <div
      v-for="root in projectTrees"
      :key="root.pathname"
      class="project-tree"
    >
      <div class="title folder-switcher">
        <chrome-icon
          name="chevron-right"
          :size="12"
          class="icon-arrow"
          :class="{ fold: !isRootExpanded(root.pathname) }"
          aria-hidden="true"
          @click.stop="toggleRootDirectories(root.pathname)"
        ></chrome-icon>
        <span
          class="default-cursor text-overflow"
          :title="root.pathname"
          @click.stop="openFolder()"
        >{{ root.name }}</span>
        <chrome-icon
          name="chevron-down"
          :size="12"
          class="switcher-chevron"
          :title="t('sideBar.tree.openOrSwitchFolder')"
          aria-hidden="true"
          @click.stop="openFolder()"
        ></chrome-icon>
        <a
          href="javascript:;"
          class="close-root-btn"
          :title="t('sideBar.tree.closeFolder')"
          @click.stop="handleCloseRoot(root.pathname)"
        >
          <chrome-icon name="close" :size="12" aria-hidden="true"></chrome-icon>
        </a>
      </div>
      <div v-show="isRootExpanded(root.pathname)" class="tree-wrapper">
        <folder
          v-for="folder of rootFoldersOf(root)"
          :key="folder.id"
          :folder="folder"
          :depth="depth"
        ></folder>
        <input
          v-show="createCache.dirname === root.pathname"
          ref="input"
          v-model="createName"
          placeholder="Enter .md file name"
          type="text"
          class="new-input"
          :style="{ 'margin-left': `${depth * 5 + 15}px` }"
          @keypress.enter="handleInputEnter"
        />
        <file
          v-for="file of rootFilesOf(root)"
          :key="file.id"
          :file="file"
          :depth="depth"
        ></file>
        <div
          v-if="rootIsEmpty(root)"
          class="new-file-row"
          :style="{ 'padding-left': `${depth * 20 + 20}px` }"
          :title="t('sideBar.tree.createFile')"
          @click.stop="createFileInRoot(root)"
        >
          <span class="new-file-icon" aria-hidden="true">
            <chrome-icon name="file-plus" :size="14"></chrome-icon>
          </span>
          <span class="new-file-label">{{ t('sideBar.tree.newFile') }}</span>
        </div>
      </div>
    </div>

    <!-- Empty state shown only when there are NO open folders. -->
    <div v-if="projectTrees.length === 0" class="open-project">
      <div class="centered-group">
        <button class="open-folder-btn" @click="openFolder">
          {{ t('sideBar.tree.openFolder') }}
        </button>
        <div v-if="recentFolders.length" class="recent-folders-section">
          <span class="recent-folders-title">{{ t('sideBar.tree.recentFolders') }}</span>
        </div>
        <ul v-if="recentFolders.length" class="recent-folders">
          <li
            v-for="folder in recentFolders"
            :key="folder"
            class="recent-folder-item"
            :title="folder"
            @click="openRecentFolder(folder)"
          >
            <span class="recent-folder-name">{{ folderName(folder) }}</span>
            <span class="recent-folder-path">{{ shortenPath(folder) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/sideBar/tree.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The sidebar Files column — Recent/Pinned sections (fileSections.vue), the opened-tabs list, and the multi-root folder tree with the C-51 T-001 folder-switcher header and Markdown-only view filter.
//   SCOPE: Section composition, per-root collapse state, root-level filtered folder/file lists (store/treeFilter.js per the treeShowAllFiles preference), root close/create wiring, the empty-project open/recent state.
//   DEPENDS: vue, pinia, store/project, store/editor, store/preferences, store/treeFilter, ./treeFolder.vue, ./treeFile.vue, ./treeOpenedTab.vue, ./fileSections.vue, ../icons/chromeIcons.js, bus, vue-i18n, util/pathDisplay.
//   LINKS: .grace/changes/active/C-51 T-001/T-002; .canvas/Main.dc.html (switcher + tree); .canvas/MacOS.dc.html (sections); .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 v2.0.0: C-51 T-001/T-002 — the root header restyles as
//     the folder-switcher row (name + chevron-down open the existing
//     folder picker; the left chevron keeps the collapse toggle), root
//     lists filter through store/treeFilter.js (Markdown-only unless
//     treeShowAllFiles; the empty-root placeholder keys on the visible
//     lists), and fileSections.vue (Recent + Pinned) mounts above the
//     tree.
//   - 2026-10-15 C-38 T-006 N4 d: every icon in the tree chrome renders
//     from the drawn chromeIcons set (chevron-right arrows, save-all /
//     close-all header actions, close-root X, file-plus empty-root
//     row); the iconfont sprite and the ad-hoc inline svgs are gone.
// END_CHANGE_SUMMARY
import { ref, watch, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { visibleFolders, visibleFiles } from '@/store/treeFilter'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import OpenedFile from './treeOpenedTab.vue'
import FileSections from './fileSections.vue'
import { ChromeIcon } from '../icons/chromeIcons.js'
import bus from '../../bus'
import { useI18n } from 'vue-i18n'
import { shortenMiddle } from '../../util/pathDisplay'

const { t } = useI18n()

defineProps({
  openedFiles: Array,
  tabs: Array
})

const depth = 0
const showOpenedFiles = ref(true)
const createName = ref('')
const input = ref(null)
const recentFolders = ref([])
let _homeDir = ''

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferenceStore = usePreferencesStore()

// Per-root collapse state, keyed by canonical pathname. Default = expanded
// (i.e., absent key means open). Toggling sets the key explicitly.
const collapsedRoots = ref({})

// Computed properties
const { createCache, projectTrees } = storeToRefs(projectStore)
const { treeShowAllFiles } = storeToRefs(preferenceStore)

// START_BLOCK_ROOT_VIEW_LISTS
// C-51 T-001: root-level display lists through the shared view filter —
// Markdown files (and folders with Markdown below) unless treeShowAllFiles.
// The empty-root placeholder keys on the visible lists so a root holding
// only non-Markdown files still offers "New file" in the default view.
const rootFoldersOf = (root) => visibleFolders(root.folders, treeShowAllFiles.value)
const rootFilesOf = (root) => visibleFiles(root.files, treeShowAllFiles.value)
const rootIsEmpty = (root) =>
  rootFoldersOf(root).length === 0 &&
  rootFilesOf(root).length === 0 &&
  createCache.value.dirname !== root.pathname
// END_BLOCK_ROOT_VIEW_LISTS

const _refreshRecentFolders = async () => {
  recentFolders.value = await projectStore.GET_RECENT_FOLDERS()
}

watch(projectTrees, (trees) => {
  if (trees.length === 0) _refreshRecentFolders()
})

const isRootExpanded = (pathname) => collapsedRoots.value[pathname] !== true

const toggleRootDirectories = (pathname) => {
  // C-51 review fix: collapse when currently expanded. The old code stored
  // `!isRootExpanded` as the *collapsed* flag, so an expanded root was set
  // to collapsed=false and the chevron never collapsed it.
  const collapse = isRootExpanded(pathname)
  // eslint-disable-next-line no-console
  console.debug(`[TreeVue][toggleDirectoriesForRoot][BLOCK_TOGGLE] pathname=${pathname} nextOpen=${!collapse}`)
  collapsedRoots.value = { ...collapsedRoots.value, [pathname]: collapse }
}

const handleCloseRoot = (pathname) => {
  // eslint-disable-next-line no-console
  console.debug(`[TreeVue][handleCloseRoot][BLOCK_DISPATCH] pathname=${pathname}`)
  projectStore.CLOSE_PROJECT(pathname)
  // Clean up local collapse state for the removed root.
  if (collapsedRoots.value[pathname] !== undefined) {
    const next = { ...collapsedRoots.value }
    delete next[pathname]
    collapsedRoots.value = next
  }
}

// Methods
const openFolder = () => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const openRecentFolder = (path) => {
  projectStore.OPEN_RECENT_FOLDER(path)
}

const folderName = (p) => {
  if (!p) return ''
  const parts = p.split('/')
  return parts[parts.length - 1] || p
}

const shortenPath = (p) => {
  if (!p) return ''
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  const dir = p.substring(0, idx)
  const shown = _homeDir && dir.startsWith(_homeDir) ? '~' + dir.substring(_homeDir.length) : dir
  return shortenMiddle(shown)
}

const saveAll = (isClose) => {
  editorStore.ASK_FOR_SAVE_ALL(isClose)
}

const createFileInRoot = (root) => {
  projectStore.CHANGE_ACTIVE_ITEM(root)
  bus.emit('SIDEBAR::new', 'file')
}

const toggleOpenedFiles = () => {
  showOpenedFiles.value = !showOpenedFiles.value
}

// From createFileOrDirectoryMixins
const handleInputFocus = () => {
  nextTick(() => {
    if (input.value) {
      const el = Array.isArray(input.value) ? input.value[0] : input.value
      if (el) {
        el.focus()
        createName.value = ''
      }
    }
  })
}

const handleInputEnter = () => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', handleInputFocus)

  // hide rename or create input if needed
  document.addEventListener('click', (event) => {
    const target = event.target
    if (target.tagName !== 'INPUT' && target.textContent !== 'Create File') {
      projectStore.CHANGE_ACTIVE_ITEM({})
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  document.addEventListener('contextmenu', (event) => {
    const target = event.target
    if (target.tagName !== 'INPUT') {
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  // Load recent folders asynchronously (non-blocking)
  ;(async () => {
    try {
      const { homeDir } = await import('@tauri-apps/api/path')
      _homeDir = (await homeDir()).replace(/\/+$/, '')
    } catch { /* dev/test fallback */ }
    recentFolders.value = await projectStore.GET_RECENT_FOLDERS()
  })()
})
</script>

<style scoped>
.list-item {
  display: inline-block;
  margin-right: 10px;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.2s;
}
.list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateX(-50px);
}
.tree-view {
  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.tree-view > .title {
  /* Placeholder used to be 35px tall; tightened twice (16 → 11) per user
     feedback to lift the "Open Files" / first-root header closer to the
     search toolbar. */
  height: 11px;
  flex-shrink: 0;
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

.opened-files > .title,
.project-tree > .title {
  height: 30px;
  line-height: 30px;
  font-size: 14px;
}

.opened-files .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.opened-files .title > span {
  flex: 1;
}

.opened-files .title > a {
  display: none;
  text-decoration: none;
  color: var(--sideBarColor);
  margin-left: 8px;
}
.opened-files div.title:hover > a,
.opened-files div.title > a:hover {
  display: block;
}

.opened-files div.title:hover > a:hover,
.opened-files div.title > a:hover:hover {
  color: var(--highlightThemeColor);
}
.opened-files {
  display: flex;
  flex-direction: column;
}
.default-cursor {
  cursor: pointer;
}
.opened-files .opened-files-list {
  max-height: 200px;
  overflow: auto;
  flex: 1;
}

.opened-files .opened-files-list::-webkit-scrollbar:vertical {
  width: 8px;
}

.project-tree {
  display: flex;
  flex-direction: column;
  /* Each root section is independently scrollable so siblings don't fight
     for vertical space when one tree is huge. */
  flex: 0 1 auto;
  max-height: 100%;
  overflow: hidden;
  border-bottom: 1px solid var(--itemBgColor);
}

.project-tree:last-of-type {
  border-bottom: none;
  flex: 1 1 auto;
}

.project-tree > .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
  user-select: none;
}

.project-tree > .title > span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

/* C-51 T-001 folder-switcher row (canvas Main): a soft rounded chip that
   reads as the vault switcher — name + chevron-down open the existing
   folder picker, the left chevron keeps the collapse toggle. */
.project-tree > .title.folder-switcher {
  height: 32px;
  margin: 0 8px;
  padding-right: 8px;
  padding-left: 8px;
  border-radius: 8px;
  background: var(--sideBarItemHoverBgColor);
}

.project-tree > .title.folder-switcher > span {
  font-weight: 500;
}

.project-tree > .title.folder-switcher .switcher-chevron {
  flex-shrink: 0;
  margin-left: 6px;
  color: var(--sideBarIconColor);
  cursor: pointer;
}

.project-tree > .title > a.close-root-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  color: var(--sideBarIconColor);
  opacity: 0;
  border-radius: 4px;
  transition: opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease;
  text-decoration: none;
}
.project-tree:hover > .title > a.close-root-btn,
.project-tree > .title > a.close-root-btn:focus {
  opacity: 1;
}
.project-tree > .title > a.close-root-btn:hover {
  color: var(--highlightThemeColor);
  background-color: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
}
.project-tree > .title > a.close-root-btn svg {
  pointer-events: none;
}

.project-tree > .tree-wrapper {
  overflow: auto;
  flex: 1;
}

.project-tree > .tree-wrapper::-webkit-scrollbar:vertical {
  width: 8px;
}
.open-project {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  padding-bottom: 100px;
}

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* The group is a centred flex child: without a width it grows to the
     longest recent-folder path and runs past the sidebar edge. */
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.open-folder-btn {
  display: block;
  margin-top: 20px;
  padding: 6px 18px;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.15));
  border-radius: 4px;
  background: transparent;
  color: var(--sideBarColor);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.open-folder-btn:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.06));
  border-color: var(--themeColor, #409eff);
  color: var(--themeColor, #409eff);
}
.recent-folders-section {
  margin-top: 20px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 10px;
}
.recent-folders-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sideBarColor);
  opacity: 0.5;
}
.recent-folders {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.recent-folder-item {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
}
.recent-folder-item:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.06));
}
.recent-folder-name {
  font-size: 13px;
  color: var(--sideBarColor);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-folder-item:hover .recent-folder-name {
  color: var(--themeColor, #409eff);
}
.recent-folder-path {
  font-size: 11px;
  color: var(--sideBarColor);
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.new-input {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--inputBgColor);
  width: calc(100% - 45px);
  border-radius: 3px;
}
.tree-wrapper {
  position: relative;
}
/* New-file pseudo-row shown inside an empty root section. Visually mirrors
   .side-bar-file (left-pad + icon + label) so it reads as "an actionable
   file slot" rather than a CTA button — user feedback: the previous
   centered button felt out of place. Click triggers createFile via the
   existing CHANGE_ACTIVE_ITEM + bus emit chain. */
.new-file-row {
  display: flex;
  align-items: center;
  height: 28px;
  font-size: 13px;
  color: var(--sideBarColor);
  cursor: pointer;
  user-select: none;
  opacity: 0.85;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}
.new-file-row:hover {
  opacity: 1;
  background-color: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
}
.new-file-icon {
  flex-shrink: 0;
  margin-right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  /* Green tint to distinguish from real file icons. */
  color: #2ea043;
}
.new-file-row:hover .new-file-icon {
  color: #3fb950;
}
.new-file-label {
  font-style: italic;
  opacity: 0.85;
}
.bold {
  font-weight: 600;
}
</style>
