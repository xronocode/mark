<template>
  <div class="pref-tab-page pref-tab-page--advanced">
    <!-- START_BLOCK_ADVANCED_TAB_PAGES -->
    <!-- C-38 T-003 interim shell: the new Advanced tab stacks the old
         Image, Keybindings and Extensions-gallery pages (IA §3.5; old
         /preference/image, /keybindings and /extensions redirect here)
         until T-004 replaces them. -->
    <ImagePage />
    <KeybindingsPage />
    <ExtensionGallery />
    <!-- END_BLOCK_ADVANCED_TAB_PAGES -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/advanced/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Advanced tab of the C-38 Settings shell — interim composition of the pre-redesign Image, Keybindings and Extensions pages per the N2 IA (§3.5).
//   SCOPE: Pure composition; all behaviour lives in the stacked pages until T-004 rewrites their content.
//   DEPENDS: prefComponents/image, prefComponents/keybindings, components/extensionGallery.
//   LINKS: .grace/changes/active/C-38 T-003/T-004; docs/design/settings-ia-2026-10-15.md §3.5; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 T-003 — new Advanced tab (old image/keybindings/extensions routes redirect here).
// END_CHANGE_SUMMARY

import ImagePage from '@/prefComponents/image'
import KeybindingsPage from '@/prefComponents/keybindings'
import ExtensionGallery from '@/components/extensionGallery'
</script>
