<!--
// FILE: src/renderer/src/components/notificationStack/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-NOTIFICATION-SYSTEM stack — the single bottom-right surface
//            for all corner notices: up to 3 live cards plus the overflow
//            chip, shared z-order under modal scrims.
//   SCOPE: rendering the store's liveStack (oldest first, newest at the
//          bottom), routing dismiss/onDismiss entries, Esc-to-close-topmost
//          without stealing editor focus, opening history from the overflow
//          chip. No timers or state of its own.
//   DEPENDS: store/notifications (liveStack, overflowCount, DISMISS,
//          DISMISS_TOP), components/notificationCard, icons/chromeIcons,
//          i18n, bus.
//   LINKS: .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-2;
//          pages/app.vue (mounts it once);
//          components/notificationsHistory ('show-notifications-history').
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-002: initial
//   stack — replaces the legacy service's document.body.prepend +
//   rePositionNotices translate math with one ordered reactive column; the
//   overflow chip routes to the palette history; Esc closes the topmost
//   card and never fires while an editor surface owns the Escape key.
// END_CHANGE_SUMMARY
-->
<template>
  <div v-if="live.length || overflowCount > 0" class="notification-stack" aria-label="Notifications">
    <button
      v-if="overflowCount > 0"
      class="stack-overflow"
      type="button"
      @click="openHistory"
    >
      <chrome-icon name="message" :size="12" aria-hidden="true"></chrome-icon>
      <span>{{ t('notifications.more', overflowCount) }}</span>
    </button>
    <notification-card
      v-for="entry in live"
      :key="entry.id"
      :entry="entry"
      @dismiss="dismissEntry"
    ></notification-card>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationsStore } from '@/store/notifications'
import NotificationCard from '../notificationCard/index.vue'
import { ChromeIcon } from '../icons/chromeIcons.js'
import { t } from '@/i18n'
import bus from '@/bus'

const store = useNotificationsStore()
const { overflowCount } = storeToRefs(store)
const live = computed(() => store.liveStack)

// update-notice entries provide onDismiss so their visibility owner
// (store/autoUpdates) stays the single source of truth (spec R-7).
const dismissEntry = (entry) => {
  if (entry && typeof entry.onDismiss === 'function') {
    entry.onDismiss()
  } else if (entry) {
    store.DISMISS(entry.id)
  }
}

const openHistory = () => {
  bus.emit('show-notifications-history')
}

// START_BLOCK_STACK_ESCAPE
// Corner C-2: Esc closes only the topmost card. The listener is passive:
// when the Escape originates inside an editable surface (muya editor,
// inputs), that surface owns the key and the stack does nothing — focus
// never moves and no editor action is preempted.
const isEditorTarget = (target) => {
  if (!target || typeof target.closest !== 'function') return false
  return !!(target.closest('[contenteditable="true"], input, textarea, .editor-wrapper, .ag-dialog-table'))
}

const onKeydown = (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  if (store.stack.length === 0 || isEditorTarget(event.target)) return
  const top = store.stack[store.stack.length - 1]
  dismissEntry(top)
}
// END_BLOCK_STACK_ESCAPE

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.notification-stack {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 950; /* under modal scrims (1000): a dialog opening stays on top */
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none; /* the empty area never blocks the document */
}

.notification-stack > * { pointer-events: auto; }

.stack-overflow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: var(--floatBgColor, #fff);
  box-shadow: 0 0 0 1px var(--floatBorderColor, rgba(0, 0, 0, 0.1)),
    0 8px 18px -10px var(--floatShadow, rgba(0, 0, 0, 0.4));
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}
.stack-overflow:hover { color: var(--editorColor, inherit); }
</style>
