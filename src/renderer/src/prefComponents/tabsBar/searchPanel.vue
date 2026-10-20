<template>
  <div v-if="open" class="pref-search" role="search">
    <!-- START_BLOCK_SEARCH_INPUT -->
    <input
      ref="inputRef"
      v-model="query"
      type="search"
      class="pref-search-input"
      :placeholder="t('preferences.search.placeholder')"
      :aria-label="t('preferences.search.placeholder')"
      @keydown.down.prevent="moveHighlight(1)"
      @keydown.up.prevent="moveHighlight(-1)"
      @keydown.enter.prevent="commitHighlighted"
      @keydown.esc.prevent="close"
    />
    <!-- END_BLOCK_SEARCH_INPUT -->
    <!-- START_BLOCK_SEARCH_RESULTS -->
    <ul v-if="query && results.length" class="pref-search-results" role="listbox">
      <li
        v-for="(item, index) in results"
        :key="item.key"
        role="option"
        :aria-selected="index === highlighted"
        :class="{ highlighted: index === highlighted }"
        @click="select(item)"
        @mousemove="highlighted = index"
      >
        <span class="name">{{ item.preference }}</span>
        <span class="addr">{{ item.category }}</span>
      </li>
    </ul>
    <div v-else-if="query" class="pref-search-empty">{{ t('preferences.search.empty') }}</div>
    <!-- END_BLOCK_SEARCH_RESULTS -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabsBar/searchPanel.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings search panel (C-38 T-003) — filters the schema.json index from sideBar/config.js and routes every hit to its new 5-tab home; opened with ⌘F/Ctrl+F because the approved mockup toolbar has no search field.
//   SCOPE: Query filtering, keyboard navigation (↑/↓/Enter/Esc), locale-refresh via the languageChanged window event, routing on select.
//   DEPENDS: prefComponents/sideBar/config (getTranslatedSearchContent), prefComponents/tabsBar/config (tabPath), vue-router, vue-i18n.
//   LINKS: .grace/changes/archive/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   open - visibility ref driven by open()/close() from the ⌘F binding in tabsBar/index.vue.
//   query - search text; results recompute through filterContent().
//   results - filtered index entries (current-language and English fields both match).
//   highlighted - active result index for keyboard navigation.
//   filterContent - createFilter port from the old sideBar (preference/category, localized + English).
//   moveHighlight / commitHighlighted - ↑/↓ cycling and Enter activation.
//   select - routes to the hit's new tab (tabPath of item.routeCategory) and closes.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 T-003 — replaces the old sideBar's el-autocomplete search; same schema.json index, routing retargeted to the 5 tabs.
// END_CHANGE_SUMMARY

import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getTranslatedSearchContent } from '../sideBar/config'
import { tabPath } from './config'

const { t } = useI18n()
const router = useRouter()

const emit = defineEmits(['closed'])

const open = ref(false)
const query = ref('')
const highlighted = ref(0)
const inputRef = ref(null)
const restaurants = ref([])

// START_BLOCK_FILTER_CONTENT
// Same matching semantics as the retired sideBar createFilter: the
// localized and the English category/preference fields all match,
// case-insensitively, substring.
const filterContent = (queryString) => {
  const q = String(queryString || '').toLowerCase()
  if (!q) return []
  return restaurants.value.filter((restaurant) => {
    const fields = [
      restaurant.preference,
      restaurant.category,
      restaurant.preferenceEn,
      restaurant.categoryEn
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
    return fields.some((f) => f.indexOf(q) >= 0)
  })
}
// END_BLOCK_FILTER_CONTENT

const results = computed(() => filterContent(query.value))

const moveHighlight = (delta) => {
  if (!results.value.length) return
  highlighted.value = (highlighted.value + delta + results.value.length) % results.value.length
}

const commitHighlighted = () => {
  const item = results.value[highlighted.value]
  if (item) select(item)
}

// START_BLOCK_SELECT_SEARCH_HIT
// Every hit routes to its new tab: getTranslatedSearchContent already
// resolves routeCategory against the 5 tabs (CATEGORY_TO_TAB), tabPath
// guards unknown ids back to general.
const select = (item) => {
  if (item) {
    router.push({ path: tabPath(item.routeCategory) }).catch(() => {})
  }
  close()
}
// END_BLOCK_SELECT_SEARCH_HIT

const openPanel = () => {
  open.value = true
  highlighted.value = 0
  nextTick(() => inputRef.value?.focus?.())
}

const close = () => {
  open.value = false
  query.value = ''
  highlighted.value = 0
  emit('closed')
}

defineExpose({ openPanel, close, select })

// Locale switches rebuild the index (same contract the old rail had).
const languageChanged = () => {
  restaurants.value = getTranslatedSearchContent()
}

onMounted(() => {
  restaurants.value = getTranslatedSearchContent()
  window.addEventListener('languageChanged', languageChanged)
})

onUnmounted(() => {
  window.removeEventListener('languageChanged', languageChanged)
})
</script>

<style>
.pref-search {
  position: absolute;
  top: 100%;
  right: 12px;
  z-index: 30;
  width: 300px;
  margin-top: 6px;
  padding: 6px;
  border-radius: 8px;
  background: var(--prefCtrl, #ffffff);
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  font-size: 13px;
  color: var(--prefText, #1d1d1f);
}

.pref-search-input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  padding: 4px 8px;
  border-radius: 6px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: transparent;
  color: inherit;
  outline: none;
}
.pref-search-input:focus {
  border-color: var(--prefAccent, #007aff);
}

.pref-search-results {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  & li {
    padding: 5px 8px;
    border-radius: 5px;
    cursor: default;
    display: flex;
    flex-direction: column;
    gap: 1px;
    &.highlighted {
      background: var(--prefTabOn, rgba(0, 0, 0, 0.07));
    }
    & .name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    & .addr {
      font-size: 11px;
      color: var(--prefSub, #6b6b70);
    }
  }
}

.pref-search-empty {
  margin: 6px 4px 2px;
  font-size: 12px;
  color: var(--prefSub, #6b6b70);
}
</style>
