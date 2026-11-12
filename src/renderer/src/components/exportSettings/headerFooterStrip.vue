<template>
  <div class="hf-strip">
    <div class="hf-strip-label">{{ label }}</div>
    <div class="hf-strip-slots">
      <el-input
        v-model="leftProxy"
        size="small"
        :placeholder="t('exportSettings.headerFooter.leftSlot')"
        :aria-label="`${label} — ${t('exportSettings.headerFooter.leftSlot')}`"
      ></el-input>
      <el-input
        v-model="centerProxy"
        size="small"
        :placeholder="t('exportSettings.headerFooter.centerSlot')"
        :aria-label="`${label} — ${t('exportSettings.headerFooter.centerSlot')}`"
      ></el-input>
      <el-input
        v-model="rightProxy"
        size="small"
        :placeholder="t('exportSettings.headerFooter.rightSlot')"
        :aria-label="`${label} — ${t('exportSettings.headerFooter.rightSlot')}`"
      ></el-input>
    </div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/exportSettings/headerFooterStrip.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: One editable running-head strip (C-EXPORT-SINGLE-PAGE R-4) —
//     three focusable text slots (left/centre/right); an empty strip means
//     the header (or footer) is absent, the legacy type integer is derived
//     by the parent from which slots carry text.
//   SCOPE: Slot input rendering only; no knowledge of the export payload.
//   DEPENDS: element-plus el-input; vue-i18n (slot placeholders).
//   LINKS: src/renderer/src/prefComponents/tabs/export/index.vue;
//     exportOptions.deriveHeaderFooterType;
//     .grace/graph/features.xml M-072; .grace/verification/features.xml V-M-072; C-EXPORT-SETTINGS-SECTION-RECOVERY.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   label - prop, strip heading text.
//   left/center/right - props, current slot texts owned by the parent.
//   leftProxy/centerProxy/rightProxy - writable computables emitting
//     single-field patches on the change event.
//   t - vue-i18n translator.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-12 C-EXPORT-SETTINGS-SECTION-RECOVERY: retain slot bindings inside the Preferences row spacing.
//   LAST_CHANGE: 2026-11-07 v1.0.0 - C-EXPORT-SINGLE-PAGE T-003: initial
//   file — slot strip replacing the none/single/three-cells selects and
//   their six conditional text boxes.
// END_CHANGE_SUMMARY
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  label: { type: String, default: '' },
  left: { type: String, default: '' },
  center: { type: String, default: '' },
  right: { type: String, default: '' }
})

const emit = defineEmits(['change'])

const { t } = useI18n()

// The parent owns the texts (they hydrate from remembered options); each
// keystroke emits a one-field patch the parent merges back.
const leftProxy = computed({
  get: () => props.left,
  set: value => emit('change', { left: value })
})
const centerProxy = computed({
  get: () => props.center,
  set: value => emit('change', { center: value })
})
const rightProxy = computed({
  get: () => props.right,
  set: value => emit('change', { right: value })
})
</script>

<style scoped>
.hf-strip {
  padding: 8px 14px;
}
.hf-strip-label {
  margin-bottom: 5px;
}
.hf-strip-slots {
  display: flex;
  gap: 8px;
}
.hf-strip-slots .el-input {
  flex: 1;
  min-width: 0;
}
</style>
