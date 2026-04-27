<template>
  <div class="search-toolbar">
    <div class="search-row">
      <input
        ref="inputEl"
        v-model="keywordModel"
        type="text"
        class="search-input"
        :placeholder="t('sideBar.search.searchInFolder')"
      />
    </div>
    <div class="search-options">
      <el-tooltip :content="t('search.caseSensitiveTip')" placement="bottom" :show-after="350">
        <button
          type="button"
          class="opt"
          :class="{ active: isCaseSensitive }"
          @click.stop="toggleOption('isCaseSensitive')"
        >
          Aa
        </button>
      </el-tooltip>
      <el-tooltip :content="t('search.wholeWordTip')" placement="bottom" :show-after="350">
        <button
          type="button"
          class="opt"
          :class="{ active: isWholeWord }"
          @click.stop="toggleOption('isWholeWord')"
        >
          <span class="opt-glyph">\b</span>
        </button>
      </el-tooltip>
      <el-tooltip :content="t('search.useRegexTip')" placement="bottom" :show-after="350">
        <button
          type="button"
          class="opt"
          :class="{ active: isRegexp }"
          @click.stop="toggleOption('isRegexp')"
        >
          <span class="opt-glyph">.*</span>
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useSearchStore } from '@/store/search'

const { t } = useI18n()
const searchStore = useSearchStore()
const { isCaseSensitive, isWholeWord, isRegexp } = storeToRefs(searchStore)
const inputEl = ref(null)

const keywordModel = computed({
  get: () => searchStore.keyword,
  set: (value) => searchStore.SET_KEYWORD(value)
})

const toggleOption = (name) => searchStore.TOGGLE_OPTION(name)
</script>

<style scoped>
.search-toolbar {
  -webkit-app-region: no-drag;
  padding: 12px 12px 8px 12px;
  border-bottom: 1px solid var(--floatBorderColor);
}
.search-row {
  display: flex;
  align-items: center;
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--floatBorderColor);
  background: var(--inputBgColor);
  padding: 0 8px;
}
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--sideBarColor);
  font-size: 13px;
  height: 100%;
}
.search-options {
  margin-top: 6px;
  display: flex;
  flex-direction: row;
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
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
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
</style>
