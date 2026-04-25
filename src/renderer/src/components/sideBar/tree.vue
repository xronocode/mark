<template>
  <div class="tree-view">
    <div class="title">
      <!-- Placeholder -->
    </div>

    <!-- Opened tabs -->
    <div class="opened-files">
      <div class="title">
        <svg
          class="icon icon-arrow"
          :class="{ fold: !showOpenedFiles }"
          aria-hidden="true"
          @click.stop="toggleOpenedFiles()"
        >
          <use xlink:href="#icon-arrow"></use>
        </svg>
        <span class="default-cursor text-overflow" @click.stop="toggleOpenedFiles()">{{
          t('sideBar.tree.openedFiles')
        }}</span>
        <a href="javascript:;" :title="t('sideBar.tree.saveAll')" @click.stop="saveAll(false)">
          <svg class="icon" aria-hidden="true">
            <use xlink:href="#icon-save-all"></use>
          </svg>
        </a>
        <a href="javascript:;" :title="t('sideBar.tree.closeAll')" @click.stop="saveAll(true)">
          <svg class="icon" aria-hidden="true">
            <use xlink:href="#icon-close-all"></use>
          </svg>
        </a>
      </div>
      <div v-show="showOpenedFiles" class="opened-files-list">
        <transition-group name="list">
          <opened-file v-for="tab of tabs" :key="tab.id" :file="tab"></opened-file>
        </transition-group>
      </div>
    </div>

    <!-- v1.1.0 Phase-A6: multi-root rendering — one section per opened folder. -->
    <div
      v-for="root in projectTrees"
      :key="root.pathname"
      class="project-tree"
    >
      <div class="title">
        <svg
          class="icon icon-arrow"
          :class="{ fold: !isRootExpanded(root.pathname) }"
          aria-hidden="true"
          @click.stop="toggleRootDirectories(root.pathname)"
        >
          <use xlink:href="#icon-arrow"></use>
        </svg>
        <span
          class="default-cursor text-overflow"
          :title="root.pathname"
          @click.stop="toggleRootDirectories(root.pathname)"
        >{{ root.name }}</span>
        <a
          href="javascript:;"
          class="close-root-btn"
          :title="t('sideBar.tree.closeFolder')"
          @click.stop="handleCloseRoot(root.pathname)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </a>
      </div>
      <div v-show="isRootExpanded(root.pathname)" class="tree-wrapper">
        <folder
          v-for="folder of root.folders"
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
          v-for="file of root.files"
          :key="file.id"
          :file="file"
          :depth="depth"
        ></file>
        <div
          v-if="
            root.files.length === 0 &&
            root.folders.length === 0 &&
            createCache.dirname !== root.pathname
          "
          class="empty-project"
        >
          <span>{{ t('sideBar.tree.emptyProject') }}</span>
          <div class="centered-group">
            <button class="button-primary" @click="createFileInRoot(root)">
              {{ t('sideBar.tree.createFile') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state shown only when there are NO open folders. -->
    <div v-if="projectTrees.length === 0" class="open-project">
      <div class="centered-group">
        <button class="button-primary" @click="openFolder">
          {{ t('sideBar.tree.openFolder') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import OpenedFile from './treeOpenedTab.vue'
import bus from '../../bus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  openedFiles: Array,
  tabs: Array
})

const depth = 0
const showOpenedFiles = ref(true)
const createName = ref('')
const input = ref(null)

const projectStore = useProjectStore()
const editorStore = useEditorStore()

// Per-root collapse state, keyed by canonical pathname. Default = expanded
// (i.e., absent key means open). Toggling sets the key explicitly.
const collapsedRoots = ref({})

// Computed properties
const { createCache, projectTrees } = storeToRefs(projectStore)

const isRootExpanded = (pathname) => collapsedRoots.value[pathname] !== true

const toggleRootDirectories = (pathname) => {
  const next = !isRootExpanded(pathname)
  // eslint-disable-next-line no-console
  console.debug(`[TreeVue][toggleDirectoriesForRoot][BLOCK_TOGGLE] pathname=${pathname} nextOpen=${!next}`)
  collapsedRoots.value = { ...collapsedRoots.value, [pathname]: next }
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
  height: 35px;
  line-height: 35px;
  padding: 0 15px;
  display: flex;
  flex-shrink: 0;
  flex-direction: row-reverse;
}

.icon-arrow {
  margin-right: 5px;
  transition: all 0.25s ease-out;
  transform: rotate(90deg);
  fill: var(--sideBarTextColor);
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
}

.open-project button.button-primary {
  display: block;
  margin-top: 20px;
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
.empty-project {
  font-size: 14px;
  display: flex;
  flex-direction: column;
  padding-top: 40px;
  align-items: center;
  color: var(--sideBarTextColor);
  & button {
    margin-top: 10px;
  }
}

.empty-project > a {
  color: var(--highlightThemeColor);
  text-align: center;
  margin-top: 15px;
  text-decoration: none;
}
.bold {
  font-weight: 600;
}
</style>
