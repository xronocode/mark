<template>
  <!-- START_BLOCK_PAGE_TAB -->
  <div class="quick-page-tab">
    <compound>
      <template #head>
        <h6 class="title">{{ t('quickSettings.page.widthGroup') }}</h6>
      </template>
      <template #children>
        <segmented
          :description="t('quickSettings.page.preset')"
          :help="activeSourceLabel"
          :value="presetValue"
          :options="presetOptions"
          :marked-value="markedPreset"
          :on-change="onPresetPick"
        ></segmented>
        <range
          :description="t('quickSettings.page.width')"
          :help="widthHelp"
          :value="value"
          :min="unitBounds[0]"
          :max="unitBounds[1]"
          :step="1"
          :unit="isFull ? '' : unit"
          :display-text="isFull ? t('quickSettings.page.fullWindow') : ''"
          :disable="isFull"
          :on-change="onStepperChange"
        ></range>
        <segmented
          :description="t('quickSettings.page.unit')"
          :help="t('quickSettings.page.unitHelp')"
          :value="unit"
          :options="unitOptions"
          :on-change="onUnitChange"
        ></segmented>
        <div class="pref-card-note">{{ t('quickSettings.page.exportNote') }}</div>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('quickSettings.page.textGroup') }}</h6>
      </template>
      <template #children>
        <range
          :description="t('quickSettings.page.fontSize')"
          :help="t('quickSettings.page.fontSizeHelp')"
          :value="fontSize"
          :min="12"
          :max="36"
          :step="1"
          unit="px"
          :on-change="onFontSizeChange"
        ></range>
        <range
          :description="t('quickSettings.page.lineHeight')"
          :help="t('quickSettings.page.lineHeightHelp')"
          :value="lineHeight"
          :min="1.2"
          :max="2.0"
          :step="0.1"
          :on-change="onLineHeightChange"
        ></range>
        <bool
          :description="t('quickSettings.page.scope')"
          :help="scopeHelp"
          :bool="scopeGlobal"
          :disable="!pathname"
          :on-change="onScopeChange"
        ></bool>
      </template>
    </compound>

    <div class="pref-foot">
      <button type="button" class="linkish" @click.stop="onReset">
        {{ t('quickSettings.page.reset') }}
      </button>
      <span class="cap">{{ t('quickSettings.page.usualWidth', { width: usualWidthLabel }) }}</span>
    </div>
  </div>
  <!-- END_BLOCK_PAGE_TAB -->
</template>

<script setup>
// FILE: src/renderer/src/components/titleBar/quickSettings/pageTab.vue
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-004 (M-061) the quick-settings Page tab — the document typography triple (width / font size / line height) built from the shared C-38 rows: per-unit presets plus Full window, a bounds-respecting stepper whose unit switch converts with the 10% preset snap and the nearest-preset anchor mark, the single 12-36 font range shared with zoom, line height 1.2-2.0 step 0.1, the "For all documents" scope switch writing the global vs per-document tier, and the footer naming the live global default.
//   SCOPE: Width state machine for the active document. Full window is the R-3 canvas-model sentinel ({ value: 100, unit: '%' } — util/pageWidth.js FULL_WINDOW_WIDTH): the column spans the canvas and follows the sidebar live, and both persistence grammars hold it without a fourth unit. Global-tier writes hand the CSS variable back to the legacy writer (clearAppliedEditorWidth + the editorLineWidth preference the shipped watcher applies); document-tier writes go through the per-document store (util/pageWidthStore.js) and the resolution pipeline (resolveEffectiveWidth → applyEditorWidth — the clamp never mutates the stored value, corner C-2). While the panel is open, a canvas change (window resize, sidebar show/hide/drag) re-applies the pipeline value so % columns follow live (corner C-3) — never a content re-render. The untitled scope is forced global with the panel naming it (review finding F4). Host wiring (applying the stored width on document open/switch and the rename move) stays with the later host wave — the plan's ObservedWriteScope has no editor.vue/editor.js.
//   DEPENDS: vue, vue-i18n, pinia storeToRefs, @/bus (the mt::document-page-state-changed announcement the editor host re-reads the entry on), @/store/preferences (editorLineWidth / fontSize / lineHeight, SET_SINGLE_PREFERENCE, APPLY_FONT_SIZE — the C-49 zoom-shared 12-36 path), @/store/layout (sidebar visibility/width for the canvas), util/pageWidth.js (pure pipeline + writers), util/pageWidthStore.js (load/save), the shared C-38 rows (compound/segmented/range/bool).
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-004, corners C-1/C-2/C-3/C-5); .grace/graph/performance.xml M-061; util/pageWidth.js; util/pageWidthStore.js; components/titleBar/quickSettings/index.vue (the shell); the approved mock (approved.html Page tab, panel-layer.final.js presets).
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   unit/value - the width being edited (unit one of ch/px/%; value within the unit bounds; the Full window state is unit='%' value=100).
//   loadedEntry - the active document's stored pageWidths entry (null for untitled/absent).
//   scopeAll - the "For all documents" switch; scopeGlobal is the effective state (untitled documents are always global, F4).
//   windowWidth - the live window width (resize listener) feeding the canvas arithmetic.
//   canvasWidth - canvas = window − sidebar (computeCanvasWidth over the layout store).
//   presetOptions/presetValue/markedPreset - the preset segmented row: the unit's presets plus Full window; no active segment for a custom value; the nearest preset carries the is-near anchor (markedPreset).
//   unitBounds - UNIT_BOUNDS of the current unit (the stepper's min/max).
//   widthHelp - the px equivalence for ch, the fixed/adaptive notes for px/%, the no-limit note for Full.
//   activeSourceLabel - the named active tier (R-2): this document vs all documents.
//   usualWidthLabel - the live global default for the footer (parseWidth of editorLineWidth, else DEFAULT_GLOBAL_WIDTH — never a hardcoded 750/768).
//   onPresetPick/onStepperChange/onUnitChange - width edits: preset pick, bounds-respecting step, unit conversion with the 10% snap (convertWidth).
//   onScopeChange - global tier: clearAppliedEditorWidth + the editorLineWidth preference (+ the per-document entry removed); document tier: savePageWidth + applyPipeline.
//   onFontSizeChange/onLineHeightChange - the global typography rows (APPLY_FONT_SIZE — the zoom-shared action; SET_SINGLE_PREFERENCE lineHeight).
//   onReset - global scope → editorLineWidth '' (the honest theme-default resolution); document scope → the per-document entry removed and the pipeline value cleared.
//   persistAndApply - the write path (tier choice + store/prefs writes + pipeline apply + the host announcement).
//   announcePageStateChange - the mt::document-page-state-changed bus emit the editor host re-reads the entry on.
//   applyPipeline - resolveEffectiveWidth over the canvas + applyEditorWidth (one inline custom property, never a content re-render).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-11-03 C-PAGE-WIDTH-TABLES host wiring
//   wave: the write paths (persistAndApply, onReset) announce the saved
//   document tier on the renderer bus (mt::document-page-state-changed)
//   so the editor host re-reads the entry and its cached state never goes
//   stale behind a panel write. The write semantics are unchanged.
//   PREV: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-004 (M-061):
//   new tab. Per-unit presets (ch 60/80/110 · px 600/750/900 · % 60/80/100)
//   plus Full window ({100,'%'}), the unit switch converting with the 10%
//   preset snap and marking the nearest preset, the 12-36 font range
//   through APPLY_FONT_SIZE (the zoom-shared action), line height
//   1.2-2.0 step 0.1, the scope switch writing global vs per-document
//   (untitled forced global and named as such), and the footer carrying
//   the live global default. Opening the tab makes a stored per-document
//   width live through the pipeline; the clamp path never writes the
//   store (C-2) and canvas changes re-apply one custom property (C-3).
// END_CHANGE_SUMMARY

import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import bus from '@/bus'
import { usePreferencesStore } from '@/store/preferences'
import { useLayoutStore } from '@/store/layout'
import {
  UNIT_PRESETS,
  UNIT_BOUNDS,
  DEFAULT_GLOBAL_WIDTH,
  FULL_WINDOW_WIDTH,
  CH_TO_PX,
  parseWidth,
  resolveWidth,
  resolveEffectiveWidth,
  applyEditorWidth,
  clearAppliedEditorWidth,
  convertWidth,
  nearestPreset,
  isPresetValue,
  clampUnitValue,
  computeCanvasWidth,
  isFullWindowWidth
} from '@/util/pageWidth'
import { loadPageWidthFor, savePageWidth } from '@/util/pageWidthStore'
import Compound from '@/prefComponents/common/compound/index.vue'
import Segmented from '@/prefComponents/common/segmented/index.vue'
import Range from '@/prefComponents/common/range/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'

const props = defineProps({
  pathname: { type: String, default: '' }
})

const { t } = useI18n()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const { editorLineWidth, fontSize, lineHeight } = storeToRefs(preferencesStore)
const { showSideBar, sideBarWidth } = storeToRefs(layoutStore)

// START_BLOCK_WIDTH_STATE
const unit = ref('px')
const value = ref(DEFAULT_GLOBAL_WIDTH.value)
const loadedEntry = ref(null)
const scopeAll = ref(false)
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)

const onWindowResize = () => {
  windowWidth.value = window.innerWidth
}

const canvasWidth = computed(() =>
  computeCanvasWidth(windowWidth.value, {
    sidebarVisible: showSideBar.value,
    sidebarWidth: sideBarWidth.value
  })
)

const isFull = computed(() => unit.value === FULL_WINDOW_WIDTH.unit && value.value === FULL_WINDOW_WIDTH.value)

const unitBounds = computed(() => UNIT_BOUNDS[unit.value] || UNIT_BOUNDS.px)

const globalWidth = computed(() => parseWidth(editorLineWidth.value) || DEFAULT_GLOBAL_WIDTH)

// Untitled documents are always the global tier (review finding F4) and
// the switch names that scope instead of silently ignoring the pick.
const scopeGlobal = computed(() => scopeAll.value || !props.pathname)

const scopeHelp = computed(() => {
  if (!props.pathname) return t('quickSettings.page.scopeHelpUntitled')
  return scopeAll.value
    ? t('quickSettings.page.scopeHelpOn')
    : t('quickSettings.page.scopeHelpOff')
})
// END_BLOCK_WIDTH_STATE

// START_BLOCK_WIDTH_ROWS
const presetOptions = computed(() => {
  const labels = UNIT_PRESETS[unit.value] || UNIT_PRESETS.px
  const options = labels.map((preset) => ({
    value: preset,
    label: unit.value === '%' ? `${preset}%` : String(preset)
  }))
  options.push({ value: 'full', label: t('quickSettings.page.fullWindow') })
  return options
})

const presetValue = computed(() => {
  if (isFull.value) return 'full'
  return isPresetValue(unit.value, value.value) ? value.value : null
})

// The nearest-preset anchor (R-6): a non-preset value always carries a
// visual anchor on the closest preset of its unit.
const markedPreset = computed(() => {
  if (isFull.value || presetValue.value !== null) return undefined
  return nearestPreset(unit.value, value.value)
})

const widthHelp = computed(() => {
  if (isFull.value) return t('quickSettings.page.widthHelpFull')
  if (unit.value === 'ch') {
    return t('quickSettings.page.widthHelpCh', { px: Math.round(value.value * CH_TO_PX) })
  }
  if (unit.value === '%') return t('quickSettings.page.widthHelpPercent')
  return t('quickSettings.page.widthHelpPx')
})

const unitOptions = [
  { value: 'ch', label: 'ch' },
  { value: 'px', label: 'px' },
  { value: '%', label: '%' }
]

// R-2: the panel names the active tier. No shipped theme carries a
// non-default width in this change (C-50 territory, frozen), so the
// theme tier is represented by the global default here; the pipeline
// still resolves document > theme > global when one ever ships.
const activeSource = computed(() =>
  resolveWidth({
    document: loadedEntry.value && !scopeGlobal.value ? loadedEntry.value : null,
    theme: null,
    global: parseWidth(editorLineWidth.value)
  }).source
)

const activeSourceLabel = computed(() =>
  activeSource.value === 'document'
    ? t('quickSettings.page.sourceDocument')
    : t('quickSettings.page.sourceGlobal')
)

const usualWidthLabel = computed(() => `${globalWidth.value.value} ${globalWidth.value.unit}`)
// END_BLOCK_WIDTH_ROWS

// START_BLOCK_WIDTH_ACTIONS
const applyPipeline = () => {
  const effective = resolveEffectiveWidth(
    {
      document: { value: value.value, unit: unit.value },
      theme: null,
      global: parseWidth(editorLineWidth.value)
    },
    canvasWidth.value
  )
  if (effective) applyEditorWidth(effective)
}

// The write path: the scope switch picks the tier. Global writes hand
// the CSS variable back to the legacy writer (theme.js setEditorWidth
// via the shipped editorLineWidth watcher) — exactly one owner. Document
// writes persist the raw setting (the clamp never writes back, C-2) and
// apply the render-time projection.
const persistAndApply = async () => {
  const width = { value: value.value, unit: unit.value }
  if (scopeGlobal.value) {
    clearAppliedEditorWidth()
    if (props.pathname) await savePageWidth(props.pathname, null)
    await preferencesStore.SET_SINGLE_PREFERENCE({
      type: 'editorLineWidth',
      value: `${width.value}${width.unit}`
    })
  } else {
    await savePageWidth(props.pathname, width)
    loadedEntry.value = { ...(loadedEntry.value || {}), ...width }
    applyPipeline()
  }
  announcePageStateChange()
}

// The editor host re-reads the entry (editor.vue applyHostPageState) so
// its cached document tier never goes stale behind a panel write.
const announcePageStateChange = () => {
  if (!props.pathname) return
  bus.emit('mt::document-page-state-changed', { pathname: props.pathname })
}

const onPresetPick = (picked) => {
  if (picked === 'full') {
    unit.value = FULL_WINDOW_WIDTH.unit
    value.value = FULL_WINDOW_WIDTH.value
  } else {
    value.value = clampUnitValue(unit.value, picked)
  }
  persistAndApply()
}

const onStepperChange = (next) => {
  value.value = clampUnitValue(unit.value, next)
  persistAndApply()
}

// Unit switch: convert the current value, snapping to a preset within
// 10% (80 ch → 750 px → 80% on the reference canvas). Leaving the Full
// window sentinel converts its 100% into the picked unit.
const onUnitChange = (nextUnit) => {
  if (nextUnit === unit.value) return
  const converted = convertWidth(value.value, unit.value, nextUnit, canvasWidth.value)
  unit.value = nextUnit
  value.value = clampUnitValue(
    nextUnit,
    converted ? converted.value : value.value
  )
  persistAndApply()
}

const onScopeChange = (on) => {
  scopeAll.value = !!on
  persistAndApply()
}

const onFontSizeChange = (next) => {
  // The single 12-36 range shared with zoom: APPLY_FONT_SIZE is the
  // C-49 action the ⌘+/⌘− steps and ⌘0 "Actual Size" ride.
  preferencesStore.APPLY_FONT_SIZE(next)
}

const onLineHeightChange = (next) => {
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'lineHeight', value: next })
}

const onReset = async () => {
  if (scopeGlobal.value) {
    // Global reset = the honest theme-default resolution (empty
    // resolves through the theme/global tiers, R-12b).
    clearAppliedEditorWidth()
    await preferencesStore.SET_SINGLE_PREFERENCE({ type: 'editorLineWidth', value: '' })
    unit.value = DEFAULT_GLOBAL_WIDTH.unit
    value.value = DEFAULT_GLOBAL_WIDTH.value
    announcePageStateChange()
    return
  }
  await savePageWidth(props.pathname, null)
  loadedEntry.value = null
  clearAppliedEditorWidth()
  announcePageStateChange()
}
// END_BLOCK_WIDTH_ACTIONS

// START_BLOCK_WIDTH_LOAD
// Each open mounts this tab fresh: load the document tier, seed the
// editing state from the widest active tier (document entry, else the
// global setting, else the shipped default), and make a stored
// per-document width live (the panel is the pipeline's apply path until
// the host wave wires document open/switch).
const load = async () => {
  loadedEntry.value = props.pathname ? await loadPageWidthFor(props.pathname) : null
  const seeded = loadedEntry.value
    ? { value: loadedEntry.value.value, unit: loadedEntry.value.unit }
    : globalWidth.value
  if (isFullWindowWidth(seeded)) {
    unit.value = FULL_WINDOW_WIDTH.unit
    value.value = FULL_WINDOW_WIDTH.value
  } else {
    unit.value = seeded.unit
    value.value = seeded.value
  }
  if (loadedEntry.value && !scopeGlobal.value) applyPipeline()
}

// Corner C-3 while the panel is open: a canvas change re-applies the
// pipeline value — one custom-property write, never a content re-render.
watch([windowWidth, showSideBar, sideBarWidth], () => {
  if (!scopeGlobal.value && loadedEntry.value) applyPipeline()
})

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
  load()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
})
// END_BLOCK_WIDTH_LOAD
</script>

<style>
/* START_BLOCK_PAGE_TAB_FOOT */
/* The footer row and the in-card note, verbatim from the approved mock
   (approved.css .pref-foot / .pref-card-note — the shell's row anatomy
   already applies here). */
.quick-page-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-page-tab .pref-card-note {
  font-size: 11px;
  line-height: 1.4;
  color: var(--prefSub, #6b6b70);
  padding: 7px 14px 8px;
}

.quick-page-tab .pref-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 20px 4px;
}

.quick-page-tab .linkish {
  font-size: 12px;
  color: var(--prefAccent, #007aff);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
}

.quick-page-tab .linkish:hover {
  text-decoration: underline;
}

.quick-page-tab .cap {
  font-size: 11px;
  color: var(--prefSub, #6b6b70);
}
/* END_BLOCK_PAGE_TAB_FOOT */
</style>
