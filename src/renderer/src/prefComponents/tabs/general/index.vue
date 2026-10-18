<template>
  <div class="pref-tab-page pref-tab-page--general">
    <!-- START_BLOCK_GENERAL_MACOS_INTEGRATION -->
    <!-- M-021 default-handler — a normal group on General since C-38
         T-004 (was a special yellow card on the old page): row = label +
         status text as help + Set/Remove button. macOS only, gated on the
         build capability. -->
    <compound v-if="isOsx && capabilities.setDefaultHandler !== false">
      <template #head>
        <h6 class="title">{{ t('preferences.general.macosIntegration.title') }}</h6>
      </template>
      <template #children>
        <button-row
          :description="t('preferences.general.macosIntegration.defaultForMd')"
          :help="defaultHandlerStatus"
          :value="isDefault
            ? t('preferences.general.macosIntegration.removeDefault')
            : t('preferences.general.macosIntegration.setDefault')"
          :on-click="isDefault ? unsetDefault : setAsDefault"
        ></button-row>
      </template>
    </compound>
    <!-- END_BLOCK_GENERAL_MACOS_INTEGRATION -->

    <!-- START_BLOCK_GENERAL_STARTUP -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.startup.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.general.startup.previewModeOnFinderOpen')"
          :help="t('preferences.general.startup.previewModeOnFinderOpenHelp')"
          :bool="previewModeOnFinderOpen"
          :on-change="(value) => onSelectChange('previewModeOnFinderOpen', value)"
        ></bool>
      </template>
    </compound>
    <!-- END_BLOCK_GENERAL_STARTUP -->

    <!-- START_BLOCK_GENERAL_LANGUAGE -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.language.title') }}</h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.general.language.appLanguage')"
          :value="language"
          :options="getLanguageOptions()"
          :on-change="(value) => onSelectChange('language', value)"
        ></cur-select>
      </template>
    </compound>
    <!-- END_BLOCK_GENERAL_LANGUAGE -->

    <!-- START_BLOCK_GENERAL_FILES -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.filesAndSaving.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.general.filesAndSaving.autoSave')"
          :help="t('preferences.general.filesAndSaving.autoSaveHelp')"
          :bool="autoSave"
          :on-change="(value) => onSelectChange('autoSave', value)"
        ></bool>
        <range
          :description="t('preferences.general.filesAndSaving.autoSaveDelay')"
          :help="t('preferences.general.filesAndSaving.autoSaveDelayHelp')"
          :value="autoSaveDelaySeconds"
          :min="1"
          :max="10"
          :step="0.1"
          :unit="t('preferences.general.filesAndSaving.secondsUnit')"
          :on-change="onAutoSaveDelayChange"
        ></range>
        <cur-select
          :description="t('preferences.general.filesAndSaving.defaultEncoding')"
          :help="t('preferences.general.filesAndSaving.defaultEncodingHelp')"
          :value="defaultEncoding"
          :options="getDefaultEncodingOptions()"
          :on-change="(value) => onSelectChange('defaultEncoding', value)"
        ></cur-select>
        <cur-select
          :description="t('preferences.general.filesAndSaving.endOfLine')"
          :help="t('preferences.general.filesAndSaving.endOfLineHelp')"
          :value="endOfLine"
          :options="getEndOfLineOptions()"
          :on-change="(value) => onSelectChange('endOfLine', value)"
        ></cur-select>
        <!-- C-51 T-001: Markdown-only folder tree by default; this switch
             restores non-Markdown files (dimmed, not openable) and empty
             folders in the sidebar. -->
        <bool
          :description="t('preferences.general.filesAndSaving.showAllFiles')"
          :help="t('preferences.general.filesAndSaving.showAllFilesHelp')"
          :bool="treeShowAllFiles"
          :on-change="(value) => onSelectChange('treeShowAllFiles', value)"
        ></bool>
      </template>
    </compound>
    <!-- END_BLOCK_GENERAL_FILES -->

    <!-- START_BLOCK_GENERAL_UPDATES -->
    <compound v-if="capabilities.updater !== false">
      <template #head>
        <h6 class="title">{{ t('preferences.general.updates.title') }}</h6>
      </template>
      <template #children>
        <!-- C-66: the launch-time check switch. The manual row below
             ignores the skip state and always reports. -->
        <bool
          :description="t('preferences.general.updates.autoCheck')"
          :help="t('preferences.general.updates.autoCheckHelp')"
          :bool="autoCheckUpdates"
          :on-change="(value) => onSelectChange('autoCheckUpdates', value)"
        ></bool>
        <button-row
          :description="appVersionLabel"
          :help="t('preferences.general.updates.help')"
          :value="t('preferences.general.updates.check')"
          :on-click="checkForUpdates"
        ></button-row>
      </template>
    </compound>
    <!-- END_BLOCK_GENERAL_UPDATES -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/general/index.vue
// VERSION: 2.2.0
// START_MODULE_CONTRACT
//   PURPOSE: General tab of the C-38 Settings window — macOS default-handler group, Startup (Finder preview mode), Language, Files and saving (autosave + delay in seconds, encoding, line endings, show-all-files tree switch) and Updates (C-66 automatic-check switch + manual check) per the N2 IA §3.1.
//   SCOPE: Row composition over the shared controls; seconds↔milliseconds conversion for autoSaveDelay; updater command dispatch; default-handler bindings; treeShowAllFiles switch binding (C-51 T-001); autoCheckUpdates switch binding (C-66 T-003).
//   DEPENDS: prefComponents/common/{compound,bool,select,range,buttonRow}, tabs/general/config, store/preferences, util (isOsx), @tauri-apps/api/app (getVersion, lazy).
//   LINKS: .grace/changes/active/C-38 T-004; .grace/changes/active/C-51 T-001; .grace/changes/active/C-66 R-4; docs/design/settings-ia-2026-10-15.md §3.1; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   onSelectChange - SET_SINGLE_PREFERENCE bridge shared by every row.
//   autoSaveDelaySeconds - autoSaveDelay (ms) presented in seconds; onAutoSaveDelayChange converts back (stored value stays ms, IA §4.6).
//   capabilities / isDefault / currentHandler / defaultHandlerStatus - M-021 default-handler bindings (status text doubles as the row help).
//   setAsDefault / unsetDefault - store actions; REFRESH_DEFAULT_MD_HANDLER runs on mount (macOS only).
//   appVersionLabel / checkForUpdates - the Updates row: `Mark <version>` from getVersion() (lazy) and the shared file.check-update command (lazy import — no commands-module side effects at page load).
//   treeShowAllFiles - C-51 T-001 show-all-files switch state (store/preferences) bound to the last Files-and-saving row.
//   autoCheckUpdates - C-66 T-003 automatic-check switch state (store/preferences) bound to the first Updates row (the whole group is updater-capability-gated, corner-5).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-19 v2.2.0: C-66 T-003 — «Check for updates
//     automatically» bool row opens the Updates group (default on,
//     SET_SINGLE_PREFERENCE persistence); the manual Check-for-updates
//     row stays as-is and ignores the skip state.
//   - 2026-10-16 v2.1.0: C-51 T-001 — «Show all files» bool row closes the
//     Files-and-saving group: off by default (Markdown-only tree), on
//     restores the pre-C-51 everything-visible tree via SET_SINGLE_PREFERENCE.
//   - 2026-10-15 v2.0.0: C-38 T-004 — real General tab per the IA: the old General + Language pages are retired (dead startup/window/sidebar rows dropped per IA §4.1); the macOS default-handler card becomes a normal group; autoSaveDelay shows seconds; line endings and encoding move in; the new Updates group runs the shared check-update command.
//   - (v1.x: C-38 T-003 interim wrapper stacking the old pages — retired.)
// END_CHANGE_SUMMARY

import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '@/prefComponents/common/compound/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'
import CurSelect from '@/prefComponents/common/select/index.vue'
import Range from '@/prefComponents/common/range/index.vue'
import ButtonRow from '@/prefComponents/common/buttonRow/index.vue'
import { getLanguageOptions, getEndOfLineOptions, getDefaultEncodingOptions } from './config'
import { isOsx } from '@/util'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  previewModeOnFinderOpen,
  language,
  autoSave,
  autoSaveDelay,
  defaultEncoding,
  endOfLine,
  treeShowAllFiles,
  autoCheckUpdates
} = storeToRefs(preferenceStore)

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

// START_BLOCK_AUTOSAVE_DELAY_SECONDS
// IA §3.1/§4.6: the stepper works in seconds (1–10, step 0.1) while the
// stored autoSaveDelay stays milliseconds — presentation converts both ways.
const autoSaveDelaySeconds = computed(() => {
  const ms = Number(autoSaveDelay.value)
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 5
})

const onAutoSaveDelayChange = (seconds) => {
  onSelectChange('autoSaveDelay', Math.round(seconds * 1000))
}
// END_BLOCK_AUTOSAVE_DELAY_SECONDS

// ─── M-021 default-handler bindings ──────────────────────────────────
const capabilities = computed(() => preferenceStore.buildCapabilities)
const isDefault = computed(() => preferenceStore.defaultMdHandler.isDefault)
const currentHandler = computed(() => preferenceStore.defaultMdHandler.currentHandler)

const defaultHandlerStatus = computed(() => {
  if (isDefault.value) {
    return t('preferences.general.macosIntegration.statusIsDefault')
  }
  if (currentHandler.value) {
    return t('preferences.general.macosIntegration.statusCurrent', { name: currentHandler.value })
  }
  return t('preferences.general.macosIntegration.statusNone')
})

const setAsDefault = () => preferenceStore.SET_DEFAULT_MD_HANDLER()
const unsetDefault = () => preferenceStore.UNSET_DEFAULT_MD_HANDLER()

// START_BLOCK_GENERAL_UPDATES_ROW
// The row label carries the running version (getVersion, lazy so the
// page never blocks on the Tauri app plugin); the button runs the very
// same file.check-update command the menu uses — the notification flow
// (up-to-date toast / signed download+install) lives there, not here.
const appVersion = ref('')

const appVersionLabel = computed(() =>
  appVersion.value ? `Mark ${appVersion.value}` : 'Mark'
)

const checkForUpdates = async () => {
  try {
    const { default: commands } = await import('@/commands')
    const command = commands.find((c) => c.id === 'file.check-update')
    if (command) {
      await command.execute()
    }
  } catch (e) {
    console.error('[preferences][general][BLOCK_CHECK_UPDATE_DISPATCH_FAILED]', e)
  }
}
// END_BLOCK_GENERAL_UPDATES_ROW

onMounted(async () => {
  if (isOsx && capabilities.value.setDefaultHandler !== false) {
    await preferenceStore.REFRESH_DEFAULT_MD_HANDLER()
  }
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    const version = await getVersion()
    appVersion.value = typeof version === 'string' ? version : ''
  } catch (e) {
    // Plain-browser/dev shims answer nothing — the label stays «Mark».
  }
})
</script>
