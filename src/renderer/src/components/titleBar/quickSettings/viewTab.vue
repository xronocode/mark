<template>
  <!-- START_BLOCK_VIEW_TAB -->
  <div class="quick-view-tab">
    <compound>
      <template #head>
        <h6 class="title">{{ t('quickSettings.view.themeGroup') }}</h6>
      </template>
      <template #children>
        <segmented
          :description="t('quickSettings.view.mode')"
          :help="t('quickSettings.view.modeHelp')"
          :value="themeMode"
          :options="modeOptions"
          :on-change="onThemeModeChange"
        ></segmented>
        <div
          class="quick-theme-swatches"
          role="radiogroup"
          :aria-label="t('quickSettings.view.themeGroup')"
        >
          <button
            v-for="family in familyTiles"
            :key="family.id"
            type="button"
            class="theme-family-tile"
            :class="{ 'is-selected': family.id === activeFamilyId }"
            role="radio"
            :aria-checked="family.id === activeFamilyId ? 'true' : 'false'"
            :aria-label="family.name"
            :data-family="family.id"
            @click="onSelectFamily(family)"
          >
            <span class="family-halves">
              <span class="family-half" :style="halfStyle(family.colors.light)">
                <span class="family-aa">Aa</span>
                <span class="family-accent-bar" :style="{ background: family.colors.light.accent }"></span>
              </span>
              <span class="family-half" :style="halfStyle(family.colors.dark)">
                <span class="family-aa">Aa</span>
                <span class="family-accent-bar" :style="{ background: family.colors.dark.accent }"></span>
              </span>
            </span>
            <span class="family-name">{{ family.name }}</span>
          </button>
        </div>
        <bool
          :description="t('quickSettings.view.override')"
          :help="overrideHelp"
          :bool="isPinned"
          :disable="!pathname"
          :on-change="onOverrideChange"
        ></bool>
        <div class="pref-card-note">{{ activeThemeLine }}</div>
      </template>
    </compound>
  </div>
  <!-- END_BLOCK_VIEW_TAB -->
</template>

<script setup>
// FILE: src/renderer/src/components/titleBar/quickSettings/viewTab.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-005 (M-061) the quick-settings View tab — the theme mode segmented control with the titlebar cycle semantics (Auto → followSystemTheme; Light/Dark pin the manual member), the full 17-family swatch grid whose tile colours are parsed from the shipped theme CSS through the memoized util/themeSwatchColors cache (never a second palette table), and the R-4 per-document override switch pinning this document's family + mode member against the global cycle with the active source named.
//   SCOPE: Theme mode and family picks write the SAME preference objects the titlebar cycle and the Settings Appearance tab write (followSystemTheme / theme / lightModeTheme / darkModeTheme — no second source of truth). The R-4 switch stores the pinned theme id in the document's pageWidths entry (util/pageWidthStore.js themeOverride — the field the T-001 store sanitize already carries); pinning snapshots the current effective width into the entry when none exists, because a store entry must carry a valid width; unpinning clears only the themeOverride field. While pinned, family picks update ONLY the stored override — the global preferences and the cycle are untouched (changing the global cycle on a pinned document is a no-op for this document's stored theme). Applying a pinned theme to the document surface on open/switch needs the editor host (editor.vue/app.vue) and stays with the later host wave, exactly like the width host wiring — this tab stores, names and restores the pin.
//   DEPENDS: vue, vue-i18n, pinia storeToRefs, @/store/preferences (theme / followSystemTheme / lightModeTheme / darkModeTheme), util/themeFamilies (THEME_FAMILIES, themeFamilyOf), util/themeSwatchColors (familySwatchColors — the parse cache), util/autoTheme (familyMemberForMode), util/config isDarkTheme (the titlebar's own classification), util/pageWidthStore (load/save of the document entry), the shared C-38 rows (compound/segmented/bool).
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-005, corners C-1/C-6, spec R-4/R-7); .grace/graph/performance.xml M-061; components/titleBar/index.vue START_BLOCK_THEME_CYCLE (the mode semantics this tab mirrors); prefComponents/tabs/appearance (the family-grid precedent this tab follows); components/titleBar/quickSettings/index.vue (the shell).
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   themeMode - auto | light | dark under the titlebar semantics (followSystemTheme, else the applied theme's dark classification).
//   modeOptions - the localized Auto/Light/Dark options.
//   onThemeModeChange - the titlebar cycle write path: Auto keeps followSystemTheme on; Light/Dark switch it off and pin the manual member (always persisting the member).
//   familyTiles - the 17 families with per-member swatch colours resolved once through the themeSwatchColors memoized parse (review finding F5's parse cache).
//   activeFamilyId - the family of the ACTIVE theme id: the pinned override while pinned, else the global theme.
//   onSelectFamily - unpinned: the Appearance-tab semantics (persist both members, apply the member for the current mode); pinned: update only the stored override.
//   isPinned / pinnedTheme - the document's themeOverride state (truthy non-empty string) from the loaded pageWidths entry.
//   onOverrideChange - pin: snapshot the current effective theme (and width, when the entry is new) into the document entry; unpin: clear themeOverride, keep the width.
//   overrideHelp / activeThemeLine - the scope naming: what the switch does and which family governs ("family — this file" vs "family · all documents").
//   load - per-open document entry load (the shell mounts this tab fresh on every open).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-005 (M-061):
//   new tab. The theme mode segmented control rides the exact titlebar
//   cycle semantics; the 17-family grid renders two-half tiles whose
//   colours come from the shipped theme CSS through the memoized swatch
//   parser; the R-4 switch pins the document's theme id into the
//   pageWidths entry's themeOverride field — the global cycle no longer
//   decides for a pinned document, and the card note names the governing
//   family and scope. Application of the pin to the document surface is
//   host wiring (deferred with the width host wave).
// END_CHANGE_SUMMARY

import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'
import { THEME_FAMILIES, themeFamilyOf } from '@/util/themeFamilies'
import { familySwatchColors } from '@/util/themeSwatchColors'
import { familyMemberForMode } from '@/util/autoTheme'
import { isDarkTheme } from '@/config'
import { DEFAULT_GLOBAL_WIDTH, parseWidth } from '@/util/pageWidth'
import { loadPageWidthFor, savePageWidth } from '@/util/pageWidthStore'
import Compound from '@/prefComponents/common/compound/index.vue'
import Segmented from '@/prefComponents/common/segmented/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'

const props = defineProps({
  pathname: { type: String, default: '' }
})

const { t } = useI18n()
const preferencesStore = usePreferencesStore()
const { theme, followSystemTheme, lightModeTheme, darkModeTheme, editorLineWidth } = storeToRefs(preferencesStore)

// START_BLOCK_THEME_MODE
// The titlebar cycle semantics (titleBar START_BLOCK_THEME_CYCLE /
// appearance START_BLOCK_THEME_MODE): Auto keeps followSystemTheme on
// (the app-level watcher resolves the member); Light and Dark switch it
// off and pin the manual member — always persisted, so a stale stored
// theme can never restart.
const themeMode = computed(() => {
  if (followSystemTheme.value) return 'auto'
  return isDarkTheme(theme.value) ? 'dark' : 'light'
})

const modeOptions = computed(() => [
  { label: t('quickSettings.view.modeAuto'), value: 'auto' },
  { label: t('quickSettings.view.modeLight'), value: 'light' },
  { label: t('quickSettings.view.modeDark'), value: 'dark' }
])

const onThemeModeChange = (mode) => {
  if (mode === 'auto') {
    if (!followSystemTheme.value) {
      preferencesStore.SET_SINGLE_PREFERENCE({ type: 'followSystemTheme', value: true })
    }
    return
  }
  if (followSystemTheme.value) {
    preferencesStore.SET_SINGLE_PREFERENCE({ type: 'followSystemTheme', value: false })
  }
  const member = mode === 'light' ? lightModeTheme.value : darkModeTheme.value
  if (member) {
    preferencesStore.SET_SINGLE_PREFERENCE({ type: 'theme', value: member })
  }
}
// END_BLOCK_THEME_MODE

// START_BLOCK_FAMILY_TILES
// One tile per family; each half paints the member's real colours from
// its theme CSS variables. familySwatchColors memoizes per theme id, so
// the first open parses each shipped theme exactly once per session
// (review finding F5's parse-cache disposition).
const familyTiles = THEME_FAMILIES.map((family) => ({
  id: family.id,
  name: family.name,
  light: family.light,
  dark: family.dark,
  colors: familySwatchColors(family)
}))

const halfStyle = (colors) => ({
  background: colors.bg,
  color: colors.fg
})
// END_BLOCK_FAMILY_TILES

// START_BLOCK_OVERRIDE_STATE
// R-4: the per-document theme pin lives in the document's pageWidths
// entry (themeOverride — carried by the T-001 store sanitize). A store
// entry must always carry a valid width, so pinning on a document
// without one snapshots the current effective width (the global tier's
// answer) alongside the theme id.
const loadedEntry = ref(null)

const isPinned = computed(() => !!(loadedEntry.value && loadedEntry.value.themeOverride))

const activeThemeId = computed(() => {
  if (isPinned.value) return loadedEntry.value.themeOverride
  return theme.value
})

const activeFamilyId = computed(() => {
  const family = themeFamilyOf(activeThemeId.value)
  return family ? family.id : null
})

const activeFamilyName = computed(() => {
  const family = themeFamilyOf(activeThemeId.value)
  return family ? family.name : ''
})

const overrideHelp = computed(() => {
  if (!props.pathname) return t('quickSettings.view.overrideHelpUntitled')
  return isPinned.value
    ? t('quickSettings.view.overrideHelpOn')
    : t('quickSettings.view.overrideHelpOff')
})

// The source naming (R-2/R-4): the governing family and its scope.
const activeThemeLine = computed(() =>
  isPinned.value
    ? t('quickSettings.view.sourcePinned', { family: activeFamilyName.value })
    : t('quickSettings.view.sourceGlobal', { family: activeFamilyName.value })
)

const saveEntry = async (entry) => {
  if (!props.pathname) return
  await savePageWidth(props.pathname, entry)
  loadedEntry.value = entry
    ? { ...entry, savedAt: loadedEntry.value ? loadedEntry.value.savedAt : 0 }
    : null
}

const onOverrideChange = (on) => {
  if (!props.pathname) return
  if (on) {
    // A store entry must carry a valid width: snapshot the current
    // effective width (the document entry, else the global tier's
    // answer, else the shipped default) alongside the theme id.
    const base = loadedEntry.value
      ? { value: loadedEntry.value.value, unit: loadedEntry.value.unit }
      : parseWidth(editorLineWidth.value) || DEFAULT_GLOBAL_WIDTH
    saveEntry({ value: base.value, unit: base.unit, themeOverride: theme.value })
  } else {
    if (!loadedEntry.value) return
    saveEntry({ value: loadedEntry.value.value, unit: loadedEntry.value.unit, themeOverride: null })
  }
}
// END_BLOCK_OVERRIDE_STATE

// START_BLOCK_FAMILY_PICK
// Unpinned: the Appearance-tab semantics — persist BOTH members before
// `theme` (the full-snapshot echo and the Auto watcher resolve against
// the new family), applying the member for the CURRENT mode. Pinned:
// only the stored override moves — the global cycle and preferences are
// untouched (corner C-6: a pinned document ignores the global cycle).
const onSelectFamily = (family) => {
  if (isPinned.value) {
    const mode = themeMode.value
    saveEntry({
      value: loadedEntry.value.value,
      unit: loadedEntry.value.unit,
      themeOverride: familyMemberForMode(family, mode)
    })
    return
  }
  const mode = themeMode.value
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'lightModeTheme', value: family.light })
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'darkModeTheme', value: family.dark })
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'theme', value: familyMemberForMode(family, mode) })
}
// END_BLOCK_FAMILY_PICK

const load = async () => {
  loadedEntry.value = props.pathname ? await loadPageWidthFor(props.pathname) : null
}

onMounted(() => {
  load()
})
</script>

<style>
/* START_BLOCK_VIEW_TAB_SWATCHES */
/* The family grid, VERBATIM compressed panel metrics from the approved
   v9 mock (.prefwin .pref-theme-swatches — 8 columns, 34px halves, the
   declared panel-side tile metric compression; selection ring identical
   to the Appearance tab). Colours come from the shipped theme CSS via
   util/themeSwatchColors — never a second palette table. */
.quick-view-tab .pref-card-note {
  font-size: 11px;
  line-height: 1.4;
  color: var(--prefSub, #6b6b70);
  padding: 7px 14px 8px;
}

.quick-view-tab .quick-theme-swatches {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 10px 8px;
  width: 100%;
  padding: 10px 12px 12px;
  box-sizing: border-box;
}

.quick-view-tab .theme-family-tile {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  min-width: 0;
}

.quick-view-tab .theme-family-tile .family-halves {
  display: flex;
  width: 100%;
  height: 34px;
  border-radius: 7px;
  overflow: hidden;
  box-shadow: 0 0 0 0.5px var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
}

.quick-view-tab .theme-family-tile.is-selected .family-halves {
  box-shadow:
    0 0 0 2.5px var(--prefAccent, #007aff),
    0 0 0 4.5px var(--prefGroup, #ffffff);
}

.quick-view-tab .theme-family-tile .family-half {
  width: 50%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.quick-view-tab .theme-family-tile .family-aa {
  font: 600 11px Georgia, serif;
}

.quick-view-tab .theme-family-tile .family-accent-bar {
  width: 12px;
  height: 3px;
  border-radius: 2px;
}

.quick-view-tab .theme-family-tile .family-name {
  font-size: 10px;
  color: var(--prefSub, #6b6b70);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.quick-view-tab .theme-family-tile.is-selected .family-name {
  color: var(--prefText, #1d1d1f);
  font-weight: 600;
}
/* END_BLOCK_VIEW_TAB_SWATCHES */
</style>
