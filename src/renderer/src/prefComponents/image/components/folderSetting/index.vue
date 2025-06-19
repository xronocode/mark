<template>
  <section class="image-folder">
    <h5>Global or relative image folder</h5>
    <text-box
      description="Global image folder"
      :input="imageFolderPath"
      :regex-validator="/^(?:$|([a-zA-Z]:)?[\/\\].*$)/"
      :default-value="folderPathPlaceholder"
      :on-change="(value) => modifyImageFolderPath(value)"
    ></text-box>
    <div>
      <el-button size="mini" @click="modifyImageFolderPath(undefined)">Open...</el-button>
      <el-button size="mini" @click="openImageFolder">Show in Folder</el-button>
    </div>
    <compound>
      <template #head>
        <bool
          description="Prefer relative assets folder"
          more="https://github.com/marktext/marktext/blob/develop/docs/IMAGES.md"
          :bool="imagePreferRelativeDirectory"
          :on-change="(value) => onSelectChange('imagePreferRelativeDirectory', value)"
        ></bool>
      </template>
      <template #children>
        <text-box
          description="Relative image folder name"
          :input="imageRelativeDirectoryName"
          :regex-validator="/^(?:$|(?![a-zA-Z]:)[^\/\\].*$)/"
          :default-value="relativeDirectoryNamePlaceholder"
          :on-change="(value) => onSelectChange('imageRelativeDirectoryName', value)"
        ></text-box>
        <div class="footnote">
          Include <code>${filename}</code> in the text-box above to automatically insert the
          document file name.
        </div>
      </template>
    </compound>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'
import Bool from '@/prefComponents/common/bool/index.vue'
import Compound from '@/prefComponents/common/compound/index.vue'
import TextBox from '@/prefComponents/common/textBox'

const preferenceStore = usePreferencesStore()

// computed
const { imageFolderPath, imagePreferRelativeDirectory, imageRelativeDirectoryName } =
  storeToRefs(preferenceStore)
const folderPathPlaceholder = computed(() => preferenceStore.imageFolderPath || '')
const relativeDirectoryNamePlaceholder = computed(
  () => preferenceStore.imageRelativeDirectoryName || 'assets'
)

// methods
const openImageFolder = () => {
  window.electron.shell.openPath(imageFolderPath.value)
}

const modifyImageFolderPath = (value) => {
  return preferenceStore.SET_IMAGE_FOLDER_PATH(value)
}

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}
</script>

<style scoped>
.image-folder .footnote {
  font-size: 13px;
  & code {
    font-size: 13px;
  }
}
</style>
