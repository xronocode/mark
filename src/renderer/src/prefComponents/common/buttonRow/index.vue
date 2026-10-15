<template>
  <!-- START_BLOCK_BUTTON_ROW -->
  <section
    class="pref-row pref-button-item"
    :class="[osClass, { 'ag-underdevelop': disable, 'pref-button-item--danger': danger }]"
  >
    <div class="pref-row-text">
      <span class="pref-row-label">{{ description }}</span>
      <span v-if="help" class="pref-row-help">{{ help }}</span>
    </div>
    <div class="pref-row-control">
      <button
        type="button"
        class="pref-button"
        :disabled="disable"
        @click="handleClick"
      >
        {{ value }}
      </button>
    </div>
  </section>
  <!-- END_BLOCK_BUTTON_ROW -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/buttonRow/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings button row (C-38 T-003) — label + optional help left, a mockup push button right (plain or destructive).
//   SCOPE: Button rendering and click dispatch (onClick function prop, mirroring the onChange convention of the other controls).
//   DEPENDS: prefComponents/common/osClass (prefOsClass).
//   LINKS: .grace/changes/active/C-38 T-003/T-004; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   handleClick - invokes the onClick prop (no-op when disabled).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 T-003 — new control for T-004 action rows (updates, shortcuts, extensions, reset); danger variant renders the destructive red.
// END_CHANGE_SUMMARY

import { prefOsClass } from '../osClass'

const props = defineProps({
  description: String,
  help: String,
  value: String,
  danger: {
    type: Boolean,
    default: false
  },
  disable: {
    type: Boolean,
    default: false
  },
  onClick: Function
})

const osClass = prefOsClass()

const handleClick = () => {
  if (props.disable) return
  props.onClick?.()
}
</script>

<style>
/* START_BLOCK_BUTTON_METRICS */
/* Mockup push button: 13px text, hairline border, control background;
   macOS padding 3/12 radius 6, Windows 5/14 radius 4; the danger
   variant carries the destructive red text. */
.pref-button-item .pref-button {
  all: unset;
  cursor: default;
  font-size: 13px;
  box-sizing: border-box;
  padding: 3px 12px;
  border-radius: 6px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefCtrl, #ffffff);
  color: var(--prefText, #1d1d1f);
  box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.08);
}

.pref-button-item.pref-os-win .pref-button {
  padding: 5px 14px;
  border-radius: 4px;
}

.pref-button-item.pref-button-item--danger .pref-button {
  color: #c4271b;
}

body.dark .pref-button-item.pref-button-item--danger .pref-button {
  color: #ff6961;
}

.pref-button-item .pref-button:disabled {
  opacity: 0.45;
}
/* END_BLOCK_BUTTON_METRICS */
</style>
