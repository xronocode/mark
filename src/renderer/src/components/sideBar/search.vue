<template>
  <div class="side-bar-search-results">
    <div v-if="showNoFolderOpenedMessage" class="msg">
      <span>{{ t('sideBar.search.noFolderOpen') }}</span>
      <button class="button-primary" @click="openFolder">
        {{ t('sideBar.search.openFolder') }}
      </button>
    </div>
    <div v-else-if="error" class="msg">{{ error }}</div>
    <div v-else-if="!hasQuery" class="msg muted">
      {{ t('sideBar.search.startTyping') }}
    </div>
    <div v-else-if="running && results.length === 0" class="msg muted">
      {{ t('sideBar.search.searching') }}
    </div>
    <div v-else-if="results.length === 0" class="msg muted">
      {{ t('sideBar.search.noResultsFound') }}
    </div>
    <template v-else>
      <div class="result-info">{{ t('search.searchResultInfo', { matchCount, fileCount: results.length }) }}</div>
      <div class="result-list">
        <search-result-item
          v-for="(item, index) of results"
          :key="index"
          :search-result="item"
        ></search-result-item>
      </div>
      <div v-if="running" class="cancel-row">
        <el-button type="primary" size="mini" @click="cancel">
          {{ t('sideBar.search.cancel') }}
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/store/project'
import { useSearchStore } from '@/store/search'
import SearchResultItem from './searchResultItem.vue'

const { t } = useI18n()
const projectStore = useProjectStore()
const searchStore = useSearchStore()

const { results, running, error } = storeToRefs(searchStore)
const { projectTree } = storeToRefs(projectStore)

const hasQuery = computed(() => searchStore.hasQuery)
const matchCount = computed(() => searchStore.matchCount)

const showNoFolderOpenedMessage = computed(() => {
  return !projectTree.value || !projectTree.value.pathname
})

const openFolder = () => projectStore.ASK_FOR_OPEN_PROJECT()
const cancel = () => searchStore.cancelRunning()
</script>

<style scoped>
.side-bar-search-results {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.msg {
  padding: 16px 16px;
  font-size: 13px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.msg.muted {
  opacity: 0.6;
}
.button-primary {
  align-self: flex-start;
}
.result-info {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--editorColor50);
}
.result-list {
  flex: 1;
  overflow-y: auto;
}
.cancel-row {
  padding: 6px 12px 10px 12px;
}
</style>
