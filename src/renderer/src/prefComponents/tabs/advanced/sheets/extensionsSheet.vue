<template>
  <!-- START_BLOCK_EXTENSIONS_SHEET -->
  <pref-sheet
    :open="open"
    :title="t('preferences.advanced.sheets.extensionsTitle')"
    @close="emit('close')"
  >
    <extension-gallery />
  </pref-sheet>
  <!-- END_BLOCK_EXTENSIONS_SHEET -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/advanced/sheets/extensionsSheet.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The Extensions sheet (C-38 T-004) — the existing extension gallery rendered as a sheet over the Settings window from Advanced › Customise «Browse…».
//   SCOPE: Pure composition; the gallery keeps its discovery/enable/disable logic.
//   DEPENDS: prefComponents/common/sheet, components/extensionGallery.
//   LINKS: .grace/changes/active/C-38 T-004; .grace/graph/runtime.xml M-011 (M-045 extension host UI).
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: sheet instead of a route — the T-003 shell already redirects the legacy /preference/extensions path to the Advanced tab, so routing back would reintroduce a page the redesign removed; the sheet keeps the user in Settings context like the other Advanced pop-ups.]
// END_CHANGE_SUMMARY

import { useI18n } from 'vue-i18n'
import PrefSheet from '@/prefComponents/common/sheet/index.vue'
import ExtensionGallery from '@/components/extensionGallery/index.vue'

defineProps({
  open: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const { t } = useI18n()
</script>
