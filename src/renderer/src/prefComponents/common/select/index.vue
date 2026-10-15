<template>
  <!-- START_BLOCK_POPUP_ROW -->
  <section
    class="pref-row pref-select-item"
    :class="[osClass, { 'ag-underdevelop': disable }]"
  >
    <div class="pref-row-text">
      <span class="pref-row-label">{{ description }}</span>
      <InfoFilled v-if="more" width="16" height="16" class="pref-more-link" @click="handleMoreClick" />
      <span v-if="helpLine" class="pref-row-help">{{ helpLine }}</span>
    </div>
    <div class="pref-row-control">
      <!-- Native select: the OS draws the pop-up (WebKit shows the
           mockup's up/down chevrons); we style only the trigger. -->
      <select
        v-model="selectValue"
        class="pref-popup"
        :aria-label="description"
        :disabled="disable"
        @change="select"
      >
        <option v-for="item in options" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </div>
  </section>
  <!-- END_BLOCK_POPUP_ROW -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/select/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings pop-up row (C-38 T-003 anatomy) — label + optional help left, native pop-up button right (OS-drawn chevrons/menu, mockup trigger styling).
//   SCOPE: Row rendering and change events; same props/events contract as v1 (description/notes/value/options/onChange/more/disable) plus help.
//   DEPENDS: @element-plus/icons-vue (InfoFilled), prefComponents/common/osClass (prefOsClass).
//   LINKS: .grace/changes/active/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   selectValue - current value (mirrors the value prop through a watcher).
//   osClass - 'pref-os-mac' / 'pref-os-win' per-OS metrics selector.
//   helpLine - secondary help text (help prop, else legacy notes).
//   select - calls onChange with the picked value.
//   handleMoreClick - opens the external `more` link.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-003 — new row anatomy (no trailing colon, optional help); el-select replaced by a native styled select (WebKit renders the mockup's up/down chevrons natively); per-OS padding/radius.
//   - (v1.x: el-select with 'Label:' above — retired.)
// END_CHANGE_SUMMARY

import { ref, watch, computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { prefOsClass } from '../osClass'

const props = defineProps({
  description: String,
  notes: String,
  help: String,
  value: [String, Number],
  options: Array,
  onChange: Function,
  more: String,
  disable: {
    type: Boolean,
    default: false
  }
})

const selectValue = ref(props.value)
const osClass = prefOsClass()
const helpLine = computed(() => props.help || props.notes || '')

watch(
  () => props.value,
  (value, oldValue) => {
    if (value !== oldValue) {
      selectValue.value = value
    }
  }
)

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

// Accepts either the DOM change event (uses the v-model state, already
// updated) or an explicit value (direct calls in tests).
const select = (value) => {
  const next = value instanceof Event ? selectValue.value : value
  props.onChange(next)
}
</script>

<style>
/* START_BLOCK_POPUP_METRICS */
/* Mockup pop-up trigger: 13px text, hairline border, control background,
   min-width 120px; macOS padding 2/10 radius 6, Windows 5/10 radius 4. */
.pref-select-item .pref-popup {
  font: inherit;
  font-size: 13px;
  min-width: 120px;
  max-width: 240px;
  box-sizing: border-box;
  color: var(--prefText, #1d1d1f);
  background: var(--prefCtrl, #ffffff);
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.08);
  outline: none;
}

.pref-select-item.pref-os-mac .pref-popup {
  padding: 2px 6px 2px 10px;
  border-radius: 6px;
}

.pref-select-item.pref-os-win .pref-popup {
  padding: 5px 10px;
  border-radius: 4px;
}

.pref-select-item .pref-popup:disabled {
  opacity: 0.45;
}
/* END_BLOCK_POPUP_METRICS */
</style>
