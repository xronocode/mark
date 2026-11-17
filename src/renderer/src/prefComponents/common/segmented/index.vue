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
          :class="{
            'is-active': option.value === selectValue,
            'is-near': isMarked(option.value)
          }"
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
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings segmented-control row (C-38 T-003) — label + optional help left, a mockup segmented control (Light/Dark/Auto style) right.
//   SCOPE: Segment rendering, keyboard-focus presentation and single-selection; v-model-style contract matching the other controls (value/options/onChange). C-PAGE-WIDTH-TABLES T-003: the optional markedValue prop adds the is-near anchor state (the nearest-preset underline the quick-settings Page tab shows on the closest preset of a non-preset value), and the dark-member active tile is raised with a hairline border in THIS shared component (the research fix — every consumer, Settings and the panel alike, inherits it; never forked into panel-local CSS).
//   DEPENDS: prefComponents/common/osClass (prefOsClass).
//   LINKS: .grace/changes/archive/C-38 T-003/T-004; .grace/changes/archive/C-PAGE-WIDTH-TABLES (plan T-003, corner C-4); .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   selectValue - active segment value (mirrors the value prop through a watcher).
//   isMarked - true when the option is the markedValue anchor and not the active segment (the is-near underline; no-op when markedValue is not provided).
//   select - calls onChange with the picked value (no-op on re-pick or disable).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-14: distinguish keyboard focus with the existing preference-accent outline, preserving active and nearest-preset states.
//   - 2026-11-02 v1.1.0: C-PAGE-WIDTH-TABLES T-003 — optional markedValue
//     prop renders the is-near nearest-preset anchor on a non-active
//     segment, and the dark-member macOS active tile is raised (#5a5a60)
//     with a 0.5px hairline border so it reads on the rgba(255,255,255,.08)
//     container (the shipped #454545 tile was effectively invisible — the
//     mock-verified contrast fix, landed here in the shared component).
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
  // C-PAGE-WIDTH-TABLES T-003: value of the segment carrying the is-near
  // anchor mark (the nearest preset for the current non-preset value).
  // Optional — unset leaves every consumer's rendering unchanged.
  markedValue: [String, Number],
  disable: {
    type: Boolean,
    default: false
  }
})

const selectValue = ref(props.value)
const osClass = prefOsClass()

const isMarked = (optionValue) =>
  props.markedValue !== undefined &&
  props.markedValue !== null &&
  optionValue === props.markedValue &&
  optionValue !== selectValue.value

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

.pref-segmented-item .pref-segment:focus-visible {
  outline: 2px solid var(--prefAccent);
  outline-offset: 1px;
}

.pref-segmented-item.pref-os-win .pref-segment {
  border-radius: 4px;
}

.pref-segmented-item.pref-os-mac .pref-segment.is-active {
  background: var(--prefCtrl, #ffffff);
  box-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.2);
}

/* C-PAGE-WIDTH-TABLES T-003 (corner C-4): the shipped dark tile —
   --prefCtrl #454545 on the rgba(255,255,255,.08) container — read as
   effectively invisible in the research review. The shared fix raises the
   tile and adds the hairline; the panel consumes it through this
   component, never through panel-local CSS. */
body.dark .pref-segmented-item.pref-os-mac .pref-segment.is-active {
  background: #5a5a60;
  border: 0.5px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}

/* The nearest-preset anchor: a 2px accent underline inside the segment
   (the mock-verified is-near mark). */
.pref-segmented-item .pref-segment.is-near {
  box-shadow: inset 0 -2px 0 var(--prefAccent, #007aff);
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
