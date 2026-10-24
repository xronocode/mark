// FILE: src/renderer/src/services/notification/index.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-NOTIFICATION-SYSTEM compatibility facade — keeps the legacy
//            `import notice from '../services/notification'` call shape used
//            by ~70 call sites while forwarding everything to the pinia
//            notifications store, plus the shared copy-on-select helper used
//            by cards and the editor banner.
//   SCOPE: notify(opts)/clear() passthrough with legacy field mapping
//          (type→severity, primary→info; the legacy confirm flag is dead
//          and ignored); copySelectionText + applyCopyPulse (double green
//          pulse on the selection, animation class removed on animationend,
//          skipped under prefers-reduced-motion). No DOM building, no
//          template strings.
//   DEPENDS: store/notifications (pinia), i18n (default title/message).
//   LINKS: .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-3/R-4;
//          components/notificationCard + editorWithTabs/notifications
//          (consume the copy helpers); store/editor.js call sites
//          (actions[] migration in T-004).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - the legacy facade object: { name: 'notify', notify(opts), clear() }.
//   copySelectionText - writes exactly the given selection string to the clipboard; failures are silent no-ops.
//   applyCopyPulse - double green pulse on a Range or Element target; self-cleans on animationend.
//   prefersReducedMotion - shared prefers-reduced-motion probe.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-002: the DOM
//   template builder, the Fluent blur-circle mousemove effect, the
//   rePositionNotices JS geometry and the confirm-circle Promise semantics
//   are gone (corner C-7); rendering moved to components/notificationCard +
//   notificationStack over store/notifications. index.html/index.css deleted.
//   v1.x - legacy MarkText service (archive reference only).
// END_CHANGE_SUMMARY

import { useNotificationsStore } from '../../store/notifications'
import { t } from '../../i18n'

export const prefersReducedMotion = () => {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// START_BLOCK_COPY_SELECTION_TEXT
// Corner C-4: clipboard rejections or a missing API never surface — the copy
// is a quiet developer feature (spec R-3); failing silently beats an error
// toast about a toast.
export const copySelectionText = (selection) => {
  const text = selection ? String(selection) : ''
  if (!text) return false
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      const result = navigator.clipboard.writeText(text)
      if (result && typeof result.catch === 'function') result.catch(() => {})
    }
  } catch {
    /* silent no-op by contract */
  }
  return true
}
// END_BLOCK_COPY_SELECTION_TEXT

// START_BLOCK_APPLY_COPY_PULSE
// The only copy confirmation: the selection itself double-pulses green and
// settles (spec R-3; the two label designs were owner-rejected 2026-10-23).
// Accepts a DOM Range (live selection — wrapped in a span) or an Element
// (pre-existing selection markup — animation restarted via reflow).
// Multi-node ranges that cannot be wrapped degrade to no pulse (the copy
// itself already happened). Reduced motion: no animation at all.
export const applyCopyPulse = (target) => {
  if (!target || prefersReducedMotion()) return
  let el
  try {
    if (typeof target.surroundContents === 'function') {
      el = document.createElement('span')
      el.className = 'notify-copied-pulse'
      target.surroundContents(el)
    } else {
      el = target
      el.classList.remove('notify-copied-pulse')
      void el.offsetWidth /* restart the animation */
      el.classList.add('notify-copied-pulse')
    }
    el.addEventListener('animationend', () => {
      el.classList.remove('notify-copied-pulse')
    }, { once: true })
  } catch {
    /* multi-node ranges skip the pulse */
  }
}
// END_BLOCK_APPLY_COPY_PULSE

const notification = {
  name: 'notify',

  // Legacy contract: empty the visible surface. The stack store owns the
  // entries; clearing it clears the cards.
  clear() {
    useNotificationsStore().CLEAR()
  },

  // Legacy call shape: ({ title, message, type, time }). New optional
  // fields pass straight through: severity, source, actions, dedupKey,
  // sticky. Returns undefined — never a Promise (corner C-7).
  notify(opts) {
    const o = opts || {}
    useNotificationsStore().NOTIFY({
      severity: o.severity || o.type,
      source: o.source,
      title: o.title === undefined ? t('notifications.defaultTitle') : o.title,
      message: o.message === undefined ? t('notifications.defaultMessage') : o.message,
      actions: o.actions,
      dedupKey: o.dedupKey,
      sticky: o.sticky,
      time: o.time
    })
  }
}

export default notification
