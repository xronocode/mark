<!-- MODULE_CONTRACT
  PURPOSE: C-29 Split View container: lays the rich (muya) and source (CodeMirror) panes side by side with a draggable divider.
  SCOPE: Pane layout, divider drag and arrow keys (ratio clamped 0.1–0.9) and Enter/Alt+double-click side swap persisted to preferences, collapse below 800px container width. C-SPLIT-DBLCLICK-TOGGLE: plain divider double-click and right-edge-strip double-click toggle split through the view.split-view command (bus cmd::execute); the strip renders only while split is off, the container is wide enough and the diff view is not replacing the surface. Owns no document state: which pane is the read-only mirror is decided by the parent from the `active` slot prop.
  DEPENDS: preferences store (splitViewRatio, splitViewSwapped), bus (cmd::execute).
  LINKS: .grace/changes/archive/C-29; .grace/changes/archive/C-STABILIZE-SPLIT-GESTURES; M-011 editorWithTabs.
  ROLE: RUNTIME
  MAP_MODE: EXPORTS
END_MODULE_CONTRACT
MODULE_MAP:
  default - SplitView component; props { enabled, diffMode }, slots rich/source receive { active }.
  requestToggleSplit - bus cmd::execute dispatch of view.split-view (the one state-flip path shared with the menu and Cmd+\).
  handleDividerDblClick - Alt+dblclick swaps sides; plain dblclick requests the toggle.
  split-edge-strip - right-border enable strip (split off, wide container, no diff).
CHANGE_SUMMARY: 2026-10-29 C-SPLIT-DBLCLICK-TOGGLE: divider dblclick = toggle off via cmd::execute (swap moves to Alt+dblclick; Enter unchanged); right-edge strip (~8px, ew-resize hint) = toggle on, gated by width/diff.
  2026-10-13 C-29 initial split container.
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
      data-action="toggle-split"
      @keydown="handleDividerKey"
      @pointerdown="startDrag"
      @dblclick="handleDividerDblClick"
    ></div>
    <div class="split-pane split-pane-source">
      <slot name="source" :active="active"></slot>
    </div>
    <!-- C-SPLIT-DBLCLICK-TOGGLE: while split is off (and the container is
         wide enough to host it, and the diff view is not replacing the
         surface), a narrow hit strip along the right border double-click
         toggle-split enables the mode. -->
    <div
      v-if="!active && !diffMode && containerWidth >= MIN_SPLIT_WIDTH"
      class="split-edge-strip"
      data-action="toggle-split"
      aria-hidden="true"
      @dblclick="requestToggleSplit"
    ></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'
import bus from '@/bus'

const props = defineProps({
  enabled: {
    type: Boolean,
    default: false
  },
  // C-SPLIT-DBLCLICK-TOGGLE: the diff view replaces the editing surface —
  // the enable strip must not exist there.
  diffMode: {
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

// C-SPLIT-DBLCLICK-TOGGLE: the pointer toggle rides the exact command the
// menu and Cmd+\ use, so every entry point flips the same per-tab state.
const requestToggleSplit = () => {
  bus.emit('cmd::execute', 'view.split-view')
}

const handleDividerDblClick = (event) => {
  if (event.altKey) {
    swapSides()
    return
  }
  requestToggleSplit()
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

/* C-SPLIT-DBLCLICK-TOGGLE: enable strip along the right border of the
   editing surface, only while split is off. The split-view root is
   display:contents in that state, so the strip positions against the
   nearest positioned ancestor (the .container). 8 px keeps it inside the
   overlay-scrollbar zone on macOS; engines with classic scrollbars keep
   the outer half of their gutter grabbable (recorded in the plan). */
.split-edge-strip {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 6;
}

.split-edge-strip:hover {
  background: var(--floatHoverColor, rgba(128, 128, 128, 0.15));
}
</style>
