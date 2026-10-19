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
    <!-- C-51 T-011: pin mark at the end of a pinned row (same drawn set as
         the chrome) so it is clear which files are pinned. -->
    <span
      v-if="isPinnedFile"
      class="pin-mark"
      :title="t('sideBar.tree.pinned')"
      role="img"
      :aria-label="t('sideBar.tree.pinned')"
    >
      <chrome-icon name="pin" :size="12"></chrome-icon>
    </span>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/sideBar/treeFile.vue
// VERSION: 2.2.0
// START_MODULE_CONTRACT
//   PURPOSE: One file row of the sidebar tree — name only at the shared row inset (C-51 T-013 removed the leading file-type icon), the current file on a soft rounded pill (chromeAccentSoft + accent text), non-Markdown rows dimmed and not openable, the context menu carrying Pin/Unpin (C-51 T-002) and the trailing pin mark on pinned rows (C-51 T-011).
//   SCOPE: Row rendering (rename input, current/active/dirty state, pinned mark), open-or-select click behaviour, context menu wiring with pin state.
//   DEPENDS: vue, pinia, store/project, store/editor, store/pinned, ../icons/chromeIcons.js, contextMenu/sideBar, bus, vue-i18n.
//   LINKS: .grace/changes/archive/C-38 T-006 N4 b (accent selection); .grace/changes/archive/C-51 T-001/T-002/T-011/T-013; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-17 v2.2.0: C-51 T-013 — the leading file-type icon is gone;
//     the row keeps the shared inset (--sideBarRowInset + the 20px folder
//     icon slot) so the name aligns with folder names, and every file row
//     (current included) is regular weight — the current file is marked
//     only by the pill + accent text.
//   - 2026-10-16 v2.1.0: C-51 T-011 — pinned rows carry a 12px drawn pin
//     (chromeIcons «pin») at the end with the localized «Pinned» label;
//     the reactive pinned store drives it, so unpinning from the tree
//     context menu or the Pinned section removes it immediately.
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
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePinnedStore } from '@/store/pinned'
import { ChromeIcon } from '../icons/chromeIcons.js'
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

const { t } = useI18n()

const newName = ref('')
const fileEl = ref(null)
const renameInput = ref(null)

const { renameCache } = storeToRefs(projectStore)
const { activeItem } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { currentFile, tabs } = storeToRefs(editorStore)

// START_BLOCK_PINNED_MARK
// C-51 T-011: trailing pin mark on pinned rows. The pinned store getter is
// reactive, so pin/unpin from any surface (tree context menu, Pinned
// section, another window's broadcast) updates the row immediately.
const isPinnedFile = computed(() => pinnedStore.isPinned(props.file.pathname))
// END_BLOCK_PINNED_MARK

const isDirty = computed(() => {
  const tab = tabs.value.find((t) => window.fileUtils?.isSamePathSync?.(t.pathname, props.file.pathname))
  return tab ? !tab.isSaved : false
})

// from fileMixins
const handleFileClick = (event) => {
  const { isMarkdown, pathname } = props.file
  if (!isMarkdown) return
  const openedTab = tabs.value.find((f) => window.fileUtils.isSamePathSync(f.pathname, pathname))
  if (openedTab) {
    if (currentFile.value.pathname === openedTab.pathname) {
      return
    }
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    // FIX-002 (2026-10-20): phase-0 mark of the sidebar-click open trace
    // (click → mt::open-file → tab arrival → first paint). dispatch_ms
    // is performance.now() minus the DOM event timeStamp — it exposes
    // main-thread congestion BETWEEN the physical click and the handler
    // (a busy tree re-render would hide there). The later markers
    // (bootstrap-ipc BLOCK_NEW_TAB_RECEIVED, editor store
    // BLOCK_OPEN_TAB_CREATED, editor.vue BLOCK_OPEN_FIRST_PAINT) diff
    // against this timestamp to attribute the reported multi-second
    // latency to a leg.
    window.__openFileClickAt = performance.now()
    const dispatchDelay = Math.max(
      0,
      Math.round(performance.now() - (event && event.timeStamp ? event.timeStamp : performance.now()))
    )
    // eslint-disable-next-line no-console
    console.log(
      `[sidebar][open-file][BLOCK_OPEN_FILE_CLICK dispatch_ms=${dispatchDelay} path=${pathname.split('/').pop() || pathname}]`
    )
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
  /* C-51 T-013: the file-type icon is gone; the name keeps starting where
     folder names start (--sideBarRowInset + the 14px folder glyph + its
     6px margin), so files and folders read on one text grid. */
  padding-left: calc(var(--sideBarRowInset, 12px) + 20px);
  /* C-51 T-013: one regular weight for every file row — the current file
     is marked by the pill + accent text, never by bold. */
  font-weight: 400;
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
     the margin + padding keep the name on the shared text grid. */
  margin: 0 6px;
  padding-left: calc(var(--sideBarRowInset, 12px) + 14px);
  padding-right: 4px;
}
.side-bar-file.current::before {
  /* The pill marks the current file (canvas); the accent bar would stick
     out of the inset pill. */
  display: none;
}
.side-bar-file.current > span {
  color: var(--chromeAccent);
}
.side-bar-file.active > span {
  color: var(--sideBarTitleColor);
}
.side-bar-file.dirty > span {
  color: var(--warningColor, #d97706);
}
/* C-51 T-011: the trailing pinned mark — theme icon colour, no literals. */
.side-bar-file > .pin-mark {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  color: var(--sideBarIconColor);
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
