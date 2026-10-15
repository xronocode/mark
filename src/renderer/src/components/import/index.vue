<template>
  <div class="import-dialog">
    <el-dialog
      v-model="showImport"
      :show-close="false"
      :modal="true"
      custom-class="ag-dialog-table"
      width="450px"
    >
      <div class="body">
        <div
          class="drop-container"
          :class="{ active: isOver }"
          @dragenter.prevent="dragOverHandler"
          @dragover.prevent="dragOverHandler"
          @dragleave="dragLeaveHandler"
          @drop.prevent="dropHandler"
        >
          <div class="img-wrapper" role="img" :aria-label="t('import.title')">
            <chrome-icon name="import" :size="44" aria-hidden="true" />
          </div>
          <div>{{ t('import.title') }}</div>
          <p>{{ t('import.description') }}</p>
        </div>
        <div class="file-list">
          <div>.md</div>
          <div>.html</div>
          <div>.docx</div>
          <div>.tex</div>
          <div>.wiki</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
// START_CHANGE_SUMMARY
//   - 2026-10-15 C-38 T-006 N4 b/d: the drop illustration renders from
//     the drawn chromeIcons set (the import_file.svg asset import is
//     gone; the wrapper keeps its size and gains an aria-label carrying
//     the old alt text); the active drop state follows the system
//     accent.
// END_CHANGE_SUMMARY
import { ref, onMounted, onBeforeUnmount } from 'vue'
import bus from '@/bus'
import { ChromeIcon } from '../icons/chromeIcons.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const showImport = ref(false)
const isOver = ref(false)

const showDialog = (boolean) => {
  if (boolean !== showImport.value) {
    showImport.value = boolean
  }
}

const dragOverHandler = () => {
  isOver.value = true
}

const dragLeaveHandler = () => {
  isOver.value = false
}

const dropHandler = (e) => {
  const fileList = []
  e.preventDefault()
  if (e.dataTransfer.files.length > 0) {
    for (const file of e.dataTransfer.files) {
      fileList.push(window.electron.webUtils.getPathForFile(file))
    }
  } else {
    for (const file of e.dataTransfer.items) {
      if (file.kind === 'file') {
        fileList.push(window.electron.webUtils.getPathForFile(file.getAsFile()))
      }
    }
  }
  window.electron.ipcRenderer.send('mt::window::drop', fileList)
}

onMounted(() => {
  bus.on('importDialog', showDialog)
})

onBeforeUnmount(() => {
  bus.off('importDialog', showDialog)
})
</script>

<style scoped>
.drop-container {
  border-radius: 5px;
  color: var(--sideBarColor);
  border: 1px dashed var(--sideBarTextColor);
  -webkit-app-region: no-drag;
  app-region: no-drag;
  & div,
  & p {
    text-align: center;
  }
  &.active {
    border: 1px dashed var(--chromeAccent);
    background-color: var(--itemBgColor);
  }
}
.img-wrapper {
  width: 50px;
  height: 70px;
  margin: 40px auto 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sideBarIconColor);
}
.file-list {
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  & div {
    width: 70px;
    height: 70px;
    border: 1px solid var(--sideBarTextColor);
    border-radius: 3px;
    text-align: center;
    font-size: 18px;
    line-height: 70px;
    color: var(--sideBarTitleColor);
  }
}
</style>
