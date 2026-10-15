<template>
  <!-- START_BLOCK_SEGMENTED_ROW -->
  <section
    class="pref-row pref-segmented-item"
    :class="[osClass, { 'ag-underdevelop': disable }]"
  >
    <div class="pref-row-text">
      <span class="pref-row-label">{{ description }}</span>
      <span v-if="help" class="pref-row-help">{{ help }}</span>
    </div>
    <div class="pref-row-control">
      <span class="pref-segmented" role="radiogroup" :aria-label="description">
        <button
          v-for="option in options"
          :key="String(option.value)"
          type="button"
          role="radio"
          class="pref-segment"
          :class="{ 'is-active': option.value === selectValue }"
          :aria-checked="option.value === selectValue ? 'true' : 'false'"
          :disabled="disable"
          @click="select(option.value)"
        >
          {{ option.label }}
        </button>
      </span>
    </div>
  </section>
  <!-- END_BLOCK_SEGMENTED_ROW -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/segmented/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings segmented-control row (C-38 T-003) — label + optional help left, a mockup segmented control (Light/Dark/Auto style) right.
//   SCOPE: Segment rendering and single-selection; v-model-style contract matching the other controls (value/options/onChange).
//   DEPENDS: prefComponents/common/osClass (prefOsClass).
//   LINKS: .grace/changes/active/C-38 T-003/T-004; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   selectValue - active segment value (mirrors the value prop through a watcher).
//   select - calls onChange with the picked value (no-op on re-pick or disable).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 T-003 — new control for T-004 rows (theme mode, list spacing); per-OS active treatment (macOS: raised control background; Windows: accent fill).
// END_CHANGE_SUMMARY

import { ref, watch } from 'vue'
import { prefOsClass } from '../osClass'

const props = defineProps({
  description: String,
  help: String,
  value: [String, Number, Boolean],
  options: Array,
  onChange: Function,
  disable: {
    type: Boolean,
    default: false
  }
})

const selectValue = ref(props.value)
const osClass = prefOsClass()

watch(
  () => props.value,
  (value, oldValue) => {
    if (value !== oldValue) {
      selectValue.value = value
    }
  }
)

const select = (value) => {
  if (props.disable || value === selectValue.value) return
  selectValue.value = value
  props.onChange(value)
}
</script>

<style>
/* START_BLOCK_SEGMENTED_METRICS */
/* Mockup: 2px-padded pill container on a subtle fill; active segment is
   a raised control tile on macOS, an accent tile with white text on
   Windows/Linux. */
.pref-segmented-item .pref-segmented {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.06);
}

body.dark .pref-segmented-item .pref-segmented {
  background: rgba(255, 255, 255, 0.08);
}

.pref-segmented-item .pref-segment {
  all: unset;
  cursor: default;
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 5px;
  color: var(--prefText, #1d1d1f);
}

.pref-segmented-item.pref-os-win .pref-segment {
  border-radius: 4px;
}

.pref-segmented-item.pref-os-mac .pref-segment.is-active {
  background: var(--prefCtrl, #ffffff);
  box-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.2);
}

.pref-segmented-item.pref-os-win .pref-segment.is-active {
  background: var(--prefAccent, #005fb8);
  color: #fff;
}

.pref-segmented-item .pref-segment:disabled {
  opacity: 0.45;
}
/* END_BLOCK_SEGMENTED_METRICS */
</style>
