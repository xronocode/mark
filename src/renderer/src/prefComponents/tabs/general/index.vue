<template>
  <div class="pref-tab-page pref-tab-page--general">
    <!-- START_BLOCK_GENERAL_TAB_PAGES -->
    <!-- C-38 T-003 interim shell: the new General tab stacks the old
         General and Language pages (IA §3.1) until T-004 replaces them
         with the redesigned rows. -->
    <GeneralPage />
    <LanguagePage />
    <!-- END_BLOCK_GENERAL_TAB_PAGES -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/general/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: General tab of the C-38 Settings shell — interim composition of the pre-redesign General and Language pages per the N2 IA (§3.1).
//   SCOPE: Pure composition; all behaviour lives in the stacked pages until T-004 rewrites their content.
//   DEPENDS: prefComponents/general, prefComponents/language.
//   LINKS: .grace/changes/active/C-38 T-003/T-004; docs/design/settings-ia-2026-10-15.md §3.1; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 T-003 — new General tab (old General + Language pages stacked).
// END_CHANGE_SUMMARY

import GeneralPage from '@/prefComponents/general'
import LanguagePage from '@/prefComponents/language'
</script>
