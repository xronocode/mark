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
  </div>
</template>

<script setup>
// START_CHANGE_SUMMARY
//   - 2026-10-15 C-38 T-006 N4 d: the close glyph renders from the
//     drawn chromeIcons set instead of the iconfont sprite; the active
//     row uses the system accent (C-38 T-006 N4 b).
// END_CHANGE_SUMMARY
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { ChromeIcon } from '../icons/chromeIcons.js'

const props = defineProps({
  file: {
    type: Object,
    required: true
  }
})

const editorStore = useEditorStore()

const { currentFile } = storeToRefs(editorStore)

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
  padding-left: 35px;
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
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
