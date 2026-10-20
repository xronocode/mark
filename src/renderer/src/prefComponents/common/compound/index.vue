<template>
  <!-- START_BLOCK_GROUP_SECTION -->
  <section class="pref-group-item">
    <div class="pref-group-title">
      <slot name="head" />
    </div>
    <div class="pref-group">
      <slot name="children" />
    </div>
    <div v-if="notes" class="pref-group-notes">
      {{ notes }}
    </div>
  </section>
  <!-- END_BLOCK_GROUP_SECTION -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/compound/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings grouped section (C-38 T-003 anatomy) — 13px semibold title above an inset group card (white/#2f2f2f, per-OS radius, hairline border) whose direct children are separated by hairlines.
//   SCOPE: Pure layout; head/children slots and notes prop from v1 unchanged.
//   DEPENDS: none (palette vars come from the shell).
//   LINKS: .grace/changes/archive/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-003 — macOS-style inset group replaces the tinted compound panel (title moves outside the card, rows get hairline separators, per-OS radius).
//   - (v1.x: rgba-tinted body with the title inside — retired.)
// END_CHANGE_SUMMARY

defineProps({
  notes: String
})
</script>

<style>
/* START_BLOCK_GROUP_METRICS */
/* Mockup group card: background --prefGroup, 0.5px hairline border,
   radius 9px (macOS) / 6px (Windows — driven by --prefGroupRadius the
   shell sets per OS); rows inside carry 8/14px padding, ≥40px height
   and a hairline between siblings. */
.pref-group-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  user-select: none;
  color: var(--prefText, #1d1d1f);
}

.pref-group-item .pref-group-title {
  margin: 0 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--prefText, #1d1d1f);
}

.pref-group-item .pref-group-title h6.title {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
  display: inline;
  padding: 0;
}

.pref-group-item .pref-group {
  background: var(--prefGroup, #ffffff);
  border-radius: var(--prefGroupRadius, 9px);
  border: 0.5px solid var(--prefLine, rgba(0, 0, 0, 0.08));
  display: flex;
  flex-direction: column;
}

.pref-group-item .pref-group > * + * {
  border-top: 0.5px solid var(--prefLine, rgba(0, 0, 0, 0.08));
}

.pref-group-item .pref-group-notes {
  margin: 4px 6px 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--prefSub, #6b6b70);
}
/* END_BLOCK_GROUP_METRICS */
</style>
