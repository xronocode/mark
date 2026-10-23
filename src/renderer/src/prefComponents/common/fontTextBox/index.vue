<template>
  <!-- START_BLOCK_FONT_ROW -->
  <section
    class="pref-row pref-font-input-item"
    :class="[osClass, { 'ag-underdevelop': disable }]"
  >
    <div class="pref-row-text">
      <span class="pref-row-label">{{ description }}</span>
      <InfoFilled v-if="more" width="16" height="16" class="pref-more-link" @click="handleMoreClick" />
      <span v-if="helpLine" class="pref-row-help">{{ helpLine }}</span>
    </div>
    <div class="pref-row-control">
      <el-autocomplete
        v-model="selectValue"
        class="pref-font-autocomplete"
        popper-class="pref-font-autocomplete-popper"
        :fetch-suggestions="querySearch"
        :placeholder="t('preferences.selectFont')"
        :disabled="disable"
        @select="handleSelect"
      >
        <template #suffix>
          <ArrowDown width="16" height="16" class="el-input__icon" />
        </template>
        <template #default="{ item }">
          <div class="family">{{ item }}</div>
        </template>
      </el-autocomplete>
    </div>
  </section>
  <!-- END_BLOCK_FONT_ROW -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/fontTextBox/index.vue
// VERSION: 2.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Settings font-chooser row (C-38 T-003 anatomy) — label + optional help left, the el-autocomplete font picker (system font enumeration from preload) right.
//   SCOPE: Row rendering + font suggestion/selection contract from v1; props plus help.
//   DEPENDS: element-plus el-autocomplete, @element-plus/icons-vue, vue-i18n, prefComponents/common/osClass (prefOsClass), window.electron.fonts.list.
//   LINKS: .grace/changes/archive/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   selectValue - current family (mirrors the value prop through a watcher).
//   fontFamilies - system fonts from window.electron.fonts.list (loaded on mount).
//   querySearch - prefix filter over the family list.
//   handleSelect - applies a valid family name via onChange.
//   handleMoreClick - opens the external `more` link.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-23 v2.0.1: ReDoS hardening (code-scanning #4) — replaced the nested-quantifier font-name pattern with a linear equivalent; accepted language unchanged (exhaustively verified), catastrophic backtracking removed.
//   - 2026-10-15 v2.0.0: C-38 T-003 — new row anatomy (no trailing colon, optional help); field right-aligned in the row instead of full-width under the label; picker behavior unchanged.
//   - (v1.x: full-width autocomplete under 'Label:' — retired.)
// END_CHANGE_SUMMARY

import { ref, watch, computed, onMounted } from 'vue'
import { InfoFilled, ArrowDown } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { prefOsClass } from '../osClass'

const { t } = useI18n()

const props = defineProps({
  description: String,
  notes: String,
  help: String,
  value: String,
  onChange: Function,
  more: String,
  disable: {
    type: Boolean,
    default: false
  },
  onlyMonospace: {
    type: Boolean,
    default: false
  }
})

let defaultValue = props.value
const fontFamilies = ref([])
const selectValue = ref(props.value)
const osClass = prefOsClass()
const helpLine = computed(() => props.help || props.notes || '')

watch(
  () => props.value,
  (value, oldValue) => {
    if (value !== oldValue) {
      defaultValue = value
      selectValue.value = value
    }
  }
)

const querySearch = (queryString, callback) => {
  const results =
    queryString && defaultValue !== queryString
      ? fontFamilies.value.filter((f) => f.toLowerCase().indexOf(queryString.toLowerCase()) === 0)
      : fontFamilies.value
  callback(results)
}

const handleSelect = (value) => {
  // Linear rewrite of the v1 nested-quantifier pattern: same accepted
  // language (non-empty, no leading/trailing whitespace — exhaustively
  // equivalence-checked) without exponential backtracking on near-misses.
  if (/^\S+(?:\s+\S+)*$/.test(value)) {
    selectValue.value = value
    props.onChange(value)
  }
}

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

onMounted(async () => {
  // step-8z follow-up: was `require('font-list')` inline. font-list is
  // a native Node binding; it now lives in preload and is exposed via
  // window.electron.fonts.list (async, returns Promise<string[]>).
  // Same lazy-fetch UX (only enumerates fonts when the prefs pane
  // mounts, not at app boot).
  const fonts = await window.electron.fonts.list()
  fontFamilies.value = fonts.map((f) => f.replace(/\"/g, '').trim())
})
</script>

<style>
/* START_BLOCK_FONT_ROW_METRICS */
/* The autocomplete trigger adopts the mockup field metrics, right-
   aligned in the row (fixed 200px so long family names truncate). */
.pref-font-input-item .pref-font-autocomplete {
  width: 200px;
}

/* C-38 T-003 review: Element Plus 2 draws the field border on
   .el-input__wrapper (an inset box-shadow) — style the wrapper once and
   keep the inner <input> borderless, otherwise the field shows two
   frames. */
.pref-font-input-item .pref-font-autocomplete .el-input__wrapper {
  min-height: 24px;
  padding: 0 8px;
  border-radius: var(--prefCtrlRadius, 6px);
  background: var(--prefCtrl, #ffffff);
  box-shadow: 0 0 0 0.5px var(--prefCtrlBorder, rgba(0, 0, 0, 0.14)) inset;
}

.pref-font-input-item .pref-font-autocomplete .el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px var(--prefAccent, #007aff) inset;
}

.pref-font-input-item .pref-font-autocomplete .el-input__inner {
  height: 22px;
  line-height: 22px;
  font-size: 13px;
  border: none;
  background: transparent;
  color: var(--prefText, #1d1d1f);
}

.el-autocomplete-suggestion {
  border: 1px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background-color: var(--prefCtrl, #ffffff);
  color: var(--prefText, #1d1d1f);
}

.el-autocomplete-suggestion li {
  color: var(--prefText, #1d1d1f);
}

.el-autocomplete-suggestion li.highlighted,
.el-autocomplete-suggestion li:hover {
  background: var(--prefTabOn, rgba(0, 0, 0, 0.07));
}

.pref-font-autocomplete-popper li {
  line-height: normal;
  padding: 7px;
  .value {
    text-overflow: ellipsis;
    overflow: hidden;
  }
}
/* END_BLOCK_FONT_ROW_METRICS */
</style>
