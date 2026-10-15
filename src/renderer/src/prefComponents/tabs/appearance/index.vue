<template>
  <div class="pref-tab-page pref-tab-page--appearance">
    <!-- START_BLOCK_APPEARANCE_THEME -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.appearance.theme.title') }}</h6>
      </template>
      <template #children>
        <segmented
          :description="t('preferences.appearance.theme.mode')"
          :help="t('preferences.appearance.theme.modeHelp')"
          :value="themeMode"
          :options="themeModeOptions"
          :on-change="onThemeModeChange"
        ></segmented>
        <div class="pref-theme-swatches" role="radiogroup" :aria-label="t('preferences.appearance.theme.title')">
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
      </template>
    </compound>
    <!-- END_BLOCK_APPEARANCE_THEME -->

    <!-- START_BLOCK_APPEARANCE_TEXT -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.appearance.text.title') }}</h6>
      </template>
      <template #children>
        <font-text-box
          :description="t('preferences.appearance.text.font')"
          :value="editorFontFamily"
          :on-change="(value) => onSelectChange('editorFontFamily', value)"
        ></font-text-box>
        <range
          :description="t('preferences.appearance.text.fontSize')"
          :value="fontSize"
          :min="12"
          :max="32"
          :step="1"
          unit="px"
          :on-change="(value) => onSelectChange('fontSize', value)"
        ></range>
        <range
          :description="t('preferences.appearance.text.lineHeight')"
          :value="lineHeight"
          :min="1.2"
          :max="2.0"
          :step="0.1"
          :on-change="(value) => onSelectChange('lineHeight', value)"
        ></range>
        <text-box
          :description="t('preferences.appearance.text.lineWidth')"
          :help="t('preferences.appearance.text.lineWidthHelp')"
          :input="editorLineWidth"
          :default-value="t('preferences.appearance.text.unlimited')"
          :regex-validator="/^(?:$|[0-9]+(?:ch|px|%)$)/"
          :on-change="(value) => onSelectChange('editorLineWidth', value)"
        ></text-box>
      </template>
    </compound>
    <!-- END_BLOCK_APPEARANCE_TEXT -->

    <!-- START_BLOCK_APPEARANCE_WINDOW -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.appearance.window.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.appearance.window.hideScrollbar')"
          :bool="hideScrollbar"
          :on-change="(value) => onSelectChange('hideScrollbar', value)"
        ></bool>
        <bool
          :description="t('preferences.appearance.window.wordWrapInToc')"
          :bool="wordWrapInToc"
          :on-change="(value) => onSelectChange('wordWrapInToc', value)"
        ></bool>
        <!-- C-40 T-004: optional status bar (lines · words · characters ·
             reading time, selection-aware; default off on macOS). -->
        <bool
          :description="t('preferences.appearance.window.statusBar')"
          :help="t('preferences.appearance.window.statusBarHelp')"
          :bool="statusBarVisibility"
          :on-change="(value) => onSelectChange('statusBarVisibility', value)"
        ></bool>
        <cur-select
          v-if="!isOsx"
          :description="t('preferences.appearance.window.titleBarStyle')"
          :help="t('preferences.appearance.window.titleBarStyleHelp')"
          :value="titleBarStyle"
          :options="getTitleBarStyleOptions()"
          :on-change="(value) => onSelectChange('titleBarStyle', value)"
        ></cur-select>
      </template>
    </compound>
    <!-- END_BLOCK_APPEARANCE_WINDOW -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/appearance/index.vue
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Appearance tab of the C-38 Settings window — Theme group (Auto/Light/Dark segmented control + the compact 7-per-row family swatch grid), Text group (font, size, line spacing, writing-area width) and Window-and-panels group per the N2 IA §3.2 and the approved mockup.
//   SCOPE: Row composition; title-bar-identical theme mode semantics; family picking that sets both mode members; swatch colours read from the shipped theme CSS variables.
//   DEPENDS: prefComponents/common/{compound,bool,select,range,textBox,fontTextBox,segmented}, store/preferences, util/themeFamilies, util/autoTheme, util/themeSwatchColors, util (isOsx), i18n.
//   LINKS: .grace/changes/active/C-38 T-004; docs/design/settings-ia-2026-10-15.md §3.2; components/titleBar START_BLOCK_THEME_CYCLE (same mode semantics); .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   onSelectChange - SET_SINGLE_PREFERENCE bridge shared by every row.
//   themeMode / onThemeModeChange - Auto = followSystemTheme (the shell's Auto watcher resolves); Light/Dark pin the manual member — exactly the titleBar cycle semantics, driven by a segmented control.
//   familyTiles - the 14 families with swatch colours resolved from each member's theme CSS (util/themeSwatchColors — no second palette table).
//   activeFamilyId - the family owning the currently applied theme.
//   onSelectFamily - C-41 T-002 family pick: persist both members, apply the member for the current mode, never leave Auto.
//   halfStyle - inline background/colour for a tile half.
//   getTitleBarStyleOptions - Custom/System pop-up (shown on Windows and Linux only per IA §5 bug 10).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.1.0: C-40 T-004 — the Window-and-panels group gains
//     the status-bar switch (statusBarVisibility; default off on macOS,
//     on elsewhere — resolved per OS by the preferences store).
//   - 2026-10-15 v2.0.0: C-38 T-004 — real Appearance tab: the Lorem-preview cards and the followSystemTheme bool + mode selects are replaced by the mockup segmented control and compact family tiles (colours parsed from the theme CSS variables); text typography rows move in from the old Editor page; titleBarStyle shows on Windows and Linux; the zoom row is not resurrected (C-49 retired the percentage zoom — Text size is the zoom).
//   - (v1.x: C-38 T-003 interim wrapper stacking the old Theme page — retired.)
// END_CHANGE_SUMMARY

import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '@/prefComponents/common/compound/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'
import CurSelect from '@/prefComponents/common/select/index.vue'
import Range from '@/prefComponents/common/range/index.vue'
import TextBox from '@/prefComponents/common/textBox/index.vue'
import FontTextBox from '@/prefComponents/common/fontTextBox/index.vue'
import Segmented from '@/prefComponents/common/segmented/index.vue'
import { THEME_FAMILIES, themeFamilyOf } from '@/util/themeFamilies'
import { familyMemberForMode } from '@/util/autoTheme'
import { familySwatchColors } from '@/util/themeSwatchColors'
import { isOsx } from '@/util'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  theme,
  followSystemTheme,
  lightModeTheme,
  darkModeTheme,
  editorFontFamily,
  fontSize,
  lineHeight,
  editorLineWidth,
  hideScrollbar,
  wordWrapInToc,
  statusBarVisibility,
  titleBarStyle
} = storeToRefs(preferenceStore)

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

// START_BLOCK_THEME_MODE
// Same semantics as the titleBar theme cycle (C-41 T-001): Auto keeps
// followSystemTheme on (the preference.vue START_BLOCK_APPLY_AUTO_THEME
// watcher resolves the member for the current OS appearance); Light and
// Dark switch followSystemTheme off and pin the manual member.
const themeMode = computed(() => {
  if (followSystemTheme.value) return 'auto'
  const family = themeFamilyOf(theme.value)
  return family && family.dark === theme.value ? 'dark' : 'light'
})

// Computed: labels must follow a language switch (review fix).
const themeModeOptions = computed(() => [
  { label: t('preferences.appearance.theme.modeAuto'), value: 'auto' },
  { label: t('preferences.appearance.theme.modeLight'), value: 'light' },
  { label: t('preferences.appearance.theme.modeDark'), value: 'dark' }
])

const onThemeModeChange = (mode) => {
  if (mode === 'auto') {
    if (!followSystemTheme.value) {
      onSelectChange('followSystemTheme', true)
    }
    return
  }
  if (followSystemTheme.value) {
    onSelectChange('followSystemTheme', false)
  }
  const member = mode === 'light' ? lightModeTheme.value : darkModeTheme.value
  // Always persist: under Auto the in-memory theme is resolved, while the
  // stored one may be stale — skipping an "unchanged" member would restart
  // into that stale theme (review fix).
  if (member) {
    onSelectChange('theme', member)
  }
}
// END_BLOCK_THEME_MODE

// START_BLOCK_FAMILY_TILES
// One tile per family; each half paints the member's real colours from
// its theme CSS variables (--editorBgColor/--editorColor/--themeColor).
const familyTiles = THEME_FAMILIES.map((family) => ({
  id: family.id,
  name: family.name,
  light: family.light,
  dark: family.dark,
  colors: familySwatchColors(family)
}))

const activeFamilyId = computed(() => {
  const family = themeFamilyOf(theme.value)
  return family ? family.id : null
})

const halfStyle = (colors) => ({
  background: colors.bg,
  color: colors.fg
})

// C-41 T-002 family pick: persist BOTH members before `theme` (the
// SET_USER_PREFERENCE full-snapshot echo and the Auto watcher resolve
// against the new family) and apply the member for the current mode —
// Auto keeps switching within the chosen family.
const onSelectFamily = (family) => {
  // The CURRENT mode (themeMode looks at the applied theme's own family),
  // not the picked family — review fix: a manual Dark user picking a new
  // family was switched to its light member.
  const mode = themeMode.value
  onSelectChange('lightModeTheme', family.light)
  onSelectChange('darkModeTheme', family.dark)
  onSelectChange('theme', familyMemberForMode(family, mode))
}
// END_BLOCK_FAMILY_TILES

const getTitleBarStyleOptions = () => [{
  label: t('preferences.appearance.window.titleBarStyleCustom'),
  value: 'custom'
}, {
  label: t('preferences.appearance.window.titleBarStyleNative'),
  value: 'native'
}]
</script>

<style>
/* START_BLOCK_SWATCH_GRID_METRICS */
/* Mockup family tiles: a 7-column grid (14 families → 2 rows), each tile
   a 46px light|dark pair showing "Aa" in the member's text colour with a
   small accent bar, family name below; the selected tile carries a
   2.5px accent ring with a group-coloured gap. */
.pref-tab-page--appearance .pref-theme-swatches {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 12px 10px;
  width: 100%;
  padding: 14px;
  box-sizing: border-box;
}

.pref-tab-page--appearance .theme-family-tile {
  all: unset;
  cursor: default;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
}

.pref-tab-page--appearance .theme-family-tile .family-halves {
  display: flex;
  width: 100%;
  height: 46px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 0 0.5px var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
}

.pref-tab-page--appearance .theme-family-tile.is-selected .family-halves {
  box-shadow:
    0 0 0 2.5px var(--prefAccent, #007aff),
    0 0 0 4.5px var(--prefGroup, #ffffff);
}

.pref-tab-page--appearance .theme-family-tile .family-half {
  width: 50%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.pref-tab-page--appearance .theme-family-tile .family-aa {
  font: 600 12px Georgia, serif;
}

.pref-tab-page--appearance .theme-family-tile .family-accent-bar {
  width: 14px;
  height: 3px;
  border-radius: 2px;
}

.pref-tab-page--appearance .theme-family-tile .family-name {
  font-size: 11px;
  color: var(--prefSub, #6b6b70);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.pref-tab-page--appearance .theme-family-tile.is-selected .family-name {
  color: var(--prefText, #1d1d1f);
  font-weight: 600;
}
/* END_BLOCK_SWATCH_GRID_METRICS */
</style>
