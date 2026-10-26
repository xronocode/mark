<!--
// FILE: src/renderer/src/components/notificationCard/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-NOTIFICATION-SYSTEM card — one severity-styled notification
//            (icon-chip variant, owner decision 2026-10-23) rendered from a
//            store entry; used by the stack, the update notice and testable
//            in isolation.
//   SCOPE: rendering (chip, title, source label, selectable message, count
//          badge, actions row, close, timer hairline); copy-on-select on
//          selection release (copy + double green pulse, never dismissing);
//          empty-selection click dismisses; hover pause reporting to the
//          store. No state of its own beyond the root ref.
//   DEPENDS: store/notifications (PAUSE/RESUME), services/notification
//            (copySelectionText, applyCopyPulse), icons/chromeIcons, i18n.
//   LINKS: .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-1/R-3/R-4;
//          components/notificationStack (mounts it);
//          components/updateNotice (actions + onDismiss injection);
//          components/editorWithTabs/notifications (same visual family).
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-002: initial
//   card — icon-chip (chromeIcons glyph in a 14% severity tint), C-66 card
//   metrics (radius 12, float tokens, 320 max-width), three action styles,
//   timer hairline with pause, copy-on-select with the owner-approved
//   double pulse (no labels), reduced-motion degrades silently.
// END_CHANGE_SUMMARY
-->
<template>
  <article
    ref="root"
    class="notification-card"
    :data-severity="entry.severity"
    :data-notify-severity="entry.severity"
    role="status"
    aria-live="polite"
    :aria-label="entry.title"
    @click="onCardClick"
    @mouseup="onSelectionRelease"
    @touchend="onSelectionRelease"
    @pointerenter="onHover(true)"
    @pointerleave="onHover(false)"
  >
    <div class="card-head">
      <span class="sev-chip" aria-hidden="true">
        <chrome-icon :name="severityIcon" :size="15"></chrome-icon>
      </span>
      <div class="head-text">
        <h3 class="card-title">{{ entry.title }}</h3>
        <span v-if="sourceLabel" class="card-source">{{ sourceLabel }}</span>
      </div>
      <span v-if="entry.count > 1" class="count-badge" aria-label="×{{ entry.count }}">×{{ entry.count }}</span>
      <button class="card-close" type="button" :aria-label="t('notifications.close')" @click.stop="requestDismiss">
        <chrome-icon name="close" :size="11"></chrome-icon>
      </button>
    </div>

    <p v-if="entry.message" class="card-message">{{ entry.message }}</p>

    <div v-if="entry.actions.length" class="card-actions">
      <template v-for="(action, index) in entry.actions" :key="index">
        <button
          class="action-btn"
          :class="'action-' + actionStyle(action)"
          type="button"
          @click.stop="runAction(action)"
        >{{ actionLabel(action) }}</button>
      </template>
    </div>

    <span v-if="!entry.sticky && entry.time > 0" class="timer" aria-hidden="true">
      <i :key="entry.count + '-' + entry.time" :style="timerStyle"></i>
    </span>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useNotificationsStore } from '@/store/notifications'
import { copySelectionText, applyCopyPulse, prefersReducedMotion } from '@/services/notification'
import { ChromeIcon } from '../icons/chromeIcons.js'
import { t } from '@/i18n'

const props = defineProps({
  // A live entry object from store/notifications (NOTIFY output shape).
  entry: { type: Object, required: true }
})

const emit = defineEmits(['dismiss'])
const root = ref(null)
const store = useNotificationsStore()

const SEVERITY_ICONS = { info: 'info', success: 'check', warning: 'warning', error: 'error' }
const severityIcon = computed(() => SEVERITY_ICONS[props.entry.severity] || 'info')
const sourceLabel = computed(() => {
  try {
    return t('notifications.source.' + props.entry.source)
  } catch {
    return ''
  }
})

// START_BLOCK_COPY_ON_SELECT
// Spec R-3: releasing a selection inside the card copies exactly the
// selection and never dismisses (corner C-3); the double green pulse is the
// only confirmation; reduced motion copies silently (corner C-10).
const onSelectionRelease = () => {
  const sel = window.getSelection && window.getSelection()
  if (sel && !sel.isCollapsed && root.value && root.value.contains(sel.anchorNode)) {
    copySelectionText(sel.toString())
    try {
      applyCopyPulse(sel.getRangeAt(0))
    } catch {
      /* non-range selection: the copy already happened */
    }
  }
}
// END_BLOCK_COPY_ON_SELECT

// Corner C-3: a click with no active text selection dismisses; a
// selection-release click does not (the release path returns above and the
// selection is still non-collapsed when the click event lands).
const onCardClick = () => {
  const sel = window.getSelection && window.getSelection()
  if (sel && !sel.isCollapsed && root.value && root.value.contains(sel.anchorNode)) return
  requestDismiss()
}

const requestDismiss = () => {
  emit('dismiss', props.entry)
}

// Corner C-2: hover pauses the countdown via the store (PAUSE guards
// sticky/timerless entries itself).
const onHover = (hovering) => {
  if (hovering) store.PAUSE(props.entry.id)
  else store.RESUME(props.entry.id)
}

// START_BLOCK_ACTIONS
// Corner C-7 contract: fire-and-forget. Built-in kinds (copy/retry/open/
// reveal) carry a payload — copy writes it to the clipboard, the others are
// caller-supplied functions. Custom entries carry label + handler. Nothing
// resolves, nothing awaits an answer.
const actionLabel = (action) => {
  if (action.kind && !action.label) return t('notifications.actions.' + action.kind)
  return action.label || ''
}

const actionStyle = (action) => {
  if (action.style === 'primary' || action.style === 'quiet') return action.style
  return 'normal'
}

const runAction = (action) => {
  if (typeof action.handler === 'function') {
    action.handler()
    return
  }
  if (action.kind === 'copy' && action.payload !== undefined) {
    copySelectionText(String(action.payload))
  } else if (typeof action.payload === 'function') {
    action.payload()
  }
}
// END_BLOCK_ACTIONS

const timerStyle = computed(() => {
  if (prefersReducedMotion()) return { animation: 'none', width: '100%' }
  return {
    animationDuration: props.entry.time + 'ms',
    animationPlayState: props.entry.paused ? 'paused' : 'running'
  }
})
</script>

<style scoped>
/* Severity tokens come from every theme (T-001); the fallbacks match the
   approved Paper mock so an untokensed context still reads correctly. */
.notification-card[data-severity='info'] { --sev: var(--notifyInfo, #3D6AD6); }
.notification-card[data-severity='success'] { --sev: var(--notifySuccess, #2F9E63); }
.notification-card[data-severity='warning'] { --sev: var(--notifyWarning, #C46510); }
.notification-card[data-severity='error'] { --sev: var(--notifyError, #D5453C); }

.notification-card {
  position: relative;
  box-sizing: border-box;
  width: 320px;
  max-width: min(320px, calc(100vw - 48px));
  padding: 13px 14px;
  border-radius: 12px;
  background: var(--floatBgColor, #fff);
  box-shadow: 0 18px 40px -14px var(--floatShadow, rgba(0, 0, 0, 0.4)),
    0 0 0 1px var(--floatBorderColor, rgba(0, 0, 0, 0.1));
  color: var(--editorColor, inherit);
  font-family: inherit;
  overflow: hidden;
  cursor: default;
}

.card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-right: 14px;
}

.sev-chip {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--sev);
  background: color-mix(in srgb, var(--sev) 14%, transparent);
}

.head-text { flex: 1; min-width: 0; }

.card-title {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--editorColor, inherit);
}

.card-source {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
}

.count-badge {
  flex: none;
  margin-top: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--sev);
  background: color-mix(in srgb, var(--sev) 12%, transparent);
}

.card-close {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
  opacity: 0.55;
  cursor: pointer;
}
.notification-card:hover .card-close { opacity: 1; }
.card-close:hover { background: color-mix(in srgb, var(--editorColor, #000) 8%, transparent); }

.card-message {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--floatFontColor, rgba(0, 0, 0, 0.72));
  user-select: text;
  -webkit-user-select: text;
  overflow-wrap: anywhere;
}
.card-message::selection, .card-message *::selection {
  background: color-mix(in srgb, var(--sev) 22%, transparent);
}

.card-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 11px;
}

.action-btn {
  height: 26px;
  padding: 0 11px;
  border: none;
  border-radius: 7px;
  background: var(--inputBgColor, rgba(128, 128, 128, 0.12));
  color: var(--editorColor, inherit);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.action-btn:hover { filter: brightness(0.96); }
.action-primary {
  background: var(--buttonPrimaryBgColor, #333);
  color: var(--buttonPrimaryFontColor, #fff);
}
.action-quiet {
  background: none;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
  text-decoration: underline;
  text-decoration-thickness: 1.2px;
  text-underline-offset: 3px;
}
.action-btn:focus-visible, .card-close:focus-visible {
  outline: 2px solid var(--sev, currentColor);
  outline-offset: 2px;
}

.timer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
}
.timer i {
  display: block;
  height: 100%;
  width: 100%;
  background: var(--sev);
  opacity: 0.55;
  animation: notify-timer-drain linear forwards;
}
@keyframes notify-timer-drain {
  from { width: 100%; }
  to { width: 0%; }
}

@media (prefers-reduced-motion: reduce) {
  .notification-card, .card-close { transition: none; }
  .timer i { animation: none; width: 100%; }
}
</style>

<style>
/* Unscoped on purpose: applyCopyPulse creates its span at runtime (scoped
   attributes cannot apply to it), and the editor banner reuses the same
   helper + class. Two pulses of 30% success tint inside ~1.1s, then the
   resting selection tint returns (the class is removed on animationend). */
.notify-copied-pulse {
  border-radius: 2px;
  animation: notify-copy-blink 1.1s ease;
}
@keyframes notify-copy-blink {
  0%, 22% { background: color-mix(in srgb, var(--notifySuccess, #2F9E63) 30%, transparent); }
  30%, 42% { background: transparent; }
  50%, 72% { background: color-mix(in srgb, var(--notifySuccess, #2F9E63) 30%, transparent); }
  100% { background: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .notify-copied-pulse { animation: none; }
}
</style>
