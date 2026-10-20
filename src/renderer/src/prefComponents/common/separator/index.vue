<template>
  <div class="pref-separator"></div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/separator/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Hairline separator between settings groups (C-38 T-003) — the v1 2px bar becomes the 0.5px hairline the mockup uses between rows/sections.
//   SCOPE: Pure presentational divider.
//   DEPENDS: none (palette vars come from the shell).
//   LINKS: .grace/changes/archive/C-38 T-003; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-003 — 2px editorColor04 bar replaced by the 0.5px palette hairline.
// END_CHANGE_SUMMARY
</script>

<style>
.pref-separator {
  margin: 6px 0;
  height: 0;
  border-top: 0.5px solid var(--prefLine, rgba(0, 0, 0, 0.08));
}
</style>
