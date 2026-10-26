<!--
// FILE: src/renderer/src/components/updateNotice/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-66 non-modal «Mark X.Y.Z is available» notice — Update /
//            Later / Skip this version, shown at most once per launch by
//            the automatic update check; since C-NOTIFICATION-SYSTEM it
//            renders through the shared notification card inside the common
//            stack instead of its own fixed-position element.
//   SCOPE: Watching the useAutoUpdatesStore notice visibility and injecting
//            or removing a sticky info entry (dedupKey 'update-notice') in
//            the notifications store; dispatching its three actions. No
//            checking, timing or persistence lives here; visibility is
//            store-owned so boot races can never flash an empty notice
//            (C-66 semantics frozen, corner C-8).
//   DEPENDS: store/autoUpdates (notice + actions), store/notifications
//            (NOTIFY/DISMISS), i18n t.
//   LINKS: .grace/changes/archive/C-66/spec.xml R-2 (semantic owner);
//          .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-7, T-005;
//          components/notificationCard (renders the entry);
//          pages/app.vue mounts it beside the stack.
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-005: the
//   notice renders as a sticky info card (Update primary / Later normal /
//   Skip quiet) injected into the shared stack — no separate fixed
//   positioning remains; INSTALL_UPDATE / DISMISS_NOTICE / SKIP_VERSION
//   dispatch identically and once-per-launch gating is untouched.
//   v1.0.0 - 2026-10-19 C-66 T-002: initial component (own fixed card).
// END_CHANGE_SUMMARY
-->
<template>
  <span aria-hidden="true" style="display: none"></span>
</template>

<script setup>
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { useNotificationsStore } from '@/store/notifications'
import { t } from '@/i18n'

const store = useAutoUpdatesStore()
// storeToRefs (not a plain destructure): RUN_LAUNCH_CHECK replaces the
// whole notice object when queueing, and a destructured plain object
// would keep pointing at the previous one.
const { notice } = storeToRefs(store)
const notifications = useNotificationsStore()

let entryId = null

// START_BLOCK_NOTICE_ACTIONS
// Thin dispatchers: every decision (hiding, persisting the skip, running
// the signed install) is a store action so the unit pins live beside the
// gate table, not in DOM glue. onDismiss maps body-click/Esc dismissal to
// the Later semantics (DISMISS_NOTICE) — the entry never dies silently.
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

// START_BLOCK_NOTICE_STACK_SYNC
// Inject/remove the shared-card entry with the store-owned visibility —
// the C-66 boot-race guarantee carries over unchanged (corner C-8).
watch(
  () => notice.value.visible,
  (visible) => {
    if (visible && entryId === null) {
      entryId = notifications.NOTIFY({
        severity: 'info',
        source: 'update',
        sticky: true,
        dedupKey: 'update-notice',
        title: t('updateNotice.title', { version: notice.value.version }),
        message: '',
        actions: [
          { label: t('updateNotice.update'), style: 'primary', handler: onUpdate },
          { label: t('updateNotice.later'), handler: onLater },
          { label: t('updateNotice.skip'), style: 'quiet', handler: onSkip }
        ],
        onDismiss: onLater
      })
    } else if (!visible && entryId !== null) {
      notifications.DISMISS(entryId)
      entryId = null
    }
  },
  { immediate: true }
)
// END_BLOCK_NOTICE_STACK_SYNC
</script>
