// FILE: src/renderer/src/store/notifications.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-NOTIFICATION-SYSTEM state core — the live notification stack
//            (max 3 rendered cards + overflow counter) and the session
//            history log behind the palette command.
//   SCOPE: NOTIFY normalization (legacy `type` mapped to `severity`),
//          dedupKey collapsing with a visible counter, per-entry auto-dismiss
//          timers with hover pause/resume, sticky errors, FIFO history capped
//          at 50, DISMISS / DISMISS_TOP / CLEAR. No DOM, no rendering.
//   DEPENDS: pinia, util (getUniqueId).
//   LINKS: .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-2/R-5/R-6;
//          services/notification (compatibility facade over NOTIFY);
//          components/notificationStack + notificationCard (rendering);
//          components/notificationsHistory (history surface);
//          components/updateNotice (injects its sticky info card).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   useNotificationsStore - pinia store: stack, history, liveStack, overflowCount, NOTIFY, PAUSE, RESUME, DISMISS, DISMISS_TOP, CLEAR.
//   normalizeSeverity - legacy type mapping: primary and unknown values resolve to info.
//   SEVERITY_DEFAULTS_MS - auto-dismiss defaults per severity (error: none, sticky).
//   HISTORY_CAP - history FIFO cap (50 entries).
//   STACK_VISIBLE - how many live cards render (3).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-002: initial
//   store — replaces the DOM-building legacy service state (noticeCache +
//   rePositionNotices math) with reactive stack + history; errors are sticky
//   by default; dedupKey repeats bump one card's counter while history keeps
//   every occurrence; timers pause on hover.
// END_CHANGE_SUMMARY

import { defineStore } from 'pinia'
import { getUniqueId } from '../util'

// Corner C-6: legacy callers pass `type` (primary|error|warning|info);
// the new axis is severity (info|success|warning|error). Unknown or missing
// values fall back to info and never throw.
export const normalizeSeverity = (value) => {
  if (value === 'success' || value === 'warning' || value === 'error') return value
  return 'info'
}

// Corner C-2: errors are sticky (no timer); the others auto-dismiss.
// 0 (the legacy "disable auto-close" value) keeps a card alive too.
export const SEVERITY_DEFAULTS_MS = {
  info: 8000,
  success: 5000,
  warning: 10000,
  error: 0
}

export const HISTORY_CAP = 50
export const STACK_VISIBLE = 3

// START_BLOCK_NOTIFY_TIMER
// One auto-dismiss deadline per entry. PAUSE stores the remaining ms and
// clears the timeout; RESUME restarts it. Sticky entries (deadline 0) never
// arm a timer. Timers live outside the reactive entry so pinia state stays
// plain data.
const timers = new Map() // id -> { timeout, remaining, deadline }

const clearTimer = (id) => {
  const t = timers.get(id)
  if (t) {
    clearTimeout(t.timeout)
    timers.delete(id)
  }
}
// END_BLOCK_NOTIFY_TIMER

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    // Live cards, oldest first. Only the newest STACK_VISIBLE render.
    stack: [],
    // Newest-first projection is a getter; the array itself is append-order.
    history: []
  }),

  getters: {
    liveStack(state) {
      return state.stack.slice(-STACK_VISIBLE)
    },
    overflowCount(state) {
      return Math.max(0, state.stack.length - STACK_VISIBLE)
    }
  },

  actions: {
    // START_BLOCK_NOTIFY_DEDUP
    // A repeat under a live card's dedupKey bumps that card's counter
    // (corner C-5: ten notifies, one card, x10) and still appends one
    // history entry per occurrence.
    NOTIFY(raw = {}) {
      const severity = normalizeSeverity(raw.severity || raw.type)
      const sticky = raw.sticky === true || severity === 'error' || raw.time === 0

      if (raw.dedupKey) {
        const existing = this.stack.find((e) => e.dedupKey === raw.dedupKey)
        if (existing) {
          existing.count += 1
          this.APPEND_HISTORY(existing, raw)
          return existing.id
        }
      }

      const id = getUniqueId()
      const entry = {
        id,
        severity,
        source: raw.source || 'system',
        title: raw.title || '',
        message: raw.message || '',
        // actions: [{ kind: 'copy'|'retry'|'open'|'reveal', payload } |
        //          { label, handler, style: 'primary'|'normal'|'quiet' }]
        actions: Array.isArray(raw.actions) ? raw.actions.filter(Boolean) : [],
        dedupKey: raw.dedupKey || null,
        // Optional owner hook (e.g. updateNotice): stack dismissal routes
        // through it instead of a plain DISMISS so visibility owners stay
        // the single source of truth.
        onDismiss: typeof raw.onDismiss === 'function' ? raw.onDismiss : null,
        sticky,
        time: sticky ? 0 : (typeof raw.time === 'number' && raw.time > 0 ? raw.time : SEVERITY_DEFAULTS_MS[severity]),
        count: 1,
        paused: false
      }
      this.stack.push(entry)
      this.APPEND_HISTORY(entry, raw)
      if (!entry.sticky) this.ARM_TIMER(entry)
      return id
    },
    // END_BLOCK_NOTIFY_DEDUP

    // START_BLOCK_NOTIFY_HISTORY_APPEND
    // Session-only, FIFO, capped at HISTORY_CAP. fullText is the complete
    // message — cards may clamp long text, history never does.
    APPEND_HISTORY(entry, raw = {}) {
      this.history.push({
        time: Date.now(),
        severity: entry.severity,
        source: entry.source,
        title: entry.title,
        fullText: raw.message ?? entry.message
      })
      if (this.history.length > HISTORY_CAP) {
        this.history.splice(0, this.history.length - HISTORY_CAP)
      }
    },
    // END_BLOCK_NOTIFY_HISTORY_APPEND

    ARM_TIMER(entry) {
      clearTimer(entry.id)
      const deadline = Date.now() + entry.time
      const timeout = setTimeout(() => {
        this.DISMISS(entry.id)
      }, entry.time)
      timers.set(entry.id, { timeout, remaining: entry.time, deadline })
    },

    // Corner C-2: hover pauses the countdown; leaving resumes the remainder.
    PAUSE(id) {
      const t = timers.get(id)
      const entry = this.stack.find((e) => e.id === id)
      if (!t || !entry || entry.paused) return
      clearTimeout(t.timeout)
      const remaining = Math.max(0, t.deadline - Date.now())
      timers.set(id, { timeout: null, remaining, deadline: t.deadline })
      entry.paused = true
    },

    RESUME(id) {
      const t = timers.get(id)
      const entry = this.stack.find((e) => e.id === id)
      if (!t || !entry || !entry.paused) return
      entry.paused = false
      if (t.remaining <= 0) {
        this.DISMISS(id)
        return
      }
      const deadline = Date.now() + t.remaining
      const timeout = setTimeout(() => {
        this.DISMISS(id)
      }, t.remaining)
      timers.set(id, { timeout, remaining: t.remaining, deadline })
    },

    DISMISS(id) {
      clearTimer(id)
      const i = this.stack.findIndex((e) => e.id === id)
      if (i !== -1) this.stack.splice(i, 1)
    },

    // Corner C-2: Esc closes the newest card only.
    DISMISS_TOP() {
      if (this.stack.length === 0) return null
      const top = this.stack[this.stack.length - 1]
      this.DISMISS(top.id)
      return top.id
    },

    CLEAR() {
      this.stack.forEach((e) => clearTimer(e.id))
      this.stack = []
    }
  }
})
