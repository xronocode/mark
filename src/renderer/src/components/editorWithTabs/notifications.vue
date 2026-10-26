<template>
  <div
    v-if="currentNotification"
    class="editor-notifications"
    :class="currentNotification.style"
    :data-notify-severity="severityOf(currentNotification.style)"
    :style="{ 'max-width': showSideBar ? `calc(100vw - ${sideBarWidth}px` : '100vw' }"
    @mouseup="onSelectionRelease"
    @touchend="onSelectionRelease"
  >
    <span class="sev-glyph" aria-hidden="true">
      <chrome-icon :name="severityIcon" :size="14"></chrome-icon>
    </span>
    <div class="msg">
      {{ currentNotification.msg }}
    </div>
    <div class="controls">
      <div>
        <span
          v-if="currentNotification.showConfirm"
          class="inline-button"
          @click.stop="handleClick(true)"
        >
          {{ t('common.ok') }}
        </span>
        <span class="inline-button" @click.stop="handleClick(false)">
          <chrome-icon name="close" :size="12" class="close-icon" aria-hidden="true" />
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
// START_MODULE_CONTRACT
//   PURPOSE: Per-file editor banner — the sanctioned home for contextual
//            questions with a safe default (file-changed-on-disk); since
//            C-NOTIFICATION-SYSTEM T-006 it wears the shared notification
//            visual family (float tokens, severity glyph) and its message
//            text is selectable with copy-on-select.
//   SCOPE: Rendering the file's notification queue head and answering it
//          (OK / close) exactly as before — queue, exclusiveType and
//          confirm-action semantics are unchanged (spec R-8); plus the
//          shared copy-on-select release handler.
//   DEPENDS: store/editor (currentFile.notifications), store/layout,
//          services/notification (copy helpers), icons/chromeIcons, i18n.
//   LINKS: .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-3/R-8;
//          components/notificationCard (shared family, pulse CSS);
//          store/editor.js BLOCK_LOAD_CHANGE (the file-changed sender).
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-23 C-NOTIFICATION-SYSTEM T-006: shared visual family — float
//     surface + severity glyph instead of the solid --notification* strip;
//     message text selectable (user-select none removed) with copy-on-select
//     double pulse; queue semantics untouched.
//   - 2026-10-15 C-38 T-006 N4 d: the dismiss glyph renders from the
//     drawn chromeIcons set instead of the iconfont sprite.
// END_CHANGE_SUMMARY
import { computed } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import { t } from '../../i18n'
import { ChromeIcon } from '../icons/chromeIcons.js'
import { copySelectionText, applyCopyPulse } from '@/services/notification'

const editorStore = useEditorStore()
const layoutStore = useLayoutStore()

const { currentFile } = storeToRefs(editorStore)
const { showSideBar, sideBarWidth } = storeToRefs(layoutStore)

const currentNotification = computed(() => {
  const notifications = currentFile.value.notifications
  if (!notifications || notifications.length === 0) {
    return null
  }
  return notifications[0]
})

// Legacy style values map onto the shared severity axis for the glyph only —
// the queue semantics stay keyed on the original style strings.
const severityOf = (style) => {
  if (style === 'crit') return 'error'
  if (style === 'warn') return 'warning'
  return 'info'
}

const severityIcon = computed(() => {
  const s = severityOf(currentNotification.value && currentNotification.value.style)
  return { error: 'error', warning: 'warning', info: 'info' }[s] || 'info'
})

// Spec R-3/R-8: same copy-on-select contract as the cards — release with a
// selection inside the banner copies it and double-pulses; never answers
// the banner's own OK/close buttons (they stopPropagation).
const onSelectionRelease = (event) => {
  const root = event.currentTarget
  const sel = window.getSelection && window.getSelection()
  if (sel && !sel.isCollapsed && root && root.contains(sel.anchorNode)) {
    copySelectionText(sel.toString())
    try {
      applyCopyPulse(sel.getRangeAt(0))
    } catch {
      /* non-range selection: the copy already happened */
    }
  }
}

const handleClick = (status) => {
  const notifications = currentFile.value.notifications
  if (!notifications || notifications.length === 0) {
    console.error(t('editor.notifications.notificationNotFound'))
    return
  }

  const item = notifications.shift()
  const action = item.action
  if (action) {
    action(status)
  }
}
</script>

<style scoped>
/* C-NOTIFICATION-SYSTEM T-006: the banner joins the card family — float
   surface + severity ring instead of the solid --notification* strip. */
.editor-notifications[data-notify-severity='info'] { --sev: var(--notifyInfo, #3D6AD6); }
.editor-notifications[data-notify-severity='warning'] { --sev: var(--notifyWarning, #C46510); }
.editor-notifications[data-notify-severity='error'] { --sev: var(--notifyError, #D5453C); }

.editor-notifications {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  max-height: 100px;
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--floatBgColor, #fff);
  box-shadow: 0 0 0 1px var(--floatBorderColor, rgba(0, 0, 0, 0.1)),
    inset 3px 0 0 var(--sev);
  color: var(--editorColor, inherit);
  overflow: hidden;
}
.sev-glyph {
  flex: none;
  margin-top: 1px;
  color: var(--sev);
}
.msg {
  font-size: 13px;
  line-height: 1.45;
  flex: 1;
  color: var(--floatFontColor, rgba(0, 0, 0, 0.72));
  user-select: text;
  -webkit-user-select: text;
}
.controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  & > div {
    display: flex;
    flex-direction: row;
  }
  & .inline-button:not(:last-child) {
    margin-right: 3px;
  }
  & .inline-button {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 24px;
    height: 24px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--editorColor, #000) 15%, transparent);
    color: var(--editorColor50, rgba(0, 0, 0, 0.5));
  }
  & .inline-button:hover {
    background: color-mix(in srgb, var(--editorColor, #000) 8%, transparent);
    border-color: color-mix(in srgb, var(--editorColor, #000) 40%, transparent);
    color: var(--editorColor, inherit);
  }
}
</style>
