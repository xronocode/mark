<template>
  <div class="side-bar-folder">
    <div
      ref="folderEl"
      class="folder-name"
      :class="[{ active: folder.id === activeItem.id }]"
      :title="folder.pathname"
      @click="folderNameClick"
    >
      <chrome-icon
        :name="isCollapsed ? 'folder' : 'folder-open'"
        :size="14"
        aria-hidden="true"
      ></chrome-icon>
      <input
        v-if="renameCache === folder.pathname"
        ref="renameInput"
        v-model="newName"
        type="text"
        class="rename"
        @click.stop="noop"
        @keypress.enter="rename"
      />
      <span v-else class="text-overflow">{{ folder.name }}</span>
      <!-- C-51 T-001: disclosure chevron on the right (right = collapsed,
           rotated down = expanded) per canvas Main/DocsDark. -->
      <chrome-icon
        name="chevron-right"
        :size="12"
        class="chevron"
        :class="{ open: !isCollapsed }"
        aria-hidden="true"
      ></chrome-icon>
    </div>
    <!-- C-51 T-001: nested levels indent through this container — one 1px
         guide line (left border) per level, replacing the old per-row
         depth*20px padding. -->
    <div v-if="!isCollapsed" class="folder-contents">
      <tree-folder
        v-for="childFolder of childFolders"
        :key="childFolder.id"
        :folder="childFolder"
        :depth="depth + 1"
      ></tree-folder>
      <input
        v-if="createCache.dirname === folder.pathname"
        ref="input"
        v-model="createName"
        type="text"
        class="new-input"
        @keypress.enter="handleInputEnter"
      />
      <File v-for="file of childFiles" :key="file.id" :file="file" :depth="depth + 1"></File>
    </div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/sideBar/treeFolder.vue
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: One folder row of the sidebar tree — semibold name (C-51 T-013) beside the folder/folder-open line icon and right disclosure chevron, its nested contents behind a 1px guide line per level, and the C-51 T-001 Markdown-only view filter over children.
//   SCOPE: Row rendering (rename input, active state, context menu wiring, create-input), collapse toggle, child folder/file lists filtered through store/treeFilter.js per the treeShowAllFiles preference.
//   DEPENDS: vue, pinia, store/project, store/preferences, store/treeFilter, contextMenu/sideBar, bus, ./treeFile.vue, ../icons/chromeIcons.js.
//   LINKS: .grace/changes/archive/C-51 T-001/T-013; .canvas/Main.dc.html (folder rows + guide lines); .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-17 v2.1.0: C-51 T-013 — folder rows go semibold (600) so
//     they read as structure against the regular-weight file rows, and
//     the row starts at the shared --sideBarRowInset (12px) so its glyph
//     lines up with every other sidebar chevron.
//   - 2026-10-16 v2.0.0: C-51 T-001 — Obsidian-style folder row (right
//     chevron, 32px rows, guide-line nesting via .folder-contents instead
//     of per-row depth padding) and child lists filtered by
//     store/treeFilter.js (Markdown-only unless treeShowAllFiles).
//   - 2026-10-15 C-38 T-006 N4 d: the folder glyph pair (folder /
//     folder-open) renders from the drawn chromeIcons set instead of
//     the iconfont sprite.
// END_CHANGE_SUMMARY
import { ref, computed, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { usePreferencesStore } from '@/store/preferences'
import { visibleFolders, visibleFiles } from '@/store/treeFilter'
import { showContextMenu } from '../../contextMenu/sideBar'
import bus from '../../bus'
import File from './treeFile.vue'
import { ChromeIcon } from '../icons/chromeIcons.js'

const props = defineProps({
  folder: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    required: true
  }
})

const projectStore = useProjectStore()
const preferenceStore = usePreferencesStore()

const createName = ref('')
const newName = ref('')

const folderEl = ref(null)
const renameInput = ref(null)
const input = ref(null)

// Use a local reactive state for isCollapsed that syncs with the prop
const isCollapsed = ref(props.folder.isCollapsed)

const { renameCache } = storeToRefs(projectStore)
const { createCache } = storeToRefs(projectStore)
const { activeItem } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { treeShowAllFiles } = storeToRefs(preferenceStore)

// START_BLOCK_FILTERED_CHILDREN
// C-51 T-001: the model keeps every child; the view shows Markdown files
// (and folders with Markdown anywhere below) unless treeShowAllFiles.
const childFolders = computed(() => visibleFolders(props.folder.folders, treeShowAllFiles.value))
const childFiles = computed(() => visibleFiles(props.folder.files, treeShowAllFiles.value))
// END_BLOCK_FILTERED_CHILDREN

const handleInputFocus = () => {
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      createName.value = ''
      if (props.folder) {
        isCollapsed.value = false
      }
    }
  })
}

const handleInputEnter = () => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

const folderNameClick = () => {
  isCollapsed.value = !isCollapsed.value
}

const noop = () => {}

const focusRenameInput = () => {
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.focus()
      newName.value = props.folder.name
    }
  })
}

const rename = () => {
  if (newName.value) {
    projectStore.RENAME_IN_SIDEBAR(newName.value)
  }
}

onMounted(() => {
  if (folderEl.value) {
    folderEl.value.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      projectStore.CHANGE_ACTIVE_ITEM(props.folder)
      showContextMenu(event, !!clipboard.value)
    })
  }
  bus.on('SIDEBAR::show-new-input', handleInputFocus)
  bus.on('SIDEBAR::show-rename-input', focusRenameInput)
})
</script>

<style scoped>
.side-bar-folder {
  & > .folder-name {
    cursor: default;
    user-select: none;
    display: flex;
    align-items: center;
    height: 32px;
    padding-right: 10px;
    /* C-51 T-013: the folder glyph starts at the shared row inset; with
       the glyph (14px) + its 6px margin the semibold name lands on the
       same text grid as the icon-less file rows. */
    padding-left: var(--sideBarRowInset, 12px);
    /* C-51 T-013: folders read as structure — semibold against the
       regular-weight file rows (user smoke 2026-10-17). */
    font-weight: 600;
    & > svg:first-child {
      flex-shrink: 0;
      color: var(--sideBarIconColor);
      margin-right: 6px;
    }
    & > span.text-overflow,
    & > input.rename {
      flex: 1;
      min-width: 0;
    }
    & > .chevron {
      flex-shrink: 0;
      margin-left: 6px;
      color: var(--sideBarIconColor);
      opacity: 0.7;
      transition: transform 0.2s ease;
    }
    & > .chevron.open {
      transform: rotate(90deg);
    }
    &:hover {
      background: var(--sideBarItemHoverBgColor);
      /* Inset rounded hover like the file pill (review 2026-10-16). */
      border-radius: 8px;
      margin: 0 6px;
      padding-left: 6px;
      padding-right: 4px;
    }
  }
  & > .folder-contents {
    /* C-51 T-001: one nesting level = one 1px guide line; rows carry a
       constant padding instead of the old depth*20px formula. */
    margin-left: 16px;
    border-left: 1px solid var(--itemBgColor);
  }
}
.new-input,
input.rename {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  width: 70%;
  border-radius: 3px;
}
.new-input {
  margin-left: 10px;
  display: block;
}
</style>
