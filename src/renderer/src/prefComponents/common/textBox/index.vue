<template>
  <!-- START_BLOCK_FIELD_ROW -->
  <section
    class="pref-row pref-text-box-item"
    :class="[osClass, { 'ag-underdevelop': disable }]"
  >
    <div class="pref-row-text">
      <span class="pref-row-label">{{ description }}</span>
      <InfoFilled v-if="more" width="16" height="16" class="pref-more-link" @click="handleMoreClick" />
      <span v-if="helpLine" class="pref-row-help">{{ helpLine }}</span>
    </div>
    <div class="pref-row-control">
      <input
        v-model="inputText"
        type="text"
        class="pref-field"
        :class="{ error: invalidInput }"
        :placeholder="defaultValue"
        :aria-label="description"
        :disabled="disable"
        @input="handleInput"
      />
    </div>
  </section>
  <!-- END_BLOCK_FIELD_ROW -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/textBox/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings text-field row (C-38 T-003 anatomy) — label + optional help left, right-aligned mockup field (150px, placeholder) right, with the v1 debounce + regex validation contract unchanged.
//   SCOPE: Row rendering, debounced onChange, invalid-input marking; same props/events as v1 plus help.
//   DEPENDS: @element-plus/icons-vue (InfoFilled), prefComponents/common/osClass (prefOsClass).
//   LINKS: .grace/changes/active/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   inputText - current text (mirrors the input prop through a watcher).
//   invalidInput - regex failure marker (error styling).
//   helpLine - secondary help text (help prop, else legacy notes).
//   handleInput - validates, then debounced onChange (emitTime, 0 = immediate).
//   handleMoreClick - opens the external `more` link.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-003 — new row anatomy (no trailing colon, optional help); el-input replaced by the mockup right-aligned field with placeholder; debounce/regex contract preserved.
//   - (v1.x: el-input under a 'Label:' caption — retired.)
// END_CHANGE_SUMMARY

import { ref, watch, computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { prefOsClass } from '../osClass'

const props = defineProps({
  description: String,
  notes: String,
  help: String,
  input: String,
  onChange: Function,
  more: String,
  disable: {
    type: Boolean,
    default: false
  },
  defaultValue: {
    type: String,
    default: ''
  },
  emitTime: {
    type: Number,
    default: 800
  },
  regexValidator: {
    type: RegExp,
    default: () => /(.*?)/
  }
})

let inputTimer = null
const inputText = ref(props.input)
const invalidInput = ref(false)
const osClass = prefOsClass()
const helpLine = computed(() => props.help || props.notes || '')

watch(
  () => props.input,
  (value, oldValue) => {
    if (value !== oldValue) {
      inputText.value = value
    }
  }
)

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

// Accepts either the DOM input event (v-model state is already updated)
// or an explicit value string (direct calls in tests).
const handleInput = (value) => {
  const text = value instanceof Event ? inputText.value : value
  const result = props.regexValidator.test(text)
  invalidInput.value = !result

  if (result) {
    if (inputTimer) {
      clearTimeout(inputTimer)
    }

    if (props.emitTime === 0) {
      props.onChange(text)
      return
    }

    inputTimer = setTimeout(() => {
      inputTimer = null
      props.onChange(text)
    }, props.emitTime)
  }
}
</script>

<style>
/* START_BLOCK_FIELD_METRICS */
/* Mockup text field: 13px, 150px wide, right-aligned text, placeholder
   carries the default; macOS radius 5, Windows radius 4. */
.pref-text-box-item .pref-field {
  font: inherit;
  font-size: 13px;
  width: 150px;
  box-sizing: border-box;
  padding: 3px 8px;
  color: var(--prefText, #1d1d1f);
  background: var(--prefCtrl, #ffffff);
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  text-align: right;
  outline: none;
}

.pref-text-box-item.pref-os-mac .pref-field {
  border-radius: 5px;
}

.pref-text-box-item.pref-os-win .pref-field {
  border-radius: 4px;
}

.pref-text-box-item .pref-field:focus {
  border-color: var(--prefAccent, #007aff);
}

.pref-text-box-item .pref-field::placeholder {
  color: var(--prefSub, #6b6b70);
}

.pref-text-box-item .pref-field.error {
  color: #d9534f;
}

.pref-text-box-item .pref-field:disabled {
  opacity: 0.45;
}
/* END_BLOCK_FIELD_METRICS */
</style>
