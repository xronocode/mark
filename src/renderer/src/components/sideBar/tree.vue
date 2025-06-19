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
        <span class="default-cursor text-overflow" @click.stop="toggleOpenedFiles()"
          >Opened files</span
        >
        <a href="javascript:;" title="Save All" @click.stop="saveAll(false)">
          <svg class="icon" aria-hidden="true">
            <use xlink:href="#icon-save-all"></use>
          </svg>
        </a>
        <a href="javascript:;" title="Close All" @click.stop="saveAll(true)">
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

    <!-- Project tree view -->
    <div v-if="projectTree" class="project-tree">
      <div class="title">
        <svg
          class="icon icon-arrow"
          :class="{ fold: !showDirectories }"
          aria-hidden="true"
          @click.stop="toggleDirectories()"
        >
          <use xlink:href="#icon-arrow"></use>
        </svg>
        <span class="default-cursor text-overflow" @click.stop="toggleDirectories()">{{
          projectTree.name
        }}</span>
      </div>
      <div v-show="showDirectories" class="tree-wrapper">
        <folder
          v-for="(folder, index) of projectTree.folders"
          :key="index + 'folder'"
          :folder="folder"
          :depth="depth"
        ></folder>
        <input
          v-show="createCache.dirname === projectTree.pathname"
          ref="input"
          v-model="createName"
          type="text"
          class="new-input"
          :style="{ 'margin-left': `${depth * 5 + 15}px` }"
          @keypress.enter="handleInputEnter"
        />
        <file
          v-for="(file, index) of projectTree.files"
          :key="index + 'file'"
          :file="file"
          :depth="depth"
        ></file>
        <div
          v-if="projectTree.files.length === 0 && projectTree.folders.length === 0"
          class="empty-project"
        >
          <span>Empty project</span>
          <a href="javascript:;" @click.stop="createFile">Create File</a>
        </div>
      </div>
    </div>
    <div v-else class="open-project">
      <div class="centered-group">
        <button class="button-primary" @click="openFolder">Open Folder</button>
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

const props = defineProps({
  projectTree: {
    validator: function (value) {
      return typeof value === 'object'
    },
    required: true
  },
  openedFiles: Array,
  tabs: Array
})

const depth = 0
const showDirectories = ref(true)
const showOpenedFiles = ref(true)
const createName = ref('')
const input = ref(null)

const projectStore = useProjectStore()
const editorStore = useEditorStore()

// Computed properties
const { createCache } = storeToRefs(projectStore)

// Methods
const openFolder = () => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const saveAll = (isClose) => {
  editorStore.ASK_FOR_SAVE_ALL(isClose)
}

const createFile = () => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  bus.emit('SIDEBAR::new', 'file')
}

const toggleOpenedFiles = () => {
  showOpenedFiles.value = !showOpenedFiles.value
}

const toggleDirectories = () => {
  showDirectories.value = !showDirectories.value
}

// From createFileOrDirectoryMixins
const handleInputFocus = () => {
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      createName.value = ''
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
    if (target.tagName !== 'INPUT') {
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
}
.icon-arrow.fold {
  transform: rotate(0);
}
.title .text-overflow {
  flex: 1;
  margin-right: auto;
}
.title a {
  margin-left: 8px;
  color: var(--sideBarColor);
  text-decoration: none;
  & > svg {
    width: 16px;
    height: 16px;
    fill: var(--iconColor);
  }
}
.open-project {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  color: var(--editorColor80);
}

.button-primary {
  color: var(--buttonTextColor);
  background: var(--themeColor);
  font-size: 14px;
  text-align: center;
  outline: none;
  border: none;
  border-radius: 3px;
  padding: 10px 16px;
  cursor: pointer;
  &:hover {
    background: var(--buttonHover);
  }
}

.project-tree {
  flex: 1;
  position: relative;
  height: 100%;
  overflow-y: auto;
}

.project-tree .title {
  display: flex;
  align-items: center;
  background: var(--itemBgColor);
  font-weight: 500;
  height: 35px;
  color: var(--themeColor);
  & .icon {
    fill: var(--iconColor);
  }
}

.empty-project {
  padding: 0 0 0 15px;
  height: 30px;
  line-height: 30px;
  font-size: 13px;
  display: flex;
  flex-direction: row;
  & > a {
    color: var(--themeColor);
    margin-left: 5px;
    text-decoration: none;
  }
}

.opened-files {
  border-bottom: 1px solid var(--itemBgColor);
  & .title {
    display: flex;
    align-items: center;
    height: 30px;
    line-height: 30px;
    font-size: 13px;
    color: var(--regularColor);
    padding: 0 15px;
    & .icon {
      fill: var(--iconColor);
    }
  }
}

.new-input {
  width: 120px;
  border: none;
  outline: none;
  font-size: 12px;
  border-bottom: 1px solid var(--themeColor);
  background: transparent;
  color: var(--editorColor);
}

.tree-wrapper {
  height: 100%;
}

.default-cursor {
  cursor: default;
}
</style>
