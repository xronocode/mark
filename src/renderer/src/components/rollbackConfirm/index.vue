<!--
// FILE: src/renderer/src/components/rollbackConfirm/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-UPDATER-ROLLBACK confirmation card — the three spec
//            disclosures (target version, settings revert, skip of the
//            departed version) with Confirm / Cancel, rendered through
//            the shared notification stack (dedupKey 'rollback-confirm'
//            makes it a singleton: a repeated delegation or menu
//            invocation reuses the same entry instead of stacking).
//   SCOPE: Watching the useAutoUpdatesStore rollback visibility,
//            injecting/removing a sticky warning entry, listening for
//            the mt::rollback-delegate Tauri event (a pre-boot
//            --rollback delegated here), and dispatching the store's
//            three actions. No restore logic lives here — Rust owns
//            validation and execution.
//   DEPENDS: store/autoUpdates (rollback + actions), store/notifications
//            (NOTIFY/DISMISS), i18n t, @tauri-apps/api/event.
//   LINKS: .grace/changes/active/C-UPDATER-ROLLBACK spec R-4/R-5,
//          corners C-2/C-5; components/updateNotice (the pattern);
//          src-tauri/src/m068_rollback.rs (mt_rollback_restore).
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-28 C-UPDATER-ROLLBACK T-005/T-006: initial component.
// END_CHANGE_SUMMARY
-->
<template>
  <span aria-hidden="true" style="display: none"></span>
</template>

<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { useNotificationsStore } from '@/store/notifications'
import { t } from '@/i18n'

const store = useAutoUpdatesStore()
const { rollback } = storeToRefs(store)
const notifications = useNotificationsStore()

let entryId = null

// START_BLOCK_ROLLBACK_ACTIONS
// Thin dispatchers: decisions live in the store actions; Cancel is a
// strict no-op (nothing invoked, nothing persisted — pinned by test).
const onConfirm = () => {
  store.CONFIRM_ROLLBACK()
}
const onCancel = () => {
  store.CLOSE_ROLLBACK_CONFIRM()
}
// END_BLOCK_ROLLBACK_ACTIONS

// START_BLOCK_ROLLBACK_STACK_SYNC
// Inject/remove the shared-card entry with store-owned visibility. The
// dedupKey makes the card a singleton — a repeated menu invocation or a
// second pre-boot delegation while the card is open reuses the same
// entry (focus, never stacking — corner C-2).
watch(
  () => rollback.value.visible,
  (visible) => {
    if (visible && entryId === null) {
      entryId = notifications.NOTIFY({
        severity: 'warning',
        source: 'rollback',
        sticky: true,
        dedupKey: 'rollback-confirm',
        title: t('rollback.title', { version: rollback.value.previousVersion }),
        message: t('rollback.body', { current: rollback.value.currentVersion }),
        actions: [
          { label: t('rollback.confirm'), style: 'primary', handler: onConfirm },
          { label: t('rollback.cancel'), handler: onCancel }
        ],
        onDismiss: onCancel
      })
    } else if (!visible && entryId !== null) {
      notifications.DISMISS(entryId)
      entryId = null
    }
  },
  { immediate: true }
)
// END_BLOCK_ROLLBACK_STACK_SYNC

// START_BLOCK_ROLLBACK_DELEGATE_LISTENER
// A pre-boot `mark --rollback` that found this live instance delegated
// here (m068 spawn_delegate_poller acks and emits); opening the card is
// the whole delegation — no restore work happens outside CONFIRM.
let unlistenDelegate = null
onMounted(async () => {
  try {
    const { listen } = await import('@tauri-apps/api/event')
    unlistenDelegate = await listen('mt::rollback-delegate', () => {
      store.OPEN_ROLLBACK_CONFIRM()
    })
  } catch (e) {
    console.warn('[rollbackConfirm][BLOCK_DELEGATE_LISTENER_FAILED]', e)
  }
})
onBeforeUnmount(() => {
  if (unlistenDelegate) unlistenDelegate()
})
// END_BLOCK_ROLLBACK_DELEGATE_LISTENER
</script>
