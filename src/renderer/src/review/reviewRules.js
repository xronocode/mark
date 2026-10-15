// FILE: src/renderer/src/review/reviewRules.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-48 App Store review-request rules — pure, fake-clock
//            friendly decisions over a persisted counter state and the
//            current session's facts (never cases, thresholds, 120-day
//            / next-major-minor re-ask gate).
//   SCOPE: sanitize, register, decide. No I/O, no listeners, no clock.
//   DEPENDS: util/version.js (toIsoDay, daysBetweenIso, majorMinor,
//            compareVersions).
//   LINKS: .grace/changes/active/C-48/spec.xml R-2 (board 5 rules card);
//          review/reviewRequest.js wires these rules to bus events.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MIN_SUCCESSFUL_SESSIONS - 5 — sessions threshold before asking.
//   MIN_DISTINCT_DAYS - 3 — distinct use days threshold before asking.
//   REASK_AFTER_DAYS - 120 — cooldown before asking again (Apple also caps).
//   MAX_TRACKED_DAYS - cap on the persisted distinct-days list.
//   emptyReviewState - canonical zero state.
//   sanitizeReviewState - validate/repair a persisted state object.
//   isSessionSuccessful - open+saved, or a live reload applied.
//   registerSuccessfulSession - fold one successful session into the state.
//   reviewReaskAllowed - 120-day or next major/minor gate.
//   evaluateReviewAsk - full decision incl. every "never" rule.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-48 T-001: initial module.
// END_CHANGE_SUMMARY

import { toIsoDay, daysBetweenIso, majorMinor, compareVersions } from '../util/version'

export const MIN_SUCCESSFUL_SESSIONS = 5
export const MIN_DISTINCT_DAYS = 3
export const REASK_AFTER_DAYS = 120
// The list only ever backs the ≥3-distinct-days check; a rolling window
// keeps the persisted pref small for very long-lived profiles.
export const MAX_TRACKED_DAYS = 30

// START_BLOCK_EMPTY_REVIEW_STATE
export const emptyReviewState = () => ({
  successfulSessions: 0,
  activeDays: [],
  lastAskedAt: null,
  lastAskedVersion: ''
})
// END_BLOCK_EMPTY_REVIEW_STATE

// START_BLOCK_SANITIZE_REVIEW_STATE
// The state lives in prefs.json, which the user (or a downgrade) can
// hand-edit: coerce every field, drop malformed days, keep the newest
// MAX_TRACKED_DAYS days, and never let NaN or negatives through.
export const sanitizeReviewState = (raw) => {
  const base = emptyReviewState()
  if (!raw || typeof raw !== 'object') return base
  const sessions = Number(raw.successfulSessions)
  base.successfulSessions = Number.isFinite(sessions) && sessions > 0 ? Math.floor(sessions) : 0
  if (Array.isArray(raw.activeDays)) {
    base.activeDays = [...new Set(raw.activeDays.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))]
      .sort()
      .slice(-MAX_TRACKED_DAYS)
  }
  if (typeof raw.lastAskedAt === 'string' && !Number.isNaN(Date.parse(raw.lastAskedAt))) {
    base.lastAskedAt = raw.lastAskedAt
  }
  if (typeof raw.lastAskedVersion === 'string') {
    base.lastAskedVersion = raw.lastAskedVersion
  }
  return base
}
// END_BLOCK_SANITIZE_REVIEW_STATE

// START_BLOCK_SESSION_SUCCESSFUL
// A "successful session" per the rules card: a document was opened AND
// saved, or a live reload was applied — each at most once per session.
export const isSessionSuccessful = (session) =>
  !!(session && ((session.documentOpened && session.documentSaved) || session.liveReloadApplied))
// END_BLOCK_SESSION_SUCCESSFUL

// START_BLOCK_REGISTER_SESSION
// Fold the first success of a session into the persisted state: +1
// session, today joins the distinct-days list. Idempotence is the
// caller's job (reviewRequest marks the session counted once).
export const registerSuccessfulSession = (state, now) => {
  const day = toIsoDay(now)
  if (!day) return { state: sanitizeReviewState(state), changed: false }
  const days = state.activeDays.includes(day)
    ? [...state.activeDays]
    : [...state.activeDays, day].sort().slice(-MAX_TRACKED_DAYS)
  return {
    state: {
      ...state,
      successfulSessions: state.successfulSessions + 1,
      activeDays: days
    },
    changed: true
  }
}
// END_BLOCK_REGISTER_SESSION

// START_BLOCK_REASK_GATE
// After an ask, wait ≥ REASK_AFTER_DAYS (120) or until a NEW major.minor
// ships. A patch bump ("2.3.1" → "2.3.2") deliberately does not re-open
// the gate; "2.3.1" → "2.4.0" does.
export const reviewReaskAllowed = ({ lastAskedAt, lastAskedVersion, runningVersion, now }) => {
  if (!lastAskedAt) return true
  const askedDay = toIsoDay(new Date(lastAskedAt))
  const today = toIsoDay(now)
  const elapsed = daysBetweenIso(askedDay, today)
  if (Number.isFinite(elapsed) && elapsed >= REASK_AFTER_DAYS) return true
  if (lastAskedVersion && compareVersions(majorMinor(runningVersion), majorMinor(lastAskedVersion)) > 0) {
    return true
  }
  return false
}
// END_BLOCK_REASK_GATE

// START_BLOCK_EVALUATE_REVIEW_ASK
// Full decision. `session` carries the current session's facts:
//   { documentOpened, documentSaved, liveReloadApplied, errorLogged,
//     versionChanged, firstLaunch } — plus `modalOpen` for right-now
//   blocking surfaces (What's New sheet, fullscreen block viewer).
// Order matters only for test clarity; every rule is a hard "never":
//   never on first launch, never in a session whose version changed,
//   never after an uncaught error in the session, never while a modal
//   is open, never below 5 sessions across 3 distinct days, never again
//   inside the 120-day / same-major.minor window.
// Returns { ask, state } — state already carries the ask's bookkeeping
// (lastAskedAt/lastAskedVersion) when ask is true.
export const evaluateReviewAsk = ({ state, session, runningVersion, now, modalOpen = false }) => {
  const clean = sanitizeReviewState(state)
  const facts = session || {}
  let ask = true
  let reason = ''

  if (facts.firstLaunch) {
    ask = false
    reason = 'firstLaunch'
  } else if (facts.versionChanged) {
    ask = false
    reason = 'versionChanged'
  } else if (facts.errorLogged) {
    ask = false
    reason = 'errorLogged'
  } else if (modalOpen) {
    ask = false
    reason = 'modalOpen'
  } else if (clean.successfulSessions < MIN_SUCCESSFUL_SESSIONS) {
    ask = false
    reason = 'sessions'
  } else if (new Set(clean.activeDays).size < MIN_DISTINCT_DAYS) {
    ask = false
    reason = 'days'
  } else if (
    !reviewReaskAllowed({
      lastAskedAt: clean.lastAskedAt,
      lastAskedVersion: clean.lastAskedVersion,
      runningVersion,
      now
    })
  ) {
    ask = false
    reason = 'cooldown'
  }

  if (!ask) return { ask: false, reason, state: clean }

  return {
    ask: true,
    reason: 'eligible',
    state: {
      ...clean,
      lastAskedAt: now instanceof Date ? now.toISOString() : String(now),
      lastAskedVersion: runningVersion
    }
  }
}
// END_BLOCK_EVALUATE_REVIEW_ASK
