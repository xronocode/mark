<template>
  <div v-if="showProjectSearch" class="project-search-overlay" @click.self="close">
    <div class="project-search-panel">
      <div class="panel-header">
        <div class="search-row">
          <input
            ref="inputEl"
            v-model="keywordModel"
            type="text"
            class="search-input"
            :placeholder="t('sideBar.search.searchInFolder')"
            @keydown.escape="close"
            @keydown.enter="focusResults"
          />
          <button class="panel-close" @click="close">&times;</button>
        </div>
        <div class="search-options">
          <button
            type="button"
            class="opt"
            :class="{ active: isCaseSensitive }"
            :title="t('search.caseSensitiveTip')"
            @click.stop="toggleOption('isCaseSensitive')"
          >Aa</button>
          <button
            type="button"
            class="opt"
            :class="{ active: isWholeWord }"
            :title="t('search.wholeWordTip')"
            @click.stop="toggleOption('isWholeWord')"
          ><span class="opt-glyph">\b</span></button>
          <button
            type="button"
            class="opt"
            :class="{ active: isRegexp }"
            :title="t('search.useRegexTip')"
            @click.stop="toggleOption('isRegexp')"
          ><span class="opt-glyph">.*</span></button>
        </div>
        <div v-if="hasQuery" class="result-info">
          <span v-if="running && results.length === 0">{{ t('sideBar.search.searching') }}</span>
          <span v-else-if="results.length === 0">{{ t('sideBar.search.noResultsFound') }}</span>
          <span v-else>{{ t('search.searchResultInfo', { matchCount, fileCount: results.length }) }}</span>
          <el-button v-if="running" type="primary" size="small" @click="cancel">
            {{ t('sideBar.search.cancel') }}
          </el-button>
        </div>
        <div v-else-if="showNoFolderOpenedMessage" class="result-info">
          <span>{{ t('sideBar.search.noFolderOpen') }}</span>
        </div>
      </div>
      <div v-if="results.length > 0" class="panel-results">
        <search-result-item
          v-for="(item, index) of results"
          :key="index"
          :search-result="item"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useSearchStore } from '@/store/search'
import { useProjectStore } from '@/store/project'
import SearchResultItem from '../sideBar/searchResultItem.vue'
import bus from '@/bus'

const { t } = useI18n()
const searchStore = useSearchStore()
const projectStore = useProjectStore()

const { results, running, error } = storeToRefs(searchStore)
const { isCaseSensitive, isWholeWord, isRegexp } = storeToRefs(searchStore)
const { projectTree } = storeToRefs(projectStore)

const inputEl = ref(null)
const showProjectSearch = ref(false)

const hasQuery = computed(() => searchStore.hasQuery)
const matchCount = computed(() => searchStore.matchCount)

const showNoFolderOpenedMessage = computed(() => {
  return !projectTree.value || !projectTree.value.pathname
})

const keywordModel = computed({
  get: () => searchStore.keyword,
  set: (value) => searchStore.SET_KEYWORD(value)
})

const toggleOption = (name) => searchStore.TOGGLE_OPTION(name)
const cancel = () => searchStore.cancelRunning()

const open = () => {
  showProjectSearch.value = true
  nextTick(() => {
    inputEl.value?.focus()
    inputEl.value?.select()
  })
}

const close = () => {
  showProjectSearch.value = false
}

const toggle = () => {
  if (showProjectSearch.value) {
    close()
  } else {
    open()
  }
}

const focusResults = () => {
  // Enter in input — no-op for now, results are below
}

watch(showProjectSearch, (val) => {
  if (val) {
    nextTick(() => inputEl.value?.focus())
  }
})

onMounted(() => {
  bus.on('projectSearch', toggle)
})

onBeforeUnmount(() => {
  bus.off('projectSearch', toggle)
})
</script>

<style scoped>
.project-search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  padding-top: calc(var(--titleBarHeight) + 16px);
}
.project-search-panel {
  width: 560px;
  max-height: 70vh;
  background: var(--floatBgColor);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-self: flex-start;
}
.panel-header {
  padding: 12px 16px 8px 16px;
  border-bottom: 1px solid var(--floatBorderColor);
  flex-shrink: 0;
}
.search-row {
  display: flex;
  align-items: center;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--floatBorderColor);
  background: var(--inputBgColor);
  padding: 0 4px 0 10px;
}
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--editorColor);
  font-size: 14px;
  height: 100%;
}
.panel-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--sideBarIconColor);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  flex-shrink: 0;
  &:hover {
    background: var(--floatHoverColor);
  }
}
.search-options {
  margin-top: 6px;
  display: flex;
  gap: 4px;
}
.opt {
  background: transparent;
  border: 1px solid transparent;
  color: var(--editorColor50);
  font-family: 'DejaVu Sans Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  height: 22px;
  min-width: 26px;
  padding: 0 6px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}
.opt:hover {
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
  color: var(--sideBarTitleColor);
}
.opt.active {
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.08));
  color: var(--highlightThemeColor);
  border-color: var(--highlightThemeColor);
}
.result-info {
  margin-top: 8px;
  font-size: 12px;
  color: var(--editorColor50);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
</style>
