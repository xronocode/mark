<template>
  <div class="pref-tab-page pref-tab-page--editor">
    <!-- START_BLOCK_EDITOR_TAB_PAGES -->
    <!-- C-38 T-003 interim shell: the new Editor tab stacks the old
         Editor and SpellChecker pages (IA §3.3; old /preference/spelling
         redirects here) until T-004 replaces them. -->
    <EditorPage />
    <SpellcheckerPage />
    <!-- END_BLOCK_EDITOR_TAB_PAGES -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/editor/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Editor tab of the C-38 Settings shell — interim composition of the pre-redesign Editor and Spelling pages per the N2 IA (§3.3).
//   SCOPE: Pure composition; all behaviour lives in the stacked pages until T-004 rewrites their content.
//   DEPENDS: prefComponents/editor, prefComponents/spellchecker.
//   LINKS: .grace/changes/active/C-38 T-003/T-004; docs/design/settings-ia-2026-10-15.md §3.3; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 T-003 — new Editor tab (old Editor + Spelling pages stacked; /preference/spelling redirects here).
// END_CHANGE_SUMMARY

import EditorPage from '@/prefComponents/editor'
import SpellcheckerPage from '@/prefComponents/spellchecker'
</script>
