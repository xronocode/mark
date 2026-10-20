<template>
  <!-- START_BLOCK_CUSTOM_CSS_SHEET -->
  <pref-sheet
    :open="open"
    :title="t('preferences.advanced.sheets.customCssTitle')"
    @close="emit('close')"
  >
    <textarea
      v-model="draftCss"
      class="pref-custom-css"
      rows="14"
      spellcheck="false"
      :placeholder="t('preferences.advanced.sheets.customCssPlaceholder')"
      :aria-label="t('preferences.advanced.customise.customCss')"
    ></textarea>
    <template #foot>
      <button type="button" class="pref-custom-css-btn" @click="emit('close')">
        {{ t('preferences.advanced.sheets.close') }}
      </button>
      <button type="button" class="pref-custom-css-btn is-primary" @click="save">
        {{ t('preferences.advanced.sheets.customCssSave') }}
      </button>
    </template>
  </pref-sheet>
  <!-- END_BLOCK_CUSTOM_CSS_SHEET -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/advanced/sheets/customCssSheet.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The Custom CSS sheet (C-38 T-004) — a textarea over the customCss preference with an explicit Save (the key keeps its name and its apply-on-top-of-theme behaviour in util/theme.addCustomStyle).
//   SCOPE: Draft editing (opened with the stored value, discarded on close without Save) and the SET_SINGLE_PREFERENCE write.
//   DEPENDS: prefComponents/common/sheet, store/preferences, vue-i18n.
//   LINKS: .grace/changes/archive/C-38 T-004; util/theme.js addCustomStyle; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   draftCss - editing buffer seeded from the store on open; closing without Save discards.
//   save - persists customCss and closes.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: the old Theme page's inline textarea becomes this sheet, opened from Advanced › Customise «Edit…»; explicit Save replaces change-to-apply.]
// END_CHANGE_SUMMARY

import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import PrefSheet from '@/prefComponents/common/sheet/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const { t } = useI18n()
const preferenceStore = usePreferencesStore()
const { customCss } = storeToRefs(preferenceStore)

const draftCss = ref(customCss.value)

watch(
  () => props.open,
  (open) => {
    if (open) {
      draftCss.value = customCss.value
    }
  }
)

const save = () => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type: 'customCss', value: draftCss.value })
  emit('close')
}
</script>

<style>
/* START_BLOCK_CUSTOM_CSS_METRICS */
/* Monospace editor surface on the control background with the Settings
   field metrics; Save is the accent-filled primary of the pair. */
.pref-sheet .pref-custom-css {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefCtrl, #ffffff);
  color: var(--prefText, #1d1d1f);
  outline: none;
  resize: vertical;
}

.pref-sheet .pref-custom-css:focus {
  border-color: var(--prefAccent, #007aff);
}

.pref-sheet .pref-custom-css::placeholder {
  color: var(--prefSub, #6b6b70);
}

.pref-sheet .pref-custom-css-btn {
  all: unset;
  cursor: default;
  font-size: 13px;
  box-sizing: border-box;
  padding: 3px 12px;
  border-radius: 6px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefCtrl, #ffffff);
  color: var(--prefText, #1d1d1f);
  box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.08);
}

.pref-sheet .pref-custom-css-btn.is-primary {
  background: var(--prefAccent, #007aff);
  border-color: transparent;
  color: #fff;
}
/* END_BLOCK_CUSTOM_CSS_METRICS */
</style>
