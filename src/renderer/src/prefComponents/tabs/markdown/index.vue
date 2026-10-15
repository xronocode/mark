<template>
  <div class="pref-tab-page pref-tab-page--markdown">
    <!-- START_BLOCK_MARKDOWN_TAB_PAGES -->
    <!-- C-38 T-003 interim shell: the new Markdown tab renders the old
         Markdown page (IA §3.4) until T-004 replaces it. -->
    <MarkdownPage />
    <!-- END_BLOCK_MARKDOWN_TAB_PAGES -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/markdown/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Markdown tab of the C-38 Settings shell — interim composition of the pre-redesign Markdown page per the N2 IA (§3.4).
//   SCOPE: Pure composition; all behaviour lives in the stacked page until T-004 rewrites its content.
//   DEPENDS: prefComponents/markdown.
//   LINKS: .grace/changes/active/C-38 T-003/T-004; docs/design/settings-ia-2026-10-15.md §3.4; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 T-003 — new Markdown tab (owns the old markdown route).
// END_CHANGE_SUMMARY

import MarkdownPage from '@/prefComponents/markdown'
</script>
