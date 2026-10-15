<!--
// FILE: src/renderer/src/components/zoomIndicator/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Transient bottom-centre pill ("125 %") shown for ~1 s after
//            any unified-zoom change (C-49 R-5).
//   SCOPE:   Listening to the mt::zoom-level-changed bus event (emitted by
//            preferences APPLY_FONT_SIZE), rendering the
//            round(fontSize / baseFontSize × 100) percentage, and the
//            auto-hide timer. No zoom logic lives here.
//   DEPENDS: bus, vue.
//   LINKS:   .grace/changes/active/C-49 R-5; store/preferences.js
//            START_BLOCK_APPLY_FONT_SIZE; pages/app.vue (mounts it).
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-49 T-001: initial pill — event-driven
//   so boot hydration never flashes it; aria-live="polite" +
//   role="status"; prefers-reduced-motion drops the fade transition.
// END_CHANGE_SUMMARY
-->
<template>
  <div
    v-if="visible"
    class="zoom-indicator"
    :class="{ 'zoom-indicator-reduced-motion': reducedMotion }"
    role="status"
    aria-live="polite"
  >{{ label }}</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import bus from '@/bus'

const SHOW_MS = 1000

const visible = ref(false)
const label = ref('')
let hideTimer = null

const prefersReducedMotion = () => {
  try {
    return !!(
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

const reducedMotion = prefersReducedMotion()

// START_BLOCK_ZOOM_INDICATOR_SHOW
const show = ({ fontSize, baseFontSize } = {}) => {
  const size = Number(fontSize)
  const base = Number(baseFontSize)
  if (!Number.isFinite(size) || !Number.isFinite(base) || base <= 0) return
  label.value = `${Math.round((size / base) * 100)} %`
  visible.value = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    hideTimer = null
    visible.value = false
  }, SHOW_MS)
}
// END_BLOCK_ZOOM_INDICATOR_SHOW

onMounted(() => {
  bus.on('mt::zoom-level-changed', show)
})

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
  bus.off('mt::zoom-level-changed', show)
})
</script>

<style scoped>
.zoom-indicator {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--editorBgColor, #2c2c2c);
  color: var(--editorColor, #eeeeee);
  border: 1px solid var(--editorColor30, rgba(128, 128, 128, 0.4));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  font-size: 13px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  user-select: none;
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.15s ease;
}

/* Reduced motion: the pill appears/disappears without the fade. */
.zoom-indicator-reduced-motion {
  transition: none;
}
</style>
