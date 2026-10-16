<template>
  <div
    class="opened-file"
    :title="file.pathname"
    :class="[{ active: currentFile.id === file.id, unsaved: !file.isSaved }]"
    @click="selectFile(file)"
  >
    <chrome-icon
      name="close"
      :size="10"
      aria-hidden="true"
      @click.stop="removeFileInTab(file)"
    ></chrome-icon>
    <span class="name">{{ file.filename }}</span>
    <!-- C-51 T-011: pin mark at the end of a pinned row — mirrors the
         folder-tree rows so pinned files are discoverable here too. -->
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
// START_CHANGE_SUMMARY
//   - 2026-10-17 C-51 T-013: the row name starts on the shared text grid
//     (--sideBarRowInset + the folder icon slot, 32px — was 35px with the
//     old icon column) and every Opened-files row is explicitly regular
//     weight, matching tree/Recent/Pinned file rows.
//   - 2026-10-16 C-51 T-011: pinned rows carry the trailing 12px drawn
//     pin (chromeIcons «pin») with the localized «Pinned» label; the
//     reactive pinned store drives it, so unpinning anywhere removes it
//     immediately.
//   - 2026-10-15 C-38 T-006 N4 d: the close glyph renders from the
//     drawn chromeIcons set instead of the iconfont sprite; the active
//     row uses the system accent (C-38 T-006 N4 b).
// END_CHANGE_SUMMARY
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { usePinnedStore } from '@/store/pinned'
import { ChromeIcon } from '../icons/chromeIcons.js'

const props = defineProps({
  file: {
    type: Object,
    required: true
  }
})

const editorStore = useEditorStore()
const pinnedStore = usePinnedStore()

const { t } = useI18n()

const { currentFile } = storeToRefs(editorStore)

// C-51 T-011: same reactive trailing mark as the tree rows.
const isPinnedFile = computed(() => pinnedStore.isPinned(props.file.pathname))

const selectFile = (file) => {
  if (file.id !== currentFile.value.id) {
    editorStore.UPDATE_CURRENT_FILE(file)
  }
}

const removeFileInTab = (file) => {
  const { isSaved } = file
  if (isSaved) {
    editorStore.FORCE_CLOSE_TAB(file)
  } else {
    editorStore.CLOSE_UNSAVED_TAB(file)
  }
}
</script>

<style scoped>
.opened-file {
  display: flex;
  user-select: none;
  height: 28px;
  line-height: 28px;
  /* C-51 T-013: the name starts on the shared text grid like the tree and
     section file rows; the hover close glyph (absolute, left 10px) and
     the unsaved dot keep their slots to its left. */
  padding-left: calc(var(--sideBarRowInset, 12px) + 20px);
  /* C-51 T-013: one regular weight for every file row (active = accent
     text, never bold). */
  font-weight: 400;
  position: relative;
  color: var(--sideBarColor);
  & > svg {
    display: none;
    width: 10px;
    height: 10px;
    position: absolute;
    top: 9px;
    left: 10px;
  }
  &:hover > svg {
    display: inline-block;
  }
  &:hover {
    background: var(--sideBarItemHoverBgColor);
  }
  & > span.name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  & > .pin-mark {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    color: var(--sideBarIconColor);
  }
}
.opened-file.active {
  color: var(--chromeAccent);
}
.unsaved.opened-file::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warningColor, #d97706);
  position: absolute;
  top: 11px;
  left: 12px;
}
.unsaved.opened-file > .name {
  color: var(--warningColor, #d97706);
}
.unsaved.opened-file:hover::before {
  content: none;
}
</style>
