<template>
  <!-- START_BLOCK_TABLES_TAB -->
  <div class="quick-tables-tab">
    <compound>
      <template #head>
        <h6 class="title">{{ t('quickSettings.tables.group') }}</h6>
      </template>
      <template #children>
        <segmented
          :description="t('quickSettings.tables.defaultMode')"
          :help="t('quickSettings.tables.defaultModeHelp')"
          :value="defaultMode"
          :options="modeOptions"
          :on-change="onDefaultModeChange"
        ></segmented>
        <bool
          :description="t('quickSettings.tables.rememberSizes')"
          :help="t('quickSettings.tables.rememberSizesHelp')"
          :bool="rememberTableColumnSizes"
          :on-change="onRememberSizesChange"
        ></bool>
      </template>
    </compound>
  </div>
  <!-- END_BLOCK_TABLES_TAB -->
</template>

<script setup>
// FILE: src/renderer/src/components/titleBar/quickSettings/tablesTab.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-006 (M-061) the quick-settings Tables tab — the default table mode (Auto default, Fit, Full) carried by the existing muya option name tableFullWidthDefault, and the "Remember column sizes" switch; both rows write the same preference objects the rest of the app reads — no second source of truth.
//   SCOPE: The two rows are plain SET_SINGLE_PREFERENCE writes over the two store keys this tab owns in store/preferences.js (tableFullWidthDefault: 'auto' | 'fit' | 'full'; rememberTableColumnSizes: boolean). The muya option consumption and the honest three-mode behaviour land with plan T-007 (src/muya is not in this wave) — this tab ships the missing UI surface over the preference the muya option already names, so T-007 consumes the stored value instead of inventing another. User-facing copy says "column sizes", never "column widths" (owner terminology correction, R-12c).
//   DEPENDS: vue, vue-i18n, @/store/preferences (SET_SINGLE_PREFERENCE), the shared C-38 rows (compound/segmented/bool).
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-006, spec R-7/R-12c); .grace/graph/performance.xml M-061; src/muya/lib/config/index.js tableFullWidthDefault (the option this preference feeds from T-007); components/titleBar/quickSettings/index.vue (the shell).
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   defaultMode - the stored tableFullWidthDefault preference ('auto' | 'fit' | 'full'; 'auto' default per owner gate №5).
//   modeOptions - the localized Auto/Fit/Full options.
//   onDefaultModeChange - SET_SINGLE_PREFERENCE over tableFullWidthDefault.
//   rememberSizes - the stored rememberTableColumnSizes preference (default true — today's C-65 behaviour).
//   onRememberSizesChange - SET_SINGLE_PREFERENCE over rememberTableColumnSizes.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-006 (M-061):
//   new tab. Two rows, two plain preference writes: the default table
//   mode under the existing muya option name tableFullWidthDefault
//   (tri-state auto/fit/full, auto default per owner gate №5 — muya
//   consumes it from T-007) and the "Remember column sizes" switch
//   (rememberTableColumnSizes, default true, the C-65 behaviour today).
// END_CHANGE_SUMMARY

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '@/prefComponents/common/compound/index.vue'
import Segmented from '@/prefComponents/common/segmented/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'

const { t } = useI18n()
const preferencesStore = usePreferencesStore()
const { tableFullWidthDefault, rememberTableColumnSizes } = storeToRefs(preferencesStore)

const TABLE_MODES = ['auto', 'fit', 'full']

const defaultMode = computed(() =>
  TABLE_MODES.includes(tableFullWidthDefault.value) ? tableFullWidthDefault.value : 'auto'
)

const modeOptions = computed(() => [
  { label: t('quickSettings.tables.modeAuto'), value: 'auto' },
  { label: t('quickSettings.tables.modeFit'), value: 'fit' },
  { label: t('quickSettings.tables.modeFull'), value: 'full' }
])

const onDefaultModeChange = (mode) => {
  if (!TABLE_MODES.includes(mode)) return
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'tableFullWidthDefault', value: mode })
}

const onRememberSizesChange = (on) => {
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'rememberTableColumnSizes', value: !!on })
}
</script>
