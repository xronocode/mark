<!-- MODULE_CONTRACT
  PURPOSE: C-29 Split View container: lays the rich (muya) and source (CodeMirror) panes side by side with a draggable divider.
  SCOPE: Pane layout, divider drag and arrow keys (ratio clamped 0.1–0.9) and double-click/Enter side swap persisted to preferences, collapse below 800px container width. Owns no document state: which pane is the read-only mirror is decided by the parent from the `active` slot prop.
  DEPENDS: preferences store (splitViewRatio, splitViewSwapped).
  LINKS: .grace/changes/active/C-29; M-011 editorWithTabs.
  ROLE: RUNTIME
  MAP_MODE: EXPORTS
END_MODULE_CONTRACT
MODULE_MAP:
  default - SplitView component; props { enabled }, slots rich/source receive { active }.
CHANGE_SUMMARY: 2026-10-13 C-29 initial split container.
-->
<template>
  <div
    ref="rootRef"
    class="split-view"
    :class="{ 'is-split': active, 'is-swapped': swapped, 'is-dragging': dragging }"
    :style="active ? { '--split-left': `${ratio * 100}%` } : null"
  >
    <!-- Both panes are always rendered so toggling split never remounts muya
         or CodeMirror; when split is inactive the wrappers are display:contents
         and the layout is exactly the single-pane one. -->
    <div class="split-pane split-pane-rich">
      <slot name="rich" :active="active"></slot>
    </div>
    <div
      v-if="active"
      class="split-divider"
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="Math.round(ratio * 100)"
      aria-valuemin="10"
      aria-valuemax="90"
      tabindex="0"
      @keydown="handleDividerKey"
      @pointerdown="startDrag"
      @dblclick="swapSides"
    ></div>
    <div class="split-pane split-pane-source">
      <slot name="source" :active="active"></slot>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'

const props = defineProps({
  enabled: {
    type: Boolean,
    default: false
  }
})

// START_BLOCK_SPLIT_LAYOUT_STATE
const MIN_SPLIT_WIDTH = 800
const RATIO_MIN = 0.1
const RATIO_MAX = 0.9

const preferencesStore = usePreferencesStore()
const { splitViewRatio, splitViewSwapped } = storeToRefs(preferencesStore)

const rootRef = ref(null)
const containerWidth = ref(Infinity)
const dragRatio = ref(null)
const dragging = ref(false)

const clampRatio = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.5
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, n))
}

const ratio = computed(() => clampRatio(dragRatio.value ?? splitViewRatio.value))
const swapped = computed(() => !!splitViewSwapped.value)
const active = computed(() => props.enabled && containerWidth.value >= MIN_SPLIT_WIDTH)
// END_BLOCK_SPLIT_LAYOUT_STATE

// START_BLOCK_SPLIT_DIVIDER_DRAG
const ratioFromEvent = (event) => {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return ratio.value
  return clampRatio((event.clientX - rect.left) / rect.width)
}

const onDragMove = (event) => {
  dragRatio.value = ratioFromEvent(event)
}

const persistRatio = (raw) => {
  const value = Math.round(raw * 1000) / 1000
  if (value !== splitViewRatio.value) {
    preferencesStore.SET_SINGLE_PREFERENCE({ type: 'splitViewRatio', value })
  }
}

const endDrag = () => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  dragging.value = false
  if (dragRatio.value === null) return
  const raw = dragRatio.value
  dragRatio.value = null
  persistRatio(raw)
}

const startDrag = (event) => {
  if (event.button !== 0) return
  event.preventDefault()
  dragging.value = true
  dragRatio.value = ratio.value
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

// Keyboard: arrows move the divider by 5%, Enter swaps sides.
const KEY_STEP = 0.05
const handleDividerKey = (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP
    persistRatio(clampRatio(ratio.value + delta))
  } else if (event.key === 'Enter') {
    event.preventDefault()
    swapSides()
  }
}

const swapSides = () => {
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'splitViewSwapped', value: !swapped.value })
}
// END_BLOCK_SPLIT_DIVIDER_DRAG

// START_BLOCK_SPLIT_WIDTH_OBSERVER
// The root is display:contents while split is off, so it has no box of its
// own: observe the parent container, which is laid out in both states.
let resizeObserver = null

onMounted(() => {
  const target = rootRef.value?.parentElement
  if (!target || typeof ResizeObserver !== 'function') return
  containerWidth.value = target.clientWidth || Infinity
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1]
    if (entry) containerWidth.value = entry.contentRect.width
  })
  resizeObserver.observe(target)
})

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
  resizeObserver = null
  endDrag()
})
// END_BLOCK_SPLIT_WIDTH_OBSERVER

defineExpose({ active, ratio, swapped })
</script>

<style>
.split-view,
.split-view > .split-pane {
  display: contents;
}

.split-view.is-split {
  display: flex;
  height: 100%;
  width: 100%;
}

.split-view.is-split > .split-pane {
  display: block;
  position: relative;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

/* Source on the left by default; double-click on the divider swaps. */
.split-view.is-split > .split-pane-source {
  order: 0;
  flex: 0 0 var(--split-left, 50%);
}
.split-view.is-split > .split-divider {
  order: 1;
}
.split-view.is-split > .split-pane-rich {
  order: 2;
  flex: 1 1 0;
}
.split-view.is-split.is-swapped > .split-pane-rich {
  order: 0;
  flex: 0 0 var(--split-left, 50%);
}
.split-view.is-split.is-swapped > .split-pane-source {
  order: 2;
  flex: 1 1 0;
}

.split-divider {
  flex: 0 0 5px;
  cursor: col-resize;
  background: var(--editorBgColor);
  border-left: 1px solid var(--floatBorderColor, rgba(128, 128, 128, 0.25));
  box-sizing: border-box;
  touch-action: none;
}
.split-divider:focus-visible {
  outline: 2px solid var(--themeColor, #4a90d9);
  outline-offset: -2px;
}
.split-divider:hover,
.split-view.is-dragging > .split-divider {
  background: var(--floatHoverColor, rgba(128, 128, 128, 0.15));
}
.split-view.is-dragging {
  cursor: col-resize;
  user-select: none;
}

.split-view.is-split .source-code {
  height: 100%;
}
</style>
