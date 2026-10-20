<template>
  <!-- START_BLOCK_SWITCH_ROW -->
  <section
    class="pref-row pref-switch-item"
    :class="[osClass, { 'ag-underdevelop': disable }]"
  >
    <div class="pref-row-text">
      <span class="pref-row-label">{{ description }}</span>
      <InfoFilled v-if="more" width="16" height="16" class="pref-more-link" @click="handleMoreClick" />
      <span v-if="helpLine" class="pref-row-help">{{ helpLine }}</span>
    </div>
    <div class="pref-row-control">
      <button
        type="button"
        role="switch"
        class="pref-switch"
        :class="{ 'is-on': status }"
        :aria-checked="status ? 'true' : 'false'"
        :aria-label="description"
        :aria-disabled="disable ? 'true' : 'false'"
        :disabled="disable"
        @click="handleSwitchClick"
      >
        <span class="pref-switch-knob"></span>
      </button>
    </div>
  </section>
  <!-- END_BLOCK_SWITCH_ROW -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/bool/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings switch row (C-38 T-003 anatomy) — label + optional secondary help left, mockup-spec switch right (macOS 32×18 filled / Windows 40×20 outlined).
//   SCOPE: Row rendering and toggle interaction; same props/events contract as v1 (description/notes/bool/onChange/more/detailedDescription/disable) plus help.
//   DEPENDS: @element-plus/icons-vue (InfoFilled), prefComponents/common/osClass (prefOsClass).
//   LINKS: .grace/changes/archive/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   status - current on/off state (mirrors the bool prop through a watcher).
//   osClass - 'pref-os-mac' / 'pref-os-win' per-OS metrics selector.
//   helpLine - the secondary help text: help prop, else the legacy detailedDescription/notes.
//   handleSwitchClick - toggles status and calls onChange (no-op when disabled).
//   handleMoreClick - opens the external `more` link.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-003 — new row anatomy (no trailing colon, help as secondary text instead of tooltip info icons); el-switch replaced by the mockup switch with role=switch/aria-checked; per-OS track metrics.
//   - (v1.x: el-switch row with 'Label:' + tooltip — retired.)
// END_CHANGE_SUMMARY

import { ref, watch, computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { prefOsClass } from '../osClass'

const props = defineProps({
  description: String,
  notes: String,
  help: String,
  bool: Boolean,
  onChange: Function,
  more: String,
  detailedDescription: String,
  disable: {
    type: Boolean,
    default: false
  }
})

const status = ref(props.bool)
const osClass = prefOsClass()

// C-38: help as visible secondary text; detailedDescription (old tooltip)
// and notes (old italic aside) degrade into the same help line.
const helpLine = computed(() => props.help || props.detailedDescription || props.notes || '')

watch(
  () => props.bool,
  (value, oldValue) => {
    if (value !== oldValue) {
      status.value = value
    }
  }
)

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

const handleSwitchChange = (value) => {
  props.onChange(value)
}

const handleSwitchClick = () => {
  if (props.disable) return
  status.value = !status.value
  handleSwitchChange(status.value)
}
</script>

<style>
/* START_BLOCK_SWITCH_METRICS */
/* Mockup: macOS 32×18 filled track with a 14px knob; Windows 40×20
   outlined track with a 12px knob. Palette from the shell vars. */
.pref-switch-item .pref-switch {
  all: unset;
  cursor: default;
  position: relative;
  display: block;
  box-sizing: border-box;
  transition: background 0.15s;
}

.pref-switch-item.pref-os-mac .pref-switch {
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: var(--prefOff, #d8d8dc);
}

.pref-switch-item.pref-os-mac .pref-switch.is-on {
  background: var(--prefAccent, #007aff);
}

.pref-switch-item.pref-os-mac .pref-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 7px;
  background: var(--prefKnob, #ffffff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: left 0.15s;
}

.pref-switch-item.pref-os-mac .pref-switch.is-on .pref-switch-knob {
  left: 16px;
}

.pref-switch-item.pref-os-win .pref-switch {
  width: 40px;
  height: 20px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid var(--prefSub, #6b6b70);
}

.pref-switch-item.pref-os-win .pref-switch.is-on {
  background: var(--prefAccent, #005fb8);
  border-color: var(--prefAccent, #005fb8);
}

.pref-switch-item.pref-os-win .pref-switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background: var(--prefSub, #6b6b70);
  transition: left 0.15s;
}

.pref-switch-item.pref-os-win .pref-switch.is-on .pref-switch-knob {
  left: 23px;
  background: #fff;
}

body.dark .pref-switch-item.pref-os-win .pref-switch.is-on .pref-switch-knob {
  background: #000;
}

.pref-switch-item[aria-disabled='true'] .pref-switch,
.pref-switch-item .pref-switch:disabled {
  opacity: 0.45;
}
/* END_BLOCK_SWITCH_METRICS */
</style>
