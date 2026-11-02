<template>
  <div class="pref-tab-page pref-tab-page--experimental">
    <!-- START_BLOCK_EXPERIMENTAL_PROGRESSIVE_MOUNT -->
    <!-- C-LARGE-DOC-WAVE-A T-004 (R-4): the single Experimental row. The
         switch is session-latched (off by default, returns to off on
         relaunch, never persisted) — it deliberately does NOT go through
         SET_SINGLE_PREFERENCE. The caption names the large-document
         contract the experiment serves. The counter line below is
         content-free per-session state. -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.experimental.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.experimental.progressiveMount')"
          :help="t('preferences.experimental.progressiveMountHelp')"
          :bool="experimentalProgressiveMount"
          :on-change="onProgressiveMountChange"
        ></bool>
        <div class="pref-row pref-row--info">
          <div class="pref-row-text">
            <span class="pref-row-help">{{
              t('preferences.experimental.sessionCount', {
                progressive: progressiveMountServedProgressiveCount,
                legacy: progressiveMountServedLegacyCount
              })
            }}</span>
          </div>
        </div>
      </template>
    </compound>
    <!-- END_BLOCK_EXPERIMENTAL_PROGRESSIVE_MOUNT -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/experimental/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The Experimental tab of the Settings window (C-LARGE-DOC-WAVE-A T-004, R-4) — hosts the session-latched progressive-mount toggle for large documents plus the per-session progressive-versus-legacy served-opens counter.
//   SCOPE: One toggle row and one content-free counter line; the toggle writes ONLY in-memory session state (SET_EXPERIMENTAL_PROGRESSIVE_MOUNT — never SET_SINGLE_PREFERENCE, never persisted, returns to off on relaunch) and affects only documents opened after the flip (no remount of open tabs).
//   DEPENDS: prefComponents/common/{compound,bool}, store/preferences (session-only experimental state), vue-i18n.
//   LINKS: .grace/changes/active/C-LARGE-DOC-WAVE-A (spec R-4, plan T-004/corner-10); components/editorWithTabs/editor.vue (the open-path consumer); .grace/graph/runtime.xml M-011/M-063.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   experimentalProgressiveMount - session-only toggle state from store/preferences (default false; a relaunch always returns to off — the flag never persists).
//   progressiveMountServedProgressiveCount - content-free per-session count of opens served by the progressive path (store/preferences, in-memory only).
//   progressiveMountServedLegacyCount - content-free per-session count of opens served by the legacy path incl. R-3 fallbacks (store/preferences, in-memory only).
//   onProgressiveMountChange - SET_EXPERIMENTAL_PROGRESSIVE_MOUNT bridge (NOT SET_SINGLE_PREFERENCE — the experiment must never persist).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-11-02 - C-LARGE-DOC-WAVE-A T-004: initial
//                 Experimental tab — progressive-mount toggle (default off,
//                 session-latched) + the per-session served-opens counter.]
// END_CHANGE_SUMMARY

import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '@/prefComponents/common/compound/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  experimentalProgressiveMount,
  progressiveMountServedProgressiveCount,
  progressiveMountServedLegacyCount
} = storeToRefs(preferenceStore)

// Deliberately NOT SET_SINGLE_PREFERENCE: the experimental toggle is
// session-only (R-4) — no mt_prefs_set write, no schema key, not
// resettable; SET_EXPERIMENTAL_PROGRESSIVE_MOUNT keeps it in memory and
// fans the flip out to the other windows through the content-free
// mt::experimental-progressive-mount event.
const onProgressiveMountChange = (value) => {
  preferenceStore.SET_EXPERIMENTAL_PROGRESSIVE_MOUNT(value)
}
</script>

<style>
/* START_BLOCK_EXPERIMENTAL_INFO_ROW */
/* The counter line renders as a plain info row (no control on the right)
   using the shell's shared pref-row anatomy — nothing experimental about
   the styling itself. */
.pref-container .pref-row--info {
  min-height: 24px;
}
/* END_BLOCK_EXPERIMENTAL_INFO_ROW */
</style>
