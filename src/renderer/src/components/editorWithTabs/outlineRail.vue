<template>
  <div v-show="railVisible" ref="anchorRef" class="outline-rail-anchor">
    <nav
      ref="railRef"
      class="outline-rail"
      data-editor-overlay-right
      :class="{ 'outline-rail--wrap': wordWrapInToc, 'outline-rail--occluded': occluded }"
      :aria-label="t('outlineRail.title')"
      :aria-hidden="occluded ? 'true' : undefined"
      :inert="occluded ? '' : undefined"
    >
      <div class="outline-rail-header">{{ t('outlineRail.title') }}</div>
      <div class="outline-rail-items">
        <button
          v-for="heading in headings"
          :key="heading.slug"
          type="button"
          class="outline-rail-item"
          :class="{
            'outline-rail-item--current':
              currentHeading && heading.slug === currentHeading.slug
          }"
          :style="{ '--outline-rail-indent': `${(heading.lvl - 1) * 10}px` }"
          :title="heading.label"
          @click="jumpTo(heading.slug)"
        >{{ heading.label }}</button>
      </div>
    </nav>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/editorWithTabs/outlineRail.vue
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: C-40 T-003 «On this page» outline rail — a slim absolute rail right of the centred text column listing h1–h3, tracking the section in view, and smooth-jumping on click.
//   SCOPE: Rendering + visibility gates (preference, WYSIWYG-only modes, ≥3 h1–h3 headings, ≥1000px editor area, no text overlap), scrollspy highlight, click-to-jump; hide the whole rail without reflow during visible table intersection, using owned scroll/resize/column mutation observation with unmount cleanup.
//   DEPENDS: editor/preferences stores, bus (toc-active-heading, scroll-to-header), util/outlineRail.js, ResizeObserver, scoped MutationObserver, animation frames.
//   LINKS: .grace/changes/archive/C-40 T-003; .grace/graph/runtime.xml M-011 fn-extractRailHeadings; .grace/verification/runtime.xml V-M-011 scenario-54.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   headings - Computed h1–h3 rail items from the editor store's listToc (util extractRailHeadings).
//   currentHeading - Computed nearest visible heading at-or-before the scrollspy slug (util resolveCurrentHeading).
//   measure - Reads the editor-area width and the centred column's text edge from the live DOM.
//   setActiveSlug - Applies the editor's toc-active-heading scrollspy payload.
//   jumpTo - Emits scroll-to-header for a clicked rail item (the shared smooth-scroll path).
//   railRef/occluded - Live rail box and layout-preserving table-intersection visibility state.
//   updateOcclusion - Measures only owned live tables against the rail and scrollport; reconciles table resize observations.
//   scheduleOcclusion - Coalesces owned scroll/resize/mutation reads into one animation frame.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-19 v1.2.0: C-71-OUTLINE-OCCLUSION — hide the whole outline on any visible table intersection, independently of hover, without changing its box or page geometry.
//   - 2026-10-19 v1.1.1: C-65 — the rail marks itself data-editor-overlay-right so a centred Full width table never slides under it.
//   - 2026-10-15 v1.1.0: C-38 T-006 N4 b — the current item's marker
//     tick and the focus ring follow the system accent instead of the
//     theme colours.
//   - 2026-10-15 v1.0.0: C-40 T-003 — initial rail replacing the sidebar
//     TOC panel. Canvas style (170px rail, 22px right inset, uppercase
//     header, current item bold with a marker tick on the rule line); the
//     tick is a ::before square rather than the canvas box-shadow formula
//     so it renders identically in Chromium and WKWebView.
// END_CHANGE_SUMMARY

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import {
  extractRailHeadings,
  resolveCurrentHeading,
  shouldShowRail,
  COLUMN_RIGHT_PADDING_FALLBACK,
  railIntersectsTable
} from '@/util/outlineRail'

const props = defineProps({
  // Gate props mirror editorWithTabs/index.vue: the rail is a plain-WYSIWYG
  // surface only — not source mode, split view, or the diff view.
  sourceCode: { type: Boolean, default: false },
  splitView: { type: Boolean, default: false },
  diffMode: { type: Boolean, default: false }
})

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const { listToc } = storeToRefs(editorStore)
const { outlineRailVisible, wordWrapInToc } = storeToRefs(preferencesStore)

// START_BLOCK_RAIL_HEADINGS
const headings = computed(() => extractRailHeadings(listToc.value))

// The scrollspy publishes the slug of the heading containing the viewport
// (any level); the rail highlights the nearest listed h1–h3 at-or-before
// it, so a viewport inside an h4 keeps its visible ancestor current.
const activeSlug = ref(null)
const currentHeading = computed(() =>
  resolveCurrentHeading(headings.value, listToc.value, activeSlug.value)
)
// END_BLOCK_RAIL_HEADINGS

// START_BLOCK_RAIL_MEASURE
// Geometry: the anchor's parent is the editorWithTabs .container (position:
// relative). The rail itself is pinned inside it (canvas: right 22px, width
// 170px); measuring the centred #ag-editor-id column keeps the gate honest
// against --editorAreaWidth / editorLineWidth changes, which resize the
// column without resizing the container.
const anchorRef = ref(null)
const railRef = ref(null)
const occluded = ref(false)
const containerWidth = ref(NaN)
const columnRight = ref(NaN)
const columnPaddingRight = ref(NaN)

const measure = () => {
  const anchor = anchorRef.value
  const container = anchor?.parentElement
  if (!container) return
  containerWidth.value = container.getBoundingClientRect().width
  const column = container.querySelector('#ag-editor-id')
  if (!column) {
    columnRight.value = NaN
    columnPaddingRight.value = NaN
    return
  }
  const containerLeft = container.getBoundingClientRect().left
  const columnRect = column.getBoundingClientRect()
  columnRight.value = columnRect.right - containerLeft
  const computed = window.getComputedStyle?.(column)
  const padding = parseFloat(computed?.paddingRight)
  columnPaddingRight.value = Number.isFinite(padding) && padding > 0
    ? padding
    : COLUMN_RIGHT_PADDING_FALLBACK
  scheduleOcclusion()
}

let resizeObserver = null
let mutationObserver = null
let occlusionHost = null
let occlusionFrame = null
let observedTables = new Set()
let destroyed = false

const railVisible = computed(() =>
  shouldShowRail({
    preferenceVisible: !!outlineRailVisible.value,
    sourceCode: props.sourceCode,
    splitView: props.splitView,
    diffMode: props.diffMode,
    containerWidth: containerWidth.value,
    columnRight: columnRight.value,
    columnPaddingRight: columnPaddingRight.value,
    headings: headings.value
  })
)
// END_BLOCK_RAIL_MEASURE

// START_BLOCK_RAIL_TABLE_OCCLUSION
const updateOcclusion = () => {
  occlusionFrame = null
  if (destroyed) return
  const rail = railRef.value
  const scroller = occlusionHost?.querySelector('.editor-component')
  if (!railVisible.value || !rail || !scroller) {
    occluded.value = false
    return
  }
  const tables = new Set(scroller.querySelectorAll("figure[data-role='TABLE'] > .ag-table-scroll > table"))
  for (const table of observedTables) {
    if (!tables.has(table)) resizeObserver?.unobserve(table)
  }
  for (const table of tables) {
    if (!observedTables.has(table)) resizeObserver?.observe(table)
  }
  observedTables = tables
  const railRect = rail.getBoundingClientRect()
  const viewport = scroller.getBoundingClientRect()
  occluded.value = [...tables].some(table => {
    // Fit-to-page tables clip inside their own wrapper. Hidden columns
    // outside that wrapper must not hide a rail they cannot paint over.
    const wrapper = table.parentElement
    const clip = getComputedStyle(wrapper).overflowX === 'visible'
      ? viewport
      : wrapper.getBoundingClientRect()
    return railIntersectsTable(railRect, table.getBoundingClientRect(), viewport, clip)
  })
}

const scheduleOcclusion = () => {
  if (destroyed || occlusionFrame !== null) return
  occlusionFrame = requestAnimationFrame(updateOcclusion)
}
// END_BLOCK_RAIL_TABLE_OCCLUSION

const jumpTo = (slug) => {
  bus.emit('scroll-to-header', slug)
  console.debug(`[OutlineRail][jumpTo][BLOCK_RAIL_JUMP slug=${slug}]`)
}

// START_BLOCK_RAIL_ACTIVE_SUBSCRIPTION
const setActiveSlug = (slug) => {
  activeSlug.value = slug || null
}
// END_BLOCK_RAIL_ACTIVE_SUBSCRIPTION

onMounted(() => {
  bus.on('toc-active-heading', setActiveSlug)
  occlusionHost = anchorRef.value?.closest('.editor-with-tabs') || anchorRef.value?.parentElement
  occlusionHost?.addEventListener('scroll', scheduleOcclusion, { capture: true, passive: true })
  measure()
  if (typeof ResizeObserver === 'function' && anchorRef.value?.parentElement) {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(anchorRef.value.parentElement)
    // The column resizes when --editorAreaWidth / editorLineWidth changes
    // without the container resizing; observe it directly so the fit gate
    // re-evaluates. Observing a display:none column is a no-op, which is
    // fine — the rail is hidden in exactly those modes anyway.
    const column = anchorRef.value.parentElement.querySelector('#ag-editor-id')
    if (column) resizeObserver.observe(column)
    if (railRef.value) resizeObserver.observe(railRef.value)
  }
  const column = occlusionHost?.querySelector('#ag-editor-id')
  if (column && typeof MutationObserver === 'function') {
    mutationObserver = new MutationObserver(scheduleOcclusion)
    mutationObserver.observe(column, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
  }
  scheduleOcclusion()
})

onBeforeUnmount(() => {
  destroyed = true
  bus.off('toc-active-heading', setActiveSlug)
  occlusionHost?.removeEventListener('scroll', scheduleOcclusion, true)
  occlusionHost = null
  if (occlusionFrame !== null) cancelAnimationFrame(occlusionFrame)
  occlusionFrame = null
  mutationObserver?.disconnect()
  mutationObserver = null
  observedTables.clear()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

// Tab switches and preference-driven column changes don't always fire a
// ResizeObserver entry (hidden → visible transitions in particular), so
// re-measure when the heading list or the column-width preference changes.
watch(
  () => [listToc.value.length, preferencesStore.editorLineWidth, props.diffMode, props.splitView, railVisible.value],
  () => {
    nextTick(() => measure())
  }
)
</script>

<style>
.outline-rail-anchor {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
}

.outline-rail {
  pointer-events: auto;
  position: absolute;
  top: 46px;
  right: 22px;
  width: 170px;
  max-height: calc(100% - 68px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
  line-height: 1.5;
  border-left: 1px solid var(--floatBorderColor, rgba(128, 128, 128, 0.2));
  padding-left: 12px;
}

.outline-rail-header {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--editorColor40, rgba(128, 128, 128, 0.6));
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Keep measurable geometry while removing hidden controls from painting,
   pointer hit testing and the accessibility/keyboard navigation surface. */
.outline-rail--occluded {
  visibility: hidden;
}

.outline-rail-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.outline-rail-item {
  all: unset;
  box-sizing: border-box;
  cursor: default;
  display: block;
  width: 100%;
  padding: 3px 0 3px var(--outline-rail-indent, 0px);
  color: var(--editorColor40, rgba(128, 128, 128, 0.6));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.outline-rail--wrap .outline-rail-item {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

.outline-rail-item:hover {
  color: var(--editorColor80, rgba(128, 128, 128, 0.85));
}

.outline-rail-item:focus-visible {
  outline: 1px solid var(--chromeAccent, #4a90d9);
  outline-offset: 1px;
}

.outline-rail-item--current,
.outline-rail-item--current:hover {
  color: var(--editorColor, #22252b);
  font-weight: 600;
  position: relative;
}

/* Marker tick on the rule line (canvas: a small square where the
   border-left meets the current item). C-38 T-006 N4 b: the active
   item's tick follows the system accent. */
.outline-rail-item--current::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 12px;
  background: var(--chromeAccent, #4a90d9);
}
</style>
