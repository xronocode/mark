<template>
  <!-- START_BLOCK_STEPPER_ROW -->
  <section
    class="pref-row pref-range-item"
    :class="[osClass, { 'ag-underdevelop': disable }]"
  >
    <div class="pref-row-text">
      <span class="pref-row-label">{{ description }}</span>
      <InfoFilled v-if="more" width="16" height="16" class="pref-more-link" @click="handleMoreClick" />
      <span v-if="helpLine" class="pref-row-help">{{ helpLine }}</span>
    </div>
    <div class="pref-row-control pref-stepper-control">
      <!-- Value + unit rendered exactly once (the v1 "14px px" bug). -->
      <span class="pref-value">{{ displayValue }}</span>
      <span class="pref-stepper">
        <button
          type="button"
          class="pref-stepper-btn"
          aria-label="Increase"
          :disabled="disable || atMax"
          @click="step(1)"
        >
          <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden="true">
            <path d="M1 5l3-3 3 3" stroke="currentColor" stroke-width="1.3" fill="none" />
          </svg>
        </button>
        <span class="pref-stepper-line"></span>
        <button
          type="button"
          class="pref-stepper-btn"
          aria-label="Decrease"
          :disabled="disable || atMin"
          @click="step(-1)"
        >
          <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden="true">
            <path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.3" fill="none" />
          </svg>
        </button>
      </span>
    </div>
  </section>
  <!-- END_BLOCK_STEPPER_ROW -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/range/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings numeric row (C-38 T-003 anatomy) — the old range slider rendered as the mockup stepper: label + help left, value (unit once) with up/down steppers right, honouring the same min/max/step/onChange contract.
//   SCOPE: Stepping, clamping and float-safe rounding; props-compatible with every existing range caller.
//   DEPENDS: @element-plus/icons-vue (InfoFilled), prefComponents/common/osClass (prefOsClass).
//   LINKS: .grace/changes/archive/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 (unit-rendered-once regression).
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   selectValue - current numeric value (mirrors the value prop through a watcher).
//   displayValue - value + unit as one string, rendered once per row.
//   decimals - step-derived precision so 1.6 + 0.1 never shows 1.7000000000000002.
//   clamp - min/max guard (string values such as legacy '14px' coerce to numbers).
//   step - applies ±step through clamp and calls onChange with the number.
//   select - programmatic apply (tests/direct callers).
//   handleMoreClick - opens the external `more` link.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-003 — slider replaced by the mockup stepper; row anatomy with optional help; value+unit rendered exactly once ("14 px", never "14px px"); numeric coercion for legacy string values.
//   - (v1.x: el-slider with value/unit printed twice-ish — retired.)
// END_CHANGE_SUMMARY

import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { InfoFilled } from '@element-plus/icons-vue'
import { prefOsClass } from '../osClass'

const props = defineProps({
  description: String,
  notes: String,
  help: String,
  value: [String, Number],
  min: Number,
  max: Number,
  onChange: Function,
  unit: String,
  step: Number,
  more: String,
  disable: {
    type: Boolean,
    default: false
  }
})

// Legacy callers stored strings ('14px'); coerce once at the boundary.
const toNumber = (value) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(parsed) ? parsed : (props.min ?? 0)
}

const selectValue = ref(toNumber(props.value))
const osClass = prefOsClass()
const helpLine = computed(() => props.help || props.notes || '')

const decimals = computed(() => {
  const s = String(props.step ?? 1)
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
})

const clamp = (value) => {
  let v = value
  if (typeof props.min === 'number') v = Math.max(props.min, v)
  if (typeof props.max === 'number') v = Math.min(props.max, v)
  return v
}

const round = (value) => {
  const factor = 10 ** decimals.value
  return Math.round(value * factor) / factor
}

// Review fix: the number follows the UI locale (1,5 in Russian).
// The row also mounts outside an i18n-enabled app (unit tests, early
// boot); the number then falls back to the plain String form.
let i18n = null
try {
  i18n = useI18n()
} catch {
  i18n = null
}
const formatNumber = (value) => {
  const locale = i18n?.locale?.value
  try {
    return locale ? new Intl.NumberFormat(locale).format(value) : String(value)
  } catch {
    return String(value)
  }
}

const displayValue = computed(() => {
  const text = formatNumber(round(selectValue.value))
  return props.unit ? `${text} ${props.unit}` : text
})

const atMax = computed(() => typeof props.max === 'number' && round(selectValue.value) >= props.max)
const atMin = computed(() => typeof props.min === 'number' && round(selectValue.value) <= props.min)

watch(
  () => props.value,
  (value, oldValue) => {
    if (value !== oldValue) {
      selectValue.value = toNumber(value)
    }
  }
)

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

// START_BLOCK_STEPPER_STEP
// One click = one step, clamped to [min, max]; onChange always receives
// a number (the store keys stay numeric).
const step = (direction) => {
  if (props.disable) return
  const next = clamp(round(selectValue.value + direction * (props.step ?? 1)))
  if (next === selectValue.value) return
  selectValue.value = next
  props.onChange(next)
}
// END_BLOCK_STEPPER_STEP

const select = (value) => {
  const next = clamp(toNumber(value))
  selectValue.value = next
  props.onChange(next)
}
</script>

<style>
/* START_BLOCK_STEPPER_METRICS */
/* Mockup stepper: tabular-nums value + 15px-wide up/down control with a
   hairline divider; colors from the shell palette. */
.pref-range-item .pref-stepper-control {
  gap: 8px;
}

.pref-range-item .pref-value {
  font-size: 13px;
  color: var(--prefText, #1d1d1f);
  font-variant-numeric: tabular-nums;
}

.pref-range-item .pref-stepper {
  display: flex;
  flex-direction: column;
  width: 15px;
  box-sizing: border-box;
  border-radius: 5px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefCtrl, #ffffff);
  color: var(--prefSub, #6b6b70);
  overflow: hidden;
}

.pref-range-item .pref-stepper-btn {
  all: unset;
  cursor: default;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 10px;
}

.pref-range-item .pref-stepper-btn:disabled {
  opacity: 0.35;
}

.pref-range-item .pref-stepper-line {
  height: 0.5px;
  background: var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
}
/* END_BLOCK_STEPPER_METRICS */
</style>
