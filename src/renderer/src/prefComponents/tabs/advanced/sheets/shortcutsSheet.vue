<template>
  <!-- START_BLOCK_SHORTCUTS_SHEET -->
  <pref-sheet
    :open="open"
    :title="t('preferences.advanced.sheets.shortcutsTitle')"
    @close="emit('close')"
  >
    <keybindings-page />
  </pref-sheet>
  <!-- END_BLOCK_SHORTCUTS_SHEET -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/advanced/sheets/shortcutsSheet.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The Keyboard shortcuts sheet (C-38 T-004 decision 4) — a 560px modal panel over the Settings window hosting the existing keybindings editor with its own search field.
//   SCOPE: Pure composition; the sheet frame supplies title/Close/Esc, the keybindings page keeps all table/configurator logic.
//   DEPENDS: prefComponents/common/sheet, prefComponents/keybindings.
//   LINKS: .grace/changes/active/C-38 T-004; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: the Keybindings page becomes this sheet's body — opened from Advanced › Customise «Edit…».]
// END_CHANGE_SUMMARY

import { useI18n } from 'vue-i18n'
import PrefSheet from '@/prefComponents/common/sheet/index.vue'
import KeybindingsPage from '@/prefComponents/keybindings/index.vue'

defineProps({
  open: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const { t } = useI18n()
</script>
