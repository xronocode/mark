<!--
// FILE: src/renderer/src/components/updateNotice/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-66 non-modal corner notice — «Mark X.Y.Z is available»
//            with Update / Later / Skip this version, shown at most once
//            per launch by the automatic update check.
//   SCOPE: Rendering the useAutoUpdatesStore notice state and dispatching
//          its three actions. No checking, timing or persistence lives
//          here; visibility is store-owned so boot races can never flash
//          an empty notice.
//   DEPENDS: store/autoUpdates (notice + actions), i18n t.
//   LINKS: .grace/changes/active/C-66/spec.xml R-2;
//          pages/app.vue mounts it next to the zoom indicator;
//          commands/index.js installSignedUpdate (via INSTALL_UPDATE).
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-19 C-66 T-002: initial component —
//   bottom-right toast over the theme's CSS variables (float/editor/
//   button tokens, same family as the What's New sheet), role=status so
//   it is announced without stealing focus, and three buttons wired to
//   INSTALL_UPDATE / DISMISS_NOTICE / SKIP_VERSION.
// END_CHANGE_SUMMARY
-->
<template>
  <div
    v-if="notice.visible"
    class="ag-update-notice"
    role="status"
    aria-live="polite"
    :aria-label="t('updateNotice.title', { version: notice.version })"
  >
    <span class="notice-title">{{ t('updateNotice.title', { version: notice.version }) }}</span>
    <div class="notice-actions">
      <button class="notice-button notice-button-primary" type="button" @click="onUpdate">
        {{ t('updateNotice.update') }}
      </button>
      <button class="notice-button" type="button" @click="onLater">
        {{ t('updateNotice.later') }}
      </button>
      <button class="notice-button notice-button-quiet" type="button" @click="onSkip">
        {{ t('updateNotice.skip') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { t } from '@/i18n'

const store = useAutoUpdatesStore()
// storeToRefs (not a plain destructure): RUN_LAUNCH_CHECK replaces the
// whole notice object when queueing, and a destructured plain object
// would keep pointing at the previous one.
const { notice } = storeToRefs(store)

// START_BLOCK_NOTICE_ACTIONS
// Thin dispatchers: every decision (hiding, persisting the skip, running
// the signed install) is a store action so the unit pins live beside the
// gate table, not in DOM glue.
const onUpdate = () => {
  store.INSTALL_UPDATE()
}
const onLater = () => {
  store.DISMISS_NOTICE()
}
const onSkip = () => {
  store.SKIP_VERSION()
}
// END_BLOCK_NOTICE_ACTIONS
</script>

<style scoped>
/* Theme tokens only (AGENTS design rule) — Paper, Ink and every other
   theme supply these variables, so the toast follows light and dark. */
.ag-update-notice {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 900; /* under modal scrims (1000): a sheet opening stays on top */
  max-width: 320px;
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--floatBgColor, #fff);
  color: var(--floatFontColor, inherit);
  box-shadow: 0 18px 40px -14px var(--floatShadow, rgba(0, 0, 0, 0.4)),
    0 0 0 1px var(--floatBorderColor, rgba(0, 0, 0, 0.1));
}

.ag-update-notice .notice-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--editorColor, inherit);
}

.ag-update-notice .notice-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ag-update-notice .notice-button {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 7px;
  background: var(--inputBgColor, rgba(128, 128, 128, 0.12));
  color: var(--editorColor, inherit);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}

.ag-update-notice .notice-button:hover {
  background: var(--inputBgColor, rgba(128, 128, 128, 0.18));
  filter: brightness(0.97);
}

.ag-update-notice .notice-button-primary {
  background: var(--buttonPrimaryBgColor, #333);
  color: var(--buttonPrimaryFontColor, #fff);
}

.ag-update-notice .notice-button-primary:hover {
  background: var(--buttonPrimaryBgColorHover, #222);
  filter: none;
}

.ag-update-notice .notice-button-quiet {
  background: none;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
  text-decoration: underline;
  text-decoration-color: var(--highlightColor, currentColor);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}

.ag-update-notice .notice-button:focus-visible {
  outline: 2px solid var(--focusColor, currentColor);
  outline-offset: 2px;
}
</style>
