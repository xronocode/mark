<template>
  <div
    ref="fileEl"
    :title="file.pathname"
    class="side-bar-file"
    :style="{ opacity: file.isMarkdown ? 1 : 0.75 }"
    :class="[
      { current: currentFile.pathname === file.pathname, active: file.id === activeItem.id, dirty: isDirty }
    ]"
    @click="handleFileClick"
  >
    <file-icon :name="file.name"></file-icon>
    <input
      v-if="renameCache === file.pathname"
      ref="renameInput"
      v-model="newName"
      type="text"
      class="rename"
      @click.stop="noop"
      @keypress.enter="rename"
    />
    <span v-else>{{ file.name }}</span>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/sideBar/treeFile.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: One file row of the sidebar tree — extension-aware icon + name, the current file on a soft rounded pill (chromeAccentSoft), non-Markdown rows dimmed and not openable, and the context menu carrying Pin/Unpin (C-51 T-002).
//   SCOPE: Row rendering (rename input, current/active/dirty state), open-or-select click behaviour, context menu wiring with pin state.
//   DEPENDS: vue, pinia, store/project, store/editor, store/pinned, ./icon.vue, contextMenu/sideBar, bus.
//   LINKS: .grace/changes/active/C-38 T-006 N4 b (accent selection); .grace/changes/active/C-51 T-001/T-002; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 v2.0.0: C-51 T-001 — 32px rows, constant row padding
//     (indentation moved to the nested .folder-contents guide lines in
//     treeFolder.vue) and the current file renders on a rounded pill
//     (chromeAccentSoft + 8px radius, per canvas Main; accent marker
//     inset so it stays inside the rounded corners). C-51 T-002 — the
//     context menu gains Pin/Unpin for Markdown files via the pinned
//     store state.
//   - 2026-10-15 C-38 T-006 N4 b: the current-file selection follows
//     the system accent (marker + text + ~14% soft background) instead
//     of the theme green. The file-type icon keeps the muya fileIcons
//     set (document-side, extension-aware).
// END_CHANGE_SUMMARY
import { ref, computed, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePinnedStore } from '@/store/pinned'
import FileIcon from './icon.vue'
import { showContextMenu } from '../../contextMenu/sideBar'
import bus from '../../bus'

const props = defineProps({
  file: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    required: true
  }
})

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const pinnedStore = usePinnedStore()

const newName = ref('')
const fileEl = ref(null)
const renameInput = ref(null)

const { renameCache } = storeToRefs(projectStore)
const { activeItem } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { currentFile, tabs } = storeToRefs(editorStore)

const isDirty = computed(() => {
  const tab = tabs.value.find((t) => window.fileUtils?.isSamePathSync?.(t.pathname, props.file.pathname))
  return tab ? !tab.isSaved : false
})

// from fileMixins
const handleFileClick = () => {
  const { isMarkdown, pathname } = props.file
  if (!isMarkdown) return
  const openedTab = tabs.value.find((f) => window.fileUtils.isSamePathSync(f.pathname, pathname))
  if (openedTab) {
    if (currentFile.value.pathname === openedTab.pathname) {
      return
    }
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    window.electron.ipcRenderer.send('mt::open-file', pathname, {})
  }
}

const noop = () => {}

const focusRenameInput = () => {
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.focus()
      newName.value = props.file.name
    }
  })
}

const rename = () => {
  if (newName.value) {
    projectStore.RENAME_IN_SIDEBAR(newName.value)
  }
}

onMounted(() => {
  if (fileEl.value) {
    fileEl.value.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      projectStore.CHANGE_ACTIVE_ITEM(props.file)
      // C-51 T-002: Markdown file rows offer Pin/Unpin; the label keys
      // on the pinned list at popup time.
      showContextMenu(event, !!clipboard.value, {
        isMarkdownFile: !!props.file.isMarkdown,
        isPinned: pinnedStore.isPinned(props.file.pathname)
      })
    })
  }

  bus.on('SIDEBAR::show-rename-input', focusRenameInput)
})
</script>

<style scoped>
.side-bar-file {
  display: flex;
  position: relative;
  align-items: center;
  cursor: default;
  user-select: none;
  height: 32px;
  box-sizing: border-box;
  padding-right: 10px;
  padding-left: 10px;
  &:hover {
    background: var(--sideBarItemHoverBgColor);
  }
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &::before {
    content: '';
    position: absolute;
    display: block;
    left: 0;
    background: var(--chromeAccent);
    width: 2px;
    height: 0;
    top: 50%;
    transform: translateY(-50%);
    transition: all 0.2s ease;
  }
}
.side-bar-file.current {
  /* C-51 T-001: the current file sits on a soft rounded pill (canvas
     Main). Background stays the C-38 T-006 chromeAccentSoft — pinned by
     the chrome-native-theme e2e — and the accent marker insets so it
     stays inside the 8px corners. */
  background: var(--chromeAccentSoft);
  border-radius: 8px;
  /* Inset pill like the canvas (review 2026-10-16: it ran edge to edge);
     the padding gives back the margin so the name stays aligned. */
  margin: 0 6px;
  padding-left: 4px;
  padding-right: 4px;
}
.side-bar-file.current::before {
  /* The pill marks the current file (canvas); the accent bar would
     overlap the inset icon. */
  display: none;
}
.side-bar-file.current > span {
  color: var(--chromeAccent);
  font-weight: 500;
}
.side-bar-file.active > span {
  color: var(--sideBarTitleColor);
}
.side-bar-file.dirty > span {
  color: var(--warningColor, #d97706);
}
.side-bar-file.dirty::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warningColor, #d97706);
  margin-left: 6px;
  flex-shrink: 0;
}
input.rename {
  height: 22px;
  outline: none;
  margin: 5px 0;
  padding: 0 8px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  width: 100%;
  border-radius: 3px;
}
</style>
