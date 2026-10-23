<!--
// FILE: src/renderer/src/components/notificationsHistory/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-NOTIFICATION-SYSTEM session history surface — the palette
//            command "Notifications: show recent" lists everything the app
//            showed this session, newest first, with full untruncated text.
//   SCOPE: rendering the store history (time, source, severity, title,
//          fullText), a per-entry copy action, the localized empty state;
//          opening via the show-notifications-history bus event. Session
//          memory only — never persisted, never written to disk.
//   DEPENDS: store/notifications (history), services/notification
//          (copySelectionText for plain strings), icons/chromeIcons, i18n,
//          bus, element-plus dialog.
//   LINKS: .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-6;
//          commands/index.js view.notifications-history;
//          components/notificationStack (overflow chip opens this).
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-003: initial
//   history dialog — the recovery path for auto-dismissed cards (spec
//   Problem 5); full text is never clamped here; copy uses the same silent
//   clipboard contract as copy-on-select.
// END_CHANGE_SUMMARY
-->
<template>
  <div class="notifications-history">
    <el-dialog
      v-model="visible"
      :title="t('notifications.history.title')"
      custom-class="ag-dialog-table"
      width="520px"
      append-to-body
    >
      <div class="history-list">
        <p v-if="entries.length === 0" class="history-empty">{{ t('notifications.history.empty') }}</p>
        <div v-for="(entry, index) in entries" :key="index" class="history-entry" :data-severity="entry.severity">
          <span class="entry-sev" aria-hidden="true">
            <chrome-icon :name="severityIcon(entry.severity)" :size="13"></chrome-icon>
          </span>
          <div class="entry-body">
            <div class="entry-meta">
              <span class="entry-time">{{ formatTime(entry.time) }}</span>
              <span class="entry-source">{{ sourceLabel(entry.source) }}</span>
            </div>
            <div v-if="entry.title" class="entry-title">{{ entry.title }}</div>
            <div class="entry-text">{{ entry.fullText }}</div>
          </div>
          <button
            class="entry-copy"
            type="button"
            :aria-label="t('notifications.history.copy')"
            @click="copyEntry(entry)"
          >
            <chrome-icon name="copy" :size="13"></chrome-icon>
          </button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationsStore } from '@/store/notifications'
import { copySelectionText } from '@/services/notification'
import { ChromeIcon } from '../icons/chromeIcons.js'
import { t } from '@/i18n'
import bus from '@/bus'

const visible = ref(false)
const store = useNotificationsStore()
const { history } = storeToRefs(store)

// Newest first — the freshest thing you missed is the thing you want.
const entries = computed(() => [...history.value].reverse())

const SEVERITY_ICONS = { info: 'info', success: 'check', warning: 'warning', error: 'error' }
const severityIcon = (severity) => SEVERITY_ICONS[severity] || 'info'

const sourceLabel = (source) => {
  try {
    return t('notifications.source.' + source)
  } catch {
    return source
  }
}

const formatTime = (ms) => {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

const copyEntry = (entry) => {
  copySelectionText(entry.fullText)
}

const open = () => {
  visible.value = true
}

onMounted(() => {
  bus.on('show-notifications-history', open)
})

onBeforeUnmount(() => {
  bus.off('show-notifications-history', open)
})
</script>

<style scoped>
.history-list {
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-empty {
  margin: 12px 0;
  text-align: center;
  font-size: 13px;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
}

.history-entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
}
.history-entry:hover { background: color-mix(in srgb, var(--editorColor, #000) 5%, transparent); }

.history-entry[data-severity='info'] { --sev: var(--notifyInfo, #3D6AD6); }
.history-entry[data-severity='success'] { --sev: var(--notifySuccess, #2F9E63); }
.history-entry[data-severity='warning'] { --sev: var(--notifyWarning, #C46510); }
.history-entry[data-severity='error'] { --sev: var(--notifyError, #D5453C); }

.entry-sev { color: var(--sev); margin-top: 2px; }

.entry-body { flex: 1; min-width: 0; }

.entry-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
}
.entry-source { text-transform: uppercase; letter-spacing: 0.04em; }

.entry-title {
  margin-top: 1px;
  font-size: 13px;
  font-weight: 600;
  color: var(--editorColor, inherit);
}

.entry-text {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--floatFontColor, rgba(0, 0, 0, 0.72));
  user-select: text;
  -webkit-user-select: text;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.entry-copy {
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
  cursor: pointer;
}
.entry-copy:hover { color: var(--editorColor, inherit); background: color-mix(in srgb, var(--editorColor, #000) 8%, transparent); }
</style>
